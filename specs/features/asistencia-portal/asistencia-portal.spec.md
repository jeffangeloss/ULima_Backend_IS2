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
>
> **Enmienda RS-BE-48, aprobada por el dueño el 2026-09-26 con `recarga-portal.spec.md` y en implementación en la rama `fix/menu-aula-virtual`.** La ULima cambia el menú lateral del Aula Virtual, `parseAulas` ya no encuentra ninguna aula y la importación deja de actualizar la asistencia de todos. RS-BE-48 lee el menú en sus dos formatos, corre la fase de asistencia antes que la de delegados y arma al final los avisos de cada aula, que nombran el aula cuando el curso se desconoce. Esta rama lleva solo RS-BE-48 y la identificación verificada `identificado` de `parseAsistenciaCurso` que ese requisito necesita. El resto de la enmienda de `recarga-portal.spec.md`, que suma el parámetro `cicloEsperado`, las marcas `otroCiclo` e `identityMismatch` y la hora de lectura, sale con la recarga en `feat/recarga-notas-asistencia`. Hasta que esta rama llegue a producción, el backend desplegado sigue el texto sin enmendar.

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

> **Formato nuevo del menú (2026-09-25, RS-BE-48 de `recarga-portal.spec.md`, aprobado por el dueño el 2026-09-26).** El menú vivo ya no trae los arreglos `aNuAula`, `aCurs` ni `aSecc`. Por cada curso emite un `<li class="curso">` con la carrera, el nombre truncado y la sección, seguido del enlace `OpenAsistenciaAlumno('<aula>')`, y no trae el código del curso. La importación ya identifica cada curso por los ocultos `prm_sCoCurs` y `prm_sCoSecc` de la página de detalle, así que el menú solo aporta el aula y una sección para contrastar. Un aula cuya página no llega o no se identifica queda, en cambio, sin curso conocido, y su aviso nombra el aula.

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
  `[@test] ../../../test/HU_asistencia/attendance-risk.sin-datos.test.ts`
  (el cálculo del porcentaje vive en el cliente: `ULima_Frontend_IS2/test/HU_asistencia/seccion_asistencia_test.dart`)
- RS-BE-48: `parseAulas` lee el menú lateral del Aula Virtual en sus dos formatos, el de arreglos y el de lista, y la importación identifica cada aula del formato de lista por la página de asistencia de esa misma aula, tanto para escribir la asistencia como para los delegados. Ningún aviso lleva `null` en lugar del curso. Las reglas están en «El menú lateral en dos formatos (RS-BE-48)».
  `[@test] ../../../test/HU31_jeff/parser.aulas-lista.test.ts`
  `[@test] ../../../test/HU31_jeff/parser.asistencia-sidebar.test.ts`
  `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
  `[@test] ../../../test/HU31_jeff/parser.asistencia.test.ts`
  `[@test] ../../../test/HU31_jeff/service.asistencia.test.ts`
  `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`

## Rules

### El menú lateral en dos formatos (RS-BE-48)

Esta sección copia la parte aprobada de RS-BE-48 de `recarga-portal.spec.md` (aprobada por el dueño el 2026-09-26, en la rama `feat/recarga-notas-asistencia`), limitada a la importación. `parseAulas(html, fnEnlace)` acepta el formato de arreglos, que conserva las reglas de RS-1 de `delegados-portal.spec.md`, y el formato de lista del menú nuevo. Es el único requisito de la recarga que corrige un fallo en producción, no necesita cambio de BD ni de contrato y se publica antes que el resto, en un PR propio (decisión abierta 1 de `recarga-portal.spec.md`).

**Forma del resultado.** `parseAulas` devuelve `ParseResult<AulaMenu[]>`, con `AulaMenu = { aula: string; courseCode: string | null; sectionCode: string | null; origen: "arreglos" | "lista" }`. El tipo reemplaza a `DelegadoAula` en `portal-sync.types.ts`. En el formato de arreglos `courseCode` y `sectionCode` nunca son `null`.

**Elección del formato.** El parser corre primero la lectura por arreglos. Si deja al menos un aula utilizable, ese es el resultado. Si no deja ninguna, corre la lectura por lista. Si tampoco deja ninguna, devuelve `ok: false` con el mismo motivo de hoy («el sidebar no trae ninguna aula utilizable»), porque este portal devuelve la página de inicio de sesión con HTTP 200.

**Lectura por lista.**

1. Un curso empieza en cada etiqueta `<li` cuyo atributo `class` contiene la palabra `curso` como palabra completa, separada por espacios (`curso` y `curso open` sirven, `curso-body` no), y termina donde empieza el siguiente curso o en el primer `</ul>`.
2. Dentro de ese tramo se buscan las llamadas `fnEnlace('<argumento>')`, con comillas simples o dobles y un argumento de hasta 20 caracteres sin comillas ni `<>`, y se cuentan sus argumentos distintos antes de validarlos. Un tramo sin llamadas se descarta, porque ese curso no ofrece el panel. Un tramo con dos argumentos distintos se descarta entero, aunque uno de ellos no sea un aula válida, porque no hay forma segura de saber cuál es la suya. Un tramo con exactamente un argumento aporta esa aula si pasa el punto 3.
3. El aula se valida con `^\d{4,8}$`, el mismo criterio de `assertAula`, y un argumento que no cumple descarta el tramo.
4. `sectionCode` es el último segmento del texto del `<li>`, separado por `/` y normalizado con `clean(stripTags(...))`, cuando cumple `^\d{1,4}$`. Si no lo cumple queda `null` y el aula se conserva, porque la sección del menú solo sirve para contrastar.
5. `courseCode` es siempre `null`. El `<li>` trae el nombre truncado a 20 caracteres y nunca el código, y un número dentro del nombre no es un código de curso.
6. Si la misma aula aparece en dos tramos, se conserva la primera aparición cuando las secciones coinciden o una de ellas es `null`, y se descartan las dos cuando las secciones difieren.
7. El orden del resultado es el del documento.

**Identificación verificada.** La identificación verificada de una página de asistencia es el par (curso, sección) que declara cuando además `prm_sNuAula` es el aula pedida y `prm_sCoUserAlum` es el del alumno. `parseAsistenciaCurso` la devuelve en `identificado: { courseCode, sectionCode }` también cuando la página falla después, en los totales o en el cotejo con las sesiones (RS-BE-51, punto 4, de `recarga-portal.spec.md`). El parámetro `cicloEsperado` de ese punto sale con la recarga.

**Fase de asistencia de la importación.** Identifica cada curso por los ocultos de la página de detalle (`prm_sCoCurs`, `prm_sCoSecc`), así que el formato de lista no le cambia la escritura. Se agrega un contraste. Cuando el aula trae `sectionCode` del menú y la página declara otra sección, ese curso no se escribe, el aula no entra al mapa aula → (curso, sección) y se emite `PARSER_FAILED` con `block: "asistencia"` y el mensaje fijo «La sección del menú no coincide con la de la página de asistencia del aula <aula>.». El mapa aula → (curso, sección) se arma con las identificaciones verificadas y no solo con las páginas que se leen enteras, así que un curso cuya página falla en los totales conserva sus delegados.

**Fase de delegados de la importación.** Pasa a correr después de la de asistencia, las dos fuera de la transacción y una después de la otra, como hoy. Para un aula con `courseCode: null`, toma el curso y la sección del mapa aula → (curso, sección) de la misma importación, porque el aula es el mismo número en los tres paneles. Consulta ese mapa antes de pedir la nómina, así que un aula sin curso conocido no gasta ninguna petición. Si el aula no está en el mapa, sus delegados no se escriben y se emite `PARSER_FAILED` con `block: "delegado"` y el mensaje fijo «No se pudo identificar el curso del aula <aula>.». Si el menú trae una sección y el mapa dice otra, rige la misma regla. El aviso de RS-11 de `delegados-portal.spec.md` («Ninguna de las aulas del panel de delegados empató con tu matrícula») se mide sobre las aulas identificadas. La nómina no cambia (RS-2 a RS-7 de `delegados-portal.spec.md`). Con arreglos rige la lectura de hoy, con lista solo se escribe el aula que una página de asistencia verifica, y con un formato desconocido la fase falla como hoy, sin escribir ningún claim.

**Atribución de un aula sin curso conocido.** Con el menú de lista, un aula cuya página falla no dice de qué curso es. La regla es la misma en la importación y en la recarga.

1. El curso y la sección de un aula salen, en este orden, de los arreglos del menú, de la identificación verificada de su propia página o de la identificación verificada de la página de la misma aula en el otro panel. Si ninguna la da, el aula queda sin curso conocido.
2. Los avisos de cada aula se arman al final, cuando ya terminan todas las fases. Con curso conocido nombran `<curso>/<sección>`, y sin él nombran el aula, como en «No se pudo traer la asistencia del aula 900101.» o «No se entendió la asistencia del aula 900101» seguido del motivo. Ningún aviso lleva `null`.
3. La importación no tiene fase de notas, así que con el menú de lista el aula de una página de asistencia que falla sin identificarse queda sin curso conocido y su aviso nombra el aula.

Los mensajes llevan solo literales fijos y valores ya validados con una regex de dígitos. La recarga (`POST /portal-sync/refresh`) usa el mismo parser con `OpenAsistenciaAlumno` y `OpenNotaAlumnoPrePost`, y sus reglas quedan en `recarga-portal.spec.md`.

### Por qué `horasTranscurridas` (RS-BE-16)

Sin este campo, la app dividiría asistidas entre programadas: en la semana 2 daría `8/64 = 12.5%` y el alumno leería «asististe al 12.5%». Es **la misma deshonestidad que RS-BE-10 vino a arreglar, invertida**: antes decía 100% por un `NaN`, ahora diría 12.5% porque el numerador es lo transcurrido y el denominador el ciclo completo. Con `horasTranscurridas` el cliente divide `asistido / horasTranscurridas` = 8/8 = 100%, y las faltas aparecen apenas existan.

`horasTranscurridas` es **derivado, no una columna nueva**: `attended_hours + absent_hours`, calculado en el service.

### El parser (`parsers/asistencia.ts`)

```ts
parseAsistenciaCurso(html, aulaEsperada, alumnoEsperado): ParseResult<AsistenciaCurso>
```

`AsistenciaCurso` tiene **exactamente cinco campos**: `courseCode`, `sectionCode`, `totalHours`, `attendedHours`, `absentHours`. La ausencia de campos para sesión, marca y observación **es la garantía de privacidad, no un olvido**.

Desde RS-BE-48 el resultado lleva además, fuera de `data`, la identificación verificada `identificado: { courseCode, sectionCode }` cuando la página declara el aula pedida y el alumno autenticado, también si falla después en los totales o en el cotejo con las sesiones. `AsistenciaCurso` sigue con sus cinco campos.

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
