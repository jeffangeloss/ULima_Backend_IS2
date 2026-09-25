# Chatbot: delegados por curso, bloques propios e historial por ciclo — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que el chatbot responda con la base como única fuente de verdad: delegados etiquetados por curso y sección, bloques propios del alumno con sugerencias de tiempo, sin nombres de otros compañeros, con el historial como conversación y con retención por ciclo.

**Arquitectura:** el pipeline de `src/modules/chatbot` (clasificación → recolección → contexto → Cohere → guardado) se corrige por partes: clasificación solo por palabras clave; dos fuentes nuevas (delegados y bloques propios, esta última por una función acotada que exporta `time-blocks`); el bloque plano de compañeros sale; el historial viaja una vez como turnos; el guardado es atómico; una purga perezosa borra las sesiones de ciclos anteriores.

**Stack:** Bun + TypeScript + Hono + Drizzle + PostgreSQL; Cohere (`command-a-03-2025`, solo `/v2/chat`).

**Spec:** `specs/features/chatbot/chatbot.spec.md` (BR-CB-02 a BR-CB-24 y BR-CB-22b, aprobada el 2026-09-25) y RS-BE-35 de `specs/features/time-blocks/time-blocks.spec.md`. **La spec fija los valores exactos** (palabras clave, formato del contexto, texto del prompt, SQL de delegados y de la purga, límites); este plan fija el orden, los archivos y las pruebas. Si difieren, manda la spec.

## Restricciones globales

- Español en comentarios, pruebas y commits. Commits con `git add` explícito, SIN trailer Co-Authored-By ni atribución. Nada de push.
- Pruebas SIEMPRE con `DATABASE_URL=postgres://user:pass@localhost:5432/test "$BUN" test <ruta>`; las pruebas `*.postgres.test.ts` solo corren con `TEST_DATABASE_URL` hacia un Postgres local desechable (como `test/HU35_jeff/time-blocks.postgres.test.ts`) y se saltan sin él. Build: `"$BUN" run build`.
- Nada contra la base de producción: ni `db:apply`, ni borrados, ni psql de escritura. La migración `0013` se escribe y se prueba estáticamente; la aplica el dueño (o el controlador con su aprobación) al desplegar, con el borrado único de BR-CB-22b.
- Nunca interpolar arreglos JS ni objetos `Date` en la plantilla `sql` (errores 42809 y de postgres.js); fechas como texto con `::date` o `::timestamptz`.
- El récord académico sigue aislado (RS-BE-28, `test/HU34_jeff/chatbot-isolation.test.ts` no cambia). El chatbot solo puede leer bloques propios por `readOwnTimeBlocksForAssistant` (RS-BE-35 nueva).
- Ningún nombre de compañero salvo delegado y subdelegado con su cargo, curso y sección llega a Cohere (BR-CB-17).
- Repo público: nada real (alumno 20230001, nombres inventados); ninguna ruta de esta máquina en archivos commiteados.
- `BUN` es el ejecutable de bun que indica el despacho (no está en PATH).

## Tareas (en orden, rama `fix/chatbot-delegados-bloques`)

### Tarea 1: Clasificación sin /v1/classify

**Requisitos:** BR-CB-04 (palabras clave normalizadas con NFD y sin diacríticos; dominios grades, schedule, curriculum, alerts, announcements, delegates, own_blocks —que arrastra schedule— y chat; la tabla de ejemplos) y la parte de enrutamiento de BR-CB-05 que depende de los dominios.
**Archivos:** `src/modules/chatbot/intent-classifier.ts`, `chatbot.types.ts`, `chatbot.service.ts` (quitar la carrera contra Cohere classify y su timeout), `src/services/cohere.client.ts` (quitar `classify` si queda sin uso); prueba `test/HU28_ronald/chatbot.intent-classifier.test.ts` con la tabla de ejemplos de la spec, preguntas con y sin tildes y en mayúsculas.
- [ ] Prueba que falla → rojo → implementar → verde → suite completa y build → commit `fix(chatbot): clasificación por palabras clave sin tildes y sin /v1/classify, con delegados y bloques propios (BR-CB-04)`.

### Tarea 2: Delegados por curso, sin compañeros, chat acotado

**Requisitos:** BR-CB-16 (delegado y subdelegado por sección activa desde `section_representative` y, si falta, `section_representative_claim`; «sin delegado/subdelegado registrado»; `isSelf`; sin LIMIT), BR-CB-17 (sale `getClassmates`, `ClassmateData` y «DATOS DE COMPANEROS»), BR-CB-06 y BR-CB-23 (el chat solo con chat o announcements, sin `senderName`, fecha en hora de Lima), y su bloque en el formato de BR-CB-24.
**Archivos:** `chatbot.repository.ts`, `chatbot.types.ts`, `chat-search.ts`, `context-builder.ts`, `chatbot.service.ts`; pruebas `test/HU28_ronald/chatbot.delegates.postgres.test.ts` (opt-in con `TEST_DATABASE_URL`), `chatbot.no-classmates.test.ts`, `chatbot.chat-search.test.ts` y el caso del bug en `chatbot.service.test.ts`: un alumno en dos secciones con delegados distintos y una sección sin representante activo pero con claim → cada curso con los suyos.
- [ ] Prueba que falla (incluido el bug reportado) → rojo → implementar → verde → suite → commit `fix(chatbot): delegados por curso y sección desde la base, sin la lista plana de compañeros (BR-CB-16, BR-CB-17, BR-CB-23)`.

### Tarea 3: Bloques propios y gestión del tiempo

**Requisitos:** RS-BE-35 nueva (función acotada `readOwnTimeBlocksForAssistant(studentId, today)` y `OwnTimeBlocksSummary` exportadas por `src/modules/time-blocks/index.ts`, solo lectura, sin id ni color), BR-CB-18 (ventana de 14 días, resumen de días, horas, frecuencia, vigencia, cambios y horas de esta semana y la siguiente con `expandOccurrences` y `weeklyHours`) y BR-CB-19 (qué puede y qué no puede sugerir el modelo; horas de clase por semana calculadas en el backend).
**Archivos:** `src/modules/time-blocks/` (la función y su resumen), `chatbot.service.ts`, `context-builder.ts`, el registro del módulo para inyectarla por constructor; pruebas `test/HU35_jeff/time-blocks-assistant-summary.test.ts`, `test/HU28_ronald/chatbot.own-blocks-context.test.ts`, `chatbot.time-management.test.ts`; ajustar `test/HU35_jeff/chatbot-isolation-blocks.test.ts` a la regla nueva (un único origen permitido, sigue prohibido tocar tablas y enum).
- [ ] Prueba que falla → rojo → implementar → verde → suite → commit `feat(chatbot): el chatbot conoce los bloques propios del alumno y sugiere cómo organizar su tiempo (BR-CB-18, BR-CB-19, RS-BE-35)`.

### Tarea 4: Historial, guardado atómico y retención

**Requisitos:** BR-CB-20 (historial leído antes de guardar con `getRecentMessages(sessionId, 10)`, una sola vez como turnos; índice `idx_chatbot_message_session_created` en la migración `drizzle/0013_chatbot_message_history.sql`, solo `CREATE INDEX IF NOT EXISTS`), BR-CB-21 (`saveExchange` en transacción; si Cohere falla no se escribe nada), BR-CB-22 (purga perezosa por ciclo al inicio de listSessions, getSession, createSession y ask, con la SQL y la zona horaria de la spec, y que un fallo de la purga no corta la petición), BR-CB-02 y BR-CB-03 ajustadas, y el texto de BR-CB-22b como paso de despliegue (no se ejecuta aquí).
**Archivos:** `chatbot.repository.ts`, `chatbot.service.ts`, `src/db/schema/schema.ts` (índice), `drizzle/0013_chatbot_message_history.sql`; pruebas `test/HU28_ronald/chatbot.history-turns.test.ts`, `chatbot.atomic-save.test.ts`, `chatbot.retention.postgres.test.ts` (opt-in), `migration-0013.test.ts` (estática).
- [ ] Prueba que falla → rojo → implementar → verde → suite → commit `fix(chatbot): historial como turnos una sola vez, guardado atómico y retención por ciclo (BR-CB-20 a BR-CB-22)`.

### Tarea 5: Prompt, formato del contexto y cierre

**Requisitos:** BR-CB-09 (prompt nuevo completo), BR-CB-24 (formato DATOS DEL ALUMNO … FIN DE LOS DATOS con el orden de los 11 bloques y el ejemplo de la spec), BR-CB-12 (errores: 503 sin escrituras, 500 si falla la transacción, purga o lectura de bloques fallida no cortan).
**Archivos:** `context-builder.ts`, `chatbot.service.ts`, `chatbot.controller.ts` si cambia un error; pruebas `test/HU28_ronald/chatbot.system-prompt.test.ts`, `chatbot.context-format.test.ts` (el ejemplo inventado de la spec, byte a byte donde la spec lo fija) y los casos de error en `chatbot.service.test.ts`.
**Cierre:** en la spec, cada `[@test]` apunta a un archivo que existe y el estado suma «e implementada»; `docs/specs/feature-index.md` y `README.md` al día con lo que cambió (sin reescribir cifras globales ajenas); `MIGRATIONS.md` recibe la entrada de la `0013` como pendiente de aplicar; suite completa, build y una revisión de que no hay nombres, códigos ni rutas reales.
- [ ] Prueba que falla → rojo → implementar → verde → suite y build → commits `feat(chatbot): prompt y formato del contexto con la base como única fuente (BR-CB-09, BR-CB-24, BR-CB-12)` y `docs(chatbot): cerrar la spec y la documentación del ajuste del 2026-09-25`.

## Antes del merge y del despliegue

Desde `509d20f` (Tarea 4), la primera petición a `listSessions`, `getSession`, `createSession` o `ask` corre la purga global de BR-CB-22, así que desplegar la rama borra datos vivos de producción. Lo mismo pasa con cualquier ejecución de la rama con el `DATABASE_URL` de producción, sea un despliegue de vista previa o un `bun run dev` local, y el paso 1 de «Primera purga en producción» (BR-CB-22) la descarta hasta la aprobación del dueño. Por eso la rama no se mergea ni se despliega hasta cumplir las cinco condiciones de abajo, que salen de la spec y del protocolo manual de `MIGRATIONS.md`.

1. La Tarea 5 está cerrada. Hasta entonces el historial ya viaja como turnos, pero la regla 1 del prompt todavía no dice que los turnos previos no son fuente (BR-CB-09).
2. El dueño corre en solo lectura la consulta de conteo de «Primera purga en producción» (BR-CB-22), toma el respaldo con `pg_dump` de `chatbot_session` y `chatbot_message`, fuera de git, y aprueba de forma explícita el conteo y el respaldo. Si el `start_date` del período activo no coincide con el calendario publicado del ciclo, la rama espera la decisión del dueño.
3. El dueño aplica `drizzle/0013_chatbot_message_history.sql` con `bun run db:apply`, con respaldo previo, y verifica el índice antes del merge del código que lo usa.
4. El borrado único de BR-CB-22b corre en una transacción, con su conteo en solo lectura y su respaldo, en la misma ventana del merge. La spec lo fija «al desplegar», y un borrado corrido días antes dejaría vivas las sesiones que el código de `main` guarda mientras tanto, cuyas respuestas pueden traer nombres de compañeros de antes de BR-CB-17.
5. `MIGRATIONS.md` registra la `0013` con su fecha, su respaldo y su verificación, junto con el conteo y el respaldo de la primera purga y el borrado de BR-CB-22b, sin copiar contenido. La Tarea 5 deja la entrada como pendiente de aplicar, el dueño la completa al aplicar la `0013` y la fecha del despliegue entra al desplegar.
