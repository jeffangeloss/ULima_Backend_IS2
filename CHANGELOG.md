# Registro de cambios

Todos los cambios notables del backend de ULima++ se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/). El workflow `release.yml` toma de aquí las notas de cada GitHub Release, así que el encabezado de cada versión tiene que ser exactamente `## [X.Y.Z] - AAAA-MM-DD`. Por la misma razón no se agregan al final del archivo definiciones de enlace como `[X.Y.Z]: url`, porque el `awk` de `release.yml` lee la sección más antigua hasta el final del archivo y las incluiría en sus notas.

## [2.0.0] - 2026-10-02

Esta versión retira funcionalidades de forma controlada, porque con `MODO_ESTATICO=true` el backend deja de consultar a la Universidad de Lima. Con la variable en `false` o ausente el comportamiento es el de la 1.1.0.

### Añadido

- Variable de entorno `MODO_ESTATICO`, que acepta `true` o `false`, vale `false` por defecto y detiene el arranque con cualquier otro valor. Está documentada en `.env.example`, en `docs/devops.md` y en la sección «Modo estático» del README.
- Con `MODO_ESTATICO=true`, `POST /auth/register` responde `503` con el código `REGISTRATION_UNAVAILABLE`, el mismo que las APK instaladas ya traducen a «El registro no está disponible por ahora», y toda ruta bajo `/portal-sync` responde `503` con el código `PORTAL_DESACTIVADO`. Ninguna petición llega a `PortalClient`, y el login con código, el login con Google, la recuperación de contraseña y las rutas que solo leen la base responden igual que antes.
- Con `MODO_ESTATICO=true`, `silaboUrl` de `GET /grades/me/courses` vale `null` salvo que la URL guardada sea de Drive, porque la importación del portal guardó URLs de `cactus.ulima.edu.pe` y las APK 1.2.0 las abren en el navegador. La columna `syllabus.drive_file_url` no se modifica.
- Con `MODO_ESTATICO=true`, el contexto del chatbot no incluye las alertas «Alerta de inasistencias - <curso>», porque `ChatbotRepository.getAlerts` las excluye por el prefijo del título (único discriminador, ya que comparten `type` con el riesgo de notas), y con `false` el contexto no cambia.
- La spec `specs/features/modo-estatico/modo-estatico.spec.md` con las reglas RF-EST-1 a RF-EST-8 y las pruebas de `test/modo-estatico/`, que cubren los dos valores del interruptor, un `PortalClient` espía con cero llamadas, la regresión de login y el arranque completo de la app en cada modo.

### Cambiado

- `package.json` pasa de la versión `1.1.0` a la `2.0.0`.
- `.env.example` lista 24 variables.

### Sin cambios

- No hay migración ni cambio de base de datos. El código del portal no se borra, queda apagado detrás del interruptor, y retirarlo se deja para una versión mayor posterior.

## [1.1.0] - 2026-10-02

Esta versión no cambia el comportamiento de la API. Agrega la CI, la publicación automática de versiones y los archivos que dejan versionados los entornos de pruebas y de producción.

### Añadido

- `develop` como rama de integración. Las ramas de trabajo (`feat/*`, `fix/*`, `docs/*`, `chore/*`, `test/*` y `refactor/*`) salen de `develop` y entran a él por PR, y `main` solo recibe PR de `develop` o de `hotfix/*`.
- CI en `.github/workflows/ci.yml`. El job `pruebas` instala con `bun install --frozen-lockfile`, compila con `bun run build` y corre `bun test` con un servicio `postgres:17`, de modo que las cinco pruebas `*.postgres.test.ts` se ejecutan en cada PR y en cada push a `develop` y `main`. El job `flujo` rechaza todo PR a `main` cuya rama de origen no sea `develop` ni `hotfix/*`.
- Publicación automática en `.github/workflows/release.yml`. Cuando llega a `main` un `package.json` con una versión sin tag, crea el tag `vX.Y.Z` y un GitHub Release con la sección correspondiente de este archivo. Las ejecuciones corren una por una, en un grupo de concurrencia `release` que no cancela la que está en curso.
- `.env.example` con las 23 variables de `src/config/env.ts`, cada una con su descripción y ningún valor real, y la prueba `test/devops/env-example.test.ts`, que falla si sus claves difieren de las del esquema o si sus valores de ejemplo no pasan la validación.
- `.bun-version` con Bun 1.4.2, la versión que usan la CI y las instalaciones locales.
- `docs/devops.md` con las ramas, la publicación de versiones, el hotfix, los entornos (incluida la región `iad1` que fija `vercel.json`), las migraciones y la CI.

### Cambiado

- `package.json` pasa de la versión `0.1.0` a la `1.1.0`.
- El README describe la CI, `.env.example`, el flujo de ramas con `develop` y los entornos, y remite a `docs/devops.md` en lugar de repetirlo.

### Corregido

- `.gitignore` ya no ignora `.env.example`, porque el patrón `.env*` anulaba la negación que ya existía.

## [1.0.0] - 2026-10-01

Primera versión etiquetada. Marca el estado de producción al 2026-10-01, que es el commit `9b5a1f2` de `main` (merge del PR #12). Antes de esta versión el repositorio no tenía tags, y el `package.json` de ese commit decía `0.1.0`. El tag `v1.0.0` marca ese estado sin modificar el archivo, que pasa a `1.1.0` en la versión siguiente. El resumen sale del README y de los PR fusionados #1 a #12.

### Añadido

- API REST con Hono sobre Bun y TypeScript, desplegada en Vercel como una sola función serverless en la región `iad1`, con PostgreSQL 17 en Neon, Drizzle ORM, validación con Zod y JWT. Las migraciones de `drizzle/` llegan a la `0015_portal_scores.sql`.
- Módulos de autenticación y restablecimiento de contraseña, perfil académico, malla curricular con simulación, notas, alertas de riesgo académico y de alta carga, horario, asesorías, chat por sección, chatbot, fotos de perfil y networking.
- Importación desde el portal miUlima (`portal-sync`), con el host del portal y el de los sílabos fijos como defensa contra SSRF, y registro de alumno contra miUlima (PR #1).
- Copia del récord académico con consentimiento del alumno (PR #2).
- Bloques de horario propios del alumno, con patrón semanal, excepciones por día y horas por semana (PR #5 y #6, migración `0012`).
- Borrado de los propios mensajes en el chat de cada sección (PR #7).
- Chatbot con delegados por curso y sección, con los bloques propios del alumno y con un historial que se borra por ciclo (PR #8 y #9, migración `0013`).
- Test de especialidad con puntaje transparente y un motivo que redacta Cohere (PR #11, migración `0014`).
- Recarga de notas parciales y asistencia desde la ULima con un solo inicio de sesión, en `POST /portal-sync/refresh` (PR #12, migración `0015`).

### Corregido

- La importación desde el portal lee el menú lateral del Aula Virtual en su formato nuevo, con lo que vuelve a actualizar la asistencia y los delegados (PR #10).
- Un bloque de horario necesita al menos un día real entre sus fechas (PR #6).
- La sincronización deja de responder 500 al guardar la foto del récord (PR #3).
