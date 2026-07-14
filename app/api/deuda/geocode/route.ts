import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Las direcciones que llegan de los brokers traen ruido que rompe el geocoding:
// códigos catastrales de escalera/planta/puerta ("Es:E Pl:02 Pt:B"), sótanos/garajes/trasteros,
// mojibake residual que sobrevivió al import ("2Âº D"), carreteras nacionales sin el prefijo
// que usa OSM ("Nacional 340" en vez de "N-340"). Se limpia lo más posible antes de geocodificar.
function limpiarDireccion(raw: string): string {
  let s = raw
  s = s.replace(/Â/g, '').replace(/Ã(?=\s|$)/g, '')
  s = s.replace(/\b(Es|Pl|Pt|Bq|Ur)\s*:\s*\S+/gi, '')
  s = s.replace(/\b(SOT|SÓTANO|SOTANO|GARAJE|TRASTERO|BAJO)\b\.?\s*\d*/gi, '')
  s = s.replace(/\d+\s*[ºª°]\s*[A-Za-zÑñ]{1,3}\b/g, '')
  s = s.replace(/\bNacional\s+(\d+)/gi, 'N-$1')
  s = s.replace(/\s{2,}/g, ' ').replace(/(\s*,)+/g, ',').trim()
  return s
}

function padZip(zip: string | null | undefined): string | null {
  if (!zip) return null
  const digits = zip.replace(/\D/g, '')
  if (!digits) return null
  return digits.padStart(5, '0')
}

async function buscarNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'WOS3-HASU/1.0 (hola@hasu.in)', 'Accept-Language': 'es' } })
  if (!res.ok) return null
  const data = await res.json() as { lat: string; lon: string }[]
  if (!data || data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

// Geocoding gratuito vía Nominatim (OpenStreetMap) — sin API key, sin billing.
// Política de uso: máx. 1 request/seg y User-Agent identificable (https://operations.osmfoundation.org/policies/nominatim/).
// El caller (cliente) es responsable de espaciar las llamadas ~1.1s entre sí; acá se resuelve UNA
// dirección por request, con hasta 3 intentos en cascada (dirección completa → sin CP → solo ciudad)
// para no dejar posiciones sin pin cuando la dirección exacta no matchea en OSM.
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

  const direccionLimpia = direccion ? limpiarDireccion(direccion) : null
  const zipOk = padZip(zip)

  if (!direccionLimpia && !ciudad) return NextResponse.json({ error: 'Sin datos de dirección' }, { status: 400 })

  try {
    let resultado: { lat: number; lng: number } | null = null
    let aproximado = false

    // 1) dirección completa + CP + ciudad + provincia
    if (direccionLimpia) {
      resultado = await buscarNominatim([direccionLimpia, zipOk, ciudad, provincia, 'España'].filter(Boolean).join(', '))
    }

    // 2) dirección sin el código postal (a veces un CP mal cargado hace fallar el match completo)
    if (!resultado && direccionLimpia) {
      await espera(350)
      resultado = await buscarNominatim([direccionLimpia, ciudad, provincia, 'España'].filter(Boolean).join(', '))
    }

    // 3) fallback: solo ciudad/provincia — pin aproximado a nivel municipio, mejor que no tener nada
    if (!resultado && ciudad) {
      await espera(350)
      resultado = await buscarNominatim([ciudad, provincia, 'España'].filter(Boolean).join(', '))
      aproximado = !!resultado
    }

    if (!resultado) return NextResponse.json({ lat: null, lng: null, encontrado: false })

    await supabase.from('deuda_posiciones').update({ lat: resultado.lat, lng: resultado.lng }).in('id', ids)

    return NextResponse.json({ lat: resultado.lat, lng: resultado.lng, encontrado: true, aproximado })
  } catch (e) {
    return NextResponse.json({ error: 'Fallo geocoding', lat: null, lng: null }, { status: 500 })
  }
}
