// Esquema canónico del área DEUDA — normaliza planillas de brokers/servicers/fondos
// distintos a un único formato. Ver briefing original en /samples/estenpl.xlsx.

export type CampoCanonico =
  | 'contract_id' | 'n_loans' | 'tipo_colateral' | 'subtipo_colateral' | 'ccaa'
  | 'provincia' | 'ciudad' | 'zip' | 'direccion' | 'n_registro' | 'ref_catastral'
  | 'estado_judicial_raw' | 'deuda_ob' | 'deuda_tot' | 'titular_deuda'
  | 'cargas_previas' | 'cargas_posteriores' | 'asking_price' | 'valor_colateral'
  // Campos agregados 17/07/2026 al revisar 5 planillas reales de INMUBI (ANDALUCIA-CDR) —
  // texto/numero adicionales de brokers que no encajaban en ningún campo de arriba y antes
  // quedaban solo en campos_extra (jsonb, no filtrable/consultable en la UI).
  | 'portfolio' | 'bucket' | 'contract_id_secundario' | 'id_bien' | 'juzgado' | 'num_autos'
  | 'num_procedimiento' | 'tipo_procedimiento' | 'tipo_via' | 'numero_via' | 'n_finca_registral'
  | 'fecha_subasta' | 'fecha_cobro' | 'estado_subasta' | 'resultado_subasta' | 'flag_nuevo'
  | 'flag_eliminado' | 'vpo' | 'planta' | 'parcela' | 'comarca' | 'id_portal_subasta'
  | 'fecha_cesion_remate' | 'fecha_precio_referencia' | 'dev_id' | 'subfase' | 'ocupacion_broker'
  | 'status_final' | 'estado_colateral' | 'registro' | 'fr' | 'connection' | 'afectado_terceros'
  | 'motivo_paralizacion' | 'fecha_solicitud_adjudicacion' | 'fecha_cdr' | 'fecha_firma_cdr_closing'
  | 'propuesta_formalizada_closing' | 'fecha_firma_closing' | 'estado_broker' | 'estado_proc_flag'
  | 'principal' | 'precio_subasta' | 'importe_adjudicacion' | 'superficie_m2'
  | 'deuda_responsabilidad_hipotecaria' | 'n_contratos_activos'
  | 'ignorar'

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
  { id: 'deuda_tot',             label: 'Deuda total (con intereses y costas)',     tipo: 'numero' },
  { id: 'titular_deuda',         label: 'Titular de la deuda',                      tipo: 'texto' },
  { id: 'cargas_previas',        label: 'Cargas previas',                           tipo: 'numero' },
  { id: 'cargas_posteriores',    label: 'Cargas posteriores',                       tipo: 'numero' },
  { id: 'asking_price',          label: 'Asking price',                             tipo: 'numero' },
  { id: 'valor_colateral',       label: 'Valor del colateral (tasación)',           tipo: 'numero' },
  // --- agregados 17/07/2026 ---
  { id: 'portfolio',                          label: 'Portfolio / cartera',                        tipo: 'texto' },
  { id: 'bucket',                             label: 'Bucket',                                     tipo: 'texto' },
  { id: 'contract_id_secundario',             label: 'Contract ID secundario',                     tipo: 'texto' },
  { id: 'id_bien',                            label: 'ID del bien/activo',                         tipo: 'texto' },
  { id: 'juzgado',                            label: 'Juzgado',                                    tipo: 'texto' },
  { id: 'num_autos',                          label: 'Nº de autos',                                tipo: 'texto' },
  { id: 'num_procedimiento',                  label: 'Nº de procedimiento',                        tipo: 'texto' },
  { id: 'tipo_procedimiento',                 label: 'Tipo de procedimiento',                      tipo: 'texto' },
  { id: 'tipo_via',                           label: 'Tipo de vía',                                tipo: 'texto' },
  { id: 'numero_via',                         label: 'Número de vía',                              tipo: 'texto' },
  { id: 'n_finca_registral',                  label: 'Nº finca registral (IDUFIR)',                tipo: 'texto' },
  { id: 'fecha_subasta',                      label: 'Fecha de subasta',                           tipo: 'texto' },
  { id: 'fecha_cobro',                        label: 'Fecha de cobro',                             tipo: 'texto' },
  { id: 'estado_subasta',                     label: 'Estado de la subasta',                       tipo: 'texto' },
  { id: 'resultado_subasta',                  label: 'Resultado de la subasta',                    tipo: 'texto' },
  { id: 'flag_nuevo',                         label: 'Marca "nuevo" del broker',                   tipo: 'texto' },
  { id: 'flag_eliminado',                     label: 'Marca "eliminado" del broker',               tipo: 'texto' },
  { id: 'vpo',                                label: 'VPO',                                        tipo: 'texto' },
  { id: 'planta',                             label: 'Planta',                                     tipo: 'texto' },
  { id: 'parcela',                            label: 'Parcela',                                    tipo: 'texto' },
  { id: 'comarca',                            label: 'Comarca',                                    tipo: 'texto' },
  { id: 'id_portal_subasta',                  label: 'ID portal de subasta',                       tipo: 'texto' },
  { id: 'fecha_cesion_remate',                label: 'Fecha cesión de remate',                     tipo: 'texto' },
  { id: 'fecha_precio_referencia',            label: 'Fecha precio de referencia',                 tipo: 'texto' },
  { id: 'dev_id',                             label: 'Dev ID',                                     tipo: 'texto' },
  { id: 'subfase',                            label: 'Subfase',                                    tipo: 'texto' },
  { id: 'ocupacion_broker',                   label: 'Ocupación (texto del broker)',               tipo: 'texto' },
  { id: 'status_final',                       label: 'Status final',                               tipo: 'texto' },
  { id: 'estado_colateral',                   label: 'Estado del colateral',                       tipo: 'texto' },
  { id: 'registro',                           label: 'Registro',                                   tipo: 'texto' },
  { id: 'fr',                                 label: 'FR',                                         tipo: 'texto' },
  { id: 'connection',                         label: 'Connection',                                 tipo: 'texto' },
  { id: 'afectado_terceros',                  label: 'Afectado por terceros',                      tipo: 'texto' },
  { id: 'motivo_paralizacion',                label: 'Motivo de paralización',                     tipo: 'texto' },
  { id: 'fecha_solicitud_adjudicacion',       label: 'Fecha solicitud adjudicación',               tipo: 'texto' },
  { id: 'fecha_cdr',                          label: 'Fecha CDR',                                  tipo: 'texto' },
  { id: 'fecha_firma_cdr_closing',            label: 'Fecha firma CdR closing',                    tipo: 'texto' },
  { id: 'propuesta_formalizada_closing',      label: 'Propuesta formalizada closing',              tipo: 'texto' },
  { id: 'fecha_firma_closing',                label: 'Fecha firma closing',                        tipo: 'texto' },
  { id: 'estado_broker',                      label: 'Estado (texto del broker)',                  tipo: 'texto' },
  { id: 'estado_proc_flag',                   label: 'Flag de estado de procedimiento',            tipo: 'texto' },
  { id: 'principal',                          label: 'Principal',                                  tipo: 'numero' },
  { id: 'precio_subasta',                     label: 'Precio de subasta',                          tipo: 'numero' },
  { id: 'importe_adjudicacion',               label: 'Importe de adjudicación',                    tipo: 'numero' },
  { id: 'superficie_m2',                      label: 'Superficie (m²)',                            tipo: 'numero' },
  { id: 'deuda_responsabilidad_hipotecaria',  label: 'Deuda por responsabilidad hipotecaria',      tipo: 'numero' },
  { id: 'n_contratos_activos',                label: 'Nº de contratos activos',                    tipo: 'numero' },
  { id: 'ignorar',               label: '— No importar esta columna —',             tipo: 'texto' },
]

// Cada broker/fondo/banco manda un Excel distinto — algunos no traen precio, otros no traen
// municipio. Solo contract_id es imprescindible (es lo único que identifica la posición al importar).
export const CAMPOS_OBLIGATORIOS: CampoCanonico[] = ['contract_id']

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

// ─── Análisis Cesión de Crédito (metodología Master IN+) ─────────────────────

// Rating de dificultad: escala 1-5 (1=muy fácil, 5=muy difícil).
// Se infiere automáticamente desde los datos disponibles y se puede ajustar a mano.
export type RatingDificultad = 1 | 2 | 3 | 4 | 5

export type AnalisisCesion = {
  // 4 ratings de dificultad (Master IN+)
  rating_deudor: RatingDificultad | null        // Perfil del deudor: ¿es cooperativo?
  rating_posesion: RatingDificultad | null      // Obtener posesión: libre/alquilado/okupa
  rating_juzgado: RatingDificultad | null       // Velocidad y predictibilidad del juzgado
  rating_procedimiento: RatingDificultad | null // Fase del proceso judicial

  // Flags críticos que cambian la estrategia
  novada_hipoteca: boolean | null               // ¿Se ha novado la hipoteca? Complica la deuda
  vivienda_habitual: boolean | null             // Protección adicional al deudor en juicio
  hay_que_pagar_deudor: boolean | null          // ¿Hay deuda activa con el deudor?
  importe_pago_deudor: number | null            // Cuánto habría que pagarle

  // P&L completo de la cesión
  valor_mercado_garantia: number | null         // Valor de mercado estimado del inmueble
  precio_cesion: number | null                  // Lo que se paga por comprar el crédito
  gastos_inscripcion: number | null
  impuestos_cesion: number | null               // ITP u otros sobre la cesión
  comisiones: number | null
  impuestos_adjudicacion: number | null         // Impuestos si termina en adjudicación

  // Notas libres del análisis
  notas_analisis: string | null
}

export const RATING_LABEL: Record<RatingDificultad, string> = {
  1: 'Muy fácil',
  2: 'Fácil',
  3: 'Medio',
  4: 'Difícil',
  5: 'Muy difícil',
}

export const RATING_COLOR: Record<RatingDificultad, { color: string; bg: string }> = {
  1: { color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  2: { color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  3: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  4: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  5: { color: '#991b1b', bg: 'rgba(153,27,27,0.15)' },
}

// Emoji compacto para mostrar en la card del listado
export const RATING_EMOJI: Record<RatingDificultad, string> = {
  1: '🟢', 2: '🟢', 3: '🟡', 4: '🔴', 5: '🔴',
}

// Inferencia automática de ratings desde los datos existentes.
// Devuelve null cuando no hay suficiente info para inferir — el usuario lo rellena a mano.
export function inferirRatingsCesion(p: {
  ocupacion_estado?: string | null
  estado_judicial_normalizado?: string | null
  juzgado?: string | null
  fase_desahucio?: string | null  // campo del schema de inmuebles, no de deuda — si aplica
  id_portal_subasta?: string | null
  fecha_subasta?: string | null
  cargas_previas?: number | null
  asking_price?: number | null
  titular_deuda?: string | null
}): Pick<AnalisisCesion, 'rating_deudor' | 'rating_posesion' | 'rating_juzgado' | 'rating_procedimiento'> {
  // POSESIÓN — desde ocupacion_estado
  let rating_posesion: RatingDificultad | null = null
  if (p.ocupacion_estado === 'libre') rating_posesion = 1
  else if (p.ocupacion_estado === 'con_titulo') rating_posesion = 3
  else if (p.ocupacion_estado === 'sin_titulo') rating_posesion = 5
  else if (p.ocupacion_estado === 'desconocido') rating_posesion = 3

  // JUZGADO — desde si hay juzgado conocido y estado de subasta
  let rating_juzgado: RatingDificultad | null = null
  if (p.estado_judicial_normalizado === 'resuelto') rating_juzgado = 1
  else if (p.estado_judicial_normalizado === 'subasta_señalada') rating_juzgado = 2
  else if (p.estado_judicial_normalizado === 'subasta_pendiente') rating_juzgado = 3
  else if (p.estado_judicial_normalizado === 'oposicion') rating_juzgado = 4
  else if (p.estado_judicial_normalizado === 'prejudicial') rating_juzgado = 4

  // PROCEDIMIENTO — desde la fase del proceso
  let rating_procedimiento: RatingDificultad | null = null
  if (p.estado_judicial_normalizado === 'resuelto') rating_procedimiento = 1
  else if (p.id_portal_subasta || p.fecha_subasta) rating_procedimiento = 2
  else if (p.estado_judicial_normalizado === 'subasta_pendiente') rating_procedimiento = 3
  else if (p.estado_judicial_normalizado === 'oposicion') rating_procedimiento = 4
  else if (p.estado_judicial_normalizado === 'prejudicial') rating_procedimiento = 5

  // DEUDOR — heurístico desde cargas y ocupación (sin datos directos del deudor, inferencia débil)
  let rating_deudor: RatingDificultad | null = null
  const riesgoCargas = calcRatioRiesgoCargas(p.cargas_previas, p.asking_price)
  if (p.ocupacion_estado === 'libre' && !riesgoCargas.alerta) rating_deudor = 2
  else if (p.ocupacion_estado === 'sin_titulo') rating_deudor = 4
  else if (riesgoCargas.alerta) rating_deudor = 4

  return { rating_deudor, rating_posesion, rating_juzgado, rating_procedimiento }
}

// Beneficio estimado de la cesión = valor_mercado - precio_cesion - todos los gastos
export function calcBeneficioCesion(a: Partial<AnalisisCesion>): number | null {
  if (!a.valor_mercado_garantia || !a.precio_cesion) return null
  const gastos = (a.gastos_inscripcion || 0) + (a.impuestos_cesion || 0)
    + (a.comisiones || 0) + (a.impuestos_adjudicacion || 0) + (a.importe_pago_deudor || 0)
  return a.valor_mercado_garantia - a.precio_cesion - gastos
}

// Ocupación del inmueble — punto 4 del criterio del experto NPL: saber si está ocupado, por quién,
// y si hace falta visita de campo para confirmar. 'con_titulo' = alquilado/con derecho legal a estar,
// 'sin_titulo' = ocupa/okupa sin derecho — la estrategia y el riesgo son muy distintos entre ambos.
export const OCUPACION_ESTADOS = ['libre', 'con_titulo', 'sin_titulo', 'desconocido'] as const
export type OcupacionEstado = typeof OCUPACION_ESTADOS[number]
export const OCUPACION_LABEL: Record<OcupacionEstado, string> = {
  libre: 'Libre',
  con_titulo: 'Ocupado con título (alquiler)',
  sin_titulo: 'Ocupado sin título (okupa)',
  desconocido: 'Desconocido — pendiente visita',
}
export const OCUPACION_COLOR: Record<OcupacionEstado, { color: string; bg: string }> = {
  libre:        { color: '#22C55E', bg: 'rgba(34,197,94,0.15)'  },
  con_titulo:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  sin_titulo:   { color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
  desconocido:  { color: '#888',    bg: 'rgba(136,136,136,0.12)' },
}

// Motivo de descarte rápido — punto 1: ~90% de las NPL se descartan en 30-40 min, es lo normal,
// no un fallo. Un motivo de 1 click deja el criterio registrado sin obligar a escribir nada.
export const MOTIVOS_DESCARTE = [
  'ratio_colateral_insuficiente', 'descuento_insuficiente', 'ocupacion_compleja',
  'expediente_muy_largo', 'cargas_excesivas', 'fuera_zona', 'otro',
] as const
export type MotivoDescarte = typeof MOTIVOS_DESCARTE[number]
export const MOTIVO_DESCARTE_LABEL: Record<MotivoDescarte, string> = {
  ratio_colateral_insuficiente: 'Deuda / colateral insuficiente',
  descuento_insuficiente: 'Descuento sobre deuda insuficiente (<30%)',
  ocupacion_compleja: 'Ocupación compleja',
  expediente_muy_largo: 'Expediente judicial muy largo',
  cargas_excesivas: 'Cargas previas excesivas',
  fuera_zona: 'Fuera de zona de interés',
  otro: 'Otro',
}

// Un ítem de carga detallado (punto 5: valorar cada carga por separado, no solo el agregado)
export type CargaDetalle = {
  id: string
  concepto: string
  importe: number | null
  tipo: 'previa' | 'posterior'
  notas?: string
}

// Ratio 2A del criterio NPL — deuda existente (con intereses/costas) vs valor de tasación del
// colateral. Relevante cuando la estrategia es quedarse con el inmueble y negociar con el deudor
// (ej. dación en pago): la deuda debería ser cercana, igual o mayor al valor del colateral —
// cuanto más alta la deuda respecto al colateral, más fuerza de negociación.
export function calcRatioColateral(deudaTot: number | null | undefined, valorColateral: number | null | undefined) {
  if (!valorColateral || valorColateral <= 0) {
    return { ratio: null as number | null, sinValor: true, bueno: false }
  }
  const dt = deudaTot ?? 0
  const ratio = dt / valorColateral
  return { ratio, sinValor: false, bueno: ratio >= 1 }
}

// Ratio 2B del criterio NPL — descuento sobre la deuda total (no el asking price sobre el OB):
// cuánto se paga por comprar la deuda respecto a lo que esa deuda vale en total con intereses/costas.
// Mínimo aceptable de Pato: 30% de descuento. Reemplaza el uso de calcDescuento() en la ficha de Deuda
// (que seguía comparando contra deuda_ob) — se mantiene calcDescuento() genérica para otros usos.
export function calcDescuentoDeuda(deudaTot: number | null | undefined, askingPrice: number | null | undefined) {
  if (!deudaTot || deudaTot <= 0 || askingPrice === null || askingPrice === undefined) return null
  return (deudaTot - askingPrice) / deudaTot
}

// Capa 0 de pre-descarte automático al importar — matemática pura, sin IA, sin coste.
// Reglas (diseñadas con Pato, 17/07/2026):
//   · asking_price null → no descartar, queda activo con badge "sin precio para evaluar"
//   · cargas_previas > asking_price → descartar (cargas_excesivas)
//   · descuento sobre deuda_tot < 30% → descartar (descuento_insuficiente)
// El descarte es REVERSIBLE — "Volver a activo" desde la ficha.
export type PreDescarteResult =
  | { descartar: true; motivo: 'descuento_insuficiente' | 'cargas_excesivas' }
  | { descartar: false; sinPrecio: boolean }

export function calcPreDescarte(
  deudaTot: number | null | undefined,
  askingPrice: number | null | undefined,
  cargasPrevias: number | null | undefined,
): PreDescarteResult {
  if (askingPrice === null || askingPrice === undefined || askingPrice <= 0) {
    return { descartar: false, sinPrecio: true }
  }
  const cp = cargasPrevias ?? 0
  if (cp > askingPrice) {
    return { descartar: true, motivo: 'cargas_excesivas' }
  }
  const descuento = calcDescuentoDeuda(deudaTot, askingPrice)
  if (descuento !== null && descuento < 0.30) {
    return { descartar: true, motivo: 'descuento_insuficiente' }
  }
  return { descartar: false, sinPrecio: false }
}

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
  valor_colateral: number | null
  // --- agregados 17/07/2026 ---
  portfolio: string | null
  bucket: string | null
  contract_id_secundario: string | null
  id_bien: string | null
  juzgado: string | null
  num_autos: string | null
  num_procedimiento: string | null
  tipo_procedimiento: string | null
  tipo_via: string | null
  numero_via: string | null
  n_finca_registral: string | null
  fecha_subasta: string | null
  fecha_cobro: string | null
  estado_subasta: string | null
  resultado_subasta: string | null
  flag_nuevo: string | null
  flag_eliminado: string | null
  vpo: string | null
  planta: string | null
  parcela: string | null
  comarca: string | null
  id_portal_subasta: string | null
  fecha_cesion_remate: string | null
  fecha_precio_referencia: string | null
  dev_id: string | null
  subfase: string | null
  ocupacion_broker: string | null
  status_final: string | null
  estado_colateral: string | null
  registro: string | null
  fr: string | null
  connection: string | null
  afectado_terceros: string | null
  motivo_paralizacion: string | null
  fecha_solicitud_adjudicacion: string | null
  fecha_cdr: string | null
  fecha_firma_cdr_closing: string | null
  propuesta_formalizada_closing: string | null
  fecha_firma_closing: string | null
  estado_broker: string | null
  estado_proc_flag: string | null
  principal: number | null
  precio_subasta: number | null
  importe_adjudicacion: number | null
  superficie_m2: number | null
  deuda_responsabilidad_hipotecaria: number | null
  n_contratos_activos: number | null
  campos_extra: Record<string, any> | null
  broker_origen: string | null
  archivo_origen: string | null
  importacion_id: string | null
  lat: number | null
  lng: number | null
  imagen_url: string | null
  estado_interno: string
  raw_data: Record<string, any> | null
  // Campos de due diligence NPL (criterio del experto, cargados a mano en la ficha) —
  // ninguno viene del Excel del broker salvo valor_colateral (arriba, opcional en el mapeo).
  motivo_descarte: MotivoDescarte | null
  tiempo_estimado_meses: number | null
  ocupacion_estado: OcupacionEstado | null
  visita_realizada: boolean | null
  visita_fecha: string | null
  visita_notas: string | null
  estrategia_prevista: string | null
  coste_fiscal_estimado: string | null
  cargas_detalle: CargaDetalle[] | null
  favorito: boolean
  resumen_ia: string | null
  analisis_cesion: AnalisisCesion | null
  datos_catastro: DatosCatastro | null
  valor_mercado_grupo: number | null
  created_at: string
  updated_at: string
}

export type DatosCatastro = {
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

export type GrupoDeuda = {
  contractId: string
  items: DeudaPosicion[]
  askingTotal: number
  obTotal: number
  deudaTotTotal: number
  valorColateralTotal: number | null
  valorMercadoGrupo: number | null
  ciudad: string | null | undefined
  provincia: string | null | undefined
  broker: string | null | undefined
  titular: string | null | undefined
  estadoJudicial: EstadoJudicialNormalizado | undefined
  imagenUrl: string | null | undefined
  tieneAlerta: boolean
  sinPrecio: boolean
  esFavorito: boolean
}

// Agrupa posiciones por contract_id (un contrato puede tener varias garantías/inmuebles)
// — usado tanto en el listado en grilla como en el mapa, para no duplicar la lógica.
export function agruparPorContrato(posiciones: DeudaPosicion[]): GrupoDeuda[] {
  const map = new Map<string, DeudaPosicion[]>()
  posiciones.forEach(p => {
    const arr = map.get(p.contract_id) || []
    arr.push(p)
    map.set(p.contract_id, arr)
  })
  return Array.from(map.entries()).map(([contractId, items]) => ({
    contractId,
    items,
    askingTotal: items.reduce((s, i) => s + (i.asking_price || 0), 0),
    obTotal: items.reduce((s, i) => s + (i.deuda_ob || 0), 0),
    deudaTotTotal: items.reduce((s, i) => s + (i.deuda_tot || 0), 0),
    valorColateralTotal: items.some(i => i.valor_colateral != null) ? items.reduce((s, i) => s + (i.valor_colateral || 0), 0) : null,
    valorMercadoGrupo: items.find(i => i.valor_mercado_grupo != null)?.valor_mercado_grupo ?? null,
    ciudad: items[0]?.ciudad,
    provincia: items[0]?.provincia,
    broker: items[0]?.broker_origen,
    titular: items.find(i => i.titular_deuda)?.titular_deuda,
    estadoJudicial: items.find(i => i.estado_judicial_normalizado)?.estado_judicial_normalizado as EstadoJudicialNormalizado | undefined,
    imagenUrl: items.find(i => i.imagen_url)?.imagen_url,
    tieneAlerta: items.some(i => calcRatioRiesgoCargas(i.cargas_previas, i.asking_price).alerta),
    sinPrecio: items.every(i => i.asking_price == null || i.asking_price <= 0),
    esFavorito: items.some(i => i.favorito),
  }))
}
