// Sistema de @menciones en bitácora — alerta por Telegram al mencionado
// Cuando alguien escribe "@silvia" o "@jl" en una nota, les llega alerta directa.
//
// Para agregar el chat_id de Silvia o JL:
//   1. Pedirles que envíen cualquier mensaje al bot de Telegram
//   2. El bot imprimirá el chat_id en los logs, o usar getUpdates
//   3. Actualizar TEAM_HANDLES con el chat_id recibido

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

// ── Directorio del equipo ─────────────────────────────────────────────────────
// chat_id: null → aún no registrado (el bot los ignorará graciosamente)
const TEAM_HANDLES: Record<string, { name: string; chat_id: string | null }> = {
  'pato':      { name: 'Pato',      chat_id: '5816771550' },
  'patricio':  { name: 'Pato',      chat_id: '5816771550' },
  'silvia':    { name: 'Silvia',    chat_id: null },  // pendiente: pedirle que escriba al bot
  'jl':        { name: 'José Luis', chat_id: null },  // pendiente: pedirle que escriba al bot
  'jose luis': { name: 'José Luis', chat_id: null },
  'joseluís':  { name: 'José Luis', chat_id: null },
}

// ── Detección de @handles en texto ───────────────────────────────────────────

export function detectMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+)/g) || []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]  // únicos, sin @
}

// ── Envío de alerta ───────────────────────────────────────────────────────────

interface MentionContext {
  autor:     string        // quién escribió la nota
  proyecto:  string        // nombre del proyecto/inmueble
  contenido: string        // texto de la nota
  tipo?:     string        // 'nota' | 'oferta' | etc.
}

async function sendTelegramMsg(chat_id: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id, text, parse_mode: 'Markdown' }),
  }).catch(() => {})  // fire-and-forget, no bloquear la request principal
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Chequea si `contenido` contiene @menciones y envía alertas Telegram a cada mencionado.
 * Silencia errores — nunca debe romper el flujo principal.
 */
export async function checkAndSendMentions(
  contenido:  string,
  ctx:        MentionContext,
): Promise<void> {
  try {
    const handles = detectMentions(contenido)
    if (handles.length === 0) return

    for (const handle of handles) {
      const user = TEAM_HANDLES[handle]
      if (!user?.chat_id) continue  // no registrado aún → skip

      // No alertar a uno mismo
      const autorNorm = ctx.autor.toLowerCase()
      if (autorNorm === handle || autorNorm === user.name.toLowerCase()) continue

      const tipoLabel = ctx.tipo && ctx.tipo !== 'nota' ? ` [${ctx.tipo}]` : ''
      const text = [
        `📌 *Te mencionaron en ${ctx.proyecto}*${tipoLabel}`,
        ``,
        `*${ctx.autor}:* ${ctx.contenido}`,
        ``,
        `_Respondé desde el chat WOS3 o la bitácora del proyecto._`,
      ].join('\n')

      await sendTelegramMsg(user.chat_id, text)
    }
  } catch {
    // silencioso — nunca rompe el flujo
  }
}
