---
name: Recarga desde la ULima
description: Botones de recarga que, con un solo inicio de sesión en miUlima, traen la asistencia y las notas parciales por evaluación del Aula Virtual, y arreglo del menú lateral del Aula Virtual, cuyo formato nuevo deja hoy a la importación sin asistencia y, muy probablemente, sin delegados
targets:
  - ../../../src/modules/portal-sync/**
  - ../../../src/services/portal.client.ts
  - ../../../src/config/env.ts
  - ../../../src/config/app-config.ts
  - ../../../src/shared/middleware/rate-limit.ts
  - ../../../src/modules/grades/**
  - ../../../src/modules/schedule/schedule.repository.ts
  - ../../../src/modules/schedule/schedule.service.ts
  - ../../../src/modules/schedule/schedule.types.ts
  - ../../../src/modules/course-detail/course-detail.routes.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/0015_portal_scores.sql
  - ../../../MIGRATIONS.md
  - ../../../docs/specs/api-contracts.md
  - ../../../test/HU31_jeff/**
  - ../../../test/HU37_jeff/**
  # AGENTS.md y KNOWLEDGE.md entran solo si el dueño aprueba la decisión abierta 12.
  - ../../../AGENTS.md
  - ../../../KNOWLEDGE.md
---

# Recarga de notas parciales y asistencia desde la ULima

> Estado. **Borrador del 2026-09-25, pendiente de aprobación del dueño.** Nada de esta spec
> está aprobado, salvo lo que la sección «Pedido y decisiones del dueño» atribuye al dueño con
> su fecha. Cada punto que el dueño todavía no decide figura en «Decisiones abiertas» con la
> opción que la spec adopta por defecto, y esa opción tampoco cuenta como aprobada. El cambio
> de base de datos (migración `0015`) pide además la aprobación explícita de BD que exige
> `AGENTS.md`. Enmienda, también como propuesta, `asistencia-portal.spec.md`,
> `portal-sync.spec.md`, `delegados-portal.spec.md`, `grades.spec.md`,
> `official-grades.spec.md`, `schedule.spec.md` y `course-detail.spec.md` (ver «Cambios en
> otras specs»). La rama `feat/recarga-notas-asistencia` parte de `origin/main` en `f10eb3f`, y
> todas las referencias de línea citan ese estado. Todos los `[@test]` apuntan a pruebas que
> se crean con la implementación y hoy no existen, así que cada uno lleva la marca
> *(pendiente)*. Los ejemplos usan datos inventados (alumno `20230001`, curso `690417` TALLER
> DE PROTOTIPADO, sección `812`, aulas `900101` a `900105`). La contraparte de frontend, con la
> maqueta aprobada, se escribe en `ULima_Frontend_IS2` y todavía no existe.

## El problema

El alumno no tiene cómo ver en ULima++ sus notas parciales reales ni refrescar su asistencia
cuando quiere. La calculadora solo muestra lo que él mismo registra (`simulated_grades`),
`/mis-notas` muestra las notas que un docente carga dentro de ULima++ (`student_score`, que en
2026-2 no tiene ninguna fila) y la asistencia llega únicamente con la importación completa de
`POST /portal-sync/import`, que cuesta unas 28 peticiones al portal, pide el consentimiento
del récord en cada entrada, gasta 1 de los 5 cupos por hora y no tiene su duración medida
frente al corte de 90 s de la app.

A eso se suma un fallo en producción. La ULima cambia el menú lateral del Aula Virtual, y
`parseAulas` ya no encuentra ninguna aula, así que la importación de hoy no actualiza la
asistencia de nadie y muy probablemente tampoco los delegados (RS-BE-48).

## Pedido y decisiones del dueño (2026-09-25, vinculantes)

| # | Decisión | Requisitos |
| --- | --- | --- |
| 1 | Botones de recarga junto a las notas y junto a la asistencia, que vuelven a pedir los datos a la ULima con la contraseña de miUlima y el código del autenticador (SecurID de un solo uso), para traer la asistencia real y las notas parciales por evaluación del Aula Virtual. | RS-BE-49 a RS-BE-58 |
| 2 | Un solo inicio de sesión trae notas y asistencia juntas, y cualquiera de los dos botones actualiza ambas. | RS-BE-49 |
| 3 | La calculadora conserva su diseño actual y solo se reorganiza según la maqueta aprobada (`calculadora-reorganizada.html`). Los tres cambios, el resto que no cambia y lo que cada uno pide al backend están en «Diseño aprobado de la app». | RS-BE-56, RS-BE-57, RS-BE-58 |

## Hallazgos verificados

Salen del sondeo de solo lectura del 2026-09-25 con la cuenta del dueño, de la lectura de
`origin/main` en `f10eb3f` y de consultas de solo lectura a la base. Ningún dato personal del
sondeo entra en esta spec ni en el repositorio, solo su estructura.

1. **Menú lateral nuevo.** El menú del Aula Virtual (paneles Asistencia y Nota) ya no emite
   los arreglos JS `aNuAula`, `aCurs` ni `aSecc` (cero declaraciones `new Array`). Por cada
   curso trae un `<li class="curso">CARRERA ING.SI. / <nombre truncado> / <sección></li>`
   seguido de `<a href="javascript:OpenAsistenciaAlumno('<aula>');">` en Asistencia y de
   `<a href="javascript:OpenNotaAlumnoPrePost('<aula>');">` en Nota. Los dos menús listan
   las mismas aulas en el mismo orden. `parseAulas`
   (`src/modules/portal-sync/parsers/delegado.ts:76-107`) devuelve «el sidebar no trae ninguna
   aula utilizable» sobre el menú vivo y cinco aulas sobre el fixture del 2026-09-06. El menú de
   Delegado usa el mismo parser y no tiene muestra viva.
2. **Asistencia por curso.** La página de detalle
   (`ComandoListarAsistenciaAulaVirtualAlumno?prm_sNuAula=<aula>`) trae los ocultos
   `prm_sCoCurs`, `prm_sCoSecc`, `prm_sNuAula`, `prm_sCoUserAlum`, `prm_sAaCicl` y
   `prm_sNuCicl`, y `parseAsistenciaCurso` lee bien las cinco páginas vivas, una de ellas con
   faltas. Las horas que hoy muestra la app vienen de importaciones anteriores al cambio del
   menú.
3. **Panel Nota, página del curso** (unos 9,6 KB). Trae en JavaScript `codCurso`, `nomCurso`,
   `seccion` y cuatro agregados, cada uno con `nota`, `min`, `max` y `nom` (EP «Eval.
   Continua», TA «Eval. Continua 2», EF «Eval. Final» y PROM «Promedio»). Los agregados usan
   0 para decir «sin nota», así que un 0 real no se distingue. El nombre completo del alumno
   va en una línea JS comentada. La página abre un marco `ifrTareaAcad` hacia
   `/portalUL/gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=<aula>`. El servlet de
   la página del curso sale en tiempo de ejecución de `OpenNotaAlumnoPrePost` en
   `aVirtualBB.js` y no queda guardado.
4. **Panel Nota, marco de evaluaciones** (16 a 17 KB, declara ISO-8859-1). Lleva el párrafo
   «Evaluaciones» y una tabla `treetable` cuya cabecera tiene seis celdas (vacía, «Detalle
   Evaluaciones», «Semana», «Peso», «Nota», vacía). En los cinco cursos hay un solo grupo raíz,
   `EVC` (`data-tt-id="07"`, semana vacía, peso 100), y debajo entre tres y cinco hojas
   (`data-tt-id="07.13"`, `"07.14"`…, con `data-tt-parent-id='07'`) con nombre, semana, peso y
   nota. Las hojas suman 100 y las 20 celdas de nota están vacías, porque es la semana 5. El
   marco no trae ningún input, código de alumno, aula ni código de curso, así que solo lo
   identifica la URL pedida. Todavía no hay ninguna muestra con una nota publicada.
5. **Emparejamiento con el sílabo.** En los cinco cursos del dueño, las 20 evaluaciones del
   portal tienen pareja en `assessment`. 19 calzan por semana, peso y nombre base, y una solo
   difiere en la semana (10 en la ULima y 11 en el sílabo cargado), con el mismo peso y el
   mismo nombre base. Los 20 pesos calzan.
6. **Evaluaciones del sílabo.** Las 311 evaluaciones de 2026-2 (74 sílabos, todos suman 100)
   salen de una carga manual del 2026-09-04 con un script desechable que ya no existe. Ningún
   código del repo inserta `assessment`, así que para un ciclo futuro no hay cargador. Su
   convención es `code` `EV01`, `EV02`…, `name` sin ordinal (0 de 311 terminan en número) y el
   tipo en `assessment_type_id`. En 2026-2 ningún sílabo repite semana, pero 84 grupos repiten
   nombre y 57 repiten nombre y peso, así que nombre y peso no bastan para emparejar.
7. **Costo actual.** La importación completa hace unas 28 peticiones al portal, pide el
   consentimiento en cada entrada, gasta 1 de 5 cupos por hora y su duración con delegados y
   asistencia sigue sin medirse frente al corte de 90 s de la app. Las únicas mediciones (40,7 s
   y 47,7 s) son anteriores a esas dos fases.

## Diseño aprobado de la app y lo que pide al backend

La maqueta aprobada conserva la calculadora que propuso un integrante del equipo y cambia solo
tres cosas. Quedan igual la cabecera ULIMA++ con la campana, el título «Calculadora de Notas»,
el conteo «Cursos con notas», la tarjeta de cada curso con su promedio, el aviso «Desaprobado»
y la barra «Suma de pesos», las filas de nota con peso, nota y tacho, el botón «+ Registrar
Nota» y su modal, la barra inferior y la burbuja de Ulises, y en `/mis-notas` la barra naranja,
las tarjetas de curso, la insignia «Final» (que suma solo lo ya publicado) y la flecha de
recarga, que sigue consultando solo a ULima++.

| Cambio de la maqueta | Qué pide al backend |
| --- | --- |
| El birrete gris sin texto pasa a una fila «Notas oficiales» con la hora de la última lectura («Última lectura hoy a las 10:42» o «Aún no se actualizan desde la ULima»), con el estilo de «Selecciona un Curso». | `lastReadAt` de `GET /grades/me/ulima` (RS-BE-57). |
| `/mis-notas` conserva su diseño y suma la franja «Actualizar desde la ULima» con la última lectura, las evaluaciones de la ULima con semana, peso y nota o «Sin nota», la hoja de recarga (formato del modal «Registrar Nota», «Entras como <código>», contraseña, seis casillas del código, «Actualizar» apagado hasta completar y aviso de que nada se guarda) y el aviso rojo persistente con «Reintentar» si la lectura falla. | `POST /portal-sync/refresh` (RS-BE-49 a RS-BE-56), sus códigos de error y `GET /grades/me/ulima` (RS-BE-57). El código de «Entras como» ya lo tiene la app. |
| En la calculadora, cada evaluación con nota de la ULima aparece como una fila de `nota_tile` con la marca «ULima» y sin tacho, y cuenta en el promedio. | `assessmentId` y `value` de cada evaluación en `GET /grades/me/ulima` (RS-BE-54, RS-BE-57). La maqueta muestra solo evaluaciones con pareja en el sílabo, y el caso sin pareja queda en la decisión abierta 7. |
| El bloque de asistencia de la ficha del curso lleva su botón de recarga y la hora de la última lectura. | El mismo `POST /portal-sync/refresh` y `asistenciaLeidaEn` en `GET /schedule/me/sessions` y `GET /course-detail/sections` (RS-BE-58). |

## Requisitos

### RS-BE-48 · El menú lateral del Aula Virtual se lee en sus dos formatos

`parseAulas(html, fnEnlace)` acepta el formato de arreglos, que conserva las reglas de RS-1 de
`delegados-portal.spec.md`, y el formato de lista del hallazgo 1. Es el único requisito de esta
spec que corrige un fallo en producción, no necesita cambio de BD ni de contrato y la spec
recomienda publicarlo antes que el resto, en un PR propio (decisión abierta 1).

**Forma del resultado.** `parseAulas` devuelve `ParseResult<AulaMenu[]>`, con
`AulaMenu = { aula: string; courseCode: string | null; sectionCode: string | null; origen:
"arreglos" | "lista" }`. El tipo reemplaza a `DelegadoAula` en `portal-sync.types.ts`. En el
formato de arreglos `courseCode` y `sectionCode` nunca son `null`.

**Elección del formato.** El parser corre primero la lectura por arreglos. Si deja al menos un
aula utilizable, ese es el resultado. Si no deja ninguna, corre la lectura por lista. Si
tampoco deja ninguna, devuelve `ok: false` con el mismo motivo de hoy («el sidebar no trae
ninguna aula utilizable»), porque este portal devuelve la página de inicio de sesión con HTTP
200.

**Lectura por lista.**

1. Un curso empieza en cada etiqueta `<li` cuyo atributo `class` contiene la palabra `curso`
   como palabra completa, separada por espacios (`curso` y `curso open` sirven, `curso-body`
   no), y termina donde empieza el siguiente curso o en el primer `</ul>`.
2. Dentro de ese tramo se buscan los enlaces `fnEnlace('<dígitos>')`, con comillas simples o
   dobles, y se toman sus aulas distintas. Un tramo con exactamente un aula aporta esa aula.
   Un tramo sin aula se descarta, porque ese curso no ofrece el panel. Un tramo con dos aulas
   distintas se descarta entero, porque no hay forma segura de saber cuál es la suya.
3. El aula se valida con `^\d{4,8}$`, el mismo criterio de `assertAula`.
4. `sectionCode` es el último segmento del texto del `<li>`, separado por `/` y normalizado con
   `clean(stripTags(...))`, cuando cumple `^\d{1,4}$`. Si no lo cumple queda `null` y el aula
   se conserva, porque la sección del menú solo sirve para contrastar.
5. `courseCode` es siempre `null`. El `<li>` trae el nombre truncado a 20 caracteres y nunca
   el código, y un número dentro del nombre no es un código de curso.
6. Si la misma aula aparece en dos tramos, se conserva la primera aparición cuando las
   secciones coinciden o una de ellas es `null`, y se descartan las dos cuando las secciones
   difieren.
7. El orden del resultado es el del documento.

**Quién consume el resultado.**

- **Asistencia de la importación.** Hoy ya identifica cada curso por los ocultos de la página
  de detalle (`prm_sCoCurs`, `prm_sCoSecc`), así que el formato de lista no le quita nada. Se
  agrega un contraste. Cuando el aula trae `sectionCode` del menú y la página declara otra
  sección, ese curso no se escribe y se emite `PARSER_FAILED` con `block: "asistencia"` y el
  mensaje fijo «La sección del menú no coincide con la de la página de asistencia del aula
  <aula>.».
- **Delegados de la importación.** La fase de asistencia pasa a correr antes que la de
  delegados, las dos fuera de la transacción y una después de la otra, como hoy. Para un aula
  con `courseCode: null`, la fase de delegados toma el curso y la sección del mapa aula →
  (curso, sección) que arman las páginas de asistencia que se leyeron bien en la misma
  importación, porque el aula es el mismo número en los tres paneles. Si el aula no está en ese
  mapa, sus delegados no se escriben y se emite `PARSER_FAILED` con `block: "delegado"` y el
  mensaje fijo «No se pudo identificar el curso del aula <aula>.». Si el menú trae una sección
  y el mapa dice otra, rige la misma regla. El aviso de RS-11 («Ninguna de las aulas del panel
  de delegados empató con tu matrícula») se mide sobre las aulas identificadas. La nómina no
  cambia (RS-2 a RS-7 de `delegados-portal.spec.md`).
- **Recarga.** RS-BE-51 y RS-BE-52 usan el mismo parser con `OpenAsistenciaAlumno` y
  `OpenNotaAlumnoPrePost`.

Los mensajes llevan solo literales fijos y valores ya validados con una regex de dígitos.

`[@test] ../../../test/HU31_jeff/parser.aulas-lista.test.ts` *(pendiente)*
`[@test] ../../../test/HU31_jeff/service.asistencia.test.ts` *(pendiente, casos nuevos)*
`[@test] ../../../test/HU31_jeff/service.delegados.test.ts` *(pendiente, casos nuevos)*

### RS-BE-49 · Endpoint de recarga, un solo inicio de sesión

`POST /portal-sync/refresh` lee en miUlima la asistencia y las notas parciales del alumno
autenticado con un solo inicio de sesión. Es la opción por defecto de la decisión abierta 2.

- **Autorización.** Hereda del módulo `authMiddleware` y `requireRole(...STUDENT_ROLES)`. Del
  contexto se leen solo `userId` y `studentId`.
- **Cuerpo.** `{ "credentials": { "password": string, "passcode": string }, "consent": true }`,
  validado con Zod en modo estricto. `password` mide de 1 a 200 caracteres y `passcode` cumple
  `^\d{6,8}$`, igual que en la importación. `consent` tiene que ser el literal `true` (decisión
  abierta 4). No existe la variante con `cookies`, y cualquier clave de más responde
  `400 INVALID_REQUEST_BODY`, porque el cuerpo lleva la contraseña y no conviene aceptar nada
  que no se use. El cuerpo nunca se registra.
- **Condiciones previas, antes de tocar el portal y en este orden.**
  1. Hay período activo y el alumno tiene al menos una `enrollment` con `status = 'active'` en
     él. Si no, `409 IMPORT_REQUIRED` («Primero carga tus datos del ciclo.»). La recarga solo
     actualiza matrículas que ya existen y nunca crea período, curso, sección ni matrícula.
  2. `app_user.code` existe. Si no, `422 PORTAL_IDENTITY_UNVERIFIABLE`.
  3. No hay otra recarga del mismo alumno en curso en esta instancia. Si la hay,
     `409 PORTAL_REFRESH_IN_PROGRESS`, porque dos inicios de sesión casi simultáneos gastan el
     mismo código de un solo uso y el segundo se leería como un rechazo.
  4. El tope de inicios de sesión rechazados de RS-BE-50, que se revisa justo antes de iniciar
     sesión. El cupo por hora lo descuenta antes un middleware, como en la importación, y
     RS-BE-50 dice cuándo se devuelve.
- **Inicio de sesión.** Una sola llamada a `PortalClient.login(app_user.code, password,
  passcode)`, el mismo flujo de la importación con credenciales. El usuario del portal nunca
  viene del cliente. La contraseña y el código se usan en esa llamada y se descartan.
- **Fases, fuera de la transacción.** Primero la asistencia (RS-BE-51) y después las notas
  (RS-BE-52 y RS-BE-53). La asistencia va primero porque su mapa aula → (curso, sección)
  sirve para contrastar el panel Nota.
- **Escritura.** Una sola transacción al final (RS-BE-55).
- **Cierre de sesión.** `logout` corre en un `finally` siempre que exista una sesión, con éxito,
  con error o por presupuesto agotado. RS-BE-60 cubre el inicio de sesión que falla a medias.
- **Identidad.** La sesión es del alumno por construcción, porque el backend inicia sesión con
  `app_user.code` y no acepta cookies de afuera. Como defensa adicional, si cualquier página
  de asistencia declara en `prm_sCoUserAlum` un alumno distinto, la recarga entera se aborta
  con `403 PORTAL_IDENTITY_MISMATCH` y no escribe nada. Para eso `parseAsistenciaCurso`
  distingue ese fallo de los demás con `identityMismatch: true` en su resultado. La importación
  conserva su comportamiento de hoy ante ese fallo, porque ya verifica la identidad con el
  consolidado de matrícula.
- **Lo que la recarga nunca toca.** Período, semanas, cursos, ofertas, docentes, secciones,
  horarios, sílabos, `assessment`, progreso, récord, alertas, claims de delegados,
  `section_representative`, `student_score` y `simulated_grades`. En `enrollment` escribe
  solo las tres horas de asistencia y las dos horas de lectura de la migración `0015`.

`[@test] ../../../test/HU37_jeff/refresh.schemas.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.service.test.ts` *(pendiente)*

### RS-BE-50 · Cupo, intentos rechazados, concurrencia y presupuesto de tiempo

Opción por defecto de la decisión abierta 3.

- **Cupo propio.** 5 recargas por alumno por hora, en un almacén propio
  (`portalRefreshRateLimit`), separado de los 5 de la importación. Se descuenta antes de
  trabajar y se devuelve ante `PORTAL_LOGIN_REJECTED`, `IMPORT_REQUIRED`,
  `PORTAL_REFRESH_IN_PROGRESS`, `INVALID_JSON_BODY`, `INVALID_REQUEST_BODY` y el `429` del tope
  de rechazos, porque ninguno de ellos llega a leer datos del portal. Al agotarse responde `429 RATE_LIMITED` con
  `details: { retryAfterMinutes, kind: "quota" }` y el mensaje «Demasiadas actualizaciones.
  Intenta de nuevo en N minuto(s).». Cada respuesta lleva `X-RateLimit-Remaining`.
- **Tope de inicios de sesión rechazados.** 3 rechazos cada 15 minutos por alumno, contados
  juntos con los de `POST /portal-sync/import`, porque protegen la misma cuenta de miUlima de
  un bloqueo. Se revisa antes de iniciar sesión. Al llegar al tope responde
  `429 RATE_LIMITED` con `details: { retryAfterMinutes, kind: "rejected_logins" }` y el mensaje
  «Demasiados intentos con datos rechazados. Intenta de nuevo en N minuto(s).». Devolver el
  cupo por hora ante un rechazo no borra el rechazo de este contador.
- **Límite del mecanismo.** Los dos contadores y la guarda de recarga en curso viven en la
  memoria de cada instancia, como los de hoy, así que no son límites globales.
- **Concurrencia.** Nunca hay más de 5 peticiones simultáneas sobre la misma sesión del portal,
  el mismo tope que ya asume la importación.
- **Presupuesto de tiempo.** `PORTAL_REFRESH_BUDGET_MS`, variable nueva en `src/config/env.ts`
  validada con Zod como entero entre 20 000 y 80 000, con 60 000 por defecto y expuesta en
  `config.portal.refreshBudgetMs`. Cuenta desde que el controlador recibe la petición. Pasado
  el presupuesto no se inicia ninguna petición nueva al portal, salvo el cierre de sesión. Las
  peticiones en vuelo terminan con su propio `PORTAL_TIMEOUT_MS`. Los cursos que no alcanzan a
  leerse quedan como `not_reached` y la respuesta suma un único aviso
  `REFRESH_BUDGET_EXCEEDED`. Si el presupuesto se agota antes de leer ningún curso, la
  respuesta es `504 PORTAL_TIMEOUT`. Con los valores por defecto, el peor caso es 60 s de
  presupuesto, 8 s de la última petición en vuelo, la transacción y 8 s del cierre de sesión,
  por debajo de los 90 s de la app.
- **Registro.** Por fase, la duración en milisegundos, el número de peticiones y sus estados
  HTTP. Nunca cuerpos, cookies, contraseña, código, notas, nombres ni códigos de alumno.

`[@test] ../../../test/HU37_jeff/refresh.rate-limit.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.budget.test.ts` *(pendiente)*

### RS-BE-51 · Asistencia en la recarga

1. `GET` del menú `PORTAL_PATHS.cursosAsistencia` y `parseAulas(html, "OpenAsistenciaAlumno")`.
2. Por cada aula, `GET` de `PORTAL_PATHS.asistenciaAlumno(aula)`, en paralelo con el tope de
   RS-BE-50, y `parseAsistenciaCurso(html, aula, app_user.code, cicloEsperado)`.
3. **Ciclo.** `parseAsistenciaCurso` recibe un cuarto parámetro opcional, `cicloEsperado`
   (`"AAAA-N"`). Cuando llega, exige `prm_sAaCicl` con `^\d{4}$` y `prm_sNuCicl` con `^[0-3]$`,
   y que `"<prm_sAaCicl>-<prm_sNuCicl>"` sea igual a `cicloEsperado`. Si no, devuelve
   `ok: false` con el motivo fijo «la página es de otro ciclo». La recarga pasa el código del
   período activo y la importación pasa `ciclo.data.periodCode`, el ciclo que acaba de leer de
   `layout.jsp`. `AsistenciaCurso` sigue con sus cinco campos.
4. El curso y la sección salen de la página, nunca del menú. Si el menú trae una sección
   distinta, rige el contraste de RS-BE-48.
5. La matrícula se resuelve en memoria por el par (curso, sección) contra las matrículas
   activas del alumno en el período activo, que ya trae la consulta de la condición previa 1.
   Un curso de miUlima sin matrícula en ULima++ no se escribe y suma el aviso `NOT_ENROLLED`.
6. La escritura es la de RS-BE-15 (`resolveAttendanceHours` y `updateAttendanceHours`, un solo
   `UPDATE` por asignación con el CHECK replicado en el `WHERE`), y el mismo `UPDATE` fija
   `portal_attendance_read_at` en el instante en que llega la respuesta de esa página. Una
   fila que el `UPDATE` no toca queda `skipped` y conserva su hora de lectura anterior.
7. Un fallo de descarga o de lectura no toca la fila. Nunca se escribe 0 por un fallo.

`[@test] ../../../test/HU37_jeff/refresh.asistencia.test.ts` *(pendiente)*
`[@test] ../../../test/HU31_jeff/parser.asistencia.test.ts` *(pendiente, casos de ciclo)*

### RS-BE-52 · Página de notas de cada curso (identificación y agregados)

**Rutas nuevas en `PORTAL_PATHS`.** Son constantes y lo único interpolado es el aula, validada
por `assertAula`.

- `cursosNota` es `av/servlets/ComandoListarCursosXOpcionAulaVirtualNota`.
- `notaCurso(aula)` es el servlet que arma `OpenNotaAlumnoPrePost` en `aVirtualBB.js`, con
  `?prm_sNuAula=<aula>`. Se fija como constante después de la verificación V1, y solo si ese
  es su único parámetro. Si la función pide un código de alumno, la feature se detiene y se
  escala, con el mismo criterio que la ruta prohibida de `asistencia-portal.spec.md`.
- `tareaAcademica(aula)` es `gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=<aula>`.
  El cliente arma esta ruta con el aula del menú y nunca sigue el `src` del marco que trae el
  HTML.

**Lector `parseNotaCurso(html, aulaEsperada): ParseResult<NotaCurso>`**, función pura en
`parsers/nota.ts`, con `NotaCurso = { courseCode: string; sectionCode: string; agregados:
AgregadoUlima[] }` y `AgregadoUlima = { clave: "EP" | "TA" | "EF" | "PROM"; etiqueta: string;
valor: number | null }`.

1. `courseCode` sale de una asignación `codCurso = '<valor>';` al comienzo de una línea (con
   `var` opcional y comillas simples o dobles) y cumple `^\d{4,6}$`. Una línea que empieza con
   `//` nunca se lee, así que la línea comentada con el nombre del alumno queda fuera por
   construcción. Si falta o no cumple, `ok: false` con «la respuesta no es la página de notas
   de un curso», el mismo motivo que recibe la página de inicio de sesión.
2. `sectionCode` sale igual de `seccion = '<valor>';` y cumple `^\d{1,4}$`.
3. La página tiene que traer un `<iframe>` cuyo `name` o `id` sea `ifrTareaAcad` y cuyo `src`
   sea exactamente `/portalUL/gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=<aula>`
   con el aula pedida. Si falta, `ok: false` con «la página no trae el marco de evaluaciones».
   Si el aula difiere, `ok: false` con «la página no corresponde al aula que se pidió».
4. **Agregados.** Se leen solo las asignaciones `notaEP`, `notaTA`, `notaEF` y `notaPROM`, al
   comienzo de línea, con `^\d{1,2}(\.\d{1,2})?$` y valor entre 0 y 20, y sus etiquetas
   `nomEP`, `nomTA`, `nomEF` y `nomPROM`, normalizadas con `clean(stripTags(...))`, que
   convierte el `<br>` de «Eval. Continua<br>2» en espacio. Un 0 se devuelve como `null`,
   porque el portal usa 0 para «sin nota». Un agregado que falta o no cumple se omite y no
   hace fallar al curso.
5. Las asignaciones `min*` y `max*` no se leen nunca. Son datos de la clase entera, es decir de
   terceros, y usan el mismo 0 ambiguo.
6. Si el menú trae una sección y la página declara otra, o si el mapa de la asistencia tiene
   esa aula con otro curso o sección, el curso no se escribe y se emite `PARSER_FAILED` con
   `block: "nota"` y el mensaje fijo «El curso del aula <aula> no coincide entre los paneles de
   miUlima.».
7. **Uso de los agregados.** No se guardan, no se devuelven a la app (decisión abierta 18) y no
   se registran. Solo sirven al chequeo del punto 7 de RS-BE-53.

`[@test] ../../../test/HU37_jeff/parser.nota-curso.test.ts` *(pendiente)*

### RS-BE-53 · Tabla «Detalle Evaluaciones»

**Orden de las peticiones.** Por cada aula del menú Nota, primero la página del curso y después
su marco, y los cursos uno tras otro. Es la opción segura mientras la verificación V3 no pruebe
que el marco no depende de un estado de sesión que deja la página del curso. Si V3 lo prueba,
las cadenas de cursos distintos pueden correr en paralelo con el tope de RS-BE-50, y si además
el marco responde sin abrir antes la página, la página del curso deja de pedirse y el curso y
la sección salen del mapa de la asistencia (variante corta de «Costo de una recarga»).

**Lector `parseDetalleEvaluaciones(html): ParseResult<EvaluacionUlima[]>`**, función pura en
`parsers/nota.ts`, con `EvaluacionUlima = { key: string; group: string | null; name: string;
week: number | null; weight: number; value: number | null; mark: "graded" | "pending" | "np" }`.
Esos siete campos son todos. No hay campo para la mínima, la máxima, el promedio del grupo ni
ningún texto del docente.

1. **Puerta de cabecera.** Tiene que existir una fila de exactamente seis celdas (`th` o `td`)
   cuyas celdas 1 a 4, normalizadas con `normalizeLabel`, sean `DETALLE EVALUACIONES`,
   `SEMANA`, `PESO` y `NOTA`. Si no, `ok: false` con «la tabla de evaluaciones no tiene la
   cabecera esperada». La puerta rechaza también la página de inicio de sesión.
2. **Filas.** Solo cuentan los `<tr>` con atributo `data-tt-id`, con comillas simples o
   dobles. Cada una tiene exactamente seis celdas y su `data-tt-id` cumple
   `^\d{1,4}(\.\d{1,4}){0,3}$`. Un id repetido, una fila con otro número de celdas o un id que
   no cumple hacen fallar al curso.
3. **Grupos y hojas.** Una fila sin `data-tt-parent-id` es un grupo y una con él es una
   evaluación (hoja). El padre de cada hoja tiene que ser un grupo presente en la página, y una
   hoja cuyo padre es otra hoja hace fallar al curso, porque no hay muestra de un tercer nivel.
4. **Celdas de una hoja.** La celda 1 es el nombre, la 2 la semana, la 3 el peso y la 4 la
   nota, todas con `clean(stripTags(...))`. Las celdas 0 y 5 no se leen.
   - Nombre no vacío y de 150 caracteres o menos.
   - Semana vacía (o `&nbsp;`) como `null`. Si trae texto, cumple `^\d{1,2}$` y está entre 1
     y 20.
   - Peso con `^\d{1,3}([.,]\d{1,2})?$`, mayor que 0 y hasta 100, con coma o punto decimal.
   - Nota vacía (o `&nbsp;`) como `mark: "pending"` y `value: null`. Con
     `^\d{1,2}([.,]\d{1,2})?$` y valor entre 0 y 20, `mark: "graded"` y el valor redondeado a
     dos decimales. `NP` sin distinguir mayúsculas como `mark: "np"` y `value: null` (decisión
     abierta 8). Cualquier otro texto hace fallar al curso con «una nota tiene un formato
     desconocido», porque todavía no hay ninguna muestra con nota publicada.
   Cualquier otro incumplimiento hace fallar al curso con un motivo fijo que nombra el campo.
5. **Grupo.** Su nombre, normalizado y de 60 caracteres o menos, pasa a `group` de sus hojas
   (si es más largo, `group` queda `null`). Su nota no se lee.
6. **Pesos, en este orden.** Una tabla sin hojas falla con «la tabla no trae evaluaciones».
   Si todas las hojas suman 100 con una tolerancia de 0,5, sus pesos son absolutos, y cada
   grupo que trae peso tiene que coincidir con la suma de sus hojas con la misma tolerancia, o
   el curso falla con «el peso de un grupo no coincide con sus evaluaciones». Si en cambio las
   hojas de cada grupo suman 100 por separado, los pesos son relativos al grupo, un formato sin
   muestra, y el curso falla con «pesos por grupo, un formato que ULima++ todavía no lee». En
   cualquier otro caso falla con «los pesos de la ULima no suman 100».
7. **Chequeo con el promedio.** Cuando todas las hojas tienen `mark: "graded"` y el agregado
   `PROM` de RS-BE-52 vale más que 0, el servicio compara la suma ponderada de las hojas con
   ese valor. Si difieren en más de 0,5, suma el aviso `PORTAL_AVERAGE_MISMATCH` para ese
   curso, sin ninguna cifra en el mensaje, y el curso se guarda igual. El mismo cotejo, hecho a
   mano por el dueño con su cuenta, sirve para la decisión abierta 9.
8. **Codificación.** El marco declara ISO-8859-1 y `fetchPage` decodifica según el
   `Content-Type`. Si el servlet anuncia otra cosa, la verificación V1 lo registra y el cliente
   fuerza ISO-8859-1 para esta ruta, como pide `delegados-portal.spec.md` para la nómina.
9. Los mensajes llevan solo literales fijos. Nunca un fragmento del HTML.

`[@test] ../../../test/HU37_jeff/parser.detalle-evaluaciones.test.ts` *(pendiente)*

### RS-BE-54 · Emparejamiento con el sílabo

Función pura `emparejarEvaluaciones(ulima: EvaluacionUlima[], silabo: EvaluacionSilabo[]):
EvaluacionEmparejada[]` en `portal-sync`, con `EvaluacionSilabo = { assessmentId, name,
typeName, week, weight }` y `EvaluacionEmparejada = EvaluacionUlima & { assessmentId: number |
null; match: "exact" | "exact_other_name" | "week_shift" | "none" }`.

- **Candidatas.** Solo las evaluaciones del sílabo de la oferta del curso (`assessment` →
  `syllabus` → `course_offering` del período activo), resuelta por la matrícula del alumno.
  Nunca las de otro curso. Todas las secciones de un curso comparten esa rúbrica.
- **Nombre base.** `normalizar(nombre)` pasa a minúsculas, quita las tildes con NFD, colapsa
  espacios y quita un ordinal final, sea `\s+(n\s*[°º.]?\s*)?\d{1,2}$` («Examen escrito 2»,
  «Trabajo de investigación N1») o un romano de I a VI. Una evaluación del sílabo calza por
  nombre si su nombre base es igual al de `assessment.name` o al de `assessment_type.name`.
- **El peso es condición dura** en las dos reglas, con una tolerancia de 0,01. Un peso distinto
  quiere decir que la ponderación oficial ya no es la del sílabo cargado, y emparejar haría
  mentir al promedio de la calculadora.
- **R1, exacta.** Para cada evaluación de la ULima con semana, las candidatas libres con la
  misma semana y el mismo peso. Con una sola, se empareja con `exact` si el nombre base calza y
  con `exact_other_name` si no. Con varias, gana la única cuyo nombre base calce, y si no queda
  exactamente una, R1 no empareja.
- **R2, semana corrida.** Con lo que sobra de R1, por nombre base, las evaluaciones de la ULima
  y las candidatas libres del mismo peso se ordenan por semana y la k-ésima de un lado se
  empareja con la k-ésima del otro si la diferencia de semanas es de 2 o menos. `week_shift`.
  El ordinal cuenta dentro del mismo nombre y no por posición en la lista.
- **R3.** Lo que queda va con `assessmentId: null` y `match: "none"`.
- Una evaluación del sílabo se empareja a lo sumo una vez.
- **Guarda del curso.** Si la mitad o más de las evaluaciones de la ULima quedan con `none`, o
  si la oferta no tiene evaluaciones cargadas, el servicio suma el aviso `SYLLABUS_MISMATCH`
  con el mensaje fijo «El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima
  en <curso>/<sección>.», y el curso se guarda igual.

`[@test] ../../../test/HU37_jeff/emparejar.test.ts` *(pendiente)*

### RS-BE-55 · Guardado

- Todas las escrituras de la recarga van en una sola transacción que empieza con
  `pg_advisory_xact_lock(hashtext('portal-refresh'), studentId)`. Sin ese candado, dos
  recargas del mismo alumno desde dos dispositivos borran e insertan las mismas filas a la vez
  y la segunda termina en un `23505`.
- **Notas.** Por cada matrícula cuyo marco se lee bien, se borran todas sus filas de
  `student_portal_score`, se insertan las evaluaciones emparejadas y se fija
  `enrollment.portal_grades_read_at` en el instante en que llega la respuesta del marco. Así
  una evaluación que la ULima retira no queda como fila vieja.
- Un curso cuyo marco falla conserva sus filas y su hora de lectura anteriores, con el mismo
  criterio con que la asistencia nunca escribe 0 por un fallo.
- **Asistencia.** La de RS-BE-51, dentro de la misma transacción.
- Solo se escribe sobre matrículas activas del alumno en el período activo, resueltas en el
  servidor.
- Los CHECK de la tabla repiten las validaciones de RS-BE-53, así que un valor que el lector
  acepta no puede hacer fallar la transacción. Si aun así la base rechaza algo, la transacción
  entera se revierte y la respuesta es `500`, sin nada a medias.

`[@test] ../../../test/HU37_jeff/refresh.repository.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/migration-0015.test.ts` *(pendiente)*

### RS-BE-56 · Respuesta de la recarga y errores

**`200`**, con `Cache-Control: no-store`, cuando al menos un curso se lee bien en alguno de los
dos paneles.

```json
{
  "readAt": "2026-09-25T15:42:10.000Z",
  "attendance": { "updated": 4, "skipped": 0, "failed": 0, "unavailable": 1 },
  "grades": { "read": 5, "failed": 0, "unavailable": 0, "withValue": 3 },
  "courses": [
    { "sectionId": 81, "courseCode": "690417", "sectionCode": "812",
      "attendance": "updated", "grades": "read" }
  ],
  "view": { "lastReadAt": "2026-09-25T15:42:10.000Z", "courses": [] },
  "warnings": [
    { "code": "ASISTENCIA_UNAVAILABLE", "block": "asistencia",
      "message": "No se pudo traer la asistencia de 690417/812." }
  ]
}
```

- En el ejemplo, `view.courses` va vacío solo por brevedad.
- `readAt` es el instante más reciente entre las lecturas que se guardan.
- `courses` tiene una entrada por matrícula activa del alumno en el período activo.
  `attendance` vale `updated`, `skipped`, `failed`, `unavailable`, `missing` (el menú de
  miUlima no trae ese curso) o `not_reached` (se agota el presupuesto). `grades` vale `read`,
  `failed`, `unavailable`, `missing` o `not_reached`.
- `view` tiene exactamente la forma de `GET /grades/me/ulima` (RS-BE-57), ya con lo guardado,
  para que la app no haga otra petición.
- Los avisos usan `block: "asistencia"` o `block: "nota"` y los códigos `PARSER_FAILED`,
  `ASISTENCIA_UNAVAILABLE`, `NOTAS_UNAVAILABLE`, `NOT_ENROLLED`, `SYLLABUS_MISMATCH`,
  `PORTAL_AVERAGE_MISMATCH` y `REFRESH_BUDGET_EXCEEDED`. Sus mensajes son fijos y solo llevan
  códigos de curso, de sección o de aula ya validados con una regex de dígitos.

**Errores.**

| Código | Cuándo |
| --- | --- |
| `400 INVALID_JSON_BODY`, `400 INVALID_REQUEST_BODY` | Cuerpo ilegible, `consent` distinto de `true`, `passcode` mal formado o claves de más. |
| `409 IMPORT_REQUIRED` | Sin período activo o sin matrícula activa en él. La app lleva a `/portal-sync`. |
| `409 PORTAL_REFRESH_IN_PROGRESS` | Otra recarga del mismo alumno en curso. |
| `409 PORTAL_LOGIN_REJECTED` | Contraseña o código rechazados, sin distinguir cuál. Nunca `401`, porque la app cierra la sesión de ULima++ ante cualquier `401`. |
| `409 PORTAL_SESSION_INVALID` | La sesión muere a mitad de camino, sin ningún curso leído. |
| `403 PORTAL_IDENTITY_MISMATCH` | Una página de asistencia declara otro alumno. No se escribe nada. |
| `422 PORTAL_IDENTITY_UNVERIFIABLE` | La cuenta no tiene `app_user.code`. |
| `429 RATE_LIMITED` | Cupo por hora o tope de rechazos (RS-BE-50), con `details.kind`. |
| `502 PORTAL_UNAVAILABLE` | Error de red o 5xx del portal y ningún curso leído. |
| `502 PORTAL_UNREADABLE` | El portal responde, pero ni los menús ni ninguna página se entienden, que es lo que se vería ante otro rediseño. Mensaje «miUlima responde con páginas que ULima++ no sabe leer.». |
| `504 PORTAL_TIMEOUT` | Tiempo agotado y ningún curso leído, incluido el presupuesto de RS-BE-50. |

Cuando no hay ningún curso leído, el código sale de los fallos vistos y la precedencia es
`PORTAL_SESSION_INVALID`, luego `PORTAL_TIMEOUT`, luego `PORTAL_UNAVAILABLE` y por último
`PORTAL_UNREADABLE`. En todos los errores no se escribe nada.

`[@test] ../../../test/HU37_jeff/refresh.service.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.routes.test.ts` *(pendiente)*

### RS-BE-57 · Lectura de las notas de la ULima

`GET /grades/me/ulima`, en el módulo `grades` y con su misma autorización
(`authMiddleware` y `requireRole(...STUDENT_ROLES)`). Solo el propio alumno lee sus notas, sale
del JWT y no hay parámetro, ruta para docentes ni lectura para delegados. Responde con
`Cache-Control: no-store`.

```json
{
  "lastReadAt": "2026-09-25T15:42:10.000Z",
  "courses": [
    {
      "sectionId": 81,
      "courseCode": "690417",
      "courseName": "TALLER DE PROTOTIPADO",
      "sectionCode": "812",
      "lastReadAt": "2026-09-25T15:42:10.000Z",
      "assessments": [
        { "key": "07.13", "group": "EVC", "name": "Examen escrito 1", "week": 3, "weight": 15,
          "value": 14.5, "mark": "graded", "assessmentId": 5011, "match": "exact" },
        { "key": "07.14", "group": "EVC", "name": "Trabajo de producción 1", "week": 6,
          "weight": 15, "value": null, "mark": "pending", "assessmentId": 5012,
          "match": "exact" },
        { "key": "07.15", "group": "EVC", "name": "Exposición", "week": 10, "weight": 20,
          "value": null, "mark": "pending", "assessmentId": 5013, "match": "week_shift" }
      ]
    }
  ]
}
```

- Una entrada por matrícula activa del alumno en el período activo, aunque nunca se haya
  leído, con `lastReadAt: null` y `assessments: []`.
- `assessments` va ordenado por semana (las `null` al final) y luego por `key`.
- `lastReadAt` de arriba es el máximo de los cursos, o `null`. Es la hora de la fila «Notas
  oficiales» de la calculadora y de la franja de `/mis-notas`.
- Sin período activo responde `{ "lastReadAt": null, "courses": [] }`, no un `500` como hoy
  `GET /official-grades/me`.
- Las claves van en inglés para calzar con `GET /official-grades/me`, que ya lee `/mis-notas`.

`[@test] ../../../test/HU37_jeff/grades-ulima.test.ts` *(pendiente)*

### RS-BE-58 · Hora de la última lectura de la asistencia

- Cada elemento de `secciones` en `GET /schedule/me/sessions` y en `GET /course-detail/sections`
  (y por extensión en `GET /course-detail/sections/:sectionId`) suma `asistenciaLeidaEn`, la
  hora de `enrollment.portal_attendance_read_at` en ISO 8601 UTC, o `null` si no hay ninguna
  lectura. Es un campo más y ninguno de los de antes cambia. Las filas del docente y de
  asesoría lo emiten siempre `null`.
- La importación (RS-BE-15) fija también `portal_attendance_read_at` en el mismo `UPDATE` de
  las horas, para que la hora refleje la última lectura por cualquiera de los dos caminos.
- Orden obligatorio. La migración `0015` va antes del despliegue de este código, porque la
  importación escribe la columna nueva y contra una base sin ella fallaría entera.

`[@test] ../../../test/HU37_jeff/asistencia-leida-en.test.ts` *(pendiente)*

### RS-BE-59 · Privacidad y minimización

- Se guardan solo el nombre, la semana, el peso, la nota o su marca, la clave y el grupo de cada
  evaluación, la pareja con el sílabo y las dos horas de lectura. No se guardan la mínima ni la
  máxima de la clase, los agregados, el nombre del alumno, el del docente, las filas por sesión
  de la asistencia ni ninguna observación.
- La mínima y la máxima no se leen ni se muestran. Son datos de terceros y la ULima usa 0
  para «sin nota», así que además no son fiables.
- La contraseña, el código y las cookies nunca se registran ni se persisten, igual que en la
  importación.
- El inventario de datos de `portal-sync.spec.md` (§Privacidad y base legal) suma las notas
  parciales por evaluación y la hora de cada lectura.
- **Fixtures anonimizados.** Se construyen a mano con la estructura real y datos inventados.
  Ningún código de alumno, nombre, aula, sección ni curso sale de las páginas del sondeo. Los
  archivos nuevos son `test/HU31_jeff/fixtures/sidebar-lista-asistencia.html`,
  `sidebar-lista-nota.html` y `sidebar-lista-delegado.html`, y
  `test/HU37_jeff/fixtures/nota-curso-900101.html`, `detalle-evaluaciones-vacias.html`,
  `detalle-evaluaciones-con-notas.html`, `detalle-evaluaciones-np.html`,
  `detalle-evaluaciones-dos-grupos.html` y `asistencia-curso-900101.html`. El de notas lleva
  notas inventadas con coma y con punto decimal, y el de asistencia lleva faltas inventadas. El fixture de la página del curso conserva la
  línea comentada del nombre con un nombre inventado, para probar que nunca se lee, y valores
  de `min*` y `max*` distintos de cero, para probar que no cambian el resultado.

`[@test] ../../../test/HU37_jeff/parser.nota-curso.test.ts` *(pendiente)*

### RS-BE-60 · Cierre de sesión cuando el inicio de sesión falla a medias

`PortalClient.login` cierra la sesión abierta en el portal cuando falla después de recibir un
`JSESSIONID`, es decir en el segundo factor o en la verificación final. Llama a
`CustomLogoutServlet` con las cookies del frasco, sin esperar más que su `PORTAL_TIMEOUT_MS`,
ignora cualquier error de ese cierre y lanza después el mismo `409 PORTAL_LOGIN_REJECTED` o el
mismo error de red que lanzaría hoy. Vale también para la importación, que usa el mismo
`login`.

`[@test] ../../../test/HU31_jeff/portal.client.login.test.ts` *(pendiente, casos nuevos)*

## Modelo de datos (migración `0015_portal_scores.sql`)

Opción por defecto de la decisión abierta 5. Es aditiva, idempotente y se aplica con
`bun run db:apply drizzle/0015_portal_scores.sql`, con respaldo previo y el permiso explícito
del dueño, antes del despliegue del código. La `0014` es la de
`student_specialty_test_result` en la rama `feat/test-especialidad`.

```sql
CREATE TABLE IF NOT EXISTS student_portal_score (
  id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  enrollment_id integer NOT NULL REFERENCES enrollment(id),
  portal_key varchar(20) NOT NULL,
  group_name varchar(60),
  name varchar(150) NOT NULL,
  week_number smallint,
  weight numeric(5,2) NOT NULL,
  value numeric(4,2),
  mark varchar(10) NOT NULL,
  assessment_id integer REFERENCES assessment(id),
  match_rule varchar(20) NOT NULL,
  CONSTRAINT uq_student_portal_score_key UNIQUE (enrollment_id, portal_key),
  CONSTRAINT chk_student_portal_score_weight CHECK (weight > 0 AND weight <= 100),
  CONSTRAINT chk_student_portal_score_week CHECK (week_number IS NULL OR week_number BETWEEN 1 AND 20),
  CONSTRAINT chk_student_portal_score_value CHECK (value IS NULL OR value BETWEEN 0 AND 20),
  CONSTRAINT chk_student_portal_score_mark CHECK (mark IN ('graded', 'pending', 'np')),
  CONSTRAINT chk_student_portal_score_mark_value CHECK ((mark = 'graded') = (value IS NOT NULL)),
  CONSTRAINT chk_student_portal_score_match CHECK (match_rule IN ('exact', 'exact_other_name', 'week_shift', 'none')),
  CONSTRAINT chk_student_portal_score_match_assessment CHECK ((match_rule = 'none') = (assessment_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_portal_score_assessment
  ON student_portal_score (enrollment_id, assessment_id) WHERE assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_portal_score_enrollment
  ON student_portal_score (enrollment_id);

ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS portal_grades_read_at timestamptz;
ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS portal_attendance_read_at timestamptz;
```

- Por qué una tabla nueva y no `student_score`. `GET /course-detail/sections` promedia
  `student_score` de toda la sección y lo sirve a cualquier alumno o docente
  (`course-detail.routes.ts:70` y `:79`), así que con uno o dos alumnos que recargan ese
  promedio revelaría sus notas. Además el docente vería y podría pisar notas que no carga, las
  estadísticas de HU11 y el estado de carga de HU24 contarían notas del portal como suyas, la
  tabla no tiene procedencia y su `assessment_id NOT NULL` no deja guardar una evaluación sin
  pareja.
- Por qué no `simulated_grades`. Es la proyección del propio alumno y pisarla destruiría su
  trabajo.
- Sin `ON DELETE CASCADE`, como `student_score` y `simulated_grades`. El código no borra
  matrículas.
- `schema.ts` suma `studentPortalScore` y las dos columnas de `enrollment` con los mismos
  nombres, restricciones e índices.

## Costo de una recarga

Con cinco cursos y el orden por defecto de RS-BE-53 son 26 peticiones (8 del inicio de sesión,
1 del menú de Asistencia, 5 de asistencia, 1 del menú de Nota, 5 páginas de curso, 5 marcos y
el cierre) en 22 rondas secuenciales. Si la verificación V3 permite las cadenas en paralelo,
bajan a 14 rondas. Si además el marco responde sin la página del curso, son 20 peticiones en
12 rondas. Todavía no hay ninguna medición del tiempo de una ronda desde `iad1`, y por eso el
presupuesto de RS-BE-50 acota la respuesta y la decisión abierta 15 pide medir antes de
publicar.

## Contrato

Detalle en `docs/specs/api-contracts.md`, secciones Portal Sync, Grades y Schedule.

- `POST /portal-sync/refresh` (RS-BE-49 a RS-BE-56).
- `GET /grades/me/ulima` (RS-BE-57).
- `asistenciaLeidaEn` en `GET /schedule/me/sessions` y `GET /course-detail/sections`
  (RS-BE-58).
- Ningún endpoint existente cambia de forma. La importación suma el rechazo compartido de
  RS-BE-50, el orden de fases y los avisos de RS-BE-48 y la hora de lectura de RS-BE-58.

## Pruebas por requisito

| Requisito | Casos |
| --- | --- |
| RS-BE-48 | Los fixtures de arreglos de hoy (`asistencia-sidebar.html`, `delegado-sidebar.html`, `delegado-sidebar-cuenta2.html`) dan el mismo resultado que hoy, con `origen: "arreglos"`. El menú de lista da las aulas en orden, con `courseCode: null` y la sección del `<li>`. Un `<li>` sin enlace se salta. Un tramo con dos aulas distintas se descarta. Un enlace de otra función no cuenta. Aulas con letras, con 3 dígitos o con 9 se descartan. Una sección no numérica queda `null`. La misma aula con secciones en conflicto se descarta. `class="curso open"` sirve y `curso-body` no. Entidades HTML en el `<li>` se limpian. Una página con los dos formatos usa los arreglos. La página de inicio de sesión da `ok: false`. En el servicio de la importación, la sección del menú distinta de la de la página no escribe asistencia, y un aula de delegados sin curso en el mapa de asistencia no escribe claim y avisa. |
| RS-BE-49 | Cuerpo sin `consent`, con `consent: false`, con `cookies` o con una clave de más da `400`. Sin matrícula activa da `409 IMPORT_REQUIRED` sin llamar al portal. Una segunda recarga simultánea da `409 PORTAL_REFRESH_IN_PROGRESS`. El usuario del inicio de sesión es `app_user.code`. Una página de asistencia de otro alumno aborta con `403` y no escribe nada. El cierre de sesión corre con éxito, con error y con presupuesto agotado. Nunca se escribe en las tablas de la lista de exclusión. |
| RS-BE-50 | El sexto intento en la hora da `429` con `kind: "quota"`. Un rechazo devuelve el cupo y suma al tope. El cuarto rechazo en 15 minutos da `429` con `kind: "rejected_logins"` antes de llamar al portal, también si los rechazos vienen de la importación. Nunca hay más de 5 peticiones en vuelo. Con un reloj falso, ninguna petición empieza después del presupuesto, los cursos pendientes quedan `not_reached` y el aviso sale una sola vez. |
| RS-BE-51 | Página de otro ciclo, `prm_sAaCicl` o `prm_sNuCicl` mal formados, curso sin matrícula, triple incoherente y fallo de red, cada uno con su estado y sin tocar la fila. La hora de lectura cambia solo cuando el `UPDATE` toca la fila. |
| RS-BE-52 | Identificación correcta. La línea comentada con el nombre nunca aparece en el resultado. `min*` y `max*` distintos de cero no cambian nada. Marco de otra aula, marco ausente, `codCurso` ausente y página de inicio de sesión dan su motivo. Un agregado 0 da `null`. La etiqueta «Eval. Continua<br>2» sale con espacio. |
| RS-BE-53 | Cabecera correcta e incorrecta. Las 20 celdas vacías del sondeo, reproducidas con datos inventados. Nota con punto, con coma, `NP`, `np`, `&nbsp;`, `21`, `-1`, `A` y `14.555`. Semana vacía, 0, 21 y con letras. Peso 0, 101 y con coma. Suma de 99,6 y de 100,4 aceptadas, de 99 rechazada. Dos grupos con pesos absolutos aceptados y con pesos relativos rechazados. Hoja huérfana, tercer nivel, id repetido y fila de cinco celdas rechazados. Un nombre con tilde y eñe en bytes ISO-8859-1 llega intacto. El chequeo del promedio avisa cuando difiere en más de 0,5 y calla cuando falta una nota. |
| RS-BE-54 | Los patrones del hallazgo 5 con datos inventados, es decir ordinal final («Examen escrito 1/2/3»), ordinal con N («N1/N2/N3»), ordinal sin repetición («Exposición 1»), ordinal por nombre y no por posición, semana corrida en 1 (`week_shift`), en 3 (`none`), peso distinto (`none`), dos candidatas en la misma semana que desempata el nombre, empate sin salida (`none`), sílabo vacío y una candidata que nunca se empareja dos veces. El aviso de sílabo desactualizado sale con la mitad o más sin pareja. |
| RS-BE-55 | El candado se toma antes de escribir. Un curso leído reemplaza todas sus filas y uno fallido conserva las suyas. Las filas cumplen los CHECK de la migración. |
| RS-BE-56 | Forma de la respuesta con éxito parcial. Precedencia de errores sin ningún curso leído. `PORTAL_UNREADABLE` cuando los dos menús vienen en un formato desconocido. `Cache-Control: no-store`. |
| RS-BE-57 | Solo matrículas activas del período activo, del propio alumno. Curso nunca leído con `lastReadAt: null`. Orden por semana. Sin período activo responde vacío. Un token docente da `403`. |
| RS-BE-58 | El campo nuevo en las dos rutas, `null` en filas de docente y de asesoría, y la importación fija la hora. |
| RS-BE-59 | Cada lector devuelve exactamente los campos de su tipo. Con un registrador espía, ningún mensaje de la recarga contiene la contraseña, el código del autenticador, las cookies, una nota, un nombre ni un fragmento del HTML. Los fixtures nuevos solo contienen los códigos y nombres inventados de la lista de datos de ejemplo. |
| RS-BE-60 | Un rechazo en el segundo factor y uno en la verificación final llaman al cierre de sesión con las cookies del frasco y lanzan el mismo `409`. Un fallo del cierre no cambia el error. |

## Cambios en otras specs

Todos son propuesta y siguen el estado de esta spec.

- `asistencia-portal.spec.md`. El formato de lista del menú (RS-BE-48), el parámetro
  `cicloEsperado` de `parseAsistenciaCurso` (RS-BE-51), la hora de lectura (RS-BE-58), la
  muestra con faltas del 2026-09-25 en «Cobertura conocida y sesgada» y la reutilización del
  parser en la recarga.
- `portal-sync.spec.md`. RS-BE-4 y el inventario de §Privacidad y base legal, el orden de las
  fases de asistencia y delegados, el tope compartido de rechazos, la nota de que las notas
  parciales vienen del panel Nota y no de `ComandoListarConsNotas`, y el reemplazo de un código
  de alumno real por una descripción.
- `delegados-portal.spec.md`. RS-1 (dos formatos) y RS-11 (el par sale del mapa de asistencia
  cuando el menú no trae el curso).
- `grades.spec.md`. `GET /grades/me/ulima` (RS-BE-57).
- `official-grades.spec.md`. El papel de `/mis-notas` (decisión abierta 10).
- `schedule.spec.md` y `course-detail.spec.md`. `asistenciaLeidaEn` (RS-BE-58).
- `docs/specs/api-contracts.md`. Las dos rutas nuevas, el campo nuevo y la corrección de la
  frase según la cual la importación no toca las horas de asistencia, con el `summary`, los
  avisos, el `token` y los errores que le faltaban.
- `docs/specs/feature-index.md`. La funcionalidad nueva y el estado de la asistencia.
- `AGENTS.md` y `KNOWLEDGE.md`, solo con la decisión abierta 12.

## Qué NO entra

- Guardar o mostrar la mínima, la máxima o los agregados de la clase.
- Rankings, frecuencias de notas o cualquier otro servlet del Aula Virtual con datos de
  terceros, y cualquier ruta con `prm_sCoUserAlum`.
- Crear período, curso, sección, matrícula o evaluaciones del sílabo desde la recarga. Sembrar
  `assessment` desde el portal mezclaría el calendario de una sección con el de toda la oferta.
- Tocar `simulated_grades`, `student_score` o el módulo `official-grades`.
- Recordar la contraseña o el código. Cada recarga los pide de nuevo.
- Fechas por sesión de la asistencia. Se guardan solo los tres totales, como en RS-BE-15.
- Notificaciones cuando la ULima publica una nota.
- La pantalla, la hoja y los textos de la app, que van en la spec del frontend con la maqueta
  aprobada.

## Decisiones abiertas

Cada una trae la opción que la spec adopta por defecto y sus alternativas. Ninguna está
aprobada. La numeración no cambia aunque se resuelvan, porque la citan los requisitos.

1. **RS-BE-48 como corrección aparte.** *Pendiente del dueño.* Por defecto, sí. Va primero, en
   un PR propio sobre `main`, con sus pruebas, sin cambio de BD ni de contrato, y se despliega
   antes que el resto porque hoy la importación no actualiza la asistencia de nadie.
   Alternativa, publicarlo junto con la recarga, lo que deja el fallo en producción hasta
   entonces.
2. **Endpoint propio o importación completa.** *Pendiente del dueño.* Por defecto, el endpoint
   propio `POST /portal-sync/refresh`, con un inicio de sesión, solo los paneles Nota y
   Asistencia, cupo propio y tope de rechazos. Alternativa, que los botones repitan
   `POST /portal-sync/import` con la pantalla de consentimiento en cada toque, 1 de los 5 cupos
   y una duración sin medir, y que además sume la lectura del panel Nota.
3. **Cupo y tope de rechazos.** *Pendiente del dueño.* Por defecto, 5 recargas por hora por
   alumno, aparte de las 5 de la importación, y 3 inicios de sesión rechazados cada 15 minutos,
   contados junto con los de la importación. Alternativas, compartir las 5 por hora con la
   importación, otros números, o un tope de rechazos solo para la recarga.
4. **Consentimiento en cada recarga.** *Pendiente del dueño.* Por defecto, el aviso de la hoja
   aprobada («Al tocar “Actualizar” aceptas que ULima++ lea en miUlima tus notas parciales y
   tu asistencia. La contraseña y el código se usan una sola vez y no se guardan.») y
   `consent: true` obligatorio en el cuerpo, sin tocar el texto congelado de
   `PortalConsentView` que usan `/registro` y la prueba HU34. Alternativa, una casilla en la
   hoja, sin marcar, que habilita «Actualizar», también en cada recarga.
5. **Tabla, hora de lectura y migración.** *Pendiente del dueño, con aprobación de BD.* Por
   defecto, la tabla `student_portal_score` y las columnas `enrollment.portal_grades_read_at` y
   `enrollment.portal_attendance_read_at`, en la migración `0015_portal_scores.sql`.
   Alternativas, otro nombre para la tabla, la hora de las notas como columna de cada fila, o
   una tabla aparte de lecturas por matrícula.
6. **Nota simulada cuando la ULima publica la misma evaluación.** *Pendiente del dueño.* Por
   defecto, el backend no toca `simulated_grades`, la app muestra la nota de la ULima en lugar
   de la simulada, como dice la maqueta aprobada, y la simulada reaparece si la ULima retira
   la nota. Alternativa, borrar la simulada al guardar la nota de la ULima.
7. **Notas de la ULima sin pareja en el sílabo.** *Pendiente del dueño.* Por defecto, se
   muestran en `/mis-notas`, no entran a la calculadora y la calculadora avisa que el sílabo
   cargado no coincide con la ULima en ese curso, para no contar dos veces el mismo peso.
   Alternativa, que entren a la calculadora como filas «ULima» con su peso, aunque la suma de
   pesos pueda pasar de 100.
8. **«NP».** *Pendiente del dueño.* Por defecto, se guarda como marca `np` sin valor, la app
   lo muestra como «NP» y lo cuenta como 0 en el promedio, pendiente de confirmar con el
   reglamento. Alternativas, no contarlo en el promedio, o hacer fallar al curso hasta tener
   una muestra.
9. **Umbral de aprobación único.** *Pendiente del dueño.* Por defecto, 10,5, que vale si la
   ULima redondea el promedio final y es el umbral que ya usan `/mis-notas` y las alertas.
   Alternativa, 11 si no lo redondea, que es el que usa hoy la calculadora. Se confirma con el
   cotejo de RS-BE-53, punto 7, cuando cierre un curso.
10. **Papel de `/mis-notas` y de las notas que carga el docente.** *Pendiente del dueño.* Por
    defecto, `/mis-notas` lee `GET /grades/me/ulima`, `GET /official-grades/me` sigue
    disponible sin cambios y el módulo del docente no cambia, pero sus notas dejan de tener
    pantalla de alumno. Alternativas, mostrar las dos por evaluación con la de la ULima
    mandando, o retirar la carga docente.
11. **Alertas de riesgo y chatbot.** *Pendiente del dueño.* Por defecto, no leen las notas de
    la ULima en esta entrega y siguen como hoy. Alternativa, que `academic_risk` y el chatbot
    las lean, cada uno con su enmienda de spec.
12. **Regla de `AGENTS.md` y `KNOWLEDGE.md`.** *Pendiente del dueño.* Hoy dicen que las notas
    de la calculadora son personales y no oficiales. Por defecto, cambian en el PR de
    implementación, al aprobarse la spec, con este texto. «La calculadora muestra además, fijas
    y con la marca “ULima”, las notas parciales que publica la ULima (tabla
    `student_portal_score`, que escribe solo `POST /portal-sync/refresh`). Las notas que el
    alumno registra siguen siendo personales y no oficiales, en `simulated_grades`.»
    `KNOWLEDGE.md` corrige además la línea que llama personales a las notas de
    `student_score`. Alternativa, otro texto o no tocar la regla, y entonces la calculadora no
    puede mostrar las notas de la ULima.
13. **La importación completa también lee el panel Nota.** *Pendiente del dueño.* Por defecto,
    no, para no alargar una importación sin medir. Alternativa, sumarle la fase de notas.
14. **Borrado de las notas de la ULima a pedido del alumno.** *Pendiente del dueño.* Por
    defecto, sin endpoint nuevo en esta entrega, igual que el resto del inventario de
    `portal-sync`. Alternativa, `DELETE /grades/me/ulima`, que borra las filas del alumno y sus
    horas de lectura de notas.
15. **Medición desde `iad1` antes de publicar.** *Pendiente del dueño.* Por defecto,
    obligatoria. Con la `0015` aplicada, el dueño corre tres recargas con su cuenta desde un
    despliegue en `iad1` y se publica solo si las tres terminan en 45 s o menos y sin `504`,
    con las duraciones por fase del registro de RS-BE-50. Como Preview comparte la base de
    producción, esas recargas escriben solo las filas del dueño. Alternativas, otro umbral, o
    publicar confiando solo en el presupuesto.
16. **Quién carga las evaluaciones del sílabo en los ciclos futuros.** *Pendiente del dueño.*
    Por defecto, la misma carga manual del 2026-09-04, a cargo del dueño antes de cada ciclo.
    Mientras no se haga, las notas de la ULima quedan con `match: "none"` y solo se ven en
    `/mis-notas`. Alternativa, una spec aparte para un cargador desde los PDF del sílabo.
17. **Sondeos de solo lectura con la cuenta del dueño.** *Pendiente del dueño.* Por defecto,
    autorizados para las verificaciones V1 a V4, con scripts desechables fuera del repositorio,
    solo `GET` sobre los propios datos, el cierre de sesión al final y nada guardado dentro de
    un repo. Alternativa, implementar sin sondear, con el riesgo de que el lector falle justo
    cuando salga la primera nota.
18. **Mostrar el «Promedio» que publica la ULima.** *Pendiente del dueño.* Por defecto, no se
    guarda ni se muestra, y solo sirve al chequeo de RS-BE-53, punto 7. Alternativa, devolverlo
    en `GET /grades/me/ulima` cuando valga más que 0.

## Verificación antes de publicar

- **V1, antes de implementar RS-BE-52.** Se lee sin sesión `/portalUL/av/scripts/aVirtualBB.js`
  y se fija la ruta y el único parámetro de `OpenNotaAlumnoPrePost`. Con sesión, se registra
  el `Content-Type` de la página del curso y del marco, y si el portal exige `Referer` en esas
  rutas.
- **V2, cuando la ULima publique la primera nota.** Sondeo del marco de evaluaciones para ver
  una nota con valor (punto o coma, decimales), si existe «NP» u otra marca y si el grupo
  `EVC` muestra su promedio. El lector y sus fixtures se ajustan con esa muestra antes de
  publicar, y el fixture nuevo se construye a mano con datos inventados.
- **V3.** Se pide el marco de dos aulas intercaladas, sin abrir antes la página de su curso y
  abriéndola, y se compara con el orden secuencial. Solo si todo coincide se habilitan las
  cadenas en paralelo o la variante corta de RS-BE-53.
- **V4.** Sondeo del menú de Delegado para confirmar que usa el mismo formato de lista antes
  de publicar la parte de delegados de RS-BE-48.
- **V5.** La medición de la decisión abierta 15.
- `bun run build` y `bun test` en verde, con las pruebas de «Pruebas por requisito» enlazadas
  y sin la marca *(pendiente)*.
