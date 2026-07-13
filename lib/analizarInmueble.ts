// Análisis rápido de inmueble — usado por bot Telegram y chat WOS3 por igual.
// Único punto de enchufe futuro para Fragua: reemplazar buscarComparables() acá adentro.
import { calcCostoTotal, calcBeneficioNeto, calcROI, calcEscenarios } from './formulas'
import { buscarComparables, type Comparable } from './search-comparables'

export interface AnalisisInput {
  direccion?: string
  ciudad: string
  precioCompra: number
  reforma: number
  superficie?: number
  habitaciones?: number
  precioVentaManual?: number
  alquilerMensual?: number
  duracionMeses?: number
}

export type SemaforoColor = 'verde' | 'amarillo' | 'rojo'

export interface Semaforo {
  color: SemaforoColor
  emoji: string
  label: string
}

export interface AnalisisResultado {
  direccion: string | null
  ciudad: string
  precioCompra: number
  reforma: number
  precioVenta: number
  fuenteVenta: string
  comparables: Comparable[]
  costoTotal: number
  beneficioNeto: number
  roi: number
  roiAnualizado: number | null
  semaforo: Semaforo
  precioMax30: number
  precioMax50: number
  precioMax70: number
  alquilerMensual: number | null
}

// Umbral único de WOS3: ROI mínimo aceptable 30% escenario conservador (CLAUDE.md).
// Reemplaza el criterio distinto que tenía el bot de Telegram (rojo<30/amarillo≤50/verde>50).
export function calcularSemaforo(roi: number): Semaforo {
  if (roi >= 0.30) return { color: 'verde', emoji: '🟢', label: 'Verde' }
  if (roi >= 0.15) return { color: 'amarillo', emoji: '🟡', label: 'Amarillo' }
  return { color: 'rojo', emoji: '🔴', label: 'Rojo' }
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('es-ES')
}

export async function analizarInmueble(input: AnalisisInput): Promise<{
  resultado: AnalisisResultado
  textoReporte: string
}> {
  let precioVenta = input.precioVentaManual && input.precioVentaManual > 0 ? input.precioVentaManual : null
  let fuenteVenta = precioVenta ? 'manual' : 'sin_datos'
  let comparables: Comparable[] = []

  if (input.superficie && input.superficie > 0) {
    const busqueda = await buscarComparables(input.ciudad, input.superficie, input.habitaciones)
    comparables = busqueda.comparables
    if (!precioVenta) {
      if (busqueda.precioSugerido) {
        precioVenta = busqueda.precioSugerido
        fuenteVenta = busqueda.fuente
      } else if (busqueda.precioNotariadoSugerido) {
        precioVenta = busqueda.precioNotariadoSugerido
        fuenteVenta = busqueda.fuenteNotariado ?? 'notarial'
      }
    }
  }

  if (!precioVenta) {
    throw new Error(
      'No se pudo estimar el precio de venta: falta la superficie para buscar comparables, o un precio de venta manual.'
    )
  }

  const costoTotal = calcCostoTotal(input.precioCompra, input.reforma)
  const beneficioNeto = calcBeneficioNeto(precioVenta, input.precioCompra, input.reforma)
  const roi = calcROI(precioVenta, input.precioCompra, input.reforma)
  const roiAnualizado = input.duracionMeses ? roi * (12 / input.duracionMeses) : null
  const escenarios = calcEscenarios(precioVenta, input.reforma)
  const semaforo = calcularSemaforo(roi)

  const resultado: AnalisisResultado = {
    direccion: input.direccion ?? null,
    ciudad: input.ciudad,
    precioCompra: input.precioCompra,
    reforma: input.reforma,
    precioVenta,
    fuenteVenta,
    comparables,
    costoTotal,
    beneficioNeto,
    roi,
    roiAnualizado,
    semaforo,
    precioMax30: escenarios.find(e => e.roiTarget === 0.30)!.precioMaxCompra,
    precioMax50: escenarios.find(e => e.roiTarget === 0.50)!.precioMaxCompra,
    precioMax70: escenarios.find(e => e.roiTarget === 0.70)!.precioMaxCompra,
    alquilerMensual: input.alquilerMensual ?? null,
  }

  const textoReporte = buildTextoReporte(resultado)

  return { resultado, textoReporte }
}

function buildTextoReporte(r: AnalisisResultado): string {
  const lineas: string[] = []
  lineas.push(`${r.semaforo.emoji} ${r.direccion ?? r.ciudad} — ROI ${(r.roi * 100).toFixed(1)}%`)
  if (r.roiAnualizado !== null) lineas.push(`ROI anualizado: ${(r.roiAnualizado * 100).toFixed(1)}%`)
  lineas.push('')
  lineas.push(`Compra: ${fmt(r.precioCompra)}€ · Reforma: ${fmt(r.reforma)}€`)
  lineas.push(`Venta estimada: ${fmt(r.precioVenta)}€ (fuente: ${r.fuenteVenta})`)
  if (r.alquilerMensual) lineas.push(`Alquiler estimado: ${fmt(r.alquilerMensual)}€/mes`)
  lineas.push(`Costo total inversión: ${fmt(r.costoTotal)}€`)
  lineas.push(`Beneficio neto: ${fmt(r.beneficioNeto)}€`)
  lineas.push('')
  lineas.push('Precio máximo de compra para cada escenario de ROI:')
  lineas.push(`· 30% (conservador): ${fmt(r.precioMax30)}€`)
  lineas.push(`· 50% (realista): ${fmt(r.precioMax50)}€`)
  lineas.push(`· 70% (optimista): ${fmt(r.precioMax70)}€`)
  if (r.comparables.length > 0) {
    lineas.push('')
    lineas.push(`Comparables de mercado (${r.comparables.length}):`)
    for (const c of r.comparables.slice(0, 3)) {
      lineas.push(`· ${fmt(c.precio)}€${c.precioM2 ? ` (${fmt(c.precioM2)}€/m²)` : ''} — ${c.titulo ?? c.direccion ?? c.portal}`)
    }
  }
  return lineas.join('\n')
}
