'use client'
import { useEffect } from 'react'

// ── Datos de la cartera ────────────────────────────────────────────────────
const TITULO = 'Cartera de Oportunidades · Junio 2026'

const INMUEBLES = [
  {
    num: '01',
    nombre: 'Piso Bajo',
    edificio: 'Edificio Huércal-Overa',
    ubicacion: 'Huércal-Overa, Almería',
    tipologia: 'Piso · Planta Baja',
    descripcion: '2 habitaciones, salón comedor, cocina, lavadero y baño. Sin gastos de comunidad.',
    precio: 100_000,
    alquiler: 600,
    comunidad: 0,
    ibi: 0,
    hab: 2,
    banos: 1,
    extras: ['Sin comunidad', 'Planta baja'],
  },
  {
    num: '02',
    nombre: 'Dúplex 1ª Planta',
    edificio: 'Edificio Huércal-Overa',
    ubicacion: 'Huércal-Overa, Almería',
    tipologia: 'Dúplex · Primera Planta',
    descripcion: '4 habitaciones, 2 baños, cocina, lavadero, salón comedor, 2 terrazas y 2 trasteros (interior y exterior). Sin gastos de comunidad.',
    precio: 140_000,
    alquiler: 750,
    comunidad: 0,
    ibi: 0,
    hab: 4,
    banos: 2,
    extras: ['Sin comunidad', '2 terrazas', '2 trasteros'],
  },
  {
    num: '03',
    nombre: 'Piso',
    edificio: 'Garrucha',
    ubicacion: 'Garrucha, Almería',
    tipologia: 'Piso',
    descripcion: '3 habitaciones, 2 baños, salón, cocina y comedor.',
    precio: 89_000,
    alquiler: 600,
    comunidad: 30,
    ibi: 150,
    hab: 3,
    banos: 2,
    extras: ['Comunidad 30€/mes', 'IBI 150€/año'],
  },
  {
    num: '04',
    nombre: 'Piso 3ª Planta (A)',
    edificio: 'Olula del Río',
    ubicacion: 'Olula del Río, Almería',
    tipologia: 'Piso · Tercero por escalera',
    descripcion: '3 habitaciones, 1 baño, lavadero, salón comedor y cocina. Tercero por escalera.',
    precio: 65_000,
    alquiler: 475,
    comunidad: 10,
    ibi: 140,
    hab: 3,
    banos: 1,
    extras: ['Comunidad 120€/año', 'IBI 140€/año'],
  },
  {
    num: '05',
    nombre: 'Piso 4ª Planta (B)',
    edificio: 'Olula del Río',
    ubicacion: 'Olula del Río, Almería',
    tipologia: 'Piso · Cuarto por escalera',
    descripcion: '3 habitaciones, 1 baño, lavadero, salón comedor y cocina. Cuarto por escalera.',
    precio: 65_000,
    alquiler: 475,
    comunidad: 10,
    ibi: 140,
    hab: 3,
    banos: 1,
    extras: ['Comunidad 120€/año', 'IBI 140€/año'],
  },
]

function fmtEur(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}k€`
  return `${n}€`
}

function rentBruta(precio: number, alquiler: number): string {
  return ((alquiler * 12 / precio) * 100).toFixed(1) + '%'
}

function rentNeta(precio: number, alquiler: number, comunidad: number, ibi: number): string {
  const gastosAn = comunidad * 12 + ibi
  return (((alquiler * 12 - gastosAn) / precio) * 100).toFixed(1) + '%'
}

const totalPrecio   = INMUEBLES.reduce((s, p) => s + p.precio, 0)
const totalAlquiler = INMUEBLES.reduce((s, p) => s + p.alquiler, 0)
const rentBrutaTotal = ((totalAlquiler * 12 / totalPrecio) * 100).toFixed(1)

export default function DossierPrintPage() {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('print=1')) {
      setTimeout(() => window.print(), 600)
    }
  }, [])

  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #E8E6E0; }

        @page { size: A4 landscape; margin: 0; }

        .slide {
          width: 297mm;
          height: 210mm;
          position: relative;
          overflow: hidden;
          break-after: page;
          page-break-after: always;
        }

        /* ─── PORTADA ─── */
        .portada { display: flex; }
        .portada-left {
          width: 58%;
          background: #111111;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 14mm 16mm;
        }
        .portada-right {
          width: 42%;
          background: #F2F1ED;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 14mm 16mm;
          border-left: 5px solid #F26E1F;
        }
        .logo { font-size: 10pt; font-weight: 800; color: #F26E1F; letter-spacing: 2px; }
        .logo-sub { font-size: 7pt; color: #666; margin-top: 3px; letter-spacing: 1px; }
        .portada-title { font-size: 26pt; font-weight: 800; color: #fff; line-height: 1.15; margin-top: 8mm; }
        .portada-sub { font-size: 11pt; color: #C9A96E; margin-top: 4mm; }
        .portada-kpis { display: flex; flex-direction: column; gap: 6mm; }
        .portada-kpi-label { font-size: 6.5pt; font-weight: 700; color: #888; letter-spacing: 1.2px; text-transform: uppercase; }
        .portada-kpi-value { font-size: 18pt; font-weight: 800; color: #F26E1F; margin-top: 1mm; }
        .portada-kpi-divider { height: 1px; background: #333; margin-top: 5mm; }
        .portada-fecha { font-size: 8pt; color: #888; }
        .portada-right-kpis { display: flex; flex-direction: column; gap: 5mm; }
        .portada-right-kpi-label { font-size: 6.5pt; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .portada-right-kpi-value { font-size: 14pt; font-weight: 800; color: #111; margin-top: 1mm; }
        .portada-right-kpi-divider { height: 1px; background: #ECEAE4; margin-top: 4mm; }
        .confidencial { font-size: 6pt; color: #aaa; text-align: center; }

        /* ─── SLIDE INMUEBLE ─── */
        .inmueble-slide { display: flex; }
        .inmueble-left {
          width: 38%;
          background: #111111;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 10mm 12mm;
          position: relative;
        }
        .inmueble-left-stripe {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 5mm;
          background: #F26E1F;
        }
        .inmueble-num {
          font-size: 52pt;
          font-weight: 900;
          color: #F26E1F;
          line-height: 1;
          opacity: 0.9;
        }
        .inmueble-num-total { font-size: 11pt; color: #C9A96E; margin-left: 1mm; }
        .inmueble-precio-label { font-size: 6.5pt; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-top: 6mm; }
        .inmueble-precio { font-size: 20pt; font-weight: 800; color: #fff; margin-top: 1.5mm; }

        .inmueble-right {
          width: 62%;
          background: #fff;
          display: flex;
          flex-direction: column;
          padding: 10mm 14mm 8mm;
        }
        .inmueble-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid #ECEAE4;
          padding-bottom: 4mm;
          margin-bottom: 5mm;
        }
        .inmueble-logo { font-size: 7.5pt; font-weight: 800; color: #F26E1F; letter-spacing: 1.5px; }
        .inmueble-logo-sep { color: #C9A96E; margin: 0 3px; }
        .inmueble-logo-sub { font-size: 6.5pt; color: #999; }
        .inmueble-ubicacion-badge {
          font-size: 6.5pt;
          background: #FEF3EC;
          color: #F26E1F;
          padding: 2px 7px;
          border-radius: 20px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .inmueble-nombre { font-size: 18pt; font-weight: 800; color: #111; line-height: 1.15; }
        .inmueble-edificio { font-size: 9.5pt; color: #F26E1F; font-weight: 600; margin-top: 1mm; }
        .inmueble-tipo { font-size: 7.5pt; color: #888; margin-top: 1.5mm; }
        .inmueble-divider { height: 2px; width: 25mm; background: #F26E1F; margin: 4mm 0; }
        .inmueble-descripcion { font-size: 8.5pt; color: #444; line-height: 1.55; flex: 1; }

        .inmueble-tags { display: flex; gap: 3mm; flex-wrap: wrap; margin-top: 3mm; }
        .tag {
          font-size: 7pt;
          font-weight: 600;
          color: #555;
          background: #F5F4F0;
          border: 1px solid #ECEAE4;
          padding: 2px 7px;
          border-radius: 4px;
        }

        .kpi-section {
          margin-top: auto;
          background: #F8F7F3;
          border: 1px solid #ECEAE4;
          border-radius: 8px;
          padding: 5mm 6mm 4mm;
        }
        .kpi-section-label {
          font-size: 6pt;
          font-weight: 800;
          color: #999;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          margin-bottom: 3.5mm;
        }
        .kpi-row { display: flex; gap: 3mm; }
        .kpi-box {
          flex: 1;
          background: #fff;
          border: 1px solid #ECEAE4;
          border-radius: 5px;
          padding: 3mm 4mm;
        }
        .kpi-box.highlight {
          background: #F26E1F;
          border-color: #F26E1F;
        }
        .kpi-label { font-size: 5.5pt; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.8px; }
        .kpi-box.highlight .kpi-label { color: rgba(255,255,255,0.75); }
        .kpi-value { font-size: 13pt; font-weight: 800; color: #111; margin-top: 1.5mm; }
        .kpi-box.highlight .kpi-value { color: #fff; }
        .kpi-value.green { color: #16A34A; }

        .slide-footer {
          position: absolute;
          bottom: 4mm;
          right: 8mm;
          font-size: 6pt;
          color: #bbb;
        }

        /* ─── CIERRE ─── */
        .cierre {
          background: #111;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
        }
        .cierre-stripe {
          position: absolute;
          left: 0; right: 0;
          height: 6mm;
          background: #F26E1F;
        }
        .cierre-stripe.top { top: 30%; }
        .cierre-stripe.bottom { bottom: 30%; }
        .cierre-gracias { font-size: 44pt; font-weight: 900; color: #fff; margin-bottom: 6mm; }
        .cierre-sub { font-size: 9.5pt; color: #C9A96E; margin-bottom: 12mm; max-width: 120mm; }
        .cierre-empresa { font-size: 10pt; font-weight: 700; color: #fff; }
        .cierre-email { font-size: 9pt; color: #F26E1F; margin-top: 2mm; }
        .cierre-web { font-size: 8pt; color: #666; margin-top: 1.5mm; }
        .cierre-footer { position: absolute; bottom: 5mm; font-size: 6pt; color: #444; }

        @media screen {
          .slide { margin: 10mm auto; border-radius: 4px; box-shadow: 0 4px 30px rgba(0,0,0,0.18); }
          .controls {
            position: fixed; top: 20px; right: 20px;
            display: flex; gap: 8px; z-index: 100;
          }
          .btn {
            padding: 10px 20px; border-radius: 10px; font-size: 13px;
            font-weight: 700; cursor: pointer; border: none;
          }
          .btn-primary { background: #F26E1F; color: #fff; }
          .btn-secondary { background: #fff; color: #111; border: 1px solid #ECEAE4; }
        }
        @media print {
          .controls { display: none; }
          body { background: transparent; }
        }
      `}</style>

      {/* Botones de control (solo en pantalla) */}
      <div className="controls">
        <button className="btn btn-secondary" onClick={() => window.history.back()}>← Volver</button>
        <button className="btn btn-primary" onClick={() => window.print()}>↓ Guardar PDF</button>
      </div>

      {/* ── PORTADA ─────────────────────────────────────────────────────────── */}
      <div className="slide portada">
        <div className="portada-left">
          <div>
            <div className="logo">WALLEST</div>
            <div className="logo-sub">HASU ACTIVOS INMOBILIARIOS SL</div>
          </div>
          <div>
            <div className="portada-title">{TITULO}</div>
            <div className="portada-sub">Activos seleccionados en Almería</div>
          </div>
          <div className="portada-kpis">
            <div>
              <div className="portada-kpi-label">Inmuebles en cartera</div>
              <div className="portada-kpi-value">{INMUEBLES.length}</div>
              <div className="portada-kpi-divider" />
            </div>
            <div>
              <div className="portada-kpi-label">Inversión total estimada</div>
              <div className="portada-kpi-value">{fmtEur(totalPrecio)}</div>
              <div className="portada-kpi-divider" />
            </div>
            <div>
              <div className="portada-kpi-label">Ingresos mensuales estimados</div>
              <div className="portada-kpi-value">{fmtEur(totalAlquiler)}/mes</div>
            </div>
          </div>
        </div>

        <div className="portada-right">
          <div>
            <div className="portada-fecha">{fecha}</div>
          </div>
          <div className="portada-right-kpis">
            <div>
              <div className="portada-right-kpi-label">Rentabilidad bruta media</div>
              <div className="portada-right-kpi-value" style={{ color: '#F26E1F' }}>{rentBrutaTotal}%</div>
              <div className="portada-right-kpi-divider" />
            </div>
            {[
              { label: 'Huércal-Overa', ops: '2 inmuebles · 240k€' },
              { label: 'Garrucha', ops: '1 inmueble · 89k€' },
              { label: 'Olula del Río', ops: '2 inmuebles · 130k€' },
            ].map(z => (
              <div key={z.label}>
                <div className="portada-right-kpi-label">{z.label}</div>
                <div style={{ fontSize: '9pt', fontWeight: 600, color: '#111', marginTop: '1mm' }}>{z.ops}</div>
                <div className="portada-right-kpi-divider" />
              </div>
            ))}
          </div>
          <div className="confidencial">Documento confidencial · Uso exclusivo del destinatario</div>
        </div>
      </div>

      {/* ── SLIDES INMUEBLES ────────────────────────────────────────────────── */}
      {INMUEBLES.map((p, idx) => {
        const rb = rentBruta(p.precio, p.alquiler)
        const rn = rentNeta(p.precio, p.alquiler, p.comunidad, p.ibi)
        const rnNum = parseFloat(rn)

        return (
          <div key={idx} className="slide inmueble-slide">
            <div className="inmueble-left">
              <div className="inmueble-left-stripe" />
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2mm' }}>
                  <span className="inmueble-num">{p.num}</span>
                  <span className="inmueble-num-total">/ {String(INMUEBLES.length).padStart(2,'0')}</span>
                </div>
                <div className="inmueble-precio-label">Precio de adquisición</div>
                <div className="inmueble-precio">{fmtEur(p.precio)}</div>
              </div>
            </div>

            <div className="inmueble-right">
              <div className="inmueble-header">
                <div>
                  <span className="inmueble-logo">WALLEST</span>
                  <span className="inmueble-logo-sep">·</span>
                  <span className="inmueble-logo-sub">HASU ACTIVOS INMOBILIARIOS SL</span>
                </div>
                <span className="inmueble-ubicacion-badge">{p.ubicacion}</span>
              </div>

              <div className="inmueble-nombre">{p.nombre}</div>
              <div className="inmueble-edificio">{p.edificio}</div>
              <div className="inmueble-tipo">{p.tipologia}</div>
              <div className="inmueble-divider" />
              <div className="inmueble-descripcion">{p.descripcion}</div>

              <div className="inmueble-tags">
                {p.hab && <span className="tag">{p.hab} hab.</span>}
                {p.banos && <span className="tag">{p.banos} {p.banos === 1 ? 'baño' : 'baños'}</span>}
                {p.extras.map(e => <span key={e} className="tag">{e}</span>)}
              </div>

              <div className="kpi-section">
                <div className="kpi-section-label">Datos financieros</div>
                <div className="kpi-row">
                  <div className="kpi-box highlight">
                    <div className="kpi-label">Alquiler mensual</div>
                    <div className="kpi-value">{fmtEur(p.alquiler)}/mes</div>
                  </div>
                  <div className="kpi-box">
                    <div className="kpi-label">Rent. bruta</div>
                    <div className={`kpi-value ${parseFloat(rb) >= 6 ? 'green' : ''}`}>{rb}</div>
                  </div>
                  <div className="kpi-box">
                    <div className="kpi-label">Rent. neta</div>
                    <div className={`kpi-value ${rnNum >= 5 ? 'green' : ''}`}>{rn}</div>
                  </div>
                  <div className="kpi-box">
                    <div className="kpi-label">Gastos anuales</div>
                    <div className="kpi-value" style={{ fontSize: '10pt' }}>
                      {p.comunidad === 0 && p.ibi === 0 ? 'Sin gastos' : fmtEur(p.comunidad * 12 + p.ibi)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="slide-footer">{idx + 2} / {INMUEBLES.length + 2}</div>
          </div>
        )
      })}

      {/* ── CIERRE ──────────────────────────────────────────────────────────── */}
      <div className="slide cierre">
        <div className="cierre-stripe top" />
        <div className="cierre-stripe bottom" />
        <div className="cierre-gracias">Gracias.</div>
        <div className="cierre-sub">
          Activos seleccionados, asesoramiento estratégico y operaciones en entorno confidencial.
        </div>
        <div className="cierre-empresa">HASU ACTIVOS INMOBILIARIOS SL</div>
        <div className="cierre-email">patricio@wallest.pro</div>
        <div className="cierre-web">wos.wallest.pro</div>
        <div className="cierre-footer">Documento confidencial · {fecha}</div>
      </div>
    </>
  )
}
