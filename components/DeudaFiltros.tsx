'use client'
import { useState } from 'react'
import { ESTADOS_JUDICIALES_NORMALIZADOS, ESTADO_JUDICIAL_LABEL, EstadoJudicialNormalizado } from '@/lib/deuda-schema'

export type DeudaFiltrosState = {
  buscar: string
  provincia: string
  ciudad: string
  broker: string
  tipoColateral: string
  subtipoColateral: string
  precioMin: string
  precioMax: string
  obMin: string
  obMax: string
  estadosJudiciales: EstadoJudicialNormalizado[]
  ocultarRiesgoCargas: boolean
}

export const FILTROS_INICIALES: DeudaFiltrosState = {
  buscar: '', provincia: 'todos', ciudad: 'todos', broker: 'todos',
  tipoColateral: 'todos', subtipoColateral: 'todos',
  precioMin: '', precioMax: '', obMin: '', obMax: '',
  estadosJudiciales: [], ocultarRiesgoCargas: true,
}

const SEL = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }
const INP = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333' }

export default function DeudaFiltros({
  filtros, setFiltros, provincias, ciudades, brokers, tiposColateral, subtiposColateral,
}: {
  filtros: DeudaFiltrosState
  setFiltros: React.Dispatch<React.SetStateAction<DeudaFiltrosState>>
  provincias: string[]
  ciudades: string[]
  brokers: string[]
  tiposColateral: string[]
  subtiposColateral: string[]
}) {
  const [masFiltrosOpen, setMasFiltrosOpen] = useState(false)

  const set = <K extends keyof DeudaFiltrosState>(k: K, v: DeudaFiltrosState[K]) => setFiltros(f => ({ ...f, [k]: v }))

  const toggleEstadoJudicial = (e: EstadoJudicialNormalizado) => {
    setFiltros(f => ({
      ...f,
      estadosJudiciales: f.estadosJudiciales.includes(e) ? f.estadosJudiciales.filter(x => x !== e) : [...f.estadosJudiciales, e],
    }))
  }

  const masFiltrosActivos = filtros.broker !== 'todos' || filtros.tipoColateral !== 'todos' || filtros.subtipoColateral !== 'todos'
    || filtros.obMin || filtros.obMax || filtros.estadosJudiciales.length > 0 || !filtros.ocultarRiesgoCargas

  return (
    <div className="mb-4">
      {/* Nivel 1 — filtros de uso frecuente, siempre visibles */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="relative flex-1 min-w-[200px]">
          <input type="text" value={filtros.buscar} onChange={e => set('buscar', e.target.value)}
            placeholder="Buscar por contrato, dirección, titular..."
            className="w-full rounded-xl pl-3 pr-3 py-2.5 text-sm outline-none font-medium" style={INP} />
        </div>
        <select value={filtros.provincia} onChange={e => set('provincia', e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm font-bold outline-none" style={SEL}>
          <option value="todos">Provincia: todas</option>
          {provincias.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtros.ciudad} onChange={e => set('ciudad', e.target.value)}
          className="rounded-xl px-3 py-2.5 text-sm font-bold outline-none" style={SEL}>
          <option value="todos">Ciudad: todas</option>
          {ciudades.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" value={filtros.precioMin} onChange={e => set('precioMin', e.target.value)}
          placeholder="Precio min €" className="w-[120px] rounded-xl px-3 py-2.5 text-sm outline-none font-medium font-mono" style={INP} />
        <input type="number" value={filtros.precioMax} onChange={e => set('precioMax', e.target.value)}
          placeholder="Precio max €" className="w-[120px] rounded-xl px-3 py-2.5 text-sm outline-none font-medium font-mono" style={INP} />
        <button onClick={() => setMasFiltrosOpen(o => !o)}
          className="rounded-xl px-3 py-2.5 text-sm font-black flex items-center gap-1.5"
          style={{ background: masFiltrosActivos ? 'rgba(166,133,90,0.1)' : '#F5F4F0', color: masFiltrosActivos ? '#A6855A' : '#666', border: masFiltrosActivos ? '1.5px solid rgba(166,133,90,0.3)' : '1.5px solid #ECEAE4' }}>
          Más filtros {masFiltrosActivos ? '●' : ''} {masFiltrosOpen ? '▲' : '▼'}
        </button>
      </div>

      {/* Nivel 2 — panel expandible */}
      {masFiltrosOpen && (
        <div className="rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" style={{ background: '#F9F8F5', border: '1px solid #ECEAE4' }}>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Broker de origen</label>
            <select value={filtros.broker} onChange={e => set('broker', e.target.value)} className="w-full rounded-xl px-3 py-2 text-xs font-bold outline-none" style={SEL}>
              <option value="todos">Todos</option>
              {brokers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Tipo de colateral</label>
            <select value={filtros.tipoColateral} onChange={e => set('tipoColateral', e.target.value)} className="w-full rounded-xl px-3 py-2 text-xs font-bold outline-none" style={SEL}>
              <option value="todos">Todos</option>
              {tiposColateral.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Subtipo de colateral</label>
            <select value={filtros.subtipoColateral} onChange={e => set('subtipoColateral', e.target.value)} className="w-full rounded-xl px-3 py-2 text-xs font-bold outline-none" style={SEL}>
              <option value="todos">Todos</option>
              {subtiposColateral.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Deuda OB (€)</label>
            <div className="flex gap-1.5">
              <input type="number" value={filtros.obMin} onChange={e => set('obMin', e.target.value)} placeholder="Min" className="w-1/2 rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none" style={INP} />
              <input type="number" value={filtros.obMax} onChange={e => set('obMax', e.target.value)} placeholder="Max" className="w-1/2 rounded-xl px-2.5 py-2 text-xs font-mono font-bold outline-none" style={INP} />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Estado judicial</label>
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS_JUDICIALES_NORMALIZADOS.map(e => (
                <button key={e} onClick={() => toggleEstadoJudicial(e)}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-black"
                  style={{
                    background: filtros.estadosJudiciales.includes(e) ? '#A6855A' : '#fff',
                    color: filtros.estadosJudiciales.includes(e) ? '#14110C' : '#666',
                    border: filtros.estadosJudiciales.includes(e) ? '1.5px solid #A6855A' : '1.5px solid #ECEAE4',
                  }}>
                  {ESTADO_JUDICIAL_LABEL[e]}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-2 flex items-center">
            <button onClick={() => set('ocultarRiesgoCargas', !filtros.ocultarRiesgoCargas)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black w-full"
              style={{ background: filtros.ocultarRiesgoCargas ? 'rgba(239,68,68,0.08)' : '#fff', color: filtros.ocultarRiesgoCargas ? '#EF4444' : '#666', border: '1.5px solid #ECEAE4' }}>
              <span>{filtros.ocultarRiesgoCargas ? '🔴' : '⚪'}</span>
              {filtros.ocultarRiesgoCargas ? 'Ocultando posiciones con cargas previas > precio' : 'Mostrando todas (incluye riesgo de cargas)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
