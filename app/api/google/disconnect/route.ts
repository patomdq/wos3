import { NextRequest, NextResponse } from 'next/server'
import { getOrgAccessToken, supabaseAdmin } from '@/lib/gcalToken'
import { verifyAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    // Revoke token at Google
    const token = await getOrgAccessToken()
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' })
    }
    // Delete from DB
    await supabaseAdmin.from('google_tokens').delete().eq('org_key', 'hasu')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
