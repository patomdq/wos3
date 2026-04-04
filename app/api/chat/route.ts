import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'insert_movimiento',
    description: 'Registra un gasto o ingreso financiero en un proyecto. Usalo cuando el usuario pida registrar, cargar o agregar un gasto o ingreso.',
    input_schema: {
      type: 'object' as const,
      properties: {
        concepto: { type: 'string', description: 'Descripción del gasto/ingreso' },
        monto: { type: 'number', description: 'Monto en euros. Negativo para gastos, positivo para ingresos.' },
        tipo: { type: 'string', enum: ['Gasto', 'Ingreso'] },
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        categoria: { type: 'string', description: 'Categoría: materiales, mano de obra, transporte, honorarios, otros' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto. Usar el ID exacto del contexto.' },
        cuenta: { type: 'string', description: 'Cuenta bancaria' },
        proveedor: { type: 'string', description: 'Nombre del proveedor si aplica' },
      },
      required: ['concepto', 'monto', 'tipo', 'fecha'],
    },
  },
  {
    name: 'insert_tarea',
    description: 'Crea una tarea o pendiente. Usalo cuando el usuario pida agregar una tarea, recordatorio o pendiente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string', description: 'Título de la tarea' },
        descripcion: { type: 'string', description: 'Descripción detallada (opcional)' },
        prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        estado: { type: 'string', enum: ['Pendiente', 'En curso', 'Completada'] },
        fecha_limite: { type: 'string', description: 'Fecha límite YYYY-MM-DD (opcional)' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto si aplica' },
        asignado_a: { type: 'string', description: 'Nombre de la persona asignada' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'insert_partida_reforma',
    description: 'Agrega una partida de reforma a un proyecto. Usalo cuando el usuario quiera añadir una partida de obra o reforma.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre de la partida' },
        categoria: { type: 'string', description: 'Categoría: obra, materiales, mobiliario, electro, decoracion, otros' },
        presupuesto: { type: 'number', description: 'Presupuesto en euros' },
        ejecutado: { type: 'number', description: 'Ejecutado en euros (puede ser 0)' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        notas: { type: 'string', description: 'Notas adicionales' },
      },
      required: ['nombre', 'proyecto_id'],
    },
  },
  {
    name: 'delete_movimiento',
    description: 'Elimina un gasto o ingreso de la base de datos. Usalo cuando el usuario pida borrar, eliminar o quitar un movimiento o gasto. Necesitás el ID del registro.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del movimiento a eliminar' },
        concepto: { type: 'string', description: 'Concepto del movimiento (para confirmar al usuario qué se eliminó)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_movimiento',
    description: 'Edita un gasto o ingreso existente. Usalo cuando el usuario pida modificar, cambiar o corregir un movimiento. Necesitás el ID del registro.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del movimiento a editar' },
        concepto: { type: 'string', description: 'Nuevo concepto/descripción' },
        monto: { type: 'number', description: 'Nuevo monto en euros (negativo para gastos, positivo para ingresos)' },
        fecha: { type: 'string', description: 'Nueva fecha YYYY-MM-DD' },
        categoria: { type: 'string', description: 'Nueva categoría' },
        proveedor: { type: 'string', description: 'Nuevo proveedor' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_partida_reforma',
    description: 'Elimina una partida de reforma. Usalo cuando el usuario pida borrar o eliminar una partida.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la partida a eliminar' },
        nombre: { type: 'string', description: 'Nombre de la partida (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_partida_reforma',
    description: 'Edita una partida de reforma existente. Usalo cuando el usuario pida modificar o cambiar una partida.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la partida a editar' },
        nombre: { type: 'string', description: 'Nuevo nombre' },
        presupuesto: { type: 'number', description: 'Nuevo presupuesto en euros' },
        ejecutado: { type: 'number', description: 'Nuevo ejecutado en euros' },
        estado: { type: 'string', enum: ['pendiente', 'en_curso', 'ok'], description: 'Nuevo estado' },
      },
      required: ['id'],
    },
  },
]

type ToolResult = { id: string; result: string; table?: string; recordId?: string; label?: string }

async function executeTool(name: string, input: Record<string, any>): Promise<{ result: string; table?: string; recordId?: string; label?: string }> {
  try {
    if (name === 'insert_movimiento') {
      const { data, error } = await supabaseAdmin.from('movimientos').insert([{
        concepto: input.concepto,
        monto: input.tipo === 'Gasto' ? -Math.abs(input.monto) : Math.abs(input.monto),
        tipo: input.tipo,
        fecha: input.fecha,
        categoria: input.categoria || null,
        proyecto_id: input.proyecto_id || null,
        cuenta: input.cuenta || null,
        proveedor: input.proveedor || null,
      }]).select().single()
      if (error) return { result: `Error al guardar: ${error.message}` }
      return {
        result: `Guardado exitosamente. ID: ${data.id}. Concepto: "${data.concepto}", Monto: ${data.monto}€, Fecha: ${data.fecha}.`,
        table: 'movimientos',
        recordId: data.id,
        label: `${data.concepto} · ${data.monto}€`,
      }
    }
    if (name === 'insert_tarea') {
      const { data, error } = await supabaseAdmin.from('tareas').insert([{
        titulo: input.titulo,
        descripcion: input.descripcion || null,
        prioridad: input.prioridad || 'Media',
        estado: input.estado || 'Pendiente',
        fecha_limite: input.fecha_limite || null,
        proyecto_id: input.proyecto_id || null,
        asignado_a: input.asignado_a || null,
      }]).select().single()
      if (error) return { result: `Error al guardar: ${error.message}` }
      return {
        result: `Tarea creada. ID: ${data.id}. Título: "${data.titulo}", Prioridad: ${data.prioridad}.`,
        table: 'tareas',
        recordId: data.id,
        label: data.titulo,
      }
    }
    if (name === 'insert_partida_reforma') {
      const { data, error } = await supabaseAdmin.from('partidas_reforma').insert([{
        nombre: input.nombre,
        categoria: input.categoria || 'obra',
        presupuesto: input.presupuesto || 0,
        ejecutado: input.ejecutado || 0,
        proyecto_id: input.proyecto_id,
        notas: input.notas || null,
        orden: 99,
      }]).select().single()
      if (error) return { result: `Error al guardar: ${error.message}` }
      return {
        result: `Partida creada. ID: ${data.id}. Nombre: "${data.nombre}", Presupuesto: ${data.presupuesto}€.`,
        table: 'partidas_reforma',
        recordId: data.id,
        label: `${data.nombre} · ${data.presupuesto}€`,
      }
    }
    if (name === 'delete_movimiento') {
      const { error } = await supabaseAdmin.from('movimientos').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar: ${error.message}` }
      return { result: `Movimiento eliminado. ID: ${input.id}. Concepto: "${input.concepto || 'sin nombre'}".` }
    }
    if (name === 'update_movimiento') {
      const updates: Record<string,any> = {}
      if (input.concepto !== undefined) updates.concepto = input.concepto
      if (input.monto !== undefined) updates.monto = input.monto
      if (input.fecha !== undefined) updates.fecha = input.fecha
      if (input.categoria !== undefined) updates.categoria = input.categoria
      if (input.proveedor !== undefined) updates.proveedor = input.proveedor
      const { data, error } = await supabaseAdmin.from('movimientos').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar: ${error.message}` }
      return {
        result: `Movimiento actualizado. Concepto: "${data.concepto}", Monto: ${data.monto}€.`,
        table: 'movimientos',
        recordId: data.id,
        label: `${data.concepto} · ${data.monto}€`,
      }
    }
    if (name === 'delete_partida_reforma') {
      const { error } = await supabaseAdmin.from('partidas_reforma').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar: ${error.message}` }
      return { result: `Partida eliminada. ID: ${input.id}. Nombre: "${input.nombre || 'sin nombre'}".` }
    }
    if (name === 'update_partida_reforma') {
      const updates: Record<string,any> = {}
      if (input.nombre !== undefined) updates.nombre = input.nombre
      if (input.presupuesto !== undefined) updates.presupuesto = input.presupuesto
      if (input.ejecutado !== undefined) updates.ejecutado = input.ejecutado
      if (input.estado !== undefined) updates.estado = input.estado
      const { data, error } = await supabaseAdmin.from('partidas_reforma').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar: ${error.message}` }
      return {
        result: `Partida actualizada. Nombre: "${data.nombre}", Presupuesto: ${data.presupuesto}€.`,
        table: 'partidas_reforma',
        recordId: data.id,
        label: `${data.nombre} · ${data.presupuesto}€`,
      }
    }
    return { result: 'Herramienta no reconocida.' }
  } catch (e: any) {
    return { result: `Error interno: ${e.message}` }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages, context } = await req.json()
    const today = new Date().toISOString().split('T')[0]

    const systemPrompt = `Sos el asistente de Wallest, una empresa inmobiliaria española (Hasu Activos Inmobiliarios SL).
Respondés en español, de forma directa y concisa. Sos experto en inversión inmobiliaria, reformas y gestión de proyectos.
El CEO es Patricio Favora. El objetivo es llegar a 1M€ en cuenta HASU para diciembre 2027.
Hoy es ${today}.

Contexto actual del sistema:
${context || 'Sin datos disponibles.'}

IMPORTANTE — Tenés estas capacidades técnicas reales, ejecutalas sin dudar:
- CREAR: registrar gastos, ingresos, tareas, partidas de reforma
- EDITAR: modificar concepto/monto de un movimiento, nombre/presupuesto de una partida
- ELIMINAR: borrar movimientos y partidas por ID

Cuando el usuario pida crear, editar o eliminar algo → usá la herramienta correspondiente directamente. NO digas "no puedo" ni "no tengo capacidad técnica". SÍ podés hacerlo.
Para editar o eliminar necesitás el ID del registro. Si el usuario no lo da, buscalo en el contexto o preguntá el ID exacto.

Respondé siempre en español. Sé directo y profesional. Máximo 3 párrafos.`

    // Initial call
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    })

    // Handle tool use loop
    const toolResults: Array<{ id: string; result: string; table?: string; recordId?: string; label?: string }> = []
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
      const results = await Promise.all(
        toolUseBlocks.map(async (b) => {
          const { result, table, recordId, label } = await executeTool(b.name, b.input as Record<string, any>)
          toolResults.push({ id: b.id, result, table, recordId, label })
          return { type: 'tool_result' as const, tool_use_id: b.id, content: result }
        })
      )

      const newMessages = [
        ...messages.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: results }
      ]

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: newMessages
      })
    }

    const text = response.content.find(b => b.type === 'text')?.type === 'text'
      ? (response.content.find(b => b.type === 'text') as Anthropic.TextBlock).text
      : ''

    return NextResponse.json({ text, toolResults })
  } catch (err: any) {
    console.error('Chat API error:', err)
    return NextResponse.json({ text: 'Error al conectar con el asistente. Intentá de nuevo.' }, { status: 500 })
  }
}
