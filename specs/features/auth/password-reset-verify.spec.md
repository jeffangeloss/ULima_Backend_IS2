---
name: Password Reset Code Verification
description: Verificar el código de recuperación antes de pedir la contraseña nueva, para que un código equivocado no llegue a la última pantalla
targets:
  - ../../../src/modules/auth/auth.routes.ts
  - ../../../src/modules/auth/auth.controller.ts
  - ../../../src/modules/auth/auth.service.ts
  - ../../../src/modules/auth/auth.schemas.ts
---

# Verificación del código de recuperación

> Estado: **APROBADA** por el dueño del proyecto el 2026-09-07, con la opción **B** de
> RS-AUTH-19. Escrita a partir de su reporte probando la app en el iPhone.

## El problema

Hoy la app avanza a la pantalla de contraseña nueva con **cualquier** código de seis
dígitos. `reset_password_controller.dart:65-73` solo comprueba el formato:

```dart
/// Paso 1 -> 2: valida el formato del código localmente y avanza.
final codeError = validateResetCode(codeController.text.trim());  // ^\d{6}$
step.value = 1;
```

El código real recién se contrasta en `POST /auth/password-reset/confirm`, cuando el
usuario ya escribió la contraseña nueva dos veces. El backend responde correctamente
`400 INVALID_RESET_CODE` y el frontend regresa al paso del código
(`reset_password_controller.dart:124-127`), pero para entonces:

1. El usuario escribió una contraseña que se pierde.
2. **Se consumió uno de los cinco intentos del token**, porque
   `confirmPasswordReset` reserva el intento de forma atómica antes de comparar
   (`auth.service.ts:413`).

No es un fallo de seguridad: un código equivocado nunca cambia la contraseña. Es que
la app aparenta haber aceptado el código.

## User Story

> Como alumno que perdió su contraseña, quiero que la app me diga que el código está
> mal **en la pantalla del código**, para no escribir una contraseña nueva en vano ni
> gastar intentos sin saberlo.

## Requisitos

### RS-AUTH-17 — Endpoint de verificación

`POST /auth/password-reset/verify` es **público** (sin JWT, igual que `/request` y
`/confirm`) y recibe `{ identifier: string, code: string }`.

- Responde `200 { "valid": true }` cuando el código corresponde al último token activo
  del usuario, no expiró, no fue usado y quedan intentos.
- Responde `400 INVALID_RESET_CODE` con el mensaje genérico
  «Código inválido o expirado.» en cualquier otro caso —mismatch, expirado, usado,
  intentos agotados o cuenta inexistente— **sin distinguirlos**, igual que `/confirm`.
  `[@test] ../../../test/HU20_jeff/password-reset-verify.test.ts`

### RS-AUTH-18 — No marca el token como usado

`verify` **no** llama a `markPasswordResetTokenUsed`. El token sigue vivo para que
`/confirm` lo consuma después con el mismo código. Un `verify` correcto seguido de un
`confirm` correcto cambia la contraseña.
`[@test] ../../../test/HU20_jeff/password-reset-verify.test.ts`

### RS-AUTH-19 — Consume un intento, igual que `/confirm`

`verify` reserva un intento con `consumePasswordResetAttempt` **antes** de comparar,
por la misma razón que `/confirm`: sin la reserva atómica, N peticiones concurrentes
podrían superar el límite leyendo un `attempts` obsoleto.

Consecuencia: **un flujo correcto pasa a costar 2 intentos** (uno en `verify`, otro en
`confirm`), cuando hoy cuesta 1. Por eso RS-AUTH-22 sube el límite a 6, de modo que el
presupuesto de equivocaciones se mantenga en 4, igual que hoy.
`[@test] ../../../test/HU20_jeff/password-reset-verify.test.ts`

> **Decisión tomada (2026-09-07): opción B.** `MAX_RESET_ATTEMPTS` sube de 5 a 6, con lo
> que el presupuesto de equivocaciones vuelve a ser 4, el mismo de hoy. Se descartaron:
>
> | opción | efecto |
> |:---|:---|
> | **A — dejarlo en 5** | Un flujo limpio gasta 2. Quedan 3 equivocaciones. Cero cambios extra. |
> | **B — subir `MAX_RESET_ATTEMPTS` a 6** ✅ | **ELEGIDA.** Preserva las 4 equivocaciones de hoy. Una línea en `password-reset.logic.ts:13`. Amplía la ventana de fuerza bruta de 5 a 6 intentos por token de 30 min: contra un espacio de 10⁶ códigos, riesgo despreciable. |
> | **C — no consumir intento cuando el código es correcto** | Preserva el presupuesto sin ampliar la ventana: solo cuentan los fallos, que es lo que la protección contra fuerza bruta necesita medir. Cuesta un `UPDATE` de devolución dentro de la misma transacción y más código en el repositorio. |
>
### RS-AUTH-22 — El límite sube a 6

`MAX_RESET_ATTEMPTS` pasa de 5 a 6 en `password-reset.logic.ts`, para que el intento que
gasta `verify` no le quite margen al usuario. La spec de auth (`auth.spec.md`) menciona el
límite y hay que actualizarla en el mismo cambio.
`[@test] ../../../test/HU20_jeff/password-reset-verify.test.ts`

### RS-AUTH-20 — Mismo rate limit que `/confirm`

`verify` no crea tokens ni envía correos, así que no toca
`PASSWORD_RESET_MAX_PER_HOUR`. Su única protección es el contador de intentos del token
(RS-AUTH-19), que es el mismo que protege a `/confirm`.

### RS-AUTH-21 — El frontend deja de mentir

`reset_password_controller.continueToPassword()` pasa a ser asíncrona: valida el formato
en local (sin ir a la red si el código no tiene seis dígitos) y recién entonces llama a
`verify`. Solo avanza a `step 1` con `200`. Con `400` se queda en el paso del código y
muestra «Código inválido o expirado.».

El botón muestra spinner mientras la petición está en vuelo y queda deshabilitado, para
que dos toques no gasten dos intentos.
`[@test] frontend — ../../../../ULima_Frontend_IS2/test/HU20_jeff/reset_password_controller_verify_test.dart`

## Contrato

```
POST /auth/password-reset/verify
Body: { "identifier": "20230001", "code": "123456" }

200 → { "valid": true }
400 → { "error": { "code": "INVALID_RESET_CODE", "message": "Código inválido o expirado." } }
400 → { "error": { "code": "INVALID_REQUEST_BODY", ... } }   // formato del body
```

`identifier` acepta lo mismo que `/confirm`: código de alumno o correo institucional.

## Qué NO entra

- No se toca `/confirm`: sigue validando el código por su cuenta. `verify` es una
  comprobación previa, nunca un permiso. Un cliente que llame directo a `/confirm`
  se comporta exactamente como hoy.
- No se devuelve cuántos intentos quedan: sería un oráculo para un atacante.
- No se unifican las dos pantallas del frontend en una. Se evaluó y el dueño eligió
  mantener los dos pasos el 2026-09-07.
