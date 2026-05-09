import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { gcalListEvents } from '@/lib/googleCalendar'
import { getOrgAccessToken } from '@/lib/gcalToken'

export const maxDuration = 60

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID_PATO!
const TZ        = 'Europe/Madrid'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return 'datos incompletos'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M€`
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k€`
  return `${Math.round(n)}€`
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

async function tgSend(text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  })
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

interface Proyecto {
  id: string
  nombre: string
  estado: string
  tipo: string
  porcentaje_hasu: number
  precio_compra: number | null
  precio_venta_real: number | null
  fecha_compra: string | null
  fecha_entrada: string | null
  fecha_salida_estimada: string | null
  notas: string | null
  updated_at: string
}

async function fetchObjetivo(): Promise<{ acumulado: number | null; operaciones: number }> {
  // Closed operations — estado 'Vendido', 'vendido', 'cerrado', 'Cerrado', 'Vendida', 'vendida'
  const VENDIDO_ESTADOS = ['Vendido', 'vendido', 'cerrado', 'Cerrado', 'Vendida', 'vendida']
  const { data, error } = await supabase
    .from('proyectos')
    .select('precio_compra, precio_venta_real, porcentaje_hasu, tipo')
    .in('estado', VENDIDO_ESTADOS)

  if (error || !data) return { acumulado: null, operaciones: 0 }

  let total = 0
  let completos = 0
  for (const p of data) {
    if (p.precio_venta_real == null || p.precio_compra == null) continue
    const beneficio = p.precio_venta_real - p.precio_compra
    // Apply HASU share — 100% for pure HASU ops, partial for JV
    const share = (p.porcentaje_hasu ?? 100) / 100
    total += beneficio * share
    completos++
  }

  return { acumulado: completos > 0 ? total : null, operaciones: data.length }
}

async function fetchActivas(): Promise<Proyecto[]> {
  const EXCLUIR = ['Vendido', 'vendido', 'cerrado', 'Cerrado', 'Vendida', 'vendida', 'Radar', 'radar', 'descartado', 'Descartado']
  const { data, error } = await supabase
    .from('proyectos')
    .select('id, nombre, estado, tipo, porcentaje_hasu, precio_compra, precio_venta_real, fecha_compra, fecha_entrada, fecha_salida_estimada, notas, updated_at')
    .not('estado', 'in', `(${EXCLUIR.map(e => `"${e}"`).join(',')})`)
    .order('updated_at', { ascending: true })

  return (data as Proyecto[]) ?? []
}

async function fetchUltimaCompra(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('proyectos')
    .select('fecha_compra')
    .not('fecha_compra', 'is', null)
    .order('fecha_compra', { ascending: false })
    .limit(1)
    .single()

  if (error || !data?.fecha_compra) return null
  return new Date(data.fecha_compra)
}

async function fetchRadarCounts(): Promise<{ radar: number; estudio: number }> {
  const [{ count: radarCount }, { count: estudioCount }] = await Promise.all([
    supabase.from('inmuebles_radar').select('id', { count: 'exact', head: true }).eq('estado', 'activo'),
    supabase.from('inmuebles_estudio').select('id', { count: 'exact', head: true }).eq('estado', 'en_estudio'),
  ])
  return { radar: radarCount ?? 0, estudio: estudioCount ?? 0 }
}

async function fetchCalendarHoy(): Promise<string[]> {
  try {
    const token = await getOrgAccessToken()
    if (!token) return []

    const now = new Date()
    // Midnight Madrid → UTC
    const madridMidnight = new Date(now.toLocaleDateString('sv', { timeZone: TZ }) + 'T00:00:00')
    const madridEnd      = new Date(now.toLocaleDateString('sv', { timeZone: TZ }) + 'T23:59:59')

    const events = await gcalListEvents(token, madridMidnight.toISOString(), madridEnd.toISOString())
    return events.map(e => {
      const time = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
        : 'Todo el día'
      return `${time} — ${e.summary}`
    })
  } catch {
    return []
  }
}

// ── Foco del día via Claude ───────────────────────────────────────────────────

async function generarFoco(params: {
  acumulado: number | null
  diasSinCompra: number | null
  activas: Proyecto[]
  alertas: string[]
}): Promise<string> {
  const prompt = `Eres el asistente ejecutivo de Patricio Fávora, CEO de Wallest (Hasu Activos Inmobiliarios SL).
Objetivo empresa: 1M€ beneficio neto acumulado para diciembre 2027.

Datos de hoy:
- Acumulado: ${params.acumulado != null ? fmt(params.acumulado) : 'sin datos'}
- Días sin nueva compra: ${params.diasSinCompra ?? 'desconocido'}
- Operaciones activas: ${params.activas.map(p => `${p.nombre} (${p.estado})`).join(', ') || 'ninguna'}
- Alertas: ${params.alertas.join('; ') || 'ninguna'}

En UNA sola frase directa y sin adornos, dile cuál es la acción más importante que debe hacer hoy.
No uses "deberías", usa imperativo. Máximo 15 palabras.`

  try {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = res.content[0]
    return block.type === 'text' ? block.text.trim() : 'Revisa el pipeline y prioriza la próxima compra.'
  } catch {
    return 'Revisa el pipeline y prioriza la próxima compra.'
  }
}

// ── Message builder ───────────────────────────────────────────────────────────

function estadoEmoji(estado: string): string {
  const e = estado.toLowerCase()
  if (e.includes('reforma') || e.includes('obra')) return '🔨'
  if (e.includes('venta') || e.includes('vendiendo')) return '🏷️'
  if (e.includes('negoci') || e.includes('ofert')) return '🤝'
  if (e.includes('compra') || e.includes('comprado')) return '🔑'
  return '🔵'
}

function formatFechaClave(p: Proyecto): string | null {
  const f = p.fecha_salida_estimada || p.fecha_entrada
  if (!f) return null
  const d = new Date(f)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel cron requests include this header; also allow manual trigger with the secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    return NextResponse.json({ error: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID_PATO' }, { status: 500 })
  }

  try {
    const now = new Date()
    const diaStr = now.toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
    })
    // Capitalise first letter
    const diaFormato = diaStr.charAt(0).toUpperCase() + diaStr.slice(1)

    // Fetch all data in parallel
    const [objetivo, activas, ultimaCompra, radar, eventosHoy] = await Promise.all([
      fetchObjetivo(),
      fetchActivas(),
      fetchUltimaCompra(),
      fetchRadarCounts(),
      fetchCalendarHoy(),
    ])

    // ── Alertas ──
    const alertas: string[] = []

    // Días sin compra
    let diasSinCompra: number | null = null
    if (ultimaCompra) {
      diasSinCompra = Math.floor((now.getTime() - ultimaCompra.getTime()) / (1000 * 60 * 60 * 24))
      if (diasSinCompra > 30) {
        alertas.push(`🔴 ${diasSinCompra} días sin nueva compra`)
      }
    }

    // Proyectos sin movimiento > 14 días
    for (const p of activas) {
      const updatedAt = new Date(p.updated_at)
      const diasParados = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
      if (diasParados > 14) {
        alertas.push(`🔴 ${p.nombre} sin movimiento hace ${diasParados} días`)
      }
    }

    // Firma / salida próxima en < 7 días
    for (const p of activas) {
      if (p.fecha_salida_estimada) {
        const fecha = new Date(p.fecha_salida_estimada)
        const diasRestantes = Math.floor((fecha.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diasRestantes >= 0 && diasRestantes < 7) {
          alertas.push(`🟡 Fecha clave en ${diasRestantes} día(s): ${p.nombre}`)
        }
      }
    }

    // ── Foco del día ──
    const foco = await generarFoco({ acumulado: objetivo.acumulado, diasSinCompra, activas, alertas })

    // ── Armar mensaje ──
    const LINEA = '━━━━━━━━━━━━━━━━━━━━━━'
    const partes: string[] = []

    partes.push(`🏠 *WALLEST · Buenos días, Pato*`)
    partes.push(`📅 ${diaFormato}`)
    partes.push(LINEA)

    // Objetivo
    partes.push(`💰 *OBJETIVO 1M€*`)
    if (objetivo.acumulado != null) {
      const progreso = (objetivo.acumulado / 1_000_000) * 100
      partes.push(`Acumulado: ${fmt(objetivo.acumulado)} / 1.000.000€`)
      partes.push(`Progreso: ${pct(progreso)}`)
    } else {
      partes.push(`Acumulado: datos incompletos`)
    }
    partes.push(`Operaciones cerradas: ${objetivo.operaciones}`)
    partes.push(LINEA)

    // Operaciones activas
    partes.push(`📊 *OPERACIONES ACTIVAS*`)
    if (activas.length === 0) {
      partes.push(`Sin operaciones activas`)
    } else {
      for (const p of activas) {
        partes.push(`${estadoEmoji(p.estado)} *${p.nombre}* · ${p.estado}`)
        if (p.notas) partes.push(`   └ Próxima acción: ${p.notas.split('\n')[0].slice(0, 80)}`)
        const fechaClave = formatFechaClave(p)
        if (fechaClave) partes.push(`   └ Fecha clave: ${fechaClave}`)
      }
    }
    partes.push(LINEA)

    // Agenda
    partes.push(`📅 *AGENDA HOY*`)
    if (eventosHoy.length === 0) {
      partes.push(`Sin visitas registradas hoy`)
    } else {
      eventosHoy.forEach(e => partes.push(`• ${e}`))
    }
    partes.push(LINEA)

    // Alertas
    partes.push(`⚠️ *ALERTAS*`)
    if (alertas.length === 0) {
      partes.push(`Sin alertas`)
    } else {
      alertas.forEach(a => partes.push(a))
    }
    partes.push(LINEA)

    // Radar
    partes.push(`📍 *RADAR HOY*`)
    partes.push(`Inmuebles en evaluación: ${radar.radar}`)
    partes.push(`En Estudio: ${radar.estudio}`)
    partes.push(LINEA)

    // Foco
    partes.push(`💡 *FOCO DEL DÍA*`)
    partes.push(foco)

    await tgSend(partes.join('\n'))
    return NextResponse.json({ ok: true, sentAt: now.toISOString() })

  } catch (err) {
    console.error('[morning-briefing] Error:', err)
    await tgSend('⚠️ Error al leer datos. Revisar WOS3.').catch(() => {})
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
