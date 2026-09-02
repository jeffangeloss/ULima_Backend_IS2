---
name: Portal Sync
description: Carga de ciclo por alumno desde el portal miUlima (webaloe.ulima.edu.pe/portalUL) hacia PostgreSQL, usando la sesión del portal que el alumno abre en la app.
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

> Estado: **aprobada e implementada**. Revisada el 2026-09-02 contra el esquema real, los fixtures del portal y las convenciones del repo; las correcciones de esa revisión ya están incorporadas. Pendiente: aplicar en la base de datos real la migración `drizzle/0004_portal_sync_final_grade.sql` y correr la verificación manual end-to-end contra el portal miUlima (ver §Verification). Queda además una decisión suelta sin aprobar que no bloquea el desarrollo (ver §Decisiones pendientes).

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
- Rate limit: 5 importaciones por alumno por hora (`src/shared/middleware/rate-limit.ts`), porque cada llamada dispara ~4 peticiones salientes al portal de la Universidad. El contador vive en memoria, igual que el del chatbot: en serverless el límite es por instancia, no global.

### Cliente del portal (`src/services/portal.client.ts`)

- Variables nuevas en `src/config/env.ts` (mismo patrón Zod que `COHERE_API_KEY`), expuestas por `src/config/app-config.ts` como `config.portal`:
  - `PORTAL_BASE_URL` — default `https://webaloe.ulima.edu.pe`. **Validada contra una allowlist de host fija** (`webaloe.ulima.edu.pe`) para que no sea un vector de SSRF.
    `[@test] ../../../test/HU31_jeff/env.portal-allowlist.test.ts`
  - `PORTAL_TIMEOUT_MS` — default `8000`.
- Las rutas de las páginas son **constantes del módulo**. Lo único interpolado en una URL es el `COCICLO`, que se valida contra `^\d{5}$` antes de usarse. Ningún otro valor del HTML entra en una URL. Solo se descargan `matricula` y `record`: no se pide ninguna página cuyo contenido no lea después ningún módulo.
  `[@test] ../../../test/HU31_jeff/portal.client.test.ts`
- Envía las cookies recibidas en la cabecera `Cookie` y un `User-Agent` de navegador. **No sigue redirecciones**: un 302 a `inicio.jsp` es sesión inválida.
- Decodifica el cuerpo con el charset del `Content-Type` (default ISO-8859-1).
- **Presupuesto de ejecución**: las 2 descargas de datos (`matricula`, `record`) se hacen **en paralelo** tras resolver el `COCICLO` (que requiere `layout.jsp` primero). Presupuesto total ≈ 2 × `PORTAL_TIMEOUT_MS` ≈ 16 s. Requiere `maxDuration` explícito en `vercel.json`; ese cambio pertenece a `platform-runtime.spec.md` y es **prerrequisito de despliegue** de esta feature.
- Nunca registra cookies, cuerpos HTML ni datos personales; solo URL, status y tamaño. El `errorHandler` global no debe recibir excepciones que lleven HTML del portal en el mensaje: el cliente envuelve todo fallo en `HttpError` con mensaje fijo.
- Llama a `CustomLogoutServlet` en `finally`, siempre.

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
- `parseRecordAcademico(html)` → `[{ periodCode, courseCode, courseName, attempt, credits, grade|null, sectionCode }]`. La fila real tiene 12 columnas (`CICLO, COD., ASIGNATURA, VIG., FAC., VEZ, CRD., NOTA, SEC., TOMO, FOLIO, OBSERVACIÓN`): el mapeo es por índice de columna, no por orden de la lista anterior. La celda `CICLO` solo trae valor en la **primera fila de cada grupo** (`&nbsp;` en las demás): se arrastra el último valor no vacío. `NOTA` vacía = curso en curso; `NOTA` no numérica se trata como sin nota y se cuenta en `warnings`.
  `[@test] ../../../test/HU31_jeff/parsers.record.test.ts`
- `parseInfoAcademica(html)` → `{ careerName, lastPeriodLevel }`. Los bloques "Información General" e "Información por Período" son dos tablas de marcado idéntico separadas solo por el texto rotulador: hay que anclarse en ese rótulo, no en el orden de tablas. **PPA y ubicación relativa no se extraen**: no existe columna donde guardarlos (ver §Decisiones pendientes).
  `[@test] ../../../test/HU31_jeff/parsers.info.test.ts`
- `parseImpedimentos(html)` → `{ hasImpediment, hasDebt, text }`.
  `[@test] ../../../test/HU31_jeff/parsers.info.test.ts`
- Cada parser devuelve `{ ok: true, data } | { ok: false, reason }`. Un parser que falla **no aborta** la importación (excepto el de identidad): el bloque se omite y se reporta en `warnings`.
- Fixtures en `test/HU31_jeff/fixtures/`. **Anonimización obligatoria antes de commitear**: sustituir nombre, código de alumno, DNI, carné, brevete, dirección, celular, correo, fecha de nacimiento y placa por valores ficticios. El fixture de `layout.jsp` debe conservarse además en **bytes ISO-8859-1 crudos** para ejercitar la decodificación; guardar solo el UTF-8 ya decodificado no prueba nada de esa ruta.

### Sincronización (`portal-sync.repository.ts`)

Las descargas del portal ocurren **fuera** de la transacción. La transacción se abre recién con todos los DTO en memoria y solo contiene escrituras, para no mantener una conexión abierta durante segundos en Vercel serverless.

Todo upsert usa `ON CONFLICT` sobre una constraint **existente**; nada de read-then-write, porque dos alumnos de la misma sección importan a la vez al inicio del ciclo.

1. **Período** — `academic_period`, clave `code`. `is_active` está protegido por el índice único **parcial** `uq_academic_period_single_active` (no diferible: PostgreSQL lo evalúa fila a fila), así que el orden de sentencias es obligatorio:
   a. `UPDATE academic_period SET is_active = false WHERE is_active = true AND code <> :code;`
   b. `INSERT ... ON CONFLICT (code) DO UPDATE SET is_active = true;`
   Esto cubre el caso "el período ya existe pero está inactivo", que de otro modo dejaría `needsImport` evaluándose contra el ciclo equivocado para siempre.
   **Guarda**: solo se activa si `:code` es lexicográficamente **mayor o igual** al código del período activo actual. Un alumno importando un ciclo viejo nunca retrocede el ciclo global.
   Al crear se usan fechas por defecto según `N` (`1` → 15-mar a 31-jul; `2` → 1-ago a 20-dic; `0` → 5-ene a 28-feb) y se reporta `PERIOD_DATES_DEFAULTED`.
   **Consecuencia de diseño, deliberada**: `is_active` es global y único, así que la primera importación de un ciclo nuevo cambia el ciclo vigente **para los 201 alumnos**. Es semánticamente correcto (un semestre nuevo es global) pero significa que un alumno dispara un cambio que afecta a todos. Ver §Decisiones pendientes.
   `[@test] ../../../test/HU31_jeff/repository.period.test.ts`
2. **Semanas académicas** — al **crear** un período se generan sus 17 filas de `academic_week` (`uq_academic_week_period_number`). Sin ellas, `schedule.repository` y `chatbot.repository` no resuelven la "semana N" y el horario queda sin fechas.
3. **Carrera** — **no se busca ni se crea desde el portal**. `student.career_id` y `student.curriculum_id` ya existen y son `NOT NULL`: se usan tal cual. La carrera del portal solo se **compara** con `career.name`; si difiere se reporta `CAREER_MISMATCH` y no se cambia nada. (El código de carrera del portal es `6500`; el de la BD es `SIS`. No son la misma nomenclatura y no deben mapearse a ciegas.)
4. **Alumno** — `student.current_level` se actualiza con el nivel del período importado del consolidado (no con el del bloque "Información por Período", que corresponde al ciclo anterior); se descarta y se reporta si cae fuera de `1..10` (`chk_student_current_level`). `app_user.full_name` se completa **solo si está vacío**. `app_user.institutional_email` **nunca se toca**: es `NOT NULL UNIQUE` y es el identificador del login con Google.
   `[@test] ../../../test/HU31_jeff/repository.student.test.ts`
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
- Un `23505` sobre `uq_academic_period_single_active` es un **bug de orden en el repository**, no un error del portal: el test debe cubrir "BD con `2026-1` activo + portal en `2026-2`".

### DTO validation

- Body de `POST /portal-sync/import`: `cookies.JSESSIONID` y `cookies.LtpaToken2` string 1..4096 obligatorios; `cookies.LtpaToken` opcional. Cualquier otra clave se ignora. El body nunca se registra en logs.
  `[@test] ../../../test/HU31_jeff/schemas.import.test.ts`

## Decisiones

Aprobadas por el owner del proyecto el 2026-09-02:

| # | Decisión | Resolución |
| --- | --- | --- |
| 1 | Nota final oficial | **APROBADA**: se agrega `enrollment.final_grade decimal(4,2) NULL` con migración Drizzle. La nota del récord se guarda ahí además de derivar `approved`/`failed`. `[@test] ../../../test/HU31_jeff/schema.final-grade.test.ts` |
| 3 | Cambio global de ciclo | **APROBADA**: la primera importación de un ciclo nuevo activa ese `academic_period` para todos los alumnos, con la guarda de que solo avanza y nunca retrocede. |
| 4 | Docente placeholder | **APROBADA**: se permite `teacher_code = 'PORTAL:SIN-DOCENTE'` como dato sintético, única excepción a la regla de no inventar datos, porque `section.teacher_id` es `NOT NULL`. |

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

## Verification

- `bun test test/HU31_jeff/` cubre cada parser contra fixtures reales anonimizados, incluido un fixture en bytes ISO-8859-1 crudos. Los 13 archivos de test y qué verifica cada uno están enlazados inline junto a cada regla en §Rules; `[@test]` arriba.
- Casos de servicio cubiertos con repository y cliente fake (sin BD real): identidad no verificable (`403`/`422`) y no escribe nada; retiro que dejaría cero matrículas activas se omite y advierte; el logout del portal ocurre siempre, incluso si la importación falla; dos filas del consolidado con el mismo curso y distinta sección (`GR.`) llegan ambas al `keep` del retiro. `[@test] ../../../test/HU31_jeff/service.import.test.ts`
- Casos de repository cubiertos como funciones puras: avance de ciclo `2026-1` → `2026-2` sin retroceder (`[@test] ../../../test/HU31_jeff/repository.period.test.ts`); sesión de portal inválida vía `inicio.jsp`/`solicitarValidarToken` (`[@test] ../../../test/HU31_jeff/portal.client.test.ts`).
- Pendientes de una base de datos real (no cubiertos por los tests unitarios anteriores, que usan fakes): importar dos veces deja el mismo estado; segundo alumno en la misma sección no crea sección nueva; el `23505` de `uq_academic_period_single_active` no ocurre en la primera importación de un ciclo nuevo.
- Fixtures faltantes que hay que conseguir para ampliar cobertura: un segundo alumno (para probar sección compartida), una nota desaprobada y una nota no numérica. Los fixtures actuales son de un solo alumno con `VEZ = 1`.
- Prueba manual pendiente (requiere la migración `drizzle/0004_portal_sync_final_grade.sql` aplicada y sesión real de miUlima): importar y verificar `GET /schedule/me/sessions`, `GET /curriculum/me` y `GET /portal-sync/status` → `needsImport = false`.
