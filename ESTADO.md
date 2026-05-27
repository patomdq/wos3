# WOS3 — Estado Operativo
> Actualizar al cerrar cada sesión de Code. Este archivo es la memoria viva del proyecto.

---

## Última sesión — 07/05/2026

### Hecho hoy

**Datos pipeline corregidos (BD directa):**
- Olula del Rio 1: `valor_total_operacion` → 45k, `fecha_salida_estimada` → 2026-06-21 (6m), estado → `reservado`
- Cuevas 1: `fecha_salida_estimada` → 2025-04-21 (3m)
- Cuevas 2: `fecha_salida_estimada` → 2025-11-01 (4m)
- Albox 1: `fecha_salida_estimada` → 2025-02-01 (4m), `inversion_hasu` → 13k
- Zurgena 1: `inversion_hasu` → 35k
- Edificio Cuevas del Almanzora: `valor_total_operacion` → 450k, `precio_venta_estimado` → 656k (82k × 8 pisos), estado → `en_arras`

**Track record (`hasu/page.tsx`) — mejoras:**
- `getInv` simplificado: usa siempre `valor_total_operacion || precio_compra` (eliminada lógica de movimientos que pisaba el valor real)
- Nueva columna **Inv. HASU** — muestra la inversión real de HASU separada del total de la operación
- `getInvHasu`: usa `inversion_hasu` si existe y > 0; para proyectos 100% HASU usa el total
- ROI renombrado a **ROI HASU** y recalculado sobre `inversion_hasu` real (no el total de operación)
- Colores simplificados: solo ROI en verde/rojo, resto en blanco
- Texto más grande (`text-sm`)
- Fila de totales al pie: suma inv. total, inv. HASU, benef. total, benef. HASU, ROI medio, ROI anual medio, duración media
- Fix: Edificio Cuevas del Almanzora ya no muestra -100% cuando no hay precio de venta

### Pendiente / En prueba
- Análisis de Inversión con comparables Fotocasa: Pato probando

### Próxima tarea acordada
- Audio en chat (transcripción vía Whisper API) — esperar confirmación de Pato tras pruebas

### Bloqueos abiertos
- Idealista API: sin respuesta, usando web search como fallback
- SUPABASE_SERVICE_KEY: pendiente en Vercel para invites reales

---

## Features en producción
- Pipeline de operaciones: ✅
- Bot entrada de datos: ✅
- Análisis de inversión: ✅ (deployado hoy)
- Imágenes en chat: ✅ (deployado hoy)
- Audio en chat: ⏳ pendiente

## Features pendientes de desarrollo
- Audio (Whisper API)
- Bot evaluador cambio de uso (semáforo 🔴🟡🟢)
- Bot evaluador tipología edificio
- Módulo edificios / multivivienda
- Portal inversor (migración desde WOS2)
- Desktop layout fix (actualmente renderiza como mobile estirado)

---

## Decisiones tomadas — no reabrir
- Stack inamovible: Next.js 14 + Supabase + Vercel
- Modelo: `claude-sonnet-4-6` vía env var `ANTHROPIC_MODEL`
- HASU y JV separados siempre — regla absoluta
- Bot como único punto de entrada de datos
- WOS2 (`zzidqchvcijqgcexrzca`) solo lectura — nunca modificar

---

## Contexto de negocio (no técnico)
- Objetivo: 1M€ beneficio neto acumulado antes dic 2027
- ROI mínimo conservador: 30%
- Tres palancas: cesiones de remate, edificios completos, zonas de mayor valor
- Inversor activo: José Luis Zurano
