# Briefing — Bot Telegram: Mesa de Juntas
*Para Code — leer completo antes de escribir una línea*

---

## Qué es esto

Un bot de Telegram personal y privado para Patricio Fávora. Funciona como un diálogo infinito continuo — como un chat de WhatsApp con un socio estratégico que nunca olvida nada. No tiene ninguna relación con WOS3 ni con el bot de tasaciones. Es un proyecto independiente.

---

## Stack

- **Backend:** proyecto Node.js nuevo, deployado en Vercel (serverless)
- **Base de datos:** Supabase — puede ser la misma instancia existente (`mxdesbiyjvdnpehklwcb.supabase.co`) en un schema separado, o instancia nueva
- **IA:** Claude API — modelo `claude-sonnet-4-6-20250514`
- **Canal:** Telegram bot nuevo (token propio, distinto al bot de tasaciones)
- **NO tiene relación con WOS3**

---

## Cómo funciona

```
Pato escribe en Telegram
    ↓
Webhook recibe el mensaje
    ↓
Carga historial completo desde Supabase
    ↓
Carga system prompt (identidad + MESA_JUNTAS.md)
    ↓
Llama a Claude API
    ↓
Guarda respuesta en Supabase
    ↓
Devuelve respuesta a Telegram
```

Es eso. Sin más lógica. Un chat con memoria persistente.

---

## Base de datos — tabla única

```sql
CREATE TABLE mesa_juntas_messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role         text NOT NULL,       -- 'user' | 'assistant'
  content      text NOT NULL,
  created_at   timestamptz DEFAULT now()
);
```

### Carga del historial en cada llamada

- Traer los últimos 60 mensajes ordenados por `created_at ASC`
- Pasarlos como array `messages` a la Claude API
- El system prompt va siempre separado, no dentro del historial

---

## System prompt

Se construye en el código combinando dos partes:

### Parte 1 — Identidad fija (hardcodeada)

```
Sos el consejo asesor privado de Patricio Fávora, CEO de Hasu Activos 
Inmobiliarios SL (marca Wallest), argentino radicado en España.

Este es un espacio privado, continuo y sin filtros. No sos un asistente. 
Sos co-CEO, coach y estratega. Tu trabajo es pensar junto a Pato, 
corregirlo cuando está equivocado, señalar lo que no está viendo y 
ayudarlo a tomar mejores decisiones.

PRINCIPIO RECTOR: Sin etiquetas, sin suavizar, sin validar lo que no 
merece validación. Si está mal, está mal. Si está bien, está bien — 
y cuál es el siguiente paso.

NUNCA:
- Decir "excelente pregunta" ni ninguna variante
- Validar decisiones malas para no incomodar
- Dar opciones sin recomendar una
- Hacer preguntas innecesarias cuando ya tenés contexto suficiente
- Perder tiempo en contexto que Pato ya conoce

Cuando la consulta lo requiera, activás el criterio de los siguientes 
asesores integrado naturalmente en la respuesta — sin anunciarlo, 
sin etiquetas:

Marketing/ventas: Hormozi, Brunson, Kennedy, Belfort, Godin, Gary Vee
Inversión/capital: Buffett, Munger, Cardone
Inmobiliario España: José Muñoz, Carlos Galán, Germán Jover
Desarrollo personal: Sergio Fernández, Brian Tracy, Napoleón Hill
Escala e impacto: Elon Musk
Liderazgo: Marco Aurelio, San Martín

Si Pato pide explícitamente la opinión de un asesor → activalo 
directamente con su voz y frameworks.
```

### Parte 2 — Contexto operativo (dinámico)

El contenido del archivo `MESA_JUNTAS.md` se lee desde el repo en cada arranque del servidor y se concatena al system prompt.

**No hardcodear el contenido del .md en el código.** Leerlo desde archivo para que cuando Pato lo actualice, el bot lo tome automáticamente sin redeploy.

---

## Mensajes largos en Telegram

Límite de Telegram: 4.096 caracteres por mensaje.

Si la respuesta supera ese límite:
1. Cortar en el último salto de párrafo antes del límite
2. Enviar los fragmentos como mensajes consecutivos
3. Nunca cortar en mitad de una frase

---

## Seguridad — usuario único

Este bot es solo para Pato. Si llega un mensaje de un `chat_id` distinto al de Pato → ignorar silenciosamente, no responder.

El `chat_id` de Pato se configura como variable de entorno.

---

## Variables de entorno

```
TELEGRAM_MESA_BOT_TOKEN=        # token del nuevo bot (@BotFather)
TELEGRAM_MESA_CHAT_ID=          # chat_id de Pato (se obtiene del primer mensaje)
ANTHROPIC_API_KEY=              # ya existe si se comparte con WOS3
```

---

## Orden de implementación

1. Crear bot en @BotFather → obtener token
2. Crear proyecto Node.js nuevo en Vercel
3. Crear tabla `mesa_juntas_messages` en Supabase
4. Implementar endpoint webhook `/api/webhook`
5. Implementar lectura dinámica del `MESA_JUNTAS.md`
6. Implementar carga de historial desde Supabase
7. Llamada a Claude API con system + historial + mensaje nuevo
8. Guardar respuesta en Supabase
9. Enviar respuesta a Telegram con manejo de mensajes largos
10. Configurar `TELEGRAM_MESA_CHAT_ID` con el chat_id real de Pato
11. Probar 5 mensajes consecutivos verificando que el historial persiste

---

## Reglas críticas

- **Proyecto independiente** — no tocar WOS3 ni el bot de tasaciones
- **No tocar WOS2** bajo ningún concepto
- **Modelo correcto:** `claude-sonnet-4-6-20250514` sin beta headers
- **Confirmar persistencia real en Supabase** después de cada mensaje — no asumir que funcionó
- **MESA_JUNTAS.md se lee dinámico** — nunca hardcodeado

---

*Preparado por: Claude (canal estratégico HASU) — mayo 2026*
