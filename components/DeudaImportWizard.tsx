'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { authFetch } from '@/lib/auth-fetch'
import { useUser } from '@/lib/user-context'
import { CAMPOS_CANONICOS, CAMPOS_OBLIGATORIOS, CampoCanonico, Mapeo } from '@/lib/deuda-schema'

const INP = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333' } as const

type MapeoPropuesto = Record<string, { campo: CampoCanonico; confianza: 'alta' | 'media' | 'baja' }>

const CONFIANZA_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alta:  { label: 'Alta confianza',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  media: { label: 'Media confianza', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  baja:  { label: 'Baja confianza',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
}

export default function DeudaImportWizard({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const user = useUser()
  const [step, setStep] = useState<'archivo' | 'mapeo' | 'resultado'>('archivo')
  const [brokerOrigen, setBrokerOrigen] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [mapeo, setMapeo] = useState<MapeoPropuesto>({})
  const [mapeoOrigen, setMapeoOrigen] = useState<'guardado' | 'claude' | null>(null)
  const [cargando, setCargando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<{ n_filas_insertadas: number; n_filas_omitidas: number } | null>(null)

  const parsearYProponerMapeo = async () => {
    if (!brokerOrigen.trim() || !archivo) { setError('Completá el nombre del broker y elegí un archivo'); return }
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

      const res = await authFetch('/api/deuda/mapeo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker_origen: brokerOrigen.trim(), headers: hs, sampleRows: rs.slice(0, 5) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al proponer el mapeo')
      setMapeo(json.mapeo)
      setMapeoOrigen(json.origen)
      setStep('mapeo')
    } catch (err: any) {
      setError(err.message || 'Error al leer el archivo')
    } finally {
      setCargando(false)
    }
  }

  const setCampoDeColumna = (header: string, campo: CampoCanonico) => {
    setMapeo(m => ({ ...m, [header]: { campo, confianza: m[header]?.confianza || 'baja' } }))
  }

  const confirmarImport = async () => {
    const mapeoFinal: Mapeo = {}
    headers.forEach(h => { mapeoFinal[h] = mapeo[h]?.campo || 'ignorar' })
    const faltantes = CAMPOS_OBLIGATORIOS.filter(c => !Object.values(mapeoFinal).includes(c))
    if (faltantes.length > 0) {
      setError(`Faltan mapear campos obligatorios: ${faltantes.join(', ')}`)
      return
    }
    setError(''); setImportando(true)
    try {
      const res = await authFetch('/api/deuda/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_origen: brokerOrigen.trim(),
          archivo_nombre: archivo?.name,
          headers, rows, mapeo: mapeoFinal,
          confirmado_por: user?.email || user?.nombre || 'WOS3',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al importar')
      setResultado({ n_filas_insertadas: json.n_filas_insertadas, n_filas_omitidas: json.n_filas_omitidas })
      setStep('resultado')
      onImported()
    } catch (err: any) {
      setError(err.message || 'Error al importar')
    } finally {
      setImportando(false)
    }
  }

  const muestraPreview = rows.slice(0, 3).map(row => {
    const obj: Record<string, any> = {}
    headers.forEach((h, i) => {
      const campo = mapeo[h]?.campo
      if (campo && campo !== 'ignorar') obj[campo] = row[i]
    })
    return obj
  })

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 70, background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ bottom: 70 }}>
        <div className="w-full rounded-t-[20px] sm:rounded-2xl flex flex-col pointer-events-auto"
          style={{ background: '#ffffff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100% - 8px)', maxWidth: 900 }}>

          <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #F0EEE8' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#DCDAD4' }} />
            <div className="flex items-center justify-between">
              <div className="font-black text-[17px]" style={{ color: '#111' }}>Importar planilla de deuda</div>
              <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1px solid #ECEAE4' }}>✕</button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {['archivo', 'mapeo', 'resultado'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: step === s ? '#F26E1F' : '#F0EEE8', color: step === s ? '#fff' : '#999' }}>{i + 1}</div>
                  {i < 2 && <div className="w-6 h-[2px]" style={{ background: '#F0EEE8' }} />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error && (
              <div className="mb-3 rounded-xl p-3 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            {step === 'archivo' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Broker / fondo / servicer de origen *</label>
                  <input type="text" value={brokerOrigen} onChange={e => setBrokerOrigen(e.target.value)}
                    placeholder="Ej: FENCIA, colaborador Almería..."
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP} />
                  <div className="text-[11px] mt-1" style={{ color: '#999' }}>Si ya importaste de este broker antes, se reusa el mapeo guardado automáticamente.</div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Archivo Excel/CSV *</label>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setArchivo(e.target.files?.[0] || null)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP} />
                </div>
              </div>
            )}

            {step === 'mapeo' && (
              <div>
                <div className="mb-3 rounded-xl p-3 text-xs font-bold flex items-center gap-2"
                  style={{ background: mapeoOrigen === 'guardado' ? 'rgba(34,197,94,0.1)' : 'rgba(96,165,250,0.1)', color: mapeoOrigen === 'guardado' ? '#22C55E' : '#60A5FA' }}>
                  {mapeoOrigen === 'guardado'
                    ? '✓ Se reusó el mapeo ya confirmado para este broker — revisá y confirmá.'
                    : '🤖 Mapeo propuesto por Claude — revisá cada columna antes de confirmar, sobre todo las de baja confianza.'}
                </div>

                <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #ECEAE4' }}>
                  <div className="grid grid-cols-[1fr_1fr_140px_110px] px-3 py-2 text-[10px] font-black uppercase tracking-wide" style={{ background: '#F9F8F5', color: '#888' }}>
                    <div>Columna del Excel</div>
                    <div>Muestra</div>
                    <div>Campo canónico</div>
                    <div>Confianza</div>
                  </div>
                  {headers.map(h => {
                    const idx = headers.indexOf(h)
                    const muestra = rows[0]?.[idx] ?? ''
                    const actual = mapeo[h]?.campo || 'ignorar'
                    const confianza = mapeo[h]?.confianza || 'baja'
                    const cfg = CONFIANZA_CFG[confianza]
                    return (
                      <div key={h} className="grid grid-cols-[1fr_1fr_140px_110px] px-3 py-2 items-center text-xs" style={{ borderTop: '1px solid #F0EEE8' }}>
                        <div className="font-bold truncate" style={{ color: '#333' }} title={h}>{h}</div>
                        <div className="truncate" style={{ color: '#888' }} title={String(muestra)}>{String(muestra)}</div>
                        <select value={actual} onChange={e => setCampoDeColumna(h, e.target.value as CampoCanonico)}
                          className="rounded-lg px-2 py-1.5 text-[11px] font-bold outline-none" style={{ ...INP, appearance: 'none' as const }}>
                          {CAMPOS_CANONICOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <span className="px-2 py-1 rounded-lg text-[10px] font-black text-center" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                      </div>
                    )
                  })}
                </div>

                {muestraPreview.length > 0 && (
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Preview con el mapeo actual</div>
                    <div className="rounded-xl p-3 text-[11px] space-y-2" style={{ background: '#F9F8F5', border: '1px solid #ECEAE4' }}>
                      {muestraPreview.map((r, i) => (
                        <div key={i} style={{ color: '#666' }}>
                          <span className="font-black" style={{ color: '#333' }}>{r.contract_id || '(sin contract_id)'}</span>
                          {r.direccion ? ` · ${r.direccion}` : ''}{r.ciudad ? `, ${r.ciudad}` : ''}
                          {r.asking_price !== undefined ? ` · asking ${r.asking_price}` : ''}
                          {r.deuda_ob !== undefined ? ` · OB ${r.deuda_ob}` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'resultado' && resultado && (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">✅</div>
                <div className="font-black text-base mb-1" style={{ color: '#111' }}>Importación completa</div>
                <div className="text-sm" style={{ color: '#666' }}>
                  {resultado.n_filas_insertadas} posiciones insertadas
                  {resultado.n_filas_omitidas > 0 ? ` · ${resultado.n_filas_omitidas} filas omitidas (sin Contract ID)` : ''}
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 px-5 py-3 flex gap-2" style={{ borderTop: '1px solid #F0EEE8' }}>
            {step === 'archivo' && (
              <button onClick={parsearYProponerMapeo} disabled={cargando}
                className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-50" style={{ background: '#F26E1F' }}>
                {cargando ? 'Analizando columnas...' : 'Continuar'}
              </button>
            )}
            {step === 'mapeo' && (
              <>
                <button onClick={() => setStep('archivo')} className="py-3 px-5 rounded-xl text-sm font-black" style={{ background: '#F5F4F0', color: '#666' }}>Atrás</button>
                <button onClick={confirmarImport} disabled={importando}
                  className="flex-1 py-3 rounded-xl text-sm font-black text-white disabled:opacity-50" style={{ background: '#F26E1F' }}>
                  {importando ? 'Importando...' : 'Confirmar e importar'}
                </button>
              </>
            )}
            {step === 'resultado' && (
              <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-black text-white" style={{ background: '#F26E1F' }}>Cerrar</button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
