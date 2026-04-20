import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { PARTIDAS_PLANTILLA } from '@/lib/reforma-template'
import { getOrgAccessToken } from '@/lib/gcalToken'
import { gcalCreateEvent } from '@/lib/googleCalendar'
import { verifyAuth } from '@/lib/api-auth'

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
    description: 'Agrega una partida de reforma a un proyecto. Usalo cuando el usuario quiera añadir una partida de obra o reforma, o cuando indique cuándo empieza un gremio/trabajo (ej: "el lunes empieza el pintor").',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre de la partida' },
        categoria: { type: 'string', description: 'Categoría: obra, materiales, mobiliario, electro, decoracion, otros' },
        presupuesto: { type: 'number', description: 'Presupuesto en euros' },
        ejecutado: { type: 'number', description: 'Ejecutado en euros (puede ser 0)' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        notas: { type: 'string', description: 'Notas adicionales' },
        fecha_inicio: { type: 'string', description: 'Fecha de inicio YYYY-MM-DD. Si el usuario dice "el lunes", "el 15 de mayo", etc., convertirla.' },
        fecha_fin_estimada: { type: 'string', description: 'Fecha fin estimada YYYY-MM-DD (opcional)' },
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
        monto: { type: 'number', description: 'Nuevo monto en euros. Siempre positivo; el tipo determina el signo.' },
        tipo: { type: 'string', enum: ['Gasto', 'Ingreso'], description: 'Nuevo tipo. Pasarlo si cambia o si se actualiza el monto para aplicar el signo correcto.' },
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
    description: 'Edita una partida de reforma existente. Usalo cuando el usuario pida modificar o cambiar una partida, incluyendo fechas de inicio/fin.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la partida a editar' },
        nombre: { type: 'string', description: 'Nuevo nombre' },
        presupuesto: { type: 'number', description: 'Nuevo presupuesto en euros' },
        ejecutado: { type: 'number', description: 'Nuevo ejecutado en euros' },
        estado: { type: 'string', enum: ['pendiente', 'en_curso', 'ok', 'retrasada'], description: 'Nuevo estado' },
        fecha_inicio: { type: 'string', description: 'Fecha de inicio YYYY-MM-DD' },
        fecha_fin_estimada: { type: 'string', description: 'Fecha fin estimada YYYY-MM-DD' },
        fecha_fin_real: { type: 'string', description: 'Fecha fin real YYYY-MM-DD' },
        proyecto_nombre: { type: 'string', description: 'Nombre del proyecto (para el título del evento GCal)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'insert_radar',
    description: 'Agrega un inmueble al radar de mercado para seguimiento. Usalo cuando el usuario pida agregar, guardar o meter un piso/inmueble/propiedad al radar o a vigilar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        direccion: { type: 'string', description: 'Dirección del inmueble' },
        ciudad: { type: 'string', description: 'Ciudad o municipio' },
        precio: { type: 'number', description: 'Precio de venta pedido en euros' },
        habitaciones: { type: 'number', description: 'Número de habitaciones' },
        superficie: { type: 'number', description: 'Superficie en m²' },
        url: { type: 'string', description: 'Link de Idealista u otra fuente (pegar URL completa)' },
        fuente: { type: 'string', enum: ['WhatsApp', 'Idealista', 'API', 'otro'], description: 'Fuente del inmueble. Default: otro' },
        notas: { type: 'string', description: 'Notas u observaciones' },
      },
      required: ['direccion', 'precio'],
    },
  },
  {
    name: 'insert_bitacora',
    description: 'Agrega una entrada a la bitácora de un proyecto. Usalo cuando el usuario diga "agrega a la bitácora", "anota en la bitácora", "registra en la bitácora", "añade una nota al proyecto", o mencione un hito, alerta o novedad de un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        contenido: { type: 'string', description: 'Texto de la entrada de bitácora' },
        titulo: { type: 'string', description: 'Título breve (opcional)' },
        tipo: { type: 'string', enum: ['nota', 'hito', 'alerta', 'bot'], description: 'Tipo de entrada. Default: nota' },
        autor: { type: 'string', description: 'Autor de la entrada. Default: Patricio' },
      },
      required: ['proyecto_id', 'contenido'],
    },
  },
  {
    name: 'insert_proveedor',
    description: 'Crea un nuevo proveedor o empresa de servicios. Usalo cuando el usuario pida agregar, registrar o crear un proveedor, empresa, fontanero, electricista, contratista, o cualquier proveedor de servicios.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre del proveedor o empresa' },
        rubro: { type: 'string', description: 'Especialidad o rubro (ej: fontanería, electricidad, obra, pintura, carpintería)' },
        telefono: { type: 'string', description: 'Teléfono de contacto' },
        email: { type: 'string', description: 'Email de contacto' },
        contacto: { type: 'string', description: 'Nombre de la persona de contacto' },
        cif: { type: 'string', description: 'CIF o NIF de la empresa' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'insert_cuenta_bancaria',
    description: 'Crea una cuenta bancaria. Usalo cuando el usuario pida agregar, registrar o crear una cuenta bancaria, cuenta corriente o cuenta de ahorro.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre descriptivo (ej: "BBVA Corporativa HASU", "Cuenta Reforma Gracia 1")' },
        banco: { type: 'string', description: 'Nombre del banco (BBVA, Santander, CaixaBank, etc.)' },
        iban_parcial: { type: 'string', description: 'IBAN completo o parcial (ej: ES12 3456 7890)' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto al que pertenece (opcional)' },
        saldo_actual: { type: 'number', description: 'Saldo actual en euros (default 0)' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'update_cuenta_bancaria',
    description: 'Edita una cuenta bancaria existente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la cuenta' },
        nombre: { type: 'string' }, banco: { type: 'string' },
        iban_parcial: { type: 'string' }, saldo_actual: { type: 'number' },
        activa: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_cuenta_bancaria',
    description: 'Elimina una cuenta bancaria.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la cuenta' },
        nombre: { type: 'string', description: 'Nombre (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_radar',
    description: 'Edita un inmueble del radar. Usalo cuando el usuario pida modificar o actualizar un inmueble del radar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del inmueble en radar' },
        direccion: { type: 'string' }, ciudad: { type: 'string' },
        precio: { type: 'number' }, habitaciones: { type: 'number' }, superficie: { type: 'number' },
        url: { type: 'string' }, fuente: { type: 'string' }, notas: { type: 'string' },
        estado: { type: 'string', enum: ['activo', 'descartado', 'convertido'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_radar',
    description: 'Elimina un inmueble del radar. Usalo cuando el usuario pida borrar o quitar un inmueble del radar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del inmueble a eliminar' },
        direccion: { type: 'string', description: 'Dirección (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_tarea',
    description: 'Edita una tarea existente. Usalo cuando el usuario pida modificar, completar o cambiar el estado de una tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la tarea' },
        titulo: { type: 'string' }, descripcion: { type: 'string' },
        prioridad: { type: 'string', enum: ['Alta', 'Media', 'Baja'] },
        estado: { type: 'string', enum: ['Pendiente', 'En curso', 'Completada'] },
        fecha_limite: { type: 'string' }, asignado_a: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_tarea',
    description: 'Elimina una tarea. Usalo cuando el usuario pida borrar o eliminar una tarea.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la tarea' },
        titulo: { type: 'string', description: 'Título (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_proveedor',
    description: 'Edita un proveedor existente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del proveedor' },
        nombre: { type: 'string' }, rubro: { type: 'string' },
        telefono: { type: 'string' }, email: { type: 'string' },
        contacto: { type: 'string' }, cif: { type: 'string' },
        activo: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_proveedor',
    description: 'Elimina un proveedor.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del proveedor' },
        nombre: { type: 'string', description: 'Nombre (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_bitacora',
    description: 'Edita una entrada de bitácora existente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la entrada' },
        contenido: { type: 'string' }, titulo: { type: 'string' },
        tipo: { type: 'string', enum: ['nota', 'hito', 'alerta', 'bot'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_bitacora',
    description: 'Elimina una entrada de bitácora.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la entrada' },
        contenido: { type: 'string', description: 'Contenido (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_proyecto',
    description: 'Elimina un proyecto del sistema. Usalo solo cuando el usuario confirme explícitamente que quiere borrar el proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del proyecto' },
        nombre: { type: 'string', description: 'Nombre del proyecto (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'listar_eventos',
    description: 'Lista eventos de Google Calendar en un rango de fechas. Usalo para buscar eventos cuando necesites el ID para editar o eliminar, o cuando el usuario pregunte qué hay en el calendario.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha_desde: { type: 'string', description: 'Fecha inicio del rango YYYY-MM-DD' },
        fecha_hasta: { type: 'string', description: 'Fecha fin del rango YYYY-MM-DD' },
      },
      required: ['fecha_desde'],
    },
  },
  {
    name: 'editar_evento',
    description: 'Edita un evento existente en Google Calendar. Usalo cuando el usuario pida cambiar la hora, fecha o título de un evento. Si no tenés el google_event_id, usá listar_eventos primero.',
    input_schema: {
      type: 'object' as const,
      properties: {
        google_event_id: { type: 'string', description: 'ID del evento en Google Calendar' },
        titulo:          { type: 'string', description: 'Nuevo título (omitir para no cambiar)' },
        fecha:           { type: 'string', description: 'Nueva fecha YYYY-MM-DD' },
        hora_inicio:     { type: 'string', description: 'Nueva hora inicio HH:MM' },
        hora_fin:        { type: 'string', description: 'Nueva hora fin HH:MM' },
        todo_el_dia:     { type: 'boolean', description: 'true si es todo el día' },
        descripcion:     { type: 'string', description: 'Nueva descripción' },
      },
      required: ['google_event_id'],
    },
  },
  {
    name: 'eliminar_evento',
    description: 'Elimina un evento de Google Calendar. Si no tenés el google_event_id, usá listar_eventos primero para buscarlo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        google_event_id: { type: 'string', description: 'ID del evento en Google Calendar' },
        titulo:          { type: 'string', description: 'Título del evento (para confirmar al usuario)' },
      },
      required: ['google_event_id'],
    },
  },
  {
    name: 'agendar_evento',
    description: 'Crea un evento en Google Calendar de hola@hasu.in. Usalo cuando el usuario pida agendar, programar, crear una reunión o evento. Interpretá fechas relativas como "mañana", "el lunes", "el 15 de mayo".',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo:       { type: 'string',  description: 'Título del evento. Ej: "Reunión con José Luis"' },
        fecha:        { type: 'string',  description: 'Fecha en formato YYYY-MM-DD' },
        hora_inicio:  { type: 'string',  description: 'Hora de inicio HH:MM (ej: "09:00"). Omitir si es todo el día.' },
        hora_fin:     { type: 'string',  description: 'Hora de fin HH:MM (ej: "10:00"). Omitir si es todo el día.' },
        todo_el_dia:  { type: 'boolean', description: 'true si es evento de todo el día sin hora específica.' },
        descripcion:  { type: 'string',  description: 'Descripción opcional del evento.' },
      },
      required: ['titulo', 'fecha'],
    },
  },
  {
    name: 'recalcular_timeline',
    description: 'Desplaza en cascada las fechas de una partida de reforma y todas las que dependen de ella. Usalo cuando el usuario diga que una partida/gremio se retrasa o adelanta N días. Identifica la partida por nombre parcial (ej: "pintor" → "Pintura").',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        partida_nombre: { type: 'string', description: 'Nombre (o parte del nombre) de la partida afectada. Ej: "pintor", "electricidad", "suelos"' },
        dias: { type: 'number', description: 'Días a desplazar. Positivo = retraso, negativo = adelanto.' },
      },
      required: ['proyecto_id', 'partida_nombre', 'dias'],
    },
  },
  {
    name: 'insert_proyecto',
    description: 'Crea un nuevo proyecto/activo inmobiliario. Usalo cuando el usuario pida crear, agregar o registrar un nuevo proyecto, inmueble o activo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre del proyecto (ej: "Piso Gracia 1")' },
        direccion: { type: 'string', description: 'Dirección completa' },
        ciudad: { type: 'string', description: 'Ciudad' },
        provincia: { type: 'string', description: 'Provincia' },
        tipo: { type: 'string', enum: ['piso', 'local', 'edificio', 'solar'], description: 'Tipo de inmueble' },
        estado: { type: 'string', enum: ['captado', 'analisis', 'ofertado', 'comprado', 'reforma', 'venta', 'cerrado'], description: 'Estado actual en el pipeline' },
        precio_compra: { type: 'number', description: 'Precio de compra en euros' },
        precio_venta_conservador: { type: 'number', description: 'Precio de venta escenario conservador en euros' },
        precio_venta_realista: { type: 'number', description: 'Precio de venta escenario realista en euros' },
        precio_venta_optimista: { type: 'number', description: 'Precio de venta escenario optimista en euros' },
        precio_venta_estimado: { type: 'number', description: 'Precio de venta estimado general (si no se dan escenarios separados)' },
        valor_total_operacion: { type: 'number', description: 'Valor total de la operación incluyendo reforma y gastos' },
        superficie: { type: 'number', description: 'Superficie en m²' },
        habitaciones: { type: 'number', description: 'Número de habitaciones' },
        banos: { type: 'number', description: 'Número de baños' },
        porcentaje_hasu: { type: 'number', description: 'Porcentaje de equity de HASU (0-100). Default 100.' },
        socio_nombre: { type: 'string', description: 'Nombre del socio si hay coinversión' },
        inversion_hasu: { type: 'number', description: 'Capital invertido por HASU en euros' },
        fecha_compra: { type: 'string', description: 'Fecha de compra YYYY-MM-DD' },
        fecha_salida_estimada: { type: 'string', description: 'Fecha estimada de venta/salida YYYY-MM-DD' },
        notas: { type: 'string', description: 'Notas adicionales' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'convertir_estudio_a_proyecto',
    description: 'Busca un inmueble en "En Estudio" por dirección o nombre y lo convierte en proyecto activo con estado "comprado". Usalo cuando el usuario diga que un inmueble está comprado, se compró, o quiere pasarlo a proyectos. Busca por texto parcial en dirección o nombre.',
    input_schema: {
      type: 'object' as const,
      properties: {
        busqueda: { type: 'string', description: 'Dirección, nombre o texto para buscar el inmueble en estudios. Ej: "Calle Mayor 5"' },
        precio_compra: { type: 'number', description: 'Precio de compra en euros (opcional, usa el del estudio si no se indica)' },
        fecha_compra: { type: 'string', description: 'Fecha de compra YYYY-MM-DD (opcional, default hoy)' },
        notas: { type: 'string', description: 'Notas adicionales' },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'insert_prospecto',
    description: 'Agrega un prospecto (comprador potencial) a un proyecto. Usalo cuando el usuario diga "agrega prospecto", "nuevo interesado", o indique nombre y teléfono/email de alguien interesado en comprar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        nombre: { type: 'string', description: 'Nombre completo del prospecto' },
        telefono: { type: 'string', description: 'Teléfono de contacto' },
        email: { type: 'string', description: 'Email de contacto' },
        estado: { type: 'string', enum: ['Contactado','Visita programada','Visita realizada','Oferta recibida','En negociación','Descartado'], description: 'Estado del prospecto. Default: Contactado' },
        mejor_oferta: { type: 'number', description: 'Mejor oferta recibida en euros' },
        proxima_visita: { type: 'string', description: 'Fecha de próxima visita YYYY-MM-DD' },
        notas: { type: 'string', description: 'Notas adicionales' },
      },
      required: ['proyecto_id', 'nombre'],
    },
  },
  {
    name: 'update_prospecto',
    description: 'Actualiza un prospecto existente. Usalo para cambiar el estado, registrar una oferta, programar visita o descartar a alguien. Buscá el prospecto_id en el contexto por nombre.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del prospecto' },
        nombre: { type: 'string', description: 'Nuevo nombre (opcional)' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        estado: { type: 'string', enum: ['Contactado','Visita programada','Visita realizada','Oferta recibida','En negociación','Descartado'] },
        mejor_oferta: { type: 'number', description: 'Oferta recibida en euros' },
        proxima_visita: { type: 'string', description: 'Fecha próxima visita YYYY-MM-DD' },
        notas: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_prospecto',
    description: 'Elimina un prospecto. Usalo cuando el usuario pida borrar o quitar un prospecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del prospecto' },
        nombre: { type: 'string', description: 'Nombre (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'insert_interaccion_prospecto',
    description: 'Registra una interacción (llamada, visita, mensaje, email) con un prospecto. Usalo cuando el usuario mencione que llamó, visitó o mandó un mensaje a un prospecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prospecto_id: { type: 'string', description: 'UUID del prospecto' },
        tipo: { type: 'string', enum: ['llamada','visita','mensaje','email','nota'], description: 'Tipo de interacción' },
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD. Default: hoy' },
        nota: { type: 'string', description: 'Descripción de la interacción o nota' },
      },
      required: ['prospecto_id', 'nota'],
    },
  },
  {
    name: 'update_proyecto',
    description: 'Actualiza datos de un proyecto existente. Usalo para: cambiar el estado en el pipeline, actualizar el avance de obra, actualizar los escenarios de precio de venta (conservador/realista/optimista), o modificar cualquier dato del proyecto. Necesitás el ID del proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del proyecto a actualizar' },
        nombre: { type: 'string', description: 'Nuevo nombre' },
        estado: { type: 'string', enum: ['captado', 'analisis', 'ofertado', 'comprado', 'reforma', 'venta', 'cerrado'], description: 'Nuevo estado en el pipeline' },
        avance_reforma: { type: 'number', description: 'Porcentaje de avance de obra (0-100)' },
        precio_venta_conservador: { type: 'number', description: 'Precio de venta escenario conservador en euros' },
        precio_venta_realista: { type: 'number', description: 'Precio de venta escenario realista en euros' },
        precio_venta_optimista: { type: 'number', description: 'Precio de venta escenario optimista en euros' },
        precio_venta_estimado: { type: 'number', description: 'Precio de venta estimado general en euros' },
        precio_compra: { type: 'number', description: 'Precio de compra en euros' },
        valor_total_operacion: { type: 'number', description: 'Valor total de la operación en euros' },
        inversion_hasu: { type: 'number', description: 'Capital invertido por HASU en euros' },
        porcentaje_hasu: { type: 'number', description: 'Porcentaje de equity de HASU (0-100)' },
        fecha_compra: { type: 'string', description: 'Fecha de compra YYYY-MM-DD' },
        fecha_salida_estimada: { type: 'string', description: 'Fecha estimada de salida YYYY-MM-DD' },
        notas: { type: 'string', description: 'Notas' },
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
        fecha_inicio: input.fecha_inicio || null,
        fecha_fin_estimada: input.fecha_fin_estimada || null,
        orden: 99,
      }]).select().single()
      if (error) return { result: `Error al guardar: ${error.message}` }
      // Sync to GCal if has fecha_inicio
      if (input.fecha_inicio) {
        const gcalToken = await getOrgAccessToken()
        if (gcalToken) {
          const { data: proy } = await supabaseAdmin.from('proyectos').select('nombre').eq('id', input.proyecto_id).single()
          const title = `${input.nombre} — ${proy?.nombre || ''}`
          const created = await gcalCreateEvent(gcalToken, {
            title,
            startDateTime: input.fecha_inicio,
            endDateTime: input.fecha_fin_estimada || input.fecha_inicio,
            allDay: true,
          })
          if (created) {
            await supabaseAdmin.from('partidas_gcal').upsert({ partida_id: data.id, google_event_id: created.id }, { onConflict: 'partida_id' })
          }
        }
      }
      const fechaMsg = input.fecha_inicio ? `, Inicio: ${input.fecha_inicio}` : ''
      return {
        result: `Partida creada. ID: ${data.id}. Nombre: "${data.nombre}", Presupuesto: ${data.presupuesto}€${fechaMsg}.${input.fecha_inicio ? ' Evento creado en Google Calendar.' : ''}`,
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
      if (input.monto !== undefined) {
        // Normalize sign: if tipo is provided use it; otherwise preserve the raw value Claude sends
        if (input.tipo) {
          updates.monto = input.tipo === 'Gasto' ? -Math.abs(input.monto) : Math.abs(input.monto)
        } else {
          updates.monto = input.monto
        }
      }
      if (input.tipo !== undefined) updates.tipo = input.tipo
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
      if (input.fecha_inicio !== undefined) updates.fecha_inicio = input.fecha_inicio
      if (input.fecha_fin_estimada !== undefined) updates.fecha_fin_estimada = input.fecha_fin_estimada
      if (input.fecha_fin_real !== undefined) updates.fecha_fin_real = input.fecha_fin_real
      const { data, error } = await supabaseAdmin.from('partidas_reforma').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar: ${error.message}` }
      // Sync GCal if dates changed
      if (input.fecha_inicio || input.fecha_fin_estimada) {
        const gcalToken = await getOrgAccessToken()
        if (gcalToken) {
          const title = `${data.nombre} — ${input.proyecto_nombre || ''}`
          const startDT = data.fecha_inicio
          const endDT   = data.fecha_fin_estimada || data.fecha_inicio
          if (startDT) {
            const { data: gcalRow } = await supabaseAdmin.from('partidas_gcal').select('google_event_id').eq('partida_id', input.id).single()
            const { gcalUpdateEvent: gcalUpd } = await import('@/lib/googleCalendar')
            if (gcalRow?.google_event_id) {
              await gcalUpd(gcalToken, gcalRow.google_event_id, { title, startDateTime: startDT, endDateTime: endDT, allDay: true })
            } else {
              const created = await gcalCreateEvent(gcalToken, { title, startDateTime: startDT, endDateTime: endDT, allDay: true })
              if (created) {
                await supabaseAdmin.from('partidas_gcal').upsert({ partida_id: input.id, google_event_id: created.id }, { onConflict: 'partida_id' })
              }
            }
          }
        }
      }
      return {
        result: `Partida actualizada. Nombre: "${data.nombre}", Presupuesto: ${data.presupuesto}€.${(input.fecha_inicio || input.fecha_fin_estimada) ? ' Calendario actualizado.' : ''}`,
        table: 'partidas_reforma',
        recordId: data.id,
        label: `${data.nombre} · ${data.presupuesto}€`,
      }
    }
    if (name === 'insert_radar') {
      const radarRow: Record<string, any> = {
        direccion: input.direccion,
        ciudad: input.ciudad || null,
        precio: input.precio,
        habitaciones: input.habitaciones || null,
        superficie: input.superficie || null,
        fuente: input.fuente || 'otro',
        estado: 'activo',
        fecha_recibido: new Date().toISOString().split('T')[0],
        notas: input.notas || null,
      }
      if (input.url) radarRow.url = input.url
      const { data, error } = await supabaseAdmin.from('inmuebles_radar').insert([radarRow]).select().single()
      if (error) return { result: `Error al guardar en radar: ${error.message}` }
      return {
        result: `Inmueble agregado al radar. ID: ${data.id}. Dirección: "${data.direccion}", Precio: ${data.precio}€, Ciudad: ${data.ciudad || 'sin especificar'}.`,
        table: 'inmuebles_radar',
        recordId: data.id,
        label: `${data.direccion}${data.ciudad ? ' · ' + data.ciudad : ''} · ${data.precio}€`,
      }
    }
    if (name === 'insert_bitacora') {
      const { data, error } = await supabaseAdmin.from('bitacora').insert([{
        proyecto_id: input.proyecto_id,
        contenido: input.contenido,
        titulo: input.titulo || null,
        tipo: input.tipo || 'nota',
        autor: input.autor || 'Patricio',
      }]).select().single()
      if (error) return { result: `Error al guardar en bitácora: ${error.message}` }
      return {
        result: `Entrada de bitácora guardada. ID: ${data.id}. Tipo: ${data.tipo}. Contenido: "${data.contenido}".`,
        table: 'bitacora',
        recordId: data.id,
        label: data.titulo || data.contenido.slice(0, 40),
      }
    }
    if (name === 'insert_proveedor') {
      const { data, error } = await supabaseAdmin.from('proveedores').insert([{
        nombre: input.nombre,
        rubro: input.rubro || null,
        telefono: input.telefono || null,
        email: input.email || null,
        contacto: input.contacto || null,
        cif: input.cif || null,
        activo: true,
      }]).select().single()
      if (error) return { result: `Error al crear proveedor: ${error.message}` }
      return {
        result: `Proveedor creado. ID: ${data.id}. Nombre: "${data.nombre}", Rubro: ${data.rubro || 'sin especificar'}, Teléfono: ${data.telefono || 'sin especificar'}.`,
        table: 'proveedores',
        recordId: data.id,
        label: `${data.nombre}${data.rubro ? ' · ' + data.rubro : ''}`,
      }
    }
    if (name === 'insert_cuenta_bancaria') {
      const { data, error } = await supabaseAdmin.from('cuentas_bancarias').insert([{
        nombre: input.nombre,
        banco: input.banco || null,
        iban_parcial: input.iban_parcial || null,
        proyecto_id: input.proyecto_id || null,
        saldo_actual: input.saldo_actual || 0,
        activa: true,
      }]).select().single()
      if (error) return { result: `Error al crear cuenta: ${error.message}` }
      return {
        result: `Cuenta bancaria creada. ID: ${data.id}. Nombre: "${data.nombre}", Banco: ${data.banco || 'sin especificar'}, IBAN: ${data.iban_parcial || 'sin especificar'}.`,
        table: 'cuentas_bancarias', recordId: data.id,
        label: `${data.nombre}${data.banco ? ' · ' + data.banco : ''}`,
      }
    }
    if (name === 'update_cuenta_bancaria') {
      const fields = ['nombre','banco','iban_parcial','saldo_actual','activa']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('cuentas_bancarias').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar cuenta: ${error.message}` }
      return { result: `Cuenta actualizada. Nombre: "${data.nombre}".`, table: 'cuentas_bancarias', recordId: data.id, label: data.nombre }
    }
    if (name === 'delete_cuenta_bancaria') {
      const { error } = await supabaseAdmin.from('cuentas_bancarias').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar cuenta: ${error.message}` }
      return { result: `Cuenta bancaria eliminada: "${input.nombre || input.id}".` }
    }
    if (name === 'update_radar') {
      const fields = ['direccion','ciudad','precio','habitaciones','superficie','url','fuente','notas','estado']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('inmuebles_radar').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar inmueble: ${error.message}` }
      return { result: `Inmueble actualizado. Dirección: "${data.direccion}", Precio: ${data.precio}€.`, table: 'inmuebles_radar', recordId: data.id, label: `${data.direccion} · ${data.precio}€` }
    }
    if (name === 'delete_radar') {
      const { error } = await supabaseAdmin.from('inmuebles_radar').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar: ${error.message}` }
      return { result: `Inmueble eliminado del radar. Dirección: "${input.direccion || input.id}".` }
    }
    if (name === 'update_tarea') {
      const fields = ['titulo','descripcion','prioridad','estado','fecha_limite','asignado_a']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('tareas').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar tarea: ${error.message}` }
      return { result: `Tarea actualizada. Título: "${data.titulo}", Estado: ${data.estado}.`, table: 'tareas', recordId: data.id, label: data.titulo }
    }
    if (name === 'delete_tarea') {
      const { error } = await supabaseAdmin.from('tareas').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar tarea: ${error.message}` }
      return { result: `Tarea eliminada: "${input.titulo || input.id}".` }
    }
    if (name === 'update_proveedor') {
      const fields = ['nombre','rubro','telefono','email','contacto','cif','activo']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('proveedores').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar proveedor: ${error.message}` }
      return { result: `Proveedor actualizado. Nombre: "${data.nombre}".`, table: 'proveedores', recordId: data.id, label: data.nombre }
    }
    if (name === 'delete_proveedor') {
      const { error } = await supabaseAdmin.from('proveedores').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar proveedor: ${error.message}` }
      return { result: `Proveedor eliminado: "${input.nombre || input.id}".` }
    }
    if (name === 'update_bitacora') {
      const fields = ['contenido','titulo','tipo']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('bitacora').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar bitácora: ${error.message}` }
      return { result: `Entrada de bitácora actualizada. Contenido: "${data.contenido}".`, table: 'bitacora', recordId: data.id, label: data.titulo || data.contenido.slice(0,40) }
    }
    if (name === 'delete_bitacora') {
      const { error } = await supabaseAdmin.from('bitacora').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar entrada: ${error.message}` }
      return { result: `Entrada de bitácora eliminada.` }
    }
    if (name === 'listar_eventos') {
      const token = await getOrgAccessToken()
      if (!token) return { result: 'Google Calendar no está conectado.' }
      const { gcalListEvents } = await import('@/lib/googleCalendar')
      const desde = input.fecha_desde
      const hasta = input.fecha_hasta || new Date(new Date(desde).getTime() + 7 * 86400000).toISOString().split('T')[0]
      const events = await gcalListEvents(token, new Date(desde).toISOString(), new Date(hasta + 'T23:59:59').toISOString())
      if (!events.length) return { result: `No hay eventos entre ${desde} y ${hasta}.` }
      const lista = events.map(e => {
        const fecha = (e.start.dateTime || e.start.date || '').substring(0, 10)
        const hora  = e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'Todo el día'
        return `- ID: ${e.id} | ${e.summary} | ${fecha} ${hora}`
      }).join('\n')
      return { result: `Eventos (${desde} → ${hasta}):\n${lista}` }
    }
    if (name === 'editar_evento') {
      const token = await getOrgAccessToken()
      if (!token) return { result: 'Google Calendar no está conectado.' }
      const { gcalUpdateEvent, gcalListEvents } = await import('@/lib/googleCalendar')
      // Fetch current event with a wide date range so past events are included too
      const past   = new Date(Date.now() - 365 * 86400000).toISOString()
      const future = new Date(Date.now() + 365 * 86400000).toISOString()
      const events = await gcalListEvents(token, past, future)
      const current = events.find(e => e.id === input.google_event_id)
      if (!current) return { result: `No encontré el evento con ID ${input.google_event_id}.` }
      const allDay = input.todo_el_dia ?? !current.start.dateTime
      const fecha = input.fecha || (current.start.dateTime || current.start.date || '').substring(0, 10)
      const startDT = allDay ? fecha : `${fecha}T${input.hora_inicio || new Date(current.start.dateTime!).toTimeString().substring(0,5)}:00`
      const endDT   = allDay ? fecha : `${fecha}T${input.hora_fin   || new Date(current.end.dateTime!).toTimeString().substring(0,5)}:00`
      const updated = await gcalUpdateEvent(token, input.google_event_id, {
        title:         input.titulo      || current.summary || '',
        description:   input.descripcion ?? current.description ?? '',
        startDateTime: startDT,
        endDateTime:   endDT,
        allDay,
      })
      if (!updated) return { result: 'Error al editar el evento.' }
      return { result: `Evento actualizado: "${updated.summary}", ${fecha}${allDay ? '' : ' ' + startDT.substring(11,16)}.` }
    }
    if (name === 'eliminar_evento') {
      const token = await getOrgAccessToken()
      if (!token) return { result: 'Google Calendar no está conectado.' }
      const { gcalDeleteEvent } = await import('@/lib/googleCalendar')
      const ok = await gcalDeleteEvent(token, input.google_event_id)
      if (!ok) return { result: `Error al eliminar el evento.` }
      return { result: `Evento eliminado: "${input.titulo || input.google_event_id}".` }
    }
    if (name === 'agendar_evento') {
      const token = await getOrgAccessToken()
      if (!token) return { result: 'Google Calendar no está conectado. Conectalo primero desde HASU → Calendario.' }

      const allDay = input.todo_el_dia || (!input.hora_inicio && !input.hora_fin)
      const startDT = allDay
        ? input.fecha
        : `${input.fecha}T${input.hora_inicio || '09:00'}:00`
      const endDT = allDay
        ? input.fecha
        : (() => {
            if (input.hora_fin) return `${input.fecha}T${input.hora_fin}:00`
            const startH = parseInt((input.hora_inicio || '09').split(':')[0])
            const endH   = (startH + 1) % 24
            const endMin = startH >= 23 ? '59' : '00'
            return `${input.fecha}T${String(endH).padStart(2,'0')}:${endMin}:00`
          })()

      const created = await gcalCreateEvent(token, {
        title:         input.titulo,
        description:   input.descripcion || '',
        startDateTime: startDT,
        endDateTime:   endDT,
        allDay,
      })

      if (!created) return { result: 'Error al crear el evento en Google Calendar. Verificá que la conexión esté activa.' }

      const horaStr = allDay ? 'todo el día' : `${input.hora_inicio || '09:00'} – ${input.hora_fin || ''}`
      return {
        result: `Evento creado en Google Calendar. Título: "${created.summary}", Fecha: ${input.fecha}, Hora: ${horaStr}. ID: ${created.id}.`,
        table: 'google_calendar',
        label: created.summary,
      }
    }
    if (name === 'recalcular_timeline') {
      // 1. Fetch all partidas of the project
      const { data: todas, error: fetchErr } = await supabaseAdmin
        .from('partidas_reforma')
        .select('id, nombre, fecha_inicio, fecha_fin_estimada, fecha_fin_real, depende_de, estado')
        .eq('proyecto_id', input.proyecto_id)
      if (fetchErr || !todas) return { result: `Error al leer partidas: ${fetchErr?.message}` }

      // 2. Find root partida by partial name (case-insensitive)
      const needle = (input.partida_nombre as string).toLowerCase()
      const raiz = todas.find(p => p.nombre.toLowerCase().includes(needle))
      if (!raiz) return { result: `No encontré ninguna partida con el nombre "${input.partida_nombre}". Verificá el nombre.` }

      // Fetch project name for GCal event titles
      const { data: proyData } = await supabaseAdmin.from('proyectos').select('nombre').eq('id', input.proyecto_id).single()
      const proyNombre = proyData?.nombre || ''

      const dias: number = input.dias
      const addDays = (dateStr: string, d: number): string => {
        const dt = new Date(dateStr)
        dt.setDate(dt.getDate() + d)
        return dt.toISOString().split('T')[0]
      }

      // 3. BFS cascade
      const afectadas: { id: string; nombre: string; updates: Record<string,any> }[] = []
      const visited = new Set<string>()
      const queue: string[] = [raiz.id]

      while (queue.length > 0) {
        const currentId = queue.shift()!
        if (visited.has(currentId)) continue
        visited.add(currentId)

        const p = todas.find(x => x.id === currentId)
        if (!p) continue

        const updates: Record<string,any> = {}
        if (p.fecha_fin_estimada) updates.fecha_fin_estimada = addDays(p.fecha_fin_estimada, dias)
        if (p.fecha_inicio) updates.fecha_inicio = addDays(p.fecha_inicio, dias)
        if (dias > 0 && p.estado !== 'ok') updates.estado = 'retrasada'

        if (Object.keys(updates).length > 0) {
          afectadas.push({ id: currentId, nombre: p.nombre, updates })
          // Enqueue dependents
          for (const dep of todas.filter(x => x.depende_de === currentId)) {
            if (!visited.has(dep.id)) queue.push(dep.id)
          }
        }
      }

      // 4. Batch update
      for (const a of afectadas) {
        await supabaseAdmin.from('partidas_reforma').update(a.updates).eq('id', a.id)
      }

      // 5. Update Google Calendar events for affected partidas (fire-and-forget)
      const gcalToken = await getOrgAccessToken()
      if (gcalToken) {
        const { gcalUpdateEvent: gcalUpd, gcalCreateEvent: gcalCre } = await import('@/lib/googleCalendar')
        for (const a of afectadas) {
          const partida = todas.find(x => x.id === a.id)
          if (!partida?.fecha_inicio) continue
          const { data: gcalRow } = await supabaseAdmin
            .from('partidas_gcal')
            .select('google_event_id')
            .eq('partida_id', a.id)
            .single()
          const title = `${partida.nombre} — ${proyNombre}`
          const startDT = a.updates.fecha_inicio || partida.fecha_inicio
          const endDT   = a.updates.fecha_fin_estimada || partida.fecha_fin_estimada || startDT
          if (gcalRow?.google_event_id) {
            await gcalUpd(gcalToken, gcalRow.google_event_id, { title, startDateTime: startDT, endDateTime: endDT, allDay: true })
          } else if (startDT) {
            const created = await gcalCre(gcalToken, { title, startDateTime: startDT, endDateTime: endDT, allDay: true })
            if (created) {
              await supabaseAdmin.from('partidas_gcal').upsert({ partida_id: a.id, google_event_id: created.id }, { onConflict: 'partida_id' })
            }
          }
        }
      }

      const nombres = afectadas.map(a => a.nombre).join(', ')
      const accion = dias > 0 ? `retrasada ${Math.abs(dias)} días` : `adelantada ${Math.abs(dias)} días`
      const gcalMsg = gcalToken ? ' Eventos del calendario actualizados.' : ''
      return {
        result: `"${raiz.nombre}" ${accion}. En cascada se desplazaron ${afectadas.length} partida${afectadas.length !== 1 ? 's' : ''}: ${nombres}.${gcalMsg}`,
        table: 'partidas_reforma',
      }
    }
    if (name === 'delete_proyecto') {
      // Delete related records in order to avoid FK violations
      const pid = input.id
      // items_partida cascade-deletes when partidas_reforma is deleted
      const { data: partidas } = await supabaseAdmin.from('partidas_reforma').select('id').eq('proyecto_id', pid)
      if (partidas?.length) {
        const pids = partidas.map((p: any) => p.id)
        await supabaseAdmin.from('items_partida').delete().in('partida_id', pids)
        await supabaseAdmin.from('partidas_gcal').delete().in('partida_id', pids)
        await supabaseAdmin.from('partidas_reforma').delete().eq('proyecto_id', pid)
      }
      await supabaseAdmin.from('movimientos').delete().eq('proyecto_id', pid)
      await supabaseAdmin.from('tareas').delete().eq('proyecto_id', pid)
      await supabaseAdmin.from('bitacora').delete().eq('proyecto_id', pid)
      await supabaseAdmin.from('documentos').delete().eq('proyecto_id', pid)
      await supabaseAdmin.from('proyecto_inversores').delete().eq('proyecto_id', pid)
      // Delete prospectos and their interactions
      const { data: prospectosDel } = await supabaseAdmin.from('prospectos').select('id').eq('proyecto_id', pid)
      if (prospectosDel?.length) {
        const prospIds = prospectosDel.map((p: any) => p.id)
        await supabaseAdmin.from('interacciones_prospecto').delete().in('prospecto_id', prospIds)
      }
      await supabaseAdmin.from('prospectos').delete().eq('proyecto_id', pid)
      const { error } = await supabaseAdmin.from('proyectos').delete().eq('id', pid)
      if (error) return { result: `Error al eliminar proyecto: ${error.message}` }
      return { result: `Proyecto eliminado: "${input.nombre || input.id}".` }
    }
    if (name === 'convertir_estudio_a_proyecto') {
      // Buscar en inmuebles_estudio por dirección o nombre
      const { data: estudios, error: busqErr } = await supabaseAdmin
        .from('inmuebles_estudio')
        .select('*')
        .or(`direccion.ilike.%${input.busqueda}%,nombre.ilike.%${input.busqueda}%`)
        .neq('estado', 'comprado')
        .order('created_at', { ascending: false })
        .limit(1)
      if (busqErr) return { result: `Error al buscar: ${busqErr.message}` }
      if (!estudios || estudios.length === 0) {
        return { result: `No encontré ningún inmueble en estudio que coincida con "${input.busqueda}". Verificá el nombre o dirección.` }
      }
      const estudio = estudios[0]
      const hoy = new Date().toISOString().split('T')[0]
      const { data: proyecto, error: proyErr } = await supabaseAdmin.from('proyectos').insert([{
        nombre: estudio.nombre || estudio.direccion,
        direccion: estudio.direccion || null,
        ciudad: estudio.ciudad || null,
        tipo: 'piso',
        estado: 'comprado',
        precio_compra: input.precio_compra || estudio.precio_compra || null,
        precio_venta_estimado: estudio.precio_venta_objetivo || null,
        porcentaje_hasu: 100,
        fecha_compra: input.fecha_compra || hoy,
        notas: input.notas || null,
      }]).select().single()
      if (proyErr) return { result: `Error al crear proyecto: ${proyErr.message}` }
      // Template partidas
      const { data: partidasInsertadas } = await supabaseAdmin.from('partidas_reforma')
        .insert(PARTIDAS_PLANTILLA.map((p: any) => ({
          proyecto_id: proyecto.id,
          nombre: p.nombre,
          categoria: p.categoria,
          orden: p.orden,
          presupuesto: 0,
          ejecutado: 0,
          estado: 'pendiente',
        }))).select('id, nombre')
      if (partidasInsertadas) {
        const itemsRows: any[] = []
        for (const partida of partidasInsertadas) {
          const template = PARTIDAS_PLANTILLA.find((p: any) => p.nombre === partida.nombre)
          if ((template as any)?.items) {
            for (const item of (template as any).items) {
              itemsRows.push({ partida_id: partida.id, nombre: item.nombre, orden: item.orden })
            }
          }
        }
        if (itemsRows.length > 0) await supabaseAdmin.from('items_partida').insert(itemsRows)
      }
      // Marcar estudio como comprado
      await supabaseAdmin.from('inmuebles_estudio').update({ estado: 'comprado' }).eq('id', estudio.id)
      return {
        result: `Proyecto creado desde "${estudio.direccion || estudio.nombre}". Nombre: "${proyecto.nombre}", Estado: Comprado, Precio: ${proyecto.precio_compra || 'sin especificar'}€. Se cargaron las partidas de reforma por defecto.`,
        table: 'proyectos',
        recordId: proyecto.id,
        label: proyecto.nombre,
      }
    }
    if (name === 'insert_proyecto') {
      const { data, error } = await supabaseAdmin.from('proyectos').insert([{
        nombre: input.nombre,
        direccion: input.direccion || null,
        ciudad: input.ciudad || null,
        provincia: input.provincia || null,
        tipo: input.tipo || 'piso',
        estado: input.estado || 'captado',
        precio_compra: input.precio_compra || null,
        precio_venta_conservador: input.precio_venta_conservador || null,
        precio_venta_realista: input.precio_venta_realista || null,
        precio_venta_optimista: input.precio_venta_optimista || null,
        precio_venta_estimado: input.precio_venta_estimado || null,
        valor_total_operacion: input.valor_total_operacion || null,
        superficie: input.superficie || null,
        habitaciones: input.habitaciones || null,
        banos: input.banos || null,
        porcentaje_hasu: input.porcentaje_hasu ?? 100,
        socio_nombre: input.socio_nombre || null,
        inversion_hasu: input.inversion_hasu || null,
        fecha_compra: input.fecha_compra || null,
        fecha_salida_estimada: input.fecha_salida_estimada || null,
        notas: input.notas || null,
      }]).select().single()
      if (error) return { result: `Error al crear proyecto: ${error.message}` }
      // Auto-insert 21 default partidas + items template
      const { data: partidasInsertadas } = await supabaseAdmin
        .from('partidas_reforma')
        .insert(PARTIDAS_PLANTILLA.map(p => ({
          proyecto_id: data.id,
          nombre: p.nombre,
          categoria: p.categoria,
          orden: p.orden,
          presupuesto: 0,
          ejecutado: 0,
          estado: 'pendiente',
        })))
        .select('id, nombre')
      // Insert items for each partida
      if (partidasInsertadas) {
        const itemsRows: any[] = []
        for (const partida of partidasInsertadas) {
          const template = PARTIDAS_PLANTILLA.find(p => p.nombre === partida.nombre)
          if (template?.items) {
            for (const item of template.items) {
              itemsRows.push({ partida_id: partida.id, nombre: item.nombre, orden: item.orden })
            }
          }
        }
        if (itemsRows.length > 0) {
          await supabaseAdmin.from('items_partida').insert(itemsRows)
        }
      }
      const totalItems = PARTIDAS_PLANTILLA.reduce((s, p) => s + p.items.length, 0)
      return {
        result: `Proyecto creado. ID: ${data.id}. Nombre: "${data.nombre}", Estado: ${data.estado}, Ciudad: ${data.ciudad || 'sin especificar'}. Se cargaron 21 partidas con ${totalItems} ítems por defecto.`,
        table: 'proyectos',
        recordId: data.id,
        label: data.nombre,
      }
    }
    if (name === 'insert_prospecto') {
      const { data, error } = await supabaseAdmin.from('prospectos').insert([{
        proyecto_id: input.proyecto_id,
        nombre: input.nombre,
        telefono: input.telefono || null,
        email: input.email || null,
        estado: input.estado || 'Contactado',
        mejor_oferta: input.mejor_oferta || null,
        proxima_visita: input.proxima_visita || null,
        notas: input.notas || null,
      }]).select().single()
      if (error) return { result: `Error al guardar prospecto: ${error.message}` }
      return {
        result: `Prospecto creado. ID: ${data.id}. Nombre: "${data.nombre}", Estado: ${data.estado}${data.telefono ? ', Tel: '+data.telefono : ''}.`,
        table: 'prospectos',
        recordId: data.id,
        label: `${data.nombre} · ${data.estado}`,
      }
    }
    if (name === 'update_prospecto') {
      const fields = ['nombre','telefono','email','estado','mejor_oferta','proxima_visita','notas']
      const updates: Record<string,any> = { updated_at: new Date().toISOString() }
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('prospectos').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al actualizar prospecto: ${error.message}` }
      const ofertaMsg = data.mejor_oferta ? `, Oferta: ${data.mejor_oferta}€` : ''
      return {
        result: `Prospecto actualizado. Nombre: "${data.nombre}", Estado: ${data.estado}${ofertaMsg}.`,
        table: 'prospectos',
        recordId: data.id,
        label: `${data.nombre} · ${data.estado}`,
      }
    }
    if (name === 'delete_prospecto') {
      const { error } = await supabaseAdmin.from('prospectos').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar prospecto: ${error.message}` }
      return { result: `Prospecto eliminado: "${input.nombre || input.id}".` }
    }
    if (name === 'insert_interaccion_prospecto') {
      const hoy = new Date().toISOString().split('T')[0]
      const { data, error } = await supabaseAdmin.from('interacciones_prospecto').insert([{
        prospecto_id: input.prospecto_id,
        tipo: input.tipo || 'nota',
        fecha: input.fecha || hoy,
        nota: input.nota,
      }]).select().single()
      if (error) return { result: `Error al registrar interacción: ${error.message}` }
      return {
        result: `Interacción registrada. Tipo: ${data.tipo}, Fecha: ${data.fecha}. Nota: "${data.nota}".`,
        table: 'interacciones_prospecto',
        recordId: data.id,
        label: `${data.tipo} · ${data.fecha}`,
      }
    }
    if (name === 'update_proyecto') {
      const fields = [
        'nombre','estado','avance_reforma',
        'precio_venta_conservador','precio_venta_realista','precio_venta_optimista','precio_venta_estimado',
        'precio_compra','valor_total_operacion','inversion_hasu','porcentaje_hasu',
        'fecha_compra','fecha_salida_estimada','notas',
      ]
      const updates: Record<string,any> = {}
      for (const f of fields) {
        if (input[f] !== undefined) updates[f] = input[f]
      }
      const { data, error } = await supabaseAdmin.from('proyectos').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al actualizar proyecto: ${error.message}` }
      const cambios = Object.keys(updates).join(', ')
      return {
        result: `Proyecto actualizado. Nombre: "${data.nombre}". Campos actualizados: ${cambios}.`,
        table: 'proyectos',
        recordId: data.id,
        label: data.nombre,
      }
    }
    return { result: 'Herramienta no reconocida.' }
  } catch (e: any) {
    return { result: `Error interno: ${e.message}` }
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ text: 'No autorizado.' }, { status: 401 })

  try {
    const { messages, context } = await req.json()
    const today = new Date().toISOString().split('T')[0]

    const systemPrompt = `Sos el asistente de Wallest, una empresa inmobiliaria española (Hasu Activos Inmobiliarios SL).
Respondés en español, de forma directa y concisa. Sos experto en inversión inmobiliaria, reformas y gestión de proyectos.
El CEO es Patricio Favora. El objetivo es llegar a 1M€ en cuenta HASU para diciembre 2027.
Hoy es ${today}.

Contexto actual del sistema:
${context || 'Sin datos disponibles.'}

CAPACIDADES — podés CREAR, EDITAR y ELIMINAR:
- proyectos, cuentas bancarias, movimientos, tareas, partidas de reforma, radar, bitácora, proveedores
- timeline de reforma (recalcular_timeline) — desplaza en cascada N días
- Google Calendar — crear (agendar_evento), listar (listar_eventos), editar (editar_evento), eliminar (eliminar_evento). Interpretá fechas relativas: "mañana" = ${new Date(Date.now()+86400000).toISOString().split('T')[0]}, "el lunes" = próximo lunes, etc.
- TRAZABILIDAD DE ACTIVOS: cuando el usuario diga que un inmueble "está comprado", "se compró" o quiera "pasarlo a proyectos", usá convertir_estudio_a_proyecto para buscarlo en En Estudio y crear el proyecto automáticamente. Para finalizar un proyecto usá update_proyecto con estado="cerrado" — aparecerá en HASU como operación finalizada.
- COMERCIALIZACIÓN: prospectos por proyecto con estados (Contactado → Visita programada → Visita realizada → Oferta recibida → En negociación → Descartado) y log de interacciones (llamada, visita, mensaje, email, nota). Comandos: "Agrega prospecto [nombre], tel [X]", "[nombre] hizo oferta de [X]€", "Descarta a [nombre]", "¿Cuántos prospectos activos tiene [proyecto]?". Para registrar interacciones usá insert_interaccion_prospecto (necesitás el prospecto_id del contexto).

REGLAS DE RESPUESTA — MUY IMPORTANTE:
1. NUNCA muestres IDs, UUIDs ni códigos al usuario. Son internos. Usalos solo para llamar herramientas.
2. NUNCA uses tablas markdown con columnas de IDs. Listá con bullet points e iconos.
3. SIEMPRE que el usuario pregunte por tareas (pendientes, en curso, etc.) sin estar en contexto de un proyecto específico, ANTES de listar nada preguntá: "¿Te referís a las tareas de un proyecto en particular o las generales?" — NO listés tareas sin hacer esta pregunta primero.
4. Respuestas cortas y limpias. Solo la info que el usuario necesita ver. Sin columnas técnicas.
5. Para editar o eliminar, buscá el ID en el contexto sin mostrárselo al usuario.

Formato de listas:
✅ Tarea completada · detalle
📋 Tarea pendiente · prioridad
🔨 Partida · estado

Respondé siempre en español. Máximo 3 párrafos.`

    // Initial call — only keep messages with plain string content
    const cleanMessages = (messages as { role: string; content: any }[])
      .filter(m => typeof m.content === 'string' && m.content.trim() !== '')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: cleanMessages
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
        ...cleanMessages,
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
    const msg = err?.message || err?.toString() || 'Error desconocido'
    return NextResponse.json({ text: `Error técnico: ${msg}` }, { status: 500 })
  }
}
