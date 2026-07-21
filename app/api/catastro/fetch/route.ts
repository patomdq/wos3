import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface DatosCatastro {
  ref_catastral: string
  direccion_completa: string | null
  tipo_via: string | null
  nombre_via: string | null
  numero: string | null
  escalera: string | null
  planta: string | null
  puerta: string | null
  cp: string | null
  municipio: string | null
  provincia: string | null
  uso: string | null
  superficie_construida: number | null
  año_construccion: number | null
  tipo_construccion: string | null
  url_mapa: string | null
  obtenido_en: string
}

async function fetchCatastro(refcat: string, provincia: string, municipio: string): Promise<DatosCatastro | null> {
  const url = `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?Provincia=${encodeURIComponent(provincia)}&Municipio=${encodeURIComponent(municipio)}&RefCat=${encodeURIComponent(refcat)}`
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
  if (!res.ok) return null
  const data = await res.json()
  const result = data?.consulta_dnprcResult
  if (!result || result.control?.cuerr > 0) return null

  const bi = result.bico?.bi
  if (!bi) return null

  const dir = bi.dt?.locs?.lous?.lourb?.dir
  const loint = bi.dt?.locs?.lous?.lourb?.loint
  const debi = bi.debi
  const finca = result.bico?.finca
  const lcons = result.bico?.lcons
  const firstCons = Array.isArray(lcons) ? lcons[0] : lcons

  return {
    ref_catastral: refcat,
    direccion_completa: bi.ldt || null,
    tipo_via: dir?.tv || null,
    nombre_via: dir?.nv || null,
    numero: dir?.pnp || null,
    escalera: loint?.es || null,
    planta: loint?.pt || null,
    puerta: loint?.pu || null,
    cp: bi.dt?.locs?.lous?.lourb?.dp || null,
    municipio: bi.dt?.nm || null,
    provincia: bi.dt?.np || null,
    uso: debi?.luso || null,
    superficie_construida: debi?.sfc ? parseInt(debi.sfc) : null,
    año_construccion: debi?.ant ? parseInt(debi.ant) : null,
    tipo_construccion: firstCons?.dvcons?.dtip || firstCons?.lcd || null,
    url_mapa: finca?.infgraf?.igraf || null,
    obtenido_en: new Date().toISOString(),
  }
}

// GET /api/catastro/fetch?id=<posicion_id>
// Obtiene datos del Catastro para una posición y los guarda en BD
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { data: pos, error } = await supabase
    .from('deuda_posiciones')
    .select('id, ref_catastral, provincia, municipio')
    .eq('id', id)
    .single()

  if (error || !pos) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (!pos.ref_catastral) return NextResponse.json({ error: 'Sin referencia catastral' }, { status: 400 })

  const prov = pos.provincia || ''
  const mun = pos.municipio || ''
  const catastro = await fetchCatastro(pos.ref_catastral, prov, mun)
  if (!catastro) return NextResponse.json({ error: 'Catastro no devolvió datos' }, { status: 404 })

  await supabase
    .from('deuda_posiciones')
    .update({ datos_catastro: catastro })
    .eq('id', id)

  return NextResponse.json({ ok: true, datos: catastro })
}
