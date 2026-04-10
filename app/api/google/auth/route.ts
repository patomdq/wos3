import { NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/googleCalendar'

export async function GET() {
  const url = getAuthUrl()
  return NextResponse.json({ url })
}
