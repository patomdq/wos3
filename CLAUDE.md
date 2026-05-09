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

**Última sesión — 09/05/2026**

Hecho hoy:
- Bot Telegram: precio dual Fotocasa + Notariado lado a lado
- Fotocasa filtrado por superficie ±40% para comparables específicos al producto
- No auto-estima precio_venta si Fotocasa < precio_pedido × 1.1 (evita ROI negativo con datos incorrectos)
- Bot muestra referencias de mercado aunque falten datos para ROI
- Duración de operación extraída del mensaje → ROI anualizado calculado y mostrado
- Gastos desglosados: Notaría+Registro 1k y ITP 2% por separado
- fmt() mejorado: muestra decimales para valores < 10k (ej: 1.3k)
- Handler bitácora en bot Telegram: detecta "agrega/nota/oferta" y graba en bitacora_estudio
- Fix chat WOS3: token fresco en cada request (evita "No autorizado" tras 1h)
- Fix búsqueda inmuebles_estudio: incluye titulo y ciudad en OR (resolvía mal "Duplex Pulpi")
- Columna duracion_meses agregada a inmuebles_radar
- Policies anon en bitacora_estudio para operaciones con anon key
- **Morning Briefing automático**: endpoint `/api/telegram/morning-briefing` + cron Vercel `0 6 * * *` (8:00 Madrid)
  - Lee Supabase en paralelo: objetivo 1M€, operaciones activas, radar, última compra
  - Alertas automáticas: días sin compra >30, proyectos parados >14 días, fecha clave <7 días
  - Google Calendar integrado — eventos del día desde cuenta org
  - Foco del día generado por Claude API en imperativo ≤15 palabras
  - Solo llega a Pato (TELEGRAM_CHAT_ID_PATO = 5816771550)
  - Si Supabase falla → envía igual con aviso de error

Pendiente / en prueba:
- Modo D audio Telegram: bloqueado sin créditos OpenAI
- Verificar briefing en producción mañana a las 8:00 (primera ejecución real del cron)

Bugs detectados:
- ⚠️ Bot tarda mucho en responder a "avance de obra" — verificado que SÍ funciona y graba correctamente
  - El bot se quedó "escribiendo" ~1-2 min antes de responder
  - Ambas acciones (avance_reforma 80% + evento calendario) se grabaron correctamente
  - Probable causa: cold start de Vercel + Claude API en la misma request
  - A vigilar: si se repite con frecuencia, separar el handler de avance de obra para que sea más rápido

Próximas tareas acordadas (domingo 10/05/2026):

1. Revisar módulo Proyectos en WOS3: los números no coinciden con el área HASU
   - Objetivo: que toda la sección Proyectos esté supeditada a los movimientos de la tabla maestra de HASU
   - La tabla maestra de HASU es la fuente de verdad — WOS3 debe leerla y reflejarla, no calcular por su cuenta

2. Sistema de @menciones en bitácora (como Trello)
   - Cada usuario tiene su @handle (ej: @pato, @silvia, @jl)
   - Cuando alguien escribe una nota en la bitácora de cualquier proyecto y menciona un @usuario, ese usuario recibe alerta por Telegram
   - La alerta incluye: proyecto, quién escribió, y el contenido de la nota
   - Sin esto las notas con preguntas quedan sin respuesta porque nadie se entera
   - Requiere: tabla de usuarios con chat_id de Telegram, parser de @menciones en bitácora, envío por bot

Bloqueos abiertos:
- OpenAI: sin créditos → Modo D (audio Telegram) bloqueado
- Idealista API: sin respuesta, usando web search como fallback

**Variables de entorno críticas (producción Vercel)**
- `TELEGRAM_BOT_TOKEN` — bot activo
- `TELEGRAM_CHAT_ID_PATO` — 5816771550 (añadida 09/05/2026)
- `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` — ya existían

---

## FEATURES — estado actual

| Feature | Estado |
|---------|--------|
| Pipeline de operaciones | ✅ producción |
| Bot entrada de datos | ✅ producción |
| Bot Telegram → Radar | ✅ producción |
| Análisis de inversión | ✅ producción |
| Imágenes en chat | ✅ producción |
| Bitácora via bot (Telegram + chat WOS3) | ✅ producción |
| ROI anualizado en bot | ✅ producción |
| Morning Briefing automático (Telegram 8:00 AM) | ✅ producción |
| Audio bot Telegram (Whisper) | ⏳ bloqueado — sin créditos OpenAI |
| Proyectos WOS3 alineado con tabla maestra HASU | ⏳ pendiente |
| @menciones en bitácora con alerta Telegram | ⏳ pendiente |
| Evaluador cambio de uso 🔴🟡🟢 | ⏳ pendiente |
| Evaluador tipología edificio | ⏳ pendiente |
| Módulo edificios / multivivienda | ⏳ pendiente |
| Portal inversor | ⏳ pendiente |
| Desktop layout fix | ⏳ pendiente |
