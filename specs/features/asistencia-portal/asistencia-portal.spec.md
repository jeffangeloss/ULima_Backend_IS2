---
name: Asistencia del Aula Virtual
description: Importa las horas de asistencia del alumno desde el panel Asistencia del Aula Virtual de miUlima hacia enrollment, sin persistir sesiones individuales ni observaciones del docente.
targets:
  - ../../../src/modules/portal-sync/**
  - ../../../src/services/portal.client.ts
  - ../../../src/modules/schedule/schedule.service.ts
  - ../../../src/modules/schedule/schedule.types.ts
  - ../../../src/modules/course-detail/course-detail.routes.ts
  - ../../../src/modules/attendance-risk/attendance-risk.repository.ts
  - ../../../test/HU31_jeff/**
---

# Asistencia del Aula Virtual

> Estado: **APROBADA el 2026-09-07 e implementada.** Diseño cerrado sobre fixtures reales del spike (5 cursos de una cuenta real). Enmienda RS-BE-4 y el paso 9 de `portal-sync.spec.md`, que hasta ahora prohibían tocar las horas de asistencia. **Pendiente**: la verificación de tiempos de §Verification, y re-sondear cerca de la semana 6 para ver el formato del agregado con faltas reales.

## Contexto

`enrollment.attended_hours`, `absent_hours` y `total_hours` nunca se escribieron: las 19 matrículas del período activo están en 0, y RS-BE-10 las reporta como `sin_datos` en vez de fingir asistencia perfecta. Esta feature las llena.

**Fuente** (verificada el 2026-09-06 con sesión real). El panel *Asistencia* del Aula Virtual, mismo camino que el de delegados:

1. Sidebar `av/servlets/ComandoListarCursosXOpcionAulaVirtualAsistencia` → `javascript:OpenAsistenciaAlumno('<aula>')` por curso.
2. `av/scripts/aVirtualBB.js` (público, sin sesión) resuelve esa función:
   ```js
   function OpenAsistenciaAlumno(Aula, Alumno){
     var Cad = '?prm_sNuAula='+Aula;
     var link = '/portalUL/av/servlets/ComandoListarAsistenciaAulaVirtualAlumno'+Cad;
   ```
   **Un solo parámetro, y el segundo argumento se ignora**: el servlet deduce al alumno de la sesión.

> **Ruta prohibida.** El HAR contiene `ComandoListarAsistenciaAulaVirtualCursos?…&prm_sCoUserAlum=<código>`, parametrizada por **código de alumno**. Es superficie de IDOR contra terceros y esta feature NO la usa jamás. Si alguna vez `OpenAsistenciaAlumno` empezara a aceptar un código de alumno, la importación se aborta y se escala a Sistemas.

**Forma de la página** (~18 KB, idéntica en las 5):

```
inputs ocultos: prm_sCoCurs=650033  prm_sCoSecc=952  prm_sNuAula=154508  prm_sCoUserAlum=<alumno>
Fecha       | Hora     | Duracion | Asistencia | Observación
25/08/2026  | 07:00:00 | 2        | Sí
...
Total horas programadas : 64
Total horas asistidas   : 8
Total inasistencias     : 0 horas / 0 %
```

Los tres agregados mapean 1:1 con las tres columnas. Y «Total horas programadas» coincide **5 de 5** con `course_offering.total_hours` tras el backfill de RS-BE-9, contradiciendo el viejo `créditos × 16` en los cinco: el portal valida esa corrección de forma independiente.

## Requirements

- RS-BE-15: La importación llena `enrollment.attended_hours`, `absent_hours` y `total_hours` del alumno autenticado con los tres agregados que publica su propia página de asistencia. Nunca persiste sesiones individuales ni la observación del docente, y nunca escribe un valor derivado ni un cero por fallo.
  `[@test] ../../../test/HU31_jeff/parser.asistencia.test.ts`
  `[@test] ../../../test/HU31_jeff/repository.asistencia.test.ts`
- RS-BE-16: El porcentaje de asistencia que ve el alumno se calcula sobre las **horas transcurridas**, no sobre el ciclo entero. La API expone `horasTranscurridas` (= asistidas + inasistencias) junto a las tres horas.
  `[@test] ../../../test/HU31_jeff/schedule.horas-transcurridas.test.ts`

## Rules

### Por qué `horasTranscurridas` (RS-BE-16)

Sin este campo, la app dividiría asistidas entre programadas: en la semana 2 daría `8/64 = 12.5%` y el alumno leería «asististe al 12.5%». Es **la misma deshonestidad que RS-BE-10 vino a arreglar, invertida**: antes decía 100% por un `NaN`, ahora diría 12.5% porque el numerador es lo transcurrido y el denominador el ciclo completo. Con `horasTranscurridas` el cliente divide `asistido / horasTranscurridas` = 8/8 = 100%, y las faltas aparecen apenas existan.

`horasTranscurridas` es **derivado, no una columna nueva**: `attended_hours + absent_hours`, calculado en el service.

### El parser (`parsers/asistencia.ts`)

```ts
parseAsistenciaCurso(html, aulaEsperada, alumnoEsperado): ParseResult<AsistenciaCurso>
```

`AsistenciaCurso` tiene **exactamente cinco campos**: `courseCode`, `sectionCode`, `totalHours`, `attendedHours`, `absentHours`. La ausencia de campos para sesión, marca y observación **es la garantía de privacidad, no un olvido**.

Reglas de extracción, todas verificadas contra los 5 fixtures:

- Identificación por `inputValueByName`, nunca por `includes`: la página trae `prm_sCoSecc` junto a `prm_sCoSeccAcd` y `prm_sCoCurs` junto a `prm_sCoUserAlum`.
- Se exige que `prm_sNuAula` sea el aula pedida y que `prm_sCoUserAlum` sea el alumno autenticado. Un desajuste de alumno es `ok:false` **sin imprimir ninguno de los dos códigos**: el recibido sería de un tercero.
- **Puerta de cabecera**: debe existir un `<tr>` de 9 celdas cuyas celdas `[0,2,4,6,8]` sean `fecha / hora / duracion / asistencia / observacion`. Es lo único que garantiza que la columna de la marca siga siendo la misma el día que el portal agregue una columna.
- Los agregados se buscan sobre el texto **ya normalizado con `clean`**, no sobre el crudo: el JSP emite `Total  horas  asistidas` con espacios dobles, y un `includes` del literal normal falla en las 5 páginas.
- «Total inasistencias» se parsea con `^(\d+(?:[.,]\d{1,2})?)\s*horas?\s*\/\s*(\d+(?:[.,]\d{1,2})?)\s*%$`. Si no casa es `ok:false`: **jamás se asume cero**. El porcentaje se lee para validar la forma y se descarta.
- Las filas de sesión se leen **solo como checksum** (`sumSí <= asistidas <= sumTodas`) y se descartan. Se aplica solo si hay ≥1 fila y todas las duraciones parsean.
- Los mensajes de error llevan solo literales fijos y valores que ya pasaron una regex de dígitos. Esta página contiene el nombre del alumno, el del docente y la observación: la regla de que el mensaje nunca lleva fragmentos del HTML del portal es acá más dura que de costumbre.

**Prohibido derivar `absent = programadas − asistidas`.** Con los datos reales daría 87.5% de inasistencia en la semana 2 y los cinco cursos saldrían `impedido`, con `notifyStudents` mandando alertas a alumnos reales.

### La escritura

Un solo `UPDATE` de las tres columnas a la vez, con la condición del CHECK `chk_enrollment_attendance_hours` replicada en el `WHERE`. Una fila incoherente actualiza **0 filas** y se cuenta como omitida, en vez de levantar un 23514 que abortaría la única transacción del import y haría rollback de matrícula, horario, notas y progreso.

- `total_hours` sale de «Total horas programadas» de la misma página, no de `course_offering.total_hours`. Así los tres números son aritmética interna del portal y el CHECK es inviolable por construcción.
- Es **asignación**, no `greatest` ni acumulación: el portal publica el acumulado a la fecha y el docente puede corregir una marca. La idempotencia sale gratis.
- `programadas <= 0` no se escribe: `total_hours = 0` es el centinela de RS-BE-10 («nunca se escribió») y escribirlo mentiría en la dirección contraria.
- Un fallo de red o de parseo **no toca la fila**. Nunca se escribe 0 por un fallo: convertiría al salón en `sin_datos` y borraría un impedido legítimo.

### Precondición en `attendance-risk`

`attendance-risk.repository.ts` calcula el porcentaje contra `COALESCE(co.total_hours, e.total_hours)`, cuya segunda rama es código muerto (`co.total_hours` es `NOT NULL DEFAULT '0'` y el join es INNER). Pasa a `COALESCE(NULLIF(e.total_hours, 0), co.total_hours)`: una vez que existe el total del propio alumno, ese es el denominador correcto, y el de la oferta —que usa `max()` entre secciones— es solo el respaldo.

### Privacidad

La columna «Observación» es texto libre del docente y en la muestra menciona a un tercero por apellido. **No se importa, no se persiste, no se devuelve.** El alumno autenticado no puede consentir por ese tercero. Tampoco se persisten las filas por sesión: `KNOWLEDGE.md` excluye la tabla de sesiones del esquema definitivo.

Los fixtures de test se commitean **anonimizados**: nombre de alumno, nombre de docente, código de alumno y observaciones reemplazados por valores sintéticos. El repo es público.

## Cobertura conocida y sesgada

**Nadie ha visto una fila de inasistencia.** Las 21 filas de los 5 fixtures tienen una sola marca y los cinco agregados dicen `0 horas / 0 %`. El diseño esquiva el vocabulario negativo leyendo agregados en vez de marcas, pero **no** esquiva el formato del agregado con faltas reales: si el JSP emite algo que el regex no reconoce, el parser falla exactamente para los alumnos que tienen faltas, que son los que importan.

Mitigación: re-sondear a mitad de ciclo (~semana 6, cuando existan faltas) y ajustar el regex con esa muestra. Hasta entonces esta cobertura es **parcial y sesgada**, y así debe leerse.

## Verification

- Cronometrar `POST /portal-sync/import` end-to-end con delegados **y** asistencia activos, contra los 90 s de timeout del cliente Flutter. Las únicas mediciones existentes (40 s y 47 s) son anteriores al bloque de delegados. `delegados-portal.spec.md` ya se comprometió a mover su fase a un endpoint aparte si se pasa del presupuesto; agregar una tercera fase sin medir rompe ese compromiso.
