---
name: Chatbot Asistente Academico
description: Chatbot conversacional con IA (Cohere) que responde preguntas en lenguaje natural sobre la informacion academica del alumno autenticado.
targets:
  - ../../../src/modules/chatbot/**
  - ../../../src/services/cohere.client.ts
  - ../../../src/services/firebase.service.ts
  - ../../../src/db/schema/schema.ts
  - ../../../src/shared/middleware/rate-limit.ts
  - ../../../src/config/env.ts
  - ../../../drizzle/0013_chatbot_message_history.sql
---

# Chatbot Asistente Academico

Chatbot con IA (Cohere) embebido en la app. El alumno hace preguntas en lenguaje natural sobre su informacion academica y recibe respuestas directas basadas exclusivamente en sus datos reales. El backend actua como proxy seguro entre el frontend y Cohere, orquestando la recoleccion de datos, la clasificacion de intencion, ~~la busqueda semantica en chat~~ la lectura del chat de seccion *(sin Rerank ni remitentes desde el ajuste del 2026-09-25, BR-CB-06 y BR-CB-23)* y la generacion de respuestas.

> Estado: **ajustada el 2026-09-25** con las decisiones del dueño de ese día sobre delegados,
> bloques propios e historial, **aprobada por el dueño el 2026-09-25**. Cambian BR-CB-02,
> BR-CB-03, BR-CB-04, BR-CB-05, BR-CB-06, BR-CB-07, BR-CB-09 y BR-CB-12, y se agregan BR-CB-16
> a BR-CB-24. Tres puntos son propuestas derivadas que el dueño confirma al aprobar, BR-CB-23
> (de la decisión 1), el total de horas de clase de BR-CB-19 (de la decisión 2) y la condición
> de BR-CB-22 que espera el `start_date` del período activo para purgar (de la decisión 3). El
> índice de BR-CB-20 es un cambio de base de datos y exige además la aprobación de BD de
> `AGENTS.md`. La retención de BR-CB-22 no cambia el esquema ni la configuración del despliegue,
> pero **el primer uso del chatbot después del despliegue borra de una vez todas las sesiones de
> producción cuya última actividad es anterior al inicio del período activo** (las 00:00 de Lima
> del 2026-08-24, si la base guarda el calendario publicado de 2026-2). Ese borrado masivo de
> datos vivos exige la aprobación explícita del dueño, con un conteo en solo lectura y un respaldo
> antes del merge, como la migración 0013 (BR-CB-22, «Primera purga en producción»). BR-CB-17
> deja además dos residuos de texto libre para que el dueño los acepte o decida otra salida. Los
> ejemplos usan datos inventados.
> La revisión de la Tarea 2 del mismo día agrega a BR-CB-23 la omisión de los mensajes borrados,
> pendiente de confirmación del dueño, y aclara la lista de artículos y preposiciones de BR-CB-06.
> La revisión de la Tarea 3 aclara, para que el dueño lo confirme, contra qué fecha se mide la
> vigencia de BR-CB-18, qué pasa con la línea de horas de clase si el horario no se cargó
> (BR-CB-19 y BR-CB-24) y qué claves lee la suma de BR-CB-19. Deja además abierta para el dueño
> la limpieza de los caracteres de control en el título de BR-CB-18.
> La revisión de la Tarea 4 enlaza con `[@test]` las pruebas ya escritas de BR-CB-02, BR-CB-03,
> BR-CB-12 y BR-CB-20 a BR-CB-22. Alinea además con la aprobación del dueño las etiquetas de estado
> que seguían diciendo «pendiente de aprobación», aquí y en RS-BE-35 de `time-blocks`, sin cambiar
> ningún requisito.
> Contraparte en `specs/features/time-blocks/time-blocks.spec.md` (RS-BE-35, ajustada el mismo
> día). El récord académico sigue fuera del chatbot (RS-BE-28 de `academic-record`, sin cambios).

## Ajuste del 2026-09-25

### Qué falla hoy (código de `main` 38024d4)

- Ante «¿quienes son los delegados de Seguridad de Sistemas?», escrita sin tilde para que el
  respaldo por palabras clave active `classmates` (ver el cuarto punto), el bot nombra al
  delegado y al subdelegado de otro curso del mismo alumno. `getClassmates` (`chatbot.repository.ts:282-320`)
  calcula bien el cargo de cada matrícula dentro de su sección (el `LATERAL` de las líneas
  293-305), pero proyecta solo `SELECT DISTINCT au.full_name, role` (284-286), sin curso ni
  sección, sobre todas las secciones activas del alumno. `buildContext` pega esa lista como JSON
  plano bajo `DATOS DE COMPANEROS` (`context-builder.ts:121-124`), así que el modelo recibe filas
  «Delegado» que no dicen de qué curso son y las atribuye al curso por el que se le pregunta.
- El chatbot nunca lee `section_representative_claim` (`schema.ts:432-451`), la tabla donde queda
  el delegado que publica el portal cuando todavía no se le pudo promover. La pantalla del curso
  sí la lee (`course-detail.routes.ts:251-277`). Una sección con delegados solo en el portal llega
  al modelo sin ningún cargo, y los únicos «Delegado» visibles son los de otra sección.
- El `ORDER BY au.full_name LIMIT 50` sobre la lista unida (`chatbot.repository.ts:316-317`) puede
  dejar fuera al delegado del curso preguntado, y la línea 315 excluye al propio alumno, que nunca
  se entera de que el delegado es él.
- Cuatro agravantes completan el cuadro. El respaldo por palabras clave no quita tildes ni conoce
  «delegado» (`intent-classifier.ts:9` y `:22`), y como `/v1/classify` está retirado
  (`cohere.client.ts:134`), «¿Quiénes son…?» con tilde no carga ningún dato de compañeros. La
  regla 4 del prompt prohíbe hablar de otros alumnos mientras el mismo mensaje trae sus nombres
  (`context-builder.ts:19-21`). El historial se relee después de guardar la pregunta
  (`chatbot.service.ts:49-53`) y viaja dos veces, como turnos (`chatbot.service.ts:102-108`) y
  dentro del mensaje de datos (`context-builder.ts:92-99`), de modo que una respuesta equivocada
  anterior vuelve con la autoridad de un dato. `getChatResults` corre en toda pregunta
  (`chatbot.service.ts:72`) y manda mensajes de terceros con su nombre.
- El historial no tiene retención, porque el único borrado es el que hace el propio alumno, y la
  pregunta se guarda antes de llamar a Cohere (`chatbot.service.ts:49`), así que un fallo de
  Cohere deja preguntas sin respuesta.
- Los datos de la base no cruzan secciones. Una consulta de solo lectura del 2026-09-25 no
  encuentra ningún `section_representative` que apunte a una sección distinta de la de su
  matrícula, y la importación del portal empareja por curso y sección. El error está en cómo el
  chatbot arma su contexto.

### Decisiones del dueño (2026-09-25, vinculantes)

| # | Decisión | Requisitos |
| --- | --- | --- |
| 1 | De otras personas, el chatbot solo usa delegados y subdelegados, siempre etiquetados por curso y sección. Deja de mandar a Cohere los nombres del resto de compañeros. La fuente de verdad es la base, con `section_representative` activo primero y `section_representative_claim` después, como la pantalla del curso, y «sin delegado registrado» cuando no hay ninguno. | BR-CB-16, BR-CB-17 |
| 2 | El chatbot lee los bloques de horario propios del alumno que pregunta (título, días, horas, fechas, excepciones relevantes y horas de la semana) para responder cuándo los tiene y para sugerir cómo organizar el tiempo junto con su horario de clases. Revierte RS-BE-35 de `time-blocks` para los bloques. El récord sigue aislado. | BR-CB-18, BR-CB-19 |
| 3 | El historial sigue en PostgreSQL y se borra al cerrar cada ciclo. Las conversaciones cuya última actividad es anterior al inicio del período activo se eliminan cuando cambia ese período, sin tocar datos a mano. | BR-CB-22 |

### Correcciones que acompañan (propuestas dentro de «la fuente de verdad es la base»)

| # | Corrección | Requisitos |
| --- | --- | --- |
| 4 | Clasificación sin `/v1/classify`, con palabras clave normalizadas sin tildes y los dominios nuevos de delegados y bloques propios, sin romper los demás. | BR-CB-04 |
| 5 | Historial como conversación y no como fuente. Viaja una sola vez como turnos, con límite e índice por `(session_id, created_at)`, y la pregunta y la respuesta se guardan de forma atómica. | BR-CB-07, BR-CB-20, BR-CB-21 |
| 6 | La regla del prompt sobre otros alumnos se reconcilia con la decisión 1. | BR-CB-09 |
| 7 | La búsqueda en el chat de sección corre solo con preguntas sobre el chat o los avisos y no manda nombres de remitentes. **Derivada de la decisión 1, para que el dueño la confirme al aprobar.** | BR-CB-23 |

## User Stories

| ID | Description |
| --- | --- |
| HU-CHATBOT-01 | Como alumno quiero hacer preguntas sobre mis notas, horario, examenes, malla, anuncios, delegados de mis secciones, alertas y conversaciones del chat de mi seccion, y recibir respuestas precisas basadas en mis datos reales. *(Ajustada el 2026-09-25: «companeros» pasa a «delegados de mis secciones», decisión 1.)* |
| HU-CHATBOT-02 | Como alumno quiero mantener multiples sesiones de conversacion con el chatbot, poder volver a ellas, y crear nuevas cuando lo necesite. *(Ajustada el 2026-09-25: las sesiones duran lo que dura el ciclo, decisión 3.)* |
| HU-CHATBOT-03 | Como alumno quiero preguntarle al chatbot cuándo tengo mis bloques propios (prácticas, trabajo) y pedirle ideas para organizar mi semana con mis clases, sin que invente datos. *(Nueva el 2026-09-25, decisión 2, aprobada por el dueño el 2026-09-25.)* |

## Business Rules

### BR-CB-01: Autorizacion

- Todo el modulo requiere `Authorization: Bearer <JWT>` (`authMiddleware`) y rol de alumno (`requireRole('student','delegate','subdelegate')`); un token docente recibe `403 FORBIDDEN`.
- El `studentId` sale del contexto del JWT; si falta -> `401 STUDENT_NOT_FOUND`.

### BR-CB-02: Sesiones

- Cada alumno puede crear multiples sesiones de chatbot (`chatbot_session`).
- Una sesion contiene mensajes (`chatbot_message`) con `role = 'user' | 'assistant'`.
- El alumno solo puede ver, crear y eliminar sus propias sesiones.
- Al eliminar una sesion se eliminan en cascada sus mensajes.
- El endpoint `POST /chatbot/sessions/:id/ask` solo acepta preguntas en sesiones que pertenezcan al alumno autenticado; si no -> `404 SESSION_NOT_FOUND`.
- *Ajustada el 2026-09-25, aprobada por el dueño el 2026-09-25.* Las sesiones del ciclo anterior
  se borran solas cuando empieza el período activo (BR-CB-22). Una sesión borrada así responde
  `404 SESSION_NOT_FOUND` en `GET /chatbot/sessions/:id` y en `POST /chatbot/sessions/:id/ask`,
  igual que una que no existe, y deja de salir en `GET /chatbot/sessions`.
- *Ajustada el 2026-09-25, aprobada por el dueño el 2026-09-25.* Una pregunta cuya respuesta falla
  no queda guardada (BR-CB-21), así que desde el ajuste la sesión no acumula preguntas sin
  respuesta.

`[@test] ../../../test/HU28_ronald/chatbot.retention.postgres.test.ts` *(existe; primer punto del
ajuste contra un PostgreSQL local y solo con `TEST_DATABASE_URL`, con `ask` en 404, `getSession`
en `null`, que la ruta responde con 404, y `listSessions` sin la sesión vencida)*
`[@test] ../../../test/HU28_ronald/chatbot.retention.test.ts` *(existe; el mismo primer punto sin
base, con un repositorio falso, y corre siempre)*
`[@test] ../../../test/HU28_ronald/chatbot.atomic-save.test.ts` *(existe; segundo punto del
ajuste)*

### BR-CB-03: Titulo automatico de sesion

- Al crear una sesion via `POST /chatbot/sessions`, el titulo inicial es `"Nueva conversacion"`.
- Al responder la primera pregunta de una sesion, el backend genera un titulo descriptivo (max 100 caracteres) usando Cohere Chat (llamada ligera, sin contexto grande) basado en la pregunta del alumno y actualiza el campo `title`.
- Si falla la generacion del titulo, se mantiene `"Nueva conversacion"` (no bloquea la respuesta).
- *Ajustada el 2026-09-25, aprobada por el dueño el 2026-09-25.* «Primera pregunta» significa que
  la sesión no tenía ningún mensaje antes de esta pregunta. Como el historial se lee antes de
  guardar nada (BR-CB-20), la condición es «historial vacío», y deja de ser «un solo mensaje
  `user` en el historial» (`chatbot.service.ts:127`). El título se genera después de guardar el
  par pregunta y respuesta (BR-CB-21), y su fallo no deshace ese par.

`[@test] ../../../test/HU28_ronald/chatbot.service.test.ts` *(existe; ajustada con los casos del
título, que sale con el historial vacío y después de `saveExchange`, no sale con uno o dos
mensajes previos y, si falla su generación o su guardado, deja la respuesta y el par guardado)*

### BR-CB-04: Clasificacion de intencion

> *Ajustada el 2026-09-25 (corrección 4), aprobada por el dueño el 2026-09-25.* Reemplaza la
> versión con Cohere Classify y respaldo por palabras clave.

- Antes de recolectar datos, la pregunta se clasifica en uno o más de estos dominios, `grades`,
  `schedule`, `curriculum`, `alerts`, `announcements`, `delegates`, `own_blocks` y `chat`.
  - `delegates` reemplaza a `classmates`, que ya no carga datos (BR-CB-17), y hereda sus palabras
    clave. `own_blocks` es nuevo (BR-CB-18).
  - Los otros seis dominios conservan su nombre y todas sus palabras clave de hoy
    (`intent-classifier.ts:3-19`).
- La clasificación es **solo por palabras clave**, sin llamadas a Cohere. El endpoint
  `/v1/classify` que usa hoy `cohere.client.ts:125-157` (modelo `embed-multilingual-v3.0`) está
  retirado, así que hoy cada pregunta espera la respuesta de error de `/v1/classify`, con los
  500 ms de `CLASSIFY_TIMEOUT_MS` como tope (`chatbot.service.ts:12`), antes de caer al respaldo.
  `Promise.race` (`chatbot.service.ts:142-147`) se resuelve con la primera promesa que termina,
  rechazo incluido, y el `catch` de 149-151 pasa a las palabras clave. Se quitan
  `classifyWithCohere` (`intent-classifier.ts:38-87`), la carrera con timeout y el método
  `classify` de `cohere.client.ts`.
- **Normalización.** Antes de comparar, la pregunta pasa a minúsculas, se descompone en NFD y
  pierde las marcas diacríticas (U+0300 a U+036F), de modo que «¿Quiénes?» queda «¿quienes?» y
  «compañero» queda «companero». Las palabras clave se escriben ya normalizadas. Hoy
  `intent-classifier.ts:22` solo aplica `toLowerCase`, y «¿Quiénes son los delegados…?» con tilde
  no activa ningún dominio de compañeros.
- La coincidencia es por subcadena sobre el texto normalizado, como hoy, y una pregunta puede
  activar varios dominios. Sin ninguna coincidencia se usan `schedule`, `grades` y `curriculum`,
  como hoy (`intent-classifier.ts:31-33`).
- **`own_blocks` arrastra a `schedule`, en el clasificador.** `classifyByKeywords` agrega
  `schedule` a su salida siempre que detecta `own_blocks`, porque BR-CB-19 combina los bloques
  propios con el horario de clases. Es el único lugar del arrastre, y el servicio y
  `context-builder.ts` solo miran los dominios que devuelve el clasificador.
- Las palabras clave de cada dominio, ya normalizadas, son estas.
  - `grades`: nota, notas, promedio, saque, parcial, examen, calificacion, aprobe, aprobar, apruebo, aprobare, desaprob, jale, jalar
  - `schedule`: horario, hora, entro, clase, lunes, martes, miercoles, jueves, viernes, sabado, manana, tengo, cursos
  - `curriculum`: malla, creditos, cursos, terminar, ciclo, llevar, prerrequisito, falta, avance
  - `alerts`: riesgo, alerta, carga, evaluaciones
  - `announcements`: anuncio, anuncios, comunicado, aviso, publico, publicaron
  - `delegates`: delegad (cubre delegado, delegada, delegados y subdelegado), representante, companero, companeros, seccion, quienes, alumnos
  - `own_blocks`: practica, trabajo, trabajar, voluntariado, bloque, libre, organizar, organizo, organizarme, organizacion, tiempo, horas a la semana, horas semanales
  - `chat`: chat, grupo, grupos, dijo, dijeron, dicho, dicen, hablo, hablaron, comento, comentan, comentaron, comentario, comentarios, escribio, escribieron, mensaje, mensajes, conversacion, alguien
- «practica» también aparece en «práctica calificada», que es una evaluación. Por eso
  `own_blocks` arrastra a `schedule`, que trae las evaluaciones cercanas (BR-CB-14), y la regla 6
  del prompt le pide al modelo mencionar las dos cosas o preguntar cuál (BR-CB-09). «trabajo»
  activa `own_blocks` también en «trabajo final», lo que solo agrega al contexto datos del propio
  alumno.
- La prueba fija estos ejemplos. La segunda columna dice qué dominios debe incluir la salida, que
  puede traer otros.

  | Pregunta | Debe incluir |
  | --- | --- |
  | «¿Quiénes son los delegados de Seguridad de Sistemas?» | `delegates` |
  | «¿y el subdelegado?» | `delegates` |
  | «¿Quién es mi delegada en Cálculo I?» | `delegates` |
  | «¿A qué hora tengo prácticas?» | `own_blocks`, `schedule` |
  | «¿Cuántas horas a la semana le dedico al trabajo?» | `own_blocks`, `schedule` |
  | «¿Cómo organizo mi semana para estudiar?» | `own_blocks`, `schedule` |
  | «¿Qué nota saqué en el parcial?» | `grades` |
  | «¿Dijeron algo del examen en el chat?» | `chat` |
  | «¿Hay algún comunicado de mis cursos?» | `announcements` |
  | «¿Estoy en riesgo académico?» | `alerts` |
  | «¿Cuántos créditos llevo?» | `curriculum` |

`[@test] ../../../test/HU28_ronald/chatbot.intent-classifier.test.ts` *(existe; se ajusta a los
dominios nuevos, a la normalización, al arrastre de `own_blocks` a `schedule` y a los ejemplos)*

### BR-CB-05: Recoleccion de datos por intencion

> *Ajustada el 2026-09-25, aprobada por el dueño el 2026-09-25.* El chat deja de consultarse
> siempre (BR-CB-23), `classmates` sale (BR-CB-17) y entran `delegates` (BR-CB-16) y
> `own_blocks` (BR-CB-18).

Se consultan solo las fuentes de los dominios que activa la pregunta (BR-CB-04). Las consultas
corren en paralelo con `Promise.all`, como hoy (`chatbot.service.ts:58-75`).

| Intent | Fuente | Query |
| --- | --- | --- |
| `grades` | PostgreSQL y body del request | `getOfficialGrades` (notas oficiales del período activo) y `localGrades` enviadas por el frontend |
| `schedule` | Modulo `schedule` (reutilizado) | `ScheduleService.getAssessments(studentId)` + `ScheduleRepository.findAcademicWeeksForActivePeriod()`. El chatbot **no** reimplementa la query; delega en el modulo schedule (ya aprobado). El filtro por rango de semanas se aplica en el chatbot (BR-CB-14). Con `own_blocks` también se carga, porque el clasificador agrega `schedule` (BR-CB-04). |
| `curriculum` | PostgreSQL | `student_course_progress` + `curriculum_course` + `course` + `enrollment` activo |
| `alerts` | PostgreSQL | `alert` del alumno en el periodo activo |
| `announcements` | PostgreSQL | `announcement` de las secciones donde el alumno esta matriculado |
| `delegates` | PostgreSQL | Delegado y subdelegado de cada sección activa del alumno, desde `section_representative` activo y, si falta, `section_representative_claim` (BR-CB-16). Reemplaza a `classmates`. |
| `own_blocks` | Módulo `time-blocks`, por una función acotada | Bloques propios del alumno que pregunta y sus horas de la semana (BR-CB-18 y RS-BE-35 de `time-blocks`) |
| `chat` o `announcements` | Firebase RTDB | Mensajes recientes de `sections/{sectionId}/messages`, sin remitente (BR-CB-06 y BR-CB-23). Ya no corre en toda pregunta. |

`[@test] ../../../test/HU28_ronald/chatbot.service.test.ts` *(existe; se ajusta, porque su
bloque «el chat se consulta SIEMPRE» pasa a exigir lo contrario)*

### BR-CB-06: Lectura del chat de la seccion

> *Ajustada el 2026-09-25, aprobada por el dueño el 2026-09-25.* El primer punto y el formato de
> los mensajes cambian según BR-CB-23, que deriva de la decisión 1 y el dueño confirma al aprobar.
> El filtro de secciones no cambia, pero el código de hoy no lo cumple y el ajuste lo alinea.

- ~~**El chat se consulta SIEMPRE**, independientemente del intent detectado.~~ *Reemplazado el
  2026-09-25.* El chat se consulta solo cuando la pregunta activa `chat` o `announcements`
  (BR-CB-23). Una pregunta como «¿se pueden usar apuntes?» sin ninguna de esas palabras deja de
  mirar el chat, que es el costo de no mandar mensajes de terceros en toda pregunta.
- Se obtienen los `sectionId` de las secciones activas del alumno.
- **Filtro de secciones:** `filterSections(question, sections)` retorna las secciones cuyo nombre de curso (en minusculas, sin acentos) **o** codigo de seccion aparece como substring en la pregunta. Ademas, hace **match por tokens significativos** (palabras del nombre del curso con longitud > 3, ignorando articulos/preposiciones y numeros romanos como `II`, `III`): si cualquiera de esos tokens esta en la pregunta, la seccion matchea. Esto permite que "software" matchee con "INGENIERIA DE SOFTWARE II" aunque la frase completa no este. Si ninguna seccion matchea, se toman las primeras 3 secciones (alfabeticas) como fallback. *Nota del 2026-09-25.* El código de hoy no cumple este punto. `filterSections` solo aplica `toLowerCase` (`chat-search.ts:46`), sin quitar tildes, y el respaldo toma `sections.slice(0, 3)` (`chat-search.ts:56`) de `getActiveSectionDetails`, que no tiene `ORDER BY` (`chatbot.repository.ts:142-157`). El ajuste usa la normalización de BR-CB-04 para la pregunta y el nombre del curso, y ordena las secciones por nombre de curso y código de sección.
  *Aclaración del 2026-09-25, en la revisión de la Tarea 2.* La regla de longitud mayor que 3 no
  basta para ignorar artículos y preposiciones, porque deja pasar «ante», «bajo», «cabe»,
  «contra», «desde», «durante», «entre», «hacia», «hasta», «mediante», «para», «según», «sobre»,
  «tras», «versus», «unos» y «unas». Por eso el filtro descarta además los tokens de una lista
  explícita de artículos y preposiciones, escrita ya con la normalización de BR-CB-04. La lista trae los artículos
  el, la, los, las, lo, un, una, unos y unas, las contracciones al y del, y las preposiciones a,
  ante, bajo, cabe, con, contra, de, desde, durante, en, entre, hacia, hasta, mediante, para, por,
  según, sin, so, sobre, tras, versus y vía. La aclaración no cambia la regla, que ya pedía
  ignorarlos, y la vuelve comprobable. Como el emparejamiento por tokens busca subcadenas, la lista
  evita también que «para» empareje dentro de «preparar».
- Para cada seccion relevante, se leen los **ultimos 200 mensajes** desde Firebase RTDB (`getRecentMessages(sectionId, 200)`).
- **No se usa Cohere Rerank** para el chat: se envian todos los mensajes leidos al LLM en el contexto. El LLM tiene capacidad nativa de leer JSON y razonar sobre los mensajes, asi que entiende tanto preguntas especificas ("que se dijo del examen?") como preguntas meta ("dijeron algo por el grupo?"). Esto evita dependencia adicional de Cohere Rerank, reduce latencia y costo, y elimina el riesgo de perder mensajes relevantes por scores bajos.
- ~~Los mensajes se incluyen en el contexto bajo el titulo `MENSAJES DEL CHAT DE LA SECCION`, en formato JSON con `senderName`, `body` y `createdAt`. El LLM debe responder en lenguaje natural (no IDs tecnicos), citando remitentes por nombre.~~ *Reemplazado el 2026-09-25.* Los mensajes van bajo `MENSAJES DEL CHAT DE LA SECCION`, agrupados por curso y sección, **sin remitente**, solo con su texto y su fecha en hora de Lima (BR-CB-23). El modelo no atribuye ningún mensaje a nadie (regla 13 de BR-CB-09).
- Si una seccion no tiene mensajes, se omite. Si Firebase RTDB no esta disponible para una seccion, se hace `console.warn` y se continua con la siguiente seccion (no se bloquea la respuesta para otros intents).

`[@test] ../../../test/HU28_ronald/chatbot.chat-search.test.ts` *(existe; se ajusta a la
normalización, al orden del respaldo, a los artículos y preposiciones que no emparejan y a los
mensajes sin remitente y con `date` en hora de Lima, BR-CB-23)*

### BR-CB-07: Ventana de contexto

> *Ajustada el 2026-09-25 (corrección 5), aprobada por el dueño el 2026-09-25.* El historial deja
> de ir dentro del mensaje de datos y viaja una sola vez, como turnos.

- Lo que recibe Cohere Chat en cada pregunta tiene tres partes, en este orden.
  1. El *preamble* con el system prompt de BR-CB-09.
  2. Los turnos previos de la sesión, hasta 10 mensajes `user` y `assistant`, leídos antes de
     guardar la pregunta actual (BR-CB-20). Van como turnos de `chatWithHistory` y en ningún otro
     lugar.
  3. Un último turno `user` con el mensaje de datos y la pregunta, con los bloques y el formato de
     BR-CB-24. Ese mensaje lleva el perfil del alumno (nombre, carrera y ciclo, tomados del JWT y
     la base), la fecha y semana actual (BR-CB-13), los bloques de datos de los dominios activos,
     las notas locales si el dominio incluye `grades`, los mensajes del chat si corresponde
     (BR-CB-23) y la pregunta.
- El bloque `HISTORIAL DE LA CONVERSACION` que hoy arma `context-builder.ts:92-99` desaparece, y
  `buildContext` deja de recibir el historial.
- Si la sesión tiene más de 10 mensajes, solo viajan los 10 últimos. Los anteriores se quedan en la
  base hasta la retención del ciclo (BR-CB-22) y se siguen mostrando en
  `GET /chatbot/sessions/:id`.

`[@test] ../../../test/HU28_ronald/chatbot.context-builder.test.ts` *(existe; se ajusta, porque
el mensaje de datos ya no trae el historial)*

### BR-CB-08: Notas locales

- Las notas personales viajan en el body de cada request bajo la clave `localGrades`.
- El backend no persiste estas notas; solo las incluye en el contexto para que Cohere las use.
- Schema Zod para `localGrades`:
  ```ts
  z.array(z.object({
    id: z.string(),
    nombre: z.string(),
    notas: z.array(z.object({
      titulo: z.string(),
      peso: z.number(),
      valor: z.number().min(0).max(20),
    })),
  })).optional()
  ```

### BR-CB-09: System Prompt

> *Ajustada el 2026-09-25 (corrección 6), aprobada por el dueño el 2026-09-25.* La regla 4 de hoy
> (`context-builder.ts:19-21`) prohíbe hablar de otros alumnos mientras el mismo mensaje trae sus
> nombres, y la regla 1 (`context-builder.ts:9-11`) declara fuente a todo el contexto, historial
> incluido. El prompt nuevo reconcilia la regla 4 con la decisión 1, separa los datos de la
> conversación (BR-CB-20), agrega las reglas de los bloques propios y de la gestión del tiempo
> (BR-CB-18 y BR-CB-19) y la del chat sin remitentes (BR-CB-23). Las reglas 9 y 10, que el código
> ya tiene por las notas oficiales, no cambian. El texto va sin tildes, como el del código.

```
Eres ULimaBot, un asistente academico personal para estudiantes de la
Universidad de Lima. Tu funcion es ayudar al alumno con informacion
sobre su vida academica y con ideas para organizar su tiempo.

REGLAS:
1. SOLO respondes con datos que aparecen en el bloque de datos del
   ultimo mensaje, entre "DATOS DEL ALUMNO" y "FIN DE LOS DATOS".
   Los turnos anteriores de la conversacion sirven para entender la
   pregunta, pero NO son fuente de datos: si una respuesta tuya
   anterior contradice el bloque de datos, manda el bloque de datos.
   Si no hay informacion suficiente, di exactamente:
   "No tengo esa informacion en este momento."

2. NUNCA inventes notas, horarios, bloques, nombres de personas,
   fechas de examenes ni ningun dato academico. Si el bloque de datos
   no lo contiene, no lo sabes.

3. Responde en espanol, con tono amable y directo. Se conciso.

4. De otras personas solo puedes nombrar al delegado y al subdelegado
   de las secciones del alumno, tal como aparecen en "DELEGADOS DE TUS
   SECCIONES", diciendo siempre su cargo, el curso y la seccion. Si una
   seccion dice "sin delegado registrado" o "sin subdelegado
   registrado", responde eso y no tomes el delegado ni el subdelegado
   de otro curso. No des ningun otro dato de otros alumnos (notas,
   horario, contacto ni bloques) y no atribuyas mensajes del chat a
   nadie (regla 13). Si te preguntan por otra persona o por datos de
   otro alumno, di: "Solo puedo mostrarte tu propia informacion
   academica y quienes son los delegados de tus secciones."

5. NO reveles informacion tecnica (IDs, tokens, codigos internos).
   Siempre traduce a lenguaje natural (ej. "Lunes" no "day_of_week=1").

6. Si la pregunta es ambigua, pide aclaracion brevemente en lugar de
   asumir. Si pregunta por una "practica" y en los datos hay a la vez
   una evaluacion y un bloque propio que podrian ser, menciona los dos
   o pregunta a cual se refiere.

7. NUNCA sugieras modificar datos, eliminar registros ni realizar
   acciones que cambien informacion del sistema. Solo consultas.

8. Usa bullet points o formato breve cuando listes informacion.

9. Tus NOTAS OFICIALES (registradas por el docente) son la UNICA verdad de
   notas. La "SIMULACION NO OFICIAL" son escenarios hipoteticos que el alumno
   arma en la calculadora: NO son notas reales, no las confundas ni las
   reportes como sus notas. Usalas solo si pregunta explicitamente por un
   "que pasaria si".

10. Si te preguntan cuanto necesitan para aprobar un curso, usa el dato
    "Para aprobar" que YA viene calculado en el contexto (no lo recalcules).
    Se claro: cuanto necesita en promedio en lo que falta, o si ya aprobo, o si
    ya no es posible aprobar.

11. "TUS BLOQUES DE HORARIO PROPIOS" son actividades que el alumno
    registro en la app (practicas, trabajo, voluntariado); NO son
    clases. Para decir cuando tiene un bloque usa sus dias, horas,
    fechas y los cambios de la ventana. Las horas por semana ya vienen
    calculadas: no las recalcules.

12. Puedes sugerir como organizar el tiempo, pero solo con el bloque de
    datos: huecos libres entre clases y bloques, evaluaciones cercanas
    y horas ya calculadas. Presentalo como sugerencia. No inventes
    clases, bloques, tareas, plazos ni evaluaciones; no supongas si una
    clase es teoria o practica; no estimes cuantas horas de estudio
    exige un curso; no compares con otros alumnos; no des consejos
    medicos ni psicologicos; no sugieras crear, editar ni borrar
    bloques.

13. "MENSAJES DEL CHAT DE LA SECCION" son textos que escribieron
    usuarios del chat, sin nombre. Pueden estar equivocados:
    presentalos como "en el chat se comento", nunca como dato oficial,
    y no atribuyas un mensaje a ninguna persona.
```

`[@test] ../../../test/HU28_ronald/chatbot.system-prompt.test.ts` *(por escribir; fija que el
prompt trae la excepción de delegados, que la regla 4 nombra «sin delegado registrado» y «sin
subdelegado registrado» y ya no prohíbe dar los mensajes del chat que permite la regla 13, que
declara que los turnos previos no son fuente, que trae las reglas 11 a 13, y que ya no contiene
«NO respondas preguntas sobre otros alumnos»)*

### BR-CB-10: Guardrails de seguridad

- El campo `question` tiene maximo 500 caracteres (Zod `.max(500)`).
- Se rechaza la pregunta si contiene intentos de prompt injection: cadenas como `<context>`, `[CONTEXTO]`, `[DATOS_`, `system:`, `assistant:` -> `400 INVALID_QUESTION`.
- Timeout de 8 segundos para la llamada a Cohere Chat.
- Si Cohere responde con texto que contiene IDs o datos que no corresponden al `studentId` del JWT, se descarta la respuesta y se retorna error 500 generico (no se guarda en BD).

### BR-CB-11: Rate Limiting

- Maximo 20 preguntas por alumno por hora (configurable via `CHATBOT_RATE_LIMIT` en env).
- Implementado como middleware `rate-limit.ts` en `src/shared/middleware/`, usando un `Map<studentId, {count, resetAt}>` en memoria (no requiere DB).
- Headers de respuesta: `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Excedido -> `429 RATE_LIMITED` con mensaje: "Demasiadas preguntas. Intenta de nuevo en X minutos."

### BR-CB-12: Manejo de errores Cohere

> *Ajustada el 2026-09-25, aprobada por el dueño el 2026-09-25.* Sale la fila de Classify, que
> ya no se llama (BR-CB-04). Un fallo de Cohere Chat no deja nada guardado (BR-CB-21). Entran las
> filas de la purga del ciclo (BR-CB-22) y de los bloques propios (BR-CB-18).

| Escenario | HTTP | Mensaje al alumno |
| --- | --- | --- |
| ~~Classify falla~~ | ~~N/A (usa keyword fallback)~~ | *Sale el 2026-09-25: no hay llamada a Classify.* |
| Chat timeout (>8s) | 503 | "Estoy teniendo dificultades tecnicas en este momento. Por favor intenta de nuevo en unos segundos." No se guarda ni la pregunta ni la respuesta (BR-CB-21). |
| Chat 429 (rate limit Cohere) | 503 | (mismo mensaje generico; no se guarda nada) |
| Chat 500 (error Cohere) | 503 | (mismo mensaje generico; no se guarda nada) |
| Falla la transacción que guarda pregunta y respuesta | 500 | Error genérico; no queda ninguna de las dos filas (BR-CB-21). |
| Falla la purga del ciclo | Ninguno propio | La petición sigue; se registra con `console.error` y la próxima petición la reintenta (BR-CB-22). |
| Falla la lectura de bloques propios | Ninguno propio | La respuesta sigue sin ese bloque; se registra con `console.warn` (BR-CB-18). |
| Rate limit propio | 429 | "Demasiadas preguntas. Intenta de nuevo en X minutos." |

- Nunca se exponen detalles del error de Cohere al frontend. Se loguea internamente con `console.error`.

`[@test] ../../../test/HU28_ronald/chatbot.atomic-save.test.ts` *(existe; el fallo de Cohere
responde `503 CHATBOT_UNAVAILABLE` sin ninguna escritura, aunque la purga sí corrió, y otro fallo
de la transacción responde un 500 genérico sin detalles de la base)*
`[@test] ../../../test/HU28_ronald/chatbot.retention.test.ts` *(existe; la purga fallida se
registra con `console.error` y no corta `listSessions`, `getSession`, `createSession` ni `ask`)*
`[@test] ../../../test/HU28_ronald/chatbot.time-management.test.ts` *(existe; la lectura fallida
de los bloques propios se registra con `console.warn` y la respuesta sigue sin ese bloque)*

### BR-CB-13: Fecha y zona horaria del contexto

- El backend expone un helper `todayISO()` en `src/shared/clock.ts` que devuelve la fecha actual en formato `YYYY-MM-DD` forzando `timeZone: "America/Lima"` via `Intl.DateTimeFormat`. Esto independiza al chatbot de la zona horaria del servidor.
- En cada llamada a `POST /chatbot/sessions/:id/ask`, el service calcula:
  - `today`: la fecha de hoy en Lima.
  - `currentWeekNumber`: la `academic_week` cuyo `[start_date, end_date]` contiene `today`. Si no hay match exacto, se toma la `academic_week` con `start_date <= today` de mayor `start_date` (semana más reciente empezada). Si tampoco hay (periodo aún no inicia), se toma la primera semana del periodo activo.
  - `nextWeekNumber = currentWeekNumber + 1` (si existe en `academic_week`; si no, se omite).
  - `academicPeriodCode`: del periodo activo.
- Si no existe periodo activo o no hay `academic_week` cargadas, el contexto incluye solo `today`. El LLM puede entonces razonar con la fecha del servidor aunque falten las semanas.
- El `dateContext` es **obligatorio** en la firma de `buildContext` (no opcional): `buildContext` no tiene que defenderse de un null, el service garantiza que siempre hay al menos `today`.

### BR-CB-14: Rango de evaluaciones pasado al LLM

- El chatbot reutiliza `ScheduleService.getAssessments(studentId)` (módulo `schedule`) en vez de reimplementar la query.
- Si `currentWeekNumber` está disponible (BR-CB-13), el chatbot filtra las evaluaciones a `[currentWeekNumber - 1, currentWeekNumber + 1]` (3 semanas). Esto evita saturar el contexto con las 16 semanas del ciclo.
- Si `currentWeekNumber` no está disponible, el chatbot **no filtra** y pasa todas las evaluaciones del periodo al LLM. El LLM puede entonces responder con la fecha completa.
- Este filtro se aplica **solo en el chatbot**. El endpoint `GET /schedule/me/assessments` sigue devolviendo el ciclo completo (no se modifica su contrato).

### BR-CB-15: Tipo de evaluación compartido

- `chatbot.types.ts` **no** declara su propio `AssessmentData`. Reexporta `AssessmentResponse` desde `schedule.types.ts` (que ya incluye `weekNumber`, `date`, `startTime`, `endTime`, `classroom`, `color` calculados correctamente por `ScheduleService`).
- La fecha, hora y aula del examen en el contexto del LLM vienen siempre de `ScheduleService`, no de una query propia. Esto evita inconsistencias entre lo que ve el alumno en la app y lo que le responde el chatbot.

### BR-CB-16: Delegados y subdelegados por curso y sección

> *Nueva el 2026-09-25 (decisión 1), aprobada por el dueño el 2026-09-25.*

- **Qué secciones.** Las de matrícula activa del alumno (`enrollment.status = 'active'`) en el
  período activo (`academic_period.is_active = true`), una entrada por sección, ordenadas por
  nombre de curso y código de sección. No hay `LIMIT` global, porque el tamaño ya lo acotan las
  secciones del alumno multiplicadas por dos cargos.
- **Precedencia por cargo.** Para cada sección y cada cargo (`delegate` y `subdelegate`) manda la
  primera fuente que tenga dato.
  1. `section_representative` activo de esa sección y ese cargo, con el nombre de
     `app_user.full_name` por `enrollment → student → app_user`. Cuenta solo si cumple dos
     condiciones, `sr.is_active = true` con `sr.section_id` igual a la sección, y la matrícula
     `sr.enrollment_id` de esa misma sección (`er.section_id = sr.section_id`). No se exige que esa
     matrícula esté activa, de modo que un representante con matrícula `withdrawn` o `completed`
     sigue contando, igual que en la pantalla del curso, que lista a los matriculados de la
     sección sin filtrar su estado (`course-detail.routes.ts:195-216`). *Propuesta que el dueño
     confirma al aprobar; si prefiere que no cuente, se agrega `er.status = 'active'` y el cargo
     cae al claim o queda vacío.* El índice único parcial
     `uq_active_section_representative_position` (`schema.ts:411-413`) deja como máximo uno por
     cargo.
  2. Si no hay representante activo para ese cargo, `section_representative_claim` de esa sección
     y ese cargo (`schema.ts:432-451`), con su `full_name`, que es lo que publica el portal.
     `uq_section_representative_claim_position` (`schema.ts:449-450`) deja como máximo uno.
  3. Si no hay ninguno, el cargo queda vacío y el contexto dice «sin delegado registrado» o «sin
     subdelegado registrado» para esa sección.
- Sigue la regla de la pantalla del curso (`course-detail.routes.ts:251-277`), que muestra el
  claim solo cuando no hay representante real activo para ese cargo, con una diferencia en un
  borde. El `NOT EXISTS` de la pantalla (`course-detail.routes.ts:270-275`) oculta el claim ante
  cualquier representante activo cuyo `sr.section_id` sea la sección, aunque su matrícula sea de
  otra, mientras que el chatbot exige la misma sección también en la matrícula y en ese caso usa
  el claim. La consulta de solo lectura del 2026-09-25 no encuentra ningún representante así, de
  modo que hoy las dos dan lo mismo. Cada cargo se resuelve por separado, así que una sección
  puede tener el delegado de la app y el subdelegado del portal.
- **El propio alumno.** Si el representante es el alumno que pregunta (mismo `student.id`, o un
  claim cuyo `student_code` coincide con el `app_user.code` del alumno), el dato lo marca y el
  contexto dice «tu». Hoy `chatbot.repository.ts:315` lo excluye y el bot no puede decirle a un
  delegado que lo es.
- **Qué viaja.** El cargo, el nombre, el curso y el código de sección, y nada más. No viajan el
  código de alumno, el correo, el origen del dato (app o portal) ni el resto de la nómina.
- **Implementación.** Consulta nueva `getSectionRepresentatives(studentId)` en
  `chatbot.repository.ts`, en una sola sentencia SQL parametrizada. Tipo nuevo
  `SectionRepresentativesData { courseName; sectionCode; delegate; subdelegate }`, donde cada cargo
  es `{ fullName: string; isSelf: boolean } | null`, en `chatbot.types.ts`. El esbozo de la
  consulta que sigue es orientativo y no literal.

  ```sql
  WITH mis_secciones AS (
    SELECT s.id AS section_id, c.name AS course_name, s.code AS section_code
    FROM enrollment e
    JOIN section s ON s.id = e.section_id
    JOIN course_offering co ON co.id = s.course_offering_id
    JOIN course c ON c.id = co.course_id
    JOIN academic_period ap ON ap.id = co.academic_period_id
    WHERE e.student_id = $studentId AND e.status = 'active' AND ap.is_active = true
  ),
  cargos AS (SELECT unnest(enum_range(NULL::representative_position)) AS position),
  reales AS (
    SELECT sr.section_id, sr.position, au.full_name, (st.id = $studentId) AS is_self
    FROM section_representative sr
    JOIN enrollment er ON er.id = sr.enrollment_id AND er.section_id = sr.section_id
    -- sin filtrar er.status, como la pantalla del curso (propuesta, ver arriba)
    JOIN student st ON st.id = er.student_id
    JOIN app_user au ON au.id = st.user_id
    WHERE sr.is_active = true
  ),
  yo AS (
    SELECT au.code FROM student st JOIN app_user au ON au.id = st.user_id
    WHERE st.id = $studentId
  )
  SELECT ms.course_name, ms.section_code, k.position,
         COALESCE(r.full_name, cl.full_name) AS full_name,
         COALESCE(r.is_self, cl.student_code = (SELECT code FROM yo), false) AS is_self
  FROM mis_secciones ms
  CROSS JOIN cargos k
  LEFT JOIN reales r ON r.section_id = ms.section_id AND r.position = k.position
  LEFT JOIN section_representative_claim cl
    ON r.section_id IS NULL AND cl.section_id = ms.section_id AND cl.position = k.position
  ORDER BY ms.course_name, ms.section_code, k.position
  ```

- Solo se consulta cuando la pregunta activa `delegates` (BR-CB-04).

`[@test] ../../../test/HU28_ronald/chatbot.delegates.postgres.test.ts` *(por escribir; contra un
PostgreSQL local vacío y solo con `TEST_DATABASE_URL`, como `time-blocks.postgres.test.ts`. Los
casos que fija son delegado real en una sección y claim en otra; solo claim; real y claim del mismo cargo,
donde gana el real; sección sin nada, que sale vacía; una persona matriculada en dos secciones y
delegada solo en una, que sale solo en esa; el propio alumno como subdelegado, con `isSelf`; un
claim cuyo `student_code` es el `app_user.code` del alumno, que sale con `isSelf`; un
representante real con matrícula `withdrawn`, que cuenta igual, salvo que el dueño decida exigir
matrícula activa; un representante activo cuya matrícula es de otra sección, que no cuenta y deja
pasar el claim; una sección de un período inactivo, que no sale; y 35 matriculados por sección,
que no cambian el resultado)*

### BR-CB-17: Sin el bloque plano de compañeros

> *Nueva el 2026-09-25 (decisión 1), aprobada por el dueño el 2026-09-25.*

- Se borran `getClassmates` (`chatbot.repository.ts:282-320`), el tipo `ClassmateData`
  (`chatbot.types.ts:68-71`) y el bloque `DATOS DE COMPANEROS` (`context-builder.ts:121-124`). El
  chatbot deja de mandar a Cohere los nombres de los compañeros que no son delegado ni subdelegado.
- Ninguna consulta del chatbot proyecta el nombre de otro alumno, salvo la de BR-CB-16. Los
  anuncios siguen como hoy, etiquetados por curso y sección y sin proyectar quién los publica
  (`chatbot.repository.ts:255-279`), y el chat de sección deja de mandar remitentes (BR-CB-23).
- **Dos residuos de texto libre.** *Para que el dueño los acepte al aprobar o decida otra
  salida.* El punto anterior cubre los campos que arma el chatbot, pero dos textos libres pueden
  seguir llevando a Cohere nombres de compañeros que no son representantes.
  1. Las respuestas del bot anteriores al ajuste, que ya traen nombres de compañeros tomados del
     bloque plano, siguen guardadas y viajan como turnos previos (BR-CB-20) mientras viva su
     sesión. La primera purga (BR-CB-22) solo borra las sesiones sin actividad desde el inicio de
     2026-2, así que las demás siguen hasta la purga del ciclo siguiente. Una salida posible es
     purgar una sola vez, al desplegar, todas las sesiones anteriores al despliegue, que es otro
     borrado masivo con su aprobación, su conteo en solo lectura y su respaldo, como la primera
     purga de BR-CB-22.
  2. El cuerpo de los mensajes del chat (BR-CB-23) y el de los anuncios lo escriben personas y
     puede nombrar a terceros aunque ya no viajen el remitente ni el autor. El chatbot no filtra
     texto libre.
- Una pregunta como «¿quiénes están en mi sección?» activa `delegates` y se responde con los
  delegados de esa sección y con la regla 4 del prompt (BR-CB-09).

`[@test] ../../../test/HU28_ronald/chatbot.no-classmates.test.ts` *(por escribir; recorre los
`.ts` de `src/modules/chatbot/` con `Bun.Glob` y falla si aparecen `getClassmates`,
`ClassmateData` o `DATOS DE COMPANEROS`. Además, con un repositorio falso en el que un compañero
que no es representante está matriculado en la sección del alumno, con un historial de prueba de
varios turnos escrito después del ajuste y con chat y anuncios falsos que no lo nombran, comprueba
que ninguna parte de lo que recibe Cohere, ni el preamble, ni los turnos previos, ni el mensaje de
datos, contiene su nombre)*

### BR-CB-18: Bloques propios del alumno en el contexto

> *Nueva el 2026-09-25 (decisión 2), aprobada por el dueño el 2026-09-25.* Depende de RS-BE-35 de
> `specs/features/time-blocks/time-blocks.spec.md`, ajustada el mismo día.

- **Cuándo.** Solo si la pregunta activa `own_blocks` (BR-CB-04).
- **Por dónde.** El servicio llama a la función acotada `readOwnTimeBlocksForAssistant(studentId,
  today)` que exporta `src/modules/time-blocks/index.ts` (RS-BE-35). Llega a `ChatbotService` por
  constructor, como `scheduleService` (`chatbot/index.ts:10`), y solo `chatbot/index.ts` la
  importa como valor. Cualquier otro archivo del chatbot que la nombre, por ejemplo para tipar el
  constructor con `typeof`, la importa con una declaración `import type { … }` (RS-BE-35). El resto
  del módulo `time-blocks` no se importa y el chatbot no nombra sus tablas.
- **Solo del propio alumno.** `studentId` sale del JWT (BR-CB-01) y `today` es el `todayISO()` de
  BR-CB-13. Ningún texto de la pregunta ni ningún parámetro cambia el alumno.
- **Ventana.** Del lunes de la semana de `today` al domingo de la semana siguiente, 14 días en hora
  de Lima.
- **Bloques que entran.** Los del alumno cuya `endDate` es igual o posterior al lunes de la
  ventana, es decir, vigentes y futuros, en el orden de `findBlocks` (fecha de inicio y hora de
  inicio). Los vencidos no entran. El tope de 20 bloques por alumno (RS-BE-31) acota el bloque.
- **Campos por bloque.** Título, días de la semana, hora de inicio y de fin, fecha de inicio y de
  fin, y los cambios de la ventana, que son las excepciones cuya fecha cae dentro de la ventana y
  dentro del patrón del bloque, con su estado y, si es `moved`, sus horas. No viajan el id, el
  color, las fechas de creación ni las excepciones fuera de la ventana.
- **Horas de la semana.** Las de la semana actual y la siguiente, calculadas con
  `expandOccurrences` y `weeklyHours` (`time-blocks.logic.ts:79` y `:163`), las mismas funciones de
  `GET /time-blocks/me/occurrences` (RS-BE-33 y RS-BE-34). El número coincide con el que el alumno
  ve en la app, y el modelo no lo recalcula (regla 11 de BR-CB-09).
- **Cómo se resumen días, horas y frecuencia.** Lo arma `context-builder.ts`, como lógica pura.
  - Los días van con nombre en español y sin tilde, de lunes a domingo, unidos con comas y «y»
    («lunes y miercoles», «lunes, miercoles y viernes»). Con los siete días se escribe «todos los
    dias».
  - Las horas van como «de 14:00 a 18:00».
  - La frecuencia es siempre «todas las semanas», porque la única repetición que existe es la
    semanal (`time-blocks`, «Qué NO entra»).
  - La vigencia va como «del 2026-09-01 al 2026-12-15». Si el bloque todavía no empieza, «empieza
    el 2026-10-03 y termina el 2026-11-28».
    *Aclaración del 2026-09-25, en la revisión de la Tarea 3, que el dueño confirma.* Un bloque
    todavía no empieza cuando su `startDate` es posterior a `today` (BR-CB-13), y no al lunes de la
    ventana. Un bloque que empieza hoy, o entre ese lunes y hoy, ya empezó y va «del … al …». La
    aclaración sigue la lectura literal de «todavía», que habla del día en que el alumno pregunta.
  - Cada cambio de la ventana ocupa una línea, «miercoles 2026-09-30, no va (cancelado)» o «lunes
    2026-09-28, de 15:00 a 19:30 (horario cambiado)».
  - Las horas semanales van en horas decimales con punto y sin redondear, como en la API
    («7.5 h»).
- **El título.** Es texto libre del alumno dentro del bloque de datos, igual que la pregunta que
  filtra BR-CB-10, y no debe romper la estructura del bloque. Llega con 1 a 60 caracteres y sin
  espacios al borde (`chk_time_block_titulo`, RS-BE-30 y RS-BE-31 de `time-blocks`), y
  `context-builder.ts` lo limpia en este orden.
  1. Cada tramo de espacios en blanco (`/\s+/g`, que incluye saltos de línea y tabulaciones) pasa
     a un solo espacio, y se recortan los bordes.
  2. Cada comilla doble `"` pasa a comilla simple `'`.
  3. Las tildes y la eñe se conservan tal como las guarda la app, que escribe «Prácticas» en el
     ejemplo del contrato de `time-blocks`.

  La limpieza no alarga el texto, así que el tope de 60 caracteres se mantiene sin cortar nada. El
  título va entre comillas dobles después de `- `, en la misma línea que sus días y horas, de modo
  que ningún título puede formar una línea propia que imite `FIN DE LOS DATOS` o el título de otro
  bloque. El título solo llega al contexto de su propio dueño y no abre una vía hacia la sesión de
  otro alumno.

  *Decisión abierta del dueño, anotada el 2026-09-25 en la revisión de la Tarea 3.* La expresión
  `/\s+/g` del paso 1 no cubre NEL (U+0085) ni los separadores U+001C a U+001E, que el corte de
  líneas de Unicode (UAX #14) o `str.splitlines` de Python tratan como salto de línea. Ni
  `z.string().trim()` (`time-blocks.schemas.ts:88`) ni `chk_time_block_titulo` rechazan esos
  caracteres, así que la garantía del párrafo anterior vale para quien corta las líneas en `\n` y
  no para un consumidor que corte también en ellos. El riesgo es bajo, porque el título solo llega
  al contexto de su dueño. La propuesta es que el paso 1 use `/[\s\p{Cc}]+/gu`, que suma todo
  carácter de control, en `singleLine` de `context-builder.ts`, la función que limpia además los
  cursos, las secciones y los nombres del bloque 7 (BR-CB-16). Con esa expresión, un título hecho
  solo de caracteres de control queda vacío y sale como `""`. Otra salida es que RS-BE-31 de
  `time-blocks` rechace esos caracteres al guardar el título. Mientras el dueño no decida, rige
  `/\s+/g` y el código no endurece la limpieza.
- Si el alumno no tiene bloques vigentes ni futuros, el bloque existe igual y dice «No registraste
  bloques propios vigentes.», para que el modelo no confunda «sin bloques» con «sin datos».
- Si la función falla, el servicio lo registra con `console.warn` y arma el contexto sin ese
  bloque, como hace hoy con el chat (BR-CB-06). Tampoco sale entonces la línea de horas de clase
  de BR-CB-19, que vive dentro de este bloque.

`[@test] ../../../test/HU28_ronald/chatbot.own-blocks-context.test.ts` *(por escribir; el
resumen de días, horas, frecuencia, vigencia, cambios y horas semanales, la limpieza del título
con un salto de línea, una tabulación, una comilla doble y tildes, el caso sin bloques y el fallo
de la función, que quita también la línea de horas de clase. Desde la revisión de la Tarea 3, la
vigencia medida contra hoy, también con un bloque que empezó entre el lunes de la ventana y hoy, y
el bloque 8 sin el horario cargado, que sale sin la línea de horas de clase)*
`[@test] ../../../test/HU35_jeff/time-blocks-assistant-summary.test.ts` *(por escribir; lado de
`time-blocks`, ver RS-BE-35)*

### BR-CB-19: Sugerencias de gestión del tiempo

> *Nueva el 2026-09-25 (decisión 2), aprobada por el dueño el 2026-09-25.* El total de horas de
> clase es una propuesta derivada de la decisión 2, para que el modelo no sume por su cuenta.

- **Cuándo.** La pregunta activa `own_blocks` («organizar», «tiempo», «libre»), y el clasificador
  agrega `schedule` por arrastre (BR-CB-04). El contexto lleva entonces el horario de clases, las evaluaciones de la
  semana anterior, la actual y la siguiente (BR-CB-14), los bloques propios (BR-CB-18) y dos totales
  que calcula el backend, las horas de bloques propios por semana y las horas de clase por semana.
- **Horas de clase por semana.** Suma de la duración (fin menos inicio) de las sesiones semanales
  que devuelve `getSchedule` (`chatbot.repository.ts:165-191`), calculada por una función pura de
  `context-builder.ts`. Es el patrón semanal del horario y no descuenta feriados ni semanas sin
  clase, porque `schedule_session` no los guarda.
  - **Suma.** Acumula minutos enteros y divide por 60 una sola vez, sin redondear, como
    `weeklyHours` (`time-blocks.logic.ts:159-161` y `:184`). Sumar horas decimales sesión por
    sesión arrastra error de coma flotante, y ocho sesiones de 1 h 50 min darían
    14.666666666666668 en vez de 14.666666666666666.
  - **Claves.** *Aclaración del 2026-09-25, en la revisión de la Tarea 3, que el dueño confirma.*
    `getSchedule` castea sus filas sin mapearlas, así que cada sesión llega con las claves de la
    consulta, en snake_case, y con las horas de `time::text`, que traen segundos
    (`start_time: "08:00:00"`). La suma lee solo `start_time` y `end_time`. El tipo `ScheduleData`
    (`chatbot.types.ts`) declaraba claves en camelCase que ninguna fila trae y pasa a declarar las
    de la consulta, sin cambiar el JSON del bloque 3. `CurriculumData`, `AlertData` y
    `AnnouncementData` conservan el mismo desajuste, pero ningún código lee sus claves y su JSON
    viaja tal cual (BR-CB-24), así que su arreglo queda fuera de este ajuste.
  - **Formato.** El mismo de las horas de bloques propios (BR-CB-18), el número de JavaScript sin
    redondear seguido de « h» («16 h», «7.5 h»). Sin sesiones en el horario, la línea dice «0 h».
  - **Lugar.** Es la última línea del bloque 8 de BR-CB-24, «Horas de clase por semana segun tu
    horario: 16 h», como en el ejemplo. Si falla la lectura de bloques propios, el bloque 8 no sale
    (BR-CB-18) y esta línea tampoco, así que el modelo no tiene el total y no lo estima (reglas 1
    y 12).
    *Aclaración del 2026-09-25, en la revisión de la Tarea 3, que el dueño confirma.* Si el horario
    no se cargó, el bloque 8 sale sin esta línea y termina en las horas de bloques propios, porque
    «0 h» de un horario sin leer sería un dato falso. «0 h» queda para un horario leído sin
    sesiones. Hoy el caso no ocurre, ya que el clasificador agrega `schedule` siempre que detecta
    `own_blocks` (BR-CB-04), pero la regla no depende de ese arrastre.
- **Lo que el modelo puede decir.** Los huecos libres entre clases y bloques que se leen en el
  bloque de datos; qué evaluaciones de la ventana caen cerca de un día cargado; cuántas horas suman
  clases y bloques, con los totales dados; una distribución de estudio en esos huecos, presentada
  como sugerencia; y un choque entre un bloque y una clase si los datos lo muestran.
- **Lo que no puede decir.** Clases, bloques, tareas, plazos o evaluaciones que no estén en el
  bloque de datos; si una clase es teoría o práctica, porque `schedule_session`
  (`schema.ts:465-478`) no lo guarda; cuántas horas de estudio exige un curso; totales distintos
  de los calculados; comparaciones con otros alumnos; consejos médicos o psicológicos; y que cree,
  edite o borre bloques o cambie su matrícula (regla 7).
- Las dos listas están en las reglas 11 y 12 del prompt (BR-CB-09).

`[@test] ../../../test/HU28_ronald/chatbot.time-management.test.ts` *(por escribir; la suma de
horas de clase con sesiones que no son horas enteras, el formato «16 h» y «7.5 h», «0 h» sin
sesiones, que `own_blocks` carga horario y bloques, y que el mensaje trae los dos totales. Desde
la revisión de la Tarea 3, que la suma lee solo `start_time` y `end_time` y que `getSchedule`
proyecta esas claves y `ScheduleData` las declara)*

### BR-CB-20: Historial como turnos, una sola vez

> *Nueva el 2026-09-25 (corrección 5), aprobada por el dueño el 2026-09-25.* Incluye un cambio de
> base de datos que exige la aprobación de BD de `AGENTS.md`.

- El servicio lee el historial **antes** de guardar nada de la pregunta actual, así que el
  historial no la incluye. Hoy `chatbot.service.ts:49-53` guarda la pregunta y después relee la
  sesión entera, y la pregunta llega tres veces a Cohere.
- Consulta nueva `getRecentMessages(sessionId, 10)` en `chatbot.repository.ts`, con
  `ORDER BY created_at DESC LIMIT 10`, y vuelta al orden cronológico en el código.
  `getMessages` sin límite (`chatbot.repository.ts:90-104`) queda solo para
  `GET /chatbot/sessions/:id`, que muestra la sesión entera.
- Los hasta 10 mensajes viajan una sola vez, como turnos `user` y `assistant` de
  `chatWithHistory` (hoy `chatbot.service.ts:102-108`), seguidos del turno final con los datos y la
  pregunta (BR-CB-24). No van dentro del mensaje de datos (BR-CB-07).
- La regla 1 del prompt dice que solo el bloque de datos es fuente y que los turnos previos no lo
  son (BR-CB-09). Una respuesta equivocada anterior deja de volver con la autoridad de un dato.
- **Índice nuevo** `idx_chatbot_message_session_created` sobre `chatbot_message (session_id,
  created_at)`, para que el `ORDER BY … LIMIT` no ordene la sesión entera. Va en la migración
  `0013` (ver «Base de Datos») y en `schema.ts`.

`[@test] ../../../test/HU28_ronald/chatbot.history-turns.test.ts` *(existe; la pregunta
aparece una sola vez en lo que recibe Cohere, ningún turno previo aparece dentro del mensaje de
datos y, con 30 mensajes guardados, solo viajan los 10 últimos y en orden)*
`[@test] ../../../test/HU28_ronald/migration-0013.test.ts` *(existe; lee el `.sql` como texto,
como `migration-0012.test.ts`, comprueba que solo crea ese índice con `IF NOT EXISTS` y que
`schema.ts` declara el mismo índice)*
`[@test] ../../../test/HU28_ronald/chatbot.retention.postgres.test.ts` *(existe; contra un
PostgreSQL local y solo con `TEST_DATABASE_URL`, la `0013` aplicada dos veces deja el índice y
`getRecentMessages` devuelve los 10 últimos de 30 en orden cronológico)*

### BR-CB-21: Pregunta y respuesta atómicas

> *Nueva el 2026-09-25 (corrección 5), aprobada por el dueño el 2026-09-25.*

- El servicio guarda la pregunta y la respuesta juntas, después de que Cohere responde, en una sola
  transacción que inserta la pregunta, inserta la respuesta y actualiza
  `chatbot_session.updated_at`. Método nuevo `saveExchange(sessionId, question, answer)` en
  `chatbot.repository.ts`, que reemplaza en `ask` a los dos `saveMessage` y los dos `touchSession`
  de hoy (`chatbot.service.ts:49-50` y `:124-125`).
- Las dos filas toman `created_at = clock_timestamp()`, que avanza dentro de la transacción. Con
  `now()`, que devuelve la misma hora en toda la transacción, la pregunta y la respuesta quedarían
  empatadas en el `ORDER BY created_at`.
- Si Cohere falla o pasa los 8 s, no se guarda nada y la respuesta es `503 CHATBOT_UNAVAILABLE`,
  como hoy. La pregunta ya no queda huérfana. Las preguntas sin respuesta que ya existen en la base
  las borra la retención del ciclo (BR-CB-22) y nadie las toca a mano.
- Si la transacción falla, no queda ninguna de las dos filas y la respuesta es un 500 genérico. Si
  falla porque la sesión ya no existe (el alumno la borró mientras esperaba, violación de llave
  foránea 23503), la respuesta es `404 SESSION_NOT_FOUND`.
- No se agrega una columna de estado. La otra salida de la corrección 5, marcar la pregunta
  fallida, exigiría una columna y una migración más.
- **Orden de `ask` tras el ajuste.**
  1. Purga del ciclo (BR-CB-22).
  2. Búsqueda de la sesión del alumno, con `404 SESSION_NOT_FOUND` si no existe.
  3. Lectura de los 10 últimos mensajes (BR-CB-20).
  4. Clasificación (BR-CB-04) y fecha del contexto (BR-CB-13).
  5. Recolección de datos en paralelo (BR-CB-05).
  6. Armado del mensaje (BR-CB-24) y llamada a Cohere con los turnos previos y ese mensaje.
  7. `saveExchange` en una transacción.
  8. Título, si el historial estaba vacío (BR-CB-03).

`[@test] ../../../test/HU28_ronald/chatbot.atomic-save.test.ts` *(existe; con Cohere que
falla no hay ningún INSERT en `chatbot_message` ni cambio de `updated_at` de la sesión, aunque la
purga del paso 1 sí haya corrido, con Cohere que responde hay una sola transacción con las dos
filas y la pregunta queda antes que la respuesta, y la sesión borrada a mitad de camino da 404)*
`[@test] ../../../test/HU28_ronald/chatbot.retention.postgres.test.ts` *(existe; contra un
PostgreSQL local y solo con `TEST_DATABASE_URL`, `saveExchange` deja la pregunta antes que la
respuesta, una respuesta que falla no deja ninguna de las dos filas, y la sesión borrada mientras
Cohere responde da 404 sin guardar nada)*

### BR-CB-22: Retención por ciclo

> *Nueva el 2026-09-25 (decisión 3), aprobada por el dueño el 2026-09-25.* No cambia el esquema
> ni la configuración del despliegue, pero su primera ejecución en producción borra de una vez
> datos vivos y exige antes del merge el paso de «Primera purga en producción». La condición
> «Solo si el período ya empezó» es una propuesta derivada de la decisión 3 que el dueño confirma
> al aprobar.

- **Qué se borra.** Las sesiones (`chatbot_session`) cuya última actividad, `updated_at`, es
  anterior al inicio del período académico activo, con sus mensajes por la cascada
  `ON DELETE CASCADE` de `chatbot_message.session_id` (`schema.ts:626`). `updated_at` cambia con
  cada pregunta respondida (BR-CB-21) y con el título (`updateSessionTitle`). Una sesión vacía
  cuenta igual.
- **Inicio del período.** Las 00:00 de `academic_period.start_date` en hora de Lima, del único
  período con `is_active = true` (índice `uq_academic_period_single_active`,
  `schema.ts:322-324`).
- **Dependencia del calendario.** El corte vale lo que vale `academic_period.start_date`. La
  importación del portal crea la fila del período con `defaultPeriodDates`
  (`portal-sync.repository.ts:77-84`), que usa el calendario publicado si el ciclo está en
  `KNOWN_PERIOD_CALENDARS` (`portal-sync.repository.ts:64-66`) y, si no, fechas por defecto
  calculadas. Según el comentario de las líneas 57-59, con ese cálculo 2026-2 arrancaba tres
  semanas antes de lo real. El `ON CONFLICT (code)` de `upsertPeriod`
  (`portal-sync.repository.ts:455`) solo cambia `is_active` y nunca corrige esas fechas.
  - Si el inicio por defecto cae después del real, la purga borra antes de tiempo las
    conversaciones del ciclo nuevo cuya última actividad cae entre el inicio real y el falso.
  - Si cae antes, la purga puede correr antes del inicio real y deja vivas hasta el ciclo
    siguiente las sesiones del ciclo anterior con actividad posterior al inicio falso.
  - **Paso operativo.** El calendario de cada ciclo nuevo entra en `KNOWN_PERIOD_CALENDARS` antes
    de la primera importación de ese ciclo, que es la que crea su fila, y en todo caso antes de su
    inicio. Es un cambio de `portal-sync`, fuera de los `targets` de esta spec. Si la fila ya
    existe con fechas por defecto, corregirla es un cambio de datos aparte con la aprobación del
    dueño, y esta spec no lo hace.
  - Otra salida es que el dueño elija al aprobar un corte que no dependa de `start_date`.
- **Solo si el período ya empezó.** *Propuesta derivada de la decisión 3, que el dueño confirma
  al aprobar.* La purga corre solo si hoy, en Lima, es igual o posterior a `start_date`. La
  decisión 3 dice que el borrado ocurre «cuando cambia el período activo», y esta condición lo
  corre desde el inicio del período activo, que puede ser días después. La importación del portal
  activa el período nuevo apenas ve un ciclo nuevo (`portal-sync.repository.ts:443-468`), y eso
  puede pasar antes de su `start_date`. Sin esta condición, una sesión creada en esos días tendría
  su última actividad antes del inicio y se borraría en la petición siguiente.
- Sin período activo no se borra nada.
- **Cómo se dispara.** Borrado perezoso en el servicio, sin cron y sin intervención manual.
  `ChatbotService` corre la purga al empezar `listSessions`, `getSession`, `createSession` y `ask`,
  antes de buscar la sesión. En `ask` y en `getSession`, una sesión del ciclo anterior se borra
  primero y la petición responde `404 SESSION_NOT_FOUND`. `deleteSession` no la corre.
- **Alcance global.** Una sola sentencia borra las sesiones vencidas de todos los alumnos y no solo
  las de quien pide, porque RQ-7 de `specs/features/delegados-portal/delegados-portal.spec.md`
  pide borrar los datos de terceros cuando su ciclo deja de estar activo, y una purga por alumno
  dejaría intactas las sesiones de quien no vuelve. El criterio es la última actividad de la
  sesión (decisión 3), así que una sesión con actividad después del inicio conserva también sus
  mensajes del ciclo anterior hasta la purga siguiente. Borrar esos mensajes viejos dentro de las
  sesiones que sobreviven sería una ampliación que exige la aprobación del dueño. Si nadie usa el
  chatbot en el ciclo nuevo, las sesiones vencidas esperan hasta la primera petición.
- **Sentencia.** Método nuevo `purgeSessionsBeforeActivePeriod()` en `chatbot.repository.ts`.

  ```sql
  DELETE FROM chatbot_session cs
  USING academic_period ap
  WHERE ap.is_active = true
    AND (now() AT TIME ZONE 'America/Lima')::date >= ap.start_date
    AND cs.updated_at < ((ap.start_date::timestamp AT TIME ZONE 'America/Lima')
                         AT TIME ZONE current_setting('TimeZone'))
  ```

  `chatbot_session.updated_at` es `timestamp` sin zona (`schema.ts:619`) y guarda la hora de pared
  de la zona de la sesión de la base, que es la que usa `now()` al escribir. La conversión lleva la
  medianoche de Lima a esa misma referencia.
- Es idempotente. Sin nada vencido no borra nada, y dos purgas a la vez no chocan.
- Si la purga falla, el servicio lo registra con `console.error` y la petición sigue (BR-CB-12).
- **Sin cambio de esquema ni de configuración del despliegue.** La tabla es chica y un recorrido
  secuencial alcanza. Si el volumen crece, un índice por `updated_at` sería un cambio de BD aparte,
  con su aprobación. Un cron de Vercel (entrada `crons` en `vercel.json` y una ruta protegida con
  `CRON_SECRET`) sería un cambio de despliegue que también exige la aprobación del dueño, y en el
  plan Hobby corre como mucho una vez al día. Se descarta porque el borrado perezoso cumple la
  decisión 3 sin tocar la configuración del despliegue. El despliegue sí dispara la primera
  purga, que sigue el paso de abajo.
- **Primera purga en producción.** *Exige la aprobación explícita del dueño antes del merge, como
  la migración `0013`.* La primera petición que pasa por `listSessions`, `getSession`, `createSession`
  o `ask` después del despliegue borra de una vez todas las sesiones de producción cuya
  `updated_at` es anterior a las 00:00 de Lima del `start_date` del período activo, que es el
  2026-08-24 si la fila de 2026-2 guarda el calendario publicado (`portal-sync.repository.ts:65`).
  Son todas las conversaciones sin actividad desde ese día, de todos los alumnos. Como 2026-2 ya
  empezó, la condición de fecha se cumple y la purga corre
  entera en esa primera petición.
  1. Antes del merge, el dueño corre en una transacción de solo lectura la consulta de abajo, que
     devuelve el código y el `start_date` del período activo y cuántas sesiones, mensajes y
     alumnos borraría la purga. Si el `start_date` no coincide con el calendario publicado del
     ciclo (2026-08-24 para 2026-2), no se mergea hasta que el dueño decida (ver «Dependencia del
     calendario»).
  2. Respaldo previo con `pg_dump` de al menos `chatbot_session` y `chatbot_message`, fuera de git,
     como el de la `0012`. Mientras ese respaldo exista, las conversaciones que la purga borra
     siguen guardadas fuera de la base, así que el dueño decide cuándo lo descarta (RQ-7).
  3. El dueño aprueba de forma explícita el conteo y el respaldo, y recién entonces se mergea. El
     número real puede ser menor que el del conteo, nunca mayor, porque `updated_at` solo avanza
     y una sesión que recibe una pregunta después del conteo sale del corte.
  4. El conteo, el respaldo y la fecha del despliegue se registran en `MIGRATIONS.md` junto a la
     `0013`.

  ```sql
  BEGIN READ ONLY;
  WITH corte AS (
    SELECT ap.code, ap.start_date,
           ((ap.start_date::timestamp AT TIME ZONE 'America/Lima')
            AT TIME ZONE current_setting('TimeZone')) AS desde
    FROM academic_period ap
    WHERE ap.is_active = true
  )
  SELECT c.code, c.start_date,
         (SELECT count(*) FROM chatbot_session cs WHERE cs.updated_at < c.desde) AS sesiones,
         (SELECT count(*) FROM chatbot_message cm
            JOIN chatbot_session cs ON cs.id = cm.session_id
           WHERE cs.updated_at < c.desde) AS mensajes,
         (SELECT count(DISTINCT cs.student_id) FROM chatbot_session cs
           WHERE cs.updated_at < c.desde) AS alumnos
  FROM corte c;
  ROLLBACK;
  ```

`[@test] ../../../test/HU28_ronald/chatbot.retention.postgres.test.ts` *(existe; contra un
PostgreSQL local vacío y solo con `TEST_DATABASE_URL`. Los casos que fija son sesión con
actividad antes del inicio, que se borra con sus mensajes; sesión con actividad después, que queda; período activo
que todavía no empieza, que no borra nada; sin período activo, nada; la frontera de la medianoche
de Lima; `ask` sobre una sesión vencida, que responde 404; y la consulta de conteo de «Primera
purga en producción», que devuelve el mismo número de sesiones y mensajes que borra la purga)*
`[@test] ../../../test/HU28_ronald/chatbot.retention.test.ts` *(existe; corre siempre, sin base.
Compara la sentencia de `purgeSessionsBeforeActivePeriod` con el bloque SQL de esta regla y fija
que `listSessions`, `getSession`, `createSession` y `ask` corren la purga una vez y antes de tocar
la sesión, que `deleteSession` no la corre y que una purga fallida se registra con
`console.error` y deja seguir la petición)*

### BR-CB-22b: Borrado único del historial previo al ajuste

> *Decisión del dueño del 2026-09-25, al aprobar esta spec.*

Al desplegar este ajuste se borran una sola vez **todas** las sesiones y mensajes del chatbot que
existan en ese momento, porque sus respuestas pueden traer nombres de compañeros de antes de
BR-CB-17. Antes se toma un respaldo (`pg_dump` de `chatbot_session` y `chatbot_message`) y se
cuentan las filas en solo lectura; el borrado va en una transacción y se registra en
`MIGRATIONS.md` sin copiar contenido. Desde ahí rige la retención por ciclo de BR-CB-22. El
respaldo no entra al repositorio y se descarta cuando el dueño lo indique.

### BR-CB-23: Búsqueda en el chat de sección, acotada

> *Nueva el 2026-09-25 (corrección 7). **Derivada de la decisión 1**, así que el dueño la confirma
> al aprobar la spec.*

- `getChatResults` (`chatbot.service.ts:189-194`) corre solo si los dominios incluyen `chat` o
  `announcements` (BR-CB-04). Hoy corre en toda pregunta (`chatbot.service.ts:72`) y manda
  mensajes de terceros con su nombre aunque la pregunta sea de notas.
- Cada mensaje viaja **sin remitente**, solo con su texto y su fecha. `ChatSearchResult`
  (`chat-search.ts:3-10`) queda `{ sectionName: string; messages: Array<{ body: string; date:
  string }> }`. `searchChatMessages` (`chat-search.ts:27-32`) deja de copiar `senderName` y
  convierte `createdAt`, en milisegundos, al campo `date` con el formato `YYYY-MM-DD HH:MM` en
  hora de Lima (`timeZone: "America/Lima"`, como `todayISO()` de BR-CB-13), que el modelo lee sin
  convertir. `createdAt` no viaja.
- *Agregado el 2026-09-25 en la revisión de la Tarea 2, pendiente de confirmación del dueño.* Los
  mensajes borrados no viajan. R-CHAT-4 de `chat` hace un borrado suave que conserva `body` y
  agrega `deleted: true`, así que sin este filtro el texto que su autor o el profesor titular borró
  llegaría a Cohere aunque la app ya lo muestre como lápida. `getRecentMessages`
  (`firebase.service.ts`) devuelve `deleted` en cada mensaje, verdadero solo si el mensaje guarda
  `deleted === true`, y `searchChatMessages` omite esos mensajes antes de agruparlos. Una sección
  cuyos mensajes leídos están todos borrados se omite como una sección sin mensajes (BR-CB-06). El
  tope de 200 se aplica a la lectura, de modo que una sección puede mandar menos de 200 mensajes.
  La regla deriva de R-CHAT-4 y de la decisión 1, y reduce lo que viaja sin cambiar ningún campo.
- **Formato del bloque.** Sigue siendo JSON, como hoy (`context-builder.ts:153-156`).
  `context-builder.ts` escribe `JSON.stringify(chatSearchResults, null, 2)` del arreglo de
  `ChatSearchResult`, sin ningún otro campo. `JSON.stringify` escapa los saltos de línea y las
  comillas del texto de terceros, así que un mensaje no puede formar una línea propia que imite
  `FIN DE LOS DATOS` ni el título de otro bloque. El ejemplo va en BR-CB-24.
- Los mensajes siguen agrupados por curso y sección (`sectionName`, que hoy es «CURSO (código)»,
  `chat-search.ts:27`), con el tope de 200 por sección de BR-CB-06.
- El filtro de secciones cumple lo que ya pide BR-CB-06, con la normalización de BR-CB-04 y el
  respaldo ordenado por nombre de curso y código de sección.
- El prompt presenta el chat como texto de usuarios, no como fuente oficial, y sin atribución
  (regla 13 de BR-CB-09).

`[@test] ../../../test/HU28_ronald/chatbot.chat-search.test.ts` *(existe; se ajusta, sin
`senderName`, con `date` en hora de Lima y sin los mensajes borrados)*
`[@test] ../../../test/HU28_ronald/chatbot.chat-deleted.test.ts` *(nueva; la lectura de
`getRecentMessages` deja pasar la marca `deleted` de R-CHAT-4)*
`[@test] ../../../test/HU28_ronald/chatbot.service.test.ts` *(existe; se ajusta para que una
pregunta de notas no llame a la búsqueda en el chat y una de avisos sí)*
`[@test] ../../../test/HU28_ronald/chatbot.context-format.test.ts` *(por escribir; el caso con
chat de BR-CB-24)*

### BR-CB-24: Formato del contexto que recibe el modelo

> *Nueva el 2026-09-25, aprobada por el dueño el 2026-09-25.* Fija el texto que arma
> `context-builder.ts` después del ajuste.

- El *preamble* es el system prompt de BR-CB-09. Los turnos previos van antes, como turnos
  (BR-CB-20). El último turno `user` es el mensaje de datos.
- El mensaje de datos abre con `DATOS DEL ALUMNO`, cierra con `FIN DE LOS DATOS` y termina con la
  pregunta. Los bloques van en este orden, y cada uno sale solo si su dominio está activo y tiene
  datos, salvo el perfil y la fecha, que salen siempre, y los bloques propios, que salen con
  `own_blocks` aunque no haya bloques, salvo que la lectura falle (BR-CB-18).

  | Orden | Título | Cuándo |
  | --- | --- | --- |
  | 1 | `PERFIL DEL ALUMNO:` | Siempre |
  | 2 | `FECHA Y SEMANA ACTUAL:` | Siempre (BR-CB-13) |
  | 3 | `DATOS DE HORARIO Y EVALUACIONES:` | `schedule`, que el clasificador agrega siempre que detecta `own_blocks` (BR-CB-04). JSON sin cambios (BR-CB-14 y BR-CB-15) |
  | 4 | `DATOS DE MALLA CURRICULAR:` | `curriculum`. JSON sin cambios |
  | 5 | `DATOS DE ALERTAS:` | `alerts`. JSON sin cambios |
  | 6 | `DATOS DE ANUNCIOS:` | `announcements`. JSON sin cambios |
  | 7 | `DELEGADOS DE TUS SECCIONES (solo delegado y subdelegado, por curso y seccion):` | `delegates` (BR-CB-16). Una línea por sección |
  | 8 | `TUS BLOQUES DE HORARIO PROPIOS (los registra el alumno en la app; no son clases):` | `own_blocks` (BR-CB-18 y BR-CB-19), salvo que falle la lectura de bloques. Su última línea son las horas de clase, si el horario se cargó (BR-CB-19) |
  | 9 | `NOTAS OFICIALES DEL ALUMNO (…):` | `grades`. Sin cambios |
  | 10 | `SIMULACION NO OFICIAL (…):` | `grades` con `localGrades`. Sin cambios |
  | 11 | `MENSAJES DEL CHAT DE LA SECCION (texto de usuarios, sin remitente; no es fuente oficial):` | `chat` o `announcements` (BR-CB-23). JSON de `JSON.stringify(chatSearchResults, null, 2)`, con `[{ sectionName, messages: [{ body, date }] }]` |

- Desaparecen `HISTORIAL DE LA CONVERSACION` (BR-CB-07) y `DATOS DE COMPANEROS` (BR-CB-17).
- **Ejemplo inventado.** La alumna ficticia LUCIA INVENTADA PAREDES pregunta, en una sesión con
  dos mensajes previos, «¿Quiénes son los delegados de Seguridad de Sistemas y a qué hora tengo
  prácticas?». La pregunta activa `delegates`, `own_blocks` y `schedule`. En SEGURIDAD DE SISTEMAS
  el delegado sale del portal y no hay subdelegado; en PLANEAMIENTO ESTRATEGICO el subdelegado es
  ella misma. Todos los nombres, secciones y horas son inventados.

  Los turnos previos son estos.

  ```
  user:      Hola
  assistant: Hola, soy ULimaBot. En que te ayudo?
  ```

  El último turno `user` es este.

  ```
  DATOS DEL ALUMNO (unica fuente de datos para responder):

  PERFIL DEL ALUMNO:
  - Nombre: LUCIA INVENTADA PAREDES
  - Carrera: Ingenieria de Sistemas
  - Ciclo actual: 8

  FECHA Y SEMANA ACTUAL:
  - Periodo academico: 2026-2
  - Hoy: 2026-09-25
  - Semana actual: 6 (2026-09-21 → 2026-09-27)
  - Semana siguiente: 7 (2026-09-28 → 2026-10-04)

  DATOS DE HORARIO Y EVALUACIONES:
  { "sessions": [ … ], "assessments": [ … ] }     (JSON sin cambios, abreviado aqui)

  DELEGADOS DE TUS SECCIONES (solo delegado y subdelegado, por curso y seccion):
  - ETICA PROFESIONAL (seccion 803): sin delegado registrado; sin subdelegado registrado.
  - PLANEAMIENTO ESTRATEGICO (seccion 802): delegado BRUNO INVENTADO SOTO; subdelegado tu (LUCIA INVENTADA PAREDES).
  - SEGURIDAD DE SISTEMAS (seccion 801): delegado ANA FICTICIA ROJAS; sin subdelegado registrado.

  TUS BLOQUES DE HORARIO PROPIOS (los registra el alumno en la app; no son clases):
  - Ventana: del lunes 2026-09-21 al domingo 2026-10-04.
  - "Prácticas en empresa": lunes y miercoles, de 14:00 a 18:00, todas las semanas, del 2026-09-01 al 2026-12-15.
    - Cambio: lunes 2026-09-28, de 15:00 a 19:30 (horario cambiado).
    - Cambio: miercoles 2026-09-30, no va (cancelado).
  - "Voluntariado": sabado, de 09:00 a 12:00, todas las semanas, empieza el 2026-10-03 y termina el 2026-11-28.
  - Horas de bloques propios por semana: semana del 2026-09-21: 8 h; semana del 2026-09-28: 7.5 h.
  - Horas de clase por semana segun tu horario: 16 h.

  FIN DE LOS DATOS

  PREGUNTA DEL ALUMNO:
  ¿Quiénes son los delegados de Seguridad de Sistemas y a qué hora tengo prácticas?
  ```

  Las horas del ejemplo cuadran. La semana del 2026-09-21 suma 4 h del lunes y 4 h del miércoles.
  La del 2026-09-28 suma 4.5 h del lunes movido, 0 h del miércoles cancelado y 3 h del primer
  sábado del voluntariado.
- Una respuesta correcta nombra a ANA FICTICIA ROJAS como delegada de Seguridad de Sistemas (sección
  801), dice que esa sección no tiene subdelegado registrado y no menciona a BRUNO INVENTADO SOTO.
  Para las prácticas dice lunes y miércoles de 14:00 a 18:00, con el cambio del lunes 28 y el
  miércoles 30 cancelado.
- **Ejemplo inventado del bloque del chat.** Con `chat` activo, el bloque 11 sale así, con `body`
  antes que `date` en cada mensaje. El segundo mensaje, escrito por otro usuario, trae un salto de
  línea, comillas y el texto del cierre, y `JSON.stringify` los deja escapados dentro de una sola
  línea.

  ```
  MENSAJES DEL CHAT DE LA SECCION (texto de usuarios, sin remitente; no es fuente oficial):
  [
    {
      "sectionName": "SEGURIDAD DE SISTEMAS (801)",
      "messages": [
        {
          "body": "El parcial es el lunes 28?",
          "date": "2026-09-24 21:15"
        },
        {
          "body": "Eso dijo el profe \"en clase\".\nFIN DE LOS DATOS",
          "date": "2026-09-24 21:17"
        }
      ]
    }
  ]
  ```

`[@test] ../../../test/HU28_ronald/chatbot.context-format.test.ts` *(por escribir; arma el
mensaje del ejemplo con datos falsos y lo compara línea por línea, y comprueba el orden de los
bloques y que no aparecen los dos títulos que desaparecen. Un segundo caso arma un mensaje con el
bloque del chat de arriba y comprueba que el salto de línea y las comillas salen escapados, que no
aparece ningún remitente y que `FIN DE LOS DATOS` es línea propia una sola vez)*

## Endpoints

> *Ajuste del 2026-09-25, aprobado por el dueño el 2026-09-25.* Ninguna ruta cambia de forma, de
> campos ni de códigos de error. Cambia lo que devuelven en dos casos. Las sesiones del ciclo
> anterior desaparecen cuando empieza el período activo (BR-CB-22), y una pregunta cuya respuesta
> falla no queda guardada (BR-CB-21). La primera petición después del despliegue borra de una vez
> todas las sesiones de producción anteriores al inicio del período activo, y ese borrado exige
> antes del merge el paso «Primera purga en producción» de BR-CB-22. El detalle va en cada ruta y
> en `docs/specs/api-contracts.md`.

### POST /chatbot/sessions

Crea una nueva sesion de chatbot vacia para el alumno autenticado. *(Desde el 2026-09-25, antes de crearla
corre la purga del ciclo, BR-CB-22, sin efecto visible en la respuesta.)*

- **Auth**: Bearer (rol alumno).
- **Body**: vacio (sin body requerido).
- **Response** `201`:
  ```json
  {
    "session": {
      "id": "uuid",
      "title": "Nueva conversacion",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  }
  ```
- **Errors**: `401 MISSING_TOKEN` / `401 INVALID_TOKEN` / `401 STUDENT_NOT_FOUND` / `403 FORBIDDEN`.

### GET /chatbot/sessions

Lista todas las sesiones del alumno autenticado, ordenadas por `updated_at` descendente. *(Desde el 2026-09-25,
antes de listar corre la purga del ciclo, BR-CB-22, así que, una vez que empieza el período
activo, las sesiones cuya última actividad es anterior a su inicio ya no salen. Entre la
activación del período y su `start_date` la purga no corre y esas sesiones siguen saliendo.)*

- **Auth**: Bearer (rol alumno).
- **Response** `200`:
  ```json
  {
    "sessions": [
      {
        "id": "uuid",
        "title": "Consulta sobre notas y horario",
        "createdAt": "ISO-8601",
        "updatedAt": "ISO-8601"
      }
    ]
  }
  ```
- **Errors**: `401` / `403 FORBIDDEN`.

### GET /chatbot/sessions/:id

Obtiene una sesion con todos sus mensajes.

- **Auth**: Bearer (rol alumno).
- **Response** `200`:
  ```json
  {
    "session": {
      "id": "uuid",
      "title": "Consulta sobre notas y horario",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    },
    "messages": [
      { "id": "uuid", "role": "user", "content": "Cual es mi promedio?", "createdAt": "ISO-8601" },
      { "id": "uuid", "role": "assistant", "content": "Tu promedio general es 15.3.", "createdAt": "ISO-8601" }
    ]
  }
  ```
- **Errors**: `404 SESSION_NOT_FOUND` (no existe o no pertenece al alumno). *(Desde el 2026-09-25,
  también una sesión del ciclo anterior, que la purga de BR-CB-22 borra antes de buscarla.)*
- *2026-09-25.* `messages` trae la sesión entera, sin el límite de 10 de BR-CB-20, y ya no puede
  traer una pregunta sin respuesta creada después del ajuste (BR-CB-21).

### DELETE /chatbot/sessions/:id

Elimina una sesion y todos sus mensajes en cascada.

- **Auth**: Bearer (rol alumno).
- **Response** `200`:
  ```json
  { "message": "Sesion eliminada correctamente." }
  ```
- **Errors**: `404 SESSION_NOT_FOUND` (no existe o no pertenece al alumno).

### POST /chatbot/sessions/:id/ask

Envia una pregunta dentro de una sesion existente y obtiene una respuesta del chatbot.

- **Auth**: Bearer (rol alumno).
- **Body**:
  ```json
  {
    "question": "Cual es mi promedio en Soft II?",
    "localGrades": [
      {
        "id": "sectionId",
        "nombre": "INGENIERIA DE SOFTWARE II",
        "notas": [
          { "titulo": "Parcial 1", "peso": 30, "valor": 16.0 }
        ]
      }
    ]
  }
  ```
  - `question`: string, max 500 caracteres, requerido.
  - `localGrades`: array opcional. Solo se envia si el alumno tiene notas guardadas localmente.
- **Response** `200`:
  ```json
  {
    "answer": "En INGENIERIA DE SOFTWARE II tienes 16.0 en el Parcial 1. Solo tienes una nota registrada de 30% de peso, asi que tu promedio actual en ese curso es 16.0.",
    "sessionId": "uuid"
  }
  ```
- **Errors**:
  - `400 INVALID_QUESTION`: pregunta vacia, excede 500 chars, o contiene prompt injection.
  - `404 SESSION_NOT_FOUND`: sesion no existe o no pertenece al alumno. *(Desde el 2026-09-25,
    también una sesión del ciclo anterior, BR-CB-22, o una que el alumno borró mientras esperaba la
    respuesta, BR-CB-21.)*
  - `429 RATE_LIMITED`: excedio el limite de preguntas por hora.
  - `503 CHATBOT_UNAVAILABLE`: Cohere no disponible (timeout, error 429 de Cohere, error 500).
    *(Desde el 2026-09-25 no se guarda ni la pregunta ni la respuesta, BR-CB-21.)*

## Base de Datos

### Cambio del 2026-09-25: índice del historial (migración `0013`, aprobada por el dueño el 2026-09-25)

> Cambio de base de datos que exige la aprobación explícita del dueño según `AGENTS.md`, aparte de
> la aprobación de la spec. Lo aplica el dueño a mano con `bun run db:apply`, con respaldo previo y
> antes del merge del código que lo usa, según `MIGRATIONS.md`. No con `db:generate` ni
> `db:migrate`, porque el registro de Drizzle sigue desalineado desde la `0010`. Una vez aplicada,
> la `0013` se registra en «Migraciones aplicadas / reconciliaciones» de `MIGRATIONS.md`, con su
> fecha, su respaldo previo y su verificación, como la `0012`.

La migración `drizzle/0013_chatbot_message_history.sql` es aditiva e idempotente y crea un solo
índice.

```sql
CREATE INDEX IF NOT EXISTS "idx_chatbot_message_session_created"
  ON "chatbot_message" ("session_id", "created_at");
```

- En `src/db/schema/schema.ts`, `chatbotMessage` (`schema.ts:624-632`) declara el mismo índice.
- `idx_chatbot_message_session` queda redundante, porque el índice nuevo empieza por `session_id`,
  pero no se borra en esta migración, que solo agrega. Borrarlo es un cambio aparte.
- La retención de BR-CB-22 **no** necesita migración ni cron, y sus razones están en ese
  requisito. Su primera ejecución en producción sí borra datos vivos y sigue el paso de «Primera
  purga en producción», con conteo en solo lectura, respaldo y aprobación del dueño antes del
  merge, registrados también en `MIGRATIONS.md`.
- El `CHECK (role IN ('user', 'assistant'))` del bloque de abajo no existe en la base viva
  (`drizzle/0003_spicy_ironclad.sql` no lo crea). Este ajuste no lo agrega.

### Nuevas tablas (migracion requerida)

```sql
CREATE TABLE chatbot_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL DEFAULT 'Nueva conversacion',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE chatbot_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chatbot_session(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatbot_session_student ON chatbot_session(student_id);
CREATE INDEX idx_chatbot_message_session ON chatbot_message(session_id);
```

### Variables de entorno nuevas

```env
COHERE_API_KEY=         # API key de Cohere (requerida)
CHATBOT_RATE_LIMIT=20   # Preguntas por alumno por hora (opcional, default 20)
```

## Arquitectura

- Capas `routes -> controller -> service -> repository` (modulo canonico).
- `chatbot.service.ts` es el orquestador central: recibe pregunta + localGrades + sesion, coordina clasificacion, recoleccion de datos y llamada a Cohere.
- ~~`cohere.client.ts` (nuevo en `src/services/`): singleton que encapsula las APIs de Cohere (Chat, Classify, Rerank, Generate para titulos). Usa el SDK oficial `cohere-ai` o llamadas HTTP directas. Recibe `COHERE_API_KEY` via config.~~ *Reemplazado el 2026-09-25 (ver el ajuste de abajo).* El chatbot usa de `cohere.client.ts` solo Chat, para la respuesta y el título. Classify sale (BR-CB-04) y Rerank no se usa (BR-CB-06).
- `firebase.service.ts`: se agrega metodo `getRecentMessages(sectionId, limit, since?)` que lee mensajes de `sections/{sectionId}/messages` desde Firebase RTDB.
- ~~`intent-classifier.ts`: logica pura de clasificacion (Cohere Classify + keyword fallback), sin dependencias de BD.~~ *Reemplazado el 2026-09-25.* Solo palabras clave normalizadas, sin Cohere (BR-CB-04).
- ~~`chat-search.ts`: busca mensajes relevantes combinando Firebase RTDB + Cohere Rerank.~~ *Reemplazado el 2026-09-25.* Lee Firebase RTDB de las secciones filtradas, sin Rerank y sin remitentes (BR-CB-06 y BR-CB-23).
- ~~`context-builder.ts`: logica pura que arma el string de contexto a partir de intents + datos + historial + localGrades + system prompt.~~ *Reemplazado el 2026-09-25.* Arma el mensaje de datos sin el historial, que viaja como turnos (BR-CB-07, BR-CB-20 y BR-CB-24).
- `rate-limit.ts`: middleware reutilizable que trackea conteo de requests por `studentId` en memoria.
- *Ajuste del 2026-09-25, aprobado por el dueño el 2026-09-25.*
  - `intent-classifier.ts` queda como lógica pura de palabras clave normalizadas, sin Cohere
    (BR-CB-04). `cohere.client.ts` pierde `classify`.
  - `chatbot.repository.ts` pierde `getClassmates` y gana `getSectionRepresentatives`
    (BR-CB-16), `getRecentMessages` (BR-CB-20), `saveExchange` (BR-CB-21) y
    `purgeSessionsBeforeActivePeriod` (BR-CB-22).
  - `ChatbotService` recibe por constructor la función `readOwnTimeBlocksForAssistant` del módulo
    `time-blocks` (BR-CB-18), además de `scheduleService`. `chatbot/index.ts` es el único archivo
    del módulo que la importa como valor, desde `../time-blocks/index.js`. Los demás, si la
    nombran, la importan con una declaración `import type { … }` (RS-BE-35).
  - `context-builder.ts` deja de recibir el historial y arma el formato de BR-CB-24, con el
    resumen de bloques de BR-CB-18 y el total de horas de clase de BR-CB-19 como funciones puras.
  - `chat-search.ts` deja de devolver `senderName` y normaliza como BR-CB-04 (BR-CB-23).

## Fuera de alcance

- NO se usa pgvector ni se almacenan embeddings en PostgreSQL.
- NO se usa streaming (Server-Sent Events). Las respuestas son one-shot.
- NO se usa Cohere Chat con tool-use (agents). Es llamada simple con contexto.
- NO se indexan ni se persisten embeddings de mensajes de chat.
- NO se modifica el esquema de Firebase RTDB.
- *Agregado el 2026-09-25.* NO se mueve el historial a Firebase. Sigue en PostgreSQL (decisión 3).
- *Agregado el 2026-09-25.* NO se clasifica con ningún endpoint de Cohere. Si más adelante se
  quiere volver a Cohere, hace falta un endpoint vigente y otra revisión de esta spec.
- *Agregado el 2026-09-25.* NO se mandan nombres de compañeros que no sean delegado o subdelegado
  en ningún campo que arme el chatbot, ni remitentes del chat (BR-CB-17 y BR-CB-23). Quedan los
  dos residuos de texto libre de BR-CB-17, pendientes de que el dueño los acepte.
- *Agregado el 2026-09-25.* NO se leen el récord académico (RS-BE-28 de `academic-record`, sin
  cambios) ni los bloques de otro alumno.
- *Agregado el 2026-09-25.* NO se distingue teoría de práctica en el horario, porque
  `schedule_session` no lo guarda.
- *Agregado el 2026-09-25.* NO se agrega cron de Vercel ni columna de estado a `chatbot_message`.

## Test Links

- Clasificacion de intencion (keyword fallback): `[@test] ../../../test/chatbot.intent-classifier.test.ts`
- Construccion de contexto: `[@test] ../../../test/chatbot.context-builder.test.ts`
- Busqueda en chat (filterSections + token match): `[@test] ../../../test/chatbot.chat-search.test.ts`
- Queries de repositorio: `[@test] ../../../test/chatbot/chatbot.repository.test.ts`
- Orquestacion del servicio: `[@test] ../../../test/chatbot/chatbot.service.test.ts`
- Validacion Zod y controller: `[@test] ../../../test/chatbot/chatbot.controller.test.ts`
- Rate limit middleware: `[@test] ../../../test/shared/rate-limit.test.ts`
- Firebase service getRecentMessages: `[@test] ../../../test/services/firebase.service.test.ts`

*Nota del 2026-09-25.* Las rutas de arriba son las de la versión original y varias no existen;
las pruebas del chatbot viven hoy en `test/HU28_ronald/`. Cada requisito del ajuste lleva su
`[@test]` junto al texto, y las que dicen «por escribir» todavía no existen. El aislamiento del
récord, sin cambios, sigue en `[@test] ../../../test/HU34_jeff/chatbot-isolation.test.ts`, y el
acceso acotado a los bloques propios, en
`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts` *(existe; se ajusta, ver
RS-BE-35 de `time-blocks`)*.
