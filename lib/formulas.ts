// Fórmulas financieras de Wallest/HASU — NO modificar sin instrucción explícita

const NOTARIA = 500
const REGISTRO = 500
const ITP_RATE = 0.02

export function calcGastosFijos(compra: number): number {
  return Math.floor(compra * ITP_RATE) + NOTARIA + REGISTRO
}

export function calcCostoTotal(compra: number, reforma: number): number {
  return compra + reforma + calcGastosFijos(compra)
}

export function calcBeneficioNeto(venta: number, compra: number, reforma: number): number {
  return venta - calcCostoTotal(compra, reforma)
}

export function calcROI(venta: number, compra: number, reforma: number): number {
  const costo = calcCostoTotal(compra, reforma)
  return (venta - costo) / costo
}

// Precio máximo de compra para alcanzar un ROI objetivo dado un precio de venta
// Derivación:
//   coste_total = compra × 1.02 + reforma + 1000
//   coste_total = venta / (1 + roiTarget)
//   compra = (venta / (1 + roiTarget) - reforma - 1000) / 1.02
// Nunca redondear hacia arriba — usar Math.floor
export function calcPrecioMaxCompra(
  venta: number,
  reforma: number,
  roiTarget: number
): number {
  const costoTotal = venta / (1 + roiTarget)
  const compra = (costoTotal - reforma - NOTARIA - REGISTRO) / (1 + ITP_RATE)
  return Math.floor(compra)
}

export interface Escenario {
  roiTarget: number
  label: string
  precioMaxCompra: number
  costoTotal: number
  beneficioNeto: number
  roi: number
}

export function calcEscenarios(venta: number, reforma: number): Escenario[] {
  const targets = [
    { roi: 0.30, label: 'Conservador' },
    { roi: 0.50, label: 'Realista' },
    { roi: 0.70, label: 'Optimista' },
  ]
  return targets.map(({ roi, label }) => {
    const precioMaxCompra = calcPrecioMaxCompra(venta, reforma, roi)
    return {
      roiTarget: roi,
      label,
      precioMaxCompra,
      costoTotal: calcCostoTotal(precioMaxCompra, reforma),
      beneficioNeto: calcBeneficioNeto(venta, precioMaxCompra, reforma),
      roi: calcROI(venta, precioMaxCompra, reforma),
    }
  })
}
