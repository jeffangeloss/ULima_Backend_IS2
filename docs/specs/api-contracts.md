# API Contracts

Contrato REST local del backend ULima++. Mantener alineado manualmente con `ULima_Frontend_IS2/docs/specs/api-contracts.md`.

## Reglas

- Todo endpoint, payload, respuesta, error o permiso debe actualizarse aquí antes de implementar backend.
- Las specs backend deben referenciar este archivo.
- PostgreSQL definitivo es la fuente de verdad.
- No existe fallback final a JSON.
- No se crean tablas, seeds ni migraciones desde el contrato.
- Cada sección debe ser refinada por la spec de feature antes de implementar.

## Principios Globales

- Todas las rutas, salvo `GET /`, `GET /health`, `POST /auth/login`, `POST /auth/google`, `POST /auth/password-reset/request`, `POST /auth/password-reset/verify` y `POST /auth/password-reset/confirm`, usan `Authorization: Bearer <token>`. Este requisito está **enforced** por `authMiddleware` en cada módulo (incluidos `course-detail`, `grades` y `section-management`).
- El usuario autenticado es estudiante **o docente** (HU18).
- Roles permitidos: `student`, `delegate`, `subdelegate`, `teacher`.
- `teacher` es el rol técnico compartido por profesor y jefe de práctica (JP); su etiqueta se deriva de `section.teacher_id` vs `section.jp_id`. El JWT docente lleva `teacherId` en vez de `studentId`.
- Los módulos de alumno aplican `requireRole('student','delegate','subdelegate')` y el módulo `advising` aplica `requireRole('teacher')`; el rol equivocado recibe `403 FORBIDDEN`.
- IDs numéricos pueden viajar como number o string según DTO final aprobado; cada spec debe fijarlo antes de implementar.
- Errores siguen forma general:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

- `GET /version`
  - Response: `{ "commit": "string", "ref": "string|null", "deployment": "string|null" }`
  - Expone el commit desplegado (Vercel inyecta `VERCEL_GIT_COMMIT_SHA`).

## Auth

## Public

- `GET /`
  - Response: metadata básica del backend y módulos disponibles.
- `GET /health`
  - Response: `{ "status": "ok", "timestamp": "ISO-8601 string" }`

## Auth

- `POST /auth/login`
  - Request: `{ "code": "string", "password": "string" }`
  - Response: `{ "token": "string", "tokenType": "Bearer", "expiresIn": 86400, "user": User }`
  - HU18: si el `code` no es de un `student` pero sí de un `teacher` (vía `teacher.user_id`), inicia sesión como docente. El `user` docente es `{ id, teacherId, code, fullName, institutionalEmail, role: "teacher", teacherLabel: "Profesor"|"Jefe de Práctica", setupComplete: true }` (sin `studentId`). No exige matrícula activa. El JWT lleva `teacherId` en vez de `studentId`. El login de alumnos no cambia.
- `POST /auth/google`
  - Request: `{ "idToken": "string" }`
  - Acepta `@aloe.ulima.edu.pe` para cuentas vinculadas a `student.user_id` y `@ulima.edu.pe` para cuentas vinculadas a `teacher.user_id`. No crea cuentas ni perfiles.
  - Response: `{ "token": "string", "tokenType": "Bearer", "expiresIn": 86400, "user": User }`. El alumno conserva su shape y reglas de matrícula/representación. El docente recibe el mismo shape y JWT docente de `POST /auth/login`, sin exigir matrícula.
  - En ambos casos se vincula `app_user.google_id`, se incrementa `tokenVersion` y se mantiene disponible el login con código/contraseña.
  - Errores: `401 INVALID_TOKEN`, `401 USER_NOT_FOUND`, `403 INVALID_DOMAIN`; `403 NOT_ENROLLED` solo para alumnos.
- `POST /auth/register` (público) — alta de cuenta para un alumno que todavía no existe en la base, autenticando contra miUlima en el mismo acto. Ver `specs/features/registro/registro.spec.md`.
  - Request: `{ "code": "string", "portalPassword": "string", "passcode": "string", "password": "string", "consent"?: true }`. `code`: `^\d{6,10}$`. `portalPassword`/`passcode` son credenciales de **miUlima** (se usan para el login y se descartan, nunca se persisten ni se registran en logs). `password` es la contraseña nueva de ULima++. `consent` es opcional y booleano (RS-BE-29, `specs/features/academic-record/academic-record.spec.md`): con `true` la importación que corre dentro del registro guarda la copia del récord académico, la foto académica y el resumen por ciclo, igual que `POST /portal-sync/import`; sin el campo el registro funciona como hoy y no guarda ninguno de los tres. Un valor no booleano responde `400`.
  - Response `201`: el mismo cuerpo que `POST /auth/login` (`token`, `tokenType`, `expiresIn`, `user`) más `summary` y `warnings`, el resumen y los avisos de la importación del ciclo (mismo shape que `summary` y `warnings` de `POST /portal-sync/import`, ver sección Portal Sync).
  - El `token` es el que **re-firma la importación** con el cargo vigente releído de la BD, no uno emitido por el registro: un alumno que la importación reconoce como delegado recibe un token de delegado, y `user.role` dice lo mismo que el JWT. Solo si la importación no re-firma (`token: null`) el registro firma uno propio de `student`.
  - La identidad la certifica **el portal**, no el `code` del body: si difieren, gana el del portal. Si el portal no reporta matrícula en el ciclo activo, no se crea ninguna cuenta (todo o nada).
  - Errores: `503 REGISTRATION_UNAVAILABLE` (el registro no está cableado), `409 USER_ALREADY_EXISTS` (ya hay cuenta con ese código; se comprueba con el del body antes de tocar el portal y otra vez con el que certifica el portal, dentro de la transacción, antes del INSERT), `429 RATE_LIMITED` (se pasó el límite de tasa del endpoint, ver abajo), `401 PORTAL_AUTH_FAILED` (miUlima rechazó credenciales o passcode, y solo eso), `403 NOT_ENROLLED` (autenticó pero sin matrícula en el ciclo activo), `422 PORTAL_IDENTITY_UNVERIFIABLE` (consolidado de matrícula no legible), `502 PORTAL_UNAVAILABLE` (el portal no respondió), `504 PORTAL_TIMEOUT` (el portal no respondió a tiempo; código propio y no `401`, para no mandar a la persona a cambiar su contraseña universitaria por un timeout).
  - **Límite de tasa** (`src/shared/middleware/rate-limit.ts`): 5 intentos por `code` y por hora (`registerRateLimit`, sin devolución de cupo cuando miUlima rechaza el login) y un tope global de 4 registros simultáneos en vuelo (`registerConcurrencyLimit`). Ambos responden `429 RATE_LIMITED`. Los contadores viven en memoria del proceso, así que el techo real se multiplica por el número de instancias en Vercel. Ver `specs/features/registro/registro.spec.md` §Límite de tasa.
  - **Acción de despliegue pendiente**: `CORS_ORIGINS` no está definida en Vercel (comprobado el 2026-09-08), así que el backend responde `Access-Control-Allow-Origin: *` y cualquier sitio puede llamar a este endpoint desde el navegador de una víctima. Es preexistente (`BR-PLATFORM-08`) y no se cambia desde esta feature.
- `GET /auth/me`
  - Response: `{ "user": User }` (shape de estudiante o de docente según el rol del token).
- `POST /auth/logout`
  - Response: `{ "message": "Session closed" }`
- `POST /auth/password-reset/request` (público)
  - Request: `{ "identifier": "string" }` (código de alumno o correo institucional)
  - Response (siempre `200`, exista o no la cuenta): `{ "message": "Si la cuenta existe, enviamos un código a tu correo institucional." }`
- `POST /auth/password-reset/verify` (público)
  - Body: `{ "identifier": "20230001", "code": "123456" }`
  - `200` → `{ "valid": true }`
  - `400` `INVALID_RESET_CODE`: "Código inválido o expirado." (mismatch, expirado, usado, intentos agotados o cuenta inexistente — indistinguibles a propósito)
  - Comprueba el código sin gastar el token: `/confirm` sigue necesitándolo después. Sí reserva un intento, así que un flujo correcto gasta 2 de los 6.
- `POST /auth/password-reset/confirm` (público)
  - Request: `{ "identifier": "string", "code": "string", "newPassword": "string" }`
  - Response `200`: `{ "message": "Contraseña actualizada correctamente." }`
  - Errores: `400 WEAK_PASSWORD` (menos de 8 caracteres), `400 INVALID_RESET_CODE` ("Código inválido o expirado.", genérico a propósito)
- `POST /auth/password-reset/request-me` (Bearer token)
  - Response `200`: `{ "message": "Enviamos un código a tu correo institucional.", "email": "2023****@aloe.ulima.edu.pe" }`

`User` mínimo:

```json
{
  "id": 1,
  "studentId": 10,
  "code": "20201234",
  "fullName": "Nombre Apellido",
  "institutionalEmail": "user@aloe.ulima.edu.pe",
  "role": "student",
  "careerId": 1,
  "curriculumId": 1,
  "currentLevel": 5,
  "setupComplete": false,
  "specialties": [
    { "specialtyId": 1, "name": "Ingeniería de Software", "selectionType": "primary" }
  ]
}
```

Errores de login con código: `401 USER_NOT_FOUND`, `401 INVALID_PASSWORD`, `403 NOT_ENROLLED`. Errores adicionales de Google: `401 INVALID_TOKEN`, `403 INVALID_DOMAIN`.

`User.currentCycle` es `string | null`: el `period_code` del curso actual del alumno si tiene matrícula en el período activo; si no tiene (p. ej. antes de importar el ciclo nuevo desde el portal), cae al código del período activo igual; `null` solo si no hay ningún período activo. Nunca un ciclo hardcodeado.

## Academic Profile

### GET /academic-profile/me

Perfil completo del estudiante autenticado.

- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "profile": {
      "id": 1,
      "studentId": 10,
      "code": "20201234",
      "fullName": "Nombre Apellido",
      "institutionalEmail": "user@aloe.ulima.edu.pe",
      "role": "student",
      "currentLevel": 5,
      "setupComplete": true,
      "career": {
        "id": 1,
        "code": "ING-INF",
        "name": "Ingeniería de Sistemas",
        "faculty": "Facultad de Ingeniería"
      },
      "curriculum": {
        "id": 1,
        "name": "Currículo 2023"
      },
      "specialties": [
        { "specialtyId": 1, "name": "Ingeniería de Software", "selectionType": "primary" },
        { "specialtyId": 2, "name": "Ciencia de Datos", "selectionType": "interest" }
      ]
    }
  }
  ```
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `404` `USER_NOT_FOUND`

### GET /academic-profile/careers

Todas las carreras disponibles.

- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "careers": [
      { "id": 1, "code": "ING-INF", "name": "Ingeniería de Sistemas", "faculty": "Facultad de Ingeniería" }
    ]
  }
  ```

### GET /academic-profile/specialties

Especialidades filtradas por carrera. Si `careerId` se omite, usa la carrera del estudiante autenticado.

- **Auth**: Bearer token
- **Query**: `?careerId={id}` (opcional)
- **Response** `200 OK`:
  ```json
  {
    "specialties": [
      { "id": 1, "careerId": 1, "name": "Ingeniería de Software", "description": "..." }
    ]
  }
  ```
- **Solo lo oficial** *(propuesta del 2026-09-25, BR-AP-07 de `academic-profile.spec.md`, pendiente de aprobación)*. Con `careerId` y sin él, la lista trae solo las especialidades con `is_active = true`, que en Ingeniería de Sistemas son los cuatro diplomas oficiales. `is_active` sigue en cada elemento, ahora siempre `true`, y `display_order` se numera después del filtro. Los datos de `specialty` no cambian.

### PUT /academic-profile/me/specialties

Reemplaza las especialidades activas del estudiante autenticado. Escribe en `student_specialty`.

- **Auth**: Bearer token
- **Request body**:
  ```json
  {
    "primarySpecialtyId": 1,
    "interestSpecialtyIds": [2, 3]
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "message": "Specialties updated",
    "setupComplete": true,
    "specialties": [
      { "specialtyId": 1, "selectionType": "primary" },
      { "specialtyId": 2, "selectionType": "interest" }
    ]
  }
  ```
- **Errors**: `400` `INVALID_BODY`, `404` `SPECIALTY_NOT_FOUND`, `409` `DUPLICATE_PRIMARY`
- **Solo lo oficial y reemplazo atómico** *(propuesta del 2026-09-25, BR-AP-07 y BR-AP-08, pendiente de aprobación)*. `404 SPECIALTY_NOT_FOUND` también para una especialidad que existe pero tiene `is_active = false`, con el mismo mensaje que una de otra carrera. El desactivado, los `upsert` y la marca de `specialty_setup_completed` corren en una sola transacción. La forma de la ruta no cambia.

Notas:

- No existe endpoint para cambiar carrera/curriculum en v1.
- `PUT /academic-profile/me/specialties` marca `student.specialty_setup_completed = true` incluso con listas vacías.

## Curriculum

- `GET /curriculum/me`
- `PUT /curriculum/me/simulation`
- `DELETE /curriculum/me/simulation/:curriculumCourseId`

Notas:

- Progreso real viene de `student_course_progress`.
- Cursos actuales vienen de `enrollment.status = 'active'`.
- Simulación visual viene de `student_curriculum_simulation`.
- La simulación no escribe `student_course_progress`, `enrollment` ni `student_score`.

## Grades

### GET /grades/me/courses

Devuelve cursos + evaluaciones del sílabo con sus pesos, para la calculadora del alumno.

- **Auth**: Bearer token, rol `student|delegate|subdelegate`
- **Response** `200 OK`:
  ```json
  {
    "cursos": [
      {
        "id": "1",
        "nombre": "INGENIERÍA DE SOFTWARE II",
        "ciclo": "2026-1",
        "silaboUrl": "https://drive.google.com/... | https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV/...",
        "secciones": [
          { "idSeccion": "1", "codigoSeccion": "856" }
        ]
      }
    ],
    "syllabi": [
      {
        "cursoId": "1",
        "cursoNombre": "INGENIERÍA DE SOFTWARE II",
        "evaluaciones": [
          {
            "id": "1",
            "nombre": "Examen Escrito 1",
            "sigla": "EE1",
            "peso": 30,
            "tipo": "Examen"
          }
        ]
      }
    ]
  }
  ```
- **`silaboUrl`**: sale de `syllabus.drive_file_url` y **no siempre es un enlace de Google Drive**. Las ofertas con sílabo ya cargado conservan su enlace de Drive; una oferta que NO tenía fila `syllabus` puede recibirla desde `POST /portal-sync/import`, y entonces la URL apunta a la base Domino de sílabos (`cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV/...`). Esa URL está **protegida por sesión de Domino**: el visor in-app no puede abrirla como abre las de Drive (limitación conocida y abierta, ver `specs/features/portal-sync/portal-sync.spec.md` §Decisiones pendientes #10). La importación **nunca reemplaza** una `silaboUrl` existente, así que un enlace de Drive que hoy funciona sigue funcionando.

### POST /grades/me/calculate

Calcula el promedio ponderado de una lista de notas ingresadas por el alumno. No persiste datos.

- **Auth**: Bearer token, rol `student|delegate|subdelegate`
- **Request body**:
  ```json
  {
    "notas": [
      { "valor": 15, "peso": 30 },
      { "valor": 12, "peso": 50 },
      { "valor": 18, "peso": 20 }
    ]
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "promedio": 14.1,
    "sumaPesos": 100
  }
  ```
- **Errors**: `400` `INVALID_REQUEST_BODY` (si `valor` no está entre 0-20 o `peso` no está entre 0-100)

### POST /grades/me/notes

Guarda las notas personales del alumno en `student_score`. Cada nota se asocia al `enrollment` activo del alumno en la sección. Si ya existe una nota para la misma evaluación, se actualiza (upsert).

- **Auth**: Bearer token, rol `student|delegate|subdelegate`
- **Request body**:
  ```json
  {
    "cursos": [
      {
        "sectionId": 1,
        "notas": [
          { "assessmentId": 1, "valor": 15 },
          { "assessmentId": 2, "valor": 0 }
        ]
      }
    ]
  }
  ```
- **Response** `200 OK`:
  ```json
  {
    "message": "Notas guardadas correctamente"
  }
  ```
- **Errors**: `400` `INVALID_REQUEST_BODY`, `500` error interno

### GET /grades/me/notes

Recupera las notas personales del alumno autenticado desde `student_score`.

- **Auth**: Bearer token, rol `student|delegate|subdelegate`
- **Response** `200 OK`:
  ```json
  {
    "cursos": [
      {
        "sectionId": 1,
        "notas": [
          { "assessmentId": 1, "valor": 15 },
          { "assessmentId": 2, "valor": 0 }
        ]
      }
    ]
  }
  ```

### Endpoints no implementados

- ~~`PUT /grades/me/scores`~~ — **NO IMPLEMENTADO** (reemplazado por `POST /grades/me/notes`).
- ~~`GET /grades/me/courses/:sectionId/average`~~ — **NO IMPLEMENTADO** (el cálculo se hace vía `POST /grades/me/calculate`).
- ~~`POST /grades/syllabi`~~ — **NO IMPLEMENTADO** (fuera de v1; la tabla `syllabus` ya existe).

Notas:

- `student_score` es la tabla de persistencia de notas personales del alumno.
- El cálculo de promedio ponderado se delega al backend vía `POST /grades/me/calculate`.
- Ya no existe `NotasService` en el frontend: toda la lógica de almacenamiento y cálculo está en el backend.
- **Arquitectura real (HU06/HU07, actualizada 2026-07-12)**: la calculadora vive en el módulo `grades`: `GET /grades/me/courses` (cursos+evaluaciones del sílabo), `GET/POST /grades/me/notes` (persiste las notas del alumno en la tabla `simulated_grades`; antes en `shared_preferences`), `DELETE /grades/me/notes/:sectionId/:assessmentId`, y `POST /grades/me/calculate` (promedio ponderado calculado en el **backend**).
- `student_score` existe en el esquema (notas seed de referencia); la app no lo escribe. Las notas de la calculadora van a `simulated_grades`.
- Los endpoints `PUT /grades/me/scores` y `.../average` quedaron documentados pero **nunca se implementaron**; se listan como no implementados para que el contrato refleje la realidad.
- `POST /grades/syllabi` queda fuera de v1 salvo spec aprobada; la tabla `syllabus` ya existe.

> **Nota (2026-07-12):** el módulo `simulated-grades` (`/simulated-grades/*`) fue **eliminado** — quedó redundante. Las notas de la calculadora se guardan por `POST /grades/me/notes` (mismo destino: tabla `simulated_grades`). La tabla sigue existiendo.

## Official Grades

Notas **oficiales** que el profesor/JP carga por evaluación, en `student_score`. La **nota final** = promedio ponderado (Σ nota×peso/100). Distinto de las notas **no oficiales** de la calculadora del alumno (tabla `simulated_grades`, vía `/grades/me/notes`).

Docente (`requireRole("teacher")`, `teacherId` del JWT; solo secciones propias vía `section.teacher_id`/`jp_id`):

- `GET /official-grades/teacher/sections` — **IMPLEMENTADO**. Secciones del período activo que dicta.
  - Response: `{ "sections": [{ "sectionId": number, "courseName": string, "sectionCode": string, "rol": "Profesor"|"JP" }] }`
- `GET /official-grades/teacher/sections/:sectionId/scores` — **IMPLEMENTADO**. Grilla de calificación.
  - Response: `{ "sectionId": number, "students": [{ "enrollmentId": number, "code": string, "fullName": string }], "assessments": [{ "assessmentId": number, "code": string, "name": string, "weight": number, "weekNumber": number }], "scores": [{ "enrollmentId": number, "assessmentId": number, "value": number }] }`
  - `403 NOT_SECTION_TEACHER` si el docente no dicta la sección.
- `PUT /official-grades/teacher/sections/:sectionId/scores` — **IMPLEMENTADO**. Upsert por lote de notas.
  - Body: `{ "scores": [{ "enrollmentId": number, "assessmentId": number, "value": number }] }` (`value` 0..20, 1..1000 items)
  - Response: la grilla actualizada (mismo shape que el GET).
  - Errores: `403 NOT_SECTION_TEACHER`; `404 ENROLLMENT_NOT_IN_SECTION` / `404 ASSESSMENT_NOT_IN_SECTION` (valida todo antes de escribir).

Alumno (`requireRole(student|delegate|subdelegate)`, `studentId` del JWT):

- `GET /official-grades/me` — **IMPLEMENTADO**. Notas oficiales del alumno por curso/sección (el cliente calcula la nota final).
  - Response: `{ "courses": [{ "sectionId": number, "courseName": string, "sectionCode": string, "assessments": [{ "assessmentId": number, "code": string, "name": string, "weight": number, "value": number|null }] }] }`

## Schedule

### GET /schedule/me/sessions
Retorna el horario semanal por bloques de tiempo para las secciones donde el estudiante se encuentra matriculado activamente.
- **Auth**: Bearer token
- **`isoDate`** (RS-BE-36, `specs/features/time-blocks/time-blocks.spec.md`): cada elemento de `days` trae la fecha de ese día como `"YYYY-MM-DD"`, en hora de Lima, la misma de la que sale `dateText`; vale `null` cuando el ciclo no tiene semanas (entonces `dateText` es `""` y `weekText` es `"Semana actual"`). `dateText` no trae año: quien necesite la fecha exacta —la app, para pedir `GET /time-blocks/me/occurrences` del ciclo visible y ubicar cada ocurrencia en su día— usa `isoDate` y no lee `dateText`. Es un campo más: ninguno de los de antes cambia, y `GET /schedule/teacher/sessions` también lo trae.
- **Response** `200 OK`:
  ```json
  {
    "days": [
      {
        "dayName": "Lunes",
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo",
        "isoDate": "2026-01-12"
      }
    ],
    "secciones": [
      {
        "idSeccion": "1",
        "codigoSeccion": "856",
        "docenteCode": "T001",
        "promedioSeccion": 0,
        "idCurso": "10",
        "curso": "INGENIERÍA DE SOFTWARE II",
        "asistido": 12,
        "inasistencia": 2,
        "total": 30,
        "asistenciaDisponible": true,
        "horasTranscurridas": 8,
        "horarios": [
          {
            "dia": "Lunes",
            "inicio": "08:00:00",
            "hora_inicio": "08:00 am",
            "fin": "10:00:00",
            "hora_fin": "10:00 am",
            "aula": "L3-402",
            "salon": "L3-402",
            "color": "#F94B3F"
          }
        ]
      }
    ]
  }
  ```

> **`asistenciaDisponible`** (RS-BE-10, `specs/features/attendance-risk/attendance-risk.spec.md`): dice si esta matrícula tiene asistencia cargada. Es una bandera POSITIVA: `asistido`, `inasistencia` y `total` en 0 NO significan "cero faltas", significan "nunca se midió", y el cliente no puede distinguirlos mirando los números. Un cliente que ignore el campo y divida `asistido / total` obtiene `NaN`, que Flutter clampea al MÁXIMO y pinta como asistencia perfecta. Con `false` hay que mostrar estado "sin datos", nunca un porcentaje.
>
> Las filas de horario **docente** y de **asesoría** siempre lo emiten en `false`: son secciones o sesiones, y la asistencia es por matrícula.
>
> **`horasTranscurridas`** (RS-BE-16, `specs/features/asistencia-portal/asistencia-portal.spec.md`): horas ya DICTADAS (`asistido + inasistencia`), no las del ciclo. El porcentaje de asistencia se calcula sobre este número, nunca sobre `total`: dividir `asistido / total` daría 8/64 = 12.5% en la semana 2, que el alumno lee como "asististe al 12.5%".
>
> **Riesgo por inasistencias** (`/attendance-risk`): `status` admite `impedido | en_riesgo | normal | sin_datos`, y `absencePercentage` es **nullable** — llega `null` exactamente cuando `status` es `sin_datos`. El `summary` incluye `sin_datos` como contador propio, que NO se suma a `normal`; el cliente no debe calcular "normal" por resta.
>
> Las tres rutas de `/attendance-risk` exigen, además del rol `teacher`, que la sección sea del docente autenticado (titular o JP): si no, responden **`403 NOT_SECTION_TEACHER`** con el mismo mensaje exista o no la sección, para no convertir el endpoint en un oráculo de enumeración. Ver RS-BE-11.
>
> `GET /course-detail/sections` devuelve las horas **del alumno autenticado**, no agregados del salón (RS-BE-12). `promedioSeccion` sigue siendo de la sección.

### GET /schedule/me/assessments
Retorna la lista de evaluaciones programadas en el sílabo mapeadas a fechas y horarios reales basados en el cronograma semanal de clases del estudiante.
- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "assessments": [
      {
        "id": "1",
        "courseName": "INGENIERÍA DE SOFTWARE II",
        "sectionCode": "856",
        "code": "EE1",
        "name": "Examen Escrito 1",
        "weekNumber": 2,
        "date": "2026-01-12",
        "startTime": "08:00:00",
        "endTime": "10:00:00",
        "classroom": "L3-402",
        "color": "#F94B3F"
      }
    ]
  }
  ```

### GET /schedule/me/load
Retorna la carga académica por semana para el periodo académico activo, identificando semanas con alta carga académica.
- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "weeks": [
      {
        "weekNumber": 2,
        "startDate": "2026-01-12",
        "endDate": "2026-01-18",
        "assessmentCount": 3,
        "isHighLoad": true
      }
    ]
  }
  ```

Notas:

- Horario usa `schedule_session` de secciones con enrollment activo, acotadas al **período académico activo** (`academic_period.is_active = true`); igual para evaluaciones, carga semanal y el horario/evaluaciones del docente (`GET /schedule/teacher/*`). Sin este filtro, un alumno o docente con datos en dos ciclos a la vez vería ambos superpuestos.
- Evaluaciones usan `assessment.week_number` mapeado dinámicamente a fechas reales de la clase en esa semana académica.
- Las semanas académicas (`weekText`, `WeekX.startDate` de la ecuación de fecha, y la respuesta de `GET /schedule/me/load`) salen del período académico activo en base de datos (`academic_week`, o si no tiene filas, derivadas de las fechas propias del período), nunca de un calendario fijo en código. Ver `specs/features/schedule/schedule.spec.md` BR-SCH-04.
- Alta carga es 3+ evaluaciones en una misma semana académica.

- `GET /schedule/me/sessions` expone `schedule_session.classroom` por sesiÃ³n como `aula`/`salon`; `color` puede venir como nombre legacy o como hexadecimal desde `schedule_session.color_hex`.

## Course Detail

- `GET /course-detail/sections/:sectionId`
- `GET /course-detail/sections/:sectionId/announcements`
- `GET /course-detail/sections/:sectionId/contacts`
- `GET /course-detail/sections` (lista general)
- `GET /course-detail/teachers`
- `GET /course-detail/enrollments`

Notas:

- Solo roles de alumno (`requireRole('student','delegate','subdelegate')`); un token docente recibe `403 FORBIDDEN` (salvo `GET` de contactos, permitido también a `teacher`).
- El estudiante solo ve secciones donde está matriculado.
- Contactos agrega la clave top-level `jefePractica` (`{ code, lastName, firstName }` o `null`) desde `section.jp_id`, entre `docente` y `alumnos`.
- Anuncios visibles solo si pertenecen a la sección del estudiante.
- El listado de asesorías y el RSVP del alumno migraron al módulo `advising-student` (ver abajo).

## Advising Student — RSVP del alumno (HU17)

Sub-módulo `student/` dentro de `src/modules/advising/`. Rol requerido: `student`, `delegate`, `subdelegate`. Detalle en `specs/features/advising-student/advising-student.spec.md`.

- `GET /advising/section/:sectionId` — lista asesorías (recurrentes + extras) visibles para la sección, excluyendo pasadas. Response: `{ asesorias: AdvisingItem[] }`.
- `POST /advising/:sessionId/rsvp` — confirma asistencia (`studentId` del JWT). Rechaza si ya pasó (`409 SESSION_ALREADY_PAST`). Idempotente. Response: `{ id, asistentes, myRsvp: true }`. Errores: `403 RSVP_STUDENT_ONLY`, `404 SESSION_NOT_FOUND`.
- `DELETE /advising/:sessionId/rsvp` — cancela asistencia. Idempotente. Response: `{ id, asistentes, myRsvp: false }`.

## Advising (HU18 — docentes)

Rol requerido: `teacher` (`requireRole('teacher')`). Detalle y reglas en `specs/features/advising/advising.spec.md`.

- `GET /advising/me/sections` — secciones del docente (como profesor o JP) en el período activo, para el formulario. Response: `{ secciones: [ { sectionId, courseOfferingId, courseName, sectionCode, rol } ] }`.
- `GET /advising/me/sessions` — asesorías del docente (recurrentes + extras) con `asistentes` y `rol`. Response: `{ sesiones: [ { id, sectionId, courseOfferingId, courseName, sectionCode, kind, dia, fecha, inicio, fin, modality, aula, zoom, nota, cupo, asistentes, rol } ] }`.
- `POST /advising/me/sessions` — crea asesoría extra. Body: `{ sectionId, sessionDate: "YYYY-MM-DD", startTime: "HH:MM", endTime: "HH:MM", modality: "classroom"|"virtual"|"hybrid", classroom?, meetingUrl?, note?, capacity? }`. Response `201`: `{ sesion }`. Errores: `403 SECTION_FORBIDDEN`, `400 INVALID_TIME_RANGE`, `400 DATE_OUT_OF_PERIOD`, `400 DATE_IN_PAST`, `409 ADVISING_OVERLAP`, `400 MISSING_LOCATION`, `409 NO_ACTIVE_PERIOD`.
- `DELETE /advising/me/sessions/:id` — elimina una extra propia. Errores: `404 ADVISING_NOT_FOUND`, `403 FORBIDDEN`, `409 ONLY_EXTRA_DELETABLE`.
- `GET /advising/me/sessions/:id/attendees` — conteo + lista de confirmados de una sesión propia. Response: `{ total, asistentes: [ { code, firstName, lastName } ] }`.

Notas:

- Todo el módulo comparte la guarda defensiva `401 TEACHER_NOT_FOUND` (contexto sin `teacherId`; no ocurre tras `authMiddleware`+`requireRole('teacher')`).
- Los endpoints de RSVP del alumno (HU17) viven en el sub-módulo `advising/student/` (`POST/DELETE /advising/:sessionId/rsvp`), **no** aquí: el sub-router `teacher/` está gateado a `teacher`. HU18 solo lee `advising_rsvp` (conteo/lista de confirmados).

## Alerts

- `GET /alerts/me`
- `PUT /alerts/me/:alertId/read`

Notas:

- Tipos válidos: `academic_risk`, `high_load`.
- Recalcular alertas es interno; no hay endpoint público de recalculo en v1.
- `academic_risk` no compara contra promedio de sección.

## Section Management

- `GET /section-management/representatives` — lista las secciones donde el alumno autenticado es delegado/subdelegado activo. Roles de alumno. Response: `{ "sectionRepresentatives": [{ "id": "1", "enrollmentId": "10", "idSeccion": "754", "codigoSeccion": "754", "idCurso": "45", "nombreCurso": "Sistemas de Inteligencia Empresarial", "role": "delegado", "alumnosMatriculados": 32 }] }`.
- `GET /section-management/sections/:sectionId/announcements` — lista anuncios activos de la sección para su delegado/subdelegado, ordenados por fecha descendente. Response: `{ "anuncios": Announcement[] }`.
- `POST /section-management/sections/:sectionId/announcements` — crea un anuncio en `announcement`. Rol requerido: `delegate`/`subdelegate` activo de la sección. Body: `{ "title": "string<=150", "message": "string<=5000" }`. Response `201`: `{ "message": "Anuncio publicado correctamente.", "anuncio": Announcement }`.
- `PUT /section-management/announcements/:id` — edita título y mensaje de un anuncio propio. Body: `{ "title": "string<=150", "message": "string<=5000" }`. Response: `{ "message": "Cambios guardados correctamente.", "anuncio": Announcement }`.
- `DELETE /section-management/announcements/:id` — soft delete (`is_active=false`) de un anuncio propio. Response: `{ "message": "Anuncio eliminado correctamente." }`.
- ~~`GET /section-management/me/sections`~~ — **NO IMPLEMENTADO**.
- ~~`GET /section-management/sections/:sectionId/progress`~~ — **NO IMPLEMENTADO** (HU11, pendiente).

Notas:

- Anuncios: el backend deriva `section_representative_id` desde el JWT del alumno y la sección; el frontend no lo envía.
- Errores principales: `403 SECTION_FORBIDDEN`, `403 ANNOUNCEMENT_FORBIDDEN`, `404 ANNOUNCEMENT_NOT_FOUND`, `400 INVALID_REQUEST_BODY`.
- Estadísticas/progreso de sección siguen fuera de alcance de esta implementación y no exponen notas individuales.

## Chat (HU23 — chat en vivo por sección)

Puente de auth entre el JWT propio y Firebase para el chat en vivo (Firebase RTDB). Detalle y reglas en `specs/features/chat/chat.spec.md`. Puede pedir token cualquier miembro de la sección (alumno/delegado/subdelegado con rol `student` en el JWT, o docente/JP con rol `teacher`); un no-miembro recibe `403`.

- `POST /chat/token` — verifica el JWT propio, deriva el rol/pertenencia del solicitante en la sección (desde `enrollment` + `section_representative`, o `section.teacher_id`/`jp_id`), escribe el espejo de membresía `/members/{sectionId}/{uid}` en RTDB (el backend es el ÚNICO que lo escribe) y firma un **custom token** de Firebase (`uid = app_user.id`). Body: `{ "sectionId": number }` (acepta string; se coacciona con `z.coerce.number()`). Response: `{ "token", "uid", "displayName", "role", "roleLabel", "isModerator", "weight" }`. `role ∈ {teacher, jp, delegate, subdelegate, student}`; `weight` = 100/90/70/60/10; `isModerator` = true salvo alumno raso.
- Error principal: `403 CHAT_SECTION_FORBIDDEN` (no pertenece a la sección, o el `userId` del JWT no coincide con el participante).
- `DELETE /chat/sections/:sectionId/messages/:messageId` — **(HU23) borrado suave de un mensaje**, abierto a cualquier rol autenticado. El controller resuelve al solicitante como participante de la sección igual que `POST /chat/token` y exige que el `userId` del JWT coincida con el del participante. Cada participante (alumno, delegado, subdelegado, JP o profesor) borra sus propios mensajes, sin límite de tiempo, y el **profesor titular** (participante con `role == 'teacher'`) borra además los de cualquiera. La autoría se comprueba en el servidor con el `senderId` guardado en el mensaje. Marca el mensaje en RTDB con `{ deleted: true, deletedBy, deletedByUid, deletedByRole, deletedAt }` vía **Admin SDK** (salta las reglas RTDB), y el cliente arma la lápida con `deletedByUid`, porque si coincide con el `senderId`, quien lo borra es su autor. Un mensaje ya borrado no se reescribe (idempotente, `200` con el `deletedBy` que ya guarda). Response `200` con `{ deleted: true, messageId, deletedBy }`. Errores `403 CHAT_DELETE_FORBIDDEN` «Solo puedes eliminar tus propios mensajes.» (no participa de la sección, o el mensaje es de otro y no es el profesor titular), `404 CHAT_MESSAGE_NOT_FOUND` (no existe, o el `messageId` trae una `/` codificada y apunta a un campo) y `400 INVALID_ROUTE_PARAMS`.

Notas:

- Las reglas de seguridad de RTDB (lectura/escritura/borrado por membresía) viven en `ULima_Frontend_IS2/database.rules.json` y se validan con **Firebase Emulator** (fuera de la suite Bun). ⚠️ El `$msg .write` es **solo-crear** desde el cliente (no borra ni edita); el borrado suave lo hace el backend con Admin SDK. Tras cambiar `database.rules.json` hay que redeplegar: `firebase deploy --only database` (proyecto `ulima-plus-chat`, requiere acceso a Firebase).
- Requiere `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL` en el entorno; si faltan, el servicio no firma tokens (chat deshabilitado). ⚠️ Fijar `firebase-admin@12.1.0` (v13/v14 rompen Vercel con `ERR_REQUIRE_ESM`).

## Networking (HU27 — carnet) — PROPUESTO, pendiente de implementar

> Contrato **propuesto** para HU27 (asignada a meltiruiz). La BD ya está lista (migración `drizzle/0001`). Detalle en `specs/features/networking/networking.spec.md`. Aplica a todos los usuarios (alumnos y docentes).

- `GET /networking/me` — carnet del usuario autenticado. Response: `{ "optIn": boolean, "links": [ { "platform", "url", "label"? } ] }`.
- `PUT /networking/me` — actualiza opt-in + reemplaza el set de enlaces. Body: `{ "optIn": boolean, "links": [ { "platform": "linkedin|instagram|github|x|website|other", "url": "https://…", "label"?: "string<=80" } ] }`. Reglas: máx. 1 enlace por plataforma, `url` http(s) ≤255, `label` requerida solo para `website`/`other`. Edita solo el carnet propio (derivado del JWT). Response: el carnet actualizado.
- `GET /networking/users/:userId` — carnet **público** de otro usuario, **solo si** `networking_opt_in = true`. Response: `{ "userId", "fullName", "roleLabel"?, "links": [...] }`. Error: `404 NETWORKING_NOT_PUBLIC` si no dio opt-in.

Notas:

- El carnet solo se expone si el dueño hizo opt-in; quitar el opt-in lo oculta sin borrar los enlaces.
- Compartir en el chat de sección: el mensaje referencia `userId` y el receptor resuelve el carnet vía `GET /networking/users/:userId` (fuente de verdad = Postgres, no se duplican redes en Firebase). Solo el carnet propio y en secciones donde el usuario es miembro.

## Chatbot (Asistente Académico con IA)

Inteligencia artificial conversacional (Cohere) integrada como asistente académico para alumnos. Detalle en `specs/features/chatbot/chatbot.spec.md`.

> **Ajuste del 2026-09-25, aprobada por el dueño el 2026-09-25** (BR-CB-02 a BR-CB-24 de la spec). Ninguna ruta cambia de forma, de campos ni de códigos de error. Cambian dos comportamientos que la app ve. Las sesiones del ciclo anterior desaparecen cuando empieza el período activo, y una pregunta cuya respuesta falla (503) no queda guardada. La primera petición después del despliegue borra de una vez todas las sesiones de producción cuya última actividad es anterior al inicio del período activo (las 00:00 de Lima del 2026-08-24 si la base guarda el calendario publicado de 2026-2). Ese borrado masivo exige antes del merge la aprobación explícita del dueño, con un conteo en solo lectura y un respaldo, como la migración 0013 (BR-CB-22). *Decisión 13 del dueño, del mismo día.* Cambia además un tercer comportamiento, porque una pregunta con una línea que empieza con `DATOS DEL ALUMNO` o con una línea que es solo `FIN DE LOS DATOS` recibe `400 INVALID_QUESTION` (BR-CB-10).

### Sesiones

- `POST /chatbot/sessions` — crea una nueva sesión vacía para el alumno autenticado. Roles requeridos: `student`, `delegate`, `subdelegate`. Response `201`: `{ "session": { "id": "uuid", "title": "Nueva conversacion", "createdAt": "ISO-8601", "updatedAt": "ISO-8601" } }`.
- `GET /chatbot/sessions` — lista todas las sesiones del alumno ordenadas por `updated_at` descendente. Response `200`: `{ "sessions": [ { "id", "title", "createdAt", "updatedAt" } ] }`. *(Desde el 2026-09-25, una vez que empieza el período activo, no incluye las sesiones cuya última actividad es anterior a su inicio, que se borran solas; BR-CB-22.)*
- `GET /chatbot/sessions/:id` — obtiene sesión con todos sus mensajes. Response `200`: `{ "session": { ... }, "messages": [ { "id", "role": "user"|"assistant", "content", "createdAt" } ] }`. Error: `404 SESSION_NOT_FOUND`. *(Desde el 2026-09-25, también para una sesión del ciclo anterior ya borrada.)*
- `DELETE /chatbot/sessions/:id` — elimina sesión y sus mensajes en cascada. Response `200`: `{ "message": "Sesion eliminada correctamente." }`. Error: `404 SESSION_NOT_FOUND`.

### Preguntas

- `POST /chatbot/sessions/:id/ask` — envía una pregunta en lenguaje natural y recibe respuesta del chatbot. Body: `{ "question": "string<=500", "localGrades?": [{ "id": "string", "nombre": "string", "notas": [{ "titulo": "string", "peso": 0-100, "valor": 0-20 }] }] }`. Response `200`: `{ "answer": "string", "sessionId": "uuid" }`. Errores: `400 INVALID_QUESTION`, `404 SESSION_NOT_FOUND`, `429 RATE_LIMITED` (máx. 20 preguntas/hora/alumno), `503 CHATBOT_UNAVAILABLE`.
  - *2026-09-25.* La pregunta y la respuesta se guardan juntas cuando Cohere responde. Con `503 CHATBOT_UNAVAILABLE` no se guarda ninguna de las dos. `404 SESSION_NOT_FOUND` también cubre una sesión del ciclo anterior ya borrada y una que el alumno borró mientras esperaba la respuesta.
  - *2026-09-25, decisión 13 del dueño.* `400 INVALID_QUESTION` también cubre una pregunta con una línea que empieza con `DATOS DEL ALUMNO`, aunque lleve espacios delante, o con una línea que es solo `FIN DE LOS DATOS`, sin distinguir mayúsculas, con el mensaje «La pregunta contiene caracteres no permitidos.» (BR-CB-10). Una pregunta genuina que empieza con «datos del alumno» recibe ese 400, y la frase en medio de una línea pasa.

### Reglas

- El chatbot solo responde con datos reales del alumno contenidos en el contexto (DB + notas locales + Firebase RTDB). No inventa.
- ~~La clasificación de intención usa Cohere Classify con keyword fallback en español.~~ *2026-09-25.* La clasificación es solo por palabras clave en español normalizadas sin tildes, sin llamar a Cohere (`/v1/classify` está retirado). Los dominios son `grades`, `schedule`, `curriculum`, `alerts`, `announcements`, `delegates`, `own_blocks` y `chat` (BR-CB-04). *2026-09-25, ronda final.* Una pregunta que no activa ningún dominio hereda los de la pregunta anterior del alumno en la misma sesión, y solo sin pregunta anterior con palabras clave usa el respaldo `schedule`, `grades` y `curriculum` (BR-CB-04, decisión 11 del dueño).
- ~~La búsqueda en chat usa Cohere Rerank sobre mensajes recientes de Firebase RTDB (sin almacenar embeddings).~~ *2026-09-25.* La búsqueda en el chat de sección lee mensajes recientes de Firebase RTDB sin Rerank, solo cuando la pregunta es sobre el chat o los avisos, y los manda sin remitente (BR-CB-06 y BR-CB-23, esta última derivada de la decisión 1 y confirmada por el dueño al aprobar la spec el 2026-09-25). La omisión de los mensajes borrados de R-CHAT-4 queda confirmada por el dueño el 2026-09-25 en la ronda final. El JSON del chat y de los anuncios escapa además U+2028, U+2029 y U+0085 (BR-CB-23).
- Ventana de contexto limitada a últimos 10 mensajes del historial de la sesión. *2026-09-25.* Esos mensajes viajan una sola vez, como turnos, y no son fuente de datos (BR-CB-20).
- *2026-09-25.* El modelo recibe el system prompt de BR-CB-09 y, como último turno, un mensaje de datos que abre con `DATOS DEL ALUMNO`, cierra con `FIN DE LOS DATOS` y termina con la pregunta. Solo ese bloque es fuente de datos (BR-CB-09 y BR-CB-24). *Ronda final.* Un dominio que se consultó sin datos manda igual su bloque, con una línea que dice que no hay, y uno que no se consultó o cuya lectura falló no manda bloque, así que el modelo distingue «no hay» de «no se consultó» (BR-CB-24, decisión 8 del dueño).
- *2026-09-25.* De otras personas, el chatbot solo usa el delegado y el subdelegado de cada sección activa del alumno, etiquetados por curso y sección, desde `section_representative` activo y, si falta, `section_representative_claim`, o «sin delegado registrado». No manda a Cohere los nombres del resto de compañeros en ningún campo que arme el chatbot (BR-CB-16 y BR-CB-17). Las respuestas anteriores al ajuste se borran una sola vez al desplegar (BR-CB-22b), y el texto libre del chat y de los anuncios puede nombrarlos, porque el chatbot no filtra texto libre (BR-CB-17). ~~Ese segundo residuo espera la confirmación del dueño antes del merge.~~ *2026-09-25, decisión 13 del dueño.* El dueño acepta ese segundo residuo sin filtro, porque el alumno ya ve esos mensajes en el chat de su sección, el chatbot solo los lee cuando la pregunta es sobre el chat o los anuncios y los manda sin remitente (BR-CB-06 y BR-CB-23).
- *2026-09-25.* El chatbot lee los bloques de horario propios del alumno que pregunta, por una función acotada del módulo `time-blocks`, y puede sugerir cómo organizar su tiempo con esos datos (BR-CB-18, BR-CB-19 y RS-BE-35 de `time-blocks`). El récord académico sigue fuera del chatbot (RS-BE-28).
- *2026-09-25.* Retención por ciclo. Una vez que empieza el período activo, las sesiones cuya última actividad es anterior a su inicio se borran con sus mensajes, de forma perezosa al usar el chatbot, sin cron y sin intervención manual (BR-CB-22). La espera al `start_date` del período es una propuesta derivada de la decisión 3 que el dueño confirma al aprobar la spec el 2026-09-25. El corte depende de que `academic_period.start_date` guarde el calendario publicado del ciclo. La primera petición después del despliegue borra de una vez las sesiones sin actividad desde el inicio de 2026-2, de todos los alumnos, con la aprobación previa del dueño, un conteo en solo lectura y un respaldo. Al desplegar se borran además, una sola vez, todas las sesiones anteriores al ajuste, con su respaldo y su conteo (BR-CB-22b).
- Prompt injection bloqueada (400 si contiene `<context>`, `[CONTEXTO]`, `[DATOS_`, o una línea que empieza con `system:` o `assistant:`). *2026-09-25, decisión 13 del dueño.* También da 400 una línea que empieza con `DATOS DEL ALUMNO` o una línea que es solo `FIN DE LOS DATOS`, las dos líneas que enmarcan el mensaje de datos, sin distinguir mayúsculas (BR-CB-10).
- *2026-09-25, ronda final.* BR-CB-10 pide descartar una respuesta de Cohere con IDs o datos de otro alumno, salvo el nombre, el cargo, el curso y la sección del delegado y del subdelegado de las secciones del alumno (enmienda del dueño, decisión 9). Ese descarte no está implementado, como en `main`, y la respuesta llega a la app sin inspeccionarse.
- Título automático de sesión se genera con Cohere en la primera pregunta.
- Rate limit: 20 preguntas/hora/alumno (configurable via `CHATBOT_RATE_LIMIT`).
- Timeout Cohere Chat: 8 segundos. Errores Cohere retornan 503 con mensaje genérico.
- Requiere `COHERE_API_KEY` en variables de entorno.

## Portal Sync (carga de ciclo desde miUlima) — Implementado

Importa los datos oficiales del alumno desde el portal miUlima usando la **sesión del portal que el alumno abrió en un WebView de la app**. El backend SÍ recibe la contraseña y el código TOTP en la variante `credentials` (decisión del owner, 2026-09-02): los usa para el login contra miUlima y los descarta, sin registrarlos ni persistirlos. Ver `specs/features/portal-sync/portal-sync.spec.md`.

Alumno (`requireRole(student|delegate|subdelegate)`, `studentId` del JWT; el código del alumno se lee de `app_user` por `userId`, no del JWT):

- `GET /portal-sync/status`
  - Response: `{ "activePeriod": { "id": number, "code": "2026-2" } | null, "enrollmentsInActivePeriod": number, "needsImport": boolean }`
  - `needsImport` = no hay período activo o el alumno no tiene `enrollment` activa en él.
- `POST /portal-sync/import`
  - Body: `{ "cookies": { "JSESSIONID": string, "LtpaToken2": string, "LtpaToken": string|null } }` **o** `{ "credentials": { "password": string, "passcode": string } }`, exactamente uno de los dos (cookies de `webaloe.ulima.edu.pe`; nunca se persisten ni se registran en logs), más el campo opcional `"consent": true`.
  - `consent` (RS-BE-29 de `specs/features/academic-record/academic-record.spec.md`): la app lo manda después de que el alumno acepta la pantalla de consentimiento del récord académico. Con `consent: true` **y** un récord de confianza, la importación guarda además la copia del récord, la foto acumulada y el resumen por ciclo. Sin él —es lo que mandan las apps ya instaladas— la importación corre igual que siempre (horario, matrícula, malla y `enrollment.final_grade`) y no se guarda nada de eso. Cualquier valor que no sea booleano se rechaza con `400 INVALID_REQUEST_BODY`.
  - Response `200`:
    ```json
    {
      "period": { "id": 12, "code": "2026-2", "created": false },
      "identity": { "portalCode": "20230001", "fullName": "string", "career": "INGENIERÍA DE SISTEMAS" },
      "summary": {
        "coursesCreated": 0, "teachersCreated": 0, "sectionsCreated": 0, "sectionsUpdated": 5,
        "sessionsUpserted": 12, "enrollmentsUpserted": 5, "enrollmentsWithdrawn": 0,
        "progressUpserted": 53, "progressSkipped": 4, "progressRemoved": 2, "alertsCreated": 1, "syllabiUpserted": 3
      },
      "warnings": [ { "code": "PERIOD_DATES_DEFAULTED" | "PERIOD_NOT_ACTIVATED_YET" | "TEACHER_MISSING" | "PARSER_FAILED" | "CAREER_MISMATCH" | "PROGRESS_SKIPPED" | "PROGRESS_REMOVED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE" | "SYLLABUS_UNAVAILABLE", "block": "string", "message": "string" } ]
    }
    ```
  - Errores: **`409 PORTAL_SESSION_INVALID`** (el portal devolvió `inicio.jsp` o pidió passcode — es 409 y no 401 a propósito: `ApiClient` del frontend trata todo 401 como expiración del JWT y cerraría la sesión del usuario), `403 PORTAL_IDENTITY_MISMATCH` (código del portal ≠ `app_user.code`), `422 PORTAL_IDENTITY_UNVERIFIABLE` (no se pudo leer el código del portal), `502 PORTAL_UNAVAILABLE`, `504 PORTAL_TIMEOUT`, `429 RATE_LIMITED` (máx. 5 importaciones por alumno por hora).
  - La verificación de identidad ocurre ANTES de cualquier escritura y no se degrada a `warnings`.
  - Idempotente: repetir la importación deja el mismo estado (todos los upsert usan `ON CONFLICT` sobre constraints existentes). No toca `simulated_grades`, simulación de malla, especialidades, anuncios, asesorías, representantes, chat, networking, `schedule_session.color_hex` ni las horas de asistencia.
  - **La primera importación de un ciclo nuevo activa ese `academic_period` para TODOS los alumnos** (`is_active` es único global). Solo avanza el ciclo, nunca lo retrocede, y solo activa si la fecha de inicio del ciclo ya llegó (la Universidad publica el calendario días antes de que empiecen las clases). Si el período se crea antes de esa fecha, queda inactivo y la respuesta trae el warning `PERIOD_NOT_ACTIVATED_YET`; una importación posterior en o después de esa fecha lo activa.
  - **Sílabos**: además de matrícula y récord, la importación busca en paralelo el sílabo de cada curso importado en la base Domino de sílabos (`cactus.ulima.edu.pe`, host separado y con su propia allowlist — ver `specs/features/portal-sync/portal-sync.spec.md` §SSO). `summary.syllabiUpserted` cuenta las filas **efectivamente escritas**. Que un curso no tenga sílabo publicado es normal y no genera advertencia por curso; solo si NINGÚN curso del ciclo trae sílabo se agrega una única advertencia `SYLLABUS_UNAVAILABLE` (esa advertencia se decide con el resultado de la descarga, no con el contador, y su mensaje no afirma que el portal no publicó nada: desde el backend no se distingue eso de un fallo de red o de sesión). Un fallo al buscar o guardar un sílabo nunca aborta la importación ni afecta el resto del `summary`: la búsqueda se degrada por curso y la escritura usa `on conflict do nothing` sin conflict target, que cubre las dos restricciones únicas de la tabla y por eso no puede levantar un `23505`.
  - **La importación NO pisa sílabos existentes**: si la oferta ya tenía fila `syllabus` (sembrada o de una importación anterior), se conserva tal cual — incluido su `silaboUrl` de Google Drive, que `GET /grades/me/courses` sirve a todos los alumnos de la oferta. La contrapartida aceptada es que **un sílabo republicado no se actualiza** al re-importar el mismo ciclo.
  - **Limpieza de electivos (RS-BE-23)**: con `consent: true` y un récord de confianza, la importación borra de `student_course_progress` los electivos en estado `approved` que ninguna fila del récord respalda, y cuenta lo borrado en `summary.progressRemoved`. Es la única parte de la importación que BORRA progreso. No corre si alguna fila aprobada del récord no resolvió a la malla (ni por código directo ni por `course_equivalence`, salvo los códigos de Estudios Generales ya conocidos), ni si el conjunto de respaldo queda vacío; en esos casos el motivo va al log del servidor y `progressRemoved` queda en 0. Nunca toca un obligatorio ni un curso de Estudios Generales, ni una fila `in_progress`, `failed` o `withdrawn`, ni `student_curriculum_simulation`. Si `progressRemoved` es mayor que 0 la respuesta trae el warning `PROGRESS_REMOVED` con el mensaje `"Se desmarcaron N electivos que tu récord no respalda."` (con `"Se desmarcó 1 electivo que tu récord no respalda."` en singular). El nivel del alumno no se mueve: la cobertura de ciclos ya excluye electivos. Ver `specs/features/academic-record/academic-record.spec.md` §RS-BE-23.

## Academic Record (récord académico)

Copia del récord que la importación guarda cuando el alumno da su consentimiento y el récord es de confianza. Detalle en `specs/features/academic-record/academic-record.spec.md`. **Solo el dueño de los datos los lee**: el alumno sale del JWT, no hay parámetro ni ruta para docentes o delegados, y el chatbot no toca estas tablas (RS-BE-28).

### GET /academic-record/me

Récord del alumno autenticado: la foto acumulada, el resumen por ciclo y el récord agrupado por ciclo, del más reciente al más viejo.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK` (todos los valores del ejemplo son inventados; el DTO no lleva código de alumno, porque el alumno se identifica por el token):
  ```json
  {
    "syncedAt": "2026-09-18T15:00:00.000Z",
    "snapshot": {
      "ppa": 14.62,
      "relativePosition": "TERCIO SUPERIOR",
      "creditsAccumulated": 164,
      "creditsRequired": 200,
      "approved": { "courses": 50, "credits": 164 },
      "convalidated": { "courses": 0, "credits": 0 }
    },
    "periods": [
      {
        "periodCode": "2025-2",
        "average": 13.25,
        "relativePosition": "MEDIO SUPERIOR",
        "level": 4,
        "convalidated": { "courses": 0, "credits": 0 },
        "enrolled": { "courses": 7, "credits": 23 },
        "approved": { "courses": 5, "credits": 16 },
        "failed": { "courses": 2, "credits": 7 }
      }
    ],
    "record": [
      {
        "periodCode": "2026-1",
        "courses": [
          {
            "code": "659003",
            "name": "CURSO DE PRUEBA TRES",
            "attempt": 1,
            "credits": 1.5,
            "grade": null,
            "gradeRaw": null,
            "section": "917",
            "observation": null
          }
        ]
      }
    ]
  }
  ```
- **`Cache-Control: no-store`** en la respuesta: son las notas del alumno y no se guardan en ninguna caché intermedia.
- **Orden**: `record` y `periods` van del ciclo más reciente al más viejo; dentro de cada ciclo, los cursos en el orden en que el portal los listó.
- **Tipos**: todo numérico es `number`, nunca string; `credits`, `ppa`, `average` y los `credits*` pueden traer decimal, y `attempt`, `grade`, `level` y los `courses` son enteros. Un campo sin dato es `null`, nunca 0, y en los pares `{ courses, credits }` cada número va por separado.
- `syncedAt` es `student_academic_snapshot.synced_at` en ISO-8601 UTC con milisegundos, o `null` si no hay foto.
- **Estado vacío**: si el alumno nunca sincronizó —o nunca con consentimiento y un récord de confianza— la respuesta es `{ "syncedAt": null, "snapshot": null, "periods": [], "record": [] }` con `200`.
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`

### DELETE /academic-record/me

Borra la copia del récord del alumno autenticado: `student_record_entry`, `student_period_summary` y `student_academic_snapshot`, en una sola transacción.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`: `{ "ok": true }`
- **`Cache-Control: no-store`** también en esta respuesta.
- **No** toca `student_course_progress`: ese progreso lo necesita la malla y es de otra funcionalidad. Tampoco borra matrícula, horario ni notas oficiales.
- Si el alumno vuelve a sincronizar y acepta de nuevo, la copia se guarda otra vez.
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`

## Time Blocks (bloques de horario propios)

Bloques que el propio alumno registra en su horario —prácticas, trabajo, voluntariado—, con repetición semanal, excepciones por día y la suma de horas por semana. Detalle en `specs/features/time-blocks/time-blocks.spec.md` (RS-BE-30 a RS-BE-35). Viven en `student_time_block` y `student_time_block_exception` (migración `drizzle/0012_time_blocks.sql`) y **no** se mezclan en `GET /schedule/me/sessions`: van por sus propias rutas.

Reglas comunes a las siete rutas:

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate` (`authMiddleware` + `requireRole(...STUDENT_ROLES)` sobre todo el módulo). Un token docente recibe `403 FORBIDDEN`.
- **El alumno sale solo del token.** No hay parámetro de alumno ni ruta para docentes o delegados; un `studentId` que llegue en la query o en el body se ignora.
- **Un bloque de otro alumno es un bloque que no existe**: responde `404 TIME_BLOCK_NOT_FOUND`, igual que un id que no existe, para no confirmar que ese id existe.
- **Formatos**: las horas viajan como `"HH:MM"` y las fechas como `"YYYY-MM-DD"`, en hora de Lima y sin zona horaria pegada: son horas de pared, no instantes. Una fecha que no existe en el calendario (`2026-02-30`) o que cae fuera de **2000-01-01 a 2099-12-31** es un formato inválido. `daysOfWeek` usa la convención de `schedule_session.day_of_week`: **1 es lunes y 7 es domingo**.
- **Tipos**: los numéricos salen como `number` JSON (`hours` puede traer decimal); un campo sin dato es `null`, nunca 0. Una excepción `cancelled` lleva `startTime` y `endTime` en `null`.
- **Grilla**: toda hora de inicio y de fin cae entre **07:00 y 22:00**; si no, `400 TIME_BLOCK_OUT_OF_GRID`. Es el rango que la grilla del horario de la app puede pintar. La hora de fin tiene que ser estrictamente mayor que la de inicio; si no, `400 INVALID_REQUEST_BODY` con el error en `endTime` (no es un error de grilla).
- **Chatbot**: ~~no lee estas tablas ni importa el módulo (RS-BE-35).~~ *Ajustado el 2026-09-25 y aprobado por el dueño ese día.* Lee solo los bloques del propio alumno por la función `readOwnTimeBlocksForAssistant` que exporta el módulo, de solo lectura y sin `id` ni color. No nombra las tablas ni importa nada más del módulo (RS-BE-35). Las rutas de abajo no cambian.
- Todos los valores de los ejemplos son inventados.
- **Mensajes** (`error.message` de cada código): `TIME_BLOCK_LIMIT_REACHED` "Llegaste al máximo de 20 bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro.", `TIME_BLOCK_NOT_FOUND` "No existe ese bloque.", `TIME_BLOCK_OUT_OF_GRID` "El bloque tiene que empezar y terminar entre las 07:00 y las 22:00.", `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN` "Ese día no forma parte del bloque." y `TIME_BLOCK_WINDOW_TOO_WIDE` "La ventana no puede pasar de 120 días.". Los 400 de validación llevan el `message` de siempre y el texto de cada campo en `details.fieldErrors`; entre ellos, el de un rango de fechas sin ninguno de los días marcados es "Entre esas fechas no cae ninguno de los días que marcaste." (en `endDate`, el mismo texto que muestra la app).
- **Errors comunes**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`; `400` `INVALID_JSON_BODY` en `POST`, `PATCH` y `PUT` (un cuerpo que no es JSON); `400` `INVALID_ROUTE_PARAMS` en las rutas con `:id` (un `:id` que no es un entero de 1 a 2147483647, o un `:date` que no es una fecha válida).

### GET /time-blocks/me

Los bloques del alumno autenticado, cada uno con sus excepciones.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`:
  ```json
  {
    "blocks": [
      {
        "id": 12,
        "title": "Prácticas",
        "colorHex": "#F94B3F",
        "daysOfWeek": [1, 3],
        "startTime": "14:00",
        "endTime": "18:00",
        "startDate": "2026-09-01",
        "endDate": "2026-12-15",
        "exceptions": [
          { "date": "2026-10-07", "status": "cancelled", "startTime": null, "endTime": null },
          { "date": "2026-10-12", "status": "moved", "startTime": "15:00", "endTime": "19:30" }
        ]
      }
    ]
  }
  ```
- **Orden**: los bloques por `startDate`, luego por `startTime` y luego por `id`; las excepciones de cada bloque, por fecha.
- Un alumno sin bloques recibe `{ "blocks": [] }`.
- `exceptions` trae todas las excepciones guardadas del bloque, incluida la que quedó fuera del patrón porque después se editó la regla (ver `PATCH`).

### POST /time-blocks/me

Crea un bloque.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body**:
  ```json
  {
    "title": "Prácticas",
    "colorHex": "#F94B3F",
    "daysOfWeek": [1, 3],
    "startTime": "14:00",
    "endTime": "18:00",
    "startDate": "2026-09-01",
    "endDate": "2026-12-15"
  }
  ```
  - `title`: se recorta; de 1 a 60 caracteres después de recortar.
  - `colorHex`: `^#[0-9A-Fa-f]{6}$`.
  - `daysOfWeek`: de 1 a 7 valores **distintos**, cada uno de 1 a 7.
  - `startTime` y `endTime`: `HH:MM`, dentro de 07:00–22:00 y `endTime` estrictamente mayor.
  - `startDate` y `endDate`: fechas que existen, entre 2000-01-01 y 2099-12-31, con `endDate >= startDate`.
  - Entre `startDate` y `endDate`, bordes incluidos, tiene que caer **al menos una fecha cuyo día de la semana esté en `daysOfWeek`**. Si no cae ninguna, la respuesta es `400 INVALID_REQUEST_BODY` con "Entre esas fechas no cae ninguno de los días que marcaste." en `details.fieldErrors.endDate`. Un bloque así se guardaría pero nunca ocurriría, porque `GET /time-blocks/me/occurrences` no lo devolvería en ninguna ventana y la app no lo pintaría. Un rango de siete días o más siempre cumple. Una fecha inválida, unos días fuera de 1 a 7 o un `endDate` anterior a `startDate` producen su propio error y no suman este. Unos días repetidos sí lo suman, porque la cuenta no depende de ellos, así que `[2, 2]` en un rango sin ningún martes devuelve los dos errores, uno en `daysOfWeek` y otro en `endDate`.
- **Response** `201 Created`:
  ```json
  {
    "block": {
      "id": 12,
      "title": "Prácticas",
      "colorHex": "#F94B3F",
      "daysOfWeek": [1, 3],
      "startTime": "14:00",
      "endTime": "18:00",
      "startDate": "2026-09-01",
      "endDate": "2026-12-15",
      "exceptions": []
    }
  }
  ```
- **Errors**: `400` `INVALID_REQUEST_BODY` (un campo con formato inválido, días repetidos, `endTime` no mayor que `startTime`, `endDate` anterior a `startDate` o un rango sin ninguno de los días marcados; `details.fieldErrors` nombra el campo), `400` `TIME_BLOCK_OUT_OF_GRID`, `400` `TIME_BLOCK_LIMIT_REACHED` (el alumno ya tiene **20** bloques guardados, **vencidos incluidos**: es un tope para que la expansión de una ventana no crezca sin control, no una regla de negocio, y un bloque vencido sigue expandiéndose en una ventana pasada; para crear otro hay que borrar uno).

### PATCH /time-blocks/me/:id

Reemplaza la regla entera del bloque `:id`: es "cambiar todas las semanas".

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body**: los siete campos de `POST /time-blocks/me`, todos obligatorios y con las mismas reglas, incluida la de que entre `startDate` y `endDate` caiga al menos uno de los días marcados.
- **Response** `200 OK`: `{ "block": … }`, con la forma de `POST` y las excepciones del bloque.
- **Conserva las excepciones**: si el alumno mueve el patrón de 14:00 a 15:00, el día que ya había cancelado sigue cancelado. Una excepción que por el cambio queda fuera del rango o de los días del bloque sigue guardada y la expansión la ignora; se limpia con `DELETE /time-blocks/me/:id/occurrences/:date`.
- **Desde un navegador**: es la primera ruta `PATCH` del backend, y el CORS de `src/server.ts` incluye `PATCH` en `allowMethods` para que el preflight la deje pasar. La app nativa (iOS y Android) no hace preflight.
- **Errors**: `400` `INVALID_REQUEST_BODY` (los mismos casos que en `POST`, también un rango sin ninguno de los días marcados), `400` `TIME_BLOCK_OUT_OF_GRID`, `404` `TIME_BLOCK_NOT_FOUND`.

### DELETE /time-blocks/me/:id

Borra el bloque y, en cascada, sus excepciones.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`: `{ "ok": true }`
- **Errors**: `404` `TIME_BLOCK_NOT_FOUND`, también al repetir el `DELETE` de un bloque ya borrado.

### PUT /time-blocks/me/:id/occurrences/:date

Fija la excepción de un día suelto del bloque —ese día no va, o va con otras horas— sin tocar el patrón de las demás semanas.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body**, uno de los dos:
  ```json
  { "status": "cancelled" }
  ```
  ```json
  { "status": "moved", "startTime": "15:00", "endTime": "19:30" }
  ```
  En `moved` las dos horas son obligatorias y siguen las reglas de la grilla; en `cancelled`, si llegan horas, se ignoran.
- `:date` tiene que caer **dentro del rango del bloque y en uno de sus días de la semana**: una excepción sobre un día que el patrón no genera no significa nada.
- **Idempotente**: repetir el mismo `PUT` deja el mismo estado, y un `PUT` sobre una fecha que ya tenía excepción la reemplaza.
- **Response** `200 OK`, con la misma forma que la excepción dentro de su bloque en `GET /time-blocks/me`:
  ```json
  {
    "exception": {
      "date": "2026-10-12",
      "status": "moved",
      "startTime": "15:00",
      "endTime": "19:30"
    }
  }
  ```
- **Errors**: `400` `INVALID_REQUEST_BODY` (`status` desconocido, o `moved` sin horas, con horas mal formadas o con la de fin no mayor que la de inicio), `400` `TIME_BLOCK_OUT_OF_GRID`, `400` `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`, `404` `TIME_BLOCK_NOT_FOUND`.

### DELETE /time-blocks/me/:id/occurrences/:date

Quita la excepción de ese día: el día vuelve al patrón.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`: `{ "ok": true }`
- **Idempotente**: si ese día no tenía excepción, responde igual. No exige que `:date` esté en el patrón, para poder limpiar una excepción que quedó fuera después de un `PATCH`.
- **Errors**: `404` `TIME_BLOCK_NOT_FOUND`.

### GET /time-blocks/me/occurrences

Los bloques ya concretos de una ventana de fechas: el servidor expande cada regla día por día, aplica las excepciones y suma las horas de cada semana.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Query**: `from` y `to`, **obligatorias**, en `YYYY-MM-DD`. La ventana incluye los dos extremos, `to` no puede ser anterior a `from` (`400 INVALID_QUERY_PARAMS`) y cubre como máximo **120 días** (`400 TIME_BLOCK_WINDOW_TOO_WIDE`): `from=2026-09-21&to=2027-01-18` es la ventana más ancha que empieza ese lunes.
- **Response** `200 OK` para `?from=2026-10-05&to=2026-10-18`, con el bloque del ejemplo de `GET /time-blocks/me`:
  ```json
  {
    "occurrences": [
      { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
        "date": "2026-10-05", "dayOfWeek": 1, "startTime": "14:00", "endTime": "18:00", "moved": false },
      { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
        "date": "2026-10-12", "dayOfWeek": 1, "startTime": "15:00", "endTime": "19:30", "moved": true },
      { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
        "date": "2026-10-14", "dayOfWeek": 3, "startTime": "14:00", "endTime": "18:00", "moved": false }
    ],
    "weeks": [
      { "weekStart": "2026-10-05", "hours": 4 },
      { "weekStart": "2026-10-12", "hours": 8.5 }
    ]
  }
  ```
- **`occurrences`**: ordenadas por fecha, luego por hora de inicio y, si empatan, por `blockId`. Un día `cancelled` no aparece (el miércoles `2026-10-07` del ejemplo); un día `moved` aparece con sus horas nuevas y `moved: true`.
- **`weeks`**: una entrada por cada semana de **lunes a domingo** que toca la ventana, de la de `from` a la de `to`, ordenadas por `weekStart`, que es el lunes de esa semana y puede ser anterior a `from`. `hours` es el total de la semana **entera**, aunque la ventana la corte: una ventana que empieza un miércoles suma también el lunes de esa semana, que no sale en `occurrences`. Un día cancelado no suma, un día movido suma su duración nueva, y el total va en horas decimales sin redondear (`8.5` = ocho horas y media). Una semana sin ocurrencias sale con `hours: 0`: es un total conocido, no un dato que falta. Solo cuentan los bloques propios, nunca las clases.
- Sin ocurrencias en la ventana: `occurrences` sale vacío y cada semana que toca la ventana sale con `hours: 0`.
- **Errors**: `400` `INVALID_QUERY_PARAMS` (falta `from` o `to`, alguna no es una fecha válida, o `to` es anterior a `from`), `400` `TIME_BLOCK_WINDOW_TOO_WIDE` (más de 120 días).

## Specialty Test (test de especialidad), PROPUESTO y pendiente de aprobación

Test que conduce Ulises y que recomienda uno de los cuatro diplomas oficiales. El backend sirve el contenido versionado, calcula el puntaje con la fórmula del contenido, decide los desempates, pide a Cohere el motivo con respaldo de plantillas y guarda solo el último resultado del alumno. Detalle en `specs/features/specialty-test/specialty-test.spec.md` (RS-BE-37 a RS-BE-47). El resultado vive en `student_specialty_test_result` (migración `drizzle/0014_specialty_test_result.sql`, cambio de BD pendiente de la aprobación del dueño).

Las tres rutas comparten estas reglas.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate` (`authMiddleware` + `requireRole(...STUDENT_ROLES)` sobre todo el módulo). Un token docente recibe `403 FORBIDDEN`. El alumno sale solo del token.
- **Disponibilidad**: el servidor traduce las claves `sw`, `ti`, `si` y `vj` a los `specialtyId` de las especialidades con `is_active = true` de la carrera del alumno, por nombre, sin distinguir mayúsculas ni tildes. Si alguna no aparece, el test no está disponible para ese alumno (`404 SPECIALTY_TEST_NOT_AVAILABLE`) y la app muestra la elección manual. Las tres rutas lo comprueban, `GET /specialty-test/me/result` también cuando hay un resultado guardado.
- **Tipos**: `affinity` es un entero de 0 a 100, redondeado con el medio hacia arriba; el servidor decide el orden, los desempates y el empate con la afinidad exacta. Las fechas van en ISO-8601 UTC con milisegundos.
- **Mensajes** (`error.message` de cada código nuevo): `SPECIALTY_TEST_NOT_AVAILABLE` "El test de especialidad no está disponible para tu carrera.", `SPECIALTY_TEST_VERSION_OUTDATED` "El test se actualizó. Vuelve a empezarlo.", `SPECIALTY_TEST_INVALID_ANSWERS` "Las respuestas no corresponden a esta versión del test.", `SPECIALTY_TEST_TIEBREAK_MISMATCH` "Los desempates enviados no son los que corresponden a estas respuestas.", `PAYLOAD_TOO_LARGE` "La petición es demasiado grande." y `RATE_LIMITED` "Hiciste demasiados intentos del test. Intenta de nuevo en N minuto(s).".
- **Errors comunes**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`, `404` `USER_NOT_FOUND` (el token no tiene fila en `student`), `404` `SPECIALTY_TEST_NOT_AVAILABLE`.
- Todos los valores de los ejemplos son inventados, y los `specialtyId` son ilustrativos.

### GET /specialty-test/content

Contenido de la versión vigente, con lo necesario para conducir el test sin red entre pregunta y pregunta.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK` (recortado):
  ```json
  {
    "version": "2026-09-25.3",
    "specialties": [
      {
        "key": "sw", "specialtyId": 1, "name": "Ingeniería de Software",
        "tagline": "Diseña y programa aplicaciones que funcionan bien y se pueden seguir mejorando.",
        "color": { "light": "#1E3A8A", "dark": "#A5C0F7" }, "icon": "code-xml", "totalCredits": 21,
        "electives": [
          { "code": "650070", "name": "Paradigmas de Programación", "shortName": "Paradigmas de Programación",
            "credits": 3, "prerequisite": "Haber culminado el V ciclo" }
        ]
      }
    ],
    "ulises": {
      "welcome": ["¡Hola! Soy Ulises. …"], "startButton": "Vamos",
      "duelHelp": "Toca la tarea que harías con más ganas.",
      "scaleHelp": "Elige cuánto te gustaría hacer esta tarea.",
      "reactions": { "pick": ["Anotado."], "both": ["…"], "none": ["…"], "scale": ["…"] },
      "loading": "Dame un toque que junto tus respuestas."
    },
    "duelOptions": [
      { "id": "top", "label": "(tarea de arriba)" }, { "id": "bottom", "label": "(tarea de abajo)" },
      { "id": "both", "label": "Me gustan las dos" }, { "id": "none", "label": "Ninguna me llama" }
    ],
    "scaleOptions": [
      { "id": "nada", "label": "Nada" }, { "id": "un_poco", "label": "Un poco" },
      { "id": "bastante", "label": "Bastante" }, { "id": "me_encantaria", "label": "Me encantaría" }
    ],
    "questions": [
      { "id": "q01", "n": 1, "type": "duel", "prompt": "¿Cuál harías con más ganas?",
        "top": { "id": "q01.top", "specialty": "sw",
                 "text": "Programar la app con la que una bodega recibe pedidos del barrio",
                 "illustration": "Celular con la app de una bodega abierta, …" },
        "bottom": { "id": "q01.bottom", "specialty": "si", "text": "…", "illustration": "…" },
        "reaction": "Arrancamos por el barrio. …" },
      { "id": "q04", "n": 4, "type": "scale", "prompt": "¿Cuánto te gustaría hacer esto?",
        "task": { "id": "q04.task", "specialty": "ti", "text": "…", "illustration": "…" },
        "blockClose": "Primer tramo listo. Van 4 de 14." }
    ]
  }
  ```
- **Qué no viaja**: el nombre del ícono en Flutter (`icon.flutter`), resúmenes y electivos de cada tarea, pesos, umbral, plantillas del motivo, líneas de Ulises del resultado salvo la de espera (`ulises.loading`), líneas del desempate, desempates, ejemplos, balance y fuentes. Son del cálculo y del motivo, que hace el servidor.
- **`icon`**: el nombre del ícono en Lucide (`icon.lucide` del contenido, por ejemplo `code-xml`). `totalCredits` son los créditos del diploma.
- **`specialty` de cada tarea**: viaja porque la app enciende la tarjeta tocada con el color de su especialidad. La app no la muestra antes del toque y Ulises no nombra especialidades durante el test.
- **Errors**: los comunes.

### POST /specialty-test/me/evaluate

Evaluación sin estado. Recibe todas las respuestas dadas hasta ese momento y devuelve el siguiente desempate o el resultado final. Solo el resultado final se guarda.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body** (hasta 4 KiB):
  ```json
  {
    "version": "2026-09-25.3",
    "answers": {
      "q01": "bottom", "q02": "bottom", "q03": "both", "q04": "nada", "q05": "top",
      "q06": "top", "q07": "top", "q08": "bastante", "q09": "top", "q10": "top",
      "q11": "bottom", "q12": "me_encantaria", "q13": "bottom", "q14": "un_poco"
    },
    "tiebreakAnswers": [ { "id": "tb-si-vj-1", "answer": "bottom" } ]
  }
  ```
  - `answers`: exactamente los 14 ids de pregunta de esa versión. Un duelo admite `top`, `bottom`, `both` o `none`; una escala, `nada`, `un_poco`, `bastante` o `me_encantaria`.
  - `tiebreakAnswers`: de 0 a 2, en orden, cada uno con el id del desempate que el servidor pide y una respuesta de duelo. Opcional, vacío por defecto.
- **Response** `200 OK` cuando toca un desempate (no guarda nada):
  ```json
  {
    "status": "tiebreak",
    "tiebreak": {
      "id": "tb-si-vj-2", "order": 2, "prompt": "¿Cuál harías con más ganas?",
      "top": { "id": "tb-si-vj-2.top", "specialty": "vj", "text": "…", "illustration": "…" },
      "bottom": { "id": "tb-si-vj-2.bottom", "specialty": "si", "text": "…", "illustration": "…" }
    },
    "ulisesLine": "Sigue reñido. Una última y listo."
  }
  ```
- **Response** `200 OK` con el resultado final (guarda o reemplaza el último resultado del alumno):
  ```json
  {
    "status": "result",
    "result": {
      "version": "2026-09-25.3",
      "completedAt": "2026-09-25T20:15:00.000Z",
      "tie": false,
      "ranking": [
        { "key": "vj", "specialtyId": 7, "name": "Desarrollo de Videojuegos", "affinity": 75 },
        { "key": "si", "specialtyId": 6, "name": "Sistemas de Información", "affinity": 65 },
        { "key": "ti", "specialtyId": 5, "name": "Tecnologías de la Información", "affinity": 28 },
        { "key": "sw", "specialtyId": 1, "name": "Ingeniería de Software", "affinity": 24 }
      ],
      "reason": "Desarrollo de Videojuegos sumó 5,5 de 7 puntos en los duelos, …",
      "reasonSource": "templates",
      "ulises": {
        "intro": "Ya tengo tu resultado.",
        "headline": "Lo tuyo apunta a Desarrollo de Videojuegos, con 75 % de afinidad.",
        "tiebreakOutcome": "Ahí está, ya se inclinó la balanza.",
        "closing": "Tómalo como una brújula, no como una sentencia. …",
        "retake": "Si más adelante cambias de idea, puedes volver a hacer el test."
      }
    }
  }
  ```
- **`reasonSource`**: `"ai"` si el motivo lo redacta Cohere y pasa la validación, `"templates"` si sale de las plantillas del contenido. Un fallo o una demora de Cohere (más de 5 s) nunca es un error para la app.
- **Empate**: `tie: true`, las dos primeras del ranking son las ganadoras, `headline` es la línea de empate y `tiebreakOutcome` la de «Ni así se separan».
- **Idempotente en el ranking**: el mismo cuerpo da siempre el mismo paso y el mismo ranking; el motivo de Cohere puede variar.
- **`Cache-Control: no-store`** en la respuesta.
- **Límite**: 30 evaluaciones por alumno por hora.
- **Errors**: `400` `INVALID_JSON_BODY`, `400` `INVALID_REQUEST_BODY`, `400` `SPECIALTY_TEST_INVALID_ANSWERS` (`details.missing`, `details.unexpected`, `details.invalid`), `400` `SPECIALTY_TEST_TIEBREAK_MISMATCH` (`details.expected`, el id que tocaba o `null`), `409` `SPECIALTY_TEST_VERSION_OUTDATED` (`details.currentVersion`), `413` `PAYLOAD_TOO_LARGE`, `429` `RATE_LIMITED` (`details.retryAfterMinutes`), `500` `INTERNAL_SERVER_ERROR` si falla el guardado del resultado, que va antes de la llamada a Cohere, y los comunes.

### GET /specialty-test/me/result

Último resultado guardado del alumno, para el Perfil.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`:
  ```json
  {
    "result": {
      "version": "2026-09-25.3",
      "isCurrentVersion": true,
      "completedAt": "2026-09-25T20:15:00.000Z",
      "tie": false,
      "ranking": [
        { "key": "vj", "specialtyId": 7, "name": "Desarrollo de Videojuegos", "affinity": 75 },
        { "key": "si", "specialtyId": 6, "name": "Sistemas de Información", "affinity": 65 },
        { "key": "ti", "specialtyId": 5, "name": "Tecnologías de la Información", "affinity": 28 },
        { "key": "sw", "specialtyId": 1, "name": "Ingeniería de Software", "affinity": 24 }
      ]
    }
  }
  ```
- **Estado vacío**: `{ "result": null }` con `200` si el alumno no tiene ningún test terminado.
- No trae el motivo, que no se guarda. `name` sale de la versión vigente del contenido por la clave.
- **`Cache-Control: no-store`** en la respuesta.
- **Errors**: los comunes, y `500` `INTERNAL_SERVER_ERROR` si la fila guardada no tiene la forma esperada. El `404` `SPECIALTY_TEST_NOT_AVAILABLE` sale aunque el alumno tenga un resultado guardado, y la app oculta la tarjeta del Perfil.
