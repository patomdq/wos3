import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/[.]/g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
  return isNaN(n) ? null : n
}

function normalizarTipologia(raw: string | null | undefined): string {
  if (!raw) return 'piso'
  const v = raw.toLowerCase()
  if (v.includes('piso') || v.includes('apartamento') || v.includes('flat')) return 'piso'
  if (v.includes('casa') || v.includes('chalet') || v.includes('unifamiliar') || v.includes('villa')) return 'casa'
  if (v.includes('duplex') || v.includes('dúplex')) return 'duplex'
  if (v.includes('edificio') || v.includes('building')) return 'edificio'
  if (v.includes('suelo') || v.includes('solar') || v.includes('terreno')) return 'suelo'
  if (v.includes('local') || v.includes('nave') || v.includes('industri')) return 'nave'
  if (v.includes('garaje') || v.includes('parking') || v.includes('plaza')) return 'garaje'
  if (v.includes('trastero') || v.includes('storage')) return 'trastero'
  return 'piso'
}

function checklistDesdeOcupacion(estadoOcupacion: string | null | undefined): Record<string, string> {
  if (!estadoOcupacion) return {}
  const v = estadoOcupacion.toLowerCase()
  const items: Record<string, string> = {}
  if (v.includes('okup') || v.includes('ocup')) items['okupado'] = 'alerta'
  if (v.includes('sin posesion') || v.includes('sin posesión') || v.includes('flag') || v.includes('posesion')) items['sin_posesion'] = 'alerta'
  if (v.includes('3') && v.includes('título')) items['sin_posesion'] = 'alerta'
  return items
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { servicer, mapeo, rows, headers, importado_por } = await req.json()
  if (!Array.isArray(rows) || rows.length === 0 || !mapeo) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  // mapeo: { "col_excel": "campo_canonico" }
  const colIdx: Record<string, number> = {}
  headers.forEach((h: string, i: number) => { colIdx[h] = i })

  const getValue = (row: any[], colExcel: string) => {
    const idx = colIdx[colExcel]
    return idx !== undefined ? row[idx] : undefined
  }

  const getCanonical = (row: any[], campoCanonical: string): any => {
    const col = Object.entries(mapeo).find(([, v]) => v === campoCanonical)?.[0]
    return col ? getValue(row, col) : undefined
  }

  const filas: any[] = []
  let n_sin_precio = 0

  for (const row of rows) {
    const tipologiaRaw = getCanonical(row, 'tipologia')
    const subtipo = getCanonical(row, 'subtipo')
    const direccion = getCanonical(row, 'direccion') || ''
    const ciudad = getCanonical(row, 'ciudad') || ''
    const provincia = getCanonical(row, 'provincia') || ''
    const ccaa = getCanonical(row, 'ccaa') || ''
    const cp = getCanonical(row, 'codigo_postal') || ''
    const superficie = toNum(getCanonical(row, 'superficie'))
    const precioRaw = getCanonical(row, 'precio')
    const precio = toNum(precioRaw)
    const assetId = getCanonical(row, 'asset_id_servicer') || ''
    const portfolio = getCanonical(row, 'portfolio_reo') || ''
    const estadoOcupacion = getCanonical(row, 'estado_ocupacion') || ''
    const estadoJudicial = getCanonical(row, 'estado_judicial_reo') || ''
    const faseDesahucio = getCanonical(row, 'fase_desahucio') || ''
    const refCatastral = getCanonical(row, 'ref_catastral') || ''
    const numFinca = getCanonical(row, 'numero_finca') || ''
    const localidadReg = getCanonical(row, 'localidad_registro') || ''
    const numRegistro = getCanonical(row, 'numero_registro') || ''

    if (!precio) n_sin_precio++

    // Guardar todas las columnas originales en reo_datos_extra
    const reo_datos_extra: Record<string, any> = {}
    headers.forEach((h: string, i: number) => { reo_datos_extra[h] = row[i] })

    const checklistItems = checklistDesdeOcupacion(estadoOcupacion)
    const checklist_documentacion = Object.keys(checklistItems).length > 0
      ? { items: checklistItems }
      : {}

    const tipologia = normalizarTipologia(tipologiaRaw || subtipo)
    const titulo = [
      tipologia.charAt(0).toUpperCase() + tipologia.slice(1),
      ciudad || provincia,
      assetId ? `(${assetId})` : '',
    ].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim() || 'REO sin título'

    filas.push({
      tipologia,
      titulo,
      direccion: [direccion, cp].filter(Boolean).join(', ') || null,
      ciudad: ciudad || null,
      provincia: provincia || null,
      ccaa: ccaa || null,
      superficie: superficie || null,
      precio_compra: precio || null,
      fuente: servicer || 'REO',
      estado: 'sin_analizar',
      origen: 'reo',
      asset_id_servicer: assetId || null,
      portfolio_reo: portfolio || null,
      estado_judicial_reo: estadoJudicial || null,
      fase_desahucio: faseDesahucio || null,
      checklist_documentacion,
      reo_datos_extra,
    })
  }

  const { error } = await supabase.from('inmuebles').insert(filas)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    n_insertados: filas.length,
    n_sin_precio,
    n_con_alertas: filas.filter(f => Object.keys(f.checklist_documentacion?.items || {}).length > 0).length,
  })
}
