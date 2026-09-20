---
name: Academic Record
description: Guardar una copia del récord académico del portal en cada sincronización aceptada, mostrarla solo a su dueño, limpiar los electivos aprobados que el récord no respalda y permitir borrarla a pedido
targets:
  - ../../../src/modules/academic-record/**
  - ../../../src/modules/portal-sync/parsers/record.ts
  - ../../../src/modules/portal-sync/parsers/info-academica.ts
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/modules/portal-sync/portal-sync.schemas.ts
  - ../../../src/modules/portal-sync/portal-sync.types.ts
  - ../../../src/modules/auth/auth.schemas.ts
  - ../../../src/modules/auth/auth.service.ts
  - ../../../src/modules/index.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/0011_academic_record.sql
---

# Récord académico

> Estado: **APROBADA** por el dueño del proyecto el 2026-09-18, parte por parte, incluido el
> cambio de base de datos que exige `AGENTS.md`. Diseñada con maquetas revisadas por él.
> Corregida el mismo día tras una revisión adversarial; las dos correcciones que cambiaban
> comportamiento las decidió el dueño (decisiones 7 y 8).
> Contraparte de frontend: `ULima_Frontend_IS2/specs/features/academic-record/academic-record.spec.md`.

## El problema

**La importación descarga el récord completo y lo tira.** `parseRecordAcademico`
(`parsers/record.ts`) lee 7 de sus 12 columnas, redondea los créditos con `Math.ceil`
—`1.5` pasa a `2`—, convierte una nota no numérica en `null` y no guarda nada del récord
en sí: de cada curso queda `student_course_progress.status` (si empareja con la malla) y,
para los cursos del ciclo importado, `enrollment.final_grade`. El pie de la página, con los
totales, no lo lee nadie. De la información académica de `layout.jsp` —PPA, ubicación
relativa, créditos— se extrae solo el nombre de la carrera.

**Y el progreso tiene aprobados falsos que nada corrige.** La carga inicial de la base,
anterior a portal-sync, marcó como aprobados TODOS los electivos de los ciclos ya
cursados. Un alumno real lleva solo algunos. `upsertProgressBatch` inserta y actualiza
pero nunca borra, así que esas filas sobreviven a cualquier importación. El alumno no
puede marcar ni desmarcar cursos a mano. El 2026-09-18 se midió la huella —todos los
electivos de un ciclo aprobados— en **5 de los 10 alumnos** con progreso. Uno se corrigió
a mano; los otros cuatro siguen así.

## User Stories

- Como alumno, quiero ver mi récord académico completo —curso por curso, ciclo por ciclo,
  con mi PPA y mis créditos— sin entrar a un portal que lo muestra en una tabla de 12
  columnas.
- Como alumno, quiero que mi malla deje de mostrar como aprobados electivos que nunca
  llevé, y que se corrija sola al sincronizar.
- Como alumno, quiero poder borrar la copia de mi récord cuando quiera, porque son mis
  notas.

## Requisitos

### RS-BE-19 — El récord se lee completo

`parseRecordAcademico` extrae de cada fila las columnas que el alumno necesita: ciclo,
código, asignatura, vez, créditos, nota, sección y observación. No se guardan VIG, FAC,
TOMO ni FOLIO: son referencias del libro de actas y guardarlas va contra la minimización
de datos.

- **Se lee por tabla, no por página.** La página trae dos tablas: la del récord (12
  columnas) y la del pie (10 columnas). El parser ubica la tabla del récord por su
  cabecera y recorre solo sus filas; ya no usa `trsOf` sobre la página entera.
- **Cabecera validada.** La cabecera normalizada debe ser exactamente
  `CICLO|COD.|ASIGNATURA|VIG.|FAC.|VEZ|CRD.|NOTA|SEC.|TOMO|FOLIO|OBSERVACION`. Si el portal
  agregó o reordenó una columna, el récord no es de confianza (RS-BE-21) en vez de leer
  TOMO como NOTA.
- **Normalización de rótulos.** Las cabeceras del récord y del pie se comparan
  normalizadas: se reutiliza `normalizeCareerName` (NFD, sin diacríticos, mayúsculas,
  espacios colapsados) y además se quita todo carácter fuera de `[A-Z0-9. ]`.
  OBSERVACIÓN se compara por el prefijo `OBSERVACI` y VÁLIDOS por el sufijo `LIDOS`, para
  que también pase un mojibake: `portal.client.ts` decodifica con el charset del
  `Content-Type` y usa ISO-8859-1 si no viene.
- **Fila de datos** es cada `<tr>` de la tabla del récord posterior a su cabecera. Se
  **descarta** si no tiene 12 celdas, si su código no cumple `/^\d{4,6}$/`, si VEZ no es un
  entero ≥ 1 o si CRD. no es numérico. Las descartadas se cuentan. La cabecera y las filas
  del pie no son filas de datos y nunca cuentan como descartadas.
- **Créditos con decimal**, sin redondear: se quita el `Math.ceil` de
  `parsers/record.ts:34`. Hoy `RecordRow.credits` no lo consume nadie. El `Math.ceil` de
  `parsers/matricula.ts:57` y el de `portal-sync.repository.ts:549` son de la matrícula y
  no cambian.
- **Nota numérica y nota original.** `grade` conserva exactamente su semántica actual
  (entero 0–20, o `null` si no lo es), porque también alimenta `enrollment.final_grade`.
  `grade_raw` guarda el texto de la celda tal cual, para no perder las marcas de
  convalidación o retiro que el portal escribe en lugar de un número. Si la celda viene
  vacía, `grade_raw` es `null`, nunca `""`.
- **Observación** solo cuando la celda trae texto; si no, `null`.

`[@test] ../../../test/HU34_jeff/record-parser.test.ts`

### RS-BE-20 — El pie del récord se lee

Se extrae la tabla de totales del pie de la misma página —promedio ponderado, asignaturas
y créditos convalidados, aprobados, válidos y desaprobados—, con la cabecera de 10
columnas validada y normalizada igual que en RS-BE-19. No suma ninguna petición al
portal: la página ya se descarga.

`[@test] ../../../test/HU34_jeff/record-parser.test.ts`

### RS-BE-21 — Regla de confianza

Un récord es **de confianza** solo si se cumplen todas:

1. se encontró la tabla del récord y su cabecera normalizada coincide (RS-BE-19);
2. se encontró la tabla del pie, su cabecera de 10 columnas coincide y todas sus celdas
   numéricas se leen como número. Si no, el motivo es "pie ausente o ilegible": la
   comparación **nunca** se omite porque falte el pie;
3. hay al menos una fila de datos y ninguna descartada;
4. la cantidad de filas con NOTA entera entre 11 y 20 es igual a ASIG. APR. del pie;
5. la suma de CRD. de esas mismas filas, sin redondear, es igual a CRD. APROB. del pie,
   con tolerancia 0.05;
6. ASIG. CONV. del pie es 0, y ASIG. DESAP. es igual a la cantidad de filas con NOTA
   entera entre 0 y 10.

Si ASIG. CONV. es mayor que 0, el récord no es de confianza hasta conocer cómo marca el
portal un convalidado. TOTAL ASIG. VÁLIDOS se lee, pero no decide, hasta tener un récord
anonimizado con desaprobados y convalidados. Las filas sin nota del ciclo en curso no
cuentan en ningún total.

Si el récord **no** es de confianza: no se toca ninguna de las tres tablas de esta
funcionalidad (RS-BE-22 y RS-BE-25) y no se ejecuta la limpieza de RS-BE-23. El motivo se
registra en el log del servidor; el alumno no recibe un aviso nuevo. El resto de la
importación sigue como hoy, incluido `enrollment.final_grade`.

Motivo: hoy un récord truncado llega con HTTP 200 y se procesa sin aviso, y eso es inocuo
porque no se borra nada. Con la limpieza encendida, sería un borrado masivo.

`[@test] ../../../test/HU34_jeff/record-trust.test.ts`

### RS-BE-22 — La copia del récord se guarda

Con un récord de confianza **y el consentimiento del alumno** (RS-BE-29), dentro de la
misma transacción de la importación:

- La transacción toma primero
  `select pg_advisory_xact_lock(hashtext('academic-record'), <student_id>)`. Así se
  serializan dos importaciones del mismo alumno: el cliente corta a los 90 s, el servidor
  sigue hasta 300 s, y el alumno puede reintentar mientras la primera sigue corriendo.
- `student_record_entry` del alumno se **reemplaza entera**: se borran sus filas y se
  insertan las del récord. Es una copia del portal, no historia propia.
- Los cursos de mallas anteriores se guardan con su código y nombre originales. La tabla
  **no tiene relación con la malla vigente**: esos cursos no existen en ella y son la
  historia real del alumno.

El registro (`auth.service.ts`, que llama al mismo `importFromPortal`) guarda el récord,
la foto y el resumen igual que la importación de Portal Sync, con la misma condición de
consentimiento.

`[@test] ../../../test/HU34_jeff/record-persistence.test.ts`

### RS-BE-23 — Limpieza de electivos no respaldados

Corre solo con un récord de confianza, con el consentimiento del alumno (RS-BE-29) y si
**toda fila aprobada del récord** (NOTA entera entre 11 y 20) resolvió a un curso de la
malla vigente, por código directo o por `course_equivalence`, salvo los códigos de
`SIN_EQUIVALENCIA_CONOCIDA` (`src/db/seed/equivalencias.logic.ts`): son de Estudios
Generales y nunca respaldan un electivo. Si queda alguna fila aprobada sin resolver, no se
borra nada y el motivo va al log del servidor.

Cuando corre, se borran de `student_course_progress` las filas del alumno que cumplen
**todas** estas condiciones:

- el curso de la malla es de categoría `elective`;
- el estado es `approved`;
- ninguna fila del récord lo respalda.

**Conjunto de respaldo.** Se calcula sobre TODAS las filas del récord parseado, con
cualquier nota (numérica, nula o marca), resolviendo cada código primero por código
directo y luego por `course_equivalence`. No se reutiliza el resultado de la fase de
progreso, que ya descartó las filas sin nota numérica. Los ids viajan como un solo
parámetro (`intArray` o `json_array_elements_text`, como hace el repositorio), nunca como
arreglo JS interpolado en la plantilla `sql`. Si el conjunto queda vacío, la limpieza no
corre: `<> all('{}')` borraría todo.

**Nunca** se borra un obligatorio, un curso de Estudios Generales, uno `in_progress`,
`withdrawn` o `failed`, ni nada de `student_curriculum_simulation`.

Por qué solo electivos: la tabla de equivalencias está incompleta —a un alumno de ciclo
alto le quedan 12 cursos de Estudios Generales de la malla anterior sin pareja en la
2026-1—, así que para un obligatorio el código no puede distinguir "no lo aprobó" de "lo
aprobó con un código que no sé leer". Los electivos, en cambio, son justo lo que la carga
inicial marcó mal. Decisión del dueño, 2026-09-18.

Por qué la precondición: la tabla de equivalencias tiene 14 pares y ninguno es de un
electivo. Un electivo aprobado con un código viejo sin pareja no quedaría respaldado, se
borraría, y ninguna importación posterior lo repondría. Ante la duda, no se borra.
Decisión del dueño, 2026-09-18 (decisión 7).

La cantidad borrada se suma en `summary.progressRemoved`. Si es mayor que 0, la
importación agrega el warning `PROGRESS_REMOVED` con el mensaje exacto
"Se desmarcaron N electivos que tu récord no respalda." (con "1 electivo" en singular).
`levelNeverGoesDown` no cambia: la cobertura de ciclos ya excluye electivos, así que el
nivel del alumno no se mueve.

`[@test] ../../../test/HU34_jeff/electives-cleanup.test.ts`

### RS-BE-24 — La información académica se lee

`parseInfoAcademica` se amplía para extraer de `layout.jsp`:

- **Información general:** PPA, ubicación relativa (texto, del tipo "TERCIO SUPERIOR"),
  cursos y créditos convalidados, cursos y créditos aprobados, créditos acumulados y
  créditos requeridos de la especialidad.
- **Información por período:** promedio, ubicación relativa, nivel, y cursos y créditos
  convalidados, matriculados, aprobados y desaprobados, **con el código de ciclo que el
  bloque declara**. Ese bloque describe el ciclo anterior (`info-academica.ts:8-9`), no el
  actual; guardarlo como "periodo actual" sería un dato falso.

Cómo se lee: cada bloque se ubica por su rótulo ("Información General", "Información por
Período Académico: Ciclo AAAA-N"). Dentro del bloque, la cabecera tiene grupos
(Convalidados, Aprobados…) con "Cursos | Créditos" repetido debajo, y los valores vienen
en una sola fila. Por eso se valida primero que la secuencia normalizada de rótulos de la
cabecera sea exactamente la esperada, y recién entonces los valores se leen por posición.
Si la secuencia no coincide, todos los campos de ese bloque quedan `null`.

Si un campo no se puede leer, queda `null` y se registra en el log del servidor. Nunca se
inventa un 0, y el alumno no recibe un aviso nuevo. Se actualiza el comentario de cabecera
de `info-academica.ts`, que hoy dice que PPA y ubicación no se extraen.

`[@test] ../../../test/HU34_jeff/info-academica-parser.test.ts`

### RS-BE-25 — Foto acumulada y resumen por ciclo

Con un récord de confianza y el consentimiento del alumno, en la misma transacción y bajo
el mismo candado de RS-BE-22:

- `student_academic_snapshot` guarda una fila por alumno con la información general y
  `synced_at`, la fecha de la importación. Se escribe con
  `INSERT ... ON CONFLICT (student_id) DO UPDATE`.
- `student_period_summary` del alumno se **reemplaza entera** (DELETE + INSERT). En esta
  versión queda una sola fila: la del ciclo que declara el bloque "por período" de
  `layout.jsp`.

Si el récord no es de confianza, o no hay consentimiento, no se toca ninguna de las tres
tablas: se conservan la copia, la foto, el resumen y su `synced_at` anteriores. Así
`syncedAt` corresponde siempre a la copia visible, y una primera importación no confiable
deja al alumno en el estado vacío (`syncedAt: null`).

`[@test] ../../../test/HU34_jeff/record-persistence.test.ts`

### RS-BE-26 — Lectura: `GET /academic-record/me`

Módulo nuevo `academic-record`, con la arquitectura del repo
(routes → controller → service → repository).

- `authMiddleware` + `requireRole(...STUDENT_ROLES)`. El alumno sale **solo del token**:
  no hay parámetro de alumno ni ruta para docentes o delegados. Nadie más que el dueño
  puede leer un récord.
- Responde con `Cache-Control: no-store`.
- Devuelve la foto acumulada, el récord agrupado por ciclo del más reciente al más viejo,
  el resumen por ciclo que exista, y `syncedAt`.
- `syncedAt` es `student_academic_snapshot.synced_at`, o `null` si no hay fila.
- Si el alumno nunca sincronizó (o nunca con un récord de confianza y consentimiento):
  `syncedAt: null`, `snapshot: null` y listas vacías, con 200. El frontend muestra
  entonces el estado vacío con el botón de sincronizar.

`[@test] ../../../test/HU34_jeff/academic-record.routes.test.ts`

### RS-BE-27 — Borrado a pedido: `DELETE /academic-record/me`

Mismo gate que RS-BE-26. Borra las filas del alumno en las tres tablas y responde
`{ ok: true }`. **No** toca `student_course_progress`: ese progreso lo necesita la malla y
pertenece a otra funcionalidad.

Si el alumno vuelve a sincronizar y acepta de nuevo, la copia se guarda otra vez.

Resuelve la decisión pendiente #7 de `portal-sync.spec.md` ("autoservicio o vía
soporte") a favor del **autoservicio**, para los datos que agrega esta funcionalidad.

`[@test] ../../../test/HU34_jeff/academic-record.routes.test.ts`

### RS-BE-28 — Fuera del alcance del chatbot

El chatbot manda su contexto a un proveedor externo. Ni `chatbot.repository.ts` ni
`chatbot.service.ts` leen las tablas de esta funcionalidad ni importan el módulo
`academic-record`. Una prueba lo fija para que nadie lo conecte después "porque sería
útil".

`[@test] ../../../test/HU34_jeff/chatbot-isolation.test.ts`

### RS-BE-29 — Consentimiento en la petición

`POST /portal-sync/import` y `POST /auth/register` aceptan el campo opcional
`consent: true`. La app nueva lo manda después de que el alumno acepta la pantalla de
consentimiento (RF-REC-6 del frontend).

Sin `consent: true` —es lo que mandan las apps ya instaladas, que no tienen esa
pantalla— la importación corre **igual que hoy**: horario, matrícula, malla y
`enrollment.final_grade`. No se ejecutan RS-BE-22, RS-BE-23 ni RS-BE-25: no se guardan
récord, foto ni resumen, y no se desmarca ningún electivo. Nadie queda bloqueado por no
actualizar la app. Decisión del dueño, 2026-09-18 (decisión 8).

`[@test] ../../../test/HU34_jeff/consent-gate.test.ts`

## Modelo de datos (migración `0011_academic_record.sql`)

Aditiva e idempotente (`IF NOT EXISTS`), aplicada a mano con `bun run db:apply` antes del
merge, con respaldo previo, según `MIGRATIONS.md`. **No** con `db:generate`: el registro
de Drizzle está desalineado desde la `0010` y reemitiría ese cambio.

| tabla | clave | columnas |
|:---|:---|:---|
| `student_record_entry` | PK `id`; UQ `(student_id, period_code, course_code, attempt)` | `student_id` FK → `student` ON DELETE CASCADE, `period_code`, `course_code`, `course_name`, `attempt` (CHECK ≥ 1), `credits` numeric(4,1) (CHECK ≥ 0), `grade` smallint null (CHECK 0–20), `grade_raw` null, `section_code` null, `observation` null. IDX por `student_id`. Sin FK a `course` ni a `curriculum_course`, a propósito |
| `student_academic_snapshot` | PK `student_id` | FK → `student` ON DELETE CASCADE; `ppa`, `relative_position`, `convalidated_courses`, `convalidated_credits`, `approved_courses`, `approved_credits`, `credits_accumulated`, `credits_required`, todas null; `synced_at` NOT NULL |
| `student_period_summary` | PK `id`; UQ `(student_id, period_code)` | FK → `student` ON DELETE CASCADE; `average`, `relative_position`, `level`, y cursos/créditos convalidados, matriculados, aprobados y desaprobados, todos null |

`ON DELETE CASCADE` es la base del borrado: si algún día se borra a un alumno, su récord
no queda huérfano.

## Contrato

```
POST /portal-sync/import   body: { cookies | credentials, "consent"?: true }
POST /auth/register        body: { …campos actuales, "consent"?: true }

GET /academic-record/me          (Bearer, roles de alumno)
200 → {
  "syncedAt": "2026-09-18T15:00:00Z" | null,
  "snapshot": {
    "ppa": 14.62, "relativePosition": "TERCIO SUPERIOR",
    "creditsAccumulated": 164, "creditsRequired": 200,
    "approved": { "courses": 50, "credits": 164 },
    "convalidated": { "courses": 0, "credits": 0 }
  } | null,
  "periods": [ {
    "periodCode": "2026-0", "average": 17.5, "relativePosition": "TERCIO SUPERIOR",
    "level": 8,
    "convalidated": { "courses": 0, "credits": 0 },
    "enrolled":     { "courses": 2, "credits": 6 },
    "approved":     { "courses": 2, "credits": 6 },
    "failed":       { "courses": 0, "credits": 0 }
  } ],
  "record": [ { "periodCode": "2026-1", "courses": [
      { "code": "650070", "name": "PARADIGMAS DE PROGRAMACIÓN", "attempt": 1,
        "credits": 1.5, "grade": 17, "gradeRaw": "17", "section": "917",
        "observation": null } ] } ]
}

DELETE /academic-record/me       (Bearer, roles de alumno)
200 → { "ok": true }
```

- **Tipos.** Todos los numéricos se serializan como `number` JSON, nunca como string: el
  repository convierte con `Number()` lo que Drizzle devuelve como texto para `numeric`.
  `credits`, `ppa`, `average` y todos los `credits*` pueden traer decimal; `attempt`,
  `grade`, `level` y `courses` son enteros. Un campo sin dato es `null`, no 0; en los
  objetos anidados, cada número por separado.

Los ejemplos usan datos inventados.

**Fixtures.** Las pruebas HU34 **no** reutilizan `test/HU31_jeff/fixtures/record.html`.
Se crea `test/HU34_jeff/fixtures/record.html` con la misma **estructura** (tabla de 12
columnas con la celda CICLO vacía en las filas de continuación, pie de 10 columnas) y
valores inventados, que incluyen un curso jalado en VEZ 1 y aprobado en VEZ 2, un crédito
1.5, una observación con texto y el ciclo en curso sin nota, con un pie coherente.
Variantes: sin pie, tabla cortada a la mitad, cabecera reordenada y cabecera con mojibake.
Ningún fixture de las pruebas lleva datos reales.

## Cambios en otras specs

- `portal-sync.spec.md`: el inventario de datos importados agrega PPA, ubicación relativa,
  créditos y resumen por ciclo ("notas históricas" ya figura). La decisión #2, que había
  descartado PPA y ubicación relativa, se reabre y se da por resuelta: se guardan porque
  el dueño lo pidió, se muestran solo al propio alumno y nunca entran al chatbot. La
  decisión #7 queda resuelta para estos datos (RS-BE-27). RS-BE-4 —la importación nunca
  toca los datos propios de la app— no cambia: estas tablas son copia del portal, no
  datos propios.
- `portal-sync.spec.md` §Parsers: `parseInfoAcademica` devuelve lo que fija RS-BE-24. Se
  quitan "PPA y ubicación relativa no se extraen" y `lastPeriodLevel`, que el código
  nunca tuvo. `parseRecordAcademico` lee por tabla y devuelve también el pie (RS-BE-19 y
  RS-BE-20). El body de `/import` suma `consent` (RS-BE-29).
- `registro.spec.md`: el body de `/auth/register` suma `consent` (RS-BE-29).
- `docs/specs/api-contracts.md`: las dos rutas nuevas y el campo `consent`.
- `docs/specs/feature-index.md`: la funcionalidad nueva.

## Qué NO entra

- **El resumen por ciclo del portal** (`ComandoListarResumenAcademico`). Nadie ha visto
  todavía su HTML, así que no hay con qué escribir su lector. Para conseguirlo, el dueño
  descarga la página una vez con el script de `spike-portal/` y la anonimiza a mano como
  fixture. **No** se captura desde producción: guardar esa página de un alumno real
  sería guardar sus datos sin anonimizar. La migración de ese lector decidirá cómo
  distinguir las fuentes de `student_period_summary`.
- **Avisos nuevos al alumno** por un récord no confiable o una información académica
  incompleta. Van al log del servidor; si se quieren, la spec fijará antes su texto.
- **Borrar todo lo importado** —matrícula, horario, progreso—, que también pide la
  decisión #7. Deja la app vacía para ese alumno, es casi borrar la cuenta, y es una
  deuda anterior a esta funcionalidad. Queda abierta.
- **Emparejar los 12 cursos de Estudios Generales** de la malla anterior. Requiere la
  tabla oficial 2026-1 ↔ 2025-x o la confirmación del dueño pareja por pareja.
- **Mostrar el récord a docentes, delegados o al chatbot.** Nunca.

## Decisiones

| # | Decisión | Elegida | Descartadas |
|:---|:---|:---|:---|
| 1 | Guardar el récord o pedirlo en vivo | Guardar una copia con su fecha | En vivo (pide clave y SecurID cada vez); mitad y mitad |
| 2 | Qué borra la limpieza | Solo electivos aprobados no respaldados | Estricto (con la tabla de equivalencias incompleta nunca se ejecutaría para un alumno de ciclo alto); todo lo no respaldado (borraría aprobados reales de Estudios Generales) |
| 3 | Qué columnas guardar | Ciclo, código, asignatura, vez, créditos, nota, sección, observación | Las 12 columnas (VIG, FAC, TOMO y FOLIO no le sirven al alumno) |
| 4 | El bloque "por período" de `layout.jsp` | Guardarlo con su propio código de ciclo | Mostrarlo como "periodo actual" (es el anterior) |
| 5 | Qué avisar tras la limpieza | Solo el conteo | La lista (duplica lo que ya muestra la pantalla del récord) |
| 6 | Borrado | Autoservicio, solo de estos datos | Vía soporte |
| 7 | Récord con un curso aprobado cuyo código no se reconoce | No desmarcar ningún electivo ("si hay duda, no se borra"), salvo los 12 de Estudios Generales ya conocidos | Desmarcar igual (borraría para siempre un electivo aprobado con código viejo) |
| 8 | Sincronización desde una app sin pantalla de consentimiento | Funciona igual que hoy, sin guardar récord, foto ni resumen | Rechazarla y pedir que actualicen (dejaría sin sincronizar a quien no actualice) |
