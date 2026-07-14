'use client'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { GrupoDeuda } from '@/lib/deuda-schema'

// Fix del ícono default de Leaflet — los paths que trae el paquete se rompen con bundlers
// tipo webpack/Next (referencian rutas relativas que no resuelven). Se apunta directo al CDN.
const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

const iconAlerta = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'deuda-marker-alerta',
})

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}

// Centro por defecto: España peninsular (Madrid aprox), para cuando aún no hay pines geocodificados
const CENTRO_ESPANA: [number, number] = [40.2, -3.7]

export default function DeudaMapa({
  grupos, onAbrir,
}: {
  grupos: GrupoDeuda[]
  onAbrir: (contractId: string) => void
}) {
  const conCoords = grupos.filter(g => g.items.some(i => i.lat != null && i.lng != null))

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #ECEAE4', height: 560 }}>
      <style>{`.deuda-marker-alerta { filter: hue-rotate(150deg) saturate(4); }`}</style>
      <MapContainer center={CENTRO_ESPANA} zoom={conCoords.length ? 6 : 5} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {conCoords.map(g => {
          const item = g.items.find(i => i.lat != null && i.lng != null)!
          return (
            <Marker key={g.contractId} position={[item.lat!, item.lng!]} icon={g.tieneAlerta ? iconAlerta : icon}>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>{g.ciudad || 'Sin ciudad'}{g.provincia ? `, ${g.provincia}` : ''}</div>
                  <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', margin: '2px 0 6px' }}>{g.contractId}</div>
                  <div style={{ fontSize: 12 }}>Asking price: <b>{fmt(g.askingTotal)}</b></div>
                  <div style={{ fontSize: 12, color: '#888' }}>Deuda OB: {fmt(g.obTotal)}</div>
                  {g.tieneAlerta && <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 900, marginTop: 4 }}>🔴 Cargas &gt; precio</div>}
                  <button onClick={() => onAbrir(g.contractId)}
                    style={{ marginTop: 8, width: '100%', background: '#14110C', color: '#F8F3E9', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                    Ver ficha completa
                  </button>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
