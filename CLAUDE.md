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

**Última sesión — 13/07/2026**

Hecho:
- **Unificación del pipeline de análisis de inmuebles (Radar/Mercado)** — bot Telegram + chat WOS3 ahora comparten un único flujo sobre la tabla `inmuebles`, en vez de escribir en paralelo a las tablas legacy `inmuebles_radar` / `inmuebles_estudio` / `edificios_estudio`
  - Pipeline nuevo: `borrador → sin_analizar → en_estudio → ofertado → en_arras → comprado`
  - `lib/analizarInmueble.ts` (nuevo) — módulo único de análisis: comparables + semáforo unificado (verde ≥30%, amarillo 15-30%, rojo <15%)
  - `app/api/telegram/webhook/route.ts` y `app/api/chat/route.ts` — reescritos para analizar → insertar en `borrador` → confirmar (a `sin_analizar`) o descartar. Tools de radar/estudio/edificio consolidados sobre `inmuebles` (columna `tipologia`)
  - `/informe/radar/[id]` y `/informe/estudio/[id]` fusionados en `/informe/inmueble/[id]` (URLs viejas quedan como redirect)
  - `app/(app)/mercado/page.tsx` — pestaña "Sin analizar" renombrada a "Radar", sacado el filtro obsoleto que ocultaba resultados con `fuente ilike telegram%`, excluye estado `borrador`
  - **Punto de enchufe Fragua**: dejado listo en `lib/analizarInmueble.ts` pero **NO conectado — Fragua todavía NO está contratado**, Pato lo está evaluando/pidiendo demo (IA que scrapea Idealista, $40/mes). Cuando se contrate, se swapea la fuente de comparables ahí adentro
  - Commit `bf3eda6`, pusheado a `origin master` — ✅ deployado
- **Incidente de datos post-migración (resuelto)**: la migración inicial de las tablas legacy a `inmuebles` generó filas duplicadas exactas, porque el bot históricamente escribía en paralelo a `inmuebles` Y a las tablas legacy para el mismo evento. Se detectaron y limpiaron 61 duplicados exactos (dedup por `titulo`+`created_at`) + 6 registros adicionales ya descartados por Pato previamente (confirmados uno por uno). Estado final verificado: **3 inmuebles en Mercado fuera de `borrador`, todos en `en_estudio`** (tenían análisis completo con `gastos_json` y escenarios de venta):
  1. Castillo 3 - Cuevas del Almanzora — 44.000€
  2. Deuda Jacarandá – Los Gallardos — 73.000€
  3. Calle Alhóndiga - HO — 120.000€
  - Las tablas legacy (`inmuebles_radar`, `inmuebles_estudio`, `edificios_estudio`) NO se borraron todavía — quedan de respaldo hasta confirmar 2-3 ciclos estables en producción

Pendiente:
- Drop de las 3 tablas legacy una vez confirmado el flujo nuevo en producción por unas semanas
- Contratar Fragua (si Pato decide avanzar) y conectar la fuente de comparables en `lib/analizarInmueble.ts`

**Última sesión — 13/07/2026 (continuación)**

Hecho:
- **Mercado — solapas de estado + buscador** (`app/(app)/mercado/page.tsx`)
  - Nueva fila de solapas por estado del pipeline: `Todos · Sin analizar · En estudio · Ofertado · En arras · Comprado`, con contador por solapa y mismo color que el badge de cada card (`SUBESTADO_CFG`)
  - Buscador por título/dirección/ciudad (no existía ningún input de búsqueda antes)
  - Se combina con el filtro de tipología existente (pills) — los tres filtros son AND entre sí
  - Objetivo: que el módulo escale cuando pase de 3 a 100+ inmuebles sin volverse una búsqueda eterna en un grid plano
  - Commit `15296b2`, pusheado a `origin master` — ✅ deployado, build verificado antes del push
- **Limpieza DB — tabla `inmuebles`**: se detectaron 56 de 59 filas en estado `borrador`, generadas por bug del bot de Telegram (duplicados exactos, mensajes sueltos tipo `/start`, drafts de edificios nunca completados — Plaza Constitución, Calle Nueva, Paseo Alameda, ya identificados como duplicados de bug en la sesión del 06/06). Se confirmó con Pato que en Mercado solo existen 3 inmuebles reales (1 en_arras, 1 ofertado, 1 en_estudio) y se borraron los 56 `borrador` + sus 13 `inmueble_unidades` huérfanas asociadas
  - Tabla `proyectos` (9 filas) verificada e intacta — todo es historial real (Parcela MDQ, Chalet Las Dalias, San José, Estación, Herrera, Travesía, 19 de Octubre, Dúplex La Alfoquia, Proyecto Cervantes en `en_arras` = el "1 pendiente de cerrar"), nada se tocó ahí
  - Estado final verificado: `inmuebles` = 3 filas (en_arras, ofertado, en_estudio), `proyectos` = 9 filas sin cambios

Pendiente:
- Revisar si hay más data huérfana/sin uso en otras tablas (edificios, tareas, movimientos) — ofrecido, no ejecutado todavía
- Drop de las 3 tablas legacy (`inmuebles_radar`, `inmuebles_estudio`, `edificios_estudio`) — sigue pendiente de la sesión anterior
- Contratar Fragua y conectar comparables — sigue pendiente

**Última sesión — 12/07/2026**

Hecho:
- **Cierre operación Olula (Proyecto San José, OP-007)** — vendida en 69.000€, firma exitosa el 1/7/2026. PATCH directo en Supabase: `estado='vendido'`, `precio_venta_real=69000`, `fecha_salida_estimada='2026-07-01'`
- **Mercado — fix edición de unidades en edificios** (`app/(app)/mercado/page.tsx`)
  - Bug: dentro del modal "Editar inmueble", las unidades de un edificio solo se podían eliminar, no editar
  - Fix: botón ✏️ por unidad abre formulario inline (tipo, planta, m², ocupación, renta, precio venta est., reforma est., notas) con Guardar/Cancelar, además del ✕ de eliminar que ya existía
  - Commit `27c2336`
- **Nuevo estado `patrimonial`** — para activos en alquiler, fuera del funnel de venta (Radar→...→Vendida)
  - Chalet Las Dalias (OP-002) reclasificado de `reforma` a `patrimonial` (no está a la venta, se renta)
  - Agregado a `proyectos/page.tsx` (nueva sección "Patrimonio" en el pipeline visual), `proyectos/[id]/page.tsx` y `hasu/page.tsx` (`ESTADO_LABEL`/`ESTADO_COLOR`)
  - `ESTADOS_ACTIVOS`/`EN_CURSO` y `ESTADOS_VENDIDOS`/`VENDIDOS` excluyen `patrimonial` a propósito — no cuenta como operación activa de venta ni sube al objetivo 1M€
  - Commit `57db773`
- **HASU — pestaña y sub-planilla "Patrimonio"** (`app/(app)/hasu/page.tsx`)
  - Nueva pestaña en la tabla OPERACIONES (`Todos · En curso · Patrimonio · Finalizados`) que filtra por `estado='patrimonial'`
  - Al seleccionar "Patrimonio" la tabla cambia de columnas: en vez de P.Venta/Benef/ROI (no aplican a un activo que no se vende) muestra **P. Compra · Renta Neta · Rentabilidad Anual · Antigüedad · Acumulado · Estado**
  - `Rentabilidad Anual` = renta neta mensual × 12 / precio de compra
  - `Acumulado` = renta neta mensual × meses desde `fecha_inicio_alquiler` (no desde `fecha_compra` — son fechas distintas, ej. Chalet Las Dalias se compró en 2010 pero se alquila hace 36 meses)
  - Columnas nuevas en Supabase `proyectos`: `renta_mensual` (bruta), `renta_neta_mensual`, `fecha_inicio_alquiler`
  - Datos cargados: Chalet Las Dalias — renta neta 350€/mes, alquilado desde hace 36 meses. Dúplex La Alfoquia (alta nueva, OP-009) — 70.000€, renta neta 650€/mes, alquilado desde hace 24 meses
  - Commits `19043b2`, `41f7d27`, `facda77`, `a0afb30`
- **Regla de trabajo fijada**: nunca correr servidor local ni auto-loguearse para probar la UI — Pato siempre prueba en el deploy de Vercel. Flujo: editar → `next build` → commit → push. Ver `feedback_coding.md`

Pendiente:
- Ninguno abierto de esta sesión

**Última sesión — 23/06/2026**

Hecho:
- **Bot Nichiren SGI — creado desde cero** (`/Users/patofavora/Documents/W3/nichiren-bot`)
  - Repo separado de WOS3, deployado en `nichiren-bot.vercel.app`
  - Bot Telegram: `@Nichiren_sgi_bot` (token: `8514936097:AAF-KNYJ4xFC68cpjXXWxjNeS2ZyxhOtRAo`)
  - Webhook: `https://nichiren-bot.vercel.app/api/webhook?secret=nichiren-secret-2026`
  - Commit inicial: `6a38c19`, RAG commit: `3f53fe0`

- **Stack del bot Nichiren**
  - Runtime: Vercel Functions (`@vercel/node`) + TypeScript
  - LLM: Claude Sonnet (`claude-sonnet-4-5`) via Anthropic SDK
  - Embeddings: Voyage AI (`voyage-3`, 1024 dims) — key en Vercel env
  - DB: Supabase `mxdesbiyjvdnpehklwcb` — tablas `nichiren_gosho` + `nichiren_conversaciones`
  - Búsqueda: pgvector semántica (función `buscar_gosho_semantico`) + fallback full-text

- **Base de conocimiento cargada (1.776 fragmentos)**
  - Gosho WND vol.1 de Nichiren: 419 fragmentos (122 con embedding)
  - Ikeda — "La sabiduría para crear la felicidad y la paz" (sokaglobal.org): 479 fragmentos
  - Ikeda — "Develando los misterios del nacimiento y la muerte" (PDF): 102 fragmentos
  - 537 fragmentos con búsqueda semántica real, 1.239 con fallback texto

- **Personalidad del bot**
  - Voz de Daisaku Ikeda: serena, profunda, formal, nunca informal
  - Estructura: refleja situación → cita Gosho real → explica → pregunta reflexiva
  - Solo usa citas verificadas del Gosho (nunca inventa)
  - Comandos: `/start`, `/reset`, `/nam`
  - Solo responde a Pato (TELEGRAM_CHAT_ID_PATO = 5816771550)

- **Pendiente bot Nichiren**
  - Gosho WND vol.2 no scrapeado todavía
  - 297 fragmentos del Gosho sin embedding (rate limit Voyage sin tarjeta)
  - Solución: agregar tarjeta en dashboard.voyageai.com (gratuito igual) → rate limit sube de 3 RPM a 300+ RPM → rerun scrapers en ~15 min
  - Scripts listos: `scrape-gosho.ts`, `ingest-ikeda.ts`, `scrape-soka-wisdom.ts`

**Última sesión — 08/06/2026**

Hecho:
- **Proyectos — limpieza de secciones**
  - Quitado "Objetivo 1.000.000 €" con barra de progreso
  - Quitada sección "PROYECTOS VENDIDOS" con todas sus cards
  - Commit: `36ebbed`
- **HASU — KPIs rediseñados**
  - Agregado "Resultado Operativo" (antes EBITDA): `Σ (precio_venta_real − valor_total_operacion)` todas las ops con venta real
  - Quitado "Faltan para 1M€"
  - Quitado "Inversores JV"
  - Agregado "Duración Media" en meses (promedio de operaciones)
  - Parcela MDQ fijada a 6 meses en el cálculo del promedio (tipo='Parcela' → 6m fijo)
  - Grid final: 4 KPIs — Beneficio HASU · Resultado Operativo · ROI Medio · Duración Media
  - Commits: `cc2214a`, `f460d64`, `d39be56`, `0f06796`, `12c5436`, `3bc4a69`
- **Login unificado — fondo crema, sin logo W naranja**
  - Un solo `/login` con toggle "WOS" / "Portal Inversor" — fondo `#F2F1ED` unificado
  - WOS → redirige a `/proyectos`, Portal Inversor → redirige a `/inversor/portal`
  - Toggle: activo naranja `#F26E1F`, inactivo texto `#111` sobre `#E8E6E0` (legible)
  - Sin íconos emoji en botones del toggle
  - Labels de campos en `#888` sobre blanco (contraste correcto)
  - Footer "Berciamedia" eliminado
  - `/inversor` redirige automáticamente a `/login`
  - Commits: `b0f1ca2`, `858d579`, `4c026b7`, `26caeee`
- **Dominio wos.wallest.pro — ✅ activo** (09/06/2026)
  - CNAME `wos` → `c1507012a5757589.vercel-dns-017.com` en Hostinger, TTL 300
  - Vercel: tilde azul, SSL activo, sirviendo WOS3 en producción
- **Limpieza Vercel — proyectos eliminados**
  - Eliminados: `wallest-operating-system`, `aurea-scanner`, `hardcore-ardinghelli-04354c`
  - Quedan: `wos3`, `mesa-juntas`, `planificador-diario` (Silvia)
- **Heroes de páginas — overlay naranja estilo portal inversor**
  - Proyectos, HASU y Mercado: overlay cambió de degradado negro oscuro a `linear-gradient(135deg, rgba(232,98,26,0.82) → rgba(201,169,110,0.70))` — mismo que portal inversor
  - Commit: `e26d8f0`
- **Heroes — card redondeada estilo portal inversor**
  - Los 3 heroes ahora son cards con `borderRadius: 20`, `height: 160px`, `padding: 20px` lateral — flotan sobre el fondo en lugar de sangrar al borde
  - Botón "Nuevo/Agregar" con glass effect (`rgba(255,255,255,0.2)` + `backdropFilter: blur(8px)`) en lugar de naranja sólido
  - Commit: `186aa5a`
- **Sidebar rail mode — iconos visibles al contraer**
  - Sidebar colapsada: 56px de ancho (antes 0) con los 3 iconos centrados a 22px
  - Toggle integrado dentro del área del logo (no fixed superpuesto que pisaba la W)
  - Expandido: botón `‹` a la derecha de "WALLEST"
  - Contraído: monograma `W` naranja clickeable con flecha `›` debajo
  - Avatar del usuario visible en rail, sin nombre/email
  - Commits: `518ac53`, `186aa5a`

**Última sesión — 07/06/2026 (continuación 2)**

Hecho:
- **Imagen de portada en proyectos**
  - SQL: `ALTER TABLE proyectos ADD COLUMN imagen_portada TEXT` (ejecutado vía MCP)
  - `proyectos/page.tsx`: botón 📷 en cards activos y vendidos → sube a bucket `portadas` (Supabase Storage, upsert), guarda URL en `proyectos.imagen_portada`
  - Cuando hay imagen: franja 110px con degradado overlay + botón 📷 para cambiar
  - Cuando no hay imagen: label sutil "📷 Agregar portada"
  - `portal/page.tsx`: hero usa `imagen_portada` como fondo con overlay naranja translúcido para legibilidad; fallback a degradado naranja si no hay imagen
  - Fix caché PostgREST: fetch separado de `imagen_portada` para evitar que el schema cache stale lo omita del join `proyectos(*)`
  - Fix CSS: style object separado (ternario) para evitar conflicto entre `backgroundImage` y `background`
  - Commits: `538080a`, `f01fc99`

**Última sesión — 07/06/2026 (continuación)**

Hecho:
- **Portal inversor — layout desktop**
  - Grid 2 columnas: contenido principal izquierda + sidebar sticky derecha
  - `max-w-[1400px]` para aprovechar pantallas anchas
  - Sidebar sticky corregido: `sticky` en el div contenedor del grid, no en el card interior
  - Commit: `46cb542`
- **Portal inversor — rediseño con gráficos (recharts)**
  - Instalado `recharts`
  - Tab Resumen: torta (composición capital: tu aportación vs socio HASU) + barras (inversión vs retorno)
  - Tab Movimientos: barras por mes (flujo mensual en verde/rojo) + tabla detallada con 3 KPIs
  - Hero con degradado naranja→arena, KPIs en 3 columnas divididas
  - Resultado final vendido: precio venta izquierda / beneficio derecha en grande
  - Sidebar: progreso con conectores + resumen financiero completo (6 líneas)
  - Paleta: ORANGE `#E8621A`, GREEN `#2D7A4F`, SAND `#C9A96E`, BG `#F5F3EF`
  - Commits: `d651886`, `085ad41`
- **Portal inversor — sección gestor**
  - Muestra "Hasu Activos Inmobiliarios SL" con email patricio@wallest.pro como link
  - Etiqueta "Gestionado por" para que JL entienda que es el contacto, no su perfil
  - Commits: `9409312`, `55b9038`

**Stack gráficos portal inversor**
- Librería: `recharts` (instalada en wos3)
- PieChart con innerRadius (donut) para composición capital
- BarChart con Cell por color para inversión/retorno y flujo mensual

**Última sesión — 07/06/2026**

Hecho:
- **Portal inversor — fixes de acceso**
  - Bug: lookup de rol y de inversor por `user_id` fallaba cuando el UUID en `inversores`/`user_roles` no coincidía con el auth session
  - Fix: fallback por `email` cuando `user_id` no matchea (tanto en `user_roles` como en `inversores`)
  - Commits: `2749a71`, `4949c86`
- **Portal inversor — números correctos**
  - Bug: mostraba `retorno_estimado` y `roi` guardados en `proyecto_inversores` (valores pre-venta)
  - Fix: cuando `precio_venta_real > 0`, calcula retorno e ROI reales desde los datos del proyecto
  - "19 de Octubre": ahora muestra 28.000€ retorno real y 80% ROI (antes 18k / 50%)
  - Commit: `28c1faa`
- **Portal inversor — tema visual WOS3**
  - Reescritura completa de `/app/inversor/page.tsx` y `/app/inversor/portal/page.tsx`
  - Fondo `#F2F1ED`, cards blancas, texto `#111`, bordes `#ECEAE4`, acento `#F26E1F`
  - Mismo sistema de diseño que WOS3 (cards con sombra, tabs, inputs)
  - Commit: `d1a26f6`
- **Portal inversor — estado vendido**
  - Bug: `vendido` no estaba en `ESTADO_STEP` → todos los pasos aparecían en gris
  - Fix: `vendido: 5` → todos los pasos en verde ✓
  - Card "Avance" reemplazada por "✓ Listo / Completado" en verde cuando vendido
  - Barra de progreso oculta cuando vendido (ya estaba implementado)
  - Commit: `403797d`

**Portal inversor — arquitectura**
- URL: `wos3.vercel.app/inversor` (login) y `wos3.vercel.app/inversor/portal` (dashboard)
- NO es un proyecto Vercel separado — vive dentro del repo wos3
- Para dar de alta un inversor: `/admin` → "+ Invitar" → email + rol Inversor → Supabase envía email de activación automáticamente (`inviteUserByEmail`)
- El inversor crea su contraseña desde el email y entra con ella
- Datos en tiempo real via Supabase Realtime (suscripciones a `proyectos`, `movimientos`, `bitacora`)
- Cálculo: cuando `precio_venta_real > 0` usa datos reales; si no, usa escenarios estimados

**Última sesión — 06/06/2026**

Hecho:
- **Módulo Edificios (`/app/(app)/edificios/page.tsx`) — fixes críticos**
  - Bug principal: early-return antes de los modales hacía que edit/unidades/calculadora no montaran → todos los botones rotos excepto eliminar. Fix: single return con ternario, modales siempre montados fuera del ternario (commit 879409f)
  - Calculadora ROI desde detalle ya no cierra la vista (commit f4a5d4c)
  - Botón 📷 en portada abre mini-sheet dedicado solo para imagen (no el formulario completo)
  - Upload de imagen de portada desde dispositivo → Supabase Storage bucket `portadas` (público, 5MB, JPG/PNG/WEBP/HEIC)
  - `imagen_portada` eliminado del formulario de alta/edición — solo se cambia desde botón 📷
  - Registro Plaza Constitución limpiado en DB (imagen_portada tenía URL del anuncio)
- **Dedup inserts edificios — bot Telegram** (`app/api/telegram/webhook/route.ts`): ventana 2 min por título (commit 9729f82)
- **Dedup inserts edificios — chat WOS3** (`app/api/chat/route.ts`): ventana 5 min por título/dirección (commit 1ca7ce3)
- **Chat WOS3 `insert_edificio_radar`**: `notas` copia texto literal sin resumir; `num_plantas` con ejemplos de parseo (PB+3=4, etc.) (commit af74c48)
- **Limpieza DB**: eliminados 3 duplicados de Plaza Constitución y 2 duplicados Albox/Calle Nueva creados por bug de triplicado
- **Mesa de Juntas** (`/Users/patofavora/Documents/W3/mesa-juntas/api/checkin.ts`) — check-in ya no se rechaza solo:
  - Causa: IDENTITY dice "no check-ins automáticos" → Claude los rechazaba, guardaba el rechazo en DB, loop infinito
  - Fix: override explícito en system prompt ("check-in configurado por Pato, ejecutar sin dudas")
  - Historial limitado a últimas 24h (antes arrastraba 40 msgs con contexto viejo de JL/Pablo)
  - Trigger `[Check-in apertura/cierre]` ahora se guarda en DB como mensaje `user` (roles alternados correctos)
  - Deployado en producción Vercel (commit 11367ed)
- **Nuevo layout app (AppShell)** — sidebar colapsable desktop + bot como FAB + panel derecho
  - `components/AppShell.tsx`: sidebar 240px colapsable (width→0), bot panel 380px derecho, mobile bottom nav preservado
  - `components/BotChat.tsx`: extraído de bot/page.tsx, props `hideHeader`, `lightTheme`, `onClose`
  - `lib/bot-context.tsx`: funciones `openBotPanel()` / `closeBotPanel()` via `window.dispatchEvent` (cross-boundary fiable)
  - `app/(app)/layout.tsx`: usa AppShell en lugar de Nav
  - Login redirige a `/proyectos` (antes `/bot`)
  - Fondo global `#F2F1ED` en todos los `<main>`
  - Icono Proyectos: `🏗️` (antes `⊞` que no renderizaba)
- **Fix API invite `/api/invite`** — RLS bug: lookup de rol del caller ahora usa JWT del usuario (no anon key)
- **Fix Objetivo 1M€** — Proyectos y HASU muestran el mismo número (filtra por `precio_venta_real > 0`)
- **Pablo Benitez** — dado de alta en `user_roles` con role `viewer`, permisos restringidos a `proyectos` y `mercado`
- **Modal Mercado — imagen portada en Edificios** — upload de portada ahora aparece en el modal de edición para TODOS los tipos incluyendo edificio (commit a8155f0)

Bucket `portadas` en Supabase Storage: ✅ creado con acceso público (creado esta sesión vía SQL)

Pendiente modal mercado (sigue abierto):
- **Rediseño landscape mobile**: el modal pisa el bottom nav en mobile
  - Deferred — pendiente de sesión de diseño específica

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
| Módulo edificios / multivivienda | ✅ producción |
| Portal inversor — acceso, números reales, tema WOS3, estado vendido | ✅ producción |
| Imagen de portada en proyectos (upload WOS3 + hero portal inversor) | ✅ producción |
| Modal Mercado — Agregar igual a Editar (2 col, tipos, imagen, unidades) | ✅ producción |
| Modal Mercado — imagen portada en Edificios (edit modal) | ✅ producción |
| AppShell — sidebar colapsable + bot FAB + panel derecho | ✅ producción |
| Desktop layout fix | ✅ producción |
| Modal Mercado — rediseño landscape mobile (no pisa bottom nav) | ⏳ pendiente |
| Módulo edificios — detalle, botones, upload imagen portada | ✅ producción |
| Dedup inserts edificios (bot Telegram + chat WOS3) | ✅ producción |
| Mesa de Juntas — check-in sin rechazo, historial 24h | ✅ producción |
| Fix API invite — RLS con JWT de caller | ✅ producción |
| Fix Objetivo 1M€ — Proyectos = HASU | ✅ producción |
| Mercado — solapas por estado (pipeline) + buscador título/dirección/ciudad | ✅ producción |
| Limpieza DB — 56 filas `borrador` huérfanas eliminadas de `inmuebles` | ✅ hecho 13/07/2026 |
| Mercado — edición inline de unidades en edificios (antes solo se podían borrar) | ✅ producción |
| Estado `patrimonial` — activos en alquiler fuera del funnel de venta | ✅ producción |
| HASU — pestaña Patrimonio + Renta Neta/Rentabilidad Anual/Acumulado | ✅ producción |
| Unificación pipeline análisis inmuebles (Radar/Mercado) sobre tabla `inmuebles` | ✅ producción |
| Fragua (IA scraping Idealista) — punto de enchufe listo, NO contratado | ⏳ pendiente |
