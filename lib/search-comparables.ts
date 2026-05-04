export interface Comparable {
  precio: number
  superficie: number | null
  habitaciones: number | null
  precioM2: number | null
  titulo: string | null
  direccion: string | null
  url: string
  portal: string | null
}

export interface ResultadoBusqueda {
  comparables: Comparable[]
  precioMedioM2: number | null
  precioSugerido: number | null
  fuente: string
}

const PORTALES = [
  { host: 'idealista.com',    nombre: 'Idealista' },
  { host: 'fotocasa.es',      nombre: 'Fotocasa' },
  { host: 'pisos.com',        nombre: 'Pisos.com' },
  { host: 'habitaclia.com',   nombre: 'Habitaclia' },
  { host: 'yaencontre.com',   nombre: 'Yaencontre' },
  { host: 'kyero.com',        nombre: 'Kyero' },
  { host: 'inmobiliaria.com', nombre: 'Inmobiliaria.com' },
  { host: 'globaliza.com',    nombre: 'Globaliza' },
]

function detectPortal(url: string): string | null {
  for (const p of PORTALES) {
    if (url.includes(p.host)) return p.nombre
  }
  return null
}

// Returns true only for individual listing pages (not search results or market reports)
function isListingUrl(url: string): boolean {
  return (
    /idealista\.com\/inmueble\/\d+/i.test(url) ||
    /fotocasa\.es\/ficha\//i.test(url) ||
    /pisos\.com\/.+-\d+\.htm/i.test(url) ||
    /habitaclia\.com\/.+\/\d+/i.test(url) ||
    /yaencontre\.com\/.+-\d{5,}/i.test(url) ||
    /kyero\.com\/property\//i.test(url)
  )
}

function parsePrice(text: string): number | null {
  // Look for standalone prices (not per-m² prices like "1.200€/m²")
  const matches = [...text.matchAll(/([\d]{2,3}(?:[.,][\d]{3})*)\s*€(?!\s*\/\s*m)/g)]
  for (const m of matches) {
    const val = parseInt(m[1].replace(/\./g, '').replace(',', ''))
    if (val > 20_000 && val < 3_000_000) return val
  }
  return null
}

function extractSurface(text: string): number | null {
  // Prefer explicit "X m²" over other patterns; ignore values that look like year or address numbers
  const matches = [...text.matchAll(/(\d{2,4})\s*m[²2]/gi)]
  for (const m of matches) {
    const v = parseInt(m[1])
    if (v >= 25 && v <= 1000) return v
  }
  return null
}

function extractDireccion(text: string, url: string): string | null {
  // 1. Explicit street pattern
  const street = text.match(/(?:C\/|Calle|Avda?\.?|Avenida|Plaza|Paseo|Ronda|Camino|Urbanización)\s+[^\n,·|]{3,60}/i)
  if (street) return street[0].replace(/\s+/g, ' ').trim()

  // 2. "Piso/Casa en X, Barrio, Ciudad" title pattern
  const enTitle = text.match(/(?:Piso|Casa|Ático|Dúplex|Apartamento|Vivienda)[^,\n]*?(?:en|de)\s+([A-ZÁÉÍÓÚ][^\n,·|]{4,60})/i)
  if (enTitle) return enTitle[1].trim()

  // 3. Extract zone from Idealista URL: /venta-viviendas/{city}/{zone}/
  const idUrl = url.match(/idealista\.com\/[^/]+\/([^/]+)\/([^/]+)\//i)
  if (idUrl) return `${idUrl[2].replace(/-/g, ' ')}, ${idUrl[1].replace(/-/g, ' ')}`

  // 4. Fotocasa URL zone
  const fcUrl = url.match(/fotocasa\.es\/[^/]+\/([^/]+)\/([^/]+)\//i)
  if (fcUrl) return `${fcUrl[2].replace(/-/g, ' ')}, ${fcUrl[1].replace(/-/g, ' ')}`

  return null
}

export async function buscarComparables(
  zona: string,
  superficie: number,
  habitaciones?: number,
): Promise<ResultadoBusqueda> {
  const empty: ResultadoBusqueda = { comparables: [], precioMedioM2: null, precioSugerido: null, fuente: 'sin datos' }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) return empty

  const hab = habitaciones ? `${habitaciones} habitaciones` : ''
  // Target portal listings explicitly
  const query = `piso en venta ${zona} ${hab} ${superficie}m2 idealista fotocasa inmueble €`.trim()

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({
        query,
        limit: 10,
        scrapeOptions: { formats: ['markdown'] },
      }),
      signal: AbortSignal.timeout(18000),
    })

    if (!res.ok) return empty
    const json = await res.json()
    const results: any[] = json.data || []

    const comparables: Comparable[] = []

    for (const r of results) {
      const url: string = r.url || ''
      const portal = detectPortal(url)

      // Skip results that are clearly not property listings (news, reports, calculators)
      const isReport = /noticias|informe|estadística|calculadora|hipoteca|blog|ayuntamiento|wikipedia/i.test(url)
      if (isReport) continue

      const text = [r.title, r.description, r.markdown].filter(Boolean).join('\n')
      const precio = parsePrice(text)

      // A comparable must have a price. If not from a listing URL, must also have surface.
      const sup = extractSurface(text)
      if (!precio) continue
      if (!isListingUrl(url) && !sup) continue

      // Sanity check: price/m² must be plausible (200–8000 €/m²) when both are available
      const pm2 = sup && sup > 20 ? Math.floor(precio / sup) : null
      if (pm2 && (pm2 < 200 || pm2 > 8000)) continue

      // Extract address/title
      const direccion = extractDireccion(text, url)
      const titulo = (r.title || '').replace(/\s*[-–|].*$/, '').trim().slice(0, 80) || null

      comparables.push({
        precio,
        superficie: sup,
        habitaciones: text.match(/(\d)\s*habitaci/i) ? parseInt(text.match(/(\d)\s*habitaci/i)![1]) : null,
        precioM2: pm2,
        titulo,
        direccion,
        url,
        portal,
      })
    }

    // Prefer listing-URL comparables; sort by how "complete" the data is
    const ranked = comparables.sort((a, b) => {
      const scoreA = (isListingUrl(a.url) ? 4 : 0) + (a.superficie ? 2 : 0) + (a.direccion ? 1 : 0)
      const scoreB = (isListingUrl(b.url) ? 4 : 0) + (b.superficie ? 2 : 0) + (b.direccion ? 1 : 0)
      return scoreB - scoreA
    })

    const top = ranked.slice(0, 5)

    const preciosM2 = top.filter(c => c.precioM2 && c.precioM2 > 200 && c.precioM2 < 8000).map(c => c.precioM2!)
    const precioMedioM2 = preciosM2.length >= 2
      ? Math.floor(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length)
      : null
    const precioSugerido = precioMedioM2 ? Math.floor(precioMedioM2 * superficie) : null

    return {
      comparables: top,
      precioMedioM2,
      // Only suggest price when backed by at least 2 comparables with surface data
      precioSugerido,
      fuente: `web search: "${query}"`,
    }
  } catch {
    return empty
  }
}
