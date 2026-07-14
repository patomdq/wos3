// Esquema canónico del área DEUDA — normaliza planillas de brokers/servicers/fondos
// distintos a un único formato. Ver briefing original en /samples/estenpl.xlsx.

export type CampoCanonico =
  | 'contract_id' | 'n_loans' | 'tipo_colateral' | 'subtipo_colateral' | 'ccaa'
  | 'provincia' | 'ciudad' | 'zip' | 'direccion' | 'n_registro' | 'ref_catastral'
  | 'estado_judicial_raw' | 'deuda_ob' | 'deuda_tot' | 'titular_deuda'
  | 'cargas_previas' | 'cargas_posteriores' | 'asking_price' | 'ignorar'

export const CAMPOS_CANONICOS: { id: CampoCanonico; label: string; tipo: 'texto' | 'numero' }[] = [
  { id: 'contract_id',          label: 'Contract ID (identificador del contrato)', tipo: 'texto' },
  { id: 'n_loans',               label: 'Nº de préstamos',                          tipo: 'numero' },
  { id: 'tipo_colateral',        label: 'Tipo de colateral',                        tipo: 'texto' },
  { id: 'subtipo_colateral',     label: 'Subtipo de colateral',                     tipo: 'texto' },
  { id: 'ccaa',                  label: 'CCAA',                                     tipo: 'texto' },
  { id: 'provincia',             label: 'Provincia',                                tipo: 'texto' },
  { id: 'ciudad',                label: 'Ciudad',                                   tipo: 'texto' },
  { id: 'zip',                   label: 'Código postal',                            tipo: 'texto' },
  { id: 'direccion',             label: 'Dirección',                                tipo: 'texto' },
  { id: 'n_registro',            label: 'Nº Registro',                              tipo: 'texto' },
  { id: 'ref_catastral',         label: 'Referencia catastral',                     tipo: 'texto' },
  { id: 'estado_judicial_raw',   label: 'Estado judicial (texto del broker)',       tipo: 'texto' },
  { id: 'deuda_ob',              label: 'Deuda OB (outstanding balance)',           tipo: 'numero' },
  { id: 'deuda_tot',             label: 'Deuda total',                              tipo: 'numero' },
  { id: 'titular_deuda',         label: 'Titular de la deuda',                      tipo: 'texto' },
  { id: 'cargas_previas',        label: 'Cargas previas',                           tipo: 'numero' },
  { id: 'cargas_posteriores',    label: 'Cargas posteriores',                       tipo: 'numero' },
  { id: 'asking_price',          label: 'Asking price',                             tipo: 'numero' },
  { id: 'ignorar',               label: '— No importar esta columna —',             tipo: 'texto' },
]

export const CAMPOS_OBLIGATORIOS: CampoCanonico[] = ['contract_id', 'asking_price']

export type Mapeo = Record<string, CampoCanonico> // { columna_excel: campo_canonico }

export const ESTADOS_JUDICIALES_NORMALIZADOS = [
  'prejudicial', 'subasta_señalada', 'subasta_pendiente', 'oposicion', 'resuelto', 'otro',
] as const
export type EstadoJudicialNormalizado = typeof ESTADOS_JUDICIALES_NORMALIZADOS[number]

export const ESTADO_JUDICIAL_LABEL: Record<EstadoJudicialNormalizado, string> = {
  prejudicial: 'Prejudicial',
  subasta_señalada: 'Subasta señalada',
  subasta_pendiente: 'Subasta pendiente',
  oposicion: 'Oposición',
  resuelto: 'Resuelto',
  otro: 'Otro',
}

export const ESTADO_JUDICIAL_COLOR: Record<EstadoJudicialNormalizado, { color: string; bg: string }> = {
  prejudicial:       { color: '#888',    bg: 'rgba(136,136,136,0.12)' },
  subasta_señalada:  { color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  subasta_pendiente: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  oposicion:         { color: '#a78bfa', bg: 'rgba(167,139,250,0.15)'},
  resuelto:          { color: '#22C55E', bg: 'rgba(34,197,94,0.15)'  },
  otro:              { color: '#60A5FA', bg: 'rgba(96,165,250,0.15)' },
}

export const ESTADO_INTERNO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  nuevo:        { label: 'Nuevo',        color: '#60A5FA', bg: 'rgba(96,165,250,0.15)' },
  en_analisis:  { label: 'En análisis',  color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  descartado:   { label: 'Descartado',   color: '#888',    bg: 'rgba(136,136,136,0.12)' },
  comprado:     { label: 'Comprado',     color: '#22C55E', bg: 'rgba(34,197,94,0.15)'  },
}

// ratio de riesgo de cargas: cargas_previas tienen prioridad de cobro sobre el crédito comprado.
// Si no hay asking_price todavía, el ratio no se puede calcular — estado aparte, no 0.
export function calcRatioRiesgoCargas(cargasPrevias: number | null | undefined, askingPrice: number | null | undefined) {
  const cp = cargasPrevias ?? 0
  if (askingPrice === null || askingPrice === undefined || askingPrice <= 0) {
    return { ratio: null as number | null, sinPrecio: true, alerta: cp > 0 }
  }
  const ratio = cp / askingPrice
  return { ratio, sinPrecio: false, alerta: cp > askingPrice }
}

export function calcDescuento(deudaOb: number | null | undefined, askingPrice: number | null | undefined) {
  if (!deudaOb || deudaOb <= 0 || askingPrice === null || askingPrice === undefined) return null
  return (deudaOb - askingPrice) / deudaOb
}

export const BROKER_ORIGEN_DEFAULT = 'Sin especificar'

export type DeudaPosicion = {
  id: string
  contract_id: string
  n_loans: number | null
  tipo_colateral: string | null
  subtipo_colateral: string | null
  ccaa: string | null
  provincia: string | null
  ciudad: string | null
  zip: string | null
  direccion: string | null
  n_registro: string | null
  ref_catastral: string | null
  estado_judicial_raw: string | null
  estado_judicial_normalizado: EstadoJudicialNormalizado | null
  deuda_ob: number | null
  deuda_tot: number | null
  titular_deuda: string | null
  cargas_previas: number | null
  cargas_posteriores: number | null
  asking_price: number | null
  campos_extra: Record<string, any> | null
  broker_origen: string | null
  archivo_origen: string | null
  importacion_id: string | null
  lat: number | null
  lng: number | null
  estado_interno: string
  raw_data: Record<string, any> | null
  created_at: string
  updated_at: string
}
