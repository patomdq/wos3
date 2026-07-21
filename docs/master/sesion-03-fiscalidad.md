# Sesión 03 — Fiscalidad Inmobiliaria Avanzada

## Diagrama de Flujo IVA / TPO / AJD

La fiscalidad de la compraventa depende de **quién vende** y **qué tipo de inmueble** es.

### Supuesto 1 — Empresa vende a empresa (B2B)

```
¿Es sujeto pasivo de IVA el vendedor?
   └─ Sí → ¿Está el inmueble exento de IVA? (2ª entrega o más)
               └─ Sí → ¿Se renuncia a la exención?
                          └─ Sí → IVA + AJD (ISP si comprador es sujeto pasivo)
                          └─ No → TPO
               └─ No (1ª entrega / obra nueva) → IVA + AJD
   └─ No → TPO
```

### Supuesto 2 — Concurso de acreedores / Subasta judicial

- La venta en concurso o subasta **siempre tributa por IVA** (si el deudor era sujeto pasivo)
- Se aplica ISP: el comprador se auto-repercute el IVA
- AJD adicional si aplica

### Supuesto 3 — Empresa vende a particular

- Si es 1ª entrega → **IVA** (10% vivienda, 21% local)
- Si es 2ª entrega o más:
  - Sin renuncia → **TPO** (variable por CCAA, ~8-10%)
  - Con renuncia a exención → **IVA + AJD** (solo si comprador es sujeto pasivo con derecho a deducción)

### Tipos impositivos de referencia

| Operación | Tipo |
|---|---|
| Vivienda 1ª entrega | IVA 10% |
| Vivienda VPO 1ª entrega | IVA 4% |
| Local / garaje / suelo | IVA 21% |
| TPO vivienda (depende CCAA) | ~8-10% |
| AJD documentos notariales | ~1-1,5% |

---

## ISP — Inversión del Sujeto Pasivo

### Concepto

Mecanismo por el cual **el comprador, no el vendedor, es quien ingresa el IVA en Hacienda**.

Se aplica en operaciones B2B cuando:
1. Venta en **ejecución de garantía** (subasta, concurso)
2. **Renuncia a la exención del IVA** en 2ª entrega

### Cómo funciona (auto-repercusión)

El comprador:
1. **Repercute el IVA a sí mismo** (lo anota como IVA devengado)
2. **Lo deduce en el mismo modelo 303** (si tiene derecho a deducción plena)
3. Resultado neto = 0€ de coste fiscal si hay deducción total

### Ejemplo práctico — Local comercial 100.000€

**Caso A: Comprador con actividad exenta (arrendamiento viviendas)**
- IVA soportado: 21.000€
- IVA deducible: 0€ (actividad exenta)
- **Coste real del IVA: 21.000€**

**Caso B: Comprador con actividad gravada (arrendamiento local)**
- IVA soportado: 21.000€
- IVA deducible: 21.000€ (actividad gravada)
- **Coste real del IVA: 0€**

> **Clave HASU:** Antes de optar por ISP/renuncia a exención, verificar si la actividad que se va a desarrollar permite deducir el IVA. Si no, mejor pagar TPO.

---

## Renuncia a la Exención del IVA

### Cuándo procede

- Solo en **2ª entrega** (o posteriores) de inmuebles
- Vendedor es sujeto pasivo de IVA
- Comprador es sujeto pasivo de IVA **con derecho a deducción total o parcial**

### Requisitos

1. Comunicación fehaciente al comprador antes o en el momento de la operación
2. El comprador debe acreditar que tiene derecho a deducir el IVA
3. Manifestación expresa en la escritura de compraventa

### Efecto

- Se aplica **IVA** en lugar de TPO
- Se paga **AJD** adicionalmente (~1-1,5%)
- Se activa **ISP** (el comprador ingresa el IVA)

### Cuándo conviene renunciar

✅ Conviene si el comprador puede deducir el IVA (uso en actividad gravada)
❌ No conviene si la actividad es exenta o si el comprador es particular

---

## Rehabilitación Fiscal — El Doble Test

Para que una obra se considere **rehabilitación** a efectos del IVA (y por tanto 1ª entrega):

### Test 1 — Cualitativo (estructural)
- La obra debe afectar a **elementos estructurales** del edificio:
  - Cimentación, estructura portante, cubierta, fachadas
- Basta con que se actúe sobre **alguno** de estos elementos

### Test 2 — Cuantitativo (coste)
- El coste de la obra supera el **25% del precio de adquisición** del inmueble
- (No del valor de mercado, sino del precio pagado)

### Si pasa los dos tests:
- La entrega tributa como **1ª entrega** → **IVA 10%**
- Se puede renunciar a exención solo si no cumple los tests

### Importancia práctica para HASU

- Compra edificio en ruinas por 200k€ + reforma 100k€ (50% del precio) → **Rehabilitación fiscal** → IVA 10% en la venta
- Compra piso por 150k€ + reforma 30k€ (20% del precio) → No es rehabilitación → 2ª entrega → exenta de IVA / TPO para el comprador

---

## Obra Nueva por Antigüedad — Art. 28.4 TRLSRU

### Concepto

Mecanismo para **inscribir en el Registro** edificaciones ya existentes que no están registradas, sin necesidad de licencia de obra.

Regulado en el **Art. 28.4 del Texto Refundido de la Ley del Suelo y Rehabilitación Urbana**.

### Las 3 Figuras

#### Figura 1 — Declaración de Obra Nueva por Antigüedad (plena)
- **Cuándo:** edificio terminado exteriormente, sin posibilidad de actuación de restauración de la legalidad urbanística
- **Requisito:** han transcurrido los plazos de prescripción de la infracción urbanística (varía por CCAA: 4/6/8/10/15 años)
- **Prueba:** certificado técnico + foto aérea que acredite la antigüedad

#### Figura 2 — Declaración de Obra Nueva Terminada (vía normal)
- Requiere **licencia de primera ocupación** o equivalente
- Para edificios que sí tienen tramitada la licencia de obra y fin de obra

#### Figura 3 — Declaración de Obra Nueva en Construcción
- Para edificios en curso
- Requiere licencia de obra en vigor
- Se completa con acta de fin de obra posterior

### Lo que hace y lo que NO hace la antigüedad

| Sí hace | No hace |
|---|---|
| Permite inscribir el edificio en el Registro | Legaliza el edificio urbanísticamente |
| Elimina la posibilidad de demolición por prescripción | Elimina multas pendientes |
| Permite vender con acceso a hipoteca | Da licencia de primera ocupación |
| Desbloquea operaciones con edificios no inscritos | Acredita que el edificio cumple el CTE |

### Primera vs Segunda Entrega — ¿Cuándo se "resetea"?

- Edificio construido hace 20 años: 2ª entrega → exento de IVA / TPO
- Si se hace **rehabilitación** (pasa doble test): se considera **1ª entrega** → IVA 10%
- Si se hace obra nueva por antigüedad SIN rehabilitación: sigue siendo 2ª entrega

---

## Los 9 Trucos Fiscales

### Truco 1 — IS al 15% para nuevas empresas
- Las **sociedades de nueva creación** tributan al **15% en IS** los 2 primeros años con base positiva
- Aprovechar para crear nueva sociedad al inicio de una operación grande

### Truco 2 — Liquidación complementaria
- Si Hacienda comprueba el valor declarado en TPO y lo eleva → **liquidación complementaria**
- Estrategia: **recurrir siempre** las valoraciones de Hacienda que superen el precio pagado
- Los tribunales dan la razón al contribuyente con más frecuencia de lo que parece

### Truco 3 — Comprar la sociedad vs comprar el inmueble
- Si una sociedad tiene un inmueble en balance, puede ser más barato **comprar las participaciones** de la sociedad que el inmueble directamente
- La compra de participaciones tributa por IVA/TPO solo si hay inmuebles en más del 50% del activo (art. 314 LMV) — y con condiciones
- Ahorro potencial en TPO/IVA + posible aprovechamiento de bases imponibles negativas de la sociedad

### Truco 4 — Hipotecante no deudor
- Una sociedad puede hipotecar un inmueble para garantizar deuda de otra entidad
- El hipotecante no deudor puede **deducir los intereses** en ciertas estructuras
- Útil en financiación intragrupo

### Truco 5 — Reducción de capital con entrega de inmuebles
- En lugar de vender el inmueble (tributando en IS + IRPF socio), la sociedad **reduce capital** entregando el inmueble al socio
- Puede diferir o reducir la tributación del socio si se estructura bien
- Requiere valoración y análisis caso por caso

### Truco 6 — Disolución de proindiviso
- Cuando hay un inmueble en copropiedad (herencia, divorcio, etc.), la **extinción del proindiviso** tributa por AJD (~1%) en lugar de TPO (~8-10%)
- Ahorro significativo al adjudicar la propiedad a uno de los copropietarios

### Truco 7 — Hackear el valor de referencia
- Desde 2022, Hacienda usa el **Valor de Referencia Catastral** como base mínima en TPO/IVA
- Si el VR es superior al precio real: **impugnar** y acreditar el precio real de mercado
- El VR se puede consultar y recurrir en sede electrónica del Catastro

### Truco 8 — Transmisión C-AV-V sin impuestos
- Estructura: **Cesión → Aportación → Venta**
- Aportación de inmueble a sociedad (neutralidad fiscal bajo FEAC) → venta de participaciones
- Permite diferir la tributación y optimizar la salida

### Truco 9 — Vender tributando casi 0%
- Combinación de: plusvalía latente + compensación con pérdidas patrimoniales pendientes
- O estructura de venta a través de holding con exención del 95% en dividendos intergrupo
- Análisis individual necesario — no es universal

---

## Aplicación en WOS3

Cuando Claude analice una operación de compraventa:
1. **Identificar el supuesto** (B2B / concurso / particular) para determinar IVA vs TPO
2. **Verificar si hay 2ª entrega** y si conviene renunciar a la exención
3. **Calcular el doble test** de rehabilitación si hay reforma significativa
4. **Comprobar si el inmueble necesita obra nueva por antigüedad** para inscribirlo
5. **Señalar qué trucos fiscales aplican** a la estructura concreta

---

## Archivos originales (sesión 03)
- `ISP+Rehabilitacion.pdf`
- `Obra nueva por antigüedad.pdf`
- `Trucos Fiscales.pdf`
- Presentación diagramas de flujo IVA/TPO/AJD
