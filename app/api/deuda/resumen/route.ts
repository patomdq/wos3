import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const fmt = (n: number | null | undefined) => {
  if (n == null) return null
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}
const pct = (num: number, den: number) =>
  den > 0 ? `${((num / den) * 100).toFixed(0)}%` : null

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await req.json() as { id: string }
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { data: p, error } = await supabase
    .from('deuda_posiciones')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !p) return NextResponse.json({ error: 'Posición no encontrada' }, { status: 404 })

  // Construir contexto con todos los datos disponibles
  const lineas: string[] = []

  // Ubicación y tipo
  const ubicacion = [p.direccion, p.ciudad, p.provincia, p.ccaa].filter(Boolean).join(', ')
  if (ubicacion) lineas.push(`Ubicación: ${ubicacion}`)
  if (p.tipo_colateral || p.subtipo_colateral) lineas.push(`Colateral: ${[p.tipo_colateral, p.subtipo_colateral].filter(Boolean).join(' — ')}`)
  if (p.superficie_m2) lineas.push(`Superficie: ${p.superficie_m2} m²`)
  if (p.planta) lineas.push(`Planta: ${p.planta}`)
  if (p.vpo) lineas.push(`VPO: ${p.vpo}`)
  if (p.ref_catastral) lineas.push(`Referencia catastral: ${p.ref_catastral}`)

  // Deuda
  if (p.deuda_ob) lineas.push(`Deuda OB: ${fmt(p.deuda_ob)}`)
  if (p.deuda_tot) lineas.push(`Deuda total (con intereses/costas): ${fmt(p.deuda_tot)}`)
  if (p.asking_price) {
    lineas.push(`Asking price: ${fmt(p.asking_price)}`)
    if (p.deuda_tot) {
      const desc = pct(p.deuda_tot - p.asking_price, p.deuda_tot)
      if (desc) lineas.push(`Descuento sobre deuda total: ${desc}`)
    }
  } else {
    lineas.push('Asking price: sin precio todavía')
  }
  if (p.valor_colateral) lineas.push(`Valor de tasación del colateral: ${fmt(p.valor_colateral)}`)
  if (p.principal) lineas.push(`Principal: ${fmt(p.principal)}`)
  if (p.titular_deuda) lineas.push(`Titular de la deuda: ${p.titular_deuda}`)
  if (p.n_loans) lineas.push(`Número de préstamos: ${p.n_loans}`)

  // Cargas
  if (p.cargas_previas != null) {
    const excede = p.asking_price && p.cargas_previas > p.asking_price
    lineas.push(`Cargas previas: ${fmt(p.cargas_previas)}${excede ? ' ⚠ SUPERAN EL ASKING PRICE' : ''}`)
  }
  if (p.cargas_posteriores) lineas.push(`Cargas posteriores: ${fmt(p.cargas_posteriores)}`)

  // Estado judicial
  if (p.estado_judicial_normalizado) lineas.push(`Estado judicial: ${p.estado_judicial_normalizado}`)
  if (p.estado_judicial_raw) lineas.push(`Estado judicial (texto del broker): ${p.estado_judicial_raw}`)
  if (p.juzgado) lineas.push(`Juzgado: ${p.juzgado}`)
  if (p.num_autos) lineas.push(`Nº autos: ${p.num_autos}`)
  if (p.tipo_procedimiento) lineas.push(`Tipo de procedimiento: ${p.tipo_procedimiento}`)
  if (p.fecha_subasta) lineas.push(`Fecha de subasta: ${p.fecha_subasta}`)
  if (p.estado_subasta) lineas.push(`Estado de subasta: ${p.estado_subasta}`)
  if (p.resultado_subasta) lineas.push(`Resultado de subasta: ${p.resultado_subasta}`)
  if (p.id_portal_subasta) lineas.push(`ID portal de subasta: ${p.id_portal_subasta}`)

  // Ocupación
  if (p.ocupacion_broker) lineas.push(`Ocupación (broker): ${p.ocupacion_broker}`)
  if (p.ocupacion_estado) lineas.push(`Ocupación (clasificada): ${p.ocupacion_estado}`)

  // Estado y broker
  if (p.broker_origen) lineas.push(`Broker de origen: ${p.broker_origen}`)
  if (p.portfolio) lineas.push(`Portfolio: ${p.portfolio}`)
  if (p.bucket) lineas.push(`Bucket: ${p.bucket}`)
  if (p.subfase) lineas.push(`Subfase: ${p.subfase}`)
  if (p.estado_broker) lineas.push(`Estado broker: ${p.estado_broker}`)
  if (p.status_final) lineas.push(`Status final: ${p.status_final}`)
  if (p.estado_colateral) lineas.push(`Estado del colateral: ${p.estado_colateral}`)
  if (p.motivo_paralizacion) lineas.push(`Motivo de paralización: ${p.motivo_paralizacion}`)
  if (p.afectado_terceros) lineas.push(`Afectado por terceros: ${p.afectado_terceros}`)
  if (p.connection) lineas.push(`Connection: ${p.connection}`)

  const contexto = lineas.join('\n')

  const prompt = `Eres un analista senior de deuda NPL en España. Escribe una descripción concisa (máximo 4 oraciones, sin listas, en prosa fluida en español) que sirva como resumen de preanálisis de esta posición de deuda. Debe cubrir: qué es el activo y dónde está, cuál es la situación financiera clave (deuda, precio, descuento), qué riesgos o banderas rojas hay, y qué datos faltan para evaluar bien. Sé directo, sin frases de relleno.

Datos disponibles:
${contexto}`

  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const resumen = (msg.content[0] as any).text?.trim() || ''

  await supabase
    .from('deuda_posiciones')
    .update({ resumen_ia: resumen })
    .eq('id', id)

  return NextResponse.json({ resumen })
}
