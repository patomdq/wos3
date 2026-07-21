import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function fetchCatastroSingle(refcat: string, provincia: string, municipio: string) {
  const url = `https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/Consulta_DNPRC?Provincia=${encodeURIComponent(provincia)}&Municipio=${encodeURIComponent(municipio)}&RefCat=${encodeURIComponent(refcat)}`
  try {
    const res = await fetch(url)
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
  } catch { return null }
}

// POST /api/catastro/batch
// Actualiza datos catastrales de TODOS los registros que tienen ref_catastral
export async function POST() {
  const { data: posiciones, error } = await supabase
    .from('deuda_posiciones')
    .select('id, ref_catastral, provincia, municipio')
    .not('ref_catastral', 'is', null)
    .neq('ref_catastral', '')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultados = { ok: 0, error: 0, sin_datos: 0 }

  for (const pos of posiciones || []) {
    const catastro = await fetchCatastroSingle(
      pos.ref_catastral,
      pos.provincia || '',
      pos.municipio || ''
    )
    if (catastro) {
      await supabase.from('deuda_posiciones').update({ datos_catastro: catastro }).eq('id', pos.id)
      resultados.ok++
    } else {
      resultados.sin_datos++
    }
    // Pequeña pausa para no saturar la API del Catastro
    await new Promise(r => setTimeout(r, 300))
  }

  return NextResponse.json({ total: posiciones?.length || 0, ...resultados })
}
