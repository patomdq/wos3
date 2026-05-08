// Precios de referencia €/m² vivienda libre segunda mano
// Fuente: MITMA / Registradores de España — Q1 2025
// Actualizar trimestralmente con datos oficiales del Ministerio de Vivienda
// https://www.mivau.gob.es/vivienda/estadisticas

export interface PrecioReferencia {
  precioM2: number
  nivel: 'municipio' | 'provincia'
  fuente: 'tabla_referencia'
}

// ── Municipios ────────────────────────────────────────────────────────────────
// Foco en Almería (zona operativa HASU) + capitales nacionales

const MUNICIPIOS: Record<string, number> = {
  // Almería provincia — datos de mercado real
  'almeria': 1350,
  'roquetas de mar': 1400,
  'el ejido': 1050,
  'vera': 1100,
  'mojacar': 2200,
  'garrucha': 1500,
  'carboneras': 1600,
  'adra': 900,
  'berja': 700,
  'huercal-overa': 850,
  'huercal overa': 850,
  'cuevas del almanzora': 750,
  'pulpi': 750,
  'albox': 700,
  'zurgena': 650,
  'turre': 900,
  'nijar': 1000,
  'olula del rio': 700,
  'baza': 650,
  'guadix': 750,
  'vicar': 1000,
  'aguadulce': 1300,
  'antas': 750,
  'bedar': 900,
  'lubrин': 700,
  'lubrin': 700,
  'cantoria': 650,

  // Murcia provincia (frontera con Almería)
  'lorca': 750,
  'aguilas': 1100,
  'mazarron': 1200,
  'totana': 750,
  'murcia': 1250,
  'cartagena': 1300,

  // Málaga (segunda zona habitual)
  'malaga': 2800,
  'marbella': 4200,
  'torremolinos': 2600,
  'fuengirola': 2400,
  'nerja': 2500,
  'velez-malaga': 1500,
  'velez malaga': 1500,
  'estepona': 2800,
  'benalmadena': 2500,
  'ronda': 1200,

  // Granada
  'granada': 1600,
  'motril': 1100,
  'almunecar': 1900,
  'loja': 800,

  // Capitales nacionales
  'madrid': 4200,
  'barcelona': 3900,
  'valencia': 2100,
  'sevilla': 1700,
  'zaragoza': 1600,
  'bilbao': 3200,
  'alicante': 2000,
  'cordoba': 1150,
  'valladolid': 1500,
  'palma': 3200,
  'las palmas de gran canaria': 2100,
  'santa cruz de tenerife': 1900,
  'murcia': 1250,
  'vitoria': 2400,
  'gijon': 1400,
  'la coruna': 1800,
  'pamplona': 2600,
  'santander': 1900,
  'burgos': 1300,
  'albacete': 1100,
  'logrono': 1400,
  'salamanca': 1500,
  'huelva': 1050,
  'jaen': 750,
  'badajoz': 900,
  'cadiz': 1600,
  'jerez de la frontera': 1200,
  'san sebastian': 4500,
  'donostia': 4500,
}

// ── Provincias (fallback) ─────────────────────────────────────────────────────

const PROVINCIAS: Record<string, number> = {
  'almeria': 1100,
  'cadiz': 1500,
  'cordoba': 1000,
  'granada': 1300,
  'huelva': 950,
  'jaen': 700,
  'malaga': 2200,
  'sevilla': 1600,
  'madrid': 4000,
  'barcelona': 3700,
  'valencia': 2000,
  'alicante': 1800,
  'castellon': 1100,
  'murcia': 1200,
  'zaragoza': 1500,
  'huesca': 1000,
  'teruel': 650,
  'navarra': 1800,
  'pais vasco': 3200,
  'guipuzcoa': 3400,
  'vizcaya': 3000,
  'alava': 2200,
  'cantabria': 1700,
  'asturias': 1300,
  'galicia': 1400,
  'la coruna': 1600,
  'pontevedra': 1500,
  'lugo': 900,
  'ourense': 800,
  'castilla y leon': 1100,
  'salamanca': 1300,
  'valladolid': 1400,
  'burgos': 1200,
  'leon': 1000,
  'castilla la mancha': 900,
  'albacete': 1000,
  'toledo': 1000,
  'extremadura': 750,
  'badajoz': 800,
  'caceres': 850,
  'baleares': 3000,
  'canarias': 1800,
  'la rioja': 1300,
}

// ── Lookup ────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
}

export function buscarPrecioMunicipio(ciudad: string): PrecioReferencia | null {
  const slug = normalize(ciudad)

  // Exact municipality match
  if (MUNICIPIOS[slug] !== undefined) {
    return { precioM2: MUNICIPIOS[slug], nivel: 'municipio', fuente: 'tabla_referencia' }
  }

  // Partial match — city name contained in key or vice versa
  for (const [key, precio] of Object.entries(MUNICIPIOS)) {
    if (slug.includes(key) || key.includes(slug)) {
      return { precioM2: precio, nivel: 'municipio', fuente: 'tabla_referencia' }
    }
  }

  // Province fallback
  if (PROVINCIAS[slug] !== undefined) {
    return { precioM2: PROVINCIAS[slug], nivel: 'provincia', fuente: 'tabla_referencia' }
  }
  for (const [key, precio] of Object.entries(PROVINCIAS)) {
    if (slug.includes(key) || key.includes(slug)) {
      return { precioM2: precio, nivel: 'provincia', fuente: 'tabla_referencia' }
    }
  }

  return null
}
