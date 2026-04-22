import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/api-auth'
import { scrapeIdealista } from '@/lib/scrape-idealista'

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { url } = await req.json()
  if (!url || !url.includes('idealista.com')) {
    return NextResponse.json({ error: 'URL inválida — debe ser de idealista.com' }, { status: 400 })
  }

  const result = await scrapeIdealista(url)
  if ('error' in result) return NextResponse.json(result, { status: 502 })
  return NextResponse.json(result)
}
