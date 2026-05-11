// Sistema de notificaciones WOS3 — @menciones en bitácora
// Cuando alguien escribe @silvia en una nota, Silvia recibe:
//   1. Notificación dentro del WOS3 (campanita)
//   2. Email automático (como Trello)
// Sin Telegram. Sin dependencias externas salvo Resend.

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const RESEND_API_KEY = process.env.RESEND_API_KEY

// ── Detección de @handles ─────────────────────────────────────────────────────

export function detectMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+)/g) || []
  return [...new Set(matches.map(m => m.slice(1).toLowerCase()))]
}

// ── Lookup de usuario por handle en user_roles ────────────────────────────────

async function getUserByHandle(handle: string): Promise<{ email: string; nombre: string } | null> {
  const { data } = await supabaseAdmin
    .from('user_roles')
    .select('email, nombre')
    .eq('handle', handle)
    .single()
  return data || null
}

// ── Guardar notificación en Supabase (campanita in-app) ───────────────────────

async function saveNotification(
  para: { handle: string; email: string; nombre: string },
  ctx:  MentionContext
): Promise<void> {
  await supabaseAdmin.from('notifications').insert({
    para_handle: para.handle,
    para_email:  para.email,
    para_nombre: para.nombre,
    de_nombre:   ctx.autor,
    proyecto:    ctx.proyecto,
    contenido:   ctx.contenido,
    tipo:        ctx.tipo || 'nota',
  })
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendMentionEmail(
  to:      string,
  nombre:  string,
  ctx:     MentionContext
): Promise<void> {
  if (!RESEND_API_KEY) return

  const tipoLabel = ctx.tipo && ctx.tipo !== 'nota' ? ` · ${ctx.tipo}` : ''
  const subject   = `${ctx.autor} te mencionó en ${ctx.proyecto}`

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'WOS3 <onboarding@resend.dev>',
      to:      [to],
      subject,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" style="max-width:480px;" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr><td style="background:#141414;border-radius:20px 20px 0 0;padding:24px 24px 16px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:36px;height:36px;background:#F26E1F;border-radius:10px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-weight:900;font-size:16px;">W</span>
              </td>
              <td style="padding-left:10px;color:#888;font-size:13px;font-weight:600;">WOS3 · Wallest</td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#141414;padding:0 24px 24px;">
          <p style="margin:0 0 4px;color:#fff;font-size:22px;font-weight:900;">📌 Te mencionaron</p>
          <p style="margin:0 0 20px;color:#888;font-size:13px;">${ctx.proyecto}${tipoLabel}</p>

          <div style="background:#1E1E1E;border-radius:14px;padding:18px;margin-bottom:24px;">
            <p style="margin:0 0 8px;color:#F26E1F;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${ctx.autor}</p>
            <p style="margin:0;color:#fff;font-size:15px;line-height:1.6;">${ctx.contenido}</p>
          </div>

          <a href="https://wos3.vercel.app"
             style="display:block;background:#F26E1F;color:#fff;text-align:center;padding:14px;border-radius:12px;font-weight:900;font-size:14px;text-decoration:none;">
            Abrir WOS3 →
          </a>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0F0F0F;border-radius:0 0 20px 20px;padding:16px 24px;text-align:center;">
          <p style="margin:0;color:#444;font-size:11px;">Wallest · Hasu Activos Inmobiliarios SL</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
      `,
    }),
  }).catch(() => {})  // fire-and-forget
}

// ── API pública ───────────────────────────────────────────────────────────────

export interface MentionContext {
  autor:     string   // quién escribió
  proyecto:  string   // nombre del proyecto o inmueble
  contenido: string   // texto completo de la nota
  tipo?:     string   // 'nota' | 'oferta' | etc.
}

/**
 * Detecta @menciones en `contenido`, guarda notificación en Supabase
 * y envía email a cada usuario mencionado. Fire-and-forget — nunca rompe el flujo principal.
 */
export async function checkAndSendMentions(
  contenido: string,
  ctx:       MentionContext
): Promise<void> {
  try {
    const handles = detectMentions(contenido)
    if (handles.length === 0) return

    for (const handle of handles) {
      const user = await getUserByHandle(handle)
      if (!user) continue

      // No notificarse a uno mismo
      const autorNorm = ctx.autor.toLowerCase()
      if (
        user.nombre.toLowerCase().startsWith(autorNorm) ||
        autorNorm.startsWith(user.nombre.toLowerCase().split(' ')[0])
      ) continue

      // Guardar en DB + enviar email en paralelo
      await Promise.all([
        saveNotification({ handle, ...user }, ctx),
        sendMentionEmail(user.email, user.nombre, ctx),
      ])
    }
  } catch {
    // silencioso — nunca interrumpe
  }
}
