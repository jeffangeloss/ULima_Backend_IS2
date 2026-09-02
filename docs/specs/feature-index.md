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
| 12 | Chatbot Asistente Académico | `specs/features/chatbot/chatbot.spec.md` | HU-CHATBOT-01, HU-CHATBOT-02 | Chatbot con IA (Cohere) que responde preguntas sobre notas, horario, malla, anuncios, compañeros, alertas y chat de sección | `src/modules/chatbot`, `src/services/cohere.client.ts`, `src/services/firebase.service.ts`, `src/db/schema/schema.ts`, `src/shared/middleware/rate-limit.ts` | **Diseñada — pendiente de implementar** |
| 13 | Portal Sync (carga de ciclo desde miUlima) | `specs/features/portal-sync/portal-sync.spec.md` | HU-SYNC-01, HU-SYNC-02 | Importación idempotente por alumno desde miUlima vía sesión de WebView; sin contraseñas en backend | `src/modules/portal-sync`, `src/config/app-config.ts` | Implementado (backend) — **pendiente la verificación manual end-to-end contra el portal real** |

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
