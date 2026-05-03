export interface Comparable {
  precio: number
  superficie: number | null
  habitaciones: number | null
  precioM2: number | null
  titulo: string | null
  url: string
}

export interface ResultadoBusqueda {
  comparables: Comparable[]
  precioMedioM2: number | null
  precioSugerido: number | null
  fuente: string
}

function parsePrice(text: string): number | null {
  const matches = [...text.matchAll(/([\d]+(?:[.,][\d]{3})*)\s*€/g)]
  for (const m of matches) {
    const val = parseInt(m[1].replace(/\./g, '').replace(',', ''))
    if (val > 15000 && val < 5_000_000) return val
  }
  return null
}

export async function buscarComparables(
  zona: string,
  superficie: number,
  habitaciones?: number
): Promise<ResultadoBusqueda> {
  const empty: ResultadoBusqueda = { comparables: [], precioMedioM2: null, precioSugerido: null, fuente: 'sin datos' }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) return empty

  const hab = habitaciones ? `${habitaciones} habitaciones` : ''
  const query = `piso en venta ${zona} ${superficie}m2 ${hab} precio`.trim()

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({
        query,
        limit: 6,
        scrapeOptions: { formats: ['markdown'] },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return empty
    const json = await res.json()
    const results: any[] = json.data || []

    const comparables: Comparable[] = []

    for (const r of results) {
      const text = [r.description, r.markdown, r.title].filter(Boolean).join('\n')
      const precio = parsePrice(text)
      if (!precio) continue

      const supMatch = text.match(/(\d{2,3})\s*m[²2]/i)
      const habMatch = text.match(/(\d)\s*habitaci/i)
      const supVal = supMatch ? parseInt(supMatch[1]) : null

      comparables.push({
        precio,
        superficie: supVal,
        habitaciones: habMatch ? parseInt(habMatch[1]) : null,
        precioM2: supVal && supVal > 20 ? Math.floor(precio / supVal) : null,
        titulo: r.title?.slice(0, 80) || null,
        url: r.url,
      })
    }

    const preciosM2 = comparables.filter(c => c.precioM2 && c.precioM2 > 200 && c.precioM2 < 10000).map(c => c.precioM2!)
    const precioMedioM2 = preciosM2.length
      ? Math.floor(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length)
      : null
    const precioSugerido = precioMedioM2 ? Math.floor(precioMedioM2 * superficie) : null

    return {
      comparables: comparables.slice(0, 4),
      precioMedioM2,
      precioSugerido,
      fuente: `web search: "${query}"`,
    }
  } catch {
    return empty
  }
}
