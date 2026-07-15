// Checklist de documentación/alertas para inmuebles en estudio (Mercado).
// Objetivo: no volver a llegar a una compra sin haber revisado estos puntos.

export type ChecklistItemEstado = 'ok' | 'alerta' | 'no_aplica'

export type ChecklistDocumentacion = {
  items?: Record<string, ChecklistItemEstado>
  notas?: Record<string, string>
  overrideNota?: string
  overrideAt?: string
}

export type ChecklistItemDef = { key: string; label: string; bloqueante: boolean }

// bloqueante = frena el paso a "Comprado" si no está en 'ok' o 'no_aplica'
export const CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { key: 'nota_simple', label: 'Nota simple', bloqueante: true },
  { key: 'licencia_primera_ocupacion', label: 'Licencia de primera ocupación', bloqueante: true },
  { key: 'licencia_final_obra', label: 'Licencia de final de obra', bloqueante: true },
  { key: 'cedula_habitabilidad', label: 'Cédula de habitabilidad', bloqueante: true },
  { key: 'cargas_registrales', label: 'Cargas registrales / servidumbres', bloqueante: true },
  { key: 'sin_posesion', label: 'Sin posesión', bloqueante: true },
  { key: 'okupado', label: 'Okupado', bloqueante: true },
  { key: 'ite', label: 'ITE — Inspección Técnica del Edificio', bloqueante: true },
  { key: 'obra_nueva_construccion', label: 'Obra nueva en construcción', bloqueante: false },
  { key: 'vandalizado', label: 'Vandalizado', bloqueante: false },
  { key: 'certificado_energetico', label: 'Certificado energético', bloqueante: false },
  { key: 'ibi_al_dia', label: 'IBI al día', bloqueante: false },
  { key: 'deuda_comunidad', label: 'Deuda de comunidad', bloqueante: false },
]

export function getItemEstado(cd: ChecklistDocumentacion | null | undefined, key: string): ChecklistItemEstado | 'pendiente' {
  return cd?.items?.[key] ?? 'pendiente'
}

// Bloqueantes sin resolver = todavía no marcados 'ok' ni 'no_aplica' (incluye 'pendiente' y 'alerta')
export function getBloqueantesPendientes(cd: ChecklistDocumentacion | null | undefined): ChecklistItemDef[] {
  return CHECKLIST_ITEMS.filter(i => i.bloqueante && getItemEstado(cd, i.key) !== 'ok' && getItemEstado(cd, i.key) !== 'no_aplica')
}

// Cualquier ítem (bloqueante o no) marcado explícitamente como problema confirmado
export function getAlertasConfirmadas(cd: ChecklistDocumentacion | null | undefined): ChecklistItemDef[] {
  return CHECKLIST_ITEMS.filter(i => getItemEstado(cd, i.key) === 'alerta')
}
