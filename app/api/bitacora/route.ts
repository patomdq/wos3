import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSendMentions } from '@/lib/notifications'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { proyecto_id, proyecto_nombre, contenido, autor, tipo } = await req.json()
  if (!proyecto_id || !contenido) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('bitacora')
    .insert([{ proyecto_id, contenido, autor: autor || 'Usuario', tipo: tipo || 'nota' }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // @menciones — notificación in-app + email (awaited para que no muera en serverless)
  await checkAndSendMentions(contenido, {
    autor:    autor || 'Usuario',
    proyecto: proyecto_nombre || 'un proyecto',
    contenido,
    tipo:     tipo || 'nota',
  })

  return NextResponse.json({ data })
}
