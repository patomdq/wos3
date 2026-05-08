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

**Última sesión — 08/05/2026**

Hecho hoy:
- Bot Telegram `@wos3radar_bot` creado y conectado a WOS3
- Webhook `POST /api/telegram/webhook` implementado con 4 modos:
  - Modo A: texto libre → Claude + fallback regex
  - Modo B: links Idealista/Fotocasa → scraping automático
  - Modo C: fotos/capturas → Claude Vision
  - Modo D: audio/nota de voz → Whisper API (OpenAI)
- Comparables Fotocasa automáticos si falta precio_venta_est
- Confirmación con botones inline antes de subir al Radar
- Migración Supabase: 10 columnas nuevas en `inmuebles_radar`

Pendiente / en prueba:
- Modo D (audio): Pato necesita cargar créditos en OpenAI (error 429)
- Modo C (Vision): funciona con créditos Anthropic activos

Próxima tarea acordada:
- Probar bot completo cuando OpenAI tenga créditos
- Siguiente feature a definir con Pato

Bloqueos abiertos:
- OpenAI: sin créditos → Modo D (audio) bloqueado
- Idealista API: sin respuesta, usando web search como fallback
- SUPABASE_SERVICE_KEY: pendiente en Vercel para invites reales

---

## FEATURES — estado actual

| Feature | Estado |
|---------|--------|
| Pipeline de operaciones | ✅ producción |
| Bot entrada de datos | ✅ producción |
| Bot Telegram → Radar | ✅ producción |
| Análisis de inversión | ✅ producción |
| Imágenes en chat | ✅ producción |
| Audio bot Telegram (Whisper) | ⏳ bloqueado — sin créditos OpenAI |
| Evaluador cambio de uso 🔴🟡🟢 | ⏳ pendiente |
| Evaluador tipología edificio | ⏳ pendiente |
| Módulo edificios / multivivienda | ⏳ pendiente |
| Portal inversor | ⏳ pendiente |
| Desktop layout fix | ⏳ pendiente |
