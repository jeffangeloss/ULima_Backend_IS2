# Recarga de notas parciales y asistencia desde la ULima (backend) · Plan de implementación

> **Para agentes.** SUB-SKILL REQUERIDA. Usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo.** `POST /portal-sync/refresh` lee en miUlima, con un solo inicio de sesión, la asistencia y las notas parciales por evaluación del alumno, las empareja con el sílabo y las guarda en una transacción, y `GET /grades/me/ulima` y el campo `asistenciaLeidaEn` las sirven a la app, sin repetir la importación completa.

**Arquitectura.** La recarga vive en `src/modules/portal-sync/refresh/`, con un servicio propio (`PortalRefreshService`) que orquesta dos fases de lectura fuera de la transacción (asistencia en paralelo con tope de cinco peticiones y notas curso por curso), una función pura de emparejamiento y un repositorio propio que escribe `enrollment` y la tabla nueva `student_portal_score` de la migración `0015`. La importación existente comparte con la recarga la guarda de inicio de sesión en curso, el tope de rechazos y el `UPDATE` de las horas, que ahora fija la hora de lectura con la guarda de lectura más reciente. `PortalClient` suma un plazo al inicio de sesión, el cierre de la sesión que el portal abre cuando ese inicio falla a medias y las rutas del panel Nota.

**Stack.** Bun, TypeScript, Hono, Drizzle ORM, PostgreSQL y Zod.

**Spec.** `specs/features/recarga-portal/recarga-portal.spec.md` (RS-BE-48 a RS-BE-60, aprobada por el dueño el 2026-09-26 con el cambio de BD de la `0015`). La spec fija los valores exactos (mensajes, umbrales, SQL de la migración, formas de la respuesta y códigos de error), y este plan fija el orden, los archivos, las interfaces y las pruebas. Si difieren, manda la spec. La contraparte de la app es `ULima_Frontend_IS2/specs/features/recarga-portal/recarga-portal.spec.md`, en la rama `feat/recarga-notas-asistencia-fe`.

**Repo y rama.** `$REPO` (el worktree de la rama, ver «Variables de los comandos»), rama `feat/recarga-notas-asistencia`. RS-BE-48 no se implementa aquí. Llega por su propia rama, `fix/menu-aula-virtual`, que se mergea a `main` antes, y esta rama la trae con un merge de `main` en la Tarea 0, antes de escribir una sola línea de código.

## Restricciones globales

- Español en comentarios, pruebas y mensajes de commit, con el estilo del log (`tipo(ámbito): frase (RS-BE-NN)`). Commits con `git add` explícito, sin trailer `Co-Authored-By` ni ninguna atribución, con el autor que ya tiene configurado el worktree (Jeffangeloss, el correo `noreply` de GitHub, que la Tarea 0 comprueba). Un commit por tarea. Nada de `push` ni de PR, que decide el dueño. Nunca `git stash` a secas.
- Repo público. Ningún dato real. Los únicos datos de ejemplo son los inventados de la spec, el alumno `20230001` (y `20230002` como «otro alumno»), los cursos `690417` a `690421`, la sección `812` y las aulas `900101` a `900105`. Nunca se copia nada del sondeo de solo lectura del 2026-09-25, porque sus páginas son datos personales del dueño, y los fixtures se arman a mano con la estructura que describe la spec (RS-BE-59). Ninguna ruta absoluta de esta máquina entra en un archivo commiteado.
- Nada contra la base. Ni `db:apply`, ni `db:push`, `db:migrate`, `db:generate`, `db:seed`, ni `psql` contra Neon. Nunca se leen ni se imprimen el `.env` ni un `DATABASE_URL` real. La `0015` se escribe y se prueba estáticamente, y la aplica el dueño con respaldo y permiso explícito en el paso PARAR de la Tarea 22.
- Pruebas siempre con el prefijo `DATABASE_URL=postgres://user:pass@localhost:5432/test`, porque bun carga el `.env` del worktree cuando existe. La única prueba que usa una base real es `refresh.postgres.test.ts` (Tarea 21), que solo corre con `TEST_DATABASE_URL` hacia un Postgres local, vacío y desechable, y se salta sin él.
- Tiempo. Un comando que tarda más de unos dos minutos sin devolver nada corta la sesión. En el ciclo rojo y verde se corre solo el archivo de pruebas de la tarea. El build y la suite completa van juntos en segundo plano (`run_in_background: true`), y la tarea espera su notificación antes del commit.
- Arquitectura `routes → controller → service → repository`. Los servicios reciben sus dependencias por constructor y nunca importan `db`. Zod en el controlador con `validateJson`.
- Plantilla `sql` de Drizzle. Nunca se interpola un arreglo de JS (error 42809) ni un objeto `Date` (postgres.js lo rechaza). Los instantes viajan como texto ISO 8601 con `::timestamptz`, los lotes como un solo texto JSON con `json_to_recordset(...::json)` y los parámetros del `select` de un `insert … select` con su tipo explícito (`::int`).
- Mensajes. Los avisos y los motivos de los lectores llevan solo literales fijos y códigos de curso, sección o aula ya validados con una regex de dígitos. Nunca un fragmento del HTML, una nota, un nombre, la contraseña, el código del autenticador ni una cookie. Nunca `401` para un rechazo del portal, siempre `409 PORTAL_LOGIN_REJECTED`.
- El barrel `src/modules/portal-sync/parsers/index.ts` no se toca, porque `scripts/verificar-readme.py` cuenta sus `parse…` y el README cita esa cifra. Los lectores nuevos se importan de `parsers/nota.js`.
- La prosa de este plan y de los documentos que toca sigue las reglas de estilo de la skill `redaccion-ieee-q1` (presente, sin primera persona, sin «han + participio», sin pasiva perifrástica, sin dos puntos ni guiones largos en la prosa). El código y sus comentarios siguen el estilo del repo.

### Valores fijos que copia el plan de la spec

| Valor | Dónde |
| --- | --- |
| `PORTAL_REFRESH_BUDGET_MS` entero entre 20 000 y 65 000, 60 000 por defecto | RS-BE-50, Tarea 2 |
| Presupuesto efectivo `min(PORTAL_REFRESH_BUDGET_MS, 81 000 − 2 · PORTAL_TIMEOUT_MS)`, que no puede quedar bajo 20 000 | RS-BE-50, Tarea 2 |
| 5 recargas por alumno por hora, en un almacén propio | RS-BE-50, Tarea 10 |
| 3 inicios de sesión rechazados cada 15 minutos, compartidos con la importación con `credentials` | RS-BE-50, Tarea 9 |
| Nunca más de 5 peticiones en vuelo sobre la misma sesión | RS-BE-50, Tarea 16 |
| «Primero carga tus datos del ciclo.» (`409 IMPORT_REQUIRED`) | RS-BE-49, Tarea 18 |
| «La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.» (`409 IMPORT_REQUIRED`) | RS-BE-49, Tarea 18 |
| «Ya hay una lectura de miUlima en curso. Espera a que termine.» (`409 PORTAL_REFRESH_IN_PROGRESS`) | RS-BE-49, Tarea 9 |
| «Demasiadas actualizaciones. Intenta de nuevo en N minuto(s).» (`429`, `kind: "quota"`) | RS-BE-50, Tarea 10 |
| «Demasiados intentos con datos rechazados. Intenta de nuevo en N minuto(s).» (`429`, `kind: "rejected_logins"`) | RS-BE-50, Tarea 9 |
| «miUlima responde con páginas que ULima++ no sabe leer.» (`502 PORTAL_UNREADABLE`) | RS-BE-56, Tarea 18 |
| «La sección del menú no coincide con la de la página de asistencia del aula <aula>.» | RS-BE-48, Tarea 18 |
| «El curso del aula <aula> no coincide entre los paneles de miUlima.» | RS-BE-52, Tarea 18 |
| «El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima en <curso>/<sección>.» | RS-BE-54, Tarea 18 |
| Precedencia sin ningún curso leído `PORTAL_SESSION_INVALID`, `PORTAL_TIMEOUT`, `PORTAL_UNAVAILABLE`, `PORTAL_UNREADABLE` | RS-BE-56, Tarea 18 |
| Tolerancias. Peso del sílabo 0,01, suma de pesos de la ULima 0,5, corrimiento de semana 2, promedio 0,5 | RS-BE-53 y RS-BE-54 |

### Variables de los comandos

El plan no fija rutas de una máquina concreta, porque se commitea en un repo público. Los comandos usan tres variables.

- `REPO`, la ruta absoluta del worktree de la rama `feat/recarga-notas-asistencia` (`git worktree list`, corrido desde el checkout del backend, la muestra).
- `SCRATCH`, la carpeta temporal de la sesión, fuera del repo (el scratchpad que da el entorno). Ahí van los registros de la verificación en segundo plano.
- `BUN`, el ejecutable de bun. `BUN="$(command -v bun)"` si está en `PATH`, y si no, `"$SCRATCH/bunhome/node_modules/.bin/bun"`, que `npm install --prefix "$SCRATCH/bunhome" bun` instala ahí.

Cada llamada de shell empieza con `export REPO=… SCRATCH=… BUN=…`, porque las variables no sobreviven de una llamada a otra, y los comandos las usan como `"${REPO:?}"` o `"${BUN:?}"`, así que una variable vacía corta la llamada con un error en vez de correr en `$HOME`.

La verificación de cada tarea es siempre la misma y corre en segundo plano, con el número de la tarea en el nombre del registro.

```bash
cd "${REPO:?}" && { "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "$BUN" test; } > "${SCRATCH:?}/tarea-NN.log" 2>&1; echo "EXIT=$?" >> "$SCRATCH/tarea-NN.log"
```

Al llegar la notificación, `tail -n 12 "${SCRATCH:?}/tarea-NN.log"` tiene que mostrar `0 fail` y `EXIT=0`, con más pruebas en verde que en la tarea anterior. Una cifra distinta de la esperada se compara prueba por prueba antes de seguir, y nunca se ajusta una prueba para que cuadre.

## Estructura de archivos

| Ruta | Acción | Responsabilidad |
| --- | --- | --- |
| `drizzle/0015_portal_scores.sql` | crear | migración aditiva e idempotente de la spec |
| `src/db/schema/schema.ts` | modificar | `studentPortalScore` y las dos horas de lectura de `enrollment` |
| `src/config/env.ts`, `src/config/app-config.ts` | modificar | `PORTAL_REFRESH_BUDGET_MS`, `effectiveRefreshBudgetMs` y `config.portal.refreshBudgetMs` |
| `src/services/portal.client.ts` | modificar | plazo y reloj del inicio de sesión, cierre del frasco (RS-BE-60), rutas del panel Nota y opciones de `fetchPage` |
| `src/modules/portal-sync/parsers/asistencia.ts` | modificar | `cicloEsperado`, `otroCiclo`, `identityMismatch` y el motivo del código ausente |
| `src/modules/portal-sync/parsers/nota.ts` | crear | `parseNotaCurso` y `parseDetalleEvaluaciones` |
| `src/modules/portal-sync/portal-sync.types.ts` | modificar | tipos de notas y cinco códigos de aviso nuevos |
| `src/modules/portal-sync/portal-login-guard.ts` | crear | guarda de inicio de sesión en curso y tope de rechazos, compartidos |
| `src/shared/middleware/rate-limit.ts` | modificar | `portalRefreshRateLimit`, rastro del portal y `kind` en el `429` de la importación |
| `src/modules/portal-sync/portal-sync.repository.ts` | modificar | `sqlActualizarAsistencia` con la hora y la guarda de lectura |
| `src/modules/portal-sync/portal-sync.service.ts` | modificar | la importación respeta la guarda, el tope, el ciclo y la hora de lectura |
| `src/modules/portal-sync/refresh/emparejar.ts` | crear | emparejamiento puro con el sílabo (RS-BE-54) |
| `src/modules/portal-sync/refresh/refresh.types.ts` | crear | tipos de las fases, de la entrada y de la respuesta |
| `src/modules/portal-sync/refresh/refresh.logic.ts` | crear | tope de concurrencia, fallos, precedencia, atribución, chequeo del promedio y registro por fase |
| `src/modules/portal-sync/refresh/fase-asistencia.ts` | crear | fase de asistencia (RS-BE-51) |
| `src/modules/portal-sync/refresh/fase-notas.ts` | crear | fase de notas (RS-BE-52 y RS-BE-53) |
| `src/modules/portal-sync/refresh/refresh.repository.ts` | crear | lecturas y escrituras de la recarga (RS-BE-54 y RS-BE-55) |
| `src/modules/portal-sync/refresh/refresh.service.ts` | crear | orquestación de la recarga (RS-BE-49 a RS-BE-56) |
| `src/modules/portal-sync/portal-sync.schemas.ts`, `.controller.ts`, `.routes.ts`, `index.ts` | modificar | esquema estricto, controlador, ruta y composición |
| `src/modules/grades/*` | modificar y crear `grades-ulima.logic.ts` | `GET /grades/me/ulima` (RS-BE-57) |
| `src/modules/schedule/schedule.repository.ts`, `.service.ts`, `.types.ts` | modificar | `asistenciaLeidaEn` en el horario (RS-BE-58) |
| `src/modules/course-detail/course-detail.routes.ts` | modificar | `asistenciaLeidaEn` en la ficha (RS-BE-58) |
| `test/HU37_jeff/**` y `test/HU31_jeff/**` | crear y modificar | pruebas y fixtures armados a mano |
| `specs/…`, `docs/specs/…`, `MIGRATIONS.md`, `AGENTS.md`, `KNOWLEDGE.md` | modificar | cierre de la documentación (Tarea 22) |

## Orden y cobertura

| Requisito | Tareas |
| --- | --- |
| RS-BE-48 (llega por `main`) | 0 |
| Modelo de datos y `0015` | 1, 21 |
| RS-BE-49 | 5, 18, 19 |
| RS-BE-50 | 2, 3, 9, 10, 12, 16, 17, 18 |
| RS-BE-51 | 5, 12, 16, 18 |
| RS-BE-52 | 4, 6, 17, 18 |
| RS-BE-53 | 4, 7, 17 |
| RS-BE-54 | 8, 13, 18 |
| RS-BE-55 | 11, 13, 18, 21 |
| RS-BE-56 | 18, 19 |
| RS-BE-57 | 14, 21 |
| RS-BE-58 | 11, 15 |
| RS-BE-59 | 5, 6, 7, 20 |
| RS-BE-60 | 3 |
| Contrato, enmiendas, `AGENTS.md`, `KNOWLEDGE.md` y `MIGRATIONS.md` | 22 |
| Verificaciones V1 a V5 y aplicación de la `0015` | 4 (V1), 22 (PARAR) |

---

### Tarea 0. Punto de partida, merge de `main` con RS-BE-48 y línea base

**Archivos.**
- Modificar por el merge. `specs/features/asistencia-portal/asistencia-portal.spec.md` y `specs/features/delegados-portal/delegados-portal.spec.md`, los únicos que chocan (simulado con `git merge-tree` sobre `ab4c219`, el último commit de `fix/menu-aula-virtual` al escribir el plan).

**Interfaces.**
- Consume de `main`, ya con RS-BE-48. `AulaMenu = { aula: string; courseCode: string | null; sectionCode: string | null; origen: "arreglos" | "lista" }` y `AsistenciaIdentificada = { courseCode: string; sectionCode: string }` en `portal-sync.types.ts`, `parseAulas(html, fnEnlace): ParseResult<AulaMenu[]>` en `parsers/delegado.ts`, `AsistenciaResult = ParseResult<AsistenciaCurso> & { identificado?: AsistenciaIdentificada }` y `parseAsistenciaCurso(html, aula, alumno): AsistenciaResult` en `parsers/asistencia.ts`, la fase de asistencia de la importación antes que la de delegados, con `cursoPorAula`, `parDeAula` y los avisos armados al final, y el fixture `test/HU31_jeff/fixtures/menu-lista-asistencia.html` con las aulas `900101` a `900105`.
- Produce. La rama con RS-BE-48 y la línea base de la suite en `$SCRATCH/linea-base.log`.

- [ ] **Paso 1. Comprobar dónde está el árbol y quién firma**

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && git status --short && git log --oneline -3 && git config user.name && git config user.email
```

Se espera la rama `feat/recarga-notas-asistencia`, un `git status --short` vacío, el commit de este plan (`docs(recarga-portal): plan de implementación del backend de la recarga …`) encima de `a0a85af`, el nombre `Jeffangeloss` y un correo que termina en `@users.noreply.github.com`. Si el correo es otro, PARAR, porque todos los commits de la rama llevan ese autor. Si el árbol trae commits o cambios sin commitear de un intento anterior de este mismo plan, se revisan contra la tarea a la que pertenecen, se conservan si están bien y se sigue desde la primera tarea incompleta.

- [ ] **Paso 2. Comprobar que RS-BE-48 ya está en `main`**

```bash
cd "${REPO:?}" && git fetch origin && git grep -c 'origen: "lista"' origin/main -- src/modules/portal-sync/parsers/delegado.ts && git grep -c 'export type AsistenciaResult' origin/main -- src/modules/portal-sync/parsers/asistencia.ts && git cat-file -e origin/main:test/HU31_jeff/fixtures/menu-lista-asistencia.html && echo RS-BE-48-EN-MAIN
```

Se espera `RS-BE-48-EN-MAIN` al final. Si falta, PARAR. La spec prohíbe desplegar la recarga sin RS-BE-48, y este plan se escribe sobre sus interfaces.

- [ ] **Paso 3. Traer `main` y resolver los dos choques de documentación**

```bash
cd "${REPO:?}" && git merge --no-ff --no-commit origin/main; git diff --name-only --diff-filter=U
```

Se espera que la segunda orden liste, a lo sumo, los dos archivos de la sección «Archivos». Si lista otro, en especial uno de `src/` o de `test/`, `git merge --abort` y PARAR. En los cuatro bloques que chocan, `main` trae el estado más nuevo de RS-BE-48 (implementada) y la rama trae el de antes (pendiente), así que en cada bloque vale el lado de `main`. El resto de cada archivo conserva lo que ya fusiona git.

```bash
cd "${REPO:?}" && for f in specs/features/asistencia-portal/asistencia-portal.spec.md specs/features/delegados-portal/delegados-portal.spec.md; do [ -f "$f" ] && perl -0pi -e 's/^<<<<<<< [^\n]*\n.*?^=======\n(.*?)^>>>>>>> [^\n]*\n/$1/gms' "$f"; done; grep -n '^<<<<<<<\|^=======$\|^>>>>>>>' specs/features/asistencia-portal/asistencia-portal.spec.md specs/features/delegados-portal/delegados-portal.spec.md; echo "MARCAS=$?"
```

Se espera `MARCAS=1`, es decir, ningún marcador de conflicto. Después se confirma el merge.

```bash
cd "${REPO:?}" && git add specs/features/asistencia-portal/asistencia-portal.spec.md specs/features/delegados-portal/delegados-portal.spec.md && git commit -m "merge: trae main con la lectura del menú del Aula Virtual en sus dos formatos (RS-BE-48)" && git log --oneline -1
```

Si `git merge` dice `Already up to date`, no hay nada que confirmar y se sigue.

- [ ] **Paso 4. Línea base en segundo plano**

Con `run_in_background: true`.

```bash
cd "${REPO:?}" && { "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "$BUN" test; } > "${SCRATCH:?}/linea-base.log" 2>&1; echo "EXIT=$?" >> "$SCRATCH/linea-base.log"
```

Al llegar la notificación, `tail -n 12 "${SCRATCH:?}/linea-base.log"` tiene que mostrar `0 fail` y `EXIT=0`. Las cifras de `pass`, `skip` y `expect()` quedan anotadas como línea base. Un fallo acá es preexistente y se reporta aparte antes de seguir.

---

### Tarea 1. Modelo de datos, migración `0015` y `schema.ts`

**Archivos.**
- Crear `drizzle/0015_portal_scores.sql`.
- Modificar `src/db/schema/schema.ts` (dos columnas al final de `enrollment` y la tabla nueva justo después del cierre de `simulatedGrades`).
- Prueba `test/HU37_jeff/migration-0015.test.ts`.

**Interfaces.**
- Consume de `schema.ts` los helpers ya importados (`check`, `decimal`, `index`, `integer`, `pgTable`, `smallint`, `timestamp`, `unique`, `uniqueIndex`, `varchar` y `sql`) y las tablas `enrollment` y `assessment`. No hay que tocar los imports.
- Produce `export const studentPortalScore = pgTable("student_portal_score", …)`, con las columnas `id`, `enrollment_id`, `portal_key`, `group_name`, `name`, `week_number`, `weight`, `value`, `mark`, `assessment_id` y `match_rule`, y en `enrollment` los campos `portalGradesReadAt` y `portalAttendanceReadAt` (`timestamptz`, nulables). Las Tareas 13, 14, 15 y 21 usan esos nombres de columna.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/migration-0015.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { enrollment, studentPortalScore } from "../../src/db/schema/schema.js";

/**
 * Modelo de datos de recarga-portal.spec.md (migración 0015).
 *
 * El .sql se lee como texto, así que esta prueba no aplica la migración ni toca
 * ninguna base. Aplicarla es del dueño, con respaldo y permiso (MIGRATIONS.md).
 * Los comentarios del encabezado se quitan antes de contar, para que una
 * palabra del texto no cuente como sentencia.
 */
const migracion = await Bun.file("drizzle/0015_portal_scores.sql").text();
const sentencias = migracion
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const veces = (aguja: string): number => sentencias.split(aguja).length - 1;

const CHECKS = [
  "chk_student_portal_score_mark",
  "chk_student_portal_score_mark_value",
  "chk_student_portal_score_match",
  "chk_student_portal_score_match_assessment",
  "chk_student_portal_score_value",
  "chk_student_portal_score_week",
  "chk_student_portal_score_weight",
];

describe("drizzle/0015_portal_scores.sql", () => {
  test("crea una sola tabla, con IF NOT EXISTS y su identidad", () => {
    expect(sentencias).toContain("CREATE TABLE IF NOT EXISTS student_portal_score (");
    expect(veces("CREATE TABLE")).toBe(1);
    expect(sentencias).toContain("id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY");
  });

  test("la matrícula borra en cascada y la evaluación del sílabo no", () => {
    expect(sentencias).toContain(
      "enrollment_id integer NOT NULL REFERENCES enrollment(id) ON DELETE CASCADE",
    );
    expect(sentencias).toContain("assessment_id integer REFERENCES assessment(id),");
    expect(veces("ON DELETE CASCADE")).toBe(1);
  });

  test("el UNIQUE y los siete CHECK llevan el nombre y la condición de la spec", () => {
    for (const restriccion of [
      "uq_student_portal_score_key UNIQUE (enrollment_id, portal_key)",
      "chk_student_portal_score_weight CHECK (weight > 0 AND weight <= 100)",
      "chk_student_portal_score_week CHECK (week_number IS NULL OR week_number BETWEEN 1 AND 20)",
      "chk_student_portal_score_value CHECK (value IS NULL OR value BETWEEN 0 AND 20)",
      "chk_student_portal_score_mark CHECK (mark IN ('graded', 'pending', 'np'))",
      "chk_student_portal_score_mark_value CHECK ((mark = 'graded') = (value IS NOT NULL))",
      "chk_student_portal_score_match CHECK (match_rule IN ('exact', 'exact_other_name', 'week_shift', 'none'))",
      "chk_student_portal_score_match_assessment CHECK ((match_rule = 'none') = (assessment_id IS NULL))",
    ]) {
      expect(sentencias).toContain(`CONSTRAINT ${restriccion}`);
    }
    expect(veces("CHECK (")).toBe(7);
  });

  test("los dos índices son idempotentes", () => {
    expect(sentencias).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_student_portal_score_assessment\n  ON student_portal_score (enrollment_id, assessment_id) WHERE assessment_id IS NOT NULL;",
    );
    expect(sentencias).toContain(
      "CREATE INDEX IF NOT EXISTS idx_student_portal_score_enrollment\n  ON student_portal_score (enrollment_id);",
    );
    expect(veces("INDEX IF NOT EXISTS")).toBe(2);
  });

  test("las dos horas de lectura son columnas nulables de enrollment", () => {
    expect(sentencias).toContain(
      "ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS portal_grades_read_at timestamptz;",
    );
    expect(sentencias).toContain(
      "ALTER TABLE enrollment ADD COLUMN IF NOT EXISTS portal_attendance_read_at timestamptz;",
    );
    expect(veces("ALTER TABLE")).toBe(2);
  });

  test("es aditiva y no nombra db:push", () => {
    expect(sentencias).not.toContain("DROP");
    expect(sentencias).not.toContain("ADD VALUE");
    // Las dos columnas nuevas no llevan DEFAULT, así que no reescriben ninguna fila.
    const altas = sentencias.split("\n").filter((l) => l.startsWith("ALTER TABLE"));
    expect(altas.every((l) => !l.includes("DEFAULT"))).toBe(true);
    expect(migracion).not.toContain("db:push");
  });
});

describe("schema.ts sigue a la 0015", () => {
  const tabla = getTableConfig(studentPortalScore);

  test("mismas columnas, tipos y nulabilidad", () => {
    expect(tabla.name).toBe("student_portal_score");
    expect(Object.fromEntries(tabla.columns.map((c) => [c.name, c.getSQLType()]))).toEqual({
      id: "integer",
      enrollment_id: "integer",
      portal_key: "varchar(20)",
      group_name: "varchar(60)",
      name: "varchar(150)",
      week_number: "smallint",
      weight: "numeric(5, 2)",
      value: "numeric(4, 2)",
      mark: "varchar(10)",
      assessment_id: "integer",
      match_rule: "varchar(20)",
    });
    expect(tabla.columns.filter((c) => !c.notNull).map((c) => c.name).sort()).toEqual([
      "assessment_id", "group_name", "value", "week_number",
    ]);
  });

  test("la FK a enrollment borra en cascada y la de assessment no", () => {
    const fks = tabla.foreignKeys.map((fk) => ({
      columna: fk.reference().columns[0]!.name,
      destino: getTableConfig(fk.reference().foreignTable).name,
      alBorrar: fk.onDelete ?? "no action",
    }));
    expect(fks).toContainEqual({ columna: "enrollment_id", destino: "enrollment", alBorrar: "cascade" });
    const aAssessment = fks.find((f) => f.columna === "assessment_id");
    expect(aAssessment?.destino).toBe("assessment");
    expect(aAssessment?.alBorrar).not.toBe("cascade");
    expect(fks).toHaveLength(2);
  });

  test("los CHECK, el UNIQUE y los índices llevan el nombre de la migración", () => {
    expect(tabla.checks.map((c) => c.name).sort()).toEqual(CHECKS);
    expect(tabla.uniqueConstraints.map((u) => u.name)).toEqual(["uq_student_portal_score_key"]);
    expect(tabla.indexes.map((i) => i.config.name).sort()).toEqual([
      "idx_student_portal_score_enrollment",
      "uq_student_portal_score_assessment",
    ]);
  });

  test("enrollment suma las dos horas, nulables y con zona horaria", () => {
    const columnas = Object.fromEntries(getTableConfig(enrollment).columns.map((c) => [c.name, c]));
    for (const nombre of ["portal_grades_read_at", "portal_attendance_read_at"]) {
      expect(columnas[nombre]?.getSQLType()).toBe("timestamp with time zone");
      expect(columnas[nombre]?.notNull).toBe(false);
    }
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/migration-0015.test.ts
```

Se espera un fallo al cargar, porque `studentPortalScore` todavía no existe en `schema.ts` y el `.sql` tampoco.

- [ ] **Paso 3. Escribir la migración**

`drizzle/0015_portal_scores.sql`, con el SQL de «Modelo de datos» de la spec, sin cambiar una letra.

```sql
-- RS-BE-55, RS-BE-57 y RS-BE-58 · Notas parciales de la ULima y horas de lectura
-- (specs/features/recarga-portal/recarga-portal.spec.md, «Modelo de datos»).
--
-- Crea una tabla y agrega dos columnas, y no toca ninguna fila.
--   student_portal_score                  una fila por evaluación que publica la ULima
--   enrollment.portal_grades_read_at      hora de la última lectura de notas
--   enrollment.portal_attendance_read_at  hora de la última lectura de asistencia
--
-- La tabla cuelga de enrollment con ON DELETE CASCADE, porque sus filas son una
-- copia de lo que publica la ULima y no tienen sentido sin su matrícula, y así
-- los dos scripts que borran matrículas (propuesta_855.ts y
-- delegados_secciones.ts) no fallan con 23503 (decisión abierta 5).
--
-- Aditiva e idempotente, con IF NOT EXISTS en cada sentencia, así que se puede
-- aplicar dos veces sin daño. Se aplica con
--
--   bun run db:apply drizzle/0015_portal_scores.sql
--
-- y no con db:migrate ni db:generate, porque drizzle/meta/_journal.json sigue en
-- la 0009. La aplica el dueño, con respaldo previo y su permiso explícito, antes
-- de desplegar el código que la usa, porque la importación escribe la columna
-- nueva y contra una base sin ella fallaría entera (RS-BE-58). Se registra en
-- MIGRATIONS.md con su fecha, su respaldo y su verificación. La 0014 es la de
-- student_specialty_test_result, en la rama feat/test-especialidad.

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

- [ ] **Paso 4. Reflejar la migración en `schema.ts`**

En `enrollment`, justo después de `finalGrade`, antes del cierre `}, (t) => ({`.

```ts
  // RS-BE-57 y RS-BE-58 (recarga-portal, migración 0015). Hora de la última
  // lectura de cada panel de miUlima para esta matrícula. Nulables, porque una
  // matrícula que nunca se leyó no tiene hora, y solo avanzan, por la guarda de
  // lectura más reciente de RS-BE-55.
  portalGradesReadAt: timestamp("portal_grades_read_at", { mode: "date", withTimezone: true }),
  portalAttendanceReadAt: timestamp("portal_attendance_read_at", { mode: "date", withTimezone: true }),
```

Justo después del cierre de `simulatedGrades` (`}));`), la tabla nueva.

```ts
// RS-BE-55 (recarga-portal, migración 0015). Notas parciales por evaluación tal
// como las publica la ULima en el panel Nota del Aula Virtual. Es una copia que
// solo escribe POST /portal-sync/refresh y solo lee GET /grades/me/ulima, así
// que no se mezcla con `student_score` (lo que carga el docente) ni con
// `simulated_grades` (la proyección del alumno). Cuelga de la matrícula con
// borrado en cascada, porque sin ella estas filas no significan nada.
export const studentPortalScore = pgTable("student_portal_score", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  enrollmentId: integer("enrollment_id").notNull().references(() => enrollment.id, { onDelete: "cascade" }),
  portalKey: varchar("portal_key", { length: 20 }).notNull(),
  groupName: varchar("group_name", { length: 60 }),
  name: varchar("name", { length: 150 }).notNull(),
  weekNumber: smallint("week_number"),
  weight: decimal("weight", { precision: 5, scale: 2 }).notNull(),
  value: decimal("value", { precision: 4, scale: 2 }),
  mark: varchar("mark", { length: 10 }).notNull(),
  assessmentId: integer("assessment_id").references(() => assessment.id),
  matchRule: varchar("match_rule", { length: 20 }).notNull(),
}, (t) => ({
  uqStudentPortalScoreKey: unique("uq_student_portal_score_key").on(t.enrollmentId, t.portalKey),
  chkStudentPortalScoreWeight: check(
    "chk_student_portal_score_weight",
    sql`${t.weight} > 0 AND ${t.weight} <= 100`,
  ),
  chkStudentPortalScoreWeek: check(
    "chk_student_portal_score_week",
    sql`${t.weekNumber} IS NULL OR ${t.weekNumber} BETWEEN 1 AND 20`,
  ),
  chkStudentPortalScoreValue: check(
    "chk_student_portal_score_value",
    sql`${t.value} IS NULL OR ${t.value} BETWEEN 0 AND 20`,
  ),
  chkStudentPortalScoreMark: check(
    "chk_student_portal_score_mark",
    sql`${t.mark} IN ('graded', 'pending', 'np')`,
  ),
  chkStudentPortalScoreMarkValue: check(
    "chk_student_portal_score_mark_value",
    sql`(${t.mark} = 'graded') = (${t.value} IS NOT NULL)`,
  ),
  chkStudentPortalScoreMatch: check(
    "chk_student_portal_score_match",
    sql`${t.matchRule} IN ('exact', 'exact_other_name', 'week_shift', 'none')`,
  ),
  chkStudentPortalScoreMatchAssessment: check(
    "chk_student_portal_score_match_assessment",
    sql`(${t.matchRule} = 'none') = (${t.assessmentId} IS NULL)`,
  ),
  uqStudentPortalScoreAssessment: uniqueIndex("uq_student_portal_score_assessment")
    .on(t.enrollmentId, t.assessmentId)
    .where(sql`${t.assessmentId} IS NOT NULL`),
  idxStudentPortalScoreEnrollment: index("idx_student_portal_score_enrollment").on(t.enrollmentId),
}));
```

- [ ] **Paso 5. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/migration-0015.test.ts
```

Se esperan 10 pruebas en verde y ninguna fallida.

- [ ] **Paso 6. Build y suite completa en segundo plano**

El comando de «Variables de los comandos» con `tarea-01.log`. Se espera `0 fail`, `EXIT=0` y 10 pruebas más que la línea base.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add drizzle/0015_portal_scores.sql src/db/schema/schema.ts test/HU37_jeff/migration-0015.test.ts && git commit -m "feat(recarga-portal): la 0015 crea student_portal_score y las dos horas de lectura de enrollment (RS-BE-55, RS-BE-57, RS-BE-58)" -m "La migración copia el SQL aprobado de «Modelo de datos», aditivo e idempotente, con borrado en cascada desde enrollment. schema.ts la refleja con los mismos nombres, tipos, restricciones e índices. Nadie la aplica en esta rama; la aplica el dueño con respaldo antes del despliegue."
```

---

### Tarea 2. Presupuesto de tiempo en el entorno

**Archivos.**
- Modificar `src/config/env.ts` y `src/config/app-config.ts`.
- Prueba `test/HU37_jeff/env.refresh-budget.test.ts`.

**Interfaces.**
- Consume `PORTAL_TIMEOUT_MS`, que ya valida `env.ts` como entero positivo con 8 000 por defecto.
- Produce `export const envSchema` (el mismo esquema que valida el arranque, ahora exportado), `export const REFRESH_BUDGET_MIN_MS = 20_000`, `REFRESH_BUDGET_MAX_MS = 65_000`, `REFRESH_BUDGET_DEFAULT_MS = 60_000`, `export const effectiveRefreshBudgetMs = (budgetMs: number, timeoutMs: number): number` y `config.portal.refreshBudgetMs: number`, que la Tarea 19 pasa a `PortalRefreshService`.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/env.refresh-budget.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import {
  REFRESH_BUDGET_DEFAULT_MS, REFRESH_BUDGET_MAX_MS, REFRESH_BUDGET_MIN_MS,
  effectiveRefreshBudgetMs, envSchema,
} from "../../src/config/env.js";
import { config } from "../../src/config/app-config.js";

/**
 * RS-BE-50 · PORTAL_REFRESH_BUDGET_MS y el presupuesto efectivo de la recarga.
 *
 * Se valida con el mismo esquema del arranque sobre un entorno armado a mano,
 * sin tocar process.env. Los tres secretos son ficticios.
 */
const BASE = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/test",
  JWT_SECRET: "test-jwt-secret",
  COHERE_API_KEY: "test-cohere-key",
};
const arrancar = (extra: Record<string, string> = {}) => envSchema.safeParse({ ...BASE, ...extra });

describe("PORTAL_REFRESH_BUDGET_MS", () => {
  test("sin la variable vale 60 000", () => {
    const r = arrancar();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.PORTAL_REFRESH_BUDGET_MS).toBe(60_000);
    expect(REFRESH_BUDGET_DEFAULT_MS).toBe(60_000);
  });

  test("65 000 se acepta y 66 000 se rechaza", () => {
    const r = arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.PORTAL_REFRESH_BUDGET_MS).toBe(65_000);
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "66000" }).success).toBe(false);
    expect(REFRESH_BUDGET_MAX_MS).toBe(65_000);
  });

  test("20 000 se acepta y 19 999 se rechaza", () => {
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "20000" }).success).toBe(true);
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "19999" }).success).toBe(false);
    expect(REFRESH_BUDGET_MIN_MS).toBe(20_000);
  });

  test("un valor que no es entero detiene el arranque en vez de caer al valor por defecto", () => {
    for (const valor of ["abc", "60000.5", "", "6e4x"]) {
      expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: valor }).success).toBe(false);
    }
  });
});

describe("presupuesto efectivo", () => {
  test("con 65 000, un timeout de 8 000 lo deja en 65 000, uno de 15 000 en 51 000 y uno de 30 000 en 21 000", () => {
    expect(effectiveRefreshBudgetMs(65_000, 8_000)).toBe(65_000);
    expect(effectiveRefreshBudgetMs(65_000, 15_000)).toBe(51_000);
    expect(effectiveRefreshBudgetMs(65_000, 30_000)).toBe(21_000);
  });

  test("con PORTAL_TIMEOUT_MS de 31 000 el arranque falla", () => {
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000", PORTAL_TIMEOUT_MS: "31000" }).success).toBe(false);
  });

  test("el límite exacto es un timeout de 30 500", () => {
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000", PORTAL_TIMEOUT_MS: "30500" }).success).toBe(true);
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000", PORTAL_TIMEOUT_MS: "30501" }).success).toBe(false);
  });

  test("config.portal.refreshBudgetMs ya viene acotado por el timeout", () => {
    // El entorno de las pruebas no define PORTAL_REFRESH_BUDGET_MS.
    expect(config.portal.refreshBudgetMs).toBe(effectiveRefreshBudgetMs(60_000, config.portal.timeoutMs));
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/env.refresh-budget.test.ts
```

Se espera un fallo al enlazar el módulo, porque `envSchema` y las constantes no se exportan todavía.

- [ ] **Paso 3. Implementar en `env.ts`**

Antes de `const envSchema`, las constantes y la fórmula.

```ts
/** RS-BE-50. Límites de PORTAL_REFRESH_BUDGET_MS (decisión 4 de recarga-portal.spec.md). */
export const REFRESH_BUDGET_MIN_MS = 20_000;
export const REFRESH_BUDGET_MAX_MS = 65_000;
export const REFRESH_BUDGET_DEFAULT_MS = 60_000;

/**
 * RS-BE-50. Presupuesto efectivo de la recarga. A los 90 s de la app se les
 * restan una petición en vuelo y el cierre de sesión (2 · PORTAL_TIMEOUT_MS),
 * 6 s para la transacción y la respuesta y 3 s para la red del teléfono, así
 * que el peor caso de la respuesta nunca pasa de 87 s.
 */
export const effectiveRefreshBudgetMs = (budgetMs: number, timeoutMs: number): number =>
  Math.min(budgetMs, 81_000 - 2 * timeoutMs);
```

`const envSchema = z.object({` pasa a `export const envSchema = z.object({`. Dentro del objeto, justo después de `PORTAL_TIMEOUT_MS`, la variable nueva.

```ts
  // RS-BE-50. Presupuesto de tiempo de POST /portal-sync/refresh, en ms. Un
  // valor fuera de 20 000 a 65 000 detiene el arranque en vez de caer en
  // silencio al valor por defecto, porque de él depende el plazo de la app.
  PORTAL_REFRESH_BUDGET_MS: z.string().optional().transform((v, ctx) => {
    const n = Number(v ?? String(REFRESH_BUDGET_DEFAULT_MS));
    if (!Number.isInteger(n) || n < REFRESH_BUDGET_MIN_MS || n > REFRESH_BUDGET_MAX_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PORTAL_REFRESH_BUDGET_MS debe ser un entero entre 20000 y 65000",
      });
      return z.NEVER;
    }
    return n;
  }),
```

El cierre del objeto, `});`, pasa a sumar el chequeo del presupuesto efectivo.

```ts
}).superRefine((e, ctx) => {
  // RS-BE-50. Con un PORTAL_TIMEOUT_MS mayor que 30 500 el presupuesto efectivo
  // queda bajo 20 000 y la recarga no alcanzaría a leer nada.
  if (typeof e.PORTAL_REFRESH_BUDGET_MS !== "number" || typeof e.PORTAL_TIMEOUT_MS !== "number") return;
  if (effectiveRefreshBudgetMs(e.PORTAL_REFRESH_BUDGET_MS, e.PORTAL_TIMEOUT_MS) < REFRESH_BUDGET_MIN_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PORTAL_TIMEOUT_MS"],
      message: "PORTAL_TIMEOUT_MS deja el presupuesto de la recarga bajo 20000 ms",
    });
  }
});
```

- [ ] **Paso 4. Implementar en `app-config.ts`**

El import pasa a `import { effectiveRefreshBudgetMs, env } from "./env.js";`, y el bloque `portal` suma el presupuesto.

```ts
  portal: {
    baseUrl: env.PORTAL_BASE_URL,
    timeoutMs: env.PORTAL_TIMEOUT_MS,
    /** RS-BE-50. Presupuesto efectivo de la recarga, ya acotado por el timeout. */
    refreshBudgetMs: effectiveRefreshBudgetMs(env.PORTAL_REFRESH_BUDGET_MS, env.PORTAL_TIMEOUT_MS),
  },
```

- [ ] **Paso 5. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/env.refresh-budget.test.ts test/HU31_jeff/env.portal-allowlist.test.ts
```

Se esperan en verde las 8 pruebas nuevas y las de la allowlist, que no cambian.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-02.log`. Se espera `0 fail`, `EXIT=0` y 8 pruebas más que en la Tarea 1.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/config/env.ts src/config/app-config.ts test/HU37_jeff/env.refresh-budget.test.ts && git commit -m "feat(recarga-portal): PORTAL_REFRESH_BUDGET_MS con el presupuesto efectivo acotado por el timeout (RS-BE-50)" -m "La variable se valida como entero entre 20 000 y 65 000, con 60 000 por defecto, y el arranque falla si 81 000 menos dos veces PORTAL_TIMEOUT_MS la deja bajo 20 000. config.portal.refreshBudgetMs trae el valor ya acotado."
```

---

### Tarea 3. Inicio de sesión con plazo y cierre del frasco cuando falla a medias

**Archivos.**
- Modificar `src/services/portal.client.ts` (`portalFailure`, el constructor, `hop`, `chase` y `login`).
- Prueba `test/HU31_jeff/portal.client.login.test.ts` (existe, casos nuevos al final).

**Interfaces.**
- Consume `PORTAL_PATHS.logout` (`servlets/CustomLogoutServlet`) y el `hop` de hoy, que manda todas las cookies del frasco.
- Produce `new PortalClient(baseUrl?, timeoutMs?, fetchImpl?, syllabusBaseUrl?, now: () => number = Date.now)` y `login(userCode: string, password: string, passcode: string, opciones: { deadline?: number } = {}): Promise<PortalCookies>`. Con `deadline` (milisegundos del mismo reloj `now`), ningún salto empieza después del plazo, el temporizador de cada salto es el menor entre `PORTAL_TIMEOUT_MS` y lo que queda, y un plazo vencido lanza `504 PORTAL_TIMEOUT`. Cuando el inicio de sesión falla con un `JSESSIONID` en el frasco, pide `CustomLogoutServlet` con todas las cookies del frasco, ignora el resultado y lanza el error original. La importación y el registro no pasan `deadline` y siguen como hoy. La Tarea 18 llama `login(código, contraseña, código del autenticador, { deadline })`.

- [ ] **Paso 1. Escribir las pruebas que fallan**

Al final de `test/HU31_jeff/portal.client.login.test.ts`, que ya define `BASE`, `R`, `Pedido`, `Ruta`, `sinSesion`, `conSesion`, `fakePortal`, `OK_LAYOUT`, `rutasFelices` y `clientCon`.

```ts
// ── RS-BE-60 y RS-BE-50 (recarga-portal) ────────────────────────────────────
// Códigos inventados: 20230001 es el alumno de ejemplo de la spec.

const esCierre = (p: { url: string }) => p.url.endsWith("servlets/CustomLogoutServlet");

/** Primer GET con la sesión que el portal probablemente abre ahí mismo. */
const primerGetConSesion: Ruta = {
  match: /layout\.jsp$/, method: "GET", when: sinSesion,
  paso: { status: 200, body: "", setCookie: ["JSESSIONID=pre-sesion; Path=/; HttpOnly"] },
};

describe("RS-BE-60 · cierre de la sesión cuando el inicio de sesión falla a medias", () => {
  test("contraseña rechazada en el paso 2: cierra con las cookies del frasco y lanza el mismo 409", async () => {
    const { client, pedidas } = clientCon([
      primerGetConSesion,
      { match: /j_security_check/, paso: { status: 302, location: `${R}inicio.jsp?error=1` } },
      { match: /inicio\.jsp/, paso: { status: 200, body: "<html>login</html>" } },
    ]);
    const err = await client.login("20230001", "mala", "123456").catch((e) => e);
    expect(err).toMatchObject({ statusCode: 409, code: "PORTAL_LOGIN_REJECTED" });
    const cierres = pedidas.filter(esCierre);
    expect(cierres).toHaveLength(1);
    expect(cierres[0]!.cookie).toContain("JSESSIONID=pre-sesion");
    expect(pedidas.at(-1)).toBe(cierres[0]);
  });

  test("código rechazado en el segundo factor: cierra aunque falte LtpaToken2", async () => {
    const { client, pedidas } = clientCon([
      { match: /layout\.jsp$/, method: "GET", when: sinSesion, paso: { status: 200, body: "" } },
      { match: /j_security_check/, paso: {
        status: 302, location: `${R}solicitarValidarToken.jsp?bAv=0`, setCookie: ["JSESSIONID=abc123; Path=/"],
      } },
      { match: /solicitarValidarToken/, method: "POST", paso: { status: 200, body: "<html>Ingrese su passcode</html>" } },
    ]);
    const err = await client.login("20230001", "clave", "000000").catch((e) => e);
    expect(err).toMatchObject({ statusCode: 409, code: "PORTAL_LOGIN_REJECTED" });
    const cierres = pedidas.filter(esCierre);
    expect(cierres).toHaveLength(1);
    expect(cierres[0]!.cookie).toContain("JSESSIONID=abc123");
    expect(cierres[0]!.cookie).not.toContain("LtpaToken2");
  });

  test("la verificación final fallida también cierra", async () => {
    const { client, pedidas } = clientCon([
      ...rutasFelices(),
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: { status: 200, body: "<html>otra cosa</html>" } },
    ]);
    await expect(client.login("20230001", "clave", "123456")).rejects.toMatchObject({ code: "PORTAL_LOGIN_REJECTED" });
    expect(pedidas.filter(esCierre)).toHaveLength(1);
  });

  test("un error de red a mitad de camino cierra y lanza el mismo 502", async () => {
    const { fetchImpl: base, pedidas } = fakePortal([primerGetConSesion]);
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.includes("j_security_check")) throw new TypeError("fetch failed");
      return base(url, init);
    }) as unknown as typeof fetch;
    const client = new PortalClient(BASE, 5000, fetchImpl);
    await expect(client.login("20230001", "clave", "123456")).rejects.toMatchObject({
      statusCode: 502, code: "PORTAL_UNAVAILABLE",
    });
    expect(pedidas.filter(esCierre)).toHaveLength(1);
  });

  test("un fallo del cierre no cambia el error", async () => {
    const { fetchImpl: base } = fakePortal([
      primerGetConSesion,
      { match: /j_security_check/, paso: { status: 302, location: `${R}inicio.jsp?error=1` } },
      { match: /inicio\.jsp/, paso: { status: 200, body: "" } },
    ]);
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("servlets/CustomLogoutServlet")) throw new TypeError("fetch failed");
      return base(url, init);
    }) as unknown as typeof fetch;
    const client = new PortalClient(BASE, 5000, fetchImpl);
    await expect(client.login("20230001", "mala", "123456")).rejects.toMatchObject({
      statusCode: 409, code: "PORTAL_LOGIN_REJECTED",
    });
  });

  test("un fallo anterior a cualquier JSESSIONID no llama al cierre", async () => {
    const { client, pedidas } = clientCon([
      { match: /layout\.jsp$/, method: "GET", when: sinSesion, paso: { status: 200, body: "" } },
      { match: /j_security_check/, paso: { status: 302, location: `${R}inicio.jsp?error=1` } },
      { match: /inicio\.jsp/, paso: { status: 200, body: "" } },
    ]);
    await expect(client.login("20230001", "mala", "123456")).rejects.toMatchObject({ code: "PORTAL_LOGIN_REJECTED" });
    expect(pedidas.filter(esCierre)).toHaveLength(0);
  });

  test("un inicio de sesión exitoso no cierra nada, porque la sesión es de quien la pidió", async () => {
    const { client, pedidas } = clientCon([
      ...rutasFelices(),
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: OK_LAYOUT },
    ]);
    await client.login("20230001", "clave", "123456");
    expect(pedidas.filter(esCierre)).toHaveLength(0);
  });
});

describe("RS-BE-50 · plazo del inicio de sesión", () => {
  const CACTUS = "https://cactus.ulima.edu.pe";

  /** Un fetch que nunca responde, salvo que lo aborten. */
  const colgado = ((_url: string, init?: RequestInit) => new Promise((_ok, falla) => {
    init?.signal?.addEventListener("abort", () => falla(Object.assign(new Error("abortado"), { name: "AbortError" })));
  })) as unknown as typeof fetch;

  test("ningún salto empieza después del plazo, y el vencido da 504 después del cierre", async () => {
    let t = 0;
    const vistos: Array<{ url: string; t: number }> = [];
    const { fetchImpl } = fakePortal(rutasFelices());
    const conReloj = (async (url: string, init?: RequestInit) => {
      vistos.push({ url, t });
      t += 400;
      return fetchImpl(url, init);
    }) as unknown as typeof fetch;
    const client = new PortalClient(BASE, 5000, conReloj, CACTUS, () => t);
    const err = await client.login("20230001", "clave", "123456", { deadline: 1000 }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
    const saltos = vistos.filter((v) => !esCierre(v));
    expect(saltos.length).toBe(3);
    for (const s of saltos) expect(s.t).toBeLessThan(1000);
    expect(esCierre(vistos.at(-1)!)).toBe(true);
  });

  test("el temporizador de un salto no pasa del tiempo que queda", async () => {
    const client = new PortalClient(BASE, 5000, colgado, CACTUS, () => 0);
    const inicio = Date.now();
    const err = await client.login("20230001", "clave", "123456", { deadline: 50 }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  test("sin plazo, cada salto espera su PORTAL_TIMEOUT_MS completo, como hoy", async () => {
    const client = new PortalClient(BASE, 80, colgado, CACTUS, () => 0);
    const inicio = Date.now();
    const err = await client.login("20230001", "clave", "123456").catch((e) => e);
    expect(err).toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(70);
  });
});
```

En el primer caso del plazo, los tres saltos que empiezan son el `GET` de `layout.jsp` (t = 0), el `POST` de `j_security_check` (t = 400) y el `GET` de `solicitarValidarToken.jsp` que sigue la redirección (t = 800). El `POST` del segundo factor tocaría en t = 1200 y ya no empieza.

- [ ] **Paso 2. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/portal.client.login.test.ts
```

Se espera que fallen los casos de cierre (no hay cierre) y el primero y el segundo del plazo (el cliente ignora el plazo y el reloj). El tercero del plazo y los casos de antes pasan.

- [ ] **Paso 3. Implementar en `portal.client.ts`**

`portalFailure` se apoya en un constructor del `504` que también usa el plazo.

```ts
/** RS-BE-50. Un plazo vencido responde lo mismo que un timeout de red. */
const portalTimeout = () =>
  new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT");

/**
 * Traduce un fallo de red, o de LECTURA del cuerpo, que es el mismo fallo más
 * tarde, a un `HttpError` de mensaje fijo. Nunca se propaga el error original,
 * porque puede llevar cabeceras o cuerpo del portal.
 */
const portalFailure = (e: unknown): HttpError =>
  (e as Error)?.name === "AbortError"
    ? portalTimeout()
    : new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");
```

El constructor suma el reloj como quinto parámetro.

```ts
  constructor(
    private readonly baseUrl: string = config.portal.baseUrl,
    private readonly timeoutMs: number = config.portal.timeoutMs,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Público a propósito: el parser del sílabo arma la URL que se persiste
     *  con ESTA base, la misma con la que se descargó (ver `parseSyllabusEntry`). */
    readonly syllabusBaseUrl: string = config.syllabus.baseUrl,
    /** RS-BE-50. Reloj del plazo del inicio de sesión, falso en las pruebas. */
    private readonly now: () => number = Date.now,
  ) {}
```

`hop` y `chase` se reemplazan enteros.

```ts
  /** Una petición del login: manda el jar, recoge lo que llegue, no sigue
   *  redirecciones (las sigue `chase`, que necesita ver cada salto).
   *
   *  RS-BE-50. Con `deadline`, ningún salto empieza después del plazo y su
   *  temporizador es el menor entre PORTAL_TIMEOUT_MS y el tiempo que queda,
   *  porque un inicio de sesión a medias no sirve de nada. */
  private async hop(
    jar: Map<string, string>, method: "GET" | "POST", url: string,
    form?: Record<string, string>, referer?: string, deadline?: number,
  ): Promise<{ status: number; location: string | null; body: string }> {
    const espera = deadline === undefined ? this.timeoutMs : Math.min(this.timeoutMs, deadline - this.now());
    if (espera <= 0) throw portalTimeout();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), espera);
    try {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      const headers: Record<string, string> = { "User-Agent": UA };
      if (cookie) headers.Cookie = cookie;
      if (referer) headers.Referer = referer;
      if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
      const res = await this.fetchImpl(url, {
        method, redirect: "manual", signal: ac.signal, headers,
        body: form ? new URLSearchParams(form).toString() : undefined,
      });
      this.collectCookies(jar, res);
      const buf = await res.arrayBuffer();
      return {
        status: res.status,
        location: res.headers.get("location"),
        // ISO-8859-1 como el resto de `webaloe` (el tipado de Bun no lo declara,
        // igual que en `fetchPage`). Solo se usa para buscar marcadores ASCII;
        // este cuerpo nunca se devuelve al cliente.
        body: new TextDecoder("iso-8859-1" as Bun.Encoding).decode(buf),
      };
    } catch (e) {
      throw portalFailure(e);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sigue la cadena de 302 acumulando cookies. Devuelve dónde terminó. */
  private async chase(
    jar: Map<string, string>, inicio: { status: number; location: string | null; body: string },
    urlActual: string, deadline?: number,
  ): Promise<{ url: string; body: string }> {
    const saltos = 8;
    let paso = inicio;
    let url = urlActual;
    for (let i = 0; i < saltos && paso.status >= 300 && paso.status < 400 && paso.location; i++) {
      url = new URL(paso.location, url).toString();
      // TRAMPA: `redirectJsp.jsp` no se vuelve a pedir NUNCA. Es una página que
      // solo lleva un `window.location.replace` a layout.jsp, y volver a
      // pedirla tumba la sesión recién creada. Se corta acá y el paso 4 va
      // directo a layout.jsp.
      if (url.includes("redirectJsp.jsp")) return { url, body: "" };
      paso = await this.hop(jar, "GET", url, undefined, urlActual, deadline);
    }
    return { url, body: paso.body };
  }
```

`login` pasa a envolver los pasos de hoy, que se mueven sin cambios de lógica a `pasosDeLogin` con el plazo en cada `hop` y cada `chase`.

```ts
  /**
   * Inicia sesión en miUlima y devuelve las cookies de la sesión creada.
   *
   * `userCode` NO viene del cliente: sale de `app_user.code` a partir del JWT.
   * `password` y `passcode` se usan y se descartan: no se registran en ningún
   * log, no se persisten y no aparecen en ningún mensaje de error.
   *
   * RS-BE-50. La recarga pasa `deadline`, y la importación y el registro no.
   *
   * RS-BE-60. Si falla después de que el frasco recibe un JSESSIONID, cierra
   * esa sesión con todas las cookies del frasco por el mismo `hop`, y no con
   * `logout()`, que exige LtpaToken2, una cookie que antes del segundo factor
   * puede no existir. El cierre espera a lo sumo su PORTAL_TIMEOUT_MS, también
   * pasado el plazo, y nunca cambia el error que se lanza.
   */
  async login(
    userCode: string, password: string, passcode: string,
    opciones: { deadline?: number } = {},
  ): Promise<PortalCookies> {
    const jar = new Map<string, string>();
    try {
      return await this.pasosDeLogin(jar, userCode, password, passcode, opciones.deadline);
    } catch (e) {
      if (jar.has("JSESSIONID")) await this.cerrarFrasco(jar);
      throw e;
    }
  }

  /** RS-BE-60. Cierre de la sesión a medias. Cualquier error se ignora. */
  private async cerrarFrasco(jar: Map<string, string>): Promise<void> {
    try {
      await this.hop(jar, "GET", `${this.baseUrl}${ROOT}${PORTAL_PATHS.logout}`);
    } catch {
      /* el cierre nunca cambia el error del inicio de sesión */
    }
  }

  private async pasosDeLogin(
    jar: Map<string, string>, userCode: string, password: string, passcode: string, deadline?: number,
  ): Promise<PortalCookies> {
    const base = `${this.baseUrl}${ROOT}`;

    // 1. Sin sesión: fija WASReqURL y rebota a inicio.jsp.
    const p1 = await this.hop(jar, "GET", `${base}${PORTAL_PATHS.layout}`, undefined, undefined, deadline);
    await this.chase(jar, p1, `${base}${PORTAL_PATHS.layout}`, deadline);

    // 2. Usuario y contraseña. `ac` es el timestamp que manda el formulario.
    const p2 = await this.hop(jar, "POST", `${base}${PORTAL_PATHS.securityCheck}`, {
      ac: String(Date.now()), url2: "", j_username: userCode, j_password: password,
    }, `${base}inicio.jsp`, deadline);
    const tras2 = await this.chase(jar, p2, `${base}${PORTAL_PATHS.securityCheck}`, deadline);

    // Volver a inicio.jsp sin pasar por el segundo factor = credenciales malas.
    if (tras2.url.includes("inicio.jsp") && !tras2.url.includes("solicitarValidarToken")) {
      throw loginRejected();
    }

    // 3. Segundo factor, si el portal lo pide.
    if (tras2.url.includes("solicitarValidarToken")) {
      const p3 = await this.hop(jar, "POST", tras2.url, { url2: "", sPasscode: passcode }, tras2.url, deadline);
      // TRAMPA: un passcode rechazado devuelve 200 con la MISMA página y sin
      // mensaje de error. La redirección es la única señal fiable de éxito, así
      // que el criterio es esa y no el status ni el texto.
      if (p3.status < 300 || p3.status >= 400) throw loginRejected();
      await this.chase(jar, p3, tras2.url, deadline);
    }

    // 4. Verificación. Se va DIRECTO a layout.jsp (ver la trampa de `chase`).
    const p4 = await this.hop(
      jar, "GET", `${base}${PORTAL_PATHS.layout}`, undefined, `${base}redirectJsp.jsp`, deadline,
    );
    const tras4 = await this.chase(jar, p4, `${base}${PORTAL_PATHS.layout}`, deadline);
    const cuerpo = tras4.body || p4.body;
    if (tras4.url.includes("inicio.jsp") || !cuerpo.includes("Bienvenid")) throw loginRejected();

    const JSESSIONID = jar.get("JSESSIONID");
    const LtpaToken2 = jar.get("LtpaToken2");
    if (!JSESSIONID || !LtpaToken2) throw loginRejected();
    const LtpaToken = jar.get("LtpaToken");
    return LtpaToken ? { JSESSIONID, LtpaToken2, LtpaToken } : { JSESSIONID, LtpaToken2 };
  }
```

- [ ] **Paso 4. Correr las pruebas del cliente y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/portal.client.login.test.ts test/HU31_jeff/portal.client.test.ts test/HU31_jeff/portal.client.delegado.test.ts
```

Se espera todo en verde, con 10 casos nuevos en el archivo del inicio de sesión.

- [ ] **Paso 5. Build y suite completa en segundo plano** con `tarea-03.log`. Se espera `0 fail`, `EXIT=0` y 10 pruebas más que en la Tarea 2. Las pruebas del registro (`test/HU33_jeff/`) siguen en verde, porque el registro llama al mismo `login` sin plazo y solo suma una petición de cierre cuando el portal rechaza a medias.

- [ ] **Paso 6. Commit**

```bash
cd "${REPO:?}" && git add src/services/portal.client.ts test/HU31_jeff/portal.client.login.test.ts && git commit -m "feat(portal-client): el inicio de sesión respeta un plazo y cierra la sesión que el portal abre cuando falla a medias (RS-BE-50, RS-BE-60)" -m "Con deadline, ningún salto empieza después del plazo y cada temporizador es el menor entre PORTAL_TIMEOUT_MS y lo que queda. Un fallo con JSESSIONID en el frasco pide CustomLogoutServlet con todas sus cookies, ignora el resultado y lanza el mismo error. La importación y el registro no pasan plazo."
```

---

### Tarea 4. Rutas del panel Nota y opciones de `fetchPage` (con la verificación V1)

**Archivos.**
- Modificar `src/services/portal.client.ts` (`OpcionesPagina`, `fetchPage` y `PORTAL_PATHS`).
- Prueba nueva `test/HU37_jeff/portal.client.nota.test.ts`.

**Interfaces.**
- Consume `assertAula` (`^\d{4,8}$`), que ya protege las rutas del Aula Virtual.
- Produce `export type OpcionesPagina = { charset?: "iso-8859-1"; refererPath?: string }`, `fetchPage(path: string, cookies: PortalCookies, opciones: OpcionesPagina = {}): Promise<string>`, `PORTAL_PATHS.cursosNota` (`"av/servlets/ComandoListarCursosXOpcionAulaVirtualNota"`), `PORTAL_PATHS.notaCurso(aula)` (el servlet que fija V1, con `?prm_sNuAula=<aula>`) y `PORTAL_PATHS.tareaAcademica(aula)` (`"gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=<aula>"`). La Tarea 17 pide la página del curso con `{ refererPath: PORTAL_PATHS.cursosNota }` y el marco con `{ charset: "iso-8859-1", refererPath: PORTAL_PATHS.notaCurso(aula) }`.

- [ ] **Paso 1. Verificación V1 (PARAR si falta)**

La spec pide V1 antes de implementar RS-BE-52, y la decisión abierta 17 autoriza los sondeos de solo lectura de V1 a V4. Hace falta, en el chat, el resultado de V1 que dé el dueño o su permiso para correr la parte sin sesión, que es un `GET` de un archivo estático público. Sin ninguno de los dos, PARAR. Con el permiso, se corre esto y la salida no se guarda en ningún repo.

```bash
curl -s --max-time 20 https://webaloe.ulima.edu.pe/portalUL/av/scripts/aVirtualBB.js | tr -d '\r' | grep -n -A 16 'function OpenNotaAlumnoPrePost'
```

La salida muestra la ruta del servlet que arma `OpenNotaAlumnoPrePost` y los parámetros que manda. Si manda solo `prm_sNuAula`, esa ruta (relativa a `/portalUL/`, por ejemplo `av/servlets/Comando…`) es el valor de `NOTA_CURSO_SERVLET` del Paso 4. Si manda un código de alumno o cualquier otro parámetro además del aula, PARAR y escalar al dueño, con el mismo criterio que la ruta prohibida de `asistencia-portal.spec.md`. La parte con sesión de V1 (el `Content-Type` de la página del curso y del marco, y si el portal exige `Referer`) la corre el dueño con su cuenta, y su resultado entra a la spec en la Tarea 22.

- [ ] **Paso 2. Escribir la prueba que falla**

`test/HU37_jeff/portal.client.nota.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { PORTAL_PATHS, PortalClient } from "../../src/services/portal.client.js";

/**
 * RS-BE-52 y RS-BE-53, punto 8 · rutas del panel Nota y opciones de la página.
 * Aulas y cookies inventadas.
 */
const BASE = "https://webaloe.ulima.edu.pe";
const cookies = { JSESSIONID: "sesion-de-prueba", LtpaToken2: "ltpa-de-prueba" };

describe("rutas del panel Nota (RS-BE-52)", () => {
  test("el menú del panel Nota es una ruta fija sin parámetros", () => {
    expect(PORTAL_PATHS.cursosNota).toBe("av/servlets/ComandoListarCursosXOpcionAulaVirtualNota");
  });

  test("la página del curso es el servlet que fija V1, con el aula como único parámetro", () => {
    expect(PORTAL_PATHS.notaCurso("900101")).toMatch(
      /^(?:av|gada)\/servlets\/Comando[A-Za-z]+\?prm_sNuAula=900101$/,
    );
  });

  test("el marco de evaluaciones se arma con el aula, nunca con el src del HTML", () => {
    expect(PORTAL_PATHS.tareaAcademica("900101")).toBe(
      "gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=900101",
    );
  });

  test("un aula mal formada revienta antes de llegar a la red", () => {
    for (const aula of ["901", "900101&x=1", "../1234", "123456789"]) {
      expect(() => PORTAL_PATHS.notaCurso(aula)).toThrow();
      expect(() => PORTAL_PATHS.tareaAcademica(aula)).toThrow();
    }
  });
});

describe("opciones de fetchPage (RS-BE-53, punto 8)", () => {
  /** Bytes ISO-8859-1 de un texto con caracteres bajo U+0100. */
  const latin1 = (s: string) => new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));

  const responder = (cuerpo: Uint8Array, contentType: string, vistos: Array<Record<string, string>> = []) =>
    (async (_url: string, init?: RequestInit) => {
      vistos.push({ ...(init?.headers as Record<string, string>) });
      return new Response(cuerpo, { status: 200, headers: { "Content-Type": contentType } });
    }) as unknown as typeof fetch;

  test("con charset ISO-8859-1, tildes y eñes llegan intactas aunque la cabecera diga UTF-8", async () => {
    const c = new PortalClient(BASE, 8000, responder(latin1("<td>Diseño de interacción</td>"), "text/html; charset=UTF-8"));
    const html = await c.fetchPage(PORTAL_PATHS.tareaAcademica("900101"), cookies, { charset: "iso-8859-1" });
    expect(html).toContain("Diseño de interacción");
  });

  test("sin la opción, decodifica según el Content-Type, como antes", async () => {
    const c = new PortalClient(BASE, 8000, responder(latin1("<td>Diseño</td>"), "text/html; charset=UTF-8"));
    const html = await c.fetchPage(PORTAL_PATHS.tareaAcademica("900101"), cookies);
    expect(html).not.toContain("Diseño");
  });

  test("refererPath manda el Referer que mandaría el navegador", async () => {
    const vistos: Array<Record<string, string>> = [];
    const c = new PortalClient(BASE, 8000, responder(latin1("<html></html>"), "text/html; charset=ISO-8859-1", vistos));
    await c.fetchPage(PORTAL_PATHS.tareaAcademica("900101"), cookies, { refererPath: PORTAL_PATHS.notaCurso("900101") });
    expect(vistos[0]!.Referer).toBe(`${BASE}/portalUL/${PORTAL_PATHS.notaCurso("900101")}`);
  });

  test("sin refererPath no se manda Referer", async () => {
    const vistos: Array<Record<string, string>> = [];
    const c = new PortalClient(BASE, 8000, responder(latin1("<html></html>"), "text/html; charset=ISO-8859-1", vistos));
    await c.fetchPage(PORTAL_PATHS.cursosNota, cookies);
    expect(vistos[0]!.Referer).toBeUndefined();
  });
});
```

- [ ] **Paso 3. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/portal.client.nota.test.ts
```

Se espera que fallen las rutas (no existen) y los casos con opciones de charset y Referer.

- [ ] **Paso 4. Implementar en `portal.client.ts`**

Antes de `PORTAL_PATHS`, la ruta que da V1. El valor de ejemplo es solo la forma. Se reemplaza por la ruta que imprime el Paso 1, relativa a `/portalUL/` y sin el `?`.

```ts
/**
 * RS-BE-52. Servlet de la página de notas de un curso, tal como lo arma
 * `OpenNotaAlumnoPrePost` en `aVirtualBB.js` (verificación V1). Su único
 * parámetro es el aula. Si algún día pide un código de alumno, la recarga se
 * detiene y se escala, con el mismo criterio de la ruta prohibida de
 * asistencia-portal.spec.md.
 */
const NOTA_CURSO_SERVLET = "av/servlets/ComandoRutaQueDaV1";
```

Dentro de `PORTAL_PATHS`, después de `asistenciaAlumno`.

```ts
  // ── Panel Nota (RS-BE-52 y RS-BE-53) ─────────────────────────────────────

  /** Menú del panel. Un `OpenNotaAlumnoPrePost('<aula>')` por curso, en el
   *  mismo formato de lista que el de Asistencia, así que lo lee `parseAulas`. */
  cursosNota: "av/servlets/ComandoListarCursosXOpcionAulaVirtualNota",

  /** Página de notas de un curso. El aula pasa por `assertAula`. */
  notaCurso: (aula: string) => `${NOTA_CURSO_SERVLET}?prm_sNuAula=${assertAula(aula)}`,

  /** Marco «Detalle Evaluaciones». El cliente arma esta ruta con el aula del
   *  menú y nunca sigue el `src` del marco que trae el HTML. */
  tareaAcademica: (aula: string) =>
    `gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=${assertAula(aula)}`,
```

Después de `portalFailure`, el tipo de las opciones.

```ts
/** RS-BE-52 y RS-BE-53. Opciones de una página del Aula Virtual. */
export type OpcionesPagina = {
  /** Fuerza la decodificación. El marco de evaluaciones declara ISO-8859-1 y
   *  el cliente no depende de lo que anuncie la cabecera (RS-BE-53, punto 8). */
  charset?: "iso-8859-1";
  /** Ruta bajo /portalUL/ que el navegador mandaría como Referer. */
  refererPath?: string;
};
```

En `fetchPage`, la firma, las cabeceras y la elección del charset.

```ts
  async fetchPage(path: string, cookies: PortalCookies, opciones: OpcionesPagina = {}): Promise<string> {
```

```ts
          headers: {
            Cookie: this.cookieHeader(cookies), "User-Agent": UA, Accept: "text/html,*/*;q=0.8",
            ...(opciones.refererPath ? { Referer: `${this.baseUrl}${ROOT}${opciones.refererPath}` } : {}),
          },
```

```ts
      const declarado = res.headers.get("Content-Type")?.match(/charset=([\w-]+)/i)?.[1] ?? "ISO-8859-1";
      const charset = opciones.charset ?? declarado;
```

El resto de `fetchPage` no cambia, y `logout` sigue llamando `fetchPage(PORTAL_PATHS.logout, cookies)`.

- [ ] **Paso 5. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/portal.client.nota.test.ts test/HU31_jeff/portal.client.test.ts
```

Se esperan 8 pruebas nuevas en verde y las del cliente de siempre sin cambios. Si el valor de ejemplo sigue en el código, la segunda prueba pasa igual, así que antes del commit `grep -n 'ComandoRutaQueDaV1' src/services/portal.client.ts` tiene que salir vacío.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-04.log`. Se espera `0 fail`, `EXIT=0` y 8 pruebas más que en la Tarea 3.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/services/portal.client.ts test/HU37_jeff/portal.client.nota.test.ts && git commit -m "feat(portal-client): rutas del panel Nota y opciones de charset y Referer en fetchPage (RS-BE-52, RS-BE-53)" -m "La ruta de la página del curso sale de la verificación V1 y su único parámetro es el aula. El marco de evaluaciones se arma con el aula del menú y se decodifica como ISO-8859-1 sin depender de la cabecera."
```

---

### Tarea 5. `parseAsistenciaCurso` revisa el ciclo y separa el código ausente del distinto

**Archivos.**
- Crear `test/HU37_jeff/fixtures/asistencia-curso-900101.html`.
- Modificar `src/modules/portal-sync/parsers/asistencia.ts`.
- Prueba `test/HU31_jeff/parser.asistencia.test.ts` (existe, casos nuevos al final).

**Interfaces.**
- Consume `AsistenciaResult`, `falla(reason, identificado?)` e `identificado`, que trae RS-BE-48 desde `main`.
- Produce `AsistenciaResult = ParseResult<AsistenciaCurso> & { identificado?: AsistenciaIdentificada; identityMismatch?: true; otroCiclo?: true }` y `parseAsistenciaCurso(html: string, aulaEsperada: string, alumnoEsperado: string, cicloEsperado?: string): AsistenciaResult`. Un código de alumno ausente o vacío falla con «la página no trae el código de alumno». Uno presente y distinto falla con el motivo de hoy y `identityMismatch: true`. Con `cicloEsperado` (`"AAAA-N"`), unos ocultos mal formados fallan con «la página es de otro ciclo», y bien formados y de otro ciclo suman `otroCiclo: true`. La identificación verificada exige además el ciclo. Las Tareas 12 y 16 pasan el cuarto parámetro.

- [ ] **Paso 1. Crear el fixture armado a mano**

`test/HU37_jeff/fixtures/asistencia-curso-900101.html`. Reproduce la estructura de la página viva que lee el parser, con datos inventados y una falta de dos horas.

```html
<html>
<head>
<!--
  FIXTURE ARMADO A MANO (RS-BE-51 y RS-BE-59). Reproduce la estructura de la
  página de asistencia del alumno en el Aula Virtual con datos inventados. El
  alumno 20230001, el curso 690417, la sección 812 y el aula 900101 son los de
  recarga-portal.spec.md. Las tres sesiones y la falta de dos horas también son
  inventadas.
-->
<title>Asistencia</title>
</head>
<body>
<form name="ListaAsistencia">
	<INPUT type="hidden" name="prm_sAaCicl" value="2026" size="4">
	<INPUT type="hidden" name="prm_sNuCicl" value="2" size="4">
	<INPUT type="hidden" name="prm_sCoCurs" value="690417" size="4">
	<INPUT type="hidden" name="prm_sCoSecc" value="812" size="4">
	<INPUT type="hidden" name="prm_sNuAula" value="900101" size="4">
	<INPUT type="hidden" name="prm_sCoUserAlum" value="20230001" size="10">
	<INPUT type="HIDDEN" name="prm_sCoSeccAcd" value="" size="4">
</form>

<table width="450" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr align="left" valign="top">
    <td><strong class="header">Fecha</strong></td>
    <td width="10"></td>
    <td align="left"><strong class="header">Hora</strong></td>
    <td width="10"></td>
    <td align="center"><strong class="header">Duracion</strong></td>
    <td width="10"></td>
    <td align="center"><strong class="header">Asistencia</strong></td>
    <td width="10"></td>
    <td><strong class="header">Observaci&oacute;n</strong></td>
  </tr>
  <tr align="left" valign="top">
    <td class="textos">25/08/2026</td>
    <td>&nbsp;</td>
    <td class="textos">07:00:00</td>
    <td>&nbsp;</td>
    <td align="center" class="textos">2</td>
    <td>&nbsp;</td>
    <td align="center" class="textos">S&iacute;</td>
    <td>&nbsp;</td>
    <td class="textos"></td>
  </tr>
  <tr align="left" valign="top">
    <td class="textos">01/09/2026</td>
    <td>&nbsp;</td>
    <td class="textos">07:00:00</td>
    <td>&nbsp;</td>
    <td align="center" class="textos">2</td>
    <td>&nbsp;</td>
    <td align="center" class="textos">No</td>
    <td>&nbsp;</td>
    <td class="textos">Observaci&oacute;n inventada</td>
  </tr>
  <tr align="left" valign="top">
    <td class="textos">08/09/2026</td>
    <td>&nbsp;</td>
    <td class="textos">07:00:00</td>
    <td>&nbsp;</td>
    <td align="center" class="textos">2</td>
    <td>&nbsp;</td>
    <td align="center" class="textos">S&iacute;</td>
    <td>&nbsp;</td>
    <td class="textos"></td>
  </tr>
</table>

<table border="0" align="left" cellpadding="0" cellspacing="0">
  <tr align="left" valign="top">
    <td class="textos">Total horas programadas </td>
    <td></td>
    <td class="textos">:</td>
    <td></td>
    <td><strong class="textos">48</strong></td>
  </tr>
  <tr align="left" valign="top">
    <td class="textos">Total  horas  asistidas</td>
    <td></td>
    <td class="textos">:</td>
    <td></td>
    <td><strong class="textos">4</strong></td>
  </tr>
  <tr align="left" valign="top">
    <td class="textos">Total inasistencias </td>
    <td></td>
    <td class="textos">:</td>
    <td></td>
    <td><strong class="textos">2 horas /
    <b>&nbsp;4&nbsp;%</b></strong></td>
  </tr>
</table>
</body>
</html>
```

- [ ] **Paso 2. Escribir las pruebas que fallan**

Al final de `test/HU31_jeff/parser.asistencia.test.ts`.

```ts
// ── RS-BE-49 y RS-BE-51 (recarga-portal) · ciclo e identidad ────────────────
// Fixture armado a mano con los datos inventados de la spec (RS-BE-59).
const PAGINA_900101 = await Bun.file("test/HU37_jeff/fixtures/asistencia-curso-900101.html").text();
const ALUMNO_900101 = "20230001";

/** Cambia el `value` de un oculto. */
const conOculto = (html: string, nombre: string, valor: string) =>
  html.replace(new RegExp(`(name="${nombre}" value=")[^"]*`), (_t, pre: string) => pre + valor);
/** Quita un oculto entero. */
const sinOculto = (html: string, nombre: string) =>
  html.replace(new RegExp(`<INPUT[^>]*name="${nombre}"[^>]*>`, "i"), "");

describe("fixture armado a mano de la recarga (RS-BE-59)", () => {
  test("lee 48 programadas, 4 asistidas y 2 de falta, con el ciclo esperado", () => {
    expect(parseAsistenciaCurso(PAGINA_900101, "900101", ALUMNO_900101, "2026-2")).toEqual({
      ok: true,
      data: { courseCode: "690417", sectionCode: "812", totalHours: 48, attendedHours: 4, absentHours: 2 },
      identificado: { courseCode: "690417", sectionCode: "812" },
    });
  });
});

describe("ciclo esperado (RS-BE-51, punto 3)", () => {
  test("otro ciclo con los dos ocultos bien formados marca otroCiclo y no identifica", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sNuCicl", "1"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo", otroCiclo: true });
  });

  test("un año mal formado es un fallo común, sin otroCiclo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sAaCicl", "26"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo" });
  });

  test("un número de ciclo fuera de 0 a 3 es un fallo común, sin otroCiclo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sNuCicl", "4"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo" });
  });

  test("un oculto del ciclo ausente es un fallo común, sin otroCiclo", () => {
    const r = parseAsistenciaCurso(sinOculto(PAGINA_900101, "prm_sNuCicl"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página es de otro ciclo" });
  });

  test("sin cicloEsperado no se revisa el ciclo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sNuCicl", "1"), "900101", ALUMNO_900101);
    expect(r.ok).toBe(true);
  });
});

describe("identidad (RS-BE-49)", () => {
  test("un código presente y distinto marca identityMismatch sin imprimir ningún código", () => {
    const r = parseAsistenciaCurso(PAGINA_900101, "900101", "20230002", "2026-2");
    expect(r).toEqual({
      ok: false, reason: "la página declara un código de alumno distinto del autenticado", identityMismatch: true,
    });
  });

  test("un código vacío es un fallo común con su propio motivo", () => {
    const r = parseAsistenciaCurso(conOculto(PAGINA_900101, "prm_sCoUserAlum", ""), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página no trae el código de alumno" });
  });

  test("sin el oculto del alumno, el mismo fallo común", () => {
    const r = parseAsistenciaCurso(sinOculto(PAGINA_900101, "prm_sCoUserAlum"), "900101", ALUMNO_900101, "2026-2");
    expect(r).toEqual({ ok: false, reason: "la página no trae el código de alumno" });
  });

  test("la identidad se revisa antes que el ciclo", () => {
    const ajena = conOculto(conOculto(PAGINA_900101, "prm_sCoUserAlum", "20230002"), "prm_sNuCicl", "1");
    const r = parseAsistenciaCurso(ajena, "900101", ALUMNO_900101, "2026-2");
    expect(r.identityMismatch).toBe(true);
    expect(r.otroCiclo).toBeUndefined();
  });
});
```

- [ ] **Paso 3. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/parser.asistencia.test.ts
```

Se espera que fallen los casos de ciclo (el parser ignora el cuarto parámetro) y los de identidad (hoy no hay `identityMismatch` ni motivo propio para el código ausente). El primer caso del fixture pasa.

- [ ] **Paso 4. Implementar en `parsers/asistencia.ts`**

El tipo del resultado suma las dos marcas.

```ts
/**
 * `ParseResult` más la identificación verificada, que va FUERA de `data` para
 * que `AsistenciaCurso` siga con sus cinco campos. Sale también cuando la página
 * falla después de identificarse, porque de ese par dependen los delegados y el
 * nombre del curso en los avisos cuando el menú no trae el código.
 *
 * RS-BE-49 y RS-BE-51. `identityMismatch` marca solo un código de alumno
 * presente, no vacío y distinto, para que la recarga aborte entera, y
 * `otroCiclo` marca solo unos ocultos del ciclo bien formados que declaran otro.
 */
export type AsistenciaResult = ParseResult<AsistenciaCurso> & {
  identificado?: AsistenciaIdentificada;
  identityMismatch?: true;
  otroCiclo?: true;
};
```

La firma suma el cuarto parámetro.

```ts
export const parseAsistenciaCurso = (
  html: string,
  aulaEsperada: string,
  alumnoEsperado: string,
  /** RS-BE-51. "AAAA-N". Sin él no se revisa el ciclo. */
  cicloEsperado?: string,
): AsistenciaResult => {
```

El chequeo del alumno que hoy termina en `return falla("la página declara un código de alumno distinto del autenticado");` se reemplaza entero por el alumno y el ciclo, justo antes de `const identificado`.

```ts
  const alumno = inputValueByName(html, "prm_sCoUserAlum");
  // RS-BE-49. Ausente o vacío es un fallo común de lectura de este curso.
  if (!alumno) return falla("la página no trae el código de alumno");
  if (alumno !== alumnoEsperado) {
    // Sin imprimir ninguno de los dos códigos: el recibido sería de un tercero.
    return {
      ok: false, reason: "la página declara un código de alumno distinto del autenticado", identityMismatch: true,
    };
  }
  // RS-BE-51, punto 3. La página de notas no trae ciclo, así que el de la
  // asistencia es la guarda contra leer notas de un ciclo que ULima++ no activó.
  if (cicloEsperado !== undefined) {
    const anio = inputValueByName(html, "prm_sAaCicl");
    const numero = inputValueByName(html, "prm_sNuCicl");
    if (!anio || !/^\d{4}$/.test(anio) || !numero || !/^[0-3]$/.test(numero)) {
      return falla("la página es de otro ciclo");
    }
    if (`${anio}-${numero}` !== cicloEsperado) {
      return { ok: false, reason: "la página es de otro ciclo", otroCiclo: true };
    }
  }
```

El resto del archivo no cambia.

- [ ] **Paso 5. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/parser.asistencia.test.ts test/HU31_jeff/service.asistencia.test.ts
```

Se esperan en verde los 10 casos nuevos y los de siempre. La importación todavía no pasa el cuarto parámetro, así que su comportamiento no cambia salvo el motivo del código ausente, que ninguna prueba de la importación fija.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-05.log`. Se espera `0 fail`, `EXIT=0` y 10 pruebas más que en la Tarea 4.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/parsers/asistencia.ts test/HU31_jeff/parser.asistencia.test.ts test/HU37_jeff/fixtures/asistencia-curso-900101.html && git commit -m "feat(portal-sync): parseAsistenciaCurso revisa el ciclo esperado y separa el código de alumno ausente del distinto (RS-BE-49, RS-BE-51)" -m "Con cicloEsperado, unos ocultos mal formados son un fallo común y unos bien formados de otro ciclo marcan otroCiclo. Un código de alumno ausente tiene su propio motivo, y uno presente y distinto marca identityMismatch. El fixture nuevo está armado a mano con los datos inventados de la spec."
```

---

### Tarea 6. Lector de la página de notas de un curso

**Archivos.**
- Crear `test/HU37_jeff/fixtures/nota-curso-900101.html`.
- Crear `src/modules/portal-sync/parsers/nota.ts` (con `parseNotaCurso`; la Tarea 7 suma el segundo lector).
- Modificar `src/modules/portal-sync/portal-sync.types.ts` (tipos de la página de notas).
- Prueba `test/HU37_jeff/parser.nota-curso.test.ts`.

**Interfaces.**
- Consume `clean` y `stripTags` de `parsers/html.ts` y `ParseResult`.
- Produce en `portal-sync.types.ts` `export type AgregadoUlima = { clave: "EP" | "TA" | "EF" | "PROM"; etiqueta: string; valor: number | null }` y `export type NotaCurso = { courseCode: string; sectionCode: string; agregados: AgregadoUlima[] }`, y en `parsers/nota.ts` `export const parseNotaCurso = (html: string, aulaEsperada: string): ParseResult<NotaCurso>`. La Tarea 17 lo llama con el aula del menú.

- [ ] **Paso 1. Crear el fixture armado a mano**

La página viva sangra cada `var` con un tabulador, y la spec pide conservarlo para que un lector anclado en `^var` no pase la prueba y falle en vivo. Para no depender de que un editor conserve los tabuladores, el bloque lleva `⇥` donde va cada uno, y el Paso 2 los convierte. Contenido de `test/HU37_jeff/fixtures/nota-curso-900101.html`.

```html
<html>
<head>
<!--
  FIXTURE ARMADO A MANO (RS-BE-52 y RS-BE-59). Reproduce la estructura de la
  página de notas de un curso del panel Nota del Aula Virtual con datos
  inventados. El curso 690417, la sección 812 y el aula 900101 son los de
  recarga-portal.spec.md. Cada asignación va sangrada con un tabulador, como en
  la página viva. La línea comentada lleva un nombre inventado, y los mínimos y
  máximos son distintos de cero, para probar que nada de eso cambia el resultado.
-->
<title>Notas del curso</title>
<script language="JavaScript">
⇥var codCurso = '690417';
⇥var nomCurso = 'TALLER DE PROTOTIPADO';
⇥var seccion = '812';
⇥//var nomAlumno = 'PRUEBA RAMOS, LUCIA';
⇥var notaEP = '0';
⇥var minEP = '6';
⇥var maxEP = '19';
⇥var nomEP = 'Eval. Continua';
⇥var notaTA = '0';
⇥var minTA = '7';
⇥var maxTA = '18';
⇥var nomTA = 'Eval. Continua<br>2';
⇥var notaEF = '0';
⇥var minEF = '5';
⇥var maxEF = '17';
⇥var nomEF = 'Eval. Final';
⇥var notaPROM = '0';
⇥var minPROM = '8';
⇥var maxPROM = '16';
⇥var nomPROM = 'Promedio';
</script>
</head>
<body>
<table width="100%">
  <tr><td class="titular">TALLER DE PROTOTIPADO</td></tr>
</table>
<iframe name="ifrTareaAcad" id="ifrTareaAcad" src="/portalUL/gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=900101" width="100%" height="420" frameborder="0" scrolling="auto"></iframe>
</body>
</html>
```

- [ ] **Paso 2. Convertir las marcas en tabuladores y comprobarlo**

```bash
cd "${REPO:?}" && perl -CSD -pi -e 's/\x{21E5}/\t/g' test/HU37_jeff/fixtures/nota-curso-900101.html && grep -c $'^\tvar ' test/HU37_jeff/fixtures/nota-curso-900101.html && grep -c $'^\t//var ' test/HU37_jeff/fixtures/nota-curso-900101.html && ! grep -q $'⇥' test/HU37_jeff/fixtures/nota-curso-900101.html && echo SIN-MARCAS
```

Se espera `19`, `1` y `SIN-MARCAS`.

- [ ] **Paso 3. Escribir la prueba que falla**

`test/HU37_jeff/parser.nota-curso.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { parseNotaCurso } from "../../src/modules/portal-sync/parsers/nota.js";

/**
 * RS-BE-52 · página de notas de un curso en el panel Nota del Aula Virtual.
 * Fixture armado a mano con la estructura de la página viva y datos inventados
 * (RS-BE-59).
 */
const PAGINA = await Bun.file("test/HU37_jeff/fixtures/nota-curso-900101.html").text();

/** Cambia el valor de una asignación `var nombre = '…'`. */
const conVar = (html: string, nombre: string, valor: string) =>
  html.replace(new RegExp(`(\\bvar ${nombre} = )'[^']*'`), (_t, pre: string) => `${pre}'${valor}'`);

const NO_ES_NOTAS = { ok: false, reason: "la respuesta no es la página de notas de un curso" };

describe("identificación del curso (puntos 1 y 2)", () => {
  test("lee curso y sección con cada var sangrado con un tabulador, como en la página viva", () => {
    const r = parseNotaCurso(PAGINA, "900101");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.courseCode).toBe("690417");
    expect(r.data.sectionCode).toBe("812");
  });

  test("una línea comentada nunca se lee, aunque asigne codCurso", () => {
    const trampa = PAGINA.replace("\tvar codCurso = '690417';", "\t//var codCurso = '111111';\n\tvar codCurso = '690417';");
    const r = parseNotaCurso(trampa, "900101");
    expect(r.ok && r.data.courseCode).toBe("690417");
  });

  test("sin sangría y con comillas dobles también se lee", () => {
    const plana = PAGINA.replaceAll("\tvar ", "var ").replace("'690417'", '"690417"');
    const r = parseNotaCurso(plana, "900101");
    expect(r.ok && r.data.courseCode).toBe("690417");
  });

  test("el nombre de la línea comentada no aparece en el resultado, que tiene tres campos", () => {
    const r = parseNotaCurso(PAGINA, "900101");
    const texto = JSON.stringify(r);
    for (const dato of ["PRUEBA", "RAMOS", "LUCIA", "TALLER"]) expect(texto).not.toContain(dato);
    expect(r.ok && Object.keys(r.data).sort()).toEqual(["agregados", "courseCode", "sectionCode"]);
  });

  test("codCurso ausente o mal formado da el motivo de la página de inicio de sesión", () => {
    expect(parseNotaCurso(PAGINA.replace("\tvar codCurso = '690417';\n", ""), "900101")).toEqual(NO_ES_NOTAS);
    expect(parseNotaCurso(conVar(PAGINA, "codCurso", "69A417"), "900101")).toEqual(NO_ES_NOTAS);
    const login = "<html><body><form action='j_security_check'><input name='j_username'></form></body></html>";
    expect(parseNotaCurso(login, "900101")).toEqual(NO_ES_NOTAS);
  });

  test("una sección mal formada falla con su propio motivo", () => {
    expect(parseNotaCurso(conVar(PAGINA, "seccion", "8A2"), "900101")).toEqual({
      ok: false, reason: "la página no trae el código de sección",
    });
  });
});

describe("marco de evaluaciones (punto 3)", () => {
  test("sin el marco ifrTareaAcad", () => {
    expect(parseNotaCurso(PAGINA.replace(/<iframe[\s\S]*?<\/iframe>/, ""), "900101")).toEqual({
      ok: false, reason: "la página no trae el marco de evaluaciones",
    });
  });

  test("un marco hacia otra ruta no cuenta como marco de evaluaciones", () => {
    const otra = PAGINA.replace("ComandoConsultarTareaAcademica", "ComandoOtraCosa");
    expect(parseNotaCurso(otra, "900101")).toEqual({ ok: false, reason: "la página no trae el marco de evaluaciones" });
  });

  test("un marco de otra aula", () => {
    expect(parseNotaCurso(PAGINA, "900102")).toEqual({
      ok: false, reason: "la página no corresponde al aula que se pidió",
    });
  });

  test("el marco se reconoce por su id aunque no tenga name", () => {
    expect(parseNotaCurso(PAGINA.replace('name="ifrTareaAcad" ', ""), "900101").ok).toBe(true);
  });
});

describe("agregados (puntos 4 y 5)", () => {
  const BASE = [
    { clave: "EP", etiqueta: "Eval. Continua", valor: null },
    { clave: "TA", etiqueta: "Eval. Continua 2", valor: null },
    { clave: "EF", etiqueta: "Eval. Final", valor: null },
    { clave: "PROM", etiqueta: "Promedio", valor: null },
  ];

  test("un 0 del portal sale como null, porque significa «sin nota», y el <br> pasa a espacio", () => {
    const r = parseNotaCurso(PAGINA, "900101");
    expect(r.ok && r.data.agregados).toEqual(BASE);
  });

  test("una nota publicada se lee con sus decimales", () => {
    const r = parseNotaCurso(conVar(PAGINA, "notaPROM", "14.25"), "900101");
    expect(r.ok && r.data.agregados.at(-1)).toEqual({ clave: "PROM", etiqueta: "Promedio", valor: 14.25 });
  });

  test("los mínimos y máximos de la clase nunca cambian el resultado", () => {
    const otra = conVar(conVar(conVar(PAGINA, "minPROM", "3"), "maxPROM", "20"), "minEP", "0");
    const r = parseNotaCurso(otra, "900101");
    expect(r.ok && r.data.agregados).toEqual(BASE);
  });

  test("un agregado ausente o fuera de formato se omite sin hacer fallar al curso", () => {
    const sinTA = PAGINA.replace("\tvar notaTA = '0';\n", "");
    const fuera = conVar(conVar(sinTA, "notaEF", "21"), "notaEP", "A");
    const r = parseNotaCurso(fuera, "900101");
    expect(r.ok && r.data.agregados.map((a) => a.clave)).toEqual(["PROM"]);
  });

  test("nunca lanza, ni con basura", () => {
    expect(() => parseNotaCurso("<<<>>>&#x;;", "1")).not.toThrow();
  });
});
```

- [ ] **Paso 4. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/parser.nota-curso.test.ts
```

Se espera un fallo al cargar, porque `parsers/nota.ts` no existe.

- [ ] **Paso 5. Sumar los tipos a `portal-sync.types.ts`**

Al final del archivo.

```ts
/** RS-BE-52. Un agregado de la página de notas de un curso. `valor` es null
 *  cuando el portal publica 0, que usa para decir «sin nota». Solo sirve al
 *  chequeo del promedio de RS-BE-53, punto 7, y nunca se guarda. */
export type AgregadoUlima = { clave: "EP" | "TA" | "EF" | "PROM"; etiqueta: string; valor: number | null };

/** RS-BE-52. Lo que se lee de la página de notas de un curso. Tres campos y
 *  ninguno con el nombre del alumno, del docente ni los datos de la clase. */
export type NotaCurso = { courseCode: string; sectionCode: string; agregados: AgregadoUlima[] };
```

- [ ] **Paso 6. Implementar `parsers/nota.ts`**

```ts
import { clean, stripTags, type ParseResult } from "./html.js";
import type { AgregadoUlima, NotaCurso } from "../portal-sync.types.js";

/**
 * RS-BE-52 y RS-BE-53 · panel Nota del Aula Virtual, vista del alumno.
 *
 * `parseNotaCurso` lee la página de un curso, que trae en JavaScript el curso,
 * la sección y cuatro agregados, y abre el marco «Detalle Evaluaciones».
 *
 * Los motivos de fallo son literales fijos y nunca llevan un fragmento del
 * HTML. Las asignaciones `min*` y `max*` no se leen nunca, porque son datos de
 * la clase entera, es decir de terceros, y usan el mismo 0 ambiguo.
 *
 * Este archivo no entra al barrel `parsers/index.ts`, que cuenta
 * `scripts/verificar-readme.py`, y se importa directo.
 */

const MARCO = /^\/portalUL\/gada\/servlets\/ComandoConsultarTareaAcademica\?prm_sNuAula=(\d{4,8})$/;
const NOTA_AGREGADO = /^\d{1,2}(\.\d{1,2})?$/;
const CLAVES: ReadonlyArray<AgregadoUlima["clave"]> = ["EP", "TA", "EF", "PROM"];

/**
 * Valor de la asignación JavaScript `nombre = '<valor>';` al comienzo de una
 * línea, tras espacios o tabulaciones opcionales y con `var` opcional, con
 * comillas simples, dobles o sin ellas. La página viva sangra cada `var` con
 * tabulaciones, y una línea cuyo primer carácter visible empieza un `//` nunca
 * calza, así que la línea comentada con el nombre del alumno queda fuera por
 * construcción.
 */
export const asignacionJs = (html: string, nombre: string): string | null => {
  const re = new RegExp(
    `^[ \\t]*(?:var[ \\t]+)?${nombre}[ \\t]*=[ \\t]*(?:(['"])([^'"\\r\\n]*)\\1|([^\\s;'"]+))[ \\t]*;`,
    "m",
  );
  const m = re.exec(html);
  return m ? (m[2] ?? m[3] ?? null) : null;
};

/** Valor de un atributo de una etiqueta, con comillas dobles, simples o sin ellas. */
export const atributo = (tag: string, nombre: string): string | null => {
  const m = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
};

export const parseNotaCurso = (html: string, aulaEsperada: string): ParseResult<NotaCurso> => {
  // 1. El curso. Su ausencia mata también la página de inicio de sesión, que
  // este portal devuelve con HTTP 200.
  const courseCode = asignacionJs(html, "codCurso");
  if (!courseCode || !/^\d{4,6}$/.test(courseCode)) {
    return { ok: false, reason: "la respuesta no es la página de notas de un curso" };
  }
  // 2. La sección.
  const sectionCode = asignacionJs(html, "seccion");
  if (!sectionCode || !/^\d{1,4}$/.test(sectionCode)) {
    return { ok: false, reason: "la página no trae el código de sección" };
  }
  // 3. El marco de evaluaciones, por su name o su id, con la ruta exacta.
  const aulas = (html.match(/<iframe\b[^>]*>/gi) ?? [])
    .filter((tag) => atributo(tag, "name") === "ifrTareaAcad" || atributo(tag, "id") === "ifrTareaAcad")
    .map((tag) => MARCO.exec(atributo(tag, "src") ?? "")?.[1] ?? null)
    .filter((aula): aula is string => aula !== null);
  if (!aulas.length) return { ok: false, reason: "la página no trae el marco de evaluaciones" };
  if (!aulas.includes(aulaEsperada)) return { ok: false, reason: "la página no corresponde al aula que se pidió" };

  // 4. Los agregados. Uno que falta o no cumple se omite y no hace fallar al curso.
  const agregados: AgregadoUlima[] = [];
  for (const clave of CLAVES) {
    const crudo = asignacionJs(html, `nota${clave}`);
    if (crudo === null || !NOTA_AGREGADO.test(crudo)) continue;
    const valor = Number(crudo);
    if (valor > 20) continue;
    agregados.push({
      clave,
      etiqueta: clean(stripTags(asignacionJs(html, `nom${clave}`) ?? "")),
      valor: valor === 0 ? null : valor,
    });
  }
  return { ok: true, data: { courseCode, sectionCode, agregados } };
};
```

- [ ] **Paso 7. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/parser.nota-curso.test.ts
```

Se esperan 15 pruebas en verde.

- [ ] **Paso 8. Build y suite completa en segundo plano** con `tarea-06.log`. Se espera `0 fail`, `EXIT=0` y 15 pruebas más que en la Tarea 5.

- [ ] **Paso 9. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/parsers/nota.ts src/modules/portal-sync/portal-sync.types.ts test/HU37_jeff/parser.nota-curso.test.ts test/HU37_jeff/fixtures/nota-curso-900101.html && git commit -m "feat(recarga-portal): lector de la página de notas de un curso (RS-BE-52)" -m "parseNotaCurso lee el curso y la sección de las asignaciones JavaScript ancladas al comienzo de la línea, exige el marco ifrTareaAcad con la ruta exacta y el aula pedida y devuelve los cuatro agregados con el 0 como null. Los mínimos, los máximos y la línea comentada con el nombre nunca se leen."
```

---

### Tarea 7. Lector de la tabla «Detalle Evaluaciones»

**Archivos.**
- Crear `test/HU37_jeff/fixtures/detalle-evaluaciones-vacias.html`, `detalle-evaluaciones-con-notas.html`, `detalle-evaluaciones-np.html` y `detalle-evaluaciones-dos-grupos.html`.
- Modificar `src/modules/portal-sync/parsers/nota.ts` (segundo lector) y `src/modules/portal-sync/portal-sync.types.ts` (`EvaluacionUlima`).
- Prueba `test/HU37_jeff/parser.detalle-evaluaciones.test.ts`.

**Interfaces.**
- Consume `trsOf`, `cellsOf` y `normalizeLabel` de `parsers/html.ts`, y `atributo` de la Tarea 6.
- Produce `export type EvaluacionUlima = { key: string; group: string | null; name: string; week: number | null; weight: number; value: number | null; mark: "graded" | "pending" | "np" }` y `export const parseDetalleEvaluaciones = (html: string): ParseResult<EvaluacionUlima[]>`. Las Tareas 8, 13 y 17 usan ese tipo.

- [ ] **Paso 1. Crear los cuatro fixtures armados a mano**

`test/HU37_jeff/fixtures/detalle-evaluaciones-vacias.html`

```html
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<!--
  FIXTURE ARMADO A MANO (RS-BE-53 y RS-BE-59). Reproduce la estructura del marco
  «Detalle Evaluaciones» del panel Nota con datos inventados. Un solo grupo
  raíz, EVC, con peso 100, y cinco evaluaciones que suman 100, todas sin nota,
  como en la semana 5 del ciclo.
-->
<title>Tarea Académica</title>
</head>
<body>
<p class="subtitulo">Evaluaciones</p>
<table class="treetable" id="tblTareaAcademica" width="100%">
  <thead>
    <tr>
      <th width="20"></th>
      <th>Detalle Evaluaciones</th>
      <th>Semana</th>
      <th>Peso</th>
      <th>Nota</th>
      <th width="20"></th>
    </tr>
  </thead>
  <tbody>
    <tr data-tt-id="07">
      <td><span class="folder"></span></td>
      <td>EVC</td>
      <td>&nbsp;</td>
      <td>100</td>
      <td>&nbsp;</td>
      <td></td>
    </tr>
    <tr data-tt-id="07.13" data-tt-parent-id='07'>
      <td><span class="file"></span></td>
      <td>Examen escrito 1</td>
      <td>3</td>
      <td>15</td>
      <td>&nbsp;</td>
      <td></td>
    </tr>
    <tr data-tt-id="07.14" data-tt-parent-id='07'>
      <td><span class="file"></span></td>
      <td>Trabajo de producción 1</td>
      <td>6</td>
      <td>15</td>
      <td>&nbsp;</td>
      <td></td>
    </tr>
    <tr data-tt-id="07.15" data-tt-parent-id='07'>
      <td><span class="file"></span></td>
      <td>Exposición</td>
      <td>10</td>
      <td>20</td>
      <td>&nbsp;</td>
      <td></td>
    </tr>
    <tr data-tt-id="07.16" data-tt-parent-id='07'>
      <td><span class="file"></span></td>
      <td>Examen escrito 2</td>
      <td>12</td>
      <td>20</td>
      <td>&nbsp;</td>
      <td></td>
    </tr>
    <tr data-tt-id="07.17" data-tt-parent-id='07'>
      <td><span class="file"></span></td>
      <td>Proyecto final</td>
      <td>15</td>
      <td>30</td>
      <td>&nbsp;</td>
      <td></td>
    </tr>
  </tbody>
</table>
</body>
</html>
```

`detalle-evaluaciones-con-notas.html` es una copia de la anterior con otras dos cosas. El comentario dice «con notas inventadas, una con punto y otra con coma decimal» en lugar de «todas sin nota, como en la semana 5 del ciclo», y la celda de nota de `07.13` pasa a `14.5` y la de `07.14` a `12,75`.

```bash
cd "${REPO:?}/test/HU37_jeff/fixtures" && perl -0pe 's/todas sin nota, como en la semana 5 del ciclo\./con notas inventadas, una con punto y otra con coma decimal./; s/(<td>Examen escrito 1<\/td>\s*<td>3<\/td>\s*<td>15<\/td>\s*)<td>&nbsp;<\/td>/$1<td>14.5<\/td>/; s/(<td>Trabajo de producción 1<\/td>\s*<td>6<\/td>\s*<td>15<\/td>\s*)<td>&nbsp;<\/td>/$1<td>12,75<\/td>/' detalle-evaluaciones-vacias.html > detalle-evaluaciones-con-notas.html && grep -c '<td>14.5</td>\|<td>12,75</td>' detalle-evaluaciones-con-notas.html
```

Se espera `2`. `detalle-evaluaciones-np.html` sale igual, con «con una evaluación marcada NP» en el comentario y `NP` en la nota de `07.13`.

```bash
cd "${REPO:?}/test/HU37_jeff/fixtures" && perl -0pe 's/todas sin nota, como en la semana 5 del ciclo\./con una evaluación marcada NP./; s/(<td>Examen escrito 1<\/td>\s*<td>3<\/td>\s*<td>15<\/td>\s*)<td>&nbsp;<\/td>/$1<td>NP<\/td>/' detalle-evaluaciones-vacias.html > detalle-evaluaciones-np.html && grep -c '<td>NP</td>' detalle-evaluaciones-np.html
```

Se espera `1`. `detalle-evaluaciones-dos-grupos.html` se escribe entero.

```html
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
<!--
  FIXTURE ARMADO A MANO (RS-BE-53 y RS-BE-59). Dos grupos raíz con pesos
  absolutos que suman 100, un formato que todavía no tiene muestra viva. EVC
  pesa 60 y trae dos evaluaciones, y EXF pesa 40 y trae una. Datos inventados.
-->
<title>Tarea Académica</title>
</head>
<body>
<p class="subtitulo">Evaluaciones</p>
<table class="treetable" id="tblTareaAcademica" width="100%">
  <tr>
    <th></th><th>Detalle Evaluaciones</th><th>Semana</th><th>Peso</th><th>Nota</th><th></th>
  </tr>
  <tr data-tt-id="07">
    <td></td><td>EVC</td><td>&nbsp;</td><td>60</td><td>&nbsp;</td><td></td>
  </tr>
  <tr data-tt-id="07.13" data-tt-parent-id='07'>
    <td></td><td>Examen escrito 1</td><td>3</td><td>20</td><td>&nbsp;</td><td></td>
  </tr>
  <tr data-tt-id="07.14" data-tt-parent-id='07'>
    <td></td><td>Trabajo de producción 1</td><td>6</td><td>40</td><td>&nbsp;</td><td></td>
  </tr>
  <tr data-tt-id="08">
    <td></td><td>EXF</td><td>&nbsp;</td><td>40</td><td>&nbsp;</td><td></td>
  </tr>
  <tr data-tt-id="08.21" data-tt-parent-id='08'>
    <td></td><td>Examen final</td><td>16</td><td>40</td><td>&nbsp;</td><td></td>
  </tr>
</table>
</body>
</html>
```

- [ ] **Paso 2. Escribir la prueba que falla**

`test/HU37_jeff/parser.detalle-evaluaciones.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { parseDetalleEvaluaciones } from "../../src/modules/portal-sync/parsers/nota.js";

/**
 * RS-BE-53 · tabla «Detalle Evaluaciones» del marco del panel Nota.
 * Fixtures armados a mano con datos inventados (RS-BE-59). Todavía no hay
 * ninguna muestra viva con una nota publicada, así que los formatos de nota
 * salen de la spec y los ajusta la verificación V2.
 */
const leer = (n: string) => Bun.file(`test/HU37_jeff/fixtures/${n}`).text();
const VACIAS = await leer("detalle-evaluaciones-vacias.html");
const CON_NOTAS = await leer("detalle-evaluaciones-con-notas.html");
const NP = await leer("detalle-evaluaciones-np.html");
const DOS_GRUPOS = await leer("detalle-evaluaciones-dos-grupos.html");

const CABECERA = "<tr><th></th><th>Detalle Evaluaciones</th><th>Semana</th><th>Peso</th><th>Nota</th><th></th></tr>";
const tabla = (filas: string[]) => `<table>${CABECERA}${filas.join("")}</table>`;
const grupo = (id = "07", nombre = "EVC", peso = "100") =>
  `<tr data-tt-id="${id}"><td></td><td>${nombre}</td><td>&nbsp;</td><td>${peso}</td><td>&nbsp;</td><td></td></tr>`;
const hoja = (id: string, nombre: string, semana: string, peso: string, nota = "&nbsp;", padre = "07") =>
  `<tr data-tt-id="${id}" data-tt-parent-id='${padre}'><td></td><td>${nombre}</td><td>${semana}</td><td>${peso}</td><td>${nota}</td><td></td></tr>`;
const conNota = (nota: string) => parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "Examen escrito 1", "3", "100", nota)]));
const falla = (reason: string) => ({ ok: false, reason });

describe("puerta de cabecera (punto 1)", () => {
  test("una cabecera distinta falla", () => {
    expect(parseDetalleEvaluaciones(VACIAS.replace("<th>Peso</th>", "<th>Ponderación</th>"))).toEqual(
      falla("la tabla de evaluaciones no tiene la cabecera esperada"),
    );
  });

  test("la página de inicio de sesión no pasa", () => {
    const login = "<html><body><form action='j_security_check'><input name='j_username'></form></body></html>";
    expect(parseDetalleEvaluaciones(login)).toEqual(falla("la tabla de evaluaciones no tiene la cabecera esperada"));
  });
});

describe("evaluaciones del sondeo, con datos inventados", () => {
  test("cinco evaluaciones sin nota, cada una con sus siete campos", () => {
    const r = parseDetalleEvaluaciones(VACIAS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(5);
    expect(r.data[0]).toEqual({
      key: "07.13", group: "EVC", name: "Examen escrito 1", week: 3, weight: 15, value: null, mark: "pending",
    });
    expect(r.data.map((e) => e.name)).toEqual([
      "Examen escrito 1", "Trabajo de producción 1", "Exposición", "Examen escrito 2", "Proyecto final",
    ]);
    for (const e of r.data) expect(Object.keys(e).sort()).toEqual(["group", "key", "mark", "name", "value", "week", "weight"]);
  });

  test("notas con punto y con coma decimal", () => {
    const r = parseDetalleEvaluaciones(CON_NOTAS);
    expect(r.ok && r.data.slice(0, 3).map((e) => [e.value, e.mark])).toEqual([
      [14.5, "graded"], [12.75, "graded"], [null, "pending"],
    ]);
  });

  test("NP es una marca sin valor", () => {
    const r = parseDetalleEvaluaciones(NP);
    expect(r.ok && [r.data[0]!.value, r.data[0]!.mark]).toEqual([null, "np"]);
  });

  test("dos grupos con pesos absolutos, cada evaluación con su grupo", () => {
    const r = parseDetalleEvaluaciones(DOS_GRUPOS);
    expect(r.ok && r.data.map((e) => [e.key, e.group, e.weight])).toEqual([
      ["07.13", "EVC", 20], ["07.14", "EVC", 40], ["08.21", "EXF", 40],
    ]);
  });
});

describe("celdas de una hoja (punto 4)", () => {
  test("formatos de nota aceptados", () => {
    expect(conNota("14.5")).toMatchObject({ ok: true, data: [{ value: 14.5, mark: "graded" }] });
    expect(conNota("14,5")).toMatchObject({ ok: true, data: [{ value: 14.5, mark: "graded" }] });
    expect(conNota("NP")).toMatchObject({ ok: true, data: [{ value: null, mark: "np" }] });
    expect(conNota("np")).toMatchObject({ ok: true, data: [{ value: null, mark: "np" }] });
    expect(conNota("&nbsp;")).toMatchObject({ ok: true, data: [{ value: null, mark: "pending" }] });
    expect(conNota("0")).toMatchObject({ ok: true, data: [{ value: 0, mark: "graded" }] });
  });

  test("formatos de nota rechazados", () => {
    expect(conNota("21")).toEqual(falla("una nota está fuera del rango de 0 a 20"));
    for (const nota of ["-1", "A", "14.555"]) expect(conNota(nota)).toEqual(falla("una nota tiene un formato desconocido"));
  });

  test("semana vacía como null, y 0, 21 o con letras fallan", () => {
    const conSemana = (semana: string) =>
      parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "Participación", semana, "100")]));
    expect(conSemana("&nbsp;")).toMatchObject({ ok: true, data: [{ week: null }] });
    for (const semana of ["0", "21", "3a"]) expect(conSemana(semana)).toEqual(falla("la semana de una evaluación no es válida"));
  });

  test("peso 0 o 101 falla, y con coma se lee", () => {
    const conPeso = (a: string, b: string) =>
      parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "A", "3", a), hoja("07.14", "B", "4", b)]));
    expect(conPeso("0", "100")).toEqual(falla("el peso de una evaluación no es válido"));
    expect(conPeso("101", "0,5")).toEqual(falla("el peso de una evaluación no es válido"));
    expect(conPeso("87,5", "12,5")).toMatchObject({ ok: true, data: [{ weight: 87.5 }, { weight: 12.5 }] });
  });

  test("nombre vacío o de más de 150 caracteres falla", () => {
    const conNombre = (nombre: string) => parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", nombre, "3", "100")]));
    expect(conNombre("&nbsp;")).toEqual(falla("una evaluación no tiene nombre"));
    expect(conNombre("x".repeat(151))).toEqual(falla("el nombre de una evaluación es demasiado largo"));
  });

  test("un grupo de más de 60 caracteres deja group en null", () => {
    const r = parseDetalleEvaluaciones(tabla([grupo("07", "G".repeat(61)), hoja("07.13", "A", "3", "100")]));
    expect(r).toMatchObject({ ok: true, data: [{ group: null }] });
  });
});

describe("estructura de la tabla (puntos 2 y 3)", () => {
  test("hoja huérfana, tercer nivel, id repetido, id raro y fila de cinco celdas fallan", () => {
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("09.1", "A", "3", "100", "&nbsp;", "09")])))
      .toEqual(falla("una evaluación no tiene su grupo"));
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "A", "3", "50"), hoja("07.13.1", "B", "4", "50", "&nbsp;", "07.13")])))
      .toEqual(falla("la tabla tiene un nivel de evaluaciones que ULima++ todavía no lee"));
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "A", "3", "50"), hoja("07.13", "B", "4", "50")])))
      .toEqual(falla("una fila de evaluaciones está repetida"));
    expect(parseDetalleEvaluaciones(tabla([grupo(), hoja("07.a", "A", "3", "100")])))
      .toEqual(falla("una fila de evaluaciones tiene un identificador desconocido"));
    const cinco = `<tr data-tt-id="07.13" data-tt-parent-id='07'><td></td><td>A</td><td>3</td><td>100</td><td></td></tr>`;
    expect(parseDetalleEvaluaciones(tabla([grupo(), cinco]))).toEqual(falla("una fila de evaluaciones no tiene seis celdas"));
  });

  test("una tabla sin hojas falla", () => {
    expect(parseDetalleEvaluaciones(tabla([grupo()]))).toEqual(falla("la tabla no trae evaluaciones"));
  });
});

describe("pesos (punto 6)", () => {
  const dos = (a: string, b: string) =>
    parseDetalleEvaluaciones(tabla([grupo("07", "EVC", ""), hoja("07.13", "A", "3", a), hoja("07.14", "B", "4", b)]));

  test("99,6 y 100,4 se aceptan y 99 se rechaza", () => {
    expect(dos("49,6", "50").ok).toBe(true);
    expect(dos("50,4", "50").ok).toBe(true);
    expect(dos("49", "50")).toEqual(falla("los pesos de la ULima no suman 100"));
  });

  test("un grupo cuyo peso no coincide con sus evaluaciones falla", () => {
    expect(parseDetalleEvaluaciones(DOS_GRUPOS.replace("<td>EXF</td><td>&nbsp;</td><td>40</td>", "<td>EXF</td><td>&nbsp;</td><td>30</td>")))
      .toEqual(falla("el peso de un grupo no coincide con sus evaluaciones"));
  });

  test("pesos relativos a cada grupo fallan con su propio motivo", () => {
    const relativos = tabla([
      grupo("07", "EVC", "60"), hoja("07.13", "A", "3", "50"), hoja("07.14", "B", "4", "50"),
      grupo("08", "EXF", "40"), hoja("08.21", "C", "16", "100", "&nbsp;", "08"),
    ]);
    expect(parseDetalleEvaluaciones(relativos)).toEqual(falla("pesos por grupo, un formato que ULima++ todavía no lee"));
  });
});

describe("mensajes", () => {
  test("ningún motivo lleva HTML ni el texto de una celda", () => {
    const r = parseDetalleEvaluaciones(tabla([grupo(), hoja("07.13", "<b>Secreto</b>", "3", "100", "XYZ")]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).not.toContain("<");
    expect(r.reason).not.toContain("Secreto");
    expect(r.reason).not.toContain("XYZ");
  });

  test("nunca lanza, ni con basura", () => {
    expect(() => parseDetalleEvaluaciones("<<<>>>&#x;;<tr data-tt-id=")).not.toThrow();
  });
});
```

- [ ] **Paso 3. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/parser.detalle-evaluaciones.test.ts
```

Se espera un fallo al enlazar, porque `parseDetalleEvaluaciones` no existe.

- [ ] **Paso 4. Sumar el tipo a `portal-sync.types.ts`**

```ts
/**
 * RS-BE-53. Una evaluación de la tabla «Detalle Evaluaciones». SIETE CAMPOS Y
 * NINGUNO MÁS. No hay campo para la mínima, la máxima, el promedio del grupo ni
 * ningún texto del docente, y esa ausencia es la garantía de minimización.
 */
export type EvaluacionUlima = {
  key: string;
  group: string | null;
  name: string;
  week: number | null;
  weight: number;
  value: number | null;
  mark: "graded" | "pending" | "np";
};
```

- [ ] **Paso 5. Implementar el segundo lector en `parsers/nota.ts`**

El import pasa a `import { cellsOf, clean, normalizeLabel, stripTags, trsOf, type ParseResult } from "./html.js";` y el de tipos suma `EvaluacionUlima`. Al final del archivo.

```ts
const CABECERA = ["DETALLE EVALUACIONES", "SEMANA", "PESO", "NOTA"];
const ID_FILA = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const SEMANA = /^\d{1,2}$/;
const PESO = /^\d{1,3}([.,]\d{1,2})?$/;
const NOTA = /^\d{1,2}([.,]\d{1,2})?$/;
const TOLERANCIA_SUMA = 0.5;

const decimal = (s: string): number => Number(s.replace(",", "."));
const fallaTabla = (reason: string): ParseResult<EvaluacionUlima[]> => ({ ok: false, reason });

type Fila = { id: string; padre: string | null; celdas: string[] };

type LecturaNota =
  | { ok: true; mark: EvaluacionUlima["mark"]; value: number | null }
  | { ok: false; reason: string };

/** Punto 4. Vacía es `pending`, NP es `np` y un número de 0 a 20 es `graded`. */
const leerNota = (celda: string): LecturaNota => {
  if (!celda) return { ok: true, mark: "pending", value: null };
  if (/^np$/i.test(celda)) return { ok: true, mark: "np", value: null };
  // Todavía no hay ninguna muestra con nota publicada (V2), así que cualquier
  // otro texto hace fallar al curso en vez de adivinar.
  if (!NOTA.test(celda)) return { ok: false, reason: "una nota tiene un formato desconocido" };
  const valor = decimal(celda);
  if (valor > 20) return { ok: false, reason: "una nota está fuera del rango de 0 a 20" };
  return { ok: true, mark: "graded", value: Math.round(valor * 100) / 100 };
};

/**
 * RS-BE-53 · marco «Detalle Evaluaciones». No trae ningún identificador, así
 * que solo lo ata a su curso el orden de las peticiones (Tarea 17).
 */
export const parseDetalleEvaluaciones = (html: string): ParseResult<EvaluacionUlima[]> => {
  const trs = trsOf(html);

  // 1. Puerta de cabecera. Rechaza también la página de inicio de sesión.
  const hayCabecera = trs
    .map(cellsOf)
    .some((c) => c.length === 6 && CABECERA.every((etiqueta, i) => normalizeLabel(c[i + 1]!) === etiqueta));
  if (!hayCabecera) return fallaTabla("la tabla de evaluaciones no tiene la cabecera esperada");

  // 2. Filas con data-tt-id, con comillas simples o dobles.
  const filas: Fila[] = [];
  const vistos = new Set<string>();
  for (const tr of trs) {
    const tag = /^<tr\b[^>]*>/i.exec(tr)?.[0] ?? "";
    const id = atributo(tag, "data-tt-id");
    if (id === null) continue;
    if (!ID_FILA.test(id)) return fallaTabla("una fila de evaluaciones tiene un identificador desconocido");
    if (vistos.has(id)) return fallaTabla("una fila de evaluaciones está repetida");
    vistos.add(id);
    const celdas = cellsOf(tr);
    if (celdas.length !== 6) return fallaTabla("una fila de evaluaciones no tiene seis celdas");
    filas.push({ id, padre: atributo(tag, "data-tt-parent-id"), celdas });
  }

  // 3. Grupos y hojas. No hay muestra de un tercer nivel.
  const grupos = new Map(filas.filter((f) => f.padre === null).map((f) => [f.id, f]));
  const hojas = filas.filter((f) => f.padre !== null);
  for (const h of hojas) {
    if (grupos.has(h.padre!)) continue;
    return fallaTabla(vistos.has(h.padre!)
      ? "la tabla tiene un nivel de evaluaciones que ULima++ todavía no lee"
      : "una evaluación no tiene su grupo");
  }
  if (!hojas.length) return fallaTabla("la tabla no trae evaluaciones");

  // 4 y 5. Celdas de cada hoja y nombre de su grupo. Las celdas 0 y 5 no se leen.
  const evaluaciones: EvaluacionUlima[] = [];
  for (const h of hojas) {
    const [, nombre, semana, peso, nota] = h.celdas;
    if (!nombre) return fallaTabla("una evaluación no tiene nombre");
    if (nombre.length > 150) return fallaTabla("el nombre de una evaluación es demasiado largo");
    let week: number | null = null;
    if (semana) {
      week = SEMANA.test(semana) ? Number(semana) : 0;
      if (week < 1 || week > 20) return fallaTabla("la semana de una evaluación no es válida");
    }
    const weight = PESO.test(peso!) ? decimal(peso!) : 0;
    if (weight <= 0 || weight > 100) return fallaTabla("el peso de una evaluación no es válido");
    const leida = leerNota(nota!);
    if (!leida.ok) return fallaTabla(leida.reason);
    const nombreGrupo = grupos.get(h.padre!)!.celdas[1]!;
    evaluaciones.push({
      key: h.id,
      group: nombreGrupo && nombreGrupo.length <= 60 ? nombreGrupo : null,
      name: nombre,
      week,
      weight,
      value: leida.value,
      mark: leida.mark,
    });
  }

  // 6. Pesos, en este orden.
  const suma = (xs: EvaluacionUlima[]) => xs.reduce((s, e) => s + e.weight, 0);
  const cerca = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA_SUMA;
  const porGrupo = new Map<string, EvaluacionUlima[]>();
  hojas.forEach((h, i) => porGrupo.set(h.padre!, [...(porGrupo.get(h.padre!) ?? []), evaluaciones[i]!]));
  if (cerca(suma(evaluaciones), 100)) {
    for (const [id, evs] of porGrupo) {
      const pesoGrupo = grupos.get(id)!.celdas[3]!;
      if (!pesoGrupo) continue;
      if (!PESO.test(pesoGrupo) || !cerca(decimal(pesoGrupo), suma(evs))) {
        return fallaTabla("el peso de un grupo no coincide con sus evaluaciones");
      }
    }
    return { ok: true, data: evaluaciones };
  }
  if ([...porGrupo.values()].every((evs) => cerca(suma(evs), 100))) {
    return fallaTabla("pesos por grupo, un formato que ULima++ todavía no lee");
  }
  return fallaTabla("los pesos de la ULima no suman 100");
};
```

`clean` y `stripTags` siguen en uso por `parseNotaCurso`, así que el import no deja nombres sin usar.

- [ ] **Paso 6. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/parser.detalle-evaluaciones.test.ts test/HU37_jeff/parser.nota-curso.test.ts
```

Se esperan 19 pruebas nuevas en verde y las 15 de la Tarea 6.

- [ ] **Paso 7. Build y suite completa en segundo plano** con `tarea-07.log`. Se espera `0 fail`, `EXIT=0` y 19 pruebas más que en la Tarea 6.

- [ ] **Paso 8. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/parsers/nota.ts src/modules/portal-sync/portal-sync.types.ts test/HU37_jeff/parser.detalle-evaluaciones.test.ts test/HU37_jeff/fixtures/detalle-evaluaciones-vacias.html test/HU37_jeff/fixtures/detalle-evaluaciones-con-notas.html test/HU37_jeff/fixtures/detalle-evaluaciones-np.html test/HU37_jeff/fixtures/detalle-evaluaciones-dos-grupos.html && git commit -m "feat(recarga-portal): lector de la tabla «Detalle Evaluaciones» (RS-BE-53)" -m "parseDetalleEvaluaciones exige la cabecera de seis celdas, lee solo las filas con data-tt-id, separa grupos y hojas, valida nombre, semana, peso y nota de cada hoja y acepta solo pesos absolutos que suman 100 con 0,5 de tolerancia. Cada evaluación lleva siete campos y ningún motivo lleva HTML."
```

---

### Tarea 8. Emparejamiento de las evaluaciones de la ULima con el sílabo

**Archivos.**
- Crear `src/modules/portal-sync/refresh/emparejar.ts`.
- Modificar `src/modules/portal-sync/portal-sync.types.ts` (`EvaluacionSilabo`, `MatchRule` y `EvaluacionEmparejada`).
- Prueba `test/HU37_jeff/emparejar.test.ts`.

**Interfaces.**
- Consume `EvaluacionUlima` (Tarea 7).
- Produce `export type EvaluacionSilabo = { assessmentId: number; name: string; typeName: string; week: number; weight: number }`, `export type MatchRule = "exact" | "exact_other_name" | "week_shift" | "none"`, `export type EvaluacionEmparejada = EvaluacionUlima & { assessmentId: number | null; match: MatchRule }`, y en `emparejar.ts` `nombreBase(nombre: string): string`, `emparejarEvaluaciones(ulima: EvaluacionUlima[], silabo: EvaluacionSilabo[]): EvaluacionEmparejada[]` (mismo orden que `ulima`) y `silaboNoCoincide(emparejadas: EvaluacionEmparejada[], silabo: EvaluacionSilabo[]): boolean`. Las Tareas 13 y 18 los usan.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/emparejar.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import {
  emparejarEvaluaciones, nombreBase, silaboNoCoincide,
} from "../../src/modules/portal-sync/refresh/emparejar.js";
import type {
  EvaluacionEmparejada, EvaluacionSilabo, EvaluacionUlima,
} from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-54 · emparejamiento con el sílabo. Los patrones son los del hallazgo 5
 * de la spec, con nombres, semanas, pesos e ids inventados.
 */
const u = (key: string, name: string, week: number | null, weight: number): EvaluacionUlima =>
  ({ key, group: "EVC", name, week, weight, value: null, mark: "pending" });
const s = (assessmentId: number, name: string, week: number, weight: number, typeName = "Otro tipo"): EvaluacionSilabo =>
  ({ assessmentId, name, typeName, week, weight });
const parejas = (r: EvaluacionEmparejada[]) => r.map((e) => [e.key, e.assessmentId, e.match]);

describe("nombre base", () => {
  test("minúsculas, sin tildes, espacios colapsados y sin un ordinal final", () => {
    expect(nombreBase("Examen escrito 2")).toBe("examen escrito");
    expect(nombreBase("Trabajo de investigación N1")).toBe("trabajo de investigacion");
    expect(nombreBase("Control N° 3")).toBe("control");
    expect(nombreBase("Práctica calificada III")).toBe("practica calificada");
    expect(nombreBase("  Exposición   Final  ")).toBe("exposicion final");
    expect(nombreBase("Semana 100")).toBe("semana 100");
  });
});

describe("R1, exacta", () => {
  test("ordinal final contra el nombre sin ordinal del sílabo", () => {
    const r = emparejarEvaluaciones(
      [u("a", "Examen escrito 1", 3, 15), u("b", "Examen escrito 2", 8, 15), u("c", "Examen escrito 3", 13, 15)],
      [s(1, "Examen escrito", 3, 15), s(2, "Examen escrito", 8, 15), s(3, "Examen escrito", 13, 15)],
    );
    expect(parejas(r)).toEqual([["a", 1, "exact"], ["b", 2, "exact"], ["c", 3, "exact"]]);
  });

  test("ordinal con N y ordinal sin repetición", () => {
    const r = emparejarEvaluaciones(
      [u("a", "Trabajo de investigación N1", 5, 10), u("b", "Trabajo de investigación N2", 10, 10), u("c", "Exposición 1", 9, 20)],
      [s(1, "Trabajo de investigación", 5, 10), s(2, "Trabajo de investigación", 10, 10), s(3, "Exposición", 9, 20)],
    );
    expect(parejas(r)).toEqual([["a", 1, "exact"], ["b", 2, "exact"], ["c", 3, "exact"]]);
  });

  test("una sola candidata con otro nombre es exact_other_name", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Trabajo final", 15, 30)], [s(4, "Proyecto integrador", 15, 30)])))
      .toEqual([["a", 4, "exact_other_name"]]);
  });

  test("el nombre del tipo de evaluación también calza", () => {
    const r = emparejarEvaluaciones([u("a", "Examen parcial", 8, 25)], [s(9, "Evaluación intermedia", 8, 25, "Examen parcial")]);
    expect(parejas(r)).toEqual([["a", 9, "exact"]]);
  });

  test("dos candidatas en la misma semana las desempata el nombre", () => {
    const r = emparejarEvaluaciones(
      [u("a", "Control de lectura 2", 6, 10)],
      [s(1, "Laboratorio", 6, 10), s(2, "Control de lectura", 6, 10)],
    );
    expect(parejas(r)).toEqual([["a", 2, "exact"]]);
  });

  test("un empate sin salida queda none", () => {
    const r = emparejarEvaluaciones([u("a", "Evaluación", 6, 10)], [s(1, "Control", 6, 10), s(2, "Laboratorio", 6, 10)]);
    expect(parejas(r)).toEqual([["a", null, "none"]]);
  });

  test("el peso es condición dura, con 0,01 de tolerancia", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 20)], [s(1, "Examen", 5, 25)]))).toEqual([["a", null, "none"]]);
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 12.5)], [s(1, "Examen", 5, 12.51)]))).toEqual([["a", 1, "exact"]]);
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 12.5)], [s(1, "Examen", 5, 12.52)]))).toEqual([["a", null, "none"]]);
  });
});

describe("R2, semana corrida", () => {
  test("una semana de diferencia es week_shift, como la exposición del hallazgo 5", () => {
    expect(parejas(emparejarEvaluaciones([u("07.15", "Exposición", 10, 20)], [s(3, "Exposición", 11, 20)])))
      .toEqual([["07.15", 3, "week_shift"]]);
  });

  test("tres semanas de diferencia quedan none", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Examen", 5, 20)], [s(1, "Examen", 8, 20)]))).toEqual([["a", null, "none"]]);
  });

  test("el ordinal cuenta dentro del mismo nombre y no por posición en la lista", () => {
    const r = emparejarEvaluaciones(
      [u("p1", "Práctica 1", 4, 10), u("e1", "Examen 1", 6, 20), u("p2", "Práctica 2", 9, 10)],
      [s(1, "Práctica", 5, 10), s(2, "Examen", 7, 20), s(3, "Práctica", 10, 10)],
    );
    expect(parejas(r)).toEqual([["p1", 1, "week_shift"], ["e1", 2, "week_shift"], ["p2", 3, "week_shift"]]);
  });

  test("una evaluación de la ULima sin semana que R1 no empareja pasa directo a R3", () => {
    expect(parejas(emparejarEvaluaciones([u("a", "Participación", null, 10)], [s(1, "Participación", 1, 10)])))
      .toEqual([["a", null, "none"]]);
  });
});

describe("reglas generales", () => {
  test("una evaluación del sílabo se empareja a lo sumo una vez", () => {
    const r = emparejarEvaluaciones([u("a", "Examen 1", 6, 20), u("b", "Examen 2", 6, 20)], [s(1, "Examen", 6, 20)]);
    expect(parejas(r)).toEqual([["a", 1, "exact"], ["b", null, "none"]]);
  });

  test("un sílabo vacío deja todo en none y conserva los siete campos de cada evaluación", () => {
    const r = emparejarEvaluaciones([u("a", "Examen", 5, 20)], []);
    expect(r).toEqual([{ key: "a", group: "EVC", name: "Examen", week: 5, weight: 20, value: null, mark: "pending", assessmentId: null, match: "none" }]);
  });

  test("la guarda del curso salta con el sílabo vacío o con la mitad o más sin pareja", () => {
    const dos = [u("a", "Examen", 5, 20), u("b", "Proyecto", 15, 80)];
    expect(silaboNoCoincide(emparejarEvaluaciones(dos, []), [])).toBe(true);
    const silabo = [s(1, "Examen", 5, 20)];
    expect(silaboNoCoincide(emparejarEvaluaciones(dos, silabo), silabo)).toBe(true);
    const completo = [s(1, "Examen", 5, 20), s(2, "Proyecto", 15, 80)];
    expect(silaboNoCoincide(emparejarEvaluaciones(dos, completo), completo)).toBe(false);
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/emparejar.test.ts
```

Se espera un fallo al cargar, porque `refresh/emparejar.ts` no existe.

- [ ] **Paso 3. Sumar los tipos a `portal-sync.types.ts`**

```ts
/** RS-BE-54. Una evaluación del sílabo cargado en ULima++, candidata a pareja. */
export type EvaluacionSilabo = { assessmentId: number; name: string; typeName: string; week: number; weight: number };

/** RS-BE-54. Regla con la que una evaluación de la ULima encontró pareja. */
export type MatchRule = "exact" | "exact_other_name" | "week_shift" | "none";

/** RS-BE-54. Evaluación de la ULima con su pareja del sílabo, o sin ella. */
export type EvaluacionEmparejada = EvaluacionUlima & { assessmentId: number | null; match: MatchRule };
```

- [ ] **Paso 4. Implementar `refresh/emparejar.ts`**

```ts
import type {
  EvaluacionEmparejada, EvaluacionSilabo, EvaluacionUlima, MatchRule,
} from "../portal-sync.types.js";

/**
 * RS-BE-54 · emparejamiento de las evaluaciones de la ULima con las del sílabo
 * de la oferta del curso. Función pura. El llamador le pasa solo las
 * candidatas de UNA matrícula, así que nunca cruza de curso.
 *
 * El peso es condición dura en las dos reglas, porque un peso distinto quiere
 * decir que la ponderación oficial ya no es la del sílabo cargado, y emparejar
 * haría mentir al promedio de la calculadora.
 */

const TOLERANCIA_PESO = 0.01;
const CORRIMIENTO_MAXIMO = 2;
const ORDINAL_ARABIGO = /\s+(?:n\s*[°º.]?\s*)?\d{1,2}$/;
const ORDINAL_ROMANO = /\s+(?:i|ii|iii|iv|v|vi)$/;

/** Minúsculas, sin tildes, espacios colapsados y sin un ordinal final. */
export const nombreBase = (nombre: string): string => {
  const s = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const sinArabigo = s.replace(ORDINAL_ARABIGO, "");
  return (sinArabigo !== s ? sinArabigo : s.replace(ORDINAL_ROMANO, "")).trim();
};

const mismoPeso = (a: number, b: number): boolean => Math.abs(a - b) <= TOLERANCIA_PESO + 1e-9;

const calzaNombre = (base: string, c: EvaluacionSilabo): boolean =>
  nombreBase(c.name) === base || nombreBase(c.typeName) === base;

/** Por semana y, a igual semana, por posición original. */
const porSemana = (a: { semana: number; i: number }, b: { semana: number; i: number }): number =>
  a.semana - b.semana || a.i - b.i;

export const emparejarEvaluaciones = (
  ulima: EvaluacionUlima[], silabo: EvaluacionSilabo[],
): EvaluacionEmparejada[] => {
  const out: EvaluacionEmparejada[] = ulima.map((e) => ({ ...e, assessmentId: null, match: "none" }));
  const usadas = new Set<number>();
  const bases = ulima.map((e) => nombreBase(e.name));
  const emparejar = (i: number, j: number, match: MatchRule) => {
    usadas.add(j);
    out[i] = { ...ulima[i]!, assessmentId: silabo[j]!.assessmentId, match };
  };

  // R1, exacta. Misma semana y mismo peso. Con una sola candidata gana esa, y
  // con varias gana la única cuyo nombre base calce.
  ulima.forEach((e, i) => {
    if (e.week === null) return;
    const candidatas = silabo
      .map((c, j) => ({ c, j }))
      .filter(({ c, j }) => !usadas.has(j) && c.week === e.week && mismoPeso(c.weight, e.weight));
    if (candidatas.length === 1) {
      const { c, j } = candidatas[0]!;
      emparejar(i, j, calzaNombre(bases[i]!, c) ? "exact" : "exact_other_name");
      return;
    }
    const porNombre = candidatas.filter(({ c }) => calzaNombre(bases[i]!, c));
    if (porNombre.length === 1) emparejar(i, porNombre[0]!.j, "exact");
  });

  // R2, semana corrida. Lo que sobra, agrupado por nombre base y peso, se
  // ordena por semana en los dos lados, y la k-ésima se empareja con la
  // k-ésima si las semanas difieren en 2 o menos. El ordinal cuenta dentro del
  // mismo nombre, no por posición en la lista.
  const grupos = new Map<string, number[]>();
  ulima.forEach((e, i) => {
    if (out[i]!.match !== "none" || e.week === null) return;
    const clave = `${bases[i]}|${Math.round(e.weight * 100)}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), i]);
  });
  for (const indices of grupos.values()) {
    const base = bases[indices[0]!]!;
    const peso = ulima[indices[0]!]!.weight;
    const nuestras = indices.map((i) => ({ semana: ulima[i]!.week!, i })).sort(porSemana);
    const suyas = silabo
      .map((c, j) => ({ c, j }))
      .filter(({ c, j }) => !usadas.has(j) && mismoPeso(c.weight, peso) && calzaNombre(base, c))
      .map(({ c, j }) => ({ semana: c.week, i: j }))
      .sort(porSemana);
    for (let k = 0; k < Math.min(nuestras.length, suyas.length); k++) {
      if (Math.abs(nuestras[k]!.semana - suyas[k]!.semana) > CORRIMIENTO_MAXIMO) continue;
      emparejar(nuestras[k]!.i, suyas[k]!.i, "week_shift");
    }
  }

  // R3. Lo que queda ya está con assessmentId null y match none.
  return out;
};

/**
 * RS-BE-54, guarda del curso. Con el sílabo vacío o con la mitad o más de las
 * evaluaciones sin pareja, el servicio avisa SYLLABUS_MISMATCH y guarda igual.
 */
export const silaboNoCoincide = (emparejadas: EvaluacionEmparejada[], silabo: EvaluacionSilabo[]): boolean =>
  silabo.length === 0 || emparejadas.filter((e) => e.match === "none").length * 2 >= emparejadas.length;
```

La holgura de `1e-9` en `mismoPeso` existe porque `12.51 - 12.5` da `0.0099999…` en coma flotante y `12.52 - 12.5` da `0.0200000…`, y así el borde de 0,01 queda dentro sin aceptar 0,02.

- [ ] **Paso 5. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/emparejar.test.ts
```

Se esperan 15 pruebas en verde.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-08.log`. Se espera `0 fail`, `EXIT=0` y 15 pruebas más que en la Tarea 7.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/refresh/emparejar.ts src/modules/portal-sync/portal-sync.types.ts test/HU37_jeff/emparejar.test.ts && git commit -m "feat(recarga-portal): emparejamiento de las evaluaciones de la ULima con el sílabo (RS-BE-54)" -m "R1 empareja por semana y peso y desempata por nombre base, R2 empareja por semana corrida dentro del mismo nombre y peso, y R3 deja el resto sin pareja. El peso es condición dura, cada evaluación del sílabo se usa una vez y la guarda del curso salta con la mitad o más sin pareja."
```

---

### Tarea 9. Guarda de inicio de sesión en curso y tope de rechazos compartidos

**Archivos.**
- Crear `src/modules/portal-sync/portal-login-guard.ts`.
- Prueba `test/HU37_jeff/refresh.rate-limit.test.ts` (primera parte; la Tarea 10 suma la segunda).

**Interfaces.**
- Consume `HttpError`.
- Produce `export class PortalLoginGuard` con `constructor(now: () => number = Date.now)`, `tryStart(studentId: number, kind: "refresh" | "import"): boolean`, `finish(studentId: number, kind: "refresh" | "import"): void`, `rejectedLoginsWait(studentId: number): number | null` (minutos que faltan, o null si no hay bloqueo) y `recordRejectedLogin(studentId: number): void`, más `export const portalLoginGuard = new PortalLoginGuard()` (la instancia única que comparten la importación y la recarga), `export const refreshInProgress = (): HttpError` y `export const tooManyRejectedLogins = (minutos: number): HttpError`. Las Tareas 12, 18 y 19 los usan.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/refresh.rate-limit.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import {
  PortalLoginGuard, refreshInProgress, tooManyRejectedLogins,
} from "../../src/modules/portal-sync/portal-login-guard.js";

/**
 * RS-BE-50 · guarda de inicio de sesión en curso y tope de inicios de sesión
 * rechazados. Los dos viven en memoria, por alumno, y los comparten la recarga
 * y la importación con credentials, porque protegen la misma cuenta de miUlima.
 * Ids de alumno inventados.
 */

describe("RS-BE-50 · guarda de inicio de sesión en curso", () => {
  test("una segunda recarga del mismo alumno no entra hasta que la primera termina", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "refresh");
    expect(g.tryStart(42, "refresh")).toBe(true);
  });

  test("una importación con credentials en curso bloquea la recarga, y al revés", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "import")).toBe(true);
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(42, "import")).toBe(false);
  });

  test("entre dos importaciones rige lo de hoy, sin guarda entre ellas", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "import")).toBe(true);
    expect(g.tryStart(42, "import")).toBe(true);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(true);
  });

  test("la guarda es por alumno", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(43, "refresh")).toBe(true);
  });

  test("el 409 lleva el código y el mensaje fijo de la spec", () => {
    expect(refreshInProgress()).toMatchObject({
      statusCode: 409, code: "PORTAL_REFRESH_IN_PROGRESS",
      message: "Ya hay una lectura de miUlima en curso. Espera a que termine.",
    });
  });
});

describe("RS-BE-50 · tope de inicios de sesión rechazados", () => {
  test("tres rechazos en 15 minutos bloquean el cuarto intento por lo que falta de la ventana", () => {
    let t = 0;
    const g = new PortalLoginGuard(() => t);
    for (const minuto of [0, 1, 2]) {
      t = minuto * 60_000;
      expect(g.rejectedLoginsWait(42)).toBeNull();
      g.recordRejectedLogin(42);
    }
    t = 3 * 60_000;
    expect(g.rejectedLoginsWait(42)).toBe(12);
    t = 15 * 60_000 - 1;
    expect(g.rejectedLoginsWait(42)).toBe(1);
    t = 15 * 60_000 + 1;
    expect(g.rejectedLoginsWait(42)).toBeNull();
  });

  test("el contador es uno solo por alumno, lo sume la recarga o la importación", () => {
    const g = new PortalLoginGuard(() => 0);
    g.recordRejectedLogin(42);
    g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(42)).toBeNull();
    g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(42)).toBe(15);
  });

  test("el tope es por alumno", () => {
    const g = new PortalLoginGuard(() => 0);
    for (let i = 0; i < 3; i++) g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(43)).toBeNull();
  });

  test("el 429 lleva kind rejected_logins y el mensaje fijo de la spec", () => {
    expect(tooManyRejectedLogins(12)).toMatchObject({
      statusCode: 429, code: "RATE_LIMITED",
      message: "Demasiados intentos con datos rechazados. Intenta de nuevo en 12 minuto(s).",
      details: { retryAfterMinutes: 12, kind: "rejected_logins" },
    });
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.rate-limit.test.ts
```

Se espera un fallo al cargar, porque `portal-login-guard.ts` no existe.

- [ ] **Paso 3. Implementar `portal-login-guard.ts`**

```ts
import { HttpError } from "../../shared/errors/http-error.js";

/**
 * RS-BE-50 · guarda de inicio de sesión en curso y tope de rechazos.
 *
 * Los comparten POST /portal-sync/refresh y POST /portal-sync/import con
 * credentials, porque los dos inician sesión en la misma cuenta de miUlima.
 * Dos inicios casi simultáneos gastan el mismo código de un solo uso, y el
 * segundo se leería como un rechazo, y tres rechazos seguidos pueden bloquear
 * la cuenta del alumno en la Universidad.
 *
 * LÍMITE DEL MECANISMO. Vive en la memoria de cada instancia, como los
 * limitadores de `rate-limit.ts`, así que no es un límite global.
 */

const VENTANA_RECHAZOS_MS = 15 * 60 * 1000;
const TOPE_RECHAZOS = 3;

export type TipoInicioSesion = "refresh" | "import";

export const refreshInProgress = (): HttpError =>
  new HttpError(409, "Ya hay una lectura de miUlima en curso. Espera a que termine.", "PORTAL_REFRESH_IN_PROGRESS");

export const tooManyRejectedLogins = (minutos: number): HttpError =>
  new HttpError(
    429,
    `Demasiados intentos con datos rechazados. Intenta de nuevo en ${minutos} minuto(s).`,
    "RATE_LIMITED",
    { retryAfterMinutes: minutos, kind: "rejected_logins" },
  );

export class PortalLoginGuard {
  private readonly enCurso = new Map<number, Record<TipoInicioSesion, number>>();
  private readonly rechazos = new Map<number, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Marca un inicio de sesión en curso. La recarga no entra si hay cualquier
   * otro en curso, y la importación no entra si hay una recarga. Entre dos
   * importaciones rige lo de hoy.
   */
  tryStart(studentId: number, kind: TipoInicioSesion): boolean {
    const actual = this.enCurso.get(studentId) ?? { refresh: 0, import: 0 };
    if (actual.refresh > 0) return false;
    if (kind === "refresh" && actual.import > 0) return false;
    actual[kind]++;
    this.enCurso.set(studentId, actual);
    return true;
  }

  /** Suelta la marca. Va siempre en un `finally`, después del cierre de sesión. */
  finish(studentId: number, kind: TipoInicioSesion): void {
    const actual = this.enCurso.get(studentId);
    if (!actual) return;
    actual[kind] = Math.max(0, actual[kind] - 1);
    if (actual.refresh === 0 && actual.import === 0) this.enCurso.delete(studentId);
  }

  /** Minutos hasta que el alumno vuelva a tener menos de tres rechazos en la ventana, o null. */
  rejectedLoginsWait(studentId: number): number | null {
    const vigentes = this.vigentes(studentId);
    if (vigentes.length < TOPE_RECHAZOS) return null;
    const libre = vigentes[vigentes.length - TOPE_RECHAZOS]! + VENTANA_RECHAZOS_MS;
    return Math.max(1, Math.ceil((libre - this.now()) / 60_000));
  }

  /** Suma un PORTAL_LOGIN_REJECTED. Devolver el cupo por hora no lo borra. */
  recordRejectedLogin(studentId: number): void {
    this.rechazos.set(studentId, [...this.vigentes(studentId), this.now()]);
  }

  private vigentes(studentId: number): number[] {
    const desde = this.now() - VENTANA_RECHAZOS_MS;
    const vigentes = (this.rechazos.get(studentId) ?? []).filter((t) => t > desde);
    if (vigentes.length) this.rechazos.set(studentId, vigentes);
    else this.rechazos.delete(studentId);
    return vigentes;
  }
}

/** La instancia única que comparten la importación y la recarga (index.ts). */
export const portalLoginGuard = new PortalLoginGuard();
```

- [ ] **Paso 4. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.rate-limit.test.ts
```

Se esperan 9 pruebas en verde.

- [ ] **Paso 5. Build y suite completa en segundo plano** con `tarea-09.log`. Se espera `0 fail`, `EXIT=0` y 9 pruebas más que en la Tarea 8.

- [ ] **Paso 6. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/portal-login-guard.ts test/HU37_jeff/refresh.rate-limit.test.ts && git commit -m "feat(recarga-portal): guarda de inicio de sesión en curso y tope de rechazos compartidos (RS-BE-50)" -m "La guarda impide que una recarga y una importación con credentials del mismo alumno inicien sesión a la vez, y el tope bloquea el cuarto intento tras tres rechazos en 15 minutos. Los dos viven en memoria, por alumno, y los comparten las dos rutas."
```

---

### Tarea 10. Cupo propio de la recarga y `kind` en el `429` de la importación

**Archivos.**
- Modificar `src/shared/middleware/rate-limit.ts`.
- Pruebas `test/HU37_jeff/refresh.rate-limit.test.ts` (segunda parte) y `test/HU31_jeff/service.import.test.ts` (existe, casos nuevos del limitador de la importación).

**Interfaces.**
- Consume `WINDOW_MS`, `RateLimitEntry`, `portalStore`, `refundPortalQuota` y `PORTAL_MAX_PER_HOUR`, que ya existen en `rate-limit.ts`, y los errores de la Tarea 9.
- Produce `export const REFRESH_TRACE_KEY = "portalRefreshTrace"`, `export type RefreshTrace = { portalTocado: boolean }` y `export async function portalRefreshRateLimit(c: Context, next: Next)`. El limitador deja en el contexto un rastro que el servicio marca justo antes de iniciar sesión (Tarea 18) y que el controlador le pasa (Tarea 19). `portalSyncRateLimit` suma `kind: "quota"` a su `429` y devuelve el cupo también ante `PORTAL_REFRESH_IN_PROGRESS` y ante el `429` con `kind: "rejected_logins"`.

- [ ] **Paso 1. Escribir las pruebas que fallan**

Al comienzo de `test/HU37_jeff/refresh.rate-limit.test.ts`, después del import de `bun:test`, los imports nuevos.

```ts
import { Hono } from "hono";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { errorHandler } from "../../src/shared/middleware/error-handler.js";
import {
  REFRESH_TRACE_KEY, portalRefreshRateLimit, portalSyncRateLimit, type RefreshTrace,
} from "../../src/shared/middleware/rate-limit.js";
```

Al final del mismo archivo.

```ts
// ── Cupo propio de la recarga (limitador HTTP) ──────────────────────────────
// Los almacenes de rate-limit.ts son de módulo y los comparte todo el proceso
// de pruebas, así que cada caso usa su propio alumno, del rango 91xx.

type Guion = { tocaPortal: boolean; error?: HttpError };

/** App mínima con el limitador real. El guion dice si la recarga falsa tocó el portal y cómo terminó. */
const appRecarga = (studentId: number, guion: Guion) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("studentId" as never, studentId as never);
    await next();
  });
  app.post("/refresh", portalRefreshRateLimit, (c) => {
    const rastro = c.get(REFRESH_TRACE_KEY as never) as RefreshTrace;
    if (guion.tocaPortal) rastro.portalTocado = true;
    if (guion.error) throw guion.error;
    return c.json({ ok: true });
  });
  return app;
};

const appImportacion = (studentId: number) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("studentId" as never, studentId as never);
    await next();
  });
  app.post("/import", portalSyncRateLimit, (c) => c.json({ ok: true }));
  return app;
};

const post = (app: Hono, ruta = "/refresh") => app.request(ruta, { method: "POST" });

describe("RS-BE-50 · cupo propio de la recarga", () => {
  test("cinco recargas por hora, el sexto intento da 429 quota y cada respuesta lleva X-RateLimit-Remaining", async () => {
    const app = appRecarga(9101, { tocaPortal: true });
    const restantes: Array<string | null> = [];
    for (let i = 0; i < 5; i++) {
      const r = await post(app);
      expect(r.status).toBe(200);
      restantes.push(r.headers.get("X-RateLimit-Remaining"));
    }
    expect(restantes).toEqual(["4", "3", "2", "1", "0"]);
    const sexto = await post(app);
    expect(sexto.status).toBe(429);
    expect(sexto.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(await sexto.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas actualizaciones. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60, kind: "quota" },
      },
    });
  });

  test("lo que termina sin tocar el portal devuelve el cupo", async () => {
    const errores = [
      new HttpError(400, "Invalid request body", "INVALID_REQUEST_BODY"),
      new HttpError(409, "Primero carga tus datos del ciclo.", "IMPORT_REQUIRED"),
      new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE"),
      new HttpError(409, "Ya hay una lectura de miUlima en curso. Espera a que termine.", "PORTAL_REFRESH_IN_PROGRESS"),
      new HttpError(429, "Demasiados intentos con datos rechazados. Intenta de nuevo en 12 minuto(s).", "RATE_LIMITED", {
        retryAfterMinutes: 12, kind: "rejected_logins",
      }),
    ];
    for (const [i, error] of errores.entries()) {
      const app = appRecarga(9110 + i, { tocaPortal: false, error });
      for (let k = 0; k < 7; k++) {
        const r = await post(app);
        expect(r.status).toBe(error.statusCode);
        expect(r.headers.get("X-RateLimit-Remaining")).toBe("5");
      }
    }
  });

  test("un rechazo del portal devuelve el cupo aunque la recarga haya iniciado sesión", async () => {
    const error = new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED");
    const app = appRecarga(9120, { tocaPortal: true, error });
    for (let k = 0; k < 7; k++) expect((await post(app)).status).toBe(409);
  });

  test("el 409 IMPORT_REQUIRED por cambio de ciclo no devuelve el cupo", async () => {
    const error = new HttpError(409, "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.", "IMPORT_REQUIRED");
    const app = appRecarga(9121, { tocaPortal: true, error });
    for (let k = 0; k < 5; k++) expect((await post(app)).status).toBe(409);
    expect((await post(app)).status).toBe(429);
  });

  test("un 502 del portal tampoco devuelve el cupo", async () => {
    const error = new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");
    const app = appRecarga(9122, { tocaPortal: true, error });
    for (let k = 0; k < 5; k++) expect((await post(app)).status).toBe(502);
    expect((await post(app)).status).toBe(429);
  });

  test("el cupo de la recarga es aparte del de la importación", async () => {
    const importacion = appImportacion(9130);
    for (let k = 0; k < 5; k++) expect((await post(importacion, "/import")).status).toBe(200);
    expect((await post(importacion, "/import")).status).toBe(429);
    expect((await post(appRecarga(9130, { tocaPortal: true }))).status).toBe(200);
  });
});
```

Al comienzo de `test/HU31_jeff/service.import.test.ts`, los imports que faltan, y al final del archivo los casos del limitador de la importación.

```ts
import { Hono } from "hono";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { errorHandler } from "../../src/shared/middleware/error-handler.js";
import { portalSyncRateLimit } from "../../src/shared/middleware/rate-limit.js";
```

```ts
// ── RS-BE-50 (recarga-portal) · cupo de la importación ──────────────────────
// Alumnos del rango 92xx, porque el almacén del limitador es de módulo.

const appImportacionCon = (studentId: number, error?: HttpError) => {
  const app = new Hono();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("studentId" as never, studentId as never);
    await next();
  });
  app.post("/import", portalSyncRateLimit, (c) => {
    if (error) throw error;
    return c.json({ ok: true });
  });
  return app;
};
const importarHttp = (app: Hono) => app.request("/import", { method: "POST" });

describe("RS-BE-50 · cupo de la importación", () => {
  test("su 429 de cupo suma kind quota", async () => {
    const app = appImportacionCon(9201);
    for (let k = 0; k < 5; k++) expect((await importarHttp(app)).status).toBe(200);
    const sexto = await importarHttp(app);
    expect(sexto.status).toBe(429);
    expect(await sexto.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Demasiadas sincronizaciones. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60, kind: "quota" },
      },
    });
  });

  test("devuelve el cupo ante una recarga en curso y ante el tope de rechazos", async () => {
    const errores = [
      new HttpError(409, "Ya hay una lectura de miUlima en curso. Espera a que termine.", "PORTAL_REFRESH_IN_PROGRESS"),
      new HttpError(429, "Demasiados intentos con datos rechazados. Intenta de nuevo en 12 minuto(s).", "RATE_LIMITED", {
        retryAfterMinutes: 12, kind: "rejected_logins",
      }),
    ];
    for (const [i, error] of errores.entries()) {
      const app = appImportacionCon(9210 + i, error);
      for (let k = 0; k < 7; k++) expect((await importarHttp(app)).status).toBe(error.statusCode);
    }
  });

  test("sigue devolviéndolo ante PORTAL_LOGIN_REJECTED y no ante un 502", async () => {
    const rechazo = appImportacionCon(9220, new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED"));
    for (let k = 0; k < 7; k++) expect((await importarHttp(rechazo)).status).toBe(409);
    const caido = appImportacionCon(9221, new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"));
    for (let k = 0; k < 5; k++) expect((await importarHttp(caido)).status).toBe(502);
    expect((await importarHttp(caido)).status).toBe(429);
  });
});
```

- [ ] **Paso 2. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.rate-limit.test.ts test/HU31_jeff/service.import.test.ts
```

Se espera un fallo al enlazar `refresh.rate-limit.test.ts`, porque `portalRefreshRateLimit` y `REFRESH_TRACE_KEY` no existen, y en `service.import.test.ts` los dos primeros casos nuevos, porque el `429` todavía no lleva `kind` y la importación no devuelve el cupo ante esos dos errores.

- [ ] **Paso 3. Implementar en `rate-limit.ts`**

Después de `refundPortalQuota`, un lector del error de la respuesta.

```ts
/** Código y `details.kind` del error de una respuesta que ya armó el errorHandler. */
const errorDeRespuesta = async (res: Response): Promise<{ code?: string; kind?: string }> => {
  try {
    const cuerpo = await res.clone().json() as { error?: { code?: string; details?: { kind?: string } } };
    return { code: cuerpo?.error?.code, kind: cuerpo?.error?.details?.kind };
  } catch {
    // Cuerpo no JSON: no se devuelve cupo, que es el lado seguro.
    return {};
  }
};
```

En `portalSyncRateLimit`, el `429` de cupo suma `kind: "quota"`.

```ts
        details: { retryAfterMinutes: minutesLeft, kind: "quota" },
```

Y el bloque posterior a `await next();` se reemplaza entero.

```ts
  // El errorHandler global ya convirtió la excepción en respuesta, así que acá
  // se lee el código del cuerpo y no un throw. RS-BE-50. Se devuelve también
  // cuando la importación con credentials termina antes de llamar al portal,
  // por una recarga del mismo alumno en curso o por el tope de rechazos.
  if (c.res.status === 409 || c.res.status === 429) {
    const { code, kind } = await errorDeRespuesta(c.res);
    if (
      code === "PORTAL_LOGIN_REJECTED"
      || code === "PORTAL_REFRESH_IN_PROGRESS"
      || (code === "RATE_LIMITED" && kind === "rejected_logins")
    ) {
      refundPortalQuota(studentId);
    }
  }
```

La frase «Solo se devuelve por login rechazado.» del comentario de `refundPortalQuota` pasa a «Se devuelve por login rechazado y, desde RS-BE-50, cuando la importación con credentials termina antes de llamar al portal.».

Antes del bloque de `POST /auth/register`, el limitador nuevo.

```ts
// ── POST /portal-sync/refresh (RS-BE-50) ────────────────────────────────────
//
// Cupo PROPIO de 5 recargas por alumno por hora, separado del de la
// importación. Se descuenta antes de trabajar, igual que el de la importación,
// y se devuelve cuando la recarga termina sin haber enviado ninguna petición al
// portal, o ante un PORTAL_LOGIN_REJECTED, porque quien se equivoca al tipear
// su propio código no tiene por qué perder el cupo.
//
// Para saber si la recarga tocó el portal, el limitador deja en el contexto un
// rastro que el servicio marca justo antes de iniciar sesión. El código de
// error no alcanza, porque el 409 IMPORT_REQUIRED sale antes del portal (sin
// matrícula) y también después (cambio de ciclo), y solo el primero devuelve.
//
// Mismo límite del mecanismo que los de arriba: vive en la memoria de cada
// instancia y no es un límite global.

const refreshStore = new Map<number, RateLimitEntry>();
const REFRESH_MAX_PER_HOUR = 5;

/** Clave del rastro que el limitador de la recarga deja en el contexto. */
export const REFRESH_TRACE_KEY = "portalRefreshTrace";

/** Rastro de una recarga. `portalTocado` pasa a true justo antes de iniciar sesión. */
export type RefreshTrace = { portalTocado: boolean };

export async function portalRefreshRateLimit(c: Context, next: Next) {
  const studentId = c.get("studentId") as number | undefined;
  if (!studentId) return next();

  const now = Date.now();
  let cupo = refreshStore.get(studentId);
  if (!cupo || now > cupo.resetAt) {
    cupo = { count: 0, resetAt: now + WINDOW_MS };
    refreshStore.set(studentId, cupo);
  }
  if (cupo.count >= REFRESH_MAX_PER_HOUR) {
    const minutesLeft = Math.ceil((cupo.resetAt - now) / 60000);
    c.header("X-RateLimit-Remaining", "0");
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Demasiadas actualizaciones. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft, kind: "quota" },
      },
    }, 429);
  }
  // Se descuenta ANTES de trabajar, para que cinco recargas simultáneas no
  // pasen todas el chequeo antes de que ninguna sume.
  cupo.count++;
  const rastro: RefreshTrace = { portalTocado: false };
  c.set(REFRESH_TRACE_KEY, rastro);

  await next();

  if (c.res.status >= 400) {
    const { code } = await errorDeRespuesta(c.res);
    if ((!rastro.portalTocado || code === "PORTAL_LOGIN_REJECTED") && cupo.count > 0) cupo.count--;
  }
  // Después de la devolución, para que el número diga el cupo que de verdad queda.
  c.header("X-RateLimit-Remaining", String(Math.max(0, REFRESH_MAX_PER_HOUR - cupo.count)));
  return;
}
```

- [ ] **Paso 4. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.rate-limit.test.ts test/HU31_jeff/service.import.test.ts test/HU33_jeff/registro.rate-limit.test.ts
```

Se esperan en verde las 6 pruebas nuevas del limitador de la recarga, las 3 del de la importación y las del registro, que no cambian.

- [ ] **Paso 5. Build y suite completa en segundo plano** con `tarea-10.log`. Se espera `0 fail`, `EXIT=0` y 9 pruebas más que en la Tarea 9.

- [ ] **Paso 6. Commit**

```bash
cd "${REPO:?}" && git add src/shared/middleware/rate-limit.ts test/HU37_jeff/refresh.rate-limit.test.ts test/HU31_jeff/service.import.test.ts && git commit -m "feat(rate-limit): cupo propio de la recarga y kind en el 429 de la importación (RS-BE-50)" -m "portalRefreshRateLimit cuenta 5 recargas por alumno por hora aparte de la importación, deja un rastro que el servicio marca antes de iniciar sesión y devuelve el cupo cuando la recarga no tocó el portal o el portal rechazó los datos. El 429 de cupo de la importación suma kind quota, y la importación devuelve el cupo también ante una recarga en curso y ante el tope de rechazos."
```

---

### Tarea 11. La importación fija la hora de lectura de la asistencia con la guarda de lectura más reciente

**Archivos.**
- Modificar `src/modules/portal-sync/portal-sync.repository.ts` (`HorasAsistencia`, `sqlActualizarAsistencia` y `updateAttendanceHours`).
- Modificar `src/modules/portal-sync/portal-sync.service.ts` (fase de asistencia y escritura de las horas en `runImport`).
- Modificar `src/modules/portal-sync/portal-sync.types.ts` (comentario de `attendanceSkipped`).
- Pruebas `test/HU31_jeff/repository.asistencia.test.ts` y `test/HU31_jeff/service.asistencia.test.ts` (existen, casos nuevos y uno que cambia).

**Interfaces.**
- Consume `resolveAttendanceHours`, que no cambia.
- Produce `export type HorasAsistencia = { total: string; attended: string; absent: string }`, `export const sqlActualizarAsistencia = (enrollmentId: number, h: HorasAsistencia, leidaEn: string): SQL` y `PortalSyncRepository.updateAttendanceHours(tx: Tx, enrollmentId: number, h: HorasAsistencia, leidaEn: string): Promise<boolean>`. `leidaEn` es un texto ISO 8601. El mismo `UPDATE` escribe las tres horas y `portal_attendance_read_at`, y la guarda `(portal_attendance_read_at is null or portal_attendance_read_at < leidaEn)` va en el `WHERE`. La Tarea 13 reutiliza `sqlActualizarAsistencia`.

- [ ] **Paso 1. Escribir las pruebas que fallan**

En `test/HU31_jeff/repository.asistencia.test.ts`, después de los imports, el instante de ejemplo, y en `capturar` la llamada suma ese cuarto argumento.

```ts
/** RS-BE-58. Instante de ejemplo de la llegada de la página. */
const LEIDA = "2026-09-25T15:42:10.000Z";
```

```ts
    const ok = await repo.updateAttendanceHours(tx, 42, {
      total: "64.00", attended: "8.00", absent: "0.00",
    }, LEIDA);
```

Al final del `describe("updateAttendanceHours: el UPDATE", …)`, dos casos.

```ts
  test("fija portal_attendance_read_at en la misma sentencia, como texto con ::timestamptz (RS-BE-58)", async () => {
    const { sql, consultas } = await capturar();
    expect(sql).toMatch(/portal_attendance_read_at\s*=\s*\$\d+::timestamptz/);
    const { params } = new PgDialect().sqlToQuery(consultas[0]!);
    expect(params).toContain(LEIDA);
    expect(params.some((p) => p instanceof Date)).toBe(false);
  });

  test("la guarda de lectura más reciente va en el WHERE (RS-BE-55)", async () => {
    const { sql } = await capturar();
    expect(sql).toMatch(/\(portal_attendance_read_at is null or portal_attendance_read_at < \$\d+::timestamptz\)/);
  });
```

En `test/HU31_jeff/service.asistencia.test.ts`, el caso «si el UPDATE no toca ninguna fila, se cuenta como omitida» se reemplaza entero por estos tres.

```ts
  test("si la guarda de lectura más reciente no deja tocar la fila, cuenta como actualizada (RS-BE-55)", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const repo = fakeRepo(escrituras, {
      updateAttendanceHours: async () => false,
    } as Partial<PortalSyncRepository>);
    const res = await importar(repo, fakeClient());

    expect(res.summary.attendanceUpdated).toBeGreaterThan(0);
    expect(res.summary.attendanceSkipped).toBe(0);
  });

  test("unos totales que no cuadran cuentan como omitidos y no llegan al UPDATE", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const base = fakeClient();
    const leer = base.fetchPage as unknown as (p: string, c: unknown) => Promise<string>;
    const cliente = {
      ...base,
      fetchPage: async (path: string, c: unknown) => {
        const html = await leer(path, c);
        // Sin horas programadas, resolveAttendanceHours rechaza el triple.
        return path.startsWith(RUTA) ? html.replace('<strong class="textos">64</strong>', '<strong class="textos">0</strong>') : html;
      },
    } as unknown as PortalClient;
    const res = await importar(fakeRepo(escrituras), cliente);

    expect(escrituras).toHaveLength(0);
    expect(res.summary.attendanceUpdated).toBe(0);
    expect(res.summary.attendanceSkipped).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.block === "asistencia" && w.message.includes("el portal no reporta horas programadas"))).toBe(true);
  });

  test("la hora de lectura es el instante en que llega la página, como texto ISO 8601 (RS-BE-58)", async () => {
    const llegadas: number[] = [];
    const base = fakeClient();
    const leer = base.fetchPage as unknown as (p: string, c: unknown) => Promise<string>;
    const cliente = {
      ...base,
      fetchPage: async (path: string, c: unknown) => {
        const html = await leer(path, c);
        if (path.startsWith(RUTA)) llegadas.push(Date.now());
        return html;
      },
    } as unknown as PortalClient;
    const horas: string[] = [];
    const escrituras: { id: number; h: unknown }[] = [];
    const repo = fakeRepo(escrituras, {
      updateAttendanceHours: async (_tx: unknown, _id: number, _h: unknown, leidaEn: string) => {
        horas.push(leidaEn);
        return true;
      },
    } as unknown as Partial<PortalSyncRepository>);
    await importar(repo, cliente);
    const despues = Date.now();

    expect(horas.length).toBeGreaterThan(0);
    for (const h of horas) {
      expect(h).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Date.parse(h)).toBeGreaterThanOrEqual(Math.min(...llegadas));
      expect(Date.parse(h)).toBeLessThanOrEqual(despues);
    }
  });
```

- [ ] **Paso 2. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/repository.asistencia.test.ts test/HU31_jeff/service.asistencia.test.ts
```

Se espera que fallen los dos casos nuevos del repositorio (el `UPDATE` no escribe la hora ni trae la guarda), el de la guarda en la importación (hoy cuenta como omitida) y el de la hora de lectura (hoy no se pasa). El de los totales que no cuadran ya pasa, y queda para fijar el criterio.

- [ ] **Paso 3. Implementar en `portal-sync.repository.ts`**

Justo antes de `export class PortalSyncRepository`, el tipo y la sentencia compartida.

```ts
/** RS-BE-15. Las tres horas de una matrícula, ya validadas por `resolveAttendanceHours`. */
export type HorasAsistencia = { total: string; attended: string; absent: string };

/**
 * RS-BE-15, RS-BE-55 y RS-BE-58. El UPDATE de las horas de UNA matrícula, que
 * comparten la importación y la recarga.
 *
 * UNA sola sentencia con las tres columnas: escribir `attended` por separado,
 * con `total` todavía en el DEFAULT '0', violaría el CHECK al cerrar ese
 * statement. El WHERE repite la condición del CHECK como cinturón.
 *
 * Fija además `portal_attendance_read_at` con el instante en que llegó la
 * página, y la guarda de lectura más reciente deja fuera una lectura más vieja
 * que la guardada, así que un UPDATE que no toca la fila quiere decir que la
 * fila ya tiene horas más nuevas. El instante viaja como texto ISO 8601 con
 * `::timestamptz`, nunca como `Date`, que postgres.js rechaza al preparar.
 */
export const sqlActualizarAsistencia = (enrollmentId: number, h: HorasAsistencia, leidaEn: string) => sql`
  update enrollment
     set total_hours    = ${h.total}::numeric,
         attended_hours = ${h.attended}::numeric,
         absent_hours   = ${h.absent}::numeric,
         portal_attendance_read_at = ${leidaEn}::timestamptz
   where id = ${enrollmentId}
     and ${h.total}::numeric > 0
     and ${h.attended}::numeric >= 0
     and ${h.absent}::numeric >= 0
     and ${h.attended}::numeric + ${h.absent}::numeric <= ${h.total}::numeric
     and (portal_attendance_read_at is null or portal_attendance_read_at < ${leidaEn}::timestamptz)
  returning id
`;
```

`updateAttendanceHours` pasa a usarla.

```ts
  /**
   * RS-BE-15 y RS-BE-58. Escribe las tres horas de asistencia de UNA matrícula
   * y la hora de su lectura (ver `sqlActualizarAsistencia`).
   *
   * Es ASIGNACIÓN, no `greatest` ni acumulación: el portal publica el acumulado
   * a la fecha y el docente puede corregir una marca, así que este es el único
   * upsert del módulo que debe poder BAJAR. La idempotencia sale gratis.
   */
  async updateAttendanceHours(
    tx: Tx,
    enrollmentId: number,
    h: HorasAsistencia,
    leidaEn: string,
  ): Promise<boolean> {
    const filas = (await tx.execute(sqlActualizarAsistencia(enrollmentId, h, leidaEn))) as unknown as Array<unknown>;
    return filas.length > 0;
  }
```

- [ ] **Paso 4. Implementar en `portal-sync.service.ts`**

En la fase de asistencia de `runImport` (la sección «3.6», que ya corre antes que la de delegados desde RS-BE-48), tres cambios. Si el texto de `main` difiere del citado, el cambio se aplica sobre su equivalente.

El mapa guarda también el instante de cada página.

```ts
    const asistenciaByCourse = new Map<string, { datos: AsistenciaCurso; leidaEn: Date }>();
```

Justo después del `try { html = await this.client.fetchPage(PORTAL_PATHS.asistenciaAlumno(a.aula), cookies); } catch { … }` del aula.

```ts
          // RS-BE-58. El instante en que llega la respuesta, no el del UPDATE,
          // que ocurre recién dentro de la transacción.
          const leidaEn = new Date();
```

Y el `set` del mapa pasa a

```ts
          asistenciaByCourse.set(`${parsed.data.courseCode}|${parsed.data.sectionCode}`, { datos: parsed.data, leidaEn });
```

Dentro de la transacción, el bloque `if (asis) { … }` de las horas se reemplaza entero.

```ts
        const asis = asistenciaByCourse.get(`${row.courseCode}|${row.sectionCode}`);
        if (asis) {
          const horas = resolveAttendanceHours(asis.datos);
          if (!horas.ok) {
            summary.attendanceSkipped++;
            warnings.push({
              code: "PARSER_FAILED", block: "asistencia",
              message: `No se escribió la asistencia de ${row.courseCode}/${row.sectionCode}: ${horas.reason}.`,
            });
          } else {
            // RS-BE-55 y RS-BE-58. `resolveAttendanceHours` ya cubre el CHECK
            // replicado en el WHERE, así que un UPDATE que no toca la fila solo
            // se debe a la guarda de lectura más reciente. Esa fila ya tiene
            // horas más nuevas y cuenta como actualizada (decisión 5).
            await this.repository.updateAttendanceHours(tx, enr.id, horas.hours, asis.leidaEn.toISOString());
            summary.attendanceUpdated++;
          }
        }
```

- [ ] **Paso 5. Ajustar el comentario de `attendanceSkipped` en `portal-sync.types.ts`**

```ts
  /** Matrículas con asistencia disponible cuyos totales no cuadran, que no se
   *  escriben (RS-BE-55). Una fila que salta la guarda de lectura más reciente
   *  cuenta en `attendanceUpdated`, porque ya tiene horas más nuevas. Se cuenta
   *  para que "0 actualizadas" se distinga de "el portal no reportó nada". */
  attendanceSkipped: number;
```

- [ ] **Paso 6. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/repository.asistencia.test.ts test/HU31_jeff/service.asistencia.test.ts test/HU31_jeff/service.delegados.test.ts
```

Se espera todo en verde, con 4 pruebas más en total (dos del repositorio, y en el servicio tres nuevas en lugar de una).

- [ ] **Paso 7. Build y suite completa en segundo plano** con `tarea-11.log`. Se espera `0 fail`, `EXIT=0` y 4 pruebas más que en la Tarea 10.

- [ ] **Paso 8. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/portal-sync.repository.ts src/modules/portal-sync/portal-sync.service.ts src/modules/portal-sync/portal-sync.types.ts test/HU31_jeff/repository.asistencia.test.ts test/HU31_jeff/service.asistencia.test.ts && git commit -m "feat(portal-sync): la importación fija la hora de lectura de la asistencia con la guarda de lectura más reciente (RS-BE-55, RS-BE-58)" -m "El UPDATE de las horas, ahora compartido con la recarga, escribe portal_attendance_read_at con el instante en que llegó la página y no toca una fila que ya tiene una lectura más nueva. Esa fila cuenta en attendanceUpdated, y attendanceSkipped queda para los totales que no cuadran."
```

---

### Tarea 12. La importación con `credentials` respeta la guarda, el tope de rechazos y el ciclo de `layout.jsp`

**Archivos.**
- Modificar `src/modules/portal-sync/portal-sync.service.ts` (constructor, `importFromPortal` y la llamada a `parseAsistenciaCurso`).
- Modificar `src/modules/portal-sync/index.ts` (la instancia única de la guarda).
- Pruebas `test/HU31_jeff/service.import.test.ts` y `test/HU31_jeff/service.asistencia.test.ts` (existen, casos nuevos).

**Interfaces.**
- Consume `PortalLoginGuard`, `portalLoginGuard`, `refreshInProgress` y `tooManyRejectedLogins` (Tarea 9), y el cuarto parámetro de `parseAsistenciaCurso` (Tarea 5).
- Produce `new PortalSyncService(repository, client, auth?, guard: PortalLoginGuard = new PortalLoginGuard())`. Con `credentials`, después de leer `app_user.code`, la importación marca la guarda (`409 PORTAL_REFRESH_IN_PROGRESS` si hay una recarga en curso), revisa el tope (`429` con `kind: "rejected_logins"`), inicia sesión y suma al tope un `PORTAL_LOGIN_REJECTED`, y suelta la guarda después del cierre de sesión. Con `cookies` no hace nada de eso. La fase de asistencia pasa `ciclo.data.periodCode` como ciclo esperado.

- [ ] **Paso 1. Escribir las pruebas que fallan**

Al comienzo de `test/HU31_jeff/service.import.test.ts`, el import de la guarda.

```ts
import { PortalLoginGuard } from "../../src/modules/portal-sync/portal-login-guard.js";
```

Al final del mismo archivo.

```ts
// ── RS-BE-50 (recarga-portal) · guarda y tope compartidos ───────────────────

describe("RS-BE-50 · la importación con credentials comparte la guarda y el tope con la recarga", () => {
  const conCredenciales = { credentials: { password: "clave-sintetica", passcode: "123456" } };
  const rechazo = () => new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED");

  test("tras tres rechazos, responde 429 rejected_logins sin llamar a login y suelta la guarda", async () => {
    const guard = new PortalLoginGuard();
    for (let i = 0; i < 3; i++) guard.recordRejectedLogin(7);
    let logins = 0;
    const svc = new PortalSyncService(
      fakeRepo(), fakeClient({ login: async () => { logins++; return cookies; } }), undefined, guard,
    );
    const err = await svc.importFromPortal(3, 7, conCredenciales).catch((e) => e);
    expect(err).toMatchObject({
      statusCode: 429, code: "RATE_LIMITED", details: { retryAfterMinutes: 15, kind: "rejected_logins" },
    });
    expect(logins).toBe(0);
    expect(guard.tryStart(7, "refresh")).toBe(true);
  });

  test("un PORTAL_LOGIN_REJECTED de la importación suma al tope compartido", async () => {
    const guard = new PortalLoginGuard();
    const svc = new PortalSyncService(fakeRepo(), fakeClient({ login: async () => { throw rechazo(); } }), undefined, guard);
    for (let i = 0; i < 3; i++) await svc.importFromPortal(3, 7, conCredenciales).catch(() => null);
    expect(guard.rejectedLoginsWait(7)).not.toBeNull();
    expect(guard.tryStart(7, "refresh")).toBe(true);
  });

  test("la importación con cookies no revisa el tope", async () => {
    const guard = new PortalLoginGuard();
    for (let i = 0; i < 3; i++) guard.recordRejectedLogin(7);
    const svc = new PortalSyncService(fakeRepo(), fakeClient(), undefined, guard);
    const res = await svc.importFromPortal(3, 7, { cookies });
    expect(res.period.code).toBe("2026-2");
  });

  test("con una recarga en curso responde 409 PORTAL_REFRESH_IN_PROGRESS sin llamar a login", async () => {
    const guard = new PortalLoginGuard();
    guard.tryStart(7, "refresh");
    let logins = 0;
    const svc = new PortalSyncService(
      fakeRepo(), fakeClient({ login: async () => { logins++; return cookies; } }), undefined, guard,
    );
    await expect(svc.importFromPortal(3, 7, conCredenciales)).rejects.toMatchObject({
      statusCode: 409, code: "PORTAL_REFRESH_IN_PROGRESS",
    });
    expect(logins).toBe(0);
  });

  test("mientras corre marca la guarda, y al terminar la suelta", async () => {
    const guard = new PortalLoginGuard();
    let durante: boolean | null = null;
    const svc = new PortalSyncService(
      fakeRepo(),
      fakeClient({ login: async () => { durante = guard.tryStart(7, "refresh"); return cookies; } }),
      undefined,
      guard,
    );
    await svc.importFromPortal(3, 7, conCredenciales);
    expect(durante).toBe(false);
    expect(guard.tryStart(7, "refresh")).toBe(true);
  });
});
```

Al final de `test/HU31_jeff/service.asistencia.test.ts`.

```ts
// ── RS-BE-51 (recarga-portal) · ciclo esperado en la importación ────────────

describe("la importación pasa el ciclo de layout.jsp como ciclo esperado", () => {
  test("una página de otro ciclo es un aviso de ese curso y la importación sigue", async () => {
    const normal: { id: number; h: unknown }[] = [];
    const referencia = await importar(fakeRepo(normal), fakeClient());

    const escrituras: { id: number; h: unknown }[] = [];
    const base = fakeClient();
    const leer = base.fetchPage as unknown as (p: string, c: unknown) => Promise<string>;
    const cliente = {
      ...base,
      fetchPage: async (path: string, c: unknown) => {
        const html = await leer(path, c);
        return path === `${RUTA}154508`
          ? html.replace(/(name="prm_sNuCicl"[^>]*value=")[^"]*/i, (_t, pre: string) => `${pre}1`)
          : html;
      },
    } as unknown as PortalClient;
    const res = await importar(fakeRepo(escrituras), cliente);

    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia de 650033/952: la página es de otro ciclo",
    });
    expect(res.summary.attendanceUpdated).toBe(referencia.summary.attendanceUpdated - 1);
    expect(res.period.code).toBe("2026-2");
  });
});
```

- [ ] **Paso 2. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/service.import.test.ts test/HU31_jeff/service.asistencia.test.ts
```

Se espera que fallen los casos del tope, de la recarga en curso y de la guarda (el servicio ignora el cuarto argumento del constructor) y el del ciclo (la importación no pasa el ciclo esperado). El de las cookies ya pasa.

- [ ] **Paso 3. Implementar en `portal-sync.service.ts`**

Los imports suman la guarda.

```ts
import {
  PortalLoginGuard, refreshInProgress, tooManyRejectedLogins,
} from "./portal-login-guard.js";
```

El constructor suma el cuarto parámetro después de `auth?`.

```ts
    /**
     * RS-BE-50. Guarda de inicio de sesión en curso y tope de rechazos, que
     * comparte con la recarga. `index.ts` pasa la instancia única, y sin ella
     * (las pruebas) cada servicio lleva la suya.
     */
    private readonly guard: PortalLoginGuard = new PortalLoginGuard(),
```

En `importFromPortal`, desde `let cookies = entrada.cookies;` hasta el `finally` inclusive, el cuerpo se reemplaza por este.

```ts
    let cookies = entrada.cookies;
    // RS-BE-50. Solo la variante con credentials inicia sesión, así que solo
    // ella marca la guarda y revisa el tope de rechazos.
    const conGuarda = !cookies;
    if (!cookies) cookies = await this.iniciarSesion(userId, studentId, entrada.credentials!);
    const sesion = cookies;
    try {
      return await this.runImport(userId, studentId, sesion, entrada.consent === true, provision, validate);
    } finally {
      await this.client.logout(sesion);   // best effort, siempre
      if (conGuarda) this.guard.finish(studentId, "import");
    }
```

Justo después de `importFromPortal`, el método que inicia la sesión.

```ts
  /**
   * Inicio de sesión de la variante con credentials. El usuario del portal NO
   * viene del cliente: sale de `app_user.code`. La contraseña y el passcode se
   * usan solo acá y se descartan.
   *
   * RS-BE-50. La guarda va antes del tope, y con una recarga del mismo alumno
   * en curso responde 409 sin llamar al portal. Entre dos importaciones rige lo
   * de hoy. La guarda la suelta `importFromPortal` después del cierre de
   * sesión, y este método la suelta solo si no llega a haber sesión.
   */
  private async iniciarSesion(
    userId: number, studentId: number, creds: { password: string; passcode: string },
  ): Promise<PortalCookies> {
    const userCode = await this.repository.findUserCode(userId);
    if (!userCode) {
      throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
    }
    if (!this.guard.tryStart(studentId, "import")) throw refreshInProgress();
    try {
      const espera = this.guard.rejectedLoginsWait(studentId);
      if (espera !== null) throw tooManyRejectedLogins(espera);
      // Si esto lanza, no hay sesión que cerrar: el cliente ya cerró la que el
      // portal haya abierto a medias (RS-BE-60).
      return await this.client.login(userCode, creds.password, creds.passcode);
    } catch (e) {
      if (e instanceof HttpError && e.code === "PORTAL_LOGIN_REJECTED") this.guard.recordRejectedLogin(studentId);
      this.guard.finish(studentId, "import");
      throw e;
    }
  }
```

En la fase de asistencia, la llamada al lector pasa el ciclo que la importación acaba de leer.

```ts
          // RS-BE-51, punto 3. El ciclo de layout.jsp. Una página de otro ciclo
          // es un aviso de ese curso y no aborta la importación.
          const parsed = parseAsistenciaCurso(html, a.aula, userCode, ciclo.data.periodCode);
```

- [ ] **Paso 4. Pasar la instancia única en `portal-sync/index.ts`**

```ts
import { portalLoginGuard } from "./portal-login-guard.js";
```

```ts
const portalSyncService = new PortalSyncService(portalSyncRepository, portalClient, authService, portalLoginGuard);
```

- [ ] **Paso 5. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU31_jeff/service.import.test.ts test/HU31_jeff/service.asistencia.test.ts test/HU31_jeff/service.delegados.test.ts test/HU33_jeff
```

Se espera todo en verde, con 6 pruebas nuevas. Las del registro (`test/HU33_jeff`) no cambian, porque el registro inicia sesión por su cuenta y llama a la importación con `cookies`.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-12.log`. Se espera `0 fail`, `EXIT=0` y 6 pruebas más que en la Tarea 11.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/portal-sync.service.ts src/modules/portal-sync/index.ts test/HU31_jeff/service.import.test.ts test/HU31_jeff/service.asistencia.test.ts && git commit -m "feat(portal-sync): la importación con credentials respeta la guarda, el tope de rechazos y el ciclo de layout.jsp (RS-BE-50, RS-BE-51)" -m "Con credentials, la importación marca la guarda que comparte con la recarga, responde 409 si hay una recarga en curso y 429 rejected_logins tras tres rechazos, suma al tope sus propios rechazos y suelta la guarda después del cierre de sesión. La fase de asistencia pasa el ciclo de layout.jsp, y una página de otro ciclo queda como aviso de ese curso."
```

---

### Tarea 13. Repositorio de la recarga

**Archivos.**
- Crear `src/modules/portal-sync/refresh/refresh.types.ts` (primeros tipos; la Tarea 16 suma el resto).
- Crear `src/modules/portal-sync/refresh/refresh.repository.ts`.
- Prueba `test/HU37_jeff/refresh.repository.test.ts`.

**Interfaces.**
- Consume `sqlActualizarAsistencia`, `HorasAsistencia` y `Tx` (Tarea 11 y `portal-sync.repository.ts`), `EvaluacionSilabo` y `EvaluacionEmparejada` (Tarea 8) y la tabla de la Tarea 1.
- Produce en `refresh.types.ts` `export type MatriculaActiva = { enrollmentId: number; sectionId: number; courseCode: string; sectionCode: string; courseName: string }` y `export type ContextoRecarga = { period: { id: number; code: string } | null; matriculas: MatriculaActiva[] }`, y la clase `PortalRefreshRepository` con `constructor(database: typeof db)`, `runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`, `findUserCode(userId): Promise<string | null>`, `findRefreshContext(studentId): Promise<ContextoRecarga>`, `findSyllabusCandidates(enrollmentId): Promise<EvaluacionSilabo[]>`, `lockRefresh(tx, studentId): Promise<void>`, `updateAttendanceHours(tx, enrollmentId, h: HorasAsistencia, leidaEn: string): Promise<boolean>`, `markGradesRead(tx, enrollmentId, leidaEn: string): Promise<boolean>` (true solo si la hora avanza) y `replacePortalScores(tx, enrollmentId, filas: EvaluacionEmparejada[]): Promise<void>` (lanza si alguna pareja no pertenece a la oferta de la matrícula). La Tarea 18 usa todos.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/refresh.repository.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { parseDetalleEvaluaciones } from "../../src/modules/portal-sync/parsers/nota.js";
import { emparejarEvaluaciones } from "../../src/modules/portal-sync/refresh/emparejar.js";
import { PortalRefreshRepository } from "../../src/modules/portal-sync/refresh/refresh.repository.js";
import type { EvaluacionEmparejada } from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-54 y RS-BE-55 · repositorio de la recarga, sin base. Una base falsa
 * anota cada sentencia ya renderizada por Drizzle y contesta con filas
 * inventadas. La prueba contra un PostgreSQL de verdad es
 * refresh.postgres.test.ts (Tarea 21), que solo corre con TEST_DATABASE_URL.
 */
type Consulta = { sql: string; params: unknown[] };
const dialecto = new PgDialect();
const plano = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const baseFalsa = (responder: (sql: string, params: unknown[]) => unknown[] = () => []) => {
  const consultas: Consulta[] = [];
  const execute = async (q: SQL) => {
    const { sql, params } = dialecto.sqlToQuery(q);
    consultas.push({ sql: plano(sql), params });
    return responder(plano(sql), params);
  };
  const db = { execute, transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ execute }) };
  return { repo: new PortalRefreshRepository(db as never), tx: { execute } as never, consultas };
};

const LEIDA = "2026-09-25T15:42:10.000Z";
const fila = (over: Partial<EvaluacionEmparejada> = {}): EvaluacionEmparejada => ({
  key: "07.13", group: "EVC", name: "Examen escrito 1", week: 3, weight: 15, value: 14.5,
  mark: "graded", assessmentId: 5011, match: "exact", ...over,
});

describe("lecturas de la recarga", () => {
  test("sin período activo no busca matrículas", async () => {
    const { repo, consultas } = baseFalsa();
    expect(await repo.findRefreshContext(42)).toEqual({ period: null, matriculas: [] });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]!.sql).toContain("from academic_period where is_active = true");
  });

  test("con período activo trae solo las matrículas activas del alumno en él", async () => {
    const { repo, consultas } = baseFalsa((sql) => (sql.includes("from academic_period")
      ? [{ id: 2, code: "2026-2" }]
      : [{ enrollment_id: 501, section_id: 81, section_code: "812", course_code: "690417", course_name: "TALLER DE PROTOTIPADO" }]));
    expect(await repo.findRefreshContext(42)).toEqual({
      period: { id: 2, code: "2026-2" },
      matriculas: [{ enrollmentId: 501, sectionId: 81, courseCode: "690417", sectionCode: "812", courseName: "TALLER DE PROTOTIPADO" }],
    });
    const matriculas = consultas[1]!;
    expect(matriculas.sql).toContain("e.student_id = $1");
    expect(matriculas.sql).toContain("e.status = 'active'");
    expect(matriculas.sql).toContain("co.academic_period_id = $2");
    expect(matriculas.params).toEqual([42, 2]);
  });

  test("el código del alumno sale de app_user", async () => {
    const { repo, consultas } = baseFalsa(() => [{ code: "20230001" }]);
    expect(await repo.findUserCode(7)).toBe("20230001");
    expect(consultas[0]!.sql).toContain("from app_user where id = $1");
  });

  test("las candidatas salen de la cadena de la matrícula hasta assessment, sin juntar cursos", async () => {
    const { repo, consultas } = baseFalsa(() => [
      { assessment_id: 5011, name: "Examen escrito", type_name: "Examen", week_number: 3, weight: "15.00" },
    ]);
    expect(await repo.findSyllabusCandidates(501)).toEqual([
      { assessmentId: 5011, name: "Examen escrito", typeName: "Examen", week: 3, weight: 15 },
    ]);
    const { sql, params } = consultas[0]!;
    for (const tramo of [
      "from enrollment e",
      "join section s on s.id = e.section_id",
      "join course_offering co on co.id = s.course_offering_id",
      "join syllabus sy on sy.course_offering_id = co.id",
      "join assessment a on a.syllabus_id = sy.id",
      "join assessment_type at on at.id = a.assessment_type_id",
      "where e.id = $1",
    ]) expect(sql).toContain(tramo);
    expect(params).toEqual([501]);
  });
});

describe("escrituras de la recarga (RS-BE-55)", () => {
  test("el candado es de transacción, con su propio espacio de nombres", async () => {
    const { repo, tx, consultas } = baseFalsa();
    await repo.lockRefresh(tx, 42);
    expect(consultas[0]).toEqual({
      sql: "select pg_advisory_xact_lock(hashtext('portal-refresh'), $1::int)", params: [42],
    });
  });

  test("la asistencia usa el UPDATE de la importación, con la hora y la guarda", async () => {
    const { repo, tx, consultas } = baseFalsa(() => [{ id: 501 }]);
    expect(await repo.updateAttendanceHours(tx, 501, { total: "48.00", attended: "4.00", absent: "2.00" }, LEIDA)).toBe(true);
    expect(consultas[0]!.sql).toContain("portal_attendance_read_at = $");
    expect(consultas[0]!.sql).toContain("(portal_attendance_read_at is null or portal_attendance_read_at < $");
    expect(consultas[0]!.params).toContain(LEIDA);
  });

  test("la hora de las notas solo avanza", async () => {
    const tocada = baseFalsa(() => [{ id: 501 }]);
    expect(await tocada.repo.markGradesRead(tocada.tx, 501, LEIDA)).toBe(true);
    expect(tocada.consultas[0]).toEqual({
      sql: "update enrollment set portal_grades_read_at = $1::timestamptz where id = $2 and (portal_grades_read_at is null or portal_grades_read_at < $3::timestamptz) returning id",
      params: [LEIDA, 501, LEIDA],
    });
    const saltada = baseFalsa(() => []);
    expect(await saltada.repo.markGradesRead(saltada.tx, 501, LEIDA)).toBe(false);
  });

  test("reemplazar borra todas las filas de la matrícula y las inserta atadas a su oferta", async () => {
    const filas = [
      fila(),
      fila({ key: "07.20", name: "Participación", week: null, weight: 85, value: null, mark: "pending", assessmentId: null, match: "none" }),
    ];
    const { repo, tx, consultas } = baseFalsa((sql) => (sql.startsWith("insert") ? [{ id: 1 }, { id: 2 }] : []));
    await repo.replacePortalScores(tx, 501, filas);
    expect(consultas[0]).toEqual({ sql: "delete from student_portal_score where enrollment_id = $1", params: [501] });
    const insercion = consultas[1]!;
    for (const tramo of [
      "insert into student_portal_score (enrollment_id, portal_key, group_name, name, week_number, weight, value, mark, assessment_id, match_rule)",
      "from json_to_recordset($",
      "where f.assessment_id is null or exists (",
      "join section s on s.id = e.section_id",
      "join course_offering co on co.id = s.course_offering_id",
      "join syllabus sy on sy.course_offering_id = co.id",
      "join assessment a on a.syllabus_id = sy.id",
      "a.id = f.assessment_id",
      "returning id",
    ]) expect(insercion.sql).toContain(tramo);
    const lote = JSON.parse(insercion.params.find((p) => typeof p === "string" && p.startsWith("[")) as string);
    expect(lote).toEqual([
      { portal_key: "07.13", group_name: "EVC", name: "Examen escrito 1", week_number: 3, weight: 15, value: 14.5, mark: "graded", assessment_id: 5011, match_rule: "exact" },
      { portal_key: "07.20", group_name: "EVC", name: "Participación", week_number: null, weight: 85, value: null, mark: "pending", assessment_id: null, match_rule: "none" },
    ]);
    expect(insercion.params.filter((p) => p === 501).length).toBe(2);
  });

  test("una pareja de otra oferta no produce fila y revierte la transacción", async () => {
    const { repo, tx } = baseFalsa((sql) => (sql.startsWith("insert") ? [{ id: 1 }] : []));
    await expect(repo.replacePortalScores(tx, 501, [fila(), fila({ key: "07.14", assessmentId: 5021 })]))
      .rejects.toThrow("no pertenece a la oferta");
  });

  test("sin evaluaciones solo borra", async () => {
    const { repo, tx, consultas } = baseFalsa();
    await repo.replacePortalScores(tx, 501, []);
    expect(consultas.map((c) => c.sql.split(" ")[0])).toEqual(["delete"]);
  });

  test("ninguna escritura toca otra tabla que enrollment y student_portal_score (RS-BE-49)", async () => {
    const { repo, tx, consultas } = baseFalsa((sql) => (sql.startsWith("insert") ? [{ id: 1 }] : [{ id: 501 }]));
    await repo.lockRefresh(tx, 42);
    await repo.updateAttendanceHours(tx, 501, { total: "48.00", attended: "4.00", absent: "2.00" }, LEIDA);
    await repo.markGradesRead(tx, 501, LEIDA);
    await repo.replacePortalScores(tx, 501, [fila()]);
    const destinos = consultas
      .map((c) => /^(?:update|insert into|delete from) (\w+)/.exec(c.sql)?.[1])
      .filter((t): t is string => t !== undefined);
    expect(new Set(destinos)).toEqual(new Set(["enrollment", "student_portal_score"]));
  });

  test("las filas que arman el lector y el emparejamiento cumplen los CHECK de la 0015", async () => {
    const html = await Bun.file("test/HU37_jeff/fixtures/detalle-evaluaciones-con-notas.html").text();
    const leidas = parseDetalleEvaluaciones(html);
    if (!leidas.ok) throw new Error(leidas.reason);
    const filas = emparejarEvaluaciones(leidas.data, [
      { assessmentId: 5011, name: "Examen escrito", typeName: "Examen", week: 3, weight: 15 },
    ]);
    for (const f of filas) {
      expect(f.key.length).toBeLessThanOrEqual(20);
      expect(f.group === null || f.group.length <= 60).toBe(true);
      expect(f.name.length).toBeLessThanOrEqual(150);
      expect(f.weight > 0 && f.weight <= 100).toBe(true);
      expect(f.week === null || (f.week >= 1 && f.week <= 20)).toBe(true);
      expect(f.value === null || (f.value >= 0 && f.value <= 20)).toBe(true);
      expect(["graded", "pending", "np"]).toContain(f.mark);
      expect(f.mark === "graded").toBe(f.value !== null);
      expect(["exact", "exact_other_name", "week_shift", "none"]).toContain(f.match);
      expect(f.match === "none").toBe(f.assessmentId === null);
    }
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.repository.test.ts
```

Se espera un fallo al cargar, porque `refresh/refresh.repository.ts` no existe.

- [ ] **Paso 3. Crear `refresh/refresh.types.ts` con los tipos del contexto**

```ts
/**
 * Tipos de la recarga de notas parciales y asistencia (recarga-portal.spec.md).
 */

/** RS-BE-49. Una matrícula activa del alumno en el período activo. La recarga
 *  solo escribe sobre estas, resueltas en el servidor. */
export type MatriculaActiva = {
  enrollmentId: number;
  sectionId: number;
  courseCode: string;
  sectionCode: string;
  courseName: string;
};

/** RS-BE-49, condición previa 1. Sin período activo, `period` es null. */
export type ContextoRecarga = { period: { id: number; code: string } | null; matriculas: MatriculaActiva[] };
```

- [ ] **Paso 4. Implementar `refresh/refresh.repository.ts`**

```ts
import { sql } from "drizzle-orm";
import type { db } from "../../../db/index.js";
import { sqlActualizarAsistencia, type HorasAsistencia, type Tx } from "../portal-sync.repository.js";
import type { EvaluacionEmparejada, EvaluacionSilabo } from "../portal-sync.types.js";
import type { ContextoRecarga } from "./refresh.types.js";

/**
 * RS-BE-54 y RS-BE-55 · acceso a PostgreSQL de la recarga.
 *
 * Las lecturas corren fuera de la transacción. Las escrituras reciben `tx` y
 * tocan solo `enrollment` (las horas de asistencia y las dos horas de lectura)
 * y `student_portal_score`. Ningún arreglo de JS ni ningún `Date` entra a la
 * plantilla `sql`: los instantes viajan como texto ISO 8601 y el lote de
 * evaluaciones como un solo texto JSON.
 */
export class PortalRefreshRepository {
  constructor(readonly database: typeof db) {}

  /** Única puerta de entrada a la transacción; el servicio nunca abre una. */
  async runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await this.database.transaction(fn);
  }

  async findUserCode(userId: number): Promise<string | null> {
    const filas = (await this.database.execute(sql`
      select code from app_user where id = ${userId} limit 1
    `)) as unknown as Array<{ code: string | null }>;
    return filas[0]?.code ?? null;
  }

  /** RS-BE-49, condición previa 1. El período activo y las matrículas activas del alumno en él. */
  async findRefreshContext(studentId: number): Promise<ContextoRecarga> {
    const periodos = (await this.database.execute(sql`
      select id, code from academic_period where is_active = true limit 1
    `)) as unknown as Array<{ id: number; code: string }>;
    const periodo = periodos[0];
    if (!periodo) return { period: null, matriculas: [] };
    const filas = (await this.database.execute(sql`
      select e.id as enrollment_id, sec.id as section_id, sec.code as section_code,
             c.code as course_code, c.name as course_name
        from enrollment e
        join section sec on sec.id = e.section_id
        join course_offering co on co.id = sec.course_offering_id
        join course c on c.id = co.course_id
       where e.student_id = ${studentId}
         and e.status = 'active'
         and co.academic_period_id = ${periodo.id}
       order by c.name, sec.code
    `)) as unknown as Array<{
      enrollment_id: number; section_id: number; section_code: string; course_code: string; course_name: string;
    }>;
    return {
      period: { id: Number(periodo.id), code: periodo.code },
      matriculas: filas.map((f) => ({
        enrollmentId: Number(f.enrollment_id),
        sectionId: Number(f.section_id),
        courseCode: f.course_code,
        sectionCode: f.section_code,
        courseName: f.course_name,
      })),
    };
  }

  /**
   * RS-BE-54. Candidatas del sílabo de la oferta de UNA matrícula. Todas las
   * secciones de un curso comparten la rúbrica, y la cadena parte de la
   * matrícula, así que nunca trae evaluaciones de otro curso.
   */
  async findSyllabusCandidates(enrollmentId: number): Promise<EvaluacionSilabo[]> {
    const filas = (await this.database.execute(sql`
      select a.id as assessment_id, a.name, at.name as type_name, a.week_number, a.weight::text as weight
        from enrollment e
        join section s on s.id = e.section_id
        join course_offering co on co.id = s.course_offering_id
        join syllabus sy on sy.course_offering_id = co.id
        join assessment a on a.syllabus_id = sy.id
        join assessment_type at on at.id = a.assessment_type_id
       where e.id = ${enrollmentId}
       order by a.week_number, a.id
    `)) as unknown as Array<{
      assessment_id: number; name: string; type_name: string; week_number: number; weight: string;
    }>;
    return filas.map((f) => ({
      assessmentId: Number(f.assessment_id),
      name: f.name,
      typeName: f.type_name,
      week: Number(f.week_number),
      weight: Number(f.weight),
    }));
  }

  /**
   * RS-BE-55. Sin este candado, dos recargas del mismo alumno desde dos
   * dispositivos borran e insertan las mismas filas a la vez y la segunda
   * termina en un 23505. `_xact_` se suelta solo con el commit o el rollback.
   */
  async lockRefresh(tx: Tx, studentId: number): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('portal-refresh'), ${studentId}::int)`);
  }

  /** RS-BE-51, punto 6. El mismo UPDATE de la importación, con la hora y la guarda de lectura. */
  async updateAttendanceHours(tx: Tx, enrollmentId: number, h: HorasAsistencia, leidaEn: string): Promise<boolean> {
    const filas = (await tx.execute(sqlActualizarAsistencia(enrollmentId, h, leidaEn))) as unknown as Array<unknown>;
    return filas.length > 0;
  }

  /**
   * RS-BE-55. La hora de las notas solo avanza. Devuelve true si el UPDATE tocó
   * la fila, y solo entonces el servicio reemplaza las evaluaciones, así que una
   * recarga que leyó antes y confirma después no pisa una lectura más nueva.
   */
  async markGradesRead(tx: Tx, enrollmentId: number, leidaEn: string): Promise<boolean> {
    const filas = (await tx.execute(sql`
      update enrollment
         set portal_grades_read_at = ${leidaEn}::timestamptz
       where id = ${enrollmentId}
         and (portal_grades_read_at is null or portal_grades_read_at < ${leidaEn}::timestamptz)
      returning id
    `)) as unknown as Array<unknown>;
    return filas.length > 0;
  }

  /**
   * RS-BE-55. Reemplaza TODAS las notas de la ULima de una matrícula, así que
   * una evaluación que la ULima retira no queda como fila vieja.
   *
   * Una fila con `assessment_id` solo entra si esa evaluación es del sílabo de
   * la oferta de la matrícula, por la cadena enrollment → section →
   * course_offering → syllabus → assessment, así que una pareja de otro curso
   * no produce fila aunque el servicio falle. Si las filas insertadas no son
   * las enviadas, se lanza y la transacción entera se revierte (500), porque
   * eso solo ocurre por un defecto del servicio.
   */
  async replacePortalScores(tx: Tx, enrollmentId: number, filas: EvaluacionEmparejada[]): Promise<void> {
    await tx.execute(sql`delete from student_portal_score where enrollment_id = ${enrollmentId}`);
    if (!filas.length) return;
    const lote = JSON.stringify(filas.map((f) => ({
      portal_key: f.key,
      group_name: f.group,
      name: f.name,
      week_number: f.week,
      weight: f.weight,
      value: f.value,
      mark: f.mark,
      assessment_id: f.assessmentId,
      match_rule: f.match,
    })));
    const insertadas = (await tx.execute(sql`
      insert into student_portal_score
        (enrollment_id, portal_key, group_name, name, week_number, weight, value, mark, assessment_id, match_rule)
      select ${enrollmentId}::int, f.portal_key, f.group_name, f.name, f.week_number, f.weight, f.value,
             f.mark, f.assessment_id, f.match_rule
        from json_to_recordset(${lote}::json) as f(
               portal_key text, group_name text, name text, week_number smallint, weight numeric,
               value numeric, mark text, assessment_id integer, match_rule text)
       where f.assessment_id is null
          or exists (
               select 1
                 from enrollment e
                 join section s on s.id = e.section_id
                 join course_offering co on co.id = s.course_offering_id
                 join syllabus sy on sy.course_offering_id = co.id
                 join assessment a on a.syllabus_id = sy.id
                where e.id = ${enrollmentId} and a.id = f.assessment_id)
      returning id
    `)) as unknown as Array<unknown>;
    if (insertadas.length !== filas.length) {
      throw new Error("student_portal_score: una pareja no pertenece a la oferta de la matrícula");
    }
  }
}
```

- [ ] **Paso 5. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.repository.test.ts
```

Se esperan 12 pruebas en verde.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-13.log`. Se espera `0 fail`, `EXIT=0` y 12 pruebas más que en la Tarea 12.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/refresh/refresh.types.ts src/modules/portal-sync/refresh/refresh.repository.ts test/HU37_jeff/refresh.repository.test.ts && git commit -m "feat(recarga-portal): repositorio de la recarga con candado, guardas de lectura y pareja atada a la oferta (RS-BE-54, RS-BE-55)" -m "Las candidatas del sílabo salen de la cadena de cada matrícula. La transacción empieza con un candado por alumno, la hora de las notas solo avanza y las evaluaciones se reemplazan con un INSERT … SELECT que descarta la pareja de otra oferta y revierte todo si falta alguna fila. Las escrituras tocan solo enrollment y student_portal_score."
```

---

### Tarea 14. `GET /grades/me/ulima`

**Archivos.**
- Modificar `src/modules/grades/grades.types.ts`, `grades.repository.ts`, `grades.service.ts`, `grades.controller.ts`, `grades.routes.ts` e `index.ts`.
- Crear `src/modules/grades/grades-ulima.logic.ts`.
- Prueba `test/HU37_jeff/grades-ulima.test.ts`.

**Interfaces.**
- Consume la tabla y las columnas de la Tarea 1.
- Produce en `grades.types.ts` `UlimaMark`, `UlimaMatch`, `UlimaAssessment = { key; group; name; week; weight; value; mark; assessmentId; match }`, `UlimaCourse = { sectionId; courseCode; courseName; sectionCode; lastReadAt: string | null; assessments: UlimaAssessment[] }`, `UlimaGradesView = { lastReadAt: string | null; courses: UlimaCourse[] }` y `UlimaGradeRow`, en `grades-ulima.logic.ts` `construirVistaUlima(filas: UlimaGradeRow[]): UlimaGradesView`, `GradesRepository.findUlimaGrades(studentId): Promise<UlimaGradeRow[]>`, `GradesService.getUlimaGrades(studentId): Promise<UlimaGradesView>` y en `grades/index.ts` `export { gradesService }`. La Tarea 19 inyecta `gradesService.getUlimaGrades` en la recarga, para que `view` tenga exactamente la forma de esta ruta.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/grades-ulima.test.ts`

```ts
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-57 · GET /grades/me/ulima. La cadena es la real (routes → controller
 * → service → repository) y solo la base es falsa. `mock.module` va antes de
 * importar la ruta, porque authMiddleware consulta token_version en cada
 * petición. Datos inventados (alumno 42, matrícula 501, curso 690417).
 */
type Consulta = { sql: string; params: unknown[] };
const consultas: Consulta[] = [];
let filasUlima: unknown[] = [];
const fakeDb = {
  execute: async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();
    consultas.push({ sql: texto, params });
    if (texto.includes("token_version")) return [{ token_version: 1 }];
    if (texto.includes("student_portal_score")) return filasUlima;
    return [];
  },
};
mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { GradesRepository } = await import("../../src/modules/grades/grades.repository.js");
const { GradesService } = await import("../../src/modules/grades/grades.service.js");
const { GradesController } = await import("../../src/modules/grades/grades.controller.js");
const { createGradesRoutes } = await import("../../src/modules/grades/grades.routes.js");
const { construirVistaUlima } = await import("../../src/modules/grades/grades-ulima.logic.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");
const { EventBus } = await import("../../src/events/index.js");

const LEIDA = "2026-09-25T15:42:10.000Z";
const fila = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 501, section_id: 81, course_code: "690417", course_name: "TALLER DE PROTOTIPADO", section_code: "812",
  last_read_at: LEIDA, portal_key: "07.13", group_name: "EVC", name: "Examen escrito 1", week_number: 3,
  weight: "15.00", value: "14.50", mark: "graded", assessment_id: 5011, match_rule: "exact", ...over,
});
const sinNotas = (over: Record<string, unknown> = {}) => fila({
  last_read_at: null, portal_key: null, group_name: null, name: null, week_number: null, weight: null,
  value: null, mark: null, assessment_id: null, match_rule: null, ...over,
});

describe("construirVistaUlima", () => {
  test("arma el ejemplo de la spec", () => {
    const vista = construirVistaUlima([
      fila(),
      fila({ portal_key: "07.14", name: "Trabajo de producción 1", week_number: 6, value: null, mark: "pending", assessment_id: 5012 }),
      fila({ portal_key: "07.15", name: "Exposición", week_number: 10, weight: "20.00", value: null, mark: "pending", assessment_id: 5013, match_rule: "week_shift" }),
    ] as never);
    expect(vista).toEqual({
      lastReadAt: LEIDA,
      courses: [{
        sectionId: 81, courseCode: "690417", courseName: "TALLER DE PROTOTIPADO", sectionCode: "812", lastReadAt: LEIDA,
        assessments: [
          { key: "07.13", group: "EVC", name: "Examen escrito 1", week: 3, weight: 15, value: 14.5, mark: "graded", assessmentId: 5011, match: "exact" },
          { key: "07.14", group: "EVC", name: "Trabajo de producción 1", week: 6, weight: 15, value: null, mark: "pending", assessmentId: 5012, match: "exact" },
          { key: "07.15", group: "EVC", name: "Exposición", week: 10, weight: 20, value: null, mark: "pending", assessmentId: 5013, match: "week_shift" },
        ],
      }],
    });
  });

  test("ordena por semana, con las null al final, y después por key", () => {
    const vista = construirVistaUlima([
      fila({ portal_key: "07.16", week_number: 12 }),
      fila({ portal_key: "07.20", week_number: null, assessment_id: null, match_rule: "none" }),
      fila({ portal_key: "07.13", week_number: 3 }),
      fila({ portal_key: "07.12", week_number: 3 }),
    ] as never);
    expect(vista.courses[0]!.assessments.map((a) => a.key)).toEqual(["07.12", "07.13", "07.16", "07.20"]);
  });

  test("un curso nunca leído sale con lastReadAt null y sin evaluaciones", () => {
    const vista = construirVistaUlima([
      fila(),
      sinNotas({ enrollment_id: 502, section_id: 82, course_code: "690418", course_name: "ANALITICA DE DATOS" }),
    ] as never);
    expect(vista.courses[1]).toEqual({
      sectionId: 82, courseCode: "690418", courseName: "ANALITICA DE DATOS", sectionCode: "812", lastReadAt: null, assessments: [],
    });
  });

  test("lastReadAt de arriba es el máximo de los cursos, o null", () => {
    const vista = construirVistaUlima([
      fila(), fila({ enrollment_id: 502, section_id: 82, last_read_at: "2026-09-26T10:00:00.000Z" }),
    ] as never);
    expect(vista.lastReadAt).toBe("2026-09-26T10:00:00.000Z");
    expect(construirVistaUlima([sinNotas()] as never).lastReadAt).toBeNull();
  });

  test("sin filas responde vacío, como sin período activo", () => {
    expect(construirVistaUlima([])).toEqual({ lastReadAt: null, courses: [] });
  });
});

describe("GradesRepository.findUlimaGrades", () => {
  test("solo matrículas activas del alumno en el período activo, con sus notas si tiene", async () => {
    consultas.length = 0;
    await new GradesRepository(fakeDb as never).findUlimaGrades(42);
    const { sql, params } = consultas[0]!;
    for (const tramo of [
      "join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true",
      "left join student_portal_score sps on sps.enrollment_id = e.id",
      "where e.student_id = $1 and e.status = 'active'",
      `to_char(e.portal_grades_read_at at time zone 'utc', 'yyyy-mm-dd"t"hh24:mi:ss.ms"z"') as last_read_at`,
    ]) expect(sql).toContain(tramo);
    expect(params).toEqual([42]);
  });
});

describe("GET /grades/me/ulima", () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/grades", createGradesRoutes(
    new GradesController(new GradesService(new GradesRepository(fakeDb as never), new EventBus())),
  ));
  const pedir = (token: string) => app.request("/grades/me/ulima", { headers: { Authorization: `Bearer ${token}` } });
  const alumno = jwt.sign({ sub: "7", studentId: 42, role: "student", tokenVersion: 1 }, config.auth.jwtSecret);

  test("responde la vista del alumno del token con Cache-Control no-store", async () => {
    filasUlima = [fila()];
    consultas.length = 0;
    const res = await pedir(alumno);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(((await res.json()) as { lastReadAt: string }).lastReadAt).toBe(LEIDA);
    expect(consultas.find((c) => c.sql.includes("student_portal_score"))!.params).toEqual([42]);
  });

  test("un token docente recibe 403", async () => {
    const docente = jwt.sign({ sub: "9", teacherId: 3, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);
    expect((await pedir(docente)).status).toBe(403);
  });

  test("sin token recibe 401", async () => {
    expect((await app.request("/grades/me/ulima")).status).toBe(401);
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/grades-ulima.test.ts
```

Se espera un fallo al cargar, porque `grades-ulima.logic.ts` no existe.

- [ ] **Paso 3. Sumar los tipos a `grades.types.ts`**

```ts
/** RS-BE-57. Marca de una evaluación de la ULima. */
export type UlimaMark = "graded" | "pending" | "np";
/** RS-BE-57. Regla con la que la evaluación encontró pareja en el sílabo. */
export type UlimaMatch = "exact" | "exact_other_name" | "week_shift" | "none";

/** RS-BE-57. Una evaluación de la ULima, con las claves en inglés de GET /official-grades/me. */
export type UlimaAssessment = {
  key: string;
  group: string | null;
  name: string;
  week: number | null;
  weight: number;
  value: number | null;
  mark: UlimaMark;
  assessmentId: number | null;
  match: UlimaMatch;
};

/** RS-BE-57. Una matrícula activa, leída o no. */
export type UlimaCourse = {
  sectionId: number;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  lastReadAt: string | null;
  assessments: UlimaAssessment[];
};

/** RS-BE-57. Respuesta de GET /grades/me/ulima y `view` de POST /portal-sync/refresh. */
export type UlimaGradesView = { lastReadAt: string | null; courses: UlimaCourse[] };

/** Fila cruda de `findUlimaGrades`, una por evaluación o una sola sin notas. */
export type UlimaGradeRow = {
  enrollment_id: number;
  section_id: number;
  course_code: string;
  course_name: string;
  section_code: string;
  last_read_at: string | null;
  portal_key: string | null;
  group_name: string | null;
  name: string | null;
  week_number: number | null;
  weight: string | null;
  value: string | null;
  mark: string | null;
  assessment_id: number | null;
  match_rule: string | null;
};
```

- [ ] **Paso 4. Crear `grades-ulima.logic.ts`**

```ts
import type { UlimaAssessment, UlimaCourse, UlimaGradeRow, UlimaGradesView } from "./grades.types.js";

/** RS-BE-57. Por semana, con las null al final, y después por key. */
const ordenEvaluaciones = (a: UlimaAssessment, b: UlimaAssessment): number => {
  if (a.week !== b.week) {
    if (a.week === null) return 1;
    if (b.week === null) return -1;
    return a.week - b.week;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
};

/**
 * RS-BE-57. Arma la vista de las notas de la ULima desde las filas del
 * repositorio. Una entrada por matrícula activa, aunque nunca se haya leído, y
 * `lastReadAt` de arriba es el máximo de los cursos. Las horas llegan ya como
 * texto ISO 8601 UTC con milisegundos, así que se comparan como texto.
 */
export const construirVistaUlima = (filas: UlimaGradeRow[]): UlimaGradesView => {
  const cursos = new Map<number, UlimaCourse>();
  for (const f of filas) {
    let curso = cursos.get(Number(f.enrollment_id));
    if (!curso) {
      curso = {
        sectionId: Number(f.section_id),
        courseCode: f.course_code,
        courseName: f.course_name,
        sectionCode: f.section_code,
        lastReadAt: f.last_read_at ?? null,
        assessments: [],
      };
      cursos.set(Number(f.enrollment_id), curso);
    }
    if (f.portal_key === null || f.name === null || f.weight === null || f.mark === null || f.match_rule === null) continue;
    curso.assessments.push({
      key: f.portal_key,
      group: f.group_name,
      name: f.name,
      week: f.week_number === null ? null : Number(f.week_number),
      weight: Number(f.weight),
      value: f.value === null ? null : Number(f.value),
      mark: f.mark as UlimaAssessment["mark"],
      assessmentId: f.assessment_id === null ? null : Number(f.assessment_id),
      match: f.match_rule as UlimaAssessment["match"],
    });
  }
  const lista = [...cursos.values()];
  for (const c of lista) c.assessments.sort(ordenEvaluaciones);
  const horas = lista.map((c) => c.lastReadAt).filter((h): h is string => h !== null);
  return { lastReadAt: horas.length ? horas.reduce((a, b) => (b > a ? b : a)) : null, courses: lista };
};
```

- [ ] **Paso 5. Repositorio, servicio, controlador, ruta e índice**

En `grades.repository.ts`, el import de tipos suma `UlimaGradeRow` y la clase suma el método.

```ts
  /**
   * RS-BE-57. Matrículas activas del alumno en el período activo, cada una con
   * sus notas de la ULima si tiene. La hora sale como texto ISO 8601 UTC, así
   * que nunca llega un `Date` a la respuesta. Sin período activo no hay filas.
   */
  async findUlimaGrades(studentId: number): Promise<UlimaGradeRow[]> {
    return (await this.database.execute(sql`
      select
        e.id as enrollment_id,
        sec.id as section_id,
        c.code as course_code,
        c.name as course_name,
        sec.code as section_code,
        to_char(e.portal_grades_read_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as last_read_at,
        sps.portal_key,
        sps.group_name,
        sps.name,
        sps.week_number,
        sps.weight::text as weight,
        sps.value::text as value,
        sps.mark,
        sps.assessment_id,
        sps.match_rule
      from enrollment e
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      join academic_period ap on ap.id = co.academic_period_id and ap.is_active = true
      join course c on c.id = co.course_id
      left join student_portal_score sps on sps.enrollment_id = e.id
      where e.student_id = ${studentId}
        and e.status = 'active'
      order by c.name, sec.code, e.id
    `)) as unknown as UlimaGradeRow[];
  }
```

En `grades.service.ts`, los imports suman `import { construirVistaUlima } from "./grades-ulima.logic.js";` y el tipo `UlimaGradesView`, y la clase suma el método.

```ts
  /** RS-BE-57. Notas de la ULima del propio alumno. */
  async getUlimaGrades(studentId: number): Promise<UlimaGradesView> {
    return construirVistaUlima(await this.repository.findUlimaGrades(studentId));
  }
```

En `grades.controller.ts`.

```ts
  /** RS-BE-57. Solo el propio alumno, que sale del JWT. Sin parámetros. */
  async getUlimaGrades(c: Context) {
    const studentId = c.get("studentId") as number;
    const vista = await this.service.getUlimaGrades(studentId);
    c.header("Cache-Control", "no-store");
    return c.json(vista);
  }
```

En `grades.routes.ts`, después de `app.get("/me/notes", …)`.

```ts
  // RS-BE-57. Notas parciales que publica la ULima, tal como las guarda la recarga.
  app.get("/me/ulima", (c) => controller.getUlimaGrades(c));
```

En `grades/index.ts`, después de `export const gradesRoutes = …`.

```ts
// RS-BE-56. La recarga devuelve en `view` exactamente esta vista, ya con lo
// guardado, así que portal-sync recibe el servicio por composición.
export { gradesService };
```

Y la línea de `export type { … } from "./grades.types.js";` suma `UlimaAssessment, UlimaCourse, UlimaGradesView`.

- [ ] **Paso 6. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/grades-ulima.test.ts test/HU06_sam test/HU07_sam
```

Se esperan en verde las 9 pruebas nuevas y las de la calculadora, que no cambian.

- [ ] **Paso 7. Build y suite completa en segundo plano** con `tarea-14.log`. Se espera `0 fail`, `EXIT=0` y 9 pruebas más que en la Tarea 13.

- [ ] **Paso 8. Commit**

```bash
cd "${REPO:?}" && git add src/modules/grades/grades.types.ts src/modules/grades/grades-ulima.logic.ts src/modules/grades/grades.repository.ts src/modules/grades/grades.service.ts src/modules/grades/grades.controller.ts src/modules/grades/grades.routes.ts src/modules/grades/index.ts test/HU37_jeff/grades-ulima.test.ts && git commit -m "feat(grades): GET /grades/me/ulima con las notas parciales que guarda la recarga (RS-BE-57)" -m "La ruta devuelve una entrada por matrícula activa del período activo, leída o no, con sus evaluaciones ordenadas por semana y key y la hora de lectura en ISO 8601 UTC. Solo la lee el propio alumno, sin parámetros y con Cache-Control no-store."
```

---

### Tarea 15. `asistenciaLeidaEn` en el horario y en la ficha del curso

**Archivos.**
- Modificar `src/modules/schedule/schedule.repository.ts`, `schedule.types.ts` y `schedule.service.ts`.
- Modificar `src/modules/course-detail/course-detail.routes.ts`.
- Prueba `test/HU37_jeff/asistencia-leida-en.test.ts`.

**Interfaces.**
- Consume `enrollment.portal_attendance_read_at` (Tarea 1), que escriben la importación (Tarea 11) y la recarga (Tarea 18).
- Produce `RawSessionRow.attendance_read_at: string | null`, `SectionResponse.asistenciaLeidaEn: string | null` y el mismo campo en cada elemento de `secciones` de `GET /course-detail/sections` y en la `section` de `GET /course-detail/sections/:sectionId`. Es un campo más y ninguno de los de antes cambia. Las filas del docente y de asesoría lo emiten siempre `null`.

- [ ] **Paso 1. Escribir la prueba que falla**

`test/HU37_jeff/asistencia-leida-en.test.ts`

```ts
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-58 · asistenciaLeidaEn en GET /schedule/me/sessions y en
 * GET /course-detail/sections. Solo la base es falsa, y `mock.module` va antes
 * de importar las rutas porque authMiddleware consulta token_version. La parte
 * de la importación, que fija la hora con el instante de la respuesta, está en
 * test/HU31_jeff/service.asistencia.test.ts. Datos inventados.
 */
type Consulta = { sql: string; params: unknown[] };
const consultas: Consulta[] = [];
let filasSecciones: unknown[] = [];
const fakeDb = {
  execute: async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();
    consultas.push({ sql: texto, params });
    if (texto.includes("token_version")) return [{ token_version: 1 }];
    if (texto.includes("left join enrollment mia")) return filasSecciones;
    return [];
  },
};
mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { ScheduleRepository } = await import("../../src/modules/schedule/schedule.repository.js");
const { ScheduleService } = await import("../../src/modules/schedule/schedule.service.js");
const { createCourseDetailRoutes } = await import("../../src/modules/course-detail/course-detail.routes.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");
const { EventBus } = await import("../../src/events/index.js");

const LEIDA = "2026-09-25T15:42:10.000Z";
const ISO = `'yyyy-mm-dd"t"hh24:mi:ss.ms"z"'`;

describe("GET /schedule/me/sessions", () => {
  const filaSesion = (over: Record<string, unknown> = {}) => ({
    section_id: 81, section_code: "812", teacher_code: "T001", course_id: 1, course_name: "TALLER DE PROTOTIPADO",
    attended_hours: "4.00", absent_hours: "2.00", total_hours: "48.00", session_id: null, day_of_week: null,
    start_time: null, end_time: null, classroom: null, color_hex: null, attendance_read_at: LEIDA, ...over,
  });
  const semanas = { findAcademicWeeksForActivePeriod: async () => [], findActivePeriodDates: async () => null };

  test("el repositorio lee la hora del alumno como texto ISO 8601 UTC", async () => {
    consultas.length = 0;
    await new ScheduleRepository(fakeDb as never).findActiveEnrollmentsWithSessions(42);
    expect(consultas[0]!.sql).toContain(
      `to_char(e.portal_attendance_read_at at time zone 'utc', ${ISO}) as attendance_read_at`,
    );
  });

  test("las filas del docente la traen null desde el SQL", async () => {
    consultas.length = 0;
    await new ScheduleRepository(fakeDb as never).findTeacherSessionsWithClasses(3);
    expect(consultas[0]!.sql).toContain("null as attendance_read_at");
  });

  test("cada sección suma asistenciaLeidaEn, o null sin lectura, sin cambiar los demás campos", async () => {
    const repo = {
      ...semanas,
      findActiveEnrollmentsWithSessions: async () => [
        filaSesion(), filaSesion({ section_id: 82, section_code: "815", attendance_read_at: null }),
      ],
    };
    const res = await new ScheduleService(repo as never, new EventBus()).getSessions(42);
    expect(res.secciones.map((s) => [s.idSeccion, s.asistenciaLeidaEn])).toEqual([["81", LEIDA], ["82", null]]);
    expect(res.secciones[0]).toMatchObject({
      asistido: 4, inasistencia: 2, total: 48, asistenciaDisponible: true, horasTranscurridas: 6,
    });
  });

  test("las filas del docente y de asesoría la emiten siempre null", async () => {
    const repo = {
      ...semanas,
      findTeacherSessionsWithClasses: async () => [filaSesion({ attendance_read_at: null })],
      findTeacherAdvisingSessions: async () => [{
        id: 9, start_time: "10:00:00", end_time: "11:00:00", kind: "extra", course_offering_id: 11,
        course_name: "TALLER DE PROTOTIPADO", day_of_week: 2, classroom: "A-101", session_date: "2026-09-29",
      }],
    };
    const res = await new ScheduleService(repo as never, new EventBus()).getTeacherSessions(3);
    expect(res.secciones.map((s: { asistenciaLeidaEn?: unknown }) => s.asistenciaLeidaEn)).toEqual([null, null]);
  });
});

describe("GET /course-detail/sections", () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.route("/course-detail", createCourseDetailRoutes({} as never));
  const token = jwt.sign({ sub: "7", studentId: 42, role: "student", tokenVersion: 1 }, config.auth.jwtSecret);
  const pedir = (ruta: string) => app.request(ruta, { headers: { Authorization: `Bearer ${token}` } });
  const filaSeccion = (over: Record<string, unknown> = {}) => ({
    section_id: 81, section_code: "812", teacher_code: "T001", course_id: 1, course_name: "TALLER DE PROTOTIPADO",
    promedio: "0", attended_hours: "4.00", absent_hours: "2.00", total_hours: "48.00", asistencia_leida_en: LEIDA, ...over,
  });

  test("cada sección suma asistenciaLeidaEn de la matrícula del alumno", async () => {
    filasSecciones = [filaSeccion(), filaSeccion({ section_id: 82, section_code: "815", asistencia_leida_en: null })];
    consultas.length = 0;
    const res = await pedir("/course-detail/sections");
    expect(res.status).toBe(200);
    const cuerpo = (await res.json()) as { secciones: Array<Record<string, unknown>> };
    expect(cuerpo.secciones.map((s) => [s.idSeccion, s.asistenciaLeidaEn])).toEqual([["81", LEIDA], ["82", null]]);
    expect(cuerpo.secciones[0]).toMatchObject({ asistido: 4, inasistencia: 2, total: 48, horasTranscurridas: 6 });
    const sql = consultas.find((c) => c.sql.includes("left join enrollment mia"))!.sql;
    expect(sql).toContain(`to_char(max(mia.portal_attendance_read_at) at time zone 'utc', ${ISO}) as asistencia_leida_en`);
  });

  test("la sección de GET /course-detail/sections/:sectionId también lo trae", async () => {
    filasSecciones = [filaSeccion()];
    const res = await pedir("/course-detail/sections/81");
    expect(((await res.json()) as { section: Record<string, unknown> }).section.asistenciaLeidaEn).toBe(LEIDA);
  });
});
```

- [ ] **Paso 2. Correr la prueba y verla fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/asistencia-leida-en.test.ts
```

Se espera que fallen los seis casos, porque ni el SQL ni las respuestas traen la hora.

- [ ] **Paso 3. Implementar en `schedule`**

En `schedule.repository.ts`, `RawSessionRow` suma el campo al final.

```ts
  /** RS-BE-58. Hora de la última lectura de la asistencia, ISO 8601 UTC, o null. */
  attendance_read_at: string | null;
```

En `findActiveEnrollmentsWithSessions`, después de `e.total_hours,`.

```ts
        to_char(e.portal_attendance_read_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as attendance_read_at,
```

En `findTeacherSessionsWithClasses`, después de `'0' as total_hours,`.

```ts
        null as attendance_read_at,
```

En `schedule.types.ts`, `SectionResponse` suma el campo después de `horasTranscurridas`.

```ts
  /**
   * RS-BE-58 (recarga-portal). Hora de la última lectura de la asistencia de
   * esta matrícula en miUlima, por la importación o por la recarga, en ISO 8601
   * UTC, o null si no hay ninguna. Las filas del docente y de asesoría lo
   * emiten siempre null.
   */
  asistenciaLeidaEn: string | null;
```

En `schedule.service.ts`, `getSessions` suma el campo al objeto de cada sección, después de `horasTranscurridas`.

```ts
          asistenciaLeidaEn: row.attendance_read_at ?? null,
```

Y `getTeacherSessions` lo suma con `null` en los dos objetos que arma, el de la sección (después de `horasTranscurridas: 0,`) y el de la asesoría (después de `asistenciaDisponible: false,`).

```ts
          asistenciaLeidaEn: null,
```

- [ ] **Paso 4. Implementar en `course-detail.routes.ts`**

En la consulta de `app.get("/sections", …)`, después de `coalesce(max(mia.total_hours), 0) as total_hours`.

```ts
        coalesce(max(mia.total_hours), 0) as total_hours,
        to_char(max(mia.portal_attendance_read_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as asistencia_leida_en
```

Y en el `map` de la respuesta, después de `horasTranscurridas`.

```ts
        // RS-BE-58. Hora de la última lectura de la asistencia de la matrícula
        // del alumno autenticado, o null. Un docente no tiene matrícula, así
        // que recibe null.
        asistenciaLeidaEn: row.asistencia_leida_en ?? null,
```

`GET /course-detail/sections/:sectionId` reutiliza esta ruta y lo trae sin más cambios.

- [ ] **Paso 5. Correr la prueba y verla pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/asistencia-leida-en.test.ts test/HU09_nehemias test/HU24_nehemias test/HU_asistencia test/HU35_jeff/schedule-iso-date.test.ts test/HU31_jeff/course-detail.contacts-claim.test.ts
```

Se esperan en verde las 6 pruebas nuevas y las del horario y de la ficha de siempre.

- [ ] **Paso 6. Build y suite completa en segundo plano** con `tarea-15.log`. Se espera `0 fail`, `EXIT=0` y 6 pruebas más que en la Tarea 14. Una prueba de otro módulo que compara una sección entera con `toEqual` falla acá por el campo nuevo, y se actualiza sumando `asistenciaLeidaEn` con el valor que corresponde, nunca quitando el campo.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add src/modules/schedule/schedule.repository.ts src/modules/schedule/schedule.types.ts src/modules/schedule/schedule.service.ts src/modules/course-detail/course-detail.routes.ts test/HU37_jeff/asistencia-leida-en.test.ts && git commit -m "feat(schedule): asistenciaLeidaEn en el horario y en la ficha del curso (RS-BE-58)" -m "Cada sección de GET /schedule/me/sessions y de GET /course-detail/sections suma la hora de la última lectura de la asistencia de la matrícula, en ISO 8601 UTC o null. Las filas del docente y de asesoría la emiten siempre null, y ningún campo de antes cambia."
```

---

### Tarea 16. Fase de asistencia de la recarga

**Archivos.**
- Modificar `src/modules/portal-sync/refresh/refresh.types.ts` (el resto de los tipos de la recarga).
- Crear `src/modules/portal-sync/refresh/refresh.logic.ts` (tope de concurrencia y fallos; las Tareas 17 y 18 suman lo demás).
- Crear `src/modules/portal-sync/refresh/fase-asistencia.ts`.
- Crear `test/HU37_jeff/recarga.dobles.ts` (datos y dobles compartidos de las pruebas de la recarga).
- Pruebas `test/HU37_jeff/refresh.asistencia.test.ts` y `test/HU37_jeff/refresh.budget.test.ts` (primera parte).

**Interfaces.**
- Consume `parseAulas` (RS-BE-48), `parseAsistenciaCurso` con el ciclo (Tarea 5), `PORTAL_PATHS.asistenciaAlumno`, `OpcionesPagina` (Tarea 4), `HorasAsistencia` (Tarea 11), los tipos de notas (Tareas 6 a 8) y `UlimaGradesView` (Tarea 14).
- Produce en `refresh.types.ts` `FalloPortal`, `Pedir = (path: string, opciones?: OpcionesPagina) => Promise<string>`, `ContextoFase = { pedir: Pedir; now: () => number; deadline: number }`, `MenuDescargado`, `EstadoMenu`, `AulaAsistencia`, `FaseAsistencia`, `AulaNotas`, `FaseNotas`, `EstadoAsistencia`, `EstadoNotas`, `EscrituraAsistencia`, `EscrituraNotas`, `RefreshInput`, `RefreshCourse` y `RefreshResult`; en `refresh.logic.ts` `TOPE_EN_VUELO = 5`, `conTope<T>(tope, n, tarea: (i) => Promise<T>): Promise<T[]>` y `falloDe(e: unknown): FalloPortal`; y en `fase-asistencia.ts` `leerAsistencia(ctx: ContextoFase, menu: MenuDescargado, alumno: string, ciclo: string): Promise<FaseAsistencia>`. La Tarea 18 la llama con el menú de la ronda de apertura.

- [ ] **Paso 1. Sumar los tipos de la recarga a `refresh.types.ts`**

Al comienzo del archivo, los imports.

```ts
import type { OpcionesPagina } from "../../../services/portal.client.js";
import type { UlimaGradesView } from "../../grades/grades.types.js";
import type { HorasAsistencia } from "../portal-sync.repository.js";
import type {
  AgregadoUlima, AsistenciaCurso, AsistenciaIdentificada, AulaMenu, EvaluacionEmparejada, EvaluacionUlima,
  SyncWarning,
} from "../portal-sync.types.js";
```

Al final del archivo.

```ts
/** RS-BE-56. Fallo de una petición o de una lectura, para la precedencia sin cursos leídos. */
export type FalloPortal = "PORTAL_SESSION_INVALID" | "PORTAL_TIMEOUT" | "PORTAL_UNAVAILABLE" | "PORTAL_UNREADABLE";

/** Pide una página del Aula Virtual con la sesión de la recarga. */
export type Pedir = (path: string, opciones?: OpcionesPagina) => Promise<string>;

/** Lo que necesita una fase. `deadline` es el fin del presupuesto de RS-BE-50, en el reloj `now`. */
export type ContextoFase = { pedir: Pedir; now: () => number; deadline: number };

/** Un menú de la ronda de apertura, descargado o con su fallo. */
export type MenuDescargado = { ok: true; html: string } | { ok: false; fallo: FalloPortal };

export type EstadoMenu = "ok" | "unavailable" | "unreadable";

/** Un aula del menú y su posición, que fija el orden de los avisos. */
export type EnMenu = { aula: AulaMenu; i: number };

/** RS-BE-51. Resultado de un aula del menú de Asistencia. `contraste` es la
 *  sección del menú distinta de la de la página (RS-BE-48). */
export type AulaAsistencia =
  | (EnMenu & { estado: "leida"; datos: AsistenciaCurso; leidaEn: Date })
  | (EnMenu & { estado: "failed"; motivo: string })
  | (EnMenu & { estado: "contraste" })
  | (EnMenu & { estado: "unavailable"; fallo: FalloPortal })
  | (EnMenu & { estado: "not_reached" });

export type FaseAsistencia = {
  menu: EstadoMenu;
  aulas: AulaAsistencia[];
  /** Aula → par que verifica su propia página (RS-BE-51, punto 4). */
  identificadas: Map<string, AsistenciaIdentificada>;
  fallos: FalloPortal[];
  identityMismatch: boolean;
  otroCiclo: boolean;
};

/** RS-BE-52 y RS-BE-53. Resultado de un aula del menú de Nota. `contraste`
 *  es la página del curso que no coincide con el menú o con la asistencia. */
export type AulaNotas =
  | (EnMenu & {
    estado: "leida"; par: AsistenciaIdentificada; evaluaciones: EvaluacionUlima[];
    agregados: AgregadoUlima[]; leidaEn: Date;
  })
  | (EnMenu & { estado: "failed"; motivo: string })
  | (EnMenu & { estado: "contraste" })
  | (EnMenu & { estado: "unavailable"; fallo: FalloPortal })
  | (EnMenu & { estado: "not_reached" });

export type FaseNotas = {
  menu: EstadoMenu;
  aulas: AulaNotas[];
  /** Aula → par que verifica su página de notas, aunque el marco falle después. */
  identificadas: Map<string, AsistenciaIdentificada>;
  fallos: FalloPortal[];
};

/** RS-BE-56. Estado de cada matrícula en la respuesta. */
export type EstadoAsistencia = "updated" | "skipped" | "failed" | "unavailable" | "not_reached" | "missing";
export type EstadoNotas = "read" | "failed" | "unavailable" | "not_reached" | "missing";

/** RS-BE-55. Lo que la transacción escribe. */
export type EscrituraAsistencia = { enrollmentId: number; horas: HorasAsistencia; leidaEn: Date };
export type EscrituraNotas = { enrollmentId: number; filas: EvaluacionEmparejada[]; leidaEn: Date };

/** RS-BE-49. Entrada del servicio. `recibidaEn` es el instante en que el
 *  controlador recibe la petición y `rastro` lo deja el limitador (RS-BE-50). */
export type RefreshInput = {
  userId: number;
  studentId: number;
  credentials: { password: string; passcode: string };
  recibidaEn: number;
  rastro: { portalTocado: boolean };
};

export type RefreshCourse = {
  sectionId: number;
  courseCode: string;
  sectionCode: string;
  attendance: EstadoAsistencia;
  grades: EstadoNotas;
};

/** RS-BE-56. Respuesta 200 de POST /portal-sync/refresh. */
export type RefreshResult = {
  readAt: string;
  attendance: { updated: number; skipped: number; failed: number; unavailable: number };
  grades: { read: number; failed: number; unavailable: number; withValue: number };
  courses: RefreshCourse[];
  view: UlimaGradesView;
  warnings: SyncWarning[];
};
```

- [ ] **Paso 2. Crear los datos y dobles compartidos de las pruebas**

`test/HU37_jeff/recarga.dobles.ts`. No termina en `.test.ts`, así que `bun test` no lo corre solo.

```ts
import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";

/**
 * Datos y dobles de las pruebas de la recarga (HU37). Todo es inventado y sale
 * de la lista de datos de ejemplo de recarga-portal.spec.md (RS-BE-59).
 */

export const ALUMNO = "20230001";
export const CICLO = "2026-2";

/** Los cinco cursos del menú de lista, en su orden, con su matrícula y su sección. */
export const CURSOS = [
  { aula: "900101", curso: "690417", seccion: "812", nombre: "TALLER DE PROTOTIPADO", enrollmentId: 501, sectionId: 81 },
  { aula: "900102", curso: "690418", seccion: "812", nombre: "ANALITICA DE DATOS", enrollmentId: 502, sectionId: 82 },
  { aula: "900103", curso: "690419", seccion: "815", nombre: "GESTION DE PROYECTOS", enrollmentId: 503, sectionId: 83 },
  { aula: "900104", curso: "690420", seccion: "1020", nombre: "ETICA PROFESIONAL", enrollmentId: 504, sectionId: 84 },
  { aula: "900105", curso: "690421", seccion: "903", nombre: "ESTADISTICA APLICADA", enrollmentId: 505, sectionId: 85 },
];

export const cursoDe = (aula: string) => {
  const curso = CURSOS.find((c) => c.aula === aula);
  if (!curso) throw new Error(`aula sin curso en las pruebas: ${aula}`);
  return curso;
};

/** El aula de una ruta del Aula Virtual. */
export const aulaDe = (path: string): string => /prm_sNuAula=(\d+)/.exec(path)?.[1] ?? "";

const leer = (ruta: string) => Bun.file(ruta).text();
export const PAGINA_ASISTENCIA = await leer("test/HU37_jeff/fixtures/asistencia-curso-900101.html");
export const PAGINA_NOTA = await leer("test/HU37_jeff/fixtures/nota-curso-900101.html");
export const MENU_ASISTENCIA = await leer("test/HU31_jeff/fixtures/menu-lista-asistencia.html");
export const LAYOUT = '<html><body><font face="Arial" size="2">CICLO: 2026-2</font></body></html>';

/** Cambia el `value` de un oculto de la página de asistencia. */
export const conOculto = (html: string, nombre: string, valor: string): string =>
  html.replace(new RegExp(`(name="${nombre}" value=")[^"]*`), (_t, pre: string) => pre + valor);

type Oculto = "prm_sCoUserAlum" | "prm_sAaCicl" | "prm_sNuCicl" | "prm_sCoCurs" | "prm_sCoSecc";

/** Página de asistencia de un aula, derivada del fixture de 900101. */
export const asistenciaDe = (aula: string, cambios: Partial<Record<Oculto, string>> = {}): string => {
  const c = cursoDe(aula);
  const valores: Record<string, string> = { prm_sNuAula: aula, prm_sCoCurs: c.curso, prm_sCoSecc: c.seccion, ...cambios };
  return Object.entries(valores).reduce((html, [nombre, valor]) => conOculto(html, nombre, valor), PAGINA_ASISTENCIA);
};

/** Cambia el valor de una asignación `var nombre = '…'` de la página de notas. */
export const conVar = (html: string, nombre: string, valor: string): string =>
  html.replace(new RegExp(`(\\bvar ${nombre} = )'[^']*'`), (_t, pre: string) => `${pre}'${valor}'`);

/** Página de notas del curso de un aula, derivada del fixture de 900101. */
export const notaDe = (
  aula: string,
  cambios: { codCurso?: string; seccion?: string; notaPROM?: string; aulaMarco?: string } = {},
): string => {
  const c = cursoDe(aula);
  let html = conVar(conVar(PAGINA_NOTA, "codCurso", cambios.codCurso ?? c.curso), "seccion", cambios.seccion ?? c.seccion);
  if (cambios.notaPROM !== undefined) html = conVar(html, "notaPROM", cambios.notaPROM);
  return html.replace("prm_sNuAula=900101", `prm_sNuAula=${cambios.aulaMarco ?? aula}`);
};

/** Una hoja de la tabla «Detalle Evaluaciones». */
export type Hoja = { id: string; nombre: string; semana: string; peso: string; nota: string };

/** Las cinco evaluaciones del fixture de evaluaciones vacías. */
export const HOJAS: Hoja[] = [
  { id: "07.13", nombre: "Examen escrito 1", semana: "3", peso: "15", nota: "" },
  { id: "07.14", nombre: "Trabajo de producción 1", semana: "6", peso: "15", nota: "" },
  { id: "07.15", nombre: "Exposición", semana: "10", peso: "20", nota: "" },
  { id: "07.16", nombre: "Examen escrito 2", semana: "12", peso: "20", nota: "" },
  { id: "07.17", nombre: "Proyecto final", semana: "15", peso: "30", nota: "" },
];

/** Marco «Detalle Evaluaciones» con un solo grupo EVC y las hojas dadas. */
export const marco = (hojas: Hoja[] = HOJAS): string => [
  '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><body>',
  '<p class="subtitulo">Evaluaciones</p><table class="treetable">',
  "<tr><th></th><th>Detalle Evaluaciones</th><th>Semana</th><th>Peso</th><th>Nota</th><th></th></tr>",
  '<tr data-tt-id="07"><td></td><td>EVC</td><td>&nbsp;</td><td>100</td><td>&nbsp;</td><td></td></tr>',
  ...hojas.map((h) => `<tr data-tt-id="${h.id}" data-tt-parent-id='07'><td></td><td>${h.nombre}</td>`
    + `<td>${h.semana}</td><td>${h.peso}</td><td>${h.nota || "&nbsp;"}</td><td></td></tr>`),
  "</table></body></html>",
].join("\n");

/** Menú de lista con las aulas y las secciones dadas. */
export const menuLista = (
  fn: "OpenAsistenciaAlumno" | "OpenNotaAlumnoPrePost", aulas: Array<{ aula: string; seccion: string }>,
): string =>
  `<html><body><ul class="asignaturas">\n${aulas.map((a) =>
    `<li class="curso">CARRERA ING.SI. / CURSO INVENTADO / ${a.seccion}</li>\n`
    + `&nbsp;&nbsp;&nbsp;- <a href="javascript:${fn}('${a.aula}');">Ver</a><br><br>\n`).join("")}</ul></body></html>`;

/** `pedir` falso. Anota cada ruta con el reloj al pedirla y avanza el reloj. */
export const pedirFalso = (
  respuestas: (path: string) => string | Error,
  reloj: { t: number; paso: number } = { t: 0, paso: 0 },
) => {
  const pedidos: Array<{ path: string; t: number; opciones?: unknown }> = [];
  const pedir: Pedir = async (path, opciones) => {
    pedidos.push({ path, t: reloj.t, opciones });
    reloj.t += reloj.paso;
    const r = respuestas(path);
    if (r instanceof Error) throw r;
    return r;
  };
  return { pedir, pedidos, reloj };
};
```

- [ ] **Paso 3. Escribir las pruebas que fallan**

`test/HU37_jeff/refresh.asistencia.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { leerAsistencia } from "../../src/modules/portal-sync/refresh/fase-asistencia.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import {
  ALUMNO, CICLO, CURSOS, MENU_ASISTENCIA, asistenciaDe, aulaDe, menuLista, pedirFalso,
} from "./recarga.dobles.js";

/**
 * RS-BE-51 · fase de asistencia de la recarga, con un `pedir` falso. La parte
 * del servicio (matrícula, escritura y estados) está en refresh.service.test.ts.
 */
const leer = async (
  respuestas: (aula: string) => string | Error = (aula) => asistenciaDe(aula), menu = MENU_ASISTENCIA,
) => {
  const f = pedirFalso((path) => respuestas(aulaDe(path)));
  const fase = await leerAsistencia({ pedir: f.pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: menu }, ALUMNO, CICLO);
  return { fase, pedidos: f.pedidos };
};

describe("RS-BE-51 · fase de asistencia", () => {
  test("lee las cinco aulas del menú de lista, cada una identificada por su página", async () => {
    const { fase, pedidos } = await leer();
    expect(pedidos.map((p) => p.path)).toEqual(CURSOS.map((c) => PORTAL_PATHS.asistenciaAlumno(c.aula)));
    expect(fase.menu).toBe("ok");
    expect(fase.aulas.map((a) => a.estado)).toEqual(["leida", "leida", "leida", "leida", "leida"]);
    expect([...fase.identificadas]).toEqual(CURSOS.map((c) => [c.aula, { courseCode: c.curso, sectionCode: c.seccion }]));
    const primera = fase.aulas[0]!;
    expect(primera.estado === "leida" && primera.datos).toEqual({
      courseCode: "690417", sectionCode: "812", totalHours: 48, attendedHours: 4, absentHours: 2,
    });
    expect(fase.fallos).toEqual([]);
  });

  test("la hora de lectura es el instante en que llega la página, no el del pedido", async () => {
    let t = 1_000;
    const f = pedirFalso((path) => asistenciaDe(aulaDe(path)));
    const pedir = async (path: string) => {
      const html = await f.pedir(path);
      t += 10;
      return html;
    };
    const fase = await leerAsistencia({ pedir, now: () => t, deadline: 60_000 }, { ok: true, html: MENU_ASISTENCIA }, ALUMNO, CICLO);
    for (const a of fase.aulas) expect(a.estado === "leida" && a.leidaEn.getTime()).toBeGreaterThan(1_000);
  });

  test("una página de otro ciclo marca otroCiclo", async () => {
    const { fase } = await leer((aula) => asistenciaDe(aula, aula === "900102" ? { prm_sNuCicl: "1" } : {}));
    expect(fase.otroCiclo).toBe(true);
  });

  test("un ciclo mal formado es un fallo de ese curso, sin otroCiclo", async () => {
    const { fase } = await leer((aula) => asistenciaDe(aula, aula === "900102" ? { prm_sAaCicl: "26" } : {}));
    expect(fase.otroCiclo).toBe(false);
    expect(fase.aulas[1]).toMatchObject({ estado: "failed", motivo: "la página es de otro ciclo" });
    expect(fase.fallos).toEqual(["PORTAL_UNREADABLE"]);
  });

  test("un código de alumno distinto marca identityMismatch", async () => {
    const { fase } = await leer((aula) => asistenciaDe(aula, aula === "900103" ? { prm_sCoUserAlum: "20230002" } : {}));
    expect(fase.identityMismatch).toBe(true);
  });

  test("una descarga que falla deja el aula unavailable con su fallo, fuera del mapa", async () => {
    const { fase } = await leer((aula) => (aula === "900104"
      ? new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE")
      : asistenciaDe(aula)));
    expect(fase.aulas[3]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_UNAVAILABLE" });
    expect(fase.identificadas.has("900104")).toBe(false);
    expect(fase.fallos).toEqual(["PORTAL_UNAVAILABLE"]);
  });

  test("una sesión que muere a mitad de camino se anota como PORTAL_SESSION_INVALID", async () => {
    const { fase } = await leer((aula) => (aula === "900101"
      ? new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID")
      : asistenciaDe(aula)));
    expect(fase.aulas[0]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_SESSION_INVALID" });
  });

  test("una página que identifica el curso y falla en los totales entra al mapa", async () => {
    const { fase } = await leer((aula) => (aula === "900105"
      ? asistenciaDe(aula).replace("Total horas programadas", "Total horas dictadas")
      : asistenciaDe(aula)));
    expect(fase.aulas[4]).toMatchObject({ estado: "failed" });
    expect(fase.identificadas.get("900105")).toEqual({ courseCode: "690421", sectionCode: "903" });
  });

  test("la sección del menú distinta de la de la página no entra al mapa (RS-BE-48)", async () => {
    const menu = menuLista("OpenAsistenciaAlumno", CURSOS.map((c) => ({ aula: c.aula, seccion: c.aula === "900101" ? "999" : c.seccion })));
    const { fase } = await leer(undefined, menu);
    expect(fase.aulas[0]).toMatchObject({ estado: "contraste" });
    expect(fase.identificadas.has("900101")).toBe(false);
  });

  test("un menú que no se descargó deja la fase sin aulas y con su fallo", async () => {
    const fase = await leerAsistencia(
      { pedir: async () => "", now: () => 0, deadline: 60_000 }, { ok: false, fallo: "PORTAL_TIMEOUT" }, ALUMNO, CICLO,
    );
    expect(fase).toMatchObject({ menu: "unavailable", aulas: [], fallos: ["PORTAL_TIMEOUT"] });
  });

  test("un menú en un formato desconocido es PORTAL_UNREADABLE", async () => {
    const { fase, pedidos } = await leer(undefined, "<html><body>otra cosa</body></html>");
    expect(fase).toMatchObject({ menu: "unreadable", aulas: [], fallos: ["PORTAL_UNREADABLE"] });
    expect(pedidos).toHaveLength(0);
  });
});
```

`test/HU37_jeff/refresh.budget.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { leerAsistencia } from "../../src/modules/portal-sync/refresh/fase-asistencia.js";
import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import { ALUMNO, CICLO, MENU_ASISTENCIA, asistenciaDe, aulaDe, menuLista, pedirFalso } from "./recarga.dobles.js";

/**
 * RS-BE-50 · presupuesto de tiempo y tope de concurrencia, con un reloj falso
 * que avanza solo cuando se pide una página.
 */

describe("RS-BE-50 · presupuesto y concurrencia en la fase de asistencia", () => {
  test("ninguna página se pide después del plazo y las que faltan quedan not_reached", async () => {
    const f = pedirFalso((path) => asistenciaDe(aulaDe(path)), { t: 30_000, paso: 10_000 });
    const fase = await leerAsistencia(
      { pedir: f.pedir, now: () => f.reloj.t, deadline: 60_000 }, { ok: true, html: MENU_ASISTENCIA }, ALUMNO, CICLO,
    );
    expect(f.pedidos.map((p) => p.t)).toEqual([30_000, 40_000, 50_000]);
    expect(fase.aulas.map((a) => a.estado)).toEqual(["leida", "leida", "leida", "not_reached", "not_reached"]);
  });

  test("nunca hay más de cinco peticiones en vuelo", async () => {
    const aulas = Array.from({ length: 8 }, (_, i) => ({ aula: String(900101 + i), seccion: "812" }));
    let enVuelo = 0;
    let maximo = 0;
    const pedir: Pedir = async () => {
      enVuelo++;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo--;
      return "<html></html>";
    };
    const fase = await leerAsistencia(
      { pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: menuLista("OpenAsistenciaAlumno", aulas) }, ALUMNO, CICLO,
    );
    expect(fase.aulas).toHaveLength(8);
    expect(maximo).toBe(5);
  });
});
```

- [ ] **Paso 4. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.asistencia.test.ts test/HU37_jeff/refresh.budget.test.ts
```

Se espera un fallo al cargar, porque `fase-asistencia.ts` no existe.

- [ ] **Paso 5. Crear `refresh/refresh.logic.ts`**

```ts
import { HttpError } from "../../../shared/errors/http-error.js";
import type { FalloPortal } from "./refresh.types.js";

/**
 * Piezas puras de la recarga (recarga-portal.spec.md).
 */

/** RS-BE-50. Nunca más de cinco peticiones simultáneas sobre la misma sesión del portal. */
export const TOPE_EN_VUELO = 5;

/** Corre `tarea(0)` a `tarea(n - 1)` con a lo sumo `tope` en vuelo y devuelve los resultados en orden. */
export const conTope = async <T>(tope: number, n: number, tarea: (i: number) => Promise<T>): Promise<T[]> => {
  const resultados = new Array<T>(n);
  let siguiente = 0;
  const trabajador = async (): Promise<void> => {
    while (siguiente < n) {
      const i = siguiente++;
      resultados[i] = await tarea(i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(tope, n) }, trabajador));
  return resultados;
};

/** RS-BE-56. El fallo de una petición que no llegó, según el error del cliente. */
export const falloDe = (e: unknown): FalloPortal => {
  const code = e instanceof HttpError ? e.code : "";
  return code === "PORTAL_SESSION_INVALID" || code === "PORTAL_TIMEOUT" ? code : "PORTAL_UNAVAILABLE";
};
```

- [ ] **Paso 6. Crear `refresh/fase-asistencia.ts`**

```ts
import { PORTAL_PATHS } from "../../../services/portal.client.js";
import { parseAsistenciaCurso, parseAulas } from "../parsers/index.js";
import { TOPE_EN_VUELO, conTope, falloDe } from "./refresh.logic.js";
import type { AulaAsistencia, ContextoFase, FaseAsistencia, MenuDescargado } from "./refresh.types.js";

/**
 * RS-BE-51 · fase de asistencia de la recarga, fuera de la transacción.
 *
 * Lee el menú de Asistencia que trajo la ronda de apertura y pide la página de
 * cada aula con a lo sumo cinco peticiones en vuelo (RS-BE-50). El curso y la
 * sección salen siempre de la página, nunca del menú, y la identificación
 * verificada de cada página arma el mapa aula → (curso, sección) que usan el
 * contraste del panel Nota y los avisos (RS-BE-48).
 *
 * Nada de esta fase escribe. Un fallo de descarga o de lectura deja el aula con
 * su estado y nunca produce un 0.
 */
export const leerAsistencia = async (
  ctx: ContextoFase, menu: MenuDescargado, alumno: string, ciclo: string,
): Promise<FaseAsistencia> => {
  const fase: FaseAsistencia = {
    menu: "ok", aulas: [], identificadas: new Map(), fallos: [], identityMismatch: false, otroCiclo: false,
  };
  if (!menu.ok) {
    fase.menu = "unavailable";
    fase.fallos.push(menu.fallo);
    return fase;
  }
  const aulas = parseAulas(menu.html, "OpenAsistenciaAlumno");
  if (!aulas.ok) {
    fase.menu = "unreadable";
    fase.fallos.push("PORTAL_UNREADABLE");
    return fase;
  }

  fase.aulas = await conTope(TOPE_EN_VUELO, aulas.data.length, async (i): Promise<AulaAsistencia> => {
    const aula = aulas.data[i]!;
    // Pasado el presupuesto no se pide nada más (RS-BE-50). Tras un código de
    // alumno distinto u otro ciclo la recarga entera se aborta, así que
    // tampoco.
    if (ctx.now() >= ctx.deadline || fase.identityMismatch || fase.otroCiclo) {
      return { aula, i, estado: "not_reached" };
    }
    let html: string;
    try {
      html = await ctx.pedir(PORTAL_PATHS.asistenciaAlumno(aula.aula));
    } catch (e) {
      const fallo = falloDe(e);
      fase.fallos.push(fallo);
      return { aula, i, estado: "unavailable", fallo };
    }
    // RS-BE-51, punto 6. El instante en que llega la respuesta.
    const leidaEn = new Date(ctx.now());
    const r = parseAsistenciaCurso(html, aula.aula, alumno, ciclo);
    if (r.identityMismatch) fase.identityMismatch = true;
    if (r.otroCiclo) fase.otroCiclo = true;
    const id = r.identificado;
    // RS-BE-48. Si el menú trae una sección y la página declara otra, no hay
    // forma segura de saber cuál vale, y el aula no entra al mapa.
    if (id && aula.sectionCode !== null && aula.sectionCode !== id.sectionCode) {
      fase.fallos.push("PORTAL_UNREADABLE");
      return { aula, i, estado: "contraste" };
    }
    if (id) fase.identificadas.set(aula.aula, id);
    if (!r.ok) {
      fase.fallos.push("PORTAL_UNREADABLE");
      return { aula, i, estado: "failed", motivo: r.reason };
    }
    return { aula, i, estado: "leida", datos: r.data, leidaEn };
  });
  return fase;
};
```

- [ ] **Paso 7. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.asistencia.test.ts test/HU37_jeff/refresh.budget.test.ts
```

Se esperan 13 pruebas en verde (11 de la fase y 2 del presupuesto).

- [ ] **Paso 8. Build y suite completa en segundo plano** con `tarea-16.log`. Se espera `0 fail`, `EXIT=0` y 13 pruebas más que en la Tarea 15.

- [ ] **Paso 9. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/refresh/refresh.types.ts src/modules/portal-sync/refresh/refresh.logic.ts src/modules/portal-sync/refresh/fase-asistencia.ts test/HU37_jeff/recarga.dobles.ts test/HU37_jeff/refresh.asistencia.test.ts test/HU37_jeff/refresh.budget.test.ts && git commit -m "feat(recarga-portal): fase de asistencia de la recarga (RS-BE-50, RS-BE-51)" -m "La fase lee el menú de Asistencia de la ronda de apertura y pide la página de cada aula con a lo sumo cinco en vuelo, sin empezar ninguna pasado el presupuesto. Cada aula queda leída, fallida, en contraste, no disponible o sin alcanzar, y el mapa de identificaciones verificadas sale de las páginas, aunque fallen en los totales."
```

---

### Tarea 17. Fase de notas de la recarga, curso por curso

**Archivos.**
- Crear `test/HU31_jeff/fixtures/menu-lista-nota.html`.
- Modificar `src/modules/portal-sync/refresh/refresh.logic.ts` (chequeo del promedio).
- Crear `src/modules/portal-sync/refresh/fase-notas.ts`.
- Modificar `test/HU37_jeff/recarga.dobles.ts` (el menú de Nota).
- Pruebas `test/HU37_jeff/refresh.notas.test.ts` y `test/HU37_jeff/refresh.budget.test.ts` (segunda parte).

**Interfaces.**
- Consume `parseAulas`, `parseNotaCurso` y `parseDetalleEvaluaciones` (Tareas 6 y 7), `PORTAL_PATHS.cursosNota`, `notaCurso` y `tareaAcademica` (Tarea 4) y los tipos y `falloDe` de la Tarea 16.
- Produce en `refresh.logic.ts` `sumaPonderada(evs: EvaluacionUlima[]): number` y `promedioNoCuadra(evs: EvaluacionUlima[], agregados: AgregadoUlima[]): boolean`, y en `fase-notas.ts` `leerNotas(ctx: ContextoFase, menu: MenuDescargado, mapaAsistencia: Map<string, AsistenciaIdentificada>): Promise<FaseNotas>`. La página del curso se pide con `{ refererPath: PORTAL_PATHS.cursosNota }` y el marco con `{ charset: "iso-8859-1", refererPath: PORTAL_PATHS.notaCurso(aula) }`. La Tarea 18 llama `leerNotas` con el mapa de la fase de asistencia.

- [ ] **Paso 1. Crear el menú de Nota armado a mano**

`test/HU31_jeff/fixtures/menu-lista-nota.html`, con la estructura de `menu-lista-asistencia.html` (RS-BE-48), que lista las mismas aulas en el mismo orden.

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<!--
  FIXTURE ARMADO A MANO (RS-BE-52 y RS-BE-59). Reproduce la estructura del menú
  lateral nuevo del panel Nota que describe el hallazgo 1 de
  recarga-portal.spec.md y no contiene ningún dato real. Las aulas (900101 a
  900105), los nombres de curso y las secciones son inventados y son los mismos
  de menu-lista-asistencia.html, porque los dos menús listan las mismas aulas
  en el mismo orden. El menú no trae el código del curso.
-->
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<script language="JavaScript" src="/portalUL/av/scripts/aVirtualBB.js"></script>
<title>Aula Virtual</title>
</head>
<body>
<form name="avForm" method="post" action="">
<input type="hidden" name="prm_sNuAula" value="">
<table width="100%">
<tr>
  <td align="center" class="titular">Nota</td>
</tr>
<tr>
  <td>

<ul class="asignaturas">

    <li class="curso">CARRERA ING.SI. / TALLER DE PROTOTIPAD / 812</li>
      &nbsp;&nbsp;&nbsp;- <a href="javascript:OpenNotaAlumnoPrePost('900101');">Nota</a><br><br>

    <li class="curso">CARRERA ING.SI. / ANALITICA DE DATOS / 812</li>
      &nbsp;&nbsp;&nbsp;- <a href="javascript:OpenNotaAlumnoPrePost('900102');">Nota</a><br><br>

    <li class="curso">CARRERA ING.SI. / GESTION DE PROYECTOS / 815</li>
      &nbsp;&nbsp;&nbsp;- <a href="javascript:OpenNotaAlumnoPrePost('900103');">Nota</a><br><br>

    <li class="curso">CARRERA ING.SI. / ETICA PROFESIONAL / 1020</li>
      &nbsp;&nbsp;&nbsp;- <a href="javascript:OpenNotaAlumnoPrePost('900104');">Nota</a><br><br>

    <li class="curso">CARRERA ING.SI. / ESTADISTICA APLICADA / 903</li>
      &nbsp;&nbsp;&nbsp;- <a href="javascript:OpenNotaAlumnoPrePost('900105');">Nota</a><br><br>

</ul>

  </td>
</tr>
</table>
</form>
</body>
</html>
```

En `test/HU37_jeff/recarga.dobles.ts`, justo después de `MENU_ASISTENCIA`.

```ts
export const MENU_NOTA = await leer("test/HU31_jeff/fixtures/menu-lista-nota.html");
```

- [ ] **Paso 2. Escribir las pruebas que fallan**

`test/HU37_jeff/refresh.notas.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { leerNotas } from "../../src/modules/portal-sync/refresh/fase-notas.js";
import { promedioNoCuadra, sumaPonderada } from "../../src/modules/portal-sync/refresh/refresh.logic.js";
import type { AgregadoUlima, EvaluacionUlima } from "../../src/modules/portal-sync/portal-sync.types.js";
import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { CURSOS, MENU_NOTA, aulaDe, marco, menuLista, notaDe, pedirFalso } from "./recarga.dobles.js";

/**
 * RS-BE-52 y RS-BE-53 · fase de notas de la recarga, con un `pedir` falso. El
 * marco de evaluaciones no trae ningún identificador, así que el orden de las
 * peticiones es lo único que lo ata a su curso, y por eso tiene sus pruebas.
 */
const MAPA = new Map(CURSOS.map((c) => [c.aula, { courseCode: c.curso, sectionCode: c.seccion }]));

const respuestas = (sobre: Record<string, string | Error> = {}) => (path: string): string | Error => {
  if (path in sobre) return sobre[path]!;
  const aula = aulaDe(path);
  if (path === PORTAL_PATHS.notaCurso(aula)) return notaDe(aula);
  if (path === PORTAL_PATHS.tareaAcademica(aula)) return marco();
  return new Error(`ruta inesperada en la prueba: ${path}`);
};

const leer = async (sobre: Record<string, string | Error> = {}, mapa = MAPA, menu = MENU_NOTA) => {
  const f = pedirFalso(respuestas(sobre));
  const fase = await leerNotas({ pedir: f.pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: menu }, mapa);
  return { fase, pedidos: f.pedidos };
};

describe("RS-BE-53 · orden de las peticiones", () => {
  test("cada marco se pide justo después de la página de su curso, curso por curso", async () => {
    const { pedidos } = await leer();
    expect(pedidos.map((p) => p.path)).toEqual(CURSOS.flatMap((c) => [
      PORTAL_PATHS.notaCurso(c.aula), PORTAL_PATHS.tareaAcademica(c.aula),
    ]));
    expect(pedidos[0]!.opciones).toEqual({ refererPath: PORTAL_PATHS.cursosNota });
    expect(pedidos[1]!.opciones).toEqual({ charset: "iso-8859-1", refererPath: PORTAL_PATHS.notaCurso("900101") });
  });

  test("nunca hay dos cadenas en vuelo", async () => {
    let enVuelo = 0;
    let maximo = 0;
    const base = respuestas();
    const pedir: Pedir = async (path) => {
      enVuelo++;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 2));
      enVuelo--;
      const r = base(path);
      if (r instanceof Error) throw r;
      return r;
    };
    await leerNotas({ pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: MENU_NOTA }, MAPA);
    expect(maximo).toBe(1);
  });
});

describe("RS-BE-52 · identificación y contraste", () => {
  test("lee las cinco aulas con su par verificado, sus evaluaciones y sus agregados", async () => {
    const { fase } = await leer();
    expect(fase.menu).toBe("ok");
    expect(fase.aulas.map((a) => a.estado)).toEqual(["leida", "leida", "leida", "leida", "leida"]);
    const primera = fase.aulas[0]!;
    if (primera.estado !== "leida") throw new Error("la primera aula debía leerse");
    expect(primera.par).toEqual({ courseCode: "690417", sectionCode: "812" });
    expect(primera.evaluaciones).toHaveLength(5);
    expect(primera.agregados.map((a) => a.clave)).toEqual(["EP", "TA", "EF", "PROM"]);
    expect(fase.identificadas.size).toBe(5);
  });

  test("la sección del menú distinta de la de la página no pide el marco ni identifica", async () => {
    const menu = menuLista("OpenNotaAlumnoPrePost", CURSOS.map((c) => ({ aula: c.aula, seccion: c.aula === "900101" ? "999" : c.seccion })));
    const { fase, pedidos } = await leer({}, MAPA, menu);
    expect(fase.aulas[0]).toMatchObject({ estado: "contraste" });
    expect(pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica("900101"))).toBe(false);
    expect(fase.identificadas.has("900101")).toBe(false);
  });

  test("el mapa de la asistencia con otro curso para esa aula es contraste", async () => {
    const mapa = new Map(MAPA);
    mapa.set("900102", { courseCode: "690499", sectionCode: "812" });
    const { fase } = await leer({}, mapa);
    expect(fase.aulas[1]).toMatchObject({ estado: "contraste" });
  });

  test("el mapa de la asistencia con otra sección para esa aula es contraste", async () => {
    const mapa = new Map(MAPA);
    mapa.set("900102", { courseCode: "690418", sectionCode: "813" });
    const { fase } = await leer({}, mapa);
    expect(fase.aulas[1]).toMatchObject({ estado: "contraste" });
  });

  test("un aula que la asistencia no identificó se lee igual", async () => {
    const mapa = new Map(MAPA);
    mapa.delete("900103");
    const { fase } = await leer({}, mapa);
    expect(fase.aulas[2]).toMatchObject({ estado: "leida" });
  });

  test("la página del curso que no llega deja el aula unavailable y no pide su marco", async () => {
    const { fase, pedidos } = await leer({
      [PORTAL_PATHS.notaCurso("900104")]: new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
    });
    expect(fase.aulas[3]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_UNAVAILABLE" });
    expect(pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica("900104"))).toBe(false);
  });

  test("una página del curso que no se entiende es failed con su motivo", async () => {
    const { fase } = await leer({ [PORTAL_PATHS.notaCurso("900105")]: "<html><body>login</body></html>" });
    expect(fase.aulas[4]).toMatchObject({ estado: "failed", motivo: "la respuesta no es la página de notas de un curso" });
    expect(fase.fallos).toEqual(["PORTAL_UNREADABLE"]);
  });

  test("un marco que falla conserva la identificación de la página del curso", async () => {
    const { fase } = await leer({
      [PORTAL_PATHS.tareaAcademica("900101")]: new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT"),
    });
    expect(fase.aulas[0]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_TIMEOUT" });
    expect(fase.identificadas.get("900101")).toEqual({ courseCode: "690417", sectionCode: "812" });
  });

  test("un marco que no se entiende es failed con su motivo", async () => {
    const { fase } = await leer({ [PORTAL_PATHS.tareaAcademica("900102")]: "<html></html>" });
    expect(fase.aulas[1]).toMatchObject({ estado: "failed", motivo: "la tabla de evaluaciones no tiene la cabecera esperada" });
  });

  test("un menú que no llega o que no se entiende deja la fase sin aulas", async () => {
    const vacio = async () => "";
    const sinMenu = await leerNotas({ pedir: vacio, now: () => 0, deadline: 60_000 }, { ok: false, fallo: "PORTAL_UNAVAILABLE" }, MAPA);
    expect(sinMenu).toMatchObject({ menu: "unavailable", aulas: [], fallos: ["PORTAL_UNAVAILABLE"] });
    const raro = await leerNotas({ pedir: vacio, now: () => 0, deadline: 60_000 }, { ok: true, html: "<html></html>" }, MAPA);
    expect(raro).toMatchObject({ menu: "unreadable", aulas: [], fallos: ["PORTAL_UNREADABLE"] });
  });
});

describe("RS-BE-53, punto 7 · chequeo con el promedio de la ULima", () => {
  const ev = (value: number | null, weight: number, mark: EvaluacionUlima["mark"] = value === null ? "pending" : "graded"): EvaluacionUlima =>
    ({ key: `k${weight}`, group: "EVC", name: "Evaluación", week: 3, weight, value, mark });
  const prom = (valor: number | null): AgregadoUlima[] => [{ clave: "PROM", etiqueta: "Promedio", valor }];

  test("avisa cuando la suma ponderada difiere del promedio en más de 0,5", () => {
    const todas = [ev(10, 40), ev(16, 60)];
    expect(sumaPonderada(todas)).toBeCloseTo(13.6, 5);
    expect(promedioNoCuadra(todas, prom(15))).toBe(true);
    expect(promedioNoCuadra(todas, prom(14))).toBe(false);
  });

  test("calla cuando falta una nota, cuando hay un NP o cuando el promedio es 0", () => {
    expect(promedioNoCuadra([ev(10, 40), ev(null, 60)], prom(18))).toBe(false);
    expect(promedioNoCuadra([ev(10, 40), ev(null, 60, "np")], prom(18))).toBe(false);
    expect(promedioNoCuadra([ev(10, 40), ev(16, 60)], prom(null))).toBe(false);
    expect(promedioNoCuadra([ev(10, 40), ev(16, 60)], [])).toBe(false);
  });
});
```

Al final de `test/HU37_jeff/refresh.budget.test.ts`, con los imports que faltan al comienzo del archivo (`leerNotas` de `fase-notas.js`, `PORTAL_PATHS` de `portal.client.js` y `MENU_NOTA`, `marco` y `notaDe` de `recarga.dobles.js`).

```ts
describe("RS-BE-50 · presupuesto en la fase de notas", () => {
  test("pasado el plazo no se pide el marco ni el curso siguiente, y la identificación queda", async () => {
    const respuestasNotas = (path: string): string => {
      const aula = aulaDe(path);
      return path === PORTAL_PATHS.notaCurso(aula) ? notaDe(aula) : marco();
    };
    const f = pedirFalso(respuestasNotas, { t: 50_000, paso: 10_000 });
    const fase = await leerNotas(
      { pedir: f.pedir, now: () => f.reloj.t, deadline: 60_000 }, { ok: true, html: MENU_NOTA }, new Map(),
    );
    expect(f.pedidos.map((p) => p.path)).toEqual([PORTAL_PATHS.notaCurso("900101")]);
    expect(fase.aulas.map((a) => a.estado)).toEqual(["not_reached", "not_reached", "not_reached", "not_reached", "not_reached"]);
    expect(fase.identificadas.get("900101")).toEqual({ courseCode: "690417", sectionCode: "812" });
  });
});
```

- [ ] **Paso 3. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.notas.test.ts test/HU37_jeff/refresh.budget.test.ts
```

Se espera un fallo al cargar, porque `fase-notas.ts` no existe y `refresh.logic.ts` no exporta el chequeo del promedio.

- [ ] **Paso 4. Sumar el chequeo del promedio a `refresh.logic.ts`**

El import de tipos pasa a

```ts
import type { AgregadoUlima, EvaluacionUlima } from "../portal-sync.types.js";
import type { FalloPortal } from "./refresh.types.js";
```

y al final del archivo.

```ts
/** RS-BE-53, punto 7. Suma ponderada de las notas, con los pesos absolutos de la ULima. */
export const sumaPonderada = (evs: EvaluacionUlima[]): number =>
  evs.reduce((suma, e) => suma + (e.value ?? 0) * e.weight / 100, 0);

/**
 * RS-BE-53, punto 7. Cuando todas las hojas tienen nota y el agregado PROM vale
 * más que 0, la suma ponderada no puede diferir de él en más de 0,5. Si
 * difiere, el servicio avisa PORTAL_AVERAGE_MISMATCH y guarda igual.
 */
export const promedioNoCuadra = (evs: EvaluacionUlima[], agregados: AgregadoUlima[]): boolean => {
  const promedio = agregados.find((a) => a.clave === "PROM")?.valor ?? null;
  if (promedio === null || promedio <= 0) return false;
  if (!evs.length || !evs.every((e) => e.mark === "graded")) return false;
  return Math.abs(sumaPonderada(evs) - promedio) > 0.5;
};
```

- [ ] **Paso 5. Crear `refresh/fase-notas.ts`**

```ts
import { PORTAL_PATHS } from "../../../services/portal.client.js";
import { parseAulas } from "../parsers/index.js";
import { parseDetalleEvaluaciones, parseNotaCurso } from "../parsers/nota.js";
import type { AsistenciaIdentificada, AulaMenu } from "../portal-sync.types.js";
import { falloDe } from "./refresh.logic.js";
import type { AulaNotas, ContextoFase, FaseNotas, MenuDescargado } from "./refresh.types.js";

/**
 * RS-BE-52 y RS-BE-53 · fase de notas de la recarga, fuera de la transacción.
 *
 * Por cada aula del menú de Nota, primero la página del curso y después su
 * marco, y los cursos uno tras otro. El marco no trae ningún identificador, así
 * que este orden es lo único que lo ata a su curso mientras la verificación V3
 * no pruebe que no depende de un estado de sesión que deja la página del curso.
 */
export const leerNotas = async (
  ctx: ContextoFase, menu: MenuDescargado, mapaAsistencia: Map<string, AsistenciaIdentificada>,
): Promise<FaseNotas> => {
  const fase: FaseNotas = { menu: "ok", aulas: [], identificadas: new Map(), fallos: [] };
  if (!menu.ok) {
    fase.menu = "unavailable";
    fase.fallos.push(menu.fallo);
    return fase;
  }
  const aulas = parseAulas(menu.html, "OpenNotaAlumnoPrePost");
  if (!aulas.ok) {
    fase.menu = "unreadable";
    fase.fallos.push("PORTAL_UNREADABLE");
    return fase;
  }
  for (const [i, aula] of aulas.data.entries()) {
    fase.aulas.push(await leerCurso(ctx, aula, i, mapaAsistencia, fase));
  }
  return fase;
};

const leerCurso = async (
  ctx: ContextoFase, aula: AulaMenu, i: number, mapa: Map<string, AsistenciaIdentificada>, fase: FaseNotas,
): Promise<AulaNotas> => {
  if (ctx.now() >= ctx.deadline) return { aula, i, estado: "not_reached" };
  let pagina: string;
  try {
    pagina = await ctx.pedir(PORTAL_PATHS.notaCurso(aula.aula), { refererPath: PORTAL_PATHS.cursosNota });
  } catch (e) {
    const fallo = falloDe(e);
    fase.fallos.push(fallo);
    return { aula, i, estado: "unavailable", fallo };
  }
  const curso = parseNotaCurso(pagina, aula.aula);
  if (!curso.ok) {
    fase.fallos.push("PORTAL_UNREADABLE");
    return { aula, i, estado: "failed", motivo: curso.reason };
  }
  const par: AsistenciaIdentificada = { courseCode: curso.data.courseCode, sectionCode: curso.data.sectionCode };
  // RS-BE-52, punto 6. La sección del menú, o el curso o la sección que dio la
  // página de asistencia de la misma aula, tienen que coincidir.
  const enAsistencia = mapa.get(aula.aula);
  const menuDistinto = aula.sectionCode !== null && aula.sectionCode !== par.sectionCode;
  const asistenciaDistinta = enAsistencia !== undefined
    && (enAsistencia.courseCode !== par.courseCode || enAsistencia.sectionCode !== par.sectionCode);
  if (menuDistinto || asistenciaDistinta) {
    fase.fallos.push("PORTAL_UNREADABLE");
    return { aula, i, estado: "contraste" };
  }
  // Identificación verificada de la página de notas, que RS-BE-48 usa para
  // atribuir un aula cuya página de asistencia falla.
  fase.identificadas.set(aula.aula, par);

  if (ctx.now() >= ctx.deadline) return { aula, i, estado: "not_reached" };
  let marco: string;
  try {
    // El cliente arma la ruta con el aula del menú y nunca sigue el src del HTML.
    marco = await ctx.pedir(PORTAL_PATHS.tareaAcademica(aula.aula), {
      charset: "iso-8859-1", refererPath: PORTAL_PATHS.notaCurso(aula.aula),
    });
  } catch (e) {
    const fallo = falloDe(e);
    fase.fallos.push(fallo);
    return { aula, i, estado: "unavailable", fallo };
  }
  const leidaEn = new Date(ctx.now());
  const tabla = parseDetalleEvaluaciones(marco);
  if (!tabla.ok) {
    fase.fallos.push("PORTAL_UNREADABLE");
    return { aula, i, estado: "failed", motivo: tabla.reason };
  }
  return { aula, i, estado: "leida", par, evaluaciones: tabla.data, agregados: curso.data.agregados, leidaEn };
};
```

- [ ] **Paso 6. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.notas.test.ts test/HU37_jeff/refresh.budget.test.ts test/HU31_jeff/parser.aulas-lista.test.ts
```

Se esperan 15 pruebas nuevas en verde (14 de la fase y 1 del presupuesto) y las del menú de lista de RS-BE-48, que no cambian.

- [ ] **Paso 7. Build y suite completa en segundo plano** con `tarea-17.log`. Se espera `0 fail`, `EXIT=0` y 15 pruebas más que en la Tarea 16.

- [ ] **Paso 8. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/refresh/refresh.logic.ts src/modules/portal-sync/refresh/fase-notas.ts test/HU31_jeff/fixtures/menu-lista-nota.html test/HU37_jeff/recarga.dobles.ts test/HU37_jeff/refresh.notas.test.ts test/HU37_jeff/refresh.budget.test.ts && git commit -m "feat(recarga-portal): fase de notas de la recarga, curso por curso (RS-BE-52, RS-BE-53)" -m "Por cada aula del menú de Nota se pide la página del curso y justo después su marco, sin intercalar cursos ni tener dos cadenas en vuelo. La página del curso se contrasta con la sección del menú y con el mapa de la asistencia, y su identificación queda aunque el marco falle o se agote el presupuesto. El chequeo del promedio de la ULima queda como función pura."
```

---

### Tarea 18. Servicio de la recarga con un solo inicio de sesión

**Archivos.**
- Modificar `src/modules/portal-sync/portal-sync.types.ts` (cinco códigos de aviso).
- Modificar `src/modules/portal-sync/refresh/refresh.logic.ts` (errores, atribución y registro por fase).
- Crear `src/modules/portal-sync/refresh/refresh.service.ts`.
- Crear `test/HU37_jeff/recarga.servicio.ts` (dobles del servicio).
- Pruebas `test/HU37_jeff/refresh.service.test.ts` y `test/HU37_jeff/refresh.budget.test.ts` (tercera parte).

**Interfaces.**
- Consume todo lo anterior. `PortalRefreshRepository` (Tarea 13), `PortalLoginGuard`, `refreshInProgress` y `tooManyRejectedLogins` (Tarea 9), `PortalClient.login` con plazo (Tarea 3), `fetchPage` con opciones y las rutas del panel Nota (Tarea 4), `parseCicloActivo`, `resolveAttendanceHours`, `emparejarEvaluaciones` y `silaboNoCoincide` (Tarea 8), `leerAsistencia` (Tarea 16), `leerNotas` y `promedioNoCuadra` (Tarea 17) y `UlimaGradesView` (Tarea 14).
- Produce en `portal-sync.types.ts` los códigos `NOTAS_UNAVAILABLE`, `NOT_ENROLLED`, `SYLLABUS_MISMATCH`, `PORTAL_AVERAGE_MISMATCH` y `REFRESH_BUDGET_EXCEEDED`; en `refresh.logic.ts` `errorDeFallo(f: FalloPortal): HttpError`, `errorSinCursos(fallos: FalloPortal[]): HttpError`, `parDeAula(a: AulaMenu, propio, otro): AsistenciaIdentificada | null`, `clavePar(p): string`, `deAula(a, par): string` y `class RegistroFases`; y en `refresh.service.ts` `type RefreshDeps = { repository; client: Pick<PortalClient, "login" | "fetchPage" | "logout">; guard; leerVista: (studentId) => Promise<UlimaGradesView>; budgetMs: number; now?: () => number; log?: (linea: string) => void }` y `class PortalRefreshService` con `refresh(entrada: RefreshInput): Promise<RefreshResult>`. La Tarea 19 lo compone en `index.ts` y lo llama desde el controlador.

- [ ] **Paso 1. Crear los dobles del servicio**

`test/HU37_jeff/recarga.servicio.ts`

```ts
import { PortalLoginGuard } from "../../src/modules/portal-sync/portal-login-guard.js";
import { PortalRefreshService } from "../../src/modules/portal-sync/refresh/refresh.service.js";
import type { EvaluacionSilabo } from "../../src/modules/portal-sync/portal-sync.types.js";
import type { MatriculaActiva, RefreshInput } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import type { UlimaGradesView } from "../../src/modules/grades/grades.types.js";
import type { HttpError } from "../../src/shared/errors/http-error.js";
import { PORTAL_PATHS, type OpcionesPagina } from "../../src/services/portal.client.js";
import {
  ALUMNO, CICLO, CURSOS, LAYOUT, MENU_ASISTENCIA, MENU_NOTA, asistenciaDe, marco, notaDe,
} from "./recarga.dobles.js";

/**
 * Dobles del servicio de la recarga (HU37). Cliente, repositorio, reloj y
 * registro falsos, con los datos inventados de la spec. `armar` devuelve el
 * servicio y todo lo que las pruebas necesitan mirar.
 */

export const STUDENT_ID = 42;
export const USER_ID = 7;
export const PRESUPUESTO = 60_000;
export const CREDENCIALES = { password: "clave-sintetica", passcode: "123456" };

export const MATRICULAS: MatriculaActiva[] = CURSOS.map((c) => ({
  enrollmentId: c.enrollmentId, sectionId: c.sectionId, courseCode: c.curso, sectionCode: c.seccion, courseName: c.nombre,
}));

/** Sílabo de cada matrícula. Los ids llevan la matrícula adelante (5011 es de la 501),
 *  para ver que ninguna pareja cruza de curso. */
export const silaboDe = (enrollmentId: number): EvaluacionSilabo[] => [
  { assessmentId: enrollmentId * 10 + 1, name: "Examen escrito", typeName: "Examen", week: 3, weight: 15 },
  { assessmentId: enrollmentId * 10 + 2, name: "Trabajo de producción", typeName: "Trabajo", week: 6, weight: 15 },
  { assessmentId: enrollmentId * 10 + 3, name: "Exposición", typeName: "Exposición", week: 11, weight: 20 },
  { assessmentId: enrollmentId * 10 + 4, name: "Examen escrito", typeName: "Examen", week: 12, weight: 20 },
  { assessmentId: enrollmentId * 10 + 5, name: "Proyecto final", typeName: "Proyecto", week: 15, weight: 30 },
];

export const VISTA: UlimaGradesView = { lastReadAt: "2026-09-25T15:42:10.000Z", courses: [] };

const porDefecto = (path: string): string => {
  if (path === PORTAL_PATHS.layout) return LAYOUT;
  if (path === PORTAL_PATHS.cursosAsistencia) return MENU_ASISTENCIA;
  if (path === PORTAL_PATHS.cursosNota) return MENU_NOTA;
  for (const c of CURSOS) {
    if (path === PORTAL_PATHS.asistenciaAlumno(c.aula)) return asistenciaDe(c.aula);
    if (path === PORTAL_PATHS.notaCurso(c.aula)) return notaDe(c.aula);
    if (path === PORTAL_PATHS.tareaAcademica(c.aula)) return marco();
  }
  throw new Error(`ruta inesperada en la prueba: ${path}`);
};

export type Opciones = {
  paginas?: Record<string, string | Error>;
  loginFalla?: HttpError;
  reloj?: { t: number; paso: number };
  contexto?: { period: { id: number; code: string } | null; matriculas: MatriculaActiva[] };
  userCode?: string | null;
  silabos?: Record<number, EvaluacionSilabo[]>;
  asistenciaToca?: boolean;
  notasAvanzan?: boolean;
  log?: (linea: string) => void;
};

export const armar = (o: Opciones = {}) => {
  const reloj = o.reloj ?? { t: 0, paso: 0 };
  const pedidos: Array<{ path: string; t: number; opciones?: OpcionesPagina }> = [];
  const logins: Array<{ usuario: string; password: string; passcode: string; deadline?: number }> = [];
  let cierres = 0;
  const client = {
    login: async (usuario: string, password: string, passcode: string, opciones: { deadline?: number } = {}) => {
      logins.push({ usuario, password, passcode, deadline: opciones.deadline });
      if (o.loginFalla) throw o.loginFalla;
      return { JSESSIONID: "sesion-de-prueba", LtpaToken2: "ltpa-de-prueba" };
    },
    fetchPage: async (path: string, _cookies: unknown, opciones?: OpcionesPagina) => {
      pedidos.push({ path, t: reloj.t, opciones });
      reloj.t += reloj.paso;
      const r = o.paginas?.[path] ?? porDefecto(path);
      if (r instanceof Error) throw r;
      return r;
    },
    logout: async () => {
      cierres++;
    },
  };

  const llamadas: Array<{ metodo: string; args: unknown[] }> = [];
  const anotar = (metodo: string, ...args: unknown[]) => {
    llamadas.push({ metodo, args });
  };
  const repository = {
    findRefreshContext: async (studentId: number) => {
      anotar("findRefreshContext", studentId);
      return o.contexto ?? { period: { id: 2, code: CICLO }, matriculas: MATRICULAS };
    },
    findUserCode: async (userId: number) => {
      anotar("findUserCode", userId);
      return o.userCode === undefined ? ALUMNO : o.userCode;
    },
    findSyllabusCandidates: async (enrollmentId: number) => {
      anotar("findSyllabusCandidates", enrollmentId);
      return o.silabos?.[enrollmentId] ?? silaboDe(enrollmentId);
    },
    runInTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      anotar("runInTransaction");
      return fn({ transaccion: true });
    },
    lockRefresh: async (_tx: unknown, studentId: number) => {
      anotar("lockRefresh", studentId);
    },
    updateAttendanceHours: async (_tx: unknown, enrollmentId: number, horas: unknown, leidaEn: string) => {
      anotar("updateAttendanceHours", enrollmentId, horas, leidaEn);
      return o.asistenciaToca ?? true;
    },
    markGradesRead: async (_tx: unknown, enrollmentId: number, leidaEn: string) => {
      anotar("markGradesRead", enrollmentId, leidaEn);
      return o.notasAvanzan ?? true;
    },
    replacePortalScores: async (_tx: unknown, enrollmentId: number, filas: unknown) => {
      anotar("replacePortalScores", enrollmentId, filas);
    },
  };

  const guard = new PortalLoginGuard(() => reloj.t);
  const vistas: number[] = [];
  const servicio = new PortalRefreshService({
    repository: repository as never,
    client: client as never,
    guard,
    leerVista: async (studentId) => {
      vistas.push(studentId);
      return VISTA;
    },
    budgetMs: PRESUPUESTO,
    now: () => reloj.t,
    log: o.log ?? (() => {}),
  });
  const entrada = (over: Partial<RefreshInput> = {}): RefreshInput => ({
    userId: USER_ID, studentId: STUDENT_ID, credentials: CREDENCIALES, recibidaEn: 0,
    rastro: { portalTocado: false }, ...over,
  });
  const de = (metodo: string) => llamadas.filter((l) => l.metodo === metodo).map((l) => l.args);
  return { servicio, entrada, pedidos, logins, llamadas, de, guard, vistas, reloj, cierres: () => cierres };
};
```

- [ ] **Paso 2. Escribir las pruebas que fallan**

`test/HU37_jeff/refresh.service.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { ALUMNO, CURSOS, HOJAS, asistenciaDe, marco, notaDe } from "./recarga.dobles.js";
import { CREDENCIALES, MATRICULAS, STUDENT_ID, VISTA, armar } from "./recarga.servicio.js";

/**
 * RS-BE-49 a RS-BE-56 · servicio de la recarga con un cliente, un repositorio
 * y un reloj falsos (recarga.servicio.ts). Datos inventados de la spec.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const caido = () => new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");

describe("RS-BE-49 · condiciones previas, antes de tocar el portal", () => {
  test("sin período activo responde 409 IMPORT_REQUIRED sin iniciar sesión", async () => {
    const a = armar({ contexto: { period: null, matriculas: [] } });
    const entrada = a.entrada();
    await expect(a.servicio.refresh(entrada)).rejects.toMatchObject({
      statusCode: 409, code: "IMPORT_REQUIRED", message: "Primero carga tus datos del ciclo.",
    });
    expect(a.logins).toHaveLength(0);
    expect(entrada.rastro.portalTocado).toBe(false);
  });

  test("sin matrícula activa en el período, lo mismo", async () => {
    const a = armar({ contexto: { period: { id: 2, code: "2026-2" }, matriculas: [] } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ code: "IMPORT_REQUIRED" });
    expect(a.logins).toHaveLength(0);
  });

  test("sin app_user.code responde 422 sin iniciar sesión", async () => {
    const a = armar({ userCode: null });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 422, code: "PORTAL_IDENTITY_UNVERIFIABLE",
    });
    expect(a.logins).toHaveLength(0);
  });

  test("otra recarga del mismo alumno en curso responde 409 PORTAL_REFRESH_IN_PROGRESS", async () => {
    const a = armar();
    a.guard.tryStart(STUDENT_ID, "refresh");
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 409, code: "PORTAL_REFRESH_IN_PROGRESS",
      message: "Ya hay una lectura de miUlima en curso. Espera a que termine.",
    });
    expect(a.logins).toHaveLength(0);
  });

  test("una importación con credentials en curso también", async () => {
    const a = armar();
    a.guard.tryStart(STUDENT_ID, "import");
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ code: "PORTAL_REFRESH_IN_PROGRESS" });
  });

  test("tres rechazos en 15 minutos dan 429 rejected_logins sin iniciar sesión y sueltan la guarda", async () => {
    const a = armar();
    for (let i = 0; i < 3; i++) a.guard.recordRejectedLogin(STUDENT_ID);
    const entrada = a.entrada();
    await expect(a.servicio.refresh(entrada)).rejects.toMatchObject({
      statusCode: 429, code: "RATE_LIMITED", details: { retryAfterMinutes: 15, kind: "rejected_logins" },
    });
    expect(a.logins).toHaveLength(0);
    expect(entrada.rastro.portalTocado).toBe(false);
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("el orden es matrícula, código, guarda y tope", async () => {
    const a = armar({ contexto: { period: null, matriculas: [] }, userCode: null });
    a.guard.tryStart(STUDENT_ID, "refresh");
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ code: "IMPORT_REQUIRED" });
    const b = armar({ userCode: null });
    b.guard.tryStart(STUDENT_ID, "refresh");
    await expect(b.servicio.refresh(b.entrada())).rejects.toMatchObject({ code: "PORTAL_IDENTITY_UNVERIFIABLE" });
  });
});

describe("RS-BE-49 · inicio de sesión y ronda de apertura", () => {
  test("inicia sesión una sola vez, con app_user.code y el plazo del presupuesto", async () => {
    const a = armar();
    await a.servicio.refresh(a.entrada({ recibidaEn: 1_000 }));
    expect(a.logins).toEqual([{
      usuario: ALUMNO, password: CREDENCIALES.password, passcode: CREDENCIALES.passcode, deadline: 61_000,
    }]);
  });

  test("marca el rastro antes de iniciar sesión", async () => {
    const a = armar();
    const entrada = a.entrada();
    await a.servicio.refresh(entrada);
    expect(entrada.rastro.portalTocado).toBe(true);
  });

  test("un rechazo suma al tope, no pide ninguna página y suelta la guarda", async () => {
    const a = armar({ loginFalla: new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED") });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 409, code: "PORTAL_LOGIN_REJECTED" });
    expect(a.pedidos).toHaveLength(0);
    expect(a.cierres()).toBe(0);
    a.guard.recordRejectedLogin(STUDENT_ID);
    a.guard.recordRejectedLogin(STUDENT_ID);
    expect(a.guard.rejectedLoginsWait(STUDENT_ID)).not.toBeNull();
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("layout.jsp con otro ciclo responde 409 sin pedir ningún curso, sin escribir y cerrando la sesión", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.layout]: "<html><body>CICLO: 2026-1</body></html>" } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 409, code: "IMPORT_REQUIRED", message: "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.",
    });
    expect(a.pedidos.map((p) => p.path).sort()).toEqual(
      [PORTAL_PATHS.cursosAsistencia, PORTAL_PATHS.cursosNota, PORTAL_PATHS.layout].sort(),
    );
    expect(a.de("runInTransaction")).toHaveLength(0);
    expect(a.cierres()).toBe(1);
  });

  test("una página de asistencia de otro ciclo responde el mismo 409, sin notas y sin escribir", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900103")]: asistenciaDe("900103", { prm_sNuCicl: "1" }) } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 409, code: "IMPORT_REQUIRED" });
    expect(a.pedidos.some((p) => p.path === PORTAL_PATHS.notaCurso("900101"))).toBe(false);
    expect(a.de("runInTransaction")).toHaveLength(0);
  });

  test("layout.jsp sin ciclo responde 502 PORTAL_UNREADABLE", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.layout]: "<html><body>Bienvenido</body></html>" } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 502, code: "PORTAL_UNREADABLE" });
  });

  test("si la petición de layout.jsp falla, responde el error de esa petición", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.layout]: new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT") } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
    expect(a.cierres()).toBe(1);
  });

  test("una página con otro código de alumno aborta con 403 y no escribe nada", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900102")]: asistenciaDe("900102", { prm_sCoUserAlum: "20230002" }) } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 403, code: "PORTAL_IDENTITY_MISMATCH" });
    expect(a.pedidos.some((p) => p.path === PORTAL_PATHS.notaCurso("900101"))).toBe(false);
    expect(a.de("runInTransaction")).toHaveLength(0);
    expect(a.cierres()).toBe(1);
  });

  test("una página sin código de alumno es un fallo común de ese curso", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900102")]: asistenciaDe("900102", { prm_sCoUserAlum: "" }) } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[1]).toMatchObject({ courseCode: "690418", attendance: "failed", grades: "read" });
    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia de 690418/812: la página no trae el código de alumno",
    });
  });
});

describe("RS-BE-51, RS-BE-54 y RS-BE-55 · camino completo", () => {
  test("lee las cinco matrículas, escribe en una transacción con el candado primero y devuelve la vista", async () => {
    const a = armar();
    const res = await a.servicio.refresh(a.entrada());
    expect(res.attendance).toEqual({ updated: 5, skipped: 0, failed: 0, unavailable: 0 });
    expect(res.grades).toEqual({ read: 5, failed: 0, unavailable: 0, withValue: 0 });
    expect(res.courses).toEqual(MATRICULAS.map((m) => ({
      sectionId: m.sectionId, courseCode: m.courseCode, sectionCode: m.sectionCode, attendance: "updated", grades: "read",
    })));
    expect(res.warnings).toEqual([]);
    expect(res.view).toBe(VISTA);
    expect(a.vistas).toEqual([STUDENT_ID]);
    expect(res.readAt).toMatch(ISO);
    const orden = a.llamadas.map((l) => l.metodo);
    expect(orden[orden.indexOf("runInTransaction") + 1]).toBe("lockRefresh");
    expect(a.de("updateAttendanceHours").map(([id, horas, leida]) => [id, horas, ISO.test(leida as string)])).toEqual(
      CURSOS.map((c) => [c.enrollmentId, { total: "48.00", attended: "4.00", absent: "2.00" }, true]),
    );
    expect(a.de("markGradesRead").map(([id]) => id)).toEqual(CURSOS.map((c) => c.enrollmentId));
    expect(a.cierres()).toBe(1);
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("cada matrícula pide sus candidatas por separado y ninguna pareja cruza de curso", async () => {
    const a = armar();
    await a.servicio.refresh(a.entrada());
    expect(a.de("findSyllabusCandidates").map(([id]) => id)).toEqual(CURSOS.map((c) => c.enrollmentId));
    const reemplazos = a.de("replacePortalScores") as Array<[number, Array<{ key: string; assessmentId: number | null; match: string }>]>;
    expect(reemplazos).toHaveLength(5);
    for (const [id, filas] of reemplazos) {
      expect(filas.map((f) => [f.key, f.assessmentId, f.match])).toEqual([
        ["07.13", id * 10 + 1, "exact"], ["07.14", id * 10 + 2, "exact"], ["07.15", id * 10 + 3, "week_shift"],
        ["07.16", id * 10 + 4, "exact"], ["07.17", id * 10 + 5, "exact"],
      ]);
    }
  });

  test("una fila que salta la guarda de lectura más reciente cuenta como updated", async () => {
    const a = armar({ asistenciaToca: false });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.attendance.updated).toBe(5);
    expect(res.courses.every((c) => c.attendance === "updated")).toBe(true);
  });

  test("unos totales que no cuadran dejan la matrícula skipped y no llegan al UPDATE", async () => {
    const sinHoras = asistenciaDe("900101").replace('<strong class="textos">48</strong>', '<strong class="textos">0</strong>');
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900101")]: sinHoras } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.attendance).toEqual({ updated: 4, skipped: 1, failed: 0, unavailable: 0 });
    expect(res.courses[0]!.attendance).toBe("skipped");
    expect(a.de("updateAttendanceHours").map(([id]) => id)).not.toContain(501);
    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se escribió la asistencia de 690417/812: el portal no reporta horas programadas.",
    });
  });

  test("una lectura de notas más vieja no reemplaza las filas y el curso cuenta como read", async () => {
    const a = armar({ notasAvanzan: false });
    const res = await a.servicio.refresh(a.entrada());
    expect(a.de("replacePortalScores")).toHaveLength(0);
    expect(res.grades.read).toBe(5);
  });

  test("un curso de miUlima sin matrícula en ULima++ no se escribe y avisa NOT_ENROLLED", async () => {
    const a = armar({ contexto: { period: { id: 2, code: "2026-2" }, matriculas: MATRICULAS.slice(0, 4) } });
    const res = await a.servicio.refresh(a.entrada());
    const mensaje = "El curso 690421/903 de miUlima no está en tu matrícula de ULima++.";
    expect(res.warnings).toContainEqual({ code: "NOT_ENROLLED", block: "asistencia", message: mensaje });
    expect(res.warnings).toContainEqual({ code: "NOT_ENROLLED", block: "nota", message: mensaje });
    expect(a.de("updateAttendanceHours").map(([id]) => id)).not.toContain(505);
    expect(res.courses).toHaveLength(4);
    expect(res.attendance.updated).toBe(4);
  });

  test("un sílabo vacío avisa SYLLABUS_MISMATCH y el curso se guarda igual, sin parejas", async () => {
    const a = armar({ silabos: { 501: [] } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.warnings).toContainEqual({
      code: "SYLLABUS_MISMATCH", block: "nota",
      message: "El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima en 690417/812.",
    });
    const reemplazos = a.de("replacePortalScores") as Array<[number, Array<{ match: string }>]>;
    const [, filas] = reemplazos.find(([id]) => id === 501)!;
    expect(filas.every((f) => f.match === "none")).toBe(true);
  });

  test("un promedio de la ULima que no cuadra con las notas avisa sin ninguna cifra y guarda igual", async () => {
    const a = armar({ paginas: {
      [PORTAL_PATHS.notaCurso("900101")]: notaDe("900101", { notaPROM: "18" }),
      [PORTAL_PATHS.tareaAcademica("900101")]: marco(HOJAS.map((h) => ({ ...h, nota: "10" }))),
    } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.warnings).toContainEqual({
      code: "PORTAL_AVERAGE_MISMATCH", block: "nota",
      message: "El promedio que publica la ULima no coincide con sus evaluaciones en 690417/812.",
    });
    expect(res.grades.withValue).toBe(1);
    expect(a.de("replacePortalScores").map(([id]) => id)).toContain(501);
  });
});

describe("RS-BE-48 y RS-BE-56 · atribución y respuesta", () => {
  test("la asistencia de un aula que no se descarga se atribuye por su página de notas", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900101")]: caido() } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[0]).toMatchObject({ courseCode: "690417", attendance: "unavailable", grades: "read" });
    expect(res.warnings).toContainEqual({
      code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: "No se pudo traer la asistencia de 690417/812.",
    });
    expect(res.attendance).toEqual({ updated: 4, skipped: 0, failed: 0, unavailable: 1 });
  });

  test("una página de asistencia que no se entiende queda failed con el curso de su página de notas", async () => {
    const a = armar({ paginas: { [PORTAL_PATHS.asistenciaAlumno("900101")]: "<html><body>otra cosa</body></html>" } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[0]!.attendance).toBe("failed");
    expect(res.warnings).toContainEqual({
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia de 690417/812: la respuesta no es una página de asistencia",
    });
  });

  test("sin ninguna página que la identifique, los avisos nombran el aula y la matrícula queda missing", async () => {
    const a = armar({ paginas: {
      [PORTAL_PATHS.asistenciaAlumno("900101")]: caido(),
      [PORTAL_PATHS.notaCurso("900101")]: caido(),
    } });
    const res = await a.servicio.refresh(a.entrada());
    expect(res.courses[0]).toMatchObject({ courseCode: "690417", attendance: "missing", grades: "missing" });
    expect(res.warnings).toContainEqual({
      code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: "No se pudo traer la asistencia del aula 900101.",
    });
    expect(res.warnings).toContainEqual({
      code: "NOTAS_UNAVAILABLE", block: "nota", message: "No se pudieron traer las notas del aula 900101.",
    });
    expect(res.warnings.some((w) => w.message.includes("null"))).toBe(false);
  });

  test("readAt es el instante más reciente entre las lecturas que se guardan", async () => {
    const a = armar({ reloj: { t: 1_000, paso: 1 } });
    const res = await a.servicio.refresh(a.entrada({ recibidaEn: 1_000 }));
    expect(res.readAt).toBe(new Date(a.reloj.t).toISOString());
  });
});

describe("RS-BE-56 · sin ningún curso leído", () => {
  const todas = (fallo: (aula: string) => Array<[string, HttpError]>) =>
    Object.fromEntries(CURSOS.flatMap((c) => fallo(c.aula)));
  const sesion = () => new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");
  const tiempo = () => new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT");

  test("PORTAL_SESSION_INVALID gana a los demás, sin escribir y cerrando la sesión", async () => {
    const a = armar({ paginas: todas((aula) => [
      [PORTAL_PATHS.asistenciaAlumno(aula), sesion()], [PORTAL_PATHS.notaCurso(aula), tiempo()],
    ]) });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 409, code: "PORTAL_SESSION_INVALID" });
    expect(a.de("runInTransaction")).toHaveLength(0);
    expect(a.cierres()).toBe(1);
  });

  test("PORTAL_TIMEOUT gana a PORTAL_UNAVAILABLE", async () => {
    const a = armar({ paginas: todas((aula) => [
      [PORTAL_PATHS.asistenciaAlumno(aula), tiempo()], [PORTAL_PATHS.notaCurso(aula), caido()],
    ]) });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
  });

  test("solo fallos de red dan 502 PORTAL_UNAVAILABLE", async () => {
    const a = armar({ paginas: todas((aula) => [
      [PORTAL_PATHS.asistenciaAlumno(aula), caido()], [PORTAL_PATHS.notaCurso(aula), caido()],
    ]) });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({ statusCode: 502, code: "PORTAL_UNAVAILABLE" });
  });

  test("los dos menús en un formato desconocido dan 502 PORTAL_UNREADABLE con su mensaje", async () => {
    const a = armar({ paginas: {
      [PORTAL_PATHS.cursosAsistencia]: "<html><body>otra cosa</body></html>",
      [PORTAL_PATHS.cursosNota]: "<html><body>otra cosa</body></html>",
    } });
    await expect(a.servicio.refresh(a.entrada())).rejects.toMatchObject({
      statusCode: 502, code: "PORTAL_UNREADABLE", message: "miUlima responde con páginas que ULima++ no sabe leer.",
    });
  });
});
```

Al final de `test/HU37_jeff/refresh.budget.test.ts`, con los imports que faltan al comienzo del archivo (`HttpError` de `http-error.js`, `CURSOS` de `recarga.dobles.js` y `STUDENT_ID` y `armar` de `recarga.servicio.js`).

```ts
describe("RS-BE-50 · presupuesto de la recarga entera", () => {
  test("si el presupuesto se agota antes de la apertura, responde 504, cierra la sesión y suelta la guarda", async () => {
    const a = armar({ reloj: { t: 60_000, paso: 0 } });
    await expect(a.servicio.refresh(a.entrada({ recibidaEn: 0 }))).rejects.toMatchObject({
      statusCode: 504, code: "PORTAL_TIMEOUT",
    });
    expect(a.pedidos).toHaveLength(0);
    expect(a.cierres()).toBe(1);
    expect(a.guard.tryStart(STUDENT_ID, "refresh")).toBe(true);
  });

  test("los cursos que no alcanzan quedan not_reached y el aviso sale una sola vez", async () => {
    const a = armar({ reloj: { t: 0, paso: 10_000 } });
    const res = await a.servicio.refresh(a.entrada({ recibidaEn: 0 }));
    expect(a.pedidos.every((p) => p.t < 60_000)).toBe(true);
    expect(res.courses.map((c) => [c.attendance, c.grades])).toEqual([
      ["updated", "not_reached"], ["updated", "not_reached"], ["updated", "not_reached"],
      ["not_reached", "not_reached"], ["not_reached", "not_reached"],
    ]);
    expect(res.warnings.filter((w) => w.code === "REFRESH_BUDGET_EXCEEDED")).toEqual([{
      code: "REFRESH_BUDGET_EXCEEDED", block: "asistencia",
      message: "La lectura de miUlima tardó demasiado y algunos cursos quedaron sin leer.",
    }]);
    expect(a.cierres()).toBe(1);
  });

  test("el presupuesto agotado sin ningún curso leído responde 504", async () => {
    const a = armar({
      reloj: { t: 0, paso: 10_000 },
      paginas: Object.fromEntries(CURSOS.map((c) => [
        PORTAL_PATHS.asistenciaAlumno(c.aula), new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
      ])),
    });
    await expect(a.servicio.refresh(a.entrada({ recibidaEn: 0 }))).rejects.toMatchObject({
      statusCode: 504, code: "PORTAL_TIMEOUT",
    });
  });
});
```

En el segundo caso, la ronda de apertura pide sus tres páginas en t = 0, 10 000 y 20 000, y la fase de asistencia pide tres más en t = 30 000, 40 000 y 50 000. En t = 60 000 el presupuesto está agotado, así que las aulas 900104 y 900105 y todas las del panel Nota quedan sin pedir.

- [ ] **Paso 3. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.service.test.ts test/HU37_jeff/refresh.budget.test.ts
```

Se espera un fallo al cargar, porque `refresh.service.ts` no existe.

- [ ] **Paso 4. Sumar los códigos de aviso a `portal-sync.types.ts`**

En `WarningCode`, después de `| "PROGRESS_REMOVED"`, antes del `;`.

```ts
  // recarga-portal (RS-BE-56). La página de notas o el marco de un aula no se
  // pudo DESCARGAR, un curso de miUlima no tiene matrícula en ULima++, el
  // sílabo cargado no coincide con la ULima, el promedio de la ULima no cuadra
  // con sus notas y el presupuesto se agotó con cursos sin leer.
  | "NOTAS_UNAVAILABLE"
  | "NOT_ENROLLED"
  | "SYLLABUS_MISMATCH"
  | "PORTAL_AVERAGE_MISMATCH"
  | "REFRESH_BUDGET_EXCEEDED"
```

- [ ] **Paso 5. Sumar errores, atribución y registro a `refresh.logic.ts`**

Los imports de tipos pasan a

```ts
import type {
  AgregadoUlima, AsistenciaIdentificada, AulaMenu, EvaluacionUlima,
} from "../portal-sync.types.js";
import type { FalloPortal } from "./refresh.types.js";
```

y al final del archivo.

```ts
const PRECEDENCIA: readonly FalloPortal[] = [
  "PORTAL_SESSION_INVALID", "PORTAL_TIMEOUT", "PORTAL_UNAVAILABLE", "PORTAL_UNREADABLE",
];

const ERRORES: Record<FalloPortal, () => HttpError> = {
  PORTAL_SESSION_INVALID: () => new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID"),
  PORTAL_TIMEOUT: () => new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT"),
  PORTAL_UNAVAILABLE: () => new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
  PORTAL_UNREADABLE: () => new HttpError(502, "miUlima responde con páginas que ULima++ no sabe leer.", "PORTAL_UNREADABLE"),
};

/** RS-BE-56. El error HTTP de un fallo, con su mensaje fijo. */
export const errorDeFallo = (fallo: FalloPortal): HttpError => ERRORES[fallo]();

/** RS-BE-56. El error de una recarga sin ningún curso leído, por precedencia. */
export const errorSinCursos = (fallos: FalloPortal[]): HttpError =>
  errorDeFallo(PRECEDENCIA.find((f) => fallos.includes(f)) ?? "PORTAL_UNREADABLE");

/**
 * RS-BE-48, atribución. El curso y la sección de un aula salen, en este orden,
 * de los arreglos del menú, de la identificación verificada de su propia página
 * o de la de la misma aula en el otro panel. null si ninguna la da.
 */
export const parDeAula = (
  a: AulaMenu, propio: Map<string, AsistenciaIdentificada>, otro: Map<string, AsistenciaIdentificada>,
): AsistenciaIdentificada | null => {
  if (a.courseCode !== null && a.sectionCode !== null) return { courseCode: a.courseCode, sectionCode: a.sectionCode };
  return propio.get(a.aula) ?? otro.get(a.aula) ?? null;
};

/** Clave de un curso y su sección, para cruzar con las matrículas. */
export const clavePar = (p: { courseCode: string; sectionCode: string }): string => `${p.courseCode}|${p.sectionCode}`;

/** «de 690417/812» con curso conocido y «del aula 900101» sin él. Nunca `null`. */
export const deAula = (a: AulaMenu, par: AsistenciaIdentificada | null): string =>
  (par ? `de ${par.courseCode}/${par.sectionCode}` : `del aula ${a.aula}`);

/**
 * RS-BE-50, registro. Por fase, la duración en milisegundos, el número de
 * peticiones y sus estados HTTP. Nunca cuerpos, cookies, contraseña, código,
 * notas, nombres ni códigos de alumno: solo nombres de fase y números.
 */
export class RegistroFases {
  private readonly fases = new Map<string, { inicio: number; peticiones: number; estados: Record<string, number> }>();

  constructor(private readonly now: () => number, private readonly log: (linea: string) => void) {}

  empezar(fase: string): void {
    this.fases.set(fase, { inicio: this.now(), peticiones: 0, estados: {} });
  }

  anotar(fase: string, estado: string): void {
    const f = this.fases.get(fase);
    if (!f) return;
    f.peticiones++;
    f.estados[estado] = (f.estados[estado] ?? 0) + 1;
  }

  terminar(fase: string): void {
    const f = this.fases.get(fase);
    if (!f) return;
    this.log(`[portal-refresh] ${JSON.stringify({
      fase, ms: this.now() - f.inicio, peticiones: f.peticiones, estados: f.estados,
    })}`);
  }
}
```

- [ ] **Paso 6. Crear `refresh/refresh.service.ts`**

```ts
import { HttpError } from "../../../shared/errors/http-error.js";
import { PORTAL_PATHS, type PortalClient } from "../../../services/portal.client.js";
import type { UlimaGradesView } from "../../grades/grades.types.js";
import { parseCicloActivo } from "../parsers/index.js";
import { refreshInProgress, tooManyRejectedLogins, type PortalLoginGuard } from "../portal-login-guard.js";
import { resolveAttendanceHours } from "../portal-sync.repository.js";
import type { AsistenciaIdentificada, PortalCookies, SyncWarning } from "../portal-sync.types.js";
import { emparejarEvaluaciones, silaboNoCoincide } from "./emparejar.js";
import { leerAsistencia } from "./fase-asistencia.js";
import { leerNotas } from "./fase-notas.js";
import {
  RegistroFases, clavePar, deAula, errorDeFallo, errorSinCursos, falloDe, parDeAula, promedioNoCuadra,
} from "./refresh.logic.js";
import type { PortalRefreshRepository } from "./refresh.repository.js";
import type {
  EscrituraAsistencia, EscrituraNotas, EstadoAsistencia, EstadoNotas, FaseAsistencia, FaseNotas,
  MatriculaActiva, MenuDescargado, Pedir, RefreshInput, RefreshResult,
} from "./refresh.types.js";

/**
 * RS-BE-49 a RS-BE-56 · POST /portal-sync/refresh.
 *
 * Con un solo inicio de sesión en miUlima, lee la asistencia y las notas
 * parciales del alumno autenticado, fuera de la transacción, y guarda todo en
 * una sola transacción al final. Nunca crea período, curso, sección ni
 * matrícula, y nunca toca sílabos, récord, alertas, delegados, `student_score`
 * ni `simulated_grades`.
 */

/** Dependencias de la recarga. `index.ts` pasa las reales y las pruebas, dobles. */
export type RefreshDeps = {
  repository: PortalRefreshRepository;
  client: Pick<PortalClient, "login" | "fetchPage" | "logout">;
  guard: PortalLoginGuard;
  /** RS-BE-56. La vista de GET /grades/me/ulima, leída ya con lo guardado. */
  leerVista: (studentId: number) => Promise<UlimaGradesView>;
  /** RS-BE-50. `config.portal.refreshBudgetMs`, ya acotado por el timeout. */
  budgetMs: number;
  now?: () => number;
  log?: (linea: string) => void;
};

const ORDEN_ASISTENCIA: readonly EstadoAsistencia[] = ["updated", "skipped", "failed", "unavailable", "not_reached"];
const ORDEN_NOTAS: readonly EstadoNotas[] = ["read", "failed", "unavailable", "not_reached"];

const otroCiclo = (): HttpError =>
  new HttpError(409, "La ULima ya muestra otro ciclo. Carga tus datos del ciclo nuevo.", "IMPORT_REQUIRED");

const noMatriculado = (block: "asistencia" | "nota", donde: string): SyncWarning => ({
  code: "NOT_ENROLLED", block, message: `El curso ${donde} de miUlima no está en tu matrícula de ULima++.`,
});

const menuDe = (r: PromiseSettledResult<string>): MenuDescargado =>
  (r.status === "fulfilled" ? { ok: true, html: r.value } : { ok: false, fallo: falloDe(r.reason) });

/** El primer estado de `orden` que aparece entre los de las aulas atribuidas a la matrícula. */
const elegir = <E extends string>(estados: E[] | undefined, orden: readonly E[], sinAula: E): E =>
  orden.find((e) => estados?.includes(e)) ?? sinAula;

type Resumen = {
  avisos: SyncWarning[];
  asistencia: EscrituraAsistencia[];
  notas: EscrituraNotas[];
  estadosAsistencia: Map<number, EstadoAsistencia[]>;
  estadosNotas: Map<number, EstadoNotas[]>;
  contadores: Pick<RefreshResult, "attendance" | "grades">;
  leidas: Date[];
};

export class PortalRefreshService {
  private readonly now: () => number;
  private readonly log: (linea: string) => void;

  constructor(private readonly deps: RefreshDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.log = deps.log ?? ((linea) => console.info(linea));
  }

  async refresh(entrada: RefreshInput): Promise<RefreshResult> {
    const { userId, studentId, rastro } = entrada;
    const { repository, client, guard } = this.deps;
    // RS-BE-50. El presupuesto cuenta desde que el controlador recibe la
    // petición y cubre también el inicio de sesión.
    const deadline = entrada.recibidaEn + this.deps.budgetMs;

    // RS-BE-49. Condiciones previas, antes de tocar el portal y en este orden.
    const contexto = await repository.findRefreshContext(studentId);
    if (!contexto.period || !contexto.matriculas.length) {
      throw new HttpError(409, "Primero carga tus datos del ciclo.", "IMPORT_REQUIRED");
    }
    const ciclo = contexto.period.code;
    const userCode = await repository.findUserCode(userId);
    if (!userCode) throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
    if (!guard.tryStart(studentId, "refresh")) throw refreshInProgress();
    try {
      const espera = guard.rejectedLoginsWait(studentId);
      if (espera !== null) throw tooManyRejectedLogins(espera);

      const registro = new RegistroFases(this.now, this.log);
      // Desde acá la recarga ya envía peticiones al portal, y el limitador solo
      // devuelve el cupo ante un rechazo (RS-BE-50).
      rastro.portalTocado = true;
      const cookies = await this.iniciarSesion(entrada, userCode, deadline, registro);
      try {
        return await this.leerYGuardar(studentId, userCode, ciclo, contexto.matriculas, cookies, deadline, registro);
      } finally {
        // Siempre que exista una sesión, con éxito, con error o sin presupuesto.
        await client.logout(cookies);
      }
    } finally {
      guard.finish(studentId, "refresh");
    }
  }

  /**
   * RS-BE-49. Una sola llamada a `PortalClient.login`, con el plazo de RS-BE-50.
   * El usuario del portal nunca viene del cliente, y la contraseña y el código
   * se usan en esta llamada y se descartan. Un rechazo suma al tope compartido.
   */
  private async iniciarSesion(
    entrada: RefreshInput, userCode: string, deadline: number, registro: RegistroFases,
  ): Promise<PortalCookies> {
    registro.empezar("login");
    try {
      const cookies = await this.deps.client.login(
        userCode, entrada.credentials.password, entrada.credentials.passcode, { deadline },
      );
      registro.anotar("login", "200");
      return cookies;
    } catch (e) {
      registro.anotar("login", e instanceof HttpError ? String(e.statusCode) : "error");
      if (e instanceof HttpError && e.code === "PORTAL_LOGIN_REJECTED") this.deps.guard.recordRejectedLogin(entrada.studentId);
      throw e;
    } finally {
      registro.terminar("login");
    }
  }

  private async leerYGuardar(
    studentId: number, userCode: string, ciclo: string, matriculas: MatriculaActiva[],
    cookies: PortalCookies, deadline: number, registro: RegistroFases,
  ): Promise<RefreshResult> {
    const { client, repository } = this.deps;
    const pedirEn = (fase: string): Pedir => async (path, opciones) => {
      try {
        const html = await client.fetchPage(path, cookies, opciones);
        registro.anotar(fase, "200");
        return html;
      } catch (e) {
        registro.anotar(fase, e instanceof HttpError ? String(e.statusCode) : "error");
        throw e;
      }
    };

    // RS-BE-49. Ronda de apertura, antes de leer ningún curso.
    if (this.now() >= deadline) throw errorDeFallo("PORTAL_TIMEOUT");
    registro.empezar("apertura");
    const apertura = pedirEn("apertura");
    const [layout, menuAsistencia, menuNota] = await Promise.allSettled([
      apertura(PORTAL_PATHS.layout),
      apertura(PORTAL_PATHS.cursosAsistencia),
      apertura(PORTAL_PATHS.cursosNota),
    ]);
    registro.terminar("apertura");
    if (layout.status === "rejected") throw layout.reason;
    const cicloPortal = parseCicloActivo(layout.value);
    if (!cicloPortal.ok) throw errorDeFallo("PORTAL_UNREADABLE");
    // Decisión abierta 19. La página de notas y su marco no traen ciclo.
    if (cicloPortal.data.periodCode !== ciclo) throw otroCiclo();

    // RS-BE-51. La asistencia va primero porque su mapa contrasta el panel Nota.
    registro.empezar("asistencia");
    const asistencia = await leerAsistencia(
      { pedir: pedirEn("asistencia"), now: this.now, deadline }, menuDe(menuAsistencia), userCode, ciclo,
    );
    registro.terminar("asistencia");
    if (asistencia.identityMismatch) {
      throw new HttpError(403, "La cuenta de miUlima no corresponde a tu usuario.", "PORTAL_IDENTITY_MISMATCH");
    }
    if (asistencia.otroCiclo) throw otroCiclo();

    // RS-BE-52 y RS-BE-53.
    registro.empezar("notas");
    const notas = await leerNotas(
      { pedir: pedirEn("notas"), now: this.now, deadline }, menuDe(menuNota), asistencia.identificadas,
    );
    registro.terminar("notas");

    const resumen = await this.resumir(matriculas, asistencia, notas);
    const asistenciaSinPedir = asistencia.aulas.some((x) => x.estado === "not_reached");
    const notasSinPedir = notas.aulas.some((x) => x.estado === "not_reached");
    // RS-BE-56. Sin ningún curso leído, el código sale de los fallos vistos por
    // precedencia, y no se escribe nada.
    if (!resumen.leidas.length) {
      throw errorSinCursos([
        ...asistencia.fallos, ...notas.fallos,
        ...(asistenciaSinPedir || notasSinPedir ? ["PORTAL_TIMEOUT" as const] : []),
      ]);
    }
    if (asistenciaSinPedir || notasSinPedir) {
      resumen.avisos.push({
        code: "REFRESH_BUDGET_EXCEEDED", block: asistenciaSinPedir ? "asistencia" : "nota",
        message: "La lectura de miUlima tardó demasiado y algunos cursos quedaron sin leer.",
      });
    }

    // RS-BE-55. Una sola transacción al final, con el candado primero.
    if (resumen.asistencia.length || resumen.notas.length) {
      registro.empezar("transaccion");
      await repository.runInTransaction(async (tx) => {
        await repository.lockRefresh(tx, studentId);
        for (const e of resumen.asistencia) {
          await repository.updateAttendanceHours(tx, e.enrollmentId, e.horas, e.leidaEn.toISOString());
        }
        for (const e of resumen.notas) {
          // Solo si la hora de las notas avanza se reemplazan las filas.
          if (await repository.markGradesRead(tx, e.enrollmentId, e.leidaEn.toISOString())) {
            await repository.replacePortalScores(tx, e.enrollmentId, e.filas);
          }
        }
      });
      registro.terminar("transaccion");
    }

    const guardadas = [...resumen.asistencia, ...resumen.notas].map((e) => e.leidaEn.getTime());
    const instantes = guardadas.length ? guardadas : resumen.leidas.map((d) => d.getTime());
    return {
      readAt: new Date(Math.max(...instantes)).toISOString(),
      attendance: resumen.contadores.attendance,
      grades: resumen.contadores.grades,
      courses: matriculas.map((m) => ({
        sectionId: m.sectionId,
        courseCode: m.courseCode,
        sectionCode: m.sectionCode,
        attendance: elegir(resumen.estadosAsistencia.get(m.enrollmentId), ORDEN_ASISTENCIA,
          asistenciaSinPedir ? "not_reached" : "missing"),
        grades: elegir(resumen.estadosNotas.get(m.enrollmentId), ORDEN_NOTAS, notasSinPedir ? "not_reached" : "missing"),
      })),
      view: await this.deps.leerVista(studentId),
      warnings: resumen.avisos,
    };
  }

  /**
   * RS-BE-48, RS-BE-54 y RS-BE-56. Atribuye cada aula a su matrícula, arma los
   * avisos al final, en el orden de cada menú, y decide qué se escribe.
   *
   * Los contadores cuentan aulas de cada menú. Un curso leído sin matrícula en
   * ULima++ no se escribe, no suma a ningún contador y lleva su aviso
   * NOT_ENROLLED.
   */
  private async resumir(matriculas: MatriculaActiva[], asistencia: FaseAsistencia, notas: FaseNotas): Promise<Resumen> {
    const porClave = new Map(matriculas.map((m) => [clavePar(m), m]));
    const r: Resumen = {
      avisos: [], asistencia: [], notas: [], estadosAsistencia: new Map(), estadosNotas: new Map(),
      contadores: {
        attendance: { updated: 0, skipped: 0, failed: 0, unavailable: 0 },
        grades: { read: 0, failed: 0, unavailable: 0, withValue: 0 },
      },
      leidas: [],
    };
    const { attendance, grades } = r.contadores;
    const anotar = <E>(mapa: Map<number, E[]>, par: AsistenciaIdentificada | null, estado: E): void => {
      const m = par ? porClave.get(clavePar(par)) : undefined;
      if (m) mapa.set(m.enrollmentId, [...(mapa.get(m.enrollmentId) ?? []), estado]);
    };

    if (asistencia.menu === "unavailable") {
      r.avisos.push({ code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: "No se pudo abrir el panel de asistencia en miUlima." });
    }
    if (asistencia.menu === "unreadable") {
      r.avisos.push({ code: "PARSER_FAILED", block: "asistencia", message: "No se entendió el menú de asistencia de miUlima." });
    }
    for (const x of asistencia.aulas) {
      if (x.estado === "leida") {
        r.leidas.push(x.leidaEn);
        // RS-BE-51, punto 5. La matrícula sale del par que declara la página.
        const par = { courseCode: x.datos.courseCode, sectionCode: x.datos.sectionCode };
        const donde = `${par.courseCode}/${par.sectionCode}`;
        const m = porClave.get(clavePar(par));
        if (!m) {
          r.avisos.push(noMatriculado("asistencia", donde));
          continue;
        }
        const horas = resolveAttendanceHours(x.datos);
        if (!horas.ok) {
          attendance.skipped++;
          anotar(r.estadosAsistencia, par, "skipped");
          r.avisos.push({
            code: "PARSER_FAILED", block: "asistencia", message: `No se escribió la asistencia de ${donde}: ${horas.reason}.`,
          });
          continue;
        }
        // Una fila que luego salta la guarda de lectura más reciente también
        // cuenta como updated, porque ya tiene horas más nuevas (decisión 5).
        attendance.updated++;
        anotar(r.estadosAsistencia, par, "updated");
        r.asistencia.push({ enrollmentId: m.enrollmentId, horas: horas.hours, leidaEn: x.leidaEn });
        continue;
      }
      const par = parDeAula(x.aula, asistencia.identificadas, notas.identificadas);
      if (x.estado === "unavailable") {
        attendance.unavailable++;
        anotar(r.estadosAsistencia, par, "unavailable");
        r.avisos.push({
          code: "ASISTENCIA_UNAVAILABLE", block: "asistencia", message: `No se pudo traer la asistencia ${deAula(x.aula, par)}.`,
        });
      } else if (x.estado === "failed") {
        attendance.failed++;
        anotar(r.estadosAsistencia, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "asistencia", message: `No se entendió la asistencia ${deAula(x.aula, par)}: ${x.motivo}`,
        });
      } else if (x.estado === "contraste") {
        attendance.failed++;
        anotar(r.estadosAsistencia, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "asistencia",
          message: `La sección del menú no coincide con la de la página de asistencia del aula ${x.aula.aula}.`,
        });
      } else {
        anotar(r.estadosAsistencia, par, "not_reached");
      }
    }

    if (notas.menu === "unavailable") {
      r.avisos.push({ code: "NOTAS_UNAVAILABLE", block: "nota", message: "No se pudo abrir el panel de notas en miUlima." });
    }
    if (notas.menu === "unreadable") {
      r.avisos.push({ code: "PARSER_FAILED", block: "nota", message: "No se entendió el menú de notas de miUlima." });
    }
    for (const x of notas.aulas) {
      if (x.estado === "leida") {
        r.leidas.push(x.leidaEn);
        const donde = `${x.par.courseCode}/${x.par.sectionCode}`;
        const m = porClave.get(clavePar(x.par));
        if (!m) {
          r.avisos.push(noMatriculado("nota", donde));
          continue;
        }
        grades.read++;
        if (x.evaluaciones.some((e) => e.mark === "graded")) grades.withValue++;
        anotar(r.estadosNotas, x.par, "read");
        // RS-BE-54. Las candidatas de cada matrícula se piden por separado y
        // nunca se juntan con las de otro curso.
        const silabo = await this.deps.repository.findSyllabusCandidates(m.enrollmentId);
        const filas = emparejarEvaluaciones(x.evaluaciones, silabo);
        if (silaboNoCoincide(filas, silabo)) {
          r.avisos.push({
            code: "SYLLABUS_MISMATCH", block: "nota",
            message: `El sílabo cargado en ULima++ no coincide con las evaluaciones de la ULima en ${donde}.`,
          });
        }
        // RS-BE-53, punto 7. Sin ninguna cifra en el mensaje, y el curso se guarda igual.
        if (promedioNoCuadra(x.evaluaciones, x.agregados)) {
          r.avisos.push({
            code: "PORTAL_AVERAGE_MISMATCH", block: "nota",
            message: `El promedio que publica la ULima no coincide con sus evaluaciones en ${donde}.`,
          });
        }
        r.notas.push({ enrollmentId: m.enrollmentId, filas, leidaEn: x.leidaEn });
        continue;
      }
      const par = parDeAula(x.aula, notas.identificadas, asistencia.identificadas);
      if (x.estado === "unavailable") {
        grades.unavailable++;
        anotar(r.estadosNotas, par, "unavailable");
        r.avisos.push({ code: "NOTAS_UNAVAILABLE", block: "nota", message: `No se pudieron traer las notas ${deAula(x.aula, par)}.` });
      } else if (x.estado === "failed") {
        grades.failed++;
        anotar(r.estadosNotas, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "nota", message: `No se entendieron las notas ${deAula(x.aula, par)}: ${x.motivo}`,
        });
      } else if (x.estado === "contraste") {
        grades.failed++;
        anotar(r.estadosNotas, par, "failed");
        r.avisos.push({
          code: "PARSER_FAILED", block: "nota", message: `El curso del aula ${x.aula.aula} no coincide entre los paneles de miUlima.`,
        });
      } else {
        anotar(r.estadosNotas, par, "not_reached");
      }
    }
    return r;
  }
}
```

- [ ] **Paso 7. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.service.test.ts test/HU37_jeff/refresh.budget.test.ts
```

Se esperan 35 pruebas nuevas en verde (32 del servicio y 3 del presupuesto) y las 3 de presupuesto de las Tareas 16 y 17.

- [ ] **Paso 8. Build y suite completa en segundo plano** con `tarea-18.log`. Se espera `0 fail`, `EXIT=0` y 35 pruebas más que en la Tarea 17.

- [ ] **Paso 9. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/portal-sync.types.ts src/modules/portal-sync/refresh/refresh.logic.ts src/modules/portal-sync/refresh/refresh.service.ts test/HU37_jeff/recarga.servicio.ts test/HU37_jeff/refresh.service.test.ts test/HU37_jeff/refresh.budget.test.ts && git commit -m "feat(recarga-portal): servicio de la recarga con un solo inicio de sesión (RS-BE-49 a RS-BE-56)" -m "El servicio revisa las condiciones previas antes de tocar el portal, inicia sesión una vez con el plazo del presupuesto, lee layout.jsp y los dos menús en una ronda, corta ante otro ciclo o un código de alumno ajeno, lee la asistencia y las notas, atribuye cada aula por la regla de RS-BE-48, empareja con el sílabo de cada matrícula y guarda todo en una transacción con candado. La respuesta trae los contadores, el estado de cada matrícula, la vista de las notas y los avisos, y sin ningún curso leído responde el error por precedencia."
```

---

### Tarea 19. `POST /portal-sync/refresh` con su esquema estricto y su composición

**Archivos.**
- Modificar `src/modules/portal-sync/portal-sync.schemas.ts`, `portal-sync.controller.ts`, `portal-sync.routes.ts` e `index.ts`.
- Pruebas `test/HU37_jeff/refresh.schemas.test.ts` y `test/HU37_jeff/refresh.routes.test.ts`.

**Interfaces.**
- Consume `PortalRefreshService` (Tarea 18), `PortalRefreshRepository` (Tarea 13), `portalRefreshRateLimit`, `REFRESH_TRACE_KEY` y `RefreshTrace` (Tarea 10), `portalLoginGuard` (Tarea 9), `gradesService` (Tarea 14) y `config.portal.refreshBudgetMs` (Tarea 2).
- Produce `export const refreshSchema` (estricto, `{ credentials: { password; passcode }, consent: true }`), `export type RefreshDto`, `new PortalSyncController(service, refreshService)` con `refresh(c)`, y la ruta `POST /portal-sync/refresh` con `authMiddleware`, `requireRole(...STUDENT_ROLES)` y `portalRefreshRateLimit`. La respuesta `200` lleva `Cache-Control: no-store`.

- [ ] **Paso 1. Escribir las pruebas que fallan**

`test/HU37_jeff/refresh.schemas.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { refreshSchema } from "../../src/modules/portal-sync/portal-sync.schemas.js";

/** RS-BE-49 · cuerpo de POST /portal-sync/refresh, en modo estricto. Credenciales ficticias. */
const VALIDO = { credentials: { password: "clave-sintetica", passcode: "123456" }, consent: true };
const acepta = (cuerpo: unknown) => refreshSchema.safeParse(cuerpo).success;

describe("RS-BE-49 · cuerpo de la recarga", () => {
  test("acepta las credenciales con consent true, con código de 6 a 8 dígitos", () => {
    expect(acepta(VALIDO)).toBe(true);
    expect(acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, passcode: "12345678" } })).toBe(true);
  });

  test("consent tiene que ser el literal true", () => {
    for (const consent of [false, "true", 1, undefined]) expect(acepta({ ...VALIDO, consent })).toBe(false);
  });

  test("no existe la variante con cookies", () => {
    expect(acepta({ ...VALIDO, cookies: { JSESSIONID: "a", LtpaToken2: "b" } })).toBe(false);
    expect(acepta({ cookies: { JSESSIONID: "a", LtpaToken2: "b" }, consent: true })).toBe(false);
  });

  test("una clave de más, afuera o dentro de credentials, se rechaza", () => {
    expect(acepta({ ...VALIDO, extra: 1 })).toBe(false);
    expect(acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, usuario: "20230001" } })).toBe(false);
  });

  test("un código del autenticador mal formado se rechaza", () => {
    for (const passcode of ["12345", "123456789", "12a456", ""]) {
      expect(acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, passcode } })).toBe(false);
    }
  });

  test("la contraseña mide de 1 a 200 caracteres", () => {
    const con = (password: string) => acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, password } });
    expect(con("")).toBe(false);
    expect(con("x".repeat(200))).toBe(true);
    expect(con("x".repeat(201))).toBe(false);
  });
});
```

`test/HU37_jeff/refresh.routes.test.ts`

```ts
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import jwt from "jsonwebtoken";

/**
 * RS-BE-49 y RS-BE-56 · POST /portal-sync/refresh visto desde HTTP, con las
 * rutas, el controlador y el limitador reales y un servicio falso. La base es
 * falsa y solo contesta token_version, y `mock.module` va antes de importar las
 * rutas. Alumnos del rango 93xx, porque el almacén del limitador es de módulo.
 */
mock.module("../../src/db/index.js", () => ({ db: { execute: async () => [{ token_version: 1 }] } }));

const { createPortalSyncRoutes } = await import("../../src/modules/portal-sync/portal-sync.routes.js");
const { PortalSyncController } = await import("../../src/modules/portal-sync/portal-sync.controller.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");
const { HttpError } = await import("../../src/shared/errors/http-error.js");

type Llamada = {
  userId: number; studentId: number; credentials: unknown; recibidaEn: number; rastro: { portalTocado: boolean };
};
const RESULTADO = {
  readAt: "2026-09-25T15:42:10.000Z",
  attendance: { updated: 5, skipped: 0, failed: 0, unavailable: 0 },
  grades: { read: 5, failed: 0, unavailable: 0, withValue: 0 },
  courses: [],
  view: { lastReadAt: null, courses: [] },
  warnings: [],
};
const llamadas: Llamada[] = [];
let respuesta: (e: Llamada) => Promise<unknown> = async () => RESULTADO;
const recarga = {
  refresh: async (e: Llamada) => {
    llamadas.push(e);
    return respuesta(e);
  },
};

const app = new Hono();
app.onError(errorHandler);
app.route("/portal-sync", createPortalSyncRoutes(new PortalSyncController({} as never, recarga as never)));

const VALIDO = { credentials: { password: "clave-sintetica", passcode: "123456" }, consent: true };
const token = (studentId: number) =>
  jwt.sign({ sub: "7", studentId, role: "student", tokenVersion: 1 }, config.auth.jwtSecret);
const post = (tok: string, cuerpo: unknown) => app.request("/portal-sync/refresh", {
  method: "POST",
  headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
  body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
});

describe("POST /portal-sync/refresh", () => {
  test("200 con el resultado del servicio, Cache-Control no-store y el cupo que queda", async () => {
    respuesta = async () => RESULTADO;
    const res = await post(token(9301), VALIDO);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULTADO);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
  });

  test("la cuenta y el alumno salen del token, y el presupuesto cuenta desde que llega la petición", async () => {
    respuesta = async () => RESULTADO;
    const antes = Date.now();
    await post(token(9302), VALIDO);
    const despues = Date.now();
    const e = llamadas.at(-1)!;
    expect([e.userId, e.studentId]).toEqual([7, 9302]);
    expect(e.credentials).toEqual(VALIDO.credentials);
    expect(e.recibidaEn).toBeGreaterThanOrEqual(antes);
    expect(e.recibidaEn).toBeLessThanOrEqual(despues);
    expect(e.rastro).toEqual({ portalTocado: false });
  });

  test("un cuerpo inválido responde 400 sin llamar al servicio y devuelve el cupo", async () => {
    const previas = llamadas.length;
    const res = await post(token(9303), { ...VALIDO, consent: false });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_REQUEST_BODY");
    expect(llamadas.length).toBe(previas);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("5");
  });

  test("un JSON ilegible responde 400 INVALID_JSON_BODY", async () => {
    const res = await post(token(9304), "{no es json");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_JSON_BODY");
  });

  test("un token docente recibe 403", async () => {
    const docente = jwt.sign({ sub: "9", teacherId: 3, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);
    expect((await post(docente, VALIDO)).status).toBe(403);
  });

  test("un rechazo del portal sale como 409, nunca 401, y devuelve el cupo", async () => {
    respuesta = async (e) => {
      e.rastro.portalTocado = true;
      throw new HttpError(409, "miUlima rechazó los datos.", "PORTAL_LOGIN_REJECTED");
    };
    const res = await post(token(9305), VALIDO);
    expect(res.status).toBe(409);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("5");
  });

  test("la respuesta nunca repite las credenciales", async () => {
    respuesta = async () => RESULTADO;
    const texto = await (await post(token(9306), VALIDO)).text();
    expect(texto).not.toContain("clave-sintetica");
    expect(texto).not.toContain("123456");
  });
});
```

- [ ] **Paso 2. Correr las pruebas y verlas fallar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.schemas.test.ts test/HU37_jeff/refresh.routes.test.ts
```

Se espera que `refreshSchema` no exista y que la ruta responda `404`.

- [ ] **Paso 3. Esquema en `portal-sync.schemas.ts`**

Los campos de las credenciales pasan a un objeto compartido, y `credentialsObject` los usa como hoy.

```ts
/** Campos de las credenciales de miUlima, que comparten la importación y la recarga. */
const credentialFields = {
  password: z.string().min(1).max(200),
  // RSA SecurID a través de Google Authenticator: 6 dígitos. Se aceptan 6 a 8
  // por si alguna cuenta usa un largo distinto; cualquier cosa que no sean
  // dígitos se rechaza antes de tocar el portal.
  passcode: z.string().regex(/^\d{6,8}$/, "El código del authenticator son 6 dígitos"),
};

const credentialsObject = z.object(credentialFields).strip();
```

Al final del archivo.

```ts
/**
 * RS-BE-49. Cuerpo de POST /portal-sync/refresh, en modo ESTRICTO. Lleva la
 * contraseña, así que no se acepta nada que no se use: una clave de más, o la
 * variante con `cookies`, responde 400. `consent` es el literal true, porque
 * el alumno acepta el aviso de la hoja en cada recarga (decisión abierta 4).
 * El usuario del portal no viaja, sale de `app_user.code`.
 */
export const refreshSchema = z.object({
  credentials: z.object(credentialFields).strict(),
  consent: z.literal(true),
}).strict();

export type RefreshDto = z.infer<typeof refreshSchema>;
```

- [ ] **Paso 4. Controlador**

`portal-sync.controller.ts` importa el esquema, el rastro y el servicio, y suma el método.

```ts
import { REFRESH_TRACE_KEY, type RefreshTrace } from "../../shared/middleware/rate-limit.js";
import { importSchema, refreshSchema } from "./portal-sync.schemas.js";
import type { PortalRefreshService } from "./refresh/refresh.service.js";
```

```ts
  constructor(readonly service: PortalSyncService, readonly refreshService: PortalRefreshService) {}
```

```ts
  async refresh(c: Context) {
    // RS-BE-50. El presupuesto cuenta desde que el controlador recibe la petición.
    const recibidaEn = Date.now();
    // El limitador deja el rastro antes de llegar acá. Sin limitador, uno propio.
    const rastro = (c.get(REFRESH_TRACE_KEY) as RefreshTrace | undefined) ?? { portalTocado: false };
    // El cuerpo NUNCA se registra: lleva la contraseña de miUlima del alumno.
    const { credentials } = await validateJson(c, refreshSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    const resultado = await this.refreshService.refresh({ userId, studentId, credentials, recibidaEn, rastro });
    c.header("Cache-Control", "no-store");
    return c.json(resultado);
  }
```

- [ ] **Paso 5. Ruta**

En `portal-sync.routes.ts`, el import del limitador suma `portalRefreshRateLimit`, y después de la ruta de la importación.

```ts
  // RS-BE-49. Recarga de asistencia y notas parciales con un solo inicio de sesión.
  app.post("/refresh", portalRefreshRateLimit, (c) => controller.refresh(c));
```

- [ ] **Paso 6. Composición en `portal-sync/index.ts`**

```ts
import { config } from "../../config/app-config.js";
import { gradesService } from "../grades/index.js";
import { PortalRefreshRepository } from "./refresh/refresh.repository.js";
import { PortalRefreshService } from "./refresh/refresh.service.js";
```

```ts
// RS-BE-49. La recarga comparte con la importación la guarda de inicio de
// sesión y el tope de rechazos (una sola instancia) y devuelve en `view` la
// vista de GET /grades/me/ulima.
const portalRefreshService = new PortalRefreshService({
  repository: new PortalRefreshRepository(db),
  client: portalClient,
  guard: portalLoginGuard,
  leerVista: (studentId) => gradesService.getUlimaGrades(studentId),
  budgetMs: config.portal.refreshBudgetMs,
});
const portalSyncController = new PortalSyncController(portalSyncService, portalRefreshService);
```

La línea `const portalSyncController = new PortalSyncController(portalSyncService);` desaparece. Al final del archivo, `export { PortalRefreshService } from "./refresh/refresh.service.js";`.

- [ ] **Paso 7. Correr las pruebas y verlas pasar**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.schemas.test.ts test/HU37_jeff/refresh.routes.test.ts test/HU31_jeff/schemas.import.test.ts
```

Se esperan 13 pruebas nuevas en verde y las del esquema de la importación, que no cambian.

- [ ] **Paso 8. Build y suite completa en segundo plano** con `tarea-19.log`. Se espera `0 fail`, `EXIT=0` y 13 pruebas más que en la Tarea 18.

- [ ] **Paso 9. Commit**

```bash
cd "${REPO:?}" && git add src/modules/portal-sync/portal-sync.schemas.ts src/modules/portal-sync/portal-sync.controller.ts src/modules/portal-sync/portal-sync.routes.ts src/modules/portal-sync/index.ts test/HU37_jeff/refresh.schemas.test.ts test/HU37_jeff/refresh.routes.test.ts && git commit -m "feat(recarga-portal): POST /portal-sync/refresh con su esquema estricto y su cupo (RS-BE-49, RS-BE-56)" -m "La ruta valida el cuerpo en modo estricto, con consent true y sin la variante de cookies, toma al alumno del token y pasa al servicio el instante en que llega la petición y el rastro del limitador. La composición comparte con la importación la guarda y el tope, e inyecta la vista de GET /grades/me/ulima. La respuesta lleva Cache-Control no-store."
```

---

### Tarea 20. Privacidad y minimización

**Archivos.**
- Prueba `test/HU37_jeff/refresh.privacidad.test.ts`.

**Interfaces.**
- Consume los lectores (Tareas 5 a 8), los dobles (Tareas 16 y 18) y el registro por fase (Tarea 18).
- Produce solo la prueba. Es una prueba de guarda sobre código que ya existe, así que su rojo se siembra a propósito en el Paso 2 y se deshace en el Paso 3.

- [ ] **Paso 1. Escribir la prueba**

`test/HU37_jeff/refresh.privacidad.test.ts`

```ts
import { describe, expect, spyOn, test } from "bun:test";
import { parseAsistenciaCurso } from "../../src/modules/portal-sync/parsers/asistencia.js";
import { parseDetalleEvaluaciones, parseNotaCurso } from "../../src/modules/portal-sync/parsers/nota.js";
import { emparejarEvaluaciones } from "../../src/modules/portal-sync/refresh/emparejar.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HOJAS, PAGINA_ASISTENCIA, PAGINA_NOTA, marco } from "./recarga.dobles.js";
import { armar } from "./recarga.servicio.js";

/**
 * RS-BE-59 · privacidad y minimización de la recarga. Los lectores devuelven
 * solo los campos de su tipo, ningún registro lleva credenciales, cookies,
 * notas, nombres ni HTML, y los fixtures nuevos solo traen datos inventados.
 */

describe("RS-BE-59 · minimización", () => {
  test("cada lector devuelve exactamente los campos de su tipo", () => {
    const curso = parseNotaCurso(PAGINA_NOTA, "900101");
    expect(curso.ok && Object.keys(curso.data).sort()).toEqual(["agregados", "courseCode", "sectionCode"]);
    expect(curso.ok && Object.keys(curso.data.agregados[0]!).sort()).toEqual(["clave", "etiqueta", "valor"]);
    const tabla = parseDetalleEvaluaciones(marco());
    expect(tabla.ok && Object.keys(tabla.data[0]!).sort()).toEqual(["group", "key", "mark", "name", "value", "week", "weight"]);
    const asistencia = parseAsistenciaCurso(PAGINA_ASISTENCIA, "900101", "20230001", "2026-2");
    expect(asistencia.ok && Object.keys(asistencia.data).sort()).toEqual([
      "absentHours", "attendedHours", "courseCode", "sectionCode", "totalHours",
    ]);
    const emparejada = emparejarEvaluaciones(tabla.ok ? tabla.data : [], []);
    expect(Object.keys(emparejada[0]!).sort()).toEqual([
      "assessmentId", "group", "key", "mark", "match", "name", "value", "week", "weight",
    ]);
  });

  test("ningún registro de la recarga contiene credenciales, cookies, notas, nombres ni HTML", async () => {
    const lineas: string[] = [];
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((metodo) =>
      spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        lineas.push(args.map(String).join(" "));
      }));
    try {
      const a = armar({
        log: (linea) => lineas.push(linea),
        paginas: {
          [PORTAL_PATHS.tareaAcademica("900101")]: marco(HOJAS.map((h, i) => ({ ...h, nota: i === 0 ? "14.5" : "" }))),
          [PORTAL_PATHS.asistenciaAlumno("900102")]: "<html><body>otra cosa</body></html>",
        },
      });
      await a.servicio.refresh(a.entrada({ credentials: { password: "Clave-Secreta-Prueba", passcode: "654321" } }));
    } finally {
      for (const espia of espias) espia.mockRestore();
    }
    expect(lineas.length).toBeGreaterThan(0);
    const todo = lineas.join("\n");
    for (const prohibido of [
      "Clave-Secreta-Prueba", "654321", "sesion-de-prueba", "ltpa-de-prueba", "14.5",
      "Examen escrito", "TALLER", "PRUEBA RAMOS", "20230001", "<",
    ]) {
      expect(todo).not.toContain(prohibido);
    }
  });

  test("los fixtures nuevos solo traen los códigos inventados de la spec", async () => {
    const permitidos = new Set([
      "20230001", "690417", "690418", "690419", "690420", "690421",
      "900101", "900102", "900103", "900104", "900105",
    ]);
    const archivos = [
      ...new Bun.Glob("test/HU37_jeff/fixtures/*.html").scanSync("."),
      "test/HU31_jeff/fixtures/menu-lista-nota.html",
    ];
    expect(archivos).toHaveLength(7);
    for (const ruta of archivos) {
      const texto = await Bun.file(ruta).text();
      expect(texto).toContain("FIXTURE ARMADO A MANO");
      for (const numero of texto.match(/\b\d{6,10}\b/g) ?? []) expect(permitidos.has(numero)).toBe(true);
    }
  });
});
```

- [ ] **Paso 2. Correr la prueba y sembrar el rojo del registro**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.privacidad.test.ts
```

Se esperan 3 pruebas en verde. Para ver que la segunda muerde, en `src/modules/portal-sync/refresh/refresh.service.ts`, justo después de `rastro.portalTocado = true;`, se agrega de forma temporal la línea `this.log(\`[portal-refresh] ${entrada.credentials.password}\`);`, se corre la misma orden y la segunda prueba tiene que fallar por `Clave-Secreta-Prueba`.

- [ ] **Paso 3. Deshacer el rojo sembrado y confirmar el verde**

```bash
cd "${REPO:?}" && git checkout -- src/modules/portal-sync/refresh/refresh.service.ts && git status --short && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.privacidad.test.ts
```

`git status --short` solo puede mostrar el archivo nuevo de la prueba (`?? test/HU37_jeff/refresh.privacidad.test.ts`), y la prueba vuelve a 3 en verde.

- [ ] **Paso 4. Build y suite completa en segundo plano** con `tarea-20.log`. Se espera `0 fail`, `EXIT=0` y 3 pruebas más que en la Tarea 19.

- [ ] **Paso 5. Commit**

```bash
cd "${REPO:?}" && git add test/HU37_jeff/refresh.privacidad.test.ts && git commit -m "test(recarga-portal): la recarga no registra credenciales, cookies, notas ni nombres (RS-BE-59)" -m "Cada lector devuelve solo los campos de su tipo, un registrador espía recorre una recarga entera sin encontrar la contraseña, el código, las cookies, una nota, un nombre ni HTML, y los fixtures nuevos solo traen los códigos inventados de la spec."
```

---

### Tarea 21. La `0015` y los repositorios de la recarga contra un PostgreSQL local (opcional)

**Archivos.**
- Prueba `test/HU37_jeff/refresh.postgres.test.ts`.

**Interfaces.**
- Consume la migración (Tarea 1), `PortalRefreshRepository` (Tarea 13) y `GradesRepository.findUlimaGrades` con `construirVistaUlima` (Tarea 14).
- Produce solo la prueba. Sin `TEST_DATABASE_URL` se salta entera, así que `bun test` no toca ninguna base. Existe porque la clase de fallo que este backend ya sufre dos veces (el 42809 de un arreglo interpolado y un parámetro sin tipo) solo la produce Postgres.

- [ ] **Paso 1. Escribir la prueba**

`test/HU37_jeff/refresh.postgres.test.ts`

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { GradesRepository } from "../../src/modules/grades/grades.repository.js";
import { construirVistaUlima } from "../../src/modules/grades/grades-ulima.logic.js";
import type { EvaluacionEmparejada } from "../../src/modules/portal-sync/portal-sync.types.js";
import { PortalRefreshRepository } from "../../src/modules/portal-sync/refresh/refresh.repository.js";

/**
 * RS-BE-55 y RS-BE-57 contra un PostgreSQL de verdad.
 *
 * Solo corre con TEST_DATABASE_URL, y sin ella se salta entera. Con ella exige
 * que el host sea local (localhost, 127.0.0.1 o ::1), para que nunca llegue a
 * Neon ni a otra base remota, y que la base esté vacía. Todo corre en UNA
 * transacción que se deshace al final, con un savepoint por prueba. Adentro
 * crea las tablas mínimas que tocan las consultas, aplica la 0015 dos veces (la
 * segunda prueba que es idempotente) y siembra datos inventados.
 *
 * Cómo correrla con un Postgres desechable (producción es PostgreSQL 17; el 16
 * de Homebrew también sirve):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres recarga
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/recarga \
 *     bun test test/HU37_jeff/refresh.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 */

const URL_DE_PRUEBA = process.env.TEST_DATABASE_URL ?? "";
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const esBaseLocal = (url: string): boolean => {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

const ESQUEMA_MINIMO = `
  create table public.academic_period (id integer primary key, code varchar(10) not null,
    is_active boolean not null default false);
  create table public.course (id integer primary key, code varchar(20) not null, name varchar(150) not null);
  create table public.course_offering (id integer primary key,
    academic_period_id integer not null references academic_period(id),
    course_id integer not null references course(id));
  create table public.section (id integer primary key,
    course_offering_id integer not null references course_offering(id), code varchar(30) not null);
  create table public.app_user (id integer primary key, code varchar(20));
  create table public.enrollment (id integer primary key, student_id integer not null,
    section_id integer not null references section(id), status text not null default 'active',
    attended_hours numeric(5,2) not null default 0, absent_hours numeric(5,2) not null default 0,
    total_hours numeric(5,2) not null default 0,
    constraint chk_enrollment_attendance_hours check (attended_hours + absent_hours <= total_hours));
  create table public.syllabus (id integer primary key,
    course_offering_id integer not null unique references course_offering(id));
  create table public.assessment_type (id integer primary key, name varchar(120) not null);
  create table public.assessment (id integer primary key, syllabus_id integer not null references syllabus(id),
    assessment_type_id integer not null references assessment_type(id), code varchar(30) not null,
    name varchar(150) not null, week_number integer not null, weight numeric(5,2) not null);
`;

const SIEMBRA = `
  insert into academic_period values (1, '2026-1', false), (2, '2026-2', true);
  insert into course values (1, '690417', 'TALLER DE PROTOTIPADO'), (2, '690418', 'ANALITICA DE DATOS');
  insert into course_offering values (11, 2, 1), (12, 2, 2), (13, 1, 1);
  insert into section values (81, 11, '812'), (82, 12, '812'), (83, 13, '812');
  insert into app_user values (7, '20230001');
  insert into enrollment (id, student_id, section_id, status) values
    (501, 42, 81, 'active'), (502, 42, 82, 'active'), (503, 42, 83, 'active'),
    (504, 42, 82, 'withdrawn'), (601, 43, 81, 'active');
  insert into syllabus values (21, 11), (22, 12);
  insert into assessment_type values (1, 'Examen'), (2, 'Proyecto');
  insert into assessment values
    (5011, 21, 1, 'EV01', 'Examen escrito', 3, 15), (5012, 21, 2, 'EV02', 'Proyecto final', 15, 85),
    (5021, 22, 1, 'EV01', 'Examen escrito', 3, 15);
`;

let cliente: postgres.Sql | null = null;
let database: typeof db;
let repo: PortalRefreshRepository;

const base = (): postgres.Sql => {
  if (!cliente) throw new Error("La conexión de prueba no se abrió (ver beforeAll).");
  return cliente;
};
const tx = () => database as never;

/** Corre una sentencia en su propio savepoint y devuelve `SQLSTATE|restricción` si la base la rechaza. */
const rechazo = async (sentencia: string): Promise<string | null> => {
  await base().unsafe("savepoint sentencia");
  try {
    await base().unsafe(sentencia);
    return null;
  } catch (error) {
    const { code, constraint_name } = error as { code?: string; constraint_name?: string };
    return `${code ?? "?"}|${constraint_name ?? ""}`;
  } finally {
    await base().unsafe("rollback to savepoint sentencia");
  }
};

const FILA = (over: Partial<EvaluacionEmparejada> = {}): EvaluacionEmparejada => ({
  key: "07.13", group: "EVC", name: "Examen escrito 1", week: 3, weight: 15, value: 14.5,
  mark: "graded", assessmentId: 5011, match: "exact", ...over,
});
const SIN_PAREJA: Partial<EvaluacionEmparejada> = {
  key: "07.20", name: "Participación", week: null, weight: 85, value: null, mark: "pending", assessmentId: null, match: "none",
};

// Los ganchos de la conexión van fuera del describe: dentro de un describe
// saltado, bun cuenta cada beforeAll y afterAll como una prueba saltada más.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error("TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1).");
  }
  const migracion = await Bun.file("drizzle/0015_portal_scores.sql").text();
  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  database = drizzle(cliente, { schema: { ...schema, ...relations } }) as unknown as typeof db;
  repo = new PortalRefreshRepository(database);
  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.enrollment') is not null as hay`;
  if (previa?.hay) throw new Error("La base de TEST_DATABASE_URL ya tiene public.enrollment: usa una base vacía y desechable.");
  await cliente.unsafe(ESQUEMA_MINIMO);
  await cliente.unsafe(migracion);
  await cliente.unsafe(migracion);
  await cliente.unsafe(SIEMBRA);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("la 0015 y los repositorios de la recarga contra PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("la 0015 aplicada dos veces deja la tabla, sus restricciones, la cascada y las dos columnas", async () => {
    const restricciones = await base()`
      select conname, contype::text as tipo, confdeltype::text as al_borrar
        from pg_constraint where conrelid = 'public.student_portal_score'::regclass`;
    const nombres = restricciones.map((r) => `${r.conname}|${r.tipo}`);
    for (const esperado of [
      "chk_student_portal_score_mark|c", "chk_student_portal_score_mark_value|c", "chk_student_portal_score_match|c",
      "chk_student_portal_score_match_assessment|c", "chk_student_portal_score_value|c",
      "chk_student_portal_score_week|c", "chk_student_portal_score_weight|c",
      "uq_student_portal_score_key|u", "student_portal_score_pkey|p",
    ]) expect(nombres).toContain(esperado);
    expect(restricciones.filter((r) => r.tipo === "f").map((r) => r.al_borrar).sort()).toEqual(["a", "c"]);
    const indices = await base()`select indexname from pg_indexes where tablename = 'student_portal_score' order by indexname`;
    expect(indices.map((i) => i.indexname)).toEqual([
      "idx_student_portal_score_enrollment", "student_portal_score_pkey",
      "uq_student_portal_score_assessment", "uq_student_portal_score_key",
    ]);
    const columnas = await base()`
      select column_name, data_type, is_nullable from information_schema.columns
       where table_name = 'enrollment' and column_name like 'portal%' order by column_name`;
    expect(columnas.map((c) => ({ ...c }))).toEqual([
      { column_name: "portal_attendance_read_at", data_type: "timestamp with time zone", is_nullable: "YES" },
      { column_name: "portal_grades_read_at", data_type: "timestamp with time zone", is_nullable: "YES" },
    ]);
  });

  test("findRefreshContext trae el período activo y solo las matrículas activas del alumno en él", async () => {
    expect(await repo.findRefreshContext(42)).toEqual({
      period: { id: 2, code: "2026-2" },
      matriculas: [
        { enrollmentId: 502, sectionId: 82, courseCode: "690418", sectionCode: "812", courseName: "ANALITICA DE DATOS" },
        { enrollmentId: 501, sectionId: 81, courseCode: "690417", sectionCode: "812", courseName: "TALLER DE PROTOTIPADO" },
      ],
    });
    expect(await repo.findUserCode(7)).toBe("20230001");
  });

  test("findSyllabusCandidates trae solo el sílabo de la oferta de la matrícula", async () => {
    expect(await repo.findSyllabusCandidates(501)).toEqual([
      { assessmentId: 5011, name: "Examen escrito", typeName: "Examen", week: 3, weight: 15 },
      { assessmentId: 5012, name: "Proyecto final", typeName: "Proyecto", week: 15, weight: 85 },
    ]);
  });

  test("la hora de la asistencia solo avanza y una lectura más vieja no toca las horas", async () => {
    expect(await repo.updateAttendanceHours(tx(), 501, { total: "48.00", attended: "4.00", absent: "2.00" }, "2026-09-25T15:00:00.000Z")).toBe(true);
    expect(await repo.updateAttendanceHours(tx(), 501, { total: "48.00", attended: "2.00", absent: "0.00" }, "2026-09-25T14:00:00.000Z")).toBe(false);
    const [fila] = await base()`
      select attended_hours::text as asistidas, to_char(portal_attendance_read_at at time zone 'UTC', 'HH24:MI') as hora
        from enrollment where id = 501`;
    expect({ ...fila }).toEqual({ asistidas: "4.00", hora: "15:00" });
    expect(await repo.updateAttendanceHours(tx(), 501, { total: "48.00", attended: "6.00", absent: "2.00" }, "2026-09-25T16:00:00.000Z")).toBe(true);
  });

  test("la hora de las notas solo avanza", async () => {
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T15:00:00.000Z")).toBe(true);
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T14:00:00.000Z")).toBe(false);
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T15:00:00.000Z")).toBe(false);
    expect(await repo.markGradesRead(tx(), 501, "2026-09-25T16:00:00.000Z")).toBe(true);
  });

  test("reemplazar deja solo las filas nuevas, y la pareja de otra oferta revierte", async () => {
    await repo.replacePortalScores(tx(), 501, [FILA(), FILA(SIN_PAREJA)]);
    await repo.replacePortalScores(tx(), 501, [FILA({ value: 16 })]);
    const filas = await base()`
      select portal_key, value::text as value, assessment_id from student_portal_score where enrollment_id = 501`;
    expect(filas.map((f) => ({ ...f }))).toEqual([{ portal_key: "07.13", value: "16.00", assessment_id: 5011 }]);
    await expect(repo.replacePortalScores(tx(), 501, [FILA({ assessmentId: 5021 })])).rejects.toThrow("no pertenece a la oferta");
  });

  test("los CHECK de la 0015 rechazan lo que el lector nunca produce", async () => {
    const insertar = (cambios: Record<string, string>) => {
      const v: Record<string, string> = {
        enrollment_id: "501", portal_key: "'07.13'", name: "'Examen escrito 1'", weight: "15", mark: "'graded'",
        value: "14.5", assessment_id: "5011", match_rule: "'exact'", ...cambios,
      };
      return `insert into student_portal_score (${Object.keys(v).join(", ")}) values (${Object.values(v).join(", ")})`;
    };
    expect(await rechazo(insertar({}))).toBeNull();
    expect(await rechazo(insertar({ value: "null" }))).toBe("23514|chk_student_portal_score_mark_value");
    expect(await rechazo(insertar({ weight: "0" }))).toBe("23514|chk_student_portal_score_weight");
    expect(await rechazo(insertar({ match_rule: "'none'" }))).toBe("23514|chk_student_portal_score_match_assessment");
    expect(await rechazo(insertar({ mark: "'x'", value: "null" }))).toBe("23514|chk_student_portal_score_mark");
    expect(await rechazo(insertar({ week_number: "21" }))).toBe("23514|chk_student_portal_score_week");
  });

  test("borrar la matrícula borra sus notas de la ULima en cascada", async () => {
    await repo.replacePortalScores(tx(), 502, [FILA({ assessmentId: 5021 })]);
    await base().unsafe("delete from enrollment where id = 502");
    const [cuenta] = await base()`select count(*)::int as n from student_portal_score where enrollment_id = 502`;
    expect(cuenta?.n).toBe(0);
  });

  test("el candado de la recarga se toma dentro de la transacción", async () => {
    await repo.lockRefresh(tx(), 42);
    const [cuenta] = await base()`select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`;
    expect(cuenta?.n).toBeGreaterThanOrEqual(1);
  });

  test("GET /grades/me/ulima lee lo guardado, con la hora en ISO 8601 UTC", async () => {
    await repo.markGradesRead(tx(), 501, "2026-09-25T15:42:10.000Z");
    await repo.replacePortalScores(tx(), 501, [FILA(), FILA(SIN_PAREJA)]);
    const vista = construirVistaUlima(await new GradesRepository(database).findUlimaGrades(42));
    expect(vista.lastReadAt).toBe("2026-09-25T15:42:10.000Z");
    expect(vista.courses.map((c) => [c.courseCode, c.lastReadAt, c.assessments.map((a) => [a.key, a.value])])).toEqual([
      ["690418", null, []],
      ["690417", "2026-09-25T15:42:10.000Z", [["07.13", 14.5], ["07.20", null]]],
    ]);
  });
});
```

- [ ] **Paso 2. Correr la prueba sin base y verla saltarse**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU37_jeff/refresh.postgres.test.ts
```

Se esperan 10 pruebas saltadas y ninguna fallida.

- [ ] **Paso 3. Correrla contra un Postgres local desechable, si hay uno**

Con los comandos del comentario de la prueba, y solo contra `127.0.0.1`. Se esperan 10 pruebas en verde. Si alguna falla con un error de Postgres (42809, 42804 u otro), el defecto está en el SQL de la Tarea 13 o de la Tarea 14, se corrige ahí con su propia prueba estática y se vuelve a correr. Si esta máquina no tiene Postgres, el paso se reporta como no corrido, sin inventar un resultado.

- [ ] **Paso 4. Build y suite completa en segundo plano** con `tarea-21.log`. Se espera `0 fail`, `EXIT=0` y 10 pruebas saltadas más que en la Tarea 20.

- [ ] **Paso 5. Commit**

```bash
cd "${REPO:?}" && git add test/HU37_jeff/refresh.postgres.test.ts && git commit -m "test(recarga-portal): la 0015 y los repositorios de la recarga contra un PostgreSQL local opcional (RS-BE-55, RS-BE-57)" -m "La prueba aplica la 0015 dos veces sobre un esquema mínimo, dentro de una transacción que se deshace, y recorre las guardas de lectura, el reemplazo con la pareja atada a la oferta, los CHECK, la cascada, el candado y la lectura de GET /grades/me/ulima. Solo corre con TEST_DATABASE_URL hacia un host local, y sin ella se salta."
```

---

### Tarea 22. Documentación, verificación final y PARAR

**Archivos.**
- Modificar `specs/features/recarga-portal/recarga-portal.spec.md`, `specs/features/{asistencia-portal,portal-sync,delegados-portal,grades,official-grades,schedule,course-detail}/*.spec.md`, `docs/specs/api-contracts.md`, `docs/specs/feature-index.md`, `MIGRATIONS.md`, `AGENTS.md` y `KNOWLEDGE.md`.

**Interfaces.**
- Consume la implementación de las Tareas 1 a 21 y el resultado de V1 (Tarea 4).
- Produce la documentación al día y la rama lista para que el dueño aplique la `0015`, corra las verificaciones pendientes y decida el PR. El README no está en los `targets` de la spec y no se toca.

- [ ] **Paso 1. Enlazar las pruebas en la spec de la recarga**

En `specs/features/recarga-portal/recarga-portal.spec.md`, tres enlaces nuevos, cada uno en la línea siguiente al que se cita.

- Después de `` `[@test] ../../../test/HU37_jeff/refresh.notas.test.ts` *(pendiente, punto 6)* ``, en RS-BE-52, la línea `` `[@test] ../../../test/HU37_jeff/portal.client.nota.test.ts` *(rutas del panel Nota y charset del marco)* ``.
- Después de `` `[@test] ../../../test/HU37_jeff/migration-0015.test.ts` *(pendiente)* ``, en RS-BE-55, la línea `` `[@test] ../../../test/HU37_jeff/refresh.postgres.test.ts` *(solo con TEST_DATABASE_URL)* ``.
- Después de `` `[@test] ../../../test/HU37_jeff/asistencia-leida-en.test.ts` *(pendiente)* ``, en RS-BE-58, la línea `` `[@test] ../../../test/HU31_jeff/service.asistencia.test.ts` *(existe, casos nuevos de la hora de lectura en la importación)* ``.

Después, las marcas de pendiente salen de todos los enlaces, porque todas las pruebas existen.

```bash
cd "${REPO:?}" && perl -pi -e 's/ \*\(pendiente\)\*//g; s/\*\(pendiente, /*(/g' specs/features/recarga-portal/recarga-portal.spec.md && grep -c 'pendiente)\*\|(pendiente, ' specs/features/recarga-portal/recarga-portal.spec.md; for f in $(grep -o '\[@test\] \.\./\.\./\.\./test/[^`]*' specs/features/recarga-portal/recarga-portal.spec.md | sed 's#\[@test\] ../../../##' | sort -u); do [ -f "$f" ] || echo "FALTA $f"; done
```

Se espera `0` y ninguna línea `FALTA`.

- [ ] **Paso 2. Estado, fixtures y V1 en la spec de la recarga**

En el bloque «Estado», la frase «Los `[@test]` con la marca *(pendiente)* apuntan a pruebas que se crean con la implementación y hoy no existen.» sale entera, y la frase «Pendiente de implementar, empezando por RS-BE-48 en un PR propio (decisión abierta 1).» pasa a «RS-BE-48 está en `main` desde su PR propio (decisión abierta 1). RS-BE-49 a RS-BE-60 y la `0015` están implementados en la rama `feat/recarga-notas-asistencia`, sin mergear, según `docs/superpowers/plans/2026-09-26-recarga-portal-backend.md`. La `0015` sigue sin aplicar.». Las dos frases cruzan saltos de línea con `> `, así que se editan a mano y se comprueban con `grep -n 'Pendiente de implementar\|hoy no existen' specs/features/recarga-portal/recarga-portal.spec.md`, que tiene que salir vacío.

En RS-BE-59, la frase «Los archivos nuevos son `test/HU31_jeff/fixtures/sidebar-lista-asistencia.html`, `sidebar-lista-nota.html` y `sidebar-lista-delegado.html`, y» pasa a «Los archivos nuevos son `test/HU31_jeff/fixtures/menu-lista-asistencia.html`, que llega con RS-BE-48, y `menu-lista-nota.html`, mientras que el menú de Delegado se arma dentro de su prueba, y», porque esos son los nombres que usan RS-BE-48 y la Tarea 17.

En «Verificación antes de publicar», al final del punto V1, la frase «Hecha la parte sin sesión el <fecha de la Tarea 4>. `OpenNotaAlumnoPrePost` pide `<ruta que fija la Tarea 4>` con `prm_sNuAula` como único parámetro.», con la fecha y la ruta reales. Si el dueño ya corrió la parte con sesión, se suma su resultado (el `Content-Type` de la página y del marco, y si exige `Referer`), y si no, «La parte con sesión la corre el dueño.».

- [ ] **Paso 3. El estado de las enmiendas y del contrato**

Las enmiendas y el contrato dicen hoy «pendiente de implementar» en las líneas de la aprobación del 2026-09-26. En esas líneas, y solo en ellas, la frase pasa a «con la implementación en `feat/recarga-notas-asistencia`, sin mergear», que concuerda con cualquier sujeto.

```bash
cd "${REPO:?}" && perl -pi -e 's/pendiente de implementar/con la implementación en `feat\/recarga-notas-asistencia`, sin mergear/g if /2026-09-26/' docs/specs/api-contracts.md specs/features/asistencia-portal/asistencia-portal.spec.md specs/features/portal-sync/portal-sync.spec.md specs/features/delegados-portal/delegados-portal.spec.md specs/features/grades/grades.spec.md specs/features/official-grades/official-grades.spec.md specs/features/schedule/schedule.spec.md specs/features/course-detail/course-detail.spec.md && git diff --stat && grep -n 'pendiente de implementar' docs/specs/api-contracts.md specs/features/*/*.spec.md | grep '2026-09-26'
```

La última orden tiene que salir vacía. `git diff` se lee entero antes de seguir, y cualquier línea que hable de RS-BE-48, que ya está en `main` y no en esta rama, se corrige a mano para que diga que RS-BE-48 está en `main`.

En `docs/specs/feature-index.md`, la fila 20 cambia su última frase de estado. «Pendiente de implementar, empezando por RS-BE-48 en un PR propio (decisión abierta 1).» pasa a «RS-BE-48 está en `main`, y RS-BE-49 a RS-BE-60 y la `0015` están implementados en `feat/recarga-notas-asistencia`, sin mergear.». Si la fila 14 todavía dice que RS-BE-48 está pendiente de implementar, pasa a decir que RS-BE-48 está en `main` y que la asistencia vuelve a leerse con el menú de lista.

- [ ] **Paso 4. `AGENTS.md` y `KNOWLEDGE.md` (decisión abierta 12)**

El texto es el mismo en los dos archivos y en los de la app, y sale literal de la decisión 12.

En `AGENTS.md`, en «Reglas De Dominio», justo después de la viñeta que empieza con «`student_score` contiene las notas **oficiales**», una viñeta nueva.

```markdown
- Las notas que el alumno registra en la calculadora son personales y no oficiales (`simulated_grades`). La calculadora muestra además, fijas y con la marca “ULima”, las notas parciales que publica la ULima, que guarda la tabla `student_portal_score`, escribe solo `POST /portal-sync/refresh` y lee `GET /grades/me/ulima`.
```

En `KNOWLEDGE.md`, en «Reglas De Dominio», la viñeta «- `student_score` son notas personales no oficiales.» pasa a estas dos.

```markdown
- `student_score` contiene las notas oficiales que el profesor o JP carga por evaluación (módulo `official-grades`).
- Las notas que el alumno registra en la calculadora son personales y no oficiales (`simulated_grades`). La calculadora muestra además, fijas y con la marca “ULima”, las notas parciales que publica la ULima, que guarda la tabla `student_portal_score`, escribe solo `POST /portal-sync/refresh` y lee `GET /grades/me/ulima`.
```

Y en «Tablas principales», la línea de «Evaluaciones» suma `student_portal_score` al final.

- [ ] **Paso 5. Entrada de la `0015` en `MIGRATIONS.md`, pendiente de aplicar**

Al comienzo de «Migraciones aplicadas / reconciliaciones», antes de la entrada de la `0013`.

```markdown
- **`drizzle/0015_portal_scores.sql` (RS-BE-55, RS-BE-57 y RS-BE-58, recarga de notas parciales y asistencia), pendiente de aplicar.** Aditiva e idempotente, con `IF NOT EXISTS` en cada sentencia y sin tocar ninguna fila. Crea `student_portal_score` (una fila por evaluación que publica la ULima, con su pareja del sílabo, siete CHECK, el UNIQUE `uq_student_portal_score_key`, el índice único parcial `uq_student_portal_score_assessment`, el índice `idx_student_portal_score_enrollment` y la FK a `enrollment` con `ON DELETE CASCADE`) y agrega a `enrollment` las columnas nulables `portal_grades_read_at` y `portal_attendance_read_at` (`timestamptz`). Diseño y aprobación de BD en `specs/features/recarga-portal/recarga-portal.spec.md` («Modelo de datos», aprobada por el dueño el 2026-09-26).
  Se aplica con `bun run db:apply drizzle/0015_portal_scores.sql`, no con `db:migrate` ni `db:generate`, porque el journal (`drizzle/meta/_journal.json`) sigue en la `0009`. La aplica el dueño, con respaldo previo (`pg_dump` de `libpq`, por ruta completa) y su permiso explícito, ANTES de desplegar el código de la rama, porque la importación escribe `portal_attendance_read_at` y contra una base sin la columna fallaría entera (RS-BE-58). Como el entorno *Preview* de Vercel comparte el `DATABASE_URL` de producción, ningún despliegue de la rama, tampoco uno de vista previa, sale antes de aplicarla.
  Verificación una vez aplicada. `to_regclass('student_portal_score')` deja de devolver `NULL`. `pg_constraint` muestra los siete CHECK, el UNIQUE, la PK y dos FK, la de `enrollment` con `confdeltype = 'c'` y la de `assessment` con `'a'`. `pg_indexes` muestra los cuatro índices de la tabla, e `information_schema.columns` muestra las dos columnas nuevas de `enrollment`, nulables y `timestamp with time zone`.
  Al aplicarla se completa aquí la fecha, el nombre del respaldo y el resultado de la verificación.
```

- [ ] **Paso 6. Verificación final en segundo plano**

El comando de «Variables de los comandos» con `tarea-22.log`. Se espera `0 fail` y `EXIT=0`. Después, las comprobaciones de la rama.

```bash
cd "${REPO:?}" && git log --format='%an <%ae>' origin/main..HEAD | sort -u && git log --format='%B' origin/main..HEAD | grep -ci 'co-authored-by'; git diff origin/main...HEAD -U0 -- . ':(exclude)docs/superpowers/plans' | grep '^+' | grep -oE '\b[0-9]{8}\b' | sort -u; git diff origin/main...HEAD -U0 | grep '^+' | grep -c '/Users/'
```

Se espera un solo autor, `Jeffangeloss <178797184+jeffangeloss@users.noreply.github.com>`, `0` trailers, ningún número de 8 dígitos fuera de `20230001`, `20230002` y `12345678` (el código del autenticador de ocho dígitos de `refresh.schemas.test.ts`), y `0` rutas de esta máquina. Cualquier otra cosa se corrige antes del commit.

- [ ] **Paso 7. Commit**

```bash
cd "${REPO:?}" && git add specs/features/recarga-portal/recarga-portal.spec.md specs/features/asistencia-portal/asistencia-portal.spec.md specs/features/portal-sync/portal-sync.spec.md specs/features/delegados-portal/delegados-portal.spec.md specs/features/grades/grades.spec.md specs/features/official-grades/official-grades.spec.md specs/features/schedule/schedule.spec.md specs/features/course-detail/course-detail.spec.md docs/specs/api-contracts.md docs/specs/feature-index.md MIGRATIONS.md AGENTS.md KNOWLEDGE.md && git commit -m "docs(recarga-portal): la spec, el contrato y las reglas de dominio dan la recarga por implementada (RS-BE-49 a RS-BE-60)" -m "La spec enlaza todas las pruebas, corrige los nombres de los fixtures del menú y registra V1. Las enmiendas, el contrato y el índice pasan a implementados en esta rama sin mergear. AGENTS.md y KNOWLEDGE.md llevan el texto de la decisión 12, y MIGRATIONS.md registra la 0015 como pendiente de aplicar."
```

- [ ] **Paso 8. PARAR y entregar al dueño**

La rama queda sin `push` y sin PR. Lo que sigue lo decide y lo hace el dueño, en este orden.

1. Aprueba o cambia los textos nuevos que ve el alumno, que la spec no fija palabra por palabra. Son «No se pudo abrir el panel de notas en miUlima.», «No se entendió el menú de asistencia de miUlima.», «No se entendió el menú de notas de miUlima.», «No se pudieron traer las notas de <curso>/<sección>.» (o «del aula <aula>»), «No se entendieron las notas de <curso>/<sección>: <motivo>», «El curso <curso>/<sección> de miUlima no está en tu matrícula de ULima++.», «El promedio que publica la ULima no coincide con sus evaluaciones en <curso>/<sección>.», «La lectura de miUlima tardó demasiado y algunos cursos quedaron sin leer.» y los motivos fijos de los lectores de las Tareas 6 y 7.
2. Corre la parte con sesión de V1 si falta, y V3 cuando quiera habilitar las cadenas en paralelo (hasta entonces rige el orden secuencial de RS-BE-53).
3. Aplica la `0015` con respaldo y su permiso, y completa su entrada en `MIGRATIONS.md`. Nadie despliega la rama antes, ni en *Preview*.
4. Hace V2 cuando la ULima publique la primera nota, y el lector y sus fixtures se ajustan con esa muestra, armada a mano, antes de publicar.
5. Hace V5 (tres recargas desde `iad1` en 45 s o menos y sin `504`, con las duraciones por fase del registro) antes de publicar la app.
6. Decide el PR de la rama, que ya trae RS-BE-48 desde `main`.
