import { NextResponse } from 'next/server'
import { getOrgAccessToken, supabaseAdmin } from '@/lib/gcalToken'

export async function POST() {
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
