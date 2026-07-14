import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'
import Anthropic from '@anthropic-ai/sdk'
import { CAMPOS_CANONICOS } from '@/lib/deuda-schema'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { broker_origen, headers, sampleRows } = await req.json()
  if (!broker_origen || !Array.isArray(headers) || headers.length === 0) {
    return NextResponse.json({ error: 'Faltan broker_origen y headers' }, { status: 400 })
  }

  // 1. Si ya existe un mapeo guardado y confirmado para este broker con las MISMAS columnas, usarlo directo
  const { data: guardado } = await supabase
    .from('deuda_mapeos_broker')
    .select('*')
    .eq('broker_origen', broker_origen)
    .maybeSingle()

  if (guardado?.mapeo) {
    const columnasGuardadas = Object.keys(guardado.mapeo)
    const mismasColumnas = headers.length === columnasGuardadas.length &&
      headers.every((h: string) => columnasGuardadas.includes(h))
    if (mismasColumnas) {
      const mapeoConConfianza: Record<string, { campo: string; confianza: 'alta' }> = {}
      for (const h of headers) mapeoConConfianza[h] = { campo: guardado.mapeo[h], confianza: 'alta' }
      return NextResponse.json({ mapeo: mapeoConConfianza, origen: 'guardado', confirmado_por: guardado.confirmado_por })
    }
  }

  // 2. Broker nuevo o columnas distintas a las guardadas → Claude propone el mapeo
  const camposDisponibles = CAMPOS_CANONICOS.map(c => `${c.id} (${c.label}, tipo: ${c.tipo})`).join('\n')
  const muestraTexto = (sampleRows || []).slice(0, 5).map((row: any[]) =>
    headers.map((h: string, i: number) => `${h}: ${row[i]}`).join(' | ')
  ).join('\n')

  const prompt = `Eres un asistente que mapea columnas de planillas de deuda/NPL de distintos brokers/servicers a un esquema canónico único.

Campos canónicos disponibles:
${camposDisponibles}

Columnas de la planilla a mapear:
${headers.join(', ')}

Muestra de filas reales (para entender qué contiene cada columna, ya que el NOMBRE de la columna puede no coincidir con su contenido real):
${muestraTexto}

IMPORTANTE: los nombres de columna de estos brokers NO son confiables — a veces una columna llamada "TIPO_SUBASTA" contiene en realidad un valor numérico sin relación con su nombre. Mirá el CONTENIDO real de la muestra, no solo el nombre de columna, para decidir el mapeo.

Para cada columna de la planilla, devolvé el campo canónico que mejor corresponde (o "ignorar" si no corresponde a ningún campo canónico, o si el contenido es ambiguo y no se puede determinar con confianza) y un nivel de confianza: "alta", "media" o "baja".

Devolvé SOLO un JSON object con esta forma exacta, sin texto adicional:
{"columna_excel_1": {"campo": "campo_canonico", "confianza": "alta"}, "columna_excel_2": {"campo": "otro_campo", "confianza": "media"}}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (msg.content[0] as any).text?.trim() || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Claude no devolvió un JSON válido')
    const propuesto = JSON.parse(match[0])
    return NextResponse.json({ mapeo: propuesto, origen: 'claude' })
  } catch (err: any) {
    return NextResponse.json({ error: `Error al proponer mapeo: ${err.message}` }, { status: 500 })
  }
}
