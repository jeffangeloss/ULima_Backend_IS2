---
name: Time Blocks
description: Bloques de horario que el propio alumno registra (prácticas, trabajo), con repetición semanal, excepciones por día y suma de horas semanales
targets:
  - ../../../src/modules/time-blocks/**
  - ../../../src/modules/index.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/0012_time_blocks.sql
---

# Bloques de horario propios

> Estado: **diseñada con el dueño del proyecto el 2026-09-20**, sección por sección.
> Pendiente de su aprobación de esta spec escrita antes de planificar.
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
cercano del repo es `course_advising_session` (`schema.ts:417-454`), que ya mezcla día de
la semana con fecha concreta; de ahí se copia el estilo, no el esquema.

- **`student_time_block`** guarda la regla: título, color, días de la semana, hora de
  inicio y fin, y el rango de fechas en que vale.
- **`student_time_block_exception`** guarda lo que se sale de la regla: una fila por fecha,
  con estado `cancelled` (ese día no va) o `moved` (ese día tiene otras horas).

Detalle en "Modelo de datos".

`[@test] ../../../test/HU35_jeff/migration-0012.test.ts`

### RS-BE-31 — La regla: crear, editar y borrar

`POST`, `PATCH` y `DELETE` sobre los bloques del alumno. El alumno sale **solo del token**
(`authMiddleware` + `requireRole(...STUDENT_ROLES)`), como en `academic-record`: no hay
parámetro de alumno ni ruta para docentes o delegados.

Validación con Zod, y las mismas reglas repetidas como CHECK en la base:

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
- `startDate` y `endDate`: fechas planas (`YYYY-MM-DD`), `endDate >= startDate`.
- Máximo **20 bloques activos** por alumno (`TIME_BLOCK_LIMIT_REACHED`). No es una regla de
  negocio: es un tope para que una ventana de ocurrencias no crezca sin control.

`PATCH` reemplaza la regla entera y **conserva las excepciones**: si el alumno mueve el
patrón de 14:00 a 15:00, el día que ya había cancelado sigue cancelado. Editar la regla es
"cambiar todas las semanas"; tocar un día suelto es RS-BE-32.

`DELETE` borra el bloque y sus excepciones en cascada.

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`

### RS-BE-32 — Excepciones: un día suelto

`PUT /time-blocks/me/:id/occurrences/:date` fija la excepción de esa fecha:

- `{ "status": "cancelled" }` — ese día no va.
- `{ "status": "moved", "startTime": "15:00", "endTime": "19:00" }` — ese día tiene otras
  horas, con las mismas validaciones de RS-BE-31 (rango 07:00–22:00 incluido).

`DELETE /time-blocks/me/:id/occurrences/:date` quita la excepción: ese día vuelve al patrón.

La fecha tiene que caer **dentro del rango del bloque y en uno de sus días de la semana**;
si no, `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`. Una excepción sobre un día que el patrón no
genera no significa nada y solo ensucia la tabla.

Es idempotente: repetir el mismo `PUT` deja el mismo estado (`on conflict do update`).

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`

### RS-BE-33 — Ocurrencias de una ventana

`GET /time-blocks/me/occurrences?from=YYYY-MM-DD&to=YYYY-MM-DD` devuelve los bloques ya
concretos de esa ventana: el servidor expande la regla día por día y aplica las excepciones.

- Un día `cancelled` no aparece.
- Un día `moved` aparece con sus horas nuevas y `moved: true`.
- Las ocurrencias salen ordenadas por fecha y hora de inicio.
- La ventana es **obligatoria** y de **120 días como máximo** (`TIME_BLOCK_WINDOW_TOO_WIDE`).
  Sin tope, un rango de años expandiría cientos de miles de filas en memoria.

La expansión es una **función pura** (`time-blocks.logic.ts`), sin base de datos: recibe las
reglas, las excepciones y la ventana, y devuelve las ocurrencias. Ahí viven las pruebas de
los casos que se rompen solos: bloque que empieza a mitad de semana, rango que termina un
martes, día cancelado, día movido, excepción fuera del patrón, y una ventana que no toca el
rango del bloque.

`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`

### RS-BE-34 — Horas por semana

La misma respuesta de RS-BE-33 trae `weeks`: una entrada por semana tocada por la ventana,
con el lunes de esa semana y el total de horas de los bloques del alumno en ella.

- Se suma sobre las **ocurrencias**, no sobre la regla: un día cancelado no suma, y un día
  movido suma su duración nueva.
- Las semanas van de **lunes a domingo**, en hora de Lima.
- El total se expresa en horas decimales (1.5 = una hora y media), sin redondear.

También es función pura y se prueba aparte.

`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`

### RS-BE-35 — Nada de esto lo ve el chatbot

El chatbot manda su contexto a un proveedor externo. Dónde trabaja un alumno y a qué hora
sale no tiene por qué salir de la app: ni `chatbot.repository.ts` ni `chatbot.service.ts`
leen `student_time_block` ni `student_time_block_exception`, ni importan el módulo
`time-blocks`. Una prueba lo fija, igual que en `academic-record` (RS-BE-28).

`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts`

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
- `chk_time_block_dias`: `array_length(days_of_week, 1) between 1 and 7` y
  `days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]`
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
Todas las rutas: Bearer, roles de alumno, alumno tomado del token.

GET /time-blocks/me
200 → { "blocks": [ {
  "id": 12, "title": "Prácticas", "colorHex": "#F94B3F",
  "daysOfWeek": [1, 3], "startTime": "14:00", "endTime": "18:00",
  "startDate": "2026-09-01", "endDate": "2026-12-15",
  "exceptions": [ { "date": "2026-10-08", "status": "cancelled" },
                  { "date": "2026-10-15", "status": "moved",
                    "startTime": "15:00", "endTime": "19:00" } ]
} ] }

POST /time-blocks/me
body: { title, colorHex, daysOfWeek, startTime, endTime, startDate, endDate }
201 → { "block": { …como arriba, exceptions: [] } }

PATCH /time-blocks/me/:id      body: los mismos campos → 200 { "block": … }
DELETE /time-blocks/me/:id     → 200 { "ok": true }

PUT /time-blocks/me/:id/occurrences/:date
body: { "status": "cancelled" } | { "status": "moved", "startTime": "15:00", "endTime": "19:00" }
200 → { "exception": { "date": "2026-10-15", "status": "moved", "startTime": "15:00", "endTime": "19:00" } }

DELETE /time-blocks/me/:id/occurrences/:date  → 200 { "ok": true }

GET /time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19
200 → {
  "occurrences": [ { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
                     "date": "2026-09-21", "dayOfWeek": 1,
                     "startTime": "14:00", "endTime": "18:00", "moved": false } ],
  "weeks": [ { "weekStart": "2026-09-21", "hours": 8 } ]
}
```

- Las horas viajan como `"HH:MM"` y las fechas como `"YYYY-MM-DD"`, siempre en hora de Lima
  y sin zona horaria pegada: son horas de pared, no instantes.
- Los numéricos salen como `number` JSON (`hours` puede traer decimal); un campo sin dato
  es `null`, nunca 0.
- Códigos de error: `TIME_BLOCK_NOT_FOUND` (404), `TIME_BLOCK_OUT_OF_GRID`,
  `TIME_BLOCK_LIMIT_REACHED`, `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`,
  `TIME_BLOCK_WINDOW_TOO_WIDE` (400), más los 401/403 del middleware.
- Los ejemplos usan datos inventados. Ningún fixture de las pruebas lleva datos reales.

## Cambios en otras specs

- `docs/specs/api-contracts.md`: las siete rutas nuevas.
- `docs/specs/feature-index.md`: la funcionalidad nueva.
- `specs/features/schedule/schedule.spec.md`: una nota de que el horario del alumno ya no es
  solo lo que baja del portal, y que los bloques propios viajan por su propia ruta.

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
