# WOS3 — Reglas críticas

## Repos y bases de datos

- Repo activo: `github.com/patomdq/wos3` — trabajar SIEMPRE aquí
- Supabase activo: `mxdesbiyjvdnpehklwcb.supabase.co` — lectura/escritura
- Supabase W2: `zzidqchvcijqgcexrzca.supabase.co` — SOLO LECTURA, nunca escribir

## Fórmula ROI — única válida

```
ROI = (venta - compra - reforma - gastos - impuestos)
      / (compra + reforma + gastos + impuestos)
```

- ROI mínimo aceptable: 30% escenario conservador
- Nunca redondear hacia arriba
- No modificar `/lib/formulas.ts` sin instrucción explícita

## Gastos fijos por operación

- ITP: 2% sobre precio de compra
- Notaría compra: ~500€
- Registro: ~500€

## Reglas absolutas

- HASU y JV son entidades contables separadas — NUNCA mezclar
- Toda escritura en DB pasa por el bot — sin endpoints de escritura directa
- El bot responde siempre en español

## Pipeline de estados

```
Radar → En Estudio → En Negociación → Comprada → En Reforma → En Venta → Vendida
```

- Al pasar de Radar a En Estudio, el inmueble desaparece del módulo Radar
- Solo operaciones con estado `vendida` suman al objetivo 1M€

## Lo que nunca hacer

1. Mezclar datos HASU con JV en queries o UI
2. Modificar `/lib/formulas.ts` sin autorización
3. Cambiar stack (Next.js, Supabase, Vercel son inamovibles)
4. Usar `any` en TypeScript sin justificación
