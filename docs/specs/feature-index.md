# Feature Index

This index connects real user stories, product requirements, backend modules, and specs.

| Priority | Feature | Spec | User Stories | Requirements | Backend target | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Platform Runtime | `specs/features/platform-runtime/platform-runtime.spec.md` | N/A | Deploy runtime compatibility | `src/server.ts`, root config files | Completado |
| 1 | Auth | `specs/features/auth/auth.spec.md` | US01, US02, HU18, HU20 | R1, R2, RNF6, RNF7 | `src/modules/auth` | Implementado (incluye Google SSO docente) |
| 2 | Academic Profile | `specs/features/academic-profile/academic-profile.spec.md` | US05 | R12, R13 | `src/modules/academic-profile` | Implementado |
| 3 | Curriculum | `specs/features/curriculum/curriculum.spec.md` | US03, US04 | R4, R5, R10, R11 | `src/modules/curriculum` | Implementado |
| 4 | Grades | `specs/features/grades/grades.spec.md` | US06, US07 | R6, R9 | `src/modules/grades` | Implementado (con deuda técnica: SQL en rutas) |
| 5 | Schedule | `specs/features/schedule/schedule.spec.md` | US09 | R19 | `src/modules/schedule` | Implementado |
| 6 | Course Detail | `specs/features/course-detail/course-detail.spec.md` | US13, US14, US17 | R20 | `src/modules/course-detail` | Implementado (con deuda técnica: SQL en rutas) |
| 7 | Alerts | `specs/features/alerts/alerts.spec.md` | US15 | R15, R16, R22, R23 | `src/modules/alerts` | Implementado |
| 8 | Section Management | `specs/features/section-management/section-management.spec.md` | US16, US17, US18 | R14, R17, R18, R21 | `src/modules/section-management` | Implementado (con deuda técnica: SQL en rutas) |
| 9 | Advising (docentes/JP) | `specs/features/advising/advising.spec.md` | HU18 | Rol docente, asesorías extra, RSVP/conteo | `src/modules/advising`, `src/modules/course-detail`, `auth-middleware.ts`, `schema.ts` | Implementado |
| 10 | Chat en vivo por sección | `specs/features/chat/chat.spec.md` | HU23 | Puente auth Firebase, espejo de membresía, derivación de rol | `src/modules/chat`, `src/services/firebase.service.ts` | Implementado (reglas RTDB vía Emulator pendientes) |
| 11 | Carnet de networking | `specs/features/networking/networking.spec.md` | HU27 | Carnet opt-in con redes sociales (alumnos+docentes), visible en contactos, compartible en chat | `src/modules/networking`, `schema.ts` | **Diseñada — BD lista (migración 0001), pendiente de implementar (meltiruiz)** |
| 12 | Chatbot Asistente Académico | `specs/features/chatbot/chatbot.spec.md` | HU-CHATBOT-01, HU-CHATBOT-02, HU-CHATBOT-03 | Chatbot con IA (Cohere) que responde preguntas sobre notas, horario, malla, anuncios, delegados de las secciones del alumno, sus bloques propios, alertas y chat de sección. Ajuste del 2026-09-25 (BR-CB-16 a BR-CB-24 y BR-CB-22b) con delegados por curso y sección, sin el resto de compañeros, bloques propios y gestión del tiempo, clasificación por palabras clave, historial una sola vez y atómico, retención por ciclo, y un prompt y un mensaje de datos que dejan la base como única fuente | `src/modules/chatbot`, `src/services/cohere.client.ts`, `src/services/firebase.service.ts`, `src/db/schema/schema.ts`, `src/shared/middleware/rate-limit.ts`, `drizzle/0013_chatbot_message_history.sql` | Implementado — **ajuste del 2026-09-25 aprobado por el dueño e implementado en la rama `fix/chatbot-delegados-bloques`, sin mergear**. Hasta que el dueño apruebe la primera purga, nadie corre la rama con el `DATABASE_URL` de producción, ni en un despliegue de vista previa de Vercel ni en local con `bun run dev`, porque su primera petición al chatbot correría la purga de BR-CB-22 contra la base real, y antes de subir la rama o de abrir el PR el dueño comprueba que ningún entorno *Preview* use esa base. Antes del merge faltan la migración 0013 aplicada con su aprobación de BD, el conteo en solo lectura, el respaldo y la aprobación de la primera purga del historial en producción (BR-CB-22) y el borrado único de BR-CB-22b (`MIGRATIONS.md`). El último punto de BR-CB-10, que el dueño enmienda el 2026-09-25 con la excepción de delegado y subdelegado, sigue sin implementar, como en `main`. La ronda final del mismo día lleva al código los datos vacíos explícitos de BR-CB-24 y la herencia del tema de BR-CB-04, y el dueño confirma los comportamientos sumados después de la aprobación. Con la decisión 13 del mismo día, el dueño resuelve los tres puntos que seguían abiertos en «Pendiente del dueño antes del merge» de la spec. Acepta sin filtro el segundo residuo de BR-CB-17, `singleLine` convierte en un espacio todo carácter de control del título de BR-CB-18 y de los datos del bloque 7, y el guardia de BR-CB-10 suma los dos patrones del formato nuevo, así que el merge solo espera las condiciones operativas |
| 13 | Portal Sync (carga de ciclo desde miUlima) | `specs/features/portal-sync/portal-sync.spec.md` | HU-SYNC-01, HU-SYNC-02 | Importación idempotente por alumno desde miUlima vía sesión de WebView; sin contraseñas en backend | `src/modules/portal-sync`, `src/config/app-config.ts` | Implementado (backend) — **pendiente la verificación manual end-to-end contra el portal real** |
| 14 | Asistencia del Aula Virtual | `specs/features/asistencia-portal/asistencia-portal.spec.md` | RS-BE-15, RS-BE-16 | Importa las horas de asistencia del alumno desde el panel Asistencia; sin sesiones ni observaciones del docente | `src/modules/portal-sync`, `src/modules/schedule`, `src/modules/course-detail`, `src/modules/attendance-risk` | Implementado (pendiente medir tiempos del import) |
| 16 | Registro de alumno | `specs/features/registro/registro.spec.md` | RS-BE-17, RS-BE-18 | Alta de cuenta autenticando contra miUlima y cargando el ciclo en el mismo acto | `src/modules/auth`, `src/modules/portal-sync` | Aprobada — pendiente de implementar |
| 17 | Récord académico | `specs/features/academic-record/academic-record.spec.md` | RS-BE-19 … RS-BE-29 | Copia del récord del portal con el consentimiento del alumno, lectura y borrado por su propio dueño, y limpieza de los electivos que el récord no respalda | `src/modules/academic-record`, `src/modules/portal-sync`, `src/modules/auth` | Implementado (pendiente de verificación end-to-end) |
| 18 | Bloques de horario propios | `specs/features/time-blocks/time-blocks.spec.md` | RS-BE-30 … RS-BE-36 | Bloques que el alumno registra (prácticas, trabajo) con repetición semanal, excepciones por día y horas por semana; propios del alumno. El chatbot lee solo los del propio alumno por una función acotada (RS-BE-35, ajustada el 2026-09-25, aprobada por el dueño ese día e implementada en la rama `fix/chatbot-delegados-bloques`). Suma `isoDate` a los días del horario | `src/modules/time-blocks`, `src/modules/index.ts`, `src/server.ts`, `src/modules/schedule`, `src/db/schema/schema.ts`, `drizzle/0012_time_blocks.sql` | Implementado — migración 0012 aplicada el 2026-09-23 (`MIGRATIONS.md`); el 2026-09-23 el dueño recorrió las siete rutas contra producción con su cuenta (11 de 11 pasos correctos) |

## Workflow

1. Read `KNOWLEDGE.md` and this index before updating a spec.
2. Update or create the feature spec before code changes.
3. Confirm API contract changes in `docs/specs/api-contracts.md`.
4. Implement inside the module named in the spec `targets` using `routes -> controller -> service -> repository`.
5. Add tests and link them from the spec using `[@test]`.
6. Review the implementation against the spec before closing the task.

## Data Rules

- PostgreSQL is definitive.
- Do not use frontend JSON files as backend data.
- Do not run migrations, push, generate, or seed without explicit approval.
- Include `src/db/schema/schema.ts` in targets only for an approved database change.
- Include `src/events/**` in targets only when implementing real observers or event contracts.
