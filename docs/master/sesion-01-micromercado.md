# Sesión 01 — Análisis de Micromercado

## Qué es y para qué sirve

El análisis de micromercado permite **detectar demanda real** en una zona concreta antes de invertir. Se hace monitorizando Idealista durante 2-4 semanas y registrando qué inmuebles desaparecen (= ventas o alquileres concretados).

**Casos de uso:**
- Validar si hay demanda para el tipo de producto que queremos crear (ej. bajo con cambio de uso a vivienda)
- Obtener precios de venta reales para trabajar la búsqueda de oportunidades
- Confirmar hipótesis antes de hacer una oferta

---

## Metodología paso a paso

### 1. Definir el micromercado
- **Zona:** barrios o calles concretas (ej. Bola de Oro + Carretera de la Sierra, Granada)
- **Fecha inicio / fecha fin** del estudio (recomendado: 3-4 semanas)
- **Objetivo específico:** qué tipología buscamos (ej. bajos para cambio de uso, pisos 2 hab, etc.)

### 2. Captura inicial — Tabla 1: Viviendas EN VENTA
Al inicio del estudio, registrar todos los inmuebles activos por:

| | 1 hab | 2 hab | 3 hab | 4 hab+ |
|---|---|---|---|---|
| Acabado Bajo | | | | |
| Acabado Medio | | | | |
| Acabado Alto | | | | |
| **TOTAL** | | | | |

### 3. Seguimiento — Tabla 2: Viviendas DESAPARECIDAS
Al final del estudio, registrar los inmuebles que ya no aparecen en Idealista (= probable venta):

| | 1 hab | 2 hab | 3 hab | 4 hab+ |
|---|---|---|---|---|
| Acabado Bajo | | | | |
| Acabado Medio | | | | |
| Acabado Alto | | | | |
| **TOTAL** | | | | |

### 4. Si el objetivo son bajos/locales: tablas específicas
- **Tabla 3:** Bajos en venta (desglosados igual)
- **Tabla 4:** Bajos desaparecidos durante el estudio

### 5. Calcular porcentajes — Tabla 5
```
% desaparecidos = (desaparecidos / en venta) × 100
```
Por tipología y acabado. Indica la **velocidad de absorción del mercado**.

---

## Interpretación de resultados

| % desaparecidos | Lectura |
|---|---|
| > 40% | Demanda muy alta — mercado activo |
| 20–40% | Demanda media — oportunidad viable |
| < 20% | Demanda baja — revisar hipótesis |

**Ejemplo real (Granada, dic-2024):**
- 50% de bajos de 2 hab acabado alto desaparecieron → demanda muy alta
- 33% de bajos de 1 hab acabado alto desaparecieron → demanda alta
- Conclusión: hay más demanda que oferta en acabados altos → reformar bien es clave para vender rápido

---

## Siguiente paso tras el análisis

Si el análisis confirma demanda, realizar **3 estudios de mercado** (comparables reales) para obtener precios de venta precisos:
- 1 estudio por tipología objetivo (ej. bajo 1 hab acabado alto / bajo 2 hab / piso 3 hab)
- Estos precios alimentan la calculadora de rentabilidad de WOS3

---

## Aplicación en WOS3

Cuando llegue una oportunidad en una zona nueva:
1. Hacer análisis de micromercado antes de entrar en números
2. Validar que el producto que genera la operación tiene demanda real
3. Los comparables del estudio → `precio_venta_estimado` en la calculadora
4. Si el micromercado es débil → bandera roja en la Matriz de Riesgos (naturaleza: Financiero, probabilidad alta)

---

## Archivos originales
- `01 Ejemplo Estudio micromercado.docx` — ejemplo completo con datos reales de Granada
