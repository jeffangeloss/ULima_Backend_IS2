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

- Todas las rutas, salvo `GET /`, `GET /health`, `POST /auth/login`, `POST /auth/google`, `POST /auth/password-reset/request` y `POST /auth/password-reset/confirm`, usan `Authorization: Bearer <token>`. Este requisito está **enforced** por `authMiddleware` en cada módulo (incluidos `course-detail`, `grades` y `section-management`).
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
- `GET /auth/me`
  - Response: `{ "user": User }` (shape de estudiante o de docente según el rol del token).
- `POST /auth/logout`
  - Response: `{ "message": "Session closed" }`
- `POST /auth/password-reset/request` (público)
  - Request: `{ "identifier": "string" }` (código de alumno o correo institucional)
  - Response (siempre `200`, exista o no la cuenta): `{ "message": "Si la cuenta existe, enviamos un código a tu correo institucional." }`
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
        "silaboUrl": "https://drive.google.com/...",
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
- **Response** `200 OK`:
  ```json
  {
    "days": [
      {
        "dayName": "Lunes",
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo"
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

- Horario usa `schedule_session` de secciones con enrollment activo.
- Evaluaciones usan `assessment.week_number` mapeado dinámicamente a fechas reales de la clase en esa semana académica.
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
- `DELETE /chat/sections/:sectionId/messages/:messageId` — **(HU23) borrado suave de un mensaje**, gateado a `requireRole('teacher')`. El controller valida además que el solicitante sea el **PROFESOR TITULAR** de esa sección (participante con `role == 'teacher'`, no el JP ni representantes, y `userId` del JWT == participante). Marca el mensaje en RTDB con `{ deleted: true, deletedBy, deletedByUid, deletedByRole, deletedAt }` vía **Admin SDK** (salta las reglas RTDB) → el cliente lo muestra como lápida "eliminado por <profesor>". Response `200`: `{ deleted: true, messageId, deletedBy }`. Errores: `403 CHAT_DELETE_FORBIDDEN` (no es el profesor titular de la sección), `404 CHAT_MESSAGE_NOT_FOUND`, `400 INVALID_ROUTE_PARAMS`.

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

### Sesiones

- `POST /chatbot/sessions` — crea una nueva sesión vacía para el alumno autenticado. Roles requeridos: `student`, `delegate`, `subdelegate`. Response `201`: `{ "session": { "id": "uuid", "title": "Nueva conversacion", "createdAt": "ISO-8601", "updatedAt": "ISO-8601" } }`.
- `GET /chatbot/sessions` — lista todas las sesiones del alumno ordenadas por `updated_at` descendente. Response `200`: `{ "sessions": [ { "id", "title", "createdAt", "updatedAt" } ] }`.
- `GET /chatbot/sessions/:id` — obtiene sesión con todos sus mensajes. Response `200`: `{ "session": { ... }, "messages": [ { "id", "role": "user"|"assistant", "content", "createdAt" } ] }`. Error: `404 SESSION_NOT_FOUND`.
- `DELETE /chatbot/sessions/:id` — elimina sesión y sus mensajes en cascada. Response `200`: `{ "message": "Sesion eliminada correctamente." }`. Error: `404 SESSION_NOT_FOUND`.

### Preguntas

- `POST /chatbot/sessions/:id/ask` — envía una pregunta en lenguaje natural y recibe respuesta del chatbot. Body: `{ "question": "string<=500", "localGrades?": [{ "id": "string", "nombre": "string", "notas": [{ "titulo": "string", "peso": 0-100, "valor": 0-20 }] }] }`. Response `200`: `{ "answer": "string", "sessionId": "uuid" }`. Errores: `400 INVALID_QUESTION`, `404 SESSION_NOT_FOUND`, `429 RATE_LIMITED` (máx. 20 preguntas/hora/alumno), `503 CHATBOT_UNAVAILABLE`.

### Reglas

- El chatbot solo responde con datos reales del alumno contenidos en el contexto (DB + notas locales + Firebase RTDB). No inventa.
- La clasificación de intención usa Cohere Classify con keyword fallback en español.
- La búsqueda en chat usa Cohere Rerank sobre mensajes recientes de Firebase RTDB (sin almacenar embeddings).
- Ventana de contexto limitada a últimos 10 mensajes del historial de la sesión.
- Prompt injection bloqueada (400 si contiene `<context>`, `[CONTEXTO]`, `system:`, `assistant:`).
- Título automático de sesión se genera con Cohere en la primera pregunta.
- Rate limit: 20 preguntas/hora/alumno (configurable via `CHATBOT_RATE_LIMIT`).
- Timeout Cohere Chat: 8 segundos. Errores Cohere retornan 503 con mensaje genérico.
- Requiere `COHERE_API_KEY` en variables de entorno.

## Portal Sync (carga de ciclo desde miUlima) — Implementado

Importa los datos oficiales del alumno desde el portal miUlima usando la **sesión del portal que el alumno abrió en un WebView de la app**. El backend nunca recibe contraseña ni código TOTP. Ver `specs/features/portal-sync/portal-sync.spec.md`.

Alumno (`requireRole(student|delegate|subdelegate)`, `studentId` del JWT; el código del alumno se lee de `app_user` por `userId`, no del JWT):

- `GET /portal-sync/status`
  - Response: `{ "activePeriod": { "id": number, "code": "2026-2" } | null, "enrollmentsInActivePeriod": number, "needsImport": boolean }`
  - `needsImport` = no hay período activo o el alumno no tiene `enrollment` activa en él.
- `POST /portal-sync/import`
  - Body: `{ "cookies": { "JSESSIONID": string, "LtpaToken2": string, "LtpaToken": string|null } }` (cookies de `webaloe.ulima.edu.pe`; nunca se persisten ni se registran en logs)
  - Response `200`:
    ```json
    {
      "period": { "id": 12, "code": "2026-2", "created": false },
      "identity": { "portalCode": "20235218", "fullName": "string", "career": "INGENIERÍA DE SISTEMAS" },
      "summary": {
        "coursesCreated": 0, "teachersCreated": 0, "sectionsCreated": 0, "sectionsUpdated": 5,
        "sessionsUpserted": 12, "enrollmentsUpserted": 5, "enrollmentsWithdrawn": 0,
        "progressUpserted": 53, "progressSkipped": 4, "alertsCreated": 1
      },
      "warnings": [ { "code": "PERIOD_DATES_DEFAULTED" | "TEACHER_MISSING" | "PARSER_FAILED" | "CAREER_MISMATCH" | "PROGRESS_SKIPPED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE", "block": "string", "message": "string" } ]
    }
    ```
  - Errores: **`409 PORTAL_SESSION_INVALID`** (el portal devolvió `inicio.jsp` o pidió passcode — es 409 y no 401 a propósito: `ApiClient` del frontend trata todo 401 como expiración del JWT y cerraría la sesión del usuario), `403 PORTAL_IDENTITY_MISMATCH` (código del portal ≠ `app_user.code`), `422 PORTAL_IDENTITY_UNVERIFIABLE` (no se pudo leer el código del portal), `502 PORTAL_UNAVAILABLE`, `504 PORTAL_TIMEOUT`, `429 TOO_MANY_REQUESTS` (máx. 5 importaciones por alumno por hora).
  - La verificación de identidad ocurre ANTES de cualquier escritura y no se degrada a `warnings`.
  - Idempotente: repetir la importación deja el mismo estado (todos los upsert usan `ON CONFLICT` sobre constraints existentes). No toca `simulated_grades`, simulación de malla, especialidades, anuncios, asesorías, representantes, chat, networking, `schedule_session.color_hex` ni las horas de asistencia.
  - **La primera importación de un ciclo nuevo activa ese `academic_period` para TODOS los alumnos** (`is_active` es único global). Solo avanza el ciclo, nunca lo retrocede.
