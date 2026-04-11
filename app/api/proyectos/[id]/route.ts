import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const pid = params.id
  try {
    const { data: partidas } = await supabaseAdmin.from('partidas_reforma').select('id').eq('proyecto_id', pid)
    if (partidas?.length) {
      const pids = partidas.map((p: any) => p.id)
      await supabaseAdmin.from('items_partida').delete().in('partida_id', pids)
      await supabaseAdmin.from('partidas_gcal').delete().in('partida_id', pids)
      await supabaseAdmin.from('partidas_reforma').delete().eq('proyecto_id', pid)
    }
    await supabaseAdmin.from('movimientos').delete().eq('proyecto_id', pid)
    await supabaseAdmin.from('tareas').delete().eq('proyecto_id', pid)
    await supabaseAdmin.from('bitacora').delete().eq('proyecto_id', pid)
    await supabaseAdmin.from('documentos').delete().eq('proyecto_id', pid)
    await supabaseAdmin.from('proyecto_inversores').delete().eq('proyecto_id', pid)
    const { error } = await supabaseAdmin.from('proyectos').delete().eq('id', pid)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
