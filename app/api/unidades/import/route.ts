import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

async function fetchContent(url: string): Promise<string> {
  // 1. Firecrawl
  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${firecrawlKey}` },
        body: JSON.stringify({ url, formats: ['markdown'], waitFor: 2000 }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const json = await res.json()
        const md: string = json.data?.markdown || ''
        if (md.length > 200) return md
      }
    } catch {}
  }

  // 2. Jina.ai
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const text = await res.text()
      if (text.length > 300) return text
    }
  } catch {}

  // 3. Direct fetch
  const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  // Strip tags for a cleaner text
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<style[\s\S]*?<\/style>/gi, '')
             .replace(/<[^>]+>/g, ' ')
             .replace(/\s{2,}/g, ' ')
             .slice(0, 20000)
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { inmueble_id, url } = await req.json()
  if (!inmueble_id || !url) {
    return NextResponse.json({ error: 'Faltan campos: inmueble_id y url son requeridos' }, { status: 400 })
  }

  // Scrape
  let content: string
  try {
    content = await fetchContent(url)
  } catch (err: any) {
    return NextResponse.json({ error: `No se pudo acceder a la URL: ${err.message}` }, { status: 502 })
  }

  // Claude extrae las unidades
  const prompt = `Eres un extractor de datos inmobiliarios. Analiza el siguiente contenido de una página web inmobiliaria y extrae TODAS las unidades/pisos/locales/garajes listados como un JSON array.

Para cada unidad devuelve un objeto con estos campos (usa null si no hay información):
- tipo: string (valores posibles: "Piso", "Local", "Ático", "Garaje", "Trastero", "Estudio", "Oficina", "Nave")
- planta: string (ej: "1ª", "2ª", "PB", "Ático", "Sótano", "Entresuelo")
- superficie: number (m², solo número)
- ocupacion: "libre" o "ocupado"
- renta_mensual: number o null (€/mes si está alquilado)
- precio_venta_est: number o null (precio de venta en €)
- reforma_estimada: number o null (coste de reforma estimado en €)
- notas: string o null (habitaciones, baños, estado, observaciones relevantes)

IMPORTANTE:
- Si la página muestra UN SOLO INMUEBLE con varias plantas o distribuciones, crea una unidad por cada planta/distribución descrita.
- Si la página es un listado de múltiples inmuebles, crea una unidad por cada inmueble listado.
- Si no hay suficiente información para determinar el tipo, usa "Piso".
- Devuelve SOLO el JSON array, sin explicaciones ni texto adicional.

Ejemplo de respuesta válida:
[{"tipo":"Piso","planta":"1ª","superficie":65,"ocupacion":"libre","renta_mensual":null,"precio_venta_est":55000,"reforma_estimada":8000,"notas":"3 hab, 1 baño"},{"tipo":"Local","planta":"PB","superficie":80,"ocupacion":"ocupado","renta_mensual":450,"precio_venta_est":70000,"reforma_estimada":null,"notas":"Actividad comercial"}]

CONTENIDO DE LA PÁGINA:
${content.slice(0, 12000)}`

  let unidadesData: any[] = []
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text?.trim() || ''
    // Extraer JSON aunque venga con texto alrededor
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Claude no devolvió un JSON array válido')
    unidadesData = JSON.parse(match[0])
    if (!Array.isArray(unidadesData) || unidadesData.length === 0) throw new Error('Array vacío')
  } catch (err: any) {
    return NextResponse.json({ error: `Error al extraer unidades: ${err.message}` }, { status: 500 })
  }

  // Insertar en Supabase
  const rows = unidadesData.map((u: any) => ({
    inmueble_id,
    tipo: u.tipo || 'Piso',
    planta: u.planta || null,
    superficie: typeof u.superficie === 'number' ? u.superficie : null,
    ocupacion: u.ocupacion === 'ocupado' ? 'ocupado' : 'libre',
    origen: 'scraping',
    renta_mensual: typeof u.renta_mensual === 'number' ? u.renta_mensual : null,
    precio_venta_est: typeof u.precio_venta_est === 'number' ? u.precio_venta_est : null,
    reforma_estimada: typeof u.reforma_estimada === 'number' ? u.reforma_estimada : null,
    notas: u.notas || null,
  }))

  const { data, error } = await supabase
    .from('inmueble_unidades')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ unidades: data, total: data?.length || 0 })
}
