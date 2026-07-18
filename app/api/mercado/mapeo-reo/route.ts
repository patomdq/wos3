import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Campos canónicos del wizard REO → inmuebles
export const CAMPOS_REO = [
  { id: 'tipologia',           label: 'Tipo activo (piso/casa/edificio/garaje…)' },
  { id: 'subtipo',             label: 'Subtipo activo' },
  { id: 'direccion',           label: 'Dirección' },
  { id: 'codigo_postal',       label: 'Código postal' },
  { id: 'ciudad',              label: 'Localidad / Ciudad' },
  { id: 'provincia',           label: 'Provincia' },
  { id: 'ccaa',                label: 'Comunidad autónoma' },
  { id: 'superficie',          label: 'Superficie m²' },
  { id: 'precio',              label: 'Precio orientativo / asking price' },
  { id: 'ref_catastral',       label: 'Referencia catastral' },
  { id: 'asset_id_servicer',   label: 'ID del activo en el servicer (Asset ID)' },
  { id: 'portfolio_reo',       label: 'Cartera / Portfolio' },
  { id: 'estado_ocupacion',    label: 'Estado de ocupación (okupado, sin posesión, libre…)' },
  { id: 'estado_judicial_reo', label: 'Estado judicial final' },
  { id: 'fase_desahucio',      label: 'Fase del proceso de desahucio' },
  { id: 'numero_finca',        label: 'Número de finca registral' },
  { id: 'localidad_registro',  label: 'Localidad del registro' },
  { id: 'numero_registro',     label: 'Número de registro' },
  { id: 'ignorar',             label: 'Ignorar esta columna' },
]

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { servicer, headers, sampleRows } = await req.json()
  if (!Array.isArray(headers) || headers.length === 0) {
    return NextResponse.json({ error: 'Faltan headers' }, { status: 400 })
  }

  const camposDisponibles = CAMPOS_REO.map(c => `${c.id} (${c.label})`).join('\n')
  const muestraTexto = (sampleRows || []).slice(0, 5).map((row: any[]) =>
    headers.map((h: string, i: number) => `${h}: ${row[i]}`).join(' | ')
  ).join('\n')

  const prompt = `Eres un asistente que mapea columnas de planillas de REOs (inmuebles adjudicados) de servicers/bancos a un esquema canónico.

Servicer: ${servicer || 'desconocido'}

Campos canónicos disponibles:
${camposDisponibles}

Columnas de la planilla:
${headers.join(', ')}

Muestra de filas reales:
${muestraTexto}

Para cada columna, devolvé el campo canónico más adecuado (o "ignorar" si no aplica) y confianza: "alta", "media" o "baja".
Devolvé SOLO un JSON sin texto adicional:
{"columna_excel_1": {"campo": "campo_canonico", "confianza": "alta"}, ...}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text?.trim() || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Claude no devolvió JSON válido')
    return NextResponse.json({ mapeo: JSON.parse(match[0]), origen: 'claude' })
  } catch (err: any) {
    return NextResponse.json({ error: `Error al proponer mapeo: ${err.message}` }, { status: 500 })
  }
}
