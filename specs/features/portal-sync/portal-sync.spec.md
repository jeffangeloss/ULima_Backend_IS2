---
name: Portal Sync
description: Carga de ciclo por alumno desde el portal miUlima (webaloe.ulima.edu.pe/portalUL) hacia PostgreSQL, usando la sesión del portal que el alumno abre en la app; incluye sílabos desde la base Domino cactus.ulima.edu.pe, vía la misma sesión SSO.
targets:
  - ../../../src/modules/portal-sync/**
  - ../../../src/modules/index.ts
  - ../../../src/services/portal.client.ts
  - ../../../src/config/env.ts
  - ../../../src/config/app-config.ts
  - ../../../src/server.ts
  - ../../../src/shared/middleware/rate-limit.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/**
  - ../../../test/HU31_jeff/**
---

# Portal Sync

> Estado: **aprobada e implementada**. Revisada el 2026-09-02 contra el esquema real, los fixtures del portal y las convenciones del repo; las correcciones de esa revisión ya están incorporadas. Se agregó el sílabo (nueva fuente Domino, `cactus.ulima.edu.pe`) el mismo día, aprobado por el owner (ver §SSO, §Sílabos, §Decisiones); ese lote pasó por una revisión independiente y sus hallazgos también están incorporados (`on conflict do nothing` sin target, presupuesto de ejecución corregido y limitaciones conocidas en §Sincronización paso 12). Pendiente: aplicar en la base de datos real la migración `drizzle/0004_portal_sync_final_grade.sql` y correr la verificación manual end-to-end contra el portal miUlima (ver §Verification). Quedan además decisiones sueltas sin resolver que no bloquean el desarrollo (ver §Decisiones pendientes).

## Contexto

ULima++ trabaja sobre su propio PostgreSQL. Hoy los datos académicos se cargan a mano. Esta feature permite que **cada alumno importe sus datos oficiales desde miUlima una vez por ciclo** (y las veces que quiera repetirlo). Después de la importación, el resto de la app sigue funcionando con sus propias funcionalidades; **el login de ULima++ no cambia**.

El portal solo muestra los datos del alumno autenticado. Por eso la carga es **incremental y compartida**: el primer alumno que sincroniza crea el período, los cursos, las secciones, los docentes y los horarios de sus cursos; los siguientes reutilizan lo que ya existe y solo agregan lo suyo (matrícula, progreso).

### Cómo se obtiene la sesión del portal

El alumno inicia sesión en miUlima **dentro de un WebView de la app** (usuario, contraseña y código RSA SecurID de Google Authenticator). El backend **nunca recibe la contraseña ni el código TOTP**: recibe solo las cookies de sesión que el portal dejó en el WebView, las usa durante la importación y al terminar cierra la sesión del portal.

Flujo del portal verificado el 2026-09-01 (spike `spike-portal/fetch_portal.py`, fuera del repo):

1. `GET /portalUL/layout.jsp` sin sesión → 302 `inicio.jsp`.
2. `POST /portalUL/j_security_check` (`j_username`, `j_password`, `ac`, `url2`) → 302 `authentication.jsp` → 302 `solicitarValidarToken.jsp?bAv=0`.
3. `POST solicitarValidarToken.jsp?bAv=0` (`sPasscode`, `url2`) → 302 si el código es válido; **200 con la misma página** si es rechazado (sin mensaje distinguible).
4. `authentication.jsp` → `redirectJsp.jsp` → (JS) `layout.jsp`. Cookies resultantes: `JSESSIONID`, `LtpaToken2`, `LtpaToken`.

Los pasos 1 a 4 los ejecuta el **WebView**, no el backend. El backend solo consume las cookies del paso 4.

### SSO con la base de sílabos (Domino)

La Universidad corre **dos sistemas con inicio de sesión único (SSO)**: el portal del alumno (`webaloe.ulima.edu.pe`, WebSphere) y la base de sílabos (`cactus.ulima.edu.pe`, Domino). WebSphere deja la cookie `LtpaToken` con `Domain=.ulima.edu.pe` (no atada a un host); LTPA es el token SSO de IBM entre WebSphere y Domino.

**Verificado empíricamente el 2026-09-02**: la misma petición hecha con las cookies de la sesión del portal a la base de sílabos de Domino devuelve el MISMO documento que un login directo a Domino, y ninguna de las dos respuestas es una página de login. Es decir, las cookies que `portal-sync` ya recibe del WebView del portal **alcanzan para leer sílabos de Domino, sin segundo login ni credenciales adicionales**.

### Páginas fuente (relativas a `/portalUL/`, ISO-8859-1)

| Página | Contenido usado |
| --- | --- |
| `layout.jsp` (pestaña Académico) | Ciclo activo, nombre completo, carrera, PPA, ubicación relativa, nivel del último período, bloque **Aula Virtual** (código, nombre completo, sección, docente), **horario** semanal, impedimentos y deuda de matrícula. |
| `gama/servlets/ComandoMostrarConsMatr?COCICLO=<AAAAN>&Fg=1` | **Consolidado de matrícula** del ciclo: código de alumno (identidad), carrera, y por curso código, sección, grupo, nombre, nivel, créditos y vez. Fuente principal de `enrollment`/`section`. |
| `gada/servlets/ComandoListarRecordAcademico?ac=<ts>` | **Récord académico** completo: por ciclo, código, nombre, vez, créditos, nota, sección. Fuente de `student_course_progress`. |
| `ul/servlets/ComandoVisualizarDatosPersonales` | Solo se lee para completar `app_user.full_name` si está vacío. **No se importa ningún otro campo.** |
| `servlets/CustomLogoutServlet` | Cierre de sesión al terminar. |

**Ciclo activo (`COCICLO`)**: se obtiene SIEMPRE de `layout.jsp` mediante `parseCicloActivo` (rótulos `CICLO: 2026-2` de los bloques Información para Matrícula / Aula Virtual). Nunca se hardcodea ni se toma de la BD. Formatos: `20262` en las URL de matrícula, `AAAA-N` en `academic_period.code`.

`gada/servlets/ComandoListarConsNotas` **no se usa**: para el ciclo en curso devuelve `0` (no vacío) en todas las notas, lo que marcaría como desaprobados los cursos activos.

### Sílabos (fuente nueva: Domino, `cactus.ulima.edu.pe`, JSON, UTF-8)

Fuente **distinta** de las anteriores: otro host (§SSO), otra base (`ac_bd001.nsf`, no `/portalUL/`) y otro formato (JSON, no HTML). El sílabo de UN curso en UN ciclo se obtiene con:

```text
https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV?ReadViewEntries&OutputFormat=JSON&Count=5&RestrictToCategory=<COCICLO>_<courseCode>
```

`COCICLO` es el mismo `cocicloUrl` que resuelve `parseCicloActivo` (ya usado para matrícula); `courseCode` es el código de curso del consolidado. Respuesta real verificada, sin datos personales, guardada en `test/HU31_jeff/fixtures/silabo.json`.

Forma de la respuesta: `viewentry[]["@unid"]` es el id único del documento Domino (UNID). `viewentry[].entrydata[].text["0"]` trae, en una de sus entradas, un fragmento JavaScript con `AbreArchivo('vSyllabusXCicloAV/<UNID>/$File/<filename>.pdf')`; el `filename` lleva el ciclo y el nombre del curso, p. ej. `2026-2 SIL PLANEAMIENTO ESTRATÉGICO.pdf`.

Se piden `Count=5` entradas, así que la categoría puede traer **más de una** (un sílabo republicado que convive con el anterior, o un documento sin adjunto listado primero): se recorren todas en orden y se toma la **primera usable**. Quedarse con `viewentry[0]` perdía el sílabo aunque estuviera publicado.

**Gotcha de charset, ya observado**: el cuerpo es UTF-8 aunque el `Content-Type` declare otra cosa. Decodificar según el `Content-Type` mancha los acentos; `PortalClient.fetchSyllabus` decodifica SIEMPRE como UTF-8, sin mirarlo (a diferencia de `fetchPage`, que sí respeta el `Content-Type` para `webaloe`).

**Gotcha de JSON, ya observado**: Domino emite el fragmento JS (dentro de un comentario HTML `<!-- ... -->`) con escapes de barra invertida que NO son válidos en JSON estricto (`\!`, `\>`): `JSON.parse` directo sobre una respuesta real y bien formada falla con "Bad escaped character". `parseSyllabusEntry` normaliza esos escapes antes de parsear, **eliminando** la barra invertida sobrante (`\!` → `!`), no duplicándola: duplicarla deja una barra literal en el texto ya parseado, que termina en `syllabus.title` y percent-codificada (`%5C`) en `drive_file_url`, apuntando a un adjunto que en Domino no existe. La normalización consume primero los escapes JSON válidos, así que un cuerpo que ya era válido no se rompe (ver comentario en `src/modules/portal-sync/parsers/silabo.ts`).

Que un curso no tenga sílabo publicado (`viewentry` vacío) es normal, no un error: `parseSyllabusEntry` devuelve `null`, igual que ante JSON malformado. No sigue el patrón `ParseResult` de los demás parsers (no hay `warnings` por curso; ver §Sincronización paso 12).
`[@test] ../../../test/HU31_jeff/parsers.silabo.test.ts`

## Requirements

- RS-BE-1: El alumno autenticado en ULima++ puede importar sus datos del ciclo activo desde miUlima usando la sesión que abrió en el WebView.
- RS-BE-2: La importación es **idempotente**: repetirla no duplica ni borra datos, solo actualiza.
- RS-BE-3: Los datos compartidos (período, curso, oferta, docente, sección, sesiones) se reutilizan por **clave natural** mediante upsert atómico; los datos del alumno (matrícula, progreso) se crean solo para él.
- RS-BE-4: La importación **nunca** toca datos propios de la app: `simulated_grades`, `student_curriculum_simulation`, `student_specialty`, `announcement`, `course_advising_session`, `advising_rsvp`, `user_social_link`, `section_representative`, `schedule_session.color_hex` ni las horas de asistencia de `enrollment`.
- RS-BE-5: La app puede consultar si el alumno **necesita** importar.
- RS-BE-6: El backend aborta sin escribir nada si no puede **probar** que la sesión del portal pertenece al alumno autenticado.
- RS-BE-7: Ni la contraseña ni el TOTP ni las cookies del portal se persisten ni se registran en logs. Las cookies viven solo en memoria durante la petición.
- RS-BE-8: La importación nunca puede dejar al alumno sin acceso a la app.

## Arquitectura

Estructura obligatoria del repo (`routes -> controller -> service -> repository`):

```text
src/modules/portal-sync/
  index.ts                     registro del módulo
  portal-sync.routes.ts        endpoints Hono + authMiddleware + requireRole
  portal-sync.controller.ts    adapta HTTP, valida DTO, arma respuesta
  portal-sync.service.ts       orquestación: descarga → parsers → upsert
  portal-sync.repository.ts    TODAS las consultas Drizzle y la transacción
  portal-sync.schemas.ts       Zod del body
  portal-sync.types.ts         DTOs de respuesta
  parsers/                     funciones puras HTML → DTO, sin dependencias
src/services/portal.client.ts  cliente HTTP del portal (patrón de cohere.client.ts)
```

## API Contract Draft

Ver `docs/specs/api-contracts.md`, sección **Portal Sync**.

- `GET /portal-sync/status` — `{ activePeriod, needsImport, enrollmentsInActivePeriod }`.
- `POST /portal-sync/import` — body `{ cookies }`; response `{ period, identity, summary, warnings }`.

## Rules

### Autorización e identidad

- Ambas rutas: `authMiddleware` + `requireRole(...STUDENT_ROLES)`. Del contexto solo se leen `userId` y `studentId`: `AuthVariables` (`src/shared/middleware/auth-middleware.ts`) **no expone `code`**. El código del alumno se obtiene con una consulta a `app_user` por `userId` dentro del repository.
- **Verificación de identidad, antes de cualquier escritura y sin degradación**: `parseConsolidadoMatricula` es la fuente. Si devuelve `{ ok: false }`, si su encabezado no trae la columna `CÓDIGO`, o si el código extraído difiere de `app_user.code`, la importación **aborta y no escribe nada**:
  - código distinto → `403 PORTAL_IDENTITY_MISMATCH`;
  - código ilegible o parser fallido → `422 PORTAL_IDENTITY_UNVERIFIABLE`.
  Esta es la **única** excepción a la regla de degradar parsers a `warnings`.
  `[@test] ../../../test/HU31_jeff/service.import.test.ts`
- Si el portal responde `inicio.jsp` o `solicitarValidarToken.jsp` en cualquier descarga → **`409 PORTAL_SESSION_INVALID`**. Se usa 409 y **no 401** a propósito: `ApiClient` del frontend trata todo 401 como expiración del JWT de ULima++ y cierra la sesión del usuario.
  `[@test] ../../../test/HU31_jeff/portal.client.test.ts`
- Portal 5xx o error de conexión → `502 PORTAL_UNAVAILABLE`; exceso de `PORTAL_TIMEOUT_MS` → `504 PORTAL_TIMEOUT`.
  `[@test] ../../../test/HU31_jeff/portal.client.test.ts`
- Rate limit: 5 importaciones por alumno por hora (`src/shared/middleware/rate-limit.ts`), porque cada llamada dispara ~8-10 peticiones salientes a los sistemas de la Universidad (`layout.jsp` + matrícula + récord + un sílabo por curso distinto). El contador vive en memoria, igual que el del chatbot: en serverless el límite es por instancia, no global.

### Cliente del portal (`src/services/portal.client.ts`)

- Variables nuevas en `src/config/env.ts` (mismo patrón Zod que `COHERE_API_KEY`), expuestas por `src/config/app-config.ts`:
  - `PORTAL_BASE_URL` (`config.portal.baseUrl`) — default `https://webaloe.ulima.edu.pe`. **Validada contra una allowlist de host fija** (`webaloe.ulima.edu.pe`, `isAllowedPortalBaseUrl`) para que no sea un vector de SSRF.
    `[@test] ../../../test/HU31_jeff/env.portal-allowlist.test.ts`
  - `PORTAL_TIMEOUT_MS` (`config.portal.timeoutMs`) — default `8000`.
  - `SYLLABUS_BASE_URL` (`config.syllabus.baseUrl`) — default `https://cactus.ulima.edu.pe`. **Allowlist propia y separada** (`cactus.ulima.edu.pe`, `isAllowedSyllabusBaseUrl`), NO la misma variable que `PORTAL_BASE_URL`: dos variables, cada una fija a un solo host, para que ninguna de las dos pueda apuntarse al sistema de la otra (anti-SSRF). Decisión del owner, 2026-09-02.
    `[@test] ../../../test/HU31_jeff/env.portal-allowlist.test.ts`
- Las rutas de las páginas son **constantes del módulo**. Lo único interpolado en una URL es el `COCICLO` (`^\d{5}$`) y, para sílabos, además el `courseCode` (`^\d{4,6}$`), ambos validados antes de usarse. Ningún otro valor del HTML entra en una URL. Solo se descargan `matricula` y `record` del portal: no se pide ninguna página cuyo contenido no lea después ningún módulo.
  `[@test] ../../../test/HU31_jeff/portal.client.test.ts`
- Envía las cookies recibidas en la cabecera `Cookie` y un `User-Agent` de navegador. **No sigue redirecciones**: un 302 a `inicio.jsp` es sesión inválida.
- Decodifica el cuerpo con el charset del `Content-Type` (default ISO-8859-1).
- **Presupuesto de ejecución**: **tres rondas secuenciales**, no dos: `layout.jsp` (de ahí sale el `COCICLO`) → `matricula` ‖ `record` **en paralelo** → los **N sílabos en paralelo** (N = cursos distintos del consolidado; 5 en el fixture, 6-8 en un ciclo normal). Presupuesto total ≈ 3 × `PORTAL_TIMEOUT_MS` ≈ **24 s**, con ~8-10 peticiones salientes. No hay tope de concurrencia sobre los N sílabos: con 5-8 cursos se abren 5-8 conexiones simultáneas a `cactus`, aceptable a esa escala; si N creciera habría que limitarlo. `PORTAL_TIMEOUT_MS` cubre la petición **y** la lectura del cuerpo (`fetch` resuelve al llegar las cabeceras: un host que responde y deja de emitir bytes colgaría la promesa indefinidamente). Requiere `maxDuration` explícito en `vercel.json`, calculado sobre esos **24 s** y no sobre los 16 s de antes; ese cambio pertenece a `platform-runtime.spec.md` y es **prerrequisito de despliegue** de esta feature (no se toca desde acá).
- Nunca registra cookies, cuerpos HTML ni datos personales; solo URL, status y tamaño. El `errorHandler` global no debe recibir excepciones que lleven HTML del portal en el mensaje: el cliente envuelve todo fallo en `HttpError` con mensaje fijo.
- Llama a `CustomLogoutServlet` en `finally`, siempre.
- `fetchSyllabus(cociclo, courseCode, cookies)` — sílabo de un curso (§Sílabos). Reutiliza la MISMA sesión (cookies del portal, ver §SSO), pero apunta a `config.syllabus.baseUrl`, no a `config.portal.baseUrl`. A diferencia de `fetchPage`/`fetchAll`, un sílabo es un dato adicional, no el propósito de la importación: cualquier fallo que NO sea sesión inválida (timeout, error de red, status inesperado) se degrada a `null` en vez de lanzar. Una redirección sigue lanzando el mismo `409 PORTAL_SESSION_INVALID` que `fetchPage` (no existe, a diferencia de `inicio.jsp`/`solicitarValidarToken` en `webaloe`, un marcador conocido de "página de login" de Domino, así que solo la redirección — señal de sesión muerta verificable en HTTP — se trata como tal). Decodifica SIEMPRE como UTF-8 (§Sílabos, gotcha de charset). Ese `409` **hoy no lo consume nadie**: el service lo atrapa junto con cualquier otra excepción y lo degrada a "sin sílabo para ese curso" (§Manejo de errores); se lanza igual para que un llamador futuro pueda distinguirlo. A `cactus` se le mandan **solo las cookies LTPA** (`LtpaToken2`/`LtpaToken`), nunca el `JSESSIONID`: esa es la sesión de WebSphere atada a `webaloe`, un navegador no la mandaría cross-host y solo el LTPA autentica Domino (§SSO).
  `[@test] ../../../test/HU31_jeff/portal.client.test.ts`

### Parsers (`parsers/*.ts`, funciones puras HTML → DTO)

Regla común de normalización, obligatoria antes de comparar o guardar cualquier texto: **decodificar entidades HTML** (`&Ntilde;`, `&Aacute;`, `&nbsp;`…), colapsar espacios y recortar. `layout.jsp` emite entidades nombradas mientras los servlets emiten bytes acentuados crudos; sin esta regla el mismo docente o curso se duplica según la página de origen.
`[@test] ../../../test/HU31_jeff/html.test.ts`

- `parseCicloActivo(html)` → `{ cocicloUrl: "20262", periodCode: "2026-2" }`.
  `[@test] ../../../test/HU31_jeff/parsers.matricula.test.ts`
- `parseConsolidadoMatricula(html)` → `{ studentCode, careerName, rows: [{ carCode, courseCode, sectionCode, groupCode, courseName, level, credits, attempt }] }`. La fila trae **también** la columna `GR.`; omitirla desalinea un parser posicional.
  `[@test] ../../../test/HU31_jeff/parsers.matricula.test.ts`
- `parseAulaVirtual(html)` → `[{ courseCode, courseName, sectionCode, teacherName }]`. Es la fuente del **nombre completo** del curso y del docente. `teacherName` llega como `APELLIDO1 / APELLIDO2 / NOMBRES` y se normaliza a `NOMBRES APELLIDO1 APELLIDO2` en mayúsculas.
  `[@test] ../../../test/HU31_jeff/parsers.horario.test.ts`
- `parseHorario(html)` → sesiones. La tabla es de 16 franjas × 6 días = 96 celdas y **el portal emite el atributo `title` en las 96, vacío en las libres** (`<font ... size="1" title>`): su presencia no indica clase. Solo aporta sesión la celda cuyo `title` tenga valor que case con `^\s*(\d{4,6})\s+\S`. La cabecera de hora es `7-8` … `22-23` y se convierte a `HH:MM` (`7-8` → `07:00`–`08:00`). Bloques consecutivos del mismo curso, día y aula se fusionan.
  `[@test] ../../../test/HU31_jeff/parsers.horario.test.ts`
- `parseRecordAcademico(html)` → `[{ periodCode, courseCode, courseName, attempt, credits, grade|null, sectionCode }]`. La fila real tiene 12 columnas (`CICLO, COD., ASIGNATURA, VIG., FAC., VEZ, CRD., NOTA, SEC., TOMO, FOLIO, OBSERVACIÓN`): el mapeo es por índice de columna, no por orden de la lista anterior. La celda `CICLO` solo trae valor en la **primera fila de cada grupo** (`&nbsp;` en las demás): se arrastra el último valor no vacío. `NOTA` vacía = curso en curso; `NOTA` no numérica se trata como sin nota.
  `[@test] ../../../test/HU31_jeff/parsers.record.test.ts`
- `parseInfoAcademica(html)` → `{ careerName, lastPeriodLevel }`. Los bloques "Información General" e "Información por Período" son dos tablas de marcado idéntico separadas solo por el texto rotulador: hay que anclarse en ese rótulo, no en el orden de tablas. **PPA y ubicación relativa no se extraen**: no existe columna donde guardarlos (ver §Decisiones pendientes).
  `[@test] ../../../test/HU31_jeff/parsers.info.test.ts`
- `parseImpedimentos(html)` → `{ hasImpediment, hasDebt, text }`.
  `[@test] ../../../test/HU31_jeff/parsers.info.test.ts`
- `parseSyllabusEntry(json, baseUrl)` → `{ unid, fileName, url } | null` (§Sílabos). La base del host de sílabos llega **por parámetro**, no de `config`: los parsers son puros, y el service le pasa la MISMA base con la que el cliente descargó (leyendo la global se podía descargar de un host y persistir la URL de otro). Valida el `@unid` como `^[0-9A-Fa-f]{1,120}$` antes de meterlo en la URL que se persiste y se entrega al cliente como enlace. **NO** sigue el patrón `{ ok, data|reason }` de arriba: a diferencia de los parsers de HTML del portal, acá "este curso no tiene sílabo" es un resultado legítimo y frecuente, no un fallo, de ahí `null` directo en vez de `reason`. Guarda de longitud antes de devolver: `fileName` (futuro `title`) ≤ 150 y la URL construida ≤ 255 (`syllabus.title`/`drive_file_url`); si excede, `null` — mejor sin sílabo que una fila que la BD rechace y haga rollback de toda la importación.
  `[@test] ../../../test/HU31_jeff/parsers.silabo.test.ts`
- Cada parser devuelve `{ ok: true, data } | { ok: false, reason }` (excepto `parseSyllabusEntry`, ver arriba). Un parser que falla **no aborta** la importación (excepto el de identidad): el bloque se omite y se reporta en `warnings`.
- Fixtures en `test/HU31_jeff/fixtures/`. **Anonimización obligatoria antes de commitear**: sustituir nombre, código de alumno, DNI, carné, brevete, dirección, celular, correo, fecha de nacimiento y placa por valores ficticios. El fixture de `layout.jsp` debe conservarse además en **bytes ISO-8859-1 crudos** para ejercitar la decodificación; guardar solo el UTF-8 ya decodificado no prueba nada de esa ruta. `test/HU31_jeff/fixtures/silabo.json` es una respuesta real de Domino sin datos personales (comprobado antes de commitear).

### Sincronización (`portal-sync.repository.ts`)

Las descargas del portal ocurren **fuera** de la transacción. La transacción se abre recién con todos los DTO en memoria y solo contiene escrituras, para no mantener una conexión abierta durante segundos en Vercel serverless.

Todo upsert usa `ON CONFLICT` sobre una constraint **existente**; nada de read-then-write, porque dos alumnos de la misma sección importan a la vez al inicio del ciclo.

1. **Período** — `academic_period`, clave `code`. `is_active` está protegido por el índice único **parcial** `uq_academic_period_single_active` (no diferible: PostgreSQL lo evalúa fila a fila), así que el orden de sentencias es obligatorio:
   a. `UPDATE academic_period SET is_active = false WHERE is_active = true AND code <> :code;`
   b. `INSERT ... ON CONFLICT (code) DO UPDATE SET is_active = true;`
   Esto cubre el caso "el período ya existe pero está inactivo", que de otro modo dejaría `needsImport` evaluándose contra el ciclo equivocado para siempre.
   **Guarda**: solo se activa si `:code` es lexicográficamente **mayor o igual** al código del período activo actual, **Y** su fecha de inicio ya llegó (`shouldActivatePeriod` = `periodCodeIsNewer` && `periodHasStarted`, ambas en `portal-sync.repository.ts`). Un alumno importando un ciclo viejo nunca retrocede el ciclo global; y la Universidad publica el calendario de un ciclo (dejándolo disponible para importar) **días antes** de que empiecen las clases, así que sin la guarda de fecha el primer alumno en importar movería el ciclo activo de los 201 alumnos antes de que el ciclo en verdad empezara. La fecha de inicio se conoce ANTES del upsert, de la misma fuente (`KNOWN_PERIOD_CALENDARS`/`defaultPeriodDates`) que usa el paso siguiente; la comparación es en UTC por fecha de calendario (no por hora), igual que el resto del módulo (ver `academicWeekCount`).
   Cuando el período se **crea** pero la guarda de fecha lo deja inactivo, se reporta `PERIOD_NOT_ACTIVATED_YET`. **Consecuencia de diseño, deliberada**: ese período queda inactivo hasta que una importación POSTERIOR corra en o después de su fecha de inicio (la misma guarda se reevalúa en ese momento); es aceptable, y la advertencia lo hace visible en vez de dejarlo escondido.
   Al crear se consulta primero `KNOWN_PERIOD_CALENDARS`, la tabla de calendarios académicos **publicados por la Universidad** (`portal-sync.repository.ts`); si el código del ciclo está ahí se usan esas fechas tal cual, autoritativas incluso si el inicio no cayera en lunes. Solo si el ciclo no está en la tabla se cae al cálculo aproximado de siempre según `N` (`1` → 15-mar a 31-jul; `2` → 1-ago a 20-dic; `0` → 5-ene a 28-feb), snapeado al lunes siguiente. `PERIOD_DATES_DEFAULTED` se reporta **solo** cuando el período se creó Y su código no tiene calendario publicado — con calendario publicado las fechas son correctas y no hay nada que avisar. Calendario publicado hoy: `2026-2` → 24-ago-2026 a 14-dic-2026 (owner, 2026-09-02; "sujeto a modificaciones" según la Universidad, se corrige en la tabla si cambia).
   **Consecuencia de diseño, deliberada**: `is_active` es global y único, así que la primera importación de un ciclo nuevo (con fecha de inicio ya llegada) cambia el ciclo vigente **para los 201 alumnos**. Es semánticamente correcto (un semestre nuevo es global) pero significa que un alumno dispara un cambio que afecta a todos. Ver §Decisiones pendientes.
   `[@test] ../../../test/HU31_jeff/repository.period.test.ts`
   `[@test] ../../../test/HU31_jeff/service.import.test.ts`
2. **Semanas académicas** — al **crear** un período se generan las filas de `academic_week` (`uq_academic_week_period_number`) que cubren su span real, no un número fijo: la cantidad es `academicWeekCount(startDate, endDate)`, el número de semanas de 7 días necesario para cubrir `[start_date, end_date]` (mínimo 1). Un número fijo generaba semanas más allá del fin real cuando el ciclo dura menos (`2026-2`, con calendario publicado, dura 16 semanas exactas). Sin estas filas, `schedule.repository` y `chatbot.repository` no resuelven la "semana N" y el horario queda sin fechas.
   `[@test] ../../../test/HU31_jeff/repository.period.test.ts`
3. **Carrera** — **no se busca ni se crea desde el portal**. `student.career_id` y `student.curriculum_id` ya existen y son `NOT NULL`: se usan tal cual. La carrera del portal solo se **compara** con `career.name`; si difiere se reporta `CAREER_MISMATCH` y no se cambia nada. (El código de carrera del portal es `6500`; el de la BD es `SIS`. No son la misma nomenclatura y no deben mapearse a ciegas.)
4. **Alumno** — `student.current_level` se actualiza al **ciclo del curso obligatorio más bajo que al alumno todavía le falta**, esté pendiente o cursándolo (definición del owner del proyecto, 2026-09-02). NO es el máximo ni el modal de los cursos matriculados este ciclo (ambas derivaciones se probaron y las dos fueron incorrectas): esos solo listan lo que el alumno lleva ESTE ciclo, no dicen si un curso es obligatorio, y no incluyen los cursos que aún no ha llevado — que son justamente los que definen el ciclo. La fuente es la propia base de datos de ULima++, no el portal:
   - Obligatorio = `curriculum_course.category <> 'elective'` (`general_studies`, `common` y `faculty` son obligatorios; solo `elective` es optativo) dentro de la malla del alumno (`curriculum_course.curriculum_id = student.curriculum_id`).
   - Pendiente = sin fila en `student_course_progress` para ese `curriculum_course_id` (nunca lo llevó) o con `status` distinto de `approved` (`in_progress`, `failed` o `withdrawn` siguen faltando).
   - El nivel es el `MIN(cycle)` entre esos cursos obligatorios pendientes (`PortalSyncRepository.findStudentLevel`, `[@test] ../../../test/HU31_jeff/repository.student.test.ts`). Se ejecuta DENTRO de la misma transacción y DESPUÉS del upsert de progreso del paso 10, para ver el progreso que esta misma importación acaba de escribir — antes de ese punto la fila de `student_course_progress` que decide si un curso recién aprobado deja de contar todavía no existe.
   - Si no hay ningún curso obligatorio pendiente (aprobó todos), no se escribe nada y `current_level` queda como estaba.
   - El resultado se descarta y se reporta (`LEVEL_OUT_OF_RANGE`) si cae fuera de `1..10` (`chk_student_current_level`); esa guarda no cambió.
   `app_user.full_name` se completa **solo si está vacío**. `app_user.institutional_email` **nunca se toca**: es `NOT NULL UNIQUE` y es el identificador del login con Google.
   `[@test] ../../../test/HU31_jeff/repository.student.test.ts`
   `[@test] ../../../test/HU31_jeff/service.import.test.ts`
5. **Cursos** — `course` por `code` (unique). **Solo crean curso las filas del consolidado de matrícula del ciclo importado**; el récord académico nunca crea `course` (sus nombres vienen truncados a 20 caracteres y sus códigos legados de 4 dígitos ensuciarían el catálogo de la malla). Precedencia del nombre: consolidado > Aula Virtual. `name` es `NOT NULL`, así que "actualizar solo si está vacío" no aplica: se actualiza solo si el nombre entrante es **más largo** que el guardado. `default_credit` = créditos redondeados hacia arriba, mínimo 1 (`chk_course_default_credit > 0`).
6. **Docentes** — `teacher` **no tiene unique sobre `full_name`**, así que no admite `ON CONFLICT` por nombre. Clave natural sintética: `teacher_code = 'PORTAL:' + slug(fullNameNormalizado)` (`teacher_code` sí es unique) → `INSERT ... ON CONFLICT (teacher_code) DO UPDATE SET full_name = excluded.full_name`. El placeholder para cursos sin docente usa `teacher_code = 'PORTAL:SIN-DOCENTE'` y se reporta `TEACHER_MISSING`. `institutional_email` se deja `NULL` (es unique). Crear docentes desde el portal es dato real, no inventado; el placeholder sí es dato sintético y figura en §Decisiones pendientes.
   `[@test] ../../../test/HU31_jeff/repository.catalog.test.ts`
7. **Oferta y sección** — `course_offering` por `uq_course_offering (academic_period_id, course_id)`, con `total_hours` = créditos × 16 (`attendance-risk` descarta toda sección con `total_hours <= 0`). `section` por `uq_section_offering_code (course_offering_id, code)`; `teacher_id` se actualiza solo si el actual es el placeholder. `jp_id` no se toca.
8. **Sesiones de horario** — clave natural real `uq_schedule_session (section_id, day_of_week, start_time)`, **sin `end_time`**: `ON CONFLICT (section_id, day_of_week, start_time) DO UPDATE SET end_time = excluded.end_time, classroom = excluded.classroom`. `color_hex` no se toca. Las sesiones que ya no aparecen no se borran.
9. **Matrícula** — `enrollment` por `uq_enrollment_student_section`, `status = active`. Las horas de asistencia no se tocan. **Retiro**: solo se marcan `withdrawn` las matrículas del alumno **cuya sección pertenece al período importado** (join `section → course_offering → academic_period`; `enrollment` no tiene columna de período). **Nunca se ejecuta el retiro si dejaría al alumno con cero matrículas activas**: ambos logins exigen `hasActiveEnrollment` y lo dejarían fuera de la app sin poder volver a importar (RS-BE-8). En ese caso no se retira nada y se reporta `WITHDRAW_SKIPPED_WOULD_LOCK_OUT`. La lista de secciones a conservar (`keep`) es TODA sección tocada en la importación, sin colapsar por curso: dos filas del mismo curso con distinta sección (columna `GR.`) deben conservarse ambas.
   `[@test] ../../../test/HU31_jeff/repository.student.test.ts`
   `[@test] ../../../test/HU31_jeff/service.import.test.ts`
10. **Progreso** — `student_course_progress` por `uq_student_course_progress (student_id, curriculum_course_id)`, con `curriculum_id` (`NOT NULL`) = `student.curriculum_id`. Se resuelve `curriculum_course` por `course.code` dentro de la malla del alumno; si el curso no está en la malla la fila se omite y se cuenta en `warnings.progressSkipped` (convalidaciones, cursos de otra facultad, códigos legados). Estado: `approved` si `grade >= 11`, `failed` si `grade < 11`, `in_progress` si no hay nota y la fila es del período activo. Filas de ciclos pasados sin nota numérica se omiten y se reportan. Con varias filas del mismo curso (columna `VEZ`) gana la de **mayor `VEZ`**; a igual `VEZ`, la de ciclo más reciente.
    `[@test] ../../../test/HU31_jeff/repository.student.test.ts`
11. **Impedimentos** — si hay deuda o impedimento se hace upsert de **una sola** `alert` por alumno y período, con `type = 'academic_risk'`, `title` (`NOT NULL`) = `"Impedimento de matrícula"` y `message` = el texto del portal. Idempotente: si ya existe una alerta de ese alumno con ese título y mensaje, **no se crea otra aunque esté leída**; solo se actualiza el mensaje si cambió.
12. **Sílabos** — `syllabus`, con **`on conflict do nothing` SIN conflict target**. Los sílabos de todos los cursos importados se buscan **en paralelo** (§Sílabos, §Cliente del portal) DESPUÉS de resolver la identidad y ANTES de abrir la transacción (misma razón que matrícula/récord: son peticiones de red, no deben mantener la conexión de BD abierta), y se resuelven por **curso**, no por fila: dos secciones del mismo curso comparten una sola oferta y un solo sílabo. Dentro de la transacción, cada sílabo se inserta justo después de que su `course_offering` existe (`upsertOffering`, paso 7), que es la clave que exige `syllabus.course_offering_id`.
    - **Columnas históricas, decisión del owner (2026-09-02)**: `syllabus.drive_file_id` recibe el UNID de Domino y `syllabus.drive_file_url` la URL de `vSyllabusXCicloAV`. Las columnas conservan sus nombres actuales (`drive_file_id`/`drive_file_url`) SIN migración ni rename, aunque ya no signifiquen solo Google Drive — hoy también guardan la referencia al documento Domino. Comentario en el código donde se escriben, dejando constancia de que el nombre es histórico.
    - **Por qué sin target**: `syllabus` tiene DOS restricciones únicas, `uq_syllabus_course_offering (course_offering_id)` y `syllabus_drive_file_id_unique (drive_file_id)`. Un target explícito solo cubre la primera; la segunda lanzaría `23505` dentro de la transacción de la importación y la tumbaría entera. Y sí puede ocurrir: que la clave de consulta (`<COCICLO>_<curso>`) sea única no implica que el documento devuelto lo sea — un sílabo compartido por dos códigos de curso aparece, en una vista categorizada de Domino, bajo ambas categorías con el MISMO `@unid`. Sin target, el `do nothing` cubre **todas** las restricciones únicas de la tabla.
    - **Por qué `do nothing` y no `do update`**: `syllabus` no es una tabla vacía que estrene esta feature. `src/db/seed/index.ts` la llena con enlaces de Google Drive que el visor in-app SÍ abre y que `grades.repository.ts` sirve como `silaboUrl` a TODOS los alumnos de la oferta; además es la fila padre de `assessment`. Pisarla con una URL de Domino protegida por sesión (Decisión pendiente #10) rompía el sílabo de la sección entera por una importación de un solo alumno, sin vuelta atrás desde la app. Nunca se pisa una fila existente.
    - **Limitaciones conocidas y aceptadas** (decisión del owner, 2026-09-02), consecuencia directa de lo anterior: (a) re-importar el mismo ciclo **NO actualiza** un sílabo republicado — el precio correcto mientras la URL de Domino no sea abrible por el visor (Decisión pendiente #10); (b) un curso cuya oferta ya tenía sílabo sembrado **conserva el enlace de Drive**, no el de Domino, así que tras una importación una oferta puede tener uno u otro según si ya existía la fila.
    - Que un curso no tenga sílabo es normal y **no** genera advertencia por curso. Si NINGÚN curso del ciclo trajo sílabo se agrega una única advertencia `SYLLABUS_UNAVAILABLE`. Se decide **fuera de la transacción**, justo después de la fase de descarga, y NO desde `summary.syllabiUpserted`: con el `do nothing`, cero escrituras ya no significa "no hay sílabos" — puede significar que todas las ofertas ya tenían fila. El mensaje **no afirma** que el portal no publicó nada: desde el backend no se distingue "no hay sílabo" de "cactus caído", "sesión de Domino muerta" o "todas las peticiones expiraron".
    - `summary.syllabiUpserted` cuenta **filas efectivamente escritas**, no intentos: `upsertSyllabus` devuelve `null` cuando el `do nothing` no escribió nada, y quien llama nunca lee `rows[0]` a ciegas.
    - **Un fallo de sílabo (red, sesión, parseo o al guardar) nunca aborta el resto de la importación**: la descarga y el parseo se degradan a `null` por curso (§Manejo de errores), y el guardado no puede lanzar un `23505` porque el `on conflict do nothing` sin target cubre las dos restricciones únicas de la tabla. Lo que sí abortaría la transacción es un valor que la BD rechace por longitud, y por eso el parser descarta de antemano `title` > 150, `drive_file_url` > 255 y `drive_file_id` > 120 (§Parsers).
    - **Limitación conocida, no resuelta acá** (ver §Decisiones pendientes): la URL guardada apunta a un documento Domino protegido por sesión. El visor de sílabos embebido de la app Flutter, que hoy abre URLs de Google Drive, **no podrá abrir esta URL sin una sesión de Domino**. Queda para que el owner decida.
    `[@test] ../../../test/HU31_jeff/parsers.silabo.test.ts`
    `[@test] ../../../test/HU31_jeff/portal.client.test.ts`
    `[@test] ../../../test/HU31_jeff/repository.syllabus.test.ts`
    `[@test] ../../../test/HU31_jeff/service.import.test.ts`

### Fuera de alcance explícito

- Boletas de pago, cuenta corriente, datos laborales, información vehicular, DNI, dirección, celular, fecha de nacimiento, brevete, carné y anuncios del buzón (`tab=1`): **no se descargan ni se guardan**.
- Ciclos pasados no crean `section`, `enrollment` ni `course`: solo alimentan `student_course_progress`.
- No se persiste fecha de última sincronización: `needsImport` se deriva de la matrícula en el período activo.

### Privacidad y base legal

- La pantalla del WebView debe mostrar, antes del login, qué datos se importarán y con qué finalidad, y requiere aceptación explícita del alumno (consentimiento informado, Ley 29733 de Protección de Datos Personales del Perú). Sin aceptación no se abre el portal.
- Inventario de datos importados: nombre completo, código de alumno, carrera, nivel, cursos, secciones, docentes, horarios, matrícula, notas históricas y estado de impedimento/deuda. Nada más.
- El alumno puede pedir el borrado de lo importado; el procedimiento debe existir antes de publicar la feature (decisión pendiente: si es autoservicio o vía soporte).
- Antes de implementar se requiere autorización escrita del área de Sistemas de la Universidad para que una app reciba cookies de sesión del portal institucional.

### Manejo de errores

- Toda la escritura ocurre en una transacción; si una regla lanza un error no controlado no queda nada a medias.
- Los errores por bloque parseable se degradan a `warnings`; identidad, sesión inválida, portal caído y timeout abortan con los códigos indicados.
- **Excepción**: un fallo al buscar el sílabo de un curso — incluida una sesión inválida detectada en `cactus.ulima.edu.pe` (`fetchSyllabus` lanzando el mismo `409` que `fetchPage`) — **nunca aborta la importación** (§Sincronización paso 12). Se captura por curso, fuera de la transacción, y se degrada a "sin sílabo para ese curso". El camino de **guardado** cumple lo mismo por construcción, no por captura: el `on conflict do nothing` sin target no puede levantar un conflicto de unicidad (§Sincronización paso 12).
- Un `23505` sobre `uq_academic_period_single_active` es un **bug de orden en el repository**, no un error del portal: el test debe cubrir "BD con `2026-1` activo + portal en `2026-2`".

### DTO validation

- Body de `POST /portal-sync/import`: `cookies.JSESSIONID` y `cookies.LtpaToken2` string 1..4096 obligatorios; `cookies.LtpaToken` opcional. Cualquier otra clave se ignora. El body nunca se registra en logs.
  `[@test] ../../../test/HU31_jeff/schemas.import.test.ts`

## Decisiones

Aprobadas por el owner del proyecto el 2026-09-02:

| # | Decisión | Resolución |
| --- | --- | --- |
| 1 | Nota final oficial | **APROBADA**: se agrega `enrollment.final_grade decimal(4,2) NULL` con migración Drizzle. La nota del récord se guarda ahí además de derivar `approved`/`failed`. `[@test] ../../../test/HU31_jeff/schema.final-grade.test.ts` |
| 3 | Cambio global de ciclo | **APROBADA**: la primera importación de un ciclo nuevo, cuya fecha de inicio ya llegó, activa ese `academic_period` para todos los alumnos, con la guarda de que solo avanza y nunca retrocede, y de que no activa antes de que el ciclo en verdad empiece (`PERIOD_NOT_ACTIVATED_YET` si se crea antes de esa fecha). |
| 4 | Docente placeholder | **APROBADA**: se permite `teacher_code = 'PORTAL:SIN-DOCENTE'` como dato sintético, única excepción a la regla de no inventar datos, porque `section.teacher_id` es `NOT NULL`. |
| 8 | Reutilizar columnas de sílabo para Domino | **APROBADA**: `syllabus.drive_file_id`/`syllabus.drive_file_url` guardan el UNID y la URL de Domino. Se mantienen sus nombres actuales, SIN migración ni rename, aunque el nombre ya no describa solo Google Drive (§Sincronización paso 12). |
| 9 | Allowlist de dos hosts para las peticiones salientes | **APROBADA**: se agrega `cactus.ulima.edu.pe` junto a `webaloe.ulima.edu.pe`, cada uno con su propia variable de entorno y su propio predicado de allowlist (`SYLLABUS_BASE_URL`/`isAllowedSyllabusBaseUrl`), no una sola variable aceptando ambos. Fija en código; ningún llamador puede influirla. |

Resueltas por diseño, sin cambio de BD:

| # | Decisión | Resolución |
| --- | --- | --- |
| 2 | PPA y ubicación relativa | **DESCARTADO**: no se extraen ni se guardan. No existe columna y no los consume ninguna pantalla. |
| 5 | `maxDuration` en `vercel.json` | Se aplica como tarea dentro de `platform-runtime.spec.md`; prerrequisito de despliegue, no de desarrollo. |
| 6 | Ubicación de tests | `test/HU31_jeff/`, siguiendo el patrón `test/HU<NN>_<owner>/`. Renombrar si el equipo asigna otro número de HU. |

Pendiente, no bloquea el desarrollo:

| # | Decisión | Por qué importa |
| --- | --- | --- |
| 7 | Procedimiento de borrado de los datos importados a pedido del alumno | Requisito de la Ley 29733. Debe existir antes de publicar la feature, no antes de implementarla. |
| 10 | El visor de sílabos de la app Flutter no puede abrir la URL de Domino guardada | La URL de `syllabus.drive_file_url` apunta a un documento **protegido por sesión** en Domino (§Sílabos, §SSO), a diferencia de las URLs de Google Drive que el visor in-app maneja hoy: sin una sesión de Domino, el visor no podrá abrirla directamente. Alcance real desde que el upsert es `on conflict do nothing` (§Sincronización paso 12): solo afecta a las ofertas que NO tenían fila `syllabus`; donde ya había un enlace de Drive sembrado, ese enlace se conserva. No se resuelve en esta feature; queda documentado para que el owner decida (¿proxear la descarga por el backend con la sesión del alumno? ¿abrir en navegador externo? ¿otra cosa?). |

## Verification

- `bun test test/HU31_jeff/` cubre cada parser contra fixtures reales anonimizados, incluido un fixture en bytes ISO-8859-1 crudos y otro (`silabo.json`) en la respuesta JSON real de Domino sin datos personales. Los 15 archivos de test y qué verifica cada uno están enlazados inline junto a cada regla en §Rules; `[@test]` arriba.
- Casos de servicio cubiertos con repository y cliente fake (sin BD real): identidad no verificable (`403`/`422`) y no escribe nada; retiro que dejaría cero matrículas activas se omite y advierte; el logout del portal ocurre siempre, incluso si la importación falla; dos filas del consolidado con el mismo curso y distinta sección (`GR.`) llegan ambas al `keep` del retiro. `[@test] ../../../test/HU31_jeff/service.import.test.ts`
- Sílabos, a nivel de servicio: se cuenta un sílabo por curso cuando el portal los devuelve; una única `SYLLABUS_UNAVAILABLE` cuando ninguno trae sílabo (caso por defecto), con un mensaje que no afirma una causa que no se comprobó; un sílabo parcial no advierte por curso; un fallo del cliente (excepción de red) al buscar el sílabo NO aborta el resto de la importación ni cambia el resto del `summary`; dos secciones del mismo curso comparten oferta y el sílabo se escribe UNA sola vez; `syllabiUpserted` cuenta filas escritas (una oferta que ya tenía sílabo no suma) y NO se advierte `SYLLABUS_UNAVAILABLE` cuando hubo sílabos aunque no se escribiera ninguna fila; la URL persistida se arma con la base del cliente que descargó. `[@test] ../../../test/HU31_jeff/service.import.test.ts`
- Sílabos, a nivel de repository (sin BD, inspeccionando la consulta generada): el upsert usa `on conflict do nothing` **sin target** y sin ningún `set`, escribe oferta/título/UNID/URL en ese orden, devuelve la fila cuando el insert escribió y `null` cuando el `do nothing` no escribió nada. `[@test] ../../../test/HU31_jeff/repository.syllabus.test.ts`
- Sílabos, a nivel de parser: UNID, filename y URL armada contra el fixture real (incluidos sus escapes JSON inválidos, `\!`/`\>`); un filename con `\<PARTE 1\>` sale sin barras invertidas ni `%5C`; un cuerpo que ya era JSON válido no se rompe; `@unid` con traversal, con query o no hexadecimal ⇒ `null`; se recorren las `viewentry` y se toma la primera usable; un filename con apóstrofo se lee completo; la URL se arma con la base recibida por parámetro; `viewentry` vacío y JSON malformado degradan a `null`; guardas de longitud de `title`(150)/`drive_file_url`(255)/`drive_file_id`(120). `[@test] ../../../test/HU31_jeff/parsers.silabo.test.ts`
- Sílabos, a nivel de cliente: URL armada contra `cactus.ulima.edu.pe` con `COCICLO_courseCode`; decodificación SIEMPRE UTF-8 pese a un `Content-Type` distinto; redirección ⇒ `409`; status inesperado y error de red ⇒ `null`; `cociclo`/`courseCode` con formato inválido ⇒ `null` sin llegar a pedir la red; a `cactus` solo se le mandan las cookies LTPA y a `webaloe` las tres; un cuerpo que nunca termina de llegar corta por timeout (504 en `fetchPage`, `null` en `fetchSyllabus`) en vez de colgar la importación. `[@test] ../../../test/HU31_jeff/portal.client.test.ts`
- Casos de repository cubiertos como funciones puras: avance de ciclo `2026-1` → `2026-2` sin retroceder (`[@test] ../../../test/HU31_jeff/repository.period.test.ts`); la decisión de activación (`periodHasStarted`/`shouldActivatePeriod`) contra fecha de inicio pasada/futura, con y sin período activo previo, y código más viejo que nunca activa aunque su fecha ya haya llegado (`[@test] ../../../test/HU31_jeff/repository.period.test.ts`); sesión de portal inválida vía `inicio.jsp`/`solicitarValidarToken` (`[@test] ../../../test/HU31_jeff/portal.client.test.ts`).
- A nivel de servicio: se cubre tanto el camino donde el período activa normalmente (fecha de inicio ya llegada, sin advertencia) como el que crea el período pero lo deja inactivo por la guarda de fecha, reportando `PERIOD_NOT_ACTIVATED_YET` (`[@test] ../../../test/HU31_jeff/service.import.test.ts`).
- Pendientes de una base de datos real (no cubiertos por los tests unitarios anteriores, que usan fakes): importar dos veces deja el mismo estado (con el `do nothing`, la segunda importación no reescribe el sílabo); un UNID repetido entre dos ofertas no rompe la importación del segundo alumno; una fila `syllabus` sembrada con enlace de Drive sobrevive intacta a una importación; segundo alumno en la misma sección no crea sección nueva; el `23505` de `uq_academic_period_single_active` no ocurre en la primera importación de un ciclo nuevo.
- Fixtures faltantes que hay que conseguir para ampliar cobertura: un segundo alumno (para probar sección compartida), una nota desaprobada y una nota no numérica. Los fixtures actuales son de un solo alumno con `VEZ = 1`.
- Prueba manual pendiente (requiere la migración `drizzle/0004_portal_sync_final_grade.sql` aplicada y sesión real de miUlima): importar y verificar `GET /schedule/me/sessions`, `GET /curriculum/me` y `GET /portal-sync/status` → `needsImport = false`.
