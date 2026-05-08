import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { calcCostoTotal, calcROI, calcPrecioMaxCompra } from '@/lib/formulas'
import { scrapeIdealista } from '@/lib/scrape-idealista'

export const maxDuration = 60

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
const TG_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Telegram types ──────────────────────────────────────────────────────────

interface TgPhoto {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  file_size?: number
}

interface TgMessage {
  message_id: number
  from?: { id: number; first_name: string; last_name?: string; username?: string }
  chat: { id: number }
  text?: string
  caption?: string
  photo?: TgPhoto[]
}

interface TgUpdate {
  update_id: number
  message?: TgMessage
}

interface ExtractedData {
  direccion?: string | null
  precio_pedido?: number | null
  reforma_estimada?: number | null
  precio_venta_est?: number | null
  habitaciones?: number | null
  banos?: number | null
  metros?: number | null
  ciudad?: string | null
  descripcion?: string | null
}

// ── Telegram helpers ─────────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string) {
  const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}`
  try {
    await fetch(`${tgApi}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    })
  } catch (e) {
    console.error('sendMessage error:', e)
  }
}

async function getPhotoBase64(fileId: string): Promise<string | null> {
  const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}`
  try {
    const res = await fetch(`${tgApi}/getFile?file_id=${fileId}`)
    const json = await res.json()
    if (!json.ok) return null
    const fileRes = await fetch(`${TG_FILE_API}/${json.result.file_path}`, {
      signal: AbortSignal.timeout(10000),
    })
    const buffer = await fileRes.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch {
    return null
  }
}

// ── Claude extraction ─────────────────────────────────────────────────────────

const EXTRACT_PROMPT = `Extrae datos del mensaje sobre un inmueble. Responde SOLO con JSON válido, sin texto adicional.

Formato:
{
  "direccion": string o null,
  "precio_pedido": número en euros o null,
  "reforma_estimada": número en euros o null,
  "precio_venta_est": número en euros o null,
  "habitaciones": número entero o null,
  "banos": número entero o null,
  "metros": número o null,
  "ciudad": string o null,
  "descripcion": string o null
}

Reglas:
- precio_pedido = precio actual de venta/oferta
- precio_venta_est = precio al que se podría vender tras reforma
- "75k" = 75000, "120k" = 120000, "1.2M" = 1200000
- "piden 85" en contexto inmobiliario = 85000
- Si no hay info, pon null`

function parseJsonFromClaude(raw: string): ExtractedData {
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    return {}
  }
}

async function extractFromText(text: string): Promise<ExtractedData> {
  if (!text.trim()) return {}
  try {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: `${EXTRACT_PROMPT}\n\nMensaje: "${text}"` }],
    })
    const content = res.content[0]
    return content.type === 'text' ? parseJsonFromClaude(content.text) : {}
  } catch (e) {
    console.error('extractFromText error:', e)
    return {}
  }
}

async function extractFromImages(base64Images: string[], captionText?: string): Promise<ExtractedData> {
  try {
    const imageBlocks = base64Images.map(b64 => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: b64 },
    }))
    const contextNote = captionText ? `\n\nTexto adjunto: "${captionText}"` : ''
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: `${EXTRACT_PROMPT}${contextNote}\n\nAnaliza la${base64Images.length > 1 ? 's imágenes' : ' imagen'} y extrae todos los datos visibles.` },
        ],
      }],
    })
    const content = res.content[0]
    return content.type === 'text' ? parseJsonFromClaude(content.text) : {}
  } catch (e) {
    console.error('extractFromImages error:', e)
    return {}
  }
}

// ── ROI calculation & formatting ──────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return `${Math.round(n)}`
}

function buildResponse(data: ExtractedData, savedOk: boolean): string {
  const { direccion, precio_pedido, reforma_estimada, precio_venta_est } = data

  const header = [
    `📍 ${direccion || 'Inmueble sin dirección'}`,
    `💰 Precio pedido: ${precio_pedido ? fmt(precio_pedido) + '€' : 'No informado'}`,
  ].join('\n')

  const missing: string[] = []
  if (!precio_venta_est) missing.push('Precio de venta estimado no proporcionado')
  if (reforma_estimada == null) missing.push('Reforma estimada no proporcionada')

  const footer = savedOk
    ? '✅ Subido a Radar en WOS3'
    : '⚠️ Error al guardar en Radar — revisar WOS3'

  if (missing.length > 0 || !precio_pedido || !precio_venta_est) {
    const warn = missing.length > 0
      ? `\n\n⚠️ Faltan datos para calcular ROI:\n${missing.map(m => `- ${m}`).join('\n')}\n\n${footer} sin análisis — completar en WOS3`
      : `\n\n${footer}`
    return header + warn
  }

  const compra = precio_pedido
  const reforma = reforma_estimada ?? 0
  const venta = precio_venta_est

  const gastos = Math.floor(compra * 0.02) + 1000
  const costoTotal = calcCostoTotal(compra, reforma)
  const beneficio = venta - costoTotal
  const roi = calcROI(venta, compra, reforma) * 100

  let semaforo: string
  if (roi < 30) semaforo = '🔴 ROI < 30% — No entra según criterios Wallest'
  else if (roi <= 50) semaforo = '🟡 ROI 30-50% — Analizar bien antes de avanzar'
  else semaforo = '🟢 ROI > 50% — Operación fuerte'

  const max30 = calcPrecioMaxCompra(venta, reforma, 0.30)
  const max50 = calcPrecioMaxCompra(venta, reforma, 0.50)
  const max70 = calcPrecioMaxCompra(venta, reforma, 0.70)

  return [
    header,
    '',
    '📊 ANÁLISIS RÁPIDO',
    '──────────────────',
    `Coste total estimado: ${fmt(costoTotal)}€`,
    `  └ Compra: ${fmt(compra)}€`,
    `  └ Reforma: ${fmt(reforma)}€`,
    `  └ Gastos (ITP + notaría): ${fmt(gastos)}€`,
    '',
    `Precio venta estimado: ${fmt(venta)}€`,
    `Beneficio neto: ${fmt(beneficio)}€`,
    `ROI: ${roi.toFixed(1)}%`,
    '',
    semaforo,
    '',
    '💡 PRECIO MÁXIMO DE COMPRA',
    `Para ROI 30%: ${fmt(max30)}€`,
    `Para ROI 50%: ${fmt(max50)}€`,
    `Para ROI 70%: ${fmt(max70)}€`,
    '',
    footer,
  ].join('\n')
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not set' }, { status: 500 })
  }

  // Verify webhook secret
  if (WEBHOOK_SECRET) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token')
    if (incoming !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  let update: TgUpdate
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const message = update.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  const text = message.text || message.caption || ''
  const from = message.from
  const telegramUser = from
    ? [from.first_name, from.last_name].filter(Boolean).join(' ') +
      (from.username ? ` (@${from.username})` : '')
    : 'Desconocido'

  const urlMatch = text.match(/https?:\/\/(?:www\.)?(?:idealista\.com|fotocasa\.es)[^\s]*/i)
  const hasPhotos = !!(message.photo?.length)

  let data: ExtractedData = {}
  let origen: string
  let fotoIds: string[] = []

  try {
    if (urlMatch) {
      // Modo B — link de portal
      origen = 'telegram_link'
      const scraped = await scrapeIdealista(urlMatch[0])
      if ('error' in scraped) {
        data = await extractFromText(text)
      } else {
        data = {
          direccion: scraped.direccion,
          precio_pedido: scraped.precio,
          habitaciones: scraped.habitaciones,
          banos: scraped.banos,
          metros: scraped.superficie,
          ciudad: scraped.ciudad,
          descripcion: scraped.descripcion,
        }
        // Precio venta/reforma pueden venir junto al link en el texto
        const extra = await extractFromText(text.replace(urlMatch[0], '').trim())
        if (extra.precio_venta_est) data.precio_venta_est = extra.precio_venta_est
        if (extra.reforma_estimada != null) data.reforma_estimada = extra.reforma_estimada
      }
    } else if (hasPhotos) {
      // Modo A/C — fotos o capturas
      origen = 'telegram_captura'
      // message.photo is an array of sizes of the SAME photo — take the largest
      const largestPhoto = message.photo![message.photo!.length - 1]
      fotoIds = [largestPhoto.file_id]
      const base64 = await getPhotoBase64(largestPhoto.file_id)

      if (base64) {
        data = await extractFromImages([base64], text || undefined)
      } else {
        data = await extractFromText(text)
      }
    } else {
      // Modo A — texto libre
      origen = 'telegram_foto'
      data = await extractFromText(text)
    }

    // ROI fields
    let roi_calculado: number | null = null
    let precio_max_30: number | null = null
    let precio_max_50: number | null = null
    let precio_max_70: number | null = null
    let semaforo: string | null = null

    if (data.precio_pedido && data.precio_venta_est) {
      const compra = data.precio_pedido
      const reforma = data.reforma_estimada ?? 0
      const venta = data.precio_venta_est
      roi_calculado = calcROI(venta, compra, reforma) * 100
      precio_max_30 = calcPrecioMaxCompra(venta, reforma, 0.30)
      precio_max_50 = calcPrecioMaxCompra(venta, reforma, 0.50)
      precio_max_70 = calcPrecioMaxCompra(venta, reforma, 0.70)
      if (roi_calculado < 30) semaforo = 'rojo'
      else if (roi_calculado <= 50) semaforo = 'amarillo'
      else semaforo = 'verde'
    }

    // Save to Supabase
    const { error } = await supabase.from('inmuebles_radar').insert({
      titulo: data.direccion || text.slice(0, 80) || 'Telegram — sin título',
      direccion: data.direccion,
      ciudad: data.ciudad,
      precio: data.precio_pedido,
      habitaciones: data.habitaciones,
      superficie: data.metros,
      banos: data.banos,
      notas: data.descripcion,
      url: urlMatch?.[0] ?? null,
      fuente: origen,
      reforma_estimada: data.reforma_estimada,
      precio_venta_est: data.precio_venta_est,
      fotos: fotoIds.length > 0 ? fotoIds : null,
      roi_calculado,
      precio_max_30,
      precio_max_50,
      precio_max_70,
      semaforo,
      telegram_user: telegramUser,
      estado: 'activo',
      fecha_recibido: new Date().toISOString().split('T')[0],
    })

    if (error) console.error('Supabase insert error:', error)

    await sendMessage(chatId, buildResponse(data, !error))
  } catch (err) {
    console.error('Webhook error:', err)
    await sendMessage(chatId, '❌ Error procesando el mensaje. Intenta de nuevo.')
  }

  return NextResponse.json({ ok: true })
}
