# Sesión 01 — Modelos de Inversión Conjunta

Guía para estructurar una inversión en conjunto. Cuatro modelos según el rol del Gestor y el tipo de operación.

---

## Modelo 1 — INBRUTO (Gestor cobra honorarios, inversor pone todo el capital)

El Gestor **no co-invierte**. Cobra honorarios fijos por gestión.

| Concepto | Valor |
|---|---|
| Aportación Inversor | 100% — 100.000€ |
| Rentabilidad SIN honorarios | 25% / 25.000€ beneficio |
| Rentabilidad CON honorarios | 22% / 22.000€ beneficio |
| **Honorarios Gestor (con IVA)** | **3.000€** |
| Honorarios sin IVA | 2.479€ |
| Por vivienda | 3.000€ |
| % sobre inversión total | 3% |
| % sobre beneficio | 12% |

**Cuándo usar:** Inversor quiere toda la rentabilidad, Gestor prefiere cobro fijo y seguro. Operación simple (1 vivienda).

---

## Modelo 2 — INBRUTO CON SERVICIOS (Honorarios + Bonus)

Igual que el Modelo 1 pero el Gestor presta servicios adicionales (reforma, comercialización) y cobra un bonus por resultado.

| Concepto | Valor |
|---|---|
| Aportación Inversor | 100% — 100.000€ |
| Rentabilidad SIN honorarios | 20% / 20.000€ beneficio |
| Rentabilidad CON honorarios | 12% / 12.000€ beneficio |
| **Total Honorarios (con IVA)** | **6.000€** |
| Honorarios sin IVA | 4.959€ |
| **Bonus** | **2.000€** (si aplica: hasta 5.000€) |
| % sobre inversión total | 8% |
| % sobre beneficio | 40% |

**Cuándo usar:** Gestor aporta servicios profesionales concretos (reforma, venta) además de la gestión. El bonus alinea incentivos con el resultado final.

---

## Modelo 3 — JOINT VENTURE WATERFALL

Ambos co-invierten. El Gestor aporta menos capital pero recibe **más % de beneficio que su aportación** (efecto waterfall). Alineación total de intereses.

| Parte | Aportación % | Aportación € | Distribución % | Beneficio € | Rentabilidad |
|---|---|---|---|---|---|
| **Gestor** | 30% | 31.800€ | **40%** | 8.480€ | **26,7%** |
| **Inversor** | 70% | 74.200€ | **60%** | 12.720€ | **17,1%** |
| **Total operación** | 100% | 106.000€ | 100% | 21.200€ | 20% |

**Clave:** El Gestor aporta el 30% pero recibe el 40% → rentabilidad superior a la del inversor. Esto compensa el trabajo de gestión.

**Con BONUS:** Se puede añadir bonus al Gestor si se superan objetivos (ver Modelo 2).

**Cuándo usar:** HASU tiene capacidad de co-invertir. Operaciones medianas donde el alineamiento de intereses es clave para el inversor.

---

## Modelo 4 — JOINT VENTURE SERVICERS (Grandes carteras)

Para operaciones con **carteras de activos de servicers** (REOs, deuda). Volúmenes muy altos, el Gestor aporta capital mínimo y cobra honorarios por vivienda.

| Parte | Aportación % | Aportación € | Distribución % | Beneficio € | Rentabilidad |
|---|---|---|---|---|---|
| **Gestor** | 2% | 26.400€ | 2% | 3.600€ | 13,6% |
| **Inversor** | 98% | 1.293.600€ | 98% | 176.400€ | 13,6% |
| **Inversión total** | — | 1.200.000€ | — | 300.000€ | — |
| **Inversión + Honorarios** | — | 1.320.000€ | — | 180.000€ | 13,6% |

**Honorarios del Gestor:**
| Concepto | Valor |
|---|---|
| Total honorarios | 120.000€ |
| Nº viviendas | 12 |
| Por vivienda | 10.000€ |
| % sobre beneficio | 66,7% |
| % sobre inversión | 9,1% |

**Cuándo usar:** Carteras de servicers (como las operaciones REO del módulo Deuda de WOS3). El Gestor gestiona la cartera completa, cobra por vivienda vendida.

---

## Comparativa de modelos

| Modelo | Rol HASU | Capital HASU | Riesgo | Upside |
|---|---|---|---|---|
| INBRUTO | Gestor puro | 0€ | Bajo | Limitado (honorarios fijos) |
| INBRUTO + SERVICIOS | Gestor + servicios | 0€ | Bajo-Medio | Medio (honorarios + bonus) |
| JV WATERFALL | Co-inversor gestor | 30% op. | Medio | Alto (% beneficio > % aportación) |
| JV SERVICERS | Gestor de cartera | ~2% | Bajo | Medio-Alto (honorarios × volumen) |

---

## Aplicación en WOS3

- **`tipo_op` en proyectos:** `propio` (modelos 1-3) vs `participacion` (modelo 4 cuando HASU es gestor externo)
- **`porcentaje_hasu`:** en JV Waterfall es el % de distribución de beneficio (40%), no el de aportación (30%)
- **`inversion_hasu`:** siempre registrar el capital real aportado por HASU, no el total de la operación
- Los honorarios del Gestor van como `movimientos` de tipo Ingreso en el proyecto

---

## Archivo original
- `03 Guia para construir una inversión en conjunto FINAL v3.xlsx`
