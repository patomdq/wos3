import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/googleCalendar'
import { saveOrgTokens } from '@/lib/gcalToken'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/hasu/calendario?google_error=denied', req.url))
  }

  const tokens = await exchangeCode(code)
  if (!tokens || !tokens.refresh_token) {
    return NextResponse.redirect(new URL('/hasu/calendario?google_error=exchange_failed', req.url))
  }

  await saveOrgTokens(tokens)
  return NextResponse.redirect(new URL('/hasu/calendario?google_connected=true', req.url))
}
