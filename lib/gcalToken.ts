// Server-side only: get a valid access token for the org Google account
// Uses supabaseAdmin (service key) to read google_tokens table

import { createClient } from '@supabase/supabase-js'
import { doRefreshToken } from './googleCalendar'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ORG_KEY = 'hasu'

export async function getOrgAccessToken(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('google_tokens')
    .select('access_token, refresh_token, token_expiry')
    .eq('org_key', ORG_KEY)
    .single()

  if (error || !data) return null

  // Refresh if expires in < 5 min
  const expiryMs = new Date(data.token_expiry).getTime()
  if (expiryMs - Date.now() < 5 * 60 * 1000) {
    const refreshed = await doRefreshToken(data.refresh_token)
    if (!refreshed) return null
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabaseAdmin
      .from('google_tokens')
      .update({ access_token: refreshed.access_token, token_expiry: newExpiry, updated_at: new Date().toISOString() })
      .eq('org_key', ORG_KEY)
    return refreshed.access_token
  }

  return data.access_token
}

export async function saveOrgTokens(tokens: {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
}) {
  const token_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabaseAdmin
    .from('google_tokens')
    .upsert({
      org_key:      ORG_KEY,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry,
      scope:        tokens.scope || '',
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'org_key' })
}

export async function isGoogleConnected(): Promise<boolean> {
  const token = await getOrgAccessToken()
  return !!token
}

export { supabaseAdmin }
