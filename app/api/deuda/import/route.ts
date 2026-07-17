import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { CampoCanonico, ESTADOS_JUDICIALES_NORMALIZADOS } from '@/lib/deuda-schema'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Excels de brokers a veces llegan con mojibake (UTF-8 mal re-decodificado como Latin-1),
// ej. "2Ã‚Âº D" en vez de "2º D". Si se detecta el patrón, se intenta reparar.
function fixMojibake(s: string): string {
  if (!s || !/Ã|Â/.test(s)) return s
  try {
    const repaired = Buffer.from(s, 'latin1').toString('utf8')
    // solo usar el resultado si redujo la cantidad de caracteres sospechosos
    const before = (s.match(/Ã|Â/g) || []).length
    const after = (repaired.match(/Ã|Â|�/g) || []).length
    return after < before ? repaired : s
  } catch {
    return s
  }
}

// Los 14 brokers/fondos no usan el mismo formato de número: unos mandan "135.000,00" (España,
// punto de miles + coma decimal) y otros "135,000.00" (formato inglés/US, coma de miles + punto
// decimal) — a veces incluso mezclados dentro del mismo Excel según qué herramienta lo generó.
// Antes se asumía SIEMPRE formato español, lo que rompía en silencio los números en formato inglés
// (ej. " 135,000 € " se leía como 135 en vez de 135.000). Ahora se detecta el separador decimal
// mirando cuál de los dos símbolos aparece último y cuántos dígitos lo siguen (1-2 dígitos = decimal,
// si no, es separador de miles y se descarta).
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isNaN(v) || !isFinite(v) ? null : v

  const s = String(v).replace(/€|\$/g, '').replace(/\s/g, '').trim()
  if (s === '') return null

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    // la coma es el símbolo más a la derecha — decimal si le siguen 1-2 dígitos (ej. "135,5"),
    // si no es separador de miles inglés (ej. "135,000")
    const decimales = s.length - lastComma - 1
    normalized = decimales >= 1 && decimales <= 2
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/[.,]/g, '')
  } else if (lastDot > lastComma) {
    // el punto es el símbolo más a la derecha — decimal si le siguen 1-2 dígitos (ej. "135.5"),
    // si no es separador de miles español (ej. "135.000")
    const decimales = s.length - lastDot - 1
    normalized = decimales >= 1 && decimales <= 2
      ? s.replace(/,/g, '')
      : s.replace(/[.,]/g, '')
  } else {
    // ni coma ni punto (o ninguno de los dos apareció)
    normalized = s.replace(/[.,]/g, '')
  }

  const n = parseFloat(normalized)
  return isNaN(n) || !isFinite(n) ? null : n
}

function toTextOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return fixMojibake(String(v).trim())
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { broker_origen, archivo_nombre, headers, rows, mapeo, confirmado_por, forzar } = await req.json() as {
    broker_origen: string
    archivo_nombre: string
    headers: string[]
    rows: any[][]
    mapeo: Record<string, CampoCanonico>
    confirmado_por: string
    forzar?: boolean
  }

  if (!broker_origen || !Array.isArray(headers) || !Array.isArray(rows) || !mapeo) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  // No hay clave única confiable entre brokers para bloquear duplicados automáticamente
  // (ver nota en lib/deuda-schema.ts), pero un mismo broker+nombre de archivo ya importado
  // antes es una señal fuerte de re-subida accidental — avisamos y pedimos confirmar.
  if (!forzar && archivo_nombre) {
    const { data: previas } = await supabase
      .from('deuda_importaciones')
      .select('id, n_filas, created_at, importado_por')
      .eq('broker_origen', broker_origen)
      .eq('archivo_nombre', archivo_nombre)
      .order('created_at', { ascending: false })
      .limit(1)

    if (previas && previas.length > 0) {
      return NextResponse.json({ duplicado: true, importacion_previa: previas[0] })
    }
  }

  // 1. Normalizar cada fila usando el mapeo confirmado
  const numericFields = new Set<CampoCanonico>([
    'n_loans', 'deuda_ob', 'deuda_tot', 'cargas_previas', 'cargas_posteriores', 'asking_price', 'valor_colateral',
    'principal', 'precio_subasta', 'importe_adjudicacion', 'superficie_m2', 'deuda_responsabilidad_hipotecaria', 'n_contratos_activos',
  ])
  const textFields = new Set<CampoCanonico>([
    'contract_id', 'tipo_colateral', 'subtipo_colateral', 'ccaa', 'provincia', 'ciudad', 'zip', 'direccion', 'n_registro', 'ref_catastral', 'estado_judicial_raw', 'titular_deuda',
    'portfolio', 'bucket', 'contract_id_secundario', 'id_bien', 'juzgado', 'num_autos', 'num_procedimiento', 'tipo_procedimiento',
    'tipo_via', 'numero_via', 'n_finca_registral', 'fecha_subasta', 'fecha_cobro', 'estado_subasta', 'resultado_subasta',
    'flag_nuevo', 'flag_eliminado', 'vpo', 'planta', 'parcela', 'comarca', 'id_portal_subasta', 'fecha_cesion_remate',
    'fecha_precio_referencia', 'dev_id', 'subfase', 'ocupacion_broker', 'status_final', 'estado_colateral', 'registro', 'fr',
    'connection', 'afectado_terceros', 'motivo_paralizacion', 'fecha_solicitud_adjudicacion', 'fecha_cdr', 'fecha_firma_cdr_closing',
    'propuesta_formalizada_closing', 'fecha_firma_closing', 'estado_broker', 'estado_proc_flag',
  ])

  const normalizados = rows.map((row) => {
    const obj: Record<string, any> = {}
    const rawRow: Record<string, any> = {}
    const camposExtra: Record<string, any> = {}

    headers.forEach((h, i) => {
      const valor = row[i]
      rawRow[h] = valor
      const campo = mapeo[h]
      if (!campo || campo === 'ignorar') {
        if (valor !== null && valor !== undefined && valor !== '') camposExtra[h] = valor
        return
      }
      if (numericFields.has(campo)) obj[campo] = toNumOrNull(valor)
      else if (textFields.has(campo)) obj[campo] = toTextOrNull(valor)
    })

    return {
      contract_id: obj.contract_id ? String(obj.contract_id) : null,
      n_loans: obj.n_loans ?? null,
      tipo_colateral: obj.tipo_colateral ?? null,
      subtipo_colateral: obj.subtipo_colateral ?? null,
      ccaa: obj.ccaa ?? null,
      provincia: obj.provincia ?? null,
      ciudad: obj.ciudad ?? null,
      zip: obj.zip ?? null,
      direccion: obj.direccion ?? null,
      n_registro: obj.n_registro ?? null,
      ref_catastral: obj.ref_catastral ?? null,
      estado_judicial_raw: obj.estado_judicial_raw ?? null,
      deuda_ob: obj.deuda_ob ?? null,
      deuda_tot: obj.deuda_tot ?? null,
      titular_deuda: obj.titular_deuda ?? null,
      cargas_previas: obj.cargas_previas ?? null,
      cargas_posteriores: obj.cargas_posteriores ?? null,
      asking_price: obj.asking_price ?? null,
      valor_colateral: obj.valor_colateral ?? null,
      portfolio: obj.portfolio ?? null,
      bucket: obj.bucket ?? null,
      contract_id_secundario: obj.contract_id_secundario ?? null,
      id_bien: obj.id_bien ?? null,
      juzgado: obj.juzgado ?? null,
      num_autos: obj.num_autos ?? null,
      num_procedimiento: obj.num_procedimiento ?? null,
      tipo_procedimiento: obj.tipo_procedimiento ?? null,
      tipo_via: obj.tipo_via ?? null,
      numero_via: obj.numero_via ?? null,
      n_finca_registral: obj.n_finca_registral ?? null,
      fecha_subasta: obj.fecha_subasta ?? null,
      fecha_cobro: obj.fecha_cobro ?? null,
      estado_subasta: obj.estado_subasta ?? null,
      resultado_subasta: obj.resultado_subasta ?? null,
      flag_nuevo: obj.flag_nuevo ?? null,
      flag_eliminado: obj.flag_eliminado ?? null,
      vpo: obj.vpo ?? null,
      planta: obj.planta ?? null,
      parcela: obj.parcela ?? null,
      comarca: obj.comarca ?? null,
      id_portal_subasta: obj.id_portal_subasta ?? null,
      fecha_cesion_remate: obj.fecha_cesion_remate ?? null,
      fecha_precio_referencia: obj.fecha_precio_referencia ?? null,
      dev_id: obj.dev_id ?? null,
      subfase: obj.subfase ?? null,
      ocupacion_broker: obj.ocupacion_broker ?? null,
      status_final: obj.status_final ?? null,
      estado_colateral: obj.estado_colateral ?? null,
      registro: obj.registro ?? null,
      fr: obj.fr ?? null,
      connection: obj.connection ?? null,
      afectado_terceros: obj.afectado_terceros ?? null,
      motivo_paralizacion: obj.motivo_paralizacion ?? null,
      fecha_solicitud_adjudicacion: obj.fecha_solicitud_adjudicacion ?? null,
      fecha_cdr: obj.fecha_cdr ?? null,
      fecha_firma_cdr_closing: obj.fecha_firma_cdr_closing ?? null,
      propuesta_formalizada_closing: obj.propuesta_formalizada_closing ?? null,
      fecha_firma_closing: obj.fecha_firma_closing ?? null,
      estado_broker: obj.estado_broker ?? null,
      estado_proc_flag: obj.estado_proc_flag ?? null,
      principal: obj.principal ?? null,
      precio_subasta: obj.precio_subasta ?? null,
      importe_adjudicacion: obj.importe_adjudicacion ?? null,
      superficie_m2: obj.superficie_m2 ?? null,
      deuda_responsabilidad_hipotecaria: obj.deuda_responsabilidad_hipotecaria ?? null,
      n_contratos_activos: obj.n_contratos_activos ?? null,
      campos_extra: camposExtra,
      raw_data: rawRow,
    }
  }).filter(r => r.contract_id) // sin contract_id no hay forma de identificar la posición

  if (normalizados.length === 0) {
    return NextResponse.json({ error: 'Ninguna fila tiene Contract ID mapeado — revisá el mapeo' }, { status: 400 })
  }

  // 2. Normalización de Estado Judicial: clasificar solo los estado_raw NUEVOS (no vistos antes)
  const estadosRawUnicos = Array.from(new Set(normalizados.map(r => r.estado_judicial_raw).filter(Boolean))) as string[]
  if (estadosRawUnicos.length > 0) {
    const { data: yaClasificados } = await supabase
      .from('deuda_estados_judiciales')
      .select('estado_raw, estado_normalizado')
      .in('estado_raw', estadosRawUnicos)

    const conocidos = new Map((yaClasificados || []).map(e => [e.estado_raw, e.estado_normalizado]))
    const nuevos = estadosRawUnicos.filter(e => !conocidos.has(e))

    if (nuevos.length > 0) {
      try {
        const prompt = `Clasificá cada uno de estos textos de estado judicial (provenientes de brokers de deuda/NPL en España) en UNO de estos buckets: ${ESTADOS_JUDICIALES_NORMALIZADOS.join(', ')}.

Textos a clasificar:
${nuevos.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Devolvé SOLO un JSON object { "texto_exacto": "bucket" }, usando el texto EXACTO como viene arriba como clave.`
        const msg = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        })
        const raw = (msg.content[0] as any).text?.trim() || ''
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          const clasificacion = JSON.parse(match[0]) as Record<string, string>
          const inserts = Object.entries(clasificacion)
            .filter(([, v]) => (ESTADOS_JUDICIALES_NORMALIZADOS as readonly string[]).includes(v))
            .map(([estado_raw, estado_normalizado]) => ({ estado_raw, estado_normalizado, clasificado_por: 'claude' }))
          if (inserts.length > 0) {
            await supabase.from('deuda_estados_judiciales').upsert(inserts, { onConflict: 'estado_raw' })
            inserts.forEach(i => conocidos.set(i.estado_raw, i.estado_normalizado))
          }
        }
      } catch {
        // si Claude falla, las filas quedan con estado_judicial_normalizado = null — no bloquea el import
      }
    }

    normalizados.forEach(r => {
      if (r.estado_judicial_raw) {
        (r as any).estado_judicial_normalizado = conocidos.get(r.estado_judicial_raw) ?? 'otro'
      }
    })
  }

  // 3. Registrar la importación
  const { data: importacion, error: errImportacion } = await supabase
    .from('deuda_importaciones')
    .insert({
      broker_origen,
      archivo_nombre: archivo_nombre || null,
      n_filas: rows.length,
      n_filas_nuevas: normalizados.length,
      n_filas_actualizadas: 0,
      importado_por: confirmado_por || auth.email,
    })
    .select()
    .single()

  if (errImportacion) return NextResponse.json({ error: errImportacion.message }, { status: 500 })

  // 4. Insertar posiciones
  const posiciones = normalizados.map(r => ({
    ...r,
    broker_origen,
    archivo_origen: archivo_nombre || null,
    importacion_id: importacion.id,
  }))

  const { data: insertadas, error: errInsert } = await supabase
    .from('deuda_posiciones')
    .insert(posiciones)
    .select('id')

  if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 })

  // 5. Guardar/actualizar el mapeo confirmado para reuso en el próximo import de este broker
  await supabase
    .from('deuda_mapeos_broker')
    .upsert({ broker_origen, mapeo, confirmado_por: confirmado_por || auth.email, updated_at: new Date().toISOString() }, { onConflict: 'broker_origen' })

  return NextResponse.json({
    importacion_id: importacion.id,
    n_filas_procesadas: rows.length,
    n_filas_insertadas: insertadas?.length || 0,
    n_filas_omitidas: rows.length - normalizados.length,
  })
}
