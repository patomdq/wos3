import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { calcCostoTotal, calcROI, calcPrecioMaxCompra } from '@/lib/formulas'
import { scrapeIdealista } from '@/lib/scrape-idealista'
import { buscarComparables } from '@/lib/search-comparables'

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

interface TgCallbackQuery {
  id: string
  from: { id: number; first_name: string }
  message?: { message_id: number; chat: { id: number }; text?: string }
  data?: string
}

interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
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

async function sendMessage(chatId: number, text: string, replyMarkup?: object) {
  const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}`
  try {
    await fetch(`${tgApi}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    })
  } catch (e) {
    console.error('sendMessage error:', e)
  }
}

async function editMessage(chatId: number, messageId: number, text: string) {
  const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}`
  try {
    await fetch(`${tgApi}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
    })
  } catch (e) {
    console.error('editMessage error:', e)
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}`
  try {
    await fetch(`${tgApi}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    })
  } catch (e) {
    console.error('answerCallbackQuery error:', e)
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

// Parse "75k", "75.000", "75000", "75" (context: real estate, assume thousands if < 1000)
function parsePrice(raw: string): number | null {
  const s = raw.replace(/\s/g, '').toLowerCase()
  const kMatch = s.match(/^([\d.,]+)k$/)
  if (kMatch) return Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000)
  const mMatch = s.match(/^([\d.,]+)m$/)
  if (mMatch) return Math.round(parseFloat(mMatch[1].replace(',', '.')) * 1_000_000)
  const plain = parseFloat(s.replace(/\./g, '').replace(',', '.'))
  if (isNaN(plain)) return null
  return plain < 1000 ? plain * 1000 : plain
}

// Regex-based fallback — works offline, no API call needed
function extractFromTextRegex(text: string): ExtractedData {
  const pricePattern = /[\d.,]+k?m?/gi

  // precio_pedido — "piden X", "precio X", "sale a X€", "X€"
  let precio_pedido: number | null = null
  const pidMatch = text.match(/(?:piden?|precio(?:\s+de\s+compra)?|sale\s+por|cuesta|oferta)\s+([\d.,]+\s*k?)/i)
  if (pidMatch) precio_pedido = parsePrice(pidMatch[1])

  // reforma_estimada — "reforma X", "reformar X", "arreglo X"
  let reforma_estimada: number | null = null
  const refMatch = text.match(/(?:reforma\s+(?:estimada?\s+)?|reformar\s+(?:por\s+)?|arreglo\s+)([\d.,]+\s*k?)/i)
  if (refMatch) reforma_estimada = parsePrice(refMatch[1])

  // precio_venta_est — "salir a X", "vender a X", "vale X", "puede salir"
  let precio_venta_est: number | null = null
  const ventaMatch = text.match(/(?:salir?\s+a\s+|vender?\s+(?:a\s+|por\s+)?|puede\s+salir\s+a\s+|venta\s+(?:estimada?\s+)?(?:a\s+|de\s+)?)([\d.,]+\s*k?)/i)
  if (ventaMatch) precio_venta_est = parsePrice(ventaMatch[1])

  // If still no precio_venta_est, look for other k-prices excluding reforma
  const allPrices = [...text.matchAll(/([\d.,]+\s*k)/gi)]
    .map(m => parsePrice(m[1]))
    .filter((p): p is number => p !== null && p !== reforma_estimada)
  if (allPrices.length >= 2 && !precio_venta_est) {
    const sorted = [...allPrices].sort((a, b) => a - b)
    if (!precio_pedido) precio_pedido = sorted[0]
    // Only set venta if it's clearly higher than asking price
    const maxPrice = sorted[sorted.length - 1]
    if (precio_pedido && maxPrice > precio_pedido) precio_venta_est = maxPrice
  }

  // direccion — street patterns + city after comma
  let direccion: string | null = null
  const streetMatch = text.match(/(?:C\/|Calle|Avd?a?\.?\s+|Plaza\s+|Paseo\s+|Ronda\s+|c\/)[^\n,\.]{3,50}/i)
  if (streetMatch) {
    direccion = streetMatch[0].trim()
  } else {
    // First meaningful segment before price info
    const firstPart = text.split(/\.\s+|\n/)[0].replace(/(piden|precio|reforma|sale|vende)[^]*$/i, '').trim()
    if (firstPart.length > 5) direccion = firstPart
  }

  // ciudad — after comma following address, or standalone city name
  let ciudad: string | null = null
  const cityMatch = text.match(/,\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{2,25})(?:\.|,|\s*\.|$)/m)
  if (cityMatch) ciudad = cityMatch[1].trim()

  // habitaciones / metros
  const habMatch = text.match(/(\d+)\s*hab/i)
  const metrosMatch = text.match(/(\d+)\s*m[²2]?(?:\s|$)/i)

  void pricePattern // suppress unused warning

  return {
    direccion: direccion || null,
    precio_pedido,
    reforma_estimada,
    precio_venta_est,
    habitaciones: habMatch ? parseInt(habMatch[1]) : null,
    banos: null,
    metros: metrosMatch ? parseInt(metrosMatch[1]) : null,
    ciudad,
    descripcion: null,
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
    // Fallback: regex extraction so the bot still works without AI
    return extractFromTextRegex(text)
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

function buildAnalysis(data: ExtractedData, ventaDesdeComparables?: { precio: number; precioM2: number | null }): string {
  const { direccion, precio_pedido, reforma_estimada, precio_venta_est } = data

  const header = [
    `📍 ${direccion || 'Inmueble sin dirección'}`,
    `💰 Precio pedido: ${precio_pedido ? fmt(precio_pedido) + '€' : 'No informado'}`,
  ].join('\n')

  const missing: string[] = []
  if (!precio_venta_est) missing.push('Precio de venta estimado no proporcionado')
  if (reforma_estimada == null) missing.push('Reforma estimada no proporcionada')

  if (missing.length > 0 || !precio_pedido || !precio_venta_est) {
    return header + `\n\n⚠️ Faltan datos para el ROI:\n${missing.map(m => `- ${m}`).join('\n')}`
  }

  const comparablesNote = ventaDesdeComparables
    ? `\n📊 Precio venta estimado por comparables Fotocasa${ventaDesdeComparables.precioM2 ? ` (${ventaDesdeComparables.precioM2}€/m²)` : ''}`
    : ''

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
    comparablesNote,
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
  ].filter(l => l !== undefined).join('\n')
}

// ── Callback query handler (botones inline) ──────────────────────────────────

async function handleCallbackQuery(cb: TgCallbackQuery) {
  const chatId = cb.message?.chat.id
  const messageId = cb.message?.message_id
  if (!chatId || !messageId || !cb.data) return

  const [action, id] = cb.data.split(':')

  if (action === 'confirm') {
    const { error } = await supabase
      .from('inmuebles_radar')
      .update({ estado: 'activo' })
      .eq('id', id)
      .eq('estado', 'pendiente_tg')

    if (error) {
      await answerCallbackQuery(cb.id, '❌ Error al confirmar')
    } else {
      await answerCallbackQuery(cb.id, '✅ Subido al Radar')
      await editMessage(chatId, messageId, (cb.message?.text || '') + '\n\n✅ Subido a Radar en WOS3')
    }
  } else if (action === 'discard') {
    const { error } = await supabase
      .from('inmuebles_radar')
      .delete()
      .eq('id', id)
      .eq('estado', 'pendiente_tg')

    if (error) {
      await answerCallbackQuery(cb.id, '❌ Error al descartar')
    } else {
      await answerCallbackQuery(cb.id, '🗑️ Descartado')
      await editMessage(chatId, messageId, (cb.message?.text || '') + '\n\n🗑️ Descartado — no subido al Radar')
    }
  }
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

  // Handle button presses
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    return NextResponse.json({ ok: true })
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

    // Auto-estimate sale price from comparables if not provided
    let ventaDesdeComparables: { precio: number; precioM2: number | null } | undefined
    if (!data.precio_venta_est && data.ciudad && data.metros) {
      try {
        const res = await buscarComparables(data.ciudad, data.metros, data.habitaciones ?? undefined)
        if (res.precioSugerido) {
          data.precio_venta_est = res.precioSugerido
          ventaDesdeComparables = { precio: res.precioSugerido, precioM2: res.precioMedioM2 }
        }
      } catch (e) {
        console.error('buscarComparables error:', e)
      }
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

    // Save as pending — waits for user confirmation before appearing in Radar
    const { data: inserted, error } = await supabase
      .from('inmuebles_radar')
      .insert({
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
        estado: 'pendiente_tg',
        fecha_recibido: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      await sendMessage(chatId, buildAnalysis(data, ventaDesdeComparables) + '\n\n❌ Error al guardar — intenta de nuevo.')
      return NextResponse.json({ ok: true })
    }

    const recordId = inserted.id
    const analysisText = buildAnalysis(data, ventaDesdeComparables)
    const replyMarkup = {
      inline_keyboard: [[
        { text: '✅ Subir al Radar', callback_data: `confirm:${recordId}` },
        { text: '🗑️ Descartar', callback_data: `discard:${recordId}` },
      ]],
    }
    await sendMessage(chatId, analysisText, replyMarkup)
  } catch (err) {
    console.error('Webhook error:', err)
    await sendMessage(chatId, '❌ Error procesando el mensaje. Intenta de nuevo.')
  }

  return NextResponse.json({ ok: true })
}
