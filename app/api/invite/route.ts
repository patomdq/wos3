import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Only admins can invite users
  const { data: callerRole } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', auth.userId)
    .single()
  if (callerRole?.role !== 'admin') {
    return NextResponse.json({ error: 'Prohibido: se requiere rol admin' }, { status: 403 })
  }

  try {
    const { email, role, nombre } = await req.json()
    if (!email || !role) return NextResponse.json({ error: 'email y role son requeridos' }, { status: 400 })

    let userId: string | null = null

    // Intentar invitar por email (requiere service key)
    if (process.env.SUPABASE_SERVICE_KEY) {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
      if (!error && data?.user?.id) {
        userId = data.user.id
      }
    }

    // Insertar en user_roles (con userId real o uno temporal)
    const { data, error } = await supabaseAdmin.from('user_roles').insert([{
      user_id: userId || crypto.randomUUID(),
      role,
      email,
      nombre: nombre || null,
    }]).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const invited = !!userId
    return NextResponse.json({ user: data, invited })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
