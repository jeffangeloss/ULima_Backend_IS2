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
  # AGENTS.md y KNOWLEDGE.md entran por la decisión abierta 12, aprobada el 2026-09-26, en el PR de la recarga.
  - ../../../AGENTS.md
  - ../../../KNOWLEDGE.md
---

# Recarga de notas parciales y asistencia desde la ULima

> Estado. **APROBADA** por el dueño del proyecto el 2026-09-26 en la página de decisiones de la
> recarga, con todas las decisiones abiertas en la opción que la spec adopta por defecto, que es
> la recomendada, y lo confirma en el chat el mismo día. Esa aprobación suma las decisiones 4 a
> 6 de «Pedido y decisiones del dueño», que fijan el plazo, los ajustes técnicos en bloque y los
> puntos que son solo de la app. Incluye el cambio de base de datos que exige `AGENTS.md`, la
> tabla `student_portal_score` y las dos columnas de `enrollment` de la migración `0015`, con
> borrado en cascada. Aplicar la `0015` en producción pide además, en el momento del
> despliegue, el respaldo y el permiso explícito del dueño, como con la `0012` y la `0013`.
> Pendiente de implementar, empezando por RS-BE-48 en un PR propio (decisión abierta 1).
> Enmienda `asistencia-portal.spec.md`, `portal-sync.spec.md`,
> `delegados-portal.spec.md`, `grades.spec.md`, `official-grades.spec.md`, `schedule.spec.md`
> y `course-detail.spec.md` (ver «Cambios en otras specs»), enmiendas que el dueño aprueba con
> esta spec. La rama `feat/recarga-notas-asistencia` parte de `origin/main` en `f10eb3f`, y
> todas las referencias de línea citan ese estado. Los `[@test]` con la marca *(pendiente)*
> apuntan a pruebas que se crean con la implementación y hoy no existen. Los que llevan
> *(existe, casos nuevos)* o *(existe, se actualiza)* apuntan a pruebas de `test/HU31_jeff/`
> que ya existen (`service.asistencia.test.ts`, `service.delegados.test.ts`,
> `service.import.test.ts`, `parser.asistencia.test.ts`, `parser.asistencia-sidebar.test.ts`,
> `parsers.delegado.test.ts` y `portal.client.login.test.ts`) y solo suman casos o ajustan los
> que cambian de forma. Los ejemplos usan datos inventados (alumno `20230001`, curso `690417`
> TALLER DE PROTOTIPADO, sección `812`, aulas `900101` a `900105`). La contraparte de frontend,
> con la maqueta aprobada, es `ULima_Frontend_IS2/specs/features/recarga-portal/recarga-portal.spec.md`
> (RF-RCG-1 a RF-RCG-11), en la rama `feat/recarga-notas-asistencia-fe`, que el dueño aprueba
> el mismo día en `b8facce` con las mismas decisiones. Sus decisiones B1 a B19 llevan el número
> de «Decisiones abiertas».

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

## Pedido y decisiones del dueño (2026-09-25 y 2026-09-26, vinculantes)

Las decisiones 1 a 3 son el pedido del 2026-09-25. Las 4 a 6 salen de la aprobación de las
specs del 2026-09-26, en la que el dueño elige la opción recomendada en cada punto.

| # | Decisión | Requisitos |
| --- | --- | --- |
| 1 | Botones de recarga junto a las notas y junto a la asistencia, que vuelven a pedir los datos a la ULima con la contraseña de miUlima y el código del autenticador (SecurID de un solo uso), para traer la asistencia real y las notas parciales por evaluación del Aula Virtual. | RS-BE-49 a RS-BE-58 |
| 2 | Un solo inicio de sesión trae notas y asistencia juntas, y cualquiera de los dos botones actualiza ambas. | RS-BE-49 |
| 3 | La calculadora conserva su diseño actual y solo se reorganiza según la maqueta aprobada (`calculadora-reorganizada.html`). Los tres cambios, el resto que no cambia y lo que cada uno pide al backend están en «Diseño aprobado de la app». | RS-BE-56, RS-BE-57, RS-BE-58 |
| 4 | **Plazo de la recarga** (aprobación de las specs, 2026-09-26). La lectura dura como máximo 65 s (`PORTAL_REFRESH_BUDGET_MS`) y la fórmula reserva 3 s para la red del teléfono, igual en el backend y en la app, así que el peor caso del backend queda en 87 s dentro de los 90 s de la app. La spec de la app alinea con este máximo su hueco 5 y su D18, que en `b8facce` todavía describen el máximo anterior de 68 000 sin margen para la red. | RS-BE-50 |
| 5 | **Ajustes técnicos en bloque** (aprobación de las specs, 2026-09-26). Las citas cruzadas entre las dos specs se ponen al día con la de la app en `b8facce` y sus B1 a B19. Una matrícula cuya fila de asistencia salta la guarda de lectura más reciente cuenta como actualizada, igual que un curso de notas cuenta como `read`, y `skipped` queda para los totales que no cuadran. El `429` de cupo de la importación suma `kind: "quota"`, como la recarga. La `0015` se aplica antes de desplegar el código que la usa, porque la importación escribe la columna nueva, y la recarga nunca sale sin RS-BE-48. Si vence el plazo de la app o falla la red, la app vuelve a pedir las notas y da la recarga por guardada si la hora avanzó (D23 de la app). Las verificaciones V1 a V3 fijan la ruta del panel Nota, ajustan el lector con la primera nota publicada y habilitan los pedidos en paralelo solo si V3 lo permite. La recarga de la calculadora tras importar (D16) y el lugar del código y de las pruebas de la app (D20 y D21) son solo de la app. | RS-BE-48, RS-BE-50, RS-BE-51, RS-BE-52, RS-BE-53, RS-BE-55, RS-BE-56, RS-BE-57, RS-BE-58 |
| 6 | **Puntos que son solo de la app** (aprobación de las specs, 2026-09-26). Los cuatro retoques a la maqueta (D8, D11, D13 y D14), el orden del sílabo en la tarjeta (D7), los dos colores que quedan como el resto de la app (D12 y D24) y los detalles de pantalla que fija su spec (D1 a D6, D9, D10, D17, D19 y D22) quedan en la opción recomendada. No cambian nada del backend. | Ninguno |

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
recarga, que sigue consultando solo a ULima++. Las tres primeras filas de la tabla son los tres
cambios de la maqueta, dos en la calculadora y uno en `/mis-notas`. La cuarta sale de la
decisión 1, porque la maqueta no dibuja la ficha del curso, y su diseño está en RF-RCG-8 de la
spec de la app.

| Cambio | Qué pide al backend |
| --- | --- |
| El birrete gris sin texto pasa a una fila «Notas oficiales» con la hora de la última lectura («Última lectura hoy a las 10:42» o «Aún no se actualizan desde la ULima»), con el estilo de «Selecciona un Curso». | `lastReadAt` de `GET /grades/me/ulima` (RS-BE-57). |
| `/mis-notas` conserva su diseño y suma la franja «Actualizar desde la ULima» con la última lectura, las evaluaciones de la ULima con semana, peso y nota o «Sin nota», la hoja de recarga (formato del modal «Registrar Nota», «Entras como <código>», contraseña, seis casillas del código, «Actualizar» apagado hasta completar y aviso de que nada se guarda) y el aviso rojo persistente con «Reintentar» si la lectura falla. | `POST /portal-sync/refresh` (RS-BE-49 a RS-BE-56), sus códigos de error y `GET /grades/me/ulima` (RS-BE-57). El código de «Entras como» ya lo tiene la app. |
| En la calculadora, cada evaluación con nota de la ULima aparece como una fila de `nota_tile` con la marca «ULima» y sin tacho, y cuenta en el promedio. | `assessmentId` y `value` de cada evaluación en `GET /grades/me/ulima` (RS-BE-54, RS-BE-57). La maqueta muestra solo evaluaciones con pareja en el sílabo, y el caso sin pareja lo resuelve la decisión abierta 7, aprobada el 2026-09-26. |
| El bloque de asistencia de la ficha del curso lleva su botón de recarga y la hora de la última lectura. | El mismo `POST /portal-sync/refresh` y `asistenciaLeidaEn` en `GET /schedule/me/sessions` y `GET /course-detail/sections` (RS-BE-58). |

## Requisitos

### RS-BE-48 · El menú lateral del Aula Virtual se lee en sus dos formatos

`parseAulas(html, fnEnlace)` acepta el formato de arreglos, que conserva las reglas de RS-1 de
`delegados-portal.spec.md`, y el formato de lista del hallazgo 1. Es el único requisito de esta
spec que corrige un fallo en producción, no necesita cambio de BD ni de contrato y se publica
antes que el resto, en un PR propio (decisión abierta 1, aprobada el 2026-09-26).

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
2. Dentro de ese tramo se buscan las llamadas `fnEnlace('<argumento>')`, con comillas simples
   o dobles y un argumento de hasta 20 caracteres sin comillas ni `<>`, y se cuentan sus
   argumentos distintos antes de validarlos. Un tramo sin llamadas se descarta, porque ese
   curso no ofrece el panel. Un tramo con dos argumentos distintos se descarta entero, aunque
   uno de ellos no sea un aula válida, porque no hay forma segura de saber cuál es la suya. Un
   tramo con exactamente un argumento aporta esa aula si pasa el punto 3.
3. El aula se valida con `^\d{4,8}$`, el mismo criterio de `assertAula`, y un argumento que no
   cumple descarta el tramo.
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

- **Asistencia de la importación.** Identifica cada curso por los ocultos de la página de
  detalle (`prm_sCoCurs`, `prm_sCoSecc`), así que el formato de lista no le cambia la
  escritura. Sí le cambia los avisos de un aula cuya página falla, que hoy se arman con
  `${a.courseCode}/${a.sectionCode}` (`portal-sync.service.ts:321` en delegados y `:395` en
  asistencia) y con el menú de lista saldrían «de null/812». Rige la atribución de abajo. Se
  agrega además un contraste. Cuando el aula trae `sectionCode` del menú y la página declara
  otra sección, ese curso no se escribe, el aula no entra al mapa aula → (curso, sección) y se
  emite `PARSER_FAILED` con `block: "asistencia"` y el mensaje fijo «La sección del menú no
  coincide con la de la página de asistencia del aula <aula>.».
- **Delegados de la importación.** La fase de asistencia pasa a correr antes que la de
  delegados, las dos fuera de la transacción y una después de la otra, como hoy. Para un aula
  con `courseCode: null`, la fase de delegados toma el curso y la sección del mapa aula →
  (curso, sección) de la misma importación, que se arma con la identificación verificada de
  cada página de asistencia (RS-BE-51, punto 4), porque el aula es el mismo número en los tres
  paneles. Consulta ese mapa antes de pedir la nómina, así que un aula sin curso conocido no
  gasta ninguna petición. Si el aula no está en el mapa, sus delegados no se escriben y se
  emite `PARSER_FAILED` con `block: "delegado"` y el mensaje fijo «No se pudo identificar el
  curso del aula <aula>.». Si el menú trae una sección y el mapa dice otra, rige la misma
  regla. El aviso de RS-11 («Ninguna de las aulas del panel de delegados empató con tu
  matrícula») se mide sobre las aulas identificadas. La nómina no cambia (RS-2 a RS-7 de
  `delegados-portal.spec.md`).
- **Recarga.** RS-BE-51 y RS-BE-52 usan el mismo parser con `OpenAsistenciaAlumno` y
  `OpenNotaAlumnoPrePost`. Los dos menús llegan hoy en formato de lista, así que sin este
  requisito la recarga no encuentra ningún aula y toda recarga termina en
  `502 PORTAL_UNREADABLE`, no solo la de asistencia. Por eso la recarga nunca se despliega sin
  RS-BE-48 («Verificación antes de publicar»).

**Atribución de un aula sin curso conocido.** Con el menú de lista, un aula cuya página falla
(en la descarga, en la lectura o porque se agota el presupuesto) no dice de qué curso es. La
regla es la misma en la importación y en la recarga.

1. El curso y la sección de un aula salen, en este orden, de los arreglos del menú, de la
   identificación verificada de su propia página (RS-BE-51, punto 4, y RS-BE-52, punto 6) o
   de la identificación verificada de la página de la misma aula en el otro panel. Si
   ninguna la da, el aula queda sin curso conocido.
2. Los avisos de cada aula se arman al final, cuando ya terminan todas las fases. Con curso
   conocido nombran `<curso>/<sección>`, y sin él nombran el aula, como en «No se pudo traer la
   asistencia del aula 900101.» o «No se entendió la asistencia del aula 900101» seguido del
   motivo. Ningún aviso lleva `null`.
3. La importación no tiene fase de notas, así que con el menú de lista el aula de una página
   de asistencia que falla queda sin curso conocido y su aviso nombra el aula.
4. En la recarga, un aula sin curso conocido no se atribuye a ninguna matrícula, y el estado
   de cada matrícula sigue RS-BE-56.

Los mensajes llevan solo literales fijos y valores ya validados con una regex de dígitos.

`[@test] ../../../test/HU31_jeff/parser.aulas-lista.test.ts` *(pendiente)*
`[@test] ../../../test/HU31_jeff/parser.asistencia-sidebar.test.ts` *(existe, se actualiza)*
`[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts` *(existe, se actualiza)*
`[@test] ../../../test/HU31_jeff/service.asistencia.test.ts` *(existe, casos nuevos)*
`[@test] ../../../test/HU31_jeff/service.delegados.test.ts` *(existe, casos nuevos)*

`parser.asistencia-sidebar.test.ts:17` y `parsers.delegado.test.ts` comparan el resultado de
`parseAulas` con `toEqual`, así que sus objetos esperados suman `origen: "arreglos"`.

### RS-BE-49 · Endpoint de recarga, un solo inicio de sesión

`POST /portal-sync/refresh` lee en miUlima la asistencia y las notas parciales del alumno
autenticado con un solo inicio de sesión. Es la opción que el dueño aprueba en la decisión
abierta 2.

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
  3. No hay otra recarga ni una importación con `credentials` del mismo alumno en curso en
     esta instancia. Si la hay, `409 PORTAL_REFRESH_IN_PROGRESS` con el mensaje fijo «Ya hay
     una lectura de miUlima en curso. Espera a que termine.», porque dos inicios de sesión casi
     simultáneos gastan el mismo código de un solo uso y el segundo se leería como un rechazo.
     RS-BE-50 dice cómo la importación respeta la misma guarda.
  4. El tope de inicios de sesión rechazados de RS-BE-50, que se revisa justo antes de iniciar
     sesión. El cupo por hora lo descuenta antes un middleware, como en la importación, y
     RS-BE-50 dice cuándo se devuelve.
- **Inicio de sesión.** Una sola llamada a `PortalClient.login(app_user.code, password,
  passcode)`, el mismo flujo de la importación con credenciales, con el plazo de RS-BE-50. El
  usuario del portal nunca viene del cliente. La contraseña y el código se usan en esa llamada
  y se descartan.
- **Ronda de apertura y ciclo, antes de leer ningún curso.** Tras el inicio de sesión, una
  ronda pide en paralelo `layout.jsp`, el menú de Asistencia y el menú de Nota.
  `parseCicloActivo(layout)` da el ciclo que muestra la ULima, el mismo que usa la
  importación. Si la petición de `layout.jsp` falla, la recarga termina con el error de esa
  petición, y si la página llega sin ciclo legible, con `502 PORTAL_UNREADABLE`. Si ese ciclo
  difiere del código del período activo de ULima++, la recarga termina con
  `409 IMPORT_REQUIRED` y el
  mensaje fijo «La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.», sin pedir
  ninguna página de curso y sin escribir nada. La misma respuesta sale si después alguna
  página de asistencia declara otro ciclo (RS-BE-51, punto 3). La guarda existe porque la
  página de notas y su marco no traen ciclo, y entre el cambio de ciclo en la ULima y la
  importación que activa el período nuevo las matrículas viejas siguen activas, así que un
  curso llevado otra vez con el mismo código de sección recibiría notas del ciclo nuevo
  emparejadas con el sílabo viejo (decisión abierta 19).
- **Fases, fuera de la transacción.** Primero la asistencia (RS-BE-51) y después las notas
  (RS-BE-52 y RS-BE-53). La asistencia va primero porque su mapa aula → (curso, sección)
  sirve para contrastar el panel Nota.
- **Escritura.** Una sola transacción al final (RS-BE-55).
- **Cierre de sesión.** `logout` corre en un `finally` siempre que exista una sesión, con éxito,
  con error o por presupuesto agotado. RS-BE-60 cubre el inicio de sesión que falla a medias.
- **Identidad.** La sesión es del alumno por construcción, porque el backend inicia sesión con
  `app_user.code` y no acepta cookies de afuera. Como defensa adicional, si cualquier página
  de asistencia declara en `prm_sCoUserAlum` un código presente, no vacío y distinto de
  `app_user.code`, la recarga entera se aborta con `403 PORTAL_IDENTITY_MISMATCH` y no escribe
  nada. Para eso `parseAsistenciaCurso` marca ese caso, y solo ese, con
  `identityMismatch: true`. Un `prm_sCoUserAlum` ausente o vacío es un fallo común de lectura
  de ese curso, con el motivo fijo «la página no trae el código de alumno», mientras que hoy
  los dos casos comparten motivo (`asistencia.ts:55-59`). La importación conserva su
  comportamiento de hoy ante los dos, un aviso por curso, porque ya verifica la identidad con
  el consolidado de matrícula.
- **Lo que la recarga nunca toca.** Período, semanas, cursos, ofertas, docentes, secciones,
  horarios, sílabos, `assessment`, progreso, récord, alertas, claims de delegados,
  `section_representative`, `student_score` y `simulated_grades`. En `enrollment` escribe
  solo las tres horas de asistencia y las dos horas de lectura de la migración `0015`.

`[@test] ../../../test/HU37_jeff/refresh.schemas.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.service.test.ts` *(pendiente)*

### RS-BE-50 · Cupo, intentos rechazados, concurrencia y presupuesto de tiempo

Es la opción que el dueño aprueba en la decisión abierta 3, con el plazo de la decisión 4.

- **Cupo propio.** 5 recargas por alumno por hora, en un almacén propio
  (`portalRefreshRateLimit`), separado de los 5 de la importación. Se descuenta antes de
  trabajar y se devuelve cuando la recarga termina sin haber enviado ninguna petición al
  portal, es decir ante `INVALID_JSON_BODY`, `INVALID_REQUEST_BODY`, el `IMPORT_REQUIRED` de la
  condición previa 1, `PORTAL_IDENTITY_UNVERIFIABLE`, `PORTAL_REFRESH_IN_PROGRESS` y el `429`
  del tope de rechazos. Se devuelve también ante `PORTAL_LOGIN_REJECTED`, con el criterio de la
  importación, porque quien se equivoca al tipear su propio código no tiene por qué perder el
  cupo. El `409 IMPORT_REQUIRED` por cambio de ciclo de RS-BE-49 no lo devuelve, porque llega
  después de iniciar sesión y de pedir páginas. Al agotarse responde `429 RATE_LIMITED` con
  `details: { retryAfterMinutes, kind: "quota" }` y el mensaje «Demasiadas actualizaciones.
  Intenta de nuevo en N minuto(s).». Cada respuesta lleva `X-RateLimit-Remaining`.
- **Tope de inicios de sesión rechazados.** 3 rechazos cada 15 minutos por alumno, en un
  almacén en memoria que comparten la recarga y `POST /portal-sync/import` con
  `credentials`, porque protegen la misma cuenta de miUlima de un bloqueo. En la recarga se
  revisa justo antes de `PortalClient.login`. En la importación se revisa dentro de la rama con
  `credentials` de `importFromPortal`, después de leer `app_user.code` y antes de
  `this.client.login` (`portal-sync.service.ts:146-153`), y un `PORTAL_LOGIN_REJECTED` que
  lanza ese `login` suma un rechazo. La importación con `cookies` no inicia sesión, así que ni
  revisa ni suma. `POST /auth/register` tampoco, porque llama a `PortalClient.login` por su
  cuenta (`auth.service.ts:236`), no tiene `studentId` y ya tiene su propio contador por
  código. Al llegar al tope, las dos rutas responden `429 RATE_LIMITED` con
  `details: { retryAfterMinutes, kind: "rejected_logins" }` y el mensaje «Demasiados intentos
  con datos rechazados. Intenta de nuevo en N minuto(s).», sin llamar al portal, y las dos
  devuelven su cupo por hora. Devolver el cupo por hora ante un rechazo no borra el rechazo de
  este contador. Para la importación es un `429` nuevo en su contrato.
- **Cupo de la importación.** Su `429` de cupo, que hoy solo trae `retryAfterMinutes`, suma
  `details.kind: "quota"`, un campo aditivo que lo alinea con la recarga (decisión abierta 3).
- **Guarda de inicio de sesión en curso.** La guarda de la condición previa 3 de RS-BE-49 es un
  registro en memoria por alumno que marcan la recarga y la importación con `credentials` desde
  antes de iniciar sesión hasta el cierre. La recarga rechaza si hay cualquiera de las dos en
  curso. La importación con `credentials` la revisa antes del tope de rechazos, y si hay una
  recarga en curso responde `409 PORTAL_REFRESH_IN_PROGRESS` sin llamar al portal y devuelve su
  cupo. Entre dos importaciones rige lo de hoy.
- **Límite del mecanismo.** Los contadores y la guarda viven en la memoria de cada instancia,
  como los de hoy, así que no son límites globales.
- **Concurrencia.** Nunca hay más de 5 peticiones simultáneas sobre la misma sesión del portal,
  el mismo tope que ya asume la importación.
- **Presupuesto de tiempo.** `PORTAL_REFRESH_BUDGET_MS`, variable nueva en `src/config/env.ts`
  validada con Zod como entero entre 20 000 y 65 000, con 60 000 por defecto. El máximo de
  65 000, con 3 s reservados para la red, lo aprueba el dueño el 2026-09-26 para el backend y
  la app (decisión 4), y la spec de la app alinea con él su hueco 5 y su D18 para su plazo de
  90 s.
  `config.portal.refreshBudgetMs` vale el menor entre ese valor y
  81 000 − 2 · `PORTAL_TIMEOUT_MS`, que resta a los 90 s de la app una petición en vuelo y el
  cierre de sesión (2 · `PORTAL_TIMEOUT_MS`), 6 s para la transacción y la respuesta y 3 s para
  la red entre el teléfono y el backend. La validación del entorno falla al arrancar si ese
  menor queda por debajo de 20 000, lo que solo ocurre con un `PORTAL_TIMEOUT_MS` mayor que
  30 500. Con los 8 000 por defecto, la fórmula da justo 65 000.
  El presupuesto cuenta desde que el controlador recibe la petición y cubre también el inicio
  de sesión.
  - `PortalClient.login` recibe un plazo opcional (`deadline`), que la importación y el
    registro no pasan. Con plazo, ningún salto del inicio de sesión empieza después del plazo,
    y el temporizador de cada salto es el menor entre `PORTAL_TIMEOUT_MS` y el tiempo que
    queda, porque un inicio de sesión a medias no sirve de nada. Si el plazo vence durante el
    inicio de sesión, la respuesta es `504 PORTAL_TIMEOUT`, después del cierre de RS-BE-60.
  - Pasado el presupuesto no se inicia ninguna petición nueva al portal, salvo el cierre de
    sesión. Las peticiones de las fases que están en vuelo terminan con su propio
    `PORTAL_TIMEOUT_MS`. Los cursos que no alcanzan a leerse quedan como `not_reached` y la
    respuesta suma un único aviso `REFRESH_BUDGET_EXCEEDED`. Si el presupuesto se agota antes
    de leer ningún curso, la respuesta es `504 PORTAL_TIMEOUT`.
  - El peor caso suma el presupuesto, una petición de fase en vuelo (`PORTAL_TIMEOUT_MS`), la
    transacción y la respuesta (6 s de margen) y el cierre de sesión (`PORTAL_TIMEOUT_MS`), y
    con la fórmula nunca pasa de 87 s, así que quedan 3 s del plazo de 90 s de la app para la
    red. Con los valores por defecto son 60 + 8 + 6 + 8 = 82 s, y con el máximo,
    65 + 8 + 6 + 8 = 87 s. Mientras la red no pase de esos 3 s, el backend termina y suelta la
    guarda antes de que venza el plazo de la app, y un «Reintentar» inmediato no choca con
    `PORTAL_REFRESH_IN_PROGRESS`, como supone la spec de la app. Los márgenes de 6 s y de 3 s no
    están medidos y los comprueba V5.
- **Registro.** Por fase, la duración en milisegundos, el número de peticiones y sus estados
  HTTP. Nunca cuerpos, cookies, contraseña, código, notas, nombres ni códigos de alumno.

`[@test] ../../../test/HU37_jeff/refresh.rate-limit.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.budget.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/env.refresh-budget.test.ts` *(pendiente)*
`[@test] ../../../test/HU31_jeff/service.import.test.ts` *(existe, casos nuevos)*
`[@test] ../../../test/HU31_jeff/portal.client.login.test.ts` *(existe, casos nuevos)*

### RS-BE-51 · Asistencia en la recarga

1. El menú `PORTAL_PATHS.cursosAsistencia`, pedido en la ronda de apertura de RS-BE-49, y
   `parseAulas(html, "OpenAsistenciaAlumno")`.
2. Por cada aula, `GET` de `PORTAL_PATHS.asistenciaAlumno(aula)`, en paralelo con el tope de
   RS-BE-50, y `parseAsistenciaCurso(html, aula, app_user.code, cicloEsperado)`.
3. **Ciclo.** `parseAsistenciaCurso` recibe un cuarto parámetro opcional, `cicloEsperado`
   (`"AAAA-N"`). Cuando llega, exige `prm_sAaCicl` con `^\d{4}$` y `prm_sNuCicl` con `^[0-3]$`,
   y que `"<prm_sAaCicl>-<prm_sNuCicl>"` sea igual a `cicloEsperado`. Si no, devuelve
   `ok: false` con el motivo fijo «la página es de otro ciclo», y cuando los dos ocultos están
   bien formados y solo difiere el ciclo, marca además `otroCiclo: true`. La recarga pasa el
   código del período activo y ante `otroCiclo` termina con `409 IMPORT_REQUIRED` sin escribir
   nada (RS-BE-49). La importación pasa `ciclo.data.periodCode`, el ciclo que acaba de leer de
   `layout.jsp`, y ante `otroCiclo` emite el aviso de ese curso sin abortar.
   `AsistenciaCurso` sigue con sus cinco campos.
4. **Identificación verificada.** El curso y la sección salen de la página, nunca del menú. La
   identificación verificada de una página es el par (curso, sección) que declara cuando
   además `prm_sNuAula` es el aula pedida, `prm_sCoUserAlum` es el del alumno y, con
   `cicloEsperado`, el ciclo coincide. `parseAsistenciaCurso` la devuelve en
   `identificado: { courseCode, sectionCode }` también cuando la página falla después, en los
   totales o en el cotejo con las sesiones. El mapa aula → (curso, sección) de RS-BE-48 y
   RS-BE-52 se arma con esas identificaciones y no solo con las páginas que se leen enteras,
   así que un curso cuya página falla en los totales conserva sus delegados y su contraste de
   notas. Si el menú trae una sección distinta, rige el contraste de RS-BE-48 y el aula no entra
   al mapa.
5. La matrícula se resuelve en memoria por el par (curso, sección) contra las matrículas
   activas del alumno en el período activo, que ya trae la consulta de la condición previa 1.
   Un curso de miUlima sin matrícula en ULima++ no se escribe y suma el aviso `NOT_ENROLLED`.
6. La escritura es la de RS-BE-15 (`resolveAttendanceHours` y `updateAttendanceHours`, un solo
   `UPDATE` por asignación con el CHECK replicado en el `WHERE`), y el mismo `UPDATE` fija
   `portal_attendance_read_at` en el instante en que llega la respuesta de esa página, con la
   guarda de lectura más reciente de RS-BE-55. Unos totales que `resolveAttendanceHours`
   rechaza no llegan al `UPDATE` y dejan la matrícula `skipped`, que queda solo para los
   totales que no cuadran. Como ese chequeo en memoria ya cubre el CHECK replicado en el
   `WHERE`, un `UPDATE` que no toca la fila solo se debe a la guarda, porque la fila ya tiene
   una lectura más reciente. Esa matrícula cuenta como `updated`, igual que un curso de notas
   que salta su guarda cuenta como `read` (RS-BE-55), y la fila conserva sus horas y su hora de
   lectura, que son las más nuevas (decisión 5).
7. Un fallo de descarga o de lectura no toca la fila. Nunca se escribe 0 por un fallo.

`[@test] ../../../test/HU37_jeff/refresh.asistencia.test.ts` *(pendiente)*
`[@test] ../../../test/HU31_jeff/parser.asistencia.test.ts` *(existe, casos nuevos de ciclo, identidad e identificación)*
`[@test] ../../../test/HU31_jeff/service.asistencia.test.ts` *(existe, casos nuevos de `cicloEsperado` en la importación)*

### RS-BE-52 · Página de notas de cada curso (identificación y agregados)

**Rutas nuevas en `PORTAL_PATHS`.** Son constantes y lo único interpolado es el aula, validada
por `assertAula`.

- `cursosNota` es `av/servlets/ComandoListarCursosXOpcionAulaVirtualNota`, que se pide en la
  ronda de apertura de RS-BE-49.
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

1. `courseCode` sale de una asignación `codCurso = '<valor>';` al comienzo de una línea, tras
   espacios o tabulaciones opcionales (con `var` opcional y comillas simples o dobles), y
   cumple `^\d{4,6}$`. La página viva indenta cada `var` con tabulaciones, así que un lector
   anclado en `^var` pasaría un fixture sin sangría y fallaría en vivo. Una línea cuyo primer
   carácter distinto de espacio o tabulación empieza un `//` nunca se lee, así que la línea
   comentada con el nombre del alumno queda fuera por construcción. Si falta o no cumple,
   `ok: false` con «la respuesta no es la página de notas de un curso», el mismo motivo que
   recibe la página de inicio de sesión.
2. `sectionCode` sale igual de `seccion = '<valor>';` y cumple `^\d{1,4}$`.
3. La página tiene que traer un `<iframe>` cuyo `name` o `id` sea `ifrTareaAcad` y cuyo `src`
   sea exactamente `/portalUL/gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=<aula>`
   con el aula pedida. Si falta, `ok: false` con «la página no trae el marco de evaluaciones».
   Si el aula difiere, `ok: false` con «la página no corresponde al aula que se pidió».
4. **Agregados.** Se leen solo las asignaciones `notaEP`, `notaTA`, `notaEF` y `notaPROM`, con
   el mismo anclaje del punto 1, con `^\d{1,2}(\.\d{1,2})?$` y valor entre 0 y 20, y sus
   etiquetas `nomEP`, `nomTA`, `nomEF` y `nomPROM`, normalizadas con `clean(stripTags(...))`,
   que convierte el `<br>` de «Eval. Continua<br>2» en espacio. Un 0 se devuelve como `null`,
   porque el portal usa 0 para «sin nota». Un agregado que falta o no cumple se omite y no
   hace fallar al curso.
5. Las asignaciones `min*` y `max*` no se leen nunca. Son datos de la clase entera, es decir de
   terceros, y usan el mismo 0 ambiguo.
6. Si el menú trae una sección y la página declara otra, o si el mapa aula → (curso, sección)
   de la asistencia (RS-BE-51, punto 4) tiene esa aula con otro curso o sección, el curso no
   se escribe y se emite `PARSER_FAILED` con `block: "nota"` y el mensaje fijo «El curso del
   aula <aula> no coincide entre los paneles de miUlima.». Una página que cumple los puntos 1
   a 3 sin caer en este punto da la identificación verificada de la página de notas, que
   RS-BE-48 usa para atribuir un aula cuya página de asistencia falla.
7. **Uso de los agregados.** No se guardan, no se devuelven a la app (decisión abierta 18) y no
   se registran. Solo sirven al chequeo del punto 7 de RS-BE-53.

`[@test] ../../../test/HU37_jeff/parser.nota-curso.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.notas.test.ts` *(pendiente, punto 6)*

### RS-BE-53 · Tabla «Detalle Evaluaciones»

**Orden de las peticiones.** Por cada aula del menú Nota, primero la página del curso y después
su marco, y los cursos uno tras otro. Es la opción segura mientras la verificación V3 no pruebe
que el marco no depende de un estado de sesión que deja la página del curso. Si V3 lo prueba,
las cadenas de cursos distintos pueden correr en paralelo con el tope de RS-BE-50, y si además
el marco responde sin abrir antes la página, la página del curso deja de pedirse y el curso y
la sección salen del mapa de la asistencia (variante corta de «Costo de una recarga»). Mientras
V3 no se haga, este orden es lo único que ata a su curso un marco que no trae ningún
identificador, y por eso tiene su propia prueba.

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
`[@test] ../../../test/HU37_jeff/refresh.notas.test.ts` *(pendiente, orden de las peticiones)*

### RS-BE-54 · Emparejamiento con el sílabo

Función pura `emparejarEvaluaciones(ulima: EvaluacionUlima[], silabo: EvaluacionSilabo[]):
EvaluacionEmparejada[]` en `portal-sync`, con `EvaluacionSilabo = { assessmentId, name,
typeName, week, weight }` y `EvaluacionEmparejada = EvaluacionUlima & { assessmentId: number |
null; match: "exact" | "exact_other_name" | "week_shift" | "none" }`.

- **Candidatas.** Solo las evaluaciones del sílabo de la oferta del curso (`assessment` →
  `syllabus` → `course_offering` del período activo), resuelta por la matrícula del alumno.
  Nunca las de otro curso. Todas las secciones de un curso comparten esa rúbrica. El
  repositorio las lee por `enrollment_id` con la cadena `enrollment` → `section` →
  `course_offering` → `syllabus` → `assessment`, y el servicio pide las de cada matrícula por
  separado y nunca junta las de dos cursos en una misma lista.
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
  El ordinal cuenta dentro del mismo nombre y no por posición en la lista. R2 solo considera
  evaluaciones de la ULima y candidatas con semana, así que una evaluación de la ULima sin
  semana que R1 no empareja pasa directo a R3.
- **R3.** Lo que queda va con `assessmentId: null` y `match: "none"`.
- Una evaluación del sílabo se empareja a lo sumo una vez.
- **Guarda del curso.** Si la mitad o más de las evaluaciones de la ULima quedan con `none`, o
  si la oferta no tiene evaluaciones cargadas, el servicio suma el aviso `SYLLABUS_MISMATCH`
  con el mensaje fijo «El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima
  en <curso>/<sección>.», y el curso se guarda igual.

`[@test] ../../../test/HU37_jeff/emparejar.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.repository.test.ts` *(pendiente, candidatas por matrícula)*
`[@test] ../../../test/HU37_jeff/refresh.notas.test.ts` *(pendiente, dos cursos)*

### RS-BE-55 · Guardado

- Todas las escrituras de la recarga van en una sola transacción que empieza con
  `pg_advisory_xact_lock(hashtext('portal-refresh'), studentId)`. Sin ese candado, dos
  recargas del mismo alumno desde dos dispositivos borran e insertan las mismas filas a la vez
  y la segunda termina en un `23505`.
- **Notas.** Por cada matrícula cuyo marco se lee bien, con `<t>` el instante en que llega la
  respuesta del marco, primero corre `UPDATE enrollment SET portal_grades_read_at = <t> WHERE
  id = <matrícula> AND (portal_grades_read_at IS NULL OR portal_grades_read_at < <t>)`. Solo
  si ese `UPDATE` toca la fila se borran todas sus filas de `student_portal_score` y se
  insertan las evaluaciones emparejadas. Así una evaluación que la ULima retira no queda como
  fila vieja, y una recarga que lee antes pero confirma después, cuando por fin obtiene el
  candado, no pisa una lectura más nueva ni hace retroceder la hora, con el mismo criterio de
  `observed_at` en los delegados. Un curso cuya escritura se salta por esta guarda cuenta
  igual como `read`.
- **Pareja atada a la oferta.** Las filas con `assessment_id` se insertan con un
  `INSERT … SELECT` que une `enrollment` → `section` → `course_offering` → `syllabus` →
  `assessment` y filtra por la matrícula y por el `assessment_id` propuesto, así que una
  pareja de otro curso no produce fila aunque el servicio falle. El repositorio compara las
  filas insertadas con las enviadas y, si difieren, lanza un error que revierte la transacción
  entera (`500`), porque eso solo ocurre por un defecto del servicio.
- Un curso cuyo marco falla conserva sus filas y su hora de lectura anteriores, con el mismo
  criterio con que la asistencia nunca escribe 0 por un fallo.
- **Asistencia.** La de RS-BE-51, dentro de la misma transacción. El `UPDATE` de las horas
  suma a su `WHERE` la misma guarda sobre `portal_attendance_read_at`, también en la
  importación. Una fila que no toca por esa guarda cuenta como `updated` en la recarga y en
  `attendanceUpdated` en la importación, y `skipped` y `attendanceSkipped` quedan para los
  totales que no cuadran (RS-BE-51, punto 6).
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
      "attendance": "unavailable", "grades": "read" }
  ],
  "view": { "lastReadAt": "2026-09-25T15:42:10.000Z", "courses": [] },
  "warnings": [
    { "code": "ASISTENCIA_UNAVAILABLE", "block": "asistencia",
      "message": "No se pudo traer la asistencia de 690417/812." }
  ]
}
```

- En el ejemplo, `courses` y `view.courses` van recortados solo por brevedad. La descarga de
  la página de asistencia del aula 900101 falla, y la página de notas de la misma aula la
  identifica como 690417/812, así que por RS-BE-48 el aviso nombra el curso y la matrícula queda
  `unavailable`. Sin esa página, el aviso diría «No se pudo traer la asistencia del aula
  900101.» y la matrícula quedaría `missing`.
- `readAt` es el instante más reciente entre las lecturas que se guardan.
- Los contadores de `attendance` y de `grades` cuentan aulas de cada menú, estén o no
  atribuidas a una matrícula. `withValue` cuenta los cursos leídos con al menos una evaluación
  con `mark: "graded"`.
- `courses` tiene una entrada por matrícula activa del alumno en el período activo, y su
  estado sale solo de las aulas atribuidas a esa matrícula por la regla de RS-BE-48.
  `attendance` vale `updated` (las horas se escriben o la fila ya tiene una lectura más
  reciente), `skipped` (los totales de la página no cuadran), `failed` (la página de un aula
  atribuida no se entiende), `unavailable` (la descarga falla), `not_reached` o `missing`. `grades` vale
  `read`, `failed`, `unavailable`, `not_reached` o `missing`. Una matrícula sin ningún aula
  atribuida queda `not_reached` si el presupuesto se agota con alguna aula de ese menú todavía
  sin pedir, y `missing` en otro caso, que abarca el curso que el menú no trae y el aula cuya
  página falla sin que ninguna otra página diga de qué curso es.
- `view` tiene exactamente la forma de `GET /grades/me/ulima` (RS-BE-57), ya con lo guardado,
  para que la app no haga otra petición. Trae solo notas. La asistencia nueva y
  `asistenciaLeidaEn` se leen en `GET /schedule/me/sessions` (RS-BE-58), que la app vuelve a
  pedir tras cada `200` (hueco 2 de la spec de la app).
- Los avisos usan `block: "asistencia"` o `block: "nota"` y los códigos `PARSER_FAILED`,
  `ASISTENCIA_UNAVAILABLE`, `NOTAS_UNAVAILABLE`, `NOT_ENROLLED`, `SYLLABUS_MISMATCH`,
  `PORTAL_AVERAGE_MISMATCH` y `REFRESH_BUDGET_EXCEEDED`. Sus mensajes son fijos y solo llevan
  códigos de curso, de sección o de aula ya validados con una regex de dígitos.

**Errores.**

| Código | Cuándo |
| --- | --- |
| `400 INVALID_JSON_BODY`, `400 INVALID_REQUEST_BODY` | Cuerpo ilegible, `consent` distinto de `true`, `passcode` mal formado o claves de más. |
| `409 IMPORT_REQUIRED` | Sin período activo o sin matrícula activa en él, antes de tocar el portal. También después de iniciar sesión, cuando `layout.jsp` o una página de asistencia muestran otro ciclo (RS-BE-49), sin escribir nada y con su propio mensaje fijo. La app lleva a `/portal-sync`. |
| `409 PORTAL_REFRESH_IN_PROGRESS` | Otra recarga o una importación con `credentials` del mismo alumno en curso. |
| `409 PORTAL_LOGIN_REJECTED` | Contraseña o código rechazados, sin distinguir cuál. Nunca `401`, porque la app cierra la sesión de ULima++ ante cualquier `401`. |
| `409 PORTAL_SESSION_INVALID` | La sesión muere a mitad de camino, sin ningún curso leído. |
| `403 PORTAL_IDENTITY_MISMATCH` | Una página de asistencia declara un código de alumno presente y distinto. No se escribe nada. |
| `422 PORTAL_IDENTITY_UNVERIFIABLE` | La cuenta no tiene `app_user.code`. |
| `429 RATE_LIMITED` | Cupo por hora o tope de rechazos (RS-BE-50), con `details.kind`. |
| `502 PORTAL_UNAVAILABLE` | Error de red o 5xx del portal y ningún curso leído. |
| `502 PORTAL_UNREADABLE` | El portal responde, pero `layout.jsp` no trae el ciclo, o ni los menús ni ninguna página se entienden, que es lo que se vería ante otro rediseño. Mensaje «miUlima responde con páginas que ULima++ no sabe leer.». |
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
- `lastReadAt` de cada curso es `enrollment.portal_grades_read_at`, en ISO 8601 UTC y con el
  reloj del servidor. Solo avanza cuando una recarga guarda las notas de ese curso y nunca
  retrocede, por la guarda de RS-BE-55, así que una recarga que solo escribe asistencia no lo
  mueve.
- `lastReadAt` de arriba es el máximo de los cursos, o `null`. Es la hora de la fila «Notas
  oficiales» de la calculadora y de la franja de `/mis-notas`. La app compara esa hora antes y
  después de una recarga cuyo plazo vence o cuya red falla, y si avanza la trata como guardada
  (D23 de la spec de la app).
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
  las horas, con el instante en que llega la respuesta de la página y la guarda de lectura más
  reciente de RS-BE-55, para que la hora refleje la última lectura por cualquiera de los dos
  caminos.
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
  notas inventadas con coma y con punto decimal, y el de asistencia lleva faltas inventadas.
  El fixture de la página del curso conserva la sangría con tabulaciones de cada `var`, como
  la página viva, la línea comentada del nombre con un nombre inventado, para probar que nunca
  se lee, y valores de `min*` y `max*` distintos de cero, para probar que no cambian el
  resultado.

`[@test] ../../../test/HU37_jeff/parser.nota-curso.test.ts` *(pendiente)*
`[@test] ../../../test/HU37_jeff/refresh.privacidad.test.ts` *(pendiente, registrador espía y fixtures)*

### RS-BE-60 · Cierre de sesión cuando el inicio de sesión falla a medias

`PortalClient.login` cierra la sesión que el portal abre cuando falla después de que el frasco
del inicio de sesión recibe un `JSESSIONID`. Como ese `JSESSIONID` probablemente llega con el
primer `GET`, el caso abarca la contraseña rechazada del paso 2, el código rechazado del paso
3, la verificación final del paso 4 y un error de red o de tiempo a mitad de camino, no solo el
segundo factor. El cierre pide `CustomLogoutServlet` con todas las cookies del frasco, por el
mismo `hop` del inicio de sesión, y no con `logout()`, que exige `LtpaToken2`, una cookie que
antes del segundo factor puede no existir. Espera a lo sumo su `PORTAL_TIMEOUT_MS`, también
pasado el plazo de RS-BE-50, ignora cualquier error de ese cierre y lanza después el mismo
`409 PORTAL_LOGIN_REJECTED`, `504 PORTAL_TIMEOUT` o error de red que lanzaría hoy. Un fallo
anterior a cualquier `JSESSIONID` no llama al cierre. Como vive en `PortalClient.login`, vale
para la recarga, para la importación con `credentials` y para `POST /auth/register`, que llama
al mismo `login` (`auth.service.ts:236`) y suma así una petición al portal por intento
fallido, sin cambiar su código ni su respuesta.

`[@test] ../../../test/HU31_jeff/portal.client.login.test.ts` *(existe, casos nuevos)*

## Modelo de datos (migración `0015_portal_scores.sql`)

> **Cambio de base de datos aprobado por el dueño el 2026-09-26** con la spec, en la opción
> recomendada de la decisión abierta 5. El `.sql` se escribe con la implementación. Aplicarlo
> en producción pide además, en el momento del despliegue, el respaldo y el permiso explícito
> del dueño, como con la `0012` y la `0013`, y nadie lo aplica antes.

Es aditiva, idempotente y se aplica con `bun run db:apply drizzle/0015_portal_scores.sql`, con
respaldo previo y el permiso explícito del dueño, antes del despliegue del código. La `0014` es
la de `student_specialty_test_result` en la rama `feat/test-especialidad`.

```sql
CREATE TABLE IF NOT EXISTS student_portal_score (
  id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  enrollment_id integer NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE,
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
- `ON DELETE CASCADE` en `enrollment_id`, a diferencia de `student_score` y
  `simulated_grades`. Dos scripts de un solo uso borran matrículas,
  `src/db/seed/propuesta_855.ts:125-127` y `src/db/seed/delegados_secciones.ts:478-481`,
  después de limpiar a mano las tablas hijas que conocen (`section_representative`,
  `student_score` y, en el segundo, `simulated_grades`). Sin cascada fallarían con `23503` en
  cuanto un alumno de esas secciones tuviera filas en `student_portal_score`. Estas filas son
  una copia de lo que publica la ULima y no tienen sentido sin su matrícula, así que borrarlas
  con ella no pierde nada que no se pueda volver a leer. La alternativa descartada, sin
  cascada, suma esos dos scripts a `targets` para que borren también la tabla nueva
  (decisión abierta 5).
- `schema.ts` suma `studentPortalScore`, con `onDelete: "cascade"` en `enrollmentId`, y las dos
  columnas de `enrollment` con los mismos nombres, restricciones e índices.

## Costo de una recarga

Con cinco cursos y el orden por defecto de RS-BE-53 son 27 peticiones en 21 rondas
secuenciales, que se reparten en 8 saltos del inicio de sesión, la ronda de apertura de
RS-BE-49 con `layout.jsp` y los dos menús en paralelo, 5 páginas de asistencia en paralelo, 5
páginas de curso y 5 marcos uno tras otro, y el cierre. Si la verificación V3 permite las
cadenas en paralelo, bajan a 13 rondas. Si además el marco responde sin la página del curso
(variante corta de RS-BE-53), son 22 peticiones en 12 rondas. Esa variante conserva el menú de
Nota, que va en la ronda de apertura y es lo único que dice que el panel Nota ofrece esa aula.
Dejar de pedirlo, con las aulas tomadas del mapa de la asistencia, ahorra una petición pero
ninguna ronda (21 peticiones en 12 rondas), y esta spec no lo adopta. Todavía no hay ninguna
medición del tiempo de una ronda desde `iad1`, y por eso el presupuesto de RS-BE-50 acota la
respuesta y la decisión abierta 15 pide medir antes de publicar.

## Contrato

Detalle en `docs/specs/api-contracts.md`, secciones Portal Sync, Grades y Schedule.

- `POST /portal-sync/refresh` (RS-BE-49 a RS-BE-56).
- `GET /grades/me/ulima` (RS-BE-57).
- `asistenciaLeidaEn` en `GET /schedule/me/sessions` y `GET /course-detail/sections`
  (RS-BE-58), un campo aditivo en dos endpoints existentes.
- `POST /portal-sync/import` también cambia, siempre de forma aditiva. Suma el
  `429 RATE_LIMITED` con `kind: "rejected_logins"` del tope compartido, el
  `409 PORTAL_REFRESH_IN_PROGRESS` cuando hay una recarga en curso y `kind: "quota"` en su
  `429` de cupo (RS-BE-50 y decisión abierta 3). Cuenta además en `attendanceUpdated` la fila
  que salta la guarda de lectura más reciente (RS-BE-55). Cambian además el orden
  de sus fases, sus avisos de RS-BE-48, que nombran el aula cuando el curso se desconoce, y la
  hora de lectura de RS-BE-58.
- `POST /auth/register` no cambia de forma, pero cierra la sesión del portal cuando el inicio
  de sesión falla a medias (RS-BE-60).
- Ningún campo existente cambia de tipo ni desaparece.

## Pruebas por requisito

| Requisito | Casos |
| --- | --- |
| RS-BE-48 | Los fixtures de arreglos de hoy (`asistencia-sidebar.html`, `delegado-sidebar.html`, `delegado-sidebar-cuenta2.html`) dan el mismo resultado que hoy, con `origen: "arreglos"`, y las pruebas que comparan con `toEqual` se actualizan con ese campo. El menú de lista da las aulas en orden, con `courseCode: null` y la sección del `<li>`. Un `<li>` sin enlace se salta. Un tramo con dos aulas distintas se descarta, también cuando una de ellas tiene letras. Un enlace de otra función no cuenta. Aulas con letras, con 3 dígitos o con 9 se descartan. Una sección no numérica queda `null`. La misma aula con secciones en conflicto se descarta. `class="curso open"` sirve y `curso-body` no. Entidades HTML en el `<li>` se limpian. Una página con los dos formatos usa los arreglos. La página de inicio de sesión da `ok: false`. En el servicio de la importación, con el menú de lista, la sección del menú distinta de la de la página no escribe asistencia, un aula cuya página de asistencia falla emite un aviso que nombra el aula y nunca `null`, un aula de delegados sin curso en el mapa no pide la nómina, no escribe claim y avisa, y un aula cuya página identifica el curso pero falla en los totales entra al mapa y sus delegados se escriben. |
| RS-BE-49 | Cuerpo sin `consent`, con `consent: false`, con `cookies` o con una clave de más da `400`. Sin matrícula activa da `409 IMPORT_REQUIRED` sin llamar al portal. Una segunda recarga simultánea, o una recarga con una importación con `credentials` en curso, da `409 PORTAL_REFRESH_IN_PROGRESS`. El usuario del inicio de sesión es `app_user.code`. `layout.jsp` con otro ciclo da `409 IMPORT_REQUIRED` sin pedir ninguna página de curso y sin escribir, lo mismo que una página de asistencia de otro ciclo con `layout.jsp` del ciclo activo, y `layout.jsp` sin ciclo da `502 PORTAL_UNREADABLE`. Una página de asistencia con un código de alumno presente y distinto aborta con `403` y no escribe nada, y una sin código es un fallo común de ese curso. El cierre de sesión corre con éxito, con error y con presupuesto agotado. Nunca se escribe en las tablas de la lista de exclusión. |
| RS-BE-50 | El sexto intento en la hora da `429` con `kind: "quota"`. `422 PORTAL_IDENTITY_UNVERIFIABLE`, el `409 IMPORT_REQUIRED` de la condición previa 1 y `409 PORTAL_REFRESH_IN_PROGRESS` devuelven el cupo, y el `409 IMPORT_REQUIRED` por cambio de ciclo no. Un rechazo devuelve el cupo y suma al tope. El cuarto rechazo en 15 minutos da `429` con `kind: "rejected_logins"` antes de llamar al portal, también si los rechazos vienen de la importación. Del lado de la importación (`service.import.test.ts`), tras tres rechazos de la recarga la importación con `credentials` da `429` con `kind: "rejected_logins"` sin llamar a `login`, un `PORTAL_LOGIN_REJECTED` de la importación suma al tope de la recarga, la importación con `cookies` no revisa el tope, la importación con `credentials` con una recarga en curso da `409 PORTAL_REFRESH_IN_PROGRESS` sin llamar a `login`, y su `429` de cupo lleva `kind: "quota"`. Nunca hay más de 5 peticiones en vuelo. Con un reloj falso, ningún salto del inicio de sesión ni ninguna petición de fase empieza después del presupuesto, el temporizador de un salto no pasa del tiempo que queda, un plazo vencido durante el inicio de sesión da `504`, los cursos pendientes quedan `not_reached` y el aviso sale una sola vez. En el entorno, 65 000 se acepta y 66 000 se rechaza. Con 65 000, un `PORTAL_TIMEOUT_MS` de 8 000 deja el presupuesto efectivo en 65 000, uno de 15 000 lo baja a 51 000 y uno de 30 000 a 21 000, y con 31 000 el arranque falla. |
| RS-BE-51 | Página de otro ciclo, `prm_sAaCicl` o `prm_sNuCicl` mal formados, curso sin matrícula, triple incoherente y fallo de red, cada uno con su estado y sin tocar la fila. Solo los dos ocultos bien formados con otro ciclo dan `otroCiclo: true`. Una página que identifica bien el curso y falla en los totales devuelve `identificado`. En la importación (`service.asistencia.test.ts`), `cicloEsperado` es el ciclo de `layout.jsp` y una página de otro ciclo es un aviso de ese curso que no aborta. La hora de lectura cambia solo cuando el `UPDATE` toca la fila, y una lectura más vieja que `portal_attendance_read_at` no la toca y deja la matrícula `updated`, mientras que unos totales que `resolveAttendanceHours` rechaza la dejan `skipped`. En la importación, esa misma lectura más vieja cuenta en `attendanceUpdated` y no en `attendanceSkipped`. |
| RS-BE-52 | Identificación correcta, con cada `var` sangrado con tabulaciones como en la página viva. La línea comentada con el nombre, también sangrada, nunca aparece en el resultado. `min*` y `max*` distintos de cero no cambian nada. Marco de otra aula, marco ausente, `codCurso` ausente y página de inicio de sesión dan su motivo. Un agregado 0 da `null`. La etiqueta «Eval. Continua<br>2» sale con espacio. En el servicio (`refresh.notas.test.ts`), la sección del menú distinta de la de la página, el mapa de asistencia con otro curso para esa aula y el mapa con otra sección no escriben notas y emiten `PARSER_FAILED` con `block: "nota"`. |
| RS-BE-53 | Cabecera correcta e incorrecta. Las 20 celdas vacías del sondeo, reproducidas con datos inventados. Nota con punto, con coma, `NP`, `np`, `&nbsp;`, `21`, `-1`, `A` y `14.555`. Semana vacía, 0, 21 y con letras. Peso 0, 101 y con coma. Suma de 99,6 y de 100,4 aceptadas, de 99 rechazada. Dos grupos con pesos absolutos aceptados y con pesos relativos rechazados. Hoja huérfana, tercer nivel, id repetido y fila de cinco celdas rechazados. Un nombre con tilde y eñe en bytes ISO-8859-1 llega intacto. El chequeo del promedio avisa cuando difiere en más de 0,5 y calla cuando falta una nota. En el servicio (`refresh.notas.test.ts`), con un cliente falso que registra el orden, cada marco se pide justo después de la página de su curso, los cursos nunca se intercalan y nunca hay dos cadenas en vuelo. |
| RS-BE-54 | Los patrones del hallazgo 5 con datos inventados, es decir ordinal final («Examen escrito 1/2/3»), ordinal con N («N1/N2/N3»), ordinal sin repetición («Exposición 1»), ordinal por nombre y no por posición, semana corrida en 1 (`week_shift`), en 3 (`none`), peso distinto (`none`), dos candidatas en la misma semana que desempata el nombre, empate sin salida (`none`), sílabo vacío y una candidata que nunca se empareja dos veces. Una evaluación de la ULima sin semana que R1 no empareja queda en R3. El aviso de sílabo desactualizado sale con la mitad o más sin pareja. En el repositorio, la consulta de candidatas filtra por la matrícula con la cadena hasta `assessment`. En el servicio, con dos cursos cuyos sílabos tienen evaluaciones de la misma semana y el mismo peso, cada evaluación de la ULima se empareja solo con una de su propio curso. |
| RS-BE-55 | El candado se toma antes de escribir. Un curso leído reemplaza todas sus filas y uno fallido conserva las suyas. Una lectura más vieja que `portal_grades_read_at` no borra ni inserta y la hora no retrocede. Un `assessment_id` de otra oferta no produce fila y revierte la transacción. Las filas cumplen los CHECK de la migración, y la clave de `enrollment_id` lleva `ON DELETE CASCADE`. |
| RS-BE-56 | Forma de la respuesta con éxito parcial. Con el menú de lista, la página de asistencia de un aula que falla se atribuye a su matrícula por la página de notas de la misma aula, que queda `unavailable` o `failed` con el aviso `<curso>/<sección>`, y sin esa página el aviso nombra el aula y la matrícula queda `missing`, o `not_reached` si el presupuesto se agota con aulas sin pedir. Precedencia de errores sin ningún curso leído. `PORTAL_UNREADABLE` cuando los dos menús vienen en un formato desconocido. `Cache-Control: no-store`. |
| RS-BE-57 | Solo matrículas activas del período activo, del propio alumno. Curso nunca leído con `lastReadAt: null`. Orden por semana. Sin período activo responde vacío. Un token docente da `403`. |
| RS-BE-58 | El campo nuevo en las dos rutas, `null` en filas de docente y de asesoría, y la importación fija la hora con el instante de la respuesta. |
| RS-BE-59 | Cada lector devuelve exactamente los campos de su tipo. Con un registrador espía (`refresh.privacidad.test.ts`), ningún mensaje de la recarga contiene la contraseña, el código del autenticador, las cookies, una nota, un nombre ni un fragmento del HTML. Los fixtures nuevos solo contienen los códigos y nombres inventados de la lista de datos de ejemplo. |
| RS-BE-60 | Un rechazo de la contraseña en el paso 2, uno en el segundo factor, uno en la verificación final y un error de red a mitad de camino llaman al cierre con las cookies del frasco, aunque falte `LtpaToken2`, y lanzan el mismo error. Un fallo del cierre no cambia el error. Un fallo anterior a cualquier `JSESSIONID` no llama al cierre. |

## Cambios en otras specs

El dueño los aprueba el 2026-09-26 con esta spec. Cada enmienda queda pendiente de
implementar, y hasta que su implementación llegue a producción el backend desplegado sigue el
texto sin enmendar.

- `asistencia-portal.spec.md`. El formato de lista del menú (RS-BE-48), el parámetro
  `cicloEsperado` de `parseAsistenciaCurso` con las marcas `otroCiclo`, `identityMismatch` e
  `identificado` (RS-BE-49 y RS-BE-51), la hora de lectura (RS-BE-58), la muestra con faltas
  del 2026-09-25 en «Cobertura conocida y sesgada» y la reutilización del parser en la recarga.
- `portal-sync.spec.md`. RS-BE-4 y el inventario de §Privacidad y base legal, el orden de las
  fases de asistencia y delegados, el tope compartido de rechazos, la guarda de inicio de
  sesión en curso, `kind: "quota"` en el `429` de cupo, la nota de que las notas parciales
  vienen del panel Nota y no de `ComandoListarConsNotas`, y el reemplazo de un código de
  alumno real por una descripción.
- `delegados-portal.spec.md`. RS-1 (dos formatos) y RS-11 (el par sale del mapa de
  identificaciones verificadas de la asistencia cuando el menú no trae el curso).
- `grades.spec.md`. `GET /grades/me/ulima` (RS-BE-57).
- `official-grades.spec.md`. El papel de `/mis-notas` (decisión abierta 10).
- `schedule.spec.md` y `course-detail.spec.md`. `asistenciaLeidaEn` (RS-BE-58).
- `docs/specs/api-contracts.md`. Las dos rutas nuevas, el campo nuevo y la corrección de la
  frase según la cual la importación no toca las horas de asistencia, con el `summary`, los
  avisos, el `token` y los errores que le faltaban.
- `docs/specs/feature-index.md`. La funcionalidad nueva y el estado de la asistencia.
- `AGENTS.md` y `KNOWLEDGE.md`, con el texto de la decisión abierta 12, en el PR de la
  recarga.

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

El dueño las aprueba todas el 2026-09-26 en la página de decisiones de la recarga, cada una en
la opción que la spec adopta por defecto, que es la recomendada, y ninguna cambia. Lo que esa
aprobación suma fuera de esta lista queda en las decisiones 4 a 6 de «Pedido y decisiones del
dueño». Cada punto conserva las alternativas que se descartan, y la numeración no cambia,
porque la citan los requisitos y la spec de la app.

1. **RS-BE-48 como corrección aparte.** *Aprobada por el dueño el 2026-09-26, en la opción
   recomendada.* Sí. Va primero, en un PR propio sobre `main`, con sus pruebas, sin cambio de BD
   ni de contrato, y se despliega antes que el resto porque hoy la importación no actualiza la
   asistencia de nadie. Ese PR lleva también la parte de delegados (orden de las fases, mapa de
   identificaciones y aviso que nombra el aula, con la identificación verificada de RS-BE-51,
   punto 4), porque el parser es el mismo y esa parte falla cerrada. Con arreglos rige la
   lectura de hoy, con lista solo escribe el aula que una página de asistencia verifica, y con
   un formato desconocido la fase falla como hoy, sin escribir ningún claim. Por eso la
   verificación V4, que autoriza la decisión abierta 17, se hace antes del merge pero no lo
   bloquea. Alternativas descartadas, dejar la parte de delegados para un PR posterior a V4,
   con la fase de delegados descartando mientras tanto toda aula con `courseCode: null` sin
   pedir su nómina, o publicar RS-BE-48 junto con la recarga, lo que deja el fallo en
   producción hasta entonces.
2. **Endpoint propio o importación completa.** *Aprobada por el dueño el 2026-09-26, en la
   opción recomendada.* El endpoint propio `POST /portal-sync/refresh`, con un inicio de sesión,
   solo los paneles Nota y Asistencia, cupo propio y tope de rechazos. Alternativa descartada,
   que los botones repitan `POST /portal-sync/import` con la pantalla de consentimiento en cada
   toque, 1 de los 5 cupos y una duración sin medir, y que además sume la lectura del panel
   Nota.
3. **Cupo, tope de rechazos y guarda de inicio de sesión.** *Aprobada por el dueño el
   2026-09-26, en la opción recomendada.* 5 recargas por hora por alumno, aparte de las 5 de la
   importación, y 3 inicios de sesión rechazados cada 15 minutos, contados junto con los de la
   importación con `credentials`, que también responde el `429` con
   `kind: "rejected_logins"`. El `429` de cupo de la importación suma `kind: "quota"`, y la
   guarda de inicio de sesión en curso la comparten la recarga y la importación con
   `credentials`, que responde `409 PORTAL_REFRESH_IN_PROGRESS` si hay una recarga en curso.
   Alternativas descartadas, compartir las 5 por hora con la importación, otros números, un
   tope de rechazos solo para la recarga, dejar el `429` de cupo de la importación sin `kind`,
   o una guarda solo entre recargas, que deja a una importación y una recarga simultáneas gastar
   el mismo código de un solo uso.
4. **Consentimiento en cada recarga.** *Aprobada por el dueño el 2026-09-26, en la opción
   recomendada.* El aviso de la hoja aprobada («Al tocar “Actualizar” aceptas que ULima++ lea
   en miUlima tus notas parciales y tu asistencia. La contraseña y el código se usan una sola
   vez y no se guardan.») y `consent: true` obligatorio en el cuerpo, sin tocar el texto
   congelado de `PortalConsentView` que usan `/registro` y la prueba HU34. Alternativa
   descartada, una casilla en la hoja, sin marcar, que habilita «Actualizar», también en cada
   recarga.
5. **Tabla, hora de lectura y migración.** *Aprobada por el dueño el 2026-09-26, en la opción
   recomendada y con la aprobación de BD.* La tabla `student_portal_score` y las columnas
   `enrollment.portal_grades_read_at` y `enrollment.portal_attendance_read_at`, en la migración
   `0015_portal_scores.sql`, con `ON DELETE CASCADE` desde `student_portal_score.enrollment_id`
   para que los dos scripts que borran matrículas no fallen con `23503`. Aplicarla en
   producción pide además, en el momento del despliegue, el respaldo y el permiso explícito del
   dueño (ver «Modelo de datos»). Alternativas descartadas, otro nombre para la tabla, la hora
   de las notas como columna de cada fila, una tabla aparte de lecturas por matrícula, o la
   clave sin cascada, como `student_score`, con `src/db/seed/propuesta_855.ts` y
   `src/db/seed/delegados_secciones.ts` sumados a `targets` para que borren también la tabla
   nueva.
6. **Nota simulada cuando la ULima publica la misma evaluación.** *Aprobada por el dueño el
   2026-09-26, en la opción recomendada.* El backend no toca `simulated_grades`, la app muestra
   la nota de la ULima en lugar de la simulada, como dice la maqueta aprobada, y la simulada
   reaparece si la ULima retira la nota. Alternativa descartada, borrar la simulada al guardar
   la nota de la ULima.
7. **Notas de la ULima sin pareja en el sílabo.** *Aprobada por el dueño el 2026-09-26, en la
   opción recomendada.* Se muestran en `/mis-notas`, no entran a la calculadora y la
   calculadora avisa que el sílabo cargado no coincide con la ULima en ese curso, para no
   contar dos veces el mismo peso. Alternativa descartada, que entren a la calculadora como
   filas «ULima» con su peso, aunque la suma de pesos pueda pasar de 100.
8. **«NP».** *Aprobada por el dueño el 2026-09-26, en la opción recomendada.* Se guarda como
   marca `np` sin valor, la app lo muestra como «NP» y lo cuenta como 0 en el promedio,
   pendiente de confirmar con el reglamento. Alternativas descartadas, no contarlo en el
   promedio, o hacer fallar al curso hasta tener una muestra.
9. **Umbral de aprobación.** *Aprobada por el dueño el 2026-09-26, en la opción recomendada.*
   Ningún umbral único. Se conservan los dos de hoy, 11 para el aviso «Desaprobado» de la
   calculadora y 10,5 para la insignia «Final» de `/mis-notas`, porque la maqueta aprobada pone
   los dos en lo que no cambia. Es también la opción de B9 en la spec de la app. El 10,5 que
   usan en el backend las alertas, el chatbot y las estadísticas de sección no cambia en esta
   entrega. Alternativas descartadas, 10,5 en las dos pantallas si la ULima redondea el
   promedio final, que cambia el aviso aprobado de la calculadora, u 11 en las dos si no lo
   redondea, que cambia la insignia «Final» aprobada. El cotejo de RS-BE-53, punto 7, dice
   cuál de las dos alternativas corresponde cuando cierre un curso.
10. **Papel de `/mis-notas` y de las notas que carga el docente.** *Aprobada por el dueño el
    2026-09-26, en la opción recomendada.* `/mis-notas` lee `GET /grades/me/ulima`,
    `GET /official-grades/me` sigue disponible sin cambios y el módulo del docente no cambia,
    pero sus notas dejan de tener pantalla de alumno. Alternativas descartadas, mostrar las
    dos por evaluación con la de la ULima mandando, o retirar la carga docente.
11. **Alertas de riesgo y chatbot.** *Aprobada por el dueño el 2026-09-26, en la opción
    recomendada.* No leen las notas de la ULima en esta entrega y siguen como hoy. Alternativa
    descartada, que `academic_risk` y el chatbot las lean, cada uno con su enmienda de spec.
12. **Regla de `AGENTS.md` y `KNOWLEDGE.md`.** *Aprobada por el dueño el 2026-09-26, en la
    opción recomendada.* Hoy dicen que las notas de la calculadora son personales y no
    oficiales. Cambian en el PR de implementación de la recarga con un solo texto, el mismo en
    `AGENTS.md` y `KNOWLEDGE.md` de este repo y en los de la app (B12 de su spec). «Las notas
    que el alumno registra en la calculadora son personales y no oficiales
    (`simulated_grades`). La calculadora muestra además, fijas y con la marca “ULima”, las
    notas parciales que publica la ULima, que guarda la tabla `student_portal_score`, escribe
    solo `POST /portal-sync/refresh` y lee `GET /grades/me/ulima`.» `KNOWLEDGE.md` corrige
    además la línea que llama personales a las notas de `student_score`. Alternativas
    descartadas, un texto distinto en cada repo, otro texto o no tocar la regla, y entonces la
    calculadora no puede mostrar las notas de la ULima.
13. **La importación completa también lee el panel Nota.** *Aprobada por el dueño el
    2026-09-26, en la opción recomendada.* No, para no alargar una importación sin medir.
    Alternativa descartada, sumarle la fase de notas.
14. **Borrado de las notas de la ULima a pedido del alumno.** *Aprobada por el dueño el
    2026-09-26, en la opción recomendada.* Sin endpoint nuevo en esta entrega, igual que el
    resto del inventario de `portal-sync`, y se puede sumar después con su propia spec.
    Alternativa descartada, `DELETE /grades/me/ulima`, que borra las filas del alumno y sus
    horas de lectura de notas.
15. **Medición desde `iad1` antes de publicar.** *Aprobada por el dueño el 2026-09-26, en la
    opción recomendada.* Obligatoria. Con la `0015` aplicada, el dueño corre tres recargas con
    su cuenta desde un despliegue en `iad1` y se publica solo si las tres terminan en 45 s o
    menos y sin `504`, con las duraciones por fase del registro de RS-BE-50. Como Preview
    comparte la base de producción, esas recargas escriben solo las filas del dueño.
    Alternativas descartadas, otro umbral, o publicar confiando solo en el presupuesto.
16. **Quién carga las evaluaciones del sílabo en los ciclos futuros.** *Aprobada por el dueño
    el 2026-09-26, en la opción recomendada.* La misma carga manual del 2026-09-04, a cargo del
    dueño antes de cada ciclo. Mientras no se haga, las notas de la ULima quedan con
    `match: "none"` y solo se ven en `/mis-notas`. Alternativa descartada, una spec aparte para
    un cargador desde los PDF del sílabo.
17. **Sondeos de solo lectura con la cuenta del dueño.** *Aprobada por el dueño el 2026-09-26,
    en la opción recomendada.* Autorizados para las verificaciones V1 a V4, con scripts
    desechables fuera del repositorio, solo `GET` sobre los propios datos, el cierre de sesión
    al final y nada guardado dentro de un repo. Alternativa descartada, implementar sin
    sondear, con el riesgo de que el lector falle justo cuando salga la primera nota.
18. **Mostrar el «Promedio» que publica la ULima.** *Aprobada por el dueño el 2026-09-26, en
    la opción recomendada.* No se guarda ni se muestra, y solo sirve al chequeo de RS-BE-53,
    punto 7. Alternativa descartada, devolverlo en `GET /grades/me/ulima` cuando valga más
    que 0.
19. **Cambio de ciclo durante la recarga.** *Aprobada por el dueño el 2026-09-26, en la opción
    recomendada.* La ronda de apertura lee el ciclo de `layout.jsp` y la recarga termina con
    `409 IMPORT_REQUIRED`, sin escribir nada y sin devolver el cupo, cuando ese ciclo o el de
    alguna página de asistencia difiere del período activo (RS-BE-49). Cuesta una petición
    más, en una ronda que ya existe. Si la importación deja el ciclo nuevo inactivo porque
    todavía no empieza (`PERIOD_NOT_ACTIVATED_YET`), la recarga sigue respondiendo ese `409`
    hasta la fecha de inicio, aunque el alumno vuelva a importar. Alternativas descartadas,
    confiar solo en el ciclo de las páginas de asistencia, sin la petición extra, lo que deja
    sin guarda a las notas cuando ninguna página de asistencia se identifica, o un código
    propio para ese caso, para que la app no mande a `/portal-sync` a un alumno cuyo ciclo
    todavía no empieza.

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
- **V4.** Sondeo del menú de Delegado para confirmar que usa el mismo formato de lista y que sus
  aulas son las mismas del panel Asistencia. Se hace antes del merge del PR de RS-BE-48, con la
  autorización de la decisión abierta 17, pero no lo bloquea, porque la parte de delegados
  falla cerrada (decisión abierta 1).
- **V5.** La medición de la decisión abierta 15, que registra también la duración de la
  transacción y, desde el teléfono, el tiempo total de cada recarga, para confirmar los márgenes
  de 6 s y de 3 s de RS-BE-50.
- **Orden de publicación.** Los menús de Asistencia y de Nota llegan hoy en formato de lista, así
  que la recarga nunca se despliega sin RS-BE-48, que sale antes en su propio PR (decisión
  abierta 1). La `0015` se aplica, con el respaldo y el permiso explícito del dueño, antes de
  desplegar RS-BE-49 a RS-BE-60, porque la importación escribe la columna nueva (RS-BE-58). La
  app se publica solo con RS-BE-48 a RS-BE-60 desplegados, la `0015` aplicada, el máximo de
  65 000 de RS-BE-50 y V5 hecha, como pide la «Verificación» de la spec de la app (decisión
  B1).
- `bun run build` y `bun test` en verde, con las pruebas de «Pruebas por requisito» enlazadas
  y sin la marca *(pendiente)*.
