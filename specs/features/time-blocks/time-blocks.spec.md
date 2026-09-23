---
name: Time Blocks
description: Bloques de horario que el propio alumno registra (prácticas, trabajo), con repetición semanal, excepciones por día y suma de horas semanales
targets:
  - ../../../src/modules/time-blocks/**
  - ../../../src/modules/index.ts
  - ../../../src/server.ts
  - ../../../src/modules/schedule/schedule.service.ts
  - ../../../src/modules/schedule/schedule.types.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/0012_time_blocks.sql
---

# Bloques de horario propios

> Estado: **APROBADA** por el dueño del proyecto, incluido el cambio de base de datos que exige
> `AGENTS.md`. Diseñada con él sección por sección. Aprobó los planes el 2026-09-22 y confirmó esta spec de forma explícita el 2026-09-23.
> Revisada el 2026-09-21 con las decisiones de la planificación: `PATCH` en el CORS, tope de
> 20 bloques guardados, semanas enteras en `weeks` y la fecha exacta del horario (RS-BE-36).
> Ajustada el 2026-09-23 con el arreglo del bloque sin días reales y la lista Mis bloques, aprobado por el dueño ese día.
> Contraparte de frontend: `ULima_Frontend_IS2/specs/features/time-blocks/time-blocks.spec.md`.

## El problema

El horario del alumno solo muestra lo que baja del portal: sus clases. La mitad de su
semana —prácticas preprofesionales, trabajo, voluntariado— no está en ninguna parte, así
que la app no sirve para responder "¿cuándo tengo libre?" ni "¿cuántas horas a la semana
le estoy metiendo a las prácticas?".

Hoy el módulo `schedule` es de **solo lectura**: no existe ningún endpoint donde el alumno
escriba nada de su horario. Esta funcionalidad es el primero.

## User Stories

- Como alumno, quiero registrar mis prácticas en mi horario, con su nombre, su color y sus
  días, para ver mi semana completa en un solo lugar.
- Como alumno, quiero corregir una semana suelta —el día que no fui, el día que entré más
  tarde— sin deshacer el patrón de todas las demás.
- Como alumno, quiero saber cuántas horas a la semana me llevan mis bloques.

## Requisitos

### RS-BE-30 — Modelo de datos

Dos tablas nuevas, sin relación con curso, sección, ciclo ni matrícula. El precedente más
cercano del repo es `course_advising_session` (`schema.ts:480-517`), que ya mezcla día de
la semana con fecha concreta; de ahí se copia el estilo, no el esquema.

- **`student_time_block`** guarda la regla: título, color, días de la semana, hora de
  inicio y fin, y el rango de fechas en que vale.
- **`student_time_block_exception`** guarda lo que se sale de la regla: una fila por fecha,
  con estado `cancelled` (ese día no va) o `moved` (ese día tiene otras horas).

Detalle en "Modelo de datos".

`[@test] ../../../test/HU35_jeff/migration-0012.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.postgres.test.ts`

### RS-BE-31 — La regla: crear, editar y borrar

`POST`, `PATCH` y `DELETE` sobre los bloques del alumno. El alumno sale **solo del token**
(`authMiddleware` + `requireRole(...STUDENT_ROLES)`), como en `academic-record`: no hay
parámetro de alumno ni ruta para docentes o delegados. Un bloque de otro alumno responde
igual que uno que no existe (`TIME_BLOCK_NOT_FOUND`, 404), para no confirmar que ese id existe.

Validación con Zod. Las reglas de una sola fila se repiten además como CHECK en la base
(ver "Modelo de datos"); el rango de años, que el rango de fechas traiga alguno de los días
marcados y el tope de bloques los hace cumplir solo el servidor.

- `title`: 1 a 60 caracteres, sin espacios al borde.
- `colorHex`: `^#[0-9A-Fa-f]{6}$`.
- `daysOfWeek`: entre 1 y 7 valores distintos, cada uno de 1 a 7, con la **misma convención
  que `schedule_session.day_of_week`**: **1 es lunes y 7 es domingo**, que es como lo
  traduce hoy `schedule.service.ts:171` (`["Lunes", … , "Domingo"][day - 1]`) y lo exige
  `chk_schedule_session_day BETWEEN 1 AND 7`.
- `startTime` y `endTime`: `HH:MM` en hora de Lima, `endTime` estrictamente mayor.
- Ambas horas dentro de **07:00–22:00**, el rango que la grilla del horario puede pintar
  (`horario.dart:21-22`). Un bloque fuera de ese rango sería invisible en la app, así que
  se rechaza con `TIME_BLOCK_OUT_OF_GRID` en vez de guardarse.
- `startDate` y `endDate`: fechas planas (`YYYY-MM-DD`) que existen en el calendario
  (`2026-02-30` no), entre **2000-01-01 y 2099-12-31**, con `endDate >= startDate`. El tope
  de años no es de negocio: Postgres acepta fechas mucho más lejanas, pero pasado el
  9999-12-31 una fecha ya no cabe en `YYYY-MM-DD` y la expansión de RS-BE-33 se rompería.
  Un horario de prácticas no necesita otro siglo.
- El rango [`startDate`, `endDate`] tiene que contener **al menos una fecha cuyo día de la
  semana esté en `daysOfWeek`**. Si no la contiene, el servidor responde
  `400 INVALID_REQUEST_BODY` con el mensaje "Entre esas fechas no cae ninguno de los días
  que marcaste." en `details.fieldErrors.endDate`, el mismo texto que muestra la app. La
  regla existe porque un bloque así se guarda pero nunca ocurre. Con martes y sábado del
  miércoles 2026-09-23 al mismo miércoles, la expansión de RS-BE-33 no genera ninguna fecha,
  la grilla no pinta el bloque y, sin una lista aparte, la app no tiene desde dónde editarlo
  ni borrarlo. Vale para `POST` y para `PATCH`, que comparten el esquema. La cuenta es la
  misma que usa la expansión para decidir si una fecha cae en el patrón (`dayOfWeekOf` de
  `time-blocks.logic.ts`), así que un bloque válido tiene al menos una ocurrencia, y un rango
  de siete días o más siempre cumple. La regla solo se evalúa cuando las fechas y los días
  ya cumplen su propia validación y `endDate >= startDate`, de modo que una fecha inválida,
  unos días fuera de 1 a 7 o unas fechas al revés producen su propio error y no suman este.
- Un campo con mal formato, o una regla que cruza dos campos (horas invertidas, fechas al
  revés, días repetidos, un rango sin ninguno de los días marcados), es un
  `400 INVALID_REQUEST_BODY` con el campo en `details.fieldErrors`, sin código propio:
  `TIME_BLOCK_OUT_OF_GRID` es solo de la grilla.
- Máximo **20 bloques guardados** por alumno, **vencidos incluidos**
  (`TIME_BLOCK_LIMIT_REACHED`). No es una regla de negocio: es un tope para que una ventana
  de ocurrencias no crezca sin control. Cuenta todos los guardados y no solo los vigentes
  porque el borrado es físico y un bloque vencido se sigue expandiendo en una ventana pasada:
  contarlo es lo que acota la expansión. El mensaje del error lo dice así y sugiere borrar un
  bloque viejo para crear otro.

`PATCH` reemplaza la regla entera y **conserva las excepciones**: si el alumno mueve el
patrón de 14:00 a 15:00, el día que ya había cancelado sigue cancelado. Editar la regla es
"cambiar todas las semanas"; tocar un día suelto es RS-BE-32. Una excepción que por el
cambio queda fuera del rango o de los días del bloque sigue guardada, la expansión la
ignora, y se limpia con el `DELETE` de RS-BE-32.

`PATCH /time-blocks/me/:id` es la primera ruta `PATCH` del backend, así que `src/server.ts`
agrega ese verbo a `allowMethods` del CORS. La app nativa no hace preflight, pero la build
web sí: sin `PATCH` ahí, el navegador cortaría la edición de un bloque antes de llegar al
servidor.

`DELETE` borra el bloque y sus excepciones en cascada.

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.service.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.repository.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.postgres.test.ts`

### RS-BE-32 — Excepciones: un día suelto

`PUT /time-blocks/me/:id/occurrences/:date` fija la excepción de esa fecha:

- `{ "status": "cancelled" }` — ese día no va. Se guarda y vuelve con `startTime` y
  `endTime` en `null`; si el body trae horas, se ignoran.
- `{ "status": "moved", "startTime": "15:00", "endTime": "19:30" }` — ese día tiene otras
  horas, con las mismas validaciones de RS-BE-31 (rango 07:00–22:00 incluido).

Responde la excepción con la misma forma que tiene dentro de su bloque en
`GET /time-blocks/me`, sin `blockId`, que ya va en la ruta:
`{ "exception": { date, status, startTime, endTime } }`.

La fecha del `PUT` tiene que caer **dentro del rango del bloque y en uno de sus días de la
semana**; si no, `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`. Una excepción sobre un día que el
patrón no genera no significa nada y solo ensucia la tabla.

`DELETE /time-blocks/me/:id/occurrences/:date` quita la excepción: ese día vuelve al patrón.
No exige que la fecha esté en el patrón, para poder limpiar la que quedó fuera después de
un `PATCH` (RS-BE-31), y si ese día no tenía excepción responde igual.

Es idempotente: repetir el mismo `PUT` deja el mismo estado (`on conflict do update`).

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.service.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.postgres.test.ts`

### RS-BE-33 — Ocurrencias de una ventana

`GET /time-blocks/me/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD` devuelve los bloques ya
concretos de esa ventana: el servidor expande la regla día por día y aplica las excepciones.

- Un día `cancelled` no aparece. La app pinta los días cancelados a partir de las
  excepciones que ya trae `GET /time-blocks/me`; esta ruta no los manda.
- Un día `moved` aparece con sus horas nuevas y `moved: true`.
- Las ocurrencias salen ordenadas por fecha, por hora de inicio y, si empatan, por `blockId`.
- La ventana es **obligatoria**, incluye sus dos extremos, `to` no puede ser anterior a
  `from` (`400 INVALID_QUERY_PARAMS`) y cubre **120 días como máximo**
  (`TIME_BLOCK_WINDOW_TOO_WIDE`). Sin tope, un rango de años expandiría cientos de miles de
  filas en memoria.

La expansión es una **función pura** (`time-blocks.logic.ts`), sin base de datos: recibe las
reglas, las excepciones y la ventana, y devuelve las ocurrencias. Ahí viven las pruebas de
los casos que se rompen solos: bloque que empieza a mitad de semana, rango que termina un
martes, día cancelado, día movido, excepción fuera del patrón, y una ventana que no toca el
rango del bloque.

`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`

### RS-BE-34 — Horas por semana

La misma respuesta de RS-BE-33 trae `weeks`: una entrada por cada semana entre el lunes de
`from` y el lunes de `to`, en orden, cada una con su lunes (`weekStart`, que puede ser
anterior a `from`) y el total de horas de los bloques del alumno en esa semana.

- El total es el de la semana **entera**, de lunes a domingo, aunque la ventana la corte: una
  ventana que empieza un miércoles suma también el lunes de esa semana, que no sale en
  `occurrences`.
- Una semana sin nada sale con `hours: 0`. Es un total conocido, no un dato que falta, así
  que no va en `null`.
- Se suma sobre las **ocurrencias**, no sobre la regla: un día cancelado no suma, y un día
  movido suma su duración nueva.
- Las semanas van de **lunes a domingo**, en hora de Lima.
- El total se expresa en horas decimales (1.5 = una hora y media), sin redondear.
- Solo suman los bloques propios, nunca las clases.

También es función pura y se prueba aparte.

`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`

### RS-BE-35 — Nada de esto lo ve el chatbot

El chatbot manda su contexto a un proveedor externo. Dónde trabaja un alumno y a qué hora
sale no tiene por qué salir de la app: ni `chatbot.repository.ts` ni `chatbot.service.ts`
leen `student_time_block` ni `student_time_block_exception`, ni importan el módulo
`time-blocks`. Una prueba lo fija, igual que en `academic-record` (RS-BE-28).

`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts`

### RS-BE-36 — La fecha exacta de cada día del horario

`GET /schedule/me/sessions` manda en `days` siete días por cada semana del ciclo, con
`dateText` en español y sin año ("1 de Enero"). Para pedir las ocurrencias del ciclo
visible y ubicar cada una en su día, la app necesita la fecha exacta, y sacarla de
`dateText` la obligaba a adivinar el año y a leer los meses en español.

Cada elemento de `days` gana `isoDate`: la fecha de ese día como `"YYYY-MM-DD"`, en hora de
Lima, calculada en `schedule.service.ts` con la misma fecha de la que sale `dateText`. Vale
`null` cuando el ciclo no tiene semanas, que es el mismo caso en que `dateText` llega `""`.

- Es **aditivo**: ningún campo de la respuesta cambia de nombre, de tipo ni de valor.
- El horario docente (`GET /schedule/teacher/sessions`) arma sus días con el mismo tipo
  `DayInfo` y también lo trae.
- Los bloques siguen sin mezclarse en esa respuesta (ver "Qué NO entra"): lo único que
  cambia es que cada día dice su fecha.

`[@test] ../../../test/HU35_jeff/schedule-iso-date.test.ts`

## Modelo de datos (migración `0012_time_blocks.sql`)

Aditiva e idempotente (`IF NOT EXISTS`), aplicada a mano con `bun run db:apply` antes del
merge, con respaldo previo, según `MIGRATIONS.md`. **No** con `db:generate`: el registro de
Drizzle está desalineado desde la `0010`.

| tabla | clave | columnas |
|:---|:---|:---|
| `student_time_block` | PK `id`; IDX por `student_id` | `student_id` FK → `student` ON DELETE CASCADE, `title` varchar(60) NOT NULL, `color_hex` varchar(7) NOT NULL, `days_of_week` smallint[] NOT NULL, `start_time` time NOT NULL, `end_time` time NOT NULL, `start_date` date NOT NULL, `end_date` date NOT NULL, `created_at` timestamptz NOT NULL default now(), `updated_at` timestamptz NOT NULL default now() |
| `student_time_block_exception` | PK `id`; UQ `(block_id, occurrence_date)` | `block_id` FK → `student_time_block` ON DELETE CASCADE, `occurrence_date` date NOT NULL, `status` enum `time_block_exception_status` (`cancelled`, `moved`), `start_time` time null, `end_time` time null |

CHECK de `student_time_block`:

- `chk_time_block_horas`: `end_time > start_time`
- `chk_time_block_grilla`: `start_time >= '07:00' and end_time <= '22:00'`
- `chk_time_block_fechas`: `end_date >= start_date`
- `chk_time_block_dias`: `coalesce(array_length(days_of_week, 1), 0) between 1 and 7` y
  `days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]`. El `coalesce` no es adorno:
  `array_length` de un arreglo vacío (`'{}'`) es `NULL`, y un CHECK que evalúa a `NULL` se
  da por cumplido, así que sin él un `days_of_week` vacío entraría a la tabla.
- `chk_time_block_color`: `color_hex ~ '^#[0-9A-Fa-f]{6}$'`
- `chk_time_block_titulo`: `length(btrim(title)) between 1 and 60`

CHECK de `student_time_block_exception`:

- `chk_time_block_exc_movido`: `(status = 'cancelled' and start_time is null and end_time is null)`
  `or (status = 'moved' and start_time is not null and end_time is not null and end_time > start_time)`
- `chk_time_block_exc_grilla`: `start_time is null or (start_time >= '07:00' and end_time <= '22:00')`

Por qué CHECK y no solo Zod: estas tablas las escribe el propio alumno, y un valor imposible
—hora de fin antes de la de inicio, color inventado— haría que la grilla pinte basura o no
pinte nada. A diferencia del récord, acá **sí** conviene que la base rechace: el dato no
viene de un portal que no controlamos, viene de un formulario que sí controlamos, y un
rechazo es un error del alumno, no una importación entera perdida.

`days_of_week` como arreglo y no como tabla hija: la expansión ocurre en código, nunca se
consulta "qué bloques caen el martes" desde SQL, y un arreglo evita una tabla de dos
columnas y sus joins. **Ojo al escribirlo**: la plantilla `sql` de Drizzle expande un
arreglo JS como constructor de fila (error 42809); va como `${JSON.stringify(dias)}::json`
y se convierte en el SQL, siguiendo el patrón que ya usa `portal-sync.repository.ts`.

## Contrato

```
Todas las rutas de /time-blocks: Bearer, roles de alumno, alumno tomado del token.

GET /time-blocks/me
200 → { "blocks": [ {
  "id": 12, "title": "Prácticas", "colorHex": "#F94B3F",
  "daysOfWeek": [1, 3], "startTime": "14:00", "endTime": "18:00",
  "startDate": "2026-09-01", "endDate": "2026-12-15",
  "exceptions": [ { "date": "2026-10-07", "status": "cancelled",
                    "startTime": null, "endTime": null },
                  { "date": "2026-10-12", "status": "moved",
                    "startTime": "15:00", "endTime": "19:30" } ]
} ] }

POST /time-blocks/me
body: { title, colorHex, daysOfWeek, startTime, endTime, startDate, endDate }
201 → { "block": { …como arriba, exceptions: [] } }

PATCH /time-blocks/me/:id      body: los mismos campos → 200 { "block": … }
DELETE /time-blocks/me/:id     → 200 { "ok": true }

PUT /time-blocks/me/:id/occurrences/:date
body: { "status": "cancelled" } | { "status": "moved", "startTime": "15:00", "endTime": "19:30" }
200 → { "exception": { "date": "2026-10-12", "status": "moved",
                       "startTime": "15:00", "endTime": "19:30" } }
      con "cancelled", las dos horas en null:
      { "exception": { "date": "2026-10-07", "status": "cancelled",
                       "startTime": null, "endTime": null } }

DELETE /time-blocks/me/:id/occurrences/:date  → 200 { "ok": true }

GET /time-blocks/me/occurrences?from=2026-10-05&to=2026-10-18
200 → {
  "occurrences": [
    { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F", "date": "2026-10-05",
      "dayOfWeek": 1, "startTime": "14:00", "endTime": "18:00", "moved": false },
    { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F", "date": "2026-10-12",
      "dayOfWeek": 1, "startTime": "15:00", "endTime": "19:30", "moved": true },
    { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F", "date": "2026-10-14",
      "dayOfWeek": 3, "startTime": "14:00", "endTime": "18:00", "moved": false } ],
  "weeks": [ { "weekStart": "2026-10-05", "hours": 4 },
             { "weekStart": "2026-10-12", "hours": 8.5 } ]
}

GET /schedule/me/sessions      (ya existe; RS-BE-36 solo agrega isoDate a cada día)
200 → { "days": [ { "dayName": "Lunes", "dateText": "5 de Octubre",
                    "weekText": "Semana 7 del ciclo", "isoDate": "2026-10-05" }, … ],
        "secciones": [ …sin cambios… ] }
```

- El ejemplo de ocurrencias sale del bloque y las excepciones de `GET /time-blocks/me`: el
  miércoles 2026-10-07 está cancelado y no aparece, el lunes 2026-10-12 está movido. La
  primera semana suma 4 horas y la segunda 4.5 + 4 = 8.5.
- Las horas viajan como `"HH:MM"` y las fechas como `"YYYY-MM-DD"`, siempre en hora de Lima
  y sin zona horaria pegada: son horas de pared, no instantes.
- Los numéricos salen como `number` JSON (`hours` puede traer decimal); un campo sin dato
  es `null`, nunca 0: las horas de una excepción `cancelled`, o `isoDate` de un ciclo sin
  semanas. El `hours: 0` de una semana sin bloques no es un dato que falta, es un total
  conocido (RS-BE-34).
- Códigos de error: `TIME_BLOCK_NOT_FOUND` (404, también para el bloque de otro alumno),
  `TIME_BLOCK_OUT_OF_GRID`, `TIME_BLOCK_LIMIT_REACHED`, `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`,
  `TIME_BLOCK_WINDOW_TOO_WIDE` (400); los 400 de validación de siempre (`INVALID_JSON_BODY`,
  `INVALID_REQUEST_BODY`, `INVALID_QUERY_PARAMS`, `INVALID_ROUTE_PARAMS`); más los 401/403
  del middleware.
- Los ejemplos usan datos inventados. Ningún fixture de las pruebas lleva datos reales.

## Cambios en otras specs

- `docs/specs/api-contracts.md`: las siete rutas nuevas, y `isoDate` en los días de
  `GET /schedule/me/sessions` (RS-BE-36).
- `docs/specs/feature-index.md`: la funcionalidad nueva.
- `specs/features/schedule/schedule.spec.md`: una nota de que el horario del alumno ya no es
  solo lo que baja del portal y de que los bloques propios viajan por su propia ruta, y el
  campo `isoDate` de `days` (RS-BE-36).

## Qué NO entra

- **Mezclar los bloques en `GET /schedule/me/sessions`.** Van por su propia ruta. Si
  entraran en la respuesta del horario, la app —que reparte una paleta de doce colores entre
  las secciones— le asignaría a los bloques un color de esa paleta y los cursos del portal
  cambiarían de color al crear un bloque.
- **Repeticiones más ricas**: "cada dos semanas", "el último viernes del mes", "todos los
  días del mes". Solo hay repetición semanal en los días marcados.
- **Recordatorios, notificaciones o compartir el bloque con nadie.**
- **Detectar el choque con las clases en el servidor.** Lo avisa la app antes de guardar,
  con los datos del horario que ya tiene en pantalla (RF-BLQ-3 del frontend).
- **Bloques fuera de 07:00–22:00.** La grilla no los puede pintar; se rechazan.
- **Tocar el horario del portal.** Un bloque propio nunca modifica `schedule_session`,
  `enrollment` ni el progreso de malla.

## Decisiones

| # | Decisión | Elegida | Descartadas |
|:---|:---|:---|:---|
| 1 | Dónde viven los bloques | En el servidor | Solo en el teléfono (se pierden al cambiar de dispositivo y no conviven con el horario del portal) |
| 2 | Repetición | Patrón semanal + excepciones por día | Solo patrón fijo (no deja corregir una semana); solo ocurrencias sueltas (cientos de filas y editar "todas" se vuelve inviable) |
| 3 | Quién expande la repetición | El servidor, y manda ocurrencias | La app (duplica la lógica de fechas donde menos pruebas hay); una fila por día en la base |
| 4 | Qué suman las horas semanales | Solo los bloques propios | Bloques + clases; los dos por separado |
| 5 | Vigencia | Fechas propias, sin atarse al ciclo | Morir con el ciclo; sin fecha de fin |
| 6 | Choque con una clase | Se avisa y se deja guardar | Impedirlo; no avisar |
| 7 | Rango de la grilla | Se mantiene 07:00–22:00 y se rechaza lo que no entra | Estirar la grilla (aplasta las horas en pantallas chicas); rango dinámico por día |
| 8 | Qué cuenta el tope de 20 | Todos los bloques guardados, vencidos incluidos | Solo los vigentes (un bloque vencido se sigue expandiendo en una ventana pasada, y el tope habría que revisarlo también en el `PATCH` que lo reactiva) |
| 9 | Semanas de `weeks` | La semana entera de lunes a domingo, una por cada lunes entre `from` y `to`, con 0 si no hay nada | Solo lo que cae dentro de la ventana (la primera y la última semana saldrían cortas); omitir las semanas vacías |
| 10 | `PATCH` desde un navegador | Agregar `PATCH` al CORS de `src/server.ts` | Pasar la edición a `PUT`; dejar la build web sin editar bloques |
| 11 | Cómo sabe la app la fecha de cada día | `isoDate` en cada día de `GET /schedule/me/sessions` | Leerla de `dateText` en español (no trae año y se rompe en un ciclo que cruza de diciembre a enero); una ruta aparte solo para las fechas |
