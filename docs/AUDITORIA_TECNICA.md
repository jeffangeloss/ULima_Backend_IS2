# Auditoría técnica ULima++ — estado actual back + front

*Generada 2026-07-12. Verificada contra el código desplegado (backend `itsRon4ld/ULima_Backend_IS2@e81e7bd`, frontend `meltiruiz/ULima_Frontend_IS2@a4e958b`) y la BD viva (PG 18.3). Método: inventario de los 14 módulos del backend (rutas + roles resueltos, incluidos sub-mounts) cruzado contra TODAS las llamadas del frontend, + estado de BD/migraciones/docs. Complementa `DATABASE.md` (modelo de datos) y `AUDITORIA_TABLERO.md` (board).*

---

## 1. Resumen ejecutivo

**Salud general: verde con deuda de calidad.** Backend compila limpio (`tsc`, exit 0); 11 suites de test (lógica pura). Frontend `flutter analyze` con 3 infos preexistentes (deprecations de `share`), 176 tests. Prod arriba.

**Alineación front ↔ back: SANA.** Tras los fixes de esta semana, **toda llamada VIVA del frontend tiene su ruta en el backend.** Los únicos "desajustes" que aparecen provienen de **servicios muertos** (sin llamadores), no de features rotas.

**Los 3 riesgos reales (ninguno es un endpoint roto ahora mismo):**
1. 🔴 **Errores tragados en silencio** — el backend atrapa fallas de BD y devuelve datos vacíos/**falsos** con status 200; el frontend además tiene `try/catch` que devuelven `[]`. Resultado: **pantallas que "cargan bien" mostrando nada, o datos ficticios, sin avisar del error.** (§6.1) — este es el problema de fondo detrás de los "no se ve nada" de la semana.
2. 🟠 **Drift de endpoints + código muerto** — el equipo mueve/renombra rutas en el backend; el front se entera tarde (ya pasó 3 veces). Quedaron servicios y un módulo huérfanos. (§4, §6.2)
3. 🟠 **Deuda de proceso** — docs desincronizados (contrato/feature-index), migraciones con numeración colisionada, feature documentada sin implementar (networking). (§5, §6.3)

---

## 2. Backend — 14 módulos y sus endpoints

Roles: **A** = alumno (`student`/`delegate`/`subdelegate`) · **D** = docente (`teacher`) · **Del** = delegado/subdelegado · **P** = público · **Auth** = solo autenticado.

**Públicos:** `GET /` (metadata — **lista desactualizada**), `GET /health`, `GET /version`, `GET /config` (modo estático, desde la 2.1.0).

| Módulo (prefijo) | Endpoints | Rol |
|---|---|---|
| **auth** (`/auth`) | `POST /login`, `POST /google`, `POST /password-reset/{request,confirm,request-me}`, `GET /me`, `POST /logout` | P / Auth |
| **academic-profile** (`/academic-profile`) | `GET /me`, `GET /careers`, `GET /specialties`, `PUT /me/specialties` | A |
| **curriculum** (`/curriculum`) | `GET /me`, `PUT /me/simulation`, `DELETE /me/simulation/:id` | A |
| **grades** (`/grades`) | `GET /me/courses`, `POST /me/calculate`, `GET/POST /me/notes`, `DELETE /me/notes/:sectionId/:assessmentId` | A |
| **simulated-grades** (`/simulated-grades`) | `GET/PUT /me`, `DELETE /me/:assessmentId` — ⚠️ **HUÉRFANO** (mismo fin que `/grades/me/notes`, sin llamadores) | A |
| **official-grades** (`/official-grades`) | `GET /me` (A); `GET/PUT /teacher/sections[/:id/scores]` (D) | A/D |
| **schedule** (`/schedule`) | `GET /me/{sessions,assessments,load}` (A); `GET /teacher/{sessions,assessments}`, `GET /teacher/sections/:id/assessments-status`, `POST /teacher/sections/:id/assessments/:aid/notify-grades` (D) | A/D |
| **course-detail** (`/course-detail`) | `GET /sections`, `/sections/:id`, `/sections/:id/announcements`, `/sections/:id/contacts`, `/enrollments`, `/teachers` | A/D |
| **attendance-risk** (`/attendance-risk`) | `GET /sections/:id/attendance-risk[/summary]`, `POST /sections/:id/attendance-risk/notify` (**módulo NUEVO, antes en course-detail**) | D |
| **advising** (`/advising`) | Docente: `GET /me/sections`, `GET/POST /me/sessions`, `DELETE /me/sessions/:id`, `GET /me/sessions/:id/attendees`. Alumno: `GET /section/:id`, `POST/DELETE /:sessionId/rsvp` (**student-advising, antes en course-detail**) | D / A |
| **alerts** (`/alerts`) | `GET /me`, `PUT /me/:id/read` | A |
| **section-management** (`/section-management`) | `GET /representatives` (A); `GET/POST /sections/:id/announcements`, `PUT/DELETE /announcements/:id` (**Del**) | A/Del |
| **chat** (`/chat`) | `POST /token`, `DELETE /sections/:id/messages/:mid` (HU23, puente a Firebase) | Auth/D |
| **chatbot** (`/chatbot`) | `POST/GET /sessions`, `GET/DELETE /sessions/:id`, `POST /sessions/:id/ask` (IA Cohere + rate-limit 20/h) | A |

*(No existe módulo `networking` pese a estar documentado — ver §6.3.)*

---

## 3. Frontend — 16 features + servicios

**Features (`lib/pages/`):** login, malla, **calculadora** (notas), horario, **descripcion_cursos** (detalle sección alumno), alertas, chat, **chatbot**, perfil, **delegado**, setup_carrera, silabo, **mis_notas** (notas oficiales), **teacher** (home/secciones/**calificar**/asesorías/at-risk), password_reset, home (shell de tabs). Alumno: casi todo; Docente: `teacher/*` + tabs docentes del home.

**Servicios vivos** que cruzan bien con el backend: `auth`, `advising` (docente), `asesoria` (`/advising/section`), `attendance_risk` (`/attendance-risk/...`), `contacto`, `courses`, `evaluations` (`/grades/me/courses`), calculadora (`/grades/me/notes`+`/calculate`), `official_grades`, `alert`, `chatbot`, `section_statistics`, `delegate_announcement` (`/section-management/.../announcements` ✅ existe), `chat_repository`, `silabo`, `docente`.

**⚰️ Código muerto (0 llamadores — borrable):**
- `SimulatedGradesService` → llamaba `/simulated-grades/*` (reemplazado por la calculadora vía `/grades/me/notes`).
- `UserService` → llamaba `/academic-profile/users` (**ese endpoint no existe**, pero como nadie usa el servicio, no rompe nada).
- `NotasService` (`shared_preferences`) → la calculadora ya persiste en backend; revisar/borrar.
- ✅ `notas_calculo.dart` y `OfficialGradesService` **siguen vivos** (vista de notas oficiales / grilla docente).

---

## 4. Matriz de alineación front ↔ back

**✅ TODO lo vivo está alineado.** auth, academic-profile, curriculum, `grades/me/*`, official-grades, schedule (A+D), course-detail, attendance-risk (tras fix de hoy), advising (docente `/me/*` y alumno `/section`+`/rsvp`, tras fix de hoy), alerts, section-management (representatives + announcements), chat, chatbot.

**⚰️ Desalineados SOLO por código muerto** (no afectan al usuario): `SimulatedGradesService`→`/simulated-grades/*` (huérfano ambos lados) y `UserService`→`/academic-profile/users` (endpoint inexistente, servicio sin uso).

**🕘 Historial de drift (misma causa raíz, 3 veces esta semana — todas ya corregidas):**
| Endpoint | Se movió | Estado final |
|---|---|---|
| Asesorías del alumno | course-detail → `/advising/section` → course-detail → **`/advising/section`** | `/advising/section` |
| Attendance-risk | course-detail → **módulo propio `/attendance-risk`** | `/attendance-risk` |

---

## 5. Base de datos (34 tablas)

Modelo completo en `DATABASE.md`. Estado actual:
- **Chatbot ya está en `schema.ts`** (`chatbot_session`, `chatbot_message`) y en uso (13 sesiones, 78 mensajes). Discrepancia schema↔BD anterior **resuelta**. **Todas** las tablas que el código consulta existen en el schema (verificado 1:1).
- **`simulated_grades` la escriben DOS módulos**: `simulated-grades` (huérfano) y `grades` (`/grades/me/notes`, el vivo). La tabla NO está huérfana; el módulo sí → **redundancia a consolidar**.
- ⚠️ **Migraciones con numeración duplicada**: 7 archivos / 7 registradas, pero `0001`/`0002`/`0003` tienen **dos archivos cada uno** (míos: `flowery_jack_flag`, `slim_miracleman`, `groovy_kulan_gath`; de Ronald: `course_offering_total_hours`, `app_user_linkedin_link`, `spicy_ironclad`). Drizzle aplica por hash (funciona), pero el **próximo `db:generate` puede colisionar**. Regularizar.
- `package.json` **expone `db:push`** (prohibido por regla, sin guarda en código) — un `db:push` accidental destruiría tablas no reflejadas en snapshots. Cuidado.

---

## 6. Hallazgos y riesgos (priorizados)

### 6.1 🔴 Errores tragados en silencio (el problema de fondo) — ✅ ATACADO (2026-07-13)

**Estado original:**
- **Backend: 89 `console.error`** con patrón "atrapo el error de BD y devuelvo fallback silencioso" (200 con `[]`/`null`/datos falsos). El peor: **`academic-profile.repository.ts` devolvía un perfil FICTICIO** (`fullName:"Usuario"`, `code:"00000000"`, career `"--"`) con status 200 ante error de BD, en vez de propagar. Mismo anti-patrón en `course-detail.routes.ts` (4 catches), `schedule.repository.ts` (16), `curriculum`, `grades`, `attendance-risk`, etc.
- **Frontend: `try/catch` que devuelven `[]`** (p.ej. `asesoria_service.fetchAsesorias`) → una falla real se veía como "no hay datos".
- **Efecto combinado:** cuando algo se rompía, la app no mostraba error: mostraba vacío o datos inventados.

**Corregido (2026-07-13):**
- **Backend:** se quitó el swallow de los 9 archivos afectados (academic-profile, schedule, curriculum, grades repo+controller, course-detail repo+rutas, attendance-risk, advising/student). Ahora un fallo de BD **propaga al `errorHandler` global** (500 real con `{error:{code,message}}`). El `null` legítimo (fila no existe) lo distingue el service (→404). Se dejaron intactos los módulos que ya propagaban correctamente (`auth.service`, `section-management.service`, `teacher.service` vía `wrap()→HttpError`, `firebase` re-lanza) y los que degradan a propósito (`resend` anti-enumeración HU20, chatbot/IA, chat-search). Build limpio + 145 tests verdes. **Efecto colateral bueno:** el swallow del repo hacía código muerto el manejo `409` de `academic-profile.service` y podía reportar **éxito falso** al guardar especialidades — ahora funciona.
- **Frontend:** componente reutilizable `lib/components/error_retry.dart` (icono + mensaje + "Reintentar"). Los services del camino de detalle/calculadora/alertas/at-risk dejan de tragar (propagan `ApiException`), y las pantallas muestran **error+reintentar** distinguiendo "falló la carga" de "sin datos": detalle de curso (por-pestaña), alertas (ya no el engañoso "¡Todo al día!"), calculadora, at-risk docente (HU22, ya no el falso "No se encontraron alumnos"). `analyze` limpio + 176 tests verdes. Revisado adversarialmente por workflow (0 HUs rotas, crash-safe).

**Pendiente (fuera del alcance de esta pasada — requiere correr la app para verificar delegado/docente):**
- **Datos falsos en delegado** (`delegate_service` inventa cursos mock en 404; `delegate_announcement_service` corre sobre un mock en memoria y **finge éxito** al publicar/editar/borrar ante red caída o drift de endpoint; `section_statistics_service` devuelve estadísticas HARDCODEADAS — este último es placeholder de **HU11 pendiente**, no un swallow real). Propagar y mostrar estado de error, cuidando los `onInit` fire-and-forget.
- **Código muerto borrable** (0 callers): `enrollment_service`, `section_representative_service`, `docente_service`, `notas_service` (+ `UserService`, `SimulatedGradesService` ya listados en §6.2).
- **`evaluations_service.loadEvaluationData`** traga a `null` (sílabos de calculadora/malla); es best-effort pero conviene propagar con estado de error.

### 6.2 🟠 Drift de endpoints + código muerto
- El backend movió `advising` (→ módulo student) y `attendance-risk` (→ módulo propio) sin actualizar el front → 3 bugs esta semana (ya corregidos). **Falta un contrato/aviso al mover rutas.**
- Muerto/redundante a limpiar: módulo backend `simulated-grades`; servicios frontend `SimulatedGradesService`, `UserService`, probablemente `NotasService`; observers stub (`src/events/observers/*` — 3 archivos que nadie registra, EventBus inerte).

### 6.3 🟠 Documentación desincronizada
- **`networking` (HU25)**: documentado en `api-contracts.md` + spec `networking.spec.md` + tablas (`user_social_link`, `app_user.networking_opt_in`), **pero NO hay módulo `src/modules/networking/` ni el front lo llama** → endpoints fantasma. Definir si va o se retira.
- **Implementado pero NO documentado** en `api-contracts.md`: todo `attendance-risk` y toda la vista docente de `schedule` (`/schedule/teacher/*`).
- **`feature-index.md` dice que el chatbot está "pendiente de implementar"** — pero está vivo (Cohere, en uso). Doc STALE.
- `GET /` lista solo 9 de 14 módulos.

### 6.4 🟡 Fragilidad de frontend
- **`Future.wait` sin tolerancia a fallos** en `horario.dart` (fue el bug de hoy), `horario_controller.dart`, `descripcion_cursos_controller.dart`, `delegado_anuncios_controller.dart`, `malla_list_controller.dart` — una llamada caída tumba toda la pantalla.
- **`Get.put`/`lazyPut` en `build()`** en `calculadora_page`, `chatbot_page`, `home_page`, `at_risk_students_page`, `setup_carrera_page` — el repo lo prohíbe (crash de controller / "tipeo fantasma").

### 6.5 🟡 Otros
- **Login Google sin verificar `audience`** — acepta cualquier ID token válido para un correo `@ulima` (endurecer con `GOOGLE_CLIENT_ID`; no urgente).
- **Deploy sin espejo** (retirado): si alguien sube `firebase-admin ^14` (+ `jose@6` en `bun.lock`), prod se cae y **queda caído**. Mantener `firebase-admin` en `12.1.0` exacto.
- **SQL crudo en rutas** (deuda reconocida) en `course-detail.routes.ts`; `GET /course-detail/sections/:id` hace una **sub-petición HTTP interna** en vez de ir a la BD (frágil). Faltan tests para `academic-profile`, `curriculum`, `schedule`, `course-detail`, `section-management`, `attendance-risk`, `chatbot`.

---

## 7. Recomendaciones (priorizadas)

**Corto plazo (mata la clase de bug de la semana):**
1. ✅ **HECHO (2026-07-13) — Dejar de tragar errores.** Backend: propaga 500 reales (adiós perfil ficticio/listas falsas). Frontend: los `catch` del camino alumno + at-risk docente ya no se disfrazan de "sin datos" (componente `ErrorRetry`). Ver §6.1. **Falta:** los datos falsos del flujo delegado (mock de anuncios/cursos, stats hardcodeadas) — requiere correr la app.
2. **Blindar los `Future.wait`** para que cada llamada falle por separado y la pantalla cargue lo que pueda.
3. **Borrar código muerto**: módulo `simulated-grades`, `SimulatedGradesService`, `UserService`, `NotasService`, observers stub.

**Proceso (raíz):**
4. **Contrato como fuente de verdad**: al mover/renombrar un endpoint, actualizar `api-contracts.md` + avisar al front en el PR. Idealmente un check automático de rutas front vs back.
5. **Consolidar las notas de la calculadora** en un solo módulo (`grades` vs `simulated-grades`).
6. **Regularizar numeración de migraciones** antes del próximo `db:generate`; quitar `db:push` del `package.json` o guardarlo.
7. **Sincronizar docs**: marcar chatbot como implementado; decidir networking; documentar attendance-risk y schedule/teacher.
8. **Regla firebase-admin = 12.1.0** en `package.json`/CONTRIBUTING para que nadie lo suba.

**Endurecimiento (opcional):** `audience` en login Google; sacar `Get.put` de los `build()`.
