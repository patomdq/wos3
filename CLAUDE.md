# WOS3 — Wallest Operating System

## REGLAS FIJAS — no modificar sin instrucción explícita

**Repos y bases de datos**
- Repo activo: `github.com/patomdq/wos3` — trabajar SIEMPRE aquí
- Working dir: `/Users/patofavora/Documents/W3/wos3`
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
(tabla `inmuebles`: `borrador → sin_analizar → en_estudio → ofertado → en_arras → comprado`)
- Al pasar de Radar a En Estudio, desaparece del módulo Radar
- Solo operaciones con estado `vendida` suman al objetivo 1M€

**Nunca hacer**
- Mezclar datos HASU con JV en queries o UI
- Crear endpoints de escritura directa sin pasar por el bot
- Modificar `/lib/formulas.ts` sin autorización
- Cambiar stack (Next.js, Supabase, Vercel son inamovibles)
- Usar `any` en TypeScript sin justificación
- Correr servidor local ni auto-loguearse — Pato prueba en deploy de Vercel
- Commitear sin hacer `node_modules/.bin/next build` antes

**Flujo de trabajo**
1. Editar en `/Users/patofavora/Documents/W3/wos3`
2. `node_modules/.bin/next build` — verificar que pase
3. `git commit` → `git push origin master` inmediatamente

**Tema visual — regla fija**
- Fondo página: `#F2F1ED` / Cards: `#FFFFFF` / Bordes: `rgba(0,0,0,0.08)`
- Texto principal: `#1A1A1A` / Secundario: `#666666`
- Acento bronce: `#A6855A` (primario) / `#C7A877` (soft)
- Tipografía: Marcellus (display) + Hanken Grotesk (UI/body)
- CTAs grandes/primarios: fill ink `#14110C` + texto cream `#F8F3E9`
- UI chica (badges/chips): bronce + texto oscuro
- NO usar `#0A0A0A`, `#141414`, text-white en fondos de página

**División de interfaces — regla fija**
| Interfaz | Uso |
|----------|-----|
| Bot Telegram | SOLO escáner: pegar URL → números (ROI, precio máximo, comparables) |
| Chat WOS3 | TODO lo operativo: proyectos, bitácora, calendario, tareas, radar, análisis |

---

## STACK

- Next.js App Router + TypeScript
- Supabase (`mxdesbiyjvdnpehklwcb`) — escritura/lectura
- Vercel — deploy automático desde git push a master
- Dominio: `wos.wallest.pro` ✅ / fallback: `wos3.vercel.app`

**Tablas Supabase clave**
- `inmuebles` — Radar/Mercado (columna `tipologia`, columna `estado`)
- `proyectos` — operaciones inmobiliarias HASU. FK: `inmuebles.proyecto_id → proyectos.id`
- `inmueble_unidades` — unidades de edificios (FK inmueble_id)
- `deuda_posiciones`, `deuda_mapeos_broker`, `deuda_importaciones`, `deuda_estados_judiciales`
- `agenda_tasks`, `google_tokens`, `bitacora`, `bitacora_estudio`
- Storage bucket `portadas` — imágenes portada (público, 5MB, JPG/PNG/WEBP/HEIC)

**Archivos clave**
- `app/(app)/mercado/page.tsx` — Mercado: solapas + buscador + filtros
- `app/(app)/proyectos/[id]/page.tsx` — detalle proyecto con `InmuebleCalculadora`
- `components/InmuebleCalculadora.tsx` — calculadora compartida (CAAV, multi-estrategia, JV/Gestor)
- `lib/analizarInmueble.ts` — análisis único (comparables + semáforo)
- `lib/formulas.ts` — fórmulas ROI (NO modificar sin autorización)
- `app/api/chat/route.ts` — chat WOS3 hub operativo
- `app/api/telegram/webhook/route.ts` — bot Telegram escáner
- `components/DeudaFichaModal.tsx`, `components/DeudaListado.tsx`, `components/DeudaImportWizard.tsx`

---

## ESTADO OPERATIVO — actualizar al cerrar cada sesión

**Última sesión — 23/07/2026**

- **Vista Criba — screening masivo de deuda**: score 0-100 ponderado por descuento(35%)+posesión(30%)+judicial(25%)+deudor(10%), penalización −20 si cargas > asking
  - `calcularScoreActivo()` + `semaforo()` en `lib/deuda-schema.ts`
  - `components/DeudaCribaView.tsx`: tabla densa ordenada por score, dots DPJP, filtros por semáforo (verde ≥65 / amarillo 40-64 / rojo <40), score mínimo, acciones inline ✅⏸❌
  - Integrada como tercera vista "🎯 Criba" en `/deuda` (junto a Lista y Mapa)
  - Commit `37eaf72`
- Pendiente: export CSV de seleccionados para cerrar el flujo de screening

**Sesión anterior — 22/07/2026**

- **Informe PDF Deuda — reescritura completa**: dashboard grupal con 4 métricas (Deuda total, OB, Asking, Descuento %), ratings DPJP, itera TODOS los colaterales del grupo (no solo items[0]). Commit `ba1e55f`
- **Catastro API integrado**: API pública `ovc.catastro.meh.es` — parámetros correctos: `Provincia` + `Municipio` (campo `ciudad` en BD) + `RefCat`. Devuelve dirección exacta, m², uso, año, escalera/planta/puerta
  - Migración: columna `datos_catastro jsonb` en `deuda_posiciones`
  - `/api/catastro/fetch?id=X` — fetch individual, guarda en BD
  - `/api/catastro/batch` — actualiza todos los registros con ref_catastral (no conectado a UI, reserva futura)
  - `PosicionCard` en `DeudaFichaModal`: botón "⬇ Obtener datos" / "✓ Actualizar datos" + bloque verde con datos + mensaje de error si falla
  - Informe PDF usa datos catastrales si existen (dirección más precisa, m², año, tipo)
  - Tipo `DatosCatastro` añadido a `lib/deuda-schema.ts`
- Commits: `b47a8c8` (catastro), `991b23c` (fix subcomponente), `fef9beb` (fix campo ciudad + errores)

**Sesión anterior — 21/07/2026**

- **Base de conocimiento Máster IN+ — COMPLETA**: 10 archivos en `docs/master/` cubriendo las 5 sesiones
  - Sesión 01: CCP + liquidación, micromercado, modelos inversión, presentación inversores
  - Sesión 02: tipos de edificio, equipamiento y checklist visita
  - Sesión 03: fiscalidad avanzada (IVA/TPO/ISP/rehabilitación/trucos), estructura holding + FEAC
  - Sesión 04: DISC+ comunicación, negociación y oferta (10 claves + objeciones + palabras poderosas)
  - Sesión 05: riesgos jurídicos desalojos (Magro), escenarios legales ocupación, 5 supuestos civiles reales, NPL/cesión de crédito
- Commits: `6958043` (sesión 04), `b71ab1c` (sesión 05)

**Sesión anterior — 20/07/2026**

- **Deuda — Master IN+ Análisis Cesión**: tipo `AnalisisCesion` en `lib/deuda-schema.ts`, 4 ratings (D/P/J/Pr), `inferirRatingsCesion()`, `calcBeneficioCesion()`. UI en `DeudaFichaModal.tsx` + chips en `DeudaListado.tsx`
- **Mercado → Proyectos al pasar a En Arras**: modal confirmación → crea proyecto `OP-XXX` con `estado='en_arras'`, guarda `proyecto_id` en inmueble, oculta de Mercado. Botón "Comprado →" eliminado de Mercado
- **Bitácora en Mercado**: panel inline → modal centrado 600px
- **Proyectos — tabs Análisis (7) e Inversor (4)**: `InmuebleCalculadora` con `mode='calculadora'` y `mode='jv'`. Carga inmueble vinculado por `inmuebles.proyecto_id`
- **Telegram**: solo proyectos activos; sin coincidencia → "No existe ese proyecto en WOS3"
- **Movimientos**: Calle Alhóndiga arras −5.000€ + aportación HASU +5.000€; Deuda Jacarandá −7.300€ + aportación HASU +7.300€
- Commit `3e217f2`. Build verificado, pusheado

**Sesión anterior — 18/07/2026**
- Fix ciudades duplicadas Deuda (`a5c3b54`)
- Nuevo origen REO en Mercado: columnas `provincia`, `ccaa`, `asset_id_servicer`, `portfolio_reo`, `estado_judicial_reo`, `fase_desahucio`, `reo_datos_extra`
- Wizard import REO (`MercadoReoWizard.tsx`), APIs `/api/mercado/mapeo-reo` y `/api/mercado/import-reo`
- Filtros Mercado: origen (Directo/REO·Servicer) + provincia
- Commits: `a5c3b54`, `a5458f5`, `3d1e7aa`

---

## PENDIENTES ABIERTOS

- **Deuda — Dashboard inversor al tope del modal + informe**: campo `valor_mercado_estimado` por colateral para calcular margen total (mercado − asking − gastos). Pendiente implementar
- Pato prueba import Excel Alemaria (26 REOs) — confirmar mapeo de columnas
- @menciones en bitácora con alerta Telegram
- Drop tablas legacy (`inmuebles_radar`, `inmuebles_estudio`, `edificios_estudio`)
- Dossier multi-inmueble — conectar a datos reales (hoy usa cartera de prueba)
- `docx` y `puppeteer` en package.json sin usar — decidir si se eliminan
- Catálogo reforma Fase 2 (`catalogo_reforma` + admin + conexión calculadora)
- Modal Mercado — rediseño landscape mobile
- Fragua (scraper Idealista, $40/mes) — enchufe listo, NO contratado
- Wallest Design System Fase 2 (geometría: radios 2px/26px/999px)

> Historial completo de sesiones anteriores en `CLAUDE_HISTORY.md` (no leer automáticamente)
