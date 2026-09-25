---
name: Specialty Test
description: Test de especialidad que recomienda uno de los cuatro diplomas oficiales con un puntaje transparente que calcula el backend, un motivo que redacta Cohere con respaldo de plantillas y el último resultado guardado por alumno
targets:
  - ../../../src/modules/specialty-test/**
  - ../../../src/modules/index.ts
  - ../../../src/modules/academic-profile/academic-profile.repository.ts
  - ../../../src/modules/academic-profile/academic-profile.service.ts
  - ../../../src/shared/middleware/rate-limit.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/0014_specialty_test_result.sql
---

# Test de especialidad

> Estado: **PROPUESTA del 2026-09-25, pendiente de la aprobación explícita del dueño.** Recoge
> las decisiones 1 a 7 del dueño de ese día (ver «Decisiones del dueño»). Lo que esas
> decisiones no fijan va en «Decisiones abiertas» con la opción que la spec adopta por defecto,
> y nada de esa lista se da por aprobado. La tabla nueva de RS-BE-44 es un cambio de base de
> datos y exige además la aprobación de BD de `AGENTS.md`, aparte de la de esta spec.
> Enmienda `specs/features/academic-profile/academic-profile.spec.md` (BR-AP-07 y BR-AP-08,
> ver «Enmienda a la spec de Academic Profile»). Contraparte de frontend por escribir en
> `ULima_Frontend_IS2/specs/features/specialty-test/specialty-test.spec.md`. Todos los
> `[@test]` apuntan a pruebas que se crean con la implementación y hoy no existen, así que
> cada uno lleva la marca *(pendiente)*. Los ejemplos usan datos inventados.

## El problema

El asistente del alumno nuevo (`/setup-carrera`) le pide elegir una especialidad de una
lista, sin nada que lo ayude a decidir. Esa lista trae además las especialidades antiguas
que ya no son diplomas oficiales, porque `GET /academic-profile/specialties` devuelve todas
las filas de `specialty` de la carrera, activas o no (`findSpecialtiesByCareerId`,
`academic-profile.repository.ts:142-159`). `PUT /academic-profile/me/specialties` tampoco
mira `is_active` (`specialtyBelongsToCareer`, líneas 216-226), de modo que cualquiera de
ellas se puede guardar.

El test resuelve lo primero. Ulises, el cuervo del chatbot, le muestra al alumno tareas
reales de cada especialidad en 14 preguntas, a veces una o dos más para desempatar, y el
backend calcula con una fórmula fija cuál de los cuatro diplomas va más con él. Cohere solo
redacta el motivo del resultado. El filtro de BR-AP-07 resuelve lo segundo.

## User Stories

- Como alumno nuevo, quiero que un test corto me recomiende una especialidad y me diga por
  qué, para elegir con algo más que el nombre del diploma.
- Como alumno, quiero rehacer el test desde mi Perfil y ver ahí mi último resultado.
- Como alumno, quiero que la app solo me deje elegir los diplomas que la universidad ofrece
  hoy.

## Decisiones del dueño (2026-09-25, vinculantes)

| # | Decisión | Requisitos |
| --- | --- | --- |
| 1 | El test es el paso central de `/setup-carrera`, con la opción «Saltar y elegir por mi cuenta», y se puede rehacer desde el Perfil. | RS-BE-44, RS-BE-45 |
| 2 | El puntaje es transparente y lo calcula el backend con la fórmula del contenido, sin aprendizaje automático. Cohere (`command-a-03-2025`, `/v2/chat`, el mismo motor del chatbot) solo redacta el motivo a partir del ranking ya calculado. A Cohere le llegan solo las respuestas del test y los puntajes, nunca el nombre, el código ni las notas del alumno. Si Cohere falla o tarda, el resultado sale igual con el motivo de las plantillas del contenido. La fase 3 queda fuera. | RS-BE-40 a RS-BE-43 |
| 3 | El contenido de `contenido-test.json` y `contenido-test.md` está aprobado y va versionado, porque puede recibir ajustes tras el cotejo con las sumillas oficiales. Las cinco dudas del revisor que quedan sin marca del dueño se adoptan con la opción recomendada y quedan a la vista en la decisión abierta 1. | RS-BE-37 |
| 4 | Diseño «Conversación con Ulises». Las tarjetas del duelo son grises y se encienden en el color de su especialidad al tocarlas. | RS-BE-38 |
| 5 | Se guarda solo el último resultado por alumno, con el ranking, la fecha y la versión del test, para mostrarlo en el Perfil. Las respuestas una por una no se guardan. Es un cambio de BD que pide aprobación explícita. | RS-BE-44, RS-BE-45 |
| 6 | Solo se muestran y se eligen los cuatro diplomas oficiales, con el filtro `is_active = true` en el backend y sin tocar los datos de `specialty`. `specialtyBelongsToCareer` exige también `is_active`. | BR-AP-07 |
| 7 | La validación del contenido está hecha en la página de revisión. | RS-BE-37 |

## Requisitos

### RS-BE-37 · Contenido versionado dentro del módulo

El contenido del test vive en el backend, dentro del módulo, como un archivo JSON por versión
en `src/modules/specialty-test/content/<versión>.json`. Así la app lo pide al servidor y un
ajuste de una tarea no exige publicar otro APK. El archivo es el `contenido-test.json` que
genera `generar.py`, completo, con sus ejemplos y su balance, y el servidor sirve solo la
parte que la app necesita (RS-BE-38).

- **Versión.** Cadena con la forma `AAAA-MM-DD.N` (`^\d{4}-\d{2}-\d{2}\.\d+$`), igual al
  campo `version` del archivo y a su nombre. La primera versión registrada es
  `2026-09-25.3`, que es la `2026-09-25.2` aprobada más los cambios de la decisión abierta 1.
  Si el dueño rechaza esos cambios, la primera versión es la `2026-09-25.2` tal cual.
- **Registro.** `content/index.ts` importa cada archivo de forma estática (sin leer el disco
  en tiempo de ejecución, para que el empaquetado de Vercel lo incluya) y exporta
  `CURRENT_VERSION` y el mapa `CONTENT_BY_VERSION`. `GET /specialty-test/content` sirve
  siempre la vigente. `POST /specialty-test/me/evaluate` acepta cualquier versión del
  registro y calcula con el contenido de esa versión, de modo que un alumno que empieza el test
  justo antes de un despliegue lo termina sin empezar de nuevo. Retirar una versión es
  sacarla del registro; desde ahí la evaluación responde `409 SPECIALTY_TEST_VERSION_OUTDATED`.
- **Claves estables.** Las cuatro especialidades se identifican en todas las versiones con
  las claves `sw`, `ti`, `si` y `vj`, en ese orden fijo. Una versión que cambie ese conjunto
  pide otra spec.
- **Invariantes.** Una prueba recorre cada versión del registro y falla si alguna no cumple
  lo siguiente. Hay 14 preguntas con ids `q01` a `q14` en orden, 10 duelos y 4 escalas. Cada
  especialidad aparece en exactamente 5 duelos y tiene exactamente una escala. Los dos lados
  de un duelo son de especialidades distintas. Hay 12 desempates, dos por par, con `order` 1
  y 2 e id `tb-<a>-<b>-<order>`, donde `a` y `b` son las claves del par en el orden fijo, y
  los dos lados de cada desempate son las dos especialidades de su par. Cada tarea tiene
  texto de 6 a 14 palabras, resumen y al menos un electivo, cada electivo pertenece a la
  especialidad de la tarea y ni el texto ni el resumen llevan dos puntos ni guiones largos.
  Las opciones del duelo son `top`, `bottom`, `both` y `none`, y las de la escala son `nada`
  (0), `un_poco` (1), `bastante` (2) y `me_encantaria` (3). Los pesos, el umbral y las
  condiciones de las plantillas del archivo coinciden con las constantes que implementa
  RS-BE-40 a RS-BE-42, para que un cambio de peso en el JSON no quede ignorado en silencio.
  Las plantillas solo usan las variables conocidas. Cada ejemplo del archivo (`weights.examples`)
  reproduce con la lógica del módulo su ranking, sus afinidades redondeadas, su empate, sus
  plantillas y su motivo, letra por letra.
- **Autoría.** El JSON no se edita a mano. Una versión nueva se genera con `generar.py`, se
  revisa y entra al registro con su propio archivo; el de una versión publicada no cambia
  (decisión abierta 15).

`[@test] ../../../test/HU36_jeff/specialty-test-content.test.ts` *(pendiente)*

### RS-BE-38 · Lo que la app recibe del contenido

`GET /specialty-test/content` devuelve la versión vigente con lo que la app necesita para
conducir el test sin red entre pregunta y pregunta.

- **Sí viaja.** La versión. El catálogo de las cuatro especialidades con su clave, su
  `specialtyId` (ver abajo), su nombre, su frase, sus colores claro y oscuro, el nombre de su
  ícono y sus electivos con código, nombre, nombre corto, créditos y requisito. Las líneas de
  Ulises del recorrido (bienvenida, botón, ayudas, reacciones y la línea de espera del
  resultado). Las opciones del duelo y de la escala con su etiqueta, sin valores. Las 14
  preguntas con su id, número, tipo, enunciado, reacción o cierre de bloque, y cada tarea con
  su id (`q01.top`, `q01.bottom`, `q04.task`), su texto, su descripción de ilustración y la
  clave de su especialidad.
- **No viaja.** Los resúmenes de las tareas, los electivos de cada tarea, los pesos, el
  umbral, las plantillas del motivo, las líneas de Ulises del resultado y del desempate, los
  desempates, los ejemplos, el balance ni las fuentes. Son del cálculo y del motivo, que hace
  el servidor.
- **La especialidad de cada tarea no es un secreto.** La app la necesita para encender la
  tarjeta tocada con el color de su especialidad (decisión 4), y el puntaje es transparente
  (decisión 2). Lo que no se delata durante el test es una regla de la interfaz, que cumple la
  app con tarjetas neutras hasta el toque y un Ulises que no nombra especialidades. Ocultar la
  clave obligaría a pedir el color al servidor en cada toque sin proteger nada (decisión
  abierta 4).
- **`specialtyId`.** El servidor traduce cada clave al id de `specialty` buscando, entre las
  especialidades con `is_active = true` de la carrera del alumno, la que tiene el mismo
  nombre que el contenido, sin distinguir mayúsculas ni tildes y sin espacios al borde. La app
  usa ese id en `PUT /academic-profile/me/specialties` para «Elegir como principal» y para los
  corazones de interés. Si alguna de las cuatro claves no encuentra su fila, el test no está
  disponible para ese alumno y la ruta responde `404 SPECIALTY_TEST_NOT_AVAILABLE`; la app
  salta el paso y muestra la elección manual (decisión abierta 5). Con los datos de la
  comprobación del 2026-09-25, las cuatro claves de Ingeniería de Sistemas corresponden a los
  ids 1, 5, 6 y 7, algo que el dueño confirma antes del merge.

`[@test] ../../../test/HU36_jeff/specialty-test.routes.test.ts` *(pendiente)*
`[@test] ../../../test/HU36_jeff/specialty-test.service.test.ts` *(pendiente)*

### RS-BE-39 · Evaluación sin estado y validación de la petición

`POST /specialty-test/me/evaluate` recibe todas las respuestas que el alumno lleva hasta ese
momento y devuelve una de dos cosas, el siguiente desempate o el resultado final. El servidor
no guarda nada entre una llamada y otra, así que la misma petición siempre produce el mismo
paso y el mismo ranking. Solo el resultado final se guarda (RS-BE-44).

El cuerpo trae `version`, `answers` con las 14 respuestas por id de pregunta y
`tiebreakAnswers` con los desempates ya respondidos, en orden.

Después de la autorización de RS-BE-46 (`401` y `403`), la petición se valida en este orden, y
el primer fallo corta.

1. **Tamaño.** El cuerpo no pasa de 4 KiB (`bodyLimit` de Hono sobre esta ruta). Si pasa,
   `413 PAYLOAD_TOO_LARGE`. Un cuerpo legítimo mide menos de 1 KiB.
2. **Límite de tasa.** Pasadas las 30 evaluaciones de la hora, `429 RATE_LIMITED` (RS-BE-46).
3. **Forma.** Cuerpo que no es JSON, `400 INVALID_JSON_BODY`. Zod exige `version` como cadena
   de hasta 20 caracteres con la forma de RS-BE-37, `answers` como objeto de hasta 20 claves
   con la forma `q` más dos dígitos y valores entre las ocho opciones conocidas, y
   `tiebreakAnswers` como arreglo de 0 a 2 objetos `{ id, answer }`, con `id` de hasta 24
   caracteres y `answer` entre `top`, `bottom`, `both` y `none`. Si falla,
   `400 INVALID_REQUEST_BODY` con los campos en `details.fieldErrors`. Las claves de más en la
   raíz se descartan, como en el resto de la API, y un `studentId` en el cuerpo no se usa.
4. **Versión.** Si `version` no está en el registro, `409 SPECIALTY_TEST_VERSION_OUTDATED`
   con `details.currentVersion`. La app recarga el contenido y empieza de nuevo.
5. **Respuestas contra la versión.** `answers` trae exactamente los 14 ids de pregunta de esa
   versión. Un duelo solo admite `top`, `bottom`, `both` o `none`, y una escala solo `nada`,
   `un_poco`, `bastante` o `me_encantaria`. Si falla, `400 SPECIALTY_TEST_INVALID_ANSWERS` con
   `details.missing`, `details.unexpected` y `details.invalid`, cada uno con los ids en orden.
6. **Alumno y especialidades.** El alumno sale del token. Sin fila en `student`,
   `404 USER_NOT_FOUND`. Si las cuatro claves no encuentran su especialidad activa (RS-BE-38),
   `404 SPECIALTY_TEST_NOT_AVAILABLE`.
7. **Desempates.** El servidor repite el cálculo de RS-BE-41 con las 14 respuestas y, paso a
   paso, con los desempates recibidos. El desempate `i` recibido tiene que ser justo el que
   ese cálculo pide en el paso `i`, y no puede sobrar ninguno. Si llega uno que no toca, uno
   con otro id o uno de más, `400 SPECIALTY_TEST_TIEBREAK_MISMATCH` con `details.expected`
   (el id que toca en ese paso, o `null` si ya no toca ninguno).

El servidor no comprueba que el alumno haya visto las preguntas ni cuánto tarda. El resultado
es solo suyo y solo lo ve él, así que alterar las respuestas no le da nada que no pueda
obtener respondiendo.

`[@test] ../../../test/HU36_jeff/specialty-test.routes.test.ts` *(pendiente)*
`[@test] ../../../test/HU36_jeff/specialty-test.service.test.ts` *(pendiente)*

### RS-BE-40 · Afinidad y orden

El cálculo sigue la fórmula del contenido (`weights`) y vive en una función pura,
`specialty-test.logic.ts`, sin base de datos ni red. Para cada especialidad `k` se cuentan
tres números.

- `h_k`, los medios puntos de duelo. Un duelo mostrado en el que el alumno elige la tarea de
  `k` le da 2. «Me gustan las dos» le da 1 a cada una de las dos. «Ninguna me llama» y la
  tarea rival no le dan nada. Cuentan los 10 duelos de las preguntas y los desempates
  mostrados.
- `n_k`, los duelos mostrados de `k`. Son 5 más los desempates mostrados de su par, así que
  valen 5, 6 o 7. Un desempate suma a las dos especialidades de su par y no toca a las otras
  dos.
- `e_k`, el valor de su escala, de 0 a 3.

La afinidad es `A = 0,7 · D + 0,3 · E`, con `D = 100 · (h/2) / n` y `E = 100 · e / 3`, que es
lo mismo que `A = 35 · h / n + 10 · e`. Con `n = 5` queda entera; con un desempate puede dejar
de serlo (35 · h / 6).

- **Aritmética exacta.** Ninguna comparación usa números de coma flotante. El servidor
  trabaja con `S = 210 · A = (7350 / n) · h + 2100 · e` y `U = 210 · D = (10500 / n) · h`,
  que son enteros porque 5, 6 y 7 dividen a 7350 y a 10500 (RS-BE-37 garantiza que `n` solo
  toma esos valores). Con eso las comparaciones de afinidad y de porcentaje de duelos son
  comparaciones de enteros, y «la misma afinidad exacta» es `S` igual.
- **Orden.** Las cuatro se ordenan por `S` descendente, luego por `U` descendente, luego por
  `e` descendente y por último en el orden fijo `sw`, `ti`, `si`, `vj`. Los criterios 2 a 4
  solo ordenan especialidades con la misma afinidad, por ejemplo para decidir cuál entra al
  desempate o cuál sale segunda. El orden fijo nunca decide a la ganadora, porque la igualdad
  exacta al final es empate (RS-BE-42).
- **Redondeo.** La afinidad que ven la app, el Perfil y las plantillas es un entero de 0 a
  100 con el medio hacia arriba, `floor((S + 105) / 210)`, de modo que 17,5 se muestra como 18.
  Todas las decisiones usan `S` y `U`, nunca el valor redondeado.

Los ocho ejemplos del contenido, recalculados así el 2026-09-25 en una prueba de solo
lectura sobre la versión `2026-09-25.2`, reproducen su ranking, sus afinidades redondeadas y
su número de desempates.

`[@test] ../../../test/HU36_jeff/specialty-test-logic.test.ts` *(pendiente)*

### RS-BE-41 · Cuándo toca un desempate y cuál

- Con las 14 respuestas, el servidor ordena las cuatro (RS-BE-40). La primera y la segunda
  forman el par del desempate, que se nombra con sus claves en el orden fijo, por ejemplo
  `si-vj`.
- **Desempate 1.** Toca si `S(1.ª) − S(2.ª) ≤ 2100`, que es una diferencia de afinidad de 10
  o menos. Es el desempate del par con `order = 1`.
- **Desempate 2.** Después del desempate 1 se recalcula todo. Toca si la diferencia absoluta
  entre las dos especialidades del par sigue en 2100 o menos, aunque una tercera las haya
  pasado. Es el del mismo par con `order = 2`.
- **No hay tercero.** Si en un desempate el alumno elige «Ninguna me llama», las dos del par
  bajan y una tercera puede pasarlas. El resultado se ordena igual por afinidad y no se abre
  ningún desempate más.
- **Respuesta del paso.** Cuando toca un desempate que todavía no tiene respuesta, la
  ruta responde `200` con `status: "tiebreak"`, el desempate (id, orden, enunciado y sus dos
  tareas con id, texto, descripción de ilustración y clave de especialidad, igual que las
  preguntas de RS-BE-38) y la línea de Ulises que va antes, `first` antes del desempate 1 y
  `second` antes del desempate 2. No guarda nada.

En una simulación de solo lectura con 200 000 juegos de respuestas al azar sobre la versión
`2026-09-25.2`, el 51 % no pide desempate, el 15 % pide uno y el 34 % pide dos. Con alumnos
reales, que no responden al azar, se espera menos.

`[@test] ../../../test/HU36_jeff/specialty-test-logic.test.ts` *(pendiente)*

### RS-BE-42 · Resultado final, motivo con plantillas y líneas de Ulises

Cuando ya no toca ningún desempate, el servidor arma el resultado con las 14 respuestas y los
desempates mostrados.

- **Ranking.** Las cuatro especialidades en el orden de RS-BE-40, cada una con su clave, su
  `specialtyId`, su nombre y su afinidad redondeada.
- **Empate.** Hay empate si las dos primeras tienen la misma afinidad exacta (`S` igual). Sin
  desempate no puede haberlo, porque una diferencia de 0 siempre pide el desempate 1. Con
  empate, las dos primeras son las ganadoras y la app las muestra juntas.
- **Motivo con plantillas.** Es el respaldo de RS-BE-43 y sigue `reasonTemplates` del
  contenido. Con empate se usa solo la plantilla `tie`, con `{a}` y `{b}` como la primera y la
  segunda del ranking. Sin empate se toma la primera plantilla de `main` cuya condición se
  cumple, en el orden `low`, `noMainPoints`, `strong`, `duelsOverScale`, `scaleOverDuels` y
  `general`. Después se agregan, en este orden y solo si su condición se cumple, la primera de
  `tiebreak` (`tiebreakPicked` y luego `tiebreakNoPick`), la de `second` y la de `electives`.
  Las oraciones se unen con un espacio.
- **Condiciones exactas.** `A < 50` es `S < 10500`. `D ≥ 80` es `U ≥ 16800`, `D ≥ 60` es
  `U ≥ 12600` y `D < 60` es `U < 12600`. `A2 ≥ 50` es `S ≥ 10500` para la segunda. `e` es el
  valor entero de la escala de la ganadora. `huboDesempate` es que se muestra al menos un
  desempate y `ganadoraEnElPar` es que la ganadora es una de las dos del par.
- **Variables.** `{nombre}` y `{segunda}` son los nombres oficiales del contenido.
  `{afinidad}` y `{afinidadSegunda}` son las afinidades redondeadas. `{puntos}` es `h/2` con
  coma decimal («4» o «3,5») y `{duelos}` es `n`, desempates incluidos. `{tareas}` sale solo
  de los 10 duelos de las preguntas y junta con « y » hasta dos resúmenes de tareas de la
  ganadora, primero las que elige sola en orden de pregunta y después las de «Me gustan las
  dos», también en orden. `{electivos}` toma el primer electivo de cada una de esas tareas, lo
  escribe con su nombre corto entre comillas latinas, quita los repetidos y los une con « y ».
  `{escalaTarea}` es el resumen de la escala de la ganadora y `{escalaRespuesta}` la etiqueta
  que elige. `{rival}` es la otra especialidad del par. `{tareaDesempate}` es el resumen de la
  última tarea de desempate que el alumno elige sola y que es de la ganadora, o vacío si no
  la hay. En el empate, `{puntosA}`, `{duelosA}`, `{puntosB}` y `{duelosB}` son los de `{a}` y
  `{b}`. Un motivo con una llave sin reemplazar es un error de la implementación y la prueba
  de los ejemplos lo detecta.
- **Líneas de Ulises del resultado.** El servidor elige y rellena las líneas de
  `ulisesLines.result` y `ulisesLines.tiebreak`, para que la app no repita la lógica.
  `intro` va siempre. El titular es `tie` con empate; sin empate, `low` si la afinidad de la
  ganadora es menor que 50 (el mismo corte de la plantilla `low`, decisión abierta 1) y
  `winner` en otro caso. Con empate y afinidad menor que 50 manda `tie` (decisión abierta 3).
  La línea `second` de Ulises no se usa, porque la plantilla `second` del motivo y el ranking
  ya dicen el segundo lugar (decisión abierta 1). Si hay desempate, va `stillTied` cuando
  el resultado termina en empate y `resolved` en cualquier otro caso; sin desempate, ninguna de las dos.
  `closing` y `retake` van siempre, porque el test se puede rehacer desde el Perfil
  (decisión 1).

`[@test] ../../../test/HU36_jeff/specialty-test-logic.test.ts` *(pendiente)*

### RS-BE-43 · Motivo redactado por Cohere

Con el ranking ya calculado, el servidor le pide a Cohere un motivo personalizado. Cohere no
decide nada del resultado. Si no responde a tiempo, falla o devuelve un texto que no pasa la
validación, el resultado sale igual con el motivo de las plantillas (RS-BE-42), sin error
para la app.

- **Llamada.** Reusa `cohereClient.chatWithHistory` (`src/services/cohere.client.ts:81-123`),
  que llama a `/v2/chat` con `command-a-03-2025` y la clave `COHERE_API_KEY`
  (`src/config/env.ts:78`, leída por `config.chatbot.cohereApiKey`). No hay variable de
  entorno nueva ni cambio en el cliente. Va con el prompt de abajo como mensaje `system`, un
  solo mensaje `user` con los datos, `temperature` 0,3 y `maxTokens` 200.
- **Tiempo.** Un `AbortController` corta la llamada a los **5 segundos**, con el mismo patrón
  que el chatbot usa con 8 (`chatbot.service.ts:97-98`). El chatbot espera más porque su
  respuesta es el producto; aquí el alumno ya tiene el resultado calculado y la espera es solo
  por el texto (decisión abierta 7).
- **Errores.** A diferencia del chatbot, que responde `503 CHATBOT_UNAVAILABLE`
  (`chatbot.service.ts:116-121`), aquí ningún fallo de Cohere llega a la app. Un tiempo
  agotado, un error de red, una respuesta que no es 2xx, un texto vacío o un texto que no pasa
  la validación producen el motivo de las plantillas y un `console.warn` con un código corto
  (`timeout`, `http`, `empty` o `invalid:<regla>`). El registro nunca lleva el texto de
  Cohere, las respuestas ni el id del alumno.
- **Datos que le llegan.** Solo textos del propio contenido y el resultado del cálculo, sin
  ninguna cifra. Nunca el nombre, el código, el correo, el id ni las notas del alumno, ni nada
  leído de la base salvo el resultado. El mensaje `user` es exactamente
  `DATOS DEL TEST`, un salto de línea, el JSON de abajo, un salto de línea, `FIN DE LOS DATOS`,
  un salto de línea y `Escribe el motivo.`.

```json
{
  "empate": false,
  "ganadoras": ["Desarrollo de Videojuegos"],
  "ranking": ["Desarrollo de Videojuegos", "Sistemas de Información", "Tecnologías de la Información", "Ingeniería de Software"],
  "nombrables": ["Desarrollo de Videojuegos", "Sistemas de Información"],
  "lectura": "La ganadora suma en los duelos y en la escala sin un patrón marcado.",
  "detalle": [
    {
      "especialidad": "Desarrollo de Videojuegos",
      "tareasElegidas": ["diseñar niveles que se ponen difíciles poco a poco", "programar cómo salta un personaje de juego", "escribir la historia y los diálogos de un juego"],
      "tareasQueLeGustaronConOtra": ["observar a jugadores probando un juego"],
      "escala": { "tarea": "programar un juego sencillo para celular", "respuesta": "Bastante" }
    }
  ],
  "desempate": { "rival": "Sistemas de Información", "tareaElegida": "escribir finales distintos según lo que decide el jugador" },
  "electivos": ["Storytelling", "Diseño de Videojuegos", "Narrativa Gráfica", "Programación Móvil", "Proyecto de Desarrollo de Software", "Proyecto de Videojuegos", "Interacción Humano Computadora"]
}
```

  El ejemplo es el `ejemplo-2` del contenido. `ganadoras` trae una especialidad, o las dos del
  empate. `ranking` es el orden final, sin afinidades. `nombrables` son las únicas
  especialidades que el texto puede nombrar, que son las ganadoras, la segunda si su afinidad
  exacta es de 50 o más y el rival del desempate si la ganadora está en el par. `lectura`
  traduce la plantilla `main` elegida a una frase fija (tabla de abajo). `detalle` trae una
  entrada por ganadora, con sus tareas de los 10 duelos de las preguntas, y su escala.
  `desempate` es `null` salvo que la ganadora esté en el par, y `tareaElegida` es el
  `{tareaDesempate}` de RS-BE-42 o `null`. `electivos` trae los nombres cortos de los
  electivos de las ganadoras.

| Plantilla `main` | `lectura` |
| --- | --- |
| `low` | Ninguna especialidad llama con fuerza al alumno y la ganadora va adelante sin mucha distancia. |
| `noMainPoints` | La ganadora no suma en los duelos de las preguntas y sube por la escala y los desempates. |
| `strong` | Los duelos y la escala apuntan con fuerza a la ganadora. |
| `duelsOverScale` | La ganadora suma bien en los duelos, pero en la escala el alumno muestra poco entusiasmo. |
| `scaleOverDuels` | La respuesta de la escala pesa más que los duelos. |
| `general` | La ganadora suma en los duelos y en la escala sin un patrón marcado. |
| (empate) | Las dos primeras quedan empatadas. |

- **Prompt.** Es el mensaje `system`, tal cual.

```
Eres Ulises, el cuervo que acompaña a los alumnos de Ingeniería de Sistemas de la Universidad de Lima en ULima++. El alumno acaba de terminar un test de especialidad y el sistema ya tiene calculado su resultado. Tu único trabajo es escribir el motivo que acompaña ese resultado.

REGLAS
1. Usa solo los datos que vienen entre DATOS DEL TEST y FIN DE LOS DATOS. No inventes tareas, cursos ni especialidades.
2. La especialidad recomendada es la del campo ganadoras. No recomiendes otra ni cambies el orden del ranking. Si empate es verdadero, presenta las dos ganadoras en pie de igualdad.
3. No escribas números, porcentajes ni puntajes. La pantalla ya los muestra.
4. Nombra cada especialidad con su nombre completo, tal como viene. Solo puedes nombrar las especialidades de la lista nombrables.
5. Menciona al menos una tarea de tareasElegidas o de tareasQueLeGustaronConOtra de la ganadora, con las palabras del resumen.
6. Usa comillas latinas solo para el nombre de un curso de la lista electivos o para la respuesta de la escala tal como viene. No uses otras comillas.
7. Escribe en español, con trato de tú y lenguaje neutro en género, en un solo párrafo de dos a cuatro oraciones y de menos de 450 caracteres.
8. No uses dos puntos, guiones largos, listas, emojis ni formato Markdown.
9. No felicites la elección ni prometas nada sobre el futuro laboral. El resultado es una brújula, no una sentencia.
10. Responde solo con el texto del motivo, sin saludo ni despedida.
```

- **Validación de la salida.** El servidor recorta los espacios del borde, junta los espacios
  repetidos y quita un par de comillas que envuelva todo el texto. Después el texto tiene que
  cumplir todas estas reglas, y la primera que falla da el código `invalid:<regla>`.
  - `largo`. De 60 a 500 caracteres y sin saltos de línea.
  - `cifras`. Ningún dígito y ningún signo `%`. Como los datos no traen cifras, cualquier
    número o porcentaje es inventado.
  - `formato`. Sin `:`, `—`, `–`, `*`, `#`, `` ` ``, `http`, `@` ni emojis.
  - `ganadora`. Contiene el nombre completo de cada ganadora, sin distinguir mayúsculas ni
    tildes.
  - `otras`. Fuera de las comillas latinas, no contiene el nombre completo de ninguna de las
    cuatro especialidades que no esté en `nombrables`. Así Cohere no puede presentar como
    ganadora a otra que el cálculo no pone arriba. Lo que va entre comillas no cuenta, porque un
    electivo puede llevar en su nombre el de otra especialidad («Arquitectura de Tecnologías de
    la Información» es también de Sistemas de Información), y a ese texto lo revisa `comillas`.
  - `comillas`. Todo texto entre comillas latinas es un nombre de `electivos` o la respuesta
    de escala de una ganadora.
  - `resto`. No trae las marcas `DATOS DEL TEST` ni `FIN DE LOS DATOS`.
- **Qué devuelve.** `reason` con el texto aceptado y `reasonSource: "ai"`, o el motivo de las
  plantillas y `reasonSource: "templates"`. El motivo no se guarda (RS-BE-44).
- **Pruebas.** Las pruebas inyectan un cliente falso, así que ninguna llama a Cohere. Cubren
  que el mensaje no lleve el nombre, el código ni el id de un alumno de prueba (20230001,
  Garcia Lopez, Maria), cada regla de validación con un texto que la rompe, el tiempo agotado,
  el error HTTP y el texto aceptado.

`[@test] ../../../test/HU36_jeff/specialty-test-reason.test.ts` *(pendiente)*

### RS-BE-44 · Guardado del último resultado

- **Qué se guarda.** Cuando el paso es el resultado final, el servidor guarda una fila por
  alumno en `student_specialty_test_result` con la versión del contenido, el ranking (clave,
  `specialtyId` y afinidad redondeada de las cuatro, en orden), si hay empate y la fecha.
  Sobre la lista de la decisión 5 suma el empate y el `specialtyId`, que el Perfil necesita
  para mostrar el resultado igual que la pantalla del test y para elegir desde ahí sin volver a
  resolver nombres (decisión abierta 8).
- **Qué no se guarda.** Las respuestas una por una, los desempates, el motivo ni las líneas de
  Ulises. El motivo resume las tareas que el alumno elige, así que guardarlo sería guardar
  parte de sus respuestas (decisión abierta 8).
- **Solo el último.** `INSERT … ON CONFLICT (student_id) DO UPDATE`. Rehacer el test reemplaza
  la fila, y dos evaluaciones simultáneas dejan la última que escribe.
- **Orden.** El guardado va antes de la llamada a Cohere, porque el ranking no depende del
  motivo. Si el guardado falla, el error sube al manejador global (`500`) antes de gastar una
  llamada a Cohere, y la app puede reintentar con el mismo cuerpo, que da el mismo ranking.
- **Cuándo.** Solo en el resultado final. Un paso de desempate no escribe nada. El guardado
  ocurre aunque el alumno después toque «Decidir después» en la pantalla del resultado.
- **Borrado.** La fila cae con el alumno (`ON DELETE CASCADE`). No hay ruta para borrarla
  aparte (ver «Qué NO entra»).

`[@test] ../../../test/HU36_jeff/migration-0014.test.ts` *(pendiente)*
`[@test] ../../../test/HU36_jeff/specialty-test.repository.test.ts` *(pendiente)*
`[@test] ../../../test/HU36_jeff/specialty-test.postgres.test.ts` *(pendiente, corre solo con `TEST_DATABASE_URL`)*

### RS-BE-45 · Último resultado para el Perfil

`GET /specialty-test/me/result` devuelve el último resultado guardado del alumno del token, o
`{ "result": null }` con `200` si el alumno no tiene ningún test terminado.

- Trae la versión, la fecha, el empate y el ranking guardado, con el nombre de cada
  especialidad tomado de la versión vigente del contenido por su clave.
- `isCurrentVersion` dice si el resultado corresponde a la versión vigente, para que el
  Perfil pueda sugerir rehacer el test cuando el contenido cambia.
- No trae el motivo, que no se guarda.
- Una fila cuyo `ranking` no pasa la validación de Zod al leerse es un error (`500`), no un
  resultado vacío, siguiendo la regla de no ocultar fallos de la base
  (`academic-profile.repository.ts:49-53`).

`[@test] ../../../test/HU36_jeff/specialty-test.routes.test.ts` *(pendiente)*
`[@test] ../../../test/HU36_jeff/specialty-test.service.test.ts` *(pendiente)*

### RS-BE-46 · Autorización, límites y errores

- **Autorización.** Todo el módulo lleva `authMiddleware` y `requireRole(...STUDENT_ROLES)`,
  como `time-blocks` y `academic-record`. Un token docente recibe `403 FORBIDDEN`. El alumno
  sale solo del token y no hay parámetro de alumno.
- **Límite de tasa.** `specialtyTestRateLimit`, en `src/shared/middleware/rate-limit.ts` con el
  mismo patrón que `chatbotRateLimit`, permite **30 evaluaciones por alumno por hora** en
  `POST /specialty-test/me/evaluate`. Un test completo usa de una a tres, así que alcanza para
  unas diez vueltas por hora, y cada vuelta llama a Cohere a lo más una vez. Al pasarse
  responde `429 RATE_LIMITED` con el mensaje «Hiciste demasiados intentos del test. Intenta de
  nuevo en N minuto(s).» y `details.retryAfterMinutes`. El contador vive en la memoria de cada
  instancia, con el mismo límite que ya documentan los otros contadores del archivo. Las dos
  rutas `GET` no llevan límite (decisión abierta 10).
- **Tamaño.** `bodyLimit` de 4 KiB solo en la ruta `POST`, con un `onError` que lanza
  `HttpError(413, …, "PAYLOAD_TOO_LARGE")` para que la respuesta tenga la forma de error de
  siempre. Es el primer `413` de la API.
- **Caché.** `POST /specialty-test/me/evaluate` y `GET /specialty-test/me/result` responden
  con `Cache-Control: no-store`, como `academic-record`.
- **Registro.** Ningún `console` del módulo imprime respuestas, motivos ni ids de alumno.
- **Códigos.** `400 INVALID_JSON_BODY`, `400 INVALID_REQUEST_BODY`,
  `400 SPECIALTY_TEST_INVALID_ANSWERS`, `400 SPECIALTY_TEST_TIEBREAK_MISMATCH`,
  `401 MISSING_TOKEN`, `401 INVALID_TOKEN`, `403 FORBIDDEN`, `404 USER_NOT_FOUND`,
  `404 SPECIALTY_TEST_NOT_AVAILABLE`, `409 SPECIALTY_TEST_VERSION_OUTDATED`,
  `413 PAYLOAD_TOO_LARGE`, `429 RATE_LIMITED` y `500 INTERNAL_SERVER_ERROR` para un fallo de
  la base. Cohere nunca produce un error (RS-BE-43).

`[@test] ../../../test/HU36_jeff/specialty-test.routes.test.ts` *(pendiente)*
`[@test] ../../../test/HU36_jeff/specialty-test.rate-limit.test.ts` *(pendiente)*

### RS-BE-47 · El chatbot no lee el resultado (propuesta)

Ni `chatbot.repository.ts` ni `chatbot.service.ts` leen `student_specialty_test_result` ni
importan el módulo `specialty-test`, igual que el récord (RS-BE-28 de `academic-record`). El
resultado dice qué le gusta al alumno y no tiene por qué salir hacia el proveedor del chatbot
sin una decisión aparte. Una prueba lo fija leyendo el código del chatbot, sin tocarlo
(decisión abierta 12).

`[@test] ../../../test/HU36_jeff/chatbot-isolation-specialty-test.test.ts` *(pendiente)*

## Modelo de datos (migración `0014_specialty_test_result.sql`)

> **Cambio de base de datos que espera la aprobación explícita del dueño.** No se aplica ni se
> escribe el `.sql` antes de esa aprobación.

Número. La `0013` ya la usa `drizzle/0013_chatbot_message_history.sql` en la rama
`fix/chatbot-delegados-bloques`, que no está mergeada, así que esta es la `0014` aunque la
`0013` todavía no esté en `main`. Con la misma lógica, si esa rama se abandona el número no se
reusa.

Se aplica con `bun run db:apply drizzle/0014_specialty_test_result.sql`, con respaldo previo y
antes del merge del código que la usa, según `MIGRATIONS.md`, y no con `db:migrate` ni
`db:generate`, porque `drizzle/meta/_journal.json` sigue en la `0009`. Es aditiva e
idempotente (`CREATE TABLE IF NOT EXISTS`) y no toca ninguna tabla existente.

| tabla | clave | columnas |
| :--- | :--- | :--- |
| `student_specialty_test_result` | PK `student_id` | `student_id` integer NOT NULL, FK → `student(id)` ON DELETE CASCADE; `content_version` varchar(20) NOT NULL; `ranking` jsonb NOT NULL; `is_tie` boolean NOT NULL; `completed_at` timestamptz NOT NULL default now() |

CHECK de la tabla.

- `chk_specialty_test_version`. `content_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'`.
- `chk_specialty_test_ranking`. `jsonb_typeof(ranking) = 'array' and jsonb_array_length(ranking) = 4`.

Forma de cada elemento de `ranking`, en orden y validada con Zod al escribir y al leer.

```json
[
  { "key": "vj", "specialtyId": 7, "affinity": 75 },
  { "key": "si", "specialtyId": 6, "affinity": 65 },
  { "key": "ti", "specialtyId": 5, "affinity": 28 },
  { "key": "sw", "specialtyId": 1, "affinity": 24 }
]
```

Los `specialtyId` del ejemplo son ilustrativos; el servidor los resuelve por nombre (RS-BE-38).

- **Por qué la clave es `student_id`.** Hay una sola fila por alumno (decisión 5), y la clave
  primaria sobre `student_id` lo garantiza en la base y le da al `ON CONFLICT` su destino, igual
  que `student_academic_snapshot` en la `0011`. No hace falta otro índice, porque las dos
  lecturas y la escritura van por `student_id`.
- **Por qué `jsonb` y no cuatro columnas por especialidad.** El ranking se escribe y se lee
  entero, nunca se consulta por una especialidad desde SQL, y su orden es parte del dato. Los
  CHECK aseguran que sea un arreglo de cuatro y Zod valida cada elemento.
- **Sin FK hacia `specialty`.** El `specialtyId` dentro del `jsonb` no lleva integridad
  referencial. Es una foto del resultado, como el ranking.
- **`schema.ts`.** Suma `studentSpecialtyTestResult` con las mismas columnas, la clave y los
  dos CHECK.

## Contrato

```
Todas las rutas de /specialty-test: Bearer, roles de alumno, alumno tomado del token.

GET /specialty-test/content
200 → {
  "version": "2026-09-25.3",
  "specialties": [ {
    "key": "sw", "specialtyId": 1, "name": "Ingeniería de Software",
    "tagline": "Diseña y programa aplicaciones que funcionan bien y se pueden seguir mejorando.",
    "color": { "light": "#1E3A8A", "dark": "#A5C0F7" }, "icon": "code-xml", "totalCredits": 21,
    "electives": [ { "code": "650070", "name": "Paradigmas de Programación",
                     "shortName": "Paradigmas de Programación", "credits": 3,
                     "prerequisite": "Haber culminado el V ciclo" } ]
  } ],
  "ulises": {
    "welcome": [ "¡Hola! Soy Ulises. …" ], "startButton": "Vamos",
    "duelHelp": "Toca la tarea que harías con más ganas.",
    "scaleHelp": "Elige cuánto te gustaría hacer esta tarea.",
    "reactions": { "pick": [ "Anotado." ], "both": [ … ], "none": [ … ], "scale": [ … ] },
    "loading": "Dame un toque que junto tus respuestas."
  },
  "duelOptions": [ { "id": "top", "label": "(tarea de arriba)" }, { "id": "bottom", … },
                   { "id": "both", "label": "Me gustan las dos" },
                   { "id": "none", "label": "Ninguna me llama" } ],
  "scaleOptions": [ { "id": "nada", "label": "Nada" }, { "id": "un_poco", "label": "Un poco" },
                    { "id": "bastante", "label": "Bastante" },
                    { "id": "me_encantaria", "label": "Me encantaría" } ],
  "questions": [
    { "id": "q01", "n": 1, "type": "duel", "prompt": "¿Cuál harías con más ganas?",
      "top": { "id": "q01.top", "specialty": "sw",
               "text": "Programar la app con la que una bodega recibe pedidos del barrio",
               "illustration": "Celular con la app de una bodega abierta, …" },
      "bottom": { "id": "q01.bottom", "specialty": "si", "text": "…", "illustration": "…" },
      "reaction": "Arrancamos por el barrio. …" },
    { "id": "q04", "n": 4, "type": "scale", "prompt": "¿Cuánto te gustaría hacer esto?",
      "task": { "id": "q04.task", "specialty": "ti", "text": "…", "illustration": "…" },
      "blockClose": "Primer tramo listo. Van 4 de 14." }
  ]
}

POST /specialty-test/me/evaluate
body: {
  "version": "2026-09-25.3",
  "answers": { "q01": "bottom", "q02": "bottom", "q03": "both", "q04": "nada",
               "q05": "top", "q06": "top", "q07": "top", "q08": "bastante",
               "q09": "top", "q10": "top", "q11": "bottom", "q12": "me_encantaria",
               "q13": "bottom", "q14": "un_poco" },
  "tiebreakAnswers": []
}
200 → { "status": "tiebreak",
        "tiebreak": { "id": "tb-si-vj-1", "order": 1, "prompt": "¿Cuál harías con más ganas?",
                      "top": { "id": "tb-si-vj-1.top", "specialty": "si", "text": "…", "illustration": "…" },
                      "bottom": { "id": "tb-si-vj-1.bottom", "specialty": "vj", "text": "…", "illustration": "…" } },
        "ulisesLine": "Tienes dos especialidades muy parejas. Te hago una pregunta más para desempatar." }

mismo body con "tiebreakAnswers": [ { "id": "tb-si-vj-1", "answer": "bottom" } ]
200 → { "status": "tiebreak", "tiebreak": { "id": "tb-si-vj-2", "order": 2, … },
        "ulisesLine": "Sigue reñido. Una última y listo." }

mismo body con "tiebreakAnswers": [ { "id": "tb-si-vj-1", "answer": "bottom" },
                                    { "id": "tb-si-vj-2", "answer": "top" } ]
200 → { "status": "result",
        "result": {
          "version": "2026-09-25.3",
          "completedAt": "2026-09-25T20:15:00.000Z",
          "tie": false,
          "ranking": [ { "key": "vj", "specialtyId": 7, "name": "Desarrollo de Videojuegos", "affinity": 75 },
                       { "key": "si", "specialtyId": 6, "name": "Sistemas de Información", "affinity": 65 },
                       { "key": "ti", "specialtyId": 5, "name": "Tecnologías de la Información", "affinity": 28 },
                       { "key": "sw", "specialtyId": 1, "name": "Ingeniería de Software", "affinity": 24 } ],
          "reason": "Desarrollo de Videojuegos sumó 5,5 de 7 puntos en los duelos, …",
          "reasonSource": "templates",
          "ulises": { "intro": "Ya tengo tu resultado.",
                      "headline": "Lo tuyo apunta a Desarrollo de Videojuegos, con 75 % de afinidad.",
                      "tiebreakOutcome": "Ahí está, ya se inclinó la balanza.",
                      "closing": "Tómalo como una brújula, no como una sentencia. …",
                      "retake": "Si más adelante cambias de idea, puedes volver a hacer el test." } } }

GET /specialty-test/me/result
200 → { "result": null }
200 → { "result": { "version": "2026-09-25.3", "isCurrentVersion": true,
                    "completedAt": "2026-09-25T20:15:00.000Z", "tie": false,
                    "ranking": [ { "key": "vj", "specialtyId": 7, "name": "Desarrollo de Videojuegos", "affinity": 75 }, … ] } }
```

- El ejemplo del `POST` es el `ejemplo-2` del contenido, que no cambia con la versión
  `2026-09-25.3`. Los `specialtyId` son ilustrativos.
- `affinity` es siempre un entero de 0 a 100. `completedAt` es ISO-8601 en UTC con
  milisegundos. `tiebreakOutcome` es `null` si no hay desempate. `reasonSource` es `"ai"` o
  `"templates"`.
- Con empate, `tie` es `true`, las dos primeras del ranking son las ganadoras, `headline` es la
  línea `tie` y `tiebreakOutcome` es la línea `stillTied`.
- Errores y mensajes en RS-BE-46 y en `docs/specs/api-contracts.md`.

## Pruebas por regla

Todas se crean con la implementación, en `test/HU36_jeff/`, y hoy no existen.

| Regla | Pruebas | Qué fijan |
| --- | --- | --- |
| RS-BE-37 | `specialty-test-content.test.ts` | Invariantes de cada versión del registro, pesos y condiciones iguales a las constantes, y los ocho ejemplos reproducidos letra por letra |
| RS-BE-38 | `specialty-test.routes.test.ts`, `specialty-test.service.test.ts` | Qué campos viajan y cuáles no, resolución de `specialtyId` por nombre sin tildes ni mayúsculas, `404 SPECIALTY_TEST_NOT_AVAILABLE` |
| RS-BE-39 | `specialty-test.routes.test.ts`, `specialty-test.service.test.ts` | Orden de la validación, `413`, `429`, `400` de forma, `409` de versión, respuestas faltantes, de más y con valor de otro tipo, desempate que no toca, con otro id o de más |
| RS-BE-40 | `specialty-test-logic.test.ts` | `S` y `U` enteros e iguales a la fracción exacta para todo `h`, `n` y `e`; orden por `S`, `U`, `e` y orden fijo; redondeo de 17,5 a 18 |
| RS-BE-41 | `specialty-test-logic.test.ts` | Diferencia de 10 exacta que pide desempate y de 11 que no lo pide, 10,83 tras el primer desempate que ya no pide el segundo (la menor diferencia posible por encima de 10 con seis duelos), segundo desempate medido en el par aunque una tercera lo pase, ningún tercer desempate |
| RS-BE-42 | `specialty-test-logic.test.ts` | Cada plantilla `main` alcanzada al menos una vez, `tie` sola con empate, empate con afinidad menor que 50 con titular `tie`, `{electivos}` sin repetidos, `stillTied` y `resolved` |
| RS-BE-43 | `specialty-test-reason.test.ts` | Mensaje sin datos del alumno de prueba, cada regla de validación, tiempo agotado a los 5 s, error HTTP y texto aceptado |
| RS-BE-44 | `migration-0014.test.ts`, `specialty-test.repository.test.ts`, `specialty-test.postgres.test.ts` | SQL de la migración, `ON CONFLICT (student_id)`, una sola fila tras dos evaluaciones y la fila borrada con el alumno |
| RS-BE-45 | `specialty-test.routes.test.ts`, `specialty-test.service.test.ts` | `result: null`, ranking con nombres de la versión vigente, `isCurrentVersion` y `500` ante un `ranking` corrupto |
| RS-BE-46 | `specialty-test.routes.test.ts`, `specialty-test.rate-limit.test.ts` | `401`, `403` con token docente, `429` en la evaluación 31, `no-store` y la forma de error del `413` |
| RS-BE-47 | `chatbot-isolation-specialty-test.test.ts` | El chatbot no nombra la tabla ni importa el módulo |
| BR-AP-07 | `academic-profile-official.test.ts` | `is_active = true` en el listado y en `specialtyBelongsToCareer`, y `404 SPECIALTY_NOT_FOUND` al elegir una inactiva |
| BR-AP-08 | `academic-profile-atomic.test.ts` | Un fallo a mitad del reemplazo deja intactas las especialidades previas |

## Enmienda a la spec de Academic Profile

Esta funcionalidad cambia dos reglas publicadas de `academic-profile.spec.md`. La spec
enmendada lleva la marca en cada regla y los detalles están allí.

- **BR-AP-03 y BR-AP-07 (decisión 6).** `GET /academic-profile/specialties` devuelve solo las
  especialidades con `is_active = true`, con `careerId` o sin él, porque las dos ramas pasan
  por `findSpecialtiesByCareerId`.
- **BR-AP-04 y BR-AP-07 (decisión 6).** `specialtyBelongsToCareer` exige `is_active = true`,
  así que `PUT /academic-profile/me/specialties` con una especialidad inactiva responde
  `404 SPECIALTY_NOT_FOUND`, el mismo código que una de otra carrera.
- **BR-AP-08 (decisión abierta 14).** El reemplazo de especialidades pasa a una sola
  transacción. Hoy desactiva todas y después inserta una por una (`academic-profile.service.ts:72-86`),
  y un fallo a mitad deja al alumno sin especialidades. «Elegir como principal» y los
  corazones del resultado del test usan esa ruta.

## Cambios en otras specs

- `docs/specs/api-contracts.md`. La sección nueva «Specialty Test» con las tres rutas, y en
  «Academic Profile» el filtro del listado y el `404` por especialidad inactiva.
- `docs/specs/feature-index.md`. La fila de esta funcionalidad y la enmienda en la fila de
  Academic Profile.
- `specs/features/academic-profile/academic-profile.spec.md`. BR-AP-07 y BR-AP-08, y las
  marcas de enmienda en BR-AP-03 y BR-AP-04.
- `MIGRATIONS.md`. La entrada de la `0014` se escribe cuando el dueño la aplica, con su
  respaldo y su verificación.
- Spec del frontend (por escribir). Tiene que cubrir que `getEspecialidadName()`
  (`lib/services/auth_service.dart`, cerca de la línea 92) devuelve una cadena vacía para un id
  antiguo que sigue en caché (decisión 6), el uso de `specialtyId` para elegir, el `409` de
  versión, el `404` de test no disponible, el color de cada tarjeta y las ilustraciones.

## Qué NO entra

- **La fase 3.** Nada de aprendizaje automático (decisión 2).
- **Guardar respuestas, historial o motivo.** Solo el último resultado (decisión 5).
- **Borrar el resultado desde la app.** Rehacer el test lo reemplaza y la fila cae con el
  alumno.
- **Elegir la especialidad desde este módulo.** La elección sigue en
  `PUT /academic-profile/me/specialties`, sin cambios de contrato salvo el filtro.
- **Tocar los datos de `specialty`.** El filtro no hace `UPDATE` de `is_active` (decisión 6).
- **Filtrar otras lecturas de especialidades.** `GET /academic-profile/me`, el login
  (`auth.repository.ts:587-605`) y la malla (`curriculum.repository.ts:39-43`) siguen como
  están (decisión abierta 13).
- **Las imágenes de las tareas.** El servidor manda el id y la descripción de cada tarea; las
  imágenes son del frontend.
- **Otras carreras.** El contenido es de Ingeniería de Sistemas, plan 2026-1. Para otra
  carrera el test no está disponible (RS-BE-38).
- **El truco del 67.** Es solo del frontend.

## Decisiones abiertas

Cada punto trae la opción que la spec adopta por defecto. Ninguno está aprobado.

1. **Las cinco dudas del revisor (decisión 3), que dan la versión `2026-09-25.3`.** La línea
   `low` de Ulises sale con afinidad de la ganadora menor que 50. La línea `second` de Ulises
   no se usa. La tarea de Sistemas de Información de `tb-sw-si-2` pasa a «Unir los datos de
   varias boticas para que ninguna se quede sin medicinas» (13 palabras). La escala de TI
   (pregunta 4) pasa a «Lograr que la web de una tienda aguante a miles de compradores en una
   oferta de medianoche». El Metropolitano (pregunta 10) se puede nombrar. **Aviso.** La escala
   de TI propuesta tiene 17 palabras y rompe la pauta de 6 a 14 del propio contenido, que
   `generar.py` y RS-BE-37 hacen cumplir, y además se parece a la tarea de TI de la pregunta 10
   (una web que no se cae cuando todos compran). La spec propone «Lograr que la web de una
   tienda aguante miles de compras a medianoche» (13 palabras), que el dueño confirma o cambia.
   Los motivos de los ejemplos 3, 6 y 7 cambian con los resúmenes nuevos.
2. **Resumen, electivos e ilustración de las dos tareas nuevas.** `tb-sw-si-2`, resumen «unir
   los datos de varias boticas para que no falten medicinas», electivo 650071, ilustración
   «Varias boticas pequeñas con flechas que llegan a un solo cilindro de base de datos». Escala
   de TI, resumen «lograr que la web de una tienda aguante una oferta de medianoche»,
   electivos 650025 y 650077, ilustración «Tienda en línea con una fila larga de carritos y
   varios servidores en la nube que se reparten la carga, con un reloj en las doce».
3. **Empate con afinidad menor que 50.** El titular de Ulises es `tie` y no `low`, igual que el
   motivo, que con empate usa solo `tie`. Ocurre en el 2,8 % de los juegos al azar de la
   simulación.
4. **La especialidad de cada tarea viaja en `GET /specialty-test/content`.** No se trata como
   secreto, porque el diseño elegido enciende la tarjeta tocada con su color (decisión 4) y el
   puntaje es transparente. La alternativa, ocultarla, obliga a un viaje al servidor por toque.
5. **Clave a `specialtyId` por nombre.** Se busca por nombre sin tildes ni mayúsculas entre
   las especialidades activas de la carrera del alumno, y si falta alguna el test no está
   disponible (`404`). La alternativa es fijar los ids en el JSON, que ata el contenido a una
   base concreta y rompe las pruebas con otra.
6. **Cohere sin cifras.** Los datos no llevan afinidades ni puntos y el texto no puede traer
   dígitos ni porcentajes. Es la forma más simple de asegurar que no invente porcentajes. La
   alternativa es mandar las afinidades y aceptar solo las que coinciden, que exige comprobar
   a qué especialidad se atribuye cada número.
7. **Parámetros de Cohere.** 5 segundos de espera, `temperature` 0,3, `maxTokens` 200 y
   motivos de 60 a 500 caracteres.
8. **Qué se guarda.** La fila suma el empate y el `specialtyId` a lo que pide la decisión 5
   (ranking, fecha y versión). El motivo no se guarda, porque resume respuestas.
9. **Diseño de la tabla.** Clave `student_id`, ranking en `jsonb` con dos CHECK, sin índice
   extra, migración `0014` aplicada con `db:apply`. Es el cambio de BD que pide aprobación.
10. **Límites.** 30 evaluaciones por alumno por hora, cuerpo de hasta 4 KiB con el código
    nuevo `413 PAYLOAD_TOO_LARGE`, y sin límite en las rutas `GET`.
11. **Versiones.** La evaluación acepta cualquier versión del registro y responde `409` con
    una retirada. La alternativa, aceptar solo la vigente, haría empezar de nuevo a quien
    está a mitad del test durante un despliegue.
12. **El chatbot no lee el resultado (RS-BE-47).** Con una prueba guardia que solo lee el
    código del chatbot.
13. **Sin filtro en otras lecturas.** `GET /academic-profile/me`, el login y la malla siguen
    mostrando lo guardado aunque una especialidad pase a inactiva. Con los datos del
    2026-09-25 no cambia nada, porque ninguna selección activa apunta a una antigua. Los
    ejemplos de `GET /academic-profile/me` con «Ciencia de Datos» quedan como están y dejan de
    ser un caso posible.
14. **Reemplazo atómico de especialidades (BR-AP-08).** Figura en las notas técnicas del
    2026-09-25, pero no en el registro de decisiones del dueño, así que va aquí para que lo
    confirme.
15. **`generar.py` y el documento de revisión en el repo.** `generar.py` pasa a
    `scripts/specialty-test/generar.py`, escribe el JSON en
    `src/modules/specialty-test/content/` y el documento legible en
    `docs/specialty-test/contenido-<versión>.md`. Así cada versión se puede regenerar y revisar.
16. **Colores.** El backend sirve los colores del contenido aprobado (por ejemplo `#1E3A8A`
    para Software), que no son los de la maqueta elegida (`#5B4BDB`). La spec del frontend
    decide cuáles usa; si son los de la maqueta, se cambian en el contenido con una versión
    nueva.
17. **`[@test]` pendientes.** `docs/specs/spec-template.md` pide no enlazar pruebas que no
    existen, pero el repo ya lo hace en la primera versión de la spec de `time-blocks`, y aquí
    cada enlace lleva *(pendiente)* hasta que la prueba exista.

## Verificación antes del merge

- `bun run build` y `bun test` en verde, con todas las pruebas de «Pruebas por regla».
- El dueño confirma en solo lectura que las especialidades con `is_active = true` de
  Ingeniería de Sistemas son exactamente las cuatro oficiales, con los ids 1, 5, 6 y 7 y los
  nombres del contenido. Según la comprobación del 2026-09-25, ningún alumno tiene
  una especialidad antigua como principal y las 19 selecciones activas apuntan a esos
  cuatro ids.
- El dueño aprueba el cambio de BD, aplica la `0014` con respaldo y la verificación
  (`to_regclass('student_specialty_test_result')`, las cinco columnas, la clave, la FK con
  `ON DELETE CASCADE` y los dos CHECK), y la registra en `MIGRATIONS.md`.
- Un recorrido contra el backend desplegado con una cuenta de prueba, que termine una vez sin
  desempate y otra con dos, que vea el resultado en `GET /specialty-test/me/result` y que
  compruebe que el motivo llega con `reasonSource: "ai"` y, con Cohere forzado a fallar en un
  entorno de prueba, con `"templates"`.
- Una llamada de `GET /specialty-test/content` desde un despliegue de vista previa que no use
  la base de producción, para comprobar que el JSON del contenido entra en el empaquetado de
  Vercel.
