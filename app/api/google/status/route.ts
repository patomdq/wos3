import { NextResponse } from 'next/server'
import { isGoogleConnected } from '@/lib/gcalToken'

export async function GET() {
  const connected = await isGoogleConnected()
  return NextResponse.json({ connected })
}
