# Bloques de horario propios (backend) — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** Que el alumno registre en el servidor sus propios bloques de horario (prácticas, trabajo) con un patrón semanal, corrija días sueltos con excepciones y consulte las ocurrencias de una ventana junto con sus horas por semana, sin que el chatbot vea nada de eso. De paso, que cada día del horario del portal diga su fecha exacta (`isoDate`), para que la app pida y ubique esas ocurrencias sin leer fechas en español.
**Arquitectura:** Un módulo nuevo `src/modules/time-blocks` con la cadena `routes → controller → service → repository`, apoyado en dos tablas nuevas (`student_time_block` y `student_time_block_exception`) que crea la migración aditiva e idempotente `0012_time_blocks.sql`. La expansión de la regla en ocurrencias y la suma de horas por semana son funciones puras en `time-blocks.logic.ts`, sin base de datos; el service hace cumplir tope, grilla, pertenencia y ventana, y el alumno sale siempre del token. La migración no la aplica el ejecutor: la aplica el dueño en el paso PARAR de la última tarea. Fuera del módulo hay dos cambios chicos: `PATCH` en el CORS de `src/server.ts` (Tarea 5), porque `PATCH /time-blocks/me/:id` es la primera ruta con ese verbo, y el campo `isoDate` en los días de `GET /schedule/me/sessions` (Tarea 7, RS-BE-36).
**Stack:** Bun + TypeScript + Hono + Drizzle ORM + PostgreSQL + Zod
**Spec:** `specs/features/time-blocks/time-blocks.spec.md` (y la contraparte en el otro repo)
**Repo y rama:** `$REPO` (el worktree de la rama; ver "Variables de los comandos"), rama `feat/bloques-horario`

## Restricciones globales

- Español en comentarios, nombres de test y mensajes de commit. Nombres de test sin tildes, como el resto del repo.
- Commits: el autor ya está configurado en git (Jeffangeloss, noreply de GitHub). **Sin** trailer Co-Authored-By. Un commit por tarea, con `git add` explícito.
- No hacer push ni abrir PR: lo decide el dueño.
- Repo PÚBLICO: ningún dato real. Alumno sintético `20230001`. Nada de fixtures de `test/HU31_jeff/` ni de `spike-portal/`.
- **Variables de los comandos.** El plan no fija rutas de una máquina concreta: si alguna vez se commitea en `docs/superpowers/plans/`, el repo es público (con el plan del récord hubo que limpiarlas después, en `6b67d40`). Los comandos usan tres variables:
  - `REPO`: la ruta absoluta del worktree donde está la rama `feat/bloques-horario` (`git worktree list`, corrido desde el checkout del backend, la muestra).
  - `SCRATCH`: la carpeta temporal de la sesión, **fuera** del repo (el scratchpad que da el entorno). Ahí viven el bun y las salidas de la Tarea 8.
  - `BUN`: el ejecutable de bun, que no está en PATH: `$SCRATCH/bunhome/node_modules/.bin/bun`. Si no existe, `npm install --prefix "$SCRATCH/bunhome" bun` lo instala ahí.

  Cada llamada de shell empieza con `export REPO=… SCRATCH=… BUN=…` (con los valores de esta máquina), porque las variables no sobreviven de una llamada a otra. Los comandos las usan como `cd "${REPO:?}"`, `"${BUN:?}"` o detrás de una guarda `: "${BUN:?…}"`: si falta una, la llamada se corta con un error. Sin eso, un `cd` vacío corre en `$HOME` y un `$BUN` vacío vuelve `… $BUN test …` el comando `test` de la shell, que sale con 0 sin probar nada. En las salidas esperadas, `$REPO` está en lugar de la ruta absoluta que imprime bun.
- Build: `$BUN run build` (= `tsc`, solo compila `src/`).
- Tests: `DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test <ruta>`. El prefijo es obligatorio: el `.env` del worktree apunta a la base de PRODUCCIÓN y bun lo carga solo.
- **Cifras de las pruebas.** Las de la Tarea 1, la línea base y las de la guarda del chatbot en verde están medidas con `bun test`. Las que cambió la revisión del plan (Tareas 2 a 5, el rojo sembrado de la Tarea 6 y los totales de las Tareas 5, 6 y 8) se obtuvieron corriendo el código y las pruebas de este mismo texto en un arnés en memoria (bun con `describe`/`test`/`expect` propios, Drizzle y Zod reales, y la base falsa de cada prueba), que reproduce exacto lo que `bun test` midió antes de la revisión (29/93, 58/121 y 58/224). El código del módulo y las cuatro pruebas tocadas pasan además `tsc` con `tsconfig.json` y con `test/tsconfig.json`, sin ningún error. Las líneas y conteos de `docs/specs/api-contracts.md` salen del texto del Paso 5 de la Tarea 6. La prueba de la Tarea 7 (`schedule-iso-date.test.ts`, 6 pruebas y 29 aserciones, en rojo 0/6/9) y la suite con ella (1492 pass, 5258 `expect()`, 109 archivos sobre `e2af4fa`) se midieron con bun 1.4.2 en una copia aislada de `e2af4fa` sin `.env`, con el cambio de esa tarea aplicado y `tsc` limpio; lo mismo el preflight del CORS de la Tarea 5. La prueba del CORS que la Tarea 5 suma a `time-blocks.routes.test.ts` es una sola aserción sin bucles y se suma a mano (+1 prueba, +1 `expect()`). Si una corrida real da `0 fail` con otra cifra, se compara prueba por prueba contra el archivo antes de seguir; nunca se ajusta una prueba para que cuadre.
- **Nada contra la base**: ni `db:apply`, ni `db:push`, `db:migrate`, `db:generate`, `db:seed`, ni `psql`. La migración 0012 se escribe y se prueba estáticamente; la aplica el dueño (paso PARAR de la última tarea).
- Arquitectura `routes → controller → service → repository`. El service recibe repository y `EventBus`, y **nunca** importa `db`. Zod en el controller con `validateJson` / `validateQuery` / `validateParams` de `src/shared/middleware/validate-dto.ts`.
- El alumno sale **solo del token**: `const studentId = Number(c.get("studentId"))`. Nunca del body ni de la ruta. La pertenencia del bloque se verifica en el service, como hace `findSectionOwnedByTeacher` en `advising/teacher` (`teacher.service.ts:38-40`).
- Plantilla `sql` de Drizzle: nunca interpolar un arreglo JS (error 42809). Enteros con el helper `intArray` del repositorio que lo tenga a mano, textos y lotes con `json_array_elements` / `::json`.
- Fechas y horas: `date` y `time` de Postgres, sin zona. Las fechas viajan como `"YYYY-MM-DD"` y las horas como `"HH:MM"`. **Nunca** pasar un objeto `Date` como parámetro a la plantilla `sql`: postgres.js lo rechaza al preparar la sentencia (regresión real del 2026-09-20). Va `${fecha}::date` con la cadena, o `${d.toISOString()}::timestamptz` si alguna vez hiciera falta un instante.
- Errores: `HttpError(status, mensaje en español, CODE)` de `src/shared/errors/http-error.js`, con los códigos que fija la spec.
- Texto que ve el alumno: la spec solo fija qué dice uno, el de `TIME_BLOCK_LIMIT_REACHED` (que el tope cuenta los bloques guardados, vencidos incluidos, y que borre uno viejo para crear otro; RS-BE-31). Los únicos mensajes nuevos son los de `time-blocks.service.ts` y `time-blocks.schemas.ts` (Tarea 4); la Tarea 5 los lista en su aviso de textos (Paso 8) para que el dueño los apruebe o los cambie antes del merge. No se inventa ninguno más.
- **Números de línea de la spec.** Los que el plan cita en prosa de `specs/features/time-blocks/time-blocks.spec.md` son los de la spec como la deja el commit de la Tarea 1: reconciliada con este plan el 2026-09-21 y con el estado ya en **APROBADA**. Las Tareas 3 y 4 le agregan un `[@test]` cada una y corren una línea todo lo que sigue, así que toda edición de la spec va con ancla de texto, y los chequeos literales dicen en qué momento se toman.

## Estructura de archivos

| ruta | acción | responsabilidad |
|:---|:---|:---|
| `src/db/schema/schema.ts` | modificar | enum `time_block_exception_status` y las dos tablas nuevas, al final del archivo |
| `drizzle/0012_time_blocks.sql` | crear | migración aditiva e idempotente |
| `src/modules/time-blocks/time-blocks.types.ts` | crear | tipos de fila, de regla, de excepción y de ocurrencia |
| `src/modules/time-blocks/time-blocks.logic.ts` | crear | funciones puras: expansión de ocurrencias, horas por semana y helpers de fecha |
| `src/modules/time-blocks/time-blocks.repository.ts` | crear | SQL de las dos tablas, siempre acotado por `student_id` |
| `src/modules/time-blocks/time-blocks.schemas.ts` | crear | Zod del body, la query y los params |
| `src/modules/time-blocks/time-blocks.service.ts` | crear | reglas: tope de bloques, rango de la grilla, pertenencia, excepción dentro del patrón, ventana |
| `src/modules/time-blocks/time-blocks.controller.ts` | crear | adapta HTTP; alumno del token |
| `src/modules/time-blocks/time-blocks.routes.ts` | crear | auth + roles de alumno + las siete rutas |
| `src/modules/time-blocks/index.ts` | crear | composition root del módulo |
| `src/modules/index.ts` | modificar | `app.route("/time-blocks", timeBlocksRoutes)` |
| `src/server.ts` | modificar | `PATCH` en `allowMethods` del CORS (Tarea 5) |
| `src/modules/schedule/schedule.types.ts` | modificar | `isoDate: string \| null` en `DayInfo` (Tarea 7) |
| `src/modules/schedule/schedule.service.ts` | modificar | `isoDate` en cada día que arman `getSessions` y `getTeacherSessions` (Tarea 7) |
| `test/HU35_jeff/migration-0012.test.ts` | crear | prueba estática del SQL y del schema |
| `test/HU35_jeff/time-blocks-expansion.test.ts` | crear | expansión y horas por semana |
| `test/HU35_jeff/time-blocks.repository.test.ts` | crear | SQL capturado con `PgDialect`, sin base |
| `test/HU35_jeff/time-blocks.service.test.ts` | crear | reglas del service con repositorio falso |
| `test/HU35_jeff/time-blocks.routes.test.ts` | crear | rutas, auth y códigos de error |
| `test/HU35_jeff/chatbot-isolation-blocks.test.ts` | crear | el chatbot no toca las tablas nuevas |
| `test/HU35_jeff/schedule-iso-date.test.ts` | crear | `isoDate` en los días del horario (RS-BE-36) |
| `docs/specs/api-contracts.md`, `docs/specs/feature-index.md`, `specs/features/schedule/schedule.spec.md` | modificar | "Cambios en otras specs" (Tareas 6 y 7) |
| `specs/features/time-blocks/time-blocks.spec.md` | modificar | estado **APROBADA** (Tarea 1) y los `[@test]` de las Tareas 3 y 4 |

## Orden y cobertura

| requisito | tareas |
|:---|:---|
| Spec aprobada antes del código (`AGENTS.md:3` y `:34`) | 1 (Paso 0) |
| RS-BE-30 (modelo) | 1 |
| RS-BE-31 (crear/editar/borrar, y `PATCH` en el CORS) | 3, 4, 5 |
| RS-BE-32 (excepciones) | 3, 4, 5 |
| RS-BE-33 (ocurrencias y ventana) | 2, 3, 4, 5 |
| RS-BE-34 (horas por semana) | 2, 4, 5 |
| RS-BE-35 (chatbot) | 6 |
| RS-BE-36 (`isoDate` en el horario) | 7 |
| Contrato (siete rutas, tipos, errores, `isoDate`) | 4, 5, 6, 7 |
| Cambios en otras specs | 6, 7 |
| Migración aplicada | 8 (PARAR) |

---

### Tarea 1: Modelo de datos: schema y migración 0012

**Archivos:**
- Crear: `drizzle/0012_time_blocks.sql`
- Crear: `test/HU35_jeff/migration-0012.test.ts`
- Modificar: `src/db/schema/schema.ts:727-729` (final del archivo, justo después del cierre de `studentPeriodSummary`)
- Modificar: `specs/features/time-blocks/time-blocks.spec.md:16-17` (el estado pasa a **APROBADA**; Paso 0, y solo con la confirmación del dueño). El mismo commit lleva la reconciliación de la spec del 2026-09-21, que ya está en el árbol sin commitear.
- Test: `test/HU35_jeff/migration-0012.test.ts`

**Interfaces:**
- Consume (ya existe en el repo; esta es la primera tarea, así que no consume nada de tareas anteriores):
  - `src/db/schema/schema.ts`, helpers ya importados en la cabecera: `check`, `date`, `index`, `integer`, `pgEnum`, `pgTable`, `smallint`, `time`, `timestamp`, `unique` y `varchar` de `drizzle-orm/pg-core` (bloque `import { … }` de las líneas 1-20) y `sql` de `drizzle-orm` (línea 21). **No hay que tocar los imports: los once de `pg-core` y `sql` ya están.**
  - `export const student = pgTable("student", …)` (`schema.ts:131`), destino de la FK. Su PK es `id: integer("id").generatedByDefaultAsIdentity().primaryKey()` (`schema.ts:132`).
  - Precedente de estilo: `courseAdvisingSession` (`schema.ts:480-517`, las mismas líneas que cita RS-BE-30) para mezclar día de semana con fecha, y `scheduleSession` (`schema.ts:465-478`) para `check("chk_…", sql\`…\`)` + `index(…)`.
  - Forma del `.sql`: `drizzle/0011_academic_record.sql` (cabecera de comentarios, `CREATE TABLE IF NOT EXISTS`, CONSTRAINT dentro de la definición, columnas indentadas con **tabulador**, `--> statement-breakpoint`) y la guarda `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;` de `drizzle/0010_course_weekly_hours.sql:18-22`.
  - Forma del `CREATE TYPE`: `drizzle/0000_baseline.sql:1-9` (`CREATE TYPE "public"."x" AS ENUM('a', 'b');`).
  - Forma de la prueba: `test/HU34_jeff/migration-0011.test.ts` (lee el `.sql` con `Bun.file` y usa `getTableConfig` de `drizzle-orm/pg-core`).
- Produce (lo que usan las Tareas 3, 5 y 6):
  - `export const timeBlockExceptionStatusEnum = pgEnum("time_block_exception_status", ["cancelled", "moved"])`
  - `export const studentTimeBlock = pgTable("student_time_block", …)` — columnas `id`, `student_id`, `title`, `color_hex`, `days_of_week` (`smallint[]`), `start_time`, `end_time`, `start_date`, `end_date`, `created_at`, `updated_at`
  - `export const studentTimeBlockException = pgTable("student_time_block_exception", …)` — columnas `id`, `block_id`, `occurrence_date`, `status`, `start_time`, `end_time`
  - `drizzle/0012_time_blocks.sql`, aditiva e idempotente, que el dueño aplica en la Tarea 8.

---

- [ ] **Paso 0: Punto de partida y aprobación de la spec**

  `AGENTS.md:3` prohíbe implementar comportamiento nuevo sin spec aprobada, y `AGENTS.md:34` exige además la aprobación del cambio de base de datos antes de agregar tablas. El esqueleto de este plan registra que el dueño aprobó el diseño el 2026-09-20. El 2026-09-21 la spec se reconcilió con este plan y con el del frontend (targets con `src/server.ts` y los dos archivos de `schedule`, el tope de 20 bloques **guardados**, `weeks` con semanas enteras, fechas entre 2000 y 2099, excepciones canceladas con horas en `null`, el ejemplo del contrato con fechas del patrón, la respuesta real del `PUT` y el requisito nuevo RS-BE-36 con `isoDate`). Esa reconciliación está en el árbol **sin commit**, y la spec todavía dice en sus líneas 16-17 que está pendiente. Las dos cosas se cierran acá, antes de una sola línea de código.

  Primero, comprobar que el árbol está donde debe:

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD~1 && git diff --name-only e2af4fa..HEAD && git status --short && git diff --numstat e2af4fa -- specs/features/time-blocks/time-blocks.spec.md && sed -n '16,17p' specs/features/time-blocks/time-blocks.spec.md
```

  Esperado, literal (con un tabulador entre las columnas del `numstat`):

```
feat/bloques-horario
e2af4fa
docs/superpowers/plans/2026-09-20-bloques-horario-backend.md
 M specs/features/time-blocks/time-blocks.spec.md
130	38	specs/features/time-blocks/time-blocks.spec.md
> Estado: **diseñada con el dueño del proyecto el 2026-09-20**, sección por sección.
> Pendiente de su aprobación de esta spec escrita antes de planificar.
```

  El HEAD es el commit `docs(time-blocks): plan de implementación de los bloques de horario (backend)`, hijo directo de `e2af4fa`, que solo agrega este plan en `docs/superpowers/plans/`. La línea ` M …` es la reconciliación del 2026-09-21, y es la **única** que puede imprimir `git status --short`: entra en el commit de esta tarea junto con la aprobación. Hay un solo caso distinto que vale: que alguien ya la haya commiteado aparte, encima del commit del plan. Entonces `git rev-parse --short HEAD~1` da el commit del plan y no `e2af4fa`, `git log --oneline e2af4fa..HEAD` muestra dos commits, `git diff --name-only e2af4fa..HEAD` lista además la spec y `git status --short` no imprime nada; el `numstat` sale igual, porque compara contra `e2af4fa`. En ese caso se sigue igual, el commit de esta tarea lleva solo las dos líneas del estado, y la Tarea 8 cuenta un commit más sobre `e2af4fa`.

  En cualquier otro caso (otra rama, otros commits encima de `e2af4fa` que los del plan y la spec, otro archivo en `git status --short`, otro `numstat` u otras dos líneas de la spec), **PARAR** antes de medir y antes de escribir: la Tarea 8 compara todo contra `e2af4fa`, y este worktree ya se reusó para otras funcionalidades.

  Después, confirmar con el dueño que aprueba la spec tal como está escrita, **con la reconciliación del 2026-09-21 e incluido el cambio de base de datos** (el enum `time_block_exception_status`, las tablas `student_time_block` y `student_time_block_exception`, y la migración 0012). **Si no lo confirma, PARAR**: esta tarea no sigue. Con la confirmación, reemplazar en `specs/features/time-blocks/time-blocks.spec.md` estas dos líneas:

```markdown
> Estado: **diseñada con el dueño del proyecto el 2026-09-20**, sección por sección.
> Pendiente de su aprobación de esta spec escrita antes de planificar.
```

  por estas dos (el precedente es `specs/features/academic-record/academic-record.spec.md:24-25`):

```markdown
> Estado: **APROBADA** por el dueño del proyecto el 2026-09-22, incluido el cambio de base de datos
> que exige `AGENTS.md`. Diseñada con él sección por sección.
```

  Si el dueño aprueba en otra fecha, va esa fecha. Las dos líneas que siguen (`> Revisada el 2026-09-21 …`) no se tocan. Son **dos líneas por dos** a propósito: las Tareas 3, 4, 6, 7 y 8 citan los `[@test]` por número de línea (55, 106, 131, 153, 174, 183 y 202 antes de sus propios enlaces). Comprobarlo:

```bash
cd "${REPO:?}" && git diff --numstat e2af4fa -- specs/features/time-blocks/time-blocks.spec.md && grep -n "@test" specs/features/time-blocks/time-blocks.spec.md | cut -d: -f1 | tr '\n' ' '; echo
```

  Esperado, literal (con un tabulador entre las columnas del `numstat`):

```
132	40	specs/features/time-blocks/time-blocks.spec.md
55 106 131 153 174 183 202 
```

  Los dos cambios de la spec, la reconciliación y la aprobación, entran en el commit de esta tarea (Paso final).

- [ ] **Paso 1: Escribir la prueba que falla**

  Antes de tocar código, medir la línea base que la Tarea 8 va a comparar y anotarla:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}"
DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test
```

  Línea base medida el 2026-09-20 sobre `feat/bloques-horario` (`e2af4fa`; los cambios de la spec del Paso 0 no tocan ninguna prueba): **1486 pass, 0 fail, 5229 expect(), 108 archivos**. Si tu corrida no da eso, para y averigua por qué antes de seguir. Esa corrida imprime ruido en stderr (`error: fallo de BD` desde `test/HU02_jeff/logout.unit.test.ts`, avisos de `[portal-sync]`): son pruebas que ejercitan el camino de error a propósito, y el resumen igual dice `0 fail`. No confundirlo con un fallo.

  Crear la carpeta y el archivo de prueba (`test/HU35_jeff/` no existe todavía):

```bash
cd "${REPO:?}" && mkdir -p test/HU35_jeff
```

  Contenido completo de `test/HU35_jeff/migration-0012.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  studentTimeBlock,
  studentTimeBlockException,
  timeBlockExceptionStatusEnum,
} from "../../src/db/schema/schema.js";

// El .sql se lee como texto plano: esta prueba NO aplica la migracion ni toca
// la base. Aplicarla es del dueno (MIGRATIONS.md).
const migracion = await Bun.file("drizzle/0012_time_blocks.sql").text();

const veces = (aguja: string): number => migracion.split(aguja).length - 1;

const columnas = (tabla: PgTable): string[] => getTableConfig(tabla).columns.map((c) => c.name);

const tipos = (tabla: PgTable): Record<string, string> =>
  Object.fromEntries(getTableConfig(tabla).columns.map((c) => [c.name, c.getSQLType()]));

const nulables = (tabla: PgTable): string[] =>
  getTableConfig(tabla).columns.filter((c) => !c.notNull).map((c) => c.name);

describe("drizzle/0012_time_blocks.sql", () => {
  test("crea las dos tablas y ninguna mas, las dos con IF NOT EXISTS y su identidad", () => {
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_time_block"');
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_time_block_exception"');
    expect(veces("CREATE TABLE")).toBe(2);
    expect(veces("PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY")).toBe(2);
  });

  test("el tipo nuevo se crea una sola vez y guardado contra duplicate_object", () => {
    expect(migracion).toContain(
      `DO $$ BEGIN\n  CREATE TYPE "public"."time_block_exception_status" AS ENUM('cancelled', 'moved');\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`,
    );
    expect(veces("CREATE TYPE")).toBe(1);
    // Crear un tipo SI es transaccional; la trampa de MIGRATIONS.md:125 es
    // agregarle un valor a un tipo que ya existe, que revienta dentro de db:apply.
    expect(migracion).not.toContain("ADD VALUE");
  });

  test("el indice por alumno tambien es idempotente", () => {
    expect(migracion).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_time_block_student" ON "student_time_block" USING btree ("student_id")',
    );
    expect(veces("CREATE INDEX")).toBe(1);
  });

  test("es aditiva: no altera ni borra nada de lo que ya existe, y no usa db:push", () => {
    expect(migracion).not.toContain("ALTER TABLE");
    expect(migracion).not.toContain("DROP");
    expect(migracion).not.toContain("db:push");
    expect(veces("--> statement-breakpoint")).toBe(3);
  });

  test("las dos claves foraneas son las unicas y borran en cascada", () => {
    expect(veces("FOREIGN KEY")).toBe(2);
    expect(veces("ON DELETE cascade")).toBe(2);
    expect(migracion).toContain(
      'CONSTRAINT "student_time_block_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(migracion).toContain(
      'CONSTRAINT "student_time_block_exception_block_id_student_time_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."student_time_block"("id") ON DELETE cascade ON UPDATE no action',
    );
  });

  test("no se ata a curso, seccion, ciclo ni matricula", () => {
    expect(migracion).not.toContain('REFERENCES "public"."section"');
    expect(migracion).not.toContain('REFERENCES "public"."course"');
    expect(migracion).not.toContain('REFERENCES "public"."course_offering"');
    expect(migracion).not.toContain('REFERENCES "public"."academic_period"');
    expect(migracion).not.toContain('REFERENCES "public"."enrollment"');
    expect(migracion).not.toContain('REFERENCES "public"."schedule_session"');
  });

  test("los seis CHECK de la regla, con el nombre que fija la spec", () => {
    expect(migracion).toContain(
      'CONSTRAINT "chk_time_block_horas" CHECK ("student_time_block"."end_time" > "student_time_block"."start_time")',
    );
    expect(migracion).toContain(
      `CONSTRAINT "chk_time_block_grilla" CHECK ("student_time_block"."start_time" >= '07:00' AND "student_time_block"."end_time" <= '22:00')`,
    );
    expect(migracion).toContain(
      'CONSTRAINT "chk_time_block_fechas" CHECK ("student_time_block"."end_date" >= "student_time_block"."start_date")',
    );
    // El coalesce no es adorno: sobre un arreglo vacio array_length devuelve
    // NULL, y una restriccion que evalua a NULL se da por satisfecha, asi que
    // sin el coalesce un days_of_week vacio entraria a la tabla.
    expect(migracion).toContain(
      'CONSTRAINT "chk_time_block_dias" CHECK (coalesce(array_length("student_time_block"."days_of_week", 1), 0) BETWEEN 1 AND 7 AND "student_time_block"."days_of_week" <@ ARRAY[1,2,3,4,5,6,7]::smallint[])',
    );
    expect(migracion).toContain(
      `CONSTRAINT "chk_time_block_color" CHECK ("student_time_block"."color_hex" ~ '^#[0-9A-Fa-f]{6}$')`,
    );
    expect(migracion).toContain(
      'CONSTRAINT "chk_time_block_titulo" CHECK (length(btrim("student_time_block"."title")) BETWEEN 1 AND 60)',
    );
  });

  test("los dos CHECK de la excepcion y su UNIQUE", () => {
    expect(migracion).toContain(
      'CONSTRAINT "chk_time_block_exc_movido" CHECK (("student_time_block_exception"."status" = \'cancelled\' AND "student_time_block_exception"."start_time" IS NULL AND "student_time_block_exception"."end_time" IS NULL) OR ("student_time_block_exception"."status" = \'moved\' AND "student_time_block_exception"."start_time" IS NOT NULL AND "student_time_block_exception"."end_time" IS NOT NULL AND "student_time_block_exception"."end_time" > "student_time_block_exception"."start_time"))',
    );
    expect(migracion).toContain(
      `CONSTRAINT "chk_time_block_exc_grilla" CHECK ("student_time_block_exception"."start_time" IS NULL OR ("student_time_block_exception"."start_time" >= '07:00' AND "student_time_block_exception"."end_time" <= '22:00'))`,
    );
    expect(migracion).toContain(
      'CONSTRAINT "uq_time_block_exception" UNIQUE("block_id","occurrence_date")',
    );
    expect(veces("CHECK (")).toBe(8);
  });

  test("los tipos de las columnas son los de la spec", () => {
    expect(migracion).toContain('"title" varchar(60) NOT NULL');
    expect(migracion).toContain('"color_hex" varchar(7) NOT NULL');
    expect(migracion).toContain('"days_of_week" smallint[] NOT NULL');
    expect(migracion).toContain('"start_time" time NOT NULL,');
    expect(migracion).toContain('"end_time" time NOT NULL,');
    expect(migracion).toContain('"start_date" date NOT NULL');
    expect(migracion).toContain('"end_date" date NOT NULL');
    expect(migracion).toContain('"created_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(migracion).toContain('"updated_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(migracion).toContain('"occurrence_date" date NOT NULL');
    expect(migracion).toContain('"status" "time_block_exception_status" NOT NULL');
    // Sin NOT NULL y con la coma: solo las horas de la excepcion son nulables.
    expect(migracion).toContain('"start_time" time,');
    expect(migracion).toContain('"end_time" time,');
  });

  test("la cabecera dice como se aplica", () => {
    expect(migracion.trimStart().startsWith("--")).toBe(true);
    expect(migracion).toContain("bun run db:apply drizzle/0012_time_blocks.sql");
  });
});

describe("schema.ts · student_time_block", () => {
  test("nombre de tabla y columnas, en orden", () => {
    expect(getTableConfig(studentTimeBlock).name).toBe("student_time_block");
    expect(columnas(studentTimeBlock)).toEqual([
      "id",
      "student_id",
      "title",
      "color_hex",
      "days_of_week",
      "start_time",
      "end_time",
      "start_date",
      "end_date",
      "created_at",
      "updated_at",
    ]);
  });

  test("tipos sql: los dias son un arreglo de smallint y las fechas son date", () => {
    expect(tipos(studentTimeBlock)).toEqual({
      id: "integer",
      student_id: "integer",
      title: "varchar(60)",
      color_hex: "varchar(7)",
      days_of_week: "smallint[]",
      start_time: "time",
      end_time: "time",
      start_date: "date",
      end_date: "date",
      created_at: "timestamp with time zone",
      updated_at: "timestamp with time zone",
    });
  });

  test("ninguna columna de la regla es nulable, y el id es la PK", () => {
    expect(nulables(studentTimeBlock)).toEqual([]);
    const id = getTableConfig(studentTimeBlock).columns.find((c) => c.name === "id");
    expect(id?.primary).toBe(true);
  });

  test("seis CHECK, un indice por alumno y ningun UNIQUE", () => {
    const cfg = getTableConfig(studentTimeBlock);
    expect(cfg.checks.map((k) => k.name)).toEqual([
      "chk_time_block_horas",
      "chk_time_block_grilla",
      "chk_time_block_fechas",
      "chk_time_block_dias",
      "chk_time_block_color",
      "chk_time_block_titulo",
    ]);
    expect(cfg.indexes.map((i) => i.config.name)).toEqual(["idx_time_block_student"]);
    expect(cfg.uniqueConstraints).toEqual([]);
  });

  test("una sola FK, a student, en cascada", () => {
    const fks = getTableConfig(studentTimeBlock).foreignKeys;
    expect(fks.length).toBe(1);
    expect(fks[0]?.getName()).toBe("student_time_block_student_id_student_id_fk");
    expect(fks[0]?.onDelete).toBe("cascade");
    expect(fks[0]?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
  });
});

describe("schema.ts · student_time_block_exception", () => {
  test("nombre de tabla y columnas, en orden", () => {
    expect(getTableConfig(studentTimeBlockException).name).toBe("student_time_block_exception");
    expect(columnas(studentTimeBlockException)).toEqual([
      "id",
      "block_id",
      "occurrence_date",
      "status",
      "start_time",
      "end_time",
    ]);
  });

  test("tipos sql, y solo las horas son nulables", () => {
    expect(tipos(studentTimeBlockException)).toEqual({
      id: "integer",
      block_id: "integer",
      occurrence_date: "date",
      status: "time_block_exception_status",
      start_time: "time",
      end_time: "time",
    });
    expect(nulables(studentTimeBlockException)).toEqual(["start_time", "end_time"]);
  });

  test("UNIQUE por bloque y fecha, dos CHECK y FK al bloque en cascada", () => {
    const cfg = getTableConfig(studentTimeBlockException);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["uq_time_block_exception"]);
    expect(cfg.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
      "block_id",
      "occurrence_date",
    ]);
    expect(cfg.checks.map((k) => k.name)).toEqual([
      "chk_time_block_exc_movido",
      "chk_time_block_exc_grilla",
    ]);
    expect(cfg.foreignKeys.length).toBe(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe(
      "student_time_block_exception_block_id_student_time_block_id_fk",
    );
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
  });
});

describe("schema.ts · time_block_exception_status", () => {
  test("el enum tiene los dos estados de la spec y ninguno mas", () => {
    expect(timeBlockExceptionStatusEnum.enumName).toBe("time_block_exception_status");
    expect(timeBlockExceptionStatusEnum.enumValues).toEqual(["cancelled", "moved"]);
  });
});
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}"
DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/migration-0012.test.ts
```

  Esperado: **FAIL**, y falla al enlazar el módulo, antes de correr un solo `test()` y antes incluso del `await Bun.file(…)` del cuerpo:

```
# Unhandled error between tests
-------------------------------
SyntaxError: Export named 'studentTimeBlock' not found in module '$REPO/src/db/schema/schema.ts'.
-------------------------------

 0 pass
 1 fail
 1 error
```

  Esa es la razón correcta: todavía no existe la tabla en `schema.ts`. Si agregas el schema pero no el `.sql`, el siguiente fallo es el otro que corresponde, también `0 pass / 1 fail / 1 error`:

```
ENOENT: no such file or directory, open 'drizzle/0012_time_blocks.sql'
    path: "drizzle/0012_time_blocks.sql",
 syscall: "open",
   errno: -2,
    code: "ENOENT"
```

- [ ] **Paso 3: Implementación mínima**

  **3a. `src/db/schema/schema.ts`** — apéndice al final del archivo. No se tocan los imports: `check`, `date`, `index`, `integer`, `pgEnum`, `pgTable`, `smallint`, `time`, `timestamp`, `unique` y `varchar` ya están en el bloque de `drizzle-orm/pg-core` (líneas 1-20), y `sql` en la línea 21.

  Reemplazar esto (líneas 727-729, las tres últimas del archivo):

```ts
}, (t) => ({
  uqStudentPeriodSummary: unique("uq_student_period_summary").on(t.studentId, t.periodCode),
}));
```

  por esto:

```ts
}, (t) => ({
  uqStudentPeriodSummary: unique("uq_student_period_summary").on(t.studentId, t.periodCode),
}));

/**
 * RS-BE-30 · Estado de un día que se sale del patrón de un bloque propio.
 *
 * Vive acá, pegado a su tabla, y no en el bloque de enums de arriba: su único
 * uso es `student_time_block_exception`.
 */
export const timeBlockExceptionStatusEnum = pgEnum("time_block_exception_status", [
  "cancelled",
  "moved",
]);

/**
 * RS-BE-30 · La REGLA de un bloque propio del alumno: prácticas, trabajo,
 * voluntariado. Título, color, días de la semana, horas y rango de fechas.
 *
 * No cuelga de `section`, `course_offering` ni `academic_period` a propósito
 * (decisión 5 de la spec): unas prácticas preprofesionales cruzan ciclos y
 * vacaciones, así que la vigencia son fechas propias del bloque. Es la primera
 * tabla del horario con fechas de inicio y fin suyas.
 *
 * Tampoco toca `schedule_session`: ahí `section_id` es NOT NULL y
 * `recomputeOfferingHoursFromSchedule` (`portal-sync.repository.ts:599`) suma
 * TODAS las filas de una sección para pisar `course_offering.total_hours`, que
 * es el denominador del % de inasistencia de attendance-risk.
 *
 * `days_of_week` es un arreglo y no una tabla hija porque la expansión ocurre
 * en código (`time-blocks.logic.ts`) y nunca se pregunta desde SQL "qué
 * bloques caen el martes".
 */
export const studentTimeBlock = pgTable("student_time_block", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 60 }).notNull(),
  /** `#RRGGBB` elegido por el alumno: 7 caracteres exactos. */
  colorHex: varchar("color_hex", { length: 7 }).notNull(),
  /** 1 = lunes … 7 = domingo, la misma convención que `schedule_session.day_of_week`. */
  daysOfWeek: smallint("days_of_week").array().notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  chkTimeBlockHoras: check("chk_time_block_horas", sql`${t.endTime} > ${t.startTime}`),
  // 07:00-22:00 es lo que la grilla del horario puede pintar: un bloque fuera
  // de ese rango sería invisible en la app, así que se rechaza y no se guarda.
  chkTimeBlockGrilla: check(
    "chk_time_block_grilla",
    sql`${t.startTime} >= '07:00' AND ${t.endTime} <= '22:00'`,
  ),
  chkTimeBlockFechas: check("chk_time_block_fechas", sql`${t.endDate} >= ${t.startDate}`),
  // El `coalesce` no es adorno (RS-BE-30, "Modelo de datos" de la spec): sobre
  // un arreglo vacío `array_length` devuelve NULL, y una restricción que evalúa
  // a NULL se da por satisfecha, así que sin él un `days_of_week` vacío pasaría.
  chkTimeBlockDias: check(
    "chk_time_block_dias",
    sql`coalesce(array_length(${t.daysOfWeek}, 1), 0) BETWEEN 1 AND 7 AND ${t.daysOfWeek} <@ ARRAY[1,2,3,4,5,6,7]::smallint[]`,
  ),
  chkTimeBlockColor: check("chk_time_block_color", sql`${t.colorHex} ~ '^#[0-9A-Fa-f]{6}$'`),
  chkTimeBlockTitulo: check(
    "chk_time_block_titulo",
    sql`length(btrim(${t.title})) BETWEEN 1 AND 60`,
  ),
  idxTimeBlockStudent: index("idx_time_block_student").on(t.studentId),
}));

/**
 * RS-BE-30 · Lo que se sale de la regla: una fila por fecha.
 *
 * `cancelled` = ese día no va; `moved` = ese día tiene otras horas. Editar la
 * regla (PATCH) NO borra estas filas: mover el patrón de las 14:00 a las 15:00
 * deja el día cancelado igual de cancelado (RS-BE-31).
 *
 * El UNIQUE (block_id, occurrence_date) es lo que hace idempotente al PUT de
 * la excepción: `on conflict do update`.
 */
export const studentTimeBlockException = pgTable("student_time_block_exception", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  blockId: integer("block_id").notNull().references(() => studentTimeBlock.id, { onDelete: "cascade" }),
  occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
  status: timeBlockExceptionStatusEnum("status").notNull(),
  /** NULL en `cancelled`; obligatorias en `moved`, y el CHECK lo exige. */
  startTime: time("start_time"),
  endTime: time("end_time"),
}, (t) => ({
  uqTimeBlockException: unique("uq_time_block_exception").on(t.blockId, t.occurrenceDate),
  chkTimeBlockExcMovido: check(
    "chk_time_block_exc_movido",
    sql`(${t.status} = 'cancelled' AND ${t.startTime} IS NULL AND ${t.endTime} IS NULL) OR (${t.status} = 'moved' AND ${t.startTime} IS NOT NULL AND ${t.endTime} IS NOT NULL AND ${t.endTime} > ${t.startTime})`,
  ),
  chkTimeBlockExcGrilla: check(
    "chk_time_block_exc_grilla",
    sql`${t.startTime} IS NULL OR (${t.startTime} >= '07:00' AND ${t.endTime} <= '22:00')`,
  ),
}));
```

  **3b. `drizzle/0012_time_blocks.sql`** — archivo nuevo, contenido completo. La indentación de las columnas dentro de los `CREATE TABLE` es **tabulador**, como en la 0011. La cabecera evita a propósito las cadenas `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`, `ALTER TABLE`, `DROP` y `CHECK (`, porque la prueba cuenta cuántas veces aparecen en todo el archivo:

```sql
-- RS-BE-30 · Bloques de horario propios del alumno (prácticas, trabajo, voluntariado).
--
-- Un tipo enumerado y dos tablas nuevas; ninguna columna tocada de las que ya existen:
--   time_block_exception_status   estado de un día que se sale del patrón.
--   student_time_block            la REGLA: título, color, días, horas y rango de fechas.
--   student_time_block_exception  una fila por fecha que se sale de esa regla.
--
-- Por qué tabla aparte y no `schedule_session`: esa tabla tiene `section_id`
-- NOT NULL apuntando a `section`, su unique es (section_id, day_of_week,
-- start_time) y `recomputeOfferingHoursFromSchedule` (portal-sync.repository.ts:599)
-- suma TODAS sus filas de una sección para pisar `course_offering.total_hours`,
-- que es el denominador del % de inasistencia. Un bloque personal ahí dentro
-- falsearía el riesgo de impedimento de todos los matriculados en esa sección.
--
-- Sin relación con curso, sección, ciclo ni matrícula (decisión 5 de la spec):
-- unas prácticas preprofesionales cruzan ciclos y vacaciones, así que la
-- vigencia son fechas propias del bloque. Es la primera tabla del horario con
-- fechas de inicio y fin suyas.
--
-- Las dos cuelgan con borrado en cascada: la excepción muere con su bloque y el
-- bloque muere con su alumno.
--
-- Por qué CHECK y no solo Zod: a diferencia del récord, este dato no viene de
-- un portal que no controlamos sino de un formulario que sí controlamos, y un
-- valor imposible —hora de fin antes de la de inicio, color inventado— haría
-- que la grilla pinte basura o no pinte nada. Un rechazo es un error del
-- alumno, no una importación entera perdida.
--
-- `chk_time_block_dias` envuelve `array_length` en `coalesce(…, 0)` a
-- propósito: sobre un arreglo vacío `array_length` devuelve NULL, y una
-- restricción que evalúa a NULL se da por satisfecha, así que sin el coalesce
-- un `days_of_week` vacío entraría igual. La spec pide "entre 1 y 7 valores";
-- esto es lo que hace que eso se cumpla también en la base.
--
-- Aditiva e idempotente: el tipo enumerado se crea dentro de un bloque DO
-- guardado contra `duplicate_object`, las dos tablas y el índice llevan
-- `IF NOT EXISTS` y las restricciones viajan dentro de la definición, así que
-- se puede re-aplicar sin daño. Crear un tipo nuevo sí es transaccional: la
-- trampa de MIGRATIONS.md:125 es agregarle un valor a un tipo que YA existe,
-- que no es transaccional y revienta dentro de db:apply; acá no se hace.
--
--   bun run db:apply drizzle/0012_time_blocks.sql
--
-- Con db:apply y NO con db:migrate ni db:generate: drizzle/meta/_journal.json
-- se quedó en la 0009 (9 entradas), así que ni la 0010, ni la 0011, ni esta
-- quedan registradas ahí.

DO $$ BEGIN
  CREATE TYPE "public"."time_block_exception_status" AS ENUM('cancelled', 'moved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_time_block" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "student_time_block_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"student_id" integer NOT NULL,
	"title" varchar(60) NOT NULL,
	"color_hex" varchar(7) NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_time_block_horas" CHECK ("student_time_block"."end_time" > "student_time_block"."start_time"),
	CONSTRAINT "chk_time_block_grilla" CHECK ("student_time_block"."start_time" >= '07:00' AND "student_time_block"."end_time" <= '22:00'),
	CONSTRAINT "chk_time_block_fechas" CHECK ("student_time_block"."end_date" >= "student_time_block"."start_date"),
	CONSTRAINT "chk_time_block_dias" CHECK (coalesce(array_length("student_time_block"."days_of_week", 1), 0) BETWEEN 1 AND 7 AND "student_time_block"."days_of_week" <@ ARRAY[1,2,3,4,5,6,7]::smallint[]),
	CONSTRAINT "chk_time_block_color" CHECK ("student_time_block"."color_hex" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "chk_time_block_titulo" CHECK (length(btrim("student_time_block"."title")) BETWEEN 1 AND 60),
	CONSTRAINT "student_time_block_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_time_block_student" ON "student_time_block" USING btree ("student_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_time_block_exception" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "student_time_block_exception_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"block_id" integer NOT NULL,
	"occurrence_date" date NOT NULL,
	"status" "time_block_exception_status" NOT NULL,
	"start_time" time,
	"end_time" time,
	CONSTRAINT "uq_time_block_exception" UNIQUE("block_id","occurrence_date"),
	CONSTRAINT "chk_time_block_exc_movido" CHECK (("student_time_block_exception"."status" = 'cancelled' AND "student_time_block_exception"."start_time" IS NULL AND "student_time_block_exception"."end_time" IS NULL) OR ("student_time_block_exception"."status" = 'moved' AND "student_time_block_exception"."start_time" IS NOT NULL AND "student_time_block_exception"."end_time" IS NOT NULL AND "student_time_block_exception"."end_time" > "student_time_block_exception"."start_time")),
	CONSTRAINT "chk_time_block_exc_grilla" CHECK ("student_time_block_exception"."start_time" IS NULL OR ("student_time_block_exception"."start_time" >= '07:00' AND "student_time_block_exception"."end_time" <= '22:00')),
	CONSTRAINT "student_time_block_exception_block_id_student_time_block_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."student_time_block"("id") ON DELETE cascade ON UPDATE no action
);
```

  Comprobar que los tabuladores quedaron de verdad y no como espacios (debe imprimir **28**: 11 columnas + 7 CONSTRAINT de `student_time_block`, 6 columnas + 4 CONSTRAINT de `student_time_block_exception`):

```bash
cd "${REPO:?}"
awk '/^\t/ { n++ } END { print n+0 }' drizzle/0012_time_blocks.sql
```

  **No** correr `db:apply`, `db:push`, `db:migrate`, `db:generate`, `db:seed` ni `psql`. La migración se queda escrita; la aplica el dueño en la Tarea 8.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}"
DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/migration-0012.test.ts
```

  Esperado: **PASS** — `19 pass, 0 fail, 72 expect() calls`, `Ran 19 tests across 1 file`.

  Tras esta tarea la suite completa queda en **1505 pass, 0 fail, 5301 expect(), 109 archivos** (la cifra de partida de la Tarea 5).

- [ ] **Paso 5: Build**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}"
$BUN run build
```

  Esperado: `tsc` termina en **0** y no imprime ningún error. Con `strict` y `noUnusedLocals` prendidos, un `.array()` mal puesto o un helper sin importar saldría acá. Ojo: `tsconfig.json` tiene `"include": ["src/**/*"]`, así que el build **no** revisa los tipos de `test/`; a la prueba nueva la cubre el Paso 4, no este paso. La suite completa se vuelve a correr en las Tareas 5, 7 y 8.

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}"
git add src/db/schema/schema.ts drizzle/0012_time_blocks.sql test/HU35_jeff/migration-0012.test.ts specs/features/time-blocks/time-blocks.spec.md
git commit -m "feat(time-blocks): modelo de datos de los bloques propios y migracion 0012

La spec pasa a APROBADA (lineas 16-17), con la aprobacion del dueño de la
spec y del cambio de base de datos que exige AGENTS.md, y entra con su
revision del 2026-09-21: PATCH en el CORS, tope de 20 bloques guardados
(vencidos incluidos), semanas enteras en weeks, fechas entre 2000 y 2099,
excepciones canceladas con horas en null, ejemplos del contrato dentro del
patron y RS-BE-36 (isoDate en los dias de GET /schedule/me/sessions).

RS-BE-30. Agrega el enum time_block_exception_status y las tablas
student_time_block (la regla: titulo, color, dias, horas y rango de fechas)
y student_time_block_exception (un dia cancelado o movido), las dos colgando
de student con borrado en cascada y sin relacion con curso, seccion, ciclo ni
matricula.

chk_time_block_dias envuelve array_length en coalesce(..., 0): sobre un
arreglo vacio array_length devuelve NULL y la restriccion se daria por
satisfecha, asi que sin eso un days_of_week vacio entraria igual.

La migracion 0012 es aditiva e idempotente y NO se aplica aca: la aplica el
dueño con db:apply y respaldo previo, segun MIGRATIONS.md. La prueba es
estatica: lee el .sql como texto y el schema con getTableConfig, sin tocar
la base."
```

  Sin trailer `Co-Authored-By`: el autor ya está configurado en git. Nada de `push` ni de PR.
### Tarea 2: Expansión de ocurrencias y horas por semana (funciones puras)

**Archivos:**
- Crear: `src/modules/time-blocks/time-blocks.types.ts` (la carpeta `src/modules/time-blocks/` todavía no existe; escribir el archivo la crea)
- Crear: `src/modules/time-blocks/time-blocks.logic.ts`
- Crear: `test/HU35_jeff/time-blocks-expansion.test.ts` (la carpeta `test/HU35_jeff/` la crea la Tarea 1 con `migration-0012.test.ts`; si esa tarea aún no corrió, escribir este archivo la crea igual)
- Modificar: ninguno. Esta tarea no toca ni una línea de un archivo que ya exista.
- Test: `test/HU35_jeff/time-blocks-expansion.test.ts`

La spec ya cubre los dos archivos nuevos con el target `../../../src/modules/time-blocks/**`
(`specs/features/time-blocks/time-blocks.spec.md:5`) y ya enlaza
`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts` bajo RS-BE-33 (línea 153) y bajo
RS-BE-34 (línea 174): **no se toca la spec en esta tarea**.

Todos los comandos se corren desde la raíz del worktree `$REPO`,
rama `feat/bloques-horario`.

**Interfaces:**

- Consume: **nada de la Tarea 1 y nada del repo**. Estas dos funciones son puras sobre cadenas
  `"YYYY-MM-DD"` y `"HH:MM"`: no importan `db`, ni `drizzle-orm`, ni `hono`, ni el schema, ni los tipos
  de otro módulo. Lo único que se hereda del repo son tres convenciones, copiadas del código de hoy:
  ```ts
  // src/db/schema/schema.ts:465-478 — la tabla `schedule_session`, de donde sale la convención
  // de día de la semana del sistema (línea 468 la columna, línea 475 el CHECK):
  //   dayOfWeek: integer("day_of_week").notNull(),
  //   chkScheduleSessionDay: check("chk_schedule_session_day", sql`${t.dayOfWeek} BETWEEN 1 AND 7`),
  // src/modules/schedule/schedule.service.ts:171 — cómo se traduce ese número a nombre:
  //   ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][day - 1] ?? "Por definir";
  //   → 1 = lunes … 7 = domingo
  // src/modules/academic-record/academic-record.logic.ts — el molde de un archivo `*.logic.ts`:
  //   cabecera que dice que no importa `db`, solo `import type` (líneas 8-14), funciones exportadas
  //   como `const` flecha, comentarios en español.
  ```
- Produce (lo usan las Tareas 3, 4 y 5):
  ```ts
  // src/modules/time-blocks/time-blocks.types.ts
  export interface TimeBlockRule {
    id: number; title: string; colorHex: string; daysOfWeek: number[];   // 1 = lunes … 7 = domingo
    startTime: string; endTime: string;                                   // "HH:MM"
    startDate: string; endDate: string;                                   // "YYYY-MM-DD"
  }
  export type TimeBlockInput = Omit<TimeBlockRule, "id">;
  export type TimeBlockExceptionStatus = "cancelled" | "moved";
  export interface TimeBlockException {
    blockId: number; date: string; status: TimeBlockExceptionStatus;
    startTime: string | null; endTime: string | null;
  }
  export interface TimeBlockOccurrence {
    blockId: number; title: string; colorHex: string;
    date: string; dayOfWeek: number; startTime: string; endTime: string; moved: boolean;
  }
  export interface TimeBlockWeekHours { weekStart: string; hours: number }

  // src/modules/time-blocks/time-blocks.logic.ts
  export const WINDOW_MAX_DAYS = 120;
  export const GRID_START = "07:00";
  export const GRID_END = "22:00";
  export const dayOfWeekOf = (date: string): number          // 1 = lunes … 7 = domingo, sobre la fecha plana
  export const addDays = (date: string, n: number): string
  export const mondayOf = (date: string): string
  export const minutesOf = (time: string): number            // "14:30" → 870
  export const hoursBetween = (start: string, end: string): number   // decimal, sin redondear
  export const withinGrid = (start: string, end: string): boolean
  export const expandOccurrences = (
    rules: readonly TimeBlockRule[], exceptions: readonly TimeBlockException[],
    from: string, to: string,
  ): TimeBlockOccurrence[]
  export const weeklyHours = (
    occurrences: readonly TimeBlockOccurrence[], from: string, to: string,
  ): TimeBlockWeekHours[]   // una entrada por cada lunes entre mondayOf(from) y mondayOf(to), con 0 si no hay nada
  ```
  `weeklyHours` recibe la ventana porque RS-BE-34 pide "una entrada por cada semana entre el lunes de
  `from` y el lunes de `to`" (`time-blocks.spec.md:157-158`), y que "una semana sin nada sale con
  `hours: 0`", que es un total conocido y no un dato que falta (`:164-165`). Y suma **todo** lo que recibe
  de cada una de esas semanas: el total "de la semana **entera**, de lunes a domingo, aunque la ventana la
  corte" (`:161`) lo arma el service de la Tarea 4 pasándole las ocurrencias de las semanas completas, no
  solo las de la ventana.

  `TimeBlockInput` sale de este archivo aunque no lo use ninguna función de la Tarea 2: la Tarea 3 lo
  necesita para las firmas de `insertBlock`/`updateBlock` y **no** tiene `time-blocks.types.ts` en su
  lista de archivos, así que el alias se escribe acá, junto a `TimeBlockRule`, de donde deriva. Un tipo
  exportado sin uso no rompe el build: `noUnusedLocals` solo mira los locales.

  Quién consume qué después:
  - Tarea 3 (repository): `TimeBlockRule`, `TimeBlockInput`, `TimeBlockException`,
    `TimeBlockExceptionStatus`.
  - Tarea 4 (service): `expandOccurrences`, `weeklyHours`, `withinGrid`, `WINDOW_MAX_DAYS`,
    `dayOfWeekOf`, `addDays`, `mondayOf`, y los tipos `TimeBlockOccurrence` y `TimeBlockWeekHours`.
  - Tarea 5 (controller y rutas): los tipos, por la forma del JSON.

- [ ] **Paso 1: Escribir la prueba que falla**

Antes de escribir nada, comprobar que el árbol está donde debe y que los archivos de esta tarea no existen ya:

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && ls src/modules/time-blocks test/HU35_jeff/time-blocks-expansion.test.ts 2>&1 | head -4
```

Esperado, literal:

```
feat/bloques-horario
ls: src/modules/time-blocks: No such file or directory
ls: test/HU35_jeff/time-blocks-expansion.test.ts: No such file or directory
```

Que `test/HU35_jeff/` ya exista con `migration-0012.test.ts` de la Tarea 1 está bien: la segunda línea de
error apunta al archivo de esta tarea, no a la carpeta, y todavía no existe porque este chequeo va antes
de crearlo. Si `src/modules/time-blocks` ya tuviera archivos, o si el archivo de prueba ya existiera,
PARAR: alguien adelantó la tarea.

Crear `test/HU35_jeff/time-blocks-expansion.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import {
  GRID_END,
  GRID_START,
  WINDOW_MAX_DAYS,
  addDays,
  dayOfWeekOf,
  expandOccurrences,
  hoursBetween,
  minutesOf,
  mondayOf,
  weeklyHours,
  withinGrid,
} from "../../src/modules/time-blocks/time-blocks.logic.js";
import type {
  TimeBlockException,
  TimeBlockOccurrence,
  TimeBlockRule,
} from "../../src/modules/time-blocks/time-blocks.types.js";

// RS-BE-33 y RS-BE-34 — Expansión de ocurrencias y horas por semana.
// Reglas inventadas del alumno sintético 20230001: ningún dato real.
//
// Calendario de referencia (2026):
//   lu 21-09  ma 22-09  mi 23-09  ju 24-09  vi 25-09  sa 26-09  do 27-09
//   lu 28-09  ma 29-09  mi 30-09  ju 01-10  vi 02-10  sa 03-10  do 04-10
//   lu 05-10 … lu 12-10 … lu 19-10  ma 20-10  mi 21-10

/** Lunes y miércoles de 14:00 a 18:00, del miércoles 23-09 al martes 20-10. */
const PRACTICAS: TimeBlockRule = {
  id: 12,
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-23",
  endDate: "2026-10-20",
};

/** Solo miércoles, de 08:00 a 10:00: se cruza con PRACTICAS el mismo día. */
const VOLUNTARIADO: TimeBlockRule = {
  id: 7,
  title: "Voluntariado",
  colorHex: "#2E7D32",
  daysOfWeek: [3],
  startTime: "08:00",
  endTime: "10:00",
  startDate: "2026-09-23",
  endDate: "2026-10-20",
};

const cancelado = (blockId: number, date: string): TimeBlockException => ({
  blockId,
  date,
  status: "cancelled",
  startTime: null,
  endTime: null,
});

const movido = (
  blockId: number,
  date: string,
  startTime: string,
  endTime: string,
): TimeBlockException => ({ blockId, date, status: "moved", startTime, endTime });

/** Una ocurrencia en una línea: "2026-09-23 14:00-18:00 #12" (+ " movido"). */
const resumen = (ocurrencias: readonly TimeBlockOccurrence[]): string[] =>
  ocurrencias.map(
    (o) => `${o.date} ${o.startTime}-${o.endTime} #${o.blockId}${o.moved ? " movido" : ""}`,
  );

/** La ventana completa del caso base: lunes 21-09 a domingo 25-10. */
const VENTANA = { from: "2026-09-21", to: "2026-10-25" };

/** Las ocho ocurrencias de PRACTICAS en VENTANA, sin ninguna excepción. */
const OCHO_DIAS = [
  "2026-09-23 14:00-18:00 #12",
  "2026-09-28 14:00-18:00 #12",
  "2026-09-30 14:00-18:00 #12",
  "2026-10-05 14:00-18:00 #12",
  "2026-10-07 14:00-18:00 #12",
  "2026-10-12 14:00-18:00 #12",
  "2026-10-14 14:00-18:00 #12",
  "2026-10-19 14:00-18:00 #12",
];

describe("helpers de fecha y hora", () => {
  test("dayOfWeekOf usa 1 lunes y 7 domingo, y no se corre por el huso", () => {
    // En Lima (UTC-5) `new Date("2026-09-21").getDay()` da 0: el lunes se lee
    // como domingo. Estas cuatro fechas fijan que eso no pase.
    expect(dayOfWeekOf("2026-09-21")).toBe(1);
    expect(dayOfWeekOf("2026-09-26")).toBe(6);
    expect(dayOfWeekOf("2026-09-27")).toBe(7);
    expect(dayOfWeekOf("2026-10-20")).toBe(2);
  });

  test("addDays cruza fin de mes, fin de anio y anio bisiesto", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-09-21", 0)).toBe("2026-09-21");
  });

  test("mondayOf devuelve el lunes y el domingo cae en la semana anterior", () => {
    expect(mondayOf("2026-09-21")).toBe("2026-09-21");
    expect(mondayOf("2026-09-23")).toBe("2026-09-21");
    expect(mondayOf("2026-09-27")).toBe("2026-09-21");
    expect(mondayOf("2026-10-02")).toBe("2026-09-28");
  });

  test("minutesOf y hoursBetween no redondean", () => {
    expect(minutesOf("14:30")).toBe(870);
    expect(minutesOf("07:00")).toBe(420);
    expect(minutesOf("22:00")).toBe(1320);
    expect(hoursBetween("14:00", "18:30")).toBe(4.5);
    expect(hoursBetween("08:00", "10:00")).toBe(2);
    expect(hoursBetween("09:15", "10:00")).toBe(0.75);
  });

  test("withinGrid acepta los bordes de la grilla y rechaza lo de afuera", () => {
    expect(GRID_START).toBe("07:00");
    expect(GRID_END).toBe("22:00");
    expect(WINDOW_MAX_DAYS).toBe(120);
    expect(withinGrid("07:00", "22:00")).toBe(true);
    expect(withinGrid("14:00", "18:00")).toBe(true);
    expect(withinGrid("06:59", "10:00")).toBe(false);
    expect(withinGrid("20:00", "22:01")).toBe(false);
  });
});

describe("expandOccurrences", () => {
  test("un bloque que empieza a mitad de semana no genera los dias previos", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to);
    // El lunes 21-09 cae en la ventana y es día del patrón, pero es anterior
    // al startDate: la primera semana solo trae el miércoles.
    expect(resumen(ocurrencias)).toEqual(OCHO_DIAS);
    expect(ocurrencias[0]?.date).toBe("2026-09-23");
    expect(ocurrencias[0]?.dayOfWeek).toBe(3);
    expect(resumen(ocurrencias)).not.toContain("2026-09-21 14:00-18:00 #12");
  });

  test("un rango que termina un martes no genera el miercoles siguiente", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to);
    expect(ocurrencias.at(-1)?.date).toBe("2026-10-19");
    expect(ocurrencias.map((o) => o.date)).not.toContain("2026-10-21");
  });

  test("una ventana que no toca el rango del bloque devuelve lista vacia", () => {
    expect(expandOccurrences([PRACTICAS], [], "2026-11-02", "2026-11-08")).toEqual([]);
    expect(expandOccurrences([PRACTICAS], [], "2026-08-01", "2026-08-31")).toEqual([]);
  });

  test("la ventana recorta el rango del bloque por los dos lados", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], "2026-09-30", "2026-10-07");
    expect(resumen(ocurrencias)).toEqual([
      "2026-09-30 14:00-18:00 #12",
      "2026-10-05 14:00-18:00 #12",
      "2026-10-07 14:00-18:00 #12",
    ]);
  });

  test("un dia cancelado no aparece", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [cancelado(12, "2026-10-07")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(ocurrencias).toHaveLength(7);
    expect(ocurrencias.map((o) => o.date)).not.toContain("2026-10-07");
  });

  test("un dia movido aparece con sus horas nuevas y moved true", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [movido(12, "2026-10-12", "15:00", "19:30")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(ocurrencias).toHaveLength(8);
    expect(ocurrencias.find((o) => o.date === "2026-10-12")).toEqual({
      blockId: 12,
      title: "Practicas preprofesionales",
      colorHex: "#F94B3F",
      date: "2026-10-12",
      dayOfWeek: 1,
      startTime: "15:00",
      endTime: "19:30",
      moved: true,
    });
    // Los demás días siguen con el patrón.
    expect(ocurrencias.filter((o) => o.moved)).toHaveLength(1);
    expect(ocurrencias.find((o) => o.date === "2026-10-14")?.startTime).toBe("14:00");
  });

  test("una excepcion sobre una fecha que el patron no genera se ignora", () => {
    const sinExcepciones = resumen(expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to));
    const excepciones = [
      cancelado(12, "2026-10-06"), // martes: no es día del patrón
      movido(12, "2026-09-21", "09:00", "11:00"), // lunes anterior al startDate
      cancelado(12, "2026-10-26"), // lunes posterior al endDate
    ];
    const conExcepciones = expandOccurrences([PRACTICAS], excepciones, VENTANA.from, VENTANA.to);
    expect(resumen(conExcepciones)).toEqual(sinExcepciones);
  });

  test("la excepcion de otro bloque en la misma fecha no toca este", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [cancelado(99, "2026-10-07"), movido(99, "2026-10-12", "20:00", "21:00")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(resumen(ocurrencias)).toEqual(OCHO_DIAS);
  });

  test("dos reglas el mismo dia salen ordenadas por hora de inicio", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS, VOLUNTARIADO],
      [],
      "2026-09-28",
      "2026-10-02",
    );
    expect(resumen(ocurrencias)).toEqual([
      "2026-09-28 14:00-18:00 #12",
      "2026-09-30 08:00-10:00 #7",
      "2026-09-30 14:00-18:00 #12",
    ]);
  });

  test("dos reglas a la misma hora el mismo dia se ordenan por bloque", () => {
    const aLaMismaHora: TimeBlockRule = { ...VOLUNTARIADO, startTime: "14:00", endTime: "16:00" };
    const ocurrencias = expandOccurrences(
      [PRACTICAS, aLaMismaHora],
      [],
      "2026-09-30",
      "2026-09-30",
    );
    expect(resumen(ocurrencias)).toEqual([
      "2026-09-30 14:00-16:00 #7",
      "2026-09-30 14:00-18:00 #12",
    ]);
  });

  test("sin reglas no hay ocurrencias", () => {
    expect(expandOccurrences([], [cancelado(12, "2026-10-07")], VENTANA.from, VENTANA.to)).toEqual([]);
  });

  test("el recorrido termina aunque el rango llegue al 9999-12-31", () => {
    // Un dia despues del 9999-12-31, addDays imprime "+010000-01", que como
    // texto es MENOR que "9999-12-31": un bucle que avanzara sobre la cadena
    // no terminaria nunca. Entre el 9999-09-03 y el 9999-12-31 hay 17 lunes.
    const hastaElFinal: TimeBlockRule = {
      ...PRACTICAS,
      daysOfWeek: [1],
      startDate: "9999-09-03",
      endDate: "9999-12-31",
    };
    const ocurrencias = expandOccurrences([hastaElFinal], [], "9999-09-03", "9999-12-31");
    expect(ocurrencias).toHaveLength(17);
    expect(ocurrencias.every((o) => o.date >= "9999-09-03" && o.date <= "9999-12-31")).toBe(true);
  });
});

describe("weeklyHours", () => {
  test("agrupa por lunes y suma las horas de cada semana", () => {
    const ocurrencias = expandOccurrences([PRACTICAS], [], VENTANA.from, VENTANA.to);
    expect(weeklyHours(ocurrencias, VENTANA.from, VENTANA.to)).toEqual([
      { weekStart: "2026-09-21", hours: 4 },
      { weekStart: "2026-09-28", hours: 8 },
      { weekStart: "2026-10-05", hours: 8 },
      { weekStart: "2026-10-12", hours: 8 },
      { weekStart: "2026-10-19", hours: 4 },
    ]);
  });

  test("un dia cancelado no suma", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [cancelado(12, "2026-10-07")],
      VENTANA.from,
      VENTANA.to,
    );
    expect(weeklyHours(ocurrencias, VENTANA.from, VENTANA.to)).toContainEqual({
      weekStart: "2026-10-05",
      hours: 4,
    });
  });

  test("un dia movido suma su duracion nueva, no la del patron", () => {
    const ocurrencias = expandOccurrences(
      [PRACTICAS],
      [movido(12, "2026-10-12", "15:00", "19:30")],
      VENTANA.from,
      VENTANA.to,
    );
    // 4.5 del lunes movido + 4 del miércoles, sin redondear.
    expect(weeklyHours(ocurrencias, VENTANA.from, VENTANA.to)).toContainEqual({
      weekStart: "2026-10-12",
      hours: 8.5,
    });
  });

  test("una semana partida entre dos meses queda en una sola entrada", () => {
    const miercolesYViernes: TimeBlockRule = {
      id: 3,
      title: "Taller",
      colorHex: "#1565C0",
      daysOfWeek: [3, 5],
      startTime: "09:00",
      endTime: "12:00",
      startDate: "2026-09-28",
      endDate: "2026-10-04",
    };
    const ocurrencias = expandOccurrences([miercolesYViernes], [], "2026-09-28", "2026-10-04");
    expect(ocurrencias.map((o) => o.date)).toEqual(["2026-09-30", "2026-10-02"]);
    expect(weeklyHours(ocurrencias, "2026-09-28", "2026-10-04")).toEqual([
      { weekStart: "2026-09-28", hours: 6 },
    ]);
  });

  test("una semana que la ventana toca sin ocurrencias sale con cero horas", () => {
    const unLunes = (id: number, date: string): TimeBlockRule => ({
      id,
      title: "Charla",
      colorHex: "#6A1B9A",
      daysOfWeek: [1],
      startTime: "18:00",
      endTime: "20:00",
      startDate: date,
      endDate: date,
    });
    const ocurrencias = expandOccurrences(
      [unLunes(1, "2026-09-21"), unLunes(2, "2026-10-05")],
      [],
      "2026-09-21",
      "2026-10-11",
    );
    // RS-BE-34: una entrada por CADA semana entre los lunes de from y de to. La del 28-09 no
    // tiene ninguna ocurrencia y sale igual, con 0: es un total conocido, no
    // un dato que falta (la regla del null de la spec es para lo segundo).
    expect(weeklyHours(ocurrencias, "2026-09-21", "2026-10-11")).toEqual([
      { weekStart: "2026-09-21", hours: 2 },
      { weekStart: "2026-09-28", hours: 0 },
      { weekStart: "2026-10-05", hours: 2 },
    ]);
  });

  test("sin ocurrencias cada semana de la ventana sale en cero, desde la del lunes de from", () => {
    expect(weeklyHours([], "2026-09-21", "2026-10-04")).toEqual([
      { weekStart: "2026-09-21", hours: 0 },
      { weekStart: "2026-09-28", hours: 0 },
    ]);
    // Una ventana de un miercoles: su semana empieza el lunes anterior a from.
    expect(weeklyHours([], "2026-09-23", "2026-09-23")).toEqual([
      { weekStart: "2026-09-21", hours: 0 },
    ]);
  });

  test("suma minutos y divide una sola vez: sin ruido de coma flotante", () => {
    // Sumar minutos/60 ocurrencia por ocurrencia da 7.000000000000001 para
    // seis de 70 minutos, 1.9999999999999998 para seis de 20 y
    // 0.9999999999999999 para seis de 10. La app muestra el numero tal cual.
    const seisDias = (startTime: string, endTime: string): TimeBlockRule => ({
      id: 5,
      title: "Turno",
      colorHex: "#00838F",
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      startTime,
      endTime,
      startDate: "2026-09-21",
      endDate: "2026-09-26",
    });
    const semana = (regla: TimeBlockRule) =>
      weeklyHours(expandOccurrences([regla], [], "2026-09-21", "2026-09-27"), "2026-09-21", "2026-09-27");
    expect(semana(seisDias("14:00", "15:10"))).toEqual([{ weekStart: "2026-09-21", hours: 7 }]);
    expect(semana(seisDias("14:00", "14:20"))).toEqual([{ weekStart: "2026-09-21", hours: 2 }]);
    expect(semana(seisDias("14:00", "14:10"))).toEqual([{ weekStart: "2026-09-21", hours: 1 }]);
  });
});
```

Las fechas del calendario del comentario de cabecera están comprobadas contra el calendario real de 2026:
21-09 es lunes, 23-09 miércoles, 26-09 sábado, 27-09 domingo, 28-09 lunes, 30-09 miércoles, 02-10 viernes,
04-10 domingo, 05-10 lunes, 06-10 martes, 07-10 miércoles, 12-10 lunes, 14-10 miércoles, 19-10 lunes,
20-10 martes, 21-10 miércoles, 25-10 domingo y 26-10 lunes. No cambies ninguna: casi todas las aserciones
dependen de ellas. Las del borde también están comprobadas con `Date.UTC`: el 9999-09-03 y el 9999-12-31
son viernes, entre los dos hay exactamente 17 lunes, y `addDays("9999-12-31", 1)` devuelve `"+010000-01"`.

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/time-blocks-expansion.test.ts
```

Esperado: FAIL al cargar el archivo, con

```
test/HU35_jeff/time-blocks-expansion.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/modules/time-blocks/time-blocks.logic.js' from '$REPO/test/HU35_jeff/time-blocks-expansion.test.ts'
-------------------------------


 0 pass
 1 fail
 1 error
```

Ninguna prueba llega a correr. El módulo que se nombra en el error es siempre `time-blocks.logic.js`,
aunque falte también `time-blocks.types.ts`: el segundo es un `import type` y el transpilador de bun lo
borra antes de resolver nada, así que el único import que puede fallar es el de valores.

El prefijo `DATABASE_URL=…` es obligatorio en **todas** las corridas de esta tarea: el `.env` del worktree
apunta a la base de PRODUCCIÓN y bun lo carga solo. Esta prueba no toca la base, pero el prefijo va igual,
porque el día que alguien copie el comando para otra sí importa. (El `preload` de `bunfig.toml`,
`test/env.setup.ts`, solo rellena lo ausente con `||=`, así que **no** protege de la base de producción:
la variable del prefijo es la que gana.)

- [ ] **Paso 3: Implementación mínima**

Primero, crear `src/modules/time-blocks/time-blocks.types.ts` con este contenido completo:

```ts
/**
 * Tipos de los bloques de horario propios del alumno (RS-BE-30 a RS-BE-34).
 *
 * Las horas viajan como "HH:MM" y las fechas como "YYYY-MM-DD", en hora de
 * Lima y sin zona pegada: son horas de pared, no instantes. El repository
 * (Tarea 3) recorta el "HH:MM:SS" que devuelve Postgres y lee las columnas
 * `date` con `::text`, para que todo el módulo hable un solo formato.
 */

/** Fila de `student_time_block`: la regla que se repite cada semana. */
export interface TimeBlockRule {
  id: number;
  title: string;
  colorHex: string;
  /** 1 = lunes … 7 = domingo, la convención de `schedule_session.day_of_week`. */
  daysOfWeek: number[];
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD" */
  endDate: string;
}

/** Lo que manda el alumno al crear o editar una regla: la fila sin su id. */
export type TimeBlockInput = Omit<TimeBlockRule, "id">;

export type TimeBlockExceptionStatus = "cancelled" | "moved";

/** Fila de `student_time_block_exception`: lo que se sale de la regla en una
 *  fecha. `cancelled` lleva las dos horas en null; `moved`, las dos con valor
 *  (lo fija el CHECK `chk_time_block_exc_movido`). */
export interface TimeBlockException {
  blockId: number;
  date: string;
  status: TimeBlockExceptionStatus;
  startTime: string | null;
  endTime: string | null;
}

/** Un día concreto ya resuelto: la regla con su excepción aplicada. */
export interface TimeBlockOccurrence {
  blockId: number;
  title: string;
  colorHex: string;
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moved: boolean;
}

/** Horas de una semana de lunes a domingo, en horas decimales sin redondear. */
export interface TimeBlockWeekHours {
  weekStart: string;
  hours: number;
}
```

Después, crear `src/modules/time-blocks/time-blocks.logic.ts` con este contenido completo. No agregues
ningún import más: este archivo no puede cargar `db` ni nada que lo cargue, porque lo va a importar el
service (Tarea 4) y las pruebas corren sin base.

```ts
/**
 * time-blocks.logic.ts — Lógica pura de los bloques propios (RS-BE-33 y RS-BE-34).
 *
 * Sin base de datos, sin HTTP y sin `Date` con zona: todo son cadenas planas
 * "YYYY-MM-DD" y "HH:MM" en hora de Lima, horas de pared y no instantes. Las
 * cuentas de calendario van en UTC con `Date.UTC`, que es la única forma de
 * que el día no se corra según el huso del proceso: en Vercel es UTC y en la
 * Mac del equipo es Lima (UTC-5), donde `new Date("2026-09-21").getDay()`
 * devuelve 0 (domingo) para un lunes.
 */
import type {
  TimeBlockException,
  TimeBlockOccurrence,
  TimeBlockRule,
  TimeBlockWeekHours,
} from "./time-blocks.types.js";

/** Tope de la ventana de ocurrencias, en días (RS-BE-33). Lo hace cumplir el
 *  service; el número vive acá para que haya una sola fuente de verdad. */
export const WINDOW_MAX_DAYS = 120;

/** Extremos de la grilla que la app puede pintar (RS-BE-31, decisión 7). */
export const GRID_START = "07:00";
export const GRID_END = "22:00";

const MS_POR_DIA = 86_400_000;

/** "YYYY-MM-DD" → el instante UTC de esa medianoche. Se parte la cadena a
 *  mano en vez de `new Date(texto)` para no depender del parser del runtime. */
const utcDe = (date: string): number =>
  Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));

/** Instante UTC → "YYYY-MM-DD". */
const textoDe = (utc: number): string => new Date(utc).toISOString().slice(0, 10);

/** Día de la semana con la convención del repo: 1 = lunes … 7 = domingo, la
 *  misma de `schedule_session.day_of_week`. `getUTCDay()` da 0 el domingo. */
export const dayOfWeekOf = (date: string): number =>
  ((new Date(utcDe(date)).getUTCDay() + 6) % 7) + 1;

/** Suma `n` días (puede ser negativo) sobre la fecha plana. */
export const addDays = (date: string, n: number): string => textoDe(utcDe(date) + n * MS_POR_DIA);

/** Lunes de la semana de `date`. El domingo pertenece a la semana que empezó
 *  el lunes anterior (RS-BE-34: las semanas van de lunes a domingo). */
export const mondayOf = (date: string): string => addDays(date, 1 - dayOfWeekOf(date));

/** "14:30" → 870. */
export const minutesOf = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Duración en horas decimales, sin redondear: "14:00"–"18:30" → 4.5. */
export const hoursBetween = (start: string, end: string): number =>
  (minutesOf(end) - minutesOf(start)) / 60;

/** Las dos horas entran en la grilla 07:00–22:00, bordes incluidos. */
export const withinGrid = (start: string, end: string): boolean =>
  minutesOf(start) >= minutesOf(GRID_START) && minutesOf(end) <= minutesOf(GRID_END);

/** Clave de una excepción: pertenece a un bloque y a una fecha concretos, así
 *  que dos bloques con excepción el mismo día no se pisan. */
const claveExcepcion = (blockId: number, date: string): string => `${blockId}|${date}`;

/**
 * RS-BE-33 — Expande las reglas a las ocurrencias concretas de [from, to].
 *
 * Recorre día a día desde max(from, rule.startDate) hasta min(to, rule.endDate)
 * —las cadenas "YYYY-MM-DD" se comparan bien en orden lexicográfico— e incluye
 * el día si `daysOfWeek` lo contiene. Después aplica la excepción de esa fecha:
 * `cancelled` omite el día y `moved` cambia las horas y marca `moved: true`.
 * Una excepción sobre una fecha que el patrón no genera nunca se consulta, así
 * que se ignora sola. El tope de la ventana lo hace cumplir el service antes
 * de llamar acá.
 *
 * El bucle avanza sobre el instante UTC y no sobre la cadena: un día después
 * del 9999-12-31, `addDays` imprime "+010000-01", que como texto es MENOR que
 * "9999-12-31", y un `for` que comparara cadenas no terminaría nunca.
 */
export const expandOccurrences = (
  rules: readonly TimeBlockRule[],
  exceptions: readonly TimeBlockException[],
  from: string,
  to: string,
): TimeBlockOccurrence[] => {
  const porBloqueYFecha = new Map<string, TimeBlockException>();
  for (const excepcion of exceptions) {
    porBloqueYFecha.set(claveExcepcion(excepcion.blockId, excepcion.date), excepcion);
  }

  const ocurrencias: TimeBlockOccurrence[] = [];
  for (const rule of rules) {
    const dias = new Set(rule.daysOfWeek);
    const primero = rule.startDate > from ? rule.startDate : from;
    const ultimo = rule.endDate < to ? rule.endDate : to;
    const fin = utcDe(ultimo);
    for (let instante = utcDe(primero); instante <= fin; instante += MS_POR_DIA) {
      const fecha = textoDe(instante);
      const dayOfWeek = dayOfWeekOf(fecha);
      if (!dias.has(dayOfWeek)) continue;

      const excepcion = porBloqueYFecha.get(claveExcepcion(rule.id, fecha));
      if (excepcion?.status === "cancelled") continue;

      let startTime = rule.startTime;
      let endTime = rule.endTime;
      let moved = false;
      // Una fila `moved` sin horas es imposible por `chk_time_block_exc_movido`;
      // si alguna llegara, el día se queda con el patrón en vez de romperse.
      if (
        excepcion !== undefined &&
        excepcion.status === "moved" &&
        excepcion.startTime !== null &&
        excepcion.endTime !== null
      ) {
        startTime = excepcion.startTime;
        endTime = excepcion.endTime;
        moved = true;
      }

      ocurrencias.push({
        blockId: rule.id,
        title: rule.title,
        colorHex: rule.colorHex,
        date: fecha,
        dayOfWeek,
        startTime,
        endTime,
        moved,
      });
    }
  }

  // Por fecha, por hora de inicio y, si empatan, por bloque: así el orden no
  // depende de en qué orden llegaron las reglas.
  return ocurrencias.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.blockId - b.blockId,
  );
};

/**
 * RS-BE-34 — Horas por semana, sumadas sobre las ocurrencias ya expandidas: un
 * día cancelado no está en la lista y no suma, y uno movido suma su duración
 * nueva. Las semanas van de lunes a domingo.
 *
 * Sale UNA entrada por cada semana que toca la ventana [from, to] —del lunes
 * de `from` al lunes de `to`, en orden—, también las que no tienen ninguna
 * ocurrencia, con `hours: 0`: la spec pide "una entrada por cada semana entre
 * el lunes de `from` y el lunes de `to`", y 0 es un total conocido, no un dato
 * que falta.
 *
 * Suma TODO lo que recibe de cada una de esas semanas (lo de fuera se ignora).
 * El total de la semana entera, que es lo que pide la spec, sale si quien
 * llama le pasa las semanas completas: el service expande del lunes de `from`
 * al domingo de la semana de `to` y recién después recorta las ocurrencias.
 *
 * Se acumulan minutos enteros y se divide una sola vez: sumar minutos/60 de a
 * uno da 7.000000000000001 para seis bloques de 70 minutos, y la app muestra
 * el número tal cual.
 */
export const weeklyHours = (
  occurrences: readonly TimeBlockOccurrence[],
  from: string,
  to: string,
): TimeBlockWeekHours[] => {
  const minutosPorSemana = new Map<string, number>();
  const ultimoLunes = utcDe(mondayOf(to));
  // Sobre el instante UTC y no sobre la cadena, por la misma razón que en
  // `expandOccurrences`. El Map conserva el orden de inserción: sale por lunes.
  for (let lunes = utcDe(mondayOf(from)); lunes <= ultimoLunes; lunes += 7 * MS_POR_DIA) {
    minutosPorSemana.set(textoDe(lunes), 0);
  }
  for (const ocurrencia of occurrences) {
    const weekStart = mondayOf(ocurrencia.date);
    const acumulado = minutosPorSemana.get(weekStart);
    if (acumulado === undefined) continue;
    minutosPorSemana.set(
      weekStart,
      acumulado + minutesOf(ocurrencia.endTime) - minutesOf(ocurrencia.startTime),
    );
  }
  return [...minutosPorSemana].map(([weekStart, minutos]) => ({ weekStart, hours: minutos / 60 }));
};
```

Cinco cosas que parecen de estilo y no lo son:

1. **`utcDe` parte la cadena en vez de `new Date(date)`.** Con `Date.UTC(y, m - 1, d)` la medianoche es
   siempre UTC y `getUTCDay()` da el día correcto en cualquier huso. `new Date("2026-09-21").getDay()` en
   Lima devuelve 0 y en UTC devuelve 1: sin esto, toda la expansión se corre un día según dónde corra.
2. **`moved` se arma con tres `let` y un `if`, no con un booleano intermedio y dos ternarios.**
   TypeScript solo estrecha `excepcion.startTime` de `string | null` a `string` dentro del `if`. Con
   `const movido = excepcion !== undefined && … && excepcion.endTime !== null` y después
   `movido ? excepcion.startTime : rule.startTime`, el estrechamiento por alias no sobrevive y `tsc`
   falla dos veces con `error TS2322: Type 'string | null' is not assignable to type 'string'.`
3. **El orden lleva `a.blockId - b.blockId` de tercer criterio.** Sin él, dos bloques a la misma hora el
   mismo día salen en el orden en que vinieran las reglas del repository, y la prueba "dos reglas a la
   misma hora el mismo dia se ordenan por bloque" lo fija.
4. **Los dos bucles avanzan sobre el instante UTC (`instante += MS_POR_DIA`), no sobre la cadena.** Pasado
   el 9999-12-31, `addDays` devuelve `"+010000-01"`, que como texto es menor que `"9999-12-31"`, y
   `utcDe` lo lee como el año 10 (1910 para `Date.UTC`): un `for` sobre cadenas no termina nunca y
   acumula ocurrencias hasta quedarse sin memoria. El esquema de la Tarea 4 además acota las fechas a
   2000–2099, pero esta función es pura y no depende de quién la llame. La prueba "el recorrido termina
   aunque el rango llegue al 9999-12-31" lo fija: si alguien vuelve a la cadena, esa prueba se cuelga.
5. **`weeklyHours` suma minutos enteros y divide una sola vez.** Seis ocurrencias de 70 minutos sumadas
   como `70/60` de a una dan `7.000000000000001`; como minutos, `420 / 60 = 7`. Por eso ya no usa
   `hoursBetween`, que sigue exportada y probada para quien necesite la duración de un solo tramo.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/time-blocks-expansion.test.ts
```

Esperado: PASS, `24 pass`, `0 fail`, `60 expect() calls` (5 pruebas de helpers con 27 aserciones, 12 de
`expandOccurrences` con 22 y 7 de `weeklyHours` con 11; corrido en el arnés en memoria, ver "Cifras de las
pruebas").

- [ ] **Paso 5: Comprobar que el huso del sistema no mueve nada**

La razón de usar `Date.UTC` es que el servidor corre en UTC y la Mac en Lima. Correr la misma prueba con
los dos husos, y con uno al este del meridiano para cubrir el otro lado:

```bash
cd "${REPO:?}" && for z in America/Lima UTC Asia/Tokyo; do echo -n "$z: "; TZ=$z DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/time-blocks-expansion.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)" | tr '\n' ' '; echo; done
```

Esperado: las tres líneas con `24 pass  0 fail`. Si una sola falla, la implementación se coló a
`new Date(cadena)` local en algún punto: volver al Paso 3 antes de seguir.

- [ ] **Paso 6: Build**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" run build
```

Esperado: `$ tsc` sin ningún error y exit 0. La línea base está limpia hoy, así que cualquier error que
salga es de los dos archivos nuevos. `tsc` solo compila `src/` (`tsconfig.json`, `"include": ["src/**/*"]`),
así que acá se comprueban esos dos archivos bajo `strict`, `noUnusedLocals`, `noUnusedParameters` y
`noImplicitReturns`. La salida de `dist/` está en `.gitignore:5`.

- [ ] **Paso 7: Correr la carpeta HU35 completa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff
```

Esperado: `0 fail`, con esta prueba en verde y también `migration-0012.test.ts` si la Tarea 1 ya está. Esta
tarea no modifica ningún archivo existente y no la importa nadie todavía, así que no hay regresión posible
fuera de HU35: no hace falta correr la suite completa.

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}" && git add src/modules/time-blocks/time-blocks.types.ts src/modules/time-blocks/time-blocks.logic.ts test/HU35_jeff/time-blocks-expansion.test.ts && git commit -m "feat(time-blocks): expansión de ocurrencias y horas por semana (RS-BE-33, RS-BE-34)"
```

Sin trailer Co-Authored-By, sin push y sin PR.
### Tarea 3: Repository

**Archivos:**
- Crear: `src/modules/time-blocks/time-blocks.repository.ts` (la carpeta `src/modules/time-blocks/` ya existe desde la Tarea 2)
- Modificar: `specs/features/time-blocks/time-blocks.spec.md:104-108` (se agrega una línea con el `[@test]` de esta tarea bajo RS-BE-31, justo debajo de la que hoy está en la línea 106)
- Test: `test/HU35_jeff/time-blocks.repository.test.ts` (la carpeta `test/HU35_jeff/` ya existe desde la Tarea 1)

Todos los comandos se corren desde la raíz del worktree `$REPO`,
rama `feat/bloques-horario`. La spec ya cubre el archivo nuevo con el target
`../../../src/modules/time-blocks/**` (`specs/features/time-blocks/time-blocks.spec.md:5`), así que lo
único que se le agrega es el `[@test]` del Paso 6.

**Interfaces:**

- Consume:

  - De la Tarea 2, `src/modules/time-blocks/time-blocks.types.ts`. Son las mismas declaraciones que
    escribe esa tarea (allá van repartidas y con sus comentarios; acá compactadas):
    ```ts
    export interface TimeBlockRule {
      id: number; title: string; colorHex: string; daysOfWeek: number[];
      startTime: string; endTime: string; startDate: string; endDate: string;
    }
    export type TimeBlockInput = Omit<TimeBlockRule, "id">;
    export type TimeBlockExceptionStatus = "cancelled" | "moved";
    export interface TimeBlockException {
      blockId: number; date: string; status: TimeBlockExceptionStatus;
      startTime: string | null; endTime: string | null;
    }
    ```
  - De la Tarea 1: las tablas `student_time_block` y `student_time_block_exception`, el enum
    `time_block_exception_status` y el UNIQUE `uq_time_block_exception (block_id, occurrence_date)`,
    que es el conflict target del upsert. Nada de esto se importa en TypeScript: son nombres que
    aparecen en el SQL crudo.
  - Del repo, literal:
    - `import { sql } from "drizzle-orm";`
    - `import type { db } from "../../db/index.js";` — `src/db/index.ts:8` declara
      `export const db = drizzle(client, { schema: { ...schema, ...relations } });`
    - `type Fila = Record<string, unknown>` y `constructor(readonly database: typeof db) {}` —
      `src/modules/academic-record/academic-record.repository.ts:10` y `:24-25`. El cuerpo de allá
      castea el resultado de `this.database.execute(...)` con `as unknown as Fila[]` (`:28-34`); acá
      se usa la variante con paréntesis, `(await this.database.execute(...)) as unknown as Fila[]`,
      que es la de `src/modules/portal-sync/portal-sync.repository.ts:965-972`.
    - El helper de enteros de `src/modules/portal-sync/portal-sync.repository.ts:34-35`. Es
      **privado** de ese módulo (la línea 34 no lleva `export`), así que acá se copia, no se importa:
      ```ts
      const intArray = (values: number[]) =>
        sql`string_to_array(${values.map((v) => Number(v)).join(",")}, ',')::int[]`;
      ```
    - El patrón de lote JSON `… any(select json_array_elements_text(${JSON.stringify(codigos)}::json))` —
      `src/modules/portal-sync/portal-sync.repository.ts:970`.
    - Para la prueba: `fakeTx` + `new PgDialect().sqlToQuery(q)` de
      `test/HU31_jeff/repository.progress-batch.test.ts:17-24`, y el guardia
      `expect(params.some((p) => p instanceof Date)).toBe(false)` de
      `test/HU34_jeff/record-persistence.test.ts:249`.

- Produce: `src/modules/time-blocks/time-blocks.repository.ts`, que consume la Tarea 4 (el service) y
  que la Tarea 5 instancia en el composition root con `new TimeBlocksRepository(db)`:
  ```ts
  export class TimeBlocksRepository {
    constructor(readonly database: typeof db) {}
    findBlocks(studentId: number): Promise<TimeBlockRule[]>
    findBlockOwnedBy(studentId: number, blockId: number): Promise<TimeBlockRule | null>
    countBlocks(studentId: number): Promise<number>
    insertBlock(studentId: number, input: TimeBlockInput): Promise<TimeBlockRule>
    updateBlock(studentId: number, blockId: number, input: TimeBlockInput): Promise<TimeBlockRule | null>
    deleteBlock(studentId: number, blockId: number): Promise<boolean>
    findExceptions(studentId: number, blockIds: readonly number[]): Promise<TimeBlockException[]>
    upsertException(studentId: number, blockId: number, date: string, status: TimeBlockExceptionStatus,
                    startTime: string | null, endTime: string | null): Promise<TimeBlockException | null>
    deleteException(studentId: number, blockId: number, date: string): Promise<boolean>
  }
  ```
  Los dos métodos de excepciones reciben también el `studentId` y lo acotan en el SQL, como el resto:
  `upsertException` devuelve `null` si el bloque no es del alumno (no escribe nada) y `deleteException`
  devuelve `false`.

  No exporta nada más: `Fila`, `intArray`, `diasParaEscribir`, `hhmm`, `hhmmOpcional`, `diasLeidos`,
  `aRegla`, `aExcepcion`, `COLUMNAS_REGLA` y `COLUMNAS_EXCEPCION` son privados del archivo.

---

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU35_jeff/time-blocks.repository.test.ts` con este contenido completo.

```ts
import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { TimeBlocksRepository } from "../../src/modules/time-blocks/time-blocks.repository.js";
import type { TimeBlockInput } from "../../src/modules/time-blocks/time-blocks.types.js";

/**
 * RS-BE-31, RS-BE-32 y RS-BE-33 vistos desde el repositorio.
 *
 * Estas pruebas miran el SQL RENDERIZADO ademas del resultado, como
 * `test/HU31_jeff/repository.progress-batch.test.ts` y
 * `test/HU34_jeff/record-persistence.test.ts`: la clase de defecto que importa
 * aca la produce Postgres al ejecutar (un arreglo de JS que se vuelve
 * constructor de fila con 42809, un `Date` que postgres.js rechaza al preparar
 * la sentencia, un `where student_id` que se cae y deja tocar el bloque de otro
 * alumno) y no el codigo al armar. No abren ninguna conexion: la base es de
 * mentira.
 *
 * Datos 100% inventados, alumno sintetico 20230001 (studentId interno 77).
 */
const baseFalsa = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  const database = { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never;
  return {
    repo: new TimeBlocksRepository(database),
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

const ALUMNO = 77;

/** Regla inventada: practicas los lunes y miercoles de 14:00 a 18:00. */
const ENTRADA: TimeBlockInput = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-01",
  endDate: "2026-12-15",
};

/** Lo que devuelve la base: horas con segundos y fechas ya casteadas a texto. */
const FILA_BLOQUE = {
  id: 12,
  title: "Practicas preprofesionales",
  color_hex: "#F94B3F",
  days_of_week: [1, 3],
  start_time: "14:00:00",
  end_time: "18:00:00",
  start_date: "2026-09-01",
  end_date: "2026-12-15",
};

describe("findBlocks", () => {
  test("acota por el alumno y lo manda como parametro, no concatenado", async () => {
    const { repo, consultas, llamadas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlocks(ALUMNO);
    expect(llamadas()).toBe(1);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("from student_time_block where student_id = $1");
    expect(texto).not.toContain("77");
    expect(params).toEqual([ALUMNO]);
  });

  test("recorta las horas a HH:MM y deja las fechas como YYYY-MM-DD", async () => {
    // El resto del sistema habla "HH:MM"; si el repositorio dejara pasar
    // "14:00:00", la expansion de ocurrencias compararia cadenas de distinto
    // largo y la app pintaria la hora con segundos.
    const { repo } = baseFalsa([FILA_BLOQUE]);
    expect(await repo.findBlocks(ALUMNO)).toEqual([{
      id: 12,
      title: "Practicas preprofesionales",
      colorHex: "#F94B3F",
      daysOfWeek: [1, 3],
      startTime: "14:00",
      endTime: "18:00",
      startDate: "2026-09-01",
      endDate: "2026-12-15",
    }]);
  });

  test("las fechas se leen como texto: ningun ::text de menos", async () => {
    const { repo, consultas } = baseFalsa([]);
    await repo.findBlocks(ALUMNO);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("start_date::text as start_date");
    expect(q).toContain("end_date::text as end_date");
    expect(q).toContain("start_time::text as start_time");
    expect(q).toContain("end_time::text as end_time");
  });

  test("days_of_week llega como number[] venga como arreglo o como literal {1,3}", async () => {
    // `smallint[]` es el primer arreglo del esquema y no esta comprobado como
    // lo entrega el driver: las dos formas tienen que dar lo mismo.
    const comoArreglo = baseFalsa([{ ...FILA_BLOQUE, days_of_week: [1, 3] }]);
    const comoLiteral = baseFalsa([{ ...FILA_BLOQUE, days_of_week: "{1,3}" }]);
    expect((await comoArreglo.repo.findBlocks(ALUMNO))[0]!.daysOfWeek).toEqual([1, 3]);
    expect((await comoLiteral.repo.findBlocks(ALUMNO))[0]!.daysOfWeek).toEqual([1, 3]);
  });
});

describe("findBlockOwnedBy", () => {
  test("filtra por alumno Y por id, los dos como parametro", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlockOwnedBy(ALUMNO, 12);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("where student_id = $1 and id = $2");
    expect(params).toEqual([ALUMNO, 12]);
  });

  test("sin fila devuelve null, no undefined ni una fila vacia", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.findBlockOwnedBy(ALUMNO, 999)).toBeNull();
  });
});

describe("countBlocks", () => {
  test("cuenta solo los del alumno y devuelve number", async () => {
    const { repo, consultas } = baseFalsa([{ total: 20 }]);
    expect(await repo.countBlocks(ALUMNO)).toBe(20);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("select count(*)::int as total from student_time_block where student_id = $1");
    expect(params).toEqual([ALUMNO]);
  });

  test("sin filas cuenta 0", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.countBlocks(ALUMNO)).toBe(0);
  });
});

describe("insertBlock", () => {
  test("los dias viajan en UN parametro JSON y no como arreglo de JS", async () => {
    // Interpolar el arreglo lo vuelve `($4, $5)` (constructor de fila) y
    // Postgres responde 42809. Es la regresion de `upsertProgressBatch`.
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.insertBlock(ALUMNO, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("json_array_elements_text($4::json)");
    expect(params).toHaveLength(8);
    expect(params.some((p) => Array.isArray(p))).toBe(false);
    expect(JSON.parse(String(params[3]))).toEqual([1, 3]);
  });

  test("escribe en student_time_block con el alumno y las ocho columnas", async () => {
    const { repo, consultas, llamadas } = baseFalsa([FILA_BLOQUE]);
    await repo.insertBlock(ALUMNO, ENTRADA);
    expect(llamadas()).toBe(1);
    const { sql: texto, params } = consultas()[0]!;
    const q = norm(texto);
    expect(q).toContain("insert into student_time_block (student_id, title, color_hex, days_of_week, start_time, end_time, start_date, end_date)");
    expect(q).toContain("returning");
    expect(params[0]).toBe(ALUMNO);
  });

  test("ningun parametro es un Date: fechas y horas viajan como texto con cast", async () => {
    // Regresion real del 2026-09-20: postgres.js rechaza un `Date` al preparar
    // la sentencia y la peticion entera responde 500.
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.insertBlock(ALUMNO, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toContain("2026-09-01");
    expect(norm(texto)).toContain("::date");
    expect(norm(texto)).toContain("::time");
  });

  test("devuelve la regla que escribio la base, ya en HH:MM", async () => {
    const { repo } = baseFalsa([FILA_BLOQUE]);
    const bloque = await repo.insertBlock(ALUMNO, ENTRADA);
    expect(bloque.id).toBe(12);
    expect(bloque.startTime).toBe("14:00");
    expect(bloque.daysOfWeek).toEqual([1, 3]);
  });
});

describe("updateBlock", () => {
  test("el where acota por id Y por alumno: un id ajeno no actualiza nada", async () => {
    // La pertenencia la comprueba el service, pero el SQL tambien: si el
    // service se equivoca, el update tiene que afectar 0 filas.
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("where id = $8 and student_id = $9");
    expect(params[7]).toBe(12);
    expect(params[8]).toBe(ALUMNO);
  });

  test("no toca las excepciones: una sola sentencia y sin nombrar la tabla", async () => {
    // RS-BE-31: editar la regla conserva lo que el alumno ya corrigio dia por
    // dia. Un `delete` de cortesia aca le borraria esas correcciones.
    const { repo, consultas, llamadas } = baseFalsa([FILA_BLOQUE]);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).not.toContain("student_time_block_exception");
    expect(q).not.toContain("delete");
  });

  test("mueve updated_at y manda los dias como JSON", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("updated_at = now()");
    expect(norm(texto)).toContain("json_array_elements_text($3::json)");
    expect(JSON.parse(String(params[2]))).toEqual([1, 3]);
    expect(params.some((p) => Array.isArray(p) || p instanceof Date)).toBe(false);
  });

  test("si no actualizo ninguna fila devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.updateBlock(ALUMNO, 999, ENTRADA)).toBeNull();
  });
});

describe("deleteBlock", () => {
  test("borra solo si el bloque es del alumno y responde si borro", async () => {
    const { repo, consultas } = baseFalsa([{ id: 12 }]);
    expect(await repo.deleteBlock(ALUMNO, 12)).toBe(true);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("delete from student_time_block where id = $1 and student_id = $2");
    expect(params).toEqual([12, ALUMNO]);
  });

  test("un id de otro alumno no borra nada y devuelve false", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.deleteBlock(ALUMNO, 999)).toBe(false);
  });
});

describe("findExceptions", () => {
  test("sin ids no toca la base", async () => {
    const { repo, llamadas } = baseFalsa([]);
    expect(await repo.findExceptions(ALUMNO, [])).toEqual([]);
    expect(llamadas()).toBe(0);
  });

  test("los ids viajan en UN parametro, no como constructor de fila", async () => {
    // `any(${ids})` rinde `any(($2, $3))` y Postgres responde 42809.
    const { repo, consultas } = baseFalsa([]);
    await repo.findExceptions(ALUMNO, [12, 13]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("any(string_to_array($2, ',')::int[])");
    expect(norm(texto)).not.toContain("any(($");
    expect(params).toEqual([ALUMNO, "12,13"]);
  });

  test("solo devuelve excepciones de bloques del alumno: une contra student_time_block", async () => {
    const { repo, consultas } = baseFalsa([]);
    await repo.findExceptions(ALUMNO, [12]);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("join student_time_block b on b.id = e.block_id");
    expect(q).toContain("where b.student_id = $1");
  });

  test("lee la fecha como texto y las horas en HH:MM, con null cuando no hay", async () => {
    const { repo, consultas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-08", status: "cancelled", start_time: null, end_time: null },
      { block_id: 12, occurrence_date: "2026-10-15", status: "moved", start_time: "15:00:00", end_time: "19:00:00" },
    ]);
    expect(await repo.findExceptions(ALUMNO, [12])).toEqual([
      { blockId: 12, date: "2026-10-08", status: "cancelled", startTime: null, endTime: null },
      { blockId: 12, date: "2026-10-15", status: "moved", startTime: "15:00", endTime: "19:00" },
    ]);
    // Sin el `::text`, el driver devuelve un `Date` y la fecha saldria como
    // "Thu Oct 08 2026 ..." en el JSON del contrato.
    expect(norm(consultas()[0]!.sql)).toContain("e.occurrence_date::text as occurrence_date");
  });
});

describe("upsertException", () => {
  test("es idempotente: on conflict sobre (block_id, occurrence_date) do update", async () => {
    // RS-BE-32: repetir el mismo PUT deja el mismo estado.
    const { repo, consultas, llamadas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-15", status: "moved", start_time: "15:00:00", end_time: "19:00:00" },
    ]);
    const excepcion = await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("insert into student_time_block_exception");
    // La fila sale del bloque del alumno: con un bloque ajeno no hay nada que insertar.
    expect(q).toContain("from student_time_block b where b.id = $5 and b.student_id = $6");
    expect(q).toContain("on conflict (block_id, occurrence_date) do update set status = excluded.status, start_time = excluded.start_time, end_time = excluded.end_time");
    expect(q).toContain("returning block_id, occurrence_date::text as occurrence_date");
    expect(excepcion).toEqual({
      blockId: 12, date: "2026-10-15", status: "moved", startTime: "15:00", endTime: "19:00",
    });
  });

  test("la fecha viaja como texto con ::date y ningun parametro es un Date", async () => {
    const { repo, consultas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-15", status: "moved", start_time: "15:00:00", end_time: "19:00:00" },
    ]);
    await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    const { sql: texto, params } = consultas()[0]!;
    expect(params.some((p) => p instanceof Date)).toBe(false);
    expect(params).toEqual(["2026-10-15", "moved", "15:00", "19:00", 12, ALUMNO]);
    expect(norm(texto)).toContain("$1::date");
    expect(norm(texto)).toContain("$2::time_block_exception_status");
  });

  test("cancelled manda las dos horas en null", async () => {
    // `chk_time_block_exc_movido` rechaza un cancelled con horas: si el
    // repositorio mandara "" en vez de null, la base abortaria con 23514.
    const { repo, consultas } = baseFalsa([
      { block_id: 12, occurrence_date: "2026-10-08", status: "cancelled", start_time: null, end_time: null },
    ]);
    const excepcion = await repo.upsertException(ALUMNO, 12, "2026-10-08", "cancelled", null, null);
    expect(consultas()[0]!.params).toEqual(["2026-10-08", "cancelled", null, null, 12, ALUMNO]);
    expect(excepcion).toEqual({
      blockId: 12, date: "2026-10-08", status: "cancelled", startTime: null, endTime: null,
    });
  });

  test("si el bloque no es del alumno no escribe nada y devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.upsertException(ALUMNO, 999, "2026-10-08", "cancelled", null, null)).toBeNull();
  });
});

describe("deleteException", () => {
  test("borra la fecha del bloque, acotado por el alumno, y dice si borro", async () => {
    const { repo, consultas } = baseFalsa([{ block_id: 12 }]);
    expect(await repo.deleteException(ALUMNO, 12, "2026-10-08")).toBe(true);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("delete from student_time_block_exception e using student_time_block b where b.id = e.block_id and b.student_id = $1 and e.block_id = $2 and e.occurrence_date = $3::date");
    expect(params).toEqual([ALUMNO, 12, "2026-10-08"]);
  });

  test("una fecha sin excepcion devuelve false", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.deleteException(ALUMNO, 12, "2026-10-08")).toBe(false);
  });
});

describe("guardias transversales del repositorio", () => {
  test("ninguna operacion manda un Date ni un arreglo de JS como parametro", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlocks(ALUMNO);
    await repo.findBlockOwnedBy(ALUMNO, 12);
    await repo.countBlocks(ALUMNO);
    await repo.insertBlock(ALUMNO, ENTRADA);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    await repo.deleteBlock(ALUMNO, 12);
    await repo.findExceptions(ALUMNO, [12, 13]);
    await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    await repo.deleteException(ALUMNO, 12, "2026-10-08");
    const todos = consultas().flatMap((q) => q.params);
    expect(todos.some((p) => p instanceof Date)).toBe(false);
    expect(todos.some((p) => Array.isArray(p))).toBe(false);
    // Un arreglo de JS interpolado NO llega como parametro: Drizzle lo expande
    // a un constructor de fila `($4, $5)` y lo que aparece son parametros de
    // mas. Por eso, ademas de mirar los tipos, se cuenta cuantos manda cada
    // sentencia; cualquier `${dias}` suelto rompe esta linea.
    expect(consultas().map((q) => q.params.length)).toEqual([1, 2, 1, 8, 9, 2, 2, 6, 3]);
  });

  test("toda consulta lleva student_id; ninguna concatena el id en el texto", async () => {
    const { repo, consultas } = baseFalsa([FILA_BLOQUE]);
    await repo.findBlocks(ALUMNO);
    await repo.findBlockOwnedBy(ALUMNO, 12);
    await repo.countBlocks(ALUMNO);
    await repo.insertBlock(ALUMNO, ENTRADA);
    await repo.updateBlock(ALUMNO, 12, ENTRADA);
    await repo.deleteBlock(ALUMNO, 12);
    await repo.findExceptions(ALUMNO, [12, 13]);
    await repo.upsertException(ALUMNO, 12, "2026-10-15", "moved", "15:00", "19:00");
    await repo.deleteException(ALUMNO, 12, "2026-10-08");
    expect(consultas()).toHaveLength(9);
    for (const { sql: texto, params } of consultas()) {
      expect(norm(texto)).toContain("student_id");
      expect(params).toContain(ALUMNO);
      expect(texto).not.toContain(String(ALUMNO));
    }
  });
});
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/time-blocks.repository.test.ts
```

Esperado: FALLA al **cargar** el archivo, antes de correr ninguna prueba, porque
`src/modules/time-blocks/time-blocks.repository.ts` todavía no existe:

```
test/HU35_jeff/time-blocks.repository.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/modules/time-blocks/time-blocks.repository.js' from '$REPO/test/HU35_jeff/time-blocks.repository.test.ts'
-------------------------------


 0 pass
 1 fail
 1 error
Ran 1 test across 1 file.
```

Lo que este paso **no** comprueba: bun borra los `import type` al transpilar, así que el import de
`time-blocks.types.js` no se resuelve en ejecución **nunca**, ni acá ni en el Paso 4. Si la Tarea 2 no
estuviera aplicada, esta prueba pasaría igual y el que lo cantaría es el `tsc` del Paso 5, con
`error TS2307: Cannot find module './time-blocks.types.js' or its corresponding type declarations.`
sobre el repositorio. O sea: el único import que puede fallar acá es el de valores, el de la clase.

El prefijo `DATABASE_URL=…` va en **todas** las corridas: el `.env` del worktree apunta a la base de
PRODUCCIÓN y bun lo carga solo. Esta prueba no abre ninguna conexión —la base es un objeto con un
`execute` que guarda la consulta—, pero el prefijo va igual. El `preload` de `bunfig.toml`
(`test/env.setup.ts`) solo rellena lo ausente con `||=`, así que **no** protege: la variable del
prefijo es la que gana.

- [ ] **Paso 3: Implementación mínima**

Crear `src/modules/time-blocks/time-blocks.repository.ts` con este contenido completo:

```ts
import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import type {
  TimeBlockException,
  TimeBlockExceptionStatus,
  TimeBlockInput,
  TimeBlockRule,
} from "./time-blocks.types.js";

/** Fila cruda de `database.execute`: claves snake_case y valores sin convertir. */
type Fila = Record<string, unknown>;

/**
 * Enteros como arreglo de Postgres en UN solo parámetro. Interpolar el arreglo
 * de JS en la plantilla `sql` de Drizzle lo vuelve un constructor de fila
 * (`any(($1, $2))`) y Postgres responde 42809. Es el mismo helper de
 * `portal-sync.repository.ts:34-35`, copiado porque allá es privado del módulo.
 */
const intArray = (values: readonly number[]) =>
  sql`string_to_array(${values.map((v) => Number(v)).join(",")}, ',')::int[]`;

/**
 * Los días viajan como UN parámetro JSON y Postgres los convierte a
 * `smallint[]`. `with ordinality` conserva el orden en que los mandó el alumno:
 * `array_agg` sobre una función que devuelve conjunto no lo garantiza sola.
 * Con la lista vacía `array_agg` devolvería NULL y la columna es NOT NULL; el
 * service nunca llega acá con cero días (Zod `.min(1)` y `chk_time_block_dias`).
 */
const diasParaEscribir = (dias: readonly number[]) => sql`(
        select array_agg(e.value::smallint order by e.ord)
          from json_array_elements_text(${JSON.stringify(dias.map((d) => Number(d)))}::json)
               with ordinality as e(value, ord)
      )`;

/** `time` vuelve como "14:00:00"; el resto del sistema habla "HH:MM". */
const hhmm = (valor: unknown): string => String(valor).slice(0, 5);
const hhmmOpcional = (valor: unknown): string | null => (valor == null ? null : hhmm(valor));

/**
 * `smallint[]` es el primer arreglo del esquema y el driver puede devolverlo ya
 * como arreglo de JS o como el literal `{1,3}`: se aceptan los dos y se
 * normaliza a `number[]`.
 */
const diasLeidos = (valor: unknown): number[] => {
  if (Array.isArray(valor)) return valor.map((d) => Number(d));
  const texto = String(valor ?? "").replace(/[{}]/g, "").trim();
  return texto === "" ? [] : texto.split(",").map((d) => Number(d));
};

const aRegla = (fila: Fila): TimeBlockRule => ({
  id: Number(fila.id),
  title: String(fila.title),
  colorHex: String(fila.color_hex),
  daysOfWeek: diasLeidos(fila.days_of_week),
  startTime: hhmm(fila.start_time),
  endTime: hhmm(fila.end_time),
  startDate: String(fila.start_date),
  endDate: String(fila.end_date),
});

const aExcepcion = (fila: Fila): TimeBlockException => ({
  blockId: Number(fila.block_id),
  date: String(fila.occurrence_date),
  status: String(fila.status) as TimeBlockExceptionStatus,
  startTime: hhmmOpcional(fila.start_time),
  endTime: hhmmOpcional(fila.end_time),
});

/** Las ocho columnas de la regla, con horas y fechas ya convertidas a texto. */
const COLUMNAS_REGLA = sql`id, title, color_hex, days_of_week,
             start_time::text as start_time, end_time::text as end_time,
             start_date::text as start_date, end_date::text as end_date`;

/** Las cinco columnas de la excepción, con la fecha y las horas como texto. */
const COLUMNAS_EXCEPCION = sql`block_id, occurrence_date::text as occurrence_date, status,
             start_time::text as start_time, end_time::text as end_time`;

/**
 * SQL de `student_time_block` y `student_time_block_exception` (RS-BE-31,
 * RS-BE-32 y el soporte de datos de RS-BE-33). SQL crudo parametrizado, como
 * el resto de los repositories del repo.
 *
 * TODA consulta lleva `student_id` en el `where`, incluidas las escrituras y
 * las dos de excepciones. La pertenencia la comprueba el service —como
 * `findSectionOwnedByTeacher` en `advising/teacher`—, pero el SQL también la
 * acota: si el service se equivoca, un id ajeno afecta 0 filas en vez de
 * tocar el bloque de otro alumno. Las excepciones no tienen `student_id`
 * propio, así que se acotan contra su bloque: el upsert inserta desde la fila
 * del bloque del alumno y el delete cruza con ella.
 */
export class TimeBlocksRepository {
  constructor(readonly database: typeof db) {}

  async findBlocks(studentId: number): Promise<TimeBlockRule[]> {
    const filas = (await this.database.execute(sql`
      select ${COLUMNAS_REGLA}
        from student_time_block
       where student_id = ${studentId}
       order by start_date asc, start_time asc, id asc
    `)) as unknown as Fila[];
    return filas.map(aRegla);
  }

  async findBlockOwnedBy(studentId: number, blockId: number): Promise<TimeBlockRule | null> {
    const filas = (await this.database.execute(sql`
      select ${COLUMNAS_REGLA}
        from student_time_block
       where student_id = ${studentId} and id = ${blockId}
       limit 1
    `)) as unknown as Fila[];
    const fila = filas[0];
    return fila ? aRegla(fila) : null;
  }

  /**
   * Cuenta TODOS los bloques guardados del alumno, también los ya vencidos:
   * es lo que fija RS-BE-31 ("20 bloques guardados, vencidos incluidos"). El
   * borrado es físico, y un bloque vencido sigue expandiéndose en una ventana
   * pasada, así que contarlo es lo que acota la expansión, que es la razón que
   * da la spec para el tope.
   */
  async countBlocks(studentId: number): Promise<number> {
    const filas = (await this.database.execute(sql`
      select count(*)::int as total
        from student_time_block
       where student_id = ${studentId}
    `)) as unknown as Array<{ total: number }>;
    return Number(filas[0]?.total ?? 0);
  }

  async insertBlock(studentId: number, input: TimeBlockInput): Promise<TimeBlockRule> {
    const filas = (await this.database.execute(sql`
      insert into student_time_block
        (student_id, title, color_hex, days_of_week, start_time, end_time, start_date, end_date)
      values (${studentId}, ${input.title}, ${input.colorHex}, ${diasParaEscribir(input.daysOfWeek)},
              ${input.startTime}::time, ${input.endTime}::time,
              ${input.startDate}::date, ${input.endDate}::date)
      returning ${COLUMNAS_REGLA}
    `)) as unknown as Fila[];
    const fila = filas[0];
    if (!fila) throw new Error("La base no devolvió el bloque recién creado.");
    return aRegla(fila);
  }

  /**
   * RS-BE-31: reemplaza la regla entera y **no** toca las excepciones. Es una
   * sola sentencia a propósito: cualquier `delete` de cortesía acá le borraría
   * al alumno las correcciones que ya hizo día por día.
   */
  async updateBlock(
    studentId: number, blockId: number, input: TimeBlockInput,
  ): Promise<TimeBlockRule | null> {
    const filas = (await this.database.execute(sql`
      update student_time_block
         set title = ${input.title},
             color_hex = ${input.colorHex},
             days_of_week = ${diasParaEscribir(input.daysOfWeek)},
             start_time = ${input.startTime}::time,
             end_time = ${input.endTime}::time,
             start_date = ${input.startDate}::date,
             end_date = ${input.endDate}::date,
             updated_at = now()
       where id = ${blockId} and student_id = ${studentId}
      returning ${COLUMNAS_REGLA}
    `)) as unknown as Fila[];
    const fila = filas[0];
    return fila ? aRegla(fila) : null;
  }

  /** Las excepciones se van solas por el `on delete cascade` de la FK. */
  async deleteBlock(studentId: number, blockId: number): Promise<boolean> {
    const filas = (await this.database.execute(sql`
      delete from student_time_block
       where id = ${blockId} and student_id = ${studentId}
      returning id
    `)) as unknown as Fila[];
    return filas.length > 0;
  }

  async findExceptions(
    studentId: number, blockIds: readonly number[],
  ): Promise<TimeBlockException[]> {
    if (blockIds.length === 0) return [];
    const filas = (await this.database.execute(sql`
      select e.block_id, e.occurrence_date::text as occurrence_date, e.status,
             e.start_time::text as start_time, e.end_time::text as end_time
        from student_time_block_exception e
        join student_time_block b on b.id = e.block_id
       where b.student_id = ${studentId}
         and e.block_id = any(${intArray(blockIds)})
       order by e.occurrence_date asc, e.block_id asc
    `)) as unknown as Fila[];
    return filas.map(aExcepcion);
  }

  /**
   * RS-BE-32: idempotente por `uq_time_block_exception`. Repetir el mismo PUT
   * deja el mismo estado. `cancelled` escribe las dos horas en null, que es lo
   * que exige `chk_time_block_exc_movido`.
   *
   * La fila se inserta DESDE el bloque del alumno (`select b.id … from
   * student_time_block b where … b.student_id = …`): con un bloque ajeno o
   * inexistente no hay fila que insertar, no se escribe nada y devuelve null.
   */
  async upsertException(
    studentId: number, blockId: number, date: string, status: TimeBlockExceptionStatus,
    startTime: string | null, endTime: string | null,
  ): Promise<TimeBlockException | null> {
    const filas = (await this.database.execute(sql`
      insert into student_time_block_exception
        (block_id, occurrence_date, status, start_time, end_time)
      select b.id, ${date}::date, ${status}::time_block_exception_status,
             ${startTime}::time, ${endTime}::time
        from student_time_block b
       where b.id = ${blockId} and b.student_id = ${studentId}
      on conflict (block_id, occurrence_date) do update
        set status = excluded.status,
            start_time = excluded.start_time,
            end_time = excluded.end_time
      returning ${COLUMNAS_EXCEPCION}
    `)) as unknown as Fila[];
    const fila = filas[0];
    return fila ? aExcepcion(fila) : null;
  }

  /** Borra la excepción solo si su bloque es del alumno: cruza con el bloque. */
  async deleteException(studentId: number, blockId: number, date: string): Promise<boolean> {
    const filas = (await this.database.execute(sql`
      delete from student_time_block_exception e
       using student_time_block b
       where b.id = e.block_id
         and b.student_id = ${studentId}
         and e.block_id = ${blockId}
         and e.occurrence_date = ${date}::date
      returning e.block_id
    `)) as unknown as Fila[];
    return filas.length > 0;
  }
}
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/time-blocks.repository.test.ts
```

Esperado: PASS — `30 pass`, `0 fail`, `105 expect() calls`. La versión anterior de esta prueba se midió
con bun en una copia aislada (29 y 93); después de la revisión, la de ahora se corrió con el SQL real de
Drizzle (`PgDialect`) sobre este mismo texto en un arnés en memoria que cuenta pruebas y `expect()` igual
que bun, calibrado contra aquella medición (ver "Cifras de las pruebas").

Si en vez de eso falla, qué significa cada aserción:

- Falla un `toContain` de los que llevan `student_id` → se movió o se perdió el `where` del alumno. No
  se arregla relajando la prueba: es la línea que impide tocar el bloque de otro alumno.
- Falla `toHaveLength(8)` o la lista de conteos `[1, 2, 1, 8, 9, 2, 2, 6, 3]` → se coló un `${dias}`
  suelto en la plantilla `sql` y Drizzle lo expandió como constructor de fila. Es el 42809.
- Falla el `toContain("from student_time_block b where b.id = $5 and b.student_id = $6")` o el `delete …
  using student_time_block b …` → las excepciones perdieron el acotado por alumno.
- Falla un `startTime` que esperaba `"14:00"` → falta el `.slice(0, 5)` de `hhmm`.
- Falla `params.some((p) => p instanceof Date)` → alguna fecha se está construyendo con `new Date`
  en vez de viajar como cadena con `::date`.

- [ ] **Paso 5: Correr la carpeta de la funcionalidad y el build**

Las pruebas de las Tareas 1 y 2 tienen que seguir verdes, y el repositorio tiene que compilar
(`build` es `tsc` sobre `src/`; los tests no entran, `tsconfig.json` incluye solo `src/**/*`).

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/
cd "${REPO:?}" && $BUN run build
```

Esperado: `0 fail` en los tres archivos de `test/HU35_jeff/` (`migration-0012.test.ts` de la Tarea 1,
`time-blocks-expansion.test.ts` de la Tarea 2 y `time-blocks.repository.test.ts` de esta), y `build`
sin ninguna línea de error y con código de salida 0. Ojo con `noUnusedLocals`: si sobra un import o un
helper en el repositorio, `tsc` lo marca como `TS6133` aunque las pruebas pasen.

- [ ] **Paso 6: Enlazar la prueba en la spec**

En `specs/features/time-blocks/time-blocks.spec.md`, al final de RS-BE-31 (líneas 104-108), reemplazar esto:

```
`DELETE` borra el bloque y sus excepciones en cascada.

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`

### RS-BE-32 — Excepciones: un día suelto
```

por esto:

```
`DELETE` borra el bloque y sus excepciones en cascada.

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.repository.test.ts`

### RS-BE-32 — Excepciones: un día suelto
```

El ancla es única aunque la línea del `[@test]` de las rutas aparezca dos veces en el archivo (líneas
106 y 131): la de arriba va pegada a `DELETE borra el bloque…` y al encabezado de RS-BE-32.

Comprobarlo:

```bash
cd "${REPO:?}" && grep -n "@test" specs/features/time-blocks/time-blocks.spec.md
```

Esperado: entre las líneas que salen aparece
`../../../test/HU35_jeff/time-blocks.repository.test.ts`, y el archivo existe.

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}" && git add src/modules/time-blocks/time-blocks.repository.ts test/HU35_jeff/time-blocks.repository.test.ts specs/features/time-blocks/time-blocks.spec.md && git commit -m "feat(time-blocks): repositorio de bloques y excepciones acotado por alumno (RS-BE-31, RS-BE-32, RS-BE-33)"
```

Sin `Co-Authored-By`. El autor ya está configurado en git.
### Tarea 4: Schemas y service: las reglas

**Archivos:**
- Crear: `src/modules/time-blocks/time-blocks.schemas.ts`
- Crear: `src/modules/time-blocks/time-blocks.service.ts`
- Modificar: `specs/features/time-blocks/time-blocks.spec.md:130-132` (el final de RS-BE-32: el párrafo de la idempotencia, la línea en blanco y su `[@test]`. En la spec que deja la Tarea 1 son las **129-131**; la Tarea 3 agrega una línea bajo RS-BE-31 y las corre una. El Paso 7 va con ancla de texto, así que el número no cambia nada.)
- Test: `test/HU35_jeff/time-blocks.service.test.ts` (crear)

Los dos archivos nuevos de `src/` ya están cubiertos por el target `../../../src/modules/time-blocks/**`
de la spec (`specs/features/time-blocks/time-blocks.spec.md:5`): no hay que tocar el encabezado.

Todos los comandos se corren desde la raíz del worktree `$REPO`,
rama `feat/bloques-horario`.

**Interfaces:**

- Consume — de la **Tarea 2**, dos archivos.

  `src/modules/time-blocks/time-blocks.types.ts` (acá compactado; allá va con sus comentarios):
  ```ts
  export interface TimeBlockRule {
    id: number; title: string; colorHex: string; daysOfWeek: number[];   // 1 = lunes … 7 = domingo
    startTime: string; endTime: string;                                   // "HH:MM"
    startDate: string; endDate: string;                                   // "YYYY-MM-DD"
  }
  export type TimeBlockInput = Omit<TimeBlockRule, "id">;
  export type TimeBlockExceptionStatus = "cancelled" | "moved";
  export interface TimeBlockException {
    blockId: number; date: string; status: TimeBlockExceptionStatus;
    startTime: string | null; endTime: string | null;
  }
  export interface TimeBlockOccurrence {
    blockId: number; title: string; colorHex: string;
    date: string; dayOfWeek: number; startTime: string; endTime: string; moved: boolean;
  }
  export interface TimeBlockWeekHours { weekStart: string; hours: number }
  ```

  `src/modules/time-blocks/time-blocks.logic.ts`, solo lo que esta tarea importa:
  ```ts
  export const WINDOW_MAX_DAYS = 120;
  export const dayOfWeekOf = (date: string): number                 // 1 = lunes … 7 = domingo
  export const addDays = (date: string, n: number): string =>
    textoDe(utcDe(date) + n * MS_POR_DIA);
  //   utcDe(date) = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))
  //   textoDe(utc) = new Date(utc).toISOString().slice(0, 10)
  export const withinGrid = (start: string, end: string): boolean =>
    minutesOf(start) >= minutesOf(GRID_START) && minutesOf(end) <= minutesOf(GRID_END);
  export const mondayOf = (date: string): string                   // lunes de la semana de `date`
  export const expandOccurrences = (
    rules: readonly TimeBlockRule[], exceptions: readonly TimeBlockException[],
    from: string, to: string,
  ): TimeBlockOccurrence[]
  export const weeklyHours = (
    occurrences: readonly TimeBlockOccurrence[], from: string, to: string,
  ): TimeBlockWeekHours[]
  ```
  Esta tarea depende de tres comportamientos de esos cuerpos, no solo de sus firmas:
  - `addDays` arma la fecha con `Date.UTC`, que **normaliza** el desborde: `addDays("2026-02-30", 0)`
    devuelve `"2026-03-02"`. Con eso se reconoce una fecha que no existe (`addDays(f, 0) !== f`).
  - `withinGrid` mira **solo los bordes** 07:00–22:00 y no el orden de las dos horas.
  - `weeklyHours` emite una entrada por cada lunes entre `mondayOf(from)` y `mondayOf(to)` (en 0 si no
    hay nada) y suma **todo** lo que recibe de cada una de esas semanas. Para que el total sea el de la
    semana entera, el service le pasa las ocurrencias de las semanas completas.

  `GRID_START`, `GRID_END`, `minutesOf` y `hoursBetween` también existen, pero esta tarea **no** los
  importa: la grilla se comprueba con `withinGrid`, y el orden de dos `"HH:MM"` se compara como texto en
  los esquemas, porque el regex las deja siempre en dos dígitos. `time-blocks.schemas.ts` importa
  `addDays`; `time-blocks.service.ts` importa `WINDOW_MAX_DAYS`, `addDays`, `dayOfWeekOf`,
  `expandOccurrences`, `mondayOf`, `weeklyHours` y `withinGrid`.

- Consume — de la **Tarea 3** (`src/modules/time-blocks/time-blocks.repository.ts`), solo el tipo:
  ```ts
  export class TimeBlocksRepository {
    constructor(readonly database: typeof db) {}
    findBlocks(studentId: number): Promise<TimeBlockRule[]>
    findBlockOwnedBy(studentId: number, blockId: number): Promise<TimeBlockRule | null>
    countBlocks(studentId: number): Promise<number>
    insertBlock(studentId: number, input: TimeBlockInput): Promise<TimeBlockRule>
    updateBlock(studentId: number, blockId: number, input: TimeBlockInput): Promise<TimeBlockRule | null>
    deleteBlock(studentId: number, blockId: number): Promise<boolean>
    findExceptions(studentId: number, blockIds: readonly number[]): Promise<TimeBlockException[]>
    upsertException(studentId: number, blockId: number, date: string, status: TimeBlockExceptionStatus,
                    startTime: string | null, endTime: string | null): Promise<TimeBlockException | null>
    deleteException(studentId: number, blockId: number, date: string): Promise<boolean>
  }
  ```
  Cuatro detalles de sus cuerpos que esta tarea usa: `updateBlock` y `deleteBlock` llevan
  `where id = … and student_id = …` y devuelven `null` / `false` si no tocaron nada; `upsertException`
  inserta desde el bloque del alumno y devuelve `null` si el bloque no es suyo; `deleteException` cruza
  con el bloque del alumno; y `insertBlock`, `updateBlock`, `upsertException` y `deleteException` mandan
  las fechas como `${…}::date`, así que una fecha que no existe que llegue hasta ahí es un error 22008 de
  Postgres.

- Consume — del repo, tal como están hoy:
  - `export class HttpError extends AppError { constructor(readonly statusCode: ContentfulStatusCode, message: string, code = "HTTP_ERROR", details?: unknown) }` — `src/shared/errors/http-error.ts:4-13`. `code` es `readonly` de `AppError` (`src/shared/errors/app-error.ts:4`), por eso `rejects.toMatchObject({ statusCode, code })` funciona, como ya se usa en `test/HU05_mel/especialidades.cajablanca.test.ts:95`.
  - `export { EventBus, eventBus } from "./event-bus.js"` — `src/events/index.ts:5`; `EventBus` es una clase sin dependencias (`src/events/event-bus.ts:5`). El service lo recibe y no publica nada, igual que `academic-record.service.ts:11-15`.
  - `import { z } from "zod"` — Zod **v3** (`package.json:40`, `"zod": "^3.23.0"`). El esquema de escritura que ya existe y del que se copia el estilo es `src/modules/advising/teacher/teacher.schemas.ts:3-19`.
  - Los helpers que usará el controller de la Tarea 5: `validateJson`, `validateQuery` y `validateParams` de `src/shared/middleware/validate-dto.ts:5,18,27`, que reciben un `ZodSchema<T>` y lanzan `HttpError(400, …, "INVALID_REQUEST_BODY" | "INVALID_QUERY_PARAMS" | "INVALID_ROUTE_PARAMS", result.error.flatten())`.
  - Cualquier error que no sea `HttpError` sale como 500 `INTERNAL_SERVER_ERROR` (`src/shared/middleware/error-handler.ts:18-28`).

- Produce (lo usa la Tarea 5):
  ```ts
  // src/modules/time-blocks/time-blocks.schemas.ts
  export const timeBlockBodySchema;      // z.object({ title, colorHex, daysOfWeek, startTime, endTime, startDate, endDate }) + 3 .refine
  export type TimeBlockBody = z.infer<typeof timeBlockBodySchema>;
  //   = { title: string; colorHex: string; daysOfWeek: number[]; startTime: string; endTime: string;
  //       startDate: string; endDate: string }  → asignable a TimeBlockInput
  export const exceptionBodySchema;      // z.discriminatedUnion("status", [cancelled, moved + horas]) + .superRefine (orden de las horas)
  export type ExceptionInput = z.infer<typeof exceptionBodySchema>;
  //   = { status: "cancelled" } | { status: "moved"; startTime: string; endTime: string }
  export const blockIdParamSchema;       // salida { id: number }, id entero de 1 a 2147483647
  export const occurrenceParamsSchema;   // salida { id: number; date: string }
  export const windowQuerySchema;        // salida { from: string; to: string } + .refine (to >= from)

  // src/modules/time-blocks/time-blocks.service.ts
  export const MAX_BLOCKS_PER_STUDENT = 20;
  export type TimeBlockExceptionView = Omit<TimeBlockException, "blockId">;
  export interface TimeBlockWithExceptions extends TimeBlockRule { exceptions: TimeBlockExceptionView[] }
  export class TimeBlocksService {
    constructor(readonly repository: TimeBlocksRepository, readonly events: EventBus) {}
    listBlocks(studentId: number): Promise<{ blocks: TimeBlockWithExceptions[] }>
    createBlock(studentId: number, input: TimeBlockInput): Promise<{ block: TimeBlockWithExceptions }>
    updateBlock(studentId: number, blockId: number, input: TimeBlockInput): Promise<{ block: TimeBlockWithExceptions }>
    deleteBlock(studentId: number, blockId: number): Promise<{ ok: true }>
    setException(studentId: number, blockId: number, date: string, body: ExceptionInput): Promise<{ exception: TimeBlockExceptionView }>
    clearException(studentId: number, blockId: number, date: string): Promise<{ ok: true }>
    occurrences(studentId: number, from: string, to: string): Promise<{ occurrences: TimeBlockOccurrence[]; weeks: TimeBlockWeekHours[] }>
  }
  ```
  `setException` devuelve la excepción **sin** `blockId`, con la misma forma que las que van dentro de cada
  bloque: es lo que fija RS-BE-32 (`time-blocks.spec.md:117-119`) y muestra el `PUT` de "Contrato" (`:268-274`).

  Los cinco esquemas pasan por `validateJson` / `validateParams` / `validateQuery` y su salida entra tal
  cual en los métodos del service. `tsc` lo comprueba en la Tarea 5, en la llamada del controller.
  `TimeBlockWithExceptions` y `TimeBlockExceptionView` se declaran en el service y **no** en
  `time-blocks.types.ts`: son la forma de la RESPUESTA que arma esta capa (el bloque con sus excepciones
  pegadas y sin `blockId` repetido, como el contrato de la spec), no una fila de la base. El archivo de
  tipos es de la Tarea 2 y esta tarea no lo toca.

**Dónde vive cada regla, y por qué** (una sola vez, para no repetirlo en cada paso):

| regla de la spec | dónde | error |
|:---|:---|:---|
| formato de cada campo | esquema Zod | 400 `INVALID_REQUEST_BODY` / `INVALID_ROUTE_PARAMS` / `INVALID_QUERY_PARAMS` |
| la fecha existe en el calendario (`2026-02-30` no) y cae entre 2000-01-01 y 2099-12-31 | esquema, `fecha` con `.refine` | el mismo 400 del campo |
| el `:id` cabe en un `integer` de Postgres (≤ 2147483647) | esquema, `.max` | 400 `INVALID_ROUTE_PARAMS` |
| `endTime > startTime` (bloque y `moved`) | esquema, `.refine` / `.superRefine` | 400 `INVALID_REQUEST_BODY` |
| `endDate >= startDate` | esquema, `.refine` | 400 `INVALID_REQUEST_BODY` |
| días de la semana sin repetir | esquema, `.refine` | 400 `INVALID_REQUEST_BODY` |
| grilla 07:00-22:00 | service | 400 `TIME_BLOCK_OUT_OF_GRID` |
| tope de 20 bloques | service | 400 `TIME_BLOCK_LIMIT_REACHED` |
| pertenencia del bloque | service | 404 `TIME_BLOCK_NOT_FOUND` |
| la fecha está en el patrón | service | 400 `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN` |
| ventana obligatoria y con `to >= from` | esquema, `.refine` | 400 `INVALID_QUERY_PARAMS` |
| ventana ≤ 120 días | service | 400 `TIME_BLOCK_WINDOW_TOO_WIDE` |

Las reglas que cruzan campos (`endTime > startTime`, `endDate >= startDate`, los días repetidos y el orden
de la ventana) van en el **esquema** con `.refine` y no en el service: la spec pone "`endTime`
estrictamente mayor" y "`endDate >= startDate`" bajo "Validación con Zod" (`time-blocks.spec.md:64-91`) y
dice que su error es un `400 INVALID_REQUEST_BODY` sin código propio (`:83-85`), que es exactamente el 400
que ya lanza `validateJson`, con el campo culpable dentro de `flatten().fieldErrors`; la ventana al revés
es `400 INVALID_QUERY_PARAMS` (`:142-145`), el de `validateQuery`. `TIME_BLOCK_OUT_OF_GRID` queda solo
para la grilla (`:75-77`) y `TIME_BLOCK_WINDOW_TOO_WIDE` solo para los 120 días (`:142-145`): una hora de fin
invertida no está "fuera de la grilla", y una ventana al revés no es "demasiado ancha". Los esquemas pasan
de `ZodObject` a `ZodEffects`, que `validateJson(c, schema)` y `validateQuery(c, schema)` aceptan igual
porque su parámetro es `ZodSchema<T>` (`src/shared/middleware/validate-dto.ts:5` y `:18`), y `z.infer`
sigue dando los mismos campos.

La existencia de la fecha también va en el esquema, y en los **cinco** campos de fecha (body, `:date`,
`from`, `to`): sin ella, `"2026-02-30"` pasa el regex y un `POST`/`PATCH` o un `DELETE …/occurrences/`
la mandan como `::date` a Postgres, que responde 22008: un 500 por un error del formulario. En la
ventana no hay 500, pero la expansión arranca en `from` y devolvería una ocurrencia con fecha
`"2026-02-30"` en lugar del lunes `2026-03-02`. El mismo `fecha` acota el año a 2000–2099: Postgres acepta
fechas hasta el año 5874897, y con un bloque que llegara al 9999-12-31 una ventana de su último tramo
expandiría hasta pasar de ese día (ver la Tarea 2, punto 4 de "Cinco cosas"). El `:id` lleva `.max` por la
misma razón que la fecha: un `3000000000` pasa `.int().positive()`, llega al `where id = …` contra una
columna `integer` y Postgres responde 22003, otro 500 por un error de la petición.

---

- [ ] **Paso 1: Escribir la prueba que falla**

Antes de escribir nada, comprobar que las Tareas 1, 2 y 3 ya están y que los archivos de esta no existen:

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && ls -1 src/modules/time-blocks/ && ls -1 test/HU35_jeff/
```

Esperado, literal:

```
feat/bloques-horario
time-blocks.logic.ts
time-blocks.repository.ts
time-blocks.types.ts
migration-0012.test.ts
time-blocks-expansion.test.ts
time-blocks.repository.test.ts
```

Si falta `time-blocks.repository.ts`, la Tarea 3 no está hecha: **PARAR**, esta tarea importa su tipo.
Si ya aparecen `time-blocks.schemas.ts`, `time-blocks.service.ts` o `time-blocks.service.test.ts`,
alguien adelantó la tarea: **PARAR**.

Crear `test/HU35_jeff/time-blocks.service.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import {
  MAX_BLOCKS_PER_STUDENT,
  TimeBlocksService,
} from "../../src/modules/time-blocks/time-blocks.service.js";
import {
  blockIdParamSchema,
  exceptionBodySchema,
  occurrenceParamsSchema,
  timeBlockBodySchema,
  windowQuerySchema,
} from "../../src/modules/time-blocks/time-blocks.schemas.js";
import type { TimeBlockBody } from "../../src/modules/time-blocks/time-blocks.schemas.js";
import type { TimeBlocksRepository } from "../../src/modules/time-blocks/time-blocks.repository.js";
import type {
  TimeBlockException,
  TimeBlockExceptionStatus,
  TimeBlockInput,
  TimeBlockRule,
} from "../../src/modules/time-blocks/time-blocks.types.js";

/**
 * RS-BE-31, RS-BE-32, el tope de ventana de RS-BE-33 y el armado de RS-BE-34.
 *
 * Sin base y sin red: el repositorio es un objeto en memoria que además anota
 * cada llamada con sus argumentos, para poder exigir que el `studentId` del
 * token baje a TODAS las consultas y que el PATCH no borre excepciones.
 *
 * Datos INVENTADOS (el repo es público): el alumno sintético es el 20230001 y
 * su `student.id` en estas pruebas es el 7. Ningún fixture real.
 *
 * Calendario de referencia (2026): 14-09 lunes, 21-09 lunes, 23-09 miércoles,
 * 28-09 lunes, 30-09 miércoles, 05-10 lunes, 07-10 miércoles, 08-10 jueves,
 * 12-10 lunes, 14-10 miércoles, 19-10 lunes, 20-10 martes, 26-10 lunes.
 */

const ALUMNO = 7;
const OTRO_ALUMNO = 9;

/** Lunes y miércoles de 14:00 a 18:00, del 2026-09-21 al 2026-10-20. */
const PRACTICAS: TimeBlockRule = {
  id: 12,
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-21",
  endDate: "2026-10-20",
};

const BODY_VALIDO = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-21",
  endDate: "2026-10-20",
};

/** Entrada del service: el mismo body, ya validado. */
const ENTRADA: TimeBlockInput = { ...BODY_VALIDO };

const excepcion = (
  blockId: number,
  date: string,
  status: TimeBlockExceptionStatus,
  startTime: string | null = null,
  endTime: string | null = null,
): TimeBlockException => ({ blockId, date, status, startTime, endTime });

type Llamada = { metodo: string; args: unknown[] };

/**
 * Repositorio falso con las nueve firmas de la Tarea 3. `llamadas` guarda el
 * orden y los argumentos; `gritaAlBorrar` convierte cualquier borrado en un
 * fallo ruidoso, que es como se fija que el PATCH no toca las excepciones.
 */
const armar = (
  opts: {
    blocks?: TimeBlockRule[];
    exceptions?: TimeBlockException[];
    total?: number;
    gritaAlBorrar?: boolean;
  } = {},
) => {
  const llamadas: Llamada[] = [];
  const blocks = opts.blocks ?? [];
  const exceptions = opts.exceptions ?? [];
  const anota = (metodo: string, ...args: unknown[]) => llamadas.push({ metodo, args });
  const propio = (studentId: number, blockId: number) =>
    studentId === ALUMNO ? (blocks.find((b) => b.id === blockId) ?? null) : null;

  const repository = {
    findBlocks: async (studentId: number) => {
      anota("findBlocks", studentId);
      return studentId === ALUMNO ? blocks : [];
    },
    findBlockOwnedBy: async (studentId: number, blockId: number) => {
      anota("findBlockOwnedBy", studentId, blockId);
      return propio(studentId, blockId);
    },
    countBlocks: async (studentId: number) => {
      anota("countBlocks", studentId);
      return opts.total ?? blocks.length;
    },
    insertBlock: async (studentId: number, input: TimeBlockInput) => {
      anota("insertBlock", studentId, input);
      return { id: 99, ...input };
    },
    updateBlock: async (studentId: number, blockId: number, input: TimeBlockInput) => {
      anota("updateBlock", studentId, blockId, input);
      return propio(studentId, blockId) === null ? null : { id: blockId, ...input };
    },
    deleteBlock: async (studentId: number, blockId: number) => {
      anota("deleteBlock", studentId, blockId);
      if (opts.gritaAlBorrar) throw new Error("no se esperaba un borrado");
      return propio(studentId, blockId) !== null;
    },
    findExceptions: async (studentId: number, blockIds: readonly number[]) => {
      anota("findExceptions", studentId, [...blockIds]);
      if (blockIds.length === 0) return [];
      return exceptions.filter((e) => studentId === ALUMNO && blockIds.includes(e.blockId));
    },
    upsertException: async (
      studentId: number,
      blockId: number,
      date: string,
      status: TimeBlockExceptionStatus,
      startTime: string | null,
      endTime: string | null,
    ) => {
      anota("upsertException", studentId, blockId, date, status, startTime, endTime);
      // Como el SQL de la Tarea 3: con un bloque ajeno no escribe y devuelve null.
      return propio(studentId, blockId) === null
        ? null
        : excepcion(blockId, date, status, startTime, endTime);
    },
    deleteException: async (studentId: number, blockId: number, date: string) => {
      anota("deleteException", studentId, blockId, date);
      if (opts.gritaAlBorrar) throw new Error("no se esperaba un borrado de excepciones");
      return (
        propio(studentId, blockId) !== null &&
        exceptions.some((e) => e.blockId === blockId && e.date === date)
      );
    },
  } as unknown as TimeBlocksRepository;

  return {
    repository,
    llamadas,
    metodos: () => llamadas.map((l) => l.metodo),
    service: new TimeBlocksService(repository, new EventBus()),
  };
};

describe("timeBlockBodySchema (RS-BE-31)", () => {
  test("acepta el bloque del alumno sintetico y recorta los espacios del titulo", () => {
    const body = timeBlockBodySchema.parse({ ...BODY_VALIDO, title: "  Practicas  " });
    expect(body.title).toBe("Practicas");
    expect(body.daysOfWeek).toEqual([1, 3]);
  });

  test("el cuerpo validado entra tal cual en TimeBlockInput", () => {
    // `comoInput` es una comprobación de tipos para el editor
    // (test/tsconfig.json): `tsc` no compila test/. La de `tsc` llega en la
    // Tarea 5, cuando el controller le pasa el body validado al service.
    const comoInput = (body: TimeBlockBody): TimeBlockInput => body;
    expect(comoInput(timeBlockBodySchema.parse(BODY_VALIDO))).toEqual(ENTRADA);
  });

  test("rechaza un titulo vacio o de puros espacios", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "   " }).success).toBe(false);
  });

  test("rechaza un titulo de 61 caracteres y acepta uno de 60", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "a".repeat(61) }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, title: "a".repeat(60) }).success).toBe(true);
  });

  test("el color va en #RRGGBB, en mayusculas o minusculas", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "#f94b3f" }).success).toBe(true);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "F94B3F" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "#FFF" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, colorHex: "azul" }).success).toBe(false);
  });

  test("los dias van de 1 a 7, sin repetir, entre uno y siete", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [0] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [8] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [1.5] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [1, 1] }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }).success).toBe(true);
    // El domingo es 7 y se acepta, aunque el portal nunca lo genere.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, daysOfWeek: [7] }).success).toBe(true);
  });

  test("las horas van en HH:MM de 24 horas", () => {
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "7:00" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "24:00" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endTime: "18:60" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endTime: "18:00:00" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "07:05" }).success).toBe(true);
  });

  test("las fechas van en YYYY-MM-DD", () => {
    // Además fija que una cadena sin la forma NO llega a `addDays`: si llegara,
    // `toISOString()` lanzaria RangeError y el safeParse explotaria en vez de
    // devolver `success: false`.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startDate: "2026-9-1" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startDate: "21/09/2026" }).success).toBe(false);
  });

  test("las fechas tienen que existir en el calendario, no solo tener la forma", () => {
    // Pasan el regex pero no existen: sin este chequeo llegarian como `::date`
    // al repository y Postgres responderia 22008, un 500 por un error del
    // formulario. 2026 no es bisiesto; 2028 si.
    const r = timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-02-30", endDate: "2026-03-31",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.startDate).toEqual(["Fecha inválida (YYYY-MM-DD)."]);
    }
    expect(timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-02-29", endDate: "2026-03-31",
    }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endDate: "2026-13-01" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2028-02-29", endDate: "2028-03-31",
    }).success).toBe(true);
  });

  test("las fechas van del 2000-01-01 al 2099-12-31", () => {
    // Postgres acepta el 9999-12-31, pero un dia despues addDays imprime
    // "+010000-01": sin tope, la expansion de la Tarea 2 podria llegar ahi.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endDate: "9999-12-31" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startDate: "1999-12-31" }).success).toBe(false);
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, endDate: "2099-12-31" }).success).toBe(true);
    expect(windowQuerySchema.safeParse({ from: "9999-09-03", to: "9999-12-31" }).success).toBe(false);
  });

  test("la hora de fin tiene que ser mayor que la de inicio, y el error va en su campo", () => {
    // RS-BE-31 la pone bajo "Validacion con Zod" y sin codigo propio: es un
    // 400 INVALID_REQUEST_BODY, no TIME_BLOCK_OUT_OF_GRID (ese es de la grilla).
    const r = timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "18:00", endTime: "14:00" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.endTime).toEqual([
        "La hora de fin tiene que ser mayor que la de inicio.",
      ]);
    }
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "14:00", endTime: "14:00" }).success).toBe(false);
  });

  test("la fecha de fin no puede ser anterior a la de inicio, y puede ser la misma", () => {
    const alReves = timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-10-20", endDate: "2026-09-21",
    });
    expect(alReves.success).toBe(false);
    expect(timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-09-21", endDate: "2026-09-21",
    }).success).toBe(true);
  });

  test("el error de la fecha de fin viaja en su campo, para que el formulario lo pinte", () => {
    const r = timeBlockBodySchema.safeParse({
      ...BODY_VALIDO, startDate: "2026-10-20", endDate: "2026-09-21",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.endDate).toEqual([
        "La fecha de fin no puede ser anterior a la de inicio.",
      ]);
    }
  });

  test("el esquema NO valida la grilla: eso es del service", () => {
    // 05:00 es una hora legal en HH:MM y el esquema la acepta; el que la
    // rechaza con TIME_BLOCK_OUT_OF_GRID es el service.
    expect(timeBlockBodySchema.safeParse({ ...BODY_VALIDO, startTime: "05:00" }).success).toBe(true);
  });
});

describe("exceptionBodySchema (RS-BE-32)", () => {
  test("cancelled va solo con el estado", () => {
    expect(exceptionBodySchema.parse({ status: "cancelled" })).toEqual({ status: "cancelled" });
  });

  test("cancelled descarta las horas que vengan de mas", () => {
    expect(exceptionBodySchema.parse({ status: "cancelled", startTime: "15:00" })).toEqual({
      status: "cancelled",
    });
  });

  test("moved exige las dos horas", () => {
    expect(exceptionBodySchema.safeParse({ status: "moved" }).success).toBe(false);
    expect(exceptionBodySchema.safeParse({ status: "moved", startTime: "15:00" }).success).toBe(false);
    expect(exceptionBodySchema.parse({ status: "moved", startTime: "15:00", endTime: "19:00" })).toEqual({
      status: "moved", startTime: "15:00", endTime: "19:00",
    });
  });

  test("rechaza un estado que no existe y un body sin estado", () => {
    expect(exceptionBodySchema.safeParse({ status: "borrado" }).success).toBe(false);
    expect(exceptionBodySchema.safeParse({}).success).toBe(false);
  });

  test("moved exige la hora de fin mayor que la de inicio, con el error en endTime", () => {
    const r = exceptionBodySchema.safeParse({ status: "moved", startTime: "19:00", endTime: "15:00" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.endTime).toEqual([
        "La hora de fin tiene que ser mayor que la de inicio.",
      ]);
    }
    expect(exceptionBodySchema.safeParse({ status: "moved", startTime: "15:00", endTime: "15:00" }).success).toBe(false);
  });
});

describe("esquemas de ruta y de query", () => {
  test("blockIdParamSchema coacciona el id del path y exige un entero positivo que quepa en integer", () => {
    expect(blockIdParamSchema.parse({ id: "12" })).toEqual({ id: 12 });
    expect(blockIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    expect(blockIdParamSchema.safeParse({ id: "-3" }).success).toBe(false);
    expect(blockIdParamSchema.safeParse({ id: "abc" }).success).toBe(false);
    // Mas alla de 2147483647 Postgres responderia 22003 (un 500).
    expect(blockIdParamSchema.parse({ id: "2147483647" })).toEqual({ id: 2147483647 });
    expect(blockIdParamSchema.safeParse({ id: "3000000000" }).success).toBe(false);
  });

  test("occurrenceParamsSchema coacciona el id y exige la fecha plana", () => {
    expect(occurrenceParamsSchema.parse({ id: "12", date: "2026-10-08" })).toEqual({
      id: 12, date: "2026-10-08",
    });
    expect(occurrenceParamsSchema.safeParse({ id: "12", date: "8-10-2026" }).success).toBe(false);
    // El DELETE no exige el patron: sin esto, esta fecha llegaria a Postgres.
    expect(occurrenceParamsSchema.safeParse({ id: "12", date: "2026-02-30" }).success).toBe(false);
    expect(occurrenceParamsSchema.safeParse({ id: "3000000000", date: "2026-10-08" }).success).toBe(false);
  });

  test("windowQuerySchema exige las dos fechas: la ventana es obligatoria", () => {
    expect(windowQuerySchema.parse({ from: "2026-09-21", to: "2026-10-19" })).toEqual({
      from: "2026-09-21", to: "2026-10-19",
    });
    expect(windowQuerySchema.safeParse({ from: "2026-09-21" }).success).toBe(false);
    expect(windowQuerySchema.safeParse({}).success).toBe(false);
    // La expansion arranca en `from`: esta fecha saldria como ocurrencia.
    expect(windowQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-08" }).success).toBe(false);
  });

  test("windowQuerySchema rechaza la ventana al reves, con el error en to", () => {
    // Una ventana al reves es una query mal armada (400 INVALID_QUERY_PARAMS),
    // no una "demasiado ancha": la spec reserva TIME_BLOCK_WINDOW_TOO_WIDE
    // para los 120 dias.
    const r = windowQuerySchema.safeParse({ from: "2026-10-19", to: "2026-09-21" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.to).toEqual(["La ventana no puede terminar antes de empezar."]);
    }
    expect(windowQuerySchema.safeParse({ from: "2026-09-21", to: "2026-09-21" }).success).toBe(true);
  });
});

describe("listBlocks (RS-BE-31)", () => {
  test("devuelve cada bloque con sus excepciones ordenadas por fecha y sin blockId", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [
        excepcion(12, "2026-10-14", "moved", "15:00", "19:00"),
        excepcion(12, "2026-10-05", "cancelled"),
      ],
    });
    const r = await a.service.listBlocks(ALUMNO);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0]).toEqual({
      ...PRACTICAS,
      exceptions: [
        { date: "2026-10-05", status: "cancelled", startTime: null, endTime: null },
        { date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:00" },
      ],
    });
  });

  test("cada excepcion va con su bloque y no con el otro", async () => {
    const otro: TimeBlockRule = { ...PRACTICAS, id: 13, title: "Voluntariado", daysOfWeek: [3] };
    const a = armar({
      blocks: [PRACTICAS, otro],
      exceptions: [excepcion(13, "2026-10-07", "cancelled")],
    });
    const r = await a.service.listBlocks(ALUMNO);
    expect(r.blocks[0]?.exceptions).toEqual([]);
    expect(r.blocks[1]?.exceptions).toHaveLength(1);
  });

  test("sin bloques devuelve la lista vacia y pide las excepciones de ningun id", async () => {
    const a = armar();
    expect(await a.service.listBlocks(ALUMNO)).toEqual({ blocks: [] });
    expect(a.llamadas).toEqual([
      { metodo: "findBlocks", args: [ALUMNO] },
      { metodo: "findExceptions", args: [ALUMNO, []] },
    ]);
  });

  test("el studentId del token baja a las dos consultas", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await a.service.listBlocks(ALUMNO);
    expect(a.llamadas).toEqual([
      { metodo: "findBlocks", args: [ALUMNO] },
      { metodo: "findExceptions", args: [ALUMNO, [12]] },
    ]);
  });
});

describe("createBlock (RS-BE-31)", () => {
  test("crea el bloque y lo devuelve sin excepciones", async () => {
    const a = armar();
    const r = await a.service.createBlock(ALUMNO, ENTRADA);
    expect(r.block).toEqual({ id: 99, ...ENTRADA, exceptions: [] });
    expect(a.metodos()).toEqual(["countBlocks", "insertBlock"]);
    expect(a.llamadas[1]?.args).toEqual([ALUMNO, ENTRADA]);
  });

  test("rechaza lo que cae fuera de la grilla 07:00-22:00", async () => {
    const a = armar();
    await expect(
      a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "06:59", endTime: "09:00" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OUT_OF_GRID" });
    await expect(
      a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "21:00", endTime: "22:01" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OUT_OF_GRID" });
  });

  test("acepta los bordes exactos de la grilla", async () => {
    const a = armar();
    const r = await a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "07:00", endTime: "22:00" });
    expect(r.block.startTime).toBe("07:00");
    expect(r.block.endTime).toBe("22:00");
  });

  test("un body fuera de la grilla no llega a consultar nada", async () => {
    const a = armar();
    await expect(
      a.service.createBlock(ALUMNO, { ...ENTRADA, startTime: "05:00", endTime: "06:00" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OUT_OF_GRID" });
    expect(a.llamadas).toEqual([]);
  });

  test("con 20 bloques ya no deja crear otro", async () => {
    const a = armar({ total: MAX_BLOCKS_PER_STUDENT });
    await expect(a.service.createBlock(ALUMNO, ENTRADA)).rejects.toMatchObject({
      statusCode: 400,
      code: "TIME_BLOCK_LIMIT_REACHED",
    });
    expect(a.metodos()).toEqual(["countBlocks"]);
  });

  test("con 19 bloques todavia deja crear el numero 20", async () => {
    const a = armar({ total: MAX_BLOCKS_PER_STUDENT - 1 });
    await a.service.createBlock(ALUMNO, ENTRADA);
    expect(a.metodos()).toEqual(["countBlocks", "insertBlock"]);
  });

  test("el tope es 20", () => {
    expect(MAX_BLOCKS_PER_STUDENT).toBe(20);
  });
});

describe("updateBlock (RS-BE-31)", () => {
  test("reemplaza la regla y conserva las excepciones", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [excepcion(12, "2026-10-05", "cancelled")],
      gritaAlBorrar: true,
    });
    const nuevo: TimeBlockInput = { ...ENTRADA, startTime: "15:00", endTime: "19:00" };
    const r = await a.service.updateBlock(ALUMNO, 12, nuevo);
    expect(r.block).toEqual({
      id: 12,
      ...nuevo,
      exceptions: [{ date: "2026-10-05", status: "cancelled", startTime: null, endTime: null }],
    });
    // El repositorio grita si alguien borra; además se fija la secuencia.
    expect(a.metodos()).toEqual(["updateBlock", "findExceptions"]);
  });

  test("un bloque de otro alumno responde 404 y no 403", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.updateBlock(OTRO_ALUMNO, 12, ENTRADA)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
  });

  test("un bloque que no existe responde 404", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.updateBlock(ALUMNO, 404, ENTRADA)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
  });

  test("valida la grilla antes de escribir nada", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.updateBlock(ALUMNO, 12, { ...ENTRADA, startTime: "22:00", endTime: "23:00" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OUT_OF_GRID" });
    expect(a.llamadas).toEqual([]);
  });
});

describe("deleteBlock (RS-BE-31)", () => {
  test("borra el bloque del alumno", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.deleteBlock(ALUMNO, 12)).toEqual({ ok: true });
    expect(a.llamadas).toEqual([{ metodo: "deleteBlock", args: [ALUMNO, 12] }]);
  });

  test("un bloque de otro alumno responde 404", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.deleteBlock(OTRO_ALUMNO, 12)).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
  });
});

describe("setException (RS-BE-32)", () => {
  test("cancelled guarda las dos horas en null y responde sin blockId", async () => {
    // El contrato del PUT (RS-BE-32 de la spec) no trae blockId: la
    // excepcion sale con la misma forma que dentro de su bloque.
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.setException(ALUMNO, 12, "2026-10-05", { status: "cancelled" });
    expect(r.exception).toEqual({
      date: "2026-10-05", status: "cancelled", startTime: null, endTime: null,
    });
    expect(a.llamadas[1]).toEqual({
      metodo: "upsertException", args: [ALUMNO, 12, "2026-10-05", "cancelled", null, null],
    });
  });

  test("moved guarda las horas nuevas", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.setException(ALUMNO, 12, "2026-10-14", {
      status: "moved", startTime: "15:00", endTime: "19:00",
    });
    expect(r.exception).toEqual({
      date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:00",
    });
  });

  test("repetir el mismo PUT deja el mismo estado", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const primero = await a.service.setException(ALUMNO, 12, "2026-10-05", { status: "cancelled" });
    const segundo = await a.service.setException(ALUMNO, 12, "2026-10-05", { status: "cancelled" });
    expect(segundo).toEqual(primero);
    expect(a.llamadas[1]).toEqual(a.llamadas[3]);
  });

  test("un bloque de otro alumno responde 404 y no escribe", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(OTRO_ALUMNO, 12, "2026-10-05", { status: "cancelled" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "TIME_BLOCK_NOT_FOUND" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });

  test("una fecha en un dia que el patron no genera se rechaza", async () => {
    // 2026-10-08 es jueves y el bloque es lunes y miercoles.
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-10-08", { status: "cancelled" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });

  test("una fecha fuera del rango del bloque se rechaza aunque sea lunes", async () => {
    // 2026-10-26 es lunes, pero el bloque termina el 2026-10-20; 2026-09-14
    // tambien es lunes, pero el bloque empieza el 2026-09-21.
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-10-26", { status: "cancelled" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-09-14", { status: "cancelled" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
  });

  test("una fecha que no existe en el calendario se rechaza aca y no en Postgres", async () => {
    // Por HTTP ya la frena `occurrenceParamsSchema`; el service la frena igual
    // porque el patron no genera un dia que no existe. 2026-03-02 es lunes: sin
    // el chequeo de existencia, "2026-02-30" pasaria por lunes.
    const a = armar({ blocks: [{ ...PRACTICAS, startDate: "2026-01-01", endDate: "2026-12-31" }] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-02-30", { status: "cancelled" }),
    ).rejects.toMatchObject({ code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });

  test("los bordes del rango si estan en el patron", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await a.service.setException(ALUMNO, 12, "2026-09-21", { status: "cancelled" });
    await a.service.setException(ALUMNO, 12, "2026-10-19", { status: "cancelled" });
    expect(a.metodos().filter((m) => m === "upsertException")).toHaveLength(2);
  });

  test("moved fuera de la grilla se rechaza y no escribe", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(
      a.service.setException(ALUMNO, 12, "2026-10-05", {
        status: "moved", startTime: "20:00", endTime: "23:00",
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "TIME_BLOCK_OUT_OF_GRID" });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });
});

describe("clearException (RS-BE-32)", () => {
  test("quita la excepcion de esa fecha", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [excepcion(12, "2026-10-05", "cancelled")],
    });
    expect(await a.service.clearException(ALUMNO, 12, "2026-10-05")).toEqual({ ok: true });
    expect(a.llamadas[1]).toEqual({ metodo: "deleteException", args: [ALUMNO, 12, "2026-10-05"] });
  });

  test("borrar una excepcion que no estaba tambien responde ok", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.clearException(ALUMNO, 12, "2026-10-05")).toEqual({ ok: true });
  });

  test("no exige que la fecha este en el patron: limpiar siempre se puede", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.clearException(ALUMNO, 12, "2026-10-08")).toEqual({ ok: true });
  });

  test("un bloque de otro alumno responde 404 y no borra nada", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await expect(a.service.clearException(OTRO_ALUMNO, 12, "2026-10-05")).rejects.toMatchObject({
      statusCode: 404,
      code: "TIME_BLOCK_NOT_FOUND",
    });
    expect(a.metodos()).toEqual(["findBlockOwnedBy"]);
  });
});

describe("occurrences (RS-BE-33 y RS-BE-34)", () => {
  test("arma las ocurrencias y las horas de cada semana", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2026-10-04");
    expect(r.occurrences.map((o) => o.date)).toEqual([
      "2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30",
    ]);
    expect(r.occurrences[0]).toEqual({
      blockId: 12,
      title: "Practicas preprofesionales",
      colorHex: "#F94B3F",
      date: "2026-09-21",
      dayOfWeek: 1,
      startTime: "14:00",
      endTime: "18:00",
      moved: false,
    });
    expect(r.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 8 },
      { weekStart: "2026-09-28", hours: 8 },
    ]);
  });

  test("un dia cancelado no aparece ni suma, y uno movido suma su duracion nueva", async () => {
    const a = armar({
      blocks: [PRACTICAS],
      exceptions: [
        excepcion(12, "2026-09-21", "cancelled"),
        excepcion(12, "2026-09-23", "moved", "15:00", "19:30"),
      ],
    });
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2026-09-27");
    expect(r.occurrences).toHaveLength(1);
    expect(r.occurrences[0]).toMatchObject({
      date: "2026-09-23", startTime: "15:00", endTime: "19:30", moved: true,
    });
    expect(r.weeks).toEqual([{ weekStart: "2026-09-21", hours: 4.5 }]);
  });

  test("una ventana que no toca el rango no trae ocurrencias y su semana sale en cero", async () => {
    // RS-BE-34: una entrada por cada semana entre los lunes de from y de to, aunque no sume nada.
    const a = armar({ blocks: [PRACTICAS] });
    expect(await a.service.occurrences(ALUMNO, "2026-11-02", "2026-11-08")).toEqual({
      occurrences: [], weeks: [{ weekStart: "2026-11-02", hours: 0 }],
    });
  });

  test("las semanas de los bordes suman la semana entera, no solo los dias de la ventana", async () => {
    // RS-BE-34: el total es "el de la semana entera, de lunes a domingo, aunque
    // la ventana la corte". La ventana empieza un miercoles y termina un lunes: el lunes
    // 21-09 y el miercoles 30-09 no salen como ocurrencias, pero suman.
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.occurrences(ALUMNO, "2026-09-23", "2026-09-28");
    expect(r.occurrences.map((o) => o.date)).toEqual(["2026-09-23", "2026-09-28"]);
    expect(r.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 8 },
      { weekStart: "2026-09-28", hours: 8 },
    ]);
  });

  test("una ventana de 121 dias se rechaza y una de 120 pasa", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    // 2026-09-21 + 119 dias = 2027-01-18, que es el dia 120 contando los dos
    // extremos; 2027-01-19 seria el 121.
    await expect(a.service.occurrences(ALUMNO, "2026-09-21", "2027-01-19")).rejects.toMatchObject({
      code: "TIME_BLOCK_WINDOW_TOO_WIDE",
    });
    // El bloque solo vale hasta el 2026-10-20: cinco lunes y cuatro miercoles.
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2027-01-18");
    expect(r.occurrences).toHaveLength(9);
  });

  test("una ventana de un solo dia es valida y trae el total de su semana", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    const r = await a.service.occurrences(ALUMNO, "2026-09-21", "2026-09-21");
    expect(r.occurrences).toHaveLength(1);
    // Lunes 21-09 y miercoles 23-09: la semana entera, aunque la ventana sea un dia.
    expect(r.weeks).toEqual([{ weekStart: "2026-09-21", hours: 8 }]);
  });

  test("el studentId del token baja a las dos consultas de la ventana", async () => {
    const a = armar({ blocks: [PRACTICAS] });
    await a.service.occurrences(ALUMNO, "2026-09-21", "2026-10-04");
    expect(a.llamadas).toEqual([
      { metodo: "findBlocks", args: [ALUMNO] },
      { metodo: "findExceptions", args: [ALUMNO, [12]] },
    ]);
  });
});
```

Las fechas del calendario están comprobadas con `Date.UTC`: 2026-09-14 lunes, 21-09 lunes, 23-09
miércoles, 28-09 lunes, 30-09 miércoles, 05-10 lunes, 07-10 miércoles, 08-10 **jueves** (por eso es la
fecha que el patrón no genera), 12-10 lunes, 14-10 miércoles, 19-10 lunes, 20-10 martes, 26-10 lunes
(fuera del rango del bloque) y 2026-03-02 lunes (a donde desborda `"2026-02-30"`). 2026 no es bisiesto y
2028 sí. `2026-09-21 + 119 días = 2027-01-18`, que es el día **120** contando los dos extremos, y entre el
2026-09-21 y el 2026-10-20 hay exactamente nueve lunes y miércoles. El 2026-11-02 es lunes (la semana que
la ventana del 02-11 al 08-11 toca sin ocurrencias). No cambies ninguna: casi todas las aserciones
dependen de ellas.

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/time-blocks.service.test.ts
```

Esperado: FAIL al cargar el archivo, exit 1, con este bloque (bun 1.4.2; arriba sale la línea de versión
de bun y abajo `Ran 1 test across 1 file.` con el tiempo):

```
test/HU35_jeff/time-blocks.service.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/modules/time-blocks/time-blocks.service.js' from '$REPO/test/HU35_jeff/time-blocks.service.test.ts'
-------------------------------


 0 pass
 1 fail
 1 error
```

Ninguna prueba llega a correr. El módulo que nombra el error es el **service** y no el de esquemas, aunque
falten los dos: es el primer import de valores del archivo después de `EventBus`, y los `import type` los
borra el transpilador de bun antes de resolver nada.

El prefijo `DATABASE_URL=postgres://user:pass@localhost:5432/test` es obligatorio en **todas** las corridas:
el `.env` del worktree apunta a la base de PRODUCCIÓN y bun lo carga solo. Esta prueba no abre ninguna
conexión —el repositorio es un objeto en memoria y nada de lo que importa carga `db` ni `config`—, pero
el prefijo va igual. (El `preload` de `bunfig.toml`, `test/env.setup.ts`, solo rellena lo ausente con
`||=`: **no** protege de la base de producción.)

- [ ] **Paso 3: Implementación mínima**

Primero, crear `src/modules/time-blocks/time-blocks.schemas.ts` con este contenido completo:

```ts
/**
 * Zod de los bloques propios (RS-BE-31, RS-BE-32 y RS-BE-33). Zod v3
 * (`package.json:40`).
 *
 * Acá vive solo lo que se decide mirando la petición: el formato de cada campo
 * y las reglas que cruzan dos campos de la misma petición (horas, fechas, días
 * repetidos, orden de la ventana), que la spec pone bajo "Validación con Zod"
 * sin código propio. Las reglas de negocio —grilla, tope de bloques,
 * pertenencia, patrón y ancho de la ventana— viven en el service, con los
 * códigos de error que fija la spec.
 *
 * El regex de la hora se declara una vez, en `HORA`, y lo usan los cuatro
 * campos de hora. Sale de `teacher.schemas.ts:6-7`, el esquema de escritura
 * que ya existe en el repo, sin los segundos opcionales: en este módulo la hora
 * es "HH:MM" y nada más, porque así viaja en el contrato y así la guarda el
 * repository.
 */
import { z } from "zod";
import { addDays } from "./time-blocks.logic.js";

/** Forma "YYYY-MM-DD". Solo la forma: si la fecha existe lo mira `fecha`. */
const FORMA_DE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Hora "HH:MM" de 00:00 a 23:59, siempre con dos dígitos. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Rango de fechas del módulo. Un horario de prácticas no necesita otro siglo. */
const PRIMERA_FECHA = "2000-01-01";
const ULTIMA_FECHA = "2099-12-31";

/** Tope de un `integer` de Postgres, el tipo de `student_time_block.id`. */
const MAX_ID = 2147483647;

/**
 * Una fecha plana que además existe en el calendario y cae entre 2000 y 2099.
 * El regex solo no basta: "2026-02-30" lo cumple, y llegaría como
 * `${fecha}::date` al repository (Tarea 3), donde Postgres responde 22008 y el
 * `errorHandler` lo vuelve un 500 por un error del formulario.
 * `addDays(valor, 0)` rearma la fecha con `Date.UTC` y la reimprime
 * —"2026-02-30" vuelve como "2026-03-02"—, así que una fecha que no existe no
 * coincide consigo misma.
 *
 * El rango cierra otra puerta: Postgres acepta el 9999-12-31, y un día después
 * `addDays` imprime "+010000-01"; con un bloque hasta ahí, la expansión de las
 * semanas completas (Tarea 4, `occurrences`) pasaría de ese día.
 *
 * El `test` del regex va primero y corta: a `addDays` nunca le llega una cadena
 * sin dígitos, que `toISOString()` no sabe imprimir (RangeError) y haría
 * explotar el `safeParse` en vez de devolver `success: false`. Con la forma ya
 * comprobada, comparar el texto contra el rango es comparar fechas.
 */
const fecha = z
  .string()
  .refine(
    (valor) =>
      FORMA_DE_FECHA.test(valor) &&
      valor >= PRIMERA_FECHA &&
      valor <= ULTIMA_FECHA &&
      addDays(valor, 0) === valor,
    "Fecha inválida (YYYY-MM-DD).",
  );

export const timeBlockBodySchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color inválido."),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    startTime: z.string().regex(HORA, "Hora de inicio inválida (HH:MM)."),
    endTime: z.string().regex(HORA, "Hora de fin inválida (HH:MM)."),
    startDate: fecha,
    endDate: fecha,
  })
  // Las tres reglas de RS-BE-31 que cruzan dos campos del mismo body. Van acá
  // y no en el service porque la spec las pone bajo "Validación con Zod" sin
  // código propio: su error es del formulario —400 INVALID_REQUEST_BODY, el que
  // ya lanza `validateJson`—. TIME_BLOCK_OUT_OF_GRID es solo de la grilla.
  // Las horas "HH:MM" del regex van siempre en dos dígitos, así que el orden
  // alfabético es el del reloj.
  .refine((body) => body.endTime > body.startTime, {
    message: "La hora de fin tiene que ser mayor que la de inicio.",
    path: ["endTime"],
  })
  .refine((body) => body.endDate >= body.startDate, {
    message: "La fecha de fin no puede ser anterior a la de inicio.",
    path: ["endDate"],
  })
  .refine((body) => new Set(body.daysOfWeek).size === body.daysOfWeek.length, {
    message: "Los días de la semana no se pueden repetir.",
    path: ["daysOfWeek"],
  });

/** El cuerpo ya validado. Es estructuralmente `TimeBlockInput`, así que el
 *  controller (Tarea 5) se lo pasa al service tal cual; `tsc` lo comprueba ahí,
 *  en la llamada. */
export type TimeBlockBody = z.infer<typeof timeBlockBodySchema>;

export const exceptionBodySchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }),
    z.object({
      status: z.literal("moved"),
      startTime: z.string().regex(HORA, "Hora de inicio inválida (HH:MM)."),
      endTime: z.string().regex(HORA, "Hora de fin inválida (HH:MM)."),
    }),
  ])
  // El orden de las horas del `moved` (RS-BE-32 remite a las validaciones de
  // RS-BE-31). Va sobre la unión entera y no con `.refine` en el miembro: en
  // Zod 3 `discriminatedUnion` solo acepta `ZodObject`, y un miembro con
  // `.refine` es `ZodEffects`.
  .superRefine((body, ctx) => {
    if (body.status === "moved" && body.endTime <= body.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La hora de fin tiene que ser mayor que la de inicio.",
        path: ["endTime"],
      });
    }
  });

export type ExceptionInput = z.infer<typeof exceptionBodySchema>;

/** El `:id` es un id de BLOQUE y tiene que caber en el `integer` de la
 *  columna: un "3000000000" pasaría `.positive()` y Postgres respondería 22003
 *  (un 500) al compararlo en el `where`. */
export const blockIdParamSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_ID),
});

/** `:date` también pasa por `fecha`: el `DELETE` de una excepción no exige que
 *  la fecha esté en el patrón, así que sin esto "2026-02-30" llegaría a
 *  `deleteException` y a Postgres. */
export const occurrenceParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(MAX_ID),
  date: fecha,
});

/** La ventana es obligatoria (RS-BE-33): sin `from` o sin `to`, 400. Las dos
 *  pasan por `fecha` porque la expansión arranca en `from`: un "2026-02-30"
 *  saldría como ocurrencia y se comería el lunes 2026-03-02. Una ventana al
 *  revés es una query mal armada (400 INVALID_QUERY_PARAMS): la spec reserva
 *  TIME_BLOCK_WINDOW_TOO_WIDE para los 120 días, que mira el service. */
export const windowQuerySchema = z
  .object({
    from: fecha,
    to: fecha,
  })
  .refine((ventana) => ventana.to >= ventana.from, {
    message: "La ventana no puede terminar antes de empezar.",
    path: ["to"],
  });
```

Después, crear `src/modules/time-blocks/time-blocks.service.ts` con este contenido completo:

```ts
/**
 * Reglas de los bloques propios (RS-BE-31, RS-BE-32, RS-BE-33 y RS-BE-34).
 *
 * El service recibe el repository y el `EventBus` y nunca importa `db`, como
 * `academic-record.service.ts:11-15`. `events` está por la arquitectura del
 * repo; esta funcionalidad todavía no publica eventos.
 *
 * El `studentId` llega SIEMPRE del token (lo pone el controller) y baja a cada
 * consulta del repository. La pertenencia se comprueba acá, en el service, como
 * `findSectionOwnedByTeacher` en `advising/teacher` (`teacher.service.ts:38-40`),
 * y además el SQL de la Tarea 3 la vuelve a acotar por `student_id`.
 */
import type { EventBus } from "../../events/index.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  WINDOW_MAX_DAYS,
  addDays,
  dayOfWeekOf,
  expandOccurrences,
  mondayOf,
  weeklyHours,
  withinGrid,
} from "./time-blocks.logic.js";
import type { TimeBlocksRepository } from "./time-blocks.repository.js";
import type { ExceptionInput } from "./time-blocks.schemas.js";
import type {
  TimeBlockException,
  TimeBlockInput,
  TimeBlockOccurrence,
  TimeBlockRule,
  TimeBlockWeekHours,
} from "./time-blocks.types.js";

/** Tope de bloques por alumno (RS-BE-31). No es una regla de negocio: es el
 *  techo que mantiene acotada la expansión de una ventana. Cuenta todos los
 *  bloques guardados, también los vencidos (ver `countBlocks`). */
export const MAX_BLOCKS_PER_STUDENT = 20;

/** La excepción como la ve el alumno: sin `blockId`, que ya es el bloque que
 *  la contiene o el `:id` de la ruta (forma del contrato de la spec, también
 *  en la respuesta del PUT). */
export type TimeBlockExceptionView = Omit<TimeBlockException, "blockId">;

/** Un bloque con sus excepciones, que es lo que devuelven las rutas de
 *  RS-BE-31. Las excepciones salen ordenadas por fecha. */
export interface TimeBlockWithExceptions extends TimeBlockRule {
  exceptions: TimeBlockExceptionView[];
}

const vistaDeExcepcion = (excepcion: TimeBlockException): TimeBlockExceptionView => ({
  date: excepcion.date,
  status: excepcion.status,
  startTime: excepcion.startTime,
  endTime: excepcion.endTime,
});

const conExcepciones = (
  block: TimeBlockRule,
  exceptions: readonly TimeBlockException[],
): TimeBlockWithExceptions => ({
  ...block,
  exceptions: exceptions
    .filter((excepcion) => excepcion.blockId === block.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(vistaDeExcepcion),
});

export class TimeBlocksService {
  constructor(
    readonly repository: TimeBlocksRepository,
    readonly events: EventBus,
  ) {}

  async listBlocks(studentId: number): Promise<{ blocks: TimeBlockWithExceptions[] }> {
    const blocks = await this.repository.findBlocks(studentId);
    const exceptions = await this.repository.findExceptions(
      studentId,
      blocks.map((block) => block.id),
    );
    return { blocks: blocks.map((block) => conExcepciones(block, exceptions)) };
  }

  async createBlock(
    studentId: number,
    input: TimeBlockInput,
  ): Promise<{ block: TimeBlockWithExceptions }> {
    this.exigirHorasDeLaGrilla(input.startTime, input.endTime);

    // El tope se comprueba después de las horas: así un body imposible no
    // gasta una consulta, y el alumno que ya llegó a 20 igual ve primero el
    // error de su formulario.
    const cuantos = await this.repository.countBlocks(studentId);
    if (cuantos >= MAX_BLOCKS_PER_STUDENT) {
      throw new HttpError(
        400,
        `Llegaste al máximo de ${MAX_BLOCKS_PER_STUDENT} bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro.`,
        "TIME_BLOCK_LIMIT_REACHED",
      );
    }

    const block = await this.repository.insertBlock(studentId, input);
    return { block: { ...block, exceptions: [] } };
  }

  async updateBlock(
    studentId: number,
    blockId: number,
    input: TimeBlockInput,
  ): Promise<{ block: TimeBlockWithExceptions }> {
    this.exigirHorasDeLaGrilla(input.startTime, input.endTime);

    // RS-BE-31: el PATCH reemplaza la regla entera y NO toca las excepciones.
    // Por eso acá solo se actualiza y se vuelven a leer: nada las borra.
    const block = await this.repository.updateBlock(studentId, blockId, input);
    if (block === null) throw this.bloqueNoEncontrado();

    const exceptions = await this.repository.findExceptions(studentId, [blockId]);
    return { block: conExcepciones(block, exceptions) };
  }

  async deleteBlock(studentId: number, blockId: number): Promise<{ ok: true }> {
    const borrado = await this.repository.deleteBlock(studentId, blockId);
    if (!borrado) throw this.bloqueNoEncontrado();
    return { ok: true };
  }

  async setException(
    studentId: number,
    blockId: number,
    date: string,
    body: ExceptionInput,
  ): Promise<{ exception: TimeBlockExceptionView }> {
    const block = await this.repository.findBlockOwnedBy(studentId, blockId);
    if (block === null) throw this.bloqueNoEncontrado();

    this.exigirFechaDelPatron(block, date);
    if (body.status === "moved") {
      this.exigirHorasDeLaGrilla(body.startTime, body.endTime);
    }

    const exception = await this.repository.upsertException(
      studentId,
      blockId,
      date,
      body.status,
      body.status === "moved" ? body.startTime : null,
      body.status === "moved" ? body.endTime : null,
    );
    // null: el bloque dejó de ser del alumno (se borró) entre la lectura y la escritura.
    if (exception === null) throw this.bloqueNoEncontrado();
    return { exception: vistaDeExcepcion(exception) };
  }

  async clearException(studentId: number, blockId: number, date: string): Promise<{ ok: true }> {
    const block = await this.repository.findBlockOwnedBy(studentId, blockId);
    if (block === null) throw this.bloqueNoEncontrado();

    // Sin exigir que la fecha esté en el patrón y sin mirar si había algo que
    // borrar: quitar una excepción es idempotente y una fila vieja que quedó
    // fuera del patrón —porque el alumno movió el rango del bloque— también
    // se tiene que poder limpiar. Que la fecha exista ya lo garantiza
    // `occurrenceParamsSchema`.
    await this.repository.deleteException(studentId, blockId, date);
    return { ok: true };
  }

  async occurrences(
    studentId: number,
    from: string,
    to: string,
  ): Promise<{ occurrences: TimeBlockOccurrence[]; weeks: TimeBlockWeekHours[] }> {
    this.exigirVentana(from, to);

    const blocks = await this.repository.findBlocks(studentId);
    const exceptions = await this.repository.findExceptions(
      studentId,
      blocks.map((block) => block.id),
    );

    // RS-BE-34 pide, por cada semana que toca la ventana, el total de horas de
    // la semana ENTERA, aunque la ventana la corte. Por eso se expande del
    // lunes de `from` al domingo de la semana de `to`, las horas se suman
    // sobre eso, y recién después las ocurrencias se recortan a [from, to].
    // Las horas salen de las ocurrencias ya expandidas: el service no vuelve a
    // sumar por su cuenta.
    const semanasCompletas = expandOccurrences(
      blocks,
      exceptions,
      mondayOf(from),
      addDays(mondayOf(to), 6),
    );
    const occurrences = semanasCompletas.filter(
      (ocurrencia) => ocurrencia.date >= from && ocurrencia.date <= to,
    );
    return { occurrences, weeks: weeklyHours(semanasCompletas, from, to) };
  }

  /** 404 y no 403 a propósito: un id de otro alumno no tiene por qué revelar
   *  que el bloque existe. El repository ya acota por `student_id`, así que
   *  "no es tuyo" y "no existe" llegan acá como el mismo `null`. */
  private bloqueNoEncontrado(): HttpError {
    return new HttpError(404, "No existe ese bloque.", "TIME_BLOCK_NOT_FOUND");
  }

  /** RS-BE-31: las dos horas dentro de 07:00–22:00, bordes incluidos. Que la
   *  de fin sea mayor que la de inicio lo exigen los esquemas (400
   *  INVALID_REQUEST_BODY): la spec reserva TIME_BLOCK_OUT_OF_GRID para la
   *  grilla. Si una llamada sin Zod delante llegara con las horas invertidas,
   *  la frenan `chk_time_block_horas` y `chk_time_block_exc_movido` en la base. */
  private exigirHorasDeLaGrilla(startTime: string, endTime: string): void {
    if (!withinGrid(startTime, endTime)) {
      throw new HttpError(
        400,
        "El bloque tiene que empezar y terminar entre las 07:00 y las 22:00.",
        "TIME_BLOCK_OUT_OF_GRID",
      );
    }
  }

  /** RS-BE-32: la fecha existe, cae dentro del rango del bloque y en uno de
   *  sus días. Por HTTP la existencia ya la garantiza `occurrenceParamsSchema`;
   *  acá se repite porque es parte de la regla —el patrón no genera un día que
   *  no existe— y el service no depende de quién lo llame. `addDays(date, 0)`
   *  rearma la fecha con `Date.UTC` y la reimprime, así que "2026-02-30" vuelve
   *  como "2026-03-02" y no coincide consigo misma. */
  private exigirFechaDelPatron(block: TimeBlockRule, date: string): void {
    const existe = addDays(date, 0) === date;
    const enRango = date >= block.startDate && date <= block.endDate;
    if (!existe || !enRango || !block.daysOfWeek.includes(dayOfWeekOf(date))) {
      throw new HttpError(
        400,
        "Ese día no forma parte del bloque.",
        "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN",
      );
    }
  }

  /** RS-BE-33: la ventana no pasa de `WINDOW_MAX_DAYS` días contando los dos
   *  extremos. Que `to` no sea anterior a `from` lo exige `windowQuerySchema`
   *  (400 INVALID_QUERY_PARAMS): una ventana al revés no es "demasiado ancha". */
  private exigirVentana(from: string, to: string): void {
    if (to > addDays(from, WINDOW_MAX_DAYS - 1)) {
      throw new HttpError(
        400,
        `La ventana no puede pasar de ${WINDOW_MAX_DAYS} días.`,
        "TIME_BLOCK_WINDOW_TOO_WIDE",
      );
    }
  }
}
```

Diez cosas que parecen de estilo y no lo son:

1. **El orden de las horas va en los esquemas, no en el service.** La spec pone "`endTime` estrictamente
   mayor" bajo "Validación con Zod" (`time-blocks.spec.md:74`) y reserva `TIME_BLOCK_OUT_OF_GRID` para la
   grilla (`:75-77` y `:83-85`). Por eso `18:00 → 14:00` responde 400 `INVALID_REQUEST_BODY` con el error en
   `endTime`, igual que `endDate < startDate`, y la app no muestra "fuera de la grilla" para unas horas que
   están invertidas. Se compara como texto: el regex obliga a dos dígitos, así que el orden alfabético de
   `"HH:MM"` es el del reloj.
2. **`withinGrid` NO comprueba el orden de las horas.** En la Tarea 2 es
   `minutesOf(start) >= minutesOf(GRID_START) && minutesOf(end) <= minutesOf(GRID_END)`: solo los
   bordes, que es justo lo que le toca al service. Si una llamada sin Zod delante llegara con las horas
   invertidas, la frenan `chk_time_block_horas` y `chk_time_block_exc_movido` en la base.
3. **`exceptionBodySchema` lleva el orden de las horas en un `.superRefine` sobre la unión entera.** En Zod
   3 (`zod@3.25` instalado) `discriminatedUnion` solo acepta miembros `ZodObject`; un `.refine` dentro del
   miembro `moved` lo vuelve `ZodEffects` y la unión no se construye. `z.infer` sigue dando la misma unión.
4. **La ventana al revés es `INVALID_QUERY_PARAMS`, no `TIME_BLOCK_WINDOW_TOO_WIDE`.** La spec le da ese
   código solo a los 120 días, y a la ventana al revés `INVALID_QUERY_PARAMS` (`:142-145`). `windowQuerySchema` exige `to >= from` y deja el error en `to`;
   el service solo mira el ancho.
5. **404 y no 403 cuando el bloque es de otro alumno.** El repository ya acota por `student_id`, así que
   "no existe" y "no es tuyo" llegan como el mismo `null`/`false`; responder 403 confirmaría que el id
   existe. Es lo contrario de `advising/teacher`, que sí responde 403 `SECTION_FORBIDDEN`
   (`teacher.service.ts:38-40`), porque allá el docente ya sabe que la sección existe.
6. **`updateBlock` no vuelve a leer el bloque antes de escribir.** El `updateBlock` del repository ya
   lleva el `student_id` en su `where` y devuelve `null` si no tocó nada: un `findBlockOwnedBy` previo
   sería una consulta de más y una ventana de carrera. Y **nada** en ese camino borra excepciones: la
   prueba usa un repositorio que lanza si alguien llama a `deleteBlock` o a `deleteException`.
7. **`clearException` no exige que la fecha esté en el patrón.** Poner una excepción sí (RS-BE-32:
   ensuciaría la tabla), pero quitarla tiene que poder limpiar una fila vieja que quedó fuera del patrón
   porque el alumno movió el rango del bloque. Y no mira el booleano de `deleteException`: borrar lo que
   ya no está es un 200, no un 404. Es lo que dice RS-BE-32: la regla del patrón es del `PUT`
   (`:121-123`) y el `DELETE` no la exige y responde igual aunque no hubiera excepción (`:125-127`).
8. **La fecha se valida en el esquema, en los cinco campos de fecha: que exista y que caiga entre
   2000-01-01 y 2099-12-31.** `fecha` (en `time-blocks.schemas.ts`) le pide a cada fecha que coincida
   consigo misma después de `addDays(valor, 0)`, que rearma con `Date.UTC` y normaliza el desborde. Cierra
   tres huecos que el regex deja abiertos: un `POST`/`PATCH` con `startDate: "2026-02-30"` y un
   `DELETE /time-blocks/me/12/occurrences/2026-02-30` llegarían como `::date` a Postgres (22008 → 500), y
   una ventana con `from=2026-02-30` devolvería esa fecha como ocurrencia y se saltaría el lunes
   2026-03-02. El rango cierra un cuarto: con un bloque hasta el 9999-12-31, `occurrences` expande hasta
   el domingo de la última semana y pasaría de ese día. El `FORMA_DE_FECHA.test(valor)` va **antes** y
   corta: sin él, `"21/09/2026"` llegaría a `addDays`, `toISOString()` lanzaría `RangeError: Invalid Date`
   y el `safeParse` explotaría (la prueba "las fechas van en YYYY-MM-DD" lo fija).
9. **`exigirFechaDelPatron` repite el chequeo de existencia.** Por HTTP ya lo hizo el esquema, pero el
   patrón de un bloque nunca genera un día que no existe, y el service no depende de que lo llame un
   controller con Zod delante. Tiene su prueba propia ("una fecha que no existe en el calendario se
   rechaza aca y no en Postgres"): 2026-03-02 es lunes, así que sin esa línea `"2026-02-30"` pasaría por
   lunes y llegaría a `upsertException`.
10. **`occurrences` expande las semanas completas y recién después recorta.** RS-BE-34 pide el total de
    horas de cada semana que toca la ventana, de la semana **entera** aunque la ventana la corte (`:161-163`): si la app pide el ciclo visible
    y el ciclo empieza un miércoles, la primera semana tiene que traer también el lunes. Por eso el
    service expande de `mondayOf(from)` a `addDays(mondayOf(to), 6)`, le pasa todo eso a `weeklyHours`
    y devuelve en `occurrences` solo lo que cae en `[from, to]`. Son como mucho seis días de más a cada
    lado de una ventana que ya está topada en 120. Y `setException` devuelve la excepción sin `blockId`
    (`vistaDeExcepcion`), con la forma que fija RS-BE-32 (`:117-119`); si el bloque se borró
    entre la lectura y la escritura, `upsertException` devuelve `null` y el service responde 404.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/time-blocks.service.test.ts
```

Esperado: PASS, `60 pass`, `0 fail`, `134 expect() calls`, `Ran 60 tests across 1 file.` La versión
anterior se midió con bun (58 y 121); la de ahora se corrió, junto con la lógica de la Tarea 2 y los
esquemas y el service de arriba, en el arnés en memoria calibrado contra aquella medición (ver "Cifras de
las pruebas").

- [ ] **Paso 5: Comprobar que el huso del sistema no mueve nada**

El service llama a `dayOfWeekOf` y a `addDays` para decidir si una fecha está en el patrón y si la ventana
cabe, y el esquema llama a `addDays` para saber si la fecha existe; si alguna cuenta se fuera a hora
local, un bloque del lunes se rechazaría el lunes. Correr con los tres husos:

```bash
cd "${REPO:?}" && for z in America/Lima UTC Asia/Tokyo; do echo -n "$z: "; TZ=$z DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/time-blocks.service.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)" | tr '\n' ' '; echo; done
```

Esperado, literal:

```
America/Lima:  60 pass  0 fail 
UTC:  60 pass  0 fail 
Asia/Tokyo:  60 pass  0 fail 
```

- [ ] **Paso 6: Build**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" run build
```

Esperado: la línea `$ tsc` sola, sin ningún error, y exit 0. `tsc` solo compila `src/` (`tsconfig.json:23`,
`"include": ["src/**/*"]`), así que acá se comprueban los dos archivos nuevos bajo `strict`,
`noUnusedLocals`, `noUnusedParameters` y `noImplicitReturns` (`tsconfig.json:9,17-19`); `test/` no lo
compila nadie (`test/tsconfig.json` es solo para el editor). La salida va a `dist/`, que está en
`.gitignore:5`. Si sale `error TS2307: Cannot find module './time-blocks.repository.js'`, la Tarea 3 no
está: **PARAR**.

- [ ] **Paso 7: Enlazar la prueba desde la spec**

En `specs/features/time-blocks/time-blocks.spec.md`, al final de RS-BE-32, reemplazar esto:

```markdown
Es idempotente: repetir el mismo `PUT` deja el mismo estado (`on conflict do update`).

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
```

por esto:

```markdown
Es idempotente: repetir el mismo `PUT` deja el mismo estado (`on conflict do update`).

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.service.test.ts`
```

El ancla es única: el párrafo de la idempotencia aparece una sola vez en el archivo, y hace falta porque
la línea `[@test] …/time-blocks.routes.test.ts` está también al final de RS-BE-31. Dos `[@test]` seguidos
son la forma que ya usa el repo cuando un requisito tiene varias pruebas
(`specs/features/attendance-risk/attendance-risk.spec.md:29-31`), y la misma que deja la Tarea 3 bajo
RS-BE-31.

Comprobar que quedaron los dos y que el archivo que nombran existe:

```bash
cd "${REPO:?}" && grep -n "@test" specs/features/time-blocks/time-blocks.spec.md && ls test/HU35_jeff/time-blocks.service.test.ts
```

Esperado, literal (con la línea de la Tarea 3 en la 107):

```
55:`[@test] ../../../test/HU35_jeff/migration-0012.test.ts`
106:`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
107:`[@test] ../../../test/HU35_jeff/time-blocks.repository.test.ts`
132:`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
133:`[@test] ../../../test/HU35_jeff/time-blocks.service.test.ts`
155:`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`
176:`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`
185:`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts`
204:`[@test] ../../../test/HU35_jeff/schedule-iso-date.test.ts`
test/HU35_jeff/time-blocks.service.test.ts
```

La última línea `[@test]` enlaza la prueba de la Tarea 7, que todavía no existe: el enlace viene de la
reconciliación de la spec y el archivo lo crea esa tarea. Si la línea 133 no está, o el ancla no aparece
tal cual: **PARAR** y releer la spec, no editar a ciegas.

- [ ] **Paso 8: Correr la carpeta HU35 completa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff
```

Esperado: `0 fail` y `across 4 files`: esta prueba en verde y también las de las Tareas 1, 2 y 3. Esta
tarea no modifica ningún archivo de `src/` que ya existiera y todavía no la importa ninguna ruta, así que
no hay regresión posible fuera de HU35: la suite completa se corre en la Tarea 5 y en el cierre (Tarea 8).

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}" && git add src/modules/time-blocks/time-blocks.schemas.ts src/modules/time-blocks/time-blocks.service.ts test/HU35_jeff/time-blocks.service.test.ts specs/features/time-blocks/time-blocks.spec.md && git commit -m "feat(time-blocks): esquemas Zod y reglas del service (RS-BE-31 a RS-BE-34)"
```

Sin trailer Co-Authored-By, sin push y sin PR. El autor ya está configurado en git.
### Tarea 5: Controller, rutas y módulo

**Archivos:**
- Crear: `src/modules/time-blocks/time-blocks.controller.ts`
- Crear: `src/modules/time-blocks/time-blocks.routes.ts`
- Crear: `src/modules/time-blocks/index.ts`
- Modificar: `src/modules/index.ts:18` (import) y `src/modules/index.ts:37-38` (montaje)
- Modificar: `src/server.ts:20` (`PATCH` en `allowMethods` del CORS)
- Test: `test/HU35_jeff/time-blocks.routes.test.ts` (crear; la carpeta `test/HU35_jeff/` existe desde la Tarea 1)

Todos los comandos se corren desde la raíz del worktree `$REPO`,
en la rama `feat/bloques-horario`. Cada bloque `bash` de esta tarea que usa `$BUN` empieza con la guarda
`: "${BUN:?…}"` y se corre **entero, en una sola llamada de shell**, después del `export` de
"Variables de los comandos": el `export` no sobrevive de una llamada a otra, y con `$BUN` vacío
`… $BUN test …` se vuelve el comando `test` de la shell, que no imprime nada y sale con 0. La guarda
corta la llamada antes de que pase.

Esta tarea **no** toca la spec. Los tres archivos nuevos entran por el target
`../../../src/modules/time-blocks/**`, y `src/modules/index.ts` y `src/server.ts` por los suyos
(`specs/features/time-blocks/time-blocks.spec.md:5-7`). Además, esta prueba ya está enlazada con
`[@test]` bajo RS-BE-31 y RS-BE-32 desde que se escribió la spec. El cambio de `src/server.ts` es una
línea, `PATCH` en el CORS, y lo pide RS-BE-31 (`time-blocks.spec.md:99-102`).

**Interfaces:**

- Consume — de la **Tarea 4** (`src/modules/time-blocks/time-blocks.schemas.ts` y `…/time-blocks.service.ts`):
  ```ts
  // time-blocks.schemas.ts
  export const timeBlockBodySchema;     // z.object({ title, colorHex, daysOfWeek, startTime, endTime, startDate, endDate }) + 3 .refine (ZodEffects)
  export const exceptionBodySchema;     // z.discriminatedUnion("status", [cancelled, moved + horas]) + .superRefine (ZodEffects)
  export type ExceptionInput = z.infer<typeof exceptionBodySchema>;
  export const blockIdParamSchema;      // z.object({ id: z.coerce.number().int().positive().max(2147483647) })
  export const occurrenceParamsSchema;  // z.object({ id, date })  — date pasa por `fecha` (existe y cae en 2000–2099)
  export const windowQuerySchema;       // z.object({ from, to }) + .refine(to >= from)  — las dos por `fecha`

  // time-blocks.service.ts
  export type TimeBlockExceptionView = Omit<TimeBlockException, "blockId">;
  export interface TimeBlockWithExceptions extends TimeBlockRule { exceptions: TimeBlockExceptionView[] }
  export class TimeBlocksService {
    constructor(readonly repository: TimeBlocksRepository, readonly events: EventBus) {}
    listBlocks(studentId: number): Promise<{ blocks: TimeBlockWithExceptions[] }>
    createBlock(studentId: number, input: TimeBlockInput): Promise<{ block: TimeBlockWithExceptions }>
    updateBlock(studentId: number, blockId: number, input: TimeBlockInput): Promise<{ block: TimeBlockWithExceptions }>
    deleteBlock(studentId: number, blockId: number): Promise<{ ok: true }>
    setException(studentId: number, blockId: number, date: string, body: ExceptionInput): Promise<{ exception: TimeBlockExceptionView }>
    clearException(studentId: number, blockId: number, date: string): Promise<{ ok: true }>
    occurrences(studentId: number, from: string, to: string): Promise<{ occurrences: TimeBlockOccurrence[]; weeks: TimeBlockWeekHours[] }>
  }
  ```
  `occurrences` devuelve en `weeks` una entrada por cada semana que toca la ventana, con el total de la
  semana entera (0 si no hay nada), y en `occurrences` solo lo que cae en `[from, to]`.
- Consume — de la **Tarea 3**: `export class TimeBlocksRepository { constructor(readonly database: typeof db) {} … }`.
  La prueba corre el repositorio **real** sobre una base falsa, así que depende del SQL exacto de esa tarea
  (los fragmentos `COLUMNAS_REGLA` y `COLUMNAS_EXCEPCION` no llevan parámetros):
  - `findBlocks`: `where student_id = $1`.
  - `findBlockOwnedBy`: `where student_id = $1 and id = $2`.
  - `countBlocks`: `select count(*)::int as total … where student_id = $1`.
  - `insertBlock`: `$1..$8` = `(student_id, title, color_hex, días como JSON, start_time, end_time, start_date, end_date)`.
  - `updateBlock`: `$1..$7` son los campos (días como JSON en `$3`), con `where id = $8 and student_id = $9`.
  - `deleteBlock`: `where id = $1 and student_id = $2`.
  - `findExceptions`: `$1` es el alumno y `$2` los ids como `"12,13"` (el helper `intArray`); con la lista vacía no consulta.
  - `upsertException`: `insert … select b.id, $1..$4 = (fecha, estado, inicio, fin) from student_time_block b where b.id = $5 and b.student_id = $6 …`; sin fila si el bloque no es del alumno.
  - `deleteException`: `delete … using student_time_block b where … b.student_id = $1 and e.block_id = $2 and e.occurrence_date = $3::date`.

  Las horas vuelven de la base como `"HH:MM:SS"` y el repositorio las recorta a `"HH:MM"`.
- Consume — de la **Tarea 2**: los tipos `TimeBlockRule`, `TimeBlockInput`, `TimeBlockException`,
  `TimeBlockOccurrence` y `TimeBlockWeekHours` de `time-blocks.types.ts`. Aquí solo se re-exportan en `index.ts`.
- Consume — del repo, tal como está hoy:
  - `export type AuthVariables`, `export const authMiddleware`, `export const requireRole = (...roles: string[])`
    y `export const STUDENT_ROLES = ["student", "delegate", "subdelegate"] as const`:
    `src/shared/middleware/auth-middleware.ts:8-15`, `:20`, `:92` y `:101`.
  - `validateJson(c, schema)`, `validateQuery(c, schema)` y `validateParams(c, schema)`, con `schema: ZodSchema<T>`:
    `src/shared/middleware/validate-dto.ts:5`, `:18` y `:27`. Lanzan `HttpError(400, …)` con
    `INVALID_JSON_BODY`, `INVALID_REQUEST_BODY`, `INVALID_QUERY_PARAMS` o `INVALID_ROUTE_PARAMS`, y
    `details: result.error.flatten()`.
  - `HttpError`: `src/shared/errors/http-error.ts:4-13`. `errorHandler`: `src/shared/middleware/error-handler.ts:4`,
    que responde `{ error: { code, message, details } }`.
  - `export const db`: `src/db/index.ts:8`. `eventBus` y `EventBus`: `src/events/index.ts:5`.
    `config.auth.jwtSecret`: `src/config/app-config.ts:17-18`.
  - El CORS de `src/server.ts:16-23`, registrado antes que `logger()` y que los módulos. Su línea 20 es
    `    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],`, **sin `PATCH`**: hoy no hay ningún
    `.patch(` en `src/`. El `cors` de `hono/cors` (Hono 4.12.19 instalado) responde el preflight
    (`OPTIONS`) él mismo, con `204` y `Access-Control-Allow-Methods` igual a esa lista unida por comas,
    **sea cual sea el `Origin`**: lo que cambia con `CORS_ORIGINS` es `Access-Control-Allow-Origin`, no la
    lista de métodos. Por eso el chequeo del Paso 3 no depende del `.env`.
  - Plantillas que se copian:
    - `src/modules/academic-record/academic-record.routes.ts:19-33` (rutas).
    - `src/modules/academic-record/academic-record.controller.ts:15-21` (la guarda del `studentId`).
    - `src/modules/academic-record/index.ts:1-20` (composition root).
    - `test/HU34_jeff/academic-record.routes.test.ts` (base falsa y tokens firmados; la cadena armada a mano en `:58-69`).
- Produce:
  ```ts
  // src/modules/time-blocks/time-blocks.controller.ts
  export class TimeBlocksController {
    constructor(readonly service: TimeBlocksService) {}
    listBlocks(c: Context): Promise<Response>      // GET    /me
    createBlock(c: Context): Promise<Response>     // POST   /me  → 201
    updateBlock(c: Context): Promise<Response>     // PATCH  /me/:id
    deleteBlock(c: Context): Promise<Response>     // DELETE /me/:id
    setException(c: Context): Promise<Response>    // PUT    /me/:id/occurrences/:date
    clearException(c: Context): Promise<Response>  // DELETE /me/:id/occurrences/:date
    getOccurrences(c: Context): Promise<Response>  // GET    /me/occurrences
  }

  // src/modules/time-blocks/time-blocks.routes.ts
  export const createTimeBlocksRoutes = (controller: TimeBlocksController) => Hono<{ Variables: AuthVariables }>
  //   app.use("*", authMiddleware); app.use("*", requireRole(...STUDENT_ROLES));
  //   en este orden de registro:
  //   GET    /me/occurrences
  //   GET    /me
  //   POST   /me
  //   PATCH  /me/:id
  //   DELETE /me/:id
  //   PUT    /me/:id/occurrences/:date
  //   DELETE /me/:id/occurrences/:date

  // src/modules/time-blocks/index.ts
  //   new TimeBlocksRepository(db) → new TimeBlocksService(repo, eventBus) → new TimeBlocksController(service)
  export const timeBlocksRoutes

  // src/modules/index.ts
  //   import { timeBlocksRoutes } from "./time-blocks/index.js";  app.route("/time-blocks", timeBlocksRoutes);

  // src/server.ts:20
  //       allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  ```
  Ninguna tarea posterior importa estos símbolos. La Tarea 6 documenta las siete rutas en
  `docs/specs/api-contracts.md` (y que el CORS ya deja pasar el `PATCH`), y la Tarea 8 corre la suite. Lo que la Tarea 6 tiene que documentar es
  exactamente lo que responde esta capa (lo fija la prueba del Paso 1):
  - `GET /time-blocks/me` → 200 `{ "blocks": TimeBlockWithExceptions[] }`; cada excepción es
    `{ date, status, startTime, endTime }`, con las dos horas en `null` si es `cancelled`.
  - `POST /time-blocks/me` → **201** `{ "block": … }` con `exceptions: []`.
  - `PATCH /time-blocks/me/:id` → 200 `{ "block": … }`, con las excepciones que ya tenía.
  - `DELETE /time-blocks/me/:id` y `DELETE /time-blocks/me/:id/occurrences/:date` → 200 `{ "ok": true }`.
  - `PUT /time-blocks/me/:id/occurrences/:date` → 200 `{ "exception": { date, status, startTime, endTime } }`,
    sin `blockId`, como el contrato de la spec (`time-blocks.spec.md:268-274`).
  - `GET /time-blocks/me/occurrences?from=&to=` → 200 `{ "occurrences": TimeBlockOccurrence[], "weeks": TimeBlockWeekHours[] }`,
    con una semana por cada lunes que toca la ventana y el total de la semana entera.
  - Errores: 400 `INVALID_JSON_BODY` / `INVALID_REQUEST_BODY` (también la hora de fin no mayor que la de
    inicio) / `INVALID_ROUTE_PARAMS` / `INVALID_QUERY_PARAMS` (también la ventana al revés),
    400 `TIME_BLOCK_OUT_OF_GRID` / `TIME_BLOCK_LIMIT_REACHED` / `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN` /
    `TIME_BLOCK_WINDOW_TOO_WIDE`, 404 `TIME_BLOCK_NOT_FOUND` (también para el bloque de otro alumno),
    401 `MISSING_TOKEN` / `INVALID_TOKEN` y 403 `FORBIDDEN`.

**Cinco decisiones de esta tarea**, anotadas una sola vez para no repetirlas en cada paso:

1. **El controller no decide ni rearma nada.** Saca al alumno del token, valida con Zod y devuelve
   `c.json(await this.service.X(…))`. La forma de cada respuesta la arma el service (Tarea 4): por
   ejemplo, el `PUT` de una ocurrencia responde la excepción **sin** `blockId`, como el ejemplo del `PUT`
   en la sección "Contrato" de la spec, porque así la devuelve `setException`. La prueba lo fija.
2. **La guarda `requireStudentId` se copia de `academic-record.controller.ts:15-21`.** `authMiddleware`
   acepta un `studentId` 0 porque es entero (`auth-middleware.ts:50-58`). Sin la guarda, ese 0 llegaría al SQL.
3. **Cada handler sigue el orden alumno → params → body o query → service.** Una petición sin alumno útil
   corta antes de validar nada.
4. **`GET /me/occurrences` se registra primera.** Hono prueba las rutas en el orden en que se registran:
   con un `GET /me/:id` registrado encima, `GET /me/occurrences` le llega a ese handler con
   `id = "occurrences"` (comprobado con el Hono 4.12 instalado). Hoy no choca con nada, porque `/me/:id` solo
   existe con `PATCH` y `DELETE`. El comentario del archivo de rutas lo deja dicho, y la prueba lo cuida
   de dos formas:
   - compara en orden la lista de rutas del composition root, lo que fija el orden de hoy;
   - exige que `GET /me/occurrences` sin ventana responda `INVALID_QUERY_PARAMS`, que se volvería
     `INVALID_ROUTE_PARAMS` si mañana alguien agrega un `GET /me/:id` encima.
5. **`PATCH` entra al CORS de `src/server.ts` en esta tarea.** `PATCH /time-blocks/me/:id` es la primera
   ruta con ese verbo en el backend. La app nativa no hace preflight y no se entera, pero la build web de
   Flutter sí: sin `PATCH` en `allowMethods`, el navegador corta la edición de un bloque en el preflight,
   antes de que llegue a esta ruta (RS-BE-31). Es una línea, y la prueba la fija leyendo `src/server.ts`
   como texto, igual que la de `src/modules/index.ts`: importar `src/server.ts` registraría todos los
   módulos (Firebase incluido) y dejaría salida propia en la corrida, que la Tarea 8 exige que no haya. El
   comportamiento real, el preflight, se mira aparte en el Paso 3, antes y después del cambio.

---

- [ ] **Paso 1: Escribir la prueba que falla**

Antes de escribir nada, comprobar que las Tareas 2, 3 y 4 ya están, que están commiteadas y que los archivos de esta no existen:

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && ls src/modules/time-blocks/ && git status --short
```

Esperado, literal (`git status --short` no imprime nada, porque este chequeo va antes de crear la prueba):

```
feat/bloques-horario
time-blocks.logic.ts
time-blocks.repository.ts
time-blocks.schemas.ts
time-blocks.service.ts
time-blocks.types.ts
```

Si falta cualquiera de esos cinco archivos, la tarea que lo crea no está hecha (la 2 crea `types` y
`logic`, la 3 `repository`, la 4 `schemas` y `service`): **PARAR**. Si ya aparecen
`time-blocks.controller.ts`, `time-blocks.routes.ts` o `index.ts`, alguien adelantó esta tarea:
**PARAR**. Si `git status --short` imprime algo, es trabajo sin commitear de otra tarea: no lo mezcles
con el commit de esta y averigua de dónde viene antes de seguir.

Crear `test/HU35_jeff/time-blocks.routes.test.ts` con este contenido completo:

```ts
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-31, RS-BE-32 y RS-BE-33 vistos desde HTTP: las siete rutas de
 * /time-blocks, quién puede entrar y de dónde sale el alumno.
 *
 * La cadena es la real (routes → controller → service → repository) y solo la
 * base es falsa: contesta con filas inventadas y anota `{ sql, params }` de
 * cada consulta, para poder exigir que el `studentId` del token —y ningún
 * otro— llegue al SQL. `mock.module` va ANTES de cualquier `await import(...)`
 * porque `authMiddleware` consulta `token_version` en cada petición y el `.env`
 * del worktree apunta a producción.
 *
 * Datos INVENTADOS (el repo es público). El alumno sintético 20230001 tiene
 * `student.id` 42 en estas pruebas; el 43 es "otro alumno".
 *
 * Calendario 2026: 21-09, 28-09, 05-10, 12-10 y 19-10 son lunes; 23-09, 30-09,
 * 07-10 y 14-10, miércoles; 08-10 es jueves.
 */

type Consulta = { sql: string; params: unknown[] };

/** `student_time_block` como la devuelve Postgres tras los `::text` del
 *  repository: horas con segundos y fechas como texto. */
type FilaBloque = {
  id: number; student_id: number; title: string; color_hex: string;
  days_of_week: number[]; start_time: string; end_time: string;
  start_date: string; end_date: string;
};

type FilaExcepcion = {
  block_id: number; occurrence_date: string; status: string;
  start_time: string | null; end_time: string | null;
};

type Datos = { bloques: FilaBloque[]; excepciones: FilaExcepcion[]; total: number | null };

const ALUMNO = 42;
const OTRO_ALUMNO = 43;

/** Prácticas los lunes y miércoles de 14:00 a 18:00, del 2026-09-01 al 2026-12-15. */
const BLOQUE: FilaBloque = {
  id: 12, student_id: ALUMNO, title: "Practicas preprofesionales", color_hex: "#F94B3F",
  days_of_week: [1, 3], start_time: "14:00:00", end_time: "18:00:00",
  start_date: "2026-09-01", end_date: "2026-12-15",
};

const CANCELADO: FilaExcepcion = {
  block_id: 12, occurrence_date: "2026-10-07", status: "cancelled", start_time: null, end_time: null,
};

const MOVIDO: FilaExcepcion = {
  block_id: 12, occurrence_date: "2026-10-14", status: "moved",
  start_time: "15:00:00", end_time: "19:30:00",
};

const consultas: Consulta[] = [];
let datos: Datos = { bloques: [], excepciones: [], total: null };

const conSegundos = (hora: unknown) => (hora == null ? null : `${String(hora)}:00`);

/**
 * Base falsa. Contesta según la sentencia que arma el repository de la
 * Tarea 3 y según sus parámetros, sin guardar nada entre peticiones: los
 * `returning` se arman con lo que llegó. La tabla de excepciones se mira
 * primero porque su nombre contiene el de la tabla de bloques.
 */
const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();
  const p = params;

  if (texto.includes("token_version")) return [{ token_version: 1 }];

  if (texto.includes("student_time_block_exception")) {
    if (texto.startsWith("insert")) {
      // upsertException: select b.id, $1..$4 = (fecha, estado, inicio, fin)
      // from student_time_block b where b.id = $5 and b.student_id = $6
      const propio = datos.bloques.some((b) => b.id === p[4] && b.student_id === p[5]);
      if (!propio) return [];
      return [{
        block_id: p[4], occurrence_date: p[0], status: p[1],
        start_time: conSegundos(p[2]), end_time: conSegundos(p[3]),
      }];
    }
    if (texto.startsWith("delete")) {
      // deleteException: b.student_id = $1 and e.block_id = $2 and e.occurrence_date = $3::date
      const propio = datos.bloques.some((b) => b.id === p[1] && b.student_id === p[0]);
      return datos.excepciones
        .filter((e) => propio && e.block_id === p[1] && e.occurrence_date === p[2])
        .map((e) => ({ block_id: e.block_id }));
    }
    // findExceptions: where b.student_id = $1 and e.block_id = any($2 → int[])
    const ids = String(p[1]).split(",").map(Number);
    const propios = datos.bloques
      .filter((b) => b.student_id === p[0] && ids.includes(b.id))
      .map((b) => b.id);
    return datos.excepciones.filter((e) => propios.includes(e.block_id));
  }

  if (texto.includes("count(*)")) {
    return [{ total: datos.total ?? datos.bloques.filter((b) => b.student_id === p[0]).length }];
  }
  if (texto.startsWith("insert")) {
    // insertBlock: (student_id, title, color_hex, días JSON, inicio, fin, desde, hasta)
    return [{
      id: 31, student_id: p[0], title: p[1], color_hex: p[2],
      days_of_week: JSON.parse(String(p[3])),
      start_time: conSegundos(p[4]), end_time: conSegundos(p[5]),
      start_date: p[6], end_date: p[7],
    }];
  }
  if (texto.startsWith("update")) {
    // updateBlock: set … = $1..$7 where id = $8 and student_id = $9
    const propio = datos.bloques.find((b) => b.id === p[7] && b.student_id === p[8]);
    if (!propio) return [];
    return [{
      ...propio, title: p[0], color_hex: p[1], days_of_week: JSON.parse(String(p[2])),
      start_time: conSegundos(p[3]), end_time: conSegundos(p[4]),
      start_date: p[5], end_date: p[6],
    }];
  }
  if (texto.startsWith("delete")) {
    // deleteBlock: where id = $1 and student_id = $2
    return datos.bloques
      .filter((b) => b.id === p[0] && b.student_id === p[1])
      .map((b) => ({ id: b.id }));
  }
  if (p.length === 2) {
    // findBlockOwnedBy: where student_id = $1 and id = $2
    return datos.bloques.filter((b) => b.student_id === p[0] && b.id === p[1]);
  }
  // findBlocks: where student_id = $1
  return datos.bloques.filter((b) => b.student_id === p[0]);
};

const fakeDb = {
  execute: ejecutar,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { TimeBlocksController } = await import(
  "../../src/modules/time-blocks/time-blocks.controller.js"
);
const { TimeBlocksRepository } = await import(
  "../../src/modules/time-blocks/time-blocks.repository.js"
);
const { TimeBlocksService } = await import(
  "../../src/modules/time-blocks/time-blocks.service.js"
);
const { createTimeBlocksRoutes } = await import(
  "../../src/modules/time-blocks/time-blocks.routes.js"
);
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

// La cadena se arma a mano, sin pasar por `time-blocks/index.js`: esa instancia
// quedaría atada a la base que se evaluó primero. El composition root se prueba
// aparte, al final, con una petición que no llega a la base.
const app = new Hono();
app.onError(errorHandler);
app.route(
  "/time-blocks",
  createTimeBlocksRoutes(
    new TimeBlocksController(
      new TimeBlocksService(new TimeBlocksRepository(fakeDb as never), new EventBus()),
    ),
  ),
);

const tokenDe = (role: string, studentId = ALUMNO) =>
  jwt.sign({ sub: "1", studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = jwt.sign(
  { sub: "2", teacherId: 7, role: "teacher", tokenVersion: 1 },
  config.auth.jwtSecret,
);

const pedir = async (
  metodo: string,
  ruta: string,
  opciones: { token?: string; body?: unknown; datos?: Partial<Datos> } = {},
) => {
  consultas.length = 0;
  datos = { bloques: [BLOQUE], excepciones: [], total: null, ...(opciones.datos ?? {}) };
  const headers: Record<string, string> = {};
  if (opciones.token) headers.Authorization = `Bearer ${opciones.token}`;
  let body: string | undefined;
  if (opciones.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof opciones.body === "string" ? opciones.body : JSON.stringify(opciones.body);
  }
  return await app.request(ruta, { method: metodo, headers, body });
};

/** Las consultas de la funcionalidad: todas menos el `token_version` del middleware. */
const delModulo = () => consultas.filter((q) => !q.sql.includes("token_version"));

const BODY = {
  title: "Practicas preprofesionales",
  colorHex: "#F94B3F",
  daysOfWeek: [1, 3],
  startTime: "14:00",
  endTime: "18:00",
  startDate: "2026-09-01",
  endDate: "2026-12-15",
};

/** Las siete rutas del contrato, con un pedido válido y su status de éxito. */
const RUTAS: Array<{ metodo: string; ruta: string; body?: unknown; exito: number }> = [
  { metodo: "GET", ruta: "/time-blocks/me", exito: 200 },
  { metodo: "POST", ruta: "/time-blocks/me", body: BODY, exito: 201 },
  { metodo: "PATCH", ruta: "/time-blocks/me/12", body: BODY, exito: 200 },
  { metodo: "DELETE", ruta: "/time-blocks/me/12", exito: 200 },
  {
    metodo: "PUT", ruta: "/time-blocks/me/12/occurrences/2026-10-05",
    body: { status: "cancelled" }, exito: 200,
  },
  { metodo: "DELETE", ruta: "/time-blocks/me/12/occurrences/2026-10-05", exito: 200 },
  {
    metodo: "GET", ruta: "/time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19",
    exito: 200,
  },
];

describe("quien puede entrar a /time-blocks (RS-BE-31)", () => {
  for (const { metodo, ruta, body } of RUTAS) {
    test(`${metodo} ${ruta} sin token responde 401 MISSING_TOKEN`, async () => {
      const res = await pedir(metodo, ruta, { body });
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
      expect(consultas).toHaveLength(0);
    });

    test(`${metodo} ${ruta} con token de docente responde 403 FORBIDDEN`, async () => {
      const res = await pedir(metodo, ruta, { token: tokenDocente, body });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect(delModulo()).toHaveLength(0);
    });

    test(`${metodo} ${ruta} con un studentId 0 responde 403 y no consulta nada`, async () => {
      // `authMiddleware` acepta un 0 (es entero): la guarda del controller lo corta.
      const res = await pedir(metodo, ruta, { token: tokenDe("student", 0), body });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      expect(delModulo()).toHaveLength(0);
    });
  }

  test("un rol que no es de alumno responde 403 aunque el token traiga studentId", async () => {
    // Sin `requireRole`, la guarda del controller lo dejaría pasar: el studentId
    // es válido. Este es el caso que prueba que se mira el rol y no solo el id.
    for (const { metodo, ruta, body } of RUTAS) {
      const res = await pedir(metodo, ruta, { token: tokenDe("admin"), body });
      expect(`${metodo} ${ruta} → ${res.status}`).toBe(`${metodo} ${ruta} → 403`);
      expect(delModulo()).toHaveLength(0);
    }
  });

  test("student, delegate y subdelegate usan las siete rutas", async () => {
    for (const rol of ["student", "delegate", "subdelegate"]) {
      for (const { metodo, ruta, body, exito } of RUTAS) {
        const res = await pedir(metodo, ruta, { token: tokenDe(rol), body });
        expect(`${rol} ${metodo} ${ruta} → ${res.status}`).toBe(`${rol} ${metodo} ${ruta} → ${exito}`);
      }
    }
  });
});

describe("el alumno sale solo del token (RS-BE-31)", () => {
  test("GET /me?studentId=99 lee los bloques del alumno del token", async () => {
    const res = await pedir("GET", "/time-blocks/me?studentId=99", { token: tokenDe("student") });
    expect(res.status).toBe(200);
    const q = delModulo();
    expect(q).toHaveLength(2);
    for (const { sql, params } of q) {
      expect(params[0]).toBe(ALUMNO);
      expect(params).not.toContain(99);
      expect(params).not.toContain("99");
      // El id viaja como parámetro, nunca concatenado en el texto del SQL.
      expect(sql).not.toContain("99");
      expect(sql).not.toContain("42");
    }
  });

  test("un studentId en el body del POST se ignora", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"),
      body: { ...BODY, studentId: 99, student_id: 99 },
    });
    expect(res.status).toBe(201);
    const insert = delModulo().find((q) => q.sql.includes("insert into student_time_block"));
    expect(insert?.params[0]).toBe(ALUMNO);
    for (const { params } of delModulo()) {
      expect(params).not.toContain(99);
      expect(params).not.toContain("99");
    }
  });

  test("GET /me/occurrences?studentId=99 expande los bloques del alumno del token", async () => {
    const res = await pedir(
      "GET", "/time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19&studentId=99",
      { token: tokenDe("student") },
    );
    expect(res.status).toBe(200);
    for (const { params } of delModulo()) {
      expect(params[0]).toBe(ALUMNO);
      expect(params).not.toContain(99);
      expect(params).not.toContain("99");
    }
  });

  test("no hay ruta con un alumno en el path ni un GET de un bloque suelto", async () => {
    for (const ruta of ["/time-blocks/99", "/time-blocks/99/me", "/time-blocks/me/12"]) {
      const res = await pedir("GET", ruta, { token: tokenDe("student") });
      expect(res.status).toBe(404);
      expect(delModulo()).toHaveLength(0);
    }
  });
});

describe("contrato de las siete rutas", () => {
  test("GET /me devuelve los bloques con sus excepciones", async () => {
    const res = await pedir("GET", "/time-blocks/me", {
      token: tokenDe("student"),
      datos: { excepciones: [CANCELADO, MOVIDO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      blocks: [{
        id: 12,
        title: "Practicas preprofesionales",
        colorHex: "#F94B3F",
        daysOfWeek: [1, 3],
        startTime: "14:00",
        endTime: "18:00",
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        exceptions: [
          { date: "2026-10-07", status: "cancelled", startTime: null, endTime: null },
          { date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:30" },
        ],
      }],
    });
  });

  test("GET /me sin bloques devuelve la lista vacia", async () => {
    const res = await pedir("GET", "/time-blocks/me", {
      token: tokenDe("student"),
      datos: { bloques: [] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ blocks: [] });
  });

  test("POST /me crea el bloque y responde 201 sin excepciones", async () => {
    const res = await pedir("POST", "/time-blocks/me", { token: tokenDe("student"), body: BODY });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ block: { id: 31, ...BODY, exceptions: [] } });
  });

  test("PATCH /me/:id reemplaza la regla y conserva las excepciones", async () => {
    const res = await pedir("PATCH", "/time-blocks/me/12", {
      token: tokenDe("student"),
      body: { ...BODY, startTime: "15:00", endTime: "19:00" },
      datos: { excepciones: [CANCELADO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      block: {
        id: 12, ...BODY, startTime: "15:00", endTime: "19:00",
        exceptions: [{ date: "2026-10-07", status: "cancelled", startTime: null, endTime: null }],
      },
    });
    for (const { sql } of delModulo()) expect(sql.toLowerCase()).not.toContain("delete");
  });

  test("DELETE /me/:id responde { ok: true } y borra acotado por el alumno", async () => {
    const res = await pedir("DELETE", "/time-blocks/me/12", { token: tokenDe("student") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const borrado = delModulo().find((q) => q.sql.includes("delete from student_time_block"));
    expect(borrado?.params).toEqual([12, ALUMNO]);
  });

  test("PUT de una ocurrencia cancelada responde la excepcion, sin blockId", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-07", {
      token: tokenDe("student"),
      body: { status: "cancelled" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      exception: { date: "2026-10-07", status: "cancelled", startTime: null, endTime: null },
    });
  });

  test("PUT de una ocurrencia movida responde las horas nuevas", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-14", {
      token: tokenDe("student"),
      body: { status: "moved", startTime: "15:00", endTime: "19:00" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      exception: { date: "2026-10-14", status: "moved", startTime: "15:00", endTime: "19:00" },
    });
  });

  test("repetir el mismo PUT deja el mismo estado (RS-BE-32)", async () => {
    const pedido = {
      token: tokenDe("student"),
      body: { status: "moved", startTime: "15:00", endTime: "19:00" },
    };
    const primero = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-14", pedido);
    const cuerpo1 = await primero.json();
    const sql1 = delModulo();
    const segundo = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-14", pedido);
    expect(await segundo.json()).toEqual(cuerpo1);
    expect(delModulo()).toEqual(sql1);
  });

  test("DELETE de una ocurrencia responde { ok: true }", async () => {
    const res = await pedir("DELETE", "/time-blocks/me/12/occurrences/2026-10-07", {
      token: tokenDe("student"),
      datos: { excepciones: [CANCELADO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("GET /me/occurrences devuelve las ocurrencias y las horas por semana", async () => {
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-09-21&to=2026-10-19", {
      token: tokenDe("student"),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      occurrences: Array<{ date: string } & Record<string, unknown>>;
      weeks: Array<{ weekStart: string; hours: number }>;
    };
    expect(dto.occurrences[0]).toEqual({
      blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
      date: "2026-09-21", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false,
    });
    expect(dto.occurrences.map((o) => o.date)).toEqual([
      "2026-09-21", "2026-09-23", "2026-09-28", "2026-09-30", "2026-10-05",
      "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19",
    ]);
    // La ventana termina el lunes 19-10, pero su semana suma entera: lunes 19
    // y miercoles 21 (RS-BE-34, "el de la semana entera").
    expect(dto.weeks).toEqual([
      { weekStart: "2026-09-21", hours: 8 },
      { weekStart: "2026-09-28", hours: 8 },
      { weekStart: "2026-10-05", hours: 8 },
      { weekStart: "2026-10-12", hours: 8 },
      { weekStart: "2026-10-19", hours: 8 },
    ]);
  });

  test("GET /me/occurrences aplica el dia cancelado y el movido", async () => {
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-10-05&to=2026-10-18", {
      token: tokenDe("student"),
      datos: { excepciones: [CANCELADO, MOVIDO] },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      occurrences: [
        {
          blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
          date: "2026-10-05", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false,
        },
        {
          blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
          date: "2026-10-12", dayOfWeek: 1, startTime: "14:00", endTime: "18:00", moved: false,
        },
        {
          blockId: 12, title: "Practicas preprofesionales", colorHex: "#F94B3F",
          date: "2026-10-14", dayOfWeek: 3, startTime: "15:00", endTime: "19:30", moved: true,
        },
      ],
      weeks: [
        { weekStart: "2026-10-05", hours: 4 },
        { weekStart: "2026-10-12", hours: 8.5 },
      ],
    });
  });
});

describe("errores de validacion", () => {
  test("un color invalido responde 400 INVALID_REQUEST_BODY sin consultar", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: { ...BODY, colorHex: "azul" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST_BODY" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("la fecha de fin antes de la de inicio responde 400 con el campo culpable", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: { ...BODY, startDate: "2026-12-15", endDate: "2026-09-01" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: "INVALID_REQUEST_BODY",
        details: { fieldErrors: { endDate: ["La fecha de fin no puede ser anterior a la de inicio."] } },
      },
    });
  });

  test("un body que no es JSON responde 400 INVALID_JSON_BODY", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: "esto no es json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_JSON_BODY" } });
  });

  test("un PATCH sin titulo responde 400 INVALID_REQUEST_BODY sin consultar", async () => {
    const { title: _sinTitulo, ...sinTitulo } = BODY;
    const res = await pedir("PATCH", "/time-blocks/me/12", {
      token: tokenDe("student"), body: sinTitulo,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST_BODY" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("un id de bloque que no es entero positivo o no cabe en integer responde 400 INVALID_ROUTE_PARAMS", async () => {
    // 3000000000 pasa `.positive()`, pero contra la columna integer Postgres
    // responderia 22003 y el errorHandler lo volveria un 500.
    for (const id of ["abc", "0", "-3", "3000000000"]) {
      const res = await pedir("PATCH", `/time-blocks/me/${id}`, {
        token: tokenDe("student"), body: BODY,
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "INVALID_ROUTE_PARAMS" } });
    }
    expect(delModulo()).toHaveLength(0);
  });

  test("una fecha de ocurrencia mal escrita responde 400 INVALID_ROUTE_PARAMS", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/05-10-2026", {
      token: tokenDe("student"), body: { status: "cancelled" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_ROUTE_PARAMS" } });
  });

  test("un moved sin horas responde 400 INVALID_REQUEST_BODY", async () => {
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-05", {
      token: tokenDe("student"), body: { status: "moved" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_REQUEST_BODY" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("GET /me/occurrences sin ventana responde 400 INVALID_QUERY_PARAMS", async () => {
    // Además fija el orden de las rutas: si un `GET /me/:id` la capturara, esto
    // sería INVALID_ROUTE_PARAMS o un 404.
    for (const ruta of [
      "/time-blocks/me/occurrences",
      "/time-blocks/me/occurrences?from=2026-09-21",
    ]) {
      const res = await pedir("GET", ruta, { token: tokenDe("student") });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: { code: "INVALID_QUERY_PARAMS" } });
    }
  });
});

describe("errores de las reglas (RS-BE-31, RS-BE-32 y RS-BE-33)", () => {
  test("una ventana de 200 dias responde 400 TIME_BLOCK_WINDOW_TOO_WIDE sin consultar", async () => {
    // Del 2026-09-01 al 2027-03-19 son 200 días contando los dos extremos.
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-09-01&to=2027-03-19", {
      token: tokenDe("student"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "TIME_BLOCK_WINDOW_TOO_WIDE" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("una ventana al reves responde 400 INVALID_QUERY_PARAMS, no TIME_BLOCK_WINDOW_TOO_WIDE", async () => {
    // La spec reserva TIME_BLOCK_WINDOW_TOO_WIDE para los 120 dias: una
    // ventana al reves es una query mal armada.
    const res = await pedir("GET", "/time-blocks/me/occurrences?from=2026-10-19&to=2026-09-21", {
      token: tokenDe("student"),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_QUERY_PARAMS" } });
  });

  test("un bloque fuera de 07:00-22:00 responde 400 TIME_BLOCK_OUT_OF_GRID sin consultar", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: { ...BODY, startTime: "06:00", endTime: "09:00" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "TIME_BLOCK_OUT_OF_GRID" } });
    expect(delModulo()).toHaveLength(0);
  });

  test("con 20 bloques el POST responde 400 TIME_BLOCK_LIMIT_REACHED y no inserta", async () => {
    const res = await pedir("POST", "/time-blocks/me", {
      token: tokenDe("student"), body: BODY, datos: { total: 20 },
    });
    expect(res.status).toBe(400);
    // RS-BE-31: el mensaje dice que cuentan los guardados, vencidos incluidos, y
    // sugiere borrar uno viejo. Va dentro del mismo toMatchObject: no suma aserciones.
    expect(await res.json()).toMatchObject({
      error: {
        code: "TIME_BLOCK_LIMIT_REACHED",
        message:
          "Llegaste al máximo de 20 bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro.",
      },
    });
    expect(delModulo().some((q) => q.sql.includes("insert"))).toBe(false);
  });

  test("una fecha fuera del patron responde 400 TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN", async () => {
    // 2026-10-08 es jueves y el bloque es lunes y miércoles.
    const res = await pedir("PUT", "/time-blocks/me/12/occurrences/2026-10-08", {
      token: tokenDe("student"), body: { status: "cancelled" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN" },
    });
    expect(delModulo().some((q) => q.sql.includes("insert"))).toBe(false);
  });

  const ESCRITURAS = RUTAS.filter((r) => r.ruta.startsWith("/time-blocks/me/12"));

  for (const { metodo, ruta, body } of ESCRITURAS) {
    test(`${metodo} ${ruta} sobre el bloque de otro alumno responde 404 TIME_BLOCK_NOT_FOUND`, async () => {
      const res = await pedir(metodo, ruta, { token: tokenDe("student", OTRO_ALUMNO), body });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ error: { code: "TIME_BLOCK_NOT_FOUND" } });
      // Cada consulta va con el alumno del token, nunca con el dueño del bloque.
      for (const { params } of delModulo()) {
        expect(params).toContain(OTRO_ALUMNO);
        expect(params).not.toContain(ALUMNO);
      }
      expect(delModulo().some((q) => q.sql.includes("student_time_block_exception"))).toBe(false);
    });
  }

  test("el 404 de un bloque ajeno es identico al de un bloque que no existe", async () => {
    // 404 y no 403: la respuesta no revela que el bloque 12 existe.
    const ajeno = await pedir("DELETE", "/time-blocks/me/12", {
      token: tokenDe("student", OTRO_ALUMNO),
    });
    const inexistente = await pedir("DELETE", "/time-blocks/me/999", { token: tokenDe("student") });
    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await ajeno.json()).toEqual(await inexistente.json());
  });
});

describe("modulo y registro", () => {
  test("el composition root expone las siete rutas detras de la autenticacion", async () => {
    const { timeBlocksRoutes } = await import("../../src/modules/time-blocks/index.js");
    const rutas = timeBlocksRoutes.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => `${r.method} ${r.path}`);
    expect(rutas).toEqual([
      "GET /me/occurrences",
      "GET /me",
      "POST /me",
      "PATCH /me/:id",
      "DELETE /me/:id",
      "PUT /me/:id/occurrences/:date",
      "DELETE /me/:id/occurrences/:date",
    ]);
    // Montado como lo monta `src/modules/index.ts`. Sin token corta el
    // middleware y no llega a la base, así que esto no depende de con qué base
    // se evaluó el módulo.
    const raiz = new Hono();
    raiz.onError(errorHandler);
    raiz.route("/time-blocks", timeBlocksRoutes);
    const res = await raiz.request("/time-blocks/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
  });

  test("src/modules/index.ts monta el modulo en /time-blocks", async () => {
    const texto = await Bun.file("src/modules/index.ts").text();
    expect(texto).toContain('import { timeBlocksRoutes } from "./time-blocks/index.js";');
    expect(texto).toContain('app.route("/time-blocks", timeBlocksRoutes);');
  });

  test("src/server.ts deja pasar PATCH en el preflight del CORS", async () => {
    // PATCH /time-blocks/me/:id es la primera ruta PATCH del backend (RS-BE-31).
    // La app nativa no hace preflight, pero la build web si: sin el verbo en
    // allowMethods, el navegador corta la edicion de un bloque antes de llegar
    // a la ruta. Se lee el archivo en vez de importar src/server.ts, que
    // registraria todos los modulos (Firebase incluido) y dejaria salida propia.
    const texto = await Bun.file("src/server.ts").text();
    expect(texto).toContain('allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],');
  });
});
```

No cambies estos datos: casi todas las aserciones dependen de ellos. El calendario 2026 está comprobado:
- El 2026-09-01 es martes.
- Son lunes: 21-09, 28-09, 05-10, 12-10 y 19-10.
- Son miércoles: 23-09, 30-09, 07-10 y 14-10.
- El 2026-10-08 es **jueves**. Por eso es la fecha que el patrón no genera.
- Del 2026-09-01 al 2027-03-19 hay exactamente 200 días, contando los dos extremos (el tope es 120).

`"admin"` no es un rol del sistema (`AGENTS.md:50`). Se usa a propósito: no es docente ni alumno, y es
el único caso en que la guarda del controller dejaría pasar el pedido y solo `requireRole` lo corta.

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/time-blocks.routes.test.ts
```

Esperado: FAIL al cargar el archivo, antes de correr ninguna prueba, con exit 1. Salida medida con
bun 1.4.2 (el tiempo del final cambia de una corrida a otra):

```
bun test v1.4.2 (744846f84)

test/HU35_jeff/time-blocks.routes.test.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/modules/time-blocks/time-blocks.controller.js' from '$REPO/test/HU35_jeff/time-blocks.routes.test.ts'
-------------------------------


 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [110.00ms]
```

Es la razón correcta: el controller es el primer import de valores después del `mock.module`, y todavía
no existe. Tampoco existen las rutas ni el composition root.

El prefijo `DATABASE_URL=postgres://user:pass@localhost:5432/test` va en **todas** las corridas, porque el
`.env` del worktree apunta a la base de PRODUCCIÓN y bun lo carga solo. Esta prueba no abre ninguna
conexión: la base es un objeto que contesta en memoria, y `mock.module` la pone en lugar de
`src/db/index.js` antes de cargar `authMiddleware`. Aun así, el prefijo va igual. El `preload` de
`bunfig.toml` (`test/env.setup.ts`) solo rellena lo ausente con `||=`, así que **no** protege de la base
de producción.

- [ ] **Paso 3: Implementación mínima**

Primero, crear `src/modules/time-blocks/time-blocks.controller.ts` con este contenido completo:

```ts
import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  validateJson, validateParams, validateQuery,
} from "../../shared/middleware/validate-dto.js";
import {
  blockIdParamSchema,
  exceptionBodySchema,
  occurrenceParamsSchema,
  timeBlockBodySchema,
  windowQuerySchema,
} from "./time-blocks.schemas.js";
import type { TimeBlocksService } from "./time-blocks.service.js";

/**
 * Adapta HTTP a las reglas de los bloques propios (RS-BE-31, RS-BE-32 y
 * RS-BE-33). No decide nada: valida con Zod, saca al alumno del token y le
 * pasa todo al service.
 *
 * El alumno sale SOLO del token. Ningún handler lee un alumno del path, de la
 * query ni del body: los `:id` de la ruta son ids de BLOQUE, y el service
 * comprueba que el bloque sea del alumno del token (404 si no lo es).
 *
 * Orden en cada handler: alumno → params → body o query → service. Una
 * petición sin alumno útil corta antes de validar nada.
 */
export class TimeBlocksController {
  constructor(readonly service: TimeBlocksService) {}

  /**
   * Misma guarda que `academic-record.controller.ts:15-21`: `authMiddleware`
   * acepta un `studentId` 0 (es entero), así que esta guarda sí se alcanza y
   * corta antes de consultar nada, con el código y el texto de `requireRole`.
   */
  private requireStudentId(c: Context): number {
    const studentId = c.get("studentId");
    if (!studentId) {
      throw new HttpError(403, "No tiene permisos para acceder a este recurso.", "FORBIDDEN");
    }
    return Number(studentId);
  }

  async listBlocks(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    return c.json(await this.service.listBlocks(studentId));
  }

  async createBlock(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const body = await validateJson(c, timeBlockBodySchema);
    return c.json(await this.service.createBlock(studentId, body), 201);
  }

  async updateBlock(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id } = validateParams(c, blockIdParamSchema);
    const body = await validateJson(c, timeBlockBodySchema);
    return c.json(await this.service.updateBlock(studentId, id, body));
  }

  async deleteBlock(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id } = validateParams(c, blockIdParamSchema);
    return c.json(await this.service.deleteBlock(studentId, id));
  }

  async setException(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id, date } = validateParams(c, occurrenceParamsSchema);
    const body = await validateJson(c, exceptionBodySchema);
    return c.json(await this.service.setException(studentId, id, date, body));
  }

  async clearException(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { id, date } = validateParams(c, occurrenceParamsSchema);
    return c.json(await this.service.clearException(studentId, id, date));
  }

  async getOccurrences(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const { from, to } = validateQuery(c, windowQuerySchema);
    return c.json(await this.service.occurrences(studentId, from, to));
  }
}
```

Segundo, crear `src/modules/time-blocks/time-blocks.routes.ts` con este contenido completo:

```ts
import { Hono } from "hono";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import type { TimeBlocksController } from "./time-blocks.controller.js";

/**
 * Bloques de horario propios del alumno (RS-BE-31, RS-BE-32 y RS-BE-33).
 *
 * Solo alumnos: `requireRole(...STUDENT_ROLES)` deja fuera a los docentes, y el
 * `studentId` sale del token, así que no hay forma de nombrar a otro alumno.
 * Los `:id` de estas rutas son ids de BLOQUE, nunca de alumno.
 *
 * ORDEN: Hono prueba las rutas en el orden en que se registran.
 * `GET /me/occurrences` va primera a propósito. Hoy no choca con nada, porque
 * `/me/:id` solo existe con PATCH y DELETE; pero si algún día se agrega un
 * `GET /me/:id`, tiene que ir DEBAJO de esta línea: encima, Hono le pasaría
 * "occurrences" como id y la ventana respondería 400 INVALID_ROUTE_PARAMS.
 */
export const createTimeBlocksRoutes = (controller: TimeBlocksController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/me/occurrences", (c) => controller.getOccurrences(c));
  app.get("/me", (c) => controller.listBlocks(c));
  app.post("/me", (c) => controller.createBlock(c));
  app.patch("/me/:id", (c) => controller.updateBlock(c));
  app.delete("/me/:id", (c) => controller.deleteBlock(c));
  app.put("/me/:id/occurrences/:date", (c) => controller.setException(c));
  app.delete("/me/:id/occurrences/:date", (c) => controller.clearException(c));

  return app;
};
```

Tercero, crear `src/modules/time-blocks/index.ts` con este contenido completo:

```ts
import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { TimeBlocksController } from "./time-blocks.controller.js";
import { TimeBlocksRepository } from "./time-blocks.repository.js";
import { createTimeBlocksRoutes } from "./time-blocks.routes.js";
import { TimeBlocksService } from "./time-blocks.service.js";

const timeBlocksRepository = new TimeBlocksRepository(db);
const timeBlocksService = new TimeBlocksService(timeBlocksRepository, eventBus);
const timeBlocksController = new TimeBlocksController(timeBlocksService);

export const timeBlocksRoutes = createTimeBlocksRoutes(timeBlocksController);

export { TimeBlocksController } from "./time-blocks.controller.js";
export { TimeBlocksRepository } from "./time-blocks.repository.js";
export { TimeBlocksService } from "./time-blocks.service.js";
export { createTimeBlocksRoutes } from "./time-blocks.routes.js";
export type { TimeBlockWithExceptions } from "./time-blocks.service.js";
export type {
  TimeBlockException, TimeBlockInput, TimeBlockOccurrence, TimeBlockRule, TimeBlockWeekHours,
} from "./time-blocks.types.js";
```

Cuarto, registrar el módulo en `src/modules/index.ts`. Reemplazar esto (línea 18):

```ts
import { academicRecordRoutes } from "./academic-record/index.js";
```

por esto:

```ts
import { academicRecordRoutes } from "./academic-record/index.js";
import { timeBlocksRoutes } from "./time-blocks/index.js";
```

Y reemplazar esto (líneas 37-38, el final de `registerModules`):

```ts
  app.route("/academic-record", academicRecordRoutes);
};
```

por esto:

```ts
  app.route("/academic-record", academicRecordRoutes);
  app.route("/time-blocks", timeBlocksRoutes);
};
```

Las dos anclas aparecen una sola vez en el archivo. No toques el resto de los `import` ni de los `app.route`.

Quinto, el CORS de `src/server.ts` (RS-BE-31). Antes de tocarlo, ver el preflight que manda un navegador
para editar un bloque, tal como responde hoy:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN -e '
const { default: app } = await import("./src/server.ts");
const res = await app.request("/time-blocks/me/12", { method: "OPTIONS", headers: { Origin: "http://localhost:8080", "Access-Control-Request-Method": "PATCH" } });
console.log(`preflight ${res.status} ${res.headers.get("access-control-allow-methods")}`);
' 2>&1 | grep '^preflight'
```

Esperado, literal:

```
preflight 204 GET,POST,PUT,DELETE,OPTIONS
```

El navegador compara el método que va a mandar con esa lista y, como `PATCH` no está, no manda la
petición. El comando importa `src/server.ts`, que registra todos los módulos: puede imprimir avisos de
Firebase, y por eso se filtra la línea `preflight`. No llega a ninguna ruta ni a la base (el CORS contesta
el `OPTIONS` antes), y el prefijo `DATABASE_URL=…` va igual que en las pruebas.

Reemplazar esto (línea 20 de `src/server.ts`):

```ts
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
```

por esto:

```ts
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
```

Y volver a correr el mismo comando. Esperado, literal:

```
preflight 204 GET,POST,PUT,PATCH,DELETE,OPTIONS
```

No toques nada más de `src/server.ts`: ni `origin`, ni `allowHeaders`, ni la lista de `modules` de `GET /`.

Tres detalles que parecen de estilo pero importan:

- **`createBlock` responde 201 y todo lo demás 200.** Es lo que fija el contrato (`POST … 201 → { "block": … }`).
- **El controller usa el `Context` sin tipar**, como `academic-record.controller.ts`. `c.get("studentId")`
  compila igual, y el tipo fino (`AuthVariables`) va en el `Hono<{ Variables: AuthVariables }>` de las rutas.
- **`index.ts` instancia con el `db` real, y la prueba no lo usa para las peticiones que tocan la base.**
  La prueba arma la cadena a mano con la base falsa, igual que `test/HU34_jeff/academic-record.routes.test.ts:58-69`.
  Al composition root solo le pide dos cosas:
  - la lista de rutas;
  - un pedido sin token, que corta en el middleware antes de tocar ninguna base.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/time-blocks.routes.test.ts
```

Esperado: PASS, con `59 pass`, `0 fail`, `227 expect() calls` y `Ran 59 tests across 1 file`. La versión
anterior se midió con bun en una copia aislada del worktree (sin `.env`) con las Tareas 1 a 4 aplicadas
(58 y 224, y pasaba igual con `TZ=America/Lima`, `TZ=UTC` y `TZ=Asia/Tokyo`). Después de la revisión, la
de ahora se corrió sobre esa misma copia en un arnés en memoria que reemplaza los ocho archivos del módulo
por los de este plan y `src/db/index.ts` por la base falsa, calibrado contra aquella medición (ver "Cifras
de las pruebas"). Las dos aserciones de más son las del id `3000000000`. La prueba del CORS (una prueba,
una aserción, sin bucles) se sumó a mano a esa medición: son las `59` y `227` de ahora. El `message` de
`TIME_BLOCK_LIMIT_REACHED` va dentro del `toMatchObject` que ya estaba y no suma aserciones.

Si en vez de eso falla, esto significa cada fallo:

- `student, delegate y subdelegate usan las siete rutas` falla con un `→ 500`: la base falsa no reconoce
  una sentencia, porque el SQL de la Tarea 3 no es el que figura en **Interfaces**. Comparar con
  `src/modules/time-blocks/time-blocks.repository.ts`. No cambiar la prueba para taparlo.
- Esa misma prueba falla con un `→ 404`: una ruta quedó mal escrita en `time-blocks.routes.ts`.
- Falla `el alumno sale solo del token`: algún handler lee el alumno de otro lugar que no es `c.get("studentId")`.
- Falla `con un studentId 0 responde 403`: falta la guarda `requireStudentId` en algún handler.
- Falla `el composition root expone las siete rutas…` solo por el orden: las rutas no se registraron en
  el orden del Paso 3 (`GET /me/occurrences` primero).
- Falla `src/server.ts deja pasar PATCH en el preflight del CORS`: falta el quinto cambio del Paso 3, o la
  lista quedó en otro orden. Va tal cual está arriba, con `PATCH` entre `PUT` y `DELETE`.
- Falla `con 20 bloques el POST responde 400 TIME_BLOCK_LIMIT_REACHED…` solo por el `message`: el texto
  de `time-blocks.service.ts` no es el de la Tarea 4, letra por letra.

- [ ] **Paso 5: Comprobar que `requireRole` muerde de verdad**

La guarda del controller le responde a un docente el mismo 403 `FORBIDDEN` que `requireRole` (un token
de docente no trae `studentId`). Por eso las pruebas del docente pasarían aunque faltara `requireRole`. La
prueba que distingue los dos casos es `un rol que no es de alumno responde 403 aunque el token traiga
studentId`. Comprobar que falla sin la línea. Este comando la comenta, corre la prueba, la **devuelve
siempre** (aunque la corrida falle) y compara el archivo con su huella de antes:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && F=src/modules/time-blocks/time-blocks.routes.ts && ANTES=$(shasum -a 256 "$F") && sed -i '' 's#^  app.use("\*", requireRole(...STUDENT_ROLES));#  // app.use("*", requireRole(...STUDENT_ROLES));#' "$F" && grep -n '// app.use("\*", requireRole' "$F" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/time-blocks.routes.test.ts 2>&1 | grep -E "^\(fail\)|^ [0-9]+ (pass|fail)"; sed -i '' 's#^  // app.use("\*", requireRole(...STUDENT_ROLES));#  app.use("*", requireRole(...STUDENT_ROLES));#' "$F"; [ "$(shasum -a 256 "$F")" = "$ANTES" ] && echo "time-blocks.routes.ts quedó igual que antes"
```

Esperado: la línea comentada, exactamente una prueba en rojo y la confirmación de que el archivo volvió
a ser el mismo. bun agrega el tiempo entre corchetes al final de la línea `(fail)`.

```
24:  // app.use("*", requireRole(...STUDENT_ROLES));
(fail) quien puede entrar a /time-blocks (RS-BE-31) > un rol que no es de alumno responde 403 aunque el token traiga studentId [4.60ms]
 58 pass
 1 fail
time-blocks.routes.ts quedó igual que antes
```

Si no aparece la línea `24:` o no aparece la última línea, **PARAR**: el archivo no es el del Paso 3 o no
quedó como estaba. No sigas hasta que `grep -n 'app.use("\*", requireRole' src/modules/time-blocks/time-blocks.routes.ts`
imprima `24:  app.use("*", requireRole(...STUDENT_ROLES));`.

Comprobar que, con la línea de vuelta, todo está verde:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && grep -n 'app.use("\*", requireRole' src/modules/time-blocks/time-blocks.routes.ts && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/time-blocks.routes.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)"
```

Esperado:

```
24:  app.use("*", requireRole(...STUDENT_ROLES));
 59 pass
 0 fail
```

No correr el build con la línea comentada: `requireRole` quedaría importado sin uso y `tsc` lo marcaría
como `TS6133`.

- [ ] **Paso 6: Build**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: la línea `$ tsc` sola, sin ningún error, y exit 0. `tsc` solo compila `src/` (`tsconfig.json`,
`"include": ["src/**/*"]`), con `strict`, `noUnusedLocals`, `noUnusedParameters` y `noImplicitReturns`.
Así se comprueban los tres archivos nuevos, el registro y `src/server.ts`. En particular, se comprueba:

- que `validateJson(c, timeBlockBodySchema)` acepte el esquema con `.refine`, que es `ZodEffects`,
  siendo el parámetro `ZodSchema<T>`;
- que el body validado entre como `TimeBlockInput` en el service, y el de la excepción como `ExceptionInput`.

El build deja `dist/`, que está en `.gitignore:5`.

- [ ] **Paso 7: Correr la carpeta HU35 y la suite completa**

Esta es la primera tarea que conecta el módulo a la app: `src/modules/index.ts` lo carga todo el
servidor (`src/server.ts:5`). Por eso, además de la carpeta de la funcionalidad, se corre todo:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff 2>&1 | tail -n 4
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test 2>&1 | tail -n 4
```

Esperado (la versión anterior se midió en la copia aislada con las Tareas 1 a 5 aplicadas; estas cifras
son esa medición más lo que cambió la revisión en cada archivo, ver "Cifras de las pruebas"):

- `test/HU35_jeff`: `192 pass`, `0 fail`, `598 expect() calls`, `Ran 192 tests across 5 files`. Son las
  pruebas de las Tareas 1 a 4 (19 + 24 + 30 + 60, con 72 + 60 + 105 + 134 aserciones) más las 59 y 227 de esta.
- Suite completa: `1678 pass`, `0 fail`, `5827 expect() calls`, `Ran 1678 tests across 113 files`. Es la
  línea base que deja la Tarea 1 (`1505 pass, 5301 expect(), 109 archivos`) más las Tareas 2 a 5.

El `tail -n 4` deja solo el resumen. Si `fail` no da 0, repetir el mismo comando sin `| tail -n 4` para ver
qué pruebas fallaron.

La suite imprime ruido en stderr: `error: fallo de BD` desde `test/HU02_jeff/logout.unit.test.ts` y avisos
de `[portal-sync]`. Son pruebas que ejercitan el camino de error a propósito. Lo que cuenta es el resumen.

- Si hay `0 fail` pero los totales no cuadran, anotar la diferencia y compararla con los números de cada
  tarea antes de seguir.
- Si hay algún `fail` fuera de `test/HU35_jeff`, **PARAR**. Ninguna prueba vieja importa
  `src/modules/index.ts` ni `src/server.ts`, así que esta tarea no explica ese rojo, y hay que entenderlo
  antes de commitear.

- [ ] **Paso 8: Dejar anotado el aviso de textos para el dueño (sin tocar el service ni los esquemas)**

Los textos que verá el alumno: la spec fija solo qué dice uno, el de `TIME_BLOCK_LIMIT_REACHED` (RS-BE-31:
que el tope cuenta los bloques guardados, vencidos incluidos, y que sugiera borrar uno viejo), y la app
muestra tal cual el mensaje que manda el servidor (`ULima_Frontend_IS2/specs/features/time-blocks/time-blocks.spec.md`,
RF-BLQ-2: "el mensaje que se muestra ante un error del servidor es el que él manda"). La letra exacta de
todos los escribió este plan en la Tarea 4 y necesita el visto bueno del dueño.

El ejecutor **no** los cambia: son de la Tarea 4 y los decide el dueño. Copiar este aviso, tal cual, en el
reporte final de la tarea:

> **Aviso para el dueño (textos que ve el alumno):** la app muestra el mensaje que manda el servidor, y la
> spec solo fija de qué habla el de `TIME_BLOCK_LIMIT_REACHED`. Estos los escribió el plan y esperan tu
> visto bueno antes del merge:
> - `message` de cada código de la spec (`time-blocks.service.ts`):
>   - `TIME_BLOCK_LIMIT_REACHED`: "Llegaste al máximo de 20 bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro."
>   - `TIME_BLOCK_NOT_FOUND`: "No existe ese bloque."
>   - `TIME_BLOCK_OUT_OF_GRID`: "El bloque tiene que empezar y terminar entre las 07:00 y las 22:00."
>   - `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`: "Ese día no forma parte del bloque."
>   - `TIME_BLOCK_WINDOW_TOO_WIDE`: "La ventana no puede pasar de 120 días."
> - En `details.fieldErrors` de los 400 de validación (`time-blocks.schemas.ts`; el `message` de esos 400
>   es el que ya usa todo el backend, en inglés, de `validate-dto.ts`): "Fecha inválida (YYYY-MM-DD).",
>   "Color inválido.", "Hora de inicio inválida (HH:MM).", "Hora de fin inválida (HH:MM).", "La hora de fin
>   tiene que ser mayor que la de inicio.", "La fecha de fin no puede ser anterior a la de inicio.", "Los
>   días de la semana no se pueden repetir." y "La ventana no puede terminar antes de empezar."
>
> Si cambias alguno, se cambia en esos dos archivos y en las pruebas que lo citan
> (`test/HU35_jeff/time-blocks.service.test.ts` y `time-blocks.routes.test.ts`, que compara el de
> `TIME_BLOCK_LIMIT_REACHED` letra por letra), y en la lista de mensajes de `docs/specs/api-contracts.md`.

El CORS ya no es un aviso: el quinto cambio del Paso 3 lo resolvió, y la prueba del Paso 1 lo fija.

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}" && git add src/modules/time-blocks/time-blocks.controller.ts src/modules/time-blocks/time-blocks.routes.ts src/modules/time-blocks/index.ts src/modules/index.ts src/server.ts test/HU35_jeff/time-blocks.routes.test.ts && git commit -m "feat(time-blocks): controller, siete rutas, registro del modulo y PATCH en el CORS (RS-BE-31, RS-BE-32, RS-BE-33)" && git show --name-only --format= HEAD && git status --short
```

Esperado: el commit lleva exactamente estos seis archivos, y `git status --short` no imprime ninguna
línea después (`dist/` está en `.gitignore`):

```
src/modules/index.ts
src/modules/time-blocks/index.ts
src/modules/time-blocks/time-blocks.controller.ts
src/modules/time-blocks/time-blocks.routes.ts
src/server.ts
test/HU35_jeff/time-blocks.routes.test.ts
```

Sin trailer Co-Authored-By, sin push y sin PR. El autor ya está configurado en git.
### Tarea 6: El chatbot no ve los bloques, y la documentación

**Archivos:**
- Crear: `test/HU35_jeff/chatbot-isolation-blocks.test.ts`
- Modificar: `docs/specs/api-contracts.md:698-699` (las dos últimas líneas del archivo; la sección nueva va debajo)
- Modificar: `docs/specs/feature-index.md:23` (la fila 17; la fila 18 va debajo)
- Modificar: `specs/features/schedule/schedule.spec.md:59-61` (`## Endpoints` y su primer título; la sección nueva va justo antes)
- Test: `test/HU35_jeff/chatbot-isolation-blocks.test.ts`
- Temporales, solo para ver el guardia en rojo: el Paso 2 crea `src/modules/chatbot/sembrado-guardia-a.ts` y `src/modules/chatbot/sembrado-guardia-b.ts`, dos archivos **nuevos**, y el Paso 3 los borra con `rm`. No se toca ningún archivo versionado del chatbot, así que no hay nada que restaurar con `git checkout --` (que pisaría en silencio lo que otra sesión hubiera cambiado entremedio). Ninguno entra al commit.

Todos los comandos se corren desde la raíz del worktree `$REPO`, en la rama `feat/bloques-horario`. Cada bloque `bash` que usa `$BUN` empieza con la guarda `: "${BUN:?…}"` y se corre **entero, en una sola llamada de shell**, después del `export` de "Variables de los comandos": el `export` no sobrevive de una llamada a otra, y con `$BUN` vacío `… $BUN test …` se vuelve el comando `test` de la shell, que no imprime nada y sale con 0 (un verde falso). La guarda corta la llamada antes.

El spec `specs/features/time-blocks/time-blocks.spec.md` ya enlaza esta prueba bajo RS-BE-35 (`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts`), así que esta tarea no toca ese archivo.

**Interfaces:**

- Consume (código): nada de tareas anteriores. La prueba solo lee texto con `Bun.Glob` y `Bun.file`, igual que el guardia del récord `test/HU34_jeff/chatbot-isolation.test.ts:1-58`, cuya forma copia. Hoy `src/modules/chatbot/` tiene 11 archivos `.ts` y ninguno menciona `time-block`, `timeBlock` ni `time-blocks`.
- Consume (lo que la documentación describe; el Paso 5 lo comprueba con `grep` antes de escribir):
  - Tarea 1 (`src/db/schema/schema.ts`): `export const timeBlockExceptionStatusEnum = pgEnum("time_block_exception_status", ["cancelled", "moved"])`, `export const studentTimeBlock = pgTable("student_time_block", …)` y `export const studentTimeBlockException = pgTable("student_time_block_exception", …)`; migración `drizzle/0012_time_blocks.sql`.
  - Tarea 2 (`time-blocks.logic.ts`): `export const WINDOW_MAX_DAYS = 120;`, `export const GRID_START = "07:00";`, `export const GRID_END = "22:00";`, `expandOccurrences` (orden: fecha, hora de inicio, `blockId`) y `weeklyHours(occurrences, from, to)`, que emite una semana por cada lunes que toca la ventana, con 0 si no hay nada.
  - Tarea 3 (`time-blocks.repository.ts`): `findBlocks` con `order by start_date asc, start_time asc, id asc`; `countBlocks`, que cuenta todos los bloques guardados del alumno, vencidos incluidos; y `upsertException(...)`, que inserta desde el bloque del alumno y devuelve la fila como `TimeBlockException` (horas en `null` si es `cancelled`) o `null` si el bloque no es suyo.
  - Tarea 4 (`time-blocks.service.ts` y `time-blocks.schemas.ts`): `export const MAX_BLOCKS_PER_STUDENT = 20;`; los cinco códigos `TIME_BLOCK_NOT_FOUND`, `TIME_BLOCK_OUT_OF_GRID`, `TIME_BLOCK_LIMIT_REACHED`, `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN` y `TIME_BLOCK_WINDOW_TOO_WIDE` con sus mensajes; `setException(...): Promise<{ exception: TimeBlockExceptionView }>`, que devuelve la excepción **sin** `blockId` (`vistaDeExcepcion`), igual que dentro de cada bloque; `clearException` no llama a `exigirFechaDelPatron`; `deleteBlock` responde 404 cuando se repite; `occurrences` suma las semanas enteras que toca la ventana; `timeBlockBodySchema` con `.refine` para `endTime > startTime`, `endDate >= startDate` y días sin repetir (400 `INVALID_REQUEST_BODY`); `exceptionBodySchema` con el orden de las horas del `moved` (400 `INVALID_REQUEST_BODY`); `windowQuerySchema` con `to >= from` (400 `INVALID_QUERY_PARAMS`); `blockIdParamSchema` y `occurrenceParamsSchema` con el `id` hasta 2147483647; y `fecha`, que rechaza fechas que no existen o que caen fuera de 2000–2099, en los cinco campos de fecha.
  - Tarea 5 (`time-blocks.routes.ts` y `time-blocks.controller.ts`): `authMiddleware` + `requireRole(...STUDENT_ROLES)` sobre todo el módulo, las siete rutas (`app.get("/me/occurrences", …)`, `app.get("/me", …)`, `app.post("/me", …)`, `app.patch("/me/:id", …)`, `app.delete("/me/:id", …)`, `app.put("/me/:id/occurrences/:date", …)`, `app.delete("/me/:id/occurrences/:date", …)`) y `c.json(await this.service.createBlock(studentId, body), 201)`.
  - Del repo: `validateJson` / `validateQuery` / `validateParams` (`src/shared/middleware/validate-dto.ts:5-34`: `INVALID_JSON_BODY`, `INVALID_REQUEST_BODY`, `INVALID_QUERY_PARAMS`, `INVALID_ROUTE_PARAMS`, `details = result.error.flatten()`), `errorHandler` (`src/shared/middleware/error-handler.ts:4-16`: `{ error: { code, message, details } }`), y el CORS de `src/server.ts:20`, que desde la Tarea 5 es `allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]` (el contrato lo deja dicho bajo `PATCH /time-blocks/me/:id`).
- Produce:
  - `test/HU35_jeff/chatbot-isolation-blocks.test.ts`: `describe("RS-BE-35: el chatbot no ve los bloques de horario propios")`, con 1 + 2 × (número de archivos `.ts` bajo `src/modules/chatbot`) pruebas. Hoy son 23.
  - `docs/specs/api-contracts.md`: la sección `## Time Blocks (bloques de horario propios)` con siete títulos `### … /time-blocks/me…`, uno por ruta.
  - `docs/specs/feature-index.md`: la fila `| 18 | Bloques de horario propios | …`.
  - `specs/features/schedule/schedule.spec.md`: la sección `## Bloques propios del alumno (\`time-blocks\`)`.
  - La Tarea 7 no consume nada de esta tarea: edita `docs/specs/api-contracts.md` y `schedule.spec.md` más arriba de lo que agrega esta, con anclas que esta tarea no toca. La suite completa de las Tareas 7 y 8 incluye esta prueba.

---

- [ ] **Paso 1: Escribir la prueba que falla**

Primero, comprobar el punto de partida:

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && git status --short && ls -1 src/modules/time-blocks/ test/HU35_jeff/
```

Esperado, literal. Después de la rama no debe salir ninguna línea de `git status`:

```
feat/bloques-horario
src/modules/time-blocks/:
index.ts
time-blocks.controller.ts
time-blocks.logic.ts
time-blocks.repository.ts
time-blocks.routes.ts
time-blocks.schemas.ts
time-blocks.service.ts
time-blocks.types.ts

test/HU35_jeff/:
migration-0012.test.ts
time-blocks-expansion.test.ts
time-blocks.repository.test.ts
time-blocks.routes.test.ts
time-blocks.service.test.ts
```

Hay tres casos en que se **para**:
- Si `git status --short` muestra algo: es trabajo sin commitear que no es de esta tarea, y su commit tiene que llevar solo sus cuatro archivos.
- Si falta un archivo de `src/modules/time-blocks/`: las Tareas 1 a 5 no están completas, y la documentación de esta tarea describe ese código.
- Si ya existe `chatbot-isolation-blocks.test.ts`: alguien adelantó esta tarea.

Crear `test/HU35_jeff/chatbot-isolation-blocks.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";

/**
 * RS-BE-35: los bloques de horario propios quedan fuera del alcance del chatbot.
 *
 * El chatbot manda su contexto a un proveedor externo (Cohere). Dónde trabaja
 * un alumno y a qué hora sale no tiene por qué salir de la app. Esta prueba
 * fija que NINGÚN archivo del módulo del chatbot nombra las tablas de los
 * bloques —ni el enum de sus excepciones— ni importa el módulo `time-blocks`,
 * para que nadie lo conecte después "porque sería útil".
 *
 * Es un guardia, como el del récord (`test/HU34_jeff/chatbot-isolation.test.ts`,
 * RS-BE-28): pasa desde el primer día. Recorre todos los `*.ts` bajo
 * `src/modules/chatbot/` con `Bun.Glob`, así que un archivo que se agregue
 * después al módulo entra solo al guardia, sin tocar esta lista.
 */

const DIRECTORIO = "src/modules/chatbot";

/** Todos los `.ts` del módulo, con la ruta completa desde la raíz del repo. */
const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}
ARCHIVOS.sort();

// Los nombres SQL y los identificadores que tienen en schema.ts (Tarea 1): con
// el constructor de consultas de Drizzle se puede leer una tabla sin escribir
// nunca su nombre SQL. `student_time_block` ya es prefijo de
// `student_time_block_exception`, y lo mismo pasa en camelCase; se listan las
// dos para que la lista diga en claro qué se protege. No se busca un prefijo
// más corto ("student_", "time"): el chatbot lee legítimamente otras tablas
// del alumno y habla de horas de clase.
const PROHIBIDOS = [
  "student_time_block",
  "student_time_block_exception",
  "time_block_exception_status",
  "studentTimeBlock",
  "studentTimeBlockException",
  "timeBlockExceptionStatusEnum",
];

describe("RS-BE-35: el chatbot no ve los bloques de horario propios", () => {
  // Si el directorio desaparece o se queda sin archivos `.ts` (se renombra el
  // módulo entero), el guardia tiene que fallar por quedarse sin nada que
  // recorrer, no volverse verde por un `describe` sin pruebas adentro.
  test(`${DIRECTORIO} tiene al menos un archivo .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
  });

  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra las tablas de los bloques`, async () => {
      // Si el archivo se renombra o se borra, Bun.file falla y el test también:
      // el guardia no se vuelve verde por desaparecer su objeto.
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });

    test(`${ruta} no importa el modulo time-blocks`, async () => {
      const texto = await Bun.file(ruta).text();
      // import ... from / export ... from
      expect(texto).not.toMatch(/from\s+["'][^"']*time-blocks[^"']*["']/);
      // import dinámico: import("../time-blocks/...")
      expect(texto).not.toMatch(/import\s*\(\s*["'][^"']*time-blocks/);
      // import solo por efecto: import "../time-blocks/..."
      expect(texto).not.toMatch(/import\s+["'][^"']*time-blocks/);
    });
  }
});
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

El guardia pasa desde el primer día porque el chatbot hoy no toca nada de los bloques. Para verlo fallar por la razón correcta hay que sembrar violaciones a mano. Se siembran dos, las dos en archivos **nuevos** del chatbot, para no tocar ninguno versionado:
- `sembrado-guardia-a.ts`: el nombre de una tabla en un comentario y un `import type` del módulo.
- `sembrado-guardia-b.ts`: el identificador de Drizzle de la tabla y un import que solo existe por su efecto.

Así se prueba además que el `Bun.Glob` recoge un archivo nuevo sin tocar la prueba, y se ejercitan los dos regex de import que más importan.

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}"
cat > src/modules/chatbot/sembrado-guardia-a.ts <<'EOF'
// Sembrado a mano para ver el guardia en rojo: student_time_block_exception
import type { TimeBlockRule } from "../time-blocks/time-blocks.types.js";
EOF
cat > src/modules/chatbot/sembrado-guardia-b.ts <<'EOF'
// Archivo sembrado a mano para ver el guardia en rojo. Se borra en el Paso 3.
import "../time-blocks/index.js";
export const tabla = "studentTimeBlockException";
EOF
DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/chatbot-isolation-blocks.test.ts
```

Esperado: FAIL con **exactamente 4** pruebas en rojo, todas de los dos archivos sembrados. Bun imprime el contenido del archivo en `Received:` y agrega el tiempo entre corchetes al final de cada línea `(fail)` (por ejemplo `[9.26ms]`). Lo que importa son estas líneas (la versión anterior, con una de las dos violaciones en `chatbot.repository.ts`, se midió en una copia aislada del módulo del chatbot; con las dos en archivos nuevos cambian el archivo de las dos primeras y los totales, ver "Cifras de las pruebas"):

```
error: expect(received).not.toContain(expected)
Expected to not contain: "student_time_block"
(fail) RS-BE-35: el chatbot no ve los bloques de horario propios > src/modules/chatbot/sembrado-guardia-a.ts no nombra las tablas de los bloques

error: expect(received).not.toMatch(expected)
Expected substring or pattern: not /from\s+["'][^"']*time-blocks[^"']*["']/
(fail) RS-BE-35: el chatbot no ve los bloques de horario propios > src/modules/chatbot/sembrado-guardia-a.ts no importa el modulo time-blocks

error: expect(received).not.toContain(expected)
Expected to not contain: "studentTimeBlock"
(fail) RS-BE-35: el chatbot no ve los bloques de horario propios > src/modules/chatbot/sembrado-guardia-b.ts no nombra las tablas de los bloques

error: expect(received).not.toMatch(expected)
Expected substring or pattern: not /import\s+["'][^"']*time-blocks/
(fail) RS-BE-35: el chatbot no ve los bloques de horario propios > src/modules/chatbot/sembrado-guardia-b.ts no importa el modulo time-blocks

 23 pass
 4 fail
 122 expect() calls
Ran 27 tests across 1 file.
```

Hoy el chatbot tiene 11 archivos `.ts`; con los dos sembrados son 13, así que salen 1 + 2 × 13 = 27 pruebas. Las aserciones: 1 de la guarda de carpeta vacía, 10 por cada uno de los 11 archivos limpios (1 + 6 + 3), 3 del archivo `a` (el largo y el primer prohibido; el primer regex) y 8 del `b` (el largo, cuatro prohibidos hasta `studentTimeBlock`, y los tres regex): 1 + 110 + 3 + 8 = 122. Si otro archivo del chatbot falla, o si fallan menos de cuatro, **parar**: el guardia no está mirando lo que debe. No correr `$BUN run build` mientras el sembrado siga puesto (el `import type` sin usar rompe `noUnusedLocals`).

- [ ] **Paso 3: Implementación mínima**

Esta tarea no tiene código de producción. RS-BE-35 se cumple porque el chatbot no toca nada de los bloques, así que la implementación mínima es dejarlo como estaba, borrando lo sembrado:

```bash
cd "${REPO:?}"
rm src/modules/chatbot/sembrado-guardia-a.ts src/modules/chatbot/sembrado-guardia-b.ts
git status --short src/modules/chatbot
```

Esperado: `git status --short src/modules/chatbot` no imprime **nada**. Si imprime algo, **parar**.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

Se corre junto al guardia del récord para confirmar que los dos conviven:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/chatbot-isolation.test.ts test/HU35_jeff/chatbot-isolation-blocks.test.ts
```

Esperado: PASS.

```
 46 pass
 0 fail
 211 expect() calls
Ran 46 tests across 2 files.
```

Son 23 pruebas del récord (100 aserciones) y 23 de los bloques (111 aserciones: 1 + 11 × (1 + 6 + 3)). Solo esta prueba da `23 pass`, `0 fail`, `111 expect() calls`. La línea `Ran …` termina además con el tiempo entre corchetes.

- [ ] **Paso 5: `docs/specs/api-contracts.md`: las siete rutas**

Antes de escribir, confirmar en el código de las Tareas 2 a 5, y en `src/server.ts`, los datos que el contrato afirma:

```bash
cd "${REPO:?}"
grep -n "export const MAX_BLOCKS_PER_STUDENT\|return { exception: vistaDeExcepcion(exception) };" src/modules/time-blocks/time-blocks.service.ts
grep -o "TIME_BLOCK_[A-Z_]*" src/modules/time-blocks/time-blocks.service.ts | sort -u
grep -n "exigirFechaDelPatron" src/modules/time-blocks/time-blocks.service.ts
grep -n "export const WINDOW_MAX_DAYS\|export const GRID_START\|export const GRID_END" src/modules/time-blocks/time-blocks.logic.ts
grep -n "order by start_date asc, start_time asc, id asc" src/modules/time-blocks/time-blocks.repository.ts
grep -nE "app\.(get|post|patch|put|delete)\(" src/modules/time-blocks/time-blocks.routes.ts
grep -n "201" src/modules/time-blocks/time-blocks.controller.ts
grep -n "allowMethods" src/server.ts
```

Esperado (sacado del código exacto de las Tareas 2 a 5 de este plan; lo que cuenta es el contenido, no el número de línea):

```
37:export const MAX_BLOCKS_PER_STUDENT = 20;
151:    return { exception: vistaDeExcepcion(exception) };
TIME_BLOCK_LIMIT_REACHED
TIME_BLOCK_NOT_FOUND
TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN
TIME_BLOCK_OUT_OF_GRID
TIME_BLOCK_WINDOW_TOO_WIDE
136:    this.exigirFechaDelPatron(block, date);
226:  private exigirFechaDelPatron(block: TimeBlockRule, date: string): void {
20:export const WINDOW_MAX_DAYS = 120;
23:export const GRID_START = "07:00";
24:export const GRID_END = "22:00";
99:       order by start_date asc, start_time asc, id asc
26:  app.get("/me/occurrences", (c) => controller.getOccurrences(c));
27:  app.get("/me", (c) => controller.listBlocks(c));
28:  app.post("/me", (c) => controller.createBlock(c));
29:  app.patch("/me/:id", (c) => controller.updateBlock(c));
30:  app.delete("/me/:id", (c) => controller.deleteBlock(c));
31:  app.put("/me/:id/occurrences/:date", (c) => controller.setException(c));
32:  app.delete("/me/:id/occurrences/:date", (c) => controller.clearException(c));
51:    return c.json(await this.service.createBlock(studentId, body), 201);
20:    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
```

`exigirFechaDelPatron` aparece **dos** veces (la llamada de `setException` y la definición): `clearException` no la llama, y por eso el contrato dice que el `DELETE` de una excepción no exige el patrón.

Si algo difiere, el contrato documenta **lo que hace el código**, y se corrige en el texto de abajo solo lo que cambie antes de pegarlo:
- Si `allowMethods` **no** incluye `"PATCH"`, la Tarea 5 quedó a medias: **PARAR** y volver a su Paso 3 (quinto cambio). No se documenta un CORS que no deja pasar la ruta.
- Si el dueño cambió algún mensaje por el aviso de textos de la Tarea 5, se copia el nuevo en la viñeta **Mensajes** de las reglas comunes.

El contrato y la spec dicen lo mismo, porque la spec se reconcilió con este plan el 2026-09-21 y entró así con la Tarea 1: el ejemplo usa fechas que el patrón `[1, 3]` sí genera (el miércoles 2026-10-07 cancelado y el lunes 2026-10-12 movido), una excepción `cancelled` viaja con sus dos horas en `null` y el `PUT` responde la excepción sin `blockId` (RS-BE-32), el `DELETE` de una excepción no exige el patrón (RS-BE-32), el tope cuenta los 20 bloques **guardados**, vencidos incluidos (RS-BE-31), las fechas van de 2000-01-01 a 2099-12-31 (RS-BE-31) y `weeks` trae la semana entera, con 0 si no hay nada (RS-BE-34). No queda ninguna diferencia que reportar.

El ejemplo de `GET /time-blocks/me/occurrences` no está armado a mano: sale de correr `expandOccurrences` y `weeklyHours` de la Tarea 2 sobre el bloque y las dos excepciones del ejemplo de `GET /time-blocks/me`, con la ventana del 2026-10-05 (lunes) al 2026-10-18 (domingo); como la ventana empieza en lunes y termina en domingo, sus dos semanas son enteras. `2027-01-18` es `2026-09-21 + 119` días, el último `to` que acepta `exigirVentana` para ese `from`.

En `docs/specs/api-contracts.md`, reemplazar esto (las dos últimas líneas del archivo, que hoy son la 698 y la 699):

```markdown
- Si el alumno vuelve a sincronizar y acepta de nuevo, la copia se guarda otra vez.
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`
```

por esto (las mismas dos líneas, una línea en blanco y la sección nueva, que termina con un salto de línea):

````markdown
- Si el alumno vuelve a sincronizar y acepta de nuevo, la copia se guarda otra vez.
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`

## Time Blocks (bloques de horario propios)

Bloques que el propio alumno registra en su horario —prácticas, trabajo, voluntariado—, con repetición semanal, excepciones por día y la suma de horas por semana. Detalle en `specs/features/time-blocks/time-blocks.spec.md` (RS-BE-30 a RS-BE-35). Viven en `student_time_block` y `student_time_block_exception` (migración `drizzle/0012_time_blocks.sql`) y **no** se mezclan en `GET /schedule/me/sessions`: van por sus propias rutas.

Reglas comunes a las siete rutas:

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate` (`authMiddleware` + `requireRole(...STUDENT_ROLES)` sobre todo el módulo). Un token docente recibe `403 FORBIDDEN`.
- **El alumno sale solo del token.** No hay parámetro de alumno ni ruta para docentes o delegados; un `studentId` que llegue en la query o en el body se ignora.
- **Un bloque de otro alumno es un bloque que no existe**: responde `404 TIME_BLOCK_NOT_FOUND`, igual que un id que no existe, para no confirmar que ese id existe.
- **Formatos**: las horas viajan como `"HH:MM"` y las fechas como `"YYYY-MM-DD"`, en hora de Lima y sin zona horaria pegada: son horas de pared, no instantes. Una fecha que no existe en el calendario (`2026-02-30`) o que cae fuera de **2000-01-01 a 2099-12-31** es un formato inválido. `daysOfWeek` usa la convención de `schedule_session.day_of_week`: **1 es lunes y 7 es domingo**.
- **Tipos**: los numéricos salen como `number` JSON (`hours` puede traer decimal); un campo sin dato es `null`, nunca 0. Una excepción `cancelled` lleva `startTime` y `endTime` en `null`.
- **Grilla**: toda hora de inicio y de fin cae entre **07:00 y 22:00**; si no, `400 TIME_BLOCK_OUT_OF_GRID`. Es el rango que la grilla del horario de la app puede pintar. La hora de fin tiene que ser estrictamente mayor que la de inicio; si no, `400 INVALID_REQUEST_BODY` con el error en `endTime` (no es un error de grilla).
- **Chatbot**: no lee estas tablas ni importa el módulo (RS-BE-35).
- Todos los valores de los ejemplos son inventados.
- **Mensajes** (`error.message` de cada código): `TIME_BLOCK_LIMIT_REACHED` "Llegaste al máximo de 20 bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro.", `TIME_BLOCK_NOT_FOUND` "No existe ese bloque.", `TIME_BLOCK_OUT_OF_GRID` "El bloque tiene que empezar y terminar entre las 07:00 y las 22:00.", `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN` "Ese día no forma parte del bloque." y `TIME_BLOCK_WINDOW_TOO_WIDE` "La ventana no puede pasar de 120 días.". Los 400 de validación llevan el `message` de siempre y el texto de cada campo en `details.fieldErrors`.
- **Errors comunes**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`; `400` `INVALID_JSON_BODY` en `POST`, `PATCH` y `PUT` (un cuerpo que no es JSON); `400` `INVALID_ROUTE_PARAMS` en las rutas con `:id` (un `:id` que no es un entero de 1 a 2147483647, o un `:date` que no es una fecha válida).

### GET /time-blocks/me

Los bloques del alumno autenticado, cada uno con sus excepciones.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`:
  ```json
  {
    "blocks": [
      {
        "id": 12,
        "title": "Prácticas",
        "colorHex": "#F94B3F",
        "daysOfWeek": [1, 3],
        "startTime": "14:00",
        "endTime": "18:00",
        "startDate": "2026-09-01",
        "endDate": "2026-12-15",
        "exceptions": [
          { "date": "2026-10-07", "status": "cancelled", "startTime": null, "endTime": null },
          { "date": "2026-10-12", "status": "moved", "startTime": "15:00", "endTime": "19:30" }
        ]
      }
    ]
  }
  ```
- **Orden**: los bloques por `startDate`, luego por `startTime` y luego por `id`; las excepciones de cada bloque, por fecha.
- Un alumno sin bloques recibe `{ "blocks": [] }`.
- `exceptions` trae todas las excepciones guardadas del bloque, incluida la que quedó fuera del patrón porque después se editó la regla (ver `PATCH`).

### POST /time-blocks/me

Crea un bloque.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body**:
  ```json
  {
    "title": "Prácticas",
    "colorHex": "#F94B3F",
    "daysOfWeek": [1, 3],
    "startTime": "14:00",
    "endTime": "18:00",
    "startDate": "2026-09-01",
    "endDate": "2026-12-15"
  }
  ```
  - `title`: se recorta; de 1 a 60 caracteres después de recortar.
  - `colorHex`: `^#[0-9A-Fa-f]{6}$`.
  - `daysOfWeek`: de 1 a 7 valores **distintos**, cada uno de 1 a 7.
  - `startTime` y `endTime`: `HH:MM`, dentro de 07:00–22:00 y `endTime` estrictamente mayor.
  - `startDate` y `endDate`: fechas que existen, entre 2000-01-01 y 2099-12-31, con `endDate >= startDate`.
- **Response** `201 Created`:
  ```json
  {
    "block": {
      "id": 12,
      "title": "Prácticas",
      "colorHex": "#F94B3F",
      "daysOfWeek": [1, 3],
      "startTime": "14:00",
      "endTime": "18:00",
      "startDate": "2026-09-01",
      "endDate": "2026-12-15",
      "exceptions": []
    }
  }
  ```
- **Errors**: `400` `INVALID_REQUEST_BODY` (un campo con formato inválido, días repetidos, `endTime` no mayor que `startTime` o `endDate` anterior a `startDate`; `details.fieldErrors` nombra el campo), `400` `TIME_BLOCK_OUT_OF_GRID`, `400` `TIME_BLOCK_LIMIT_REACHED` (el alumno ya tiene **20** bloques guardados, **vencidos incluidos**: es un tope para que la expansión de una ventana no crezca sin control, no una regla de negocio, y un bloque vencido sigue expandiéndose en una ventana pasada; para crear otro hay que borrar uno).

### PATCH /time-blocks/me/:id

Reemplaza la regla entera del bloque `:id`: es "cambiar todas las semanas".

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body**: los siete campos de `POST /time-blocks/me`, todos obligatorios y con las mismas reglas.
- **Response** `200 OK`: `{ "block": … }`, con la forma de `POST` y las excepciones del bloque.
- **Conserva las excepciones**: si el alumno mueve el patrón de 14:00 a 15:00, el día que ya había cancelado sigue cancelado. Una excepción que por el cambio queda fuera del rango o de los días del bloque sigue guardada y la expansión la ignora; se limpia con `DELETE /time-blocks/me/:id/occurrences/:date`.
- **Desde un navegador**: es la primera ruta `PATCH` del backend, y el CORS de `src/server.ts` incluye `PATCH` en `allowMethods` para que el preflight la deje pasar. La app nativa (iOS y Android) no hace preflight.
- **Errors**: `400` `INVALID_REQUEST_BODY`, `400` `TIME_BLOCK_OUT_OF_GRID`, `404` `TIME_BLOCK_NOT_FOUND`.

### DELETE /time-blocks/me/:id

Borra el bloque y, en cascada, sus excepciones.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`: `{ "ok": true }`
- **Errors**: `404` `TIME_BLOCK_NOT_FOUND`, también al repetir el `DELETE` de un bloque ya borrado.

### PUT /time-blocks/me/:id/occurrences/:date

Fija la excepción de un día suelto del bloque —ese día no va, o va con otras horas— sin tocar el patrón de las demás semanas.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Body**, uno de los dos:
  ```json
  { "status": "cancelled" }
  ```
  ```json
  { "status": "moved", "startTime": "15:00", "endTime": "19:30" }
  ```
  En `moved` las dos horas son obligatorias y siguen las reglas de la grilla; en `cancelled`, si llegan horas, se ignoran.
- `:date` tiene que caer **dentro del rango del bloque y en uno de sus días de la semana**: una excepción sobre un día que el patrón no genera no significa nada.
- **Idempotente**: repetir el mismo `PUT` deja el mismo estado, y un `PUT` sobre una fecha que ya tenía excepción la reemplaza.
- **Response** `200 OK`, con la misma forma que la excepción dentro de su bloque en `GET /time-blocks/me`:
  ```json
  {
    "exception": {
      "date": "2026-10-12",
      "status": "moved",
      "startTime": "15:00",
      "endTime": "19:30"
    }
  }
  ```
- **Errors**: `400` `INVALID_REQUEST_BODY` (`status` desconocido, o `moved` sin horas, con horas mal formadas o con la de fin no mayor que la de inicio), `400` `TIME_BLOCK_OUT_OF_GRID`, `400` `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`, `404` `TIME_BLOCK_NOT_FOUND`.

### DELETE /time-blocks/me/:id/occurrences/:date

Quita la excepción de ese día: el día vuelve al patrón.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`: `{ "ok": true }`
- **Idempotente**: si ese día no tenía excepción, responde igual. No exige que `:date` esté en el patrón, para poder limpiar una excepción que quedó fuera después de un `PATCH`.
- **Errors**: `404` `TIME_BLOCK_NOT_FOUND`.

### GET /time-blocks/me/occurrences

Los bloques ya concretos de una ventana de fechas: el servidor expande cada regla día por día, aplica las excepciones y suma las horas de cada semana.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Query**: `from` y `to`, **obligatorias**, en `YYYY-MM-DD`. La ventana incluye los dos extremos, `to` no puede ser anterior a `from` (`400 INVALID_QUERY_PARAMS`) y cubre como máximo **120 días** (`400 TIME_BLOCK_WINDOW_TOO_WIDE`): `from=2026-09-21&to=2027-01-18` es la ventana más ancha que empieza ese lunes.
- **Response** `200 OK` para `?from=2026-10-05&to=2026-10-18`, con el bloque del ejemplo de `GET /time-blocks/me`:
  ```json
  {
    "occurrences": [
      { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
        "date": "2026-10-05", "dayOfWeek": 1, "startTime": "14:00", "endTime": "18:00", "moved": false },
      { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
        "date": "2026-10-12", "dayOfWeek": 1, "startTime": "15:00", "endTime": "19:30", "moved": true },
      { "blockId": 12, "title": "Prácticas", "colorHex": "#F94B3F",
        "date": "2026-10-14", "dayOfWeek": 3, "startTime": "14:00", "endTime": "18:00", "moved": false }
    ],
    "weeks": [
      { "weekStart": "2026-10-05", "hours": 4 },
      { "weekStart": "2026-10-12", "hours": 8.5 }
    ]
  }
  ```
- **`occurrences`**: ordenadas por fecha, luego por hora de inicio y, si empatan, por `blockId`. Un día `cancelled` no aparece (el miércoles `2026-10-07` del ejemplo); un día `moved` aparece con sus horas nuevas y `moved: true`.
- **`weeks`**: una entrada por cada semana de **lunes a domingo** que toca la ventana, de la de `from` a la de `to`, ordenadas por `weekStart`, que es el lunes de esa semana y puede ser anterior a `from`. `hours` es el total de la semana **entera**, aunque la ventana la corte: una ventana que empieza un miércoles suma también el lunes de esa semana, que no sale en `occurrences`. Un día cancelado no suma, un día movido suma su duración nueva, y el total va en horas decimales sin redondear (`8.5` = ocho horas y media). Una semana sin ocurrencias sale con `hours: 0`: es un total conocido, no un dato que falta. Solo cuentan los bloques propios, nunca las clases.
- Sin ocurrencias en la ventana: `occurrences` sale vacío y cada semana que toca la ventana sale con `hours: 0`.
- **Errors**: `400` `INVALID_QUERY_PARAMS` (falta `from` o `to`, alguna no es una fecha válida, o `to` es anterior a `from`), `400` `TIME_BLOCK_WINDOW_TOO_WIDE` (más de 120 días).
````

La copia del frontend (`ULima_Frontend_IS2/docs/specs/api-contracts.md`) está en otro repo, y esta tarea no la toca.

- [ ] **Paso 6: `docs/specs/feature-index.md`: la fila nueva**

La última prioridad es la 17, así que la nueva es la 18. En `docs/specs/feature-index.md`, reemplazar esto (línea 23):

```markdown
| 17 | Récord académico | `specs/features/academic-record/academic-record.spec.md` | RS-BE-19 … RS-BE-29 | Copia del récord del portal con el consentimiento del alumno, lectura y borrado por su propio dueño, y limpieza de los electivos que el récord no respalda | `src/modules/academic-record`, `src/modules/portal-sync`, `src/modules/auth` | Implementado (pendiente de verificación end-to-end) |
```

por esto:

```markdown
| 17 | Récord académico | `specs/features/academic-record/academic-record.spec.md` | RS-BE-19 … RS-BE-29 | Copia del récord del portal con el consentimiento del alumno, lectura y borrado por su propio dueño, y limpieza de los electivos que el récord no respalda | `src/modules/academic-record`, `src/modules/portal-sync`, `src/modules/auth` | Implementado (pendiente de verificación end-to-end) |
| 18 | Bloques de horario propios | `specs/features/time-blocks/time-blocks.spec.md` | RS-BE-30 … RS-BE-36 | Bloques que el alumno registra (prácticas, trabajo) con repetición semanal, excepciones por día y horas por semana; propios del alumno y fuera del alcance del chatbot. Suma `isoDate` a los días del horario | `src/modules/time-blocks`, `src/modules/index.ts`, `src/server.ts`, `src/modules/schedule`, `src/db/schema/schema.ts`, `drizzle/0012_time_blocks.sql` | Implementado — **pendiente aplicar la migración 0012** (acción del dueño) y la verificación end-to-end |
```

- [ ] **Paso 7: `specs/features/schedule/schedule.spec.md`: la nota**

La nota va antes de `## Endpoints` y **después** de la viñeta suelta de la línea 57, la de `aula`/`salon`. Esa línea tiene la codificación rota (`sesiÃ³n`) y no se toca. En `specs/features/schedule/schedule.spec.md`, reemplazar esto (líneas 59 a 61):

```markdown
## Endpoints

### GET /schedule/me/sessions
```

por esto:

```markdown
## Bloques propios del alumno (`time-blocks`)

El horario del alumno ya no es solo lo que baja del portal: el alumno registra además sus propios bloques —prácticas, trabajo, voluntariado— en el módulo `time-blocks` (`specs/features/time-blocks/time-blocks.spec.md`, RS-BE-30 a RS-BE-35). Viven en sus propias tablas (`student_time_block` y `student_time_block_exception`) y viajan por su propia ruta, `GET /time-blocks/me/occurrences`. No se mezclan con nada de lo que describe esta spec:

- **No se mezclan en `GET /schedule/me/sessions`.** La app reparte una paleta de doce colores entre las `secciones` de esa respuesta; un bloque metido ahí se llevaría uno de esos colores y los cursos del portal cambiarían de color cada vez que el alumno crea o borra un bloque.
- Un bloque no tiene sección, curso, docente ni asistencia: en `secciones` iría con campos inventados, como ya les pasa a las pseudo-secciones de asesoría del horario docente (`idSeccion: "adv-…"`, `asistenciaDisponible: false`).
- Un bloque propio nunca escribe en `schedule_session`, `enrollment` ni `course_offering`. Por eso tampoco entra en la suma de horas que portal-sync hace sobre `schedule_session` (`recomputeOfferingHoursFromSchedule`) para fijar `course_offering.total_hours`, que `attendance-risk` usa como denominador de respaldo del porcentaje de inasistencia.
- `GET /schedule/me/load` sigue contando evaluaciones. Las horas por semana de los bloques salen en `weeks` de `GET /time-blocks/me/occurrences` y no se suman a esa carga.

## Endpoints

### GET /schedule/me/sessions
```

La nota respalda en el código lo que afirma: `recomputeOfferingHoursFromSchedule` está en `src/modules/portal-sync/portal-sync.repository.ts:599`; `attendance-risk` toma `course_offering.total_hours` solo como respaldo en `COALESCE(NULLIF(e.total_hours, 0), co.total_hours)` (`src/modules/attendance-risk/attendance-risk.repository.ts:60`); y las asesorías del horario docente son `idSeccion: \`adv-${advising.id}\`` con `asistenciaDisponible: false` (`src/modules/schedule/schedule.service.ts:338` y `:354`).

- [ ] **Paso 8: Comprobar la documentación, el enlace de la spec y el build**

```bash
cd "${REPO:?}"
grep -nE "^### (GET|POST|PATCH|PUT|DELETE) /time-blocks/me" docs/specs/api-contracts.md
for c in TIME_BLOCK_NOT_FOUND TIME_BLOCK_OUT_OF_GRID TIME_BLOCK_LIMIT_REACHED TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN TIME_BLOCK_WINDOW_TOO_WIDE; do printf '%s ' "$c"; grep -c "$c" docs/specs/api-contracts.md; done
grep -c "^| 18 | Bloques de horario propios |" docs/specs/feature-index.md
grep -n "^## " specs/features/schedule/schedule.spec.md
grep -n "chatbot-isolation-blocks" specs/features/time-blocks/time-blocks.spec.md
git diff --numstat -- docs specs
git diff -U0 -- docs specs | grep -nE '^\+.*\b[0-9]{8}\b'
```

Esperado (la versión anterior se midió en una copia aislada con los tres cambios aplicados; los números de
línea y los conteos de ahora salen del bloque de arriba, que empieza en la línea 698 del archivo):

```
718:### GET /time-blocks/me
748:### POST /time-blocks/me
788:### PATCH /time-blocks/me/:id
799:### DELETE /time-blocks/me/:id
807:### PUT /time-blocks/me/:id/occurrences/:date
835:### DELETE /time-blocks/me/:id/occurrences/:date
844:### GET /time-blocks/me/occurrences
TIME_BLOCK_NOT_FOUND 6
TIME_BLOCK_OUT_OF_GRID 5
TIME_BLOCK_LIMIT_REACHED 2
TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN 2
TIME_BLOCK_WINDOW_TOO_WIDE 3
1
12:## User Stories
18:## Business Rules
59:## Bloques propios del alumno (`time-blocks`)
68:## Endpoints
185:`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts`
171	0	docs/specs/api-contracts.md
1	0	docs/specs/feature-index.md
9	0	specs/features/schedule/schedule.spec.md
```

- La línea del `[@test]` es la **185** porque las Tareas 3 y 4 agregaron un `[@test]` cada una más arriba (en la spec que deja la Tarea 1, antes de ellas, es la 183). Tiene que salir una sola línea.
- `git diff --numstat` con `0` en la segunda columna confirma que ninguna línea existente se borró ni se reescribió: los tres cambios solo agregan.
- El último `grep` no imprime **nada**: ninguna línea agregada lleva un número de 8 dígitos que pueda ser un código de alumno.

Después, la carpeta del módulo junto al guardia del récord, y el build:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff test/HU34_jeff/chatbot-isolation.test.ts 2>&1 | tail -n 4
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado:

```
 238 pass
 0 fail
 809 expect() calls
Ran 238 tests across 7 files.
```

Son los 192 tests y 598 aserciones que la Tarea 5 da para `test/HU35_jeff` (19 + 24 + 30 + 60 + 59), más los 23 y 111 de esta prueba y los 23 y 100 del guardia del récord. La línea `Ran …` termina además con el tiempo entre corchetes. Si da `0 fail` pero otros totales, anotar la diferencia y compararla con las cifras de cada tarea antes de seguir. El build termina sin errores: `tsc` solo imprime la línea `$ tsc`.

- [ ] **Paso 9: Medir el README (solo lectura, no se edita en esta tarea)**

Las cifras del README envejecen con cada rama. El script que las compara solo lee, y sirve además para cruzar lo que crearon las Tareas 1 a 5:

```bash
cd "${REPO:?}" && python3 scripts/verificar-readme.py; echo "estado=$?"
```

Esperado, literal (medido en una copia del árbol con dos `pgTable(` y un `pgEnum(` más en `schema.ts`, un `app.route(` más, el `time-blocks.routes.ts` de la Tarea 5, la `0012` y los seis archivos de `test/HU35_jeff`). Sale con estado 1 y once discrepancias, todas esperables:

```
Números medidos en el código:
  tablas               40
  enums                12
  modulos              18
  archivos_rutas       19
  endpoints            85
  migraciones          14
  suites               114
  specs                25
  variables_entorno    22
  parsers              11
  seeds                15

Afirmaciones del README:
  ✗ tablas               dice 38, son 40 (insignia del ORM)
  ✗ tablas               dice 38, son 40 (tabla de metadatos)
  ✗ tablas               dice 38, son 40 (título de la sección de tablas)
  ✗ enums                dice 11, son 12 (título de la sección de enums)
  ✗ modulos              dice 17, son 18 (insignia de superficie)
  ✗ modulos              dice 17, son 18 (tabla de metadatos)
  ✗ modulos              dice 17, son 18 (título de la sección de módulos)
  ✗ endpoints            dice 78, son 85 (insignia de superficie)
  ✗ endpoints            dice 78, son 85 (título del catálogo)
  ✗ migraciones          dice 13, son 14 (tabla de metadatos)
  ✗ suites               dice 108, son 114 (insignia de verificación)
  ✓ parsers              11 (diagrama de origen de datos)

Rutas de archivo citadas:
  ✓ todas existen

11 discrepancia(s). El README no está al día.
estado=1
```

Si algún "son N" no coincide, una tarea anterior creó algo distinto de lo que fija el esqueleto. Los valores esperados son: 2 tablas, 1 enum, 1 módulo, 7 rutas declaradas como `app.<método>(` una por línea, 1 migración y 6 suites. En ese caso, anotarlo en el reporte y no corregirlo acá. El README **no** se edita en esta tarea: el esqueleto limita la documentación a los tres archivos de "Cambios en otras specs", y el desglose de las 38 tablas también tendría que cambiar. Se reporta al dueño como pendiente, igual que se hizo con el récord en `71452b5` y `d976e5e`.

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}"
git add test/HU35_jeff/chatbot-isolation-blocks.test.ts docs/specs/api-contracts.md docs/specs/feature-index.md specs/features/schedule/schedule.spec.md
git status --short
```

Esperado, literal. Si aparece `src/modules/chatbot/…` o cualquier otra línea, **parar**:

```
M  docs/specs/api-contracts.md
M  docs/specs/feature-index.md
M  specs/features/schedule/schedule.spec.md
A  test/HU35_jeff/chatbot-isolation-blocks.test.ts
```

```bash
cd "${REPO:?}" && git commit -m "test(time-blocks): el chatbot no ve los bloques propios (RS-BE-35) y contrato de las siete rutas" -m "El guardia recorre todo src/modules/chatbot con Bun.Glob y exige que ningún archivo nombre student_time_block, student_time_block_exception ni su enum, ni importe el módulo time-blocks. Se vio en rojo sembrando dos violaciones a mano, que se revirtieron antes del commit." -m "api-contracts.md documenta las siete rutas con sus cuerpos, respuestas y códigos de error; feature-index.md suma la fila 18; schedule.spec.md explica por qué los bloques no se mezclan en GET /schedule/me/sessions." && git log --oneline -1 && git status --short
```

Esperado: una línea de `git log` con el mensaje de arriba y ninguna línea de `git status`. El autor ya está configurado (Jeffangeloss, noreply de GitHub). Sin trailer Co-Authored-By, sin push y sin PR.

Copiar en el reporte final de la tarea, para el dueño:

> **Pendientes para el dueño (Tarea 6):**
> - **README desactualizado**: `python3 scripts/verificar-readme.py` marca once cifras (tablas 38→40, enums 11→12, módulos 17→18, endpoints 78→85, migraciones 13→14, suites 108→114). No se tocó porque el esqueleto limita la documentación a tres archivos.
> - El CORS ya deja pasar el `PATCH` (Tarea 5) y el contrato coincide con la spec reconciliada: no hay diferencias que reportar.
### Tarea 7: La fecha exacta de cada día en el horario (RS-BE-36)

**Archivos:**
- Crear: `test/HU35_jeff/schedule-iso-date.test.ts`
- Modificar: `src/modules/schedule/schedule.types.ts:41-45` (`DayInfo`)
- Modificar: `src/modules/schedule/schedule.service.ts:220-224` y `:380-384` (cada día de cada semana, en `getSessions` y en `getTeacherSessions`) y `:229-233` (los siete días de un ciclo sin semanas)
- Modificar: `docs/specs/api-contracts.md:372-375` (el título de `GET /schedule/me/sessions` y su `Auth`) y `:381-383` (el ejemplo de `days`)
- Modificar: `specs/features/schedule/schedule.spec.md:25-27` (el final de BR-SCH-01), `:48` (BR-SCH-04, punto 3) y `:78-80` (el ejemplo de `days`; son las `69-71` antes de que la Tarea 6 agregue sus nueve líneas)
- Test: `test/HU35_jeff/schedule-iso-date.test.ts`

Todos los comandos se corren desde la raíz del worktree `$REPO`, en la rama `feat/bloques-horario`. Cada bloque `bash` que usa `$BUN` empieza con la guarda `: "${BUN:?…}"` y se corre **entero, en una sola llamada de shell**, después del `export` de "Variables de los comandos".

Esta tarea no depende de ninguna otra: toca solo el módulo `schedule` y dos documentos. Va después de la Tarea 6 para que las anclas y los números de línea de esa tarea en `docs/specs/api-contracts.md` (`:698-699`) y en `schedule.spec.md` (`:59-61`) sigan valiendo tal cual; las de esta tarea están más arriba en los dos archivos y la Tarea 6 no las toca. Los dos archivos de `src/` entran por los targets `../../../src/modules/schedule/schedule.service.ts` y `../../../src/modules/schedule/schedule.types.ts` de la spec de bloques (`time-blocks.spec.md:8-9`), además del `../../../src/modules/schedule/**` de `schedule.spec.md`. La prueba ya está enlazada bajo RS-BE-36 desde la reconciliación de la spec (`time-blocks.spec.md:204` con los enlaces de las Tareas 3 y 4 puestos): **esta tarea no toca la spec de bloques**. Sí le suma el mismo `[@test]` a BR-SCH-01 de `schedule.spec.md`, que es la spec dueña de esa ruta.

**Interfaces:**

- Consume — del repo, tal como está en `e2af4fa` (ninguna tarea anterior toca el módulo `schedule`):
  - `export type DayInfo = { dayName: string; dateText: string; weekText: string; }` (`src/modules/schedule/schedule.types.ts:41-45`) y `SessionsResponse = { days: DayInfo[]; secciones: SectionResponse[] }` (`:47-50`).
  - En `src/modules/schedule/schedule.service.ts`, tres funciones privadas del archivo que trabajan en UTC: `formatDateText(date: Date): string` (`:32-34`, "24 de Agosto"), `parseDateOnly(dateStr: string): Date` (`:36-39`) y `formatDateOnly(date: Date): string` (`:41-43`, "YYYY-MM-DD"). `isoDate` sale de `formatDateOnly` sobre la **misma** `currentDate` de la que `formatDateText` saca `dateText`, así que las dos no pueden desfasarse por el huso.
  - `async getSessions(studentId: number): Promise<SessionsResponse>` (`:164-241`), que arma `days` en `:212-235`: por cada semana, siete días desde `week.start_date`; sin semanas, siete días con `dateText: ""` y `weekText: "Semana actual"`.
  - `async getTeacherSessions(teacherId: number)` (`:285-393`), que arma sus días en `:372-387` con el mismo `DayInfo` y el mismo bloque `daysList.push({ … })`, letra por letra; sin semanas deja `days: []`. Por compartir el tipo, el horario docente también gana el campo (RS-BE-36 lo dice).
  - `private async resolveAcademicWeeks()` (`:73-81`): `findAcademicWeeksForActivePeriod` → `findActivePeriodDates` + `deriveWeeksFromPeriodDates` → `[]` (BR-SCH-04). `new ScheduleService(repository, events)` (`:56-60`) y `EventBus` de `src/events/index.ts:5`.
  - La prueba reemplaza el repositorio por un objeto con los cinco métodos que esos dos caminos llaman: `findActiveEnrollmentsWithSessions`, `findAcademicWeeksForActivePeriod`, `findActivePeriodDates`, `findTeacherSessionsWithClasses` y `findTeacherAdvisingSessions`. `schedule.service.ts` solo trae `db` como `import type` (a través de `schedule.repository.ts`), así que la prueba no abre ninguna conexión.
- Produce: `DayInfo.isoDate: string | null` y el campo en cada día de `GET /schedule/me/sessions` (y de `GET /schedule/teacher/sessions`). Ninguna tarea posterior lo importa: lo consume la app, que toma la ventana del ciclo visible del primer y el último `isoDate` no nulo y filtra las ocurrencias de cada día por `isoDate`. La Tarea 8 cuenta esta prueba: **6** pruebas y **29** aserciones.

---

- [ ] **Paso 1: Escribir la prueba que falla**

Primero, comprobar el punto de partida:

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && git status --short && ls test/HU35_jeff/schedule-iso-date.test.ts 2>&1; for f in src/modules/schedule/schedule.types.ts src/modules/schedule/schedule.service.ts; do echo "$f:$(grep -c "isoDate" "$f")"; done; grep -n "schedule-iso-date" specs/features/time-blocks/time-blocks.spec.md
```

Esperado, literal (`git status --short` no imprime nada):

```
feat/bloques-horario
ls: test/HU35_jeff/schedule-iso-date.test.ts: No such file or directory
src/modules/schedule/schedule.types.ts:0
src/modules/schedule/schedule.service.ts:0
204:`[@test] ../../../test/HU35_jeff/schedule-iso-date.test.ts`
```

- Si `git status --short` imprime algo, es trabajo sin commitear de otra tarea: no lo mezcles con el commit de esta.
- Si la prueba ya existe o algún archivo del módulo ya dice `isoDate`, alguien adelantó la tarea: **PARAR**.
- Si el enlace no está en la línea 204, las Tareas 3 y 4 no dejaron los suyos o la spec no es la reconciliada: **PARAR** y releerla antes de seguir.

Crear `test/HU35_jeff/schedule-iso-date.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import type { ScheduleRepository } from "../../src/modules/schedule/schedule.repository.js";
import { ScheduleService } from "../../src/modules/schedule/schedule.service.js";

/**
 * RS-BE-36 (specs/features/time-blocks/time-blocks.spec.md) · La fecha exacta
 * de cada día del horario.
 *
 * `GET /schedule/me/sessions` manda en `days` siete días por cada semana del
 * ciclo, con `dateText` en español y sin año ("24 de Agosto"). La app necesita
 * la fecha exacta de cada día para pedir los bloques propios del ciclo visible
 * y para ubicar cada ocurrencia en su día; sacarla de `dateText` obligaba a
 * adivinar el año y a leer los meses en español. `isoDate` es esa misma fecha
 * en "YYYY-MM-DD", o `null` cuando el ciclo no tiene semanas (el mismo caso en
 * que `dateText` llega vacío). Es un campo más: ninguno de los de antes cambia.
 *
 * El repositorio es un objeto en memoria: nada de esto toca la base.
 *
 * Calendario: 2026-08-24 es lunes (semana 1 del ciclo 2026-2 publicado), el
 * 2026-08-30 domingo, el 2026-08-31 lunes, el 2026-12-13 domingo, el
 * 2026-12-28 lunes y el 2027-01-01 viernes.
 */

type Semana = { week_number: number; start_date: string; end_date: string };
type Periodo = { start_date: string; end_date: string };

const armar = (semanas: Semana[], periodo: Periodo | null = null) => {
  const repositorio = {
    findActiveEnrollmentsWithSessions: async () => [],
    findAcademicWeeksForActivePeriod: async () => semanas,
    findActivePeriodDates: async () => periodo,
    findTeacherSessionsWithClasses: async () => [],
    findTeacherAdvisingSessions: async () => [],
  } as unknown as ScheduleRepository;
  return new ScheduleService(repositorio, new EventBus());
};

const DOS_SEMANAS: Semana[] = [
  { week_number: 1, start_date: "2026-08-24", end_date: "2026-08-30" },
  { week_number: 2, start_date: "2026-08-31", end_date: "2026-09-06" },
];

describe("RS-BE-36: isoDate en los dias de GET /schedule/me/sessions", () => {
  test("cada dia trae la fecha de la que sale su dateText", async () => {
    const { days } = await armar(DOS_SEMANAS).getSessions(42);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({
      dayName: "Lunes",
      dateText: "24 de Agosto",
      weekText: "Semana 1 del ciclo",
      isoDate: "2026-08-24",
    });
    expect(days[6]).toEqual({
      dayName: "Domingo",
      dateText: "30 de Agosto",
      weekText: "Semana 1 del ciclo",
      isoDate: "2026-08-30",
    });
    expect(days[13]).toEqual({
      dayName: "Domingo",
      dateText: "6 de Septiembre",
      weekText: "Semana 2 del ciclo",
      isoDate: "2026-09-06",
    });
    expect(days.map((d) => d.isoDate)).toEqual([
      "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
      "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06",
    ]);
  });

  test("una semana que cruza de diciembre a enero lleva el anio de cada dia", async () => {
    // Es el caso que rompía leer la fecha desde dateText: "1 de Enero" no dice
    // de qué año es.
    const { days } = await armar([
      { week_number: 19, start_date: "2026-12-28", end_date: "2027-01-03" },
    ]).getSessions(42);
    expect(days.map((d) => d.isoDate)).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(days[4]).toMatchObject({ dayName: "Viernes", dateText: "1 de Enero", isoDate: "2027-01-01" });
  });

  test("con las semanas derivadas de las fechas del periodo tambien llega", async () => {
    // BR-SCH-04, segundo escalón: sin filas en academic_week, las semanas salen
    // de academic_period. 2026-08-24 a 2026-12-14 son 16 semanas exactas.
    const { days } = await armar([], { start_date: "2026-08-24", end_date: "2026-12-14" }).getSessions(42);
    expect(days).toHaveLength(112);
    expect(days[0]?.isoDate).toBe("2026-08-24");
    expect(days[111]?.isoDate).toBe("2026-12-13");
    expect(days.every((d) => d.isoDate !== null)).toBe(true);
  });

  test("sin semanas los siete dias llegan con isoDate null, igual que dateText vacio", async () => {
    const { days } = await armar([], null).getSessions(42);
    const nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    expect(days).toEqual(
      nombres.map((dayName) => ({ dayName, dateText: "", weekText: "Semana actual", isoDate: null })),
    );
  });

  test("es un campo mas: los de antes siguen ahi y en el mismo orden", async () => {
    const { days } = await armar(DOS_SEMANAS).getSessions(42);
    for (const dia of days) {
      expect(Object.keys(dia)).toEqual(["dayName", "dateText", "weekText", "isoDate"]);
    }
  });

  test("el horario docente, que usa el mismo DayInfo, tambien la trae", async () => {
    const { days } = await armar(DOS_SEMANAS).getTeacherSessions(7);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({
      dayName: "Lunes",
      dateText: "24 de Agosto",
      weekText: "Semana 1 del ciclo",
      isoDate: "2026-08-24",
    });
    expect(days[13]?.isoDate).toBe("2026-09-06");
  });
});
```

Las fechas están comprobadas contra el calendario real: el 2026-08-24, el 2026-08-31, el 2026-12-07 y el 2026-12-28 son lunes; el 2026-08-30, el 2026-09-06 y el 2026-12-13 son domingos; el 2027-01-01 es viernes. Del 2026-08-24 al 2026-12-14 hay 112 días, así que `deriveWeeksFromPeriodDates` da 16 semanas y la última empieza el 2026-12-07 y termina el 2026-12-13. No cambies ninguna.

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/schedule-iso-date.test.ts 2>&1 | grep -E '^\(fail\)|^ *[0-9]+ (pass|fail)|expect\(\) calls|^Ran'
```

Esperado: **FAIL**, con las seis pruebas en rojo. Medido con bun 1.4.2 en una copia aislada de `e2af4fa` (bun agrega el tiempo entre corchetes al final de cada `(fail)` y de la línea `Ran`):

```
(fail) RS-BE-36: isoDate en los dias de GET /schedule/me/sessions > cada dia trae la fecha de la que sale su dateText
(fail) RS-BE-36: isoDate en los dias de GET /schedule/me/sessions > una semana que cruza de diciembre a enero lleva el anio de cada dia
(fail) RS-BE-36: isoDate en los dias de GET /schedule/me/sessions > con las semanas derivadas de las fechas del periodo tambien llega
(fail) RS-BE-36: isoDate en los dias de GET /schedule/me/sessions > sin semanas los siete dias llegan con isoDate null, igual que dateText vacio
(fail) RS-BE-36: isoDate en los dias de GET /schedule/me/sessions > es un campo mas: los de antes siguen ahi y en el mismo orden
(fail) RS-BE-36: isoDate en los dias de GET /schedule/me/sessions > el horario docente, que usa el mismo DayInfo, tambien la trae
 0 pass
 6 fail
 9 expect() calls
Ran 6 tests across 1 file.
```

Es la razón correcta: el archivo carga (el service existe) y cada prueba cae en la primera aserción que mira `isoDate`, porque el campo todavía no sale. Sin el `grep`, el primer error muestra el objeto del lunes 24 de agosto con la línea `-   "isoDate": "2026-08-24",` como la única que falta. Si en cambio sale `Cannot find module` o `0 pass / 1 fail / 1 error`, la prueba no está donde dice el Paso 1.

- [ ] **Paso 3: Implementación mínima**

Los números de línea de este paso y del Paso 6 son los de cada archivo antes de tocarlo: cada reemplazo corre los que siguen, y por eso todos van con ancla de texto.

En `src/modules/schedule/schedule.types.ts`, reemplazar esto (líneas 41-45):

```ts
export type DayInfo = {
  dayName: string;
  dateText: string;
  weekText: string;
};
```

por esto:

```ts
export type DayInfo = {
  dayName: string;
  dateText: string;
  weekText: string;
  /**
   * RS-BE-36 · La misma fecha de `dateText`, como "YYYY-MM-DD" (hora de Lima,
   * sin zona), o `null` cuando el ciclo no tiene semanas y `dateText` llega
   * vacío. `dateText` no trae año ("1 de Enero"): con esto la app sabe qué día
   * exacto es cada columna sin adivinarlo, y pide los bloques propios del
   * ciclo visible (`GET /time-blocks/me/occurrences`).
   */
  isoDate: string | null;
};
```

En `src/modules/schedule/schedule.service.ts`, reemplazar esto, que aparece **dos veces** y letra por letra igual (líneas 220-224 en `getSessions` y 380-384 en `getTeacherSessions`; se reemplazan las dos):

```ts
          daysList.push({
            dayName: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][i],
            dateText: formatDateText(currentDate),
            weekText: `Semana ${weekNum} del ciclo`,
          });
```

por esto:

```ts
          daysList.push({
            dayName: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][i],
            dateText: formatDateText(currentDate),
            weekText: `Semana ${weekNum} del ciclo`,
            isoDate: formatDateOnly(currentDate),
          });
```

Y en el mismo archivo reemplazar esto (líneas 229-233, los siete días de un ciclo sin semanas; aparece una sola vez):

```ts
        daysList.push({
          dayName: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][i],
          dateText: "",
          weekText: "Semana actual",
        });
```

por esto:

```ts
        daysList.push({
          dayName: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][i],
          dateText: "",
          weekText: "Semana actual",
          isoDate: null,
        });
```

Nada más. `formatDateOnly` ya existe en el archivo (`:41-43`) y ya se usa en `buildAssessmentsResult`, así que no hay import nuevo. Comprobar que quedaron los tres cambios:

```bash
cd "${REPO:?}" && for f in src/modules/schedule/schedule.types.ts src/modules/schedule/schedule.service.ts; do grep -n "isoDate" "$f" | sed "s#^#$f:#"; done
```

Esperado, literal:

```
src/modules/schedule/schedule.types.ts:52:  isoDate: string | null;
src/modules/schedule/schedule.service.ts:224:            isoDate: formatDateOnly(currentDate),
src/modules/schedule/schedule.service.ts:234:          isoDate: null,
src/modules/schedule/schedule.service.ts:386:            isoDate: formatDateOnly(currentDate),
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff/schedule-iso-date.test.ts
```

Esperado: **PASS**, `6 pass`, `0 fail`, `29 expect() calls`, `Ran 6 tests across 1 file.` (medido en la copia aislada). Las 29 son 5 + 2 + 4 + 1 + 14 + 3: la de "es un campo mas" mira las llaves de cada uno de los 14 días.

- [ ] **Paso 5: Comprobar que el huso del sistema no mueve nada**

```bash
cd "${REPO:?}" && for z in America/Lima UTC Asia/Tokyo; do echo -n "$z: "; TZ=$z DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU35_jeff/schedule-iso-date.test.ts 2>&1 | grep -E "^ [0-9]+ (pass|fail)" | tr '\n' ' '; echo; done
```

Esperado, literal (medido):

```
America/Lima:  6 pass  0 fail 
UTC:  6 pass  0 fail 
Asia/Tokyo:  6 pass  0 fail 
```

`formatDateOnly` y `formatDateText` usan los getters UTC sobre una fecha armada con `Date.UTC`: si alguien cambiara uno a hora local, en Lima el día se correría uno para atrás y esta corrida lo mostraría.

- [ ] **Paso 6: Documentar `isoDate` en el contrato y en la spec del horario**

En `docs/specs/api-contracts.md`, reemplazar esto (líneas 372-375):

```markdown
### GET /schedule/me/sessions
Retorna el horario semanal por bloques de tiempo para las secciones donde el estudiante se encuentra matriculado activamente.
- **Auth**: Bearer token
- **Response** `200 OK`:
```

por esto:

```markdown
### GET /schedule/me/sessions
Retorna el horario semanal por bloques de tiempo para las secciones donde el estudiante se encuentra matriculado activamente.
- **Auth**: Bearer token
- **`isoDate`** (RS-BE-36, `specs/features/time-blocks/time-blocks.spec.md`): cada elemento de `days` trae la fecha de ese día como `"YYYY-MM-DD"`, en hora de Lima, la misma de la que sale `dateText`; vale `null` cuando el ciclo no tiene semanas (entonces `dateText` es `""` y `weekText` es `"Semana actual"`). `dateText` no trae año: quien necesite la fecha exacta —la app, para pedir `GET /time-blocks/me/occurrences` del ciclo visible y ubicar cada ocurrencia en su día— usa `isoDate` y no lee `dateText`. Es un campo más: ninguno de los de antes cambia, y `GET /schedule/teacher/sessions` también lo trae.
- **Response** `200 OK`:
```

Y en el mismo archivo reemplazar esto (líneas 381-383, dentro del ejemplo de `days`; aparece una sola vez):

```json
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo"
      }
```

por esto:

```json
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo",
        "isoDate": "2026-01-12"
      }
```

El 2026-01-12 es el lunes del "12 de Enero" del ejemplo. En `specs/features/schedule/schedule.spec.md`, reemplazar esto (líneas 25-27, el final de BR-SCH-01):

```markdown
- **Auth**: Bearer token (vía `authMiddleware`).

### BR-SCH-02: GET /schedule/me/assessments — Evaluation calendar
```

por esto:

```markdown
- Cada día de `days` trae además `isoDate`: la misma fecha de `dateText` como `"YYYY-MM-DD"` (hora de Lima), o `null` cuando no hay semanas y `dateText` llega vacío. `dateText` no trae año; la app usa `isoDate` para pedir sus bloques propios del ciclo visible y ubicarlos en su día (`specs/features/time-blocks/time-blocks.spec.md`, RS-BE-36). Es un campo más: ninguno de los de antes cambia, y el horario docente (`GET /schedule/teacher/sessions`) también lo trae.
  `[@test] ../../../test/HU35_jeff/schedule-iso-date.test.ts`
- **Auth**: Bearer token (vía `authMiddleware`).

### BR-SCH-02: GET /schedule/me/assessments — Evaluation calendar
```

Reemplazar esto (línea 48; la codificación rota de la línea 57 de esta spec no se toca):

```markdown
  3. Si no hay ningún período activo, lista vacía: cada método consumidor ya degrada a "sin info de semana" (`weekText: "Semana actual"`, `dateText: ""`, o listas vacías) en vez de lanzar.
```

por esto:

```markdown
  3. Si no hay ningún período activo, lista vacía: cada método consumidor ya degrada a "sin info de semana" (`weekText: "Semana actual"`, `dateText: ""` e `isoDate: null`, o listas vacías) en vez de lanzar.
```

Y reemplazar esto (líneas 78-80, el ejemplo de `days` de `GET /schedule/me/sessions`; aparece una sola vez en este archivo):

```json
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo"
      }
```

por esto:

```json
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo",
        "isoDate": "2026-01-12"
      }
```

Comprobarlo:

```bash
cd "${REPO:?}" && for f in docs/specs/api-contracts.md specs/features/schedule/schedule.spec.md src/modules/schedule/schedule.types.ts src/modules/schedule/schedule.service.ts; do echo "$f:$(grep -c "isoDate" "$f")"; done; git diff --numstat -- docs specs src && git diff -U0 -- docs specs src | grep -nE '^\+.*\b[0-9]{8}\b'; echo "fin"
```

Esperado, literal (medido en una copia con la Tarea 6 ya aplicada; con un tabulador entre las columnas del `numstat`):

```
docs/specs/api-contracts.md:2
specs/features/schedule/schedule.spec.md:3
src/modules/schedule/schedule.types.ts:1
src/modules/schedule/schedule.service.ts:3
3	1	docs/specs/api-contracts.md
5	2	specs/features/schedule/schedule.spec.md
3	0	src/modules/schedule/schedule.service.ts
8	0	src/modules/schedule/schedule.types.ts
fin
```

Ninguna línea agregada lleva un número de ocho dígitos. Las líneas borradas son las tres que ganan una coma o `isoDate` (`"weekText": …` en los dos ejemplos y el punto 3 de BR-SCH-04): nada existente cambia de sentido. La copia del frontend (`ULima_Frontend_IS2/docs/specs/api-contracts.md`) está en otro repo y la actualiza su propio plan.

- [ ] **Paso 7: Build, la carpeta HU35 y la suite completa**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff 2>&1 | tail -n 4
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test 2>&1 | tail -n 4
```

Esperado:

- `$ tsc` sin ningún error y exit 0. Es el que comprueba que ningún `daysList.push` quedó sin `isoDate`: con el campo obligatorio en `DayInfo`, un día sin él es `error TS2741`.
- `test/HU35_jeff`: `221 pass`, `0 fail`, `738 expect() calls`, `Ran 221 tests across 7 files`: los 215 y 709 de las Tareas 1 a 6 (19 + 24 + 30 + 60 + 59 + 23, con 72 + 60 + 105 + 134 + 227 + 111) más los 6 y 29 de esta.
- Suite completa: `1707 pass`, `0 fail`, `5967 expect() calls`, `Ran 1707 tests across 115 files`. Es la línea base de la Tarea 1 (`1486 / 5229 / 108`) más esos 221 y 738 en 7 archivos. En la copia aislada, con solo esta tarea aplicada sobre `e2af4fa`, la suite dio `1492 pass`, `0 fail`, `5258 expect() calls` y 109 archivos: ninguna prueba vieja mira la forma exacta de `days`.

Si falla algo fuera de `test/HU35_jeff`, **PARAR**: ninguna prueba vieja debería notar un campo más.

- [ ] **Paso final: Commit**

```bash
cd "${REPO:?}" && git add src/modules/schedule/schedule.types.ts src/modules/schedule/schedule.service.ts test/HU35_jeff/schedule-iso-date.test.ts docs/specs/api-contracts.md specs/features/schedule/schedule.spec.md && git commit -m "feat(schedule): cada dia del horario trae su fecha exacta en isoDate (RS-BE-36)" -m "GET /schedule/me/sessions suma isoDate (YYYY-MM-DD, hora de Lima) a cada dia de days, sacado de la misma fecha que dateText, o null cuando el ciclo no tiene semanas. Es aditivo: ningun campo cambia. La app lo usa para pedir las ocurrencias de los bloques propios del ciclo visible sin leer fechas en español. El horario docente comparte DayInfo y tambien lo trae." && git show --name-only --format= HEAD && git status --short
```

Esperado: el commit lleva exactamente estos cinco archivos, y `git status --short` no imprime nada después:

```
docs/specs/api-contracts.md
specs/features/schedule/schedule.spec.md
src/modules/schedule/schedule.service.ts
src/modules/schedule/schedule.types.ts
test/HU35_jeff/schedule-iso-date.test.ts
```

Sin trailer Co-Authored-By, sin push y sin PR. El autor ya está configurado en git.
### Tarea 8: Cierre: suite, build y la migración (PARAR)

Esta tarea no escribe código de producto ni pruebas del repo. Su trabajo es demostrar, con comandos y salidas medidas, que la rama `feat/bloques-horario` quedó entera. Eso incluye la suite completa comparada con la línea base que midió la Tarea 1, el build limpio, cada `[@test]` de la spec apuntando a un archivo que existe, cada prueba nueva enlazada, cada archivo de `src/` y `drizzle/` cubierto por un `target`, y ningún dato real en un repo que es **público**. Termina con un **PARAR**: la migración `drizzle/0012_time_blocks.sql` la aplica el dueño. Hasta que lo haga no se mergea ni se despliega nada.

Por qué importa el orden: las siete rutas de `/time-blocks` leen o escriben `student_time_block`. Si el backend nuevo llega a producción antes que las tablas, Postgres responde `relation "student_time_block" does not exist` y el `errorHandler` lo convierte en `500 INTERNAL_SERVER_ERROR` (`src/shared/middleware/error-handler.ts:18-28`) para todo alumno que abra la pantalla nueva. A diferencia del récord, el resto de la app sigue funcionando, porque nada fuera del módulo toca esas tablas y nada las lee al arrancar. Y si la app sale antes que el backend, sus llamadas a `/time-blocks/...` reciben el 404 por defecto de Hono, un texto plano `404 Not Found` y no el `{ "error": … }` que el cliente sabe leer, y los días de `GET /schedule/me/sessions` llegan sin `isoDate` (RS-BE-36). Así que el orden es: **migración → backend → app**, que es el que exige `MIGRATIONS.md:49` ("el SQL se aplica en la BD ANTES del merge/deploy del código que lo usa").

**Archivos:**
- Crear: `$SCRATCH/cierre-bloques/verificar-cierre.sh` (fuera del repo, en el scratchpad; **no** se commitea)
- Crear (salidas para el informe, también fuera del repo): `$SCRATCH/cierre-bloques/spec-sin-enlace.md`, `$SCRATCH/cierre-bloques/rojo.txt`, `$SCRATCH/cierre-bloques/verde.txt` y `$SCRATCH/cierre-bloques/suite-final.txt`
- Modificar (**solo si falta**, ver Paso 3): `specs/features/time-blocks/time-blocks.spec.md:104-108`, que es el enlace de la Tarea 3 bajo RS-BE-31, y `:129-131`, que es el enlace de la Tarea 4 bajo RS-BE-32. Esos números son los de la spec que deja la Tarea 1: con la línea de la Tarea 3 puesta, el segundo bloque baja a `130-132`. Hay que guiarse por el texto del ancla y no por el número. Lo normal es que las Tareas 3 y 4 ya hayan dejado los dos enlaces y que esta tarea no toque nada del repo.
- Test: `$SCRATCH/cierre-bloques/verificar-cierre.sh` y la suite completa (`test/**/*.test.ts`, que son **115** archivos al terminar la rama).
- No se toca: nada de `src/`, `drizzle/` ni `test/`, y tampoco `README.md`, `MIGRATIONS.md`, `AGENTS.md` ni `drizzle/meta/`.

**Interfaces:**

- Consume, de las Tareas 1 a 7: los siete archivos de prueba, cada uno con la cifra que reportó su propio Paso 4. Es la cifra con la que se compara acá. Esta tarea **no ajusta ninguna** a mano, porque la comparación sirve justamente para detectar una tarea que no quedó como dice su Paso 4:

  | archivo | pruebas | `expect()` | quién lo dejó así |
  |:---|---:|---:|:---|
  | `test/HU35_jeff/migration-0012.test.ts` | 19 | 72 | Tarea 1 |
  | `test/HU35_jeff/time-blocks-expansion.test.ts` | 24 | 60 | Tarea 2 |
  | `test/HU35_jeff/time-blocks.repository.test.ts` | 30 | 105 | Tarea 3 |
  | `test/HU35_jeff/time-blocks.service.test.ts` | 60 | 134 | Tarea 4 |
  | `test/HU35_jeff/time-blocks.routes.test.ts` | 59 | 227 | Tarea 5 |
  | `test/HU35_jeff/chatbot-isolation-blocks.test.ts` | 23 | 111 | Tarea 6 |
  | `test/HU35_jeff/schedule-iso-date.test.ts` | 6 | 29 | Tarea 7 |
  | **total** | **221** | **738** | 7 archivos |

  La fila de la Tarea 6 sale de su prueba: 1 guarda contra carpeta vacía + 2 pruebas por cada uno de los **11** `.ts` de `src/modules/chatbot/` = 23, con 111 aserciones. Es la única cifra que depende de un conteo del árbol. Si el Paso 4 de la Tarea 6 reportó otra, manda la de la Tarea 6: se corrige esa línea de la `TABLA` del script y se suma la diferencia a los totales del Paso 5.
- Consume, de las Tareas 3 y 4: la spec con **9** líneas `[@test]` que apuntan a **7** archivos distintos, en las líneas `55, 106, 107, 132, 133, 155, 176, 185, 204`. Es la salida literal que fija el Paso 7 de la Tarea 4; la de la línea 204 (RS-BE-36) viene de la reconciliación de la spec y su archivo lo crea la Tarea 7.
- Consume, de la Tarea 1: la línea base medida sobre `e2af4fa`, que es **1486 pass, 0 fail, 5229 expect(), 108 archivos**.
- Consume, de la Tarea 5 (su Paso 8): el aviso de textos que ve el alumno, que el Paso 9 copia tal cual. Del commit de su Paso final, el asunto `feat(time-blocks): controller, siete rutas, registro del modulo y PATCH en el CORS (RS-BE-31, RS-BE-32, RS-BE-33)`.
- Consume, de la Tarea 6 (su Paso final): el asunto del commit, `test(time-blocks): el chatbot no ve los bloques propios (RS-BE-35) y contrato de las siete rutas`, y los "Pendientes para el dueño (Tarea 6)": el README, que ya está en el punto 6 del informe, y la constancia de que el contrato coincide con la spec.
- Consume, de la Tarea 7 (su Paso final): el asunto del commit, `feat(schedule): cada dia del horario trae su fecha exacta en isoDate (RS-BE-36)`.
- Consume, de la Tarea 1 (su Paso 0): la spec ya dice **APROBADA** en sus líneas 16-17, reconciliada con este plan, y ese cambio va en el commit de la Tarea 1 (o en uno propio anterior, si la reconciliación ya se había commiteado aparte; el Paso 0 de la Tarea 1 lo dice).
- Consume, del repo (verificado sobre `e2af4fa`):
  - `package.json:9` → `"build": "tsc"`. `tsconfig.json` compila solo `src/`.
  - `package.json:25` → `"db:apply": "bun run src/db/apply-migration.ts"`. Ese script hace `import "dotenv/config"` (`:12`), envuelve todo el SQL en `sql.begin(...)` + `tx.unsafe(content)` (`:35-37`) e imprime `✓ Migración aplicada: <archivo>` (`:38`) o `✗ Migración falló (ROLLBACK): …` (`:47`).
  - `bunfig.toml:3` → `preload = ["./test/env.setup.ts"]`, y `test/env.setup.ts:6` hace `process.env.DATABASE_URL ||= …`: solo rellena lo que falta. Por eso el prefijo `DATABASE_URL=postgres://user:pass@localhost:5432/test` es obligatorio: sin él bun carga el `.env` del worktree, que apunta a **producción**.
  - `.gitignore:5` → `dist/` y `.gitignore:53` → `backup_*.sql`.
  - `MIGRATIONS.md:9-14`: el cliente `pg_dump`/`psql` va por ruta completa (`/opt/homebrew/opt/libpq/bin/…`, hoy es la versión 18.6; el de `postgresql@16` se niega contra el servidor 17), y el wifi de la ULima bloquea el 5432. En `:45-52` está el protocolo manual: punto 3, el orden; punto 4, aplica una sola persona (Jeff) y con respaldo; punto 6, el freeze de 48 h antes de una demo. En `:106-108` está el registro, cuya primera entrada hoy es la 0011.
  - `drizzle/meta/_journal.json` termina en `0009_avatar`: la 0012 no se registra ahí.
  - `src/server.ts:20` → `allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]` sobre `e2af4fa`; la Tarea 5 le agrega `PATCH`. `src/server.ts:54-60` → `GET /version` con el SHA desplegado.
  - `src/shared/middleware/auth-middleware.ts:26` → sin token, `401 MISSING_TOKEN`.
  - `scripts/verificar-readme.py`: sobre `e2af4fa` sale **0** con las doce afirmaciones en verde.
  - `README.md:32` → la API en producción es `https://u-lima-backend-is-2-one.vercel.app`.
- Produce: **nada**. No hay tarea posterior, ni firma nueva, ni archivo nuevo en el repo. Lo que entrega es el informe del Paso 9 y la rama lista para que el dueño decida.

Todos los comandos se corren desde la raíz del worktree `$REPO`, rama `feat/bloques-horario`. Cada bloque `bash` empieza con sus guardas (`: "${SCRATCH:?…}"`, `: "${BUN:?…}"`) y se corre **entero, en una sola llamada de shell**, después del `export` de "Variables de los comandos", porque las variables no sobreviven de una llamada a otra. **No abras, no imprimas y no copies `.env`**, y no corras nada contra la base: ni `db:apply`, `db:push`, `db:migrate`, `db:generate`, `db:seed`, ni `psql`.

- [ ] **Paso 1: Escribir la prueba que falla**

  La "prueba" de esta tarea es un guardia de cierre: un script que revisa la rama entera y sale 1 si algo no cuadra. Vive en el scratchpad porque no prueba el producto, sino que deja constancia de que la rama quedó completa. Crear la carpeta:

```bash
: "${SCRATCH:?define SCRATCH como dice Restricciones globales}"
mkdir -p "$SCRATCH/cierre-bloques"
```

  Y crear `$SCRATCH/cierre-bloques/verificar-cierre.sh` con este contenido completo:

```bash
#!/usr/bin/env bash
# Tarea 8 · Verificación de cierre de feat/bloques-horario (RS-BE-30 a RS-BE-36).
#
# Vive en el scratchpad y NUNCA entra al repo: no prueba el producto, deja constancia
# de que la rama quedó entera. Sale 0 si todo cuadra y 1 si algo falla.
#
#   bash verificar-cierre.sh              revisa la spec real
#   bash verificar-cierre.sh <copia.md>   revisa esa copia de la spec (así se la ve fallar)
#
# No toca la base: cada prueba corre con una DATABASE_URL de mentira, porque el .env
# del worktree apunta a PRODUCCIÓN y bun lo carga solo.
set -u
export LC_ALL=C   # orden de glob y de sort igual en cualquier terminal

REPO="${REPO:?define REPO como dice Restricciones globales}"
BUN="${BUN:?define BUN como dice Restricciones globales}"
BASE=e2af4fa   # docs(time-blocks): spec de los bloques de horario propios
SPEC_REAL="$REPO/specs/features/time-blocks/time-blocks.spec.md"
SPEC="${1:-$SPEC_REAL}"
case "$SPEC" in /*) ;; *) SPEC="$PWD/$SPEC" ;; esac   # antes del cd de abajo
# Las rutas de [@test] y de targets son relativas a la carpeta de la spec REAL,
# aunque se revise una copia que vive en otro lado.
DIR_SPEC="$(dirname "$SPEC_REAL")"

fallos=0
falla() { echo "FALLA $*"; fallos=$((fallos + 1)); }

cd "$REPO" || { echo "No existe $REPO"; exit 2; }
[ -x "$BUN" ] || { echo "No encuentro bun en $BUN"; exit 2; }
[ -f "$SPEC" ] || { echo "No existe la spec $SPEC"; exit 2; }

echo "== 1. Enlaces [@test] de la spec"
n=$(grep -c '\[@test\]' "$SPEC")
[ "$n" = 9 ] || falla "[@test]: $n líneas (se esperaban 9)"
enlazados=$(grep -o '\[@test\] [^`]*' "$SPEC" | sed 's/^\[@test\] //' | sort -u)
nd=$(printf '%s\n' "$enlazados" | grep -c .)
[ "$nd" = 7 ] || falla "[@test]: $nd archivos distintos (se esperaban 7)"
while read -r p; do
  [ -n "$p" ] || continue
  if [ -f "$DIR_SPEC/$p" ]; then echo "OK    $p"; else falla "enlace a un archivo que no existe: $p"; fi
done <<< "$enlazados"

echo "== 2. Cada prueba de test/HU35_jeff está enlazada desde la spec"
for f in test/HU35_jeff/*.test.ts; do
  if grep -qF "[@test] ../../../$f" "$SPEC"; then echo "OK    $f"; else falla "SIN ENLACE $f"; fi
done

echo "== 3. Cada archivo de HU35 da lo que reportó su tarea en su Paso 4"
while read -r archivo pruebas expects tarea; do
  salida=$(DATABASE_URL=postgres://user:pass@localhost:5432/test "$BUN" test "test/HU35_jeff/$archivo" 2>&1 </dev/null)
  p=$(printf '%s\n' "$salida" | sed -n 's/^ *\([0-9][0-9]*\) pass$/\1/p')
  f=$(printf '%s\n' "$salida" | sed -n 's/^ *\([0-9][0-9]*\) fail$/\1/p')
  e=$(printf '%s\n' "$salida" | sed -n 's/^ *\([0-9][0-9]*\) expect() calls$/\1/p')
  if [ "$p" = "$pruebas" ] && [ "$f" = 0 ] && [ "$e" = "$expects" ]; then
    echo "OK    $archivo  $p pass  0 fail  $e expect()  ($tarea)"
  else
    falla "$archivo: ${p:-?} pass, ${f:-?} fail, ${e:-?} expect() (se esperaban $pruebas, 0 y $expects: $tarea)"
  fi
done <<'TABLA'
migration-0012.test.ts 19 72 Tarea-1
time-blocks-expansion.test.ts 24 60 Tarea-2
time-blocks.repository.test.ts 30 105 Tarea-3
time-blocks.service.test.ts 60 134 Tarea-4
time-blocks.routes.test.ts 59 227 Tarea-5
chatbot-isolation-blocks.test.ts 23 111 Tarea-6
schedule-iso-date.test.ts 6 29 Tarea-7
TABLA

echo "== 4. targets: existen y cubren todo lo que la rama tocó en src/ y drizzle/"
targets=$(sed -n '/^targets:/,/^---$/p' "$SPEC" | grep '^  - ' | sed 's/^  - //')
nt=$(printf '%s\n' "$targets" | grep -c .)
[ "$nt" = 7 ] || falla "targets: $nt (se esperaban 7)"
while read -r t; do
  [ -n "$t" ] || continue
  b="${t%/\*\*}"
  if [ -e "$DIR_SPEC/$b" ]; then echo "OK    $t"; else falla "target sin archivo: $t"; fi
done <<< "$targets"
cambios=$(git diff --name-only "$BASE"..HEAD -- src drizzle)
nc=$(printf '%s\n' "$cambios" | grep -c .)
[ "$nc" = 14 ] || falla "la rama tocó $nc archivos de src/ y drizzle/ (se esperaban 14)"
while read -r f; do
  [ -n "$f" ] || continue
  if printf '%s\n' "$targets" | grep -qxF "../../../$f" \
     || printf '%s\n' "$targets" | grep -qxF "../../../${f%/*}/**"; then
    echo "OK    $f"
  else
    falla "SIN TARGET $f"
  fi
done <<< "$cambios"

echo "== 5. Privacidad: el repo es público"
anadidas=$(git diff "$BASE"..HEAD -- src test specs drizzle docs/specs | grep -E '^\+' | grep -vE '^\+\+\+ ')
otros=$(printf '%s\n' "$anadidas" | grep -oE '\b[0-9]{8}\b' | sort -u | grep -vx 20230001)
if [ -z "$otros" ]; then
  echo "OK    ningún número de ocho dígitos en las líneas añadidas salvo el código sintético 20230001"
else
  falla "números de ocho dígitos en líneas añadidas, revisar uno por uno: $(echo $otros)"
fi
if printf '%s\n' "$anadidas" | grep -qE 'neon\.tech|sslmode=|ep-[a-z0-9]{6}|postgres(ql)?://'; then
  falla "host o credencial en una línea añadida"
else
  echo "OK    ningún host ni credencial en las líneas añadidas"
fi
if grep -rnE "(from|import\(|Bun\.file\(|readFileSync\()[[:space:]]*[\"'][^\"']*(HU31_jeff|spike-portal)" test/HU35_jeff; then
  falla "una prueba HU35 lee material de test/HU31_jeff o de spike-portal"
else
  echo "OK    ninguna prueba HU35 lee fixtures de HU31 ni de spike-portal"
fi
if grep -rnE "/Users/|private/tmp/" src test specs drizzle docs/specs; then
  falla "una ruta de esta máquina quedó dentro del árbol"
else
  echo "OK    ninguna ruta de esta máquina (/Users/…, /private/tmp/…) dentro del árbol"
fi
# El plan, si se commiteó en docs/superpowers/plans/, también. Se miran solo las
# líneas que agrega la rama: los planes viejos de esa carpeta ya traen rutas.
# El patrón no se encuentra a sí mismo: detrás de "/Users/" y de "claude-" hay
# un "[", que no es una letra ni un dígito.
if git diff "$BASE"..HEAD -- docs/superpowers/plans | grep -E '^\+' | grep -vE '^\+\+\+ ' \
   | grep -nE "/Users/[a-z]|private/tmp/claude-[0-9]"; then
  falla "el plan commiteado en docs/superpowers/plans fija una ruta de esta máquina"
else
  echo "OK    el plan, si se commiteó, no fija rutas de esta máquina"
fi

echo
if [ "$fallos" -eq 0 ]; then echo "CIERRE OK"; exit 0; fi
echo "CIERRE CON $fallos FALLA(S)"
exit 1
```

  Detalles que no son de estilo:

  - Está escrito para el `/bin/bash` 3.2 de macOS: no usa arreglos asociativos y los `while` leen con `<<<` y no con una tubería, para que `fallos` no se pierda en una subshell. Se probó con `/bin/bash` 3.2.57 en una copia aislada del worktree con las Tareas 1 a 6 aplicadas desde sus planes: da las salidas de los Pasos 2 y 4. También se lo vio morder sembrando en esa copia un commit con un cambio en `src/server.ts` (que entonces no era target; hoy haría falta sembrarlo en un archivo de `src/` que no lo sea, como `src/modules/chatbot/chatbot.service.ts`), un número de ocho dígitos, una URL `postgres://…neon.tech`, un `import` desde `../HU31_jeff/` y una ruta `/Users/…`: salieron las seis `FALLA` que corresponden. El quinto chequeo de la sección 5 (el plan en `docs/superpowers/plans/`), la `TABLA` de la sección 3 y los conteos que cambió la reconciliación de la spec del 2026-09-21 (9 `[@test]` hacia 7 archivos, 7 targets, 14 archivos de `src/` y `drizzle/`, la fila de la Tarea 7) se agregaron o cambiaron después de esa corrida: su salida en los Pasos 2 y 4 está deducida del script y de la spec, no medida.
  - `export LC_ALL=C` fija el orden del glob de la sección 2 y de los `sort`, para que la salida del Paso 4 sea la misma en cualquier terminal.
  - La sección 2 exige el prefijo `[@test] ` delante de la ruta. Que la ruta aparezca en otra parte de la spec, en prosa, no cuenta como enlace.
  - Cada `bun test` de la sección 3 corre con `</dev/null`, para que nada pueda comerse las filas que quedan de la `TABLA`, que llegan por la entrada estándar del `while`.
  - La búsqueda de números toma **cualquier** número de ocho dígitos, no solo los que empiezan con `20`: así también saldría un DNI. `2147483647`, el tope de las secuencias de la 0012, tiene diez dígitos y no entra.
  - La sección 5 revisa `src test specs drizzle docs/specs` enteros, y de `docs/superpowers/plans/` solo las líneas que agrega la rama: si este plan se commitea ahí, como pasó con el del récord, no puede fijar una ruta de esta máquina (por eso usa `$REPO`, `$BUN` y `$SCRATCH`), pero los planes viejos de esa carpeta sí traen rutas y no son de esta rama. El `postgres://user:pass@localhost…` de mentira del plan no cuenta como credencial: el chequeo de hosts mira solo las carpetas del producto.
  - El grep de fixtures busca **lecturas**, que son `from`, `import(`, `Bun.file(` y `readFileSync(`, y no la cadena `HU31_jeff` a secas. `time-blocks.repository.test.ts` (Tarea 3) cita en un comentario `test/HU31_jeff/repository.progress-batch.test.ts` como patrón, y ese comentario no debe dar un falso positivo.

  Comprobar la sintaxis:

```bash
: "${SCRATCH:?define SCRATCH como dice Restricciones globales}"
/bin/bash -n "$SCRATCH/cierre-bloques/verificar-cierre.sh" && echo "sintaxis OK"
```

  Esperado: `sintaxis OK`.

- [ ] **Paso 2: Correr la prueba y ver que falla**

  El guardia tiene que fallar por la razón correcta, que es una prueba de la rama sin enlace desde la spec. Para verlo **sin tocar el repo**, se le pasa una copia de la spec a la que se le quitó el enlace de la Tarea 3:

```bash
: "${SCRATCH:?define SCRATCH como dice Restricciones globales}"
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && grep -v 'time-blocks.repository.test.ts' specs/features/time-blocks/time-blocks.spec.md > "$SCRATCH/cierre-bloques/spec-sin-enlace.md"; diff specs/features/time-blocks/time-blocks.spec.md "$SCRATCH/cierre-bloques/spec-sin-enlace.md"; /bin/bash "$SCRATCH/cierre-bloques/verificar-cierre.sh" "$SCRATCH/cierre-bloques/spec-sin-enlace.md" > "$SCRATCH/cierre-bloques/rojo.txt"; echo "exit=$?"; grep -E '^(FALLA|CIERRE)' "$SCRATCH/cierre-bloques/rojo.txt"
```

  Esperado: **FAIL**, con `exit=1` y exactamente estas líneas (la forma se midió en una copia aislada con las Tareas 1 a 6 de la versión anterior del plan; los números son los de la spec reconciliada con los enlaces de las Tareas 3 y 4):

```
107d106
< `[@test] ../../../test/HU35_jeff/time-blocks.repository.test.ts`
exit=1
FALLA [@test]: 8 líneas (se esperaban 9)
FALLA [@test]: 6 archivos distintos (se esperaban 7)
FALLA SIN ENLACE test/HU35_jeff/time-blocks.repository.test.ts
CIERRE CON 3 FALLA(S)
```

  Las tres `FALLA` son la misma causa vista desde los dos lados: la spec perdió un enlace, y hay una prueba en `test/HU35_jeff/` que ya nadie cita. Eso es lo que exige `AGENTS.md:26` ("Si agregas tests, enlázalos en la spec con `[@test]`").

  - Si `diff` no imprime nada, a la spec **real** ya le falta el enlace de la Tarea 3. Se completa en el Paso 3.
  - Si aparece `exit=2`, el script no encontró el repo, bun o la copia. Revisar las rutas antes de seguir.
  - Si aparece **cualquier otra** `FALLA`, ya no es el rojo provocado: es un problema real de la rama. Anotarlo y resolverlo según el Paso 3.

- [ ] **Paso 3: Implementación mínima**

  Lo único que esta tarea puede cambiar en el repo es un `[@test]` que falte en la spec. Primero mirar el estado real:

```bash
cd "${REPO:?}" && grep -n "@test" specs/features/time-blocks/time-blocks.spec.md
```

  Esperado, literal (es lo que dejó el Paso 7 de la Tarea 4):

```
55:`[@test] ../../../test/HU35_jeff/migration-0012.test.ts`
106:`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
107:`[@test] ../../../test/HU35_jeff/time-blocks.repository.test.ts`
132:`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
133:`[@test] ../../../test/HU35_jeff/time-blocks.service.test.ts`
155:`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`
176:`[@test] ../../../test/HU35_jeff/time-blocks-expansion.test.ts`
185:`[@test] ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts`
204:`[@test] ../../../test/HU35_jeff/schedule-iso-date.test.ts`
```

  **Caso normal: salen las nueve. No se edita nada** y se pasa al Paso 4.

  **Si falta la de `time-blocks.repository.test.ts`**, la Tarea 3 se saltó su Paso 6. En `specs/features/time-blocks/time-blocks.spec.md`, al final de RS-BE-31, reemplazar esto:

```markdown
`DELETE` borra el bloque y sus excepciones en cascada.

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`

### RS-BE-32 — Excepciones: un día suelto
```

  por esto:

```markdown
`DELETE` borra el bloque y sus excepciones en cascada.

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.repository.test.ts`

### RS-BE-32 — Excepciones: un día suelto
```

  **Si falta la de `time-blocks.service.test.ts`**, la Tarea 4 se saltó su Paso 7. En el mismo archivo, al final de RS-BE-32, reemplazar esto:

```markdown
Es idempotente: repetir el mismo `PUT` deja el mismo estado (`on conflict do update`).

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
```

  por esto:

```markdown
Es idempotente: repetir el mismo `PUT` deja el mismo estado (`on conflict do update`).

`[@test] ../../../test/HU35_jeff/time-blocks.routes.test.ts`
`[@test] ../../../test/HU35_jeff/time-blocks.service.test.ts`
```

  Las dos anclas aparecen una sola vez en el archivo; se comprobó sobre la spec reconciliada. Cada reemplazo se aplica **solo si su línea falta**: el ancla de RS-BE-32 sigue apareciendo aunque el enlace de la Tarea 4 ya esté (queda como prefijo del bloque de dos líneas), y aplicarlo otra vez duplicaría el `[@test]` del service. La línea `[@test] …/time-blocks.routes.test.ts` sí aparece dos veces, pero cada ancla la toma pegada a un texto único. **No agregues ningún otro `[@test]` y no cambies el texto de ningún requisito**: la spec está aprobada, y las nueve líneas ya cubren RS-BE-30 a RS-BE-36.

  Qué hacer con las otras `FALLA` que pueda dar el guardia. **Ninguna se arregla acá:**

  - Sección 3, un archivo con otra cifra: esa tarea no quedó como dice su Paso 4. Vuelve a ella y compara contra su Paso 4. No cambies la `TABLA` para que cuadre. La única excepción es la fila de la Tarea 6, explicada en **Interfaces**.
  - Sección 4, `SIN TARGET`: una tarea tocó un archivo que la spec aprobada no autoriza (`AGENTS.md:24`, "Implementa solo archivos incluidos en targets"). Vuelve a esa tarea y revierte el archivo. No inventes un target.
  - Sección 5, cualquier `FALLA`: **PARAR** y avisar al dueño **sin** hacer push. Un código real, un host o una ruta de máquina en un repo público se saca antes de publicar la rama, y reescribir la historia local para sacarlo lo decide él. Al reportarlo no transcribas el número: bastan el archivo y la línea.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
: "${SCRATCH:?define SCRATCH como dice Restricciones globales}"
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && /bin/bash "$SCRATCH/cierre-bloques/verificar-cierre.sh" > "$SCRATCH/cierre-bloques/verde.txt"; echo "exit=$?"; cat "$SCRATCH/cierre-bloques/verde.txt"
```

  El código de salida se toma antes del `cat` y sin tubería a propósito: la shell de las herramientas es zsh, donde `${PIPESTATUS[0]}` no existe y saldría vacío.

  Esperado: **PASS**, con `exit=0` y esta salida literal. La versión anterior se midió en la copia aislada con las Tareas 1 a 6 aplicadas; las filas de la sección 3, las líneas que agregó la reconciliación (la prueba y los targets de la Tarea 7, y `src/server.ts`) y la última línea de la sección 5 son las de la revisión (ver "Cifras de las pruebas"):

```
exit=0
== 1. Enlaces [@test] de la spec
OK    ../../../test/HU35_jeff/chatbot-isolation-blocks.test.ts
OK    ../../../test/HU35_jeff/migration-0012.test.ts
OK    ../../../test/HU35_jeff/schedule-iso-date.test.ts
OK    ../../../test/HU35_jeff/time-blocks-expansion.test.ts
OK    ../../../test/HU35_jeff/time-blocks.repository.test.ts
OK    ../../../test/HU35_jeff/time-blocks.routes.test.ts
OK    ../../../test/HU35_jeff/time-blocks.service.test.ts
== 2. Cada prueba de test/HU35_jeff está enlazada desde la spec
OK    test/HU35_jeff/chatbot-isolation-blocks.test.ts
OK    test/HU35_jeff/migration-0012.test.ts
OK    test/HU35_jeff/schedule-iso-date.test.ts
OK    test/HU35_jeff/time-blocks-expansion.test.ts
OK    test/HU35_jeff/time-blocks.repository.test.ts
OK    test/HU35_jeff/time-blocks.routes.test.ts
OK    test/HU35_jeff/time-blocks.service.test.ts
== 3. Cada archivo de HU35 da lo que reportó su tarea en su Paso 4
OK    migration-0012.test.ts  19 pass  0 fail  72 expect()  (Tarea-1)
OK    time-blocks-expansion.test.ts  24 pass  0 fail  60 expect()  (Tarea-2)
OK    time-blocks.repository.test.ts  30 pass  0 fail  105 expect()  (Tarea-3)
OK    time-blocks.service.test.ts  60 pass  0 fail  134 expect()  (Tarea-4)
OK    time-blocks.routes.test.ts  59 pass  0 fail  227 expect()  (Tarea-5)
OK    chatbot-isolation-blocks.test.ts  23 pass  0 fail  111 expect()  (Tarea-6)
OK    schedule-iso-date.test.ts  6 pass  0 fail  29 expect()  (Tarea-7)
== 4. targets: existen y cubren todo lo que la rama tocó en src/ y drizzle/
OK    ../../../src/modules/time-blocks/**
OK    ../../../src/modules/index.ts
OK    ../../../src/server.ts
OK    ../../../src/modules/schedule/schedule.service.ts
OK    ../../../src/modules/schedule/schedule.types.ts
OK    ../../../src/db/schema/schema.ts
OK    ../../../drizzle/0012_time_blocks.sql
OK    drizzle/0012_time_blocks.sql
OK    src/db/schema/schema.ts
OK    src/modules/index.ts
OK    src/modules/schedule/schedule.service.ts
OK    src/modules/schedule/schedule.types.ts
OK    src/modules/time-blocks/index.ts
OK    src/modules/time-blocks/time-blocks.controller.ts
OK    src/modules/time-blocks/time-blocks.logic.ts
OK    src/modules/time-blocks/time-blocks.repository.ts
OK    src/modules/time-blocks/time-blocks.routes.ts
OK    src/modules/time-blocks/time-blocks.schemas.ts
OK    src/modules/time-blocks/time-blocks.service.ts
OK    src/modules/time-blocks/time-blocks.types.ts
OK    src/server.ts
== 5. Privacidad: el repo es público
OK    ningún número de ocho dígitos en las líneas añadidas salvo el código sintético 20230001
OK    ningún host ni credencial en las líneas añadidas
OK    ninguna prueba HU35 lee fixtures de HU31 ni de spike-portal
OK    ninguna ruta de esta máquina (/Users/…, /private/tmp/…) dentro del árbol
OK    el plan, si se commiteó, no fija rutas de esta máquina

CIERRE OK
```

  Si el Paso 3 editó la spec, este es el momento en que las secciones 1 y 2 pasan a verde: leen el archivo tal como está en disco, commiteado o no. Las secciones 4 y 5 miran los commits (`e2af4fa..HEAD`), así que no dependen de ese cambio.

- [ ] **Paso 5: Correr la suite completa y compararla con la línea base**

```bash
: "${SCRATCH:?define SCRATCH como dice Restricciones globales}"
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test 2>&1 | tee "$SCRATCH/cierre-bloques/suite-final.txt" | tail -n 4; echo "archivos HU35 con salida propia: $(grep -c '^test/HU35_jeff' "$SCRATCH/cierre-bloques/suite-final.txt")"
```

  Esperado: **PASS**. Es la línea base más la tabla de **Interfaces** (la versión anterior de la rama se midió así en la copia aislada con las Tareas 1 a 6 aplicadas: 1695 y 5904; la prueba de la Tarea 7 se midió aparte, 6 y 29). bun agrega el tiempo entre corchetes:

```
 1707 pass
 0 fail
 5967 expect() calls
Ran 1707 tests across 115 files. [4.05s]
archivos HU35 con salida propia: 0
```

  | | pass | fail | expect() | archivos |
  |:---|---:|---:|---:|---:|
  | línea base (Tarea 1, Paso 1, sobre `e2af4fa`) | 1486 | 0 | 5229 | 108 |
  | ahora | 1707 | 0 | 5967 | 115 |
  | diferencia | +221 | 0 | +738 | +7 |

  La diferencia es **exactamente** la tabla de **Interfaces**: 221 pruebas y 738 aserciones en los 7 archivos de `test/HU35_jeff/`. Así que ninguna prueba vieja cambió de conteo, tampoco las del horario que ahora reciben `isoDate`.

  - `0 fail` es la única cifra no negociable.
  - Si hay `0 fail` pero los totales no cuadran y la sección 3 del Paso 4 salió entera en `OK`, alguien tocó una prueba de fuera de HU35. `git diff --name-only e2af4fa..HEAD -- test` tiene que listar solo los siete archivos de `test/HU35_jeff/`. Si lista otro, vuelve a la tarea que lo tocó.
  - Si falla algo fuera de `test/HU35_jeff`, **PARAR**: es una regresión y no una prueba desactualizada. Ninguna tarea de este plan autoriza editar pruebas de otras HU.

  La suite imprime ruido en stderr, que **no** es un fallo y viene de las mismas pruebas que en la línea base. En la copia aislada, que no tiene `.env`, son las nueve líneas `[portal-sync] récord no confiable: tabla del récord ausente o con cabecera distinta` de `test/HU31_jeff/service.equivalencias.test.ts`, el aviso de Firebase de `test/HU28_ronald/chatbot.service.test.ts`, el `warn: firebase down` de `chatbot.chat-search.test.ts`, el `error: fallo de BD` de `test/HU02_jeff/logout.unit.test.ts`, y dos avisos `[portal-sync]` de `test/HU34_jeff/record-persistence.test.ts`. Esas pruebas ejercitan el camino de error a propósito. En el worktree bun carga además las otras variables del `.env`, así que alguno de esos avisos (el de Firebase, por ejemplo) puede no salir; eso no cambia los conteos. Lo que la rama **no** agrega es ruido propio: bun solo imprime el encabezado de un archivo cuando ese archivo escribe algo, y por eso el conteo `archivos HU35 con salida propia` tiene que dar `0`.

  Y la carpeta de la funcionalidad bajo los tres husos que importan: el de Vercel (UTC), el de la Mac (Lima) y uno adelantado que rompe cualquier `new Date(cadena)` local:

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && for z in America/Lima UTC Asia/Tokyo; do echo -n "$z: "; TZ=$z DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU35_jeff 2>&1 | grep -E "^ [0-9]+ (pass|fail)" | tr '\n' ' '; echo; done
```

  Esperado:

```
America/Lima:  221 pass  0 fail 
UTC:  221 pass  0 fail 
Asia/Tokyo:  221 pass  0 fail 
```

  Si un huso da otra cifra, alguna función de `time-blocks.logic.ts`, del service o de `schedule.service.ts` construye un `Date` con zona. Vuelve a la Tarea 2, a la 4 o a la 7, que ya tienen ese mismo chequeo en su Paso 5.

- [ ] **Paso 6: Build**

```bash
: "${BUN:?define BUN como dice Restricciones globales}"
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build; echo "exit=$?"
```

  Esperado: **PASS**, `$ tsc` y nada más, luego `exit=0`. `bun test` transpila sin revisar tipos, así que este es el único paso que compila bajo `strict`, `noUnusedLocals` y `noUnusedParameters` el módulo entero, su registro en `src/modules/index.ts`, el CORS de `src/server.ts` y el `isoDate` obligatorio de `DayInfo`. Lo que queda en `dist/` está en `.gitignore:5` y no ensucia `git status`.

  Si falla, **no toques `src/`** desde esta tarea. Anota el error literal con archivo y línea, y vuelve a la tarea dueña de ese archivo (la tabla de **Estructura de archivos** del esqueleto dice cuál es). Una rama que no compila es **bloqueante**, igual que la migración.

- [ ] **Paso 7: Medir los conteos del `README.md` (medir y reportar, NO editar)**

```bash
cd "${REPO:?}" && python3 scripts/verificar-readme.py; echo "EXIT=$?"
```

  Esperado: `EXIT=1` con **11 discrepancias**, todas por la misma razón: el README cita las cifras de antes de la rama. Sobre `e2af4fa` el script sale 0 (`El README concuerda con el código.`). Salida literal, medida en la copia aislada con las Tareas 1 a 6 (114 suites) y con la de la Tarea 7 sumada a mano (115):

```
Números medidos en el código:
  tablas               40
  enums                12
  modulos              18
  archivos_rutas       19
  endpoints            85
  migraciones          14
  suites               115
  specs                25
  variables_entorno    22
  parsers              11
  seeds                15

Afirmaciones del README:
  ✗ tablas               dice 38, son 40 (insignia del ORM)
  ✗ tablas               dice 38, son 40 (tabla de metadatos)
  ✗ tablas               dice 38, son 40 (título de la sección de tablas)
  ✗ enums                dice 11, son 12 (título de la sección de enums)
  ✗ modulos              dice 17, son 18 (insignia de superficie)
  ✗ modulos              dice 17, son 18 (tabla de metadatos)
  ✗ modulos              dice 17, son 18 (título de la sección de módulos)
  ✗ endpoints            dice 78, son 85 (insignia de superficie)
  ✗ endpoints            dice 78, son 85 (título del catálogo)
  ✗ migraciones          dice 13, son 14 (tabla de metadatos)
  ✗ suites               dice 108, son 115 (insignia de verificación)
  ✓ parsers              11 (diagrama de origen de datos)

Rutas de archivo citadas:
  ✓ todas existen

11 discrepancia(s). El README no está al día.
EXIT=1
```

  Tienen que seguir en verde `✓ parsers` y `✓ todas existen`. De dónde sale cada cifra:

  - +2 `pgTable(` y +1 `pgEnum(` en `schema.ts` (Tarea 1).
  - +1 `app.route(` en `src/modules/index.ts` (Tarea 5).
  - +7 rutas en `time-blocks.routes.ts` (Tarea 5): las siete líneas `app.get/post/patch/delete/put(`. Los `app.use` no cuentan.
  - +1 `.sql` en `drizzle/` (Tarea 1).
  - +7 `*.test.ts` (Tareas 1 a 7). El CORS de la Tarea 5 y el `isoDate` de la Tarea 7 no mueven ningún conteo.

  Si el verificador reporta algo **distinto** de estas once líneas, anótalo: la rama movió un conteo que nadie previó.

  **No edites `README.md`.** No está en los `targets`, y sus secciones enumeran los elementos uno por uno (`### Las 38 tablas`, `### El catálogo: 78 endpoints`): cambiar solo el número del título dejaría un encabezado que promete 40 tablas sobre una lista de 38. Ponerlo al día es una tarea de documentación aparte, **después** de que el dueño aplique la migración y mergee. Esta tarea le deja las cifras ya medidas en el informe.

- [ ] **Paso 8: Revisar la historia de la rama**

```bash
cd "${REPO:?}" && git status --short; git log --oneline e2af4fa..HEAD; git log e2af4fa..HEAD --format='%an <%ae>' | sort -u; git log e2af4fa..HEAD --format='%B' | grep -i "co-authored-by" && echo "PROBLEMA: hay trailer Co-Authored-By" || echo "OK: ningun commit lleva Co-Authored-By"
```

  Esperado:

  - `git status --short` **vacío**. Si el Paso 3 editó la spec, sale la única línea ` M specs/features/time-blocks/time-blocks.spec.md`, que se commitea en el Paso final.
  - Siete commits sobre `e2af4fa`, del más nuevo al más viejo:
    - `feat(schedule): cada dia del horario trae su fecha exacta en isoDate (RS-BE-36)`
    - `test(time-blocks): el chatbot no ve los bloques propios (RS-BE-35) y contrato de las siete rutas`
    - `feat(time-blocks): controller, siete rutas, registro del modulo y PATCH en el CORS (RS-BE-31, RS-BE-32, RS-BE-33)`
    - `feat(time-blocks): esquemas Zod y reglas del service (RS-BE-31 a RS-BE-34)`
    - `feat(time-blocks): repositorio de bloques y excepciones acotado por alumno (RS-BE-31, RS-BE-32, RS-BE-33)`
    - `feat(time-blocks): expansión de ocurrencias y horas por semana (RS-BE-33, RS-BE-34)`
    - `feat(time-blocks): modelo de datos de los bloques propios y migracion 0012`

    Si el plan se commiteó en la rama, aparece además un commit `docs(...)` que solo toca `docs/superpowers/plans/`, y está bien. Si la reconciliación de la spec se había commiteado aparte antes de la Tarea 1 (ver su Paso 0), aparece al fondo un commit más que solo toca `specs/features/time-blocks/time-blocks.spec.md`, y también está bien.
  - Un solo autor: `Jeffangeloss <178797184+jeffangeloss@users.noreply.github.com>`, que es el que tiene configurado el worktree. Nunca el correo universitario.
  - `OK: ningun commit lleva Co-Authored-By`.

  Y que la rama no tocó nada fuera de lo planeado:

```bash
cd "${REPO:?}" && git diff --name-only e2af4fa..HEAD | grep -v '^docs/superpowers/plans/' | LC_ALL=C sort; git diff --name-only e2af4fa..HEAD | grep -E '^(README\.md|MIGRATIONS\.md|AGENTS\.md|drizzle/meta/|backup_)' || echo "OK: ni README, ni MIGRATIONS, ni AGENTS, ni el journal, ni un respaldo"
```

  Esperado: exactamente estos **25** archivos (los 21 medidos en la copia aislada más `src/server.ts` de la Tarea 5 y los tres de la Tarea 7) y la línea `OK: …`:

```
docs/specs/api-contracts.md
docs/specs/feature-index.md
drizzle/0012_time_blocks.sql
specs/features/schedule/schedule.spec.md
specs/features/time-blocks/time-blocks.spec.md
src/db/schema/schema.ts
src/modules/index.ts
src/modules/schedule/schedule.service.ts
src/modules/schedule/schedule.types.ts
src/modules/time-blocks/index.ts
src/modules/time-blocks/time-blocks.controller.ts
src/modules/time-blocks/time-blocks.logic.ts
src/modules/time-blocks/time-blocks.repository.ts
src/modules/time-blocks/time-blocks.routes.ts
src/modules/time-blocks/time-blocks.schemas.ts
src/modules/time-blocks/time-blocks.service.ts
src/modules/time-blocks/time-blocks.types.ts
src/server.ts
test/HU35_jeff/chatbot-isolation-blocks.test.ts
test/HU35_jeff/migration-0012.test.ts
test/HU35_jeff/schedule-iso-date.test.ts
test/HU35_jeff/time-blocks-expansion.test.ts
test/HU35_jeff/time-blocks.repository.test.ts
test/HU35_jeff/time-blocks.routes.test.ts
test/HU35_jeff/time-blocks.service.test.ts
OK: ni README, ni MIGRATIONS, ni AGENTS, ni el journal, ni un respaldo
```

  `src/server.ts` sí está, y es target desde la reconciliación de la spec: su único cambio es el `PATCH` del CORS de la Tarea 5. `drizzle/meta/` queda fuera porque el journal no registra la 0012. **No hagas `git push`**: publicar la rama lo decide el dueño.

- [ ] **Paso 9: PARAR — acción del dueño e informe final**

  **El ejecutor se detiene acá.** No aplica la migración, no lee `.env`, no mergea, no despliega y no hace push. Le entrega al dueño este informe:

  1. **Suite:** `1707 pass`, `0 fail`, `5967 expect() calls`, `115 files` del Paso 5, junto a la línea base (`1486 / 0 / 5229 / 108`). La diferencia (+221 / +738 / +7) es exactamente la de `test/HU35_jeff`. HU35 pasa igual en `America/Lima`, `UTC` y `Asia/Tokyo`. La salida completa queda en `$SCRATCH/cierre-bloques/suite-final.txt`.
  2. **Build:** `tsc` limpio. Si falló: el error literal con archivo y línea, sin haberlo tocado, marcado como **bloqueante**.
  3. **Spec y targets:** `CIERRE OK` del Paso 4. Son 9 `[@test]` hacia 7 archivos que existen, las 7 pruebas enlazadas, 7 targets que existen y los 14 archivos de `src/` y `drizzle/` cubiertos. Si el Paso 3 completó un enlace, decir cuál y de qué tarea era.
  4. **Privacidad:** las cinco líneas `OK` de la sección 5. El único código de alumno que agrega la rama es el sintético `20230001`.
  5. **Historia:** siete commits sobre `e2af4fa` (uno más si el Paso 3 editó la spec, otro si la reconciliación de la spec se commiteó aparte antes de la Tarea 1, y otro si el plan se commiteó en `docs/superpowers/plans/`), un solo autor con el correo noreply, sin `Co-Authored-By`, 25 archivos cambiados, todos dentro del plan (ninguno de README, MIGRATIONS, AGENTS ni el journal), árbol limpio y sin push. La spec ya dice **APROBADA**, reconciliada, desde el commit de la Tarea 1.
  6. **README desactualizado** (no bloqueante): las once líneas del Paso 7, con los valores nuevos ya medidos. Son tablas 40, enums 12, módulos 18, endpoints 85, migraciones 14 y suites 115.
  7. **Aviso que arrastra la Tarea 5** (no bloquea nada): el de textos de su Paso 8, copiado tal cual:

     > **Aviso para el dueño (textos que ve el alumno):** la app muestra el mensaje que manda el servidor, y la
     > spec solo fija de qué habla el de `TIME_BLOCK_LIMIT_REACHED`. Estos los escribió el plan y esperan tu
     > visto bueno antes del merge:
     > - `message` de cada código de la spec (`time-blocks.service.ts`):
     >   - `TIME_BLOCK_LIMIT_REACHED`: "Llegaste al máximo de 20 bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro."
     >   - `TIME_BLOCK_NOT_FOUND`: "No existe ese bloque."
     >   - `TIME_BLOCK_OUT_OF_GRID`: "El bloque tiene que empezar y terminar entre las 07:00 y las 22:00."
     >   - `TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN`: "Ese día no forma parte del bloque."
     >   - `TIME_BLOCK_WINDOW_TOO_WIDE`: "La ventana no puede pasar de 120 días."
     > - En `details.fieldErrors` de los 400 de validación (`time-blocks.schemas.ts`; el `message` de esos 400
     >   es el que ya usa todo el backend, en inglés, de `validate-dto.ts`): "Fecha inválida (YYYY-MM-DD).",
     >   "Color inválido.", "Hora de inicio inválida (HH:MM).", "Hora de fin inválida (HH:MM).", "La hora de fin
     >   tiene que ser mayor que la de inicio.", "La fecha de fin no puede ser anterior a la de inicio.", "Los
     >   días de la semana no se pueden repetir." y "La ventana no puede terminar antes de empezar."
     >
     > Si cambias alguno, se cambia en esos dos archivos y en las pruebas que lo citan
     > (`test/HU35_jeff/time-blocks.service.test.ts` y `time-blocks.routes.test.ts`, que compara el de
     > `TIME_BLOCK_LIMIT_REACHED` letra por letra), y en la lista de mensajes de `docs/specs/api-contracts.md`.

     El CORS ya no es un aviso (la Tarea 5 agregó `PATCH`), y la spec ya no tiene diferencias con el código: se reconcilió el 2026-09-21 y entró con la Tarea 1.
  8. **Bloqueante:** `drizzle/0012_time_blocks.sql` **no está aplicada**. Sin ella, el backend nuevo responde `500 INTERNAL_SERVER_ERROR` (`src/shared/middleware/error-handler.ts:18-28`) en las siete rutas de `/time-blocks`.

  **Acción del dueño.** Aplica una sola persona (`MIGRATIONS.md:50`), con respaldo previo y en transacción.

  **NO EJECUTAR: estos comandos los corre el dueño en su terminal, no el ejecutor de este plan.** Leer `.env` y aplicar la migración están prohibidos por las restricciones globales. Por eso los bloques van en `text`.

  **A. Antes de empezar.**

  - Red: **ni** el wifi de la ULima, que bloquea el 5432 (`MIGRATIONS.md:14`), **ni** el hotspot del iPhone. `MIGRATIONS.md:14` todavía recomienda datos móviles, pero el 2026-09-08 se vio que con el hotspot el puerto parece abierto y aun así la sesión de Postgres muere (`read ECONNRESET` con bun, "el servidor ha cerrado la conexión inesperadamente" con `psql`). Minutos antes, en un wifi común, las mismas consultas funcionaban. Sirve un wifi común.
  - Si hay una exposición en menos de 48 horas, no se ejecuta DDL (`MIGRATIONS.md:52`).
  - Se corre desde el worktree, que es donde existe `drizzle/0012_time_blocks.sql`. El checkout principal `ULima_Backend_IS2` está en otra rama y no lo tiene. `REPO` es la ruta de ese worktree (`git worktree list` la muestra), como en "Variables de los comandos"; se define una vez en la terminal del dueño (`export REPO=…`) y vale para los bloques A a F.

```text
cd "${REPO:?}"
git status --short
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -At -c "select to_regclass('public.student_time_block'), to_regclass('public.student_time_block_exception'), to_regtype('public.time_block_exception_status');"
```

  Esperado: `git status --short` vacío, y el `psql` imprime `||`, que son tres `NULL`: nada de esto existe todavía. Si aparece algún nombre, alguien lo creó a mano. En ese caso hay que **parar** y compararlo con la 0012 antes de aplicar, porque `CREATE TABLE IF NOT EXISTS` saltaría en silencio una tabla con otra forma.

  **B. Respaldo** con el `pg_dump` de `libpq`, por ruta completa (`MIGRATIONS.md:9-13`):

```text
/opt/homebrew/opt/libpq/bin/pg_dump "$DATABASE_URL" > backup_pre_0012_$(date +%Y%m%d).sql; echo "pg_dump exit=$?"
grep -c "PostgreSQL database dump complete" backup_pre_0012_$(date +%Y%m%d).sql
ls -lh backup_pre_0012_$(date +%Y%m%d).sql
```

  Esperado: `pg_dump exit=0`, luego `1`, y un archivo de unos cientos de KB (el de la 0011 pesó 496 KB). Si el `grep` da `0`, el respaldo quedó cortado: **no sigas**. Se busca esa línea y no la última del archivo, porque el `pg_dump` 18 cierra con un `\unrestrict …` después de ella. `backup_*.sql` está en `.gitignore:53` y nunca se versiona. Si después se borra el worktree, hay que mover antes el respaldo afuera.

  **C. Aplicar.** Si `command -v bun` imprime una ruta:

```text
bun run db:apply drizzle/0012_time_blocks.sql
```

  Si no imprime nada, porque bun no está en el PATH, se usa el bun del scratchpad (`$BUN`, ver Restricciones globales) con el **mismo script** que corre `db:apply` (`package.json:25`), pero invocado directo:

```text
"${BUN:?}" src/db/apply-migration.ts drizzle/0012_time_blocks.sql
```

  - Se invoca directo y no como `… bun run db:apply` porque el script de `package.json` vuelve a llamar a `bun` por nombre, y que ese `bun` interno se resuelva depende del PATH de la terminal. Invocado directo, corre el mismo `src/db/apply-migration.ts` sin esa duda.
  - `/private/tmp` se vacía al reiniciar. Si ese bun ya no existe, se instala uno fuera de `/private/tmp` y se aplica con él:

```text
npm install --prefix "$HOME/bunhome" bun
"$HOME/bunhome/node_modules/.bin/bun" src/db/apply-migration.ts drizzle/0012_time_blocks.sql
```

  - `db:apply` lee `.env` por su cuenta (`src/db/apply-migration.ts:12`). El `export` del paso A es solo para `pg_dump` y `psql`.

  Esperado, en las dos formas:

```text
Aplicando drizzle/0012_time_blocks.sql en una transacción...
✓ Migración aplicada: drizzle/0012_time_blocks.sql
```

  Si sale `✗ Migración falló (ROLLBACK): …`, la base quedó intacta, porque todo corre dentro de `sql.begin` (`src/db/apply-migration.ts:35-37`). No reintentes a ciegas: trae el mensaje. La 0012 es aditiva e idempotente, así que reaplicarla ya aplicada no hace daño. En ese caso Postgres solo avisa que las tablas ya existían.

  **D. Verificar:**

```text
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -At -c "select to_regclass('public.student_time_block'), to_regclass('public.student_time_block_exception'), to_regclass('public.idx_time_block_student'), to_regtype('public.time_block_exception_status');"
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -At -c "select enum_range(null::public.time_block_exception_status);"
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -At -c "select table_name, count(*) from information_schema.columns where table_schema = 'public' and table_name in ('student_time_block', 'student_time_block_exception') group by 1 order by 1;"
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -At -c "select conrelid::regclass::text, conname, contype from pg_constraint where conrelid in ('public.student_time_block'::regclass, 'public.student_time_block_exception'::regclass) and contype in ('c', 'f', 'p', 'u') order by 1, 2;"
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -At -c "select conname, confdeltype from pg_constraint where contype = 'f' and conrelid in ('public.student_time_block'::regclass, 'public.student_time_block_exception'::regclass) order by 1;"
```

  Esperado, en orden:

```text
student_time_block|student_time_block_exception|idx_time_block_student|time_block_exception_status
{cancelled,moved}
student_time_block|11
student_time_block_exception|6
student_time_block|chk_time_block_color|c
student_time_block|chk_time_block_dias|c
student_time_block|chk_time_block_fechas|c
student_time_block|chk_time_block_grilla|c
student_time_block|chk_time_block_horas|c
student_time_block|chk_time_block_titulo|c
student_time_block|student_time_block_pkey|p
student_time_block|student_time_block_student_id_student_id_fk|f
student_time_block_exception|chk_time_block_exc_grilla|c
student_time_block_exception|chk_time_block_exc_movido|c
student_time_block_exception|student_time_block_exception_block_id_student_time_block_id_fk|f
student_time_block_exception|student_time_block_exception_pkey|p
student_time_block_exception|uq_time_block_exception|u
student_time_block_exception_block_id_student_time_block_id_fk|c
student_time_block_student_id_student_id_fk|c
```

  Son las dos tablas, el índice y el tipo; los dos valores del enum; 17 columnas (11 + 6); 13 restricciones; y las dos FK con `confdeltype = c`, que es `ON DELETE CASCADE`. Esas 13 son los ocho CHECK de la spec, las dos PK, las dos FK y el UNIQUE que hace idempotente al `PUT`. El nombre más largo, el de la FK de las excepciones, tiene 62 caracteres: entra en el límite de 63 de Postgres y no se trunca. Si falta una línea o sobra otra, no sigas: compara con `drizzle/0012_time_blocks.sql`.

  Al terminar D, sacar la URL de producción de la terminal: E y F no la necesitan, y en esa misma terminal un `bun test` o un script sin el prefijo `DATABASE_URL=…`, corrido desde una copia sin `.env` o desde otro worktree, apuntaría a producción (el `||=` de `test/env.setup.ts` no pisa una variable ya exportada):

```text
unset DATABASE_URL
echo "${DATABASE_URL:-sin variable}"
```

  Esperado: `sin variable`.

  **E. Registrar y avisar** (`MIGRATIONS.md:50-51`). En `MIGRATIONS.md`, reemplazar esto:

```markdown
## Migraciones aplicadas / reconciliaciones

- **`drizzle/0011_academic_record.sql`
```

  por esto:

```markdown
## Migraciones aplicadas / reconciliaciones

- **`drizzle/0012_time_blocks.sql` (RS-BE-30 — bloques de horario propios del alumno) — aplicada el AAAA-MM-DD por Jeff.** Aditiva e idempotente (tipo enumerado guardado contra `duplicate_object`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, sin tocar ninguna columna existente): crea el enum `time_block_exception_status` (`cancelled`, `moved`), `student_time_block` (la regla: título, color, días de la semana, horas y rango de fechas) y `student_time_block_exception` (una fila por fecha cancelada o movida), con `ON DELETE CASCADE` hacia `student` y hacia el bloque. Diseño en `specs/features/time-blocks/time-blocks.spec.md` (RS-BE-30 a RS-BE-35).
  Se aplicó con el script de `db:apply` (`src/db/apply-migration.ts drizzle/0012_time_blocks.sql`, en una transacción), no con `db:migrate`: el journal (`drizzle/meta/_journal.json`) sigue en la `0009`, igual que con la `0010` y la `0011`.
  Backup previo: `backup_pre_0012_AAAAMMDD.sql` (`pg_dump` completo, fuera de git).
  Verificación tras aplicar: `to_regclass` devuelve las dos tablas y el índice `idx_time_block_student`; 17 columnas entre las dos (11 + 6); los ocho CHECK (`chk_time_block_horas`, `_grilla`, `_fechas`, `_dias`, `_color`, `_titulo`, `_exc_movido`, `_exc_grilla`), el UNIQUE `uq_time_block_exception` y las dos FK con `ON DELETE CASCADE`.

- **`drizzle/0011_academic_record.sql`
```

  `AAAA-MM-DD` y `AAAAMMDD` son la misma fecha, la del nombre del respaldo que dejó el paso B: `ls backup_pre_0012_*.sql` la imprime, y se escribe con guiones en la primera línea y sin guiones en la del respaldo. Es el único dato que el plan no puede saber de antemano. Luego:

```text
git add MIGRATIONS.md && git commit -m "docs(migrations): la 0012 quedo aplicada, con su respaldo y su verificacion"
```

  Y avisar al equipo con la salida del paso D, que es la evidencia que pide el protocolo.

  **F. Recién entonces, el backend:**

```text
git push origin feat/bloques-horario
```

  Luego se abre el PR y se mergea a `main`. Vercel despliega `main`. Cuando termine:

```text
git fetch origin && git rev-parse origin/main
curl -s https://u-lima-backend-is-2-one.vercel.app/version
curl -s -o /dev/null -w '%{http_code}\n' https://u-lima-backend-is-2-one.vercel.app/time-blocks/me
```

  Esperado: el `commit` de `/version` coincide con el SHA de `origin/main` (`MIGRATIONS.md:104`), y el último `curl` imprime `401`. Ese 401 es el `MISSING_TOKEN` de `auth-middleware.ts:26`, que corre antes que todo y prueba que la ruta está montada. Si imprime `404`, producción sigue sirviendo el código viejo. Es `git push origin feat/bloques-horario`, nunca `git push` a secas.

  **G. Y solo después del backend, la app:** el PR del frontend y el APK o la build de iOS que salga de él. Si la app nueva sale antes, sus llamadas a `/time-blocks` reciben el `404 Not Found` en texto plano y la pantalla nueva no funciona, y el horario le llega sin `isoDate`. Con build web, la edición de un bloque (`PATCH`) ya pasa el preflight: el CORS lo agregó la Tarea 5 y sale en el mismo despliegue.

- [ ] **Paso final: Commit (solo si el Paso 3 cambió la spec)**

  Caso normal: las Tareas 3 y 4 dejaron sus enlaces y no hay nada que commitear. Comprobarlo:

```bash
cd "${REPO:?}" && git status --short
```

  Esperado: salida vacía. La Tarea 8 termina sin commit propio, y eso es lo mejor que puede pasar: significa que las siete tareas anteriores dejaron la spec completa.

  Si el Paso 3 sí editó la spec, ese es el único archivo modificado, y va en un commit:

```bash
cd "${REPO:?}" && git add specs/features/time-blocks/time-blocks.spec.md && git commit -m "docs(time-blocks): completa los enlaces [@test] de la spec" && git status --short
```

  Esperado: `git status --short` vacío después del commit, y la historia pasa a tener ocho commits sobre `e2af4fa`. Hay que decirlo en los puntos 3 y 5 del informe. El autor ya está configurado en git: **sin** trailer `Co-Authored-By`, sin `push` y sin PR.
