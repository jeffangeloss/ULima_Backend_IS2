---
name: Delegados desde el portal
description: Trae de miUlima quién es delegado y subdelegado de cada sección del alumno, lo muestra en la app aunque esa persona todavía no use ULima++, y le otorga los permisos de delegado en cuanto se registre y sincronice.
targets:
  - ../../../src/modules/portal-sync/**
  - ../../../src/services/portal.client.ts
  - ../../../src/modules/course-detail/**
  - ../../../src/modules/auth/auth.service.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/**
  - ../../../MIGRATIONS.md
  - ../../../docs/specs/api-contracts.md
  - ../../../test/HU31_jeff/**
---

# Delegados desde el portal

> Estado: **implementada** en `feat/delegados-portal` (2026-09-04). 913 tests verdes, `tsc` limpio, y el parser validado contra el HTML real de las 10 secciones de 2 cuentas: 10/10 correctas. Dos bugs propios salieron en la fase de pruebas y están corregidos (ver §Verification). Aprobado por el owner el 2026-09-04 sección por sección. Fuente verificada contra el portal real ese mismo día: **10 nóminas de 2 cuentas distintas** (spike `spike-portal/sondear_delegado.py`, fuera del repo). Revisada por seis críticos independientes el mismo día; sus ocho bloqueantes están incorporados. Enmienda reglas ya publicadas de la spec de Portal Sync (ver §Enmiendas). Tiene un prerrequisito fuera de alcance que hoy no existe (ver §Fuera de alcance).

## Contexto

Hoy los delegados y subdelegados de ULima++ salen de `src/db/seed/delegados_secciones.ts`: 617 líneas human-gated con los rosters tipeados a mano. Los delegados cambian cada ciclo, así que el seed queda mintiendo apenas rota el período — al 2026-09-04 ya estamos en 2026-2 con datos escritos para ciclos anteriores.

miUlima publica el dato real, y se lo publica a **cualquier alumno**, no solo a los delegados.

### La fuente, verificada el 2026-09-04

`av/servlets/ComandoIngresarAulaVirtualBBDelegado` **no** devuelve la nómina: devuelve un frameset con dos iframes. El dato vive dos saltos más adentro.

1. **Cascarón** — `av/servlets/ComandoIngresarAulaVirtualBBDelegado`. Frameset. `ifrCursos` apunta al sidebar; `ifrData` arranca en `gada/adm/defaultdata.html` (vacío) y lo llena `cargarInfo(link, NuAula)` por JavaScript. Los tres comandos BB (Nota, Asistencia, Delegado) comparten este mismo cascarón y solo cambia el servlet del sidebar.
2. **Sidebar** — `av/servlets/ComandoListarCursosXOpcionAulaVirtualDelegado`. Un `<a href="javascript:OpenDelegado('<aula>');">` por curso, y arrays JS planos con el mapeo: `aNuAula`, `aCurs` (código de curso), `aSecc` (código de sección), `aNomCurs` (nombre truncado a 20, inservible), `aTipAV` (`"002"` = PREGRADO).
3. **Nómina** — `av/servlets/ComandoListarAulaDelegadoAulaVirtual?prm_sNuAula=<aula>`. La tabla real.

`OpenDelegado` y el resto de los `Open*()` están definidos en `/portalUL/av/scripts/aVirtualBB.js`, que **es público** (HTTP 200 sin sesión) y documenta la API entera del Aula Virtual. Cada función arma `var Cad = '?<param>='+Aula` y `var link = '<ruta>'+Cad`.

### Forma de la nómina

`<title>Aula Delegado <aula></title>`. Encabezado `Orden | Código | Apellidos y Nombres | Delegado | Sub-delegado`, renderizado como **9 celdas** porque el portal intercala celdas espaciadoras.

Solo hay **dos checkboxes por página**, no uno por alumno: la casilla se renderiza únicamente en las filas del delegado y del subdelegado.

Una fila de alumno completa, con valores ficticios:

```html
<INPUT type="HIDDEN" name="prm_sFgInsert_29" value="" size="1">
<INPUT type="HIDDEN" name="prm_sFgUpdate_29" value="" size="1">
<INPUT type="TEXT" name="prm_sCoUser_29" value="20239999" size="10" style="border:0" readonly class="textos">
<INPUT type="TEXT" name="prm_sNoCmpUser_29" value="PEREZ RAMIREZ JUAN CARLOS" size="50" style="border:0" readonly class="textos">
<INPUT type="CHECKBOX" name="prm_sFgDlgd_29" value="1" DISABLED checked class="textos">
```

- `prm_sFgDlgd_<orden>` = delegado; `prm_sFgSdlg_<orden>` = subdelegado. Confirmado en las 10 nóminas.
- **El código y el nombre NO son texto de celda**: viven en el atributo `value` de dos inputs `readonly`. Las celdas 2, 4 y 6 tienen texto vacío; solo la celda 0 (Orden) trae texto. Un parser que use `cellsOf`/`stripTags` sobre esas columnas obtiene cadena vacía.
- Los hidden `prm_sFgInsert_` / `prm_sFgUpdate_` **comparten el prefijo `prm_sFg`** con las casillas; la regex tiene que estar anclada.
- Al tope del formulario hay dos hidden más, `prm_sCoUserDlgd` y `prm_sCoUserSdlg`, vacíos en las 10 capturas; comparten prefijo con `prm_sCoUser_<n>`.
- La celda Orden se rellena a 3 dígitos (`029`); el sufijo del campo va sin relleno (`_29`). El parser trabaja por nombre de campo y nunca los compara.
- La celda de título de la nómina trae el **nombre completo** del curso más la sección (`NOMBRE - <seccion>`), que es una fuente mejor que el `aNomCurs` truncado del sidebar.

Muestra del 2026-09-04, cuenta del owner, ciclo 2026-2:

| aula | curso | sección | alumnos | delegado (orden) | subdelegado (orden) |
|---|---|---|---|---|---|
| 154508 | 650033 | 952 | 40 | 29 | 26 |
| 154516 | 650035 | 958 | 18 | 7 | 1 |
| 154604 | 650067 | 952 | 35 | 8 | 16 |
| 154607 | 650070 | 654 | 34 | 20 | 21 |
| 154621 | 650084 | 1051 | 31 | 5 | 29 |

**El panel no está condicionado a ser delegado.** Queda probado por esta muestra: la cuenta del owner no es la marcada en ninguna de sus 5 secciones y aun así ve las 5 nóminas completas.

**Las casillas llegan siempre deshabilitadas.** 20 de 20 casillas, en las dos cuentas, vienen `DISABLED checked` — incluida la de una cuenta que sí ostenta un cargo. No se ha observado nunca una casilla habilitada.

### El escenario que esta feature tiene que resolver

De un salón de 40, uno solo conoce ULima++ y les dice a sus amigos que la instalen. El delegado puede no estar entre los primeros. En miUlima ya se sabe quién es; solo falta sincronizarlo.

- **Día 1** — A sincroniza. El backend aprende quién es la delegada de su sección 952. Se guarda como hecho pendiente. No se le fabrica cuenta a nadie.
- **Día 2** — A abre su curso y ve "Delegada: <nombre>". Funciona porque se guardó el nombre, no solo el código. Ella no se enteró y no tiene permisos.
- **Día 10** — cinco amigos más sincronizan y reportan lo mismo. Es idempotente.
- **Día 30** — la delegada entra a ULima++ y sincroniza. Su matrícula aparece, empata con el hecho pendiente, y el sistema le da la pestaña sola. Nadie la registra a mano.

## Requirements

- **RQ-1**: El alumno ve quién es el delegado y el subdelegado de cada una de sus secciones del ciclo activo, con nombre y código.
- **RQ-2**: Los ve aunque esa persona no tenga cuenta en ULima++, con una marca de que no es contactable dentro de la app.
- **RQ-3**: Cuando la persona que el portal señala como delegado se registra y sincroniza, obtiene los permisos de delegado sin intervención manual: pestaña propia y publicación de anuncios de su sección. *(La moderación de chat es hoy exclusiva del docente titular — `chat.routes.ts`, `requireRole("teacher")`. Dársela al delegado es otra HU y otro target.)*
- **RQ-4**: Nunca se crean cuentas, matrículas ni alumnos sintéticos a partir de la nómina.
- **RQ-5**: De las filas que baja el portal se persisten únicamente las 2 marcadas. Las demás se descartan al terminar la petición.
- **RQ-6**: Un fallo trayendo delegados no impide guardar el resto de la importación.
- **RQ-7**: Los datos de terceros se borran cuando su ciclo deja de estar activo.

## Arquitectura

Cuatro piezas: tres dentro de `portal-sync` y una lectura en `course-detail`.

1. **Rutas nuevas** en `PORTAL_PATHS` (`src/services/portal.client.ts`) para el sidebar y la nómina. `PortalClient.fetchPage(path, cookies)` ya es genérico: no hace falta un método nuevo.
2. **Parser nuevo** `src/modules/portal-sync/parsers/delegado.ts`, funciones puras con el contrato `ParseResult<T>`.
3. **Escritura** en `portal-sync.repository.ts`: `upsertRepresentativeClaims`, `promoteClaimIfAny` y `deleteClaimsOfPeriod`, llamadas desde el bucle por curso que ya existe dentro de `runInTransaction`.
4. **Lectura** en `course-detail.routes.ts`: el handler de contactos cae al claim cuando no hay representante real.

**Migración**: `drizzle/0006_delegado_claim.sql`, entrada `idx 6` del journal con tag `0006_delegado_claim` y `meta/0006_snapshot.json`. Generada con `drizzle-kit generate --name delegado_claim`: el número **no** es deducible a mano (hay prefijos duplicados y dos `.sql` huérfanos fuera del journal) y por eso se dejó elegir a la herramienta, que numera por conteo de archivos. La migración **no** recrea el enum `representative_position`, que ya existe.

### Tabla nueva: `section_representative_claim`

| columna | tipo | notas |
|---|---|---|
| `id` | identity PK | |
| `section_id` | integer NOT NULL → `section.id` | el aislamiento por ciclo sale gratis: `section` → `course_offering` → `academic_period` |
| `position` | `representative_position` NOT NULL | reusa el enum existente |
| `student_code` | `varchar(30)` NOT NULL | mismo tipo y dominio que `app_user.code`. **`student` no tiene columna de código**; el empate es contra `app_user.code`. |
| `full_name` | `varchar(150)` NOT NULL | mismo largo que `app_user.full_name`. En la muestra de 353 filas (287 alumnos únicos) el rango real es 13-42 caracteres. |
| `observed_at` | timestamptz NOT NULL | instante de la respuesta HTTP, no de la escritura |

Índice único `uq_section_representative_claim_position` sobre `(section_id, position)`.

**No se guarda quién reportó el claim.** Sería útil para auditar, pero crea un registro de "A delató a B" que no compensa.

**`section_representative` no se modifica.** Conserva su `enrollment_id NOT NULL UNIQUE` y su índice único parcial `uq_active_section_representative_position`.

## Rules

### Parser (`parsers/delegado.ts`)

- **RS-1**: `parseAulas(sidebarHtml): ParseResult<DelegadoAula[]>` sale de los arrays JS `aNuAula` / `aCurs` / `aSecc`, emparejados por el **índice explícito del subíndice `[i]`**, nunca por posición en el resultado de la regex: el JSP emite ramas condicionales y un índice al que le falte un array desalinearía todos los cursos posteriores, escribiendo en silencio la nómina de un curso en otro. Un índice incompleto se descarta sin desplazar a los demás. `aCurs` se valida como `^\d{4,6}$` y `aSecc` como `^\d{1,4}$` — los mismos criterios de `parsers/record.ts` y `parsers/aula-virtual.ts`; **`aCurs` no siempre es de 6 dígitos** (en la segunda cuenta aparecen códigos de 4). No se filtra por `aTipAV`: las 10 entradas observadas son `"002"` y filtrar sería una suposición sin muestra. Sí se exige que el aula aparezca además en un `OpenDelegado('<aula>')` del mismo sidebar. `aNomCurs` se ignora: viene truncado. Si no queda **ninguna** aula utilizable devuelve `ok: false`, como hacen `record` y `matricula`: este portal devuelve la página de login con HTTP 200, así que un sidebar vacío casi siempre es una sesión caída, no un alumno sin cursos. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-2**: `parseDelegados(nominaHtml, aulaEsperada): ParseResult<DelegadosNomina>`, donde `DelegadosNomina` lleva `delegate?`, `subdelegate?` y `warnings?: DelegadoDescarte[]`. El canal `warnings` es necesario, no decorativo: sin él, un cargo ausente por dato inservible se ve idéntico a uno ausente porque la sección no eligió, y RS-5a borraría un claim bueno creyendo que hubo revocación. Cada descarte lleva la **posición**, no solo un texto, justo para poder distinguirlos. Los DTO viven en `portal-sync.types.ts`, como los de los otros seis parsers. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-3**: La fila del cargo **se localiza por el checkbox**, cuyo `name` case exactamente con `^prm_sFg(Dlgd|Sdlg)_(\d+)$`. El ancla es obligatoria: los hidden `prm_sFgInsert_` / `prm_sFgUpdate_` comparten prefijo. El sufijo `<orden>` es la llave: `code` = `value` de `<input name="prm_sCoUser_<orden>">` y `fullName` = `clean(value)` de `<input name="prm_sNoCmpUser_<orden>">`, ambas regex ancladas al sufijo numérico para no capturar `prm_sCoUserDlgd` / `prm_sCoUserSdlg`. **No se usa el texto de la celda**: esas dos columnas no tienen texto. El marcado se detecta sobre el tag de la casilla —no sobre la fila— aceptando `checked`, `CHECKED` y `checked="checked"`. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-4**: **Se mira `checked`, nunca `DISABLED`.** Decisión **defensiva**, no predicción: las 20 casillas observadas en las 2 cuentas vienen deshabilitadas, incluida la de una cuenta que ostenta un cargo. Apoyarse en `DISABLED` ataría el parser a un detalle de presentación que el portal puede cambiar sin aviso, y que no aporta información: `checked` ya dice todo. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-5**: **Cero casillas marcadas no es error**, siempre que se haya encontrado al menos una fila de alumno: es una sección que todavía no eligió. `ok: true` con ambos campos ausentes. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-5a**: Un parseo `ok: true` que no trae cargo para una posición **borra** el claim existente de ese `(section_id, position)`: la sección revocó o aún no eligió, y el portal es la fuente de verdad. Nunca se borra con `ok: false` ni cuando la nómina no se pudo descargar. La ausencia de claim **no** desactiva a un `section_representative` real: un claim nunca revoca permisos por sí solo (RS-19). `[@test] ../../../test/HU31_jeff/repository.claim.test.ts`
- **RS-6**: Devuelve `ok: false` si hay dos casillas del mismo cargo marcadas; si la fila de una casilla marcada no tiene código; **si la respuesta no contiene ninguna fila de alumno** (cero coincidencias de `prm_sCoUser_<n>`) — eso no es una sección sin delegado, es una respuesta que no es la nómina, y este portal ya devuelve la página de login con HTTP 200; **o si el aula de la respuesta no es la pedida**, verificado contra el `<title>Aula Delegado <aula>` y el hidden `prm_sNuAula`. Sin esta última guarda, 5 peticiones en paralelo pueden cruzarse y escribir delegados en la sección equivocada. Ante ambigüedad no se escribe nada; nunca se escribe un rol a medias. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-6a**: Si `fullName` supera 150 caracteres, viene vacío, o `code` supera 30 tras normalizar, ese cargo se devuelve como **ausente** (no `ok: false`), se anota en `warnings` con su posición, y el service emite el warning. Un nombre vacío entra acá y no en `ok: false` porque el problema es del nombre y no de la identidad: no debe invalidar al otro cargo de la misma nómina, y un claim sin nombre le haría mostrar un número a la app. El repositorio **no borra** un cargo descartado. Nunca se intenta escribir una fila que la BD pueda rechazar con `22001` dentro de la transacción. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`
- **RS-7**: Los parsers son funciones puras sin dependencias y usan los helpers de `parsers/html.ts`. Se agrega uno: `inputValueByName(html, name): string | null`, que devuelve el atributo `value` del input con ese `name`. `cellsOf` no se usa en este parser. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`

### Cliente del portal

- **RS-8**: `prm_sNuAula` se valida como `^\d{4,8}$` antes de interpolarlo, con el mismo criterio con que hoy se valida `COCICLO` como `^\d{5}$`. `[@test] ../../../test/HU31_jeff/portal.client.delegado.test.ts`
- **RS-9**: Las nóminas se piden en paralelo. Esto **no** es una garantía de que el import siga cabiendo en los 90 s del cliente Flutter: portal-sync tiene un presupuesto declarado de cuatro rondas secuenciales con mediciones reales de 40,7 s y 47,7 s, y esta feature agrega dos rondas y N+1 peticiones. La verificación end-to-end tiene que medir el import completo con esta fase activa y, si se pasa, la fase se mueve a un endpoint aparte. `[@test] ../../../test/HU31_jeff/portal.client.delegado.test.ts`

### Sincronización

- **RS-10**: La descarga y el parseo ocurren **fuera** de la transacción; la escritura **dentro**, en el mismo bucle por curso que ya existe. `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`
- **RS-11**: El empate es en memoria por el **par** `(courseCode, sectionCode)` sobre cadenas ya normalizadas con `clean`, sin rellenar ceros, contra el mismo `sectionCode` que el paso 7 de portal-sync usa como `section.code` (no `groupCode`). El par es imprescindible: en la muestra real dos cursos distintos comparten `sectionCode`. Un aula del sidebar sin fila de matrícula que le corresponda **se ignora**: no crea `section`, no crea `course_offering`, no escribe claim. Si **ninguna** aula empata se emite un warning: que el sidebar y el consolidado no coincidan es señal de un cambio en el portal. El empate se mide contra las aulas que el sidebar **declaró**, nunca contra las nóminas que sobrevivieron a la descarga: medirlo sobre las sobrevivientes hace que una caída de red se reporte además como "el portal cambió", que es falso. En la muestra el empate da 5/5, cadena contra cadena. `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`
- **RS-12**: El **claim** se escribe justo después de `upsertSection`, que es lo que produce el `section_id`. `[@test] ../../../test/HU31_jeff/repository.claim.test.ts`
- **RS-13**: La **promoción** va después de `upsertEnrollment`, dentro del mismo bucle, usando el `id` que esa llamada devuelve: hoy el retorno se descarta y hay que capturarlo. El empate es contra `app_user.code` — el mismo `userCode` que `runImport` ya tiene—, no contra una columna de `student`, que no existe. `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`
- **RS-14**: `section_representative.enrollment_id` tiene un UNIQUE **plano**: una fila desactivada sigue ocupando el valor, así que un `INSERT` plano lanza `23505` en la segunda importación del mismo delegado y, como toda la escritura va en una sola transacción, hace rollback de notas, horario y matrícula — exactamente lo contrario de RQ-6. La escritura es, en este orden:
  1. `update section_representative set is_active = false where section_id = :s and position = :p and is_active = true and enrollment_id <> :e;` — el índice parcial no es diferible: primero desactivar, misma lección de `upsertPeriod`.
  2. `insert into section_representative (section_id, enrollment_id, position, is_active) values (:s, :e, :p, true) on conflict (enrollment_id) do update set section_id = excluded.section_id, position = excluded.position, is_active = true;`

  El conflict target es `enrollment_id`, **no** `(section_id, position)`: así reimportar es idempotente, y pasar de delegado a subdelegado en la misma sección es un UPDATE y no una segunda fila que el UNIQUE hace imposible. `[@test] ../../../test/HU31_jeff/repository.claim.test.ts`
- **RS-15**: **Nunca `DELETE` sobre `section_representative`.** `announcement.section_representative_id` es FK sin cascada: reasignar es `is_active = false`. La prohibición no alcanza a `section_representative_claim`, que no tiene dependientes. `[@test] ../../../test/HU31_jeff/repository.claim.test.ts`
- **RS-16**: `observed_at` es el instante en que se **recibió la respuesta HTTP de la nómina**, fijado por el service; no es `defaultNow()` ni la hora del INSERT — entre observar y escribir hay segundos, porque la descarga ocurre fuera de la transacción. El upsert es **condicionado**: `... on conflict on constraint uq_section_representative_claim_position do update set student_code = excluded.student_code, full_name = excluded.full_name, observed_at = excluded.observed_at where excluded.observed_at > section_representative_claim.observed_at;`. Sin el `where`, dos importaciones concurrentes pueden confirmar en orden inverso al de observación y dejar persistida la observación más vieja. `[@test] ../../../test/HU31_jeff/repository.claim.test.ts`
- **RS-17**: La fase de delegados es **opcional y degrada por aula, no por fase**. (1) Las nóminas se resuelven con `Promise.allSettled`, o cada `fetchPage`/parseo envuelto en su propio try/catch, de modo que un aula que falla no contamine a las demás — `Promise.all` rechaza entero al primer fallo y descartaría los claims de las 5 secciones. (2) Los claims de las secciones que sí parsearon se escriben; solo se omite la fallida. (3) Un warning **por aula fallida**, con `code: "PARSER_FAILED"` cuando el parser devuelve `ok:false` y `code: "DELEGADOS_UNAVAILABLE"` cuando falla la descarga (red, 5xx, timeout o el 409 `PORTAL_SESSION_INVALID` que `fetchPage` lanza ante una redirección), ambos con `block: "delegado"`. El `message` identifica curso y sección y **nunca** contiene fragmentos del HTML. (4) Esto es una **excepción explícita** a la regla de portal-sync según la cual sesión inválida, portal caído y timeout abortan la importación; los sílabos ya necesitaron una excepción escrita a mano y esta es la segunda. `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`

### Autorización

- **RS-18**: Cuando la importación promueve al propio alumno, la respuesta trae un token nuevo. `AuthService` expone un método público `reissueToken(userId, role)` que reusa el `signToken` privado (hoy `PortalSyncService` solo recibe `(repository, client)` y `signToken` es privado). **No se llama a `incrementTokenVersion`**: se re-firma con el `token_version` vigente, cambiando solo `role`. Hay Single Active Session — `authMiddleware` compara el `tokenVersion` del JWT contra `app_user.token_version` en cada petición—, así que incrementarlo invalidaría el token que la app está usando en ese instante, y el `ApiClient` de Flutter trata **todo 401 como expiración y cierra la sesión**: exactamente el efecto que portal-sync evitó eligiendo 409 en vez de 401. El rol se calcula reutilizando `findActiveRepresentation` **después** de que la transacción confirma, nunca derivándolo del claim promovido, para no degradar a `subdelegate` a alguien que ya era `delegate` en otra sección. El campo viaja siempre: `ImportResult.token: string | null`, `null` cuando no hubo promoción. La degradación es simétrica: al alumno desactivado por RS-14 no se le toca `token_version` — su rol queda rancio hasta el próximo login y no otorga nada, porque `SectionManagementService.requireRepresentative` revalida sección por sección. `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`
- **RS-19**: Un claim **no** otorga permisos por sí solo. Solo `section_representative` autoriza. Mientras el delegado no tenga cuenta, su sección no tiene quién publique anuncios, y eso es correcto. `[@test] ../../../test/HU31_jeff/course-detail.contacts-claim.test.ts`

### Lectura

- **RS-20**: La lectura se implementa en el **handler registrado** (`course-detail.routes.ts`, `GET /sections/:sectionId/contacts`, hoy SQL crudo inline; su `Hono` pasa a tiparse con `AuthVariables`, como el resto del proyecto, que es lo que da acceso a `studentId`/`teacherId`); `CourseDetailService.getContacts` existe y está testeado pero **ninguna ruta lo registra**, así que no es el punto de extensión. **Precondición**: el endpoint responde solo si el usuario autenticado tiene una fila de `enrollment` en `:sectionId`; si no, `403 SECTION_FORBIDDEN`. Hoy el handler solo exige `authMiddleware` + `requireRole`, sin predicado de pertenencia, de modo que cualquier usuario puede iterar `sectionId`; sin esa guarda el claim se convertiría en un padrón consultable de delegados de toda la universidad. El fallback no se implementa antes que la guarda.

  El claim se resuelve **por comparación, no por existencia**, y por cargo: (1) si hay `section_representative` activo para `(section_id, position)` → se devuelve ese contacto y el claim no se emite; (2) si no lo hay pero existe un `app_user` con el `student_code` del claim matriculado en la sección → se devuelve ese contacto, ya presente en `alumnos[]`, **sin** marca; (3) solo si ningún `app_user` tiene ese código se emite la entrada derivada del claim. En ningún caso la misma persona aparece dos veces.

  La entrada derivada va en una clave hermana nueva, no dentro de `alumnos[]` (cuyos elementos exigen `email`, `career_id` y `setupComplete`, que un claim no tiene): `representantesPendientes: [{ code, firstName, lastName, position, contactable: false }]`, con el nombre partido por el mismo `splitName` del módulo. La marca es `contactable: false` y no un flag de pertenencia: el propósito es que la app no ofrezca chatear con alguien que no existe, que es una afirmación sobre una capacidad y no sobre la persona. `[@test] ../../../test/HU31_jeff/course-detail.contacts-claim.test.ts`

### Privacidad

- **RS-21**: Se leen todas las filas en memoria porque no hay otra forma de saber quiénes son las 2 marcadas, pero **solo se persisten esas 2**. `[@test] ../../../test/HU31_jeff/service.delegados.test.ts`
- **RS-22**: El borrado ocurre en la **misma transacción de la importación**, inmediatamente después de `upsertPeriod`, y barre los claims de **todo período inactivo**, no solo del que ese UPDATE acaba de desactivar: `delete from section_representative_claim c using section s, course_offering co, academic_period ap where c.section_id = s.id and s.course_offering_id = co.id and co.academic_period_id = ap.id and ap.is_active = false and ap.id <> :periodoImportado;`. Cuesta lo mismo, es idempotente, y además limpia los ciclos que quedaron cerrados antes de que esta función existiera. La exclusión del período que se está importando **no es opcional**: `shouldActivatePeriod` devuelve false para un ciclo creado antes de su fecha de inicio —lo que el service reporta como `PERIOD_NOT_ACTIVATED_YET`— y `upsertPeriod` lo escribe con `is_active = false`; sin excluirlo, una segunda importación hecha todavía antes de esa fecha borra los claims del ciclo VIGENTE, y como RS-17 degrada por aula, las secciones cuya nómina falle quedan sin delegado. Se reporta en `summary.claimsDeleted`. El disparador es la primera importación del ciclo nuevo, no un reloj: es el único evento de cierre de ciclo que hoy existe en el repo (`vercel.json` no tiene `crons` y no hay scheduler). Ver §Fuera de alcance para el límite. `[@test] ../../../test/HU31_jeff/repository.claim.test.ts`
- **RS-23**: Ningún código ni nombre real de un tercero se escribe en `specs/`, en `docs/` ni en `test/**/fixtures/`. Los datos crudos del spike (`spike-portal/out_deleg/`) viven fuera de todo repositorio y se cubren con un `.gitignore` propio (`out*/`, `*.har`), para que el control no dependa de que nadie corra `git init` un nivel más arriba. La anonimización de los fixtures es **regla**, no paso de verificación: mapeo determinista y estable entre nóminas, con la convención ya versionada en `test/HU31_jeff/fixtures/matricula.html` (códigos `2020NNNN`, nombres tipo `JUAN CARLOS PEREZ RAMIREZ`), conservando intactos el número de Orden, los `name=` de los campos, la cantidad de celdas y el encoding. `[@test] ../../../test/HU31_jeff/parsers.delegado.test.ts`

## API Contract Draft

Sobre `GET /course-detail/sections/:sectionId/contacts`, se agrega una clave hermana de `alumnos`:

```jsonc
{
  "docente": { /* sin cambios */ },
  "alumnos": [ /* sin cambios */ ],
  "representantesPendientes": [
    { "code": "20239999", "firstName": "JUAN CARLOS", "lastName": "PEREZ RAMIREZ",
      "position": "delegate", "contactable": false }
  ]
}
```

Sobre `POST /portal-sync/import`, en `ImportResult`: `token: string | null`; y en `summary`: `claimsUpserted`, `claimsDeleted`, `representativesPromoted`. `ImportSummary` es una interfaz cerrada y `emptySummary()` inicializa campo por campo: los tres contadores van en ambos. Reflejar todo en `docs/specs/api-contracts.md`.

## Enmiendas a la spec de Portal Sync

Esta feature contradice reglas ya publicadas. Se enmiendan a propósito.

- **`RS-BE-4`** lista hoy `section_representative` entre las tablas que la importación nunca toca. Se retira de esa lista y se reemplaza por: *la importación escribe `section_representative` únicamente para promover al propio alumno que está importando, y escribe `section_representative_claim` con los dos representantes que el portal publica para sus secciones*.
- **`RS-BE-6`** se conserva tal cual. Se agrega que los claims son lo único que se escribe sobre terceros, y que provienen del portal a través de la sesión del propio alumno, así que no son falsificables por el cliente.
- **§Privacidad** tiene hoy un inventario cerrado en primera persona ("…y estado de impedimento/deuda. Nada más"). Se abre para agregar: *nombre y código del delegado y del subdelegado de mis secciones, con borrado al desactivarse el ciclo*.
- **§Manejo de errores** dice que sesión inválida, portal caído y timeout abortan la importación, con una excepción escrita a mano para los sílabos. Se agrega la segunda excepción, para delegados (RS-17).

## Frontend (repo `ULima_Frontend_IS2`)

Vive en otro repositorio, así que no puede figurar en `targets`; queda documentado acá.

El alumno **ya llegaba** a la información de su delegado: al tocar un curso en el horario, `horario.dart` lo manda a `DescripCursosPage` y su pestaña Contactos pinta el badge naranja "Delegado"/"Subdelegado" desde `roleInSection`. La hoja `_TeacherCourseDetailSheet` que está detrás del gate `isTeacher` es una vista **de docente**; no había nada que destrabar ahí.

Lo único que faltaba era mostrar a los representantes que el portal publica pero que todavía no tienen cuenta:

- `RepresentantePendiente` (`lib/models/contacto_model.dart`), con `rolEnEspanol` traduciendo `delegate`/`subdelegate` al mismo vocabulario que ya usa `roleInSection`, para que la tarjeta no necesite saber de dónde salió el dato.
- `ContactoService` parsea la clave hermana `representantesPendientes` y se volvió **inyectable** (`ContactoService({ApiClient? api})`) para poder probar el parseo sin red, igual que `PortalSyncService`. Si el backend no manda la clave, la lista queda vacía y la pantalla se comporta como antes.
- `ContactoCard` acepta `enUlimaPlus` (default `true`). En `false` agrega el subtítulo "Aún no está en ULima++" y cambia el tooltip del carnet: decir "Carnet oculto" sugeriría una decisión de privacidad de alguien que ni siquiera está en la app.
- `ContactosTab` los pinta **primero** dentro de ALUMNOS, como a los delegados con cuenta: el orden es por cargo, y que alguien no se haya instalado la app no lo mueve de lugar.

Pruebas: `test/HU31_jeff/delegados_pendientes_test.dart`, 8 casos (modelo, parseo con y sin la clave, y los tres del widget). Suite del frontend: 299 verdes, `flutter analyze` sin infos nuevos.

## Fuera de alcance

- **El registro de usuarios nuevos.** `auth.routes.ts` no tiene endpoint de registro: solo login, Google, reset de contraseña y `/me`. Además el login exige matrícula activa y devuelve 403 `NOT_ENROLLED` si no la hay. Las cuentas nacen de los seeds. El "Día 30" del escenario **necesita un registro que todavía no existe**, y por eso RQ-3 no es verificable end-to-end hasta que exista; sí lo es contra la BD, promoviendo a un alumno sembrado. El modelo de claim es precisamente lo que hará que ese registro funcione sin trabajo manual el día que llegue.
- **El borrado por reloj.** RS-22 se dispara con la primera importación del ciclo nuevo. Si nadie importa durante meses, los claims del ciclo viejo sobreviven. Cerrarlo requiere un `crons` en `vercel.json` contra un endpoint interno de purga por `academic_period.end_date < now()`; si se elige esa vía hay que agregar `../../../vercel.json` a `targets`.
- **La solicitud de borrado de un tercero.** Si la persona de un claim pide que borren su dato antes del cierre de ciclo, hoy no hay procedimiento. Queda anotado como deuda.
- **Jubilar `delegados_secciones.ts`.** Mientras no haya registro, el seed sigue siendo la única forma de poblar secciones para la demo.
- **Moderación de chat para delegados.** Hoy es exclusiva del docente titular.
- **Asistencia.** `aVirtualBB.js` documenta `ComandoListarAsistenciaAulaVirtualAlumno?prm_sNuAula=`, la fuente que falta para `enrollment.attended_hours` / `absent_hours` / `total_hours`, hoy en 0. Mismo camino de tres saltos. Es otra HU.
- **El resto de los servlets del Aula Virtual**: ranking de sección, frecuencia de notas y promedios, alumnos que llevan el curso por segunda vez.

## Decisiones

| Decisión | Alternativas descartadas | Por qué |
|---|---|---|
| El delegado del portal otorga permisos reales | Solo informativo | Que nadie tenga que registrar delegados a mano es el punto de la feature. |
| Modelo de claim pendiente | Fabricar `app_user` + `student` + `enrollment` sintéticos, como hace el seed | Fabricar cuentas inventa correo institucional (que choca el día que esa persona entre por Google), contraseña y carrera, y mete a un no-usuario en networking, en el chat y en el contexto que el chatbot manda a Cohere. |
| Modelo de claim pendiente | Escribir el representante solo si el compañero ya existe | Hoy quedaría casi siempre vacío: de 40 compañeros, casi ninguno tiene cuenta. |
| Persistir solo los 2 marcados, con nombre | Persistir toda la nómina | Multiplicar los datos de terceros sin que la feature lo necesite. `ContactosTab` ya lista la sección desde `enrollment`. |
| Persistir solo los 2 marcados, con nombre | Guardar solo el código | Sin nombre la app mostraría un número hasta que esa persona se registre. |
| Degradar por aula, no por fase | Todo o nada | El import ya tarda 30-50 s con un corte de cliente a los 90 s. Dejar que una función secundaria borre notas y horario es mal negocio. |
| Llavear el claim por `section_id` | Columna de ciclo propia | `section` ya cuelga de `course_offering` → `academic_period`. |
| Conflict target `enrollment_id` en la promoción | `(section_id, position)` | El UNIQUE de `enrollment_id` es plano: una fila desactivada sigue ocupando el valor y un insert por posición lanza `23505` al reimportar. |
| Re-firmar el token sin tocar `token_version` | Copiar el patrón de login | `incrementTokenVersion` invalidaría el token en uso y el cliente Flutter lee ese 401 como expiración de sesión. |
| No guardar quién reportó el claim | Columna `reported_by_student_id` | Útil para auditar, pero crea un registro de quién delató a quién. |

## Verification

- **Parser contra fixtures anonimizados** de las 10 nóminas del 2026-09-04. Medición de referencia: 353 filas de alumno, todas de exactamente 9 celdas; 20/20 casillas comparten `<tr>` con el código y el nombre de su mismo orden.
- **Sección sin delegado**: fixture con cero casillas pero con filas de alumno → `ok: true`, ambos ausentes.
- **Casos `ok: false`**: dos casillas del mismo cargo; casilla marcada en fila sin código; respuesta sin ninguna fila de alumno; aula distinta de la pedida.
- **Casilla habilitada**: el fixture es **sintético**, construido a mano quitando el `DISABLED`. Declarado como tal: en las 2 cuentas sondeadas las 20 casillas vinieron deshabilitadas, incluida la de la cuenta que ostenta un cargo, así que no hay muestra real de este caso.
- **Encoding**: los cuerpos de las dos rutas nuevas son ISO-8859-1, pero la nómina declara `<meta charset=utf-8>`, que miente. `fetchPage` elige el charset por la cabecera HTTP: hay que capturar el `Content-Type` de estos dos servlets y, si anuncian utf-8, forzar ISO-8859-1 para ellos. Caso obligatorio: un nombre con Ñ que sobrevive intacto hasta `full_name`.
- **Promoción**: alumno con claim que importa y obtiene `section_representative` + token nuevo con `role`.
- **Idempotencia**: el mismo delegado importa dos veces seguidas; la segunda no lanza `23505`, no crea fila nueva y el resto del `summary` no cambia.
- **No-promoción**: alumno sin claim que importa y sigue como `student`.
- **Reasignación**: claim nuevo para una sección que ya tenía representante activo → el anterior queda `is_active = false` y sus anuncios siguen existiendo.
- **Orden de observación**: un claim más antiguo no pisa a uno más reciente.
- **Revocación**: sección que deja de tener delegado → el claim se borra, el `section_representative` activo no se toca.
- **Borrado por ciclo**: BD con claims de 2026-1 + importación de 2026-2 → cero filas de claim del período anterior, y los de 2026-2 intactos.
- **Control de acceso**: usuario sin matrícula en la sección pide sus contactos → `403 SECTION_FORBIDDEN`.
- **Presupuesto de tiempo**: import end-to-end con la fase activa, medido contra el portal real. Si supera los 90 s, la fase se mueve a un endpoint aparte (RS-9).
- **Dos bugs encontrados por las pruebas y corregidos**, ambos introducidos al integrar y ninguno del diseño: (1) el warning de RS-11 se calculaba sobre las nóminas descargadas y no sobre las aulas declaradas, así que una caída de red emitía además un "ninguna aula empató" falso; (2) la purga de RS-22 no excluía el período que se está importando y borraba los claims del ciclo vigente cuando ese ciclo aún no había empezado.
- **Validación contra el portal real** (fuera de la suite, con el HTML del spike): 10/10 secciones de 2 cuentas, delegado y subdelegado coincidiendo con los identificados a mano. La segunda cuenta cubre dos casos que una implementación ingenua rompe: códigos de curso de 4 dígitos y dos cursos distintos que comparten `sectionCode`.
- **RS-BE-4 acotada**: contar filas antes y después del import y comprobar que las únicas tablas tocadas fuera de lo permitido son `section_representative_claim` y, cuando corresponde, la fila propia de `section_representative`.
