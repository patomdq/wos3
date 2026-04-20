import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'
import { getOrgAccessToken } from '@/lib/gcalToken'
import { gcalCreateEvent } from '@/lib/googleCalendar'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function addHour(hora: string): string {
  const [h, m] = hora.split(':').map(Number)
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const { radar_id, direccion, fecha, hora, responsable, notas_previas } = await req.json()
  if (!radar_id || !fecha || !hora || !responsable) {
    return NextResponse.json({ error: 'Faltan campos requeridos.' }, { status: 400 })
  }

  const { data: visita, error: dbError } = await supabaseAdmin
    .from('visitas_radar')
    .insert([{ radar_id, fecha, hora, responsable, notas_previas: notas_previas || null }])
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Check for other visits same fecha+hora to group in same GCal event
  const { data: mismaHora } = await supabaseAdmin
    .from('visitas_radar')
    .select('id, gcal_event_id, radar_id')
    .eq('fecha', fecha)
    .eq('hora', hora)
    .not('id', 'eq', visita.id)
    .not('gcal_event_id', 'is', null)
    .limit(1)

  const gcalToken = await getOrgAccessToken()
  let gcalEventId: string | null = null

  if (gcalToken) {
    const horaFin = addHour(hora)

    if (mismaHora && mismaHora.length > 0 && mismaHora[0].gcal_event_id) {
      // Hay otro evento a la misma hora — reusar ese event_id pero crear uno nuevo con título agrupado
      // Obtenemos todas las direcciones
      const { data: todasVisitas } = await supabaseAdmin
        .from('visitas_radar')
        .select('radar_id')
        .eq('fecha', fecha)
        .eq('hora', hora)
      const radarIds = (todasVisitas || []).map((v: any) => v.radar_id)
      const { data: inmuebles } = await supabaseAdmin
        .from('inmuebles_radar')
        .select('id, direccion, ciudad')
        .in('id', radarIds)
      const titulos = (inmuebles || []).map((r: any) => `${r.direccion}${r.ciudad ? ', '+r.ciudad : ''}`).join(' · ')
      const title = `🏠 Visitas — ${titulos}`
      const description = `Responsable: ${responsable}${notas_previas ? '\n' + notas_previas : ''}`
      const created = await gcalCreateEvent(gcalToken, {
        title, description,
        startDateTime: `${fecha}T${hora}:00`,
        endDateTime: `${fecha}T${horaFin}:00`,
      })
      gcalEventId = created?.id || null
    } else {
      const title = `🏠 Visita — ${direccion}`
      const description = `Responsable: ${responsable}${notas_previas ? '\n' + notas_previas : ''}`
      const created = await gcalCreateEvent(gcalToken, {
        title, description,
        startDateTime: `${fecha}T${hora}:00`,
        endDateTime: `${fecha}T${horaFin}:00`,
      })
      gcalEventId = created?.id || null
    }

    if (gcalEventId) {
      await supabaseAdmin.from('visitas_radar').update({ gcal_event_id: gcalEventId }).eq('id', visita.id)
      visita.gcal_event_id = gcalEventId
    }
  }

  return NextResponse.json({ visita })
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })

  const { id, estado_post, notas_post, fotos_url } = await req.json()
  if (!id) return NextResponse.json({ error: 'Falta el ID.' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (estado_post !== undefined) updates.estado_post = estado_post
  if (notas_post !== undefined) updates.notas_post = notas_post
  if (fotos_url !== undefined) updates.fotos_url = fotos_url

  const { data, error } = await supabaseAdmin
    .from('visitas_radar')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ visita: data })
}
