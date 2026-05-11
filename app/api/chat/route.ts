import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { PARTIDAS_PLANTILLA } from '@/lib/reforma-template'
import { getOrgAccessToken } from '@/lib/gcalToken'
import { gcalCreateEvent } from '@/lib/googleCalendar'
import { verifyAuth } from '@/lib/api-auth'
import { scrapeIdealista } from '@/lib/scrape-idealista'
import { calcEscenarios, calcCostoTotal, calcGastosFijos } from '@/lib/formulas'
import { buscarComparables } from '@/lib/search-comparables'
import { checkAndSendMentions } from '@/lib/notifications'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'insert_documento',
    description: 'Guarda en la base de datos el análisis de una imagen enviada por el usuario (factura, presupuesto, foto de inmueble o documento). Llamarlo SIEMPRE después de analizar una imagen adjunta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre descriptivo. Ej: "Factura Fontanería 2024-05-04"' },
        tipo: { type: 'string', enum: ['factura', 'presupuesto', 'foto_inmueble', 'documento'], description: 'Tipo de documento detectado' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto al que asociar. Omitir si no hay proyecto en contexto.' },
        descripcion_ia: { type: 'string', description: 'Descripción completa del análisis: contenido de la imagen y datos clave extraídos.' },
        datos_ia: {
          type: 'object' as const,
          description: 'Datos estructurados: para factura/presupuesto incluye proveedor, importe, fecha, concepto; para foto_inmueble incluye estado, superficie_estimada, observaciones; para documento incluye partes, fechas, condiciones.',
          properties: {},
          additionalProperties: true,
        },
      },
      required: ['nombre', 'tipo', 'descripcion_ia'],
    },
  },
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
        proyecto_id: { type: 'string', description: 'UUID del proyecto al que reasignar el movimiento. Usar null para desvincularlo.' },
        cuenta: { type: 'string', description: 'Nueva cuenta bancaria' },
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
        titulo: { type: 'string', description: 'Título o nombre corto del inmueble (ej: "Piso Rulador", "Oportunidad Vera")' },
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
    description: 'Edita un inmueble del radar. Si tenés el ID del contexto usalo directamente; si no, pasá busqueda con la dirección parcial y el sistema la resuelve.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del inmueble (del contexto). Opcional si se usa busqueda.' },
        busqueda: { type: 'string', description: 'Dirección parcial para encontrar el inmueble cuando no tenés el ID. Ej: "Rulador 30"' },
        titulo: { type: 'string', description: 'Título o nombre corto del inmueble' },
        direccion: { type: 'string' }, ciudad: { type: 'string' },
        precio: { type: 'number' }, habitaciones: { type: 'number' }, superficie: { type: 'number' },
        url: { type: 'string' }, fuente: { type: 'string' }, notas: { type: 'string' },
        estado: { type: 'string', enum: ['activo', 'descartado', 'convertido'] },
      },
      required: [],
    },
  },
  {
    name: 'delete_radar',
    description: 'Elimina un inmueble del radar. Si tenés el ID del contexto usalo directamente; si no, pasá busqueda con la dirección parcial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del inmueble (del contexto). Opcional si se usa busqueda.' },
        busqueda: { type: 'string', description: 'Dirección parcial para encontrar el inmueble cuando no tenés el ID.' },
        direccion: { type: 'string', description: 'Dirección (para confirmar)' },
      },
      required: [],
    },
  },
  {
    name: 'delete_estudio',
    description: 'Elimina un inmueble en estado En Estudio. Si tenés el ID del contexto usalo directamente; si no, pasá busqueda con la dirección parcial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del inmueble en estudio (del contexto). Opcional si se usa busqueda.' },
        busqueda: { type: 'string', description: 'Dirección o nombre parcial para encontrar el inmueble cuando no tenés el ID.' },
      },
      required: [],
    },
  },
  {
    name: 'update_estudio',
    description: 'Edita datos de un inmueble En Estudio: estado, precios de venta por escenario, ROI, notas, superficie, etc. Si tenés el ID usalo; si no, pasá busqueda.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID del inmueble en estudio (del contexto). Opcional si se usa busqueda.' },
        busqueda: { type: 'string', description: 'Dirección o nombre parcial para encontrar el inmueble. Ej: "Rulador 30"' },
        estado: { type: 'string', enum: ['en_estudio', 'ofertado', 'en_arras', 'descartado'], description: 'Nuevo estado' },
        titulo: { type: 'string', description: 'Título o nombre corto del inmueble' },
        notas: { type: 'string' },
        nombre: { type: 'string', description: 'Nuevo nombre o alias del inmueble' },
        precio_compra: { type: 'number', description: 'Precio de compra estimado en euros' },
        precio_venta_conservador: { type: 'number', description: 'Precio de venta escenario conservador en euros' },
        precio_venta_realista:    { type: 'number', description: 'Precio de venta escenario realista en euros' },
        precio_venta_optimista:   { type: 'number', description: 'Precio de venta escenario optimista en euros' },
        roi_estimado: { type: 'number', description: 'ROI estimado en porcentaje (ej: 32.5)' },
        ciudad: { type: 'string', description: 'Ciudad o municipio' },
        superficie: { type: 'number', description: 'Superficie en m²' },
        habitaciones: { type: 'number', description: 'Número de habitaciones' },
      },
      required: [],
    },
  },
  {
    name: 'insert_estudio',
    description: 'Agrega un inmueble directamente a En Estudio sin pasar por el Radar. Usalo cuando el usuario quiera analizar un inmueble nuevo directamente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string', description: 'Título o nombre corto del inmueble (ej: "Piso Vera", "Oportunidad Zurgena")' },
        nombre: { type: 'string', description: 'Nombre o alias del inmueble' },
        direccion: { type: 'string', description: 'Dirección completa' },
        ciudad: { type: 'string', description: 'Ciudad o municipio' },
        precio_compra: { type: 'number', description: 'Precio de compra estimado en euros' },
        precio_venta_conservador: { type: 'number', description: 'Precio de venta escenario conservador en euros' },
        precio_venta_realista:    { type: 'number', description: 'Precio de venta escenario realista en euros' },
        precio_venta_optimista:   { type: 'number', description: 'Precio de venta escenario optimista en euros' },
        roi_estimado: { type: 'number', description: 'ROI estimado en % (opcional, default 0)' },
        superficie: { type: 'number', description: 'Superficie en m²' },
        habitaciones: { type: 'number', description: 'Número de habitaciones' },
        duracion_meses: { type: 'number', description: 'Duración estimada de la operación en meses' },
        notas: { type: 'string', description: 'Notas u observaciones' },
      },
      required: ['direccion'],
    },
  },
  {
    name: 'insert_inversor',
    description: 'Registra un nuevo inversor/socio JV y lo vincula a un proyecto. Usalo cuando el usuario indique un nuevo socio o coinversor para una operación.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre completo del inversor' },
        email: { type: 'string', description: 'Email del inversor' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto al que se vincula' },
        porcentaje: { type: 'number', description: 'Porcentaje de participación del inversor (ej: 50)' },
      },
      required: ['nombre', 'proyecto_id', 'porcentaje'],
    },
  },
  {
    name: 'update_inversor',
    description: 'Edita datos de un inversor o cambia su porcentaje en un proyecto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        inversor_id: { type: 'string', description: 'UUID del inversor' },
        nombre: { type: 'string', description: 'Nuevo nombre' },
        email: { type: 'string', description: 'Nuevo email' },
        proyecto_id: { type: 'string', description: 'UUID del proyecto para actualizar el porcentaje' },
        porcentaje: { type: 'number', description: 'Nuevo porcentaje de participación' },
      },
      required: ['inversor_id'],
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
    name: 'insert_agenda_tarea',
    description: 'Crea una tarea de agenda personal o de trabajo (sección Calendario → Tareas). Usalo cuando el usuario pida agregar una tarea Personal o de Trabajo que NO está ligada a un proyecto. Ejemplos: "nueva tarea personal: llamar gestoría", "agrega tarea de trabajo: revisar contrato".',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo:    { type: 'string', description: 'Título de la tarea' },
        categoria: { type: 'string', enum: ['personal', 'trabajo'], description: '"personal" o "trabajo"' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'update_agenda_tarea',
    description: 'Actualiza el estado de una tarea de agenda (Personal/Trabajo). Usalo para marcar como hecho, en proceso o pendiente. Si no tenés el ID, usá listar_agenda_tareas primero.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:     { type: 'string', description: 'UUID de la tarea en agenda_tasks' },
        titulo: { type: 'string', description: 'Título actual (para confirmar al usuario)' },
        estado: { type: 'string', enum: ['pendiente', 'en_proceso', 'hecho'], description: 'Nuevo estado' },
      },
      required: ['id', 'estado'],
    },
  },
  {
    name: 'delete_agenda_tarea',
    description: 'Elimina una tarea de agenda (Personal/Trabajo). Si no tenés el ID, usá listar_agenda_tareas primero.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:     { type: 'string', description: 'UUID de la tarea' },
        titulo: { type: 'string', description: 'Título (para confirmar)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'listar_agenda_tareas',
    description: 'Lista las tareas de agenda Personal/Trabajo. Usalo cuando el usuario pregunte por sus tareas generales (no de un proyecto). Filtrá por categoría si se especifica.',
    input_schema: {
      type: 'object' as const,
      properties: {
        categoria:      { type: 'string', enum: ['personal', 'trabajo'], description: 'Filtrar por categoría (opcional)' },
        incluir_hechas: { type: 'boolean', description: 'true para incluir tareas ya completadas (default false)' },
      },
      required: [],
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
    name: 'mover_radar_a_estudio',
    description: 'Mueve uno o varios inmuebles del Radar a En Estudio. Usalo cuando el usuario diga "pasá X a En Estudio", "mover X a En Estudio", "analizar X". Si el usuario dice "ambos", "los dos", "todos" o "todos los que coincidan" → ponés todos=true y movés TODOS los que coincidan con la búsqueda SIN preguntar más.',
    input_schema: {
      type: 'object' as const,
      properties: {
        busqueda: { type: 'string', description: 'Dirección o nombre parcial del inmueble en radar. Ej: "Rulador 30"' },
        todos: { type: 'boolean', description: 'Si es true, mueve TODOS los inmuebles que coincidan con la búsqueda. Usar cuando el usuario diga "ambos", "los dos", "todos", "en el orden que están", etc.' },
        precio_compra: { type: 'number', description: 'Precio de compra (usa el del radar si no se indica)' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' },
      },
      required: ['busqueda'],
    },
  },
  {
    name: 'insert_bitacora_estudio',
    description: 'Agrega una entrada a la bitácora de uno o varios inmuebles En Estudio. Si el usuario dice "ambos", "los dos", "todos" → todos=true para agregar a TODOS los que coincidan sin preguntar más.',
    input_schema: {
      type: 'object' as const,
      properties: {
        busqueda: { type: 'string', description: 'Dirección, nombre o texto para buscar el inmueble en estudio. Ej: "Rulador 30"' },
        todos: { type: 'boolean', description: 'Si es true, agrega la entrada a TODOS los inmuebles que coincidan. Usar cuando el usuario diga "ambos", "los dos", "todos", etc.' },
        contenido: { type: 'string', description: 'Texto de la entrada' },
        tipo: { type: 'string', enum: ['nota', 'llamada', 'email', 'visita', 'documento', 'api'], description: 'Tipo de entrada. Default: nota.' },
        url: { type: 'string', description: 'URL o link externo si aplica' },
        autor: { type: 'string', description: 'Autor de la entrada. Default: Patricio' },
      },
      required: ['busqueda', 'contenido'],
    },
  },
  {
    name: 'update_bitacora_estudio',
    description: 'Edita una entrada de bitácora de un inmueble En Estudio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID de la entrada' },
        contenido: { type: 'string' },
        tipo: { type: 'string', enum: ['nota', 'llamada', 'email', 'visita', 'documento', 'api'] },
        url: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_bitacora_estudio',
    description: 'Elimina una entrada de bitácora de un inmueble En Estudio.',
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
    name: 'agendar_visita_radar',
    description: 'Agenda una visita a un inmueble del Radar y crea un evento en Google Calendar. Usalo cuando el usuario diga "agenda visita a X el Y a las Z, responsable N".',
    input_schema: {
      type: 'object' as const,
      properties: {
        busqueda: { type: 'string', description: 'Dirección parcial del inmueble en radar. Ej: "Rulador 30"' },
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Interpretá fechas relativas.' },
        hora: { type: 'string', description: 'Hora en formato HH:MM. Ej: "11:00"' },
        responsable: { type: 'string', description: 'Nombre de la persona que va a la visita. Ej: "Patricio"' },
        notas_previas: { type: 'string', description: 'Notas previas a la visita (opcional)' },
      },
      required: ['busqueda', 'fecha', 'hora', 'responsable'],
    },
  },
  {
    name: 'listar_visitas_radar',
    description: 'Lista visitas agendadas. Usalo cuando el usuario pregunte "qué visitas hay", "visitas de esta semana", "visitas a X inmueble".',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha_desde: { type: 'string', description: 'Fecha inicio del rango YYYY-MM-DD (opcional, default hoy)' },
        fecha_hasta: { type: 'string', description: 'Fecha fin del rango YYYY-MM-DD (opcional)' },
        busqueda: { type: 'string', description: 'Filtrar por dirección del inmueble (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'registrar_resultado_visita',
    description: 'Registra el resultado de una visita realizada (post-visita). Usalo cuando el usuario diga "registra visita a X: [descripción], [estado]". Estados: descartado, sigue_en_radar, pasa_a_estudio.',
    input_schema: {
      type: 'object' as const,
      properties: {
        busqueda: { type: 'string', description: 'Dirección parcial del inmueble en radar para encontrar la visita pendiente' },
        estado_post: { type: 'string', enum: ['descartado', 'sigue_en_radar', 'pasa_a_estudio'], description: 'Resultado de la visita' },
        notas_post: { type: 'string', description: 'Notas de la visita realizada' },
        fotos_url: { type: 'string', description: 'Link a fotos en Drive (opcional)' },
      },
      required: ['busqueda', 'estado_post'],
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
    description: 'Crea un evento en Google Calendar de hola@hasu.in. Usalo cuando el usuario pida agendar, programar, crear una reunión o evento. Interpretá fechas relativas como "mañana", "el lunes", "el 15 de mayo". Si el usuario menciona invitados (Silvia, JL, o cualquier email), pasalos en el campo invitados.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo:       { type: 'string',  description: 'Título del evento. Ej: "Reunión con José Luis"' },
        fecha:        { type: 'string',  description: 'Fecha en formato YYYY-MM-DD' },
        hora_inicio:  { type: 'string',  description: 'Hora de inicio HH:MM (ej: "09:00"). Omitir si es todo el día.' },
        hora_fin:     { type: 'string',  description: 'Hora de fin HH:MM (ej: "10:00"). Omitir si es todo el día.' },
        todo_el_dia:  { type: 'boolean', description: 'true si es evento de todo el día sin hora específica.' },
        descripcion:  { type: 'string',  description: 'Descripción opcional del evento.' },
        invitados: {
          type: 'array',
          items: { type: 'string' },
          description: 'Emails o nombres de personas a invitar. Nombres conocidos del equipo: "Silvia" → silviainformes@gmail.com, "JL" o "José Luis" → joseluisxp123@gmail.com. También podés pasar emails directamente.',
        },
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
        estado: { type: 'string', enum: ['captado', 'analisis', 'ofertado', 'comprado', 'reforma', 'venta', 'reservado', 'con_oferta', 'en_arras', 'vendido'], description: 'Estado actual en el pipeline. Venta: venta→reservado→con_oferta→en_arras→vendido' },
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
    name: 'analizar_inversion',
    description: 'Analiza si una operación inmobiliaria es viable. Busca comparables en web para validar el precio de venta, calcula el precio máximo de compra y el ROI para 3 escenarios (Conservador 30%, Realista 50%, Optimista 70%). Usalo cuando el usuario pida analizar una inversión, calcular ROI, o saber cuánto puede pagar por un inmueble.',
    input_schema: {
      type: 'object' as const,
      properties: {
        zona: { type: 'string', description: 'Ciudad o zona del inmueble. Ej: "Zurgena, Almería"' },
        superficie: { type: 'number', description: 'Superficie en m²' },
        habitaciones: { type: 'number', description: 'Número de habitaciones (opcional)' },
        precio_ofertado: { type: 'number', description: 'Precio al que está ofertado / precio pedido por el vendedor en euros' },
        coste_reforma: { type: 'number', description: 'Coste estimado de reforma en euros' },
        precio_venta_orientativo: { type: 'number', description: 'Precio de venta objetivo estimado por el usuario (opcional). Si no se indica, se busca via web.' },
        tipo: { type: 'string', enum: ['HASU', 'JV'], description: 'Tipo de operación: HASU (100% propio) o JV (joint venture con socio)' },
        porcentaje_hasu: { type: 'number', description: 'Porcentaje de HASU en la operación (0-100). Default 100 para HASU, el acordado para JV.' },
        socio: { type: 'string', description: 'Nombre del socio JV si aplica' },
      },
      required: ['zona', 'superficie', 'precio_ofertado', 'coste_reforma'],
    },
  },
  {
    name: 'listar_movimientos_proyecto',
    description: 'Trae todos los movimientos de un proyecto específico. Usalo SOLO cuando el usuario pida detalle de gastos, desglose de costos, o análisis de movimientos de un proyecto concreto. NO usarlo para responder preguntas de resultado general — eso está en el contexto de proyectos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_id: { type: 'string', description: 'UUID del proyecto' },
        categoria: { type: 'string', description: 'Filtrar por categoría (opcional). Ej: Reforma, Materiales, Mano de obra' },
      },
      required: ['proyecto_id'],
    },
  },
  {
    name: 'listar_partidas_proyecto',
    description: 'Trae las partidas de reforma de uno o varios proyectos. Usalo cuando el usuario pida comparar partidas entre proyectos (ej: "compara la cocina de los últimos 3 proyectos") o ver el detalle de partidas de un proyecto. Pasá un array de proyecto_ids para comparación.',
    input_schema: {
      type: 'object' as const,
      properties: {
        proyecto_ids: { type: 'array', items: { type: 'string' }, description: 'Array de UUIDs de proyectos a consultar' },
        nombre_partida: { type: 'string', description: 'Filtrar por nombre de partida (opcional). Ej: "cocina", "baño", "pintura". Búsqueda parcial.' },
      },
      required: ['proyecto_ids'],
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

async function resolveInmueble(table: 'inmuebles_radar' | 'inmuebles_estudio', busqueda?: string, id?: string): Promise<{ resolved: { id: string; direccion: string; [k: string]: any } } | { error: string }> {
  if (id) {
    const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).single()
    if (error || !data) return { error: `No encontré el inmueble con ID ${id}.` }
    return { resolved: data }
  }
  if (!busqueda) return { error: 'Necesitás indicar el inmueble por ID o dirección.' }

  // inmuebles_radar no tiene columna 'nombre' — solo buscar por direccion
  // inmuebles_estudio tiene ambas columnas
  let query = supabaseAdmin.from(table).select('*')
  if (table === 'inmuebles_estudio') {
    query = (query as any).or(`direccion.ilike.%${busqueda}%,nombre.ilike.%${busqueda}%,titulo.ilike.%${busqueda}%,ciudad.ilike.%${busqueda}%`)
  } else {
    query = (query as any).ilike('direccion', `%${busqueda}%`)
  }

  const { data, error } = await query
  if (error) return { error: `Error al buscar en ${table}: ${error.message}` }
  if (!data || data.length === 0) return { error: `No encontré ningún inmueble que coincida con "${busqueda}". Verificá la dirección exacta.` }
  if (data.length > 1) {
    const lista = data.map((r: any) => {
      const precio = r.precio || r.precio_compra
      return `· ${r.nombre || r.direccion}${r.ciudad ? ', ' + r.ciudad : ''}${precio ? ' — ' + precio + '€' : ''}`
    }).join('\n')
    return { error: `Encontré ${data.length} inmuebles que coinciden con "${busqueda}":\n${lista}\n\n¿Cuál querés? Indicá ciudad o precio para ser más específico.` }
  }
  return { resolved: data[0] }
}

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
      if (input.proyecto_id !== undefined) updates.proyecto_id = input.proyecto_id || null
      if (input.cuenta !== undefined) updates.cuenta = input.cuenta
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
        titulo: input.titulo || null,
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

      // @menciones — notificación in-app + email
      const { data: proy } = await supabaseAdmin.from('proyectos').select('nombre').eq('id', input.proyecto_id).single()
      await checkAndSendMentions(input.contenido, {
        autor:    input.autor || 'Patricio',
        proyecto: proy?.nombre || 'un proyecto',
        contenido: input.contenido,
        tipo:     input.tipo || 'nota',
      })

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
      const resolved = await resolveInmueble('inmuebles_radar', input.busqueda, input.id)
      if ('error' in resolved) return { result: resolved.error }
      const fields = ['titulo','direccion','ciudad','precio','habitaciones','superficie','url','fuente','notas','estado']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('inmuebles_radar').update(updates).eq('id', resolved.resolved.id).select().single()
      if (error) return { result: `Error al editar inmueble: ${error.message}` }
      return { result: `Inmueble actualizado. Dirección: "${data.direccion}", Precio: ${data.precio}€.`, table: 'inmuebles_radar', recordId: data.id, label: `${data.direccion} · ${data.precio}€` }
    }
    if (name === 'delete_radar') {
      const resolved = await resolveInmueble('inmuebles_radar', input.busqueda, input.id)
      if ('error' in resolved) return { result: resolved.error }
      const { error } = await supabaseAdmin.from('inmuebles_radar').delete().eq('id', resolved.resolved.id)
      if (error) return { result: `Error al eliminar: ${error.message}` }
      return { result: `Inmueble eliminado del radar. Dirección: "${resolved.resolved.direccion}".` }
    }
    if (name === 'delete_estudio') {
      const resolved = await resolveInmueble('inmuebles_estudio', input.busqueda, input.id)
      if ('error' in resolved) return { result: resolved.error }
      const nombreElim = resolved.resolved.nombre || resolved.resolved.direccion
      const { error } = await supabaseAdmin.from('inmuebles_estudio').delete().eq('id', resolved.resolved.id)
      if (error) return { result: `Error al eliminar: ${error.message}` }
      return { result: `Inmueble eliminado de En Estudio: "${nombreElim}".` }
    }
    if (name === 'update_estudio') {
      const resolved = await resolveInmueble('inmuebles_estudio', input.busqueda, input.id)
      if ('error' in resolved) return { result: resolved.error }
      const fields = ['titulo', 'estado', 'notas', 'nombre', 'precio_compra', 'precio_venta_conservador', 'precio_venta_realista', 'precio_venta_optimista', 'roi_estimado', 'ciudad', 'superficie', 'habitaciones', 'duracion_meses']
      const updates: Record<string,any> = {}
      for (const f of fields) if (input[f] !== undefined) updates[f] = input[f]
      const { data, error } = await supabaseAdmin.from('inmuebles_estudio').update(updates).eq('id', resolved.resolved.id).select().single()
      if (error) return { result: `Error al actualizar: ${error.message}` }
      const nombre = data.nombre || data.direccion
      const cambios = Object.keys(updates).join(', ')
      return { result: `Inmueble "${nombre}" actualizado. Campos: ${cambios}.`, table: 'inmuebles_estudio', recordId: data.id, label: `${nombre} · ${data.estado}` }
    }
    if (name === 'insert_estudio') {
      const hoy = new Date().toISOString().split('T')[0]
      const { data, error } = await supabaseAdmin.from('inmuebles_estudio').insert([{
        titulo: input.titulo || null,
        nombre: input.nombre || input.direccion,
        direccion: input.direccion,
        ciudad: input.ciudad || null,
        precio_compra: input.precio_compra || null,
        precio_venta_conservador: input.precio_venta_conservador || null,
        precio_venta_realista:    input.precio_venta_realista    || null,
        precio_venta_optimista:   input.precio_venta_optimista   || null,
        roi_estimado: input.roi_estimado || 0,
        superficie: input.superficie || null,
        habitaciones: input.habitaciones || null,
        duracion_meses: input.duracion_meses || null,
        notas: input.notas || null,
        estado: 'en_estudio',
        analizado_en: hoy,
      }]).select().single()
      if (error) return { result: `Error al crear inmueble en estudio: ${error.message}` }
      return {
        result: `✅ Inmueble registrado en En Estudio — ${data.titulo || data.nombre || data.direccion}`,
        table: 'inmuebles_estudio',
        recordId: data.id,
        label: `${data.nombre || data.direccion}${data.ciudad ? ' · ' + data.ciudad : ''}`,
      }
    }
    if (name === 'insert_inversor') {
      const { data: inv, error: invErr } = await supabaseAdmin.from('inversores').insert([{
        nombre: input.nombre,
        email: input.email || null,
      }]).select().single()
      if (invErr) return { result: `Error al crear inversor: ${invErr.message}` }
      const { error: piErr } = await supabaseAdmin.from('proyecto_inversores').insert([{
        proyecto_id: input.proyecto_id,
        inversor_id: inv.id,
        porcentaje: input.porcentaje,
      }])
      if (piErr) return { result: `Inversor creado (ID: ${inv.id}) pero no se pudo vincular al proyecto: ${piErr.message}` }
      return {
        result: `Inversor "${inv.nombre}" creado y vinculado al proyecto con ${input.porcentaje}% de participación.`,
        table: 'inversores',
        recordId: inv.id,
        label: `${inv.nombre} · ${input.porcentaje}%`,
      }
    }
    if (name === 'update_inversor') {
      const invUpdates: Record<string,any> = {}
      if (input.nombre !== undefined) invUpdates.nombre = input.nombre
      if (input.email !== undefined) invUpdates.email = input.email
      if (Object.keys(invUpdates).length > 0) {
        const { error } = await supabaseAdmin.from('inversores').update(invUpdates).eq('id', input.inversor_id)
        if (error) return { result: `Error al editar inversor: ${error.message}` }
      }
      if (input.porcentaje !== undefined && input.proyecto_id) {
        await supabaseAdmin.from('proyecto_inversores').update({ porcentaje: input.porcentaje }).eq('inversor_id', input.inversor_id).eq('proyecto_id', input.proyecto_id)
      }
      return { result: `Inversor actualizado.` }
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
    if (name === 'insert_agenda_tarea') {
      const { data, error } = await supabaseAdmin.from('agenda_tasks').insert({
        title:    input.titulo,
        category: input.categoria || 'personal',
        status:   'pendiente',
      }).select().single()
      if (error) return { result: `Error al crear tarea de agenda: ${error.message}` }
      return { result: `Tarea de agenda creada. ID: ${data.id}. Título: "${data.title}", Categoría: ${data.category}.`, table: 'agenda_tasks', recordId: data.id, label: data.title }
    }
    if (name === 'update_agenda_tarea') {
      const { data, error } = await supabaseAdmin.from('agenda_tasks').update({ status: input.estado }).eq('id', input.id).select().single()
      if (error) return { result: `Error al actualizar tarea de agenda: ${error.message}` }
      return { result: `Tarea actualizada. "${data.title}" → ${data.status}.`, table: 'agenda_tasks', recordId: data.id, label: data.title }
    }
    if (name === 'delete_agenda_tarea') {
      const { error } = await supabaseAdmin.from('agenda_tasks').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar tarea de agenda: ${error.message}` }
      return { result: `Tarea de agenda eliminada: "${input.titulo || input.id}".` }
    }
    if (name === 'listar_agenda_tareas') {
      let q = supabaseAdmin.from('agenda_tasks').select('id, title, category, status').order('created_at')
      if (input.categoria) q = q.eq('category', input.categoria)
      if (!input.incluir_hechas) q = q.neq('status', 'hecho')
      const { data, error } = await q.limit(50)
      if (error) return { result: `Error al listar tareas: ${error.message}` }
      if (!data || data.length === 0) return { result: 'No hay tareas de agenda pendientes.' }
      const STATE_ICON: Record<string, string> = { pendiente: '○', en_proceso: '◑', hecho: '✓' }
      const lista = data.map(t => `- ID: ${t.id} | [${t.category}] ${STATE_ICON[t.status] || '○'} ${t.title} (${t.status})`).join('\n')
      return { result: `Tareas de agenda (${data.length}):\n${lista}` }
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
    if (name === 'mover_radar_a_estudio') {
      const hoy = new Date().toISOString().split('T')[0]
      let radarItems: any[]
      if (input.todos) {
        const { data, error } = await supabaseAdmin.from('inmuebles_radar').select('*').ilike('direccion', `%${input.busqueda}%`).neq('estado', 'convertido')
        if (error) return { result: `Error al buscar: ${error.message}` }
        if (!data || data.length === 0) return { result: `No encontré inmuebles en radar que coincidan con "${input.busqueda}".` }
        radarItems = data
      } else {
        const resolved = await resolveInmueble('inmuebles_radar', input.busqueda, input.id)
        if ('error' in resolved) return { result: resolved.error }
        radarItems = [resolved.resolved]
      }
      const movidos: string[] = []
      for (const r of radarItems) {
        const { data, error } = await supabaseAdmin.from('inmuebles_estudio').insert([{
          radar_id: r.id,
          nombre: r.direccion,
          direccion: r.direccion,
          ciudad: r.ciudad || null,
          precio_compra: input.precio_compra || r.precio || null,
          estado: 'en_estudio',
          analizado_en: hoy,
          notas: input.notas || null,
          roi_estimado: 0,
        }]).select().single()
        if (!error && data) {
          await supabaseAdmin.from('inmuebles_radar').update({ estado: 'convertido' }).eq('id', r.id)
          movidos.push(`"${r.direccion}"${r.precio ? ' (' + r.precio + '€)' : ''}`)
        }
      }
      if (movidos.length === 0) return { result: 'No se pudo mover ningún inmueble.' }
      const nombresMovidos = movidos.map(m => m.replace(/^"|".*$/g, '').trim()).join(', ')
      return {
        result: movidos.length === 1
          ? `✅ Inmueble registrado en En Estudio — ${nombresMovidos}`
          : `✅ Inmuebles registrados en En Estudio — ${nombresMovidos}`,
        table: 'inmuebles_estudio',
        label: movidos.join(', '),
      }
    }
    if (name === 'insert_bitacora_estudio') {
      let estudios: any[]
      if (input.todos) {
        const { data, error } = await supabaseAdmin.from('inmuebles_estudio').select('id, nombre, direccion, titulo, ciudad').or(`direccion.ilike.%${input.busqueda}%,nombre.ilike.%${input.busqueda}%,titulo.ilike.%${input.busqueda}%,ciudad.ilike.%${input.busqueda}%`)
        if (error) return { result: `Error al buscar: ${error.message}` }
        if (!data || data.length === 0) return { result: `No encontré inmuebles en estudio que coincidan con "${input.busqueda}".` }
        estudios = data
      } else {
        const resolved = await resolveInmueble('inmuebles_estudio', input.busqueda, input.id)
        if ('error' in resolved) return { result: resolved.error }
        estudios = [resolved.resolved]
      }
      const insertados: string[] = []
      for (const estudio of estudios) {
        const { error } = await supabaseAdmin.from('bitacora_estudio').insert([{
          estudio_id: estudio.id,
          contenido: input.contenido,
          tipo: input.tipo || 'nota',
          autor: input.autor || 'Patricio',
          url: input.url || null,
        }])
        if (!error) insertados.push(estudio.nombre || estudio.direccion)
      }
      if (insertados.length === 0) return { result: 'No se pudo guardar ninguna entrada.' }

      // @menciones — notificación in-app + email
      const proyectoNombre = insertados[0] || 'un inmueble en estudio'
      await checkAndSendMentions(input.contenido, {
        autor:    input.autor || 'Patricio',
        proyecto: proyectoNombre,
        contenido: input.contenido,
        tipo:     input.tipo || 'nota',
      })

      return {
        result: `Entrada de bitácora agregada a ${insertados.map(n => `"${n}"`).join(' y ')}. Tipo: ${input.tipo || 'nota'}. Contenido: "${input.contenido}".`,
        table: 'bitacora_estudio',
        label: insertados.join(', '),
      }
    }
    if (name === 'update_bitacora_estudio') {
      const updates: Record<string,any> = {}
      if (input.contenido !== undefined) updates.contenido = input.contenido
      if (input.tipo !== undefined) updates.tipo = input.tipo
      if (input.url !== undefined) updates.url = input.url
      const { data, error } = await supabaseAdmin.from('bitacora_estudio').update(updates).eq('id', input.id).select().single()
      if (error) return { result: `Error al editar: ${error.message}` }
      return { result: `Entrada actualizada. Contenido: "${data.contenido}".`, table: 'bitacora_estudio', recordId: data.id, label: data.contenido.slice(0, 40) }
    }
    if (name === 'delete_bitacora_estudio') {
      const { error } = await supabaseAdmin.from('bitacora_estudio').delete().eq('id', input.id)
      if (error) return { result: `Error al eliminar: ${error.message}` }
      return { result: `Entrada de bitácora estudio eliminada.` }
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

      // Resolve team names to emails
      const TEAM_EMAILS: Record<string, string> = {
        'silvia':      'silviainformes@gmail.com',
        'jl':          'joseluisxp123@gmail.com',
        'jose luis':   'joseluisxp123@gmail.com',
        'josé luis':   'joseluisxp123@gmail.com',
        'pato':        'hola@hasu.in',
        'patricio':    'hola@hasu.in',
      }
      const rawInvitados: string[] = input.invitados || []
      const attendeeEmails = rawInvitados.map((inv: string) => {
        const norm = inv.trim().toLowerCase()
        return TEAM_EMAILS[norm] || inv // fallback: use as-is (assume already an email)
      })

      const created = await gcalCreateEvent(token, {
        title:         input.titulo,
        description:   input.descripcion || '',
        startDateTime: startDT,
        endDateTime:   endDT,
        allDay,
        attendees:     attendeeEmails.length > 0 ? attendeeEmails : undefined,
      })

      if (!created) return { result: 'Error al crear el evento en Google Calendar. Verificá que la conexión esté activa.' }

      const horaStr = allDay ? 'todo el día' : `${input.hora_inicio || '09:00'} – ${input.hora_fin || ''}`
      const invitadosMsg = attendeeEmails.length > 0
        ? ` Invitados: ${attendeeEmails.join(', ')}.`
        : ''
      return {
        result: `Evento creado en Google Calendar. Título: "${created.summary}", Fecha: ${input.fecha}, Hora: ${horaStr}.${invitadosMsg} ID: ${created.id}.`,
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
        precio_venta_conservador: estudio.precio_venta_conservador || null,
        precio_venta_realista:    estudio.precio_venta_realista    || null,
        precio_venta_optimista:   estudio.precio_venta_optimista   || null,
        precio_venta_estimado:    estudio.precio_venta_realista || estudio.precio_venta_optimista || estudio.precio_venta_conservador || null,
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
    if (name === 'analizar_inversion') {
      const { zona, superficie, habitaciones, precio_ofertado, coste_reforma, precio_venta_orientativo, tipo = 'HASU', porcentaje_hasu = 100, socio } = input

      // 1. Buscar comparables en web para validar/ajustar precio de venta
      const busqueda = await buscarComparables(zona, superficie, habitaciones)

      // 2. Determinar precio de venta final
      let precioVenta: number
      let fuenteVenta: string
      if (precio_venta_orientativo) {
        if (busqueda.precioSugerido) {
          const diff = Math.abs(precio_venta_orientativo - busqueda.precioSugerido) / busqueda.precioSugerido
          if (diff > 0.15) {
            // diferencia >15% → alertar y usar el del usuario igual
            fuenteVenta = `orientativo del usuario (${precio_venta_orientativo.toLocaleString('es-ES')}€) — web sugiere ${busqueda.precioSugerido.toLocaleString('es-ES')}€ (diferencia ${Math.round(diff * 100)}%)`
          } else {
            fuenteVenta = `orientativo del usuario, validado con comparables web (±${Math.round(diff * 100)}%)`
          }
        } else {
          fuenteVenta = 'orientativo del usuario ⚠️ sin comparables verificables en portales'
        }
        precioVenta = precio_venta_orientativo
      } else if (busqueda.precioSugerido) {
        precioVenta = busqueda.precioSugerido
        fuenteVenta = `estimado por comparables web — ${busqueda.precioMedioM2}€/m² × ${superficie}m²`
      } else {
        return { result: 'No se pudo determinar el precio de venta. Por favor indicá un precio de venta orientativo.' }
      }

      // 3. Calcular escenarios
      const escenarios = calcEscenarios(precioVenta, coste_reforma)
      const gastos = calcGastosFijos(precio_ofertado)
      const costoOfertado = calcCostoTotal(precio_ofertado, coste_reforma)
      const beneficioOfertado = precioVenta - costoOfertado
      const roiOfertado = beneficioOfertado / costoOfertado

      const fmt = (n: number) => n.toLocaleString('es-ES') + '€'
      const fmtPct = (n: number) => (n * 100).toFixed(1) + '%'

      // 4. Evaluación del precio ofertado
      const roiLabel = roiOfertado >= 0.70 ? '🟢 excelente' : roiOfertado >= 0.50 ? '🟢 sólido' : roiOfertado >= 0.30 ? '🟡 aceptable' : '🔴 por debajo del mínimo'
      const evaluacion = `**Precio ofertado: ${fmt(precio_ofertado)}** → ROI ${fmtPct(roiOfertado)} (${roiLabel})`

      // 5. Tabla de escenarios con precio/m² como referencia base
      const pm2Header = busqueda.precioMedioM2
        ? `_Base: ${busqueda.precioMedioM2}€/m² × ${superficie}m² = ${fmt(precioVenta)} precio de venta estimado_`
        : `_Base: precio de venta ${fmt(precioVenta)}_`

      const tablaEscenarios = [
        '| Escenario | ROI | Compra máxima | Beneficio neto' + (porcentaje_hasu < 100 ? ` | HASU (${porcentaje_hasu}%)` : '') + ' |',
        '|-----------|-----|--------------|---------------' + (porcentaje_hasu < 100 ? '|----------' : '') + '|',
        ...escenarios.map(e => {
          const parteHasu = Math.floor(e.beneficioNeto * (porcentaje_hasu / 100))
          const hasuCol = porcentaje_hasu < 100 ? ` | ${fmt(parteHasu)}` : ''
          return `| ${e.label} | ${Math.round(e.roiTarget * 100)}% | **${fmt(e.precioMaxCompra)}** | ${fmt(e.beneficioNeto)}${hasuCol} |`
        }),
      ].join('\n')

      // 6. Tabla de comparables Fotocasa
      let tablaComp: string
      if (busqueda.comparables.length === 0) {
        tablaComp = '⚠️ Sin comparables verificables en Fotocasa para esta búsqueda. Validá el precio de venta manualmente antes de tomar decisiones.'
      } else {
        const conM2 = busqueda.comparables.filter(c => c.precioM2).length
        const resumen = busqueda.precioMedioM2
          ? `**Precio medio mercado: ${busqueda.precioMedioM2}€/m²** _(${conM2} comparable${conM2 !== 1 ? 's' : ''} con superficie)_`
          : ''
        const filas = [
          '| Inmueble | m² | Hab | Precio total | €/m² |',
          '|----------|-----|-----|-------------|------|',
          ...busqueda.comparables.map(c => {
            const label = `[${(c.direccion || c.titulo || 'Ver anuncio').slice(0, 45)}](${c.url})`
            const sup = c.superficie ? `${c.superficie}` : '—'
            const hab = c.habitaciones ? `${c.habitaciones}` : '—'
            const pm2 = c.precioM2 ? `${c.precioM2}` : '—'
            return `| ${label} | ${sup} | ${hab} | **${fmt(c.precio)}** | ${pm2} |`
          }),
        ].join('\n')
        tablaComp = resumen ? resumen + '\n\n' + filas : filas
      }

      // 7. Componer output final
      const tipoLabel = tipo === 'JV' ? `JV ${porcentaje_hasu}% HASU${socio ? ' / ' + (100 - porcentaje_hasu) + '% ' + socio : ''}` : 'HASU 100%'

      const result = [
        `## Análisis de inversión — ${zona} (${superficie}m²${habitaciones ? ', ' + habitaciones + 'hab' : ''})`,
        `**Tipo:** ${tipoLabel} · **Gastos fijos (ITP + notaría + registro):** ${fmt(gastos)}`,
        '',
        `### Comparables Fotocasa`,
        tablaComp,
        '',
        `### Precio máximo de compra por escenario`,
        pm2Header,
        tablaEscenarios,
        '',
        `### Evaluación del precio ofertado`,
        evaluacion,
      ].join('\n')

      return { result }
    }
    if (name === 'listar_movimientos_proyecto') {
      let query = supabaseAdmin.from('movimientos').select('id,concepto,monto,fecha,categoria,tipo,cuenta,proveedor').eq('proyecto_id', input.proyecto_id).order('fecha', { ascending: false })
      if (input.categoria) query = (query as any).ilike('categoria', `%${input.categoria}%`)
      const { data, error } = await query
      if (error) return { result: `Error al traer movimientos: ${error.message}` }
      if (!data?.length) return { result: 'No hay movimientos registrados para este proyecto.' }
      const ingresos = data.filter((m: any) => m.monto > 0).reduce((s: number, m: any) => s + m.monto, 0)
      const gastos = data.filter((m: any) => m.monto < 0).reduce((s: number, m: any) => s + m.monto, 0)
      const lista = data.map((m: any) => `- ${m.fecha} | ${m.tipo} | ${m.categoria ?? '-'} | ${m.concepto} | ${m.monto}€${m.proveedor ? ' | ' + m.proveedor : ''}`).join('\n')
      return { result: `Movimientos del proyecto (${data.length} registros):\nTotal ingresos: ${ingresos}€ | Total gastos: ${gastos}€ | Saldo: ${ingresos + gastos}€\n\n${lista}` }
    }
    if (name === 'listar_partidas_proyecto') {
      let query = supabaseAdmin.from('partidas_reforma').select('id,proyecto_id,nombre,categoria,presupuesto,ejecutado,estado').in('proyecto_id', input.proyecto_ids).order('orden')
      if (input.nombre_partida) query = (query as any).ilike('nombre', `%${input.nombre_partida}%`)
      const { data, error } = await query
      if (error) return { result: `Error al traer partidas: ${error.message}` }
      if (!data?.length) return { result: 'No se encontraron partidas para los proyectos indicados.' }
      const lista = data.map((p: any) => `- ProyID:${p.proyecto_id} | ${p.nombre} | ${p.categoria} | Presup:${p.presupuesto}€ | Ejecutado:${p.ejecutado}€ | ${p.estado}`).join('\n')
      return { result: `Partidas encontradas (${data.length}):\n${lista}` }
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
    if (name === 'agendar_visita_radar') {
      const res = await resolveInmueble('inmuebles_radar', input.busqueda)
      if ('error' in res) return { result: res.error }
      const inmueble = res.resolved
      const direccion = `${inmueble.direccion}${inmueble.ciudad ? ', '+inmueble.ciudad : ''}`

      const { data: visita, error: dbErr } = await supabaseAdmin
        .from('visitas_radar')
        .insert([{ radar_id: inmueble.id, fecha: input.fecha, hora: input.hora, responsable: input.responsable, notas_previas: input.notas_previas || null }])
        .select().single()
      if (dbErr) return { result: `Error al agendar: ${dbErr.message}` }

      // Check for other visits same fecha+hora to group in GCal
      const { data: mismaHora } = await supabaseAdmin
        .from('visitas_radar')
        .select('id, gcal_event_id, radar_id')
        .eq('fecha', input.fecha)
        .eq('hora', input.hora)
        .not('id', 'eq', visita.id)
        .not('gcal_event_id', 'is', null)
        .limit(1)

      const gcalToken = await getOrgAccessToken()
      let gcalEventId: string | null = null
      if (gcalToken) {
        const addHour = (h: string) => { const [hh,mm] = h.split(':').map(Number); return `${String((hh+1)%24).padStart(2,'0')}:${String(mm).padStart(2,'0')}` }
        const horaFin = addHour(input.hora)
        let title: string
        if (mismaHora && mismaHora.length > 0) {
          const { data: todasVisitas } = await supabaseAdmin.from('visitas_radar').select('radar_id').eq('fecha', input.fecha).eq('hora', input.hora)
          const radarIds = (todasVisitas || []).map((v: any) => v.radar_id)
          const { data: inmuebles } = await supabaseAdmin.from('inmuebles_radar').select('id,direccion,ciudad').in('id', radarIds)
          const titulos = (inmuebles || []).map((r: any) => `${r.direccion}${r.ciudad ? ', '+r.ciudad : ''}`).join(' · ')
          title = `🏠 Visitas — ${titulos}`
        } else {
          title = `🏠 Visita — ${direccion}`
        }
        const created = await gcalCreateEvent(gcalToken, {
          title, description: `Responsable: ${input.responsable}${input.notas_previas ? '\n'+input.notas_previas : ''}`,
          startDateTime: `${input.fecha}T${input.hora}:00`,
          endDateTime: `${input.fecha}T${horaFin}:00`,
        })
        gcalEventId = created?.id || null
        if (gcalEventId) await supabaseAdmin.from('visitas_radar').update({ gcal_event_id: gcalEventId }).eq('id', visita.id)
      }

      const gcalMsg = gcalEventId ? ' Evento creado en Google Calendar.' : ''
      return { result: `Visita agendada para ${inmueble.direccion} el ${input.fecha} a las ${input.hora}. Responsable: ${input.responsable}.${gcalMsg}` }
    }

    if (name === 'listar_visitas_radar') {
      const hoy = new Date().toISOString().split('T')[0]
      let query = supabaseAdmin
        .from('visitas_radar')
        .select('*, inmuebles_radar(direccion, ciudad)')
        .gte('fecha', input.fecha_desde || hoy)
        .order('fecha').order('hora')
      if (input.fecha_hasta) query = (query as any).lte('fecha', input.fecha_hasta)
      if (input.busqueda) {
        // Filter by radar_id matching address
        const { data: found } = await supabaseAdmin.from('inmuebles_radar').select('id').ilike('direccion', `%${input.busqueda}%`)
        const ids = (found || []).map((x: any) => x.id)
        if (ids.length > 0) query = (query as any).in('radar_id', ids)
      }
      const { data, error } = await query.limit(20)
      if (error) return { result: `Error: ${error.message}` }
      if (!data || data.length === 0) return { result: 'No hay visitas agendadas en ese período.' }
      const lista = data.map((v: any) => {
        const dir = v.inmuebles_radar?.direccion || 'Inmueble'
        const ciudad = v.inmuebles_radar?.ciudad ? `, ${v.inmuebles_radar.ciudad}` : ''
        const estado = v.estado_post ? ` · ${v.estado_post === 'pasa_a_estudio' ? '→ En Estudio' : v.estado_post === 'descartado' ? 'Descartado' : 'Sigue en Radar'}` : ''
        return `· ${v.fecha} ${v.hora} — ${dir}${ciudad} — ${v.responsable}${estado}`
      }).join('\n')
      return { result: `Visitas (${data.length}):\n${lista}` }
    }

    if (name === 'registrar_resultado_visita') {
      // Find latest pending visit for this inmueble
      const resInm = await resolveInmueble('inmuebles_radar', input.busqueda)
      if ('error' in resInm) return { result: resInm.error }
      const inmueble = resInm.resolved

      const { data: visitas, error: fetchErr } = await supabaseAdmin
        .from('visitas_radar')
        .select('*')
        .eq('radar_id', inmueble.id)
        .is('estado_post', null)
        .order('fecha', { ascending: false })
        .limit(1)
      if (fetchErr) return { result: `Error: ${fetchErr.message}` }
      if (!visitas || visitas.length === 0) return { result: `No encontré visitas pendientes de registro para "${inmueble.direccion}".` }

      const visita = visitas[0]
      const updates: Record<string,any> = { estado_post: input.estado_post }
      if (input.notas_post) updates.notas_post = input.notas_post
      if (input.fotos_url) updates.fotos_url = input.fotos_url

      const { error: updErr } = await supabaseAdmin.from('visitas_radar').update(updates).eq('id', visita.id)
      if (updErr) return { result: `Error: ${updErr.message}` }

      let extraMsg = ''
      if (input.estado_post === 'pasa_a_estudio') {
        const { data: estudio, error: estErr } = await supabaseAdmin.from('inmuebles_estudio').insert([{
          direccion: inmueble.direccion, ciudad: inmueble.ciudad || null,
          precio_compra: inmueble.precio || 0,
          roi_estimado: 0, estado: 'en_estudio', analizado_en: new Date().toISOString().split('T')[0],
        }]).select().single()
        if (!estErr && estudio) extraMsg = ` "${inmueble.direccion}" movido a En Estudio (ID: ${estudio.id}).`
        else if (estErr) extraMsg = ` (Aviso: error al mover a En Estudio: ${estErr.message})`
      }

      const estadoLabel = input.estado_post === 'pasa_a_estudio' ? 'Pasa a En Estudio' : input.estado_post === 'descartado' ? 'Descartado' : 'Sigue en Radar'
      return { result: `Visita registrada. Inmueble: "${inmueble.direccion}", Estado: ${estadoLabel}.${extraMsg}` }
    }

    if (name === 'insert_documento') {
      const { data, error } = await supabaseAdmin.from('documentos').insert([{
        nombre: input.nombre,
        tipo: input.tipo,
        proyecto_id: input.proyecto_id || null,
        descripcion_ia: input.descripcion_ia,
        datos_ia: input.datos_ia || null,
        url: null,
        fecha_subida: new Date().toISOString(),
        subido_por: 'Bot (Vision)',
      }]).select().single()
      if (error) return { result: `Error al guardar documento: ${error.message}` }
      return {
        result: `Documento guardado. ID: ${data.id}. Tipo: ${data.tipo}, Nombre: "${data.nombre}"${input.proyecto_id ? ', vinculado al proyecto.' : ', sin proyecto asignado aún.'}`,
        table: 'documentos',
        recordId: data.id,
        label: `${data.nombre} · ${data.tipo}`,
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
    const { messages, context, imageData, mediaType } = await req.json()
    const today = new Date().toISOString().split('T')[0]

    // Detect real-estate portal URL in last user message and scrape it
    const PORTAL_NAMES: Record<string, string> = {
      'idealista.com':   'Idealista',
      'fotocasa.es':     'Fotocasa',
      'solvia.es':       'Solvia',
      'habitaclia.com':  'Habitaclia',
      'pisos.com':       'Pisos.com',
      'yaencontre.com':  'Yaencontre',
      'kyero.com':       'Kyero',
      'hogaria.net':     'Hogaria',
      'tecnocasa.es':    'Tecnocasa',
      'remax.es':        'Remax',
      'century21':       'Century21',
      'thinkspain.com':  'ThinkSpain',
      'engel':           'Engel&Völkers',
      'savills':         'Savills',
    }

    const allMsgs = (messages as { role: string; content: any }[])
    const lastUserContent = [...allMsgs].reverse().find(m => m.role === 'user')?.content as string || ''
    const anyUrlMatch = lastUserContent.match(/https?:\/\/\S+/i)
    let portalCtx = ''
    if (anyUrlMatch) {
      const rawUrl = anyUrlMatch[0].replace(/[.,;:!?)'"]+$/, '') // trim trailing punctuation
      const lcUrl = rawUrl.toLowerCase()
      const portalName = Object.entries(PORTAL_NAMES).find(([d]) => lcUrl.includes(d))?.[1]
      if (portalName) {
        const scraped = await scrapeIdealista(rawUrl)
        if ('error' in scraped) {
          // Scraping failed — ask Claude to request details manually
          portalCtx = `\n\n[${portalName}] El usuario compartió este link de ${portalName}: ${rawUrl}\nNo se pudieron extraer los datos automáticamente. Pedile amablemente que te diga: precio, dirección, ciudad, habitaciones y superficie. Cuando los tenga, usá insert_radar con fuente='${portalName}' y url='${rawUrl}'.`
        } else {
          const campos = [
            scraped.titulo       ? `Título: ${scraped.titulo}` : null,
            scraped.precio       ? `Precio: ${scraped.precio.toLocaleString('es-ES')}€` : null,
            scraped.direccion    ? `Dirección: ${scraped.direccion}` : null,
            scraped.ciudad       ? `Ciudad: ${scraped.ciudad}` : null,
            scraped.habitaciones ? `Habitaciones: ${scraped.habitaciones}` : null,
            scraped.superficie   ? `Superficie: ${scraped.superficie} m²` : null,
            scraped.banos        ? `Baños: ${scraped.banos}` : null,
            scraped.descripcion  ? `Descripción: ${scraped.descripcion}` : null,
          ].filter(Boolean).join('\n')
          portalCtx = `\n\n[${portalName.toUpperCase()} DETECTADO] Info extraída del link:\n${campos}\nURL: ${rawUrl}\n\nINSTRUCCIÓN: Mostrá este resumen al usuario de forma limpia y preguntá "¿Lo cargo al Radar?". Si confirma, usá insert_radar con estos datos, fuente='${portalName}' y url='${rawUrl}'. Si falta algún campo, completalo con null.`
        }
      }
    }

    const systemPrompt = `Sos el asistente de Wallest, una empresa inmobiliaria española (Hasu Activos Inmobiliarios SL).
Respondés en español, de forma directa y concisa. Sos experto en inversión inmobiliaria, reformas y gestión de proyectos.
El CEO es Patricio Favora. El objetivo es llegar a 1M€ en cuenta HASU para diciembre 2027.
Hoy es ${today}.

Contexto actual del sistema:
${context || 'Sin datos disponibles.'}

CAPACIDADES — podés CREAR, EDITAR y ELIMINAR:
- proyectos, cuentas bancarias, movimientos, tareas, partidas de reforma, radar, bitácora, proveedores
- timeline de reforma (recalcular_timeline) — desplaza en cascada N días
- Google Calendar — crear (agendar_evento), listar (listar_eventos), editar (editar_evento), eliminar (eliminar_evento). Interpretá fechas relativas: "mañana" = ${new Date(Date.now()+86400000).toISOString().split('T')[0]}, "el lunes" = próximo lunes, etc. Para invitar a Silvia o JL, usá el campo invitados: ["Silvia"] o ["JL"] o ambos. Emails del equipo: Silvia = silviainformes@gmail.com, JL = joseluisxp123@gmail.com.
- TAREAS DE AGENDA (Personal/Trabajo, sin proyecto): insert_agenda_tarea, update_agenda_tarea, delete_agenda_tarea, listar_agenda_tareas. Son las tareas que aparecen en HASU → Calendario. Distintas de las tareas de proyecto. Cuando el usuario pregunte por tareas generales (no de un proyecto), usá listar_agenda_tareas directamente SIN preguntar — ya no hace falta la pregunta de aclaración.
- ANÁLISIS DE INVERSIÓN: cuando el usuario quiera analizar una operación nueva, calcular ROI o saber cuánto puede pagar, usá analizar_inversion. Siempre etiquetar como HASU o JV desde el inicio. Preguntar tipo de operación si no se indica.
- TRAZABILIDAD DE ACTIVOS: cuando el usuario diga que un inmueble "está comprado", "se compró" o quiera "pasarlo a proyectos", usá convertir_estudio_a_proyecto. Pipeline de venta: venta → reservado → con_oferta (oferta recibida) → en_arras → vendido. Para marcar vendido usá update_proyecto con estado="vendido".
- INMUEBLES RADAR/ESTUDIO: para editar, eliminar, mover o agregar bitácora a un inmueble, SIEMPRE usá el campo "busqueda" con la dirección parcial. Para mover del radar a En Estudio usá mover_radar_a_estudio. Para agregar directamente a En Estudio sin pasar por Radar usá insert_estudio. Para editar precio, ROI, superficie u otros datos de un inmueble en estudio usá update_estudio. Para ELIMINAR un inmueble en Radar usá delete_radar; para ELIMINAR uno en En Estudio usá delete_estudio.
- INVERSORES/JV: para registrar un nuevo socio inversor usá insert_inversor (crea el inversor y lo vincula al proyecto). Para editar datos o porcentaje usá update_inversor. Los datos del inversor ya vinculado están en el contexto del proyecto. CRÍTICO: si el usuario dice "ambos", "los dos", "todos", "en el orden que están", "todos los que hay" → usá todos=true y ejecutá SIN hacer más preguntas. No preguntes cuál primero ni cuál segundo. NUNCA pidas el ID. El sistema resuelve la búsqueda automáticamente con ILIKE. Si hay varios resultados, el sistema te devuelve la lista para que preguntes al usuario cuál. Si hay uno solo, procede directamente.
- VISITAS A INMUEBLES RADAR: agenda visitas con agendar_visita_radar (→ crea evento GCal automáticamente), lista con listar_visitas_radar, registra resultado con registrar_resultado_visita (estados: descartado, sigue_en_radar, pasa_a_estudio → mueve automáticamente a En Estudio si corresponde). Comandos: "Agenda visita a Rulador 30 el martes a las 11, responsable Patricio", "Qué visitas hay esta tarde?", "Registra visita a Rulador 30: piso en buen estado, pasa a En Estudio".
- COMERCIALIZACIÓN: prospectos por proyecto con estados (Contactado → Visita programada → Visita realizada → Oferta recibida → En negociación → Descartado) y log de interacciones (llamada, visita, mensaje, email, nota). Comandos: "Agrega prospecto [nombre], tel [X]", "[nombre] hizo oferta de [X]€", "Descarta a [nombre]", "¿Cuántos prospectos activos tiene [proyecto]?". Para registrar interacciones usá insert_interaccion_prospecto (necesitás el prospecto_id del contexto).

REGLAS DE RESPUESTA — MUY IMPORTANTE:
1. NUNCA muestres IDs, UUIDs ni códigos al usuario. Son internos. Usalos solo para llamar herramientas.
2. NUNCA uses tablas markdown con columnas de IDs. Listá con bullet points e iconos.
3. Cuando el usuario pregunte por tareas sin contexto de proyecto: si dice "mis tareas", "tareas personal", "tareas trabajo" → usá listar_agenda_tareas directamente. Si hay ambigüedad con un proyecto activo, preguntá "¿Querés las tareas de [proyecto] o las tareas generales de agenda?"
4. Respuestas cortas y limpias. Solo la info que el usuario necesita ver. Sin columnas técnicas.
5. Para editar o eliminar, buscá el ID en el contexto sin mostrárselo al usuario.
6. Cuando insert_estudio o mover_radar_a_estudio tienen éxito, respondé ÚNICAMENTE con el texto exacto del resultado de la herramienta — sin resumen de datos, sin preguntas adicionales, sin texto extra.

USO EFICIENTE DE HERRAMIENTAS — CRÍTICO:
- Para resultados financieros de un proyecto (beneficio, ROI, etc.) usá los datos del contexto (campos: Compra, CostoTotal, VentaReal). NO llames listar_movimientos_proyecto para responder esto.
- Fórmula: beneficio_neto = VentaReal - CostoTotal. Parte HASU = beneficio_neto × (%HASU/100). Siempre llamarlo BENEFICIO NETO (CostoTotal ya incluye compra + reforma + gastos).
- Duración de operación: calculá los meses exactos entre FechaCompra y FechaSalida. Si FechaSalida no está, usá la fecha de hoy. Hacé el cálculo antes de escribir — nunca corrijas inline.
- ROI anualizado = ROI × (12 / meses_duración).
- Si CostoTotal no está en el contexto: indicá que falta ese dato sin inventar.
- Solo usá listar_movimientos_proyecto cuando el usuario pida EXPLÍCITAMENTE ver el detalle de gastos, movimientos o desglose de costos de un proyecto.
- Solo usá listar_partidas_proyecto cuando el usuario pida comparar partidas entre proyectos o ver el detalle de partidas específicas.

Formato de listas:
✅ Tarea completada · detalle
📋 Tarea pendiente · prioridad
🔨 Partida · estado

Respondé siempre en español. Máximo 3 párrafos.

ANÁLISIS DE IMÁGENES — cuando el usuario adjunte una imagen:
- Determiná el tipo automáticamente analizando su contenido visual.
- **Factura o presupuesto** → extraé: proveedor, importe total, fecha, concepto/descripción del trabajo. Luego mostrá el resumen y preguntá "¿A qué operación imputamos este gasto?". Cuando el usuario indique el proyecto, llamá insert_documento (con proyecto_id) y después insert_movimiento con los datos extraídos.
- **Foto de inmueble** → describí el estado general (instalaciones, materiales, acabados), estimá superficie si es posible, listá observaciones relevantes para la reforma. Llamá insert_documento con tipo='foto_inmueble'.
- **Documento** (contrato, nota, informe, etc.) → extraé información clave: partes, fechas, importes, condiciones relevantes. Llamá insert_documento con tipo='documento'.
- Si no hay operación/proyecto en contexto cuando se necesite asociar, preguntá antes de guardar con insert_documento.${portalCtx}`

    // Build clean messages — allow content to be string or content array (for vision)
    type CleanMsg = { role: 'user' | 'assistant'; content: string | Anthropic.ContentBlockParam[] }
    const cleanMessages: CleanMsg[] = allMsgs
      .filter(m => typeof m.content === 'string' && m.content.trim() !== '')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content as string }))

    // If image attached, inject into last user message as vision content block
    if (imageData && mediaType) {
      const lastUserIdx = cleanMessages.reduce((found, m, i) => m.role === 'user' ? i : found, -1)
      if (lastUserIdx >= 0) {
        const text = cleanMessages[lastUserIdx].content as string
        cleanMessages[lastUserIdx] = {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageData } },
            { type: 'text', text: text || 'Analiza esta imagen.' },
          ],
        }
      }
    }

    let response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
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

      const newMessages: CleanMsg[] = [
        ...cleanMessages,
        { role: 'assistant' as const, content: response.content as unknown as Anthropic.ContentBlockParam[] },
        { role: 'user' as const, content: results as unknown as Anthropic.ContentBlockParam[] },
      ]

      response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
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
