# Backend Knowledge

## Producto

ULima++ es una app académica móvil para estudiantes de la Universidad de Lima. El backend expone una API REST consumida por Flutter.

## Alcance Actual

- App centrada en estudiantes; desde HU18 hay además un rol docente acotado (profesor/JP) que solo gestiona asesorías extra de sus secciones (módulo `advising`).
- No hay pantallas admin.
- Login docente (HU18): un `app_user` vinculado a `teacher.user_id` inicia sesión con código+contraseña o Google SSO `@ulima.edu.pe` y rol técnico `teacher`. El SSO no autoaprovisiona docentes/JP; la cuenta y su vínculo deben existir previamente.
- PostgreSQL es la única fuente de verdad.
- Los JSON del frontend son descartables y no se migran.
- La base ya está creada; el backend no debe crear ni poblar tablas salvo cambios aprobados por spec (HU18 agrega columnas/tabla aditivas y un seed de docentes).

## Stack

- Bun
- TypeScript
- Hono
- Drizzle ORM
- PostgreSQL
- Zod
- JWT
- bcryptjs

## Esquema Definitivo

Tablas principales:

- Identidad: `app_user`, `student`, `teacher`
- Estructura académica: `career`, `specialty`, `student_specialty`, `curriculum`
- Malla: `course`, `curriculum_course`, `curriculum_course_specialty`, `course_prerequisite`
- Progreso: `student_course_progress`, `student_curriculum_simulation`
- Ciclo y matrícula: `academic_period`, `course_offering`, `section`, `enrollment`
- Horario: `academic_week`, `schedule_session`
- Asesorías: `course_advising_session`
- Evaluaciones: `syllabus`, `assessment_type`, `assessment`, `student_score`, `student_portal_score`
- Comunicación: `section_representative`, `announcement`, `alert`

Tablas que no pertenecen al esquema definitivo:

- `study_plan`
- `attendance`
- `class_session`
- `assessment_event`
- cualquier tabla de admin o teacher login

## Reglas De Dominio

- `app_user` almacena cuentas que inician sesión.
- `teacher` es dato referencial de secciones/asesorías y, desde HU18, puede opcionalmente vincularse a una cuenta (`teacher.user_id`) para login docente. La etiqueta Profesor/JP no es un atributo de la persona: se deriva de si su `teacher.id` es el `section.teacher_id` (Profesor) o el `section.jp_id` (JP). Un JP pertenece a una sola sección (índice único parcial) y no puede ser el profesor de esa misma sección (CHECK) ni profesor de ninguna sección del período activo (regla de ciclo validada en servicio/seed).
- `enrollment.status = 'active'` alimenta cursos actuales, horario, calculadora, asesorías y alertas.
- `enrollment.status = 'completed'` no equivale a curso aprobado.
- La aprobación real viene de `student_course_progress.status = 'approved'`.
- `student_score` contiene las notas oficiales que el profesor o JP carga por evaluación (módulo `official-grades`).
- Las notas que el alumno registra en la calculadora son personales y no oficiales (`simulated_grades`). La calculadora muestra además, fijas y con la marca “ULima”, las notas parciales que publica la ULima, que guarda la tabla `student_portal_score`, escribe solo `POST /portal-sync/refresh` y lee `GET /grades/me/ulima`.
- Las notas personales no se usan para promedios oficiales de sección salvo que una spec defina una métrica agregada explícita.
- Riesgo académico: avance evaluado > 55% y promedio personal < 10.5.
- Alta carga: 3 o más evaluaciones en la misma semana académica.
- La simulación de malla es visual y nunca modifica matrícula, notas ni progreso real.

## Roles

- `student`
- `delegate`
- `subdelegate`
- `teacher` (HU18 — desde `app_user.user_id` vinculado a `teacher.user_id`)

`delegate` y `subdelegate` se derivan desde filas activas de `section_representative`. Si un estudiante califica para ambos, `delegate` tiene precedencia.

## Features

| Feature | Historias |
| --- | --- |
| Auth | US01, US02 |
| Academic profile | US05 |
| Curriculum | US03, US04 |
| Grades | US06, US07 |
| Schedule | US09 |
| Course detail | US13, US14, US17 |
| Alerts | US15 |
| Section management | US16, US18 |

## Historias Reales

| ID | Historia |
| --- | --- |
| US01 | Iniciar sesión con código y contraseña. |
| US02 | Cerrar sesión. |
| US03 | Visualizar malla curricular interactiva. |
| US04 | Actualizar/simular estados visuales de cursos. |
| US05 | Seleccionar especialidad. |
| US06 | Registrar notas personales por evaluación. |
| US07 | Visualizar promedio personal por curso. |
| US09 | Visualizar horario y evaluaciones del ciclo. |
| US13 | Visualizar horario de asesoría. |
| US14 | Visualizar contactos de sección. |
| US15 | Recibir alertas de riesgo académico y alta carga. |
| US16 | Registrar anuncios como delegado/subdelegado. |
| US17 | Visualizar anuncios de sección. |
| US18 | Visualizar métricas agregadas de sección sin notas individuales. |

## Arquitectura

Módulos en `src/modules/<feature>`:

- `routes`: endpoints Hono.
- `controller`: HTTP, validación y respuesta.
- `service`: reglas de negocio.
- `repository`: acceso a PostgreSQL.
- `schemas`: Zod.
- `types`: DTOs y tipos.
- `index`: composición del módulo.

Shared:

- `src/shared`: errores, middleware, tipos compartidos.
- `src/events`: EventBus base. Observers reales se agregan solo con spec aprobada.
- `src/db`: schema definitivo y cliente Drizzle.

## Prioridad Recomendada De Specs (histórica — todas implementadas)

1. Auth.
2. Academic profile.
3. Curriculum.
4. Grades.
5. Schedule.
6. Course detail.
7. Alerts.
8. Section management.
9. Advising (HU18).

## Decisiones No Negociables

- No mocks JSON como fallback.
- No seeds.
- No migraciones sin aprobación.
- No lógica fuera de spec.
- No endpoints fuera de `docs/specs/api-contracts.md`.
- No modificar `src/db` salvo cambio de BD aprobado.

## Troubleshooting

### Vercel `FUNCTION_INVOCATION_FAILED` (ERR_REQUIRE_ESM with jose/jwks-rsa)
**Síntoma**: Al desplegar en Vercel, el backend crashea inmediatamente con `Error [ERR_REQUIRE_ESM]: require() of ES Module /var/task/node_modules/jose/dist/webapi/index.js from /var/task/node_modules/jwks-rsa/src/utils.js not supported.`
**Causa**: Las versiones muy recientes de `firebase-admin` (v13, v14) usan dependencias internas (`jwks-rsa` > `jose`) que entran en conflicto con la forma en que Vercel empaqueta módulos ESM (`type: "module"` en `package.json`).
**Solución**: Se debe hacer un downgrade de `firebase-admin` a la versión `12.1.0` (o `12.x`), la cual utiliza una versión de `jose` compatible con CommonJS/ESM mixto en entornos Serverless de Vercel.
