// Google Calendar utilities — pure functions, no Supabase dependency
// Token management is handled in API routes using supabaseAdmin

const CLIENT_ID     = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || 'https://wos3-rho.vercel.app/api/google/callback'
export const SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
export const TZ     = 'Europe/Madrid'

export type GoogleEvent = {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end:   { dateTime?: string; date?: string; timeZone?: string }
  status?: string
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state:         'hasu',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(
  code: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('[GCal] exchangeCode error:', err)
    return null
  }
  return res.json()
}

export async function doRefreshToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) return null
  return res.json()
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function gcalListEvents(
  accessToken: string,
  timeMin?: string,
  timeMax?: string
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    maxResults:    '250',
    singleEvents:  'true',
    orderBy:       'startTime',
  })
  if (timeMin) params.append('timeMin', timeMin)
  if (timeMax) params.append('timeMax', timeMax)
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.items || []
}

type EventInput = {
  title:         string
  description?:  string
  startDateTime: string   // ISO datetime OR YYYY-MM-DD for all-day
  endDateTime:   string
  allDay?:       boolean
}

function buildEventBody(event: EventInput) {
  if (event.allDay) {
    return {
      summary:     event.title,
      description: event.description || '',
      start: { date: event.startDateTime.substring(0, 10) },
      end:   { date: event.endDateTime.substring(0, 10) },
    }
  }
  return {
    summary:     event.title,
    description: event.description || '',
    start: { dateTime: event.startDateTime, timeZone: TZ },
    end:   { dateTime: event.endDateTime,   timeZone: TZ },
  }
}

export async function gcalCreateEvent(
  accessToken: string,
  event: EventInput
): Promise<GoogleEvent | null> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildEventBody(event)),
    }
  )
  if (!res.ok) {
    console.error('[GCal] createEvent error:', await res.text().catch(() => ''))
    return null
  }
  return res.json()
}

export async function gcalUpdateEvent(
  accessToken: string,
  eventId:     string,
  event:       EventInput
): Promise<GoogleEvent | null> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(buildEventBody(event)),
    }
  )
  if (!res.ok) return null
  return res.json()
}

export async function gcalDeleteEvent(
  accessToken: string,
  eventId:     string
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  return res.ok || res.status === 404
}
