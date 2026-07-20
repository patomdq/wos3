import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getOrgAccessToken } from '@/lib/gcalToken'
import { gcalCreateEvent, gcalListEvents, gcalDeleteEvent } from '@/lib/googleCalendar'
import { calcEscenarios, calcCostoTotal, calcGastosFijos } from '@/lib/formulas'
import { buscarComparables } from '@/lib/search-comparables'

export const maxDuration = 60

const BOT_TOKEN = process.env.WALLEST_BOT_TOKEN
const TG_API = () => `https://api.telegram.org/bot${BOT_TOKEN}`

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Telegram helpers ────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string) {
  try {
    await fetch(`${TG_API()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch (e) {
    console.error('sendMessage error:', e)
  }
}

// Notificar a todos los gestores activos excepto el que ejecutó la acción
async function notifyGestores(mensaje: string, exceptChatId?: number) {
  const { data: gestores } = await supabase
    .from('wos_telegram_users')
    .select('chat_id')
    .in('rol', ['gestor', 'admin'])
    .eq('activo', true)

  if (!gestores) return
  for (const g of gestores) {
    if (g.chat_id !== exceptChatId) {
      await sendMessage(g.chat_id, mensaje)
    }
  }
}

// ─── User management ──────────────────────────────────────────────────────────

interface WosUser {
  chat_id: number
  nombre: string
  rol: 'gestor' | 'inversor' | 'admin'
}

async function getOrCreateUser(
  chatId: number,
  firstName: string,
  lastName?: string,
  username?: string
): Promise<WosUser | null> {
  const { data } = await supabase
    .from('wos_telegram_users')
    .select('chat_id, nombre, rol')
    .eq('chat_id', chatId)
    .eq('activo', true)
    .single()

  if (data) return data as WosUser
  return null
}

async function registerUser(
  chatId: number,
  firstName: string,
  lastName?: string,
  username?: string
): Promise<void> {
  const nombre = [firstName, lastName].filter(Boolean).join(' ')
  await supabase.from('wos_telegram_users').upsert({
    chat_id: chatId,
    nombre,
    username: username || null,
    rol: 'gestor',
    activo: true,
  }, { onConflict: 'chat_id' })
}

// ─── Conversation history ─────────────────────────────────────────────────────

async function getHistory(chatId: number): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase
    .from('wos_telegram_history')
    .select('role, content')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data || data.length === 0) return []
  return (data.reverse() as { role: 'user' | 'assistant'; content: string }[]).map(r => ({
    role: r.role,
    content: r.content,
  }))
}

async function saveHistory(chatId: number, role: 'user' | 'assistant', content: string) {
  await supabase.from('wos_telegram_history').insert({ chat_id: chatId, role, content })
  // Limpiar mensajes viejos (mantener últimos 40)
  const { data: old } = await supabase
    .from('wos_telegram_history')
    .select('id')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
  if (old && old.length > 40) {
    const toDelete = old.slice(0, old.length - 40).map(r => r.id)
    await supabase.from('wos_telegram_history').delete().in('id', toDelete)
  }
}

// ─── Context loader ───────────────────────────────────────────────────────────

async function loadContext(): Promise<string> {
  const today = new Date().toISOString().split('T')[0]

  const [proyectosRes, movimientosRes] = await Promise.all([
    supabase
      .from('proyectos')
      .select('id, nombre, estado, precio_compra, precio_venta_real, precio_venta_realista, valor_total_operacion, superficie, habitaciones, ciudad, porcentaje_hasu')
      .not('estado', 'in', '("vendido","patrimonial")')
      .order('created_at', { ascending: false }),
    supabase
      .from('movimientos')
      .select('id, concepto, monto, tipo, fecha, categoria, proyecto_id')
      .order('fecha', { ascending: false })
      .limit(50),
  ])

  const proyectos = proyectosRes.data || []
  const movimientos = movimientosRes.data || []

  const proyectosText = proyectos.map(p => {
    const movs = movimientos.filter(m => m.proyecto_id === p.id)
    const gastos = movs.filter(m => m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto), 0)
    return `ID: ${p.id} | ${p.nombre} | Estado: ${p.estado} | Ciudad: ${p.ciudad || '-'} | Compra: ${p.precio_compra || '-'}€ | Venta real: ${p.precio_venta_real || '-'}€ | Gastos acumulados: ${gastos}€`
  }).join('\n')

  return `Hoy: ${today}

PROYECTOS ACTIVOS:
${proyectosText || 'Sin proyectos'}

ÚLTIMOS MOVIMIENTOS:
${movimientos.slice(0, 10).map(m => `[${m.fecha}] ${m.tipo} ${Math.abs(m.monto)}€ — ${m.concepto} (proyecto_id: ${m.proyecto_id})`).join('\n') || 'Sin movimientos'}
`
}

// ─── Tools definition ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'insert_bitacora',
    description: 'Agrega una entrada a la bitácora de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        contenido: { type: 'string', description: 'Texto de la entrada' },
        titulo: { type: 'string', description: 'Título breve (opcional)' },
        tipo: { type: 'string', enum: ['nota', 'hito', 'alerta', 'bot'], description: 'Tipo. Default: nota' },
        autor: { type: 'string', description: 'Autor. Default: el nombre del usuario de Telegram' },
      },
      required: ['proyecto_id', 'contenido'],
    },
  },
  {
    name: 'update_partida_reforma',
    description: 'Edita o marca como finalizada una partida de reforma de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la partida. Si no lo tenés, busca por nombre.' },
        busqueda: { type: 'string', description: 'Nombre parcial de la partida si no tenés el ID. Ej: "pintura", "electricidad"' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto (para la búsqueda)' },
        estado: { type: 'string', enum: ['pendiente', 'en_curso', 'ok', 'retrasada'], description: 'Nuevo estado' },
        ejecutado: { type: 'number', description: 'Coste ejecutado en euros' },
        fecha_fin_real: { type: 'string', description: 'Fecha fin real YYYY-MM-DD' },
        notas: { type: 'string', description: 'Notas adicionales' },
      },
      required: [],
    },
  },
  {
    name: 'insert_partida_reforma',
    description: 'Agrega una partida de reforma a un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre de la partida' },
        categoria: { type: 'string', description: 'Categoría: obra, materiales, mobiliario, electro, decoracion, otros' },
        presupuesto: { type: 'number', description: 'Presupuesto en euros' },
        ejecutado: { type: 'number', description: 'Ejecutado en euros (puede ser 0)' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        notas: { type: 'string', description: 'Notas adicionales' },
        fecha_inicio: { type: 'string', description: 'Fecha de inicio YYYY-MM-DD' },
        fecha_fin_estimada: { type: 'string', description: 'Fecha fin estimada YYYY-MM-DD (opcional)' },
      },
      required: ['nombre', 'proyecto_id'],
    },
  },
  {
    name: 'insert_movimiento',
    description: 'Registra un gasto o ingreso en un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        concepto: { type: 'string' },
        monto: { type: 'number', description: 'Monto en euros. Negativo para gastos, positivo para ingresos.' },
        tipo: { type: 'string', enum: ['Gasto', 'Ingreso'] },
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        categoria: { type: 'string', description: 'materiales, mano de obra, transporte, honorarios, otros' },
        proyecto_id: { type: 'string' },
        proveedor: { type: 'string', description: 'Nombre del proveedor si aplica' },
      },
      required: ['concepto', 'monto', 'tipo', 'fecha'],
    },
  },
  {
    name: 'update_proyecto',
    description: 'Actualiza el estado u otros datos de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del proyecto' },
        estado: {
          type: 'string',
          enum: ['captado', 'analisis', 'ofertado', 'comprado', 'reforma', 'venta', 'reservado', 'con_oferta', 'en_arras', 'vendido'],
        },
        precio_venta_real: { type: 'number', description: 'Precio de venta real (cuando se vende)' },
        notas: { type: 'string' },
        fecha_salida_estimada: { type: 'string', description: 'Fecha estimada de venta YYYY-MM-DD' },
      },
      required: ['id'],
    },
  },
  {
    name: 'listar_partidas',
    description: 'Lista las partidas de reforma de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
      },
      required: ['proyecto_id'],
    },
  },
  {
    name: 'listar_movimientos',
    description: 'Lista los movimientos (gastos/ingresos) de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
      },
      required: ['proyecto_id'],
    },
  },
  {
    name: 'agendar_evento',
    description: 'Crea un evento en Google Calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        hora_inicio: { type: 'string', description: 'HH:MM' },
        hora_fin: { type: 'string', description: 'HH:MM' },
        todo_el_dia: { type: 'boolean' },
        descripcion: { type: 'string' },
        invitados: { type: 'array', items: { type: 'string' } },
      },
      required: ['titulo', 'fecha'],
    },
  },
  {
    name: 'listar_eventos',
    description: 'Lista eventos de Google Calendar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha_desde: { type: 'string', description: 'YYYY-MM-DD' },
        fecha_hasta: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['fecha_desde'],
    },
  },
  {
    name: 'insert_mercado',
    description: 'Agrega un inmueble al módulo Mercado de WOS3 para seguimiento. Usalo cuando el usuario pegue una URL, describa un piso, o pida guardar/agregar un inmueble.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string', description: 'Título o nombre corto del inmueble' },
        direccion: { type: 'string' },
        ciudad: { type: 'string' },
        precio: { type: 'number', description: 'Precio pedido en euros' },
        habitaciones: { type: 'number' },
        superficie: { type: 'number', description: 'Superficie en m²' },
        url: { type: 'string', description: 'URL del anuncio' },
        notas: { type: 'string' },
      },
      required: ['direccion', 'precio'],
    },
  },
  {
    name: 'analizar_inversion',
    description: 'Analiza si una operación inmobiliaria es viable, calcula ROI y precio máximo de compra. Si el usuario menciona que el comprador va a alquilar (ej: "lo alquila en 450"), extrae alquiler_mensual_min/max. Si menciona hipoteca o entrada, extrae porcentaje_entrada (default 30).',
    input_schema: {
      type: 'object' as const,
      properties: {
        zona: { type: 'string' },
        superficie: { type: 'number' },
        habitaciones: { type: 'number' },
        precio_ofertado: { type: 'number' },
        coste_reforma: { type: 'number' },
        precio_venta_orientativo: { type: 'number' },
        alquiler_mensual_min: { type: 'number', description: 'Alquiler mensual mínimo estimado por el comprador (€/mes)' },
        alquiler_mensual_max: { type: 'number', description: 'Alquiler mensual máximo estimado. Si el usuario da un solo valor, igualar a min.' },
        porcentaje_entrada: { type: 'number', description: 'Porcentaje de entrada del comprador si compra con hipoteca. Ej: 30 significa 30% entrada + 70% hipoteca. Default: 30.' },
        tipo_interes_hipoteca: { type: 'number', description: 'Tipo de interés anual hipoteca en %. Default: 3.5' },
        plazo_hipoteca_anos: { type: 'number', description: 'Plazo hipoteca en años. Default: 20' },
      },
      required: ['zona', 'superficie', 'precio_ofertado', 'coste_reforma'],
    },
  },
]

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  user: WosUser,
  notifyAfter: { message: string } | null = null
): Promise<string> {
  try {
    switch (toolName) {

      case 'insert_bitacora': {
        const { error } = await supabase.from('bitacora').insert({
          proyecto_id: toolInput.proyecto_id,
          contenido: toolInput.contenido,
          titulo: toolInput.titulo || null,
          tipo: toolInput.tipo || 'nota',
          autor: toolInput.autor || user.nombre,
          fecha: new Date().toISOString(),
        })
        if (error) return `Error al guardar en bitácora: ${error.message}`

        // Notificar a otros gestores
        const { data: proy } = await supabase.from('proyectos').select('nombre').eq('id', toolInput.proyecto_id).single()
        const proyNombre = proy?.nombre || 'proyecto'
        await notifyGestores(
          `📝 <b>${user.nombre}</b> anotó en bitácora de <b>${proyNombre}</b>:\n\n${toolInput.contenido}`,
          user.chat_id
        )
        return `✅ Anotado en bitácora de "${proyNombre}"`
      }

      case 'update_partida_reforma': {
        let id = toolInput.id as string | undefined

        // Si no hay ID, buscar por nombre
        if (!id && toolInput.busqueda) {
          const q = supabase
            .from('partidas_reforma')
            .select('id, nombre')
            .ilike('nombre', `%${toolInput.busqueda}%`)
          if (toolInput.proyecto_id) q.eq('proyecto_id', toolInput.proyecto_id)
          const { data } = await q.limit(1).single()
          if (!data) return `❌ No encontré partida con "${toolInput.busqueda}"`
          id = data.id
        }

        if (!id) return '❌ Necesito el ID o nombre de la partida'

        const updates: Record<string, unknown> = {}
        if (toolInput.estado) updates.estado = toolInput.estado
        if (toolInput.ejecutado != null) updates.ejecutado = toolInput.ejecutado
        if (toolInput.fecha_fin_real) updates.fecha_fin_real = toolInput.fecha_fin_real
        if (toolInput.notas) updates.notas = toolInput.notas

        const { data: updated, error } = await supabase
          .from('partidas_reforma')
          .update(updates)
          .eq('id', id)
          .select('nombre, proyecto_id')
          .single()

        if (error) return `Error al actualizar partida: ${error.message}`

        // Notificar si se marcó como finalizada
        if (toolInput.estado === 'ok') {
          const { data: proy } = await supabase.from('proyectos').select('nombre').eq('id', updated?.proyecto_id).single()
          const proyNombre = proy?.nombre || 'proyecto'
          await notifyGestores(
            `✅ <b>${user.nombre}</b> finalizó la partida <b>${updated?.nombre}</b> en <b>${proyNombre}</b>`,
            user.chat_id
          )
        }

        return `✅ Partida "${updated?.nombre}" actualizada — estado: ${toolInput.estado || 'sin cambio'}`
      }

      case 'insert_partida_reforma': {
        const { data, error } = await supabase.from('partidas_reforma').insert({
          nombre: toolInput.nombre,
          categoria: toolInput.categoria || 'otros',
          presupuesto: toolInput.presupuesto || 0,
          ejecutado: toolInput.ejecutado || 0,
          proyecto_id: toolInput.proyecto_id,
          notas: toolInput.notas || null,
          fecha_inicio: toolInput.fecha_inicio || null,
          fecha_fin_estimada: toolInput.fecha_fin_estimada || null,
          estado: 'pendiente',
        }).select('id').single()

        if (error) return `Error al crear partida: ${error.message}`

        const { data: proy } = await supabase.from('proyectos').select('nombre').eq('id', toolInput.proyecto_id).single()
        await notifyGestores(
          `🏗️ <b>${user.nombre}</b> agregó partida <b>${toolInput.nombre}</b> a <b>${proy?.nombre || 'proyecto'}</b>`,
          user.chat_id
        )
        return `✅ Partida "${toolInput.nombre}" creada (ID: ${data?.id})`
      }

      case 'insert_movimiento': {
        const monto = typeof toolInput.monto === 'number'
          ? (toolInput.tipo === 'Gasto' ? -Math.abs(toolInput.monto) : Math.abs(toolInput.monto))
          : toolInput.monto as number

        const { error } = await supabase.from('movimientos').insert({
          concepto: toolInput.concepto,
          monto,
          tipo: toolInput.tipo,
          fecha: toolInput.fecha,
          categoria: toolInput.categoria || 'otros',
          proyecto_id: toolInput.proyecto_id || null,
          proveedor: toolInput.proveedor || null,
        })
        if (error) return `Error al registrar movimiento: ${error.message}`

        const { data: proy } = toolInput.proyecto_id
          ? await supabase.from('proyectos').select('nombre').eq('id', toolInput.proyecto_id).single()
          : { data: null }

        await notifyGestores(
          `💸 <b>${user.nombre}</b> registró ${toolInput.tipo === 'Gasto' ? 'gasto' : 'ingreso'} <b>${Math.abs(toolInput.monto as number)}€</b> — ${toolInput.concepto}${proy ? ` en ${proy.nombre}` : ''}`,
          user.chat_id
        )
        return `✅ ${toolInput.tipo} de ${Math.abs(toolInput.monto as number)}€ registrado: ${toolInput.concepto}`
      }

      case 'update_proyecto': {
        const updates: Record<string, unknown> = {}
        if (toolInput.estado) updates.estado = toolInput.estado
        if (toolInput.precio_venta_real) updates.precio_venta_real = toolInput.precio_venta_real
        if (toolInput.notas) updates.notas = toolInput.notas
        if (toolInput.fecha_salida_estimada) updates.fecha_salida_estimada = toolInput.fecha_salida_estimada

        const { data, error } = await supabase
          .from('proyectos')
          .update(updates)
          .eq('id', toolInput.id)
          .select('nombre')
          .single()

        if (error) return `Error al actualizar proyecto: ${error.message}`

        await notifyGestores(
          `📦 <b>${user.nombre}</b> actualizó <b>${data?.nombre}</b>${toolInput.estado ? ` → estado: <b>${toolInput.estado}</b>` : ''}`,
          user.chat_id
        )
        return `✅ Proyecto "${data?.nombre}" actualizado`
      }

      case 'listar_partidas': {
        const { data } = await supabase
          .from('partidas_reforma')
          .select('nombre, estado, presupuesto, ejecutado, fecha_inicio, fecha_fin_estimada')
          .eq('proyecto_id', toolInput.proyecto_id)
          .order('fecha_inicio', { ascending: true })

        if (!data || data.length === 0) return 'No hay partidas en este proyecto.'

        const estadoIcon: Record<string, string> = { pendiente: '○', en_curso: '◑', ok: '✓', retrasada: '⚠️' }
        return data.map(p =>
          `${estadoIcon[p.estado] || '○'} ${p.nombre} — ${p.presupuesto || 0}€ presup. / ${p.ejecutado || 0}€ ejec.${p.fecha_fin_estimada ? ` | fin est: ${p.fecha_fin_estimada}` : ''}`
        ).join('\n')
      }

      case 'listar_movimientos': {
        const { data } = await supabase
          .from('movimientos')
          .select('concepto, monto, tipo, fecha, categoria')
          .eq('proyecto_id', toolInput.proyecto_id)
          .order('fecha', { ascending: false })
          .limit(20)

        if (!data || data.length === 0) return 'No hay movimientos en este proyecto.'

        const total = data.reduce((s, m) => s + m.monto, 0)
        const lines = data.map(m => `[${m.fecha}] ${m.tipo === 'Gasto' ? '▼' : '▲'} ${Math.abs(m.monto)}€ — ${m.concepto}`)
        lines.push(`\nTotal neto: ${total}€`)
        return lines.join('\n')
      }

      case 'agendar_evento': {
        const accessToken = await getOrgAccessToken()
        if (!accessToken) return '❌ Google Calendar no conectado.'

        const horaInicio = (toolInput.hora_inicio as string) || '10:00'
        const [h, m] = horaInicio.split(':').map(Number)
        const horaFin = (toolInput.hora_fin as string) || `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`

        const INVITADOS_MAP: Record<string, string> = {
          'silvia': 'silviainformes@gmail.com',
          'jl': 'joseluisxp123@gmail.com',
          'josé luis': 'joseluisxp123@gmail.com',
        }

        const invitados = ((toolInput.invitados as string[]) || []).map(inv => {
          const key = inv.toLowerCase()
          return INVITADOS_MAP[key] || inv
        }).filter(e => e.includes('@'))

        const event = await gcalCreateEvent(accessToken, {
          title: toolInput.titulo as string,
          description: (toolInput.descripcion as string) || '',
          startDateTime: toolInput.todo_el_dia ? toolInput.fecha as string : `${toolInput.fecha}T${horaInicio}:00`,
          endDateTime: toolInput.todo_el_dia ? toolInput.fecha as string : `${toolInput.fecha}T${horaFin}:00`,
          allDay: (toolInput.todo_el_dia as boolean) ?? false,
          attendees: invitados,
        })

        if (!event) return '❌ Error al crear el evento.'

        await notifyGestores(
          `📅 <b>${user.nombre}</b> agendó: <b>${toolInput.titulo}</b> el ${toolInput.fecha}${!toolInput.todo_el_dia ? ` a las ${horaInicio}` : ''}`,
          user.chat_id
        )
        return `✅ Evento creado: "${toolInput.titulo}" el ${toolInput.fecha}${!toolInput.todo_el_dia ? ` a las ${horaInicio}` : ''}`
      }

      case 'listar_eventos': {
        const accessToken = await getOrgAccessToken()
        if (!accessToken) return '❌ Google Calendar no conectado.'

        const tMin = new Date((toolInput.fecha_desde as string) + 'T00:00:00').toISOString()
        const fechaHasta = (toolInput.fecha_hasta as string) || toolInput.fecha_desde as string
        const tMax = new Date(fechaHasta + 'T23:59:59').toISOString()

        const events = await gcalListEvents(accessToken, tMin, tMax)
        if (events.length === 0) return `Sin eventos del ${toolInput.fecha_desde} al ${fechaHasta}.`

        return events.slice(0, 15).map(e => {
          const time = e.start.dateTime
            ? new Date(e.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
            : 'Todo el día'
          return `📍 ${time} — ${e.summary || 'Sin título'}`
        }).join('\n')
      }

      case 'insert_mercado': {
        const { data, error } = await supabase.from('inmuebles').insert({
          titulo: toolInput.titulo || toolInput.direccion,
          direccion: toolInput.direccion,
          ciudad: toolInput.ciudad || null,
          precio: toolInput.precio,
          habitaciones: toolInput.habitaciones || null,
          superficie: toolInput.superficie || null,
          url: toolInput.url || null,
          notas: toolInput.notas || null,
          fuente: 'WallestBot',
          estado: 'activo',
        }).select('id').single()

        if (error) return `Error al agregar a Mercado: ${error.message}`
        return `✅ Inmueble "${toolInput.titulo || toolInput.direccion}" agregado a Mercado (ID: ${data?.id})`
      }

      case 'analizar_inversion': {
        let ventaOrientativa = toolInput.precio_venta_orientativo as number | undefined

        if (!ventaOrientativa && toolInput.zona && toolInput.superficie) {
          try {
            const comp = await buscarComparables(
              toolInput.zona as string,
              toolInput.superficie as number,
              toolInput.habitaciones as number | undefined
            )
            if (comp.precioSugerido) ventaOrientativa = comp.precioSugerido
          } catch {}
        }

        if (!ventaOrientativa) {
          return '⚠️ No pude estimar precio de venta automáticamente. Indícalo manualmente para el análisis completo.'
        }

        const compra = toolInput.precio_ofertado as number
        const reforma = toolInput.coste_reforma as number
        const gastos = calcGastosFijos(compra)
        const costoTotal = calcCostoTotal(compra, reforma)
        const escenarios = calcEscenarios(ventaOrientativa, compra, reforma)

        const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`
        const fmtDec = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`

        const lines = [
          `📍 ${toolInput.zona} | ${toolInput.superficie}m²`,
          `💰 Precio pedido: ${fmt(compra)}€`,
          `🔨 Reforma: ${fmt(reforma)}€`,
          `📊 Gastos fijos: ${fmt(gastos)}€`,
          `💼 Coste total: ${fmt(costoTotal)}€`,
          ``,
          `📈 Precio venta estimado: ${fmt(ventaOrientativa)}€`,
          ``,
          `ESCENARIOS ROI:`,
          `🔴 Conservador (30%): máx compra ${fmt(escenarios.conservador.precioMaxCompra)}€`,
          `🟡 Realista (50%): máx compra ${fmt(escenarios.realista.precioMaxCompra)}€`,
          `🟢 Optimista (70%): máx compra ${fmt(escenarios.optimista.precioMaxCompra)}€`,
          ``,
          compra <= escenarios.conservador.precioMaxCompra
            ? '✅ ENTRA en criterios Wallest (ROI ≥ 30%)'
            : '❌ NO entra en criterios Wallest (ROI < 30%)',
        ]

        // ── Sección rentabilidad del comprador (yield) ──
        const alqMin = toolInput.alquiler_mensual_min as number | undefined
        const alqMax = toolInput.alquiler_mensual_max as number | undefined

        if (alqMin) {
          const alqMaxVal = alqMax || alqMin
          const precioVenta = ventaOrientativa

          // Yield bruto
          const yieldMin = (alqMin * 12 / precioVenta) * 100
          const yieldMax = (alqMaxVal * 12 / precioVenta) * 100
          const alqLabel = alqMin === alqMaxVal ? `${alqMin}€/mes` : `${alqMin}-${alqMaxVal}€/mes`
          const yieldLabel = alqMin === alqMaxVal
            ? `${yieldMin.toFixed(1)}%`
            : `${yieldMin.toFixed(1)}% - ${yieldMax.toFixed(1)}%`

          lines.push(``, `─────────────────────`)
          lines.push(`🏠 RENTABILIDAD COMPRADOR`)
          lines.push(`Alquiler: ${alqLabel}`)
          lines.push(`Yield bruto: ${yieldLabel}`)
          lines.push(`Ingreso anual: ${fmtDec(alqMin * 12)}€ - ${fmtDec(alqMaxVal * 12)}€`)

          // Escenario con hipoteca
          const pctEntrada = (toolInput.porcentaje_entrada as number | undefined) ?? 30
          const tasaAnual = (toolInput.tipo_interes_hipoteca as number | undefined) ?? 3.5
          const plazoAnos = (toolInput.plazo_hipoteca_anos as number | undefined) ?? 20

          const entrada = precioVenta * (pctEntrada / 100)
          const principal = precioVenta - entrada
          const r = tasaAnual / 100 / 12
          const n = plazoAnos * 12
          const cuota = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)

          const flujoNetoMin = alqMin - cuota
          const flujoNetoMax = alqMaxVal - cuota
          const cashOnCashMin = (flujoNetoMin * 12 / entrada) * 100
          const cashOnCashMax = (flujoNetoMax * 12 / entrada) * 100

          lines.push(``)
          lines.push(`🏦 CON HIPOTECA (${pctEntrada}% entrada)`)
          lines.push(`Entrada: ${fmtDec(entrada)}€ | Financiado: ${fmtDec(principal)}€`)
          lines.push(`Cuota est.: ${Math.round(cuota)}€/mes (${tasaAnual}%, ${plazoAnos} años)`)

          if (flujoNetoMin >= 0) {
            const flujoLabel = alqMin === alqMaxVal
              ? `+${Math.round(flujoNetoMin)}€/mes`
              : `+${Math.round(flujoNetoMin)} a +${Math.round(flujoNetoMax)}€/mes`
            const cocLabel = alqMin === alqMaxVal
              ? `${cashOnCashMin.toFixed(1)}%`
              : `${cashOnCashMin.toFixed(1)}% - ${cashOnCashMax.toFixed(1)}%`
            lines.push(`Flujo neto: ${flujoLabel}`)
            lines.push(`Cash-on-cash: ${cocLabel} sobre ${fmtDec(entrada)}€ aportados`)
          } else {
            lines.push(`⚠️ Flujo negativo: ${Math.round(flujoNetoMin)}€/mes (cuota > alquiler)`)
          }
        }

        return lines.join('\n')
      }

      default:
        return `Tool "${toolName}" no implementada`
    }
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err)
    return `Error ejecutando ${toolName}: ${(err as Error).message}`
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(user: WosUser, context: string): string {
  return `Eres WallestBot, el asistente operativo oficial de Hasu Activos Inmobiliarios SL.

Estás hablando con ${user.nombre} (rol: ${user.rol}).

REGLAS:
- Respuestas cortas y directas. Telegram no es email.
- Usa emojis con moderación.
- Cuando alguien marque una partida como finalizada, usa estado "ok".
- Siempre confirma las acciones ejecutadas con el resultado real.
- Si el usuario dice "finalizó pintura en proyecto X", busca la partida por nombre y márcala como "ok".
- Fórmula ROI = (venta - compra - reforma - gastos - impuestos) / (compra + reforma + gastos + impuestos). ROI mínimo aceptable: 30%.
- ITP: 2% sobre precio de compra. Notaría+Registro: ~1.000€.
- No mezcles datos HASU con JV.
- Para buscar proyectos: usa coincidencia parcial e insensible a mayúsculas/acentos. "Alhóndiga" matchea "Calle Alhóndiga - HO", "cervantes" matchea "Proyecto Cervantes". Si hay un único match claro, úsalo directamente sin preguntar. Solo pide aclaración si hay 2+ matches ambiguos o ninguno.
- Si no hay ningún proyecto que coincida con lo que dice el usuario, responde directamente "No existe ese proyecto en WOS3" sin listar opciones.

CONTEXTO ACTUAL:
${context}
`
}

// ─── Main POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'WALLEST_BOT_TOKEN not set' }, { status: 500 })
  }

  let update: {
    update_id: number
    message?: {
      message_id: number
      from?: { id: number; first_name: string; last_name?: string; username?: string }
      chat: { id: number }
      text?: string
    }
  }

  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const message = update.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  const text = (message.text || '').trim()
  const from = message.from

  if (!from) return NextResponse.json({ ok: true })

  // ── /start — registro ──
  if (text === '/start') {
    const existing = await getOrCreateUser(chatId, from.first_name, from.last_name, from.username)
    if (existing) {
      await sendMessage(chatId, `👋 Hola ${existing.nombre}, ya estás registrado como <b>${existing.rol}</b>.\n\n• 🏠 Cargar inmuebles a Mercado (URL o descripción)\n• 📊 Analizar rentabilidad\n• 📝 Bitácora · ✅ Partidas · 💸 Gastos · 📅 Calendario`)
    } else {
      await registerUser(chatId, from.first_name, from.last_name, from.username)
      const nombre = [from.first_name, from.last_name].filter(Boolean).join(' ')
      await sendMessage(chatId, `✅ ¡Bienvenido ${nombre}!\n\nEstás registrado en WallestBot. Puedes:\n• 🏠 Cargar inmuebles a Mercado (URL o descripción)\n• 📊 Analizar rentabilidad de una operación\n• 📝 Anotar en bitácora de proyectos\n• ✅ Marcar partidas de obra como finalizadas\n• 💸 Registrar gastos e ingresos\n• 📅 Ver y crear eventos en el calendario\n\nEscribe en lenguaje natural — entiendo español.`)
    }
    return NextResponse.json({ ok: true })
  }

  // ── /quien — info del usuario ──
  if (text === '/quien') {
    const user = await getOrCreateUser(chatId, from.first_name, from.last_name, from.username)
    if (user) {
      await sendMessage(chatId, `👤 <b>${user.nombre}</b>\nRol: ${user.rol}\nChat ID: ${user.chat_id}`)
    } else {
      await sendMessage(chatId, '❌ No estás registrado. Escribe /start para registrarte.')
    }
    return NextResponse.json({ ok: true })
  }

  // ── Verificar usuario registrado ──
  const user = await getOrCreateUser(chatId, from.first_name, from.last_name, from.username)
  if (!user) {
    await sendMessage(chatId, '❌ No estás registrado. Escribe /start para acceder a WallestBot.')
    return NextResponse.json({ ok: true })
  }

  if (!text) return NextResponse.json({ ok: true })

  // ── Procesar con Claude ──
  try {
    const [history, context] = await Promise.all([
      getHistory(chatId),
      loadContext(),
    ])

    await saveHistory(chatId, 'user', text)

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: text },
    ]

    let response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(user, context),
      tools: TOOLS,
      messages,
    })

    // Agentic loop — ejecutar tools hasta stop_reason = 'end_turn'
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          user
        )
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        })
      }

      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: toolResults })

      response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: buildSystemPrompt(user, context),
        tools: TOOLS,
        messages,
      })
    }

    const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
    const reply = textBlock?.text || '✅ Hecho.'

    await saveHistory(chatId, 'assistant', reply)
    await sendMessage(chatId, reply)

  } catch (err) {
    console.error('WallestBot error:', err)
    await sendMessage(chatId, '❌ Error procesando tu mensaje. Intenta de nuevo.')
  }

  return NextResponse.json({ ok: true })
}
