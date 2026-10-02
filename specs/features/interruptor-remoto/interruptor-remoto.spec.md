---
name: Interruptor remoto del modo estático
description: Una fila de la tabla app_setting decide el modo estático del backend y de las APK 2.1.0. Se edita desde la consola de Neon y rige en unos 10 s sin redesplegar. MODO_ESTATICO queda como respaldo y GET /config informa el modo sin token.
targets:
  - ../../../drizzle/0016_app_setting.sql
  - ../../../src/db/schema/schema.ts
  - ../../../src/modules/app-setting/**
  - ../../../src/modules/public-config/**
  - ../../../src/modules/index.ts
  - ../../../src/modules/auth/auth.routes.ts
  - ../../../src/modules/auth/index.ts
  - ../../../src/modules/portal-sync/index.ts
  - ../../../src/modules/portal-sync/portal-sync-desactivado.routes.ts
  - ../../../src/modules/grades/index.ts
  - ../../../src/modules/grades/grades.service.ts
  - ../../../src/modules/chatbot/index.ts
  - ../../../src/modules/chatbot/chatbot.repository.ts
  - ../../../.env.example
  - ../../../test/interruptor-remoto/**
  - ../../../test/modo-estatico/**
---

# Interruptor remoto del modo estático

> Origen: diseño aprobado por el dueño el 2026-10-02 (`docs/specs/2026-10-02-interruptor-remoto-design.md` del repositorio privado de trabajo). Enmienda la spec `modo-estatico` en RF-EST-2, RF-EST-3 y sus decisiones.
>
> Aprobada por el dueño el 2026-10-02, junto con el plan de implementación, el contrato de `GET /config`, la enmienda de la spec `modo-estatico` y el cambio de BD de la migración `0016`. La aprobación cubre cuatro precisiones del diseño, que son el tope de 5 s de la consulta, el valor de respaldo recordado 10 s, la consulta compartida entre peticiones simultáneas y `HEAD /config` con `404`.

## Contexto

En la 2.0.0 el backend lee `MODO_ESTATICO` una sola vez al importar `src/config/env.ts`, así que cada cambio exige un despliegue nuevo. Desde la 2.1.0 el modo lo decide una fila de la base, que se edita en la consola de Neon, y la variable queda como respaldo. Se descartan la variable de Vercel con redespliegue, que tarda de 1 a 2 min, y Global Config de Vercel, cuyo plan Hobby incluye 100 000 lecturas y 100 escrituras al mes sin posibilidad de comprar más.

## Requirements

- RF-IRM-1: La migración `drizzle/0016_app_setting.sql` crea la tabla `app_setting` con una sola fila posible (`id smallint PRIMARY KEY DEFAULT 1` y el CHECK `chk_app_setting_single_row (id = 1)`), la columna `static_mode boolean NOT NULL` y `updated_at timestamptz NOT NULL DEFAULT now()`, e inserta la fila `(1, true)` si no existe. Es aditiva e idempotente y se aplica con `bun run db:apply drizzle/0016_app_setting.sql`, primero en la rama `develop` de Neon y después en producción con permiso explícito del dueño. `src/db/schema/schema.ts` declara la tabla como `appSetting`.
  `[@test] ../../../test/interruptor-remoto/migracion-0016.test.ts`
  `[@test] ../../../test/interruptor-remoto/app-setting.postgres.test.ts`
- RF-IRM-2: Un único lector, `modoEstatico(): Promise<boolean>` de `src/modules/app-setting/index.ts`, resuelve el modo en este orden. Primero la fila de `app_setting`; si la consulta falla, tarda más de 5 s o la fila no existe, el último valor leído en el proceso; si no hay ninguno, el valor de `MODO_ESTATICO`. Recuerda el valor 10 s por instancia, comparte una sola consulta entre peticiones simultáneas, admite inyectar la consulta y el reloj y nunca lanza. Dentro de `src/modules`, solo `app-setting/index.ts` lee la configuración del modo.
  `[@test] ../../../test/interruptor-remoto/modo-estatico.lector.test.ts`
  `[@test] ../../../test/interruptor-remoto/app-setting.postgres.test.ts`
  `[@test] ../../../test/interruptor-remoto/interruptor-remoto.lecturas.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`
- RF-IRM-3: `POST /auth/register`, toda ruta bajo `/portal-sync`, `GET /grades/me/courses` y las alertas del contexto del chatbot consultan el lector en cada petición y conservan las respuestas de RF-EST-2, RF-EST-3, RF-EST-7 y RF-EST-8. El registrador de alumnos se instala siempre en `AuthService`. `/portal-sync` se sirve con `protegerRutasPortalSync`, una guarda por petición que responde 503 `PORTAL_DESACTIVADO` antes del middleware de sesión, de modo que RF-EST-4 (cero llamadas a `PortalClient` en modo estático) sigue en pie.
  `[@test] ../../../test/interruptor-remoto/interruptor-remoto.rutas.test.ts`
  `[@test] ../../../test/interruptor-remoto/interruptor-remoto.lecturas.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.espia.test.ts`
- RF-IRM-4: `GET /config` responde `200` sin token con `{"modoEstatico":<bool>}`, tomado del mismo lector, y con `Cache-Control: no-store`. Ningún otro método responde `200`, y `HEAD`, `POST`, `PUT`, `PATCH` y `DELETE` responden `404`. Vive en `src/modules/public-config`, que solo depende del lector, de modo que siempre informa el modo que el backend aplica.
  `[@test] ../../../test/interruptor-remoto/interruptor-remoto.config.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`
- RF-IRM-5: Con la fila en `true` o en `false`, el backend responde como la 2.0.0 con `MODO_ESTATICO=true` o `false`, y un cambio de la fila rige sin reiniciar el proceso a más tardar 10 s después. La suite existente pasa sin cambios de expectativa, salvo las pruebas que fijan el modo al construir los módulos, que pasan a recibir un lector fijo (`modoFijo`).
  `[@test] ../../../test/modo-estatico/modo-estatico.registro.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.regresion-login.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.portal-sync.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.silabos.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.chatbot.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`

## Contrato REST

| Ruta | Respuesta |
| --- | --- |
| `GET /config` | `200` `{"modoEstatico":true}` o `{"modoEstatico":false}`, sin token y con `Cache-Control: no-store` |
| `HEAD`, `POST`, `PUT`, `PATCH` y `DELETE` sobre `/config` | `404` |
| `POST /auth/register`, `/portal-sync/**`, `GET /grades/me/courses`, `POST /chatbot/sessions/:id/ask` | Las de la spec `modo-estatico` para el modo que da el lector en esa petición |

## Modelo de datos

`app_setting` (migración `0016`), con una sola fila.

| Columna | Tipo | Regla |
| --- | --- | --- |
| `id` | `smallint` | `PRIMARY KEY DEFAULT 1` y CHECK `chk_app_setting_single_row (id = 1)` |
| `static_mode` | `boolean` | `NOT NULL`. `true` es estático y `false` dinámico |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

## Decisiones

- La fila se edita en la consola de Neon (tabla `app_setting`, celda `static_mode`) o con `UPDATE app_setting SET static_mode = false, updated_at = now() WHERE id = 1;` en el editor SQL. Producción queda en `true` al publicar la 2.1.0.
- El lector corta la consulta a los 5 s, el mismo tope de la consulta de la app, para que una base colgada no retenga las peticiones. También recuerda 10 s el valor de respaldo, para no consultar en cada petición mientras la base no responde, y las peticiones que llegan juntas comparten una sola consulta.
- `HEAD /config` responde `404` para que ningún otro método responda `200`. Hono atiende `HEAD` con el handler de `GET` y, sin ese corte, respondería `200` sin cuerpo.
- La tabla la lee solo `AppSettingRepository`, y ninguna ruta la escribe.
- Si el código llega a un entorno antes que la `0016`, la consulta falla y rige `MODO_ESTATICO`, así que el orden de despliegue no rompe nada.
- Los Preview de las ramas `feat/*` usan la base de producción por la integración de Neon, así que comparten su fila.
