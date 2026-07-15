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

**Última sesión — 15/07/2026 (continuación — chat WOS3: PDFs + modo análisis libre)**

Hecho:
- Pato mostró un informe de normativa/habitabilidad que había generado en un chat de Claude aparte (no en WOS3) — motivo: "el bot se queda a medias, algunas cosas las hago en un lugar otras en otro" y necesita "literalmente un chat de Claude" dentro de WOS3
- Diagnóstico de por qué el chat de WOS3 no daba ese nivel: (1) el input de adjuntos solo aceptaba imágenes y HTML/texto, nunca PDF — no podía compartir el plano; (2) `max_tokens: 1024` en las dos llamadas a la API de chat — techo bajo que hubiera truncado cualquier análisis largo; (3) el system prompt empuja fuerte a respuestas cortas y tool calls ("máximo 3 párrafos"), sin permiso para razonar en profundidad sobre algo sin tool asociada
- Fix en `components/BotChat.tsx`: soporte de adjuntar PDF (nuevo tipo `AttachedPdf`, chip 📕, se manda como `body.pdfs` en base64)
- Fix en `app/api/chat/route.ts`: bloque de contenido `type: 'document'` (Claude lee PDF nativo, sin OCR propio) inyectado junto a imágenes en el último mensaje de usuario; `max_tokens` subido de 1024 a 4096 en ambas llamadas; nueva sección de prompt "MODO ANÁLISIS LIBRE" — si el pedido no encaja en ninguna tool, no forzarlo ni rechazarlo, responder en profundidad sin el límite de 3 párrafos, igual que cualquier otra conversación de Claude
- Las tools operativas existentes (insert_radar, analizar_inmueble, etc.) siguen intactas para el uso diario rápido — esto solo agrega el modo libre como fallback cuando no hay tool que aplique
- Build + `tsc --noEmit` verificados (mismos 2 errores preexistentes sin relación). Commit `7df4188`, pusheado a `origin master`

Pendiente:
- Falta que Pato pruebe adjuntando un PDF real (ej. el anteproyecto de Castillo 3) y confirme que el análisis libre funciona bien
- Quedó mencionado en el prompt un tool `generar_informe_personalizado` como gancho a futuro (para guardar el análisis libre linkeado a un proyecto/inmueble con el diseño correcto) pero NO se implementó — si el modo análisis libre funciona bien en texto, evaluar si vale la pena construir esa persistencia o alcanza con la respuesta en el chat

**Última sesión — 15/07/2026 (continuación — fijar inmuebles en Mercado)**

Hecho:
- Con Radar empezando a recibir varios leads por día (Antas fue el primer caso real), Pato notó que el orden por fecha de creación descendente hacía que cada lead nuevo empujara hacia abajo las 3 operaciones importantes (en_arras, en_estudio). Pidió algo tipo "fijar post" de Instagram pero sin el límite de 3
- `app/(app)/mercado/page.tsx`: botón 📌 nuevo en cada card (junto a ✎/🗑) para fijar/desfijar sin límite de cantidad. Orden final: fijados primero (más recién fijado arriba dentro del grupo), el resto del más viejo al más nuevo — así lo nuevo entra abajo de la lista, no al principio. Badge "📌 Fijado" visible en la card para reconocerlos de un vistazo. Es manual/discrecional (como Instagram) — no automático por estado
- Columnas nuevas en Supabase `inmuebles`: `fijado` (bool, default false), `fijado_en` (timestamptz)
- Build verificado, commit `97499bc`, pusheado a `origin master`

Pendiente:
- Ninguno abierto de esta sub-sesión

**Última sesión — 15/07/2026 (continuación — bug: el bot afirmaba confirmaciones que nunca ejecutó)**

Hecho:
- Pato siguió probando el caso de Antas y detectó algo raro: el bot dijo "Perfecto, está en el Radar con los bloqueantes marcados 👍" pero cuando fue a buscarlo en la pestaña Mercado no aparecía. Verifiqué en Supabase: el registro seguía en `estado='borrador'` — **el bot nunca llamó `confirmar_alta_mercado`**, solo narró el resultado como si lo hubiera hecho (alucinación conversacional, probablemente al interpretar la respuesta ambigua de Pato — "nono, no lo habia visto ok" — como una confirmación implícita)
- Encima, al preguntarle por qué no lo veía, el bot inventó una segunda excusa falsa: sugirió que podía estar en una sección separada "Radar de Edificios" — esa sección no existe desde la unificación del pipeline del 13/07 (edificios viven en la misma tabla/pantalla que los pisos). La causa raíz: varias descripciones de herramientas (`insert_edificio_radar`, `update_edificio`, `delete_edificio`, `mover_edificio_a_estudio`) seguían usando la frase legacy "radar de edificios" como si fuera un lugar aparte, alimentando la alucinación
- Fix en `app/api/chat/route.ts`: limpiadas esas 4 descripciones, agregada regla #8 explícita ("nunca afirmes que algo se confirmó sin haber recibido el resultado de la herramienta en este mismo turno; ante respuesta ambigua, pedí sí/no explícito"), y aclarado en el bloque EDIFICIOS del prompt que no existe sección separada — si algo no aparece en Mercado, la causa casi siempre es que sigue en `borrador`
- Arreglé el registro de Antas a mano en Supabase (`estado='sin_analizar'`) para desbloquear a Pato — ya debería verse en la pestaña Radar de Mercado
- Build verificado, commit `f38380d`, pusheado a `origin master`

Pendiente:
- Falta que Pato confirme que ahora sí ve el edificio de Antas en Mercado, y que pruebe de nuevo el flujo completo con un caso nuevo para validar que el bot ya no narra confirmaciones falsas

**Última sesión — 15/07/2026 (continuación — checklist: Radar vs En Estudio)**

Hecho:
- Probé en vivo el caso real de Antas por el chat WOS3: funcionó — `insert_edificio_radar` se disparó (tipologia='edificio', no cayó en insert_radar), `checklist_documentacion.items` quedó con las 4 alertas exactas (`nota_simple`, `licencia_primera_ocupacion`, `licencia_final_obra`, `sin_posesion`), y el gate mostró "8 sin resolver" (4 confirmadas + 4 bloqueantes nunca mencionados, correcto) preguntando antes de dar de alta. Verificado directo en Supabase
- Pato notó una inconsistencia semántica al revisarlo: la sub-sesión anterior había decidido que si el checklist ya estaba cargado, `confirmar_alta_mercado` aterrizaba directo en **En Estudio** en vez de Radar — pero "En Estudio" implica que ya se hizo el análisis, y acá puede no haber ni ROI calculado (como Antas, que no tiene precio de venta ni reforma todavía)
- Corrección del modelo con Pato: **Radar es el buzón rápido de entrada** (sube varios por día, tiene que ser liviano) — el checklist se carga y se ve ahí mismo, con alertas y todo. **Pasar a En Estudio es siempre una decisión manual posterior**, nunca automática por tener el checklist marcado. Revertido: `confirmar_alta_mercado` vuelve a aterrizar siempre en `sin_analizar` (Radar)
- El badge de alertas del checklist (🔴 alertas / ⚠ por verificar) en la card de la lista de Mercado (`app/(app)/mercado/page.tsx`) ahora también se muestra en la pestaña Radar, no solo En Estudio/Ofertado/En Arras — antes quedaba invisible ahí, que es justo donde más falta hacía verlo
- Build verificado, commit `574b90b`, pusheado a `origin master`

Pendiente:
- Ninguno abierto de esta sub-sesión

**Última sesión — 15/07/2026 (continuación — fix de contraste en burbuja de chat)**

Hecho:
- Pato mandó captura: la burbuja de mensaje enviado en `BotChat.tsx` seguía en bronce (`#A6855A`) + texto oscuro (`#14110C`) — quedó afuera de la pasada de contraste de la sesión anterior porque esa pasada cubrió botones/CTAs y no las burbujas de mensaje. Es la misma superficie grande de la regla ya fijada (bronce+oscuro solo para UI chica). Fix: `background: '#14110C', color: '#F8F3E9'` en la burbuja de usuario (línea ~373). Barrido rápido confirmó que el resto de usos de bronce+oscuro en la app son badges/botones chicos, no superficies grandes — no hay más pendientes de este tipo
- Build verificado, commit `85a9239`, pusheado a `origin master`

Pendiente:
- Ninguno abierto de esta sub-sesión

**Última sesión — 15/07/2026 (continuación — checklist de documentación en el preanálisis del chat)**

Hecho:
- Pato aclaró que el pedido anterior (checklist en Mercado) no era para que yo analice un caso puntual manualmente, sino para debatir cómo el WOS hace esa misma lectura automáticamente en el chat, en el momento del preanálisis (el paso que decide si un inmueble pasa a Mercado o se descarta)
- Diagnóstico: `lib/analizarInmueble.ts` + los tools `analizar_inmueble`/`insert_edificio_radar` en `app/api/chat/route.ts` solo hacían ROI + comparables — el checklist de la sesión anterior vivía únicamente en la ficha de Mercado, invisible para el chat
- Decisión con Pato (2 preguntas): (1) mismo criterio de 3 capas que "Comprado →" — alerta visual + freno + confirmación explícita antes de dar de alta; (2) en casos sin precio de venta/reforma (como el ejemplo real de un edificio en Antas: 6 viviendas, nota simple parcial, sin LPO, sin final de obra, sin posesión por estar adjudicado a un fondo con lanzamiento pendiente), igual se da de alta en Mercado como **En Estudio** con el checklist marcado y los números pendientes de completar
- Implementado en `app/api/chat/route.ts`:
  - Tools `analizar_inmueble` e `insert_edificio_radar` ahora aceptan `checklist_alertas`/`checklist_ok` (arrays de claves, `enum` restringido a las 13 claves de `lib/checklist-documentacion.ts` — misma fuente de verdad que la UI, sin segundo modelo de datos)
  - Nuevos helpers `buildChecklistDoc()` y `checklistResumenTexto()` — arman el `checklist_documentacion` a insertar y el bloque de texto (🔴 alertas / 🔒 bloqueantes) que se muestra en la respuesta del chat, reusando `getBloqueantesPendientes`/`getAlertasConfirmadas` de la lib compartida
  - Si hay bloqueantes sin resolver, la respuesta de la herramienta ya trae la pregunta explícita ("¿lo paso a En Estudio igual o lo descarto?") — el system prompt instruye a Claude a NO llamar `confirmar_alta_mercado` por su cuenta en ese caso, sino mostrar el resumen tal cual (regla de respuesta #7 ampliada) y esperar confirmación
  - `confirmar_alta_mercado`: si el borrador tiene `checklist_documentacion.items` cargado (o sea, ya se hizo la revisión), aterriza directo en `en_estudio` en vez de `sin_analizar` (Radar) — el checklist ya es trabajo de estudio, no de triage liviano
  - Nueva instrucción en el system prompt explicando cómo mapear menciones de texto libre a las claves del checklist, sin inventar ítems no mencionados
  - **Bug preexistente detectado y corregido de paso**: el prompt instruía usar una herramienta `insert_estudio` que nunca existió (dead reference, probablemente resto de la unificación del pipeline del 13/07) — reemplazado por `analizar_inmueble` en las 2 menciones
  - Build + `tsc --noEmit` verificados (2 errores preexistentes sin relación, confirmados con `git stash` antes/después). Commit `3e9efc8`, pusheado a `origin master`

Pendiente:
- Ninguno abierto de esta sub-sesión — falta que Pato pruebe el flujo con un caso real por chat (ej. el edificio de Antas) y confirme si la detección de menciones funciona bien o si el prompt necesita ajuste

**Última sesión — 15/07/2026 (Mercado: checklist de documentación/alertas)**

Hecho:
- **Checklist de documentación en la ficha de análisis de Mercado** — Pato reportó que una operación se complicó porque no se tuvieron en cuenta algunos documentos antes de comprar (faltaba un checklist de alertas tipo obra nueva en construcción, sin posesión, LPO, licencia de final de obra, vandalizado, okupado, nota simple, ITE)
  - `lib/checklist-documentacion.ts` (nuevo) — 13 ítems canónicos, cada uno marcado `bloqueante: true/false`: bloqueantes = Nota simple, Licencia de primera ocupación, Licencia de final de obra, Cédula de habitabilidad, Cargas registrales/servidumbres, Sin posesión, Okupado, ITE. Informativos (no bloquean) = Obra nueva en construcción, Vandalizado, Certificado energético, IBI al día, Deuda de comunidad
  - Nueva sección "📋 Checklist de documentación" dentro de la ficha de análisis (`app/(app)/mercado/page.tsx`, modal "Editar análisis"), debajo de la card JV/Gestor: cada ítem con 3 estados (OK / Alerta / N/A, default pendiente) + nota de texto libre si se marca Alerta
  - Badge en la card del pipeline (visible en En estudio/Ofertado/En arras): 🔴 N alertas si hay ítems marcados Alerta, ⚠ N por verificar si hay bloqueantes sin resolver (ni OK ni N/A)
  - **Gating en el botón "Comprado →"**: si quedan ítems bloqueantes sin resolver, el paso de confirmación muestra la lista + exige tildar "Confirmo que avanzo igual aunque falten estos puntos" antes de habilitar "✓ Confirmar" — no impide comprar (decisión de negocio de Pato), pero no deja que pase desapercibido. Si se avanza con el override, queda registrado en `checklist_documentacion.overrideNota`/`overrideAt`
  - Columna nueva en Supabase `inmuebles`: `checklist_documentacion` (jsonb, default `{}`)
  - Build verificado, commit `8e310ff`, pusheado a `origin master`

Pendiente:
- Ninguno abierto de esta sesión — falta que Pato lo pruebe en el deploy de Vercel y confirme si la lista de 13 ítems es suficiente o si hay que sumar más (ej. algo específico del caso que se complicó)

**Última sesión — 14/07/2026 (continuación — corrección de contraste/tipografía + fichas de Deuda)**

Hecho:
- **Corrección de contraste en botones grandes** — feedback explícito de Pato tras ver el deploy: "tipografia oscura sobre oscuro" en CTAs grandes (ej. "Guardar cambios" en modal de Mercado). Causa: bronce (`#A6855A`) + texto oscuro (`#14110C`) pasa WCAG AA formal (~5.48:1) pero dos tonos cálidos análogos leen como poco contraste al ojo humano en superficies grandes
  - Regla dividida por prominencia: **CTAs grandes/primarios** → fill ink (`#14110C`) + texto cream (`#F8F3E9`); **UI chica de soporte** (badges/chips/tabs/avatars/botones "+ X" que solo abren modales) → se mantiene bronce + texto oscuro, que sí lee bien a esa escala y es la convención propia del design system
  - ~30 botones corregidos en `proyectos/[id]/page.tsx`, `proyectos/page.tsx`, `mercado/page.tsx` (incluido el botón exacto del screenshot), `admin/page.tsx`, `hasu/flujo-caja`, `hasu/proveedores`, `hasu/calendario`, `liquidacion/[id]`, `reporte/[id]`, `informe/inmueble/[id]`, `login/page.tsx`, `DeudaImportWizard.tsx`, `BotChat.tsx`
- **Piso mínimo de tamaño de fuente subido en toda la app** — feedback: "la letra en todo el WOS es algo pequeña". Script mecánico (regex, no agente) sobre `fontSize: N` inline y clases `text-[Npx]`, mapeo `{7→10, 8→10, 9→11, 10→12, 11→12, 12→13, 13→14}`. 23 archivos, 763 coincidencias. Las clases semánticas Tailwind `text-xs`/`text-sm` NO se tocaron (368 usos combinados) — deliberado, fuera de alcance de esta pasada
  - Commit `9f9d77b`, pusheado a `origin master`, build verificado (39/39 páginas)
- **Área Deuda — fichas de detalle con campos que faltaban**: Pato mandó capturas de FENCIA (plataforma que vende deuda/NPL) mostrando el estándar de la industria — estado judicial, titular de la deuda, referencia catastral, valoración, etc. En WOS3 esos datos SÍ se guardaban en `deuda_posiciones` (el import ya los persistía) pero la UI nunca los renderizaba
  - `components/DeudaListado.tsx` reescrito: card de contrato (grid) ahora muestra badge de estado judicial + titular de la deuda + footer con labels explícitos ("Asking price" / "Deuda OB" en vez de solo el número); modal de detalle por posición rediseñado como ficha de 3 bloques al estilo FENCIA — **Colateral** (tipo/subtipo, referencia catastral, nº registro, CCAA, provincia, ciudad, código postal), **Deuda** (titular, contract ID, nº préstamos, cargas previas/posteriores, broker), **Estado judicial** (normalizado + texto original del broker, ratio cargas/precio) — más 4 KPIs destacados arriba (Deuda OB / Deuda total / Asking price / Descuento)
  - Commit `fd77cc9`, pusheado a `origin master`, build verificado

Pendiente:
- Ninguno abierto de esta sub-sesión — falta que Pato revise en el deploy de Vercel (regla fija: nunca correr servidor local)

**Última sesión — 14/07/2026 (continuación 2 — Deuda: mapa + imagen por posición)**

Hecho:
- Pato pidió mapa con pines (como referencia FENCIA) y espacio para subir imagen del inmueble (como Mercado). El mapa venía **bloqueado** desde sesiones anteriores por falta de una API key de Google Maps — se destrabó usando **OpenStreetMap + Leaflet**, gratis y sin key, en vez de esperar la key de Google (decisión confirmada con Pato vía pregunta directa)
  - `npm install leaflet react-leaflet@4 @types/leaflet`
  - Migración Supabase: columna `imagen_url` en `deuda_posiciones` (`lat`/`lng` ya existían desde el diseño original de la tabla, no se usaban)
  - `app/api/deuda/geocode/route.ts` (nuevo) — geocoding server-side vía Nominatim (OSM), sin API key. Resuelve 1 dirección por request, respeta política de Nominatim (User-Agent + máx. 1 req/seg — el cliente espacia las llamadas)
  - `components/DeudaMapa.tsx` (nuevo) — mapa Leaflet con pines por contrato, popup con resumen + botón "Ver ficha completa", pines rojos para riesgo de cargas. Cargado vía `next/dynamic({ ssr: false })` en la page porque Leaflet necesita `window`
  - `components/DeudaFichaModal.tsx` (nuevo, extraído de `DeudaListado.tsx`) — agrega upload de imagen por posición (mismo patrón que portada de Mercado, mismo bucket `portadas`) + botón "📍 Ubicar en mapa" individual
  - `lib/deuda-schema.ts` — nuevo helper `agruparPorContrato()` (antes vivía duplicado dentro de `DeudaListado`), usado tanto por Lista como por Mapa
  - `app/(app)/deuda/page.tsx` — toggle "☰ Lista / 🗺️ Mapa", banner "N posiciones sin ubicar" con botón de geocodificación en lote (agrupa direcciones repetidas, espaciado 1.1s/request), estado `contratoAbierto` subido acá para que Lista y Mapa compartan la misma ficha
  - Build verificado. Commit `388a854`, pusheado a `origin master`

Pendiente:
- Si en el futuro se quiere el look de Google Maps (satelital/Street View) hay que retomar el camino con API key + billing — por ahora Leaflet/OSM cubre la necesidad sin esa dependencia

**Última sesión — 14/07/2026 (continuación 3 — Deuda: fixes geocoding, z-index del mapa, y conteo confuso)**

Hecho, tras feedback de Pato probando en producción:
- **Geocoding se quedaba en 12/24**: direcciones de brokers traen ruido que Nominatim no matchea (códigos catastrales `Es:E Pl:02 Pt:B`, sótanos/garajes pegados, mojibake residual `2Âº D`, carreteras nacionales sin prefijo `N-`, CP sin cero inicial). `app/api/deuda/geocode/route.ts` ahora limpia la dirección + hace 3 intentos en cascada (completa → sin CP → solo ciudad/provincia como pin aproximado) para que ninguna posición con ciudad conocida quede sin pin
- **Mapa tapaba el modal de ficha al hacer clic en un pin**: los paneles/popups/controles de Leaflet usan z-index 400-1000 que le ganan al z-40/z-50 de Tailwind del modal (`.leaflet-container` no arma su propio contexto de apilamiento). Fix: `isolation: isolate` en el wrapper del mapa (`components/DeudaMapa.tsx`)
- **"Veo 15 pero el excel tiene 25"**: investigado en Supabase — no era bug de import. El Excel tiene 25 filas visuales pero la fila 1 es el header (24 filas de datos reales, coincide con lo insertado). Esas 24 posiciones se agrupan en 17 contratos, y el toggle "ocultar riesgo de cargas" (activo por default, enterrado en "Más filtros") escondía 2 de esos 17 sin ninguna pista visible. Se agregó un banner rojo permanente arriba del listado/mapa cuando hay contratos ocultos por ese filtro, con botón "Mostrar de todas formas". Se extrajo el predicado de filtrado a `pasaFiltros()` en `components/DeudaFiltros.tsx` para no duplicar la lógica
- Commit `ec2308c` (geocoding + z-index) y `bbd3bdc` (banner de transparencia), pusheados a `origin master`, build verificado en cada uno

Pendiente:
- Ninguno abierto de esta sub-sesión — falta que Pato confirme en el deploy que ahora sí ubica las 24 y que el banner de contratos ocultos se ve bien

**Última sesión — 14/07/2026 (continuación 4 — Deuda: campos cortados / Chat: reforma silenciosa)**

Hecho:
- **Deuda — campos cortados en la ficha** (`components/DeudaFichaModal.tsx`): el componente `Field` mostraba label+valor en la misma línea con `truncate`, cortando referencias catastrales, contract IDs largos, titulares completos y el texto original de estado judicial con "...". Rediseñado a label arriba / valor abajo con wrap normal. Commit `e2affb9`
- **Chat WOS3 — el bot asumía reforma=0€ en silencio** (`app/api/chat/route.ts`): Pato reportó que al subir un HTML de Idealista el bot devolvió un ROI definitivo (-15%) sin preguntar nada. Causa: instrucción de una sesión anterior ("reforma=0, análisis rápido, no preguntes, ejecutá directo") al detectar portal con superficie (HTML adjunto o link). Confirmado con Pato (vía pregunta directa) el cambio: ahora el bot muestra un resumen breve y PREGUNTA la reforma estimada antes de calcular — si el usuario dice "no sé", usa 0€ pero lo dice explícito en el resultado en vez de asumirlo callado. Commit `0344230`
- Ambos con build verificado, pusheados a `origin master`

Pendiente:
- Ninguno abierto de esta sub-sesión

**Última sesión — 14/07/2026 (rediseño: Wallest Design System — colores + tipografía)**

Hecho:
- **Aplicación del nuevo Wallest Design System a todo WOS3** — reemplazo del acento naranja (`#F26E1F`) por el bronce del design system (`#A6855A` primario / `#C7A877` soft), + tipografía Marcellus (display) + Hanken Grotesk (UI/body)
  - **Alcance decidido**: solo color + tipografía, manteniendo el fondo claro (`#F2ECE0`/cream) en toda la app interna (Proyectos/Mercado/Deuda/HASU/Admin/login/BotChat/informes/dossier). NO se adoptó la geometría literal del design system (radios 2px en botones, 26px en cards, 999px en pills) — WOS3 sigue con sus `rounded-xl`/`rounded-2xl`/`rounded-full` existentes, para no forzar un rediseño de forma en 29+ archivos en la misma pasada. A confirmar con Pato si se quiere una fase 2 de geometría más adelante
  - `app/globals.css` / `tailwind.config.ts`: tokens nuevos (`--wl-ink #14110C`, `--wl-ink-2 #1B1610`, `--wl-cream #F2ECE0`, `--wl-cream-bright #F8F3E9`, `--wl-accent #A6855A`, `--wl-accent-soft #C7A877`), clase `.font-display` (Marcellus)
  - `app/layout.tsx`: carga Marcellus + Hanken Grotesk vía `next/font/google` (antes solo se declaraban variables CSS sin fuente real cargada)
  - **Regla de contraste aplicada en todo el swap**: cualquier relleno sólido bronce/accent-soft usa texto oscuro `#14110C` (nunca blanco) — es la convención literal del design system, verificada en sus propios ejemplos de chips/botones
  - 29 archivos tocados: `AppShell.tsx`, `Nav.tsx` (dead code, igual actualizado), `login/page.tsx`, `BotChat.tsx`, `proyectos/page.tsx` + `[id]/page.tsx`, `mercado/page.tsx`, `admin/page.tsx`, `deuda/page.tsx` (+ hero gradiente ink→bronce), `DeudaFiltros.tsx`, `DeudaImportWizard.tsx`, toda la sección `hasu/*` (page, calendario, docs, fiscal, flujo-caja, proveedores), `informe/inmueble/[id]`, `reporte/[id]`, `liquidacion/[id]`, `dossier/page.tsx` + `dossier/print/page.tsx`, `generateDossierPDF.ts` + `generateReportePDF.ts` (jsPDF, vía helper `hexToRgb()`), `inversor/portal/page.tsx` (constante `ORANGE` + gradiente hero), `lib/notifications.ts` (email HTML)
  - Trabajo ejecutado en 3 tandas vía subagentes (chrome principal hecho a mano, páginas operativas / HASU / informes-documentos delegadas) con las mismas reglas de contraste y tamaño de fuente en cada una, build verificado (`next build` ok) después de cada tanda y al final
  - Commit `211f0b5`, pusheado a `origin master`

Pendiente:
- **Decisión pendiente de Pato**: en una sesión anterior se había hablado de que el portal inversor y el dossier recibieran el tratamiento "dark-first" completo del design system (fondos oscuros, glass panels, `backdrop-filter`), a diferencia del resto de WOS3 que mantiene fondo claro. En esta sesión, por alcance y para no romper nada sin confirmación, se les aplicó el mismo tratamiento que al resto (bronce + Marcellus sobre fondo claro/imagen existente). Falta confirmar si se quiere ese tratamiento dark-first como fase separada
- Fase 2 de geometría (radios 2px/26px/999px literales del design system) — no se tocó en esta sesión, ver nota de alcance arriba
- No testeado visualmente en vivo (regla de nunca correr servidor local) — pendiente que Pato lo revise en el deploy de Vercel

**Última sesión — 14/07/2026 (nueva área DEUDA)**

Hecho:
- **Área DEUDA — v1 completa** (importar planillas de brokers/servicers/fondos de NPL, filtrar, gestionar). 100% interna (Pato + Silvia), nunca expuesta al portal inversor, sin mezclar con HASU/JV ni con la fórmula ROI de `/lib/formulas.ts`
  - Nav: `Proyectos, Mercado, Deuda, HASU` (`components/AppShell.tsx`, ítem `{ id: 'deuda', href: '/deuda', icon: '⚖️' }`) + página `deuda` agregada a `ALL_PAGES` en `/admin` para permisos (NO incluida por default en `editPages` — requiere opt-in explícito por ser sensible)
  - Supabase (`mxdesbiyjvdnpehklwcb`) — 4 tablas nuevas: `deuda_posiciones` (posición individual, `campos_extra`/`raw_data` jsonb para no perder nada), `deuda_mapeos_broker` (mapeo de columnas reusable por broker), `deuda_importaciones` (historial de cargas), `deuda_estados_judiciales` (diccionario creciente de clasificación de estado judicial, `estado_raw → estado_normalizado`)
  - **Deviación deliberada del brief original**: NO hay unique constraint `(contract_id, ref_catastral)` — se probó con el Excel real (`samples/estenpl.xlsx`, 24 filas) y ese par colisiona 2 veces con datos distintos. Imports quedan append-only, agrupados por `importacion_id`; dedup entre re-imports queda como revisión manual pendiente, no resuelto automáticamente
  - `lib/deuda-schema.ts` — tipos canónicos, `calcRatioRiesgoCargas()` (alerta si cargas_previas > asking_price, estado `sinPrecio` aparte de ratio 0), `calcDescuento()`, configs de estado interno (`nuevo/en_analisis/descartado/comprado`) y estado judicial normalizado (`prejudicial/subasta_señalada/subasta_pendiente/oposicion/resuelto/otro`)
  - `app/api/deuda/mapeo/route.ts` — Claude propone mapeo de columnas por broker (reusa el guardado si el broker ya importó antes con las mismas columnas)
  - `app/api/deuda/import/route.ts` — normaliza filas según mapeo confirmado, repara mojibake (Latin-1/UTF-8 mal decodificado, típico en Excels de brokers), clasifica estado judicial nuevo vía Claude (batch, solo valores no vistos), inserta en `deuda_posiciones`, guarda el mapeo confirmado para la próxima
  - `components/DeudaImportWizard.tsx` — wizard 3 pasos (archivo → mapeo con preview y confianza alta/media/baja → resultado), parseo client-side con `xlsx` (`raw:false` para no perder ceros a la izquierda de `contract_id`)
  - `components/DeudaFiltros.tsx` — filtros en dos niveles estilo Idealista: barra siempre visible (buscar, provincia, ciudad, precio min/max) + panel "Más filtros" expandible (broker, tipo/subtipo colateral, deuda OB, estado judicial multiselect, toggle ocultar riesgo de cargas — activo por default)
  - `components/DeudaListado.tsx` — listado agrupado por `contract_id` (colapsable), badge "N garantías" si el contrato tiene varias posiciones, badge rojo "Cargas > precio" si hay alerta, selector de estado interno inline
  - `app/(app)/deuda/page.tsx` — orquesta fetch de `deuda_posiciones`, hero con gradiente (sin foto stock, a diferencia de Proyectos/Mercado/HASU — sección de datos/legal sin fotos de inmuebles), tabs por estado interno con contador, wiring de filtros y listado, apertura del wizard
  - Build verificado (`next build` ok) antes del push. Commit `ee06ded`, pusheado a `origin master`
  - **No testeado en vivo** — por la regla de nunca correr servidor local ni auto-loguearse (ver `feedback_coding.md`), el flujo de import con `samples/estenpl.xlsx` queda pendiente de que Pato lo pruebe en el deploy de Vercel

Pendiente:
- Probar el flujo completo de import en producción con `samples/estenpl.xlsx` (o la planilla real del broker) — ✅ ya se probó en una sesión posterior (ver entradas "continuación 2/3" más arriba), quedó resuelto
- ~~Mapa con pines + popup (Google Maps Geocoding + JS API) — bloqueado, falta API key de Google Maps~~ — resuelto en sesión posterior con OpenStreetMap + Leaflet en vez de esperar la key (ver "continuación 2" más arriba), no bloquea más
- Definir si/cómo una posición de deuda `comprado` se enlaza con Proyectos cuando se convierte en compra real — no estaba en el brief, a confirmar con Pato (sigue abierto)

**Última sesión — 14/07/2026 (chat WOS3 — adjuntar HTML + análisis automático)**

Hecho:
- **Fix wrap de links largos en el chat** (`components/BotChat.tsx`) — al pegar una URL larga desbordaba los márgenes del panel. Se agregó `wordBreak: 'break-word', overflowWrap: 'anywhere'` a las burbujas de bot y de usuario
- **Adjuntar archivos HTML/texto al chat** (`components/BotChat.tsx`) — antes el chat solo aceptaba imágenes. Caso real: Idealista bloquea el scraping directo por link, así que Pato descarga la página completa y la sube
  - Nuevo tipo `AttachedFile` + estado `attachedFiles`, `handleFileSelect` ahora rama por `file.type` (imagen → base64 como antes; HTML/texto → `readAsText`, truncado a 300k chars)
  - Chip nuevo en la UI (📄 nombre + ✕ quitar), input acepta `.html,.htm,text/html,.txt,text/plain` además de imágenes
  - `app/api/chat/route.ts` recibe `htmlFiles` en el body, reusa `extractFromHtml()` de `lib/scrape-idealista.ts` (mismo parser que ya usaba el scraping por URL) para extraer precio/dirección/ciudad/habitaciones/superficie/baños
- **Análisis de mercado automático al detectar portal (archivo o link)** (`app/api/chat/route.ts`) — antes, tanto el archivo adjunto como el link detectado solo disparaban `insert_radar` (guardar datos crudos), nunca corrían ROI/comparables como sí hace el bot de Telegram. Causa: instrucción hardcodeada en `portalCtx`, no dependía de Fragua (que sigue sin contratar)
  - Si el HTML/link trae superficie: instruye a Claude a llamar `analizar_inmueble` directo (reforma=0, análisis rápido, sin preguntar antes) en vez de `insert_radar`
  - Si falta superficie: pide ese dato primero; si el usuario no lo tiene, cae a `insert_radar` como antes
  - Tool `analizar_inmueble` ya no devuelve el reporte largo (`textoReporte`) en el chat — devuelve un resumen corto de 2 líneas (semáforo + ROI + venta estimada + beneficio) + `action: 'informe'` + `url` a `/informe/inmueble/[id]` (página de reporte visual ya existente, reutilizada tal cual)
  - Bypass determinístico (`toolResults.find(tr => tr.action === 'pdf' || tr.action === 'informe')`) extendido para que el resumen se muestre literal, sin que Claude lo reformule — mismo patrón que ya usaba `generar_informe_estudio`
  - `components/BotChat.tsx`: el botón del toolData ahora muestra "📊 Ver informe completo" cuando `action === 'informe'` (antes solo existía "📄 Descargar PDF")
  - Decisión explícita de Pato: análisis rápido en el chat + botón a informe completo, en vez de embeber todo el reporte largo dentro del chat (que no era visual/cómodo en el panel angosto)
  - Build verificado antes del push

Pendiente:
- Ninguno abierto de esta sesión

**Última sesión — 13/07/2026 (continuación — BONUS CCP: cálculo automático)**

Hecho:
- **Campo "Beneficio final (€)" + cálculo automático del bonus** (`app/(app)/mercado/page.tsx`), corrigiendo la sub-sesión anterior
  - Pato notó que faltaba el dato con el cual calcular el bonus: se agregó el campo "Beneficio final (€)" junto al de "Beneficio acordado en el CCP (€)"
  - En cuanto se carga el beneficio final, se calcula automáticamente: excedente = beneficio final − CCP acordado, y su reparto entre gestor(es)/inversor(es) según el % de bonus (60/40 default), con la misma ponderación que el reparto base (gestores en partes iguales, inversores a prorrata de capital) — nueva función pura `calcJvBono(jugadores, excedente, pctGestor, pctInversor)`
  - Se muestra tabla con excedente total + Jugador/% bonus/Bonus(€) por jugador. Si el beneficio final no supera al CCP, se avisa que no hay excedente y no aplica bonus
  - Columna nueva en Supabase `inmuebles`: `jv_bono_beneficio_final`
  - Commit `62d9e41`, pusheado a `origin master` — ✅ build verificado antes del push

Pendiente:
- Ninguno abierto de esta sub-sesión

**Última sesión — 13/07/2026 (continuación — BONUS CCP en JV/Gestor)**

Hecho:
- **BONUS (excedente sobre el CCP) — nueva subsección en la card JV/Gestor** (`app/(app)/mercado/page.tsx`)
  - Caso real: el Contrato de Cuentas de Participación (CCP) fija un beneficio acordado (ej. 100.000€); si el negocio termina rindiendo más (ej. 140.000€), el excedente (40.000€) se reparte con un % distinto al 50/50 fijo del reparto base — típicamente 60% gestor / 40% inversor(es)
  - Se agregaron 2 inputs enlazados "% Gestor (bonus)" / "% Inversor (bonus)" (se autocompletan a 100 entre sí, default 60/40) + campo de referencia "Beneficio acordado en el CCP (€)"
  - Al pie de la card, campo de texto libre "Liquidación final" para completar manualmente cuando la operación se cierre y se liquide el reparto real (incluido el bonus si aplica) — decisión de diseño: texto libre en vez de campos numéricos rígidos, porque el reparto real de liquidación puede variar caso a caso
  - Columnas nuevas en Supabase `inmuebles`: `jv_bono_pct_gestor`, `jv_bono_pct_inversor`, `jv_bono_beneficio_ccp`, `jv_bono_liquidacion` (persisten solo si `jvModo === 'jv'`)
  - Commit `dc38e72`, pusheado a `origin master` — ✅ build verificado antes del push
  - **Nota**: en esta sub-sesión original faltaba el campo "Beneficio final" (ver entrada de arriba, corregida en la sub-sesión siguiente)

**Última sesión — 13/07/2026 (continuación — generador de Dossier)**

Hecho:
- **Generador de Dossier multi-inmueble para inversores** — feature nueva, dos vías:
  - `app/dossier/page.tsx` — formulario (título + nombre inversor opcional) sobre una cartera de prueba (`CARTERA_PRUEBA`, 5 inmuebles Huércal-Overa/Garrucha/Olula), genera PDF client-side vía jsPDF llamando a `lib/generateDossierPDF.ts`
  - `app/dossier/print/page.tsx` — presentación tipo slides (portada + 1 slide por inmueble + cierre) pensada para imprimir a PDF con `window.print()` (autolanza el diálogo de impresión al cargar)
  - Dependencias agregadas a `package.json`: `docx` y `puppeteer` — **quedaron sin usar**, ambas vías finales usan jsPDF (cliente) o `window.print()` (navegador), no generación server-side. Pendiente decidir si se eliminan o si hay un plan de usarlas después
  - Commit `42779cd`, pusheado a `origin master` — ✅ build verificado antes del push (este código ya estaba escrito de una sesión anterior sin commitear; se commiteó y documentó recién ahora)

Pendiente:
- Decidir si `docx`/`puppeteer` se usan para algo (ej. exportar a Word, o generar el PDF en servidor) o se eliminan del `package.json` por no usarse
- Conectar `/dossier` a datos reales de `inmuebles` en vez de la cartera de prueba hardcodeada, si se decide usar en producción con inversores reales

**Última sesión — 13/07/2026 (continuación — reforma por unidad + JV/Gestor)**

Hecho:
- **Fix: reforma por unidad no llegaba al total CAAV** (`app/(app)/mercado/page.tsx`)
  - Bug: cada unidad de un edificio ya tenía su propio `reforma_estimada` (tabla `inmueble_unidades`), pero el gasto global "Reforma" de CAAV era un campo único manual — forzaba a promediar costos de reforma distintos entre unidades (ej. Calle Alhóndiga: 15k vs 45k)
  - Fix: la sección "Unidades del edificio" del calculador ahora muestra la reforma de cada unidad + el total sumado, con botón "Aplicar suma al gasto de Reforma" que carga ese total directo al gasto de CAAV (sin overwrite silencioso — acción explícita)
  - Commit `28bc73a`, pusheado a `origin master` — ✅ deployado, build verificado antes del push

- **Calculadora JV / Gestor — nueva card en análisis multi-estrategia** (`app/(app)/mercado/page.tsx`)
  - Migración Supabase: columna `jv_jugadores` (jsonb, default `[]`) en tabla `inmuebles`
  - Toggle "Solo HASU" / "Joint Venture" dentro de la misma card
  - Modo JV: lista dinámica de jugadores (agregar/quitar, N sin límite fijo), cada uno con: nombre, rol (Gestor/Inversor), capital aportado (€), % del beneficio asignado — **el % de beneficio es independiente del % de capital** (permite que el gestor se lleve más beneficio del proporcional a su aporte por el trabajo de gestión, sin fee fijo)
  - Reparte el beneficio ya calculado por CAAV (escenario Realista) entre los jugadores según su % asignado — no recalcula el negocio, solo el reparto
  - Por jugador se calcula: % de capital sobre el total (informativo), beneficio en €, ROI% y ROI anualizado (misma fórmula que CAAV), con el mismo semáforo de la app (🔴<30% / 🟡30-50% / 🟢>50%)
  - Validaciones visuales: alerta si el % de beneficio de todos los jugadores no suma 100%, y si el capital aportado no cuadra con la inversión total de CAAV
  - Persistencia completa en Supabase al guardar (solo si `jvModo === 'jv'`, si no persiste `[]`)
  - Commit `1338701`, pusheado a `origin master` — ✅ deployado, build verificado antes del push
  - **Corrección del modelo (mismo día, probado con caso real Zurgena/Alhóndiga)**: el % de beneficio NO es libre — es una **regla fija**: 50% del beneficio para los jugadores con rol Gestor (partes iguales entre ellos, sin importar cuánto capital pusieron — HASU aporta 10-50% del capital según la operación pero eso no cambia su parte del beneficio), 50% para los jugadores con rol Inversor a prorrata de su capital aportado. Si hay más de un gestor (ej. José Luis con rol ambiguo en Alhóndiga) se divide en partes iguales entre los gestores. `% capital` y `% beneficio` pasaron de inputs a valores 100% computados. Commit `edd9439`
  - **Campos de conveniencia** (mismo día): agregados "Inversión total (€)" y "Tiempo (meses)" editables directo dentro de la card JV/Gestor, para no tener que scrollear arriba a buscarlos. "Tiempo" edita `duracionMeses` directo (mismo estado que usa toda la calculadora). "Inversión total" ajusta el gasto `precio_compra` (estimado o real, el que esté activo) manteniendo fijos el resto de conceptos de Gastos, para no romper el desglose existente. Commit `53af3e2`
  - **Rol Mixto (mismo día)**: caso real detectado (José Luis en Alhóndiga puede ser gestor Y inversor a la vez) — se agregó un tercer rol "Mixto" además de Gestor/Inversor. Con Mixto aparece un slider "% como Gestor" (resto Inversor, default 50/50). El jugador cobra de AMBOS pools del 50/50 según su fracción: su parte del pool de gestión (repartido entre todos los gestores/mixtos según su fracción-gestor) + su parte del pool de inversión (ponderada por capital × fracción-inversor). Gestor puro = 100% gestor / 0% inversor, Inversor puro = 0%/100% — retrocompatible con el modelo anterior. Commit `cbbb891`
  - **Reparto JV visible en la card principal de Mercado (mismo día)**: antes solo se veía dentro de la calculadora. Ahora la card de la lista muestra: badge morado "JV · N" junto a tipología/fuente (arriba de la imagen), y debajo de la tabla Pesimista/Realista/Optimista una mini-tabla con header y 3 columnas — Jugador (nombre + rol, y % si es Mixto), Capital aportado, Beneficio (€ y % debajo) — calculada sobre el escenario Realista. Primera versión era texto corrido poco claro (feedback de Pato: "no se entiende bien qué es cada dato"), se rehizo como tabla. Se extrajo la lógica de reparto a la función pura `calcJvReparto()` (antes vivía solo dentro del modal) para reutilizarla en ambos lugares sin duplicar la fórmula. Commits `37a9825`, `f9bcefb`

Pendiente:
- Fase 2 catálogo de reforma (ver entrada de sesión anterior) — sigue pendiente
- Probar la calculadora JV/Gestor con un caso real (ej. Alhóndiga) una vez Pato defina el rol de José Luis

**Última sesión — 13/07/2026 (continuación — calculadora multi-estrategia)**

Hecho:
- **Calculadora multi-estrategia — Fase 1** (`app/(app)/mercado/page.tsx`)
  - Migración Supabase: 9 columnas nuevas en tabla `inmuebles`:
    `unidades_estimadas` (int, default 1), `costo_reforma_por_unidad`, `precio_venta_por_unidad`, `alquiler_estimado_unidad`, `reforma_minima_estimada`, `alquiler_mensual_estimado`, `precio_venta_rentando`, `fee_inbruto_estimado`, `fee_gestion_obra_estimado`
  - En la calculadora full-screen, debajo de los resultados CAAV, se agregan:
    - Inputs PatrimonioIN: unidades estimadas, reforma/unidad, precio venta/unidad, alquiler/unidad (para ROI bruto inversor)
    - Inputs Alquiler directo: reforma mínima, alquiler mensual, precio venta ya rentando (opcional)
    - Inputs INbruto: fee INbruto + fee gestión obra (ambos libres, sin fórmula ni default forzado)
  - Vista comparativa: 4 cards 2×2 con beneficio neto en €, semáforo ROI (🔴<30% / 🟡30-50% / 🟢>50%), mejor escenario destacado en naranja
  - CAAV usa el escenario "Realista" del calculador existente (sin cambios en la lógica preexistente)
  - INbruto muestra solo beneficio en €, sin ROI% (no hay capital inmovilizado)
  - `fee_gestion_obra_estimado` y `fee_inbruto_estimado` son 100% manuales — los placeholders muestran referencias (4-6k / 2k+) pero no imponen valor por defecto
  - Persistencia completa en Supabase al guardar
  - Commit `aabe986`, pusheado a `origin master` — ✅ deployado, build verificado antes del push

- **Catálogo de reforma (Fase 2) — pendiente**: tabla `catalogo_reforma` + pantalla admin + conexión al calculador. Bloqueada hasta que Pato confirme los €/m² para adecuación 2★/3★/4★ con el reformista. Las 2 partidas fijas (cocina 2.000€, baño 4.000€) están listas para cargar cuando se construya la pantalla.

Pendiente:
- Fase 2: catálogo de reforma (`catalogo_reforma`) + pantalla admin + conexión automática a escenarios CAAV y PatrimonioIN

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
| Calculadora multi-estrategia Fase 1 (4 escenarios: CAAV, PatrimonioIN, Alquiler, INbruto) | ✅ producción |
| Reforma por unidad aplicable al total CAAV (edificios) | ✅ producción |
| Calculadora JV/Gestor (regla fija 50% gestores / 50% inversores + rol Mixto) | ✅ producción |
| Reparto JV visible en card principal de Mercado (badge + tabla Jugador/Capital/Beneficio) | ✅ producción |
| Generador de Dossier multi-inmueble para inversores (`/dossier`, `/dossier/print`) | ✅ producción (con cartera de prueba, no datos reales todavía) |
| Catálogo reforma Fase 2 (tabla catalogo_reforma + admin + conexión calculadora) | ⏳ pendiente |
| BONUS CCP en JV/Gestor (% gestor/inversor sobre excedente, cálculo automático con Beneficio final + liquidación) | ✅ producción |
| Chat WOS3 — adjuntar archivo HTML/texto (no solo imágenes) | ✅ producción |
| Chat WOS3 — análisis automático (ROI/comparables) al detectar portal, con resumen corto + botón "Ver informe completo" | ✅ producción |
| Chat WOS3 — pregunta reforma estimada antes de calcular ROI al detectar portal (ya no asume 0€ en silencio) | ✅ producción |
| Área DEUDA v1 (import planillas broker, mapeo de columnas por Claude, filtros, estados) | ✅ producción |
| Deuda — ficha de detalle completa (Colateral/Deuda/Estado judicial, todos los campos canónicos con label) | ✅ producción |
| Deuda — mapa con pines (OpenStreetMap + Leaflet, geocoding vía Nominatim, sin API key) | ✅ producción |
| Deuda — imagen por posición (mismo patrón que portada de Mercado) | ✅ producción |
| Deuda — banner de transparencia cuando el filtro de riesgo oculta contratos | ✅ producción |
| Wallest Design System — bronce + Marcellus/Hanken en toda la app (fondo claro mantenido) | ✅ producción |
| Wallest Design System Fase 2 (geometría literal: radios 2px/26px/999px) | ⏳ pendiente |
| Portal inversor / Dossier — tratamiento "dark-first" del design system | ⏳ pendiente de decisión de Pato |
| Mercado — checklist de documentación/alertas (13 ítems, gating en "Comprado →") | ✅ producción |
| Chat WOS3 — checklist de documentación en el preanálisis (analizar_inmueble/insert_edificio_radar), gating antes de dar de alta en Mercado | ✅ producción |
| Chat WOS3 — adjuntar PDF (planos, contratos, anteproyectos) | ✅ producción |
| Chat WOS3 — modo análisis libre (razonamiento profundo sin límite de 3 párrafos cuando no hay tool aplicable) | ✅ producción |
