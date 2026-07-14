import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Geocoding gratuito vía Nominatim (OpenStreetMap) — sin API key, sin billing.
// Política de uso: máx. 1 request/seg y User-Agent identificable (https://operations.osmfoundation.org/policies/nominatim/).
// El caller (cliente) es responsable de espaciar las llamadas ~1.1s entre sí; acá solo se resuelve UNA dirección por request.
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { ids, direccion, ciudad, provincia, zip } = await req.json() as {
    ids: string[] // todas las posiciones que comparten esta dirección — se actualizan juntas
    direccion?: string | null
    ciudad?: string | null
    provincia?: string | null
    zip?: string | null
  }

  if (!ids || ids.length === 0) return NextResponse.json({ error: 'Sin ids' }, { status: 400 })

  const query = [direccion, zip, ciudad, provincia, 'España'].filter(Boolean).join(', ')
  if (!query.trim()) return NextResponse.json({ error: 'Sin datos de dirección' }, { status: 400 })

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WOS3-HASU/1.0 (hola@hasu.in)', 'Accept-Language': 'es' },
    })
    if (!res.ok) return NextResponse.json({ error: 'Nominatim error', lat: null, lng: null })

    const data = await res.json() as { lat: string; lon: string }[]
    if (!data || data.length === 0) {
      return NextResponse.json({ lat: null, lng: null, encontrado: false })
    }

    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)

    await supabase.from('deuda_posiciones').update({ lat, lng }).in('id', ids)

    return NextResponse.json({ lat, lng, encontrado: true })
  } catch (e) {
    return NextResponse.json({ error: 'Fallo geocoding', lat: null, lng: null }, { status: 500 })
  }
}
