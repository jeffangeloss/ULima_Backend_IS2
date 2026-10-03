---
name: Modo estático
description: Interruptor MODO_ESTATICO que apaga todo lo que consulta a la Universidad de Lima (registro con miUlima y módulo portal-sync) sin borrar su código, no publica enlaces de sílabo que no sean de Drive, no entrega al chatbot el riesgo de asistencia y deja intacto el resto de la API.
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
  - ../../../src/modules/chatbot/chatbot.repository.ts
  - ../../../src/modules/chatbot/index.ts
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
- RF-EST-2: Con `MODO_ESTATICO=true`, `POST /auth/register` responde `503` con el código `REGISTRATION_UNAVAILABLE`, el mismo que las APK instaladas ya traducen a «El registro no está disponible por ahora». La respuesta no depende del cuerpo ni del límite de tasa, y no se instala el registrador de alumnos en `AuthService`. Enmendada por RF-IRM-3 (spec `interruptor-remoto`), que instala siempre el registrador y cierra la ruta con una guarda que consulta el modo en cada petición.
  `[@test] ../../../test/modo-estatico/modo-estatico.registro.test.ts`
  `[@test] ../../../test/modo-estatico/modo-estatico.arranque.test.ts`
- RF-EST-3: Con `MODO_ESTATICO=true`, toda ruta bajo `/portal-sync` responde `503` con `{"error":{"code":"PORTAL_DESACTIVADO","message":"Esta versión de ULima++ no se conecta con la Universidad de Lima."}}`, para cualquier método y con o sin sesión, sin ejecutar su lógica. Enmendada por RF-IRM-3, que sirve `/portal-sync` con una guarda por petición en lugar de un router elegido al arrancar.
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
- RF-EST-8: Con `MODO_ESTATICO=true`, el contexto que el chatbot arma para Cohere no incluye alertas de inasistencias, porque la versión estática oculta el riesgo de asistencia en toda pantalla donde aparezca. `ChatbotRepository.getAlerts` excluye en la propia consulta, antes de ordenar y de limitar a 20, las filas de `alert` cuyo título empieza con `Alerta de inasistencias - `. `alert` solo tiene `type` y `title`, y esas alertas comparten `type = 'academic_risk'` con las de riesgo de notas, así que el prefijo del título es el único discriminador que existe y es el mismo que descarta el front. El chatbot no lee ningún otro dato de asistencia del portal (horas de asistencia, fecha de la última lectura, récord ni notas de la ULima), y una prueba falla si una consulta nueva los empieza a leer. Con `false` o sin la variable, la consulta y el contexto no cambian.
  `[@test] ../../../test/modo-estatico/modo-estatico.chatbot.test.ts`

## Contrato REST

Con `MODO_ESTATICO=true`:

| Ruta | Respuesta |
| --- | --- |
| `POST /auth/register` | `503` `REGISTRATION_UNAVAILABLE` |
| `/portal-sync` y cualquier ruta bajo él, con cualquier método | `503` `PORTAL_DESACTIVADO` |
| `GET /grades/me/courses` | Igual que con `false`, salvo `silaboUrl`, que vale `null` si la URL guardada no es de Drive |
| `POST /chatbot/sessions/:id/ask` | Igual que con `false`, salvo que el contexto enviado a Cohere no lleva alertas de inasistencias |
| `POST /auth/login`, `POST /auth/google`, `/auth/password-reset/*`, `GET /auth/me` y el resto de los módulos | Igual que con `false` |

Con `MODO_ESTATICO=false` nada cambia.

## Decisiones

- El interruptor se lee una sola vez, en `env.ts`, y los módulos lo consultan desde `config.modoEstatico`.
- El módulo `portal-sync` desactivado no construye los servicios ni los repositorios del portal, y no llama a `authService.setRegistrar`.
- Los datos oficiales que vinieron de la ULima (récord, notas de la ULima y fecha de la última lectura) no se filtran en las rutas del backend: el diseño aprobado los oculta en el front (RF-EST-10) y deja las rutas que solo leen la base respondiendo igual (RF-EST-5). Los enlaces de sílabo sí se filtran aquí, porque RF-EST-12 solo llega con el APK nuevo y las 1.2.0 los abren en el navegador, y el riesgo de asistencia también, pero solo en el contexto del chatbot (RF-EST-8), porque el front no controla lo que el modelo dice. Las notas que lee el chatbot salen de `student_score`, que cargan los docentes y no la importación, y la malla sale de `student_course_progress`, que el diseño deja intacta, así que ninguna de las dos se filtra.
- No hay migración ni cambio de base de datos. Las tablas del portal quedan sin uso.
- No se borra código del portal. Retirarlo queda para una versión mayor posterior.

## Enmiendas

La spec `interruptor-remoto` (`specs/features/interruptor-remoto/interruptor-remoto.spec.md`, aprobada el 2026-10-02) cambia cómo se decide el modo y deja intactas las respuestas de esta spec.

- El modo ya no se lee una sola vez. Lo decide la fila de `app_setting`, que el lector `modoEstatico()` de `src/modules/app-setting/index.ts` recuerda 10 s, y `config.modoEstatico` queda como su respaldo (RF-IRM-2). Reemplaza la primera decisión.
- El registrador de alumnos se instala siempre y los servicios del portal se construyen siempre, porque ninguno hace peticiones al construirse. Una guarda por petición en `POST /auth/register` y otra en `/portal-sync` dan los 503 de RF-EST-2 y RF-EST-3 (RF-IRM-3). Reemplaza la segunda decisión, y RF-EST-4 sigue en pie.
- `GET /grades/me/courses` y el chatbot consultan el lector en cada petición (RF-IRM-3), con las respuestas de RF-EST-7 y RF-EST-8.
- La migración `0016` agrega la tabla `app_setting` (RF-IRM-1). Reemplaza la decisión «No hay migración ni cambio de base de datos».
