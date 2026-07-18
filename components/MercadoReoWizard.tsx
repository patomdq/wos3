'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { authFetch } from '@/lib/auth-fetch'

const INP = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333', borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%' } as const
const CONFIANZA_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alta:  { label: 'Alta',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  media: { label: 'Media', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  baja:  { label: 'Baja',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
}

const CAMPOS_DESTINO = [
  { id: 'ignorar',             label: '— Ignorar —' },
  { id: 'tipologia',           label: 'Tipo activo' },
  { id: 'subtipo',             label: 'Subtipo activo' },
  { id: 'direccion',           label: 'Dirección' },
  { id: 'codigo_postal',       label: 'Código postal' },
  { id: 'ciudad',              label: 'Localidad / Ciudad' },
  { id: 'provincia',           label: 'Provincia' },
  { id: 'ccaa',                label: 'CCAA' },
  { id: 'superficie',          label: 'Superficie m²' },
  { id: 'precio',              label: 'Precio orientativo' },
  { id: 'ref_catastral',       label: 'Referencia catastral' },
  { id: 'asset_id_servicer',   label: 'Asset ID (servicer)' },
  { id: 'portfolio_reo',       label: 'Cartera / Portfolio' },
  { id: 'estado_ocupacion',    label: 'Estado de ocupación' },
  { id: 'estado_judicial_reo', label: 'Estado judicial' },
  { id: 'fase_desahucio',      label: 'Fase desahucio' },
  { id: 'numero_finca',        label: 'Nº finca registral' },
  { id: 'localidad_registro',  label: 'Localidad registro' },
  { id: 'numero_registro',     label: 'Nº registro' },
]

type MapeoItem = { campo: string; confianza: 'alta' | 'media' | 'baja' }
type Resultado = { n_insertados: number; n_sin_precio: number; n_con_alertas: number }

export default function MercadoReoWizard({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<'archivo' | 'mapeo' | 'resultado'>('archivo')
  const [servicer, setServicer] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [mapeo, setMapeo] = useState<Record<string, MapeoItem>>({})
  const [cargando, setCargando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const parsearYProponerMapeo = async () => {
    if (!servicer.trim() || !archivo) { setError('Completá el nombre del servicer y elegí un archivo'); return }
    setError(''); setCargando(true)
    try {
      const buf = await archivo.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][]
      if (data.length < 2) throw new Error('El archivo no tiene filas de datos')
      const hs = (data[0] as any[]).map(h => String(h).trim())
      const rs = data.slice(1).filter(r => r.some(v => v !== '' && v !== null && v !== undefined))
      setHeaders(hs); setRows(rs)

      const res = await authFetch('/api/mercado/mapeo-reo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicer: servicer.trim(), headers: hs, sampleRows: rs.slice(0, 5) }),
      })
      const data2 = await res.json()
      if (!res.ok) throw new Error(data2.error || 'Error al proponer mapeo')
      setMapeo(data2.mapeo || {})
      setStep('mapeo')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  const confirmarImport = async () => {
    setError(''); setImportando(true)
    try {
      const mapeoSimple: Record<string, string> = {}
      for (const [col, v] of Object.entries(mapeo)) {
        if (v.campo !== 'ignorar') mapeoSimple[col] = v.campo
      }
      const res = await authFetch('/api/mercado/import-reo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicer: servicer.trim(), mapeo: mapeoSimple, rows, headers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al importar')
      setResultado(data)
      setStep('resultado')
      onImported()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImportando(false)
    }
  }

  const STEP_N = { archivo: 1, mapeo: 2, resultado: 3 }
  const stepActual = STEP_N[step]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'Marcellus, Georgia, serif', fontSize: 20, color: '#14110C' }}>Importar REOs</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Carga masiva desde planilla del servicer</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Pasos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          {[{ n: 1, label: 'Archivo' }, { n: 2, label: 'Mapeo' }, { n: 3, label: 'Resultado' }].map(({ n, label }, idx) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: stepActual >= n ? '#A6855A' : '#F0EEE8', color: stepActual >= n ? '#fff' : '#999' }}>{n}</div>
              <span style={{ fontSize: 13, color: stepActual === n ? '#14110C' : '#999', fontWeight: stepActual === n ? 700 : 400 }}>{label}</span>
              {idx < 2 && <div style={{ width: 32, height: 1, background: '#E8E8E8' }} />}
            </div>
          ))}
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        {/* Paso 1 — Archivo */}
        {step === 'archivo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Servicer / Banco</label>
              <input style={INP} placeholder="Ej: Aliseda, Solvia, Servihabitat…" value={servicer} onChange={e => setServicer(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>Archivo Excel (.xlsx)</label>
              <input type="file" accept=".xlsx,.xls" onChange={e => setArchivo(e.target.files?.[0] || null)}
                style={{ fontSize: 13, color: '#555' }} />
            </div>
            <button onClick={parsearYProponerMapeo} disabled={cargando}
              style={{ background: '#14110C', color: '#F8F3E9', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.6 : 1, marginTop: 8 }}>
              {cargando ? 'Analizando columnas…' : 'Siguiente →'}
            </button>
          </div>
        )}

        {/* Paso 2 — Mapeo */}
        {step === 'mapeo' && (
          <div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              {rows.length} filas detectadas. Revisá el mapeo propuesto por IA y corregí si hace falta.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 360, overflowY: 'auto' }}>
              {headers.map(h => {
                const item = mapeo[h] || { campo: 'ignorar', confianza: 'baja' as const }
                const cfg = CONFIANZA_CFG[item.confianza] || CONFIANZA_CFG.baja
                return (
                  <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#FAFAF8', borderRadius: 10, border: '1px solid #F0EEE8' }}>
                    <div style={{ fontSize: 13, color: '#333', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h}>{h}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                    <select value={item.campo} onChange={e => setMapeo(m => ({ ...m, [h]: { ...item, campo: e.target.value } }))}
                      style={{ ...INP, padding: '6px 10px' }}>
                      {CAMPOS_DESTINO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('archivo')} style={{ background: '#F0EEE8', color: '#14110C', border: 'none', borderRadius: 10, padding: '11px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>← Atrás</button>
              <button onClick={confirmarImport} disabled={importando}
                style={{ flex: 1, background: '#14110C', color: '#F8F3E9', border: 'none', borderRadius: 10, padding: '12px 24px', fontWeight: 700, fontSize: 14, cursor: importando ? 'not-allowed' : 'pointer', opacity: importando ? 0.6 : 1 }}>
                {importando ? 'Importando…' : `Importar ${rows.length} REOs →`}
              </button>
            </div>
          </div>
        )}

        {/* Paso 3 — Resultado */}
        {step === 'resultado' && resultado && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: 'Marcellus, Georgia, serif', fontSize: 22, color: '#14110C', marginBottom: 20 }}>
              {resultado.n_insertados} REOs importados
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 28 }}>
              {resultado.n_sin_precio > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#92400E' }}>
                  ⚠️ {resultado.n_sin_precio} sin precio orientativo
                </div>
              )}
              {resultado.n_con_alertas > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#991B1B' }}>
                  🔴 {resultado.n_con_alertas} con alertas de ocupación
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
              Aparecen en la pestaña <strong>Radar</strong> con origen <strong>REO</strong>.
            </div>
            <button onClick={onClose}
              style={{ background: '#14110C', color: '#F8F3E9', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Ir a Mercado
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
