export interface IdealistaData {
  precio: number | null
  direccion: string | null
  ciudad: string | null
  habitaciones: number | null
  superficie: number | null
  banos: number | null
  descripcion: string | null
  url: string
  titulo: string | null
}

function parseEuros(raw: string): number | null {
  const m = raw.match(/([\d]+(?:[.,][\d]{3})*(?:[.,][\d]+)?)/)
  if (!m) return null
  const n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : Math.round(n)
}

export function extractFromText(text: string, url: string): IdealistaData {
  const titleMatch = text.match(/^#\s+(.+)$/m) || text.match(/^Title:\s*(.+)$/m)
  const titulo = titleMatch?.[1]?.replace(/\s*\|\s*idealista.*$/i, '').trim() || null

  let precio: number | null = null
  for (const m of text.matchAll(/([\d]+(?:[.,][\d]{3})*(?:[.,][\d]+)?)\s*€/g)) {
    const n = parseEuros(m[1])
    if (n && n > 10000 && n < 10_000_000) { precio = n; break }
  }

  const habMatch = text.match(/(\d+)\s*habitaci/i)
  const supMatch = text.match(/(\d+)\s*m[²2]/i)
  const banosMatch = text.match(/(\d+)\s*ba[ñn]o/i)

  let direccion: string | null = null
  const addrMatch = text.match(/(?:C\/|Calle|Avda?\.?|Plaza|Paseo|Ronda)\s+[^\n,·]{3,50}/i)
  if (addrMatch) {
    direccion = addrMatch[0].trim()
  } else if (titulo) {
    direccion = titulo.replace(/^(?:Piso|Casa|Ático|Dúplex|Estudio|Local|Solar)[^,]*(?:en|de)\s+/i, '').trim() || titulo
  }

  let ciudad: string | null = null
  const urlCity = url.match(/idealista\.com\/(?:venta|alquiler)-viviendas\/[^/]+\/([^/]+)\//)?.[1]
  if (urlCity) {
    ciudad = urlCity.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  } else {
    const cityMatch = titulo?.match(/,\s*([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóúñ]+)*)$/)
    ciudad = cityMatch?.[1] || null
  }

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 60)
  const descripcion = lines.find(l => !l.startsWith('#') && !l.match(/^\d/) && !l.match(/^http/))?.slice(0, 400) || null

  return { precio, direccion, ciudad, habitaciones: habMatch ? parseInt(habMatch[1]) : null, superficie: supMatch ? parseInt(supMatch[1]) : null, banos: banosMatch ? parseInt(banosMatch[1]) : null, descripcion, url, titulo }
}

export function extractFromHtml(html: string, url: string): IdealistaData {
  for (const block of html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const items = [JSON.parse(block[1])].flat()
      for (const item of items) {
        const price = item.price || item.offers?.price
        if (price) {
          return {
            precio: parseInt(String(price).replace(/\D/g, '')) || null,
            direccion: item.address?.streetAddress || item.name || null,
            ciudad: item.address?.addressLocality || null,
            habitaciones: item.numberOfRooms || null,
            superficie: item.floorSize?.value || null,
            banos: item.numberOfBathroomsTotal || null,
            descripcion: item.description?.slice(0, 400) || null,
            url, titulo: item.name || null,
          }
        }
      }
    } catch {}
  }

  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] || null
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)?.[1] || null
  const precioRaw = html.match(/class="[^"]*price[^"]*"[^>]*>([\d.,]+)\s*€/i)?.[1] || html.match(/([\d.]+)\s*€/)?.[1]
  const precio = precioRaw ? parseInt(precioRaw.replace(/\./g, '')) : null
  const habMatch = html.match(/(\d+)\s*habitaci/i)
  const supMatch = html.match(/(\d+)\s*m[²2]/i)

  return {
    precio: precio && precio > 10000 ? precio : null,
    direccion: ogTitle?.split(',')[0] || null,
    ciudad: null,
    habitaciones: habMatch ? parseInt(habMatch[1]) : null,
    superficie: supMatch ? parseInt(supMatch[1]) : null,
    banos: null,
    descripcion: ogDesc?.slice(0, 400) || null,
    url, titulo: ogTitle || null,
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

export async function scrapeIdealista(url: string): Promise<IdealistaData | { error: string }> {
  // Direct fetch
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const html = await res.text()
      if (html.length > 2000 && !html.includes('captcha') && !html.includes('robot')) {
        return extractFromHtml(html, url)
      }
    }
  } catch {}

  // Fallback: r.jina.ai
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) return extractFromText(await res.text(), url)
  } catch {}

  return { error: 'No se pudo acceder al inmueble. Idealista puede estar bloqueando el acceso.' }
}
