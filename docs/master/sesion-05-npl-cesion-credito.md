# Sesión 05 — NPL, Cesión de Crédito y Ciclo del Activo Distress

> Los PDFs originales de esta sesión (NPL.pdf, Ficha Análisis Cesión, Ciclo del Activo Distress) son documentos basados en imágenes sin texto extraíble. El contenido estructural se ha capturado de las referencias en clase y del sistema de análisis ya implementado en WOS3.

---

## Qué es un NPL (Non-Performing Loan)

Un **crédito moroso** o préstamo en situación de impago. El banco/acreedor original deja de cobrar las cuotas y el activo entra en proceso de gestión de mora.

**Tipos de activos que se adquieren vía cesión:**
- Créditos hipotecarios impagados (NPL con garantía real)
- Créditos sin garantía (crédito personal, tarjetas — NPL quirografario)
- Activos adjudicados (REO — Real Estate Owned) ya en balance del banco/servicer

---

## Cesión de Crédito — Concepto

La **cesión de crédito** es la transmisión de un derecho de cobro de un acreedor (cedente) a un tercero (cesionario), sin necesidad de consentimiento del deudor.

**Base legal:** Arts. 1526-1536 Código Civil

| Figura | Rol |
|---|---|
| **Cedente** | Banco, fondo o acreedor que transmite el crédito |
| **Cesionario** | Comprador del crédito (HASU u otro inversor) |
| **Deudor** | No necesita consentir, pero debe ser notificado |

---

## Ciclo de Vida del Activo Distress

```
Nacimiento del crédito (banco concede préstamo)
   ↓
Impago (NPL — Non-Performing Loan)
   ↓
Gestión interna del banco (hasta 12-24 meses)
   ↓
Venta en cartera a fondo/servicer (descuento sobre nominal)
   ↓
Gestión por servicer (Altamira, Haya, Anticipa, Servihabitat...)
   ↓
Ejecución hipotecaria (si hay garantía real)
   ↓
Subasta judicial / adjudicación
   ↓
REO (inmueble en balance del fondo/servicer)
   ↓
Venta del REO → Mercado secundario (origen REO en WOS3)
```

---

## Ficha de Análisis de Cesión de Crédito

Los 4 ratings del sistema de análisis implementado en WOS3 (`AnalisisCesion`):

| Rating | Descripción |
|---|---|
| **D — Deuda** | Análisis del crédito: nominal, antigüedad, impago, garantías |
| **P — Propiedad** | Estado registral del inmueble, cargas, valor de tasación |
| **J — Jurídico** | Fase procesal, plazo hasta adjudicación, riesgos legales |
| **Pr — Precio** | Precio de cesión vs valor estimado de recuperación |

### Métricas clave en una cesión

- **Nominal del crédito:** importe total de la deuda (principal + intereses + costas)
- **Precio de cesión:** lo que se paga por el crédito (% sobre nominal, habitualmente 10-40%)
- **Valor de tasación del inmueble:** valor del activo que garantiza la deuda
- **LTV (Loan-to-Value):** ratio crédito/valor inmueble — determina el margen de maniobra
- **Fase procesal:** cuánto queda hasta la subasta (cuanto más avanzado, más certeza pero más precio)

---

## Estrategias de Salida en una Cesión

| Estrategia | Descripción | Plazo típico |
|---|---|---|
| **Negociar con el deudor** | Ofrecer quita/dación en pago antes de la subasta | 3-6 meses |
| **Dejar llegar a subasta** | Adjudicarse el inmueble por el crédito | 6-18 meses |
| **Revender el crédito** | Ceder el NPL a otro inversor con margen | Variable |
| **Acuerdo extrajudicial** | Pactar con deudor pago parcial o entrega inmueble | 1-3 meses |

---

## Riesgos Específicos de las Cesiones

| Riesgo | Descripción | Mitigación |
|---|---|---|
| **Riesgo procesal** | El juicio puede alargarse o tener incidentes de nulidad | Due diligence jurídica previa |
| **Riesgo de vulnerabilidad** | Deudor con menores o dependientes puede suspender lanzamiento | Investigar situación social antes de comprar |
| **Riesgo registral** | Cargas preferentes, hipotecas anteriores, afecciones urbanísticas | Nota simple + certificado de cargas |
| **Riesgo de valor** | El inmueble puede valer menos que la deuda ejecutada | Tasación actualizada + visita |
| **Riesgo de ocupación** | El inmueble puede estar ocupado en el momento de adjudicación | Ver supuesto #3 (Caso Alcantarilla) |

---

## Conexión con el Módulo Deuda de WOS3

WOS3 implementa el análisis de cesión con:
- `tipo: 'AnalisisCesion'` en `lib/deuda-schema.ts`
- 4 ratings (D/P/J/Pr) con semáforo visual
- `inferirRatingsCesion()` — inferencia automática de ratings
- `calcBeneficioCesion()` — cálculo de beneficio estimado
- UI en `DeudaFichaModal.tsx` + chips en `DeudaListado.tsx`

---

## Aplicación en WOS3

Al analizar una oportunidad de cesión de crédito:
1. Obtener **nota simple actualizada** antes de cualquier oferta
2. Calcular **LTV real** con tasación actualizada (no la del banco)
3. Verificar **fase procesal exacta** — fecha prevista de subasta
4. Investigar **situación de los ocupantes** (¿vulnerable? ¿contrato? ¿usurpación?)
5. Aplicar los **4 ratings DPJP** en la ficha WOS3
6. ROI mínimo 30% escenario conservador (regla general WOS3)

---

## Archivos originales (sesión 05)
- `NPL.pdf` — introducción a créditos morosos (imagen, sin texto extraíble)
- `Ficha Analisis Cesión de Credito.pdf` — ficha de trabajo (imagen, sin texto extraíble)
- `Presentacion El ciclo de VIDA del ACTIVO DISTRESS Y SUS RETOS (1).pdf` — (imagen, sin texto extraíble)
