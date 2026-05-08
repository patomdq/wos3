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
  precioNotariadoM2: number | null
  precioNotariadoSugerido: number | null
  fuenteNotariado: string | null
}

// Normalizes zona to a Fotocasa-compatible URL slug
function toSlug(zona: string): string {
  return zona
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

// Builds multiple targeted Fotocasa URLs to maximize distinct listings
function buildFotocasaUrls(zona: string, habitaciones?: number): string[] {
  const slug = toSlug(zona)
  const habValues = habitaciones
    ? Array.from(new Set([habitaciones, habitaciones <= 2 ? 3 : 2]))
    : [2, 3]
  const barrios = ['todas-las-zonas', 'centro']
  const urls: string[] = []
  for (const barrio of barrios) {
    for (const hab of habValues) {
      urls.push(`https://www.fotocasa.es/es/comprar/viviendas/${slug}/${barrio}/${hab}-habitaciones/l`)
    }
  }
  return Array.from(new Set(urls))
}

function parsePrice(text: string): number | null {
  const matches = Array.from(text.matchAll(/([\d]{2,3}(?:[.,][\d]{3})*)\s*€(?!\s*\/\s*m)/g))
  for (const m of matches) {
    const val = parseInt(m[1].replace(/\./g, '').replace(',', ''))
    if (val > 20_000 && val < 3_000_000) return val
  }
  return null
}

function extractSurface(text: string): number | null {
  const matches = Array.from(text.matchAll(/(\d{2,4})\s*m[²2]/gi))
  for (const m of matches) {
    const v = parseInt(m[1])
    if (v >= 25 && v <= 1000) return v
  }
  return null
}

function extractDireccion(text: string, url: string): string | null {
  const street = text.match(/(?:C\/|Calle|Avda?\.?|Avenida|Plaza|Paseo|Ronda|Camino|Urbanización)\s+[^\n,·|]{3,60}/i)
  if (street) return street[0].replace(/\s+/g, ' ').trim()

  const enTitle = text.match(/(?:Piso|Casa|Ático|Dúplex|Apartamento|Vivienda)[^,\n]*?(?:en|de)\s+([A-ZÁÉÍÓÚ][^\n,·|]{4,60})/i)
  if (enTitle) return enTitle[1].trim()

  const fcUrl = url.match(/fotocasa\.es\/[^/]+\/([^/]+)\/([^/]+)\//i)
  if (fcUrl) return `${fcUrl[2].replace(/-/g, ' ')}, ${fcUrl[1].replace(/-/g, ' ')}`

  return null
}

function isValidComparable(precio: number, pm2: number | null): boolean {
  return precio > 20_000 && precio < 3_000_000 && (!pm2 || (pm2 >= 200 && pm2 <= 8_000))
}

// Fetches a single Fotocasa listing page and extracts the first property found.
// Fotocasa server-renders the first listing — subsequent ones require JS.
async function fetchFotocasaPage(url: string): Promise<Comparable | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const html = await res.text()

    // 1. __NEXT_DATA__ — contains server-rendered page props
    const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
    if (nextMatch) {
      try {
        const data = JSON.parse(nextMatch[1])
        const pageProps = data?.props?.pageProps ?? {}
        const listings: any[] =
          pageProps.initialListings ??
          pageProps.listings ??
          pageProps.ads ??
          pageProps.items ??
          pageProps.properties ??
          []
        if (listings.length > 0) {
          const first = listings[0]
          const precio: number | undefined = first.price ?? first.precio ?? first.amount
          const sup: number | undefined = first.surface ?? first.superficie ?? first.sqm ?? first.area
          if (precio && precio > 20_000 && precio < 3_000_000) {
            const pm2 = sup && sup > 20 ? Math.floor(precio / sup) : null
            if (isValidComparable(precio, pm2)) {
              const listingUrl: string = first.url ?? first.link ?? url
              return {
                precio: Math.floor(precio),
                superficie: sup ? Math.round(sup) : null,
                habitaciones: first.rooms ?? first.habitaciones ?? null,
                precioM2: pm2,
                titulo: (first.title ?? first.name ?? first.titulo ?? '').slice(0, 80) || null,
                direccion: first.address ?? first.direction ?? extractDireccion('', listingUrl),
                url: listingUrl.startsWith('http') ? listingUrl : `https://www.fotocasa.es${listingUrl}`,
                portal: 'Fotocasa',
              }
            }
          }
        }
      } catch { /* malformed JSON — fall through */ }
    }

    // 2. JSON-LD structured data (schema.org RealEstateListing / Offer)
    const ldMatches = Array.from(html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi))
    for (const match of ldMatches) {
      try {
        const ld = JSON.parse(match[1])
        const items: any[] = Array.isArray(ld) ? ld : [ld]
        for (const item of items) {
          const precio: number | undefined = item.price ?? item.offers?.price
          if (!precio || precio < 20_000) continue
          const sup: number | undefined = item.floorSize?.value ?? null
          const pm2 = sup ? Math.floor(precio / sup) : null
          if (!isValidComparable(precio, pm2)) continue
          const listingUrl: string = item.url ?? url
          return {
            precio: Math.floor(precio),
            superficie: sup ? Math.round(sup) : null,
            habitaciones: null,
            precioM2: pm2,
            titulo: (item.name ?? '').slice(0, 80) || null,
            direccion: item.address?.streetAddress ?? extractDireccion(item.name ?? '', listingUrl),
            url: listingUrl,
            portal: 'Fotocasa',
          }
        }
      } catch { /* ignore */ }
    }

    // 3. OG meta tags — minimal but reliable for the page's featured listing
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ?? ''
    const ogDesc  = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] ?? ''
    const ogUrl   = html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i)?.[1] ?? url
    const text = `${ogTitle} ${ogDesc}`
    const precio = parsePrice(text)
    if (!precio) return null
    const sup = extractSurface(text)
    const pm2 = sup && sup > 20 ? Math.floor(precio / sup) : null
    if (!isValidComparable(precio, pm2)) return null

    return {
      precio,
      superficie: sup,
      habitaciones: null,
      precioM2: pm2,
      titulo: ogTitle.replace(/\s*[-–|].*$/, '').trim().slice(0, 80) || null,
      direccion: extractDireccion(text, ogUrl),
      url: ogUrl,
      portal: 'Fotocasa',
    }
  } catch {
    return null
  }
}

// Firecrawl fallback — targeted to Fotocasa listing pages only
async function firecrawlFallback(
  zona: string,
  habitaciones: number | undefined,
  key: string,
): Promise<Comparable[]> {
  const hab = habitaciones ? `${habitaciones} habitaciones` : '2 o 3 habitaciones'
  const query = `site:fotocasa.es/es/comprar/vivienda piso en venta ${zona} ${hab} precio m²`
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, limit: 8, scrapeOptions: { formats: ['markdown'] } }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const json = await res.json()
    const results: any[] = json.data ?? []
    const out: Comparable[] = []
    for (const r of results) {
      const url: string = r.url ?? ''
      if (!/fotocasa\.es/i.test(url)) continue
      if (/noticias|informe|estadistica|calculadora|hipoteca|blog|indice-precio/i.test(url)) continue
      const text = [r.title, r.description, r.markdown].filter(Boolean).join('\n')
      const precio = parsePrice(text)
      if (!precio) continue
      const sup = extractSurface(text)
      const pm2 = sup && sup > 20 ? Math.floor(precio / sup) : null
      if (!isValidComparable(precio, pm2)) continue
      out.push({
        precio,
        superficie: sup,
        habitaciones: text.match(/(\d)\s*habitaci/i) ? parseInt(text.match(/(\d)\s*habitaci/i)![1]) : null,
        precioM2: pm2,
        titulo: (r.title ?? '').replace(/\s*[-–|].*$/, '').trim().slice(0, 80) || null,
        direccion: extractDireccion(text, url),
        url,
        portal: 'Fotocasa',
      })
    }
    return out
  } catch {
    return []
  }
}

export async function buscarComparables(
  zona: string,
  superficie: number,
  habitaciones?: number,
): Promise<ResultadoBusqueda> {
  const { buscarPrecioMunicipio } = await import('./precios-municipio')

  // Notarial reference — always fetched, shown as context alongside Fotocasa
  const ref = buscarPrecioMunicipio(zona)
  const precioNotariadoM2 = ref?.precioM2 ?? null
  const precioNotariadoSugerido = precioNotariadoM2 ? Math.floor(precioNotariadoM2 * superficie) : null
  const fuenteNotariado = ref
    ? (ref.nivel === 'notariado_municipio' ? 'notariado_municipio' :
       ref.nivel === 'notariado_provincia' ? 'notariado_provincia' :
       ref.nivel === 'municipio' ? 'tabla_referencia_municipio' : 'tabla_referencia_provincia')
    : null

  const empty: ResultadoBusqueda = {
    comparables: [],
    precioMedioM2: null,
    precioSugerido: null,
    fuente: 'sin datos',
    precioNotariadoM2,
    precioNotariadoSugerido,
    fuenteNotariado,
  }

  // Fotocasa scraping — product-specific (pisos, filtered by habitaciones)
  const urls = buildFotocasaUrls(zona, habitaciones)
  const settled = await Promise.allSettled(urls.map(fetchFotocasaPage))

  const seen = new Set<string>()
  const allComparables: Comparable[] = []
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value && !seen.has(r.value.url)) {
      seen.add(r.value.url)
      allComparables.push(r.value)
    }
  }

  // Firecrawl fallback if fewer than 3 results
  if (allComparables.length < 3) {
    const key = process.env.FIRECRAWL_API_KEY
    if (key) {
      const fallback = await firecrawlFallback(zona, habitaciones, key)
      for (const c of fallback) {
        if (!seen.has(c.url)) {
          seen.add(c.url)
          allComparables.push(c)
        }
      }
    }
  }

  // No Fotocasa data — fall back to notarial/MITMA for ROI estimate
  if (allComparables.length === 0) {
    if (precioNotariadoM2 && precioNotariadoSugerido) {
      return {
        comparables: [],
        precioMedioM2: precioNotariadoM2,
        precioSugerido: precioNotariadoSugerido,
        fuente: fuenteNotariado ?? 'sin datos',
        precioNotariadoM2,
        precioNotariadoSugerido,
        fuenteNotariado,
      }
    }
    return empty
  }

  // Filter by surface ±40% for product-specific pricing (use unfiltered if too few matches)
  const withSurface = allComparables.filter(
    c => c.superficie && c.superficie >= superficie * 0.6 && c.superficie <= superficie * 1.4,
  )
  const comparables = withSurface.length >= 2 ? withSurface : allComparables

  const top = comparables.slice(0, 5)
  const preciosM2 = top.filter(c => c.precioM2 && c.precioM2 > 200).map(c => c.precioM2!)
  const precioMedioM2 = preciosM2.length >= 2
    ? Math.floor(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length)
    : (preciosM2.length === 1 ? preciosM2[0] : null)
  const precioSugerido = precioMedioM2 ? Math.floor(precioMedioM2 * superficie) : null

  return {
    comparables: top,
    precioMedioM2,
    precioSugerido,
    fuente: 'fotocasa',
    precioNotariadoM2,
    precioNotariadoSugerido,
    fuenteNotariado,
  }
}
