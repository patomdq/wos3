# WOS3 — Wallest Operating System
## Contexto del proyecto

WOS3 es el sistema operativo interno de **Hasu Activos Inmobiliarios SL** (marca comercial: **Wallest**).  
Promotora inmobiliaria española con modelo buy-renovate-sell. Mercado principal: Andalucía.  
CEO: Patricio Fávora. Cuenta operativa: hola@hasu.in  
Objetivo: 1.000.000€ de beneficio neto acumulado de operaciones **vendidas** antes de fin de 2027.

---

## Stack técnico

- **Framework:** Next.js 14 con App Router
- **Estilos:** Tailwind CSS
- **Base de datos + Auth:** Supabase
- **IA central:** Claude API (bot principal de entrada de datos y consultas)
- **Deploy:** Vercel
- **Cuenta Google activa:** hola@hasu.in

## MCPs conectados

| MCP | Uso |
|-----|-----|
| Vercel | Deploy y gestión de proyectos |
| Supabase | DB, migraciones, edge functions |
| Google Calendar | Agenda operativa (hola@hasu.in) |
| Gmail | Comunicaciones (hola@hasu.in) |
| Google Drive | Documentación y archivos |

---

## Supabase — Proyectos activos

| Proyecto | URL | Acceso |
|----------|-----|--------|
| Principal (WOS3) | `mxdesbiyjvdnpehklwcb.supabase.co` | Lectura / Escritura |
| W2 (legacy) | `zzidqchvcijqgcexrzca.supabase.co` | Solo lectura |

- Usar siempre el proyecto principal para operaciones nuevas
- W2 solo para consultas históricas, nunca para escritura

---

## Reglas de negocio — CRÍTICAS

### Fórmula ROI (única válida)
```
ROI = (venta - compra - reforma - gastos - impuestos) 
      / (compra + reforma + gastos + impuestos)
```
**ROI mínimo aceptable: 30% en escenario conservador.**  
Nunca calcular ROI con otra fórmula. Nunca redondear hacia arriba.

### Gastos fijos por operación
- ITP: 2% sobre precio de compra
- Notaría compra: ~500€
- Registro: ~500€
- Aplicar siempre en los tres escenarios: conservador, base y optimista

### Separación HASU / JV — REGLA ABSOLUTA
- Las operaciones propias de HASU y las operaciones en Joint Venture (JV) son **entidades contables separadas**
- **NUNCA mezclar** flujos, beneficios ni métricas entre HASU y JV
- Siempre etiquetar cada operación con su entidad correspondiente

### Objetivo 1M€
- El millón de euros es **beneficio neto acumulado** de operaciones con estado **Vendida**
- No es facturación, no es valor de cartera, no es estimado
- Solo suman operaciones con estado = `vendida` y beneficio neto real cerrado

---

## Pipeline de estados de una operación

```
Radar → En Estudio → En Negociación → Comprada → En Reforma → En Venta → Vendida
```

### Reglas de transición
- Un inmueble que pasa de **Radar** a **En Estudio** desaparece del módulo Radar
- **Toda entrada de datos pasa por el bot** — sin entrada manual directa en la base de datos
- El bot es el único punto de entrada de operaciones, actualizaciones y registros

---

## Arquitectura del bot (Claude API)

- El bot central es la interfaz principal del sistema
- Procesa lenguaje natural y traduce a operaciones de base de datos
- Valida reglas de negocio antes de cualquier escritura
- Responde siempre en español
- Nunca permite entrada de datos que viole las reglas de negocio anteriores

---

## Convenciones de código

- Español para: nombres de variables de negocio, comentarios, strings de UI
- Inglés para: componentes React, funciones técnicas, nombres de archivos
- App Router de Next.js 14 — usar `server components` por defecto, `client components` solo cuando sea necesario
- Supabase: usar Row Level Security (RLS) en todas las tablas
- Tailwind: no usar estilos inline salvo casos excepcionales

---

## Estructura de carpetas (referencia)

```
/app              → rutas Next.js (App Router)
/components       → componentes reutilizables
/lib              → utilidades, cliente Supabase, helpers
/lib/formulas.ts  → fórmulas financieras (ROI, etc.) — NO modificar sin autorización
/types            → tipos TypeScript globales
```

---

## Lo que NUNCA debe hacer Code en este proyecto

1. Modificar fórmulas financieras en `/lib/formulas.ts` sin instrucción explícita
2. Mezclar datos de operaciones HASU con JV en queries o UI
3. Crear endpoints que permitan escritura directa en la DB sin pasar por validación del bot
4. Cambiar el stack (no proponer alternativas a Next.js, Supabase o Vercel)
5. Usar `any` en TypeScript sin justificación

---

## Comandos frecuentes

```bash
npm run dev          # desarrollo local
npm run build        # build de producción
vercel --prod        # deploy manual
supabase db push     # aplicar migraciones
```

---

*Última actualización: Abril 2026*  
*Mantener este archivo actualizado ante cualquier cambio estructural del proyecto.*
