import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { calcCostoTotal, calcROI, calcPrecioMaxCompra } from '@/lib/formulas'
import { scrapeIdealista } from '@/lib/scrape-idealista'
import { buscarComparables } from '@/lib/search-comparables'
import { gcalCreateEvent, gcalDeleteEvent, gcalListEvents } from '@/lib/googleCalendar'
import { getOrgAccessToken } from '@/lib/gcalToken'

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

interface TgVoice {
  file_id: string
  duration: number
  mime_type?: string
  file_size?: number
}

interface TgMessage {
  message_id: number
  from?: { id: number; first_name: string; last_name?: string; username?: string }
  chat: { id: number }
  text?: string
  caption?: string
  photo?: TgPhoto[]
  voice?: TgVoice
  audio?: TgVoice
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
  duracion_meses?: number | null
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

async function transcribeAudio(fileId: string, mimeType?: string): Promise<string | null> {
  const tgApi = `https://api.telegram.org/bot${BOT_TOKEN}`
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return null
  try {
    const fileRes = await fetch(`${tgApi}/getFile?file_id=${fileId}`)
    const fileJson = await fileRes.json()
    if (!fileJson.ok) return null
    const audioRes = await fetch(`${TG_FILE_API}/${fileJson.result.file_path}`, {
      signal: AbortSignal.timeout(15000),
    })
    const audioBuffer = await audioRes.arrayBuffer()
    const ext = mimeType?.includes('ogg') ? 'ogg' : mimeType?.includes('mp4') ? 'mp4' : 'ogg'
    const form = new FormData()
    form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/ogg' }), `audio.${ext}`)
    form.append('model', 'whisper-1')
    form.append('language', 'es')
    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    })
    if (!whisperRes.ok) {
      console.error('Whisper error:', whisperRes.status, await whisperRes.text())
      return null
    }
    const json = await whisperRes.json()
    return json.text || null
  } catch (e: unknown) {
    console.error('transcribeAudio error:', (e as { message?: string })?.message)
    return null
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
  "descripcion": string o null,
  "duracion_meses": número entero o null
}

Reglas:
- precio_pedido = precio actual de venta/oferta
- precio_venta_est = precio al que se podría vender tras reforma
- "75k" = 75000, "120k" = 120000, "1.2M" = 1200000
- "piden 85" en contexto inmobiliario = 85000
- duracion_meses = duración estimada de la operación ("6 meses" → 6, "1 año" → 12, "2 años" → 24)
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
    const firstPart = text.split(/\.\s+|\n/)[0]
      .replace(/(piden|precio|reforma|sale|vende)[^]*$/i, '')
      .replace(/,?\s*\d[\d.,]*\s*(?:m[²2]|hab|k\b)[^]*/gi, '')
      .trim()
    if (firstPart.length > 5) direccion = firstPart
  }

  // ciudad — after comma following address, or "en Ciudad" pattern
  let ciudad: string | null = null
  const cityMatch = text.match(/,\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{2,25})(?:\.|,|\s*\.|$)/m)
  if (cityMatch) {
    ciudad = cityMatch[1].trim()
  } else {
    const enMatch = text.match(/\ben\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{2,25})(?:,|\.|\s*$)/i)
    if (enMatch) ciudad = enMatch[1].trim()
  }

  // Use ciudad as direccion fallback
  if (!direccion && ciudad) direccion = ciudad

  // habitaciones / metros / duración
  const habMatch = text.match(/(\d+)\s*hab/i)
  const metrosMatch = text.match(/(\d{2,4})\s*m[²2]/i)
  const mesesMatch = text.match(/(\d+)\s*mes(?:es)?/i)
  const aniosMatch = text.match(/(\d+)\s*a[ñn]o[s]?/i)
  let duracion_meses: number | null = null
  if (mesesMatch) duracion_meses = parseInt(mesesMatch[1])
  else if (aniosMatch) duracion_meses = parseInt(aniosMatch[1]) * 12

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
    duracion_meses,
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
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string; error?: unknown }
    console.error('extractFromText error:', JSON.stringify({ status: err?.status, message: err?.message, error: err?.error }))
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
  if (n >= 1000) {
    const k = n / 1000
    return (Number.isInteger(k) || k >= 10) ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
  }
  return `${Math.round(n)}`
}

interface VentaComparables {
  precio: number
  precioM2: number | null
  fuente: string
  precioNotariadoM2: number | null
  fuenteNotariado: string | null
}

function buildAnalysis(data: ExtractedData, ventaDesdeComparables?: VentaComparables): string {
  const { direccion, precio_pedido, reforma_estimada, precio_venta_est } = data

  const header = [
    `📍 ${direccion || data.ciudad || 'Inmueble sin dirección'}`,
    `💰 Precio pedido: ${precio_pedido ? fmt(precio_pedido) + '€' : 'No informado'}`,
  ].join('\n')

  // Build market reference lines — shown regardless of whether ROI can be calculated
  let comparablesNote = ''
  if (ventaDesdeComparables) {
    const lines: string[] = []
    const { fuente, precioM2, precioNotariadoM2, fuenteNotariado } = ventaDesdeComparables

    if (fuente === 'fotocasa' && precioM2) {
      const surfLabel = data.metros ? ` pisos ~${data.metros}m²` : ''
      lines.push(`📊 Fotocasa${surfLabel}: ${precioM2}€/m² ⚠️ precio oferta`)
    }

    if (precioNotariadoM2 && fuenteNotariado) {
      const notLabel =
        fuenteNotariado === 'notariado_municipio' ? 'Notariado municipio — cierres reales (mar25-feb26)' :
        fuenteNotariado === 'notariado_provincia' ? 'Notariado provincia — cierres reales (mar25-feb26)' :
        fuenteNotariado === 'tabla_referencia_municipio' ? 'MITMA municipio' :
        'MITMA provincia'
      lines.push(`📊 ${notLabel}: ${precioNotariadoM2}€/m²`)
    }

    if (fuente !== 'fotocasa' && !precioNotariadoM2 && precioM2) {
      const fuenteLabel =
        fuente === 'notariado_municipio' ? 'Notariado — cierres reales (mar25-feb26)' :
        fuente === 'notariado_provincia' ? 'Notariado provincia — cierres reales (mar25-feb26)' :
        fuente === 'tabla_referencia_municipio' ? 'MITMA municipio' :
        fuente === 'tabla_referencia_provincia' ? 'MITMA provincia' :
        'Fotocasa ⚠️ precio oferta'
      lines.push(`📊 ${fuenteLabel}: ${precioM2}€/m²`)
    }

    if (lines.length > 0) comparablesNote = '\n' + lines.join('\n')
  }

  const missing: string[] = []
  if (!precio_venta_est) missing.push('Precio de venta estimado no proporcionado')
  if (reforma_estimada == null) missing.push('Reforma estimada no proporcionada')

  if (missing.length > 0 || !precio_pedido || !precio_venta_est) {
    return header + comparablesNote + `\n\n⚠️ Faltan datos para el ROI:\n${missing.map(m => `- ${m}`).join('\n')}`
  }

  const compra = precio_pedido
  const reforma = reforma_estimada ?? 0
  const venta = precio_venta_est

  const itp = Math.floor(compra * 0.02)
  const notariaRegistro = 1000
  const costoTotal = calcCostoTotal(compra, reforma)
  const beneficio = venta - costoTotal
  const roi = calcROI(venta, compra, reforma) * 100

  const duracion = data.duracion_meses ?? null
  const roiAnualizado = duracion && duracion > 0
    ? (Math.pow(1 + roi / 100, 12 / duracion) - 1) * 100
    : null

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
    `  └ Notaría + Registro: ${fmt(notariaRegistro)}€`,
    `  └ ITP (2%): ${fmt(itp)}€`,
    '',
    `Precio venta estimado: ${fmt(venta)}€`,
    `Beneficio neto: ${fmt(beneficio)}€`,
    `ROI total: ${roi.toFixed(1)}%`,
    roiAnualizado !== null ? `ROI anualizado (${duracion}m): ${roiAnualizado.toFixed(1)}%` : null,
    '',
    semaforo,
    '',
    '💡 PRECIO MÁXIMO DE COMPRA',
    `Para ROI 30%: ${fmt(max30)}€`,
    `Para ROI 50%: ${fmt(max50)}€`,
    `Para ROI 70%: ${fmt(max70)}€`,
  ].filter((l): l is string => l !== null && l !== undefined).join('\n')
}

// ── Agenda helpers ────────────────────────────────────────────────────────────

type TaskState = 'pendiente' | 'en_proceso' | 'hecho'
const TASK_STATE_NEXT: Record<TaskState, TaskState> = { pendiente: 'en_proceso', en_proceso: 'hecho', hecho: 'pendiente' }
const TASK_STATE_ICON: Record<TaskState, string>    = { pendiente: '○', en_proceso: '◑', hecho: '✓' }
const TASK_STATE_LABEL: Record<TaskState, string>   = { pendiente: 'Pendiente', en_proceso: 'En proceso', hecho: 'Hecho' }

function addOneHour(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const CALENDAR_KEYWORDS = /\b(agenda\s+(?!en\s+bitácora|una?\s+nota|apunta)|crea\s+evento|nuevo\s+evento|nueva\s+cita|cancela\s+evento|borra\s+evento|elimina\s+evento|modifica\s+evento|qué\s+tengo|próximos?\s+eventos?|eventos?\s+(de\s+)?(hoy|mañana|esta\s+semana)|tengo\s+(algo\s+)?(hoy|mañana)|qué\s+(hay|eventos?)\s+(hoy|mañana|esta\s+semana))\b/i
const TASK_KEYWORDS     = /\b(nueva\s+tarea|tarea\s+personal|tarea\s+(de\s+)?trabajo|marca\s+(la\s+)?tarea|borra\s+(la\s+)?tarea|elimina\s+(la\s+)?tarea|mis\s+tareas|lista\s+(de\s+)?tareas?|agrega?\s+tarea)\b/i

async function handleCalendarCommand(chatId: number, text: string): Promise<boolean> {
  if (!CALENDAR_KEYWORDS.test(text)) return false

  const today = new Date().toISOString().split('T')[0]
  let intent: { accion: string; titulo?: string; fecha?: string; hora_inicio?: string; hora_fin?: string; descripcion?: string; todo_el_dia?: boolean; titulo_buscar?: string } = { accion: 'crear' }

  try {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: `Extrae acción e info del evento del siguiente mensaje. Hoy es ${today} (zona horaria Europe/Madrid). Responde SOLO JSON válido sin texto extra.

Formato:
{
  "accion": "crear" | "eliminar" | "listar",
  "titulo": "título del evento o null",
  "fecha": "YYYY-MM-DD o null. Para 'listar': si el usuario dice 'hoy', 'mañana', 'el lunes', etc., calculá la fecha exacta y ponla aquí. Si no especifica día (ej: 'próximos eventos'), dejá null.",
  "hora_inicio": "HH:MM o null",
  "hora_fin": "HH:MM o null",
  "descripcion": "descripción o null",
  "todo_el_dia": true | false,
  "titulo_buscar": "nombre aproximado del evento a eliminar o null"
}

Mensaje: "${text.replace(/"/g, "'")}"` }],
    })
    const c = res.content[0]
    if (c.type === 'text') intent = JSON.parse(c.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch (e) {
    console.error('handleCalendarCommand intent error:', e)
    return false
  }

  const accessToken = await getOrgAccessToken()
  if (!accessToken) {
    await sendMessage(chatId, '❌ Google Calendar no está conectado. Conectalo desde WOS3 > Calendario.')
    return true
  }

  if (intent.accion === 'crear') {
    if (!intent.titulo || !intent.fecha) {
      await sendMessage(chatId, '❌ Necesito título y fecha para crear el evento.')
      return true
    }
    const horaInicio = intent.hora_inicio || '10:00'
    const horaFin    = intent.hora_fin    || addOneHour(horaInicio)
    const startDT = intent.todo_el_dia ? intent.fecha : `${intent.fecha}T${horaInicio}:00`
    const endDT   = intent.todo_el_dia ? intent.fecha : `${intent.fecha}T${horaFin}:00`
    const event = await gcalCreateEvent(accessToken, {
      title: intent.titulo,
      description: intent.descripcion || '',
      startDateTime: startDT,
      endDateTime: endDT,
      allDay: intent.todo_el_dia ?? false,
    })
    if (event) {
      const timeStr = intent.todo_el_dia ? 'Todo el día' : `${horaInicio} → ${horaFin}`
      await sendMessage(chatId, `✅ Evento creado\n\n📅 *${intent.titulo}*\n📆 ${intent.fecha} · ${timeStr}${intent.descripcion ? `\n📝 ${intent.descripcion}` : ''}`)
    } else {
      await sendMessage(chatId, '❌ Error al crear el evento. Intenta de nuevo.')
    }
    return true
  }

  if (intent.accion === 'eliminar') {
    if (!intent.titulo_buscar) {
      await sendMessage(chatId, '❌ Dime el nombre del evento a eliminar.')
      return true
    }
    const tMin = new Date().toISOString()
    const tMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    const events = await gcalListEvents(accessToken, tMin, tMax)
    const match = events.find(e => e.summary?.toLowerCase().includes(intent.titulo_buscar!.toLowerCase()))
    if (!match) {
      await sendMessage(chatId, `❌ No encontré "${intent.titulo_buscar}" en los próximos 60 días.`)
      return true
    }
    const deleted = await gcalDeleteEvent(accessToken, match.id)
    await sendMessage(chatId, deleted ? `🗑️ Evento eliminado: "${match.summary}"` : '❌ Error al eliminar el evento.')
    return true
  }

  if (intent.accion === 'listar') {
    // Si Claude resolvió una fecha concreta (hoy, mañana), usar solo ese día
    const targetDate = intent.fecha || null
    let tMin: string, tMax: string, label: string
    if (targetDate) {
      tMin = new Date(targetDate + 'T00:00:00').toISOString()
      tMax = new Date(targetDate + 'T23:59:59').toISOString()
      label = targetDate === today ? 'hoy' : targetDate
    } else {
      tMin = new Date().toISOString()
      tMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      label = 'los próximos 7 días'
    }
    const events = await gcalListEvents(accessToken, tMin, tMax)
    if (events.length === 0) { await sendMessage(chatId, `📅 Sin eventos para ${label}.`); return true }
    const lines = events.slice(0, 15).map(e => {
      const time = e.start.dateTime
        ? new Date(e.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
        : 'Todo el día'
      return `📍 ${time} — ${e.summary || 'Sin título'}`
    })
    const header = targetDate ? `📅 Eventos del ${label}:` : `📅 Próximos eventos:`
    await sendMessage(chatId, `${header}\n\n${lines.join('\n')}`)
    return true
  }

  return false
}

async function handleTaskCommand(chatId: number, text: string): Promise<boolean> {
  if (!TASK_KEYWORDS.test(text)) return false

  let intent: { accion: string; titulo?: string; categoria?: string; estado?: string; titulo_buscar?: string } = { accion: 'crear' }

  try {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Extrae acción e info de tarea del siguiente mensaje. Responde SOLO JSON válido sin texto extra.

Formato:
{
  "accion": "crear" | "actualizar" | "eliminar" | "listar",
  "titulo": "título de la tarea o null",
  "categoria": "personal" | "trabajo",
  "estado": "pendiente" | "en_proceso" | "hecho" (para actualizar),
  "titulo_buscar": "texto parcial para buscar la tarea (actualizar/eliminar) o null"
}

Mensaje: "${text.replace(/"/g, "'")}"` }],
    })
    const c = res.content[0]
    if (c.type === 'text') intent = JSON.parse(c.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch (e) {
    console.error('handleTaskCommand intent error:', e)
    return false
  }

  if (intent.accion === 'crear') {
    if (!intent.titulo) { await sendMessage(chatId, '❌ Dime el título de la tarea.'); return true }
    const cat = (intent.categoria === 'trabajo' ? 'trabajo' : 'personal') as 'personal' | 'trabajo'
    const { error } = await supabase.from('agenda_tasks').insert({ title: intent.titulo, category: cat, status: 'pendiente' })
    if (error) { await sendMessage(chatId, '❌ Error al crear la tarea.') }
    else { await sendMessage(chatId, `✅ Tarea creada\n\n○ ${intent.titulo}\n📂 ${cat === 'trabajo' ? 'Trabajo' : 'Personal'} · Pendiente`) }
    return true
  }

  if (intent.accion === 'actualizar') {
    if (!intent.titulo_buscar) { await sendMessage(chatId, '❌ Dime cuál tarea actualizar.'); return true }
    const { data: found } = await supabase.from('agenda_tasks').select('id, title, status').ilike('title', `%${intent.titulo_buscar}%`).limit(1).single()
    if (!found) { await sendMessage(chatId, `❌ No encontré tarea con "${intent.titulo_buscar}".`); return true }
    const currentState = found.status as TaskState
    const newStatus = (intent.estado as TaskState) || TASK_STATE_NEXT[currentState]
    const { error } = await supabase.from('agenda_tasks').update({ status: newStatus }).eq('id', found.id)
    if (error) { await sendMessage(chatId, '❌ Error al actualizar la tarea.') }
    else { await sendMessage(chatId, `${TASK_STATE_ICON[newStatus]} Tarea actualizada\n\n${found.title} → ${TASK_STATE_LABEL[newStatus]}`) }
    return true
  }

  if (intent.accion === 'eliminar') {
    if (!intent.titulo_buscar) { await sendMessage(chatId, '❌ Dime cuál tarea eliminar.'); return true }
    const { data: found } = await supabase.from('agenda_tasks').select('id, title').ilike('title', `%${intent.titulo_buscar}%`).limit(1).single()
    if (!found) { await sendMessage(chatId, `❌ No encontré tarea con "${intent.titulo_buscar}".`); return true }
    const { error } = await supabase.from('agenda_tasks').delete().eq('id', found.id)
    if (error) { await sendMessage(chatId, '❌ Error al eliminar la tarea.') }
    else { await sendMessage(chatId, `🗑️ Tarea eliminada: "${found.title}"`) }
    return true
  }

  if (intent.accion === 'listar') {
    let q = supabase.from('agenda_tasks').select('title, category, status').neq('status', 'hecho').order('created_at')
    if (intent.categoria) q = q.eq('category', intent.categoria)
    const { data: tasks } = await q.limit(20)
    if (!tasks || tasks.length === 0) { await sendMessage(chatId, '📋 No hay tareas pendientes.'); return true }
    const lines = tasks.map(t => `${TASK_STATE_ICON[t.status as TaskState]} [${t.category}] ${t.title}`)
    await sendMessage(chatId, `📋 Tareas pendientes:\n\n${lines.join('\n')}`)
    return true
  }

  return false
}

// ── Bitácora handler ─────────────────────────────────────────────────────────

const NOTE_KEYWORDS = /\b(bita[ck]ora|agrega|anota|apunta|actualiza|oferta|avance|seguimiento|nota)\b/i

async function handleBitacora(chatId: number, text: string, autor: string): Promise<boolean> {
  if (!NOTE_KEYWORDS.test(text)) return false

  // Extract property reference + note from Claude
  let extracted: { inmueble: string | null; tipo: string | null; contenido: string | null } = { inmueble: null, tipo: null, contenido: null }
  try {
    const res = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Del siguiente mensaje extrae la referencia al inmueble y el contenido de la nota. Responde SOLO con JSON válido.

Formato:
{
  "inmueble": "descripción del inmueble mencionado (ciudad, tipo, nombre) o null",
  "tipo": "oferta | visita | negociacion | nota | otro",
  "contenido": "texto de la nota a registrar"
}

Mensaje: "${text}"`,
      }],
    })
    const c = res.content[0]
    if (c.type === 'text') extracted = JSON.parse(c.text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  } catch (e) {
    console.error('handleBitacora claude error:', e)
    return false
  }

  if (!extracted.contenido) return false

  // Search inmuebles_estudio first, then inmuebles_radar
  const terms = extracted.inmueble?.split(/\s+/).filter(w => w.length > 2) ?? []
  const likeFilters = terms.map(t => `titulo.ilike.%${t}%,ciudad.ilike.%${t}%`).join(',')

  let estudioId: string | null = null
  let radarId: string | null = null
  let nombreInmueble = extracted.inmueble ?? 'inmueble'

  if (likeFilters) {
    const { data: estudio } = await supabase
      .from('inmuebles_estudio')
      .select('id, titulo, ciudad')
      .or(likeFilters)
      .limit(1)
      .single()
    if (estudio) { estudioId = estudio.id; nombreInmueble = estudio.titulo ?? estudio.ciudad ?? nombreInmueble }
  }

  if (!estudioId && likeFilters) {
    const { data: radar } = await supabase
      .from('inmuebles_radar')
      .select('id, titulo, ciudad')
      .or(likeFilters)
      .neq('estado', 'pendiente_tg')
      .limit(1)
      .single()
    if (radar) { radarId = radar.id; nombreInmueble = radar.titulo ?? radar.ciudad ?? nombreInmueble }
  }

  if (!estudioId && !radarId) {
    await sendMessage(chatId, `❌ No encontré "${extracted.inmueble}" en el Radar ni en Estudio. Verificá el nombre.`)
    return true
  }

  const fecha = new Date().toISOString()
  const tipo = extracted.tipo ?? 'nota'
  const contenido = extracted.contenido

  if (estudioId) {
    const { error } = await supabase.from('bitacora_estudio').insert({
      estudio_id: estudioId, fecha, tipo, contenido, autor,
    })
    if (error) {
      console.error('bitacora_estudio insert error:', JSON.stringify(error))
      await sendMessage(chatId, `❌ Error al guardar en bitácora: ${error.message}`)
      return true
    }
  } else if (radarId) {
    // Radar no tiene tabla bitácora — appenda a notas
    const { data: r } = await supabase.from('inmuebles_radar').select('notas').eq('id', radarId).single()
    const notasActuales = r?.notas ?? ''
    const nuevaNota = `[${new Date().toLocaleDateString('es-ES')}] ${contenido}`
    await supabase.from('inmuebles_radar').update({ notas: notasActuales ? `${notasActuales}\n${nuevaNota}` : nuevaNota }).eq('id', radarId)
  }

  await sendMessage(chatId, `✅ Anotado en bitácora de "${nombreInmueble}"\n\n📝 ${contenido}`)
  return true
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
      const informeUrl = `https://wos3.vercel.app/informe/radar/${id}`
      await editMessage(
        chatId, messageId,
        (cb.message?.text || '') + `\n\n✅ Subido a Radar en WOS3\n\n📄 Informe para socio:\n${informeUrl}`
      )
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

  const urlMatch = text.match(/https?:\/\/[^\s]+(?:idealista\.com|fotocasa\.es|solvia\.es|habitaclia\.com|pisos\.com|inmobiliaria|kyero\.com|thinkspain\.com|yaencontre\.com|hogaria\.net|tecnocasa\.es|century21|remax\.es|engel|savills)[^\s]*/i)
    ?? text.match(/https?:\/\/[^\s]{20,}/i)
  const hasPhotos = !!(message.photo?.length)

  // Calendar events
  try {
    const handled = await handleCalendarCommand(chatId, text)
    if (handled) return NextResponse.json({ ok: true })
  } catch (e) { console.error('handleCalendarCommand error:', e) }

  // Tasks
  try {
    const handled = await handleTaskCommand(chatId, text)
    if (handled) return NextResponse.json({ ok: true })
  } catch (e) { console.error('handleTaskCommand error:', e) }

  // Bitácora — detect note commands and route before new-entry processing
  try {
    const handled = await handleBitacora(chatId, text, telegramUser)
    if (handled) return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('handleBitacora error:', e)
  }

  let data: ExtractedData = {}
  let origen: string
  let fotoIds: string[] = []

  try {
    if (urlMatch) {
      // Modo B — link de portal
      const urlStr = urlMatch[0]
      const portalMap: Record<string, string> = {
        'idealista': 'idealista', 'fotocasa': 'fotocasa', 'solvia': 'solvia',
        'habitaclia': 'habitaclia', 'pisos.com': 'pisos', 'kyero': 'kyero',
        'yaencontre': 'yaencontre', 'tecnocasa': 'tecnocasa', 'century21': 'century21',
        'remax': 'remax', 'engel': 'engel', 'savills': 'savills',
      }
      const detectedPortal = Object.entries(portalMap).find(([k]) => urlStr.includes(k))?.[1] ?? 'portal'
      origen = `telegram_${detectedPortal}`
      const scraped = await scrapeIdealista(urlStr)
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
        const extra = await extractFromText(text.replace(urlStr, '').trim())
        if (extra.precio_venta_est) data.precio_venta_est = extra.precio_venta_est
        if (extra.reforma_estimada != null) data.reforma_estimada = extra.reforma_estimada
      }
    } else if (message.voice || message.audio) {
      // Modo D — audio / nota de voz
      origen = 'telegram_foto'
      const audioMsg = message.voice || message.audio!
      await sendMessage(chatId, '🎙️ Procesando audio...')
      const transcript = await transcribeAudio(audioMsg.file_id, audioMsg.mime_type)
      if (transcript) {
        data = await extractFromText(transcript)
        if (!data.descripcion) data.descripcion = transcript.slice(0, 300)
      } else {
        await sendMessage(chatId, '❌ No pude transcribir el audio. Enviá el mensaje como texto.')
        return NextResponse.json({ ok: true })
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
    let ventaDesdeComparables: VentaComparables | undefined
    if (!data.precio_venta_est && data.ciudad && data.metros) {
      try {
        const res = await buscarComparables(data.ciudad, data.metros, data.habitaciones ?? undefined)
        if (res.precioMedioM2 || res.precioNotariadoM2) {
          ventaDesdeComparables = {
            precio: res.precioSugerido ?? 0,
            precioM2: res.precioMedioM2,
            fuente: res.fuente,
            precioNotariadoM2: res.precioNotariadoM2,
            fuenteNotariado: res.fuenteNotariado,
          }
        }
        // Only auto-fill precio_venta_est when Fotocasa estimate is meaningfully above purchase price
        // (avoids ROI calc on mixed unreformed/reformed market data)
        const minVenta = (data.precio_pedido ?? 0) * 1.1
        if (res.precioSugerido && res.fuente === 'fotocasa' && res.precioSugerido > minVenta) {
          data.precio_venta_est = res.precioSugerido
        }
      } catch (e: unknown) {
        const err = e as { message?: string }
        console.error('buscarComparables error:', err?.message)
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
        duracion_meses: data.duracion_meses ?? null,
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
