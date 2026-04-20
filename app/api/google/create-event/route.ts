import { NextRequest, NextResponse } from 'next/server'
import { getOrgAccessToken, supabaseAdmin } from '@/lib/gcalToken'
import { gcalCreateEvent, gcalUpdateEvent, gcalDeleteEvent } from '@/lib/googleCalendar'
import { verifyAuth } from '@/lib/api-auth'

// POST — create or update a calendar event linked to a partida
// Body: { partida_id, proyecto_nombre, nombre, fecha_inicio, fecha_fin_estimada }
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { partida_id, proyecto_nombre, nombre, fecha_inicio, fecha_fin_estimada } = body

  if (!partida_id || !nombre || !fecha_inicio) {
    return NextResponse.json({ ok: false, error: 'Missing fields' })
  }

  const token = await getOrgAccessToken()
  if (!token) return NextResponse.json({ ok: false, error: 'Google not connected' })

  const title = `${nombre} — ${proyecto_nombre || 'Proyecto'}`
  const desc  = `Partida de reforma: ${nombre}`
  const start = fecha_inicio
  const end   = fecha_fin_estimada || fecha_inicio

  // Check if event already exists for this partida
  const { data: existing } = await supabaseAdmin
    .from('partidas_gcal')
    .select('google_event_id')
    .eq('partida_id', partida_id)
    .single()

  let googleEventId: string | null = null

  if (existing?.google_event_id) {
    // Update existing event
    const updated = await gcalUpdateEvent(token, existing.google_event_id, {
      title, description: desc, startDateTime: start, endDateTime: end, allDay: true,
    })
    googleEventId = updated?.id || existing.google_event_id
    await supabaseAdmin
      .from('partidas_gcal')
      .update({ google_event_id: googleEventId })
      .eq('partida_id', partida_id)
  } else {
    // Create new event
    const created = await gcalCreateEvent(token, {
      title, description: desc, startDateTime: start, endDateTime: end, allDay: true,
    })
    if (created) {
      googleEventId = created.id
      await supabaseAdmin
        .from('partidas_gcal')
        .upsert({ partida_id, google_event_id: googleEventId }, { onConflict: 'partida_id' })
    }
  }

  return NextResponse.json({ ok: !!googleEventId, google_event_id: googleEventId })
}

// DELETE — remove a calendar event linked to a partida
// Body: { partida_id }
export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })

  const { partida_id } = await req.json()
  if (!partida_id) return NextResponse.json({ ok: false })

  const { data } = await supabaseAdmin
    .from('partidas_gcal')
    .select('google_event_id')
    .eq('partida_id', partida_id)
    .single()

  if (data?.google_event_id) {
    const token = await getOrgAccessToken()
    if (token) await gcalDeleteEvent(token, data.google_event_id)
    await supabaseAdmin.from('partidas_gcal').delete().eq('partida_id', partida_id)
  }

  return NextResponse.json({ ok: true })
}
