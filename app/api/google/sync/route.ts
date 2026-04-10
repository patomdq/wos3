import { NextResponse } from 'next/server'
import { getOrgAccessToken, supabaseAdmin } from '@/lib/gcalToken'
import { gcalListEvents } from '@/lib/googleCalendar'

// GET — returns events for a given month range
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const timeMin = searchParams.get('timeMin') || new Date().toISOString()
  const timeMax = searchParams.get('timeMax') || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()

  const token = await getOrgAccessToken()
  if (!token) return NextResponse.json({ events: [], connected: false })

  const events = await gcalListEvents(token, timeMin, timeMax)
  return NextResponse.json({ events, connected: true })
}

// POST — full sync from Google → store in eventos_gcal table
export async function POST() {
  const token = await getOrgAccessToken()
  if (!token) return NextResponse.json({ ok: false, error: 'Not connected' })

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  const events = await gcalListEvents(token, timeMin, timeMax)

  let count = 0
  for (const ev of events) {
    const start = ev.start.dateTime || ev.start.date || ''
    const end   = ev.end.dateTime   || ev.end.date   || ''
    if (!start) continue

    await supabaseAdmin
      .from('eventos_gcal')
      .upsert({
        google_event_id: ev.id,
        titulo:    ev.summary || 'Sin título',
        descripcion: ev.description || null,
        fecha_inicio: start,
        fecha_fin:    end,
        actualizado_at: new Date().toISOString(),
      }, { onConflict: 'google_event_id' })
    count++
  }

  return NextResponse.json({ ok: true, synced: count })
}
