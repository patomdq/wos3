'use client'
import { useState } from 'react'
import { generateDossierPDF, DossierInmueble } from '@/lib/generateDossierPDF'

const ORANGE = '#F26E1F'
const DARK   = '#1A1A1A'
const GRAY   = '#666666'
const BORDER = '#ECEAE4'

// ── Datos de prueba: la cartera que Pato quiere presentar ──────────────────
const CARTERA_PRUEBA: DossierInmueble[] = [
  {
    nombre: 'Piso Bajo · Edificio Huércal-Overa',
    ubicacion: 'Huércal-Overa, Almería',
    descripcion: '2 habitaciones, salón comedor, cocina, lavadero y baño. Planta baja en edificio de 2 propiedades. Sin gastos de comunidad.',
    precio: 100_000,
    alquiler: 600,
    hab: 2,
    banos: 1,
    tipologia: 'Piso',
    notas: 'Planta baja · Sin comunidad',
  },
  {
    nombre: 'Dúplex 1ª Planta · Edificio Huércal-Overa',
    ubicacion: 'Huércal-Overa, Almería',
    descripcion: '4 habitaciones, 2 baños, cocina, lavadero, salón comedor, 2 terrazas y 2 trasteros (interior y exterior). Sin gastos de comunidad.',
    precio: 140_000,
    alquiler: 750,
    hab: 4,
    banos: 2,
    tipologia: 'Dúplex',
    notas: 'Primera planta · 2 terrazas · 2 trasteros · Sin comunidad',
  },
  {
    nombre: 'Piso · Garrucha',
    ubicacion: 'Garrucha, Almería',
    descripcion: '3 habitaciones, 2 baños, salón, cocina y comedor. Ubicación en Garrucha.',
    precio: 89_000,
    alquiler: 600,
    hab: 3,
    banos: 2,
    tipologia: 'Piso',
    comunidad: 30,
    ibi: 150,
    notas: 'Comunidad 30€/mes · IBI 150€/año',
  },
  {
    nombre: 'Piso 3º · Olula del Río (A)',
    ubicacion: 'Olula del Río, Almería',
    descripcion: '3 habitaciones, 1 baño, lavadero, salón comedor, cocina. Tercero por escalera.',
    precio: 65_000,
    alquiler: 475,
    hab: 3,
    banos: 1,
    tipologia: 'Piso',
    comunidad: 10,
    ibi: 140,
    notas: 'Tercero por escalera · Comunidad 120€/año · IBI 140€',
  },
  {
    nombre: 'Piso 4º · Olula del Río (B)',
    ubicacion: 'Olula del Río, Almería',
    descripcion: '3 habitaciones, 1 baño, lavadero, salón comedor, cocina. Cuarto por escalera.',
    precio: 65_000,
    alquiler: 475,
    hab: 3,
    banos: 1,
    tipologia: 'Piso',
    comunidad: 10,
    ibi: 140,
    notas: 'Cuarto por escalera · Comunidad 120€/año · IBI 140€',
  },
]

export default function DossierPage() {
  const [loading, setLoading] = useState(false)
  const [titulo, setTitulo] = useState('Cartera de Oportunidades · Junio 2026')
  const [inversora, setInversora] = useState('')

  async function handleGenerar() {
    setLoading(true)
    try {
      const { jsPDF } = await import('jspdf')
      generateDossierPDF(
        { titulo, inversora: inversora || undefined, inmuebles: CARTERA_PRUEBA },
        jsPDF
      )
    } catch(e) {
      console.error('Error generando PDF:', e)
      alert('Error: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  const totalInversion = CARTERA_PRUEBA.reduce((s,p)=>s+p.precio, 0)
  const totalAlquiler  = CARTERA_PRUEBA.reduce((s,p)=>s+p.alquiler, 0)
  const rentBruta = (totalAlquiler * 12 / totalInversion * 100).toFixed(1)

  return (
    <main style={{ background: '#F2F1ED', minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE, letterSpacing: 1.5 }}>
            HASU · DOSSIER
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: DARK, margin: '4px 0 6px' }}>
            Generador de Dossier
          </h1>
          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>
            Presentación multi-inmueble para inversores
          </p>
        </div>

        {/* Resumen cartera */}
        <div style={{
          background: DARK, borderRadius: 16, padding: '24px 28px',
          marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20
        }}>
          {[
            { label: 'Inmuebles', value: String(CARTERA_PRUEBA.length) },
            { label: 'Inversión total', value: `${(totalInversion/1000).toFixed(0)}k€` },
            { label: 'Alquiler mensual', value: `${totalAlquiler}€` },
            { label: 'Rent. bruta media', value: `${rentBruta}%` },
          ].map(k => (
            <div key={k.label}>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
                {k.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: ORANGE }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Formulario */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '24px 28px',
          border: `1px solid ${BORDER}`, marginBottom: 24
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: GRAY, letterSpacing: 1, display: 'block', marginBottom: 6 }}>
              TÍTULO DEL DOSSIER
            </label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14, color: DARK,
                border: `1.5px solid ${BORDER}`, borderRadius: 8, background: '#F8F7F4',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: GRAY, letterSpacing: 1, display: 'block', marginBottom: 6 }}>
              NOMBRE DEL INVERSOR <span style={{ color: '#bbb', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input
              value={inversora}
              onChange={e => setInversora(e.target.value)}
              placeholder="Ej: Juan López"
              style={{
                width: '100%', padding: '10px 14px', fontSize: 14, color: DARK,
                border: `1.5px solid ${BORDER}`, borderRadius: 8, background: '#F8F7F4',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Lista de inmuebles */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GRAY, letterSpacing: 1, marginBottom: 12 }}>
            INMUEBLES INCLUIDOS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CARTERA_PRUEBA.map((p, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 12, padding: '14px 18px',
                border: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>{p.ubicacion}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ORANGE }}>
                    {(p.precio/1000).toFixed(0)}k€
                  </div>
                  <div style={{ fontSize: 11, color: GRAY }}>{p.alquiler}€/mes</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Botón generar */}
        <button
          onClick={handleGenerar}
          disabled={loading}
          style={{
            width: '100%', padding: '16px', borderRadius: 12, border: 'none',
            background: loading ? '#ccc' : ORANGE, color: '#fff',
            fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
            letterSpacing: 0.5
          }}
        >
          {loading ? 'Generando PDF...' : '↓ Descargar Dossier PDF'}
        </button>

      </div>
    </main>
  )
}
