// Precios de referencia €/m² vivienda libre — cierres reales escriturados
// Fuente primaria: Portal Estadístico del Notariado — mar 2025 / feb 2026
// Fuente secundaria: estimaciones MITMA / Registradores de España — Q1 2025

export interface PrecioReferencia {
  precioM2: number
  nivel: 'notariado_municipio' | 'notariado_provincia' | 'municipio' | 'provincia'
  fuente: 'notariado' | 'tabla_referencia'
}

// ── Portal del Notariado — datos reales de cierres escriturados ───────────────
// Período: marzo 2025 – febrero 2026 (informe 08/05/2026)

const NOTARIADO_MUNICIPIOS: Record<string, number> = {
  'albox': 644,
  'pulpi': 1750,  // promedio nuevo+usado (notariado = 2006 sesgado a nuevo)
  'cuevas del almanzora': 918,
  'vera': 1661,
  'mojacar': 1962,
  'garrucha': 1295,
  'huercal-overa': 814,
  'huercal overa': 814,
  'olula del rio': 559,
  'cantoria': 650,
  'turre': 1185,
  'carboneras': 1466,
  'los gallardos': 1126,
  'gallardos': 1126,
  'antas': 922,
  'zurgena': 990,
  'nijar': 977,
  'huercal de almeria': 1012,
  'vicar': 890,
  'roquetas de mar': 1408,
}

const NOTARIADO_PROVINCIAS: Record<string, number> = {
  'almeria': 1206,
}

// ── Estimaciones MITMA / mercado (municipios sin datos notariales) ─────────────

const MUNICIPIOS: Record<string, number> = {
  // Almería provincia — municipios no cubiertos por notariado
  'almeria': 1350,
  'el ejido': 1050,
  'adra': 900,
  'berja': 700,
  'baza': 650,
  'guadix': 750,
  'aguadulce': 1300,
  'bedar': 900,
  'lubrin': 700,
  'lubrin': 700,

  // Murcia provincia (frontera con Almería)
  'lorca': 750,
  'aguilas': 1100,
  'mazarron': 1200,
  'totana': 750,
  'murcia': 1250,
  'cartagena': 1300,

  // Málaga
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

const PROVINCIAS: Record<string, number> = {
  'almeria': 1206,
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

function matchRecord(slug: string, record: Record<string, number>): number | null {
  if (record[slug] !== undefined) return record[slug]
  for (const [key, precio] of Object.entries(record)) {
    if (slug.includes(key) || key.includes(slug)) return precio
  }
  return null
}

export function buscarPrecioMunicipio(ciudad: string): PrecioReferencia | null {
  const slug = normalize(ciudad)

  // 1. Notariado municipio — cierres reales escriturados (prioritario)
  const nm = matchRecord(slug, NOTARIADO_MUNICIPIOS)
  if (nm !== null) return { precioM2: nm, nivel: 'notariado_municipio', fuente: 'notariado' }

  // 2. Notariado provincia
  const np = matchRecord(slug, NOTARIADO_PROVINCIAS)
  if (np !== null) return { precioM2: np, nivel: 'notariado_provincia', fuente: 'notariado' }

  // 3. Estimación municipio (MITMA)
  const em = matchRecord(slug, MUNICIPIOS)
  if (em !== null) return { precioM2: em, nivel: 'municipio', fuente: 'tabla_referencia' }

  // 4. Estimación provincia (MITMA)
  const ep = matchRecord(slug, PROVINCIAS)
  if (ep !== null) return { precioM2: ep, nivel: 'provincia', fuente: 'tabla_referencia' }

  return null
}
