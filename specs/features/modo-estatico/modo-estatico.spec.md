---
name: Modo estático
description: Interruptor MODO_ESTATICO que apaga todo lo que consulta a la Universidad de Lima (registro con miUlima y módulo portal-sync) sin borrar su código, no publica enlaces de sílabo que no sean de Drive y deja intacto el resto de la API.
targets:
  - ../../../src/config/env.ts
  - ../../../src/config/app-config.ts
  - ../../../src/modules/auth/auth.routes.ts
  - ../../../src/modules/auth/index.ts
  - ../../../src/modules/portal-sync/index.ts
  - ../../../src/modules/portal-sync/portal-sync-desactivado.routes.ts
  - ../../../src/modules/grades/index.ts
  - ../../../src/modules/grades/grades.service.ts
  - ../../../src/modules/grades/grades.logic.ts
  - ../../../.env.example
  - ../../../test/modo-estatico/**
---

# Modo estático

> Origen: diseño aprobado por el dueño el 2026-10-02 (`docs/specs/2026-10-02-version-estatica-design.md` del repositorio privado de trabajo). La versión estática reemplaza a la actual mediante un interruptor y no convive con ella.

## Contexto

Todo el tráfico hacia la Universidad de Lima sale de `src/services/portal.client.ts` (`PortalClient`) y solo lo usan tres rutas que el alumno dispara a mano, `POST /auth/register`, `POST /portal-sync/import` y `POST /portal-sync/refresh`. No hay tareas programadas. El modo estático apaga esas rutas detrás de una variable de entorno. El código del portal queda en el repositorio y retirarlo se deja para una versión mayor posterior.

## Requirements

- RF-EST-1: `src/config/env.ts` acepta `MODO_ESTATICO` con los valores `"true"` o `"false"` y por defecto `false`, la expone como booleano en `env.MODO_ESTATICO` y `config.modoEstatico`, y rechaza cualquier otro valor al arrancar. `.env.example` la documenta y `test/devops/env-example.test.ts` sigue en verde.
  `[@test] ../../../test/modo-estatico/modo-estatico.env.test.ts`
  `[@test] ../../../test/devops/env-example.test.ts`
- RF-EST-2: Con `MODO_ESTATICO=true`, `POST /auth/register` responde `503` con el código `REGISTRATION_UNAVAILABLE`, el mismo que las APK instaladas ya traducen a «El registro no está disponible por ahora». La respuesta no depende del cuerpo ni del límite de tasa, y no se instala el registrador de alumnos en `AuthService`.
  `[@test] ../../../test/modo-estatico/modo-estatico.registro.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`
- RF-EST-3: Con `MODO_ESTATICO=true`, toda ruta bajo `/portal-sync` responde `503` con `{"error":{"code":"PORTAL_DESACTIVADO","message":"Esta versión de ULima++ no se conecta con la Universidad de Lima."}}`, para cualquier método y con o sin sesión, sin ejecutar su lógica.
  `[@test] ../../../test/modo-estatico/modo-estatico.portal-sync.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`
- RF-EST-4: Con `MODO_ESTATICO=true`, ninguna petición llega a un método de `PortalClient`. Una prueba recorre las rutas afectadas con un `PortalClient` espía y comprueba cero llamadas.
  `[@test] ../../../test/modo-estatico/modo-estatico.espia.test.ts`
- RF-EST-5: Con `MODO_ESTATICO=true`, el login con código, el login con Google, la recuperación de contraseña y las rutas que solo leen la base responden igual que con `false`, salvo el campo `silaboUrl` de `GET /grades/me/courses` (RF-EST-7).
  `[@test] ../../../test/modo-estatico/modo-estatico.regresion-login.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`
- RF-EST-6: Con `MODO_ESTATICO=false` o sin la variable, el comportamiento es idéntico al actual y la suite existente pasa sin cambios de expectativa.
  `[@test] ../../../test/modo-estatico/modo-estatico.registro.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.portal-sync.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`

- RF-EST-7: Con `MODO_ESTATICO=true`, el campo `silaboUrl` de `GET /grades/me/courses` solo entrega enlaces de Drive (`drive.google.com`, `drive.usercontent.google.com` o `docs.google.com`, los mismos hosts que acepta el visor de la app) y vale `null` para cualquier otra URL. La importación del portal guardó en `syllabus.drive_file_url` URLs de `cactus.ulima.edu.pe`, y las APK 1.2.0 ya instaladas las abren en el navegador, de modo que el backend no las publica. Con `false` o sin la variable, la respuesta no cambia. La columna no se modifica.
  `[@test] ../../../test/modo-estatico/modo-estatico.silabos.test.ts`

## Contrato REST

Con `MODO_ESTATICO=true`:

| Ruta | Respuesta |
| --- | --- |
| `POST /auth/register` | `503` `REGISTRATION_UNAVAILABLE` |
| `/portal-sync` y cualquier ruta bajo él, con cualquier método | `503` `PORTAL_DESACTIVADO` |
| `GET /grades/me/courses` | Igual que con `false`, salvo `silaboUrl`, que vale `null` si la URL guardada no es de Drive |
| `POST /auth/login`, `POST /auth/google`, `/auth/password-reset/*`, `GET /auth/me` y el resto de los módulos | Igual que con `false` |

Con `MODO_ESTATICO=false` nada cambia.

## Decisiones

- El interruptor se lee una sola vez, en `env.ts`, y los módulos lo consultan desde `config.modoEstatico`.
- El módulo `portal-sync` desactivado no construye los servicios ni los repositorios del portal, y no llama a `authService.setRegistrar`.
- Los datos oficiales que vinieron de la ULima (récord, notas de la ULima, riesgo de asistencia y fecha de la última lectura) no se filtran en el backend: el diseño aprobado los oculta en el front (RF-EST-10) y deja las rutas que solo leen la base respondiendo igual (RF-EST-5). Los enlaces de sílabo sí se filtran aquí, porque RF-EST-12 solo llega con el APK nuevo y las 1.2.0 los abren en el navegador.
- No hay migración ni cambio de base de datos. Las tablas del portal quedan sin uso.
- No se borra código del portal. Retirarlo queda para una versión mayor posterior.
