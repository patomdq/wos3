# WOS3 — Wallest Operating System

## REGLAS FIJAS — no modificar sin instrucción explícita

**Repos y bases de datos**
- Repo activo: `github.com/patomdq/wos3` — trabajar SIEMPRE aquí
- Supabase activo: `mxdesbiyjvdnpehklwcb.supabase.co` — lectura/escritura
- Supabase W2: `zzidqchvcijqgcexrzca.supabase.co` — SOLO LECTURA, nunca escribir

**Fórmula ROI — única válida**
```
ROI = (venta - compra - reforma - gastos - impuestos)
      / (compra + reforma + gastos + impuestos)
```
- ROI mínimo aceptable: 30% escenario conservador
- Nunca redondear hacia arriba
- No modificar `/lib/formulas.ts` sin instrucción explícita

**Gastos fijos por operación**
- ITP: 2% sobre precio de compra
- Notaría compra: ~500€
- Registro: ~500€

**Pipeline de estados**
```
Radar → En Estudio → En Negociación → Comprada → En Reforma → En Venta → Vendida
```
- Al pasar de Radar a En Estudio, desaparece del módulo Radar
- Solo operaciones con estado `vendida` suman al objetivo 1M€

**Nunca hacer**
- Mezclar datos HASU con JV en queries o UI
- Crear endpoints de escritura directa sin pasar por el bot
- Modificar `/lib/formulas.ts` sin autorización
- Cambiar stack (Next.js, Supabase, Vercel son inamovibles)
- Usar `any` en TypeScript sin justificación

---

## ESTADO OPERATIVO — actualizar al cerrar cada sesión

**Última sesión — 04/05/2026**

Hecho hoy:
- Modelo migrado a `claude-sonnet-4-6` vía env var `ANTHROPIC_MODEL` en Vercel
- CLAUDE.md reducido a ~350 tokens
- Módulo Análisis de Inversión implementado (scraping web + 3 escenarios ROI)
- Soporte de imágenes en chat implementado (Claude Vision + extracción de datos)

Pendiente / en prueba:
- Análisis de Inversión: Pato probando
- Imágenes en chat: Pato probando

Próxima tarea acordada:
- Audio en chat vía Whisper API — esperar confirmación de Pato tras pruebas

Bloqueos abiertos:
- Idealista API: sin respuesta, usando web search como fallback
- SUPABASE_SERVICE_KEY: pendiente en Vercel para invites reales

---

## FEATURES — estado actual

| Feature | Estado |
|---------|--------|
| Pipeline de operaciones | ✅ producción |
| Bot entrada de datos | ✅ producción |
| Análisis de inversión | ✅ deployado hoy |
| Imágenes en chat | ✅ deployado hoy |
| Audio (Whisper API) | ⏳ pendiente |
| Evaluador cambio de uso 🔴🟡🟢 | ⏳ pendiente |
| Evaluador tipología edificio | ⏳ pendiente |
| Módulo edificios / multivivienda | ⏳ pendiente |
| Portal inversor | ⏳ pendiente |
| Desktop layout fix | ⏳ pendiente |
