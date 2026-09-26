# Test de especialidad (backend), plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA. Usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** Que el backend sirva el test de especialidad de la versión `2026-09-25.4`, calcule el resultado con aritmética exacta y hasta dos desempates, pida a Cohere el motivo con las plantillas como respaldo, guarde el último resultado del alumno y deje elegir solo las cuatro especialidades oficiales, con el reemplazo de especialidades en una sola transacción.

**Arquitectura:** Un módulo nuevo `src/modules/specialty-test` con la cadena `routes → controller → service → repository`. El cálculo (`specialty-test.logic.ts`), las plantillas y las líneas de Ulises (`specialty-test.templates.ts`), lo que viaja a la app (`specialty-test.view.ts`) y el motivo de Cohere (`specialty-test.reason.ts`) son funciones puras o reciben el cliente inyectado, sin base de datos. El contenido vive como un JSON por versión en `content/` y entra al empaquetado con un `import` estático. El service guarda el resultado final en `student_specialty_test_result` antes de llamar a Cohere; la migración `0014` que crea esa tabla solo se escribe en este plan. Fuera del módulo cambian `rate-limit.ts`, `schema.ts`, `src/modules/index.ts` y el repository y el service de `academic-profile`, y entran el generador del contenido y su documento de revisión.

**Stack:** Bun 1.4.2, TypeScript 5.9 (`tsc`), Hono 4.12, Drizzle ORM 0.45 sobre postgres.js, Zod 3.25, Cohere `command-a-03-2025` por `/v2/chat` con el cliente que ya existe, y Python 3 para el generador.

**Spec:** `specs/features/specialty-test/specialty-test.spec.md` (RS-BE-37 a RS-BE-47, aprobada el 2026-09-25) y su enmienda en `specs/features/academic-profile/academic-profile.spec.md` (BR-AP-07 y BR-AP-08). El contrato está en `docs/specs/api-contracts.md`, sección «Specialty Test». La spec fija los valores exactos (textos, códigos, mensajes, prompt y límites) y este plan fija el orden, los archivos, el código y las pruebas. Si difieren, manda la spec y la tarea se detiene para avisar.

**Repo y rama:** El worktree `$REPO`, rama `feat/test-especialidad`, sobre `5842b0b` más uno o más commits de este plan, que solo tocan este archivo.

## Restricciones globales

- Español en comentarios, nombres de prueba y commits. Los nombres de prueba van sin tildes, como el resto del repo.
- Commits con el estilo del log (`feat(specialty-test): …`, `fix(academic-profile): …`, `test(chatbot): …`, `docs(specialty-test): …`, con los requisitos entre paréntesis y un cuerpo breve), uno por tarea y con `git add` de rutas explícitas. Sin trailer `Co-Authored-By` ni otra atribución. El autor es el noreply de GitHub que ya tiene el worktree, y el Paso 0 lo comprueba.
- Nada de push ni de PR. Nunca `git stash` a secas. Antes de cada commit, `git status --short` muestra solo los archivos de la tarea; si aparece otro, la tarea se detiene, porque otra sesión puede estar tocando el árbol.
- Nunca se lee ni se imprime `.env` ni `DATABASE_URL`. Nada contra una base, ni `db:apply`, `db:push`, `db:migrate`, `db:generate`, `db:seed` ni `psql`. La `0014` se escribe y se prueba estáticamente, y aplicarla no es parte de este plan (ver «Después de este plan»).
- Repo público. Ningún dato real. El alumno sintético es 20230001 («Garcia Lopez, Maria», `student.id` 42) y los ids de especialidad son ilustrativos. Ninguna ruta de esta máquina entra a un archivo commiteado.
- Pruebas siempre con `DATABASE_URL=postgres://user:pass@localhost:5432/test "$BUN" test <ruta>`. El prefijo es obligatorio porque bun carga solo el `.env` del worktree. El build es `"$BUN" run build` (`tsc`, que compila solo `src/`).
- Arquitectura `routes → controller → service → repository`. El service recibe el repository y el `EventBus`, y aquí además el cliente de Cohere y el registro de versiones, para que las pruebas los reemplacen; nunca importa `db`. Zod va en el controller con `validateJson`.
- El alumno sale solo del token (`c.get("studentId")`), con la guarda del 0 de `academic-record.controller.ts:15-21`.
- En la plantilla `sql` de Drizzle nunca se interpola un arreglo JS (error 42809) ni un `Date`. El ranking viaja como `${JSON.stringify(…)}::jsonb` y la fecha sale armada en SQL con `to_char`.
- Ningún `console` del módulo imprime respuestas, motivos, textos de Cohere, `error.message` de Cohere ni ids de alumno (RS-BE-43 y RS-BE-46).
- `test/HU36_jeff/` es la carpeta nueva de las pruebas. La única prueba ajena que cambia es `test/HU05_mel/especialidades.cajablanca.test.ts`, en la Tarea 11 y solo en el doble del repositorio, porque BR-AP-08 cambia el método que llama el service.

## Variables de los comandos

El plan no fija rutas de una máquina. Cada llamada de shell empieza con `export REPO=… BUN=… FUENTE=… SCRATCH=…` con los valores que da el despacho, porque las variables no sobreviven de una llamada a otra. Los comandos las usan como `"${REPO:?}"`, así que una variable vacía corta la llamada con un error en vez de correr en `$HOME` o volver `test` el comando de la shell.

- `REPO` es la ruta absoluta del worktree de la rama `feat/test-especialidad`, la que muestra `git worktree list`.
- `BUN` es el ejecutable de bun, que no está en `PATH`, dentro de la carpeta temporal de la sesión (`$SCRATCH/bunhome/node_modules/.bin/bun`).
- `FUENTE` es la copia permanente del contenido aprobado 2026-09-25.4, la carpeta `contenido-test-especialidad/` de la raíz del proyecto, que no es un repo git y contiene `ULima_Backend_IS2`, `ULima_Frontend_IS2` y `.worktrees/`. Esa carpeta trae `contenido-test.json`, `generar.py`, `extraer-lucide.py` y `lucide-nombres.txt`, y el Paso 0 comprueba sus cuatro SHA-256. La copia de la carpeta temporal de la sesión que escribió la spec no sirve de fuente, porque esa carpeta se borra al cerrar la sesión.
- `SCRATCH` es la carpeta temporal de la sesión, fuera del repo, donde se guarda el script de la Tarea 13.

## Cifras de las pruebas

Todas las cifras salen de correr el código y las pruebas de este mismo texto, tarea por tarea, en una copia aislada de `5842b0b` sin `.env`, con bun 1.4.2. En esa copia la suite de partida da 2284 pass, 42 skip, 0 fail, 7471 `expect()` y 2326 pruebas en 132 archivos, y `tsc -p test/tsconfig.json --noEmit` da 78 errores previos, ninguno en los archivos que toca el plan. Cada tarea da el total de la suite y su diferencia con la tarea anterior. Si la línea base del Paso 0 sale distinta en el worktree, valen las diferencias. Si una corrida da `0 fail` con otra cifra, se compara prueba por prueba contra el archivo antes de seguir, y nunca se ajusta una prueba para que cuadre.

## Estructura de archivos

| ruta | acción | tarea | responsabilidad |
| :--- | :--- | :--- | :--- |
| `src/modules/specialty-test/specialty-test.types.ts` | crear | 1 | claves, tipos del contenido, de las respuestas de las rutas y del guardado |
| `src/modules/specialty-test/content/2026-09-25.4.json` | crear (copia) | 1 | la versión vigente del contenido, generada por `generar.py` |
| `src/modules/specialty-test/content/index.ts` | crear | 1 | registro de versiones con `import` estático |
| `src/modules/specialty-test/specialty-test.logic.ts` | crear | 2 | conteo, afinidad exacta, orden y desempates (RS-BE-40 y RS-BE-41) |
| `src/modules/specialty-test/specialty-test.templates.ts` | crear | 3 | motivo con plantillas y líneas de Ulises (RS-BE-42) |
| `src/modules/specialty-test/specialty-test.reason.ts` | crear | 4 | datos para Cohere, prompt, validación y respaldo (RS-BE-43) |
| `drizzle/0014_specialty_test_result.sql` | crear | 5 | migración aditiva e idempotente, sin aplicar |
| `src/db/schema/schema.ts` | modificar | 5 | `studentSpecialtyTestResult` e import de `jsonb` |
| `src/modules/specialty-test/specialty-test.schemas.ts` | crear en 6, ampliar en 7 | 6 y 7 | Zod del ranking guardado y del cuerpo de la evaluación |
| `src/modules/specialty-test/specialty-test.repository.ts` | crear | 6 | alumno, especialidades activas y último resultado |
| `src/modules/specialty-test/specialty-test.view.ts` | crear | 7 | `specialtyId` por nombre, contenido público y desempate público |
| `src/modules/specialty-test/specialty-test.service.ts` | crear | 7 | reglas de RS-BE-38, RS-BE-39, RS-BE-41, RS-BE-44 y RS-BE-45 |
| `src/shared/middleware/rate-limit.ts` | modificar | 8 | `specialtyTestRateLimit` (30 por hora) |
| `src/modules/specialty-test/specialty-test.controller.ts` | crear | 8 | adapta HTTP, alumno del token |
| `src/modules/specialty-test/specialty-test.routes.ts` | crear | 8 | autorización, `no-store`, 413, límite y las tres rutas |
| `src/modules/specialty-test/index.ts` | crear | 8 | composition root |
| `src/modules/index.ts` | modificar | 8 | `app.route("/specialty-test", …)` |
| `src/modules/academic-profile/academic-profile.repository.ts` | modificar | 10 y 11 | filtro `is_active = true` y `replaceStudentSpecialties` |
| `src/modules/academic-profile/academic-profile.service.ts` | modificar | 11 | el reemplazo pasa por la transacción |
| `scripts/specialty-test/generar.py`, `extraer-lucide.py`, `lucide-nombres.txt` | crear (copia) | 12 | generador del contenido y lista de íconos válidos |
| `docs/specialty-test/contenido-2026-09-25.4.md` | crear (generado) | 12 | documento de revisión de la versión |
| `test/HU36_jeff/*.test.ts` (12 archivos) | crear | 1 a 11 | pruebas de cada regla |
| `test/HU05_mel/especialidades.cajablanca.test.ts` | modificar | 11 | el doble del repositorio suma `replaceStudentSpecialties` |
| `specs/…/specialty-test.spec.md`, `specs/…/academic-profile.spec.md`, `docs/specs/feature-index.md`, `docs/specs/api-contracts.md` | modificar | 13 | los `[@test]` sin *(pendiente)* y el estado «implementada en la rama» |

## Orden y cobertura

| requisito | tareas | pruebas |
| :--- | :--- | :--- |
| RS-BE-37 contenido versionado | 1, 3, 12 | `specialty-test-content.test.ts` |
| RS-BE-38 lo que la app recibe | 7, 8 | `specialty-test.service.test.ts`, `specialty-test.routes.test.ts` |
| RS-BE-39 evaluación sin estado y validación | 7, 8 | `specialty-test.service.test.ts`, `specialty-test.routes.test.ts` |
| RS-BE-40 afinidad y orden | 2 | `specialty-test-logic.test.ts` |
| RS-BE-41 desempates | 2, 7 | `specialty-test-logic.test.ts`, `specialty-test.service.test.ts` |
| RS-BE-42 plantillas y líneas de Ulises | 3 | `specialty-test-logic.test.ts`, `specialty-test-content.test.ts` |
| RS-BE-43 motivo de Cohere | 4, 7 | `specialty-test-reason.test.ts` |
| RS-BE-44 guardado | 5, 6, 7 | `migration-0014.test.ts`, `specialty-test.repository.test.ts`, `specialty-test.service.test.ts`, `specialty-test.postgres.test.ts` |
| RS-BE-45 último resultado | 6, 7, 8 | `specialty-test.service.test.ts`, `specialty-test.routes.test.ts` |
| RS-BE-46 autorización, límites y errores | 8 | `specialty-test.routes.test.ts`, `specialty-test.rate-limit.test.ts` |
| RS-BE-47 el chatbot no lee el resultado | 9 | `chatbot-isolation-specialty-test.test.ts` |
| BR-AP-07 solo lo oficial | 10 | `academic-profile-official.test.ts` |
| BR-AP-08 reemplazo atómico | 11 | `academic-profile-atomic.test.ts` |
| Decisión abierta 15 (generador en el repo) | 12 | `generar.py` reescribe igual el JSON |
| Cambios en otras specs | 13 | revisión de textos |

---

### Tarea 1: Contenido versionado dentro del módulo

**Requisitos:** RS-BE-37 (registro con `CURRENT_VERSION` y `CONTENT_BY_VERSION`, claves estables, invariantes de cada versión y forma del ícono de cada tarea).

**Archivos:**
- Crear: `src/modules/specialty-test/specialty-test.types.ts`
- Crear: `src/modules/specialty-test/content/2026-09-25.4.json` (copia exacta de `$FUENTE/contenido-test.json`)
- Crear: `src/modules/specialty-test/content/index.ts`
- Prueba: `test/HU36_jeff/specialty-test-content.test.ts`

**Interfaces:**
- Consume: nada de tareas anteriores. Del repo, solo `tsconfig.json` con `resolveJsonModule: true` y `module: ESNext`, que admite el atributo `with { type: "json" }`.
- Produce, en `specialty-test.types.ts`:
  - `SPECIALTY_KEYS = ["sw", "ti", "si", "vj"] as const` y `SpecialtyKey`; `DUEL_ANSWERS`, `DuelAnswer`, `SCALE_ANSWERS`, `ScaleAnswer` y `Answer = DuelAnswer | ScaleAnswer`.
  - Los tipos del contenido, `ContentIcon`, `ContentElective`, `ContentSpecialty`, `ContentTask`, `DuelQuestion`, `ScaleQuestion`, `ContentQuestion`, `Tiebreaker`, `ReasonTemplate`, `ContentExample` y `SpecialtyTestContent`.
  - `ContentRegistry { currentVersion: string; byVersion: ReadonlyMap<string, SpecialtyTestContent> }` y `SpecialtyIds = Record<SpecialtyKey, number>`.
  - Las respuestas de las rutas, `PublicTask`, `PublicQuestion`, `PublicContent`, `PublicTiebreak`, `RankingEntry`, `ResultUlises`, `ReasonSource`, `EvaluateResponse` y `StoredResultResponse`.
  - El guardado, con `StoredRankingEntry { key; specialtyId; affinity }` y `StoredResult { contentVersion; ranking; isTie; completedAt }`.
- Produce, en `content/index.ts`: `CURRENT_VERSION = "2026-09-25.4"`, `CONTENT_BY_VERSION: ReadonlyMap<string, SpecialtyTestContent>` y `CONTENT_REGISTRY: ContentRegistry`.

- [ ] **Paso 0: Punto de partida, autor y fuente**

```bash
cd "${REPO:?}" && git rev-parse --abbrev-ref HEAD && git merge-base --is-ancestor 5842b0b HEAD && echo "base 5842b0b" && git log --oneline 5842b0b..HEAD && git rev-list --count --merges 5842b0b..HEAD && git log --no-renames --pretty=format: --name-only 5842b0b..HEAD | sed '/^$/d' | sort -u && git status --short && git config user.email | grep -c '@users\.noreply\.github\.com$' && shasum -a 256 "${FUENTE:?}/contenido-test.json" "${FUENTE:?}/generar.py" "${FUENTE:?}/extraer-lucide.py" "${FUENTE:?}/lucide-nombres.txt" | cut -c1-64
```

**Esperado:** la rama `feat/test-especialidad`, la línea `base 5842b0b`, uno o más commits `docs(specialty-test): …` del plan, con `docs(specialty-test): plan de implementación del backend…` como el más antiguo, y un `0` de merges. Sigue una sola línea con la ruta del plan, `docs/superpowers/plans/2026-09-25-specialty-test-backend.md`, porque esos commits no tocan otro archivo, y después `git status --short` sin líneas, un `1` del noreply y estas cuatro huellas, en este orden.

```
ae9076e621ad446ae6aae321ebe82730a45d6c9ceaa13a6e4574e743e75153e6
9f87ccece5f7a737246faf39f1c94a12dc07d928cb03f178c00d00655c19563e
2ac4b6a1e4b18d0165c4549b87fef84951a78e7d8d424d664a5ecb49879352cc
f213f981c0e73025b6b31b7e9525e5d5a6b55e1e15d7d3b096e0d00d819e783c
```

Cualquier otra rama, la falta de la línea `base 5842b0b`, un merge encima de la base, un commit encima que toque otro archivo, un archivo en `git status --short`, un `0` del noreply u otra huella detiene el plan antes de escribir nada. La cantidad de commits del plan no importa, porque cada corrección del plan antes de implementar entra como un commit propio que solo toca este archivo. La spec ya está aprobada (`AGENTS.md` pide la aprobación antes del código) y su estado lo dice en la línea 22.

Después se mide la línea base.

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2284 pass, 42 skip, 0 fail, 7471 `expect()` y 2326 pruebas en 132 archivos. Si sale otra cifra con `0 fail`, se anota como línea base del worktree y desde ahí valen las diferencias de cada tarea.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/specialty-test-content.test.ts` con este contenido. La Tarea 3 le suma los pesos, las plantillas y los ocho ejemplos.

```ts
import { describe, expect, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import type {
  ContentTask,
  SpecialtyTestContent,
} from "../../src/modules/specialty-test/specialty-test.types.js";
import {
  DUEL_ANSWERS,
  SCALE_ANSWERS,
  SPECIALTY_KEYS,
} from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-37: cada versión del registro cumple las invariantes del contenido.
 *
 * Recorre TODAS las versiones de `CONTENT_BY_VERSION`, así que una versión
 * nueva entra sola a esta prueba. La comprobación de los íconos contra la
 * lista de `lucide_icons_flutter` 3.1.15 queda en `generar.py` (decisión 8):
 * aquí solo la forma, el camelCase y que ningún nombre se repita.
 */

const VERSION = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const camel = (kebab: string): string =>
  kebab.split("-").map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join("");

/** Las 48 tareas de una versión: 20 de duelo, 4 de escala y 24 de desempate. */
const tareas = (c: SpecialtyTestContent): Array<{ donde: string; tarea: ContentTask }> => [
  ...c.questions.flatMap((q) =>
    q.type === "duel"
      ? [{ donde: `${q.id}.top`, tarea: q.top }, { donde: `${q.id}.bottom`, tarea: q.bottom }]
      : [{ donde: `${q.id}.task`, tarea: q.task }],
  ),
  ...c.tiebreakers.flatMap((t) => [
    { donde: `${t.id}.top`, tarea: t.top },
    { donde: `${t.id}.bottom`, tarea: t.bottom },
  ]),
];

describe("registro de versiones (RS-BE-37)", () => {
  test("la vigente es la 2026-09-25.4 y esta en el registro", () => {
    expect(CURRENT_VERSION).toBe("2026-09-25.4");
    expect(CONTENT_BY_VERSION.has(CURRENT_VERSION)).toBe(true);
  });

  test("ni la .2 ni la .3 entran al registro, porque ningun alumno las recibe", () => {
    expect([...CONTENT_BY_VERSION.keys()]).toEqual(["2026-09-25.4"]);
  });
});

for (const [clave, c] of CONTENT_BY_VERSION) {
  describe(`contenido ${clave} (RS-BE-37)`, () => {
    test("la version tiene la forma AAAA-MM-DD.N y coincide con su clave en el registro", () => {
      expect(clave).toMatch(VERSION);
      expect(c.version).toBe(clave);
    });

    test("las cuatro especialidades con sus claves en el orden fijo", () => {
      expect(c.specialties.map((s) => s.key)).toEqual([...SPECIALTY_KEYS]);
    });

    test("14 preguntas q01 a q14 en orden, 10 duelos y 4 escalas", () => {
      expect(c.questions.map((q) => q.id)).toEqual(
        Array.from({ length: 14 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`),
      );
      expect(c.questions.map((q) => q.n)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
      expect(c.questions.filter((q) => q.type === "duel")).toHaveLength(10);
      expect(c.questions.filter((q) => q.type === "scale")).toHaveLength(4);
    });

    test("cada especialidad sale en exactamente 5 duelos y tiene una sola escala", () => {
      for (const k of SPECIALTY_KEYS) {
        const duelos = c.questions.filter(
          (q) => q.type === "duel" && (q.top.specialty === k || q.bottom.specialty === k),
        );
        const escalas = c.questions.filter((q) => q.type === "scale" && q.task.specialty === k);
        expect(duelos).toHaveLength(5);
        expect(escalas).toHaveLength(1);
      }
    });

    test("los dos lados de cada duelo son de especialidades distintas", () => {
      for (const q of c.questions) {
        if (q.type === "duel") expect(q.top.specialty).not.toBe(q.bottom.specialty);
      }
    });

    test("12 desempates, dos por par, con id tb-a-b-orden y las dos del par a los lados", () => {
      expect(c.tiebreakers).toHaveLength(12);
      for (let i = 0; i < SPECIALTY_KEYS.length; i++) {
        for (let j = i + 1; j < SPECIALTY_KEYS.length; j++) {
          const [a, b] = [SPECIALTY_KEYS[i]!, SPECIALTY_KEYS[j]!];
          const delPar = c.tiebreakers.filter((t) => t.pair[0] === a && t.pair[1] === b);
          expect(delPar.map((t) => t.order).sort()).toEqual([1, 2]);
          for (const t of delPar) {
            expect(t.id).toBe(`tb-${a}-${b}-${t.order}`);
            expect([t.top.specialty, t.bottom.specialty].sort()).toEqual([a, b].sort());
          }
        }
      }
    });

    test("cada tarea tiene de 6 a 14 palabras, resumen, icono y electivos de su especialidad", () => {
      const electivosDe = new Map(c.specialties.map((s) => [s.key, new Set(s.electives.map((e) => e.code))]));
      const todas = tareas(c);
      expect(todas).toHaveLength(48);
      for (const { donde, tarea } of todas) {
        const palabras = tarea.text.trim().split(/\s+/).length;
        expect({ donde, ok: palabras >= 6 && palabras <= 14 }).toEqual({ donde, ok: true });
        expect(tarea.summary.length).toBeGreaterThan(0);
        expect(tarea.electives.length).toBeGreaterThan(0);
        for (const codigo of tarea.electives) {
          expect({ donde, codigo, ok: electivosDe.get(tarea.specialty)!.has(codigo) }).toEqual({
            donde, codigo, ok: true,
          });
        }
        for (const signo of [":", "—", "–"]) {
          expect(tarea.text).not.toContain(signo);
          expect(tarea.summary).not.toContain(signo);
        }
      }
    });

    test("el icono de cada tarea es { lucide, flutter } con flutter igual al camelCase", () => {
      for (const { donde, tarea } of tareas(c)) {
        expect(Object.keys(tarea.icon).sort()).toEqual(["flutter", "lucide"]);
        expect({ donde, lucide: tarea.icon.lucide }).toEqual({ donde, lucide: expect.stringMatching(KEBAB) });
        expect(tarea.icon.flutter).toBe(`LucideIcons.${camel(tarea.icon.lucide)}`);
      }
    });

    test("ninguna tarea usa el icono de una especialidad ni repite el de otra tarea", () => {
      const deEspecialidad = new Set(c.specialties.map((s) => s.icon.lucide));
      const vistos = new Set<string>();
      for (const { donde, tarea } of tareas(c)) {
        expect({ donde, deEspecialidad: deEspecialidad.has(tarea.icon.lucide) }).toEqual({
          donde, deEspecialidad: false,
        });
        expect({ donde, repetido: vistos.has(tarea.icon.lucide) }).toEqual({ donde, repetido: false });
        vistos.add(tarea.icon.lucide);
      }
      expect(vistos.size).toBe(48);
    });

    test("el icono de cada especialidad tambien tiene la forma { lucide, flutter }", () => {
      for (const s of c.specialties) {
        expect(s.icon.lucide).toMatch(KEBAB);
        expect(s.icon.flutter).toBe(`LucideIcons.${camel(s.icon.lucide)}`);
      }
    });

    test("las opciones del duelo y de la escala son las de la spec, con sus valores", () => {
      expect(c.meta.duelOptions.map((o) => o.id)).toEqual([...DUEL_ANSWERS]);
      expect(c.weights.scale.options.map((o) => [o.id, o.value])).toEqual(
        SCALE_ANSWERS.map((id, valor) => [id, valor]),
      );
    });
  });
}
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-content.test.ts
```

**Esperado:** falla con `error: Cannot find module '../../src/modules/specialty-test/content/index.js'`, `0 pass` y `1 fail`.

- [ ] **Paso 3: Copiar el contenido y comprobar que no trae datos reales**

```bash
cd "${REPO:?}" && mkdir -p src/modules/specialty-test/content && cp "${FUENTE:?}/contenido-test.json" src/modules/specialty-test/content/2026-09-25.4.json && shasum -a 256 src/modules/specialty-test/content/2026-09-25.4.json | cut -c1-64 && grep -cE '[0-9]{8}|@|/Users/|/private/|https?://' src/modules/specialty-test/content/2026-09-25.4.json
```

**Esperado:** la huella `ae9076e621ad446ae6aae321ebe82730a45d6c9ceaa13a6e4574e743e75153e6` y un `0` (ningún código de alumno, correo, ruta local ni enlace). El archivo no se edita a mano (decisión abierta 15).

- [ ] **Paso 4: Escribir los tipos**

Crear `src/modules/specialty-test/specialty-test.types.ts`.

```ts
/**
 * Tipos del test de especialidad (RS-BE-37 a RS-BE-45).
 *
 * La primera mitad describe el archivo de contenido tal como lo escribe
 * `scripts/specialty-test/generar.py` (`content/<versión>.json`). Solo se
 * tipan los campos que el módulo lee; el resto del archivo (fuentes, balance,
 * pautas) viaja en el JSON y no se usa en tiempo de ejecución.
 *
 * La segunda mitad son las respuestas de las tres rutas, campo por campo como
 * las fija el contrato de la spec.
 */

/** Las cuatro claves estables, en el orden fijo de RS-BE-37. */
export const SPECIALTY_KEYS = ["sw", "ti", "si", "vj"] as const;
export type SpecialtyKey = (typeof SPECIALTY_KEYS)[number];

export const DUEL_ANSWERS = ["top", "bottom", "both", "none"] as const;
export type DuelAnswer = (typeof DUEL_ANSWERS)[number];

export const SCALE_ANSWERS = ["nada", "un_poco", "bastante", "me_encantaria"] as const;
export type ScaleAnswer = (typeof SCALE_ANSWERS)[number];

export type Answer = DuelAnswer | ScaleAnswer;

/** `{ lucide, flutter }`: el nombre de Lucide y la constante de `LucideIcons`. */
export interface ContentIcon {
  lucide: string;
  flutter: string;
}

export interface ContentElective {
  code: string;
  name: string;
  shortName: string;
  credits: number;
  prerequisite: string;
  sharedWith: SpecialtyKey[];
}

export interface ContentSpecialty {
  key: SpecialtyKey;
  name: string;
  diplomaName: string;
  color: { light: string; dark: string };
  icon: ContentIcon;
  tagline: string;
  totalCredits: number;
  electives: ContentElective[];
}

export interface ContentTask {
  specialty: SpecialtyKey;
  text: string;
  summary: string;
  illustration: string;
  icon: ContentIcon;
  /** Códigos de electivo; el primero es el que nombra `{electivos}`. */
  electives: string[];
  wordCount: number;
}

export interface DuelQuestion {
  n: number;
  id: string;
  type: "duel";
  block: number;
  prompt: string;
  pair: [SpecialtyKey, SpecialtyKey];
  top: ContentTask;
  bottom: ContentTask;
  reaction: string;
}

export interface ScaleQuestion {
  n: number;
  id: string;
  type: "scale";
  block: number;
  prompt: string;
  specialty: SpecialtyKey;
  task: ContentTask;
  blockClose: string;
}

export type ContentQuestion = DuelQuestion | ScaleQuestion;

export interface Tiebreaker {
  id: string;
  pair: [SpecialtyKey, SpecialtyKey];
  order: 1 | 2;
  prompt: string;
  top: ContentTask;
  bottom: ContentTask;
}

export interface ReasonTemplate {
  id: string;
  when: string;
  text: string;
}

export interface ContentExample {
  id: string;
  title: string;
  answers: Record<string, Answer>;
  tiebreakAnswers: DuelAnswer[];
  result: {
    ranking: SpecialtyKey[];
    affinity: Record<SpecialtyKey, string>;
    display: Record<SpecialtyKey, number>;
    tie: boolean;
  };
  reasonTemplatesUsed: string[];
  reasonText: string;
}

export interface SpecialtyTestContent {
  version: string;
  meta: {
    duelOptions: Array<{ id: DuelAnswer; label: string }>;
  };
  specialties: ContentSpecialty[];
  questions: ContentQuestion[];
  tiebreakers: Tiebreaker[];
  weights: {
    duel: { pick: number; both: number; none: number; duelsPerSpecialty: number };
    scale: { options: Array<{ id: ScaleAnswer; label: string; value: number }>; max: number };
    affinity: { duelsWeight: number; scaleWeight: number };
    tiebreak: { threshold: number; maxDuels: number };
    examples: ContentExample[];
  };
  reasonTemplates: {
    main: ReasonTemplate[];
    tiebreak: ReasonTemplate[];
    second: ReasonTemplate[];
    electives: ReasonTemplate[];
    tie: ReasonTemplate[];
  };
  ulisesLines: {
    welcome: string[];
    startButton: string;
    duelHelp: string;
    scaleHelp: string;
    reactions: { pick: string[]; both: string[]; none: string[]; scale: string[] };
    result: {
      loading: string;
      intro: string;
      winner: string;
      second: string;
      tie: string;
      low: string;
      closing: string;
      retake: string;
    };
    tiebreak: { first: string; second: string; resolved: string; stillTied: string };
  };
}

/** Las versiones que el servidor acepta y la vigente (RS-BE-37). */
export interface ContentRegistry {
  currentVersion: string;
  byVersion: ReadonlyMap<string, SpecialtyTestContent>;
}

/** Clave → id de `specialty` de la carrera del alumno (RS-BE-38). */
export type SpecialtyIds = Record<SpecialtyKey, number>;

// ── Respuestas de las rutas ────────────────────────────────────────────────

/** Una tarea tal como la recibe la app: sin resumen, sin electivos, con el ícono como cadena. */
export interface PublicTask {
  id: string;
  specialty: SpecialtyKey;
  text: string;
  illustration: string;
  icon: string;
}

export type PublicQuestion =
  | {
      id: string;
      n: number;
      type: "duel";
      prompt: string;
      top: PublicTask;
      bottom: PublicTask;
      reaction: string;
    }
  | {
      id: string;
      n: number;
      type: "scale";
      prompt: string;
      task: PublicTask;
      blockClose: string;
    };

export interface PublicContent {
  version: string;
  specialties: Array<{
    key: SpecialtyKey;
    specialtyId: number;
    name: string;
    tagline: string;
    color: { light: string; dark: string };
    icon: string;
    totalCredits: number;
    electives: Array<{
      code: string;
      name: string;
      shortName: string;
      credits: number;
      prerequisite: string;
    }>;
  }>;
  ulises: {
    welcome: string[];
    startButton: string;
    duelHelp: string;
    scaleHelp: string;
    reactions: { pick: string[]; both: string[]; none: string[]; scale: string[] };
    loading: string;
  };
  duelOptions: Array<{ id: DuelAnswer; label: string }>;
  scaleOptions: Array<{ id: ScaleAnswer; label: string }>;
  questions: PublicQuestion[];
}

export interface PublicTiebreak {
  id: string;
  order: 1 | 2;
  prompt: string;
  top: PublicTask;
  bottom: PublicTask;
}

export interface RankingEntry {
  key: SpecialtyKey;
  specialtyId: number;
  name: string;
  affinity: number;
}

export interface ResultUlises {
  intro: string;
  headline: string;
  tiebreakOutcome: string | null;
  closing: string;
  retake: string;
}

export type ReasonSource = "ai" | "templates";

export type EvaluateResponse =
  | { status: "tiebreak"; tiebreak: PublicTiebreak; ulisesLine: string }
  | {
      status: "result";
      result: {
        version: string;
        completedAt: string;
        tie: boolean;
        ranking: RankingEntry[];
        reason: string;
        reasonSource: ReasonSource;
        ulises: ResultUlises;
      };
    };

export interface StoredResultResponse {
  result: {
    version: string;
    isCurrentVersion: boolean;
    completedAt: string;
    tie: boolean;
    ranking: RankingEntry[];
  } | null;
}

// ── Guardado (RS-BE-44) ─────────────────────────────────────────────────────

/** Un elemento de `student_specialty_test_result.ranking`. */
export interface StoredRankingEntry {
  key: SpecialtyKey;
  specialtyId: number;
  affinity: number;
}

export interface StoredResult {
  contentVersion: string;
  ranking: StoredRankingEntry[];
  isTie: boolean;
  /** ISO-8601 en UTC con milisegundos, armado en SQL. */
  completedAt: string;
}
```

- [ ] **Paso 5: Escribir el registro de versiones**

Crear `src/modules/specialty-test/content/index.ts`.

```ts
/**
 * RS-BE-37 · Registro de las versiones del contenido del test.
 *
 * Cada versión es un archivo JSON de esta carpeta, con el nombre igual a su
 * campo `version`, que genera `scripts/specialty-test/generar.py` y que nadie
 * edita a mano. Se importan de forma estática, con el atributo `type: "json"`,
 * para que `tsc` los copie a `dist/` y el empaquetado de Vercel los incluya:
 * no se lee el disco en tiempo de ejecución.
 *
 * Agregar una versión es sumar su `import` y su fila en `CONTENT_BY_VERSION`,
 * y mover `CURRENT_VERSION` si pasa a ser la vigente. Retirarla es sacarla del
 * mapa, y desde ahí `POST /specialty-test/me/evaluate` responde
 * `409 SPECIALTY_TEST_VERSION_OUTDATED`.
 */
import type { ContentRegistry, SpecialtyTestContent } from "../specialty-test.types.js";
import v2026_09_25_4 from "./2026-09-25.4.json" with { type: "json" };

export const CURRENT_VERSION = "2026-09-25.4";

export const CONTENT_BY_VERSION: ReadonlyMap<string, SpecialtyTestContent> = new Map([
  ["2026-09-25.4", v2026_09_25_4 as unknown as SpecialtyTestContent],
]);

export const CONTENT_REGISTRY: ContentRegistry = {
  currentVersion: CURRENT_VERSION,
  byVersion: CONTENT_BY_VERSION,
};
```

- [ ] **Paso 6: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-content.test.ts
```

**Esperado:** `13 pass`, `0 fail`, `796 expect() calls`.

- [ ] **Paso 7: Build, JSON en `dist/` y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && ls dist/modules/specialty-test/content && node --input-type=module -e "const m = await import('./dist/modules/specialty-test/content/index.js'); const c = m.CONTENT_BY_VERSION.get(m.CURRENT_VERSION); console.log(m.CURRENT_VERSION, c.questions.length, c.tiebreakers.length)" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores; `dist/modules/specialty-test/content` con `2026-09-25.4.json` junto a `index.js`, porque `tsc` copia el JSON importado; Node imprime `2026-09-25.4 14 12`, lo que prueba que el `import` con `with { type: "json" }` carga fuera de bun; y la suite da 2297 pass, 42 skip, 0 fail, 8267 `expect()` y 2339 pruebas en 133 archivos (+13 pruebas y +1 archivo).

- [ ] **Paso 8: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/specialty-test/specialty-test.types.ts src/modules/specialty-test/content/2026-09-25.4.json src/modules/specialty-test/content/index.ts test/HU36_jeff/specialty-test-content.test.ts && git commit -m "feat(specialty-test): contenido 2026-09-25.4 versionado dentro del módulo, con sus invariantes (RS-BE-37)" -m "El JSON que genera generar.py entra como content/2026-09-25.4.json y content/index.ts lo registra con un import estático, para que tsc lo copie a dist y Vercel lo empaquete. La prueba recorre cada versión del registro con las invariantes de la spec, íconos incluidos."
```

---

### Tarea 2: Afinidad exacta, orden y desempates

**Requisitos:** RS-BE-40 (`h`, `n`, `e`, `S` y `U` enteros, orden por `S`, `U`, `e` y orden fijo, redondeo con el medio hacia arriba) y RS-BE-41 (desempate 1 con diferencia de 2100 o menos, desempate 2 medido en el par, sin tercero, y el desempate recibido que no toca).

**Archivos:**
- Crear: `src/modules/specialty-test/specialty-test.logic.ts`
- Prueba: `test/HU36_jeff/specialty-test-logic.test.ts`

**Interfaces:**
- Consume (Tarea 1): `SPECIALTY_KEYS`, `Answer`, `ContentTask`, `DuelAnswer`, `ScaleAnswer`, `SpecialtyKey`, `SpecialtyTestContent`, `Tiebreaker`, y `CONTENT_BY_VERSION` y `CURRENT_VERSION` en la prueba.
- Produce:
  - Las constantes que la Tarea 3 compara con el JSON, `HALF_POINTS = { pick: 2, both: 1, none: 0 }`, `DUELS_PER_SPECIALTY = 5`, `SCALE_VALUE`, `SCALE_MAX = 3`, `DUELS_WEIGHT_TENTHS = 7`, `SCALE_WEIGHT_TENTHS = 3`, `TIEBREAK_THRESHOLD = 10`, `MAX_TIEBREAKS = 2` y `AFFINITY_SCALE = 210`.
  - Tipos `ShownTiebreak { tiebreaker; answer }`, `Tally { h; n; e }`, `Score { S; U; e }`, `Evaluation { tally; scores; ranking; tie; shown; pair }` y `Step`, que es `{ kind: "tiebreak"; tiebreaker; line: "first" | "second" }`, `{ kind: "mismatch"; expected: string | null }` o `{ kind: "result"; evaluation }`.
  - `tally(content, answers, shown): Tally`, `scoreOf(h, n, e): Score`, `scores(t): Record<SpecialtyKey, Score>`, `rankKeys(s): SpecialtyKey[]`, `roundAffinity(S): number`, `pairOf(a, b): [SpecialtyKey, SpecialtyKey]` y `evaluateAnswers(content, answers, received: Array<{ id; answer }>): Step`.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/specialty-test-logic.test.ts` con este contenido. Las respuestas de los casos de borde (`DIFERENCIA_11`, `DIEZ_83` y `TERCERA_PASA`) salen de una búsqueda sobre la versión vigente, y cada una anota las afinidades que produce. La Tarea 3 le suma el motivo y las líneas de Ulises.

```ts
import { describe, expect, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import {
  evaluateAnswers,
  rankKeys,
  roundAffinity,
  scoreOf,
  scores,
  tally,
  type Evaluation,
  type Score,
  type Step,
} from "../../src/modules/specialty-test/specialty-test.logic.js";
import type {
  Answer,
  DuelAnswer,
} from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-40, RS-BE-41 y RS-BE-42 sobre la versión vigente, sin base ni red.
 *
 * Los ocho ejemplos del contenido se reproducen letra por letra en
 * `specialty-test-content.test.ts`. Aquí van los bordes que los ejemplos no
 * cubren: la aritmética exacta para todo h, n y e, el orden, el redondeo, los
 * umbrales de 10 y 11, el 10,83 tras el primer desempate, el segundo desempate
 * medido en el par aunque una tercera lo pase, y las líneas de Ulises. Las
 * respuestas de los casos de borde salen de una búsqueda sobre la versión
 * vigente; cada caso anota las afinidades que produce.
 */

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const ejemplo = (id: string) => c.weights.examples.find((e) => e.id === id)!;

/** Contesta los desempates que el cálculo va pidiendo, con `respuestas` en orden. */
const recorrer = (
  answers: Readonly<Record<string, Answer>>,
  respuestas: readonly DuelAnswer[],
): { pedidos: string[]; lineas: string[]; final: Step } => {
  const recibidos: Array<{ id: string; answer: DuelAnswer }> = [];
  const pedidos: string[] = [];
  const lineas: string[] = [];
  let paso = evaluateAnswers(c, answers, recibidos);
  while (paso.kind === "tiebreak") {
    pedidos.push(paso.tiebreaker.id);
    lineas.push(paso.line);
    recibidos.push({ id: paso.tiebreaker.id, answer: respuestas[recibidos.length]! });
    paso = evaluateAnswers(c, answers, recibidos);
  }
  return { pedidos, lineas, final: paso };
};

const evaluacion = (answers: Readonly<Record<string, Answer>>, respuestas: readonly DuelAnswer[]): Evaluation => {
  const { final } = recorrer(answers, respuestas);
  if (final.kind !== "result") throw new Error(`se esperaba un resultado y llego ${final.kind}`);
  return final.evaluation;
};

/** vj 62 y ti 51 tras las 14: diferencia de 11, sin desempate. */
const DIFERENCIA_11: Record<string, Answer> = {
  q01: "bottom", q02: "bottom", q03: "top", q04: "me_encantaria", q05: "top", q06: "both",
  q07: "bottom", q08: "bastante", q09: "top", q10: "bottom", q11: "top", q12: "nada",
  q13: "none", q14: "un_poco",
};

/** sw 49 y ti 44 tras las 14; con «top» en tb-sw-ti-1 quedan 52,5 y 41,67 (10,83). */
const DIEZ_83: Record<string, Answer> = {
  q01: "top", q02: "both", q03: "both", q04: "me_encantaria", q05: "bottom", q06: "top",
  q07: "both", q08: "nada", q09: "none", q10: "none", q11: "top", q12: "nada",
  q13: "none", q14: "nada",
};

/**
 * ti 45, si 41, vj 41 y sw 35 tras las 14. Con «none» en tb-ti-si-1 quedan
 * ti 39,17 y si 37,5, y vj (41) pasa a las dos; el par sigue a 1,67.
 */
const TERCERA_PASA: Record<string, Answer> = {
  q01: "top", q02: "none", q03: "bottom", q04: "un_poco", q05: "none", q06: "bottom",
  q07: "both", q08: "bastante", q09: "bottom", q10: "both", q11: "bottom", q12: "bastante",
  q13: "both", q14: "nada",
};

describe("afinidad exacta (RS-BE-40)", () => {
  test("S y U son enteros e iguales a 210·A y 210·D para todo h, n y e", () => {
    for (const n of [5, 6, 7]) {
      for (let h = 0; h <= 2 * n; h++) {
        for (let e = 0; e <= 3; e++) {
          const { S, U } = scoreOf(h, n, e);
          expect(Number.isInteger(S)).toBe(true);
          expect(Number.isInteger(U)).toBe(true);
          // 210·A = 210·(35h/n + 10e) y 210·D = 210·(50h/n), comparadas en enteros.
          expect(S * n).toBe(210 * 35 * h + 210 * 10 * e * n);
          expect(U * n).toBe(210 * 50 * h);
        }
      }
    }
  });

  test("un numero de duelos fuera de 5, 6 o 7 que no divide exacto es un error", () => {
    expect(() => scoreOf(1, 4, 0)).toThrow();
  });

  test("el redondeo lleva el medio hacia arriba: 17,5 se muestra como 18", () => {
    expect(roundAffinity(17.5 * 210)).toBe(18);
    expect(roundAffinity(17.4 * 210)).toBe(17);
    expect(roundAffinity(0)).toBe(0);
    expect(roundAffinity(100 * 210)).toBe(100);
  });
});

describe("orden (RS-BE-40)", () => {
  const s = (S: number, U: number, e: number): Score => ({ S, U, e });

  test("S descendente manda", () => {
    expect(rankKeys({ sw: s(1, 0, 0), ti: s(4, 0, 0), si: s(3, 0, 0), vj: s(2, 0, 0) })).toEqual([
      "ti", "si", "vj", "sw",
    ]);
  });

  test("con la misma S decide U, luego e y por ultimo el orden fijo", () => {
    expect(rankKeys({ sw: s(9, 1, 0), ti: s(9, 2, 0), si: s(9, 2, 1), vj: s(9, 2, 1) })).toEqual([
      "si", "vj", "ti", "sw",
    ]);
  });
});

describe("desempates (RS-BE-41)", () => {
  test("una diferencia de 10 exacta pide el desempate 1 del par, con la linea first", () => {
    // ejemplo-2: si 79 y vj 69 tras las 14.
    const { pedidos, lineas } = recorrer(ejemplo("ejemplo-2").answers, ["bottom", "top"]);
    expect(pedidos).toEqual(["tb-si-vj-1", "tb-si-vj-2"]);
    expect(lineas).toEqual(["first", "second"]);
  });

  test("una diferencia de 11 no pide desempate", () => {
    const { pedidos, final } = recorrer(DIFERENCIA_11, []);
    expect(pedidos).toEqual([]);
    expect(final.kind).toBe("result");
  });

  test("10,83 tras el primer desempate ya no pide el segundo", () => {
    const { pedidos } = recorrer(DIEZ_83, ["top"]);
    expect(pedidos).toEqual(["tb-sw-ti-1"]);
    const ev = evaluacion(DIEZ_83, ["top"]);
    expect(ev.scores.sw.S - ev.scores.ti.S).toBe(2275); // 10,83 · 210
  });

  test("el segundo desempate se mide en el par aunque una tercera lo pase", () => {
    const tras1 = scores(
      tally(c, TERCERA_PASA, [{ tiebreaker: c.tiebreakers.find((t) => t.id === "tb-ti-si-1")!, answer: "none" }]),
    );
    expect(rankKeys(tras1)[0]).toBe("vj");
    const { pedidos } = recorrer(TERCERA_PASA, ["none", "top"]);
    expect(pedidos).toEqual(["tb-ti-si-1", "tb-ti-si-2"]);
  });

  test("no hay tercer desempate aunque la diferencia siga en 10 o menos", () => {
    // ejemplo-2 termina a 10 exactos (vj 75, si 65) tras el segundo desempate.
    const ev = evaluacion(ejemplo("ejemplo-2").answers, ["bottom", "top"]);
    expect(ev.shown).toHaveLength(2);
    expect(ev.scores.vj.S - ev.scores.si.S).toBe(2100);
  });

  test("un desempate que no toca, con otro id o de mas es mismatch con el id esperado", () => {
    const a = ejemplo("ejemplo-2").answers;
    expect(evaluateAnswers(c, a, [{ id: "tb-sw-ti-1", answer: "top" }])).toEqual({
      kind: "mismatch", expected: "tb-si-vj-1",
    });
    expect(evaluateAnswers(c, a, [
      { id: "tb-si-vj-1", answer: "bottom" }, { id: "tb-si-vj-1", answer: "top" },
    ])).toEqual({ kind: "mismatch", expected: "tb-si-vj-2" });
    expect(evaluateAnswers(c, ejemplo("ejemplo-1").answers, [{ id: "tb-sw-si-1", answer: "top" }])).toEqual({
      kind: "mismatch", expected: null,
    });
    expect(evaluateAnswers(c, a, [
      { id: "tb-si-vj-1", answer: "bottom" },
      { id: "tb-si-vj-2", answer: "top" },
      { id: "tb-si-vj-2", answer: "top" },
    ])).toEqual({ kind: "mismatch", expected: null });
  });

  test("la misma entrada da siempre el mismo paso y el mismo ranking", () => {
    const a = ejemplo("ejemplo-3").answers;
    const r = [{ id: "tb-sw-ti-1", answer: "bottom" as const }];
    expect(evaluateAnswers(c, a, r)).toEqual(evaluateAnswers(c, a, r));
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-logic.test.ts
```

**Esperado:** falla con `error: Cannot find module '../../src/modules/specialty-test/specialty-test.logic.js'`, `0 pass` y `1 fail`.

- [ ] **Paso 3: Implementar el cálculo**

Crear `src/modules/specialty-test/specialty-test.logic.ts`. `evaluateAnswers` repite el cálculo desde las 14 respuestas en cada llamada, así que no guarda nada entre una petición y otra, y mide la diferencia siempre entre la primera y la segunda del orden inicial, aunque una tercera las pase.

```ts
/**
 * RS-BE-40 y RS-BE-41 · El cálculo del test, en funciones puras.
 *
 * Nada de este archivo toca la base ni la red. Recibe el contenido de una
 * versión y las respuestas, y devuelve el paso siguiente: un desempate, un
 * desempate que no corresponde o el resultado con su ranking. El motivo de las
 * plantillas y las líneas de Ulises (RS-BE-42) viven en
 * `specialty-test.templates.ts`.
 *
 * ARITMÉTICA EXACTA. Ninguna comparación usa coma flotante. Para cada
 * especialidad se cuentan `h` (medios puntos de duelo), `n` (duelos mostrados,
 * 5, 6 o 7) y `e` (valor de su escala, 0 a 3), y se trabaja con
 *   S = 210 · A = (7350 / n) · h + 2100 · e
 *   U = 210 · D = (10500 / n) · h
 * que son enteros porque 5, 6 y 7 dividen a 7350 y a 10500. «La misma
 * afinidad exacta» es `S` igual, y el redondeo que ve la app es
 * `floor((S + 105) / 210)`.
 */
import type {
  Answer,
  ContentTask,
  DuelAnswer,
  ScaleAnswer,
  SpecialtyKey,
  SpecialtyTestContent,
  Tiebreaker,
} from "./specialty-test.types.js";
import { SPECIALTY_KEYS } from "./specialty-test.types.js";

// ── Constantes que el contenido tiene que repetir (RS-BE-37) ────────────────
//
// `specialty-test-content.test.ts` compara cada una con el JSON de cada
// versión del registro. Un cambio de peso en el archivo sin su cambio aquí
// hace fallar la prueba en vez de quedar ignorado en silencio.

/** Medios puntos por respuesta de duelo: elegir da 2, «las dos» da 1 a cada una. */
export const HALF_POINTS = { pick: 2, both: 1, none: 0 } as const;
export const DUELS_PER_SPECIALTY = 5;
export const SCALE_VALUE: Record<ScaleAnswer, number> = {
  nada: 0,
  un_poco: 1,
  bastante: 2,
  me_encantaria: 3,
};
export const SCALE_MAX = 3;
/** A = 0,7 · D + 0,3 · E, en décimos para no escribir un flotante. */
export const DUELS_WEIGHT_TENTHS = 7;
export const SCALE_WEIGHT_TENTHS = 3;
/** Diferencia de afinidad que pide un desempate: 10, o sea 2100 en `S`. */
export const TIEBREAK_THRESHOLD = 10;
export const MAX_TIEBREAKS = 2;

/** Escala entera de las comparaciones: S = 210 · A y U = 210 · D. */
export const AFFINITY_SCALE = 210;
const ESCALA = AFFINITY_SCALE;
const UMBRAL_S = TIEBREAK_THRESHOLD * ESCALA; // 2100

// ── Conteo y afinidad (RS-BE-40) ────────────────────────────────────────────

/** Un desempate ya mostrado y su respuesta. */
export interface ShownTiebreak {
  tiebreaker: Tiebreaker;
  answer: DuelAnswer;
}

export interface Tally {
  h: Record<SpecialtyKey, number>;
  n: Record<SpecialtyKey, number>;
  e: Record<SpecialtyKey, number>;
}

export interface Score {
  /** 210 · A, entero. */
  S: number;
  /** 210 · D, entero. */
  U: number;
  e: number;
}

const porClave = <T>(valor: (clave: SpecialtyKey) => T): Record<SpecialtyKey, T> =>
  Object.fromEntries(SPECIALTY_KEYS.map((k) => [k, valor(k)])) as Record<SpecialtyKey, T>;

const sumarDuelo = (t: Tally, top: ContentTask, bottom: ContentTask, answer: DuelAnswer): void => {
  for (const [lado, tarea] of [["top", top], ["bottom", bottom]] as const) {
    const k = tarea.specialty;
    t.n[k] += 1;
    if (answer === lado) t.h[k] += HALF_POINTS.pick;
    else if (answer === "both") t.h[k] += HALF_POINTS.both;
  }
};

/** Cuenta h, n y e con las 14 respuestas y los desempates mostrados. */
export const tally = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  shown: readonly ShownTiebreak[],
): Tally => {
  const t: Tally = { h: porClave(() => 0), n: porClave(() => 0), e: porClave(() => 0) };
  for (const q of content.questions) {
    const respuesta = answers[q.id];
    if (q.type === "scale") t.e[q.task.specialty] = SCALE_VALUE[respuesta as ScaleAnswer];
    else sumarDuelo(t, q.top, q.bottom, respuesta as DuelAnswer);
  }
  for (const { tiebreaker, answer } of shown) {
    sumarDuelo(t, tiebreaker.top, tiebreaker.bottom, answer);
  }
  return t;
};

/** 7350 / n y 10500 / n, exigiendo que la división sea exacta (n ∈ {5, 6, 7}). */
const divisionExacta = (dividendo: number, n: number): number => {
  if (!Number.isInteger(n) || n <= 0 || dividendo % n !== 0) {
    throw new Error(`Número de duelos inesperado: ${n}`);
  }
  return dividendo / n;
};

export const scoreOf = (h: number, n: number, e: number): Score => ({
  S: divisionExacta(35 * ESCALA, n) * h + 10 * ESCALA * e,
  U: divisionExacta(50 * ESCALA, n) * h,
  e,
});

export const scores = (t: Tally): Record<SpecialtyKey, Score> =>
  porClave((k) => scoreOf(t.h[k], t.n[k], t.e[k]));

/** S descendente, U descendente, e descendente y el orden fijo sw, ti, si, vj. */
export const rankKeys = (s: Record<SpecialtyKey, Score>): SpecialtyKey[] =>
  [...SPECIALTY_KEYS].sort(
    (a, b) =>
      s[b].S - s[a].S ||
      s[b].U - s[a].U ||
      s[b].e - s[a].e ||
      SPECIALTY_KEYS.indexOf(a) - SPECIALTY_KEYS.indexOf(b),
  );

/** Entero de 0 a 100 con el medio hacia arriba: 17,5 → 18. */
export const roundAffinity = (S: number): number => Math.floor((S + ESCALA / 2) / ESCALA);

/** Las dos claves de un par en el orden fijo, que es como se nombran los desempates. */
export const pairOf = (a: SpecialtyKey, b: SpecialtyKey): [SpecialtyKey, SpecialtyKey] =>
  SPECIALTY_KEYS.indexOf(a) <= SPECIALTY_KEYS.indexOf(b) ? [a, b] : [b, a];

// ── Desempates (RS-BE-41) ───────────────────────────────────────────────────

export interface Evaluation {
  tally: Tally;
  scores: Record<SpecialtyKey, Score>;
  /** Las cuatro, en el orden final. */
  ranking: SpecialtyKey[];
  /** Las dos primeras con la misma `S`. */
  tie: boolean;
  shown: ShownTiebreak[];
  /** El par del desempate, o null si no se mostró ninguno. */
  pair: [SpecialtyKey, SpecialtyKey] | null;
}

export type Step =
  | { kind: "tiebreak"; tiebreaker: Tiebreaker; line: "first" | "second" }
  | { kind: "mismatch"; expected: string | null }
  | { kind: "result"; evaluation: Evaluation };

const buscarDesempate = (
  content: SpecialtyTestContent,
  par: [SpecialtyKey, SpecialtyKey],
  orden: number,
): Tiebreaker => {
  const encontrado = content.tiebreakers.find(
    (t) => t.pair[0] === par[0] && t.pair[1] === par[1] && t.order === orden,
  );
  if (!encontrado) throw new Error(`Falta el desempate ${par.join("-")}-${orden}`);
  return encontrado;
};

/**
 * Repite el cálculo con las 14 respuestas y, paso a paso, con los desempates
 * recibidos. Cada desempate recibido tiene que ser justo el que toca en su
 * paso; si llega otro, o uno de más, el paso es `mismatch` con el id que tocaba
 * (o null si ya no tocaba ninguno). Supone respuestas ya validadas contra la
 * versión (RS-BE-39, paso 5).
 */
export const evaluateAnswers = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  received: ReadonlyArray<{ id: string; answer: DuelAnswer }>,
): Step => {
  const inicial = rankKeys(scores(tally(content, answers, [])));
  const primera = inicial[0]!;
  const segunda = inicial[1]!;
  const par = pairOf(primera, segunda);
  const shown: ShownTiebreak[] = [];

  for (let orden = 1; orden <= MAX_TIEBREAKS; orden++) {
    const s = scores(tally(content, answers, shown));
    if (Math.abs(s[primera].S - s[segunda].S) > UMBRAL_S) break;
    const tiebreaker = buscarDesempate(content, par, orden);
    const recibido = received[orden - 1];
    if (!recibido) {
      return { kind: "tiebreak", tiebreaker, line: orden === 1 ? "first" : "second" };
    }
    if (recibido.id !== tiebreaker.id) return { kind: "mismatch", expected: tiebreaker.id };
    shown.push({ tiebreaker, answer: recibido.answer });
  }

  if (received.length > shown.length) return { kind: "mismatch", expected: null };

  const t = tally(content, answers, shown);
  const s = scores(t);
  const ranking = rankKeys(s);
  return {
    kind: "result",
    evaluation: {
      tally: t,
      scores: s,
      ranking,
      tie: s[ranking[0]!].S === s[ranking[1]!].S,
      shown,
      pair: shown.length > 0 ? par : null,
    },
  };
};
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-logic.test.ts
```

**Esperado:** `12 pass`, `0 fail`, `646 expect() calls`.

- [ ] **Paso 5: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2309 pass, 42 skip, 0 fail, 8913 `expect()` y 2351 pruebas en 134 archivos (+12 pruebas y +1 archivo).

- [ ] **Paso 6: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/specialty-test/specialty-test.logic.ts test/HU36_jeff/specialty-test-logic.test.ts && git commit -m "feat(specialty-test): afinidad en aritmética exacta, orden y hasta dos desempates (RS-BE-40, RS-BE-41)" -m "El cálculo trabaja con S = 210 · A y U = 210 · D, que son enteros con 5, 6 o 7 duelos, y decide el orden, el desempate que toca y el que no toca sin coma flotante. evaluateAnswers repite el cálculo en cada llamada, así que la evaluación no guarda estado."
```

---

### Tarea 3: Motivo con plantillas y líneas de Ulises

**Requisitos:** RS-BE-42 (plantillas `main` en su orden, `tiebreak`, `second`, `electives` y `tie`, condiciones exactas, variables, titular `winner`, `low` o `tie`, `stillTied` o `resolved`, `closing` y `retake`, y la línea `second` de Ulises sin uso) y la parte de RS-BE-37 que compara el archivo con la lógica (pesos, umbral, condiciones, variables conocidas y los ocho ejemplos letra por letra).

**Archivos:**
- Crear: `src/modules/specialty-test/specialty-test.templates.ts`
- Modificar: `test/HU36_jeff/specialty-test-logic.test.ts` (un import y dos bloques al final)
- Modificar: `test/HU36_jeff/specialty-test-content.test.ts` (los imports y un bloque al final)

**Interfaces:**
- Consume (Tareas 1 y 2): `AFFINITY_SCALE`, `roundAffinity`, `Evaluation` y `ShownTiebreak` de la lógica; los tipos del contenido y `ResultUlises`.
- Produce:
  - `AFFINITY_50_S = 10500`, `TEMPLATE_CONDITIONS` (el `when` exacto de cada plantilla), `MAIN_ORDER`, `TIEBREAK_TEMPLATE_ORDER` y `MainTemplateId`.
  - `plain(texto): string` (sin tildes ni mayúsculas, lo usan las Tareas 4 y 7), `formatPoints(h): string`, `nameOf(content, k): string`, `tasksChosen(content, answers, k): { alone; both }`, `scaleOf(content, answers, k): { task; label }`, `tiebreakTaskFor(shown, k): string` y `fillTemplate(texto, valores): string`, que lanza si queda una llave.
  - `TemplateReason { text; used; main: MainTemplateId | null }`, `buildTemplateReason(content, answers, ev): TemplateReason` y `buildResultUlises(content, ev): ResultUlises`.

- [ ] **Paso 1: Sumar las pruebas del motivo y de Ulises**

En `test/HU36_jeff/specialty-test-logic.test.ts`, reemplazar esta línea

```ts
} from "../../src/modules/specialty-test/specialty-test.logic.js";
```

por estas

```ts
} from "../../src/modules/specialty-test/specialty-test.logic.js";
import {
  buildResultUlises,
  buildTemplateReason,
  fillTemplate,
  formatPoints,
} from "../../src/modules/specialty-test/specialty-test.templates.js";
```

y agregar al final del archivo, después de una línea en blanco, este bloque.

```ts
describe("motivo con plantillas (RS-BE-42)", () => {
  test("los puntos van con coma decimal: 4 y 3,5", () => {
    expect(formatPoints(8)).toBe("4");
    expect(formatPoints(7)).toBe("3,5");
    expect(formatPoints(0)).toBe("0");
  });

  test("cada plantilla main se alcanza al menos una vez en los ejemplos", () => {
    const usadas = new Set(
      c.weights.examples.flatMap((e) => {
        const ev = evaluacion(e.answers, e.tiebreakAnswers);
        const m = buildTemplateReason(c, e.answers, ev).main;
        return m ? [m] : [];
      }),
    );
    expect([...usadas].sort()).toEqual(
      ["duelsOverScale", "general", "low", "noMainPoints", "scaleOverDuels", "strong"],
    );
  });

  test("con empate se usa solo la plantilla tie", () => {
    const e = ejemplo("ejemplo-8");
    const motivo = buildTemplateReason(c, e.answers, evaluacion(e.answers, e.tiebreakAnswers));
    expect(motivo.used).toEqual(["tie"]);
    expect(motivo.main).toBeNull();
  });

  test("{electivos} no repite un curso aunque dos tareas lo compartan", () => {
    const e = ejemplo("ejemplo-2");
    const motivo = buildTemplateReason(c, e.answers, evaluacion(e.answers, e.tiebreakAnswers));
    expect(motivo.text.match(/«Proyecto de Videojuegos»/g)).toHaveLength(1);
  });

  test("una llave sin reemplazar es un error de la implementacion", () => {
    expect(() => fillTemplate("Hola {nadie}.", {})).toThrow();
  });
});

describe("lineas de Ulises del resultado (RS-BE-42)", () => {
  const lineas = c.ulisesLines;

  test("titular winner con afinidad de 50 o mas, y resolved tras un desempate", () => {
    const e = ejemplo("ejemplo-2");
    const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
    expect(u.headline).toBe("Lo tuyo apunta a Desarrollo de Videojuegos, con 75 % de afinidad.");
    expect(u.tiebreakOutcome).toBe(lineas.tiebreak.resolved);
  });

  test("titular low con afinidad menor que 50", () => {
    const e = ejemplo("ejemplo-4");
    const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
    expect(u.headline).toBe(
      "Esta vez ninguna despegó del todo. Por ahora, Tecnologías de la Información va adelante, con 20 %.",
    );
  });

  test("con empate el titular es tie y el desenlace stillTied", () => {
    const e = ejemplo("ejemplo-8");
    const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
    expect(u.headline).toBe(
      "Empate. Ingeniería de Software y Tecnologías de la Información quedaron igualitas, con 60 %.",
    );
    expect(u.tiebreakOutcome).toBe(lineas.tiebreak.stillTied);
  });

  test("empate con afinidad menor que 50: manda tie y no low", () => {
    // TERCERA_PASA con «bottom» y «bottom»: ti y si terminan en 45 exactos.
    const ev = evaluacion(TERCERA_PASA, ["bottom", "bottom"]);
    expect(ev.tie).toBe(true);
    expect(ev.scores.ti.S).toBeLessThan(50 * 210);
    expect(buildResultUlises(c, ev).headline).toBe(
      "Empate. Tecnologías de la Información y Sistemas de Información quedaron igualitas, con 45 %.",
    );
  });

  test("sin desempate no hay desenlace", () => {
    const e = ejemplo("ejemplo-1");
    expect(buildResultUlises(c, evaluacion(e.answers, [])).tiebreakOutcome).toBeNull();
  });

  test("closing y retake van en todo resultado y la linea second de Ulises en ninguno", () => {
    const segunda = lineas.result.second.split("{")[0]!;
    for (const e of c.weights.examples) {
      const u = buildResultUlises(c, evaluacion(e.answers, e.tiebreakAnswers));
      expect(u.intro).toBe(lineas.result.intro);
      expect(u.closing).toBe(lineas.result.closing);
      expect(u.retake).toBe(lineas.result.retake);
      for (const texto of Object.values(u)) {
        if (texto) expect(texto.startsWith(segunda)).toBe(false);
      }
    }
  });
});
```

- [ ] **Paso 2: Sumar a la prueba del contenido los pesos, las plantillas y los ejemplos**

En `test/HU36_jeff/specialty-test-content.test.ts`, reemplazar estos imports

```ts
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import type {
  ContentTask,
  SpecialtyTestContent,
} from "../../src/modules/specialty-test/specialty-test.types.js";
```

por estos

```ts
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import {
  DUELS_PER_SPECIALTY, DUELS_WEIGHT_TENTHS, HALF_POINTS, MAX_TIEBREAKS, SCALE_MAX, SCALE_VALUE,
  SCALE_WEIGHT_TENTHS, TIEBREAK_THRESHOLD, evaluateAnswers, roundAffinity,
} from "../../src/modules/specialty-test/specialty-test.logic.js";
import {
  MAIN_ORDER, TEMPLATE_CONDITIONS, TIEBREAK_TEMPLATE_ORDER, buildTemplateReason,
} from "../../src/modules/specialty-test/specialty-test.templates.js";
import type {
  ContentTask,
  DuelAnswer,
  SpecialtyTestContent,
} from "../../src/modules/specialty-test/specialty-test.types.js";
```

y agregar al final del archivo, después de una línea en blanco, este bloque.

```ts
// ── Pesos, plantillas y ejemplos contra la lógica del módulo ────────────────

/** Variables que cada grupo de plantillas puede usar (RS-BE-42). */
const VARIABLES = new Set([
  "nombre", "afinidad", "puntos", "duelos", "tareas", "escalaTarea", "escalaRespuesta",
  "rival", "tareaDesempate", "segunda", "afinidadSegunda", "electivos",
]);
const VARIABLES_DEL_EMPATE = new Set(["a", "b", "puntosA", "duelosA", "puntosB", "duelosB"]);
const VARIABLES_DE_ULISES = new Set(["nombre", "afinidad", "segunda", "afinidadSegunda", "a", "b"]);

const variablesDe = (texto: string): string[] => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

for (const [clave, c] of CONTENT_BY_VERSION) {
  describe(`contenido ${clave} contra la logica (RS-BE-37, RS-BE-40 a RS-BE-42)`, () => {
    test("los pesos y el umbral del archivo son las constantes del modulo", () => {
      const w = c.weights;
      expect([w.duel.pick * 2, w.duel.both * 2, w.duel.none * 2]).toEqual([
        HALF_POINTS.pick, HALF_POINTS.both, HALF_POINTS.none,
      ]);
      expect(w.duel.duelsPerSpecialty).toBe(DUELS_PER_SPECIALTY);
      expect(w.scale.max).toBe(SCALE_MAX);
      expect(Object.fromEntries(w.scale.options.map((o) => [o.id, o.value]))).toEqual(SCALE_VALUE);
      expect([w.affinity.duelsWeight * 10, w.affinity.scaleWeight * 10]).toEqual([
        DUELS_WEIGHT_TENTHS, SCALE_WEIGHT_TENTHS,
      ]);
      expect(w.tiebreak.threshold).toBe(TIEBREAK_THRESHOLD);
      expect(w.tiebreak.maxDuels).toBe(MAX_TIEBREAKS);
    });

    test("las condiciones y el orden de las plantillas son los del modulo", () => {
      const t = c.reasonTemplates;
      expect(t.main.map((p) => p.id)).toEqual([...MAIN_ORDER]);
      expect(t.tiebreak.map((p) => p.id)).toEqual([...TIEBREAK_TEMPLATE_ORDER]);
      expect(t.second.map((p) => p.id)).toEqual(["second"]);
      expect(t.electives.map((p) => p.id)).toEqual(["electives"]);
      expect(t.tie.map((p) => p.id)).toEqual(["tie"]);
      for (const p of [...t.main, ...t.tiebreak, ...t.second, ...t.electives, ...t.tie]) {
        expect({ id: p.id, when: p.when }).toEqual({
          id: p.id,
          when: TEMPLATE_CONDITIONS[p.id as keyof typeof TEMPLATE_CONDITIONS],
        });
      }
    });

    test("las plantillas y las lineas de Ulises solo usan variables conocidas", () => {
      const t = c.reasonTemplates;
      for (const p of [...t.main, ...t.tiebreak, ...t.second, ...t.electives]) {
        for (const v of variablesDe(p.text)) expect({ id: p.id, v, ok: VARIABLES.has(v) }).toEqual({ id: p.id, v, ok: true });
      }
      for (const v of variablesDe(t.tie[0]!.text)) expect(VARIABLES_DEL_EMPATE.has(v)).toBe(true);
      const r = c.ulisesLines.result;
      for (const linea of [r.winner, r.low, r.tie, r.second]) {
        for (const v of variablesDe(linea)) expect(VARIABLES_DE_ULISES.has(v)).toBe(true);
      }
    });

    for (const ej of c.weights.examples) {
      test(`${ej.id} reproduce ranking, afinidades, empate, desempates, plantillas y motivo`, () => {
        const recibidos: Array<{ id: string; answer: DuelAnswer }> = [];
        let paso = evaluateAnswers(c, ej.answers, recibidos);
        while (paso.kind === "tiebreak") {
          const respuesta = ej.tiebreakAnswers[recibidos.length];
          expect(respuesta).toBeDefined();
          recibidos.push({ id: paso.tiebreaker.id, answer: respuesta! });
          paso = evaluateAnswers(c, ej.answers, recibidos);
        }
        expect(paso.kind).toBe("result");
        if (paso.kind !== "result") return;
        const ev = paso.evaluation;
        const motivo = buildTemplateReason(c, ej.answers, ev);

        expect(recibidos).toHaveLength(ej.tiebreakAnswers.length);
        expect(ev.ranking).toEqual(ej.result.ranking);
        expect(Object.fromEntries(SPECIALTY_KEYS.map((k) => [k, roundAffinity(ev.scores[k].S)]))).toEqual(
          ej.result.display,
        );
        expect(ev.tie).toBe(ej.result.tie);
        expect(motivo.used).toEqual(ej.reasonTemplatesUsed);
        expect(motivo.text).toBe(ej.reasonText);
      });
    }
  });
}
```

- [ ] **Paso 3: Correr las dos pruebas y ver que fallan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-content.test.ts test/HU36_jeff/specialty-test-logic.test.ts
```

**Esperado:** los dos archivos fallan con `error: Cannot find module '../../src/modules/specialty-test/specialty-test.templates.js'`, `0 pass` y `2 fail`.

- [ ] **Paso 4: Implementar las plantillas y las líneas de Ulises**

Crear `src/modules/specialty-test/specialty-test.templates.ts`. Las condiciones usan `S` y `U` enteros (`A < 50` es `S < 10500`, `D ≥ 80` es `U ≥ 16800`, `D ≥ 60` es `U ≥ 12600`), y los textos salen del contenido de la versión.

```ts
/**
 * RS-BE-42 · Motivo con plantillas y líneas de Ulises del resultado.
 *
 * Funciones puras sobre una `Evaluation` ya calculada por
 * `specialty-test.logic.ts`. Los textos salen del contenido de la versión
 * (`reasonTemplates` y `ulisesLines`); las condiciones de cada plantilla
 * están aquí, en aritmética exacta sobre `S` y `U`, y la prueba del contenido
 * exige que el campo `when` del archivo diga lo mismo que
 * `TEMPLATE_CONDITIONS`.
 */
import {
  AFFINITY_SCALE,
  roundAffinity,
  type Evaluation,
  type ShownTiebreak,
} from "./specialty-test.logic.js";
import type {
  Answer,
  ContentQuestion,
  ContentTask,
  DuelQuestion,
  ReasonTemplate,
  ResultUlises,
  ScaleAnswer,
  ScaleQuestion,
  SpecialtyKey,
  SpecialtyTestContent,
} from "./specialty-test.types.js";

/** 210 · 50: el corte `A < 50` de `low` y el `A2 ≥ 50` de `second`. */
export const AFFINITY_50_S = 50 * AFFINITY_SCALE;
const U_80 = 80 * AFFINITY_SCALE; // 16800, D ≥ 80
const U_60 = 60 * AFFINITY_SCALE; // 12600, D ≥ 60 y D < 60

/** Condición de cada plantilla, con el texto exacto de `reasonTemplates.*.when`. */
export const TEMPLATE_CONDITIONS = {
  low: "A < 50",
  noMainPoints: "tareas == ''",
  strong: "D >= 80 && e >= 2",
  duelsOverScale: "D >= 60 && e <= 1",
  scaleOverDuels: "e == 3 && D < 60",
  general: "true",
  tiebreakPicked: "huboDesempate && ganadoraEnElPar && tareaDesempate != ''",
  tiebreakNoPick: "huboDesempate && ganadoraEnElPar",
  second: "A2 >= 50",
  electives: "electivos != ''",
  tie: "empate",
} as const;

/** Orden en que se prueban las plantillas `main` (RS-BE-42). */
export const MAIN_ORDER = [
  "low",
  "noMainPoints",
  "strong",
  "duelsOverScale",
  "scaleOverDuels",
  "general",
] as const;
export const TIEBREAK_TEMPLATE_ORDER = ["tiebreakPicked", "tiebreakNoPick"] as const;

export type MainTemplateId = (typeof MAIN_ORDER)[number];

// ── Lo que el motivo y Cohere leen de las respuestas ───────────────────────

const duelos = (content: SpecialtyTestContent): DuelQuestion[] =>
  content.questions.filter((q): q is DuelQuestion => q.type === "duel");

const escalaDe = (content: SpecialtyTestContent, k: SpecialtyKey): ScaleQuestion => {
  const q = content.questions.find(
    (p: ContentQuestion): p is ScaleQuestion => p.type === "scale" && p.task.specialty === k,
  );
  if (!q) throw new Error(`Falta la escala de ${k}`);
  return q;
};

/**
 * Tareas de `k` en los 10 duelos de las preguntas: las que el alumno elige
 * sola, en orden de pregunta, y las de «Me gustan las dos», también en orden.
 */
export const tasksChosen = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  k: SpecialtyKey,
): { alone: ContentTask[]; both: ContentTask[] } => {
  const alone: ContentTask[] = [];
  const both: ContentTask[] = [];
  for (const q of duelos(content)) {
    const respuesta = answers[q.id];
    for (const lado of ["top", "bottom"] as const) {
      if (q[lado].specialty !== k) continue;
      if (respuesta === lado) alone.push(q[lado]);
      else if (respuesta === "both") both.push(q[lado]);
    }
  }
  return { alone, both };
};

export const scaleOf = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  k: SpecialtyKey,
): { task: ContentTask; label: string } => {
  const q = escalaDe(content, k);
  const respuesta = answers[q.id] as ScaleAnswer;
  const opcion = content.weights.scale.options.find((o) => o.id === respuesta);
  if (!opcion) throw new Error(`Respuesta de escala desconocida en ${q.id}`);
  return { task: q.task, label: opcion.label };
};

/** Resumen de la última tarea de desempate que el alumno elige sola y que es de `k`. */
export const tiebreakTaskFor = (shown: readonly ShownTiebreak[], k: SpecialtyKey): string => {
  let tarea = "";
  for (const { tiebreaker, answer } of shown) {
    if ((answer === "top" || answer === "bottom") && tiebreaker[answer].specialty === k) {
      tarea = tiebreaker[answer].summary;
    }
  }
  return tarea;
};

export const nameOf = (content: SpecialtyTestContent, k: SpecialtyKey): string => {
  const especialidad = content.specialties.find((s) => s.key === k);
  if (!especialidad) throw new Error(`Falta la especialidad ${k}`);
  return especialidad.name;
};

const nombreCortoDe = (content: SpecialtyTestContent, codigo: string): string => {
  for (const s of content.specialties) {
    const electivo = s.electives.find((e) => e.code === codigo);
    if (electivo) return electivo.shortName;
  }
  throw new Error(`Electivo desconocido: ${codigo}`);
};

/** Sin tildes ni mayúsculas, para comparar nombres (RS-BE-38 y RS-BE-43). */
export const plain = (texto: string): string =>
  texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** `h/2` con coma decimal: «4» o «3,5». */
export const formatPoints = (h: number): string =>
  h % 2 === 0 ? String(h / 2) : `${(h - 1) / 2},5`;

// ── Motivo con plantillas (RS-BE-42) ────────────────────────────────────────

const plantilla = (lista: readonly ReasonTemplate[], id: string): string => {
  const encontrada = lista.find((t) => t.id === id);
  if (!encontrada) throw new Error(`Falta la plantilla ${id}`);
  return encontrada.text;
};

/** Reemplaza `{variable}`; una llave que queda es un error de la implementación. */
export const fillTemplate = (texto: string, valores: Readonly<Record<string, string>>): string => {
  const lleno = texto.replace(/\{(\w+)\}/g, (marca, nombre: string) =>
    Object.hasOwn(valores, nombre) ? valores[nombre]! : marca,
  );
  if (lleno.includes("{") || lleno.includes("}")) {
    throw new Error("Plantilla con una variable sin reemplazar");
  }
  return lleno;
};

export interface TemplateReason {
  text: string;
  /** Ids de las plantillas usadas, en orden, como `reasonTemplatesUsed` de los ejemplos. */
  used: string[];
  /** La plantilla `main` elegida, o null con empate. Cohere la recibe como `lectura`. */
  main: MainTemplateId | null;
}

const elegirMain = (
  S: number,
  U: number,
  e: number,
  tareas: string,
): MainTemplateId => {
  if (S < AFFINITY_50_S) return "low";
  if (tareas === "") return "noMainPoints";
  if (U >= U_80 && e >= 2) return "strong";
  if (U >= U_60 && e <= 1) return "duelsOverScale";
  if (e === 3 && U < U_60) return "scaleOverDuels";
  return "general";
};

export const buildTemplateReason = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  ev: Evaluation,
): TemplateReason => {
  const plantillas = content.reasonTemplates;
  const [a, b] = [ev.ranking[0]!, ev.ranking[1]!];

  if (ev.tie) {
    const valores = {
      a: nameOf(content, a),
      b: nameOf(content, b),
      puntosA: formatPoints(ev.tally.h[a]),
      duelosA: String(ev.tally.n[a]),
      puntosB: formatPoints(ev.tally.h[b]),
      duelosB: String(ev.tally.n[b]),
    };
    return { text: fillTemplate(plantilla(plantillas.tie, "tie"), valores), used: ["tie"], main: null };
  }

  const ganadora = a;
  const { S, U, e } = ev.scores[ganadora];
  const elegidas = tasksChosen(content, answers, ganadora);
  const conTareas = [...elegidas.alone, ...elegidas.both].slice(0, 2);
  const tareas = conTareas.map((t) => t.summary).join(" y ");
  const electivos = [
    ...new Set(conTareas.map((t) => `«${nombreCortoDe(content, t.electives[0]!)}»`)),
  ].join(" y ");
  const escala = scaleOf(content, answers, ganadora);
  const enElPar = ev.pair !== null && ev.pair.includes(ganadora);
  const rival = enElPar ? ev.pair!.find((k) => k !== ganadora)! : null;
  const tareaDesempate = tiebreakTaskFor(ev.shown, ganadora);

  const valores: Record<string, string> = {
    nombre: nameOf(content, ganadora),
    afinidad: String(roundAffinity(S)),
    puntos: formatPoints(ev.tally.h[ganadora]),
    duelos: String(ev.tally.n[ganadora]),
    tareas,
    escalaTarea: escala.task.summary,
    escalaRespuesta: escala.label,
    rival: rival ? nameOf(content, rival) : "",
    tareaDesempate,
    segunda: nameOf(content, b),
    afinidadSegunda: String(roundAffinity(ev.scores[b].S)),
    electivos,
  };

  const main = elegirMain(S, U, e, tareas);
  const partes = [plantilla(plantillas.main, main)];
  const used: string[] = [main];

  if (ev.shown.length > 0 && enElPar) {
    const id = tareaDesempate !== "" ? "tiebreakPicked" : "tiebreakNoPick";
    partes.push(plantilla(plantillas.tiebreak, id));
    used.push(id);
  }
  if (ev.scores[b].S >= AFFINITY_50_S) {
    partes.push(plantilla(plantillas.second, "second"));
    used.push("second");
  }
  if (electivos !== "") {
    partes.push(plantilla(plantillas.electives, "electives"));
    used.push("electives");
  }

  return { text: fillTemplate(partes.join(" "), valores), used, main };
};

// ── Líneas de Ulises del resultado (RS-BE-42) ───────────────────────────────

export const buildResultUlises = (content: SpecialtyTestContent, ev: Evaluation): ResultUlises => {
  const lineas = content.ulisesLines;
  const ganadora = ev.ranking[0]!;
  const afinidad = String(roundAffinity(ev.scores[ganadora].S));

  let headline: string;
  if (ev.tie) {
    headline = fillTemplate(lineas.result.tie, {
      a: nameOf(content, ev.ranking[0]!),
      b: nameOf(content, ev.ranking[1]!),
      afinidad,
    });
  } else {
    const titular = ev.scores[ganadora].S < AFFINITY_50_S ? lineas.result.low : lineas.result.winner;
    headline = fillTemplate(titular, { nombre: nameOf(content, ganadora), afinidad });
  }

  let tiebreakOutcome: string | null = null;
  if (ev.shown.length > 0) tiebreakOutcome = ev.tie ? lineas.tiebreak.stillTied : lineas.tiebreak.resolved;

  return {
    intro: lineas.result.intro,
    headline,
    tiebreakOutcome,
    closing: lineas.result.closing,
    retake: lineas.result.retake,
  };
};
```

- [ ] **Paso 5: Correr las dos pruebas y ver que pasan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-content.test.ts test/HU36_jeff/specialty-test-logic.test.ts
```

**Esperado:** `47 pass`, `0 fail`, `1657 expect() calls` (24 del contenido y 23 de la lógica). Los ocho ejemplos reproducen su ranking, sus afinidades, su empate, su número de desempates, sus plantillas y su motivo letra por letra.

- [ ] **Paso 6: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2331 pass, 42 skip, 0 fail, 9128 `expect()` y 2373 pruebas en 134 archivos (+22 pruebas y ningún archivo nuevo).

- [ ] **Paso 7: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/specialty-test/specialty-test.templates.ts test/HU36_jeff/specialty-test-logic.test.ts test/HU36_jeff/specialty-test-content.test.ts && git commit -m "feat(specialty-test): motivo con plantillas y líneas de Ulises, con los ocho ejemplos letra por letra (RS-BE-37, RS-BE-42)" -m "Las condiciones de cada plantilla van en aritmética exacta y la prueba del contenido exige que el when del archivo diga lo mismo, igual que los pesos y el umbral. Los ocho ejemplos del contenido reproducen ranking, afinidades, empate, desempates, plantillas y motivo."
```

---

### Tarea 4: Motivo redactado por Cohere, con validación y respaldo

**Requisitos:** RS-BE-43 (llamada con `chatWithHistory`, `temperature` 0,3 y `maxTokens` 200, corte a los 5 segundos con `AbortController`, datos sin cifras ni datos del alumno, mensaje `user` exacto, prompt exacto, siete reglas de validación en orden, códigos `timeout`, `http`, `error`, `empty` e `invalid:<regla>`, y registros sin el texto de Cohere, `error.message`, respuestas ni ids).

**Archivos:**
- Crear: `src/modules/specialty-test/specialty-test.reason.ts`
- Prueba: `test/HU36_jeff/specialty-test-reason.test.ts`

**Interfaces:**
- Consume (Tareas 2 y 3): `Evaluation`, `evaluateAnswers`, `AFFINITY_50_S`, `nameOf`, `plain`, `scaleOf`, `tasksChosen`, `tiebreakTaskFor`, `MainTemplateId` y `buildTemplateReason` en la prueba.
- Produce:
  - `CohereChat`, la interfaz estructural de `cohereClient.chatWithHistory` (`src/services/cohere.client.ts:72-114`), sin cambios en el cliente.
  - `COHERE_TIMEOUT_MS = 5000`, `COHERE_TEMPERATURE = 0.3`, `COHERE_MAX_TOKENS = 200`, `REASON_MIN_LENGTH = 60`, `REASON_MAX_LENGTH = 500`, `REASON_PROMPT` y `READINGS`.
  - `ReasonData`, `buildReasonData(content, answers, ev, main): ReasonData` y `buildReasonMessage(data): string`.
  - `normalizeReason(bruto): string`, `ReasonRule` y `firstBrokenRule(texto, data, todas): ReasonRule | null`.
  - `WrittenReason { reason; reasonSource }` y `writeReason(cohere, data, respaldo, todas, timeoutMs = COHERE_TIMEOUT_MS): Promise<WrittenReason>`, que nunca lanza.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/specialty-test-reason.test.ts`. Ninguna prueba llama a Cohere, porque todas inyectan un cliente falso, y el tiempo agotado se prueba con `timeoutMs` de 20 ms además de fijar que la constante vale 5000.

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  CONTENT_BY_VERSION,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import { evaluateAnswers, type Evaluation } from "../../src/modules/specialty-test/specialty-test.logic.js";
import { buildTemplateReason } from "../../src/modules/specialty-test/specialty-test.templates.js";
import {
  COHERE_MAX_TOKENS,
  COHERE_TEMPERATURE,
  COHERE_TIMEOUT_MS,
  REASON_PROMPT,
  buildReasonData,
  buildReasonMessage,
  firstBrokenRule,
  normalizeReason,
  writeReason,
  type CohereChat,
  type ReasonData,
} from "../../src/modules/specialty-test/specialty-test.reason.js";
import type { Answer, DuelAnswer } from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-43: el motivo de Cohere, su validación y el respaldo de plantillas.
 *
 * Ninguna prueba llama a Cohere: todas inyectan un cliente falso. Los datos
 * del alumno de prueba son INVENTADOS (el repo es público): código 20230001,
 * Garcia Lopez, Maria, `student.id` 42. Se espía `console` para fijar que
 * ningún registro lleva el texto de Cohere, `error.message`, las respuestas ni
 * el id del alumno.
 */

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const TODAS = c.specialties.map((s) => s.name);
const ALUMNO = { id: 42, codigo: "20230001", nombre: "Garcia Lopez, Maria" };

const resolver = (answers: Readonly<Record<string, Answer>>, respuestas: readonly DuelAnswer[]): Evaluation => {
  const recibidos: Array<{ id: string; answer: DuelAnswer }> = [];
  let paso = evaluateAnswers(c, answers, recibidos);
  while (paso.kind === "tiebreak") {
    recibidos.push({ id: paso.tiebreaker.id, answer: respuestas[recibidos.length]! });
    paso = evaluateAnswers(c, answers, recibidos);
  }
  if (paso.kind !== "result") throw new Error("se esperaba un resultado");
  return paso.evaluation;
};

const datosDe = (id: string): { data: ReasonData; respaldo: string } => {
  const e = c.weights.examples.find((x) => x.id === id)!;
  const ev = resolver(e.answers, e.tiebreakAnswers);
  const plantillas = buildTemplateReason(c, e.answers, ev);
  return { data: buildReasonData(c, e.answers, ev, plantillas.main), respaldo: plantillas.text };
};

const { data: DATOS, respaldo: RESPALDO } = datosDe("ejemplo-2");

/** Un motivo que cumple las siete reglas para el ejemplo-2. */
const VALIDO =
  "Desarrollo de Videojuegos va contigo porque elegiste diseñar niveles que se ponen difíciles poco a poco. " +
  "Con Sistemas de Información estuvo parejo, y en el desempate te quedaste con escribir finales distintos. " +
  "Mira cursos como «Storytelling» y «Proyecto de Videojuegos».";

/** Cliente falso que anota cada llamada y responde lo que se le pida. */
const cliente = (responder: (signal?: AbortSignal) => Promise<string>) => {
  const llamadas: Array<{ messages: unknown; options: Record<string, unknown> | undefined }> = [];
  const chat: CohereChat = {
    chatWithHistory: async (messages, options) => {
      llamadas.push({ messages, options: options as Record<string, unknown> | undefined });
      return responder(options?.signal);
    },
  };
  return { chat, llamadas };
};

let avisos: ReturnType<typeof spyOn>;
let errores: ReturnType<typeof spyOn>;
let logs: ReturnType<typeof spyOn>;

beforeEach(() => {
  avisos = spyOn(console, "warn").mockImplementation(() => {});
  errores = spyOn(console, "error").mockImplementation(() => {});
  logs = spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  avisos.mockRestore();
  errores.mockRestore();
  logs.mockRestore();
});

/** Todo lo que el módulo escribió en consola, en una sola cadena. */
const registrado = (): string =>
  [avisos, errores, logs].flatMap((s) => s.mock.calls.map((args: unknown[]) => args.map(String).join(" "))).join("\n");

describe("datos y mensaje para Cohere (RS-BE-43)", () => {
  test("el ejemplo-2 produce exactamente el JSON de la spec", () => {
    expect(DATOS).toEqual({
      empate: false,
      ganadoras: ["Desarrollo de Videojuegos"],
      ranking: [
        "Desarrollo de Videojuegos", "Sistemas de Información",
        "Tecnologías de la Información", "Ingeniería de Software",
      ],
      nombrables: ["Desarrollo de Videojuegos", "Sistemas de Información"],
      lectura: "La ganadora suma en los duelos y en la escala sin un patrón marcado.",
      detalle: [{
        especialidad: "Desarrollo de Videojuegos",
        tareasElegidas: [
          "diseñar niveles que se ponen difíciles poco a poco",
          "programar cómo salta un personaje de juego",
          "escribir la historia y los diálogos de un juego",
        ],
        tareasQueLeGustaronConOtra: ["observar a jugadores probando un juego"],
        escala: { tarea: "programar un juego sencillo para celular", respuesta: "Bastante" },
      }],
      desempate: {
        rival: "Sistemas de Información",
        tareaElegida: "escribir finales distintos según lo que decide el jugador",
      },
      electivos: [
        "Storytelling", "Diseño de Videojuegos", "Narrativa Gráfica", "Programación Móvil",
        "Proyecto de Desarrollo de Software", "Proyecto de Videojuegos", "Interacción Humano Computadora",
      ],
    });
  });

  test("el mensaje user es DATOS DEL TEST, el JSON, FIN DE LOS DATOS y Escribe el motivo.", () => {
    const mensaje = buildReasonMessage(DATOS);
    const lineas = mensaje.split("\n");
    expect(lineas[0]).toBe("DATOS DEL TEST");
    expect(lineas.at(-2)).toBe("FIN DE LOS DATOS");
    expect(lineas.at(-1)).toBe("Escribe el motivo.");
    expect(JSON.parse(lineas.slice(1, -2).join("\n"))).toEqual(DATOS);
  });

  test("el mensaje no lleva cifras ni datos del alumno", () => {
    const mensaje = buildReasonMessage(DATOS);
    expect(mensaje).not.toMatch(/[0-9%]/);
    expect(mensaje).not.toContain(ALUMNO.codigo);
    expect(mensaje).not.toContain("Garcia");
    expect(mensaje).not.toContain("Maria");
  });

  test("con empate: desempate en null y solo las dos ganadoras como nombrables", () => {
    const { data } = datosDe("ejemplo-8");
    expect(data.empate).toBe(true);
    expect(data.desempate).toBeNull();
    expect(data.ganadoras).toEqual(["Ingeniería de Software", "Tecnologías de la Información"]);
    expect(data.nombrables).toEqual(data.ganadoras);
    expect(data.detalle).toHaveLength(2);
    expect(data.lectura).toBe("Las dos primeras quedan empatadas.");
  });

  test("sin la ganadora en el par, desempate va en null", () => {
    // ejemplo-7 gana si y el par es sw-si: está en el par. ejemplo-1 no tuvo desempate.
    expect(datosDe("ejemplo-1").data.desempate).toBeNull();
    expect(datosDe("ejemplo-7").data.desempate).toEqual({
      rival: "Ingeniería de Software",
      tareaElegida: "unir en una base de datos las ventas de todas las sedes",
    });
    expect(datosDe("ejemplo-4").data.desempate).toEqual({
      rival: "Ingeniería de Software",
      tareaElegida: null,
    });
  });
});

describe("validacion de la salida (RS-BE-43)", () => {
  const rota = (texto: string) => firstBrokenRule(normalizeReason(texto), DATOS, TODAS);

  test("el motivo valido pasa las siete reglas", () => {
    expect(rota(VALIDO)).toBeNull();
  });

  test("recorta, junta espacios y quita un par de comillas que envuelve todo", () => {
    expect(normalizeReason(`  "${VALIDO}"  `)).toBe(VALIDO);
    expect(normalizeReason(`“${VALIDO}”`)).toBe(VALIDO);
    expect(normalizeReason(VALIDO.replace(" va ", "   va  "))).toBe(VALIDO);
  });

  test("largo: menos de 60, mas de 500 o con salto de linea", () => {
    expect(rota("Desarrollo de Videojuegos va contigo.")).toBe("largo");
    expect(rota(`${VALIDO} ${"Sigue mirando cursos con calma y sin apuro. ".repeat(10)}`)).toBe("largo");
    expect(rota(VALIDO.replace(". Con", ".\nCon"))).toBe("largo");
  });

  test("cifras: un digito o un signo de porcentaje", () => {
    expect(rota(VALIDO.replace("poco a poco", "con 75 de afinidad"))).toBe("cifras");
    expect(rota(VALIDO.replace("poco a poco", "con mucho %"))).toBe("cifras");
  });

  test("formato: dos puntos, guiones largos, markdown, enlaces, arrobas y emojis", () => {
    for (const intruso of [":", "—", "–", "*", "#", "`", "http", "@", "🎮"]) {
      expect(rota(VALIDO.replace("va contigo", `va contigo ${intruso}`))).toBe("formato");
    }
  });

  test("ganadora: tiene que nombrar a la ganadora completa, sin importar tildes ni mayusculas", () => {
    expect(rota(VALIDO.replace("Desarrollo de Videojuegos", "Videojuegos"))).toBe("ganadora");
    expect(rota(VALIDO.replace("Desarrollo de Videojuegos", "desarrollo de videojuegos"))).toBeNull();
  });

  test("otras: no nombra fuera de comillas una especialidad que no es nombrable", () => {
    expect(rota(VALIDO.replace("Con Sistemas de Información", "Con Ingeniería de Software"))).toBe("otras");
    expect(rota(VALIDO.replace("Con Sistemas de Información", "Con ingenieria de software"))).toBe("otras");
  });

  test("comillas: solo electivos de la lista o la respuesta de escala", () => {
    expect(rota(VALIDO.replace("«Storytelling»", "«Cálculo I»"))).toBe("comillas");
    expect(rota(VALIDO.replace("«Storytelling»", "«Bastante»"))).toBeNull();
    expect(rota(VALIDO.replace("«Storytelling»", "«Storytelling"))).toBe("comillas");
  });

  test("resto: no trae las marcas de los datos", () => {
    expect(rota(VALIDO.replace("Mira cursos", "FIN DE LOS DATOS mira cursos"))).toBe("resto");
    expect(rota(VALIDO.replace("Mira cursos", "DATOS DEL TEST mira cursos"))).toBe("resto");
  });
});

describe("la llamada y el respaldo (RS-BE-43)", () => {
  test("los parametros son los de la spec y el texto aceptado sale como ai", async () => {
    const { chat, llamadas } = cliente(async () => ` ${VALIDO} `);
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS)).toEqual({ reason: VALIDO, reasonSource: "ai" });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.messages).toEqual([{ role: "user", content: buildReasonMessage(DATOS) }]);
    expect(llamadas[0]!.options).toMatchObject({ preamble: REASON_PROMPT, temperature: 0.3, maxTokens: 200 });
    expect(llamadas[0]!.options!.signal).toBeInstanceOf(AbortSignal);
    expect([COHERE_TIMEOUT_MS, COHERE_TEMPERATURE, COHERE_MAX_TOKENS]).toEqual([5000, 0.3, 200]);
    expect(avisos).not.toHaveBeenCalled();
  });

  test("el prompt es el de la spec, con sus diez reglas", () => {
    expect(REASON_PROMPT.startsWith("Eres Ulises, el cuervo que acompaña")).toBe(true);
    expect(REASON_PROMPT).toContain("\n\nREGLAS\n1. Usa solo los datos");
    expect(REASON_PROMPT.endsWith("10. Responde solo con el texto del motivo, sin saludo ni despedida.")).toBe(true);
  });

  test("tiempo agotado: corta con la senal y sale el motivo de plantillas con timeout", async () => {
    const { chat } = cliente(
      (signal) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("AbortError")))),
    );
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS, 20)).toEqual({ reason: RESPALDO, reasonSource: "templates" });
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: timeout");
  });

  test("tiempo agotado aunque el cliente ignore la senal", async () => {
    const { chat } = cliente(() => new Promise(() => {}));
    expect((await writeReason(chat, DATOS, RESPALDO, TODAS, 20)).reasonSource).toBe("templates");
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: timeout");
  });

  test("error HTTP: codigo http y el cuerpo de Cohere no se registra", async () => {
    const { chat } = cliente(async () => {
      throw new Error('Cohere Chat error 429: {"message":"cuerpo-secreto-de-cohere"}');
    });
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS)).toEqual({ reason: RESPALDO, reasonSource: "templates" });
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: http");
    expect(registrado()).not.toContain("cuerpo-secreto-de-cohere");
  });

  test("error de red o cuerpo que no es JSON: codigo error", async () => {
    for (const falla of [new TypeError("fetch failed"), new SyntaxError("Unexpected token < in JSON")]) {
      const { chat } = cliente(async () => {
        throw falla;
      });
      expect((await writeReason(chat, DATOS, RESPALDO, TODAS)).reasonSource).toBe("templates");
    }
    expect(avisos.mock.calls).toEqual([
      ["[specialty-test] motivo con plantillas: error"],
      ["[specialty-test] motivo con plantillas: error"],
    ]);
    expect(registrado()).not.toContain("fetch failed");
    expect(registrado()).not.toContain("Unexpected token");
  });

  test("texto vacio: codigo empty", async () => {
    const { chat } = cliente(async () => "   ");
    expect((await writeReason(chat, DATOS, RESPALDO, TODAS)).reasonSource).toBe("templates");
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: empty");
  });

  test("texto invalido: codigo invalid con la regla, y el texto de Cohere no se registra", async () => {
    const malo = VALIDO.replace("poco a poco", "con 75 % de afinidad");
    const { chat } = cliente(async () => malo);
    expect(await writeReason(chat, DATOS, RESPALDO, TODAS)).toEqual({ reason: RESPALDO, reasonSource: "templates" });
    expect(avisos).toHaveBeenCalledWith("[specialty-test] motivo con plantillas: invalid:cifras");
    expect(registrado()).not.toContain("afinidad");
  });

  test("ningun registro lleva respuestas ni el id o el codigo del alumno", async () => {
    const { chat } = cliente(async () => {
      throw new Error(`Cohere Chat error 500: ${ALUMNO.codigo} ${ALUMNO.id} bottom me_encantaria`);
    });
    await writeReason(chat, DATOS, RESPALDO, TODAS);
    const texto = registrado();
    for (const prohibido of [ALUMNO.codigo, String(ALUMNO.id), "bottom", "me_encantaria", "Garcia"]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-reason.test.ts
```

**Esperado:** falla con `error: Cannot find module '../../src/modules/specialty-test/specialty-test.reason.js'`, `0 pass` y `1 fail`.

- [ ] **Paso 3: Implementar el motivo de Cohere**

Crear `src/modules/specialty-test/specialty-test.reason.ts`. El prompt es el de la spec, tal cual. `writeReason` corre la llamada contra la señal del `AbortController`, así que corta a tiempo aunque el cliente no respete la señal, y solo lee `error.message` para buscar el prefijo `Cohere Chat error`, sin registrarlo.

```ts
/**
 * RS-BE-43 · Motivo redactado por Cohere, con las plantillas como respaldo.
 *
 * Cohere no decide nada del resultado: recibe el ranking ya calculado y solo
 * textos del propio contenido, sin cifras y sin ningún dato del alumno. Si no
 * responde en 5 segundos, falla o devuelve un texto que no pasa la validación,
 * el resultado sale igual con el motivo de las plantillas (RS-BE-42) y un
 * `console.warn` con un código corto. Ningún fallo de Cohere llega a la app.
 *
 * REGISTRO. El único `console` de este archivo imprime el código corto. Nunca
 * el texto de Cohere, `error.message` (en un error HTTP trae el cuerpo de la
 * respuesta de Cohere), las respuestas ni el id del alumno.
 */
import type { Evaluation } from "./specialty-test.logic.js";
import {
  AFFINITY_50_S,
  nameOf,
  plain,
  scaleOf,
  tasksChosen,
  tiebreakTaskFor,
  type MainTemplateId,
} from "./specialty-test.templates.js";
import type {
  Answer,
  ReasonSource,
  SpecialtyKey,
  SpecialtyTestContent,
} from "./specialty-test.types.js";

/** Lo único que el módulo usa del cliente de Cohere (`cohere.client.ts:72-114`). */
export interface CohereChat {
  chatWithHistory(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: { preamble?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal },
  ): Promise<string>;
}

export const COHERE_TIMEOUT_MS = 5000;
export const COHERE_TEMPERATURE = 0.3;
export const COHERE_MAX_TOKENS = 200;
export const REASON_MIN_LENGTH = 60;
export const REASON_MAX_LENGTH = 500;

/** El mensaje `system`, tal cual lo fija la spec. */
export const REASON_PROMPT = `Eres Ulises, el cuervo que acompaña a los alumnos de Ingeniería de Sistemas de la Universidad de Lima en ULima++. El alumno acaba de terminar un test de especialidad y el sistema ya tiene calculado su resultado. Tu único trabajo es escribir el motivo que acompaña ese resultado.

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
10. Responde solo con el texto del motivo, sin saludo ni despedida.`;

/** `lectura`: la plantilla `main` elegida, dicha como una frase fija. */
export const READINGS: Record<MainTemplateId | "tie", string> = {
  low: "Ninguna especialidad llama con fuerza al alumno y la ganadora va adelante sin mucha distancia.",
  noMainPoints: "La ganadora no suma en los duelos de las preguntas y sube por la escala y los desempates.",
  strong: "Los duelos y la escala apuntan con fuerza a la ganadora.",
  duelsOverScale:
    "La ganadora suma bien en los duelos, pero en la escala el alumno muestra poco entusiasmo.",
  scaleOverDuels: "La respuesta de la escala pesa más que los duelos.",
  general: "La ganadora suma en los duelos y en la escala sin un patrón marcado.",
  tie: "Las dos primeras quedan empatadas.",
};

export interface ReasonData {
  empate: boolean;
  ganadoras: string[];
  ranking: string[];
  nombrables: string[];
  lectura: string;
  detalle: Array<{
    especialidad: string;
    tareasElegidas: string[];
    tareasQueLeGustaronConOtra: string[];
    escala: { tarea: string; respuesta: string };
  }>;
  desempate: { rival: string; tareaElegida: string | null } | null;
  electivos: string[];
}

const sinRepetir = (lista: string[]): string[] => [...new Set(lista)];

/**
 * Los datos que le llegan a Cohere: textos del contenido y el resultado del
 * cálculo, sin afinidades ni puntos. `main` es la plantilla `main` elegida por
 * `buildTemplateReason`, o null con empate.
 */
export const buildReasonData = (
  content: SpecialtyTestContent,
  answers: Readonly<Record<string, Answer>>,
  ev: Evaluation,
  main: MainTemplateId | null,
): ReasonData => {
  const [primera, segunda] = [ev.ranking[0]!, ev.ranking[1]!];
  const ganadoras: SpecialtyKey[] = ev.tie ? [primera, segunda] : [primera];
  const enElPar = !ev.tie && ev.pair !== null && ev.pair.includes(primera);

  let nombrables: SpecialtyKey[];
  if (ev.tie) {
    nombrables = [primera, segunda];
  } else {
    nombrables = [primera];
    if (ev.scores[segunda].S >= AFFINITY_50_S) nombrables.push(segunda);
    if (enElPar) nombrables.push(ev.pair!.find((k) => k !== primera)!);
  }

  const desempate = enElPar
    ? {
        rival: nameOf(content, ev.pair!.find((k) => k !== primera)!),
        tareaElegida: tiebreakTaskFor(ev.shown, primera) || null,
      }
    : null;

  return {
    empate: ev.tie,
    ganadoras: ganadoras.map((k) => nameOf(content, k)),
    ranking: ev.ranking.map((k) => nameOf(content, k)),
    nombrables: sinRepetir(nombrables.map((k) => nameOf(content, k))),
    lectura: READINGS[ev.tie || main === null ? "tie" : main],
    detalle: ganadoras.map((k) => {
      const elegidas = tasksChosen(content, answers, k);
      const escala = scaleOf(content, answers, k);
      return {
        especialidad: nameOf(content, k),
        tareasElegidas: elegidas.alone.map((t) => t.summary),
        tareasQueLeGustaronConOtra: elegidas.both.map((t) => t.summary),
        escala: { tarea: escala.task.summary, respuesta: escala.label },
      };
    }),
    desempate,
    electivos: sinRepetir(
      ganadoras.flatMap(
        (k) => content.specialties.find((s) => s.key === k)!.electives.map((e) => e.shortName),
      ),
    ),
  };
};

/** El mensaje `user`, exactamente como lo fija la spec. */
export const buildReasonMessage = (data: ReasonData): string =>
  `DATOS DEL TEST\n${JSON.stringify(data, null, 2)}\nFIN DE LOS DATOS\nEscribe el motivo.`;

// ── Validación de la salida ────────────────────────────────────────────────

const PARES_DE_COMILLAS: ReadonlyArray<[string, string]> = [
  ['"', '"'],
  ["“", "”"],
  ["'", "'"],
  ["‘", "’"],
  ["«", "»"],
];

/**
 * Recorta los espacios del borde, junta los espacios repetidos (sin tocar los
 * saltos de línea, que mira la regla `largo`) y quita un par de comillas que
 * envuelva todo el texto, solo si no hay otra comilla de ese par adentro.
 */
export const normalizeReason = (bruto: string): string => {
  let texto = bruto.trim().replace(/[ \t]+/g, " ");
  for (const [abre, cierra] of PARES_DE_COMILLAS) {
    const adentro = texto.slice(1, -1);
    if (
      texto.length >= 2 &&
      texto.startsWith(abre) &&
      texto.endsWith(cierra) &&
      !adentro.includes(abre) &&
      !adentro.includes(cierra)
    ) {
      texto = adentro.trim();
      break;
    }
  }
  return texto;
};

const SIGNOS_PROHIBIDOS = [":", "—", "–", "*", "#", "`", "http", "@"];
const EMOJI = /\p{Extended_Pictographic}/u;

export type ReasonRule =
  | "largo"
  | "cifras"
  | "formato"
  | "ganadora"
  | "otras"
  | "comillas"
  | "resto";

/**
 * Las siete reglas de RS-BE-43, en orden. Devuelve la primera que falla, o
 * null si el texto (ya normalizado) las cumple todas.
 */
export const firstBrokenRule = (
  texto: string,
  data: ReasonData,
  todas: readonly string[],
): ReasonRule | null => {
  if (texto.length < REASON_MIN_LENGTH || texto.length > REASON_MAX_LENGTH || /[\r\n]/.test(texto)) {
    return "largo";
  }
  if (/[0-9%]/.test(texto)) return "cifras";
  if (SIGNOS_PROHIBIDOS.some((s) => texto.includes(s)) || EMOJI.test(texto)) return "formato";

  const llano = plain(texto);
  if (!data.ganadoras.every((g) => llano.includes(plain(g)))) return "ganadora";

  const fueraDeComillas = plain(texto.replace(/«[^«»]*»/g, " "));
  const noNombrables = todas.filter((n) => !data.nombrables.includes(n));
  if (noNombrables.some((n) => fueraDeComillas.includes(plain(n)))) return "otras";

  const permitidas = new Set([...data.electivos, ...data.detalle.map((d) => d.escala.respuesta)]);
  const citas = [...texto.matchAll(/«([^«»]*)»/g)].map((m) => m[1]!.trim());
  const abiertas = (texto.match(/«/g) ?? []).length;
  const cerradas = (texto.match(/»/g) ?? []).length;
  if (abiertas !== citas.length || cerradas !== citas.length || citas.some((c) => !permitidas.has(c))) {
    return "comillas";
  }

  if (texto.includes("DATOS DEL TEST") || texto.includes("FIN DE LOS DATOS")) return "resto";
  return null;
};

// ── La llamada ─────────────────────────────────────────────────────────────

export interface WrittenReason {
  reason: string;
  reasonSource: ReasonSource;
}

const conPlantillas = (motivo: string, codigo: string): WrittenReason => {
  console.warn(`[specialty-test] motivo con plantillas: ${codigo}`);
  return { reason: motivo, reasonSource: "templates" };
};

const esErrorHttp = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith("Cohere Chat error");

/**
 * Pide el motivo a Cohere y lo valida. `respaldo` es el motivo de las
 * plantillas, que sale si algo falla. `todas` son los nombres de las cuatro
 * especialidades del contenido, para la regla `otras`. `timeoutMs` existe solo
 * para las pruebas; el servicio usa siempre `COHERE_TIMEOUT_MS`.
 */
export const writeReason = async (
  cohere: CohereChat,
  data: ReasonData,
  respaldo: string,
  todas: readonly string[],
  timeoutMs: number = COHERE_TIMEOUT_MS,
): Promise<WrittenReason> => {
  const controller = new AbortController();
  // La carrera contra la señal garantiza el corte aunque el cliente no la
  // respete; `fetch` sí la respeta y además cancela la petición.
  const abortado = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true });
  });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let bruto: string;
  try {
    bruto = await Promise.race([
      cohere.chatWithHistory([{ role: "user", content: buildReasonMessage(data) }], {
        preamble: REASON_PROMPT,
        temperature: COHERE_TEMPERATURE,
        maxTokens: COHERE_MAX_TOKENS,
        signal: controller.signal,
      }),
      abortado,
    ]);
  } catch (error) {
    if (controller.signal.aborted) return conPlantillas(respaldo, "timeout");
    return conPlantillas(respaldo, esErrorHttp(error) ? "http" : "error");
  } finally {
    clearTimeout(timer);
  }

  const texto = normalizeReason(typeof bruto === "string" ? bruto : "");
  if (texto === "") return conPlantillas(respaldo, "empty");
  const rota = firstBrokenRule(texto, data, todas);
  if (rota) return conPlantillas(respaldo, `invalid:${rota}`);
  return { reason: texto, reasonSource: "ai" };
};
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test-reason.test.ts
```

**Esperado:** `23 pass`, `0 fail`, `77 expect() calls`. El ejemplo 2 produce exactamente el JSON de la spec (RS-BE-43).

- [ ] **Paso 5: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2354 pass, 42 skip, 0 fail, 9205 `expect()` y 2396 pruebas en 135 archivos (+23 pruebas y +1 archivo).

- [ ] **Paso 6: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/specialty-test/specialty-test.reason.ts test/HU36_jeff/specialty-test-reason.test.ts && git commit -m "feat(specialty-test): motivo redactado por Cohere con validación y respaldo de plantillas (RS-BE-43)" -m "Cohere recibe solo textos del contenido y el resultado, sin cifras ni datos del alumno, con el prompt de la spec y un corte a los 5 segundos. El texto pasa siete reglas en orden y, si algo falla, sale el motivo de las plantillas con un console.warn de código corto que nunca lleva el texto de Cohere ni error.message."
```

---

### Tarea 5: Tabla del último resultado y migración 0014 (sin aplicar)

**Requisitos:** «Modelo de datos» de la spec y RS-BE-44 (tabla `student_specialty_test_result` con clave `student_id`, FK a `student` con `ON DELETE CASCADE`, `content_version varchar(20)`, `ranking jsonb`, `is_tie boolean`, `completed_at timestamptz default now()` y los CHECK `chk_specialty_test_version` y `chk_specialty_test_ranking`). El cambio de BD está aprobado desde el 2026-09-25; este plan solo escribe el archivo.

**Archivos:**
- Crear: `drizzle/0014_specialty_test_result.sql`
- Modificar: `src/db/schema/schema.ts` (import de `jsonb` en el bloque de `drizzle-orm/pg-core` y la tabla al final del archivo, después de `studentTimeBlockException`)
- Prueba: `test/HU36_jeff/migration-0014.test.ts`

**Interfaces:**
- Consume: `student` de `schema.ts` (destino de la FK) y el precedente de `studentAcademicSnapshot` (`schema.ts:691`), que también tiene la clave en `student_id`.
- Produce: `export const studentSpecialtyTestResult = pgTable("student_specialty_test_result", …)` con las columnas `student_id`, `content_version`, `ranking`, `is_tie` y `completed_at`, y el archivo `drizzle/0014_specialty_test_result.sql`, aditivo e idempotente.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/migration-0014.test.ts`. Lee el `.sql` como texto y no toca ninguna base.

```ts
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { studentSpecialtyTestResult } from "../../src/db/schema/schema.js";

// El .sql se lee como texto plano: esta prueba NO aplica la migración ni toca
// la base. Aplicarla es del dueño, en el despliegue (MIGRATIONS.md).
const migracion = await Bun.file("drizzle/0014_specialty_test_result.sql").text();

/** Solo las sentencias: la cabecera de comentarios nombra INSERT y ON CONFLICT al explicar el guardado. */
const sentencias = migracion
  .split("\n")
  .filter((linea) => !linea.trimStart().startsWith("--"))
  .join("\n");

const veces = (aguja: string): number => sentencias.split(aguja).length - 1;

describe("drizzle/0014_specialty_test_result.sql (RS-BE-44)", () => {
  test("crea una sola tabla, con IF NOT EXISTS", () => {
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_specialty_test_result" (');
    expect(veces("CREATE TABLE")).toBe(1);
  });

  test("las cinco columnas con los tipos de la spec, y student_id como clave", () => {
    expect(migracion).toContain('"student_id" integer PRIMARY KEY NOT NULL,');
    expect(migracion).toContain('"content_version" varchar(20) NOT NULL,');
    expect(migracion).toContain('"ranking" jsonb NOT NULL,');
    expect(migracion).toContain('"is_tie" boolean NOT NULL,');
    expect(migracion).toContain('"completed_at" timestamp with time zone DEFAULT now() NOT NULL,');
    expect(veces("PRIMARY KEY")).toBe(1);
  });

  test("los dos CHECK con el nombre y la expresion de la spec", () => {
    expect(migracion).toContain(
      `CONSTRAINT "chk_specialty_test_version" CHECK ("student_specialty_test_result"."content_version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]+$')`,
    );
    expect(migracion).toContain(
      `CONSTRAINT "chk_specialty_test_ranking" CHECK (jsonb_typeof("student_specialty_test_result"."ranking") = 'array' and jsonb_array_length("student_specialty_test_result"."ranking") = 4)`,
    );
    expect(veces("CHECK (")).toBe(2);
  });

  test("una sola FK, a student, que borra en cascada, y ninguna hacia specialty", () => {
    expect(migracion).toContain(
      'CONSTRAINT "student_specialty_test_result_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(veces("FOREIGN KEY")).toBe(1);
    expect(sentencias).not.toContain('REFERENCES "public"."specialty"');
  });

  test("es aditiva: no altera ni borra nada, no crea indices ni tipos", () => {
    for (const prohibido of ["ALTER TABLE", "DROP", "CREATE INDEX", "CREATE TYPE", "INSERT INTO", "DELETE FROM", "TRUNCATE"]) {
      expect(sentencias).not.toContain(prohibido);
    }
    expect(veces("--> statement-breakpoint")).toBe(0);
  });

  test("la cabecera dice como se aplica y que no va por db:migrate", () => {
    expect(migracion.trimStart().startsWith("--")).toBe(true);
    expect(migracion).toContain("bun run db:apply drizzle/0014_specialty_test_result.sql");
    expect(migracion).toContain("NO con db:migrate ni db:generate");
  });
});

describe("schema.ts · student_specialty_test_result (RS-BE-44)", () => {
  const cfg = getTableConfig(studentSpecialtyTestResult);

  test("nombre, columnas en orden y tipos SQL", () => {
    expect(cfg.name).toBe("student_specialty_test_result");
    expect(Object.fromEntries(cfg.columns.map((col) => [col.name, col.getSQLType()]))).toEqual({
      student_id: "integer",
      content_version: "varchar(20)",
      ranking: "jsonb",
      is_tie: "boolean",
      completed_at: "timestamp with time zone",
    });
    expect(cfg.columns.map((col) => col.name)).toEqual([
      "student_id", "content_version", "ranking", "is_tie", "completed_at",
    ]);
  });

  test("ninguna columna es nulable, student_id es la PK y completed_at tiene default", () => {
    expect(cfg.columns.filter((col) => !col.notNull).map((col) => col.name)).toEqual([]);
    expect(cfg.columns.find((col) => col.name === "student_id")?.primary).toBe(true);
    expect(cfg.columns.find((col) => col.name === "completed_at")?.hasDefault).toBe(true);
  });

  test("los dos CHECK con el SQL de la migracion", () => {
    const dialecto = new PgDialect();
    const checks = Object.fromEntries(
      cfg.checks.map((k) => [k.name, dialecto.sqlToQuery(k.value).sql]),
    );
    expect(checks).toEqual({
      chk_specialty_test_version: `"student_specialty_test_result"."content_version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]+$'`,
      chk_specialty_test_ranking: `jsonb_typeof("student_specialty_test_result"."ranking") = 'array' and jsonb_array_length("student_specialty_test_result"."ranking") = 4`,
    });
  });

  test("una sola FK, a student, en cascada, sin indices ni UNIQUE", () => {
    expect(cfg.foreignKeys).toHaveLength(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe("student_specialty_test_result_student_id_student_id_fk");
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
    expect(cfg.indexes).toEqual([]);
    expect(cfg.uniqueConstraints).toEqual([]);
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/migration-0014.test.ts
```

**Esperado:** falla con `SyntaxError: Export named 'studentSpecialtyTestResult' not found in module '…/src/db/schema/schema.ts'`, `0 pass` y `1 fail`.

- [ ] **Paso 3: Escribir la migración**

Crear `drizzle/0014_specialty_test_result.sql`, con las columnas indentadas con tabulador, como la `0011`.

```sql
-- RS-BE-44 · Último resultado del test de especialidad, una fila por alumno.
--
-- Una tabla nueva y ninguna columna tocada de las que ya existen:
--   student_specialty_test_result   versión del contenido, ranking de las cuatro
--                                   especialidades, empate y fecha.
--
-- Solo el último resultado (decisión 5 del dueño): rehacer el test reemplaza la
-- fila con INSERT … ON CONFLICT (student_id) DO UPDATE, que además vuelve a
-- fijar completed_at con now(), porque el DEFAULT solo actúa en el INSERT. No se
-- guardan las respuestas, los desempates, el motivo ni las líneas de Ulises.
--
-- La clave primaria es student_id, igual que student_academic_snapshot en la
-- 0011: una fila por alumno y el destino del ON CONFLICT, sin otro índice,
-- porque las dos lecturas y la escritura van por student_id. El ranking es jsonb
-- porque se escribe y se lee entero y su orden es parte del dato; los dos CHECK
-- aseguran un arreglo de cuatro y Zod valida cada elemento al escribir y al leer.
-- El specialtyId de cada elemento no lleva FK: es una foto del resultado. La
-- fila cae con el alumno (ON DELETE CASCADE).
--
-- Aditiva e idempotente: CREATE TABLE IF NOT EXISTS con los CONSTRAINT dentro de
-- la definición, así que se puede re-aplicar sin daño.
--
--   bun run db:apply drizzle/0014_specialty_test_result.sql
--
-- Con db:apply y NO con db:migrate ni db:generate: drizzle/meta/_journal.json
-- se quedó en la 0009, así que esta migración tampoco queda registrada ahí. El
-- cambio de BD lo aprobó el dueño el 2026-09-25 con la spec; aplicarlo en
-- producción pide además, en el despliegue, el respaldo previo y su permiso
-- explícito, antes del merge del código que la usa, y se registra en
-- MIGRATIONS.md con su fecha, su respaldo y su verificación.

CREATE TABLE IF NOT EXISTS "student_specialty_test_result" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"content_version" varchar(20) NOT NULL,
	"ranking" jsonb NOT NULL,
	"is_tie" boolean NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_specialty_test_version" CHECK ("student_specialty_test_result"."content_version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'),
	CONSTRAINT "chk_specialty_test_ranking" CHECK (jsonb_typeof("student_specialty_test_result"."ranking") = 'array' and jsonb_array_length("student_specialty_test_result"."ranking") = 4),
	CONSTRAINT "student_specialty_test_result_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action
);
```

- [ ] **Paso 4: Sumar la tabla a `schema.ts`**

En el bloque `import { … } from "drizzle-orm/pg-core";` del comienzo, agregar `jsonb,` entre `integer,` y `pgEnum,`. Después, agregar al final del archivo, tras una línea en blanco, este bloque. En la plantilla `sql` el `\\.` escribe un solo `\` y deja el mismo `\.` que la migración.

```ts
/**
 * RS-BE-44 · Último resultado del test de especialidad, una fila por alumno.
 *
 * Solo el último (decisión 5 del dueño): rehacer el test reemplaza la fila con
 * `on conflict (student_id) do update`, que vuelve a fijar `completed_at`. No
 * se guardan respuestas, desempates, motivo ni líneas de Ulises. El ranking es
 * `jsonb` porque se lee y se escribe entero y su orden es parte del dato; cada
 * elemento es `{ key, specialtyId, affinity }` y lo valida Zod
 * (`storedRankingSchema`), y el `specialtyId` no lleva FK: es una foto.
 * Migración `drizzle/0014_specialty_test_result.sql`.
 */
export const studentSpecialtyTestResult = pgTable("student_specialty_test_result", {
  studentId: integer("student_id").primaryKey().references(() => student.id, { onDelete: "cascade" }),
  /** `AAAA-MM-DD.N`, la versión del contenido con la que se calculó. */
  contentVersion: varchar("content_version", { length: 20 }).notNull(),
  ranking: jsonb("ranking").notNull(),
  isTie: boolean("is_tie").notNull(),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  chkSpecialtyTestVersion: check(
    "chk_specialty_test_version",
    sql`${t.contentVersion} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]+$'`,
  ),
  chkSpecialtyTestRanking: check(
    "chk_specialty_test_ranking",
    sql`jsonb_typeof(${t.ranking}) = 'array' and jsonb_array_length(${t.ranking}) = 4`,
  ),
}));
```

- [ ] **Paso 5: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/migration-0014.test.ts
```

**Esperado:** `10 pass`, `0 fail`, `37 expect() calls`.

- [ ] **Paso 6: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2364 pass, 42 skip, 0 fail, 9242 `expect()` y 2406 pruebas en 136 archivos (+10 pruebas y +1 archivo). Nadie corre `db:apply` ni ningún otro comando contra una base.

- [ ] **Paso 7: Commit**

```bash
cd "${REPO:?}" && git status --short && git add drizzle/0014_specialty_test_result.sql src/db/schema/schema.ts test/HU36_jeff/migration-0014.test.ts && git commit -m "feat(specialty-test): tabla del último resultado en schema.ts y migración 0014 sin aplicar (RS-BE-44)" -m "student_specialty_test_result guarda una fila por alumno con la versión, el ranking en jsonb, el empate y la fecha, con dos CHECK y la FK a student en cascada. La 0014 es aditiva e idempotente y la aplica el dueño en el despliegue, con respaldo y su permiso, con db:apply."
```

---

### Tarea 6: Repository del alumno, de las especialidades activas y del último resultado

**Requisitos:** RS-BE-38 (especialidades con `is_active = true` de la carrera del alumno), RS-BE-44 (`INSERT … ON CONFLICT (student_id) DO UPDATE` que reescribe todo y fija `completed_at = now()`) y RS-BE-45 (la fila se lee y un `ranking` que no pasa Zod es un error, no un resultado vacío).

**Archivos:**
- Crear: `src/modules/specialty-test/specialty-test.schemas.ts` (solo `storedRankingSchema`; la Tarea 7 lo amplía)
- Crear: `src/modules/specialty-test/specialty-test.repository.ts`
- Prueba: `test/HU36_jeff/specialty-test.repository.test.ts`
- Prueba: `test/HU36_jeff/specialty-test.postgres.test.ts` (solo corre con `TEST_DATABASE_URL`; sin ella se salta)

**Interfaces:**
- Consume (Tareas 1 y 5): `SPECIALTY_KEYS`, `StoredRankingEntry`, `StoredResult` y la tabla de la `0014`.
- Produce:
  - `storedRankingSchema`, un arreglo de exactamente cuatro `{ key, specialtyId, affinity }` con claves distintas.
  - `SpecialtyTestRepository(database: typeof db)` con `findStudentCareer(studentId): Promise<{ careerId: number } | null>`, `findActiveSpecialties(careerId): Promise<Array<{ id: number; name: string }>>`, `saveResult(studentId, contentVersion, ranking, isTie): Promise<{ completedAt: string }>` y `findResult(studentId): Promise<StoredResult | null>`. Las fechas salen de SQL como ISO-8601 en UTC con milisegundos.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `test/HU36_jeff/specialty-test.repository.test.ts`, que mira el SQL renderizado con `PgDialect` sobre una base falsa.

```ts
import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { SpecialtyTestRepository } from "../../src/modules/specialty-test/specialty-test.repository.js";
import type { StoredRankingEntry } from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-38, RS-BE-44 y RS-BE-45 vistos desde el repositorio.
 *
 * Miran el SQL RENDERIZADO además del resultado, como
 * `test/HU35_jeff/time-blocks.repository.test.ts`: la clase de defecto que
 * importa aquí la produce Postgres al ejecutar (un arreglo JS interpolado que
 * da 42809, un `where student_id` que se cae, un `do update` que no refresca la
 * fecha) y no el código al armar. No abren ninguna conexión: la base es falsa.
 * La prueba contra un Postgres real es `specialty-test.postgres.test.ts`.
 *
 * Datos INVENTADOS: el alumno sintético 20230001 tiene `student.id` 42.
 */

const baseFalsa = (filas: unknown[]) => {
  const capturadas: SQL[] = [];
  const database = {
    execute: async (q: SQL) => {
      capturadas.push(q);
      return filas;
    },
  } as never;
  return {
    repo: new SpecialtyTestRepository(database),
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
  };
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const ALUMNO = 42;

const RANKING: StoredRankingEntry[] = [
  { key: "vj", specialtyId: 7, affinity: 75 },
  { key: "si", specialtyId: 6, affinity: 65 },
  { key: "ti", specialtyId: 5, affinity: 28 },
  { key: "sw", specialtyId: 1, affinity: 24 },
];

const FECHA = "2026-09-25T20:15:00.000Z";

describe("findStudentCareer", () => {
  test("lee la carrera del alumno con su id como parametro", async () => {
    const { repo, consultas } = baseFalsa([{ career_id: 3 }]);
    expect(await repo.findStudentCareer(ALUMNO)).toEqual({ careerId: 3 });
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toBe("select career_id from student where id = $1 limit 1");
    expect(params).toEqual([ALUMNO]);
  });

  test("sin fila en student devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.findStudentCareer(ALUMNO)).toBeNull();
  });
});

describe("findActiveSpecialties", () => {
  test("solo las activas de la carrera, por id", async () => {
    const { repo, consultas } = baseFalsa([{ id: 1, name: "Ingeniería de Software" }]);
    expect(await repo.findActiveSpecialties(3)).toEqual([{ id: 1, name: "Ingeniería de Software" }]);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toBe(
      "select id, name from specialty where career_id = $1 and is_active = true order by id",
    );
    expect(params).toEqual([3]);
  });
});

describe("saveResult (RS-BE-44)", () => {
  test("upsert por student_id que reescribe todo y fija completed_at = now()", async () => {
    const { repo, consultas } = baseFalsa([{ completed_at: FECHA }]);
    expect(await repo.saveResult(ALUMNO, "2026-09-25.4", RANKING, false)).toEqual({ completedAt: FECHA });
    const { sql: texto, params } = consultas()[0]!;
    const t = norm(texto);
    expect(t).toContain(
      "insert into student_specialty_test_result (student_id, content_version, ranking, is_tie) values ($1, $2, $3::jsonb, $4)",
    );
    expect(t).toContain("on conflict (student_id) do update set");
    expect(t).toContain("content_version = excluded.content_version");
    expect(t).toContain("ranking = excluded.ranking");
    expect(t).toContain("is_tie = excluded.is_tie");
    expect(t).toContain("completed_at = now()");
    expect(t).toContain(
      `returning to_char(completed_at at time zone 'utc', 'yyyy-mm-dd"t"hh24:mi:ss.ms"z"') as completed_at`,
    );
    expect(params).toEqual([ALUMNO, "2026-09-25.4", JSON.stringify(RANKING), false]);
  });

  test("el ranking viaja como texto JSON y nunca como arreglo interpolado", async () => {
    const { repo, consultas } = baseFalsa([{ completed_at: FECHA }]);
    await repo.saveResult(ALUMNO, "2026-09-25.4", RANKING, true);
    for (const p of consultas()[0]!.params) expect(Array.isArray(p)).toBe(false);
  });

  test("un ranking con otra forma no llega a la base", async () => {
    const { repo, consultas } = baseFalsa([{ completed_at: FECHA }]);
    const malo = [...RANKING.slice(0, 3)];
    await expect(repo.saveResult(ALUMNO, "2026-09-25.4", malo, false)).rejects.toThrow();
    expect(consultas()).toHaveLength(0);
  });
});

describe("findResult (RS-BE-45)", () => {
  test("lee la fila del alumno con la fecha en ISO UTC", async () => {
    const { repo, consultas } = baseFalsa([
      { content_version: "2026-09-25.4", ranking: RANKING, is_tie: false, completed_at: FECHA },
    ]);
    expect(await repo.findResult(ALUMNO)).toEqual({
      contentVersion: "2026-09-25.4",
      ranking: RANKING,
      isTie: false,
      completedAt: FECHA,
    });
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("from student_specialty_test_result where student_id = $1 limit 1");
    expect(params).toEqual([ALUMNO]);
  });

  test("el ranking que llega como texto tambien se lee", async () => {
    const { repo } = baseFalsa([
      { content_version: "2026-09-25.4", ranking: JSON.stringify(RANKING), is_tie: true, completed_at: FECHA },
    ]);
    expect((await repo.findResult(ALUMNO))?.ranking).toEqual(RANKING);
  });

  test("sin fila devuelve null", async () => {
    const { repo } = baseFalsa([]);
    expect(await repo.findResult(ALUMNO)).toBeNull();
  });

  test("un ranking corrupto es un error, no un resultado vacio", async () => {
    for (const corrupto of [
      [{ key: "xx", specialtyId: 1, affinity: 10 }],
      RANKING.map((e) => ({ ...e, affinity: 101 })),
      RANKING.map((e) => ({ ...e, key: "sw" })),
    ]) {
      const { repo } = baseFalsa([
        { content_version: "2026-09-25.4", ranking: corrupto, is_tie: false, completed_at: FECHA },
      ]);
      await expect(repo.findResult(ALUMNO)).rejects.toThrow("no tiene la forma esperada");
    }
  });
});
```

Crear `test/HU36_jeff/specialty-test.postgres.test.ts`. Sin `TEST_DATABASE_URL` se salta entera, así que `bun test` no toca ninguna base; con ella exige un host local y una base vacía, y todo corre en una transacción que se deshace.

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { SpecialtyTestRepository } from "../../src/modules/specialty-test/specialty-test.repository.js";
import type { StoredRankingEntry } from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-44 y RS-BE-45 contra un PostgreSQL de verdad.
 *
 * Las demás pruebas del módulo no tocan una base. Esta es la única que le
 * manda la `0014` y los cuatro métodos del repository a Postgres, que es donde
 * aparece la clase de fallo que ya pasó en este backend (el 42809 de un
 * arreglo interpolado, un `to_char` mal escrito, un `do update` que no
 * refresca la fecha).
 *
 * Solo corre con `TEST_DATABASE_URL`. Sin esa variable se salta entera, así que
 * `bun test` sigue sin tocar ninguna base. Con ella exige que el host sea local
 * (localhost, 127.0.0.1 o ::1) y que la base esté vacía (sin `public.student`).
 * Todo corre en UNA transacción que se deshace al final, y cada prueba en un
 * savepoint propio. Dentro crea un `student` y un `specialty` mínimos (solo las
 * columnas que leen la FK y el repository), aplica la `0014` dos veces (la
 * segunda prueba que es idempotente) y siembra dos alumnos.
 *
 * Cómo correrla con un Postgres desechable, igual que
 * `test/HU35_jeff/time-blocks.postgres.test.ts` (producción es PostgreSQL 17):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres especialidad
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/especialidad \
 *     bun test test/HU36_jeff/specialty-test.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 *
 * Datos INVENTADOS: el alumno sintético 20230001 tiene `student.id` 42 y el 43
 * es "otro alumno".
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

const ALUMNO = 42;
const OTRO_ALUMNO = 43;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const RANKING: StoredRankingEntry[] = [
  { key: "vj", specialtyId: 7, affinity: 75 },
  { key: "si", specialtyId: 6, affinity: 65 },
  { key: "ti", specialtyId: 5, affinity: 28 },
  { key: "sw", specialtyId: 1, affinity: 24 },
];

let cliente: postgres.Sql | null = null;
let repositorio: SpecialtyTestRepository;

const base = (): postgres.Sql => {
  if (!cliente) throw new Error("La conexión de prueba no se abrió (ver beforeAll).");
  return cliente;
};

/** Corre una sentencia en su propio savepoint y devuelve `SQLSTATE|restricción`, o null si pasa. */
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

// Los ganchos van fuera del `describe` a propósito, como en la prueba de
// bloques: dentro de un `describe` saltado bun cuenta cada gancho como una
// prueba saltada más. Sin TEST_DATABASE_URL vuelven sin hacer nada.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error(
      "TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1): esta prueba escribe tablas y filas.",
    );
  }
  const migracion = await Bun.file("drizzle/0014_specialty_test_result.sql").text();

  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  const database: typeof db = drizzle(cliente, { schema: { ...schema, ...relations } });
  repositorio = new SpecialtyTestRepository(database);

  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.student') is not null as hay_student`;
  if (previa?.hay_student) {
    throw new Error("La base de TEST_DATABASE_URL ya tiene public.student: usa una base vacía y desechable (createdb).");
  }
  await cliente.unsafe("create table public.student (id integer primary key, career_id integer not null)");
  await cliente.unsafe(`create table public.specialty (
    id integer primary key, career_id integer not null, name varchar(120) not null,
    is_active boolean not null default true)`);
  await cliente.unsafe(migracion);
  await cliente.unsafe(migracion);
  await cliente.unsafe(`insert into public.student (id, career_id) values (${ALUMNO}, 1), (${OTRO_ALUMNO}, 1)`);
  await cliente.unsafe(`insert into public.specialty (id, career_id, name, is_active) values
    (1, 1, 'Ingeniería de Software', true), (2, 1, 'Ciencia de Datos', false),
    (5, 1, 'Tecnologías de la Información', true), (9, 2, 'Otra carrera', true)`);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("specialty-test contra PostgreSQL real (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("la 0014 aplicada dos veces deja la tabla con su clave, su FK en cascada y los dos CHECK", async () => {
    const restricciones = await base()`
      select conname, contype::text as tipo
        from pg_constraint
       where conrelid = 'public.student_specialty_test_result'::regclass`;
    expect(restricciones.map((r) => `${r.conname}|${r.tipo}`).sort()).toEqual([
      "chk_specialty_test_ranking|c",
      "chk_specialty_test_version|c",
      "student_specialty_test_result_pkey|p",
      "student_specialty_test_result_student_id_student_id_fk|f",
    ]);

    const cascada = await base()`
      select confdeltype::text as al_borrar
        from pg_constraint
       where conrelid = 'public.student_specialty_test_result'::regclass and contype = 'f'`;
    expect(cascada.map((r) => r.al_borrar)).toEqual(["c"]);
  });

  test("findStudentCareer y findActiveSpecialties leen solo lo activo de la carrera", async () => {
    expect(await repositorio.findStudentCareer(ALUMNO)).toEqual({ careerId: 1 });
    expect(await repositorio.findStudentCareer(999)).toBeNull();
    expect(await repositorio.findActiveSpecialties(1)).toEqual([
      { id: 1, name: "Ingeniería de Software" },
      { id: 5, name: "Tecnologías de la Información" },
    ]);
  });

  test("saveResult guarda, findResult lee lo mismo y la fecha sale en ISO UTC", async () => {
    const { completedAt } = await repositorio.saveResult(ALUMNO, "2026-09-25.4", RANKING, false);
    expect(completedAt).toMatch(ISO_UTC);
    expect(await repositorio.findResult(ALUMNO)).toEqual({
      contentVersion: "2026-09-25.4",
      ranking: RANKING,
      isTie: false,
      completedAt,
    });
    expect(await repositorio.findResult(OTRO_ALUMNO)).toBeNull();
  });

  test("rehacer el test deja una sola fila con los valores nuevos y una fecha nueva", async () => {
    // now() es la hora de inicio de la transacción, así que se retrasa la
    // primera fecha a mano para ver que el `do update` la vuelve a fijar.
    await repositorio.saveResult(ALUMNO, "2026-09-25.4", RANKING, false);
    await base().unsafe(
      `update student_specialty_test_result set completed_at = completed_at - interval '1 day' where student_id = ${ALUMNO}`,
    );
    const antes = (await repositorio.findResult(ALUMNO))!.completedAt;
    const empate = RANKING.map((e, i) => (i < 2 ? { ...e, affinity: 60 } : e));
    const { completedAt } = await repositorio.saveResult(ALUMNO, "2026-09-25.4", empate, true);
    expect(completedAt > antes).toBe(true);
    const [{ filas }] = await base()`select count(*)::int as filas from student_specialty_test_result where student_id = ${ALUMNO}`;
    expect(filas).toBe(1);
    expect((await repositorio.findResult(ALUMNO))?.isTie).toBe(true);
  });

  test("la fila cae con el alumno", async () => {
    await repositorio.saveResult(OTRO_ALUMNO, "2026-09-25.4", RANKING, false);
    await base().unsafe(`delete from student where id = ${OTRO_ALUMNO}`);
    expect(await repositorio.findResult(OTRO_ALUMNO)).toBeNull();
  });

  test("los CHECK rechazan una version mal formada y un ranking que no es un arreglo de cuatro", async () => {
    const insertar = (version: string, ranking: string) =>
      `insert into student_specialty_test_result (student_id, content_version, ranking, is_tie)
       values (${ALUMNO}, '${version}', '${ranking}'::jsonb, false)`;
    const cuatro = JSON.stringify(RANKING);
    expect(await rechazo(insertar("2026-09-25", cuatro))).toBe("23514|chk_specialty_test_version");
    expect(await rechazo(insertar("2026-09-25.4", "[]"))).toBe("23514|chk_specialty_test_ranking");
    expect(await rechazo(insertar("2026-09-25.4", '{"a":1}'))).toBe("23514|chk_specialty_test_ranking");
    expect(await rechazo(insertar("2026-09-25.4", cuatro))).toBeNull();
  });
});
```

- [ ] **Paso 2: Correrlas y ver que fallan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test.repository.test.ts test/HU36_jeff/specialty-test.postgres.test.ts
```

**Esperado:** los dos archivos fallan con `error: Cannot find module '../../src/modules/specialty-test/specialty-test.repository.js'`, `0 pass` y `2 fail`.

- [ ] **Paso 3: Escribir el esquema del ranking guardado**

Crear `src/modules/specialty-test/specialty-test.schemas.ts`.

```ts
/**
 * Zod del test de especialidad (RS-BE-39 y RS-BE-44). Zod v3.
 *
 * `storedRankingSchema` valida el ranking que se guarda en
 * `student_specialty_test_result.ranking`, al escribirlo y al leerlo.
 */
import { z } from "zod";
import { SPECIALTY_KEYS } from "./specialty-test.types.js";

/** Un elemento de `student_specialty_test_result.ranking`, al escribir y al leer. */
export const storedRankingSchema = z
  .array(
    z.object({
      key: z.enum(SPECIALTY_KEYS),
      specialtyId: z.number().int().positive(),
      affinity: z.number().int().min(0).max(100),
    }),
  )
  .length(4)
  .refine((ranking) => new Set(ranking.map((e) => e.key)).size === 4, {
    message: "Cada especialidad va una sola vez.",
  });
```

- [ ] **Paso 4: Implementar el repository**

Crear `src/modules/specialty-test/specialty-test.repository.ts`.

```ts
import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import { storedRankingSchema } from "./specialty-test.schemas.js";
import type { StoredRankingEntry, StoredResult } from "./specialty-test.types.js";

/** Fila cruda de `database.execute`: claves snake_case y valores sin convertir. */
type Fila = Record<string, unknown>;

/**
 * Lecturas y escritura del test de especialidad (RS-BE-38, RS-BE-44 y
 * RS-BE-45). SQL crudo, como el resto de los repositories. El `student_id`
 * lo pone el controller desde el token y siempre viaja como parámetro.
 *
 * Los métodos no atrapan errores de la base: un fallo sube al `errorHandler`
 * global como 500, la misma regla de `academic-profile.repository.ts:49-53`.
 * Por lo mismo, un `ranking` guardado que no pasa Zod es un error y no un
 * resultado vacío.
 */
export class SpecialtyTestRepository {
  constructor(readonly database: typeof db) {}

  /** La carrera del alumno, o null si el id no tiene fila en `student`. */
  async findStudentCareer(studentId: number): Promise<{ careerId: number } | null> {
    const filas = await this.database.execute(sql`
      select career_id
      from student
      where id = ${studentId}
      limit 1
    `) as unknown as Fila[];

    const fila = filas[0];
    return fila ? { careerId: Number(fila.career_id) } : null;
  }

  /** Las especialidades con `is_active = true` de una carrera, por id. */
  async findActiveSpecialties(careerId: number): Promise<Array<{ id: number; name: string }>> {
    const filas = await this.database.execute(sql`
      select id, name
      from specialty
      where career_id = ${careerId}
        and is_active = true
      order by id
    `) as unknown as Fila[];

    return filas.map((fila) => ({ id: Number(fila.id), name: String(fila.name) }));
  }

  /**
   * Guarda o reemplaza el último resultado del alumno (RS-BE-44). El
   * `default now()` de `completed_at` solo actúa en el INSERT, así que el
   * `do update` fija la fecha a mano; sin eso, un test rehecho conservaría la
   * fecha del primero. El ranking viaja como texto JSON con `::jsonb`: nunca
   * se interpola un arreglo JS en la plantilla `sql` (error 42809).
   */
  async saveResult(
    studentId: number,
    contentVersion: string,
    ranking: StoredRankingEntry[],
    isTie: boolean,
  ): Promise<{ completedAt: string }> {
    const valido = storedRankingSchema.parse(ranking);
    const filas = await this.database.execute(sql`
      insert into student_specialty_test_result (student_id, content_version, ranking, is_tie)
      values (${studentId}, ${contentVersion}, ${JSON.stringify(valido)}::jsonb, ${isTie})
      on conflict (student_id) do update set
        content_version = excluded.content_version,
        ranking = excluded.ranking,
        is_tie = excluded.is_tie,
        completed_at = now()
      returning to_char(completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as completed_at
    `) as unknown as Fila[];

    const fila = filas[0];
    if (!fila) throw new Error("El guardado del resultado no devolvió ninguna fila.");
    return { completedAt: String(fila.completed_at) };
  }

  /** El último resultado del alumno, o null si no tiene ninguno (RS-BE-45). */
  async findResult(studentId: number): Promise<StoredResult | null> {
    const filas = await this.database.execute(sql`
      select content_version, ranking, is_tie,
             to_char(completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as completed_at
      from student_specialty_test_result
      where student_id = ${studentId}
      limit 1
    `) as unknown as Fila[];

    const fila = filas[0];
    if (!fila) return null;

    // postgres.js ya entrega el jsonb como objeto; si llegara como texto, se lee.
    const crudo = typeof fila.ranking === "string" ? JSON.parse(fila.ranking) : fila.ranking;
    const ranking = storedRankingSchema.safeParse(crudo);
    if (!ranking.success) {
      throw new Error("El ranking guardado del test de especialidad no tiene la forma esperada.");
    }
    return {
      contentVersion: String(fila.content_version),
      ranking: ranking.data,
      isTie: Boolean(fila.is_tie),
      completedAt: String(fila.completed_at),
    };
  }
}
```

- [ ] **Paso 5: Correr las pruebas y ver que pasan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test.repository.test.ts test/HU36_jeff/specialty-test.postgres.test.ts
```

**Esperado:** `10 pass`, `6 skip`, `0 fail`, `30 expect() calls`. Las seis saltadas son las de Postgres real. Correrlas pide un Postgres local desechable y la autorización del dueño, con el comando que trae la cabecera de esa prueba; no forman parte de este plan.

- [ ] **Paso 6: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2374 pass, 48 skip, 0 fail, 9272 `expect()` y 2422 pruebas en 138 archivos (+10 pruebas, +6 saltadas y +2 archivos).

- [ ] **Paso 7: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/specialty-test/specialty-test.schemas.ts src/modules/specialty-test/specialty-test.repository.ts test/HU36_jeff/specialty-test.repository.test.ts test/HU36_jeff/specialty-test.postgres.test.ts && git commit -m "feat(specialty-test): repository del alumno, las especialidades activas y el último resultado (RS-BE-38, RS-BE-44, RS-BE-45)" -m "saveResult hace el upsert por student_id con completed_at = now() en el do update y manda el ranking como texto JSON con ::jsonb. findResult valida el ranking con Zod y un ranking corrupto es un error. La prueba contra Postgres real solo corre con TEST_DATABASE_URL local."
```

---

### Tarea 7: Service con la evaluación sin estado, el guardado antes de Cohere y el último resultado

**Requisitos:** RS-BE-38 (`specialtyId` por nombre, sin tildes ni mayúsculas y sin espacios al borde, lo que viaja y lo que no, y el `404 SPECIALTY_TEST_NOT_AVAILABLE`), RS-BE-39 (pasos 3 a 7 de la validación, en orden), RS-BE-41 (respuesta del paso de desempate con `ulisesLine`), RS-BE-44 (guardar solo en el resultado final y antes de Cohere) y RS-BE-45 (último resultado con nombres de la versión vigente, `specialtyId` guardado, `isCurrentVersion` y los dos `404`).

**Archivos:**
- Modificar: `src/modules/specialty-test/specialty-test.schemas.ts` (se reemplaza entero, con `VERSION_PATTERN`, `evaluateBodySchema` y `EvaluateBody`)
- Crear: `src/modules/specialty-test/specialty-test.view.ts`
- Crear: `src/modules/specialty-test/specialty-test.service.ts`
- Prueba: `test/HU36_jeff/specialty-test.service.test.ts`

**Interfaces:**
- Consume (Tareas 1 a 6): `evaluateAnswers` y `roundAffinity`; `buildResultUlises`, `buildTemplateReason`, `nameOf` y `plain`; `buildReasonData`, `writeReason` y `CohereChat`; `SpecialtyTestRepository`; `storedRankingSchema`; `CONTENT_REGISTRY` en la prueba; `HttpError` y `EventBus` del repo.
- Produce:
  - `VERSION_PATTERN`, `evaluateBodySchema` (paso 3 de RS-BE-39) y `EvaluateBody = z.input<typeof evaluateBodySchema>`, con `tiebreakAnswers` opcional en el tipo y `[]` por defecto en tiempo de ejecución.
  - `resolveSpecialtyIds(content, activas): SpecialtyIds | null`, `toPublicContent(content, ids): PublicContent` y `toPublicTiebreak(t): PublicTiebreak`.
  - `SpecialtyTestService(repository, events, cohere: CohereChat, registry: ContentRegistry)` con `getContent(studentId): Promise<PublicContent>`, `evaluate(studentId, body: EvaluateBody): Promise<EvaluateResponse>` y `getResult(studentId): Promise<StoredResultResponse>`. Los errores son `HttpError` con los códigos y mensajes del contrato.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/specialty-test.service.test.ts`. El repositorio y Cohere son falsos y anotan cada llamada en una sola lista, para exigir el orden.

```ts
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import {
  CONTENT_BY_VERSION,
  CONTENT_REGISTRY,
  CURRENT_VERSION,
} from "../../src/modules/specialty-test/content/index.js";
import type { CohereChat } from "../../src/modules/specialty-test/specialty-test.reason.js";
import type { SpecialtyTestRepository } from "../../src/modules/specialty-test/specialty-test.repository.js";
import {
  evaluateBodySchema,
  type EvaluateBody,
} from "../../src/modules/specialty-test/specialty-test.schemas.js";
import { SpecialtyTestService } from "../../src/modules/specialty-test/specialty-test.service.js";
import type {
  ContentRegistry,
  StoredRankingEntry,
  StoredResult,
} from "../../src/modules/specialty-test/specialty-test.types.js";

/**
 * RS-BE-38, RS-BE-39, RS-BE-41, RS-BE-44 y RS-BE-45 en el service, con un
 * repositorio y un cliente de Cohere falsos que anotan cada llamada en una
 * sola lista, para poder exigir el orden (guardar antes de Cohere, validar
 * antes de consultar).
 *
 * Datos INVENTADOS: el alumno sintético 20230001 tiene `student.id` 42 y su
 * carrera es la 3. Los ids de especialidad 1, 5, 6 y 7 son ilustrativos.
 */

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const ALUMNO = 42;
const FECHA = "2026-09-25T20:15:00.000Z";
const ejemplo = (id: string) => c.weights.examples.find((e) => e.id === id)!;

/** Las cuatro activas de la carrera, con los nombres escritos distinto a propósito. */
const ACTIVAS = [
  { id: 1, name: "  INGENIERIA DE SOFTWARE " },
  { id: 5, name: "tecnologías de la información" },
  { id: 6, name: "Sistemas de Informacion" },
  { id: 7, name: "Desarrollo de Videojuegos" },
];

/** El motivo que el Cohere falso devuelve para el ejemplo-2; cumple las siete reglas. */
const MOTIVO_IA =
  "Desarrollo de Videojuegos va contigo porque elegiste diseñar niveles que se ponen difíciles poco a poco. " +
  "Con Sistemas de Información estuvo parejo, y en el desempate te quedaste con escribir finales distintos. " +
  "Mira cursos como «Storytelling» y «Proyecto de Videojuegos».";

interface Opciones {
  alumno?: boolean;
  activas?: Array<{ id: number; name: string }>;
  fila?: StoredResult | null;
  guardadoFalla?: boolean;
  cohere?: () => Promise<string>;
  registro?: ContentRegistry;
}

const armar = (opciones: Opciones = {}) => {
  const llamadas: string[] = [];
  const guardados: Array<{ studentId: number; version: string; ranking: StoredRankingEntry[]; isTie: boolean }> = [];
  const repo = {
    findStudentCareer: async (studentId: number) => {
      llamadas.push(`findStudentCareer:${studentId}`);
      return opciones.alumno === false ? null : { careerId: 3 };
    },
    findActiveSpecialties: async (careerId: number) => {
      llamadas.push(`findActiveSpecialties:${careerId}`);
      return opciones.activas ?? ACTIVAS;
    },
    saveResult: async (studentId: number, version: string, ranking: StoredRankingEntry[], isTie: boolean) => {
      llamadas.push("saveResult");
      if (opciones.guardadoFalla) throw new Error("fallo de la base");
      guardados.push({ studentId, version, ranking, isTie });
      return { completedAt: FECHA };
    },
    findResult: async () => {
      llamadas.push("findResult");
      return opciones.fila ?? null;
    },
  } as unknown as SpecialtyTestRepository;
  const cohere: CohereChat = {
    chatWithHistory: async () => {
      llamadas.push("cohere");
      return (opciones.cohere ?? (async () => MOTIVO_IA))();
    },
  };
  const service = new SpecialtyTestService(repo, new EventBus(), cohere, opciones.registro ?? CONTENT_REGISTRY);
  return { service, llamadas, guardados };
};

const cuerpo = (id: string, tiebreakAnswers: EvaluateBody["tiebreakAnswers"] = []): EvaluateBody => ({
  version: CURRENT_VERSION,
  answers: { ...ejemplo(id).answers },
  tiebreakAnswers,
});

let avisos: ReturnType<typeof spyOn>;
beforeEach(() => {
  avisos = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  avisos.mockRestore();
});

describe("GET /specialty-test/content en el service (RS-BE-38)", () => {
  test("resuelve cada clave a su specialtyId por nombre, sin tildes, mayusculas ni espacios al borde", async () => {
    const { service, llamadas } = armar();
    const contenido = await service.getContent(ALUMNO);
    expect(contenido.specialties.map((s) => [s.key, s.specialtyId])).toEqual([
      ["sw", 1], ["ti", 5], ["si", 6], ["vj", 7],
    ]);
    expect(llamadas).toEqual([`findStudentCareer:${ALUMNO}`, "findActiveSpecialties:3"]);
  });

  test("viaja lo que la app necesita, con los campos del contrato", async () => {
    const contenido = await armar().service.getContent(ALUMNO);
    expect(Object.keys(contenido)).toEqual(["version", "specialties", "ulises", "duelOptions", "scaleOptions", "questions"]);
    expect(contenido.version).toBe(CURRENT_VERSION);
    expect(Object.keys(contenido.specialties[0]!)).toEqual([
      "key", "specialtyId", "name", "tagline", "color", "icon", "totalCredits", "electives",
    ]);
    expect(contenido.specialties[0]!.icon).toBe("code-xml");
    expect(Object.keys(contenido.specialties[0]!.electives[0]!)).toEqual([
      "code", "name", "shortName", "credits", "prerequisite",
    ]);
    expect(Object.keys(contenido.ulises)).toEqual([
      "welcome", "startButton", "duelHelp", "scaleHelp", "reactions", "loading",
    ]);
    expect(Object.keys(contenido.ulises.reactions)).toEqual(["pick", "both", "none", "scale"]);
    expect(contenido.ulises.loading).toBe(c.ulisesLines.result.loading);
    expect(contenido.duelOptions.map((o) => o.id)).toEqual(["top", "bottom", "both", "none"]);
    expect(contenido.scaleOptions).toEqual([
      { id: "nada", label: "Nada" }, { id: "un_poco", label: "Un poco" },
      { id: "bastante", label: "Bastante" }, { id: "me_encantaria", label: "Me encantaría" },
    ]);
    expect(contenido.questions).toHaveLength(14);
    expect(contenido.questions[0]).toEqual({
      id: "q01", n: 1, type: "duel", prompt: "¿Cuál harías con más ganas?",
      top: {
        id: "q01.top", specialty: "sw",
        text: "Programar la app con la que una bodega recibe pedidos del barrio",
        illustration: c.questions[0]!.type === "duel" ? c.questions[0]!.top.illustration : "",
        icon: "shopping-cart",
      },
      bottom: expect.objectContaining({ id: "q01.bottom", specialty: "si", icon: "shelving-unit" }),
      reaction: c.questions[0]!.type === "duel" ? c.questions[0]!.reaction : "",
    });
    expect(contenido.questions[3]).toMatchObject({
      id: "q04", n: 4, type: "scale", task: { id: "q04.task", specialty: "ti", icon: "drumstick" },
      blockClose: "Primer tramo listo. Van 4 de 14.",
    });
  });

  test("no viaja nada del calculo ni del motivo", async () => {
    const texto = JSON.stringify(await armar().service.getContent(ALUMNO));
    for (const prohibido of [
      "LucideIcons.", "summary", "electives\":[\"", "weights", "threshold", "reasonTemplates",
      "tiebreakers", "examples", "balance", "sources", "diplomaName", "sharedWith", "wordCount",
      c.ulisesLines.result.intro, c.ulisesLines.result.closing, c.ulisesLines.tiebreak.first,
      c.reasonTemplates.main[0]!.text,
    ]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  test("sin fila en student responde 404 USER_NOT_FOUND", async () => {
    await expect(armar({ alumno: false }).service.getContent(ALUMNO)).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND",
    });
  });

  test("si falta una de las cuatro activas responde 404 SPECIALTY_TEST_NOT_AVAILABLE", async () => {
    const { service } = armar({ activas: ACTIVAS.filter((a) => a.id !== 6) });
    await expect(service.getContent(ALUMNO)).rejects.toMatchObject({
      statusCode: 404,
      code: "SPECIALTY_TEST_NOT_AVAILABLE",
      message: "El test de especialidad no está disponible para tu carrera.",
    });
  });
});

describe("POST /specialty-test/me/evaluate en el service (RS-BE-39)", () => {
  test("una version fuera del registro responde 409 con la vigente, sin consultar nada", async () => {
    const { service, llamadas } = armar();
    await expect(service.evaluate(ALUMNO, { ...cuerpo("ejemplo-1"), version: "2026-09-25.3", answers: {} })).rejects.toMatchObject({
      statusCode: 409,
      code: "SPECIALTY_TEST_VERSION_OUTDATED",
      message: "El test se actualizó. Vuelve a empezarlo.",
      details: { currentVersion: CURRENT_VERSION },
    });
    expect(llamadas).toEqual([]);
  });

  test("respuestas que faltan, de mas y del otro tipo, cada una en orden, antes de mirar al alumno", async () => {
    const { service, llamadas } = armar({ alumno: false });
    const answers: Record<string, string> = { ...ejemplo("ejemplo-1").answers };
    delete answers.q14;
    delete answers.q02;
    answers.q20 = "top";
    answers.q15 = "nada";
    answers.q04 = "top";
    answers.q01 = "bastante";
    await expect(service.evaluate(ALUMNO, { version: CURRENT_VERSION, answers: answers as EvaluateBody["answers"] })).rejects.toMatchObject({
      statusCode: 400,
      code: "SPECIALTY_TEST_INVALID_ANSWERS",
      message: "Las respuestas no corresponden a esta versión del test.",
      details: { missing: ["q02", "q14"], unexpected: ["q15", "q20"], invalid: ["q01", "q04"] },
    });
    expect(llamadas).toEqual([]);
  });

  test("con respuestas validas, un alumno sin fila da 404 USER_NOT_FOUND", async () => {
    await expect(armar({ alumno: false }).service.evaluate(ALUMNO, cuerpo("ejemplo-1"))).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND",
    });
  });

  test("sin sus cuatro especialidades activas da 404 SPECIALTY_TEST_NOT_AVAILABLE y no guarda", async () => {
    const { service, llamadas } = armar({ activas: ACTIVAS.slice(0, 3) });
    await expect(service.evaluate(ALUMNO, cuerpo("ejemplo-1"))).rejects.toMatchObject({
      statusCode: 404, code: "SPECIALTY_TEST_NOT_AVAILABLE",
    });
    expect(llamadas).not.toContain("saveResult");
  });

  test("un desempate que no toca da 400 SPECIALTY_TEST_TIEBREAK_MISMATCH con el esperado", async () => {
    const { service, llamadas } = armar();
    await expect(
      service.evaluate(ALUMNO, cuerpo("ejemplo-2", [{ id: "tb-sw-ti-1", answer: "top" }])),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SPECIALTY_TEST_TIEBREAK_MISMATCH",
      message: "Los desempates enviados no son los que corresponden a estas respuestas.",
      details: { expected: "tb-si-vj-1" },
    });
    await expect(
      service.evaluate(ALUMNO, cuerpo("ejemplo-1", [{ id: "tb-sw-si-1", answer: "top" }])),
    ).rejects.toMatchObject({ details: { expected: null } });
    expect(llamadas).not.toContain("saveResult");
  });

  test("acepta cualquier version del registro y calcula con su contenido", async () => {
    const anterior = { ...c, version: "2026-09-24.1" };
    const registro: ContentRegistry = {
      currentVersion: CURRENT_VERSION,
      byVersion: new Map([[CURRENT_VERSION, c], ["2026-09-24.1", anterior]]),
    };
    const { service, guardados } = armar({ registro });
    const r = await service.evaluate(ALUMNO, { ...cuerpo("ejemplo-1"), version: "2026-09-24.1" });
    expect(r.status).toBe("result");
    if (r.status === "result") expect(r.result.version).toBe("2026-09-24.1");
    expect(guardados[0]!.version).toBe("2026-09-24.1");
  });
});

describe("paso de desempate (RS-BE-41)", () => {
  test("devuelve el desempate 1 con sus dos tareas y la linea first, sin guardar ni llamar a Cohere", async () => {
    const { service, llamadas } = armar();
    const r = await service.evaluate(ALUMNO, cuerpo("ejemplo-2"));
    expect(r).toEqual({
      status: "tiebreak",
      tiebreak: {
        id: "tb-si-vj-1",
        order: 1,
        prompt: "¿Cuál harías con más ganas?",
        top: expect.objectContaining({ id: "tb-si-vj-1.top", specialty: "si", icon: "soup" }),
        bottom: expect.objectContaining({ id: "tb-si-vj-1.bottom", specialty: "vj", icon: "map-pinned" }),
      },
      ulisesLine: c.ulisesLines.tiebreak.first,
    });
    if (r.status === "tiebreak") {
      expect(Object.keys(r.tiebreak.top)).toEqual(["id", "specialty", "text", "illustration", "icon"]);
    }
    expect(llamadas).not.toContain("saveResult");
    expect(llamadas).not.toContain("cohere");
  });

  test("el desempate 2 lleva la linea second", async () => {
    const r = await armar().service.evaluate(ALUMNO, cuerpo("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }]));
    expect(r).toMatchObject({ status: "tiebreak", tiebreak: { id: "tb-si-vj-2", order: 2 }, ulisesLine: c.ulisesLines.tiebreak.second });
  });
});

describe("resultado final (RS-BE-42 a RS-BE-44)", () => {
  const FINAL = () => cuerpo("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }, { id: "tb-si-vj-2", answer: "top" }]);

  test("guarda antes de llamar a Cohere y responde con el contrato", async () => {
    const { service, llamadas, guardados } = armar();
    const r = await service.evaluate(ALUMNO, FINAL());
    expect(llamadas).toEqual([`findStudentCareer:${ALUMNO}`, "findActiveSpecialties:3", "saveResult", "cohere"]);
    expect(guardados).toEqual([{
      studentId: ALUMNO,
      version: CURRENT_VERSION,
      ranking: [
        { key: "vj", specialtyId: 7, affinity: 75 },
        { key: "si", specialtyId: 6, affinity: 65 },
        { key: "ti", specialtyId: 5, affinity: 28 },
        { key: "sw", specialtyId: 1, affinity: 24 },
      ],
      isTie: false,
    }]);
    expect(r).toEqual({
      status: "result",
      result: {
        version: CURRENT_VERSION,
        completedAt: FECHA,
        tie: false,
        ranking: [
          { key: "vj", specialtyId: 7, name: "Desarrollo de Videojuegos", affinity: 75 },
          { key: "si", specialtyId: 6, name: "Sistemas de Información", affinity: 65 },
          { key: "ti", specialtyId: 5, name: "Tecnologías de la Información", affinity: 28 },
          { key: "sw", specialtyId: 1, name: "Ingeniería de Software", affinity: 24 },
        ],
        reason: MOTIVO_IA,
        reasonSource: "ai",
        ulises: {
          intro: "Ya tengo tu resultado.",
          headline: "Lo tuyo apunta a Desarrollo de Videojuegos, con 75 % de afinidad.",
          tiebreakOutcome: "Ahí está, ya se inclinó la balanza.",
          closing: c.ulisesLines.result.closing,
          retake: "Si más adelante cambias de idea, puedes volver a hacer el test.",
        },
      },
    });
  });

  test("si Cohere falla sale el motivo de las plantillas, sin error", async () => {
    const { service } = armar({ cohere: async () => { throw new TypeError("fetch failed"); } });
    const r = await service.evaluate(ALUMNO, FINAL());
    expect(r).toMatchObject({
      status: "result",
      result: { reason: ejemplo("ejemplo-2").reasonText, reasonSource: "templates" },
    });
  });

  test("si el guardado falla, el error sube y Cohere no se llama", async () => {
    const { service, llamadas } = armar({ guardadoFalla: true });
    await expect(service.evaluate(ALUMNO, FINAL())).rejects.toThrow("fallo de la base");
    expect(llamadas).not.toContain("cohere");
  });

  test("con empate guarda is_tie y responde tie con las lineas de empate", async () => {
    const { service, guardados } = armar({ cohere: async () => "" });
    const e = ejemplo("ejemplo-8");
    const r = await service.evaluate(ALUMNO, cuerpo("ejemplo-8", [
      { id: "tb-sw-ti-1", answer: e.tiebreakAnswers[0]! },
      { id: "tb-sw-ti-2", answer: e.tiebreakAnswers[1]! },
    ]));
    expect(guardados[0]!.isTie).toBe(true);
    expect(r).toMatchObject({
      status: "result",
      result: {
        tie: true,
        reason: e.reasonText,
        reasonSource: "templates",
        ulises: {
          headline: "Empate. Ingeniería de Software y Tecnologías de la Información quedaron igualitas, con 60 %.",
          tiebreakOutcome: c.ulisesLines.tiebreak.stillTied,
        },
      },
    });
  });

  test("el mismo cuerpo da el mismo ranking dos veces y guarda dos veces (una fila por upsert)", async () => {
    const { service, guardados } = armar();
    const r1 = await service.evaluate(ALUMNO, FINAL());
    const r2 = await service.evaluate(ALUMNO, FINAL());
    if (r1.status === "result" && r2.status === "result") expect(r1.result.ranking).toEqual(r2.result.ranking);
    expect(guardados).toHaveLength(2);
  });
});

describe("GET /specialty-test/me/result en el service (RS-BE-45)", () => {
  const FILA: StoredResult = {
    contentVersion: CURRENT_VERSION,
    ranking: [
      { key: "vj", specialtyId: 70, affinity: 75 },
      { key: "si", specialtyId: 60, affinity: 65 },
      { key: "ti", specialtyId: 50, affinity: 28 },
      { key: "sw", specialtyId: 10, affinity: 24 },
    ],
    isTie: false,
    completedAt: FECHA,
  };

  test("sin test terminado responde result null", async () => {
    expect(await armar().service.getResult(ALUMNO)).toEqual({ result: null });
  });

  test("con fila: nombres de la version vigente y el specialtyId guardado", async () => {
    expect(await armar({ fila: FILA }).service.getResult(ALUMNO)).toEqual({
      result: {
        version: CURRENT_VERSION,
        isCurrentVersion: true,
        completedAt: FECHA,
        tie: false,
        ranking: [
          { key: "vj", specialtyId: 70, name: "Desarrollo de Videojuegos", affinity: 75 },
          { key: "si", specialtyId: 60, name: "Sistemas de Información", affinity: 65 },
          { key: "ti", specialtyId: 50, name: "Tecnologías de la Información", affinity: 28 },
          { key: "sw", specialtyId: 10, name: "Ingeniería de Software", affinity: 24 },
        ],
      },
    });
  });

  test("isCurrentVersion es false con una version que ya no es la vigente", async () => {
    const r = await armar({ fila: { ...FILA, contentVersion: "2026-09-24.1" } }).service.getResult(ALUMNO);
    expect(r.result?.isCurrentVersion).toBe(false);
    expect(r.result?.version).toBe("2026-09-24.1");
  });

  test("404 USER_NOT_FOUND sin fila en student", async () => {
    await expect(armar({ alumno: false, fila: FILA }).service.getResult(ALUMNO)).rejects.toMatchObject({
      statusCode: 404, code: "USER_NOT_FOUND",
    });
  });

  test("404 SPECIALTY_TEST_NOT_AVAILABLE aunque haya fila guardada, y sin leerla", async () => {
    const { service, llamadas } = armar({ activas: [], fila: FILA });
    await expect(service.getResult(ALUMNO)).rejects.toMatchObject({
      statusCode: 404, code: "SPECIALTY_TEST_NOT_AVAILABLE",
    });
    expect(llamadas).not.toContain("findResult");
  });
});

describe("forma del cuerpo de la evaluacion (RS-BE-39, paso 3)", () => {
  test("tiebreakAnswers falta y vale [], y las claves de mas en la raiz se descartan", () => {
    const r = evaluateBodySchema.safeParse({
      version: CURRENT_VERSION, answers: { q01: "top" }, studentId: 99, extra: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ version: CURRENT_VERSION, answers: { q01: "top" }, tiebreakAnswers: [] });
  });

  test("version de hasta 20 caracteres con la forma AAAA-MM-DD.N", () => {
    for (const version of ["2026-09-25", "ultima", "2026-09-25.4 ", `2026-09-25.${"9".repeat(10)}`]) {
      expect(evaluateBodySchema.safeParse({ version, answers: {} }).success).toBe(false);
    }
    expect(evaluateBodySchema.safeParse({ version: "2026-09-25.12", answers: {} }).success).toBe(true);
  });

  test("answers con ids q y dos digitos, hasta 20 claves y valores conocidos", () => {
    const veinte = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${String(i).padStart(2, "0")}`, "top"]));
    const base = { version: CURRENT_VERSION };
    expect(evaluateBodySchema.safeParse({ ...base, answers: veinte }).success).toBe(true);
    expect(evaluateBodySchema.safeParse({ ...base, answers: { ...veinte, q99: "top" } }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, answers: { q1: "top" } }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, answers: { q01: "quizas" } }).success).toBe(false);
  });

  test("tiebreakAnswers de 0 a 2, con id de hasta 24 y respuesta de duelo", () => {
    const base = { version: CURRENT_VERSION, answers: {} };
    const uno = { id: "tb-si-vj-1", answer: "top" };
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [uno, uno] }).success).toBe(true);
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [uno, uno, uno] }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [{ id: "x".repeat(25), answer: "top" }] }).success).toBe(false);
    expect(evaluateBodySchema.safeParse({ ...base, tiebreakAnswers: [{ id: "tb-si-vj-1", answer: "bastante" }] }).success).toBe(false);
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test.service.test.ts
```

**Esperado:** falla con `error: Cannot find module '../../src/modules/specialty-test/specialty-test.service.js'`, `0 pass` y `1 fail`.

- [ ] **Paso 3: Ampliar los esquemas de Zod**

Reemplazar `src/modules/specialty-test/specialty-test.schemas.ts` entero por esta versión.

```ts
/**
 * Zod del test de especialidad (RS-BE-39 y RS-BE-44). Zod v3.
 *
 * `evaluateBodySchema` es el paso 3 de la validación: solo la forma. Que las
 * respuestas correspondan a la versión (paso 5) y que los desempates sean los
 * que tocan (paso 7) lo decide el service, con sus propios códigos de error.
 */
import { z } from "zod";
import { DUEL_ANSWERS, SCALE_ANSWERS, SPECIALTY_KEYS } from "./specialty-test.types.js";

/** `AAAA-MM-DD.N`, la forma de RS-BE-37 y del CHECK `chk_specialty_test_version`. */
export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;

const MAX_ANSWER_KEYS = 20;

export const evaluateBodySchema = z.object({
  version: z.string().max(20).regex(VERSION_PATTERN, "Versión inválida."),
  answers: z
    .record(
      z.string().regex(/^q\d{2}$/, "Id de pregunta inválido."),
      z.enum([...DUEL_ANSWERS, ...SCALE_ANSWERS]),
    )
    .refine((answers) => Object.keys(answers).length <= MAX_ANSWER_KEYS, {
      message: `Como mucho ${MAX_ANSWER_KEYS} respuestas.`,
    }),
  tiebreakAnswers: z
    .array(z.object({ id: z.string().max(24), answer: z.enum(DUEL_ANSWERS) }))
    .max(2)
    .optional()
    .default([]),
});

/**
 * El cuerpo como lo tipa `validateJson`, que infiere el tipo de ENTRADA del
 * esquema: `tiebreakAnswers` queda opcional en el tipo aunque Zod ya lo
 * rellena con `[]`. El service lo lee con `?? []`.
 */
export type EvaluateBody = z.input<typeof evaluateBodySchema>;

/** Un elemento de `student_specialty_test_result.ranking`, al escribir y al leer. */
export const storedRankingSchema = z
  .array(
    z.object({
      key: z.enum(SPECIALTY_KEYS),
      specialtyId: z.number().int().positive(),
      affinity: z.number().int().min(0).max(100),
    }),
  )
  .length(4)
  .refine((ranking) => new Set(ranking.map((e) => e.key)).size === 4, {
    message: "Cada especialidad va una sola vez.",
  });
```

- [ ] **Paso 4: Escribir lo que viaja a la app**

Crear `src/modules/specialty-test/specialty-test.view.ts`.

```ts
/**
 * RS-BE-38 · Lo que la app recibe del contenido, y la traducción de cada
 * clave a su id de `specialty`. Funciones puras.
 *
 * Viaja lo que la app necesita para conducir el test sin red entre pregunta y
 * pregunta. No viaja el nombre del ícono en Flutter, los resúmenes y los
 * electivos de cada tarea, los pesos, el umbral, las plantillas, las líneas de
 * Ulises del resultado salvo `loading`, las del desempate, los desempates, los
 * ejemplos, el balance ni las fuentes: son del cálculo y del motivo.
 */
import { plain } from "./specialty-test.templates.js";
import type {
  ContentTask,
  PublicContent,
  PublicTask,
  PublicTiebreak,
  SpecialtyIds,
  SpecialtyTestContent,
  Tiebreaker,
} from "./specialty-test.types.js";
import { SPECIALTY_KEYS } from "./specialty-test.types.js";

/** Nombre sin tildes, sin mayúsculas y sin espacios al borde. */
const clave = (nombre: string): string => plain(nombre).trim();

/**
 * Busca, entre las especialidades activas de la carrera del alumno, la que
 * tiene el mismo nombre que cada clave del contenido. Si alguna de las cuatro
 * no aparece, devuelve null: el test no está disponible para ese alumno.
 */
export const resolveSpecialtyIds = (
  content: SpecialtyTestContent,
  activas: ReadonlyArray<{ id: number; name: string }>,
): SpecialtyIds | null => {
  const ids: Partial<SpecialtyIds> = {};
  for (const k of SPECIALTY_KEYS) {
    const especialidad = content.specialties.find((s) => s.key === k);
    const fila = especialidad && activas.find((a) => clave(a.name) === clave(especialidad.name));
    if (!fila) return null;
    ids[k] = fila.id;
  }
  return ids as SpecialtyIds;
};

const tareaPublica = (id: string, tarea: ContentTask): PublicTask => ({
  id,
  specialty: tarea.specialty,
  text: tarea.text,
  illustration: tarea.illustration,
  icon: tarea.icon.lucide,
});

export const toPublicContent = (content: SpecialtyTestContent, ids: SpecialtyIds): PublicContent => {
  const lineas = content.ulisesLines;
  return {
    version: content.version,
    specialties: content.specialties.map((s) => ({
      key: s.key,
      specialtyId: ids[s.key],
      name: s.name,
      tagline: s.tagline,
      color: { light: s.color.light, dark: s.color.dark },
      icon: s.icon.lucide,
      totalCredits: s.totalCredits,
      electives: s.electives.map((e) => ({
        code: e.code,
        name: e.name,
        shortName: e.shortName,
        credits: e.credits,
        prerequisite: e.prerequisite,
      })),
    })),
    ulises: {
      welcome: [...lineas.welcome],
      startButton: lineas.startButton,
      duelHelp: lineas.duelHelp,
      scaleHelp: lineas.scaleHelp,
      reactions: {
        pick: [...lineas.reactions.pick],
        both: [...lineas.reactions.both],
        none: [...lineas.reactions.none],
        scale: [...lineas.reactions.scale],
      },
      loading: lineas.result.loading,
    },
    duelOptions: content.meta.duelOptions.map((o) => ({ id: o.id, label: o.label })),
    scaleOptions: content.weights.scale.options.map((o) => ({ id: o.id, label: o.label })),
    questions: content.questions.map((q) =>
      q.type === "duel"
        ? {
            id: q.id,
            n: q.n,
            type: "duel" as const,
            prompt: q.prompt,
            top: tareaPublica(`${q.id}.top`, q.top),
            bottom: tareaPublica(`${q.id}.bottom`, q.bottom),
            reaction: q.reaction,
          }
        : {
            id: q.id,
            n: q.n,
            type: "scale" as const,
            prompt: q.prompt,
            task: tareaPublica(`${q.id}.task`, q.task),
            blockClose: q.blockClose,
          },
    ),
  };
};

export const toPublicTiebreak = (t: Tiebreaker): PublicTiebreak => ({
  id: t.id,
  order: t.order,
  prompt: t.prompt,
  top: tareaPublica(`${t.id}.top`, t.top),
  bottom: tareaPublica(`${t.id}.bottom`, t.bottom),
});
```

- [ ] **Paso 5: Implementar el service**

Crear `src/modules/specialty-test/specialty-test.service.ts`.

```ts
import type { EventBus } from "../../events/index.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { evaluateAnswers, roundAffinity } from "./specialty-test.logic.js";
import { buildResultUlises, buildTemplateReason, nameOf } from "./specialty-test.templates.js";
import { buildReasonData, writeReason, type CohereChat } from "./specialty-test.reason.js";
import type { SpecialtyTestRepository } from "./specialty-test.repository.js";
import type { EvaluateBody } from "./specialty-test.schemas.js";
import type {
  Answer,
  ContentRegistry,
  EvaluateResponse,
  PublicContent,
  SpecialtyIds,
  SpecialtyTestContent,
  StoredRankingEntry,
  StoredResultResponse,
} from "./specialty-test.types.js";
import { DUEL_ANSWERS, SCALE_ANSWERS } from "./specialty-test.types.js";
import { resolveSpecialtyIds, toPublicContent, toPublicTiebreak } from "./specialty-test.view.js";

const DUELO = new Set<string>(DUEL_ANSWERS);
const ESCALA = new Set<string>(SCALE_ANSWERS);

/**
 * Reglas del test de especialidad (RS-BE-38 a RS-BE-45).
 *
 * Recibe el repository, el `EventBus` (sin eventos en esta funcionalidad), el
 * cliente de Cohere y el registro de versiones. Los dos últimos se inyectan
 * para que las pruebas no llamen a Cohere y puedan armar un registro con más
 * de una versión. El alumno siempre llega desde el token.
 */
export class SpecialtyTestService {
  constructor(
    readonly repository: SpecialtyTestRepository,
    readonly events: EventBus,
    readonly cohere: CohereChat,
    readonly registry: ContentRegistry,
  ) {}

  private vigente(): SpecialtyTestContent {
    const content = this.registry.byVersion.get(this.registry.currentVersion);
    if (!content) throw new Error("La versión vigente del test no está en el registro.");
    return content;
  }

  /**
   * RS-BE-38 y RS-BE-45: el alumno tiene que existir y las cuatro claves
   * tienen que encontrar su especialidad activa en su carrera.
   */
  private async disponibilidad(studentId: number, content: SpecialtyTestContent): Promise<SpecialtyIds> {
    const alumno = await this.repository.findStudentCareer(studentId);
    if (!alumno) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");
    const activas = await this.repository.findActiveSpecialties(alumno.careerId);
    const ids = resolveSpecialtyIds(content, activas);
    if (!ids) {
      throw new HttpError(
        404,
        "El test de especialidad no está disponible para tu carrera.",
        "SPECIALTY_TEST_NOT_AVAILABLE",
      );
    }
    return ids;
  }

  async getContent(studentId: number): Promise<PublicContent> {
    const content = this.vigente();
    return toPublicContent(content, await this.disponibilidad(studentId, content));
  }

  /** RS-BE-39, pasos 4 a 7, y RS-BE-41 a RS-BE-44. El paso 3 ya lo hizo Zod. */
  async evaluate(studentId: number, body: EvaluateBody): Promise<EvaluateResponse> {
    // Paso 4: la versión tiene que estar en el registro.
    const content = this.registry.byVersion.get(body.version);
    if (!content) {
      throw new HttpError(409, "El test se actualizó. Vuelve a empezarlo.", "SPECIALTY_TEST_VERSION_OUTDATED", {
        currentVersion: this.registry.currentVersion,
      });
    }

    // Paso 5: exactamente las 14 preguntas de esa versión, cada una con su tipo de respuesta.
    const answers = this.respuestasDeLaVersion(content, body.answers);

    // Paso 6: el alumno y sus cuatro especialidades.
    const ids = await this.disponibilidad(studentId, content);

    // Paso 7: los desempates recibidos tienen que ser justo los que tocan.
    const paso = evaluateAnswers(content, answers, body.tiebreakAnswers ?? []);
    if (paso.kind === "mismatch") {
      throw new HttpError(
        400,
        "Los desempates enviados no son los que corresponden a estas respuestas.",
        "SPECIALTY_TEST_TIEBREAK_MISMATCH",
        { expected: paso.expected },
      );
    }
    if (paso.kind === "tiebreak") {
      const lineas = content.ulisesLines.tiebreak;
      return {
        status: "tiebreak",
        tiebreak: toPublicTiebreak(paso.tiebreaker),
        ulisesLine: paso.line === "first" ? lineas.first : lineas.second,
      };
    }

    const ev = paso.evaluation;
    const ranking = ev.ranking.map((key) => ({
      key,
      specialtyId: ids[key],
      name: nameOf(content, key),
      affinity: roundAffinity(ev.scores[key].S),
    }));

    // RS-BE-44: el guardado va ANTES de Cohere. Si falla, sube como 500 sin gastar la llamada.
    const guardado: StoredRankingEntry[] = ranking.map(({ key, specialtyId, affinity }) => ({
      key,
      specialtyId,
      affinity,
    }));
    const { completedAt } = await this.repository.saveResult(studentId, content.version, guardado, ev.tie);

    const plantillas = buildTemplateReason(content, answers, ev);
    const motivo = await writeReason(
      this.cohere,
      buildReasonData(content, answers, ev, plantillas.main),
      plantillas.text,
      content.specialties.map((s) => s.name),
    );

    return {
      status: "result",
      result: {
        version: content.version,
        completedAt,
        tie: ev.tie,
        ranking,
        reason: motivo.reason,
        reasonSource: motivo.reasonSource,
        ulises: buildResultUlises(content, ev),
      },
    };
  }

  async getResult(studentId: number): Promise<StoredResultResponse> {
    const content = this.vigente();
    await this.disponibilidad(studentId, content);

    const fila = await this.repository.findResult(studentId);
    if (!fila) return { result: null };

    return {
      result: {
        version: fila.contentVersion,
        isCurrentVersion: fila.contentVersion === this.registry.currentVersion,
        completedAt: fila.completedAt,
        tie: fila.isTie,
        ranking: fila.ranking.map((e) => ({
          key: e.key,
          specialtyId: e.specialtyId,
          name: nameOf(content, e.key),
          affinity: e.affinity,
        })),
      },
    };
  }

  /**
   * Paso 5 de RS-BE-39. `missing` son las preguntas de la versión que faltan,
   * en el orden de la versión; `unexpected`, los ids que la versión no tiene,
   * en orden alfabético; `invalid`, las preguntas con una respuesta del otro
   * tipo, en el orden de la versión.
   */
  private respuestasDeLaVersion(
    content: SpecialtyTestContent,
    recibidas: Readonly<Record<string, string>>,
  ): Record<string, Answer> {
    const ids = new Set(content.questions.map((q) => q.id));
    const missing = content.questions.filter((q) => !Object.hasOwn(recibidas, q.id)).map((q) => q.id);
    const unexpected = Object.keys(recibidas).filter((id) => !ids.has(id)).sort();
    const invalid = content.questions
      .filter((q) => Object.hasOwn(recibidas, q.id))
      .filter((q) => !(q.type === "duel" ? DUELO : ESCALA).has(recibidas[q.id]!))
      .map((q) => q.id);

    if (missing.length > 0 || unexpected.length > 0 || invalid.length > 0) {
      throw new HttpError(
        400,
        "Las respuestas no corresponden a esta versión del test.",
        "SPECIALTY_TEST_INVALID_ANSWERS",
        { missing, unexpected, invalid },
      );
    }
    return recibidas as Record<string, Answer>;
  }
}
```

- [ ] **Paso 6: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test.service.test.ts
```

**Esperado:** `27 pass`, `0 fail`, `84 expect() calls`.

- [ ] **Paso 7: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2401 pass, 48 skip, 0 fail, 9356 `expect()` y 2449 pruebas en 139 archivos (+27 pruebas y +1 archivo).

- [ ] **Paso 8: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/specialty-test/specialty-test.schemas.ts src/modules/specialty-test/specialty-test.view.ts src/modules/specialty-test/specialty-test.service.ts test/HU36_jeff/specialty-test.service.test.ts && git commit -m "feat(specialty-test): service con la evaluación sin estado, el guardado antes de Cohere y el último resultado (RS-BE-38, RS-BE-39, RS-BE-41, RS-BE-44, RS-BE-45)" -m "La evaluación valida la versión, las respuestas de esa versión, al alumno con sus cuatro especialidades activas y los desempates, en ese orden. Un paso de desempate no escribe nada; el resultado final se guarda antes de llamar a Cohere, y si el guardado falla, Cohere no se llama."
```

---

### Tarea 8: Rutas, límites y registro del módulo

**Requisitos:** RS-BE-46 (`authMiddleware` y `requireRole(...STUDENT_ROLES)` en todo el módulo, `413 PAYLOAD_TOO_LARGE` con `bodyLimit` de 4 KiB solo en la evaluación, `specialtyTestRateLimit` de 30 por alumno por hora con su mensaje, `Cache-Control: no-store` en la evaluación y en el resultado, y registros limpios), el orden de RS-BE-39 (autorización, tamaño, límite y forma) y el montaje en `/specialty-test`.

**Archivos:**
- Modificar: `src/shared/middleware/rate-limit.ts` (un bloque al final)
- Crear: `src/modules/specialty-test/specialty-test.controller.ts`
- Crear: `src/modules/specialty-test/specialty-test.routes.ts`
- Crear: `src/modules/specialty-test/index.ts`
- Modificar: `src/modules/index.ts` (un import y un `app.route`)
- Prueba: `test/HU36_jeff/specialty-test.routes.test.ts`
- Prueba: `test/HU36_jeff/specialty-test.rate-limit.test.ts`

**Interfaces:**
- Consume (Tareas 1 a 7): `SpecialtyTestService`, `SpecialtyTestRepository`, `evaluateBodySchema`, `CONTENT_REGISTRY`; del repo, `authMiddleware`, `requireRole`, `STUDENT_ROLES`, `AuthVariables`, `validateJson`, `HttpError`, `errorHandler`, `bodyLimit` de `hono/body-limit`, `cohereClient`, `db` y `eventBus`.
- Produce:
  - `SPECIALTY_TEST_MAX_PER_HOUR = 30` y `specialtyTestRateLimit(c, next)`.
  - `SpecialtyTestController` con `getContent`, `evaluate` y `getResult`.
  - `EVALUATE_MAX_BYTES = 4096` y `createSpecialtyTestRoutes(controller)`, con `GET /content`, `POST /me/evaluate` y `GET /me/result`.
  - `specialtyTestRoutes`, montado en `src/modules/index.ts` como `app.route("/specialty-test", specialtyTestRoutes)`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Crear `test/HU36_jeff/specialty-test.routes.test.ts`. La cadena es la real y solo la base y Cohere son falsos; `mock.module` de `src/db/index.js` va antes de cualquier `await import(…)`, porque `authMiddleware` consulta `token_version` en cada petición. Cada petición usa un alumno nuevo, porque el contador del límite vive en la memoria del módulo y bun comparte el módulo entre archivos.

```ts
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-38, RS-BE-39, RS-BE-45 y RS-BE-46 vistos desde HTTP: las tres rutas
 * de /specialty-test, quién entra, de dónde sale el alumno, el orden de la
 * validación, los límites y la forma de cada error.
 *
 * La cadena es la real (routes → controller → service → repository) y solo la
 * base y Cohere son falsos. La base contesta según el texto de cada sentencia
 * y anota `{ sql, params }`, para exigir que el `studentId` del token, y
 * ningún otro, llegue al SQL. `mock.module` va ANTES de cualquier
 * `await import(...)` porque `authMiddleware` consulta `token_version` en cada
 * petición y el `.env` del worktree apunta a producción.
 *
 * El contador de `specialtyTestRateLimit` vive en la memoria del módulo y bun
 * comparte el módulo entre archivos, así que cada petición usa un alumno nuevo
 * salvo que la prueba pida uno fijo.
 *
 * Datos INVENTADOS (el repo es público): el alumno sintético 20230001; los ids
 * de especialidad 1, 5, 6 y 7 son ilustrativos.
 */

type Consulta = { sql: string; params: unknown[] };

interface Datos {
  alumno: boolean;
  activas: Array<{ id: number; name: string }>;
  fila: Record<string, unknown> | null;
  guardadoFalla: boolean;
}

const FECHA = "2026-09-25T20:15:00.000Z";
const ACTIVAS = [
  { id: 1, name: "Ingeniería de Software" },
  { id: 5, name: "Tecnologías de la Información" },
  { id: 6, name: "Sistemas de Información" },
  { id: 7, name: "Desarrollo de Videojuegos" },
];

const consultas: Consulta[] = [];
let datos: Datos = { alumno: true, activas: ACTIVAS, fila: null, guardadoFalla: false };

const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  const texto = sql.toLowerCase().replace(/\s+/g, " ").trim();

  if (texto.includes("token_version")) return [{ token_version: 1 }];
  if (texto.startsWith("insert into student_specialty_test_result")) {
    if (datos.guardadoFalla) throw new Error("fallo de la base");
    return [{ completed_at: FECHA }];
  }
  if (texto.includes("from student_specialty_test_result")) return datos.fila ? [datos.fila] : [];
  if (texto.includes("from specialty")) return datos.activas;
  if (texto.includes("from student")) return datos.alumno ? [{ career_id: 3 }] : [];
  throw new Error(`consulta inesperada: ${texto}`);
};

const fakeDb = {
  execute: ejecutar,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { SpecialtyTestController } = await import("../../src/modules/specialty-test/specialty-test.controller.js");
const { SpecialtyTestRepository } = await import("../../src/modules/specialty-test/specialty-test.repository.js");
const { SpecialtyTestService } = await import("../../src/modules/specialty-test/specialty-test.service.js");
const { createSpecialtyTestRoutes } = await import("../../src/modules/specialty-test/specialty-test.routes.js");
const { CONTENT_BY_VERSION, CONTENT_REGISTRY, CURRENT_VERSION } = await import(
  "../../src/modules/specialty-test/content/index.js"
);
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

const c = CONTENT_BY_VERSION.get(CURRENT_VERSION)!;
const ejemplo = (id: string) => c.weights.examples.find((e) => e.id === id)!;

/** Lo que responde el Cohere falso; cada prueba puede cambiarlo. */
let respuestaCohere: () => Promise<string> = async () => "";
let llamadasCohere = 0;

const app = new Hono();
app.onError(errorHandler);
app.route(
  "/specialty-test",
  createSpecialtyTestRoutes(
    new SpecialtyTestController(
      new SpecialtyTestService(
        new SpecialtyTestRepository(fakeDb as never),
        new EventBus(),
        {
          chatWithHistory: async () => {
            llamadasCohere++;
            return respuestaCohere();
          },
        },
        CONTENT_REGISTRY,
      ),
    ),
  ),
);

let siguienteAlumno = 5000;
const alumnoNuevo = () => ++siguienteAlumno;

const tokenDe = (role: string, studentId: number) =>
  jwt.sign({ sub: "1", studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = jwt.sign({ sub: "2", teacherId: 7, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);

const pedir = async (
  metodo: string,
  ruta: string,
  opciones: { token?: string | null; body?: unknown; datos?: Partial<Datos> } = {},
) => {
  consultas.length = 0;
  llamadasCohere = 0;
  datos = { alumno: true, activas: ACTIVAS, fila: null, guardadoFalla: false, ...(opciones.datos ?? {}) };
  const headers: Record<string, string> = {};
  const token = opciones.token === undefined ? tokenDe("student", alumnoNuevo()) : opciones.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (opciones.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof opciones.body === "string" ? opciones.body : JSON.stringify(opciones.body);
  }
  return await app.request(ruta, { method: metodo, headers, body });
};

const delModulo = () => consultas.filter((q) => !q.sql.includes("token_version"));

const CUERPO = (id = "ejemplo-2", tiebreakAnswers: unknown[] = []) => ({
  version: CURRENT_VERSION,
  answers: { ...ejemplo(id).answers },
  tiebreakAnswers,
});

const RUTAS: Array<{ metodo: string; ruta: string; body?: unknown }> = [
  { metodo: "GET", ruta: "/specialty-test/content" },
  { metodo: "POST", ruta: "/specialty-test/me/evaluate", body: CUERPO() },
  { metodo: "GET", ruta: "/specialty-test/me/result" },
];

let errores: ReturnType<typeof spyOn>;
let avisos: ReturnType<typeof spyOn>;
beforeEach(() => {
  respuestaCohere = async () => "";
  errores = spyOn(console, "error").mockImplementation(() => {});
  avisos = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  errores.mockRestore();
  avisos.mockRestore();
});

describe("quien puede entrar a /specialty-test (RS-BE-46)", () => {
  for (const { metodo, ruta, body } of RUTAS) {
    test(`${metodo} ${ruta} sin token responde 401 MISSING_TOKEN`, async () => {
      const res = await pedir(metodo, ruta, { token: null, body });
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
      const res = await pedir(metodo, ruta, { token: tokenDe("student", 0), body });
      expect(res.status).toBe(403);
      expect(delModulo()).toHaveLength(0);
    });
  }

  test("delegado y subdelegado entran como alumnos", async () => {
    for (const rol of ["delegate", "subdelegate"]) {
      const res = await pedir("GET", "/specialty-test/content", { token: tokenDe(rol, alumnoNuevo()) });
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /specialty-test/content (RS-BE-38)", () => {
  test("200 con la version vigente, los specialtyId del alumno y sin no-store", async () => {
    const alumno = alumnoNuevo();
    const res = await pedir("GET", "/specialty-test/content", { token: tokenDe("student", alumno) });
    expect(res.status).toBe(200);
    const cuerpo = await res.json() as { version: string; specialties: Array<{ key: string; specialtyId: number }> };
    expect(cuerpo.version).toBe(CURRENT_VERSION);
    expect(cuerpo.specialties.map((s) => s.specialtyId)).toEqual([1, 5, 6, 7]);
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(delModulo().map((q) => q.params)).toEqual([[alumno], [3]]);
  });

  test("404 SPECIALTY_TEST_NOT_AVAILABLE si falta una activa y 404 USER_NOT_FOUND sin alumno", async () => {
    let res = await pedir("GET", "/specialty-test/content", { datos: { activas: ACTIVAS.slice(1) } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "SPECIALTY_TEST_NOT_AVAILABLE", message: "El test de especialidad no está disponible para tu carrera." },
    });
    res = await pedir("GET", "/specialty-test/content", { datos: { alumno: false } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "USER_NOT_FOUND" } });
  });
});

describe("POST /specialty-test/me/evaluate (RS-BE-39 y RS-BE-46)", () => {
  test("recorrido del ejemplo-2: dos desempates y el resultado, con el alumno del token", async () => {
    const alumno = alumnoNuevo();
    const token = tokenDe("student", alumno);
    let res = await pedir("POST", "/specialty-test/me/evaluate", { token, body: { ...CUERPO(), studentId: 99 } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "tiebreak", tiebreak: { id: "tb-si-vj-1" } });
    expect(delModulo().some((q) => q.sql.toLowerCase().includes("insert"))).toBe(false);

    res = await pedir("POST", "/specialty-test/me/evaluate", {
      token, body: CUERPO("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }]),
    });
    expect(await res.json()).toMatchObject({ status: "tiebreak", tiebreak: { id: "tb-si-vj-2" } });

    res = await pedir("POST", "/specialty-test/me/evaluate", {
      token,
      body: CUERPO("ejemplo-2", [{ id: "tb-si-vj-1", answer: "bottom" }, { id: "tb-si-vj-2", answer: "top" }]),
    });
    expect(res.status).toBe(200);
    const cuerpo = await res.json() as { status: string; result: Record<string, unknown> };
    expect(cuerpo.status).toBe("result");
    expect(cuerpo.result).toMatchObject({
      version: CURRENT_VERSION, completedAt: FECHA, tie: false,
      reason: ejemplo("ejemplo-2").reasonText, reasonSource: "templates",
    });
    const insercion = delModulo().find((q) => q.sql.trim().toLowerCase().startsWith("insert"));
    expect(insercion?.params[0]).toBe(alumno);
    expect(delModulo().every((q) => !q.params.includes(99))).toBe(true);
  });

  test("400 INVALID_JSON_BODY con un cuerpo que no es JSON", async () => {
    const res = await pedir("POST", "/specialty-test/me/evaluate", { body: "{no es json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_JSON_BODY" } });
  });

  test("400 INVALID_REQUEST_BODY con los campos en details.fieldErrors", async () => {
    const casos: Array<[unknown, string]> = [
      [{ ...CUERPO(), version: "ultima" }, "version"],
      [{ ...CUERPO(), version: `2026-09-25.${"1".repeat(20)}` }, "version"],
      [{ ...CUERPO(), answers: { pregunta1: "top" } }, "answers"],
      [{ ...CUERPO(), answers: { q01: "tal_vez" } }, "answers"],
      [{ ...CUERPO(), answers: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`q${String(i).padStart(2, "0")}`, "top"])) }, "answers"],
      [{ ...CUERPO(), tiebreakAnswers: [{ id: "a", answer: "top" }, { id: "b", answer: "top" }, { id: "c", answer: "top" }] }, "tiebreakAnswers"],
      [{ ...CUERPO(), tiebreakAnswers: [{ id: "x".repeat(25), answer: "top" }] }, "tiebreakAnswers"],
      [{ ...CUERPO(), tiebreakAnswers: [{ id: "tb-si-vj-1", answer: "nada" }] }, "tiebreakAnswers"],
    ];
    for (const [cuerpo, campo] of casos) {
      const res = await pedir("POST", "/specialty-test/me/evaluate", { body: cuerpo });
      expect(res.status).toBe(400);
      const json = await res.json() as { error: { code: string; details: { fieldErrors: Record<string, unknown> } } };
      expect(json.error.code).toBe("INVALID_REQUEST_BODY");
      expect(Object.keys(json.error.details.fieldErrors)).toContain(campo);
    }
  });

  test("tiebreakAnswers es opcional", async () => {
    const { tiebreakAnswers: _omitido, ...sinDesempates } = CUERPO();
    const res = await pedir("POST", "/specialty-test/me/evaluate", { body: sinDesempates });
    expect(await res.json()).toMatchObject({ status: "tiebreak" });
  });

  test("409, 400 de respuestas y 400 de desempate con sus details", async () => {
    let res = await pedir("POST", "/specialty-test/me/evaluate", { body: { ...CUERPO(), version: "2026-09-25.3" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "SPECIALTY_TEST_VERSION_OUTDATED",
        message: "El test se actualizó. Vuelve a empezarlo.",
        details: { currentVersion: CURRENT_VERSION },
      },
    });

    const { q14: _q14, ...sinUna } = ejemplo("ejemplo-2").answers;
    res = await pedir("POST", "/specialty-test/me/evaluate", { body: { ...CUERPO(), answers: sinUna } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "SPECIALTY_TEST_INVALID_ANSWERS", details: { missing: ["q14"], unexpected: [], invalid: [] } },
    });

    res = await pedir("POST", "/specialty-test/me/evaluate", {
      body: CUERPO("ejemplo-2", [{ id: "tb-sw-ti-1", answer: "top" }]),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "SPECIALTY_TEST_TIEBREAK_MISMATCH", details: { expected: "tb-si-vj-1" } },
    });
  });

  test("413 PAYLOAD_TOO_LARGE con la forma de error de siempre y no-store", async () => {
    const res = await pedir("POST", "/specialty-test/me/evaluate", {
      body: { ...CUERPO(), relleno: "x".repeat(5000) },
    });
    expect(res.status).toBe(413);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "La petición es demasiado grande." },
    });
    expect(delModulo()).toHaveLength(0);
  });

  test("un cuerpo de 4 KiB justos todavia entra", async () => {
    const base = JSON.stringify({ ...CUERPO(), relleno: "" });
    const cuerpo = JSON.stringify({ ...CUERPO(), relleno: "x".repeat(4096 - Buffer.byteLength(base)) });
    expect(Buffer.byteLength(cuerpo)).toBe(4096);
    const res = await pedir("POST", "/specialty-test/me/evaluate", { body: cuerpo });
    expect(res.status).toBe(200);
  });

  test("500 si falla el guardado, sin llamar a Cohere", async () => {
    const res = await pedir("POST", "/specialty-test/me/evaluate", {
      body: CUERPO("ejemplo-1"), datos: { guardadoFalla: true },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL_SERVER_ERROR" } });
    expect(llamadasCohere).toBe(0);
  });

  test("un fallo de Cohere nunca llega a la app y ningun console lleva respuestas, textos ni ids", async () => {
    const alumno = alumnoNuevo();
    respuestaCohere = async () => {
      throw new Error(`Cohere Chat error 500: secreto-de-cohere ${alumno}`);
    };
    const res = await pedir("POST", "/specialty-test/me/evaluate", {
      token: tokenDe("student", alumno), body: CUERPO("ejemplo-1"),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { reasonSource: "templates" } });
    const registrado = [...avisos.mock.calls, ...errores.mock.calls].flat().map(String).join("\n");
    expect(registrado).toBe("[specialty-test] motivo con plantillas: http");
    for (const prohibido of ["secreto-de-cohere", String(alumno), "me_encantaria", ejemplo("ejemplo-1").reasonText]) {
      expect(registrado).not.toContain(prohibido);
    }
  });
});

describe("GET /specialty-test/me/result (RS-BE-45)", () => {
  const FILA = {
    content_version: CURRENT_VERSION,
    ranking: [
      { key: "vj", specialtyId: 7, affinity: 75 },
      { key: "si", specialtyId: 6, affinity: 65 },
      { key: "ti", specialtyId: 5, affinity: 28 },
      { key: "sw", specialtyId: 1, affinity: 24 },
    ],
    is_tie: false,
    completed_at: FECHA,
  };

  test("200 con result null si no hay test terminado, y no-store", async () => {
    const res = await pedir("GET", "/specialty-test/me/result");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ result: null });
  });

  test("200 con el ultimo resultado", async () => {
    const res = await pedir("GET", "/specialty-test/me/result", { datos: { fila: FILA } });
    expect(await res.json()).toEqual({
      result: {
        version: CURRENT_VERSION,
        isCurrentVersion: true,
        completedAt: FECHA,
        tie: false,
        ranking: [
          { key: "vj", specialtyId: 7, name: "Desarrollo de Videojuegos", affinity: 75 },
          { key: "si", specialtyId: 6, name: "Sistemas de Información", affinity: 65 },
          { key: "ti", specialtyId: 5, name: "Tecnologías de la Información", affinity: 28 },
          { key: "sw", specialtyId: 1, name: "Ingeniería de Software", affinity: 24 },
        ],
      },
    });
  });

  test("404 SPECIALTY_TEST_NOT_AVAILABLE aunque haya fila guardada", async () => {
    const res = await pedir("GET", "/specialty-test/me/result", { datos: { fila: FILA, activas: [] } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: "SPECIALTY_TEST_NOT_AVAILABLE" } });
    expect(delModulo().some((q) => q.sql.includes("student_specialty_test_result"))).toBe(false);
  });

  test("500 con un ranking corrupto", async () => {
    const res = await pedir("GET", "/specialty-test/me/result", {
      datos: { fila: { ...FILA, ranking: [{ key: "vj" }] } },
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "INTERNAL_SERVER_ERROR" } });
  });
});

describe("limite de tasa en las rutas (RS-BE-46)", () => {
  test("la evaluacion 31 de la hora responde 429 y las dos GET siguen sin limite", async () => {
    const token = tokenDe("student", alumnoNuevo());
    for (let i = 1; i <= 30; i++) {
      const res = await pedir("POST", "/specialty-test/me/evaluate", { token, body: CUERPO() });
      expect(res.status).toBe(200);
    }
    const res = await pedir("POST", "/specialty-test/me/evaluate", { token, body: CUERPO() });
    expect(res.status).toBe(429);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Hiciste demasiados intentos del test. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60 },
      },
    });
    for (let i = 0; i < 31; i++) {
      expect((await pedir("GET", "/specialty-test/content", { token })).status).toBe(200);
      expect((await pedir("GET", "/specialty-test/me/result", { token })).status).toBe(200);
    }
  });

  test("el tamano va antes que el limite y el limite antes que la forma", async () => {
    const token = tokenDe("student", alumnoNuevo());
    for (let i = 0; i < 30; i++) await pedir("POST", "/specialty-test/me/evaluate", { token, body: "{}" });
    const grande = await pedir("POST", "/specialty-test/me/evaluate", { token, body: "x".repeat(5000) });
    expect(grande.status).toBe(413);
    const noJson = await pedir("POST", "/specialty-test/me/evaluate", { token, body: "{no es json" });
    expect(noJson.status).toBe(429);
  });
});

describe("registro del modulo", () => {
  test("el composition root expone las tres rutas detras de la autenticacion", async () => {
    const { specialtyTestRoutes } = await import("../../src/modules/specialty-test/index.js");
    // Hono anota una entrada por cada handler de la ruta (no-store, bodyLimit,
    // límite y controller), así que se comparan las rutas sin repetir.
    const rutas = specialtyTestRoutes.routes
      .filter((r) => r.method !== "ALL")
      .map((r) => `${r.method} ${r.path}`);
    expect([...new Set(rutas)]).toEqual(["GET /content", "POST /me/evaluate", "GET /me/result"]);
    const raiz = new Hono();
    raiz.onError(errorHandler);
    raiz.route("/specialty-test", specialtyTestRoutes);
    const res = await raiz.request("/specialty-test/content");
    expect(res.status).toBe(401);
  });

  test("src/modules/index.ts monta el modulo en /specialty-test", async () => {
    const texto = await Bun.file("src/modules/index.ts").text();
    expect(texto).toContain('import { specialtyTestRoutes } from "./specialty-test/index.js";');
    expect(texto).toContain('app.route("/specialty-test", specialtyTestRoutes);');
  });
});
```

Crear `test/HU36_jeff/specialty-test.rate-limit.test.ts`.

```ts
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  SPECIALTY_TEST_MAX_PER_HOUR,
  specialtyTestRateLimit,
} from "../../src/shared/middleware/rate-limit.js";

/**
 * RS-BE-46: `specialtyTestRateLimit`, 30 evaluaciones por alumno por hora.
 *
 * Se monta el middleware solo, detrás de un paso que pone el `studentId` como
 * lo haría `authMiddleware`. El contador vive en la memoria del módulo y bun
 * comparte el módulo entre archivos, así que cada prueba usa ids propios, lejos
 * de los de `specialty-test.routes.test.ts`.
 */

const app = new Hono<{ Variables: { studentId?: number } }>();
app.use("*", async (c, next) => {
  const id = c.req.header("X-Alumno");
  if (id) c.set("studentId", Number(id));
  await next();
});
app.post("/evaluar", specialtyTestRateLimit, (c) => c.json({ ok: true }));

const evaluar = (alumno?: number) =>
  app.request("/evaluar", { method: "POST", headers: alumno === undefined ? {} : { "X-Alumno": String(alumno) } });

describe("specialtyTestRateLimit (RS-BE-46)", () => {
  test("el tope es 30 por hora", () => {
    expect(SPECIALTY_TEST_MAX_PER_HOUR).toBe(30);
  });

  test("deja pasar 30 y responde 429 en la 31 con el mensaje y los minutos", async () => {
    const alumno = 9_000_001;
    for (let i = 1; i <= 30; i++) {
      const res = await evaluar(alumno);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(30 - i));
    }
    const res = await evaluar(alumno);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Hiciste demasiados intentos del test. Intenta de nuevo en 60 minuto(s).",
        details: { retryAfterMinutes: 60 },
      },
    });
  });

  test("cada alumno lleva su propio contador", async () => {
    for (let i = 0; i < 31; i++) await evaluar(9_000_002);
    expect((await evaluar(9_000_002)).status).toBe(429);
    expect((await evaluar(9_000_003)).status).toBe(200);
  });

  test("sin alumno en el contexto no cuenta y deja pasar", async () => {
    for (let i = 0; i < 35; i++) expect((await evaluar()).status).toBe(200);
  });

  test("no comparte el contador con el del chatbot", async () => {
    const { chatbotRateLimit } = await import("../../src/shared/middleware/rate-limit.js");
    expect(chatbotRateLimit).not.toBe(specialtyTestRateLimit);
    const texto = await Bun.file("src/shared/middleware/rate-limit.ts").text();
    expect(texto).toContain("const specialtyTestStore = new Map<number, RateLimitEntry>();");
  });
});
```

- [ ] **Paso 2: Correrlas y ver que fallan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test.routes.test.ts test/HU36_jeff/specialty-test.rate-limit.test.ts
```

**Esperado:** fallan con `SyntaxError: Export named 'SPECIALTY_TEST_MAX_PER_HOUR' not found in module '…/src/shared/middleware/rate-limit.ts'` y `error: Cannot find module '../../src/modules/specialty-test/specialty-test.controller.js'`, `0 pass` y `2 fail`.

- [ ] **Paso 3: Sumar el límite de tasa**

Agregar al final de `src/shared/middleware/rate-limit.ts`, tras una línea en blanco, este bloque. Reusa `RateLimitEntry` y `WINDOW_MS`, que ya están en el archivo.

```ts
// ── POST /specialty-test/me/evaluate (RS-BE-46) ─────────────────────────────
//
// Mismo patrón que `chatbotRateLimit`: contador por alumno del token, en la
// memoria de la instancia, con el mismo límite que ya documentan los contadores
// de arriba (no es un límite distribuido). Cuenta cada evaluación, final o no,
// porque cualquiera puede ser final (un cliente puede repetir el cuerpo del
// resultado) y cada evaluación final llama a Cohere con la misma
// `COHERE_API_KEY` del chatbot: el tope real es de 30 llamadas por alumno por
// hora. Las dos rutas GET del módulo no llevan límite.

const specialtyTestStore = new Map<number, RateLimitEntry>();
export const SPECIALTY_TEST_MAX_PER_HOUR = 30;

export async function specialtyTestRateLimit(c: Context, next: Next) {
  const studentId = c.get("studentId") as number | undefined;
  if (!studentId) return next();

  const now = Date.now();
  const entry = specialtyTestStore.get(studentId);

  if (!entry || now > entry.resetAt) {
    specialtyTestStore.set(studentId, { count: 1, resetAt: now + WINDOW_MS });
    c.header("X-RateLimit-Remaining", String(SPECIALTY_TEST_MAX_PER_HOUR - 1));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + WINDOW_MS) / 1000)));
    return next();
  }

  if (entry.count >= SPECIALTY_TEST_MAX_PER_HOUR) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60000);
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Hiciste demasiados intentos del test. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft },
      },
    }, 429);
  }

  entry.count++;
  c.header("X-RateLimit-Remaining", String(SPECIALTY_TEST_MAX_PER_HOUR - entry.count));
  c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
  return next();
}
```

- [ ] **Paso 4: Escribir el controller**

Crear `src/modules/specialty-test/specialty-test.controller.ts`.

```ts
import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { evaluateBodySchema } from "./specialty-test.schemas.js";
import type { SpecialtyTestService } from "./specialty-test.service.js";

/**
 * Adapta HTTP al test de especialidad (RS-BE-38, RS-BE-39 y RS-BE-45). No
 * decide nada: saca al alumno del token, valida la forma del cuerpo con Zod y
 * le pasa todo al service. Ningún handler lee un alumno del cuerpo, de la ruta
 * ni de la query; un `studentId` en el cuerpo se descarta con las demás claves
 * desconocidas de la raíz.
 */
export class SpecialtyTestController {
  constructor(readonly service: SpecialtyTestService) {}

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

  async getContent(c: Context): Promise<Response> {
    return c.json(await this.service.getContent(this.requireStudentId(c)));
  }

  async evaluate(c: Context): Promise<Response> {
    const studentId = this.requireStudentId(c);
    const body = await validateJson(c, evaluateBodySchema);
    return c.json(await this.service.evaluate(studentId, body));
  }

  async getResult(c: Context): Promise<Response> {
    return c.json(await this.service.getResult(this.requireStudentId(c)));
  }
}
```

- [ ] **Paso 5: Escribir las rutas**

Crear `src/modules/specialty-test/specialty-test.routes.ts`. En `POST /me/evaluate`, `noStore` va primero para que también lo lleven el 413 y el 429, `bodyLimit` lee el cuerpo entero antes de seguir y su `onError` lanza el `HttpError` del 413, y el límite va después del tamaño.

```ts
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import { specialtyTestRateLimit } from "../../shared/middleware/rate-limit.js";
import type { SpecialtyTestController } from "./specialty-test.controller.js";

/** Tope del cuerpo de la evaluación. Un cuerpo legítimo mide menos de 1 KiB. */
export const EVALUATE_MAX_BYTES = 4 * 1024;

/** El resultado y la evaluación son del alumno: no se guardan en cachés intermedias. */
const noStore: MiddlewareHandler = async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
};

/**
 * Test de especialidad (RS-BE-46).
 *
 * Todo el módulo lleva `authMiddleware` y `requireRole(...STUDENT_ROLES)`:
 * un token docente recibe 403 y el alumno sale solo del token.
 *
 * ORDEN en `POST /me/evaluate`, que es el de RS-BE-39: autorización (los dos
 * `use` de arriba), `no-store` (antes que nada que pueda cortar, para que
 * también lo lleven el 413 y el 429), tamaño del cuerpo (413), límite de tasa
 * (429) y recién después el handler, que valida la forma con Zod (400).
 * `bodyLimit` lee el cuerpo entero antes de seguir, así que el contador no se
 * gasta con un cuerpo de más de 4 KiB. Es el primer 413 de la API, y su
 * `onError` lanza un `HttpError` para que la respuesta tenga la forma de
 * error de siempre.
 */
export const createSpecialtyTestRoutes = (controller: SpecialtyTestController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/content", (c) => controller.getContent(c));
  app.post(
    "/me/evaluate",
    noStore,
    bodyLimit({
      maxSize: EVALUATE_MAX_BYTES,
      onError: () => {
        throw new HttpError(413, "La petición es demasiado grande.", "PAYLOAD_TOO_LARGE");
      },
    }),
    specialtyTestRateLimit,
    (c) => controller.evaluate(c),
  );
  app.get("/me/result", noStore, (c) => controller.getResult(c));

  return app;
};
```

- [ ] **Paso 6: Escribir el composition root y montar el módulo**

Crear `src/modules/specialty-test/index.ts`.

```ts
import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { cohereClient } from "../../services/cohere.client.js";
import { CONTENT_REGISTRY } from "./content/index.js";
import { SpecialtyTestController } from "./specialty-test.controller.js";
import { SpecialtyTestRepository } from "./specialty-test.repository.js";
import { createSpecialtyTestRoutes } from "./specialty-test.routes.js";
import { SpecialtyTestService } from "./specialty-test.service.js";

const specialtyTestRepository = new SpecialtyTestRepository(db);
const specialtyTestService = new SpecialtyTestService(
  specialtyTestRepository,
  eventBus,
  cohereClient,
  CONTENT_REGISTRY,
);
const specialtyTestController = new SpecialtyTestController(specialtyTestService);

export const specialtyTestRoutes = createSpecialtyTestRoutes(specialtyTestController);

export { CONTENT_BY_VERSION, CONTENT_REGISTRY, CURRENT_VERSION } from "./content/index.js";
export { SpecialtyTestController } from "./specialty-test.controller.js";
export { SpecialtyTestRepository } from "./specialty-test.repository.js";
export { SpecialtyTestService } from "./specialty-test.service.js";
export { createSpecialtyTestRoutes } from "./specialty-test.routes.js";
```

En `src/modules/index.ts`, agregar debajo de `import { timeBlocksRoutes } from "./time-blocks/index.js";` la línea

```ts
import { specialtyTestRoutes } from "./specialty-test/index.js";
```

y debajo de `  app.route("/time-blocks", timeBlocksRoutes);` la línea

```ts
  app.route("/specialty-test", specialtyTestRoutes);
```

- [ ] **Paso 7: Correr las pruebas y ver que pasan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/specialty-test.routes.test.ts test/HU36_jeff/specialty-test.rate-limit.test.ts
```

**Esperado:** `34 pass`, `0 fail`, `306 expect() calls` (29 de las rutas y 5 del límite).

- [ ] **Paso 8: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2435 pass, 48 skip, 0 fail, 9662 `expect()` y 2483 pruebas en 141 archivos (+34 pruebas y +2 archivos).

- [ ] **Paso 9: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/shared/middleware/rate-limit.ts src/modules/specialty-test/specialty-test.controller.ts src/modules/specialty-test/specialty-test.routes.ts src/modules/specialty-test/index.ts src/modules/index.ts test/HU36_jeff/specialty-test.routes.test.ts test/HU36_jeff/specialty-test.rate-limit.test.ts && git commit -m "feat(specialty-test): rutas con autorización de alumno, 413, límite de 30 por hora y no-store (RS-BE-39, RS-BE-46)" -m "Las tres rutas de /specialty-test llevan authMiddleware y los roles de alumno. La evaluación corta primero por tamaño con un 413 de la forma de siempre, después por el límite de 30 por hora y recién entonces valida con Zod. La evaluación y el resultado responden con Cache-Control: no-store."
```

---

### Tarea 9: Prueba guardia del chatbot

**Requisitos:** RS-BE-47 y decisión abierta 12. Ni `chatbot.repository.ts` ni `chatbot.service.ts`, ni ningún otro archivo de `src/modules/chatbot/`, nombran `student_specialty_test_result` ni importan el módulo `specialty-test`. La prueba solo lee el código del chatbot, sin tocarlo.

**Archivos:**
- Prueba: `test/HU36_jeff/chatbot-isolation-specialty-test.test.ts`

**Interfaces:**
- Consume: los `.ts` de `src/modules/chatbot/` por `Bun.Glob`, con el mismo patrón de `test/HU34_jeff/chatbot-isolation.test.ts` (RS-BE-28), que no cambia.
- Produce: nada que otra tarea use.

- [ ] **Paso 1: Escribir la prueba guardia**

Crear `test/HU36_jeff/chatbot-isolation-specialty-test.test.ts`. Es un guardia, así que pasa desde el primer día. Para ver que muerde, su último caso aplica las mismas expresiones a un texto sintético con la tabla y los dos imports prohibidos.

```ts
import { describe, expect, test } from "bun:test";

/**
 * RS-BE-47: el chatbot no lee el resultado del test de especialidad.
 *
 * El resultado dice qué le gusta al alumno y no sale hacia el proveedor del
 * chatbot (Cohere) sin una decisión aparte. Esta prueba fija que NINGÚN archivo
 * del módulo del chatbot nombra la tabla ni importa el módulo
 * `specialty-test`, igual que el guardia del récord
 * (`test/HU34_jeff/chatbot-isolation.test.ts`, RS-BE-28). Es un guardia: pasa
 * desde el primer día y solo lee el código del chatbot, sin tocarlo.
 *
 * Recorre TODO `*.ts` bajo `src/modules/chatbot/` con `Bun.Glob`, así que un
 * archivo nuevo del chatbot entra solo.
 */

const DIRECTORIO = "src/modules/chatbot";

const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}
ARCHIVOS.sort();

// El nombre SQL y el identificador de schema.ts: con el constructor de
// consultas de Drizzle se puede leer una tabla sin escribir su nombre SQL.
const PROHIBIDOS = ["student_specialty_test_result", "studentSpecialtyTestResult"];

describe("RS-BE-47: el chatbot no ve el resultado del test de especialidad", () => {
  test(`${DIRECTORIO} tiene al menos un archivo .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
    expect(ARCHIVOS).toContain(`${DIRECTORIO}/chatbot.repository.ts`);
    expect(ARCHIVOS).toContain(`${DIRECTORIO}/chatbot.service.ts`);
  });

  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra la tabla del resultado`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });

    test(`${ruta} no importa el modulo specialty-test`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto).not.toMatch(/from\s+["'][^"']*specialty-test[^"']*["']/);
      expect(texto).not.toMatch(/import\s*\(\s*["'][^"']*specialty-test/);
      expect(texto).not.toMatch(/require\s*\(\s*["'][^"']*specialty-test/);
      expect(texto).not.toMatch(/import\s+["'][^"']*specialty-test/);
    });
  }

  test("el guardia muerde: detecta la tabla y los imports en un texto sintetico", () => {
    const sintetico = [
      'import { SpecialtyTestService } from "../specialty-test/index.js";',
      'const m = await import("../specialty-test/specialty-test.repository.js");',
      "select * from student_specialty_test_result",
    ].join("\n");
    expect(PROHIBIDOS.some((p) => sintetico.includes(p))).toBe(true);
    expect(sintetico).toMatch(/from\s+["'][^"']*specialty-test[^"']*["']/);
    expect(sintetico).toMatch(/import\s*\(\s*["'][^"']*specialty-test/);
  });
});
```

- [ ] **Paso 2: Correrla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/chatbot-isolation-specialty-test.test.ts
```

**Esperado:** `24 pass`, `0 fail`, `83 expect() calls` (dos pruebas por cada uno de los 11 archivos del chatbot, la que exige que haya archivos y la sintética). Si el chatbot suma o quita archivos, la cifra cambia de a dos y la prueba sigue en verde.

- [ ] **Paso 3: Suite**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** 2459 pass, 48 skip, 0 fail, 9745 `expect()` y 2507 pruebas en 142 archivos (+24 pruebas y +1 archivo).

- [ ] **Paso 4: Commit**

```bash
cd "${REPO:?}" && git status --short && git add test/HU36_jeff/chatbot-isolation-specialty-test.test.ts && git commit -m "test(chatbot): guardia de que el chatbot no lee el resultado del test de especialidad (RS-BE-47)" -m "Recorre todo src/modules/chatbot con Bun.Glob y falla si un archivo nombra student_specialty_test_result o importa el módulo specialty-test, igual que el guardia del récord. Solo lee el código del chatbot."
```

---

### Tarea 10: Solo las especialidades oficiales (BR-AP-07)

**Requisitos:** BR-AP-07 de la enmienda. `findSpecialtiesByCareerId` y `specialtyBelongsToCareer` exigen `is_active = true`, así que `GET /academic-profile/specialties` trae solo las activas, con `careerId` y sin él, y `PUT /academic-profile/me/specialties` con una inactiva responde `404 SPECIALTY_NOT_FOUND` con el mensaje de siempre. `display_order` se numera después del filtro, `is_active` sigue en la respuesta y los datos de `specialty` no cambian.

**Archivos:**
- Modificar: `src/modules/academic-profile/academic-profile.repository.ts:142-159` (`findSpecialtiesByCareerId`) y `:216-226` (`specialtyBelongsToCareer`)
- Prueba: `test/HU36_jeff/academic-profile-official.test.ts`

**Interfaces:**
- Consume: `AcademicProfileRepository` y `AcademicProfileService` tal como están.
- Produce: las mismas firmas, con el filtro. `GET /academic-profile/me`, el login y la malla no cambian (decisión abierta 13).

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/academic-profile-official.test.ts`. La base falsa interpreta el `and is_active = true` del SQL, así que la prueba mide el efecto de la cláusula y no solo su texto.

```ts
import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { EventBus } from "../../src/events/index.js";
import { AcademicProfileRepository } from "../../src/modules/academic-profile/academic-profile.repository.js";
import { AcademicProfileService } from "../../src/modules/academic-profile/academic-profile.service.js";

/**
 * BR-AP-07 (enmienda aprobada con `specialty-test.spec.md`): solo se muestran
 * y se eligen las especialidades con `is_active = true`.
 *
 * El repositorio y el service son los reales; la base es una tabla `specialty`
 * de mentira que interpreta el `and is_active = true` del SQL, así que la
 * prueba mide el efecto de la cláusula y no solo su texto. No toca los datos:
 * el filtro no hace UPDATE de `is_active` (decisión 6).
 *
 * Datos INVENTADOS: el alumno sintético 20230001 (`app_user.id` 1,
 * `student.id` 42) es de la carrera 1. «Ciencia de Datos» es una especialidad
 * antigua, inactiva.
 */

type Fila = { id: number; career_id: number; name: string; description: string | null; is_active: boolean };

const ESPECIALIDADES: Fila[] = [
  { id: 1, career_id: 1, name: "Ingeniería de Software", description: null, is_active: true },
  { id: 2, career_id: 1, name: "Ciencia de Datos", description: null, is_active: false },
  { id: 5, career_id: 1, name: "Tecnologías de la Información", description: null, is_active: true },
  { id: 9, career_id: 2, name: "Otra carrera", description: null, is_active: true },
];

const PERFIL = {
  id: 1, student_id: 42, code: "20230001", full_name: "Garcia Lopez, Maria",
  institutional_email: "20230001@aloe.ulima.edu.pe", current_level: 1, specialty_setup_completed: false,
  career_id: 1, career_code: "ING-SIS", career_name: "Ingeniería de Sistemas", faculty: "Ingeniería",
  curriculum_id: 1, curriculum_name: "2026-1",
};

const armar = () => {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const ejecutar = async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    consultas.push({ sql, params });
    const t = sql.toLowerCase().replace(/\s+/g, " ").trim();
    const soloActivas = t.includes("and is_active = true");
    const filtrar = (f: (e: Fila) => boolean) =>
      ESPECIALIDADES.filter((e) => f(e) && (!soloActivas || e.is_active));

    if (t.includes("from app_user")) return [PERFIL];
    if (t.startsWith("select career_id from student")) return [{ career_id: 1 }];
    if (t.includes("from specialty where career_id = $1")) {
      return filtrar((e) => e.career_id === params[0]).sort((a, b) => a.name.localeCompare(b.name));
    }
    if (t.includes("from specialty where id = $1 and career_id = $2")) {
      return filtrar((e) => e.id === params[0] && e.career_id === params[1]).map(() => ({ "?column?": 1 }));
    }
    if (t.includes("from specialty where id = $1")) {
      return filtrar((e) => e.id === params[0]).map(() => ({ "?column?": 1 }));
    }
    return [];
  };
  const database = {
    execute: ejecutar,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
  };
  const repository = new AcademicProfileRepository(database as never);
  return { repository, service: new AcademicProfileService(repository, new EventBus()), consultas };
};

describe("BR-AP-07: listado de especialidades", () => {
  test("con careerId trae solo las activas, con display_order despues del filtro e is_active true", async () => {
    const { service, consultas } = armar();
    const { specialties } = await service.getSpecialties(1, 1);
    expect(specialties.map((s) => [s.id, s.name, s.is_active, s.display_order])).toEqual([
      [1, "Ingeniería de Software", true, 1],
      [5, "Tecnologías de la Información", true, 2],
    ]);
    expect(consultas.at(-1)!.sql.toLowerCase().replace(/\s+/g, " ")).toContain(
      "where career_id = $1 and is_active = true order by name",
    );
  });

  test("sin careerId pasa por la carrera del alumno y trae las mismas", async () => {
    const { service } = armar();
    const { specialties } = await service.getSpecialties(1);
    expect(specialties.map((s) => s.id)).toEqual([1, 5]);
  });
});

describe("BR-AP-07: eleccion de especialidades", () => {
  test("specialtyBelongsToCareer exige is_active = true", async () => {
    const { repository, consultas } = armar();
    expect(await repository.specialtyBelongsToCareer(2, 1)).toBe(false);
    expect(await repository.specialtyBelongsToCareer(1, 1)).toBe(true);
    expect(consultas[0]!.sql.toLowerCase().replace(/\s+/g, " ")).toContain(
      "where id = $1 and career_id = $2 and is_active = true",
    );
  });

  test("elegir una inactiva como principal o de interes responde 404 SPECIALTY_NOT_FOUND", async () => {
    for (const cuerpo of [
      { primarySpecialtyId: 2, interestSpecialtyIds: [] },
      { primarySpecialtyId: 1, interestSpecialtyIds: [2] },
    ]) {
      const { service, consultas } = armar();
      await expect(service.updateSpecialties(1, cuerpo)).rejects.toMatchObject({
        statusCode: 404,
        code: "SPECIALTY_NOT_FOUND",
        message: "Especialidad no encontrada para la carrera del estudiante.",
      });
      expect(consultas.some((q) => q.sql.toLowerCase().includes("student_specialty"))).toBe(false);
    }
  });

  test("las activas de la carrera se siguen pudiendo elegir", async () => {
    const { service } = armar();
    await expect(service.updateSpecialties(1, { primarySpecialtyId: 1, interestSpecialtyIds: [5] })).resolves.toMatchObject({
      message: "Specialties updated",
    });
  });

  test("el filtro no escribe en specialty", async () => {
    const { service, consultas } = armar();
    await service.getSpecialties(1, 1);
    await service.updateSpecialties(1, { primarySpecialtyId: 1, interestSpecialtyIds: [] });
    expect(consultas.some((q) => /update\s+specialty\b/i.test(q.sql))).toBe(false);
  });
});
```

- [ ] **Paso 2: Correrla y ver que falla**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/academic-profile-official.test.ts
```

**Esperado:** `2 pass` y `4 fail`. Fallan las dos del listado (aparece «Ciencia de Datos»), la de `specialtyBelongsToCareer` y la de elegir una inactiva; pasan la de las activas y la que exige que el filtro no escriba en `specialty`.

- [ ] **Paso 3: Implementar el filtro**

En `src/modules/academic-profile/academic-profile.repository.ts`, dentro de `findSpecialtiesByCareerId`, reemplazar

```ts
      select id, career_id, name, description, is_active
      from specialty
      where career_id = ${careerId}
      order by name
```

por

```ts
      select id, career_id, name, description, is_active
      from specialty
      where career_id = ${careerId}
        and is_active = true
      order by name
```

y dentro de `specialtyBelongsToCareer`, reemplazar

```ts
      where id = ${specialtyId}
        and career_id = ${careerId}
      limit 1
```

por

```ts
      where id = ${specialtyId}
        and career_id = ${careerId}
        and is_active = true
      limit 1
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/academic-profile-official.test.ts test/HU05_mel/especialidades.cajablanca.test.ts
```

**Esperado:** `16 pass`, `0 fail`, `32 expect() calls` (6 de la prueba nueva y las 10 de `HU05_mel`, que no cambian).

- [ ] **Paso 5: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2465 pass, 48 skip, 0 fail, 9757 `expect()` y 2513 pruebas en 143 archivos (+6 pruebas y +1 archivo).

- [ ] **Paso 6: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/academic-profile/academic-profile.repository.ts test/HU36_jeff/academic-profile-official.test.ts && git commit -m "feat(academic-profile): solo las especialidades oficiales en el listado y en la elección (BR-AP-07)" -m "findSpecialtiesByCareerId y specialtyBelongsToCareer exigen is_active = true, así que el listado trae solo los cuatro diplomas oficiales y elegir una especialidad antigua responde 404 SPECIALTY_NOT_FOUND con el mensaje de siempre. Los datos de specialty no cambian."
```

---

### Tarea 11: Reemplazo atómico de especialidades (BR-AP-08)

**Requisitos:** BR-AP-08 de la enmienda. El desactivado, los `upsert` y la marca de `specialty_setup_completed` corren en una sola transacción, que vive en un método nuevo del repository (`AGENTS.md` no deja que el service importe `db`). El service sigue validando cada id antes y sigue traduciendo el 23505 a `409 DUPLICATE_PRIMARY`.

**Archivos:**
- Modificar: `src/modules/academic-profile/academic-profile.repository.ts` (método nuevo antes de `markSpecialtySetupCompleted`)
- Modificar: `src/modules/academic-profile/academic-profile.service.ts:72-86` (el bloque `try` de `updateSpecialties`)
- Modificar: `test/HU05_mel/especialidades.cajablanca.test.ts` (el doble del repositorio suma `replaceStudentSpecialties`)
- Prueba: `test/HU36_jeff/academic-profile-atomic.test.ts`

**Interfaces:**
- Consume: `deactivateAllStudentSpecialties`, `upsertStudentSpecialty` y `markSpecialtySetupCompleted`, que no cambian, y `this.database.transaction`, como `academic-record.repository.ts:110`.
- Produce: `replaceStudentSpecialties(studentId: number, primarySpecialtyId: number | null, interestSpecialtyIds: readonly number[]): Promise<void>`, que usan «Elegir como principal» y los corazones del resultado del test por `PUT /academic-profile/me/specialties`.

La prueba de caja blanca de Melissa (`test/HU05_mel/especialidades.cajablanca.test.ts`) arma un repositorio falso con los tres métodos de escritura. Con el service nuevo, que llama solo a `replaceStudentSpecialties`, seis de sus diez casos fallan (C5, C6, C7, C7b, C8 y C9), porque el doble no tiene ese método. El cambio suma al doble un `replaceStudentSpecialties` que repite el orden del repositorio real sobre los mismos espías, así que cada caso y cada override siguen midiendo lo mismo, y no toca ninguna aserción ni ningún caso. `stryker.mel.conf.json` muta otra prueba (`HU25_mel`), así que la mutación de Melissa no cambia.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU36_jeff/academic-profile-atomic.test.ts`. La base falsa es transaccional, porque `transaction(fn)` corre `fn` sobre una copia del estado que solo reemplaza al original si `fn` termina bien, y una escritura fuera de la transacción queda anotada.

```ts
import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { EventBus } from "../../src/events/index.js";
import { AcademicProfileRepository } from "../../src/modules/academic-profile/academic-profile.repository.js";
import { AcademicProfileService } from "../../src/modules/academic-profile/academic-profile.service.js";

/**
 * BR-AP-08 (enmienda aprobada con `specialty-test.spec.md`): el reemplazo de
 * especialidades corre en una sola transacción.
 *
 * La base es de mentira pero transaccional: guarda `student_specialty` y el
 * flag de `student` en memoria, y `transaction(fn)` corre `fn` sobre una copia
 * que solo reemplaza al estado si `fn` termina bien, como un COMMIT; si lanza,
 * la copia se descarta, como un ROLLBACK. Una escritura hecha fuera de la
 * transacción iría directo al estado y la prueba la vería.
 *
 * Datos INVENTADOS: el alumno sintético 20230001 (`app_user.id` 1,
 * `student.id` 42), carrera 1, con Software (1) como principal y TI (5) como
 * interés antes del cambio.
 */

type Seleccion = { specialty_id: number; selection_type: "primary" | "interest"; is_active: boolean };
type Estado = { seleccion: Seleccion[]; setupCompleto: boolean };

const PERFIL = {
  id: 1, student_id: 42, code: "20230001", full_name: "Garcia Lopez, Maria",
  institutional_email: "20230001@aloe.ulima.edu.pe", current_level: 1, specialty_setup_completed: false,
  career_id: 1, career_code: "ING-SIS", career_name: "Ingeniería de Sistemas", faculty: "Ingeniería",
  curriculum_id: 1, curriculum_name: "2026-1",
};

const inicial = (): Estado => ({
  seleccion: [
    { specialty_id: 1, selection_type: "primary", is_active: true },
    { specialty_id: 5, selection_type: "interest", is_active: true },
  ],
  setupCompleto: false,
});

const copiar = (e: Estado): Estado => ({ seleccion: e.seleccion.map((s) => ({ ...s })), setupCompleto: e.setupCompleto });

const armar = (opciones: { fallaAlInsertar?: number; codigoDeFalla?: string } = {}) => {
  let estado = inicial();
  const fuera: string[] = [];
  let transacciones = 0;

  const ejecutarSobre = (e: Estado, enTransaccion: boolean) => async (q: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(q);
    const t = sql.toLowerCase().replace(/\s+/g, " ").trim();
    const escribe = t.startsWith("update") || t.startsWith("insert");
    if (escribe && !enTransaccion) fuera.push(t);

    if (t.includes("from app_user")) return [PERFIL];
    if (t.includes("from specialty")) return [{ "?column?": 1 }];
    if (t.startsWith("update student_specialty set is_active = false")) {
      for (const s of e.seleccion) s.is_active = false;
      return [];
    }
    if (t.startsWith("insert into student_specialty")) {
      const [, id, tipo] = params as [number, number, "primary" | "interest"];
      if (id === opciones.fallaAlInsertar) {
        throw Object.assign(new Error("fallo a mitad"), { code: opciones.codigoDeFalla ?? "XX000" });
      }
      const previa = e.seleccion.find((s) => s.specialty_id === id);
      if (previa) Object.assign(previa, { selection_type: tipo, is_active: true });
      else e.seleccion.push({ specialty_id: id, selection_type: tipo, is_active: true });
      return [];
    }
    if (t.startsWith("update student set specialty_setup_completed")) {
      e.setupCompleto = true;
      return [];
    }
    if (t.includes("from student_specialty")) {
      return e.seleccion.filter((s) => s.is_active).map((s) => ({ specialty_id: s.specialty_id, selection_type: s.selection_type }));
    }
    return [];
  };

  const database = {
    execute: (q: SQL) => ejecutarSobre(estado, false)(q),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transacciones++;
      const borrador = copiar(estado);
      const resultado = await fn({ execute: ejecutarSobre(borrador, true) });
      estado = borrador;
      return resultado;
    },
  };
  const repository = new AcademicProfileRepository(database as never);
  return {
    service: new AcademicProfileService(repository, new EventBus()),
    repository,
    estado: () => estado,
    fuera,
    transacciones: () => transacciones,
  };
};

describe("BR-AP-08: reemplazo atomico de especialidades", () => {
  test("un fallo a mitad del reemplazo deja intactas las especialidades previas", async () => {
    const { service, estado, fuera } = armar({ fallaAlInsertar: 7 });
    await expect(
      service.updateSpecialties(1, { primarySpecialtyId: 6, interestSpecialtyIds: [7] }),
    ).rejects.toThrow("fallo a mitad");
    expect(estado()).toEqual(inicial());
    expect(fuera).toEqual([]);
  });

  test("el 23505 dentro de la transaccion sigue saliendo como 409 DUPLICATE_PRIMARY, sin cambios", async () => {
    const { service, estado } = armar({ fallaAlInsertar: 6, codigoDeFalla: "23505" });
    await expect(
      service.updateSpecialties(1, { primarySpecialtyId: 6, interestSpecialtyIds: [] }),
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_PRIMARY" });
    expect(estado()).toEqual(inicial());
  });

  test("sin fallos, todo el reemplazo entra en una sola transaccion", async () => {
    const { service, estado, fuera, transacciones } = armar();
    const r = await service.updateSpecialties(1, { primarySpecialtyId: 6, interestSpecialtyIds: [7, 1] });
    expect(transacciones()).toBe(1);
    expect(fuera).toEqual([]);
    expect(estado()).toEqual({
      seleccion: [
        { specialty_id: 1, selection_type: "interest", is_active: true },
        { specialty_id: 5, selection_type: "interest", is_active: false },
        { specialty_id: 6, selection_type: "primary", is_active: true },
        { specialty_id: 7, selection_type: "interest", is_active: true },
      ],
      setupCompleto: true,
    });
    expect(r).toEqual({
      message: "Specialties updated",
      setupComplete: true,
      specialties: [
        { specialtyId: 1, selectionType: "interest" },
        { specialtyId: 6, selectionType: "primary" },
        { specialtyId: 7, selectionType: "interest" },
      ],
    });
  });

  test("replaceStudentSpecialties corre las cuatro escrituras en orden sobre la transaccion", async () => {
    const sentencias: string[] = [];
    const tx = {
      execute: async (q: SQL) => {
        sentencias.push(new PgDialect().sqlToQuery(q).sql.toLowerCase().replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" "));
        return [];
      },
    };
    const database = {
      execute: async () => {
        throw new Error("escritura fuera de la transaccion");
      },
      transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    };
    await new AcademicProfileRepository(database as never).replaceStudentSpecialties(42, 6, [7]);
    expect(sentencias).toEqual([
      "update student_specialty set",
      "insert into student_specialty",
      "insert into student_specialty",
      "update student set",
    ]);
  });
});
```

- [ ] **Paso 2: Adaptar el doble de la prueba de Melissa**

En `test/HU05_mel/especialidades.cajablanca.test.ts`, dentro de `makeRepo`, reemplazar la línea

```ts
    currentSpecialtySelection: async () => [], // lectura final para el response; irrelevante para los caminos, devuelve []
```

por

```ts
    currentSpecialtySelection: async () => [], // lectura final para el response; irrelevante para los caminos, devuelve []
    // BR-AP-08: el service ya no llama a los tres métodos de escritura uno por uno, sino a este,
    // que en el repositorio real los corre en una transacción. El doble repite ese orden sobre los
    // espías de arriba, así que cada camino y cada override siguen midiendo lo mismo.
    replaceStudentSpecialties: async (studentId: number, primary: number | null, interests: readonly number[]) => {
      await repo.deactivateAllStudentSpecialties(studentId);
      if (primary != null) await repo.upsertStudentSpecialty(studentId, primary, "primary");
      for (const specialtyId of interests) await repo.upsertStudentSpecialty(studentId, specialtyId, "interest");
      await repo.markSpecialtySetupCompleted(studentId);
    },
```

- [ ] **Paso 3: Correr las dos y ver que falla la nueva**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/academic-profile-atomic.test.ts test/HU05_mel/especialidades.cajablanca.test.ts
```

**Esperado:** `10 pass` y `4 fail`. Las diez de Melissa siguen en verde con el service de hoy, y fallan las cuatro de la prueba nueva (dos por el estado que cambia tras el fallo, una porque no se abre ninguna transacción y una con un `TypeError`, porque `replaceStudentSpecialties` todavía no existe).

- [ ] **Paso 4: Implementar la transacción en el repository**

En `src/modules/academic-profile/academic-profile.repository.ts`, insertar este método, seguido de una línea en blanco, justo antes de `  async markSpecialtySetupCompleted(studentId: number): Promise<void> {`.

```ts
  /**
   * BR-AP-08: el reemplazo entero en una sola transacción. Desactiva las
   * especialidades del alumno, inserta o reactiva la principal y las de
   * interés, y marca `specialty_setup_completed`. Si algo falla, la base
   * conserva el estado previo y el error sube tal cual, para que el service
   * siga traduciendo el 23505 a `409 DUPLICATE_PRIMARY`. Abre la transacción
   * como `academic-record.repository.ts:110`, porque el service no puede
   * importar `db` (AGENTS.md), y reusa los métodos de abajo sobre `tx`.
   */
  async replaceStudentSpecialties(
    studentId: number,
    primarySpecialtyId: number | null,
    interestSpecialtyIds: readonly number[],
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const enLaTransaccion = new AcademicProfileRepository(tx as unknown as typeof db);
      await enLaTransaccion.deactivateAllStudentSpecialties(studentId);
      if (primarySpecialtyId != null) {
        await enLaTransaccion.upsertStudentSpecialty(studentId, primarySpecialtyId, "primary");
      }
      for (const specialtyId of interestSpecialtyIds) {
        await enLaTransaccion.upsertStudentSpecialty(studentId, specialtyId, "interest");
      }
      await enLaTransaccion.markSpecialtySetupCompleted(studentId);
    });
  }
```

- [ ] **Paso 5: Hacer que el service la use**

En `src/modules/academic-profile/academic-profile.service.ts`, reemplazar

```ts
    try {
      await this.repository.deactivateAllStudentSpecialties(profile.studentId);
      if (primarySpecialtyId != null) {
        await this.repository.upsertStudentSpecialty(profile.studentId, primarySpecialtyId, "primary");
      }
      for (const specialtyId of interestSpecialtyIds) {
        await this.repository.upsertStudentSpecialty(profile.studentId, specialtyId, "interest");
      }
      await this.repository.markSpecialtySetupCompleted(profile.studentId);
    } catch (error) {
```

por

```ts
    // BR-AP-08: todo el reemplazo en una sola transacción del repository.
    try {
      await this.repository.replaceStudentSpecialties(
        profile.studentId,
        primarySpecialtyId,
        interestSpecialtyIds,
      );
    } catch (error) {
```

- [ ] **Paso 6: Correr las pruebas y ver que pasan**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test test/HU36_jeff/academic-profile-atomic.test.ts test/HU05_mel/especialidades.cajablanca.test.ts test/HU36_jeff/academic-profile-official.test.ts
```

**Esperado:** `20 pass`, `0 fail`, `42 expect() calls` (4 de la atómica, 10 de Melissa y 6 de la oficial).

- [ ] **Paso 7: Build y suite**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** `tsc` sin errores y la suite con 2469 pass, 48 skip, 0 fail, 9767 `expect()` y 2517 pruebas en 144 archivos (+4 pruebas y +1 archivo).

- [ ] **Paso 8: Commit**

```bash
cd "${REPO:?}" && git status --short && git add src/modules/academic-profile/academic-profile.repository.ts src/modules/academic-profile/academic-profile.service.ts test/HU05_mel/especialidades.cajablanca.test.ts test/HU36_jeff/academic-profile-atomic.test.ts && git commit -m "fix(academic-profile): el reemplazo de especialidades corre en una sola transacción (BR-AP-08)" -m "replaceStudentSpecialties abre la transacción en el repository y reusa los tres métodos de escritura sobre tx, así que un fallo a mitad deja intactas las especialidades previas. El service sigue validando cada id antes y traduciendo el 23505 a 409 DUPLICATE_PRIMARY. El doble de la caja blanca de HU05 suma el método nuevo sobre sus mismos espías, sin tocar ningún caso."
```

---

### Tarea 12: Generador del contenido y documento de revisión en el repo

**Requisitos:** decisión abierta 15 y la autoría de RS-BE-37. `generar.py` pasa a `scripts/specialty-test/generar.py`, escribe el JSON en `src/modules/specialty-test/content/` y el documento legible en `docs/specialty-test/contenido-<versión>.md`, y `extraer-lucide.py` y `lucide-nombres.txt` van a su lado. La verificación antes del merge pide que el generador termine sin errores de validación, íconos incluidos, y que vuelva a escribir igual el `2026-09-25.4.json` del registro.

**Archivos:**
- Crear: `scripts/specialty-test/generar.py` (copia de `$FUENTE/generar.py` con seis reemplazos)
- Crear: `scripts/specialty-test/extraer-lucide.py` y `scripts/specialty-test/lucide-nombres.txt` (copias sin cambios)
- Crear: `docs/specialty-test/contenido-2026-09-25.4.md` (lo escribe el generador)

**Interfaces:**
- Consume (Tarea 1): `src/modules/specialty-test/content/2026-09-25.4.json`, que el generador tiene que reproducir byte a byte.
- Produce: el camino para crear una versión nueva, que es subir `VERSION` en `generar.py`, generar, revisar y registrar el archivo nuevo en `content/index.ts`. El generador se niega a cambiar una versión ya publicada.

- [ ] **Paso 1: Copiar los tres archivos**

```bash
cd "${REPO:?}" && mkdir -p scripts/specialty-test && cp "${FUENTE:?}/generar.py" "${FUENTE:?}/extraer-lucide.py" "${FUENTE:?}/lucide-nombres.txt" scripts/specialty-test/ && grep -cE '[0-9]{8}|@|/Users/|/private/' scripts/specialty-test/generar.py scripts/specialty-test/extraer-lucide.py scripts/specialty-test/lucide-nombres.txt
```

**Esperado:** las tres líneas terminan en `:0`. `extraer-lucide.py` lee `lucide_icons.dart` desde `~/.pub-cache` con `Path.home()`, sin ninguna ruta de esta máquina, y se vuelve a correr solo si la app cambia la versión de `lucide_icons_flutter`.

- [ ] **Paso 2: Apuntar el generador al repo**

Guardar este script como `"$SCRATCH/parche-generar.py"`, fuera del repo, y correrlo desde `$REPO` con `python3 "${SCRATCH:?}/parche-generar.py"`. Cambia la cabecera, suma `RAIZ`, `VERSION` y los dos destinos, usa `VERSION` en el documento, escribe el JSON solo si no existe o si sale igual, y escribe el documento en `docs/specialty-test/`.

```python
# Tarea 12: generar.py escribe en el repo (decisión abierta 15). Cada reemplazo exige su texto una vez.
from pathlib import Path

ruta = Path("scripts/specialty-test/generar.py")
texto = ruta.read_text(encoding="utf-8")
reemplazos = [
    ("# Genera contenido-test.json y contenido-test.md del test de especialidad de ULima++.\n",
     "# Genera el contenido versionado del test de especialidad de ULima++ (RS-BE-37): el JSON de\n"
     "# src/modules/specialty-test/content/<versión>.json y el documento de revisión\n"
     "# docs/specialty-test/contenido-<versión>.md. Una versión publicada no cambia; para otra se sube\n"
     "# VERSION y el archivo nuevo se registra en content/index.ts (decisión abierta 15).\n"),
    ("OUT = Path(__file__).parent\n",
     "OUT = Path(__file__).parent\n"
     "RAIZ = OUT.parent.parent\n"
     "VERSION = \"2026-09-25.4\"\n"
     "DESTINO_JSON = RAIZ / \"src\" / \"modules\" / \"specialty-test\" / \"content\" / f\"{VERSION}.json\"\n"
     "DESTINO_MD = RAIZ / \"docs\" / \"specialty-test\" / f\"contenido-{VERSION}.md\"\n"),
    ("    version=\"2026-09-25.4\",\n", "    version=VERSION,\n"),
    ("(OUT / \"contenido-test.json\").write_text(json.dumps(DOC, ensure_ascii=False, indent=2) + \"\\n\", encoding=\"utf-8\")\n",
     "TEXTO_JSON = json.dumps(DOC, ensure_ascii=False, indent=2) + \"\\n\"\n"
     "if DESTINO_JSON.exists() and DESTINO_JSON.read_text(encoding=\"utf-8\") != TEXTO_JSON:\n"
     "    raise SystemExit(f\"{DESTINO_JSON.name} ya está publicada y cambiaría. Una versión publicada no cambia: \"\n"
     "                     \"sube VERSION y registra la nueva en content/index.ts.\")\n"
     "DESTINO_JSON.parent.mkdir(parents=True, exist_ok=True)\n"
     "DESTINO_JSON.write_text(TEXTO_JSON, encoding=\"utf-8\")\n"),
    ("P(\"Contenido del test que conduce Ulises. El archivo `contenido-test.json` tiene lo mismo en forma de datos; este documento sirve para revisarlo.\\n\")\n",
     "P(f\"Contenido del test que conduce Ulises. El archivo `src/modules/specialty-test/content/{VERSION}.json` tiene lo mismo en forma de datos; este documento sirve para revisarlo.\\n\")\n"),
    ("(OUT / \"contenido-test.md\").write_text(\"\\n\".join(L) + \"\\n\", encoding=\"utf-8\")\n",
     "DESTINO_MD.parent.mkdir(parents=True, exist_ok=True)\n"
     "DESTINO_MD.write_text(\"\\n\".join(L) + \"\\n\", encoding=\"utf-8\")\n"),
]
for viejo, nuevo in reemplazos:
    veces = texto.count(viejo)
    if veces != 1:
        raise SystemExit(f"generar.py: se esperaba 1 vez y hay {veces} de {viejo[:60]!r}")
    texto = texto.replace(viejo, nuevo)
ruta.write_text(texto, encoding="utf-8")
print("generar.py apunta al repo")
```

**Esperado:** imprime `generar.py apunta al repo`, y `shasum -a 256 scripts/specialty-test/generar.py | cut -c1-64` da `06d9fe193665753d143255c3355ec271212db9d8aeee4825d32e983abc7ca4ce`.

- [ ] **Paso 3: Generar y comprobar que el JSON no cambia**

```bash
cd "${REPO:?}" && python3 scripts/specialty-test/generar.py > /dev/null && git diff --exit-code -- src/modules/specialty-test/content/2026-09-25.4.json && echo "JSON igual" && shasum -a 256 docs/specialty-test/contenido-2026-09-25.4.md | cut -c1-64 && grep -cE '[0-9]{8}|@|/Users/|/private/' docs/specialty-test/contenido-2026-09-25.4.md
```

**Esperado:** `JSON igual`, la huella `675699ed15bfb3186c93776fb940aaa1e6384f85c8a15f073682cd922e35794d` del documento y un `0`. El documento es el `contenido-test.md` de la fuente con una sola frase distinta en la cabecera, que ahora nombra `src/modules/specialty-test/content/2026-09-25.4.json`.

- [ ] **Paso 4: Comprobar que el generador protege la versión publicada**

```bash
cd "${REPO:?}" && printf ' ' >> src/modules/specialty-test/content/2026-09-25.4.json && { python3 scripts/specialty-test/generar.py > /dev/null; echo "salida=$?"; } ; git restore -- src/modules/specialty-test/content/2026-09-25.4.json && git diff --exit-code -- src/modules/specialty-test/content/2026-09-25.4.json && echo "JSON restaurado"
```

**Esperado:** el mensaje `2026-09-25.4.json ya está publicada y cambiaría. Una versión publicada no cambia: sube VERSION y registra la nueva en content/index.ts.`, `salida=1` y `JSON restaurado`. El JSON ya está commiteado desde la Tarea 1, así que `git restore` de ese único archivo lo devuelve a su versión commiteada, sin copias de respaldo.

- [ ] **Paso 5: Suite**

```bash
cd "${REPO:?}" && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6
```

**Esperado:** las mismas cifras de la Tarea 11 (2469 pass, 48 skip, 0 fail, 9767 `expect()`, 2517 pruebas en 144 archivos).

- [ ] **Paso 6: Commit**

```bash
cd "${REPO:?}" && git status --short && git add scripts/specialty-test/generar.py scripts/specialty-test/extraer-lucide.py scripts/specialty-test/lucide-nombres.txt docs/specialty-test/contenido-2026-09-25.4.md && git commit -m "feat(specialty-test): el generador del contenido y su documento de revisión entran al repo (RS-BE-37, decisión abierta 15)" -m "generar.py escribe el JSON en src/modules/specialty-test/content y el documento en docs/specialty-test, valida los íconos con lucide-nombres.txt y se niega a cambiar una versión publicada. Con la 2026-09-25.4 vuelve a escribir el mismo JSON byte a byte."
```

---

### Tarea 13: Cierre de la spec, la enmienda, el índice y el contrato

**Requisitos:** «Cambios en otras specs» y «Verificación antes del merge» de la spec, en la parte que no depende del dueño. Cada `[@test]` pierde la marca *(pendiente)*, porque su prueba ya existe, y el estado pasa a «implementada en la rama», sin decir aplicada ni desplegada. `MIGRATIONS.md` no cambia, porque la entrada de la `0014` se escribe cuando el dueño la aplica.

**Archivos:**
- Modificar: `specs/features/specialty-test/specialty-test.spec.md`
- Modificar: `specs/features/academic-profile/academic-profile.spec.md`
- Modificar: `docs/specs/feature-index.md`
- Modificar: `docs/specs/api-contracts.md`

**Interfaces:**
- Consume: las doce pruebas de `test/HU36_jeff/` de las Tareas 1 a 11.
- Produce: documentación coherente con el código de la rama.

- [ ] **Paso 1: Actualizar los textos**

Guardar este script como `"$SCRATCH/cierre-docs.py"`, fuera del repo, y correrlo desde `$REPO` con `python3 "${SCRATCH:?}/cierre-docs.py"`. Cada reemplazo exige encontrar su texto una sola vez, así que una segunda corrida se detiene sin tocar nada.

```python
# Tarea 13: la spec, la enmienda, el índice y el contrato pasan de «pendiente de implementar»
# a «implementada en la rama». Cada reemplazo exige encontrar su texto una sola vez.
from pathlib import Path

RAMA = "`feat/test-especialidad`"

def reemplazar(ruta, pares):
    p = Path(ruta)
    texto = p.read_text(encoding="utf-8")
    for viejo, nuevo in pares:
        veces = texto.count(viejo)
        if veces != 1:
            raise SystemExit(f"{ruta}: se esperaba 1 vez y hay {veces} de {viejo!r}")
        texto = texto.replace(viejo, nuevo)
    p.write_text(texto, encoding="utf-8")

spec = "specs/features/specialty-test/specialty-test.spec.md"
texto = Path(spec).read_text(encoding="utf-8")
marcas = texto.count("` *(pendiente)*")
if marcas != 18:
    raise SystemExit(f"{spec}: se esperaban 18 marcas *(pendiente)* y hay {marcas}")
Path(spec).write_text(texto.replace("` *(pendiente)*", "`"), encoding="utf-8")
reemplazar(spec, [
    ("> dueño, como con la `0012` y la `0013`. Pendiente de implementar.\n",
     f"> dueño, como con la `0012` y la `0013`. Implementada en la rama {RAMA}, con la\n"
     "> `0014` escrita y sin aplicar.\n"),
    ("> decisiones 8 y 9. Las dos describen la versión `2026-09-25.4` del contenido. Todos los\n"
     "> `[@test]` apuntan a pruebas que se crean con la implementación y hoy no existen, así que\n"
     "> cada uno lleva la marca *(pendiente)*. Los ejemplos usan datos inventados. La rama parte de\n"
     "> `38024d4` y trae `main` en `f10eb3f` con un merge, que suma el ajuste del chatbot y la\n"
     "> migración `0013`, así que todas las referencias de línea citan ese estado.\n",
     "> decisiones 8 y 9. Las dos describen la versión `2026-09-25.4` del contenido. Cada `[@test]`\n"
     "> apunta a una prueba de `test/HU36_jeff/` que ya existe. Los ejemplos usan datos inventados.\n"
     "> La rama parte de `38024d4` y trae `main` en `f10eb3f` con un merge, que suma el ajuste del\n"
     "> chatbot y la migración `0013`, así que todas las referencias de línea citan ese estado.\n"),
    ("*(pendiente, corre solo con `TEST_DATABASE_URL`)*", "*(corre solo con `TEST_DATABASE_URL`)*"),
    ("> revisión. El `.sql` se escribe con la implementación. Aplicarlo en producción pide además, en\n"
     "> el momento del despliegue, el respaldo y el permiso explícito del dueño, como con la `0012`\n"
     "> y la `0013`, y nadie lo aplica antes.\n",
     "> revisión. El `.sql` ya está escrito en `drizzle/0014_specialty_test_result.sql`. Aplicarlo en\n"
     "> producción pide además, en el momento del despliegue, el respaldo y el permiso explícito del\n"
     "> dueño, como con la `0012` y la `0013`, y nadie lo aplica antes.\n"),
    ("Todas se crean con la implementación, en `test/HU36_jeff/`, y hoy no existen.",
     "Todas viven en `test/HU36_jeff/`."),
])

enmienda = "specs/features/academic-profile/academic-profile.spec.md"
texto = Path(enmienda).read_text(encoding="utf-8")
if texto.count("` *(pendiente)*") != 2:
    raise SystemExit(f"{enmienda}: se esperaban 2 marcas *(pendiente)*")
Path(enmienda).write_text(texto.replace("` *(pendiente)*", "`"), encoding="utf-8")
reemplazar(enmienda, [
    ("> y aprobada por el dueño el 2026-09-25 con esa spec, pendiente de implementar.** Agrega\n",
     f"> y aprobada por el dueño el 2026-09-25 con esa spec, implementada en la rama {RAMA}.** Agrega\n"),
])

reemplazar("docs/specs/feature-index.md", [
    ("**Enmienda del test de especialidad, aprobada por el dueño el 2026-09-25 y pendiente de implementar**",
     f"**Enmienda del test de especialidad, aprobada por el dueño el 2026-09-25 e implementada en la rama {RAMA}, pendiente de despliegue**"),
    ("con un ícono de Lucide por tarea. Pendiente de implementar. La `0014` se aplica",
     f"con un ícono de Lucide por tarea. Implementada en la rama {RAMA}, pendiente de despliegue. La `0014` se aplica"),
])

reemplazar("docs/specs/api-contracts.md", [
    ("BR-AP-07 de `academic-profile.spec.md`, pendiente de implementar)*",
     f"BR-AP-07 de `academic-profile.spec.md`, implementada en la rama {RAMA}, pendiente de despliegue)*"),
    ("BR-AP-07 y BR-AP-08, pendiente de implementar)*",
     f"BR-AP-07 y BR-AP-08, implementadas en la rama {RAMA}, pendiente de despliegue)*"),
    ("## Specialty Test (test de especialidad), APROBADO el 2026-09-25 y pendiente de implementar",
     f"## Specialty Test (test de especialidad), APROBADO el 2026-09-25 e implementado en la rama {RAMA}, pendiente de despliegue"),
])
print("documentos al día")
```

**Esperado:** imprime `documentos al día`.

- [ ] **Paso 2: Revisar lo que cambió**

```bash
cd "${REPO:?}" && git diff --stat && grep -c "(pendiente" specs/features/specialty-test/specialty-test.spec.md specs/features/academic-profile/academic-profile.spec.md && for f in $(grep -ohE 'test/HU36_jeff/[a-z0-9.-]+\.test\.ts' specs/features/specialty-test/specialty-test.spec.md specs/features/academic-profile/academic-profile.spec.md | sort -u); do test -f "$f" && echo "ok $f"; done
```

**Esperado:** cuatro archivos modificados; un `1` en la spec del test (la decisión abierta 17, que cuenta la historia de la marca y no cambia) y un `0` en la de Academic Profile; y doce líneas `ok test/HU36_jeff/…`, una por cada prueba enlazada.

- [ ] **Paso 3: Verificación final**

```bash
cd "${REPO:?}" && "${BUN:?}" run build && DATABASE_URL=postgres://user:pass@localhost:5432/test "${BUN:?}" test 2>&1 | tail -6 && ./node_modules/.bin/tsc -p test/tsconfig.json --noEmit 2>&1 | grep -c "error TS" ; ./node_modules/.bin/tsc -p test/tsconfig.json --noEmit 2>&1 | grep -cE "HU36_jeff|HU05_mel|^src/" ; node --input-type=module -e "const m = await import('./dist/modules/specialty-test/content/index.js'); console.log(m.CURRENT_VERSION)" && grep -rhoE '\b[0-9]{8}\b' src/modules/specialty-test test/HU36_jeff drizzle/0014_specialty_test_result.sql scripts/specialty-test docs/specialty-test | sort | uniq -c
```

**Esperado:** `tsc` sin errores; la suite con 2469 pass, 48 skip, 0 fail, 9767 `expect()` y 2517 pruebas en 144 archivos (desde la línea base, +185 pruebas, +6 saltadas y +12 archivos); `78` errores de tipos en las pruebas, los mismos de la línea base, y `0` en `HU36_jeff`, `HU05_mel` y `src`; Node imprime `2026-09-25.4`; y el único código de ocho dígitos es el sintético, `12 20230001`.

- [ ] **Paso 4: Commit**

```bash
cd "${REPO:?}" && git status --short && git add specs/features/specialty-test/specialty-test.spec.md specs/features/academic-profile/academic-profile.spec.md docs/specs/feature-index.md docs/specs/api-contracts.md && git commit -m "docs(specialty-test): la spec, la enmienda, el índice y el contrato quedan implementados en la rama (RS-BE-37 a RS-BE-47, BR-AP-07, BR-AP-08)" -m "Cada [@test] apunta a una prueba que ya existe y pierde la marca de pendiente. El estado pasa a implementada en la rama feat/test-especialidad, con la 0014 escrita y sin aplicar. MIGRATIONS.md no cambia hasta que el dueño aplique la 0014."
```

---

## Después de este plan

Nada de esta lista lo hace el implementador. Son los pasos de «Verificación antes del merge» que dependen del dueño o del despliegue.

1. El dueño confirma en solo lectura que las especialidades con `is_active = true` de Ingeniería de Sistemas son exactamente las cuatro oficiales, con los ids 1, 5, 6 y 7 y los nombres del contenido. Sirve esta consulta, que corre en una transacción de solo lectura y lista todas las especialidades de la carrera dueña de esos ids.

   ```sql
   begin transaction read only;
   select c.name as carrera, s.id, s.name, s.is_active
   from specialty s
   join career c on c.id = s.career_id
   where s.career_id in (select career_id from specialty where id in (1, 5, 6, 7))
   order by s.career_id, s.id;
   rollback;
   ```

   El resultado correcto trae una sola carrera, y sus filas con `is_active = true` son justo las de los ids 1, 5, 6 y 7, con los nombres Ingeniería de Software, Tecnologías de la Información, Sistemas de Información y Desarrollo de Videojuegos, que el servidor compara sin tildes ni mayúsculas y sin espacios al borde. Un nombre que no coincide deja las tres rutas del módulo en `404 SPECIALTY_TEST_NOT_AVAILABLE`.
2. En el despliegue, con el respaldo previo y su permiso explícito, el dueño aplica `bun run db:apply drizzle/0014_specialty_test_result.sql` antes del merge del código que la usa, verifica `to_regclass('student_specialty_test_result')`, las cinco columnas, la clave, la FK con `ON DELETE CASCADE` y los dos CHECK, y registra la migración en `MIGRATIONS.md` con su fecha, su respaldo y su verificación.
3. Si el dueño lo autoriza, `specialty-test.postgres.test.ts` corre con `TEST_DATABASE_URL` hacia un Postgres local desechable, con el comando de su cabecera.
4. Un `GET /specialty-test/content` sin token desde una vista previa de Vercel que no use la base de producción comprueba que el JSON entra al empaquetado. La respuesta esperada es `401 MISSING_TOKEN`, que sale antes de consultar la base. Si el JSON quedara fuera, la función no arrancaría y la vista previa respondería `500` en toda ruta, porque el registro se importa de forma estática desde `server.ts`, cadena que fija la guardia de RS-BE-37 en `specialty-test-content.test.ts`. El 2026-09-26, un `vercel build` local sobre `96ac535`, con la CLI 59.11.2, `@vercel/hono` 7.0.0, ajustes de proyecto de prueba y ninguna variable real, deja el JSON idéntico dentro de la función, y esa función arranca con Node 24 y responde el `401`. Esa prueba local no reemplaza la vista previa, porque el builder remoto y la versión de Node del proyecto pueden ser otros.
5. Un recorrido contra el backend desplegado con una cuenta de prueba termina una vez sin desempate y otra con dos, ve el resultado en `GET /specialty-test/me/result` y comprueba que el motivo llega con `reasonSource: "ai"` y, con Cohere forzado a fallar en un entorno de prueba, con `"templates"`.
