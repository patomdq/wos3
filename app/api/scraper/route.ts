import { NextResponse } from 'next/server'

const TOKEN_URL = 'https://api.idealista.com/oauth/token'
const SEARCH_URL = 'https://api.idealista.com/3.5/es/search'

async function getToken(): Promise<string> {
  const key = process.env.IDEALISTA_API_KEY
  const secret = process.env.IDEALISTA_API_SECRET
  if (!key || !secret) throw new Error('NO_CREDENTIALS')

  const creds = Buffer.from(`${key}:${secret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=read',
  })
  if (!res.ok) throw new Error(`TOKEN_${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error('TOKEN_EMPTY')
  return data.access_token
}

export async function GET() {
  try {
    const token = await getToken()

    const locationId = process.env.IDEALISTA_LOCATION_ID || '0-EU-ES-04-000-0-CO' // Almería provincia
    const maxPrice   = process.env.IDEALISTA_MAX_PRICE   || '150000'
    const minRooms   = process.env.IDEALISTA_MIN_ROOMS   || '2'

    const body = new URLSearchParams({
      country:      'es',
      operation:    'sale',
      propertyType: 'homes',
      locationId,
      maxPrice,
      minRooms,
      order:        'price',
      sort:         'asc',
      numPage:      '1',
      maxItems:     '20',
    })

    const res = await fetch(SEARCH_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`SEARCH_${res.status}`)
    const data = await res.json()

    const items = (data.elementList || []).map((p: any) => ({
      precio: p.price ?? 0,
      dir:    p.address || p.suggestedTexts?.title || 'Sin dirección',
      ciudad: p.municipality || p.district || '',
      hab:    p.rooms ?? 0,
      m2:     p.size  ?? 0,
      tag:    p.status === 'renew' ? 'Reformar' : 'Buen estado',
      epm:    p.priceByArea ? Math.round(p.priceByArea) : (p.size > 0 ? Math.round(p.price / p.size) : 0),
      fecha:  p.modifiedDate ? new Date(p.modifiedDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Hoy',
      url:    p.url || '',
    }))

    return NextResponse.json({ items, total: data.total ?? items.length, source: 'idealista' })
  } catch (err: any) {
    if (err.message === 'NO_CREDENTIALS') {
      return NextResponse.json({ error: 'NO_CREDENTIALS' }, { status: 503 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
