# Sesión 03 — Estructura Holding en Inmobiliaria

## Concepto de Holding

Una **holding** es una sociedad que tiene como activo principal **participaciones en otras sociedades**.

En el contexto inmobiliario:
- **Sociedad cabecera (holding):** posee las participaciones de las filiales operativas
- **Filiales:** son las que tienen los inmuebles, hacen las operaciones, generan beneficios
- El flujo de dinero va: Filial → Holding → Socio

---

## Los Tres Tipos de Grupo

| Figura | Participación mínima | Régimen |
|---|---|---|
| **Holding pura** | Sin mínimo (basta con tener participaciones) | No hay régimen especial automático |
| **Grupo Mercantil** | >50% de la filial | Consolidación contable posible |
| **Grupo Fiscal** | ≥75% de la filial | Declaración consolidada IS — compensación pérdidas entre entidades |

> **Clave HASU:** Con el 75% se puede declarar el IS en grupo, lo que permite que las pérdidas de una filial compensen los beneficios de otra. Muy útil cuando hay operaciones en distintas fases.

---

## Las 3 Formas de Constituir un Holding

### Forma 1 — Crear una nueva sociedad encima
- Tienes una SL con inmuebles
- Creas una nueva SL (la holding) y le aportas las participaciones de la primera
- La nueva SL queda como cabecera
- **Tributación:** si se aplica régimen FEAC, la aportación es neutral (no tributa en ese momento)

### Forma 2 — Usar una sociedad existente
- Ya tienes varias sociedades
- Designas una de ellas como holding (normalmente la más limpia de activos operativos)
- Las otras pasan a ser filiales de la holding
- **Ventaja:** sin coste de constitución, pero requiere reestructuración de participaciones

### Forma 3 — Una sociedad existente crea una filial
- Tienes la holding y creas la filial desde cero para cada operación
- Modelo operativo: **una filial por proyecto** → aislamiento de riesgo
- La holding es permanente; las filiales se abren y cierran según las operaciones

---

## Tributación del Socio al Salir

Cuando el socio (persona física) vende sus participaciones en la holding o en la filial:

**Ganancia patrimonial → IRPF → Base del Ahorro**

| Tramo | Tipo |
|---|---|
| Hasta 6.000€ | 19% |
| 6.001€ – 50.000€ | 21% |
| 50.001€ – 200.000€ | 23% |
| 200.001€ – 300.000€ | 27% |
| Más de 300.000€ | 30% |

### Tipo efectivo según ganancia (referencia)

| Ganancia | Tipo efectivo |
|---|---|
| 50.000€ | ~20,76% |
| 100.000€ | ~21,88% |
| 200.000€ | ~22,44% |
| 500.000€ | ~26,37% |
| 1.000.000€ | ~28,19% |

> El tipo efectivo nunca llega al 30% porque los primeros tramos tributan a tipos menores.

---

## Régimen FEAC — Fusiones, Escisiones, Aportaciones y Canje

### Qué es

Régimen fiscal especial (LIS, Capítulo VII, Título VII) que permite realizar reestructuraciones societarias **sin tributar en el momento** de la operación.

Principio: **neutralidad fiscal** — ni se genera ganancia ni pérdida hasta que se produce la transmisión definitiva al exterior.

### Operaciones que cubre

| Operación | Descripción |
|---|---|
| **Fusión** | Dos sociedades se unen en una |
| **Escisión** | Una sociedad se divide en dos o más |
| **Aportación no dineraria** | Se aporta un activo (inmueble, participaciones) a una sociedad a cambio de participaciones |
| **Canje de valores** | Se intercambian participaciones de una sociedad por las de otra |

### Para operaciones HASU: la más relevante es la Aportación No Dineraria

**Ejemplo:** HASU SL tiene un inmueble valorado en 500k€ y lo aportó a precio de coste de 300k€.
- Sin FEAC: al aportar el inmueble a la holding tributa por la diferencia (200k€ de plusvalía en IS)
- **Con FEAC:** la aportación no tributa — la plusvalía queda "latente" dentro de la estructura

### Requisitos del régimen FEAC

1. **Motivo económico válido** — no puede ser exclusivamente fiscal
   - Ejemplos válidos: reorganización, captación de inversores, separación de riesgo, sucesión familiar
   - No válido: "quería pagar menos impuestos"
2. **Actividad económica real** — no vale para sociedades patrimoniales sin actividad
3. **Comunicación a Hacienda** — mediante modelo 036 o comunicación específica antes de la declaración IS del ejercicio
4. La Agencia Tributaria puede impugnar si considera que el único motivo es fiscal (**cláusula anti-abuso**)

### Cuándo deja de diferirse

La tributación aflora cuando:
- Se venden las participaciones de la sociedad receptora
- Se vende el activo que se aportó
- Se disuelve la sociedad

---

## Estructura Holding para HASU — Modelo Operativo Sugerido

```
                    HASU HOLDING SL
                    (cabecera, permanente)
                   /        |         \
          HASU OP1 SL   HASU OP2 SL   HASU OP3 SL
          (proyecto A)  (proyecto B)  (proyecto C)
```

**Ventajas de este modelo:**
- **Aislamiento de riesgo:** un proyecto no arrastra a los otros
- **Tributación intergrupo:** si hay grupo fiscal (≥75%), las pérdidas de una filial compensan beneficios de otra
- **Salida limpia:** al vender el proyecto, se puede vender la filial entera (transmisión de participaciones vs transmisión del inmueble)
- **Dividendos intergrupo:** con ≥5% de participación, los dividendos de filial a holding tributan al 5% efectivo (exención del 95%) en IS

---

## Fiscalidad del Flujo Holding → Socio

```
Filial genera beneficio
   → Paga IS (25% general / 15% nueva empresa)
   → Distribuye dividendo a Holding
      → Exención 95% (si participa ≥5% durante ≥1 año)
      → Holding cobra casi sin tributar
         → Holding acumula caja para reinvertir
            → O distribuye dividendo al socio persona física
               → IRPF base ahorro (19-30%)
```

**Clave:** mientras el dinero se queda dentro de la estructura (holding reinvierte en nuevas operaciones), no tributa por IRPF. La tributación del socio solo ocurre cuando saca el dinero a nivel personal.

---

## Aplicación en WOS3

- **`tipo_op = 'participacion'`** en proyectos donde HASU entra como co-inversor minoritario (fuera de estructura holding)
- **`tipo_op = 'propio'`** en proyectos donde opera una filial de HASU (estructura holding)
- Cuando Claude analice una operación grande (>500k€), sugerir valorar la creación de filial específica bajo la holding HASU
- Régimen FEAC: relevante cuando HASU quiera aportar inmuebles de una SL existente a una estructura holding

---

## Archivos originales (sesión 03)
- `Holding.pdf`
- Presentación régimen FEAC y estructura de grupo
