# WOS3 — Estado Operativo
> Actualizar al cerrar cada sesión de Code. Este archivo es la memoria viva del proyecto.

---

## Última sesión — 04/05/2026 (noche)

### Hecho hoy
- En Estudio: tres escenarios de precio de venta como campos independientes (eliminado cálculo ±15%):
  - Migración BD: `precio_venta_conservador`, `precio_venta_realista`, `precio_venta_optimista` en `inmuebles_estudio`
  - `mercado/page.tsx`: UI cambiada de "Realista (base) + auto-calc" a 3 inputs en grid cols-3, mismo peso visual
  - `route.ts`: tools `insert_estudio`, `update_estudio`, `convertir_estudio_a_proyecto` y `mover_radar_a_estudio` actualizados

- Módulo Análisis de Inversión — búsqueda de comparables refactorizada:
  - `lib/search-comparables.ts` reescrito: fetch directo a Fotocasa (múltiples URLs por barrio × hab) + Firecrawl como fallback si hay < 3 resultados
  - Output del handler `analizar_inversion` en `route.ts` actualizado: comparables en tabla markdown + escenarios ROI en tabla con precio/m² como base explícita
  - Build Next.js limpio, sin errores en archivos modificados

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
