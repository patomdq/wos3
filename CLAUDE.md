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

**Última sesión — 29/05/2026**

Hecho hoy:
- **Modal Agregar mercado (`/app/(app)/mercado/page.tsx`) — rediseño completo**
  - Modal Agregar ahora es copia fiel del modal Editar: layout apaisado 2 columnas, mismos campos
  - Fila de tipos (Tipo *) movida encima del grid → full-width, `flex-nowrap`, sin overflow ni segunda línea
  - Botones Cancelar/Guardar al fondo de la columna derecha (`sm:flex sm:flex-col` + `mt-auto`)
  - Para Edificio: panel completo de gestión de unidades con "🔗 Importar URL" + "+ Manual"
  - Para no-Edificio (Piso, Casa, etc.): área de carga de imagen de portada (drag & drop o click)
  - `saveNuevo`: sube imagen a Supabase Storage bucket `portadas` → guarda URL en `imagen_portada`
  - `importarYGuardar`: guarda el edificio primero para obtener ID, luego llama `/api/unidades/import`
  - Estado nuevo: `nuevoUnidades`, `addingNuevoUnidad`, `importandoNuevoUrl`, `nuevoImportUrl`, `nuevoPortada`, `nuevoPortadaPreview`
  - Commits: ae41c23, d5d8579, 261c0cf (y otros intermedios)
- **Mockup estático** `public/mockup-agregar.html` — creado para revisión de diseño antes de implementar (commit ee6a761)
- **`/api/unidades/import`** — endpoint POST que scrape URL + extrae unidades vía Claude API e inserta en `inmueble_unidades`

⚠️ Pendiente importante:
- Bucket `portadas` en Supabase Storage todavía NO confirmado como creado con acceso público — upload de imagen fallará si no existe
  - Crear en Supabase Dashboard: Storage → New bucket → nombre: `portadas`, Public: ON

Pendiente modal mercado (próxima sesión):
- **Rediseño landscape completo**: el modal sigue siendo algo vertical en mobile y pisa el menú inferior de navegación
  - El usuario quiere un modal más "apaisado" que no tape el bottom nav en mobile
  - Deferred a próxima sesión de diseño

---

**Sesión anterior — 11/05/2026**

Hecho:
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
- **Chat WOS3: scraping multi-portal** — detecta y scrapea URLs de Idealista, Fotocasa, Solvia, Habitaclia, Pisos.com, Yaencontre, Kyero, ThinkSpain, Engel, Savills + cualquier portal con dominio reconocido
- **Chat WOS3: invitados en calendario** — `agendar_evento` acepta `invitados: ["Silvia", "JL"]`, resuelve a emails y envía invitación automática vía Google Calendar API (sendUpdates=all)
  - Silvia: silviainformes@gmail.com / JL: joseluisxp123@gmail.com
- Fix bot Telegram: TELEGRAM_WEBHOOK_SECRET placeholder eliminado — bot respondía 401 a todo
- Fix bot Telegram: regex de URL expandido a todos los portales (Solvia, Habitaclia, etc.)

Pendiente / en prueba:
- Modo D audio Telegram: bloqueado sin créditos OpenAI
- Morning briefing cron: no llegó lunes 11/05 — investigar si hay problema con el cron o las vars de entorno

Pendiente técnico detectado:
- 📅 Bot Telegram crea eventos en Google Calendar pero NO puede agregar invitados externos automáticamente
  - Limitación de la Google Calendar API con OAuth del organizador
  - Solución posible: usar el campo `attendees` en la API de Google Calendar con los emails — verificar si el token org tiene scope suficiente
  - Silvia: silviainformes@gmail.com / JL: joseluisxp123@gmail.com
  - Pato quiere poder invitar desde el bot directamente sin ir al calendario

Bugs detectados:
- 🐛 Evento duplicado en calendario — "Pasar oferta a Servihabitat Dúplex Pulpí 100k" aparece dos veces el 11/05
  - Uno con guion largo (–) creado por el bot, otro con guion normal (-) probablemente creado antes manualmente
  - Fix: deduplicar al mostrar, o agregar validación al crear evento desde el bot (mismo título + mismo día = no crear)
- 🐛 Eventos del calendario no son editables desde WOS3 — solo se pueden ver, no modificar título/hora/descripción
  - Fix: agregar acción de editar evento desde la vista de detalle del calendario
- 🐛 Bot muestra tareas antiguas junto a las nuevas — la lista de agenda_tasks no filtra por estado ni fecha, acumula todo
  - Fix: mostrar solo tareas pendientes / de hoy en adelante, no el histórico completo
- ⚠️ Bot tarda mucho en responder a "avance de obra" — verificado que SÍ funciona y graba correctamente
  - El bot se quedó "escribiendo" ~1-2 min antes de responder
  - Ambas acciones (avance_reforma 80% + evento calendario) se grabaron correctamente
  - Probable causa: cold start de Vercel + Claude API en la misma request
  - A vigilar: si se repite con frecuencia, separar el handler de avance de obra para que sea más rápido

Próximas tareas acordadas (domingo 10/05/2026):

1. Revisar módulo Proyectos en WOS3: los números no coinciden con el área HASU
   - Objetivo: que toda la sección Proyectos esté supeditada a los movimientos de la tabla maestra de HASU
   - La tabla maestra de HASU es la fuente de verdad — WOS3 debe leerla y reflejarla, no calcular por su cuenta

2. Rediseño del Calendario — darle protagonismo real
   - Problema: el calendario está enterrado dentro de HASU, en una fila perdida sin visibilidad
   - Objetivo: moverlo a la página principal junto al bot, compartiendo pantalla en desktop
   - En mobile: pensar layout (tab propio, o sección expandible debajo del bot)
   - Además: los eventos no se pueden editar manualmente desde WOS3 — necesita edición inline
   - Eliminar evento duplicado del 11/05 ("Pasar oferta Servihabitat") antes de empezar

3. Sistema de @menciones en bitácora (como Trello)
   - Cada usuario tiene su @handle (ej: @pato, @silvia, @jl)
   - Cuando alguien escribe una nota en la bitácora de cualquier proyecto y menciona un @usuario, ese usuario recibe alerta por Telegram
   - La alerta incluye: proyecto, quién escribió, y el contenido de la nota
   - Sin esto las notas con preguntas quedan sin respuesta porque nadie se entera
   - Requiere: tabla de usuarios con chat_id de Telegram, parser de @menciones en bitácora, envío por bot

Bloqueos abiertos:
- OpenAI: sin créditos → Modo D (audio Telegram) bloqueado
- Idealista API: sin respuesta, usando web search como fallback

Pendiente técnico — @menciones:
- @silvia y @jl tienen chat_id = null en lib/telegram-mentions.ts
- Para activarlos: pedirles que escriban cualquier mensaje al bot de Telegram (ej: "hola")
- Luego buscar su chat_id en los logs de Vercel (campo `message.chat.id`) y actualizar TEAM_HANDLES en lib/telegram-mentions.ts
- Con eso queda el sistema completo de @menciones operativo

**Variables de entorno críticas (producción Vercel)**
- `TELEGRAM_BOT_TOKEN` — bot activo
- `TELEGRAM_CHAT_ID_PATO` — 5816771550 (añadida 09/05/2026)
- `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` — ya existían

---

## DIVISIÓN DE INTERFACES — regla fija

| Interfaz | Uso |
|----------|-----|
| **Bot Telegram** | SOLO escáner de oportunidades: pegar URL o describir inmueble → recibir números (precio máximo, ROI, comparables). Nada más. |
| **Chat WOS3** | TODO lo operativo: proyectos, bitácora, calendario, tareas, movimientos, radar, análisis, proveedores, inversores, etc. |

El Telegram es el escáner de campo (móvil, rápido). El WOS3 es el hub operativo de la empresa.

---

## FEATURES — estado actual

| Feature | Estado |
|---------|--------|
| Pipeline de operaciones | ✅ producción |
| Chat WOS3 — hub operativo completo | ✅ producción |
| Bot Telegram — escáner de oportunidades (URL → números) | ✅ producción |
| Análisis de inversión (ROI, comparables, escenarios) | ✅ producción |
| Imágenes en chat | ✅ producción |
| Bitácora via chat WOS3 | ✅ producción |
| ROI anualizado | ✅ producción |
| Morning Briefing automático (Telegram 8:00 AM) | ✅ producción |
| Chat WOS3: scraping multi-portal (Fotocasa, Solvia, Habitaclia…) | ✅ producción |
| Chat WOS3: calendario con invitados (Silvia, JL) | ✅ producción |
| Audio bot Telegram (Whisper) | ⏳ bloqueado — sin créditos OpenAI |
| Proyectos WOS3 alineado con tabla maestra HASU | ⏳ pendiente |
| @menciones en bitácora con alerta Telegram | ⏳ pendiente |
| Evaluador cambio de uso 🔴🟡🟢 | ⏳ pendiente |
| Evaluador tipología edificio | ⏳ pendiente |
| Módulo edificios / multivivienda | ⏳ pendiente |
| Portal inversor | ⏳ pendiente |
| Modal Mercado — Agregar igual a Editar (2 col, tipos, imagen, unidades) | ✅ producción |
| Desktop layout fix | ⏳ pendiente |
| Modal Mercado — rediseño landscape mobile (no pisa bottom nav) | ⏳ pendiente |
