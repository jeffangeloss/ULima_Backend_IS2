# Portal Sync (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un alumno autenticado en ULima++ importa sus datos oficiales del ciclo desde el portal miUlima (cursos, secciones, docentes, horario, matrícula y avance de malla) hacia PostgreSQL, de forma idempotente y sin que el backend vea nunca su contraseña.

**Architecture:** Módulo Hono `routes → controller → service → repository`. El service descarga las páginas del portal con las cookies que el WebView del alumno consiguió, las pasa por parsers puros (HTML → DTO) y entrega los DTO al repository, que hace todas las escrituras con `ON CONFLICT` dentro de una única transacción. Las descargas HTTP ocurren **fuera** de la transacción.

**Tech Stack:** Bun, TypeScript (ESM, imports con extensión `.js`), Hono, Drizzle ORM sobre `postgres-js`, Zod, `bun:test`.

**Spec:** `specs/features/portal-sync/portal-sync.spec.md` (leerla completa antes de empezar; este plan la implementa y no la reemplaza).

## Global Constraints

- Portal base: `https://webaloe.ulima.edu.pe`, ruta raíz `/portalUL/`. Host **fijo en allowlist**, nunca tomado del request.
- Encoding del portal: **ISO-8859-1**. `layout.jsp` además emite entidades HTML nombradas (`&Ntilde;`, `&Aacute;`); los servlets emiten bytes acentuados crudos. Todo texto se normaliza (decodificar entidades + colapsar espacios + trim) antes de comparar o guardar.
- Ciclo activo: **siempre** de `layout.jsp` vía `parseCicloActivo`. Formatos: `20262` en URL, `2026-2` en `academic_period.code`. Validar `^\d{5}$` antes de interpolar en una URL.
- Códigos de error HTTP fijados por contrato: `409 PORTAL_SESSION_INVALID` (nunca 401), `403 PORTAL_IDENTITY_MISMATCH`, `422 PORTAL_IDENTITY_UNVERIFIABLE`, `502 PORTAL_UNAVAILABLE`, `504 PORTAL_TIMEOUT`, `429 RATE_LIMITED`.
- Constraints reales de BD que mandan sobre el código: `uq_academic_period_single_active` (único parcial, **no** diferible → desactivar antes de insertar), `uq_schedule_session (section_id, day_of_week, start_time)` (**3** columnas, sin `end_time`), `uq_course_offering (academic_period_id, course_id)`, `uq_section_offering_code (course_offering_id, code)`, `uq_enrollment_student_section`, `uq_student_course_progress (student_id, curriculum_course_id)`, `teacher.teacher_code` unique (`full_name` **no** es unique), `chk_course_default_credit > 0`, `chk_student_current_level BETWEEN 1 AND 10`.
- `app_user.institutional_email` **nunca** se escribe. `app_user.full_name` solo si está vacío.
- Nunca se registran en logs cookies, cuerpos HTML ni datos personales.
- Tests en `test/HU31_jeff/`, `bun:test`, imports `.js`.
- Nunca se ejecuta `db:push`. La única migración de este plan es la de la Tarea 6, ya aprobada.

---

### Task 1: Fixtures anonimizados y utilidades de HTML

**Files:**
- Create: `test/HU31_jeff/fixtures/layout.html` (copia de `/Users/jjjangelosss/ULIMA++/spike-portal/fixtures/10_layout.jsp.html`)
- Create: `test/HU31_jeff/fixtures/matricula.html` (copia de `.../10_gama_servlets_ComandoMostrarConsMatr_COCICLO_20262_Fg_1.html`)
- Create: `test/HU31_jeff/fixtures/record.html` (copia de `.../10_gada_servlets_ComandoListarRecordAcademico_ac_1.html`)
- Create: `src/modules/portal-sync/parsers/html.ts`
- Test: `test/HU31_jeff/html.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `decodeEntities(s: string): string`, `clean(s: string): string`, `stripTags(s: string): string`, `trsOf(html: string): string[]`, `tdsOf(tr: string): string[]`, `cellsOf(tr: string): string[]`, `type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string }`.

- [ ] **Step 1: Copiar los fixtures ya anonimizados**

```bash
mkdir -p test/HU31_jeff/fixtures
cp /Users/jjjangelosss/ULIMA++/spike-portal/fixtures/10_layout.jsp.html test/HU31_jeff/fixtures/layout.html
cp /Users/jjjangelosss/ULIMA++/spike-portal/fixtures/10_gama_servlets_ComandoMostrarConsMatr_COCICLO_20262_Fg_1.html test/HU31_jeff/fixtures/matricula.html
cp /Users/jjjangelosss/ULIMA++/spike-portal/fixtures/10_gada_servlets_ComandoListarRecordAcademico_ac_1.html test/HU31_jeff/fixtures/record.html
grep -l "JEFFERSON\|SANCHEZ PALACIOS\|20235218" test/HU31_jeff/fixtures/* && echo "ABORTAR: quedan datos reales" || echo "fixtures limpios"
```

Expected: `fixtures limpios`. Si aparece cualquier archivo, no commitear y volver a anonimizar.

- [ ] **Step 2: Escribir el test que falla**

```ts
// test/HU31_jeff/html.test.ts
import { describe, expect, test } from "bun:test";
import { cellsOf, clean, decodeEntities, stripTags, tdsOf, trsOf } from "../../src/modules/portal-sync/parsers/html.js";

describe("html utils", () => {
  test("decodeEntities convierte las entidades que emite layout.jsp", () => {
    expect(decodeEntities("DIEZ QUI&Ntilde;ONES")).toBe("DIEZ QUIÑONES");
    expect(decodeEntities("PLANEAMIENTO ESTRAT&Eacute;GICO")).toBe("PLANEAMIENTO ESTRATÉGICO");
    expect(decodeEntities("PARADIG. PROGRAMACI&Oacute;")).toBe("PARADIG. PROGRAMACIÓ");
    expect(decodeEntities("a&nbsp;b")).toBe("a b");
    expect(decodeEntities("A &amp; B")).toBe("A & B");
    expect(decodeEntities("&#209;")).toBe("Ñ");
  });

  test("clean decodifica, colapsa espacios y recorta", () => {
    expect(clean("  DIEZ &nbsp; QUI&Ntilde;ONES \n / PERCY ")).toBe("DIEZ QUIÑONES / PERCY");
    expect(clean("")).toBe("");
  });

  test("stripTags quita el marcado conservando el texto", () => {
    expect(stripTags("<td><font size=1><b>650033</b></font></td>")).toBe("650033");
  });

  test("trsOf devuelve las filas crudas y cellsOf su texto limpio", () => {
    const html = "<table><tr><td>a</td><th>b</th></tr><tr><td>&nbsp;c </td><td>d</td></tr></table>";
    const trs = trsOf(html);
    expect(trs).toHaveLength(2);
    expect(cellsOf(trs[0])).toEqual(["a", "b"]);
    expect(cellsOf(trs[1])).toEqual(["c", "d"]);
  });

  test("tdsOf conserva los atributos, que el horario necesita", () => {
    const tds = tdsOf('<tr><td width="10%"><font title="650033 X">v</font></td></tr>');
    expect(tds).toHaveLength(1);
    expect(tds[0]).toContain('title="650033 X"');
  });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `bun test test/HU31_jeff/html.test.ts`
Expected: FAIL — `Cannot find module '.../parsers/html.js'`.

- [ ] **Step 4: Implementar**

```ts
// src/modules/portal-sync/parsers/html.ts

/** Resultado uniforme de todo parser: nunca lanza, devuelve el motivo del fallo. */
export type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const NAMED: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  Ntilde: "Ñ", ntilde: "ñ", Ccedil: "Ç", ccedil: "ç",
  Aacute: "Á", aacute: "á", Eacute: "É", eacute: "é", Iacute: "Í", iacute: "í",
  Oacute: "Ó", oacute: "ó", Uacute: "Ú", uacute: "ú", Uuml: "Ü", uuml: "ü",
  Agrave: "À", agrave: "à", ordm: "º", ordf: "ª", deg: "°", middot: "·", hellip: "…",
};

/** Decodifica entidades nombradas y numéricas. layout.jsp las usa; los servlets no. */
export const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([A-Za-z]+);/g, (m, name) => NAMED[name] ?? m);

/** Quita etiquetas conservando el texto. */
export const stripTags = (s: string): string => s.replace(/<[^>]*>/g, " ");

/** Normalización obligatoria antes de comparar o guardar cualquier texto del portal. */
export const clean = (s: string): string =>
  decodeEntities(s ?? "").replace(/\s+/g, " ").trim();

/** Filas crudas del HTML, con su marcado intacto. */
export const trsOf = (html: string): string[] => html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

/** Celdas `<td>` CRUDAS de una fila: los parsers de horario y Aula Virtual
 *  necesitan los atributos (`title`, `width`), no solo el texto. */
export const tdsOf = (tr: string): string[] => tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];

/** Texto ya normalizado de cada celda (`td` o `th`) de una fila. */
export const cellsOf = (tr: string): string[] =>
  (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((td) => clean(stripTags(td)));
```

- [ ] **Step 5: Verificar que pasa**

Run: `bun test test/HU31_jeff/html.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add test/HU31_jeff src/modules/portal-sync/parsers/html.ts
git commit -m "feat(portal-sync): fixtures anonimizados y utilidades de HTML del portal"
```

---

### Task 2: Parsers de ciclo activo y consolidado de matrícula

Estos dos son la base de la identidad: sin el código de alumno del consolidado la importación aborta.

**Files:**
- Create: `src/modules/portal-sync/parsers/ciclo.ts`
- Create: `src/modules/portal-sync/parsers/matricula.ts`
- Create: `src/modules/portal-sync/portal-sync.types.ts`
- Test: `test/HU31_jeff/parsers.matricula.test.ts`

**Interfaces:**
- Consumes: `clean`, `stripTags`, `rowsOf`, `ParseResult` de la Tarea 1.
- Produces:
  - `parseCicloActivo(html: string): ParseResult<CicloActivo>` con `CicloActivo = { cocicloUrl: string; periodCode: string }`.
  - `parseConsolidadoMatricula(html: string): ParseResult<Matricula>` con `Matricula = { studentCode: string; studentName: string; careerName: string; periodCode: string; rows: MatriculaRow[] }` y `MatriculaRow = { carCode: string; courseCode: string; sectionCode: string; groupCode: string; courseName: string; level: number; credits: number; attempt: number }`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/parsers.matricula.test.ts
import { describe, expect, test } from "bun:test";
import { parseCicloActivo } from "../../src/modules/portal-sync/parsers/ciclo.js";
import { parseConsolidadoMatricula } from "../../src/modules/portal-sync/parsers/matricula.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();

describe("parseCicloActivo", () => {
  test("devuelve el ciclo VIGENTE y no el del bloque por periodo", () => {
    const r = parseCicloActivo(layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // layout.jsp trae ADEMÁS "Información por Período Académico: Ciclo 2026-1",
    // que es el ciclo anterior y aparece antes en el HTML.
    expect(r.data.periodCode).toBe("2026-2");
    expect(r.data.cocicloUrl).toBe("20262");
  });

  test("falla con ok:false si no hay ciclo", () => {
    expect(parseCicloActivo("<html>sin ciclo</html>").ok).toBe(false);
  });

  test("falla con ok:false si las dos fuentes discrepan", () => {
    const html = 'RestrictToCategory=20262_650033 <td>CICLO: 2026-1</td>';
    const r = parseCicloActivo(html);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("contradictorios");
  });
});

describe("parseConsolidadoMatricula", () => {
  test("extrae identidad y las 5 filas de curso del ciclo", () => {
    const r = parseConsolidadoMatricula(matricula);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.studentCode).toMatch(/^\d{8}$/);
    expect(r.data.studentName.length).toBeGreaterThan(0);
    expect(r.data.careerName).toBe("INGENIERÍA DE SISTEMAS");
    expect(r.data.periodCode).toBe("2026-2");
    expect(r.data.rows).toHaveLength(5);
  });

  test("respeta la columna GR. y no desplaza los campos", () => {
    const r = parseConsolidadoMatricula(matricula);
    if (!r.ok) throw new Error("parser fallo");
    const plan = r.data.rows.find((x) => x.courseCode === "650033");
    expect(plan).toEqual({
      carCode: "6500",
      courseCode: "650033",
      sectionCode: "952",
      groupCode: "",
      courseName: "PLANEAMIENTO ESTRATÉGICO",
      level: 9,
      credits: 3,
      attempt: 1,
    });
  });

  test("falla con ok:false si el encabezado no trae CODIGO", () => {
    expect(parseConsolidadoMatricula("<html><table><tr><td>x</td></tr></table></html>").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/parsers.matricula.test.ts`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Definir los tipos del módulo**

```ts
// src/modules/portal-sync/portal-sync.types.ts
export interface PortalCookies { JSESSIONID: string; LtpaToken2: string; LtpaToken?: string }

export interface CicloActivo { cocicloUrl: string; periodCode: string }

export interface MatriculaRow {
  carCode: string; courseCode: string; sectionCode: string; groupCode: string;
  courseName: string; level: number; credits: number; attempt: number;
}
export interface Matricula {
  studentCode: string; studentName: string; careerName: string; periodCode: string; rows: MatriculaRow[];
}

export interface AulaVirtualRow { courseCode: string; courseName: string; sectionCode: string; teacherName: string }

export interface HorarioSession {
  courseCode: string; dayOfWeek: number; startTime: string; endTime: string; classroom: string | null;
}

export interface RecordRow {
  periodCode: string; courseCode: string; courseName: string;
  attempt: number; credits: number; grade: number | null; sectionCode: string;
}

export interface InfoAcademica { careerName: string | null; lastPeriodLevel: number | null }
export interface Impedimentos { hasImpediment: boolean; hasDebt: boolean; text: string }

export type WarningCode =
  | "PERIOD_DATES_DEFAULTED" | "TEACHER_MISSING" | "PARSER_FAILED" | "CAREER_MISMATCH"
  | "PROGRESS_SKIPPED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE" | "GRADE_NOT_NUMERIC";
export interface SyncWarning { code: WarningCode; block: string; message: string }

export interface ImportSummary {
  coursesCreated: number; teachersCreated: number; sectionsCreated: number; sectionsUpdated: number;
  sessionsUpserted: number; enrollmentsUpserted: number; enrollmentsWithdrawn: number;
  progressUpserted: number; progressSkipped: number; alertsCreated: number;
}

export interface ImportResult {
  period: { id: number; code: string; created: boolean };
  identity: { portalCode: string; fullName: string; career: string };
  summary: ImportSummary;
  warnings: SyncWarning[];
}

export interface SyncStatus {
  activePeriod: { id: number; code: string } | null;
  enrollmentsInActivePeriod: number;
  needsImport: boolean;
}
```

- [ ] **Step 4: Implementar los dos parsers**

```ts
// src/modules/portal-sync/parsers/ciclo.ts
import type { ParseResult } from "./html.js";
import type { CicloActivo } from "../portal-sync.types.js";

/**
 * Ciclo vigente de layout.jsp. CUIDADO: la página contiene DOS ciclos distintos.
 * El bloque "Información por Período Académico: Ciclo 2026-1" es el ciclo
 * ANTERIOR y aparece ANTES en el HTML: una búsqueda ingenua e insensible a
 * mayúsculas devuelve el ciclo equivocado (verificado contra el fixture real).
 *
 * Fuente primaria: los enlaces de sílabo llevan el ciclo embebido
 * (`RestrictToCategory=20262_650033`), los genera el portal y no son ambiguos.
 * Fuente secundaria: el rótulo `CICLO: 2026-2` de Información para Matrícula y
 * Aula Virtual, en MAYÚSCULAS y con dos puntos — esa grafía es justo lo que lo
 * distingue del "Ciclo 2026-1" del bloque por período.
 * Si ambas fuentes discrepan se falla en vez de adivinar.
 */
export const parseCicloActivo = (html: string): ParseResult<CicloActivo> => {
  const fromSilabo = [...html.matchAll(/RestrictToCategory=(\d{5})_\d{4,6}/g)].map((m) => m[1]);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  // Sin flag `i` a propósito.
  const fromLabel = [...text.matchAll(/\bCICLO\s*:\s*(\d{4})\s*-\s*([0-2])/g)].map((m) => `${m[1]}${m[2]}`);

  const candidates = [...new Set([...fromSilabo, ...fromLabel])];
  if (candidates.length === 0) return { ok: false, reason: "no se encontró el ciclo vigente en layout.jsp" };
  if (candidates.length > 1) {
    return { ok: false, reason: `el portal reporta ciclos contradictorios: ${candidates.join(", ")}` };
  }
  const cociclo = candidates[0];
  return { ok: true, data: { cocicloUrl: cociclo, periodCode: `${cociclo.slice(0, 4)}-${cociclo.slice(4)}` } };
};
```

```ts
// src/modules/portal-sync/parsers/matricula.ts
import { cellsOf, clean, stripTags, trsOf, type ParseResult } from "./html.js";
import type { Matricula, MatriculaRow } from "../portal-sync.types.js";

const CODE = /\b(\d{8})\b/;
const PERIOD = /Per[ií]odo\s*:?\s*(\d{4}-[0-2])/i;

/**
 * Consolidado de matrícula. Es la FUENTE DE IDENTIDAD: si esto falla, la
 * importación aborta con 422 y no escribe nada.
 * Columnas reales de cada fila: CAR. | COD | SEC. | GR. | NOMBRE | Nv. | CRD. | VEZ
 */
export const parseConsolidadoMatricula = (html: string): ParseResult<Matricula> => {
  const text = clean(stripTags(html));
  if (!/C[ÓO]DIGO/i.test(text)) return { ok: false, reason: "el encabezado no trae la columna CÓDIGO" };

  const periodCode = text.match(PERIOD)?.[1];
  if (!periodCode) return { ok: false, reason: "no se pudo leer el período" };

  // Fila de identidad: CÓDIGO | NOMBRES Y APELLIDOS | CARRERA (3 celdas, la 1a de 8 dígitos).
  let studentCode = "";
  let studentName = "";
  let careerName = "";
  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    if (cells.length !== 3) continue;
    if (!CODE.test(cells[0])) continue;
    [studentCode, studentName, careerName] = [cells[0].match(CODE)![1], cells[1], cells[2]];
    break;
  }
  if (!studentCode) return { ok: false, reason: "no se pudo leer el código de alumno" };

  const rows: MatriculaRow[] = [];
  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    // Fila de curso: CAR. (4 díg.) + COD (4-6 díg.) + SEC. (dígitos) y al menos 8 celdas.
    if (cells.length < 8) continue;
    if (!/^\d{4}$/.test(cells[0]) || !/^\d{4,6}$/.test(cells[1]) || !/^\d{1,4}$/.test(cells[2])) continue;
    rows.push({
      carCode: cells[0],
      courseCode: cells[1],
      sectionCode: cells[2],
      groupCode: cells[3],
      courseName: cells[4],
      level: Number.parseInt(cells[5], 10) || 0,
      credits: Math.ceil(Number.parseFloat(cells[6]) || 0),
      attempt: Number.parseInt(cells[7], 10) || 1,
    });
  }
  if (!rows.length) return { ok: false, reason: "no se encontraron filas de curso" };

  return { ok: true, data: { studentCode, studentName, careerName, periodCode, rows } };
};
```

- [ ] **Step 5: Verificar que pasa**

Run: `bun test test/HU31_jeff/parsers.matricula.test.ts`
Expected: PASS (5 tests). Si la fila del fixture ordena las columnas distinto, ajustar los índices **según el fixture**, nunca según este plan.

- [ ] **Step 6: Commit**

```bash
git add src/modules/portal-sync test/HU31_jeff
git commit -m "feat(portal-sync): parsers de ciclo activo y consolidado de matricula"
```

---

### Task 3: Parsers de Aula Virtual y horario

**Files:**
- Create: `src/modules/portal-sync/parsers/aula-virtual.ts`
- Create: `src/modules/portal-sync/parsers/horario.ts`
- Test: `test/HU31_jeff/parsers.horario.test.ts`

**Interfaces:**
- Consumes: `clean`, `stripTags`, `ParseResult`, tipos de la Tarea 2.
- Produces: `parseAulaVirtual(html: string): ParseResult<AulaVirtualRow[]>`, `parseHorario(html: string): ParseResult<HorarioSession[]>`, `normalizeTeacherName(raw: string): string`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/parsers.horario.test.ts
import { describe, expect, test } from "bun:test";
import { normalizeTeacherName, parseAulaVirtual } from "../../src/modules/portal-sync/parsers/aula-virtual.js";
import { parseHorario } from "../../src/modules/portal-sync/parsers/horario.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();

describe("parseAulaVirtual", () => {
  test("da nombre completo de curso y docente normalizado", () => {
    const r = parseAulaVirtual(layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(5);
    const plan = r.data.find((x) => x.courseCode === "650033");
    expect(plan?.courseName).toBe("PLANEAMIENTO ESTRATÉGICO");
    expect(plan?.sectionCode).toBe("952");
    expect(plan?.teacherName).toBe("PERCY DIEZ QUIÑONES PANDURO");
  });
});

describe("normalizeTeacherName", () => {
  test("APELLIDO / APELLIDO / NOMBRES -> NOMBRES APELLIDO APELLIDO", () => {
    expect(normalizeTeacherName("DIEZ QUI&Ntilde;ONES / PANDURO / PERCY")).toBe("PERCY DIEZ QUIÑONES PANDURO");
    expect(normalizeTeacherName("MORE / SANCHEZ / JAVIER")).toBe("JAVIER MORE SANCHEZ");
    expect(normalizeTeacherName("  ")).toBe("");
  });
});

describe("parseHorario", () => {
  test("ignora las 72 celdas con title vacio y toma solo las 24 con clase", () => {
    const r = parseHorario(layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 24 celdas de clase que se fusionan en bloques contiguos por curso/dia/aula.
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data.length).toBeLessThan(24);
    for (const s of r.data) {
      expect(s.dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(s.dayOfWeek).toBeLessThanOrEqual(6);
      expect(s.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(s.endTime).toMatch(/^\d{2}:\d{2}$/);
      expect(s.startTime < s.endTime).toBe(true);
    }
  });

  test("fusiona bloques consecutivos del mismo curso, dia y aula", () => {
    const r = parseHorario(layout);
    if (!r.ok) throw new Error("parser fallo");
    // 650033 va martes 7-8 y 8-9 en N-405 => un solo bloque 07:00-09:00.
    const bloque = r.data.find((s) => s.courseCode === "650033" && s.dayOfWeek === 2);
    expect(bloque).toBeDefined();
    expect(bloque?.startTime).toBe("07:00");
    expect(bloque?.endTime).toBe("09:00");
    expect(bloque?.classroom).toBe("N-405");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/parsers.horario.test.ts`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Implementar `aula-virtual.ts`**

```ts
// src/modules/portal-sync/parsers/aula-virtual.ts
import { clean, stripTags, tdsOf, trsOf, type ParseResult } from "./html.js";
import type { AulaVirtualRow } from "../portal-sync.types.js";

/** "DIEZ QUIÑONES / PANDURO / PERCY" -> "PERCY DIEZ QUIÑONES PANDURO". */
export const normalizeTeacherName = (raw: string): string => {
  const parts = clean(raw).split("/").map((p) => clean(p)).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  const nombres = parts[parts.length - 1];
  const apellidos = parts.slice(0, -1).join(" ");
  return clean(`${nombres} ${apellidos}`).toUpperCase();
};

/**
 * Bloque "Aula Virtual" de layout.jsp: Código | Nombre (+ docente en <br>) | Sección | Sílabo.
 * Es la fuente del NOMBRE COMPLETO del curso (el récord y el horario lo traen truncado a 20).
 */
export const parseAulaVirtual = (html: string): ParseResult<AulaVirtualRow[]> => {
  const out: AulaVirtualRow[] = [];
  for (const tr of trsOf(html)) {
    const tds = tdsOf(tr);
    if (tds.length < 3) continue;
    const code = clean(stripTags(tds[0]));
    if (!/^\d{4,6}$/.test(code)) continue;
    // La 2a celda trae "NOMBRE<br>APELLIDO / APELLIDO / NOMBRES" dentro de <font> anidados.
    const inner = tds[1].replace(/<br\s*\/?>/gi, "|");
    const [nombreRaw, docenteRaw = ""] = clean(stripTags(inner)).split("|");
    const section = clean(stripTags(tds[2]));
    if (!/^\d{1,4}$/.test(section)) continue;
    out.push({
      courseCode: code,
      courseName: clean(nombreRaw),
      sectionCode: section,
      teacherName: normalizeTeacherName(docenteRaw),
    });
  }
  if (!out.length) return { ok: false, reason: "no se encontró el bloque Aula Virtual" };
  return { ok: true, data: out };
};
```

- [ ] **Step 4: Implementar `horario.ts`**

```ts
// src/modules/portal-sync/parsers/horario.ts
import { clean, stripTags, tdsOf, trsOf, type ParseResult } from "./html.js";
import type { HorarioSession } from "../portal-sync.types.js";

const hhmm = (h: number): string => `${String(h).padStart(2, "0")}:00`;

interface Cell { courseCode: string; dayOfWeek: number; hour: number; classroom: string | null }

/**
 * Tabla de horario: 16 franjas ("7-8" … "22-23") x 6 días (Lun..Sab) = 96 celdas.
 * OJO: el portal emite el atributo `title` en LAS 96, vacío en las libres
 * (`<font ... size="1" title>`). Su sola presencia NO indica clase: solo cuenta
 * `title` con valor que empiece por el código de curso.
 */
export const parseHorario = (html: string): ParseResult<HorarioSession[]> => {
  const cells: Cell[] = [];

  for (const tr of trsOf(html)) {
    const tds = tdsOf(tr);
    if (tds.length < 7) continue;
    const hourLabel = clean(stripTags(tds[0]));
    const hm = hourLabel.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!hm) continue;
    const hour = Number.parseInt(hm[1], 10);

    for (let d = 1; d <= 6 && d < tds.length; d++) {
      const titleAttr = tds[d].match(/title\s*=\s*"([^"]*)"/i)?.[1];
      if (!titleAttr) continue;                       // title sin valor => celda libre
      const t = clean(titleAttr);
      const cm = t.match(/^(\d{4,6})\s+\S/);
      if (!cm) continue;
      // El aula es la última línea de la celda, tras el <br> que sigue al </small>.
      const afterSmall = tds[d].split(/<\/small>/i).pop() ?? "";
      const classroom = clean(stripTags(afterSmall)) || null;
      cells.push({ courseCode: cm[1], dayOfWeek: d, hour, classroom });
    }
  }

  if (!cells.length) return { ok: false, reason: "no se encontró la tabla de horario" };

  // Fusión de bloques contiguos del mismo curso, día y aula.
  cells.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.courseCode.localeCompare(b.courseCode) || a.hour - b.hour);
  const out: HorarioSession[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (
      last &&
      last.courseCode === c.courseCode &&
      last.dayOfWeek === c.dayOfWeek &&
      last.classroom === c.classroom &&
      last.endTime === hhmm(c.hour)
    ) {
      last.endTime = hhmm(c.hour + 1);
      continue;
    }
    out.push({
      courseCode: c.courseCode,
      dayOfWeek: c.dayOfWeek,
      startTime: hhmm(c.hour),
      endTime: hhmm(c.hour + 1),
      classroom: c.classroom,
    });
  }
  return { ok: true, data: out };
};
```

- [ ] **Step 5: Verificar que pasa**

Run: `bun test test/HU31_jeff/parsers.horario.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/modules/portal-sync/parsers test/HU31_jeff
git commit -m "feat(portal-sync): parsers de aula virtual y horario con fusion de bloques"
```

---

### Task 4: Parser del récord académico

**Files:**
- Create: `src/modules/portal-sync/parsers/record.ts`
- Test: `test/HU31_jeff/parsers.record.test.ts`

**Interfaces:**
- Consumes: `clean`, `stripTags`, `ParseResult`, `RecordRow`.
- Produces: `parseRecordAcademico(html: string): ParseResult<RecordRow[]>`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/parsers.record.test.ts
import { describe, expect, test } from "bun:test";
import { parseRecordAcademico } from "../../src/modules/portal-sync/parsers/record.js";

const record = await Bun.file("test/HU31_jeff/fixtures/record.html").text();

describe("parseRecordAcademico", () => {
  test("arrastra el ciclo cuando la celda viene vacia en las filas siguientes", () => {
    const r = parseRecordAcademico(record);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.every((x) => /^\d{4}-[0-2]$/.test(x.periodCode))).toBe(true);
    // 2023-1 tiene 6 cursos y solo la primera fila trae el ciclo.
    expect(r.data.filter((x) => x.periodCode === "2023-1")).toHaveLength(6);
  });

  test("lee nota numerica y deja null cuando la celda esta vacia", () => {
    const r = parseRecordAcademico(record);
    if (!r.ok) throw new Error("parser fallo");
    const etica = r.data.find((x) => x.courseCode === "510002");
    expect(etica?.grade).toBe(18);
    expect(etica?.credits).toBe(1);
    // Los cursos del ciclo en curso (2026-2) no tienen nota todavía.
    const enCurso = r.data.filter((x) => x.periodCode === "2026-2");
    expect(enCurso).toHaveLength(5);
    expect(enCurso.every((x) => x.grade === null)).toBe(true);
  });

  test("no confunde TOMO/FOLIO con la nota", () => {
    const r = parseRecordAcademico(record);
    if (!r.ok) throw new Error("parser fallo");
    expect(r.data.every((x) => x.grade === null || (x.grade >= 0 && x.grade <= 20))).toBe(true);
  });

  test("falla con ok:false si no hay filas", () => {
    expect(parseRecordAcademico("<html></html>").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/parsers.record.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

```ts
// src/modules/portal-sync/parsers/record.ts
import { cellsOf, trsOf, type ParseResult } from "./html.js";
import type { RecordRow } from "../portal-sync.types.js";

/**
 * Récord académico. Columnas reales:
 * CICLO | COD. | ASIGNATURA | VIG. | FAC. | VEZ | CRD. | NOTA | SEC. | TOMO | FOLIO | OBSERVACIÓN
 * La celda CICLO SOLO trae valor en la primera fila de cada grupo (&nbsp; en las
 * demás): se arrastra el último valor no vacío.
 */
export const parseRecordAcademico = (html: string): ParseResult<RecordRow[]> => {
  const out: RecordRow[] = [];
  let currentPeriod = "";

  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    if (cells.length < 9) continue;

    const cicloCell = cells[0];
    if (/^\d{4}-[0-2]$/.test(cicloCell)) currentPeriod = cicloCell;
    if (!currentPeriod) continue;

    const courseCode = cells[1];
    if (!/^\d{4,6}$/.test(courseCode)) continue;

    const gradeRaw = cells[7];
    const gradeNum = Number.parseInt(gradeRaw, 10);
    const grade = /^\d{1,2}$/.test(gradeRaw) && gradeNum >= 0 && gradeNum <= 20 ? gradeNum : null;

    out.push({
      periodCode: currentPeriod,
      courseCode,
      courseName: cells[2],
      attempt: Number.parseInt(cells[5], 10) || 1,
      credits: Math.ceil(Number.parseFloat(cells[6]) || 0),
      grade,
      sectionCode: cells[8],
    });
  }

  if (!out.length) return { ok: false, reason: "no se encontraron filas de récord" };
  return { ok: true, data: out };
};
```

- [ ] **Step 4: Verificar que pasa**

Run: `bun test test/HU31_jeff/parsers.record.test.ts`
Expected: PASS (4 tests). Si los índices de columna no calzan, corregirlos **contando las `<td>` del fixture**, no adivinando.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/parsers/record.ts test/HU31_jeff/parsers.record.test.ts
git commit -m "feat(portal-sync): parser de record academico con arrastre de ciclo"
```

---

### Task 5: Parsers de información académica e impedimentos, e índice de parsers

**Files:**
- Create: `src/modules/portal-sync/parsers/info-academica.ts`
- Create: `src/modules/portal-sync/parsers/index.ts`
- Test: `test/HU31_jeff/parsers.info.test.ts`

**Interfaces:**
- Consumes: `clean`, `stripTags`, `ParseResult`, `InfoAcademica`, `Impedimentos`.
- Produces: `parseInfoAcademica(html): ParseResult<InfoAcademica>`, `parseImpedimentos(html): Impedimentos`, y un `index.ts` que reexporta todos los parsers.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/parsers.info.test.ts
import { describe, expect, test } from "bun:test";
import { parseImpedimentos, parseInfoAcademica } from "../../src/modules/portal-sync/parsers/info-academica.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();

describe("parseInfoAcademica", () => {
  test("lee la carrera del bloque de informacion academica", () => {
    const r = parseInfoAcademica(layout);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.careerName).toBe("INGENIERÍA DE SISTEMAS");
  });

  test("no extrae PPA ni ubicacion relativa (decision 2: descartados)", () => {
    const r = parseInfoAcademica(layout);
    if (!r.ok) throw new Error("parser fallo");
    expect(Object.keys(r.data).sort()).toEqual(["careerName", "lastPeriodLevel"]);
  });
});

describe("parseImpedimentos", () => {
  test("detecta impedimento y deuda del bloque de matricula", () => {
    const r = parseImpedimentos(layout);
    expect(r.hasImpediment).toBe(true);
    expect(r.hasDebt).toBe(true);
    expect(r.text.length).toBeGreaterThan(0);
  });

  test("sin rotulos devuelve todo en false", () => {
    const r = parseImpedimentos("<html>nada</html>");
    expect(r.hasImpediment).toBe(false);
    expect(r.hasDebt).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/parsers.info.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar**

```ts
// src/modules/portal-sync/parsers/info-academica.ts
import { clean, stripTags, type ParseResult } from "./html.js";
import type { Impedimentos, InfoAcademica } from "../portal-sync.types.js";

/**
 * Bloque "Información Académica". Los sub-bloques "Información General" e
 * "Información por Período" son dos tablas de marcado IDÉNTICO separadas solo
 * por su rótulo de texto: hay que anclarse en el rótulo, no en el orden.
 * PPA y ubicación relativa NO se extraen (decisión 2 de la spec: descartados).
 */
export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica> => {
  const text = clean(stripTags(html));
  const careerName = text.match(/Informaci[óo]n Acad[ée]mica\s+([A-ZÁÉÍÓÚÑ .]{5,60}?)\s+-\s*Informaci[óo]n General/i)?.[1];
  const level = text.match(/Informaci[óo]n por Per[ií]odo[\s\S]{0,400}?Nivel[\s\S]{0,200}?\b(\d{1,2})\b/i)?.[1];
  const lastPeriodLevel = level ? Number.parseInt(level, 10) : null;
  if (!careerName && lastPeriodLevel === null) {
    return { ok: false, reason: "no se encontró el bloque Información Académica" };
  }
  return { ok: true, data: { careerName: careerName ? clean(careerName) : null, lastPeriodLevel } };
};

/** Bloque "Información para Matrícula": impedimentos y deuda. Nunca falla. */
export const parseImpedimentos = (html: string): Impedimentos => {
  const text = clean(stripTags(html));
  const hasImpediment = /TIENES\s+IMPEDIMENTOS?\s+PARA\s+MATR[ÍI]CULA/i.test(text);
  const hasDebt = /DEUDA\s*:?\s*Registra\s+deuda/i.test(text);
  const frag = text.match(/(TIENES\s+IMPEDIMENTOS[\s\S]{0,180}|DEUDA\s*:?\s*Registra[\s\S]{0,120})/i)?.[1] ?? "";
  return { hasImpediment, hasDebt, text: clean(frag) };
};
```

```ts
// src/modules/portal-sync/parsers/index.ts
export * from "./html.js";
export { parseCicloActivo } from "./ciclo.js";
export { parseConsolidadoMatricula } from "./matricula.js";
export { parseAulaVirtual, normalizeTeacherName } from "./aula-virtual.js";
export { parseHorario } from "./horario.js";
export { parseRecordAcademico } from "./record.js";
export { parseImpedimentos, parseInfoAcademica } from "./info-academica.js";
```

- [ ] **Step 4: Verificar que pasa**

Run: `bun test test/HU31_jeff/`
Expected: PASS — todos los tests de parsers.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/parsers test/HU31_jeff
git commit -m "feat(portal-sync): parsers de informacion academica e impedimentos"
```

---

### Task 6: Migración `enrollment.final_grade` (decisión 1, aprobada)

**Files:**
- Modify: `src/db/schema/schema.ts` (tabla `enrollment`, ~línea 303)
- Create: `drizzle/0004_portal_sync_final_grade.sql` (generado por drizzle-kit)
- Test: `test/HU31_jeff/schema.final-grade.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: columna `enrollment.final_grade decimal(4,2) NULL` con `chk_enrollment_final_grade` (`NULL` o entre 0 y 20), expuesta en Drizzle como `enrollment.finalGrade`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/schema.final-grade.test.ts
import { describe, expect, test } from "bun:test";
import { enrollment } from "../../src/db/schema/schema.js";

describe("enrollment.final_grade", () => {
  test("la columna existe en el esquema Drizzle", () => {
    expect(Object.keys(enrollment)).toContain("finalGrade");
  });

  test("mapea a la columna final_grade y admite null", () => {
    const col = (enrollment as unknown as Record<string, { name: string; notNull: boolean }>).finalGrade;
    expect(col.name).toBe("final_grade");
    expect(col.notNull).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/schema.final-grade.test.ts`
Expected: FAIL — `finalGrade` no existe.

- [ ] **Step 3: Agregar la columna al esquema**

En `src/db/schema/schema.ts`, dentro de `export const enrollment = pgTable("enrollment", {...})`, después de `totalHours`:

```ts
  // Nota final OFICIAL del curso, tal como la publica el récord académico del
  // portal (portal-sync). Nullable: los ciclos en curso no tienen nota todavía.
  // No sustituye a student_score (nota por evaluación) ni a simulated_grades.
  finalGrade: decimal("final_grade", { precision: 4, scale: 2 }),
```

Y en el bloque de constraints de esa misma tabla:

```ts
  chkEnrollmentFinalGrade: check(
    "chk_enrollment_final_grade",
    sql`${t.finalGrade} IS NULL OR ${t.finalGrade} BETWEEN 0 AND 20`,
  ),
```

- [ ] **Step 4: Generar la migración**

```bash
bun run db:generate
```

Expected: se crea `drizzle/0004_*.sql` con `ALTER TABLE "enrollment" ADD COLUMN "final_grade" numeric(4, 2);` y el `CHECK`. Renombrarlo a `drizzle/0004_portal_sync_final_grade.sql` si drizzle-kit le puso nombre aleatorio, y actualizar `drizzle/meta/_journal.json` si el renombrado lo requiere.

- [ ] **Step 5: Verificar que pasa y que compila**

```bash
bun test test/HU31_jeff/schema.final-grade.test.ts && bun run build
```
Expected: PASS y compilación sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/schema.ts drizzle test/HU31_jeff/schema.final-grade.test.ts
git commit -m "feat(portal-sync): columna enrollment.final_grade con migracion 0004"
```

> **No aplicar la migración a la base todavía.** `bun run db:apply` se ejecuta en la Tarea 13, junto con la verificación end-to-end, y requiere confirmación del owner.

---

### Task 7: Configuración y cliente HTTP del portal

**Files:**
- Modify: `src/config/env.ts`
- Modify: `src/config/app-config.ts`
- Create: `src/services/portal.client.ts`
- Test: `test/HU31_jeff/portal.client.test.ts`

**Interfaces:**
- Consumes: `config`, `HttpError`.
- Produces: `PortalClient` con
  `fetchPage(path: string, cookies: PortalCookies): Promise<string>`,
  `fetchAll(cociclo: string, cookies: PortalCookies): Promise<{ layout: string; matricula: string; record: string; datosPersonales: string }>`,
  `logout(cookies: PortalCookies): Promise<void>`,
  y la constante exportada `PORTAL_PATHS`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/portal.client.test.ts
import { describe, expect, test } from "bun:test";
import { PortalClient } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

const clientWith = (impl: (url: string) => Promise<Response>) =>
  new PortalClient("https://webaloe.ulima.edu.pe", 8000, impl as unknown as typeof fetch);

describe("PortalClient", () => {
  test("manda las cookies y no sigue redirecciones", async () => {
    let seen = "";
    const c = clientWith(async (url) => {
      seen = url;
      return new Response("<html>ok</html>", { status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" } });
    });
    const html = await c.fetchPage("layout.jsp", cookies);
    expect(html).toContain("ok");
    expect(seen).toBe("https://webaloe.ulima.edu.pe/portalUL/layout.jsp");
  });

  test("302 hacia inicio.jsp => 409 PORTAL_SESSION_INVALID", async () => {
    const c = clientWith(async () =>
      new Response(null, { status: 302, headers: { Location: "https://webaloe.ulima.edu.pe/portalUL/inicio.jsp" } }));
    await expect(c.fetchPage("layout.jsp", cookies)).rejects.toMatchObject({ statusCode: 409, code: "PORTAL_SESSION_INVALID" });
  });

  test("cuerpo con solicitarValidarToken => 409 PORTAL_SESSION_INVALID", async () => {
    const c = clientWith(async () => new Response("<html>solicitarValidarToken</html>", { status: 200 }));
    await expect(c.fetchPage("layout.jsp", cookies)).rejects.toMatchObject({ statusCode: 409 });
  });

  test("5xx => 502 PORTAL_UNAVAILABLE", async () => {
    const c = clientWith(async () => new Response("boom", { status: 503 }));
    await expect(c.fetchPage("layout.jsp", cookies)).rejects.toMatchObject({ statusCode: 502, code: "PORTAL_UNAVAILABLE" });
  });

  test("decodifica ISO-8859-1 segun el Content-Type", async () => {
    const bytes = new Uint8Array([0x49, 0x4e, 0x47, 0x2e, 0xd1]); // "ING.Ñ" en latin1
    const c = clientWith(async () =>
      new Response(bytes, { status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" } }));
    expect(await c.fetchPage("layout.jsp", cookies)).toBe("ING.Ñ");
  });

  test("el error nunca lleva HTML del portal en el mensaje", async () => {
    const c = clientWith(async () => new Response("<html>SECRETO 12345678</html>", { status: 500 }));
    const err = await c.fetchPage("layout.jsp", cookies).catch((e) => e as HttpError);
    expect(err.message).not.toContain("SECRETO");
  });

  test("rechaza un cociclo que no sea de 5 digitos", async () => {
    const c = clientWith(async () => new Response("ok", { status: 200 }));
    await expect(c.fetchAll("../evil", cookies)).rejects.toMatchObject({ code: "PORTAL_UNAVAILABLE" });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/portal.client.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Agregar las variables de entorno**

En `src/config/env.ts`, dentro de `envSchema`, junto a las de chatbot:

```ts
  // portal-sync (miUlima). Host FIJO por seguridad: si se cambia, debe seguir
  // siendo webaloe.ulima.edu.pe; cualquier otro valor es rechazado (anti-SSRF).
  PORTAL_BASE_URL: z.string().url().optional().default("https://webaloe.ulima.edu.pe")
    .refine((v) => new URL(v).host === "webaloe.ulima.edu.pe", "PORTAL_BASE_URL debe apuntar a webaloe.ulima.edu.pe"),
  PORTAL_TIMEOUT_MS: z.string().optional().transform((v) => {
    const n = parseInt(v ?? "8000", 10);
    return Number.isInteger(n) && n > 0 ? n : 8000;
  }),
```

En `src/config/app-config.ts`, dentro de `config`:

```ts
  portal: {
    baseUrl: env.PORTAL_BASE_URL,
    timeoutMs: env.PORTAL_TIMEOUT_MS,
  },
```

- [ ] **Step 4: Implementar el cliente**

```ts
// src/services/portal.client.ts
import { config } from "../config/app-config.js";
import { HttpError } from "../shared/errors/http-error.js";
import type { PortalCookies } from "../modules/portal-sync/portal-sync.types.js";

const ROOT = "/portalUL/";
const UA = "Mozilla/5.0 (compatible; ULimaPlus/1.0)";

/** Rutas fijas. Lo único interpolado es el COCICLO, validado como ^\d{5}$. */
export const PORTAL_PATHS = {
  layout: "layout.jsp",
  matricula: (cociclo: string) => `gama/servlets/ComandoMostrarConsMatr?COCICLO=${cociclo}&Fg=1`,
  record: "gada/servlets/ComandoListarRecordAcademico?ac=1",
  datosPersonales: "ul/servlets/ComandoVisualizarDatosPersonales",
  logout: "servlets/CustomLogoutServlet",
} as const;

const sessionInvalid = () =>
  new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");

export class PortalClient {
  constructor(
    private readonly baseUrl: string = config.portal.baseUrl,
    private readonly timeoutMs: number = config.portal.timeoutMs,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private cookieHeader(c: PortalCookies): string {
    const parts = [`JSESSIONID=${c.JSESSIONID}`, `LtpaToken2=${c.LtpaToken2}`];
    if (c.LtpaToken) parts.push(`LtpaToken=${c.LtpaToken}`);
    return parts.join("; ");
  }

  async fetchPage(path: string, cookies: PortalCookies): Promise<string> {
    const url = `${this.baseUrl}${ROOT}${path}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",                       // un 302 a inicio.jsp = sesión inválida
        signal: ac.signal,
        headers: { Cookie: this.cookieHeader(cookies), "User-Agent": UA, Accept: "text/html,*/*;q=0.8" },
      });
    } catch (e) {
      // Nunca propagamos el error original: puede llevar cabeceras o cuerpo.
      const aborted = (e as Error)?.name === "AbortError";
      throw aborted
        ? new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT")
        : new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }

    const location = res.headers.get("Location") ?? "";
    if (res.status >= 300 && res.status < 400) {
      if (/inicio\.jsp|solicitarValidarToken/i.test(location)) throw sessionInvalid();
      throw new HttpError(502, "Respuesta inesperada de miUlima.", "PORTAL_UNAVAILABLE");
    }
    if (res.status >= 500) throw new HttpError(502, "miUlima devolvió un error.", "PORTAL_UNAVAILABLE");
    if (res.status !== 200) throw new HttpError(502, "Respuesta inesperada de miUlima.", "PORTAL_UNAVAILABLE");

    const charset = res.headers.get("Content-Type")?.match(/charset=([\w-]+)/i)?.[1] ?? "ISO-8859-1";
    const buf = await res.arrayBuffer();
    let html: string;
    try {
      html = new TextDecoder(charset).decode(buf);
    } catch {
      html = new TextDecoder("iso-8859-1").decode(buf);
    }
    if (/solicitarValidarToken|j_security_check/i.test(html)) throw sessionInvalid();
    return html;
  }

  /** layout.jsp ya fue descargado por el service (de ahí sale el COCICLO). */
  async fetchAll(cociclo: string, cookies: PortalCookies) {
    if (!/^\d{5}$/.test(cociclo)) {
      throw new HttpError(502, "Ciclo del portal con formato inesperado.", "PORTAL_UNAVAILABLE");
    }
    const [matricula, record, datosPersonales] = await Promise.all([
      this.fetchPage(PORTAL_PATHS.matricula(cociclo), cookies),
      this.fetchPage(PORTAL_PATHS.record, cookies),
      this.fetchPage(PORTAL_PATHS.datosPersonales, cookies),
    ]);
    return { matricula, record, datosPersonales };
  }

  /** Best effort: cerrar la sesión del portal nunca debe romper la importación. */
  async logout(cookies: PortalCookies): Promise<void> {
    try {
      await this.fetchPage(PORTAL_PATHS.logout, cookies);
    } catch {
      /* ignorado a propósito */
    }
  }
}

export const portalClient = new PortalClient();
```

- [ ] **Step 5: Verificar que pasa**

Run: `bun test test/HU31_jeff/portal.client.test.ts && bun run build`
Expected: PASS (7 tests) y compilación limpia.

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts src/config/app-config.ts src/services/portal.client.ts test/HU31_jeff/portal.client.test.ts
git commit -m "feat(portal-sync): cliente HTTP del portal con allowlist, timeout y deteccion de sesion invalida"
```

---

### Task 8: Repository — período académico y semanas

**Files:**
- Create: `src/modules/portal-sync/portal-sync.repository.ts`
- Test: `test/HU31_jeff/repository.period.test.ts`

**Interfaces:**
- Consumes: `db`.
- Produces: `PortalSyncRepository` con `runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>`, `upsertPeriod(tx, code, activate)`, `ensureAcademicWeeks(tx, periodId, startDate)`, `findActivePeriod(): Promise<{id:number; code:string} | null>`, `findUserCode(userId)`, `countEnrollmentsInPeriod(studentId, periodId)`, y las funciones puras `defaultPeriodDates(code)` y `periodCodeIsNewer(incoming, current)`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/repository.period.test.ts
import { describe, expect, test } from "bun:test";
import { defaultPeriodDates, periodCodeIsNewer } from "../../src/modules/portal-sync/portal-sync.repository.js";

describe("defaultPeriodDates", () => {
  test("ciclo 1 va de marzo a julio", () => {
    expect(defaultPeriodDates("2026-1")).toEqual({ start: "2026-03-15", end: "2026-07-31" });
  });
  test("ciclo 2 va de agosto a diciembre", () => {
    expect(defaultPeriodDates("2026-2")).toEqual({ start: "2026-08-01", end: "2026-12-20" });
  });
  test("ciclo 0 es el de verano", () => {
    expect(defaultPeriodDates("2026-0")).toEqual({ start: "2026-01-05", end: "2026-02-28" });
  });
});

describe("periodCodeIsNewer", () => {
  test("2026-2 avanza sobre 2026-1", () => {
    expect(periodCodeIsNewer("2026-2", "2026-1")).toBe(true);
  });
  test("2025-2 NO retrocede sobre 2026-1", () => {
    expect(periodCodeIsNewer("2025-2", "2026-1")).toBe(false);
  });
  test("el mismo codigo cuenta como activable", () => {
    expect(periodCodeIsNewer("2026-1", "2026-1")).toBe(true);
  });
  test("sin periodo activo previo siempre activa", () => {
    expect(periodCodeIsNewer("2026-2", null)).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/repository.period.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar la primera parte del repository**

```ts
// src/modules/portal-sync/portal-sync.repository.ts
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";

/** Transacción de Drizzle/postgres-js; se tipa laxo para no acoplar a la versión. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Fechas por defecto de un período que el portal no tiene documentado. */
export const defaultPeriodDates = (code: string): { start: string; end: string } => {
  const [year, n] = code.split("-");
  if (n === "1") return { start: `${year}-03-15`, end: `${year}-07-31` };
  if (n === "2") return { start: `${year}-08-01`, end: `${year}-12-20` };
  return { start: `${year}-01-05`, end: `${year}-02-28` };
};

/** El ciclo global solo AVANZA: nunca se retrocede por la importación de un alumno. */
export const periodCodeIsNewer = (incoming: string, current: string | null): boolean =>
  current === null || incoming >= current;

export class PortalSyncRepository {
  constructor(readonly database: typeof db) {}

  /** Única puerta de entrada a la transacción; el service nunca abre una. */
  async runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return await this.database.transaction(fn);
  }

  async findActivePeriod(): Promise<{ id: number; code: string } | null> {
    const rows = (await this.database.execute(sql`
      select id, code from academic_period where is_active = true limit 1
    `)) as unknown as Array<{ id: number; code: string }>;
    return rows[0] ? { id: Number(rows[0].id), code: rows[0].code } : null;
  }

  async findUserCode(userId: number): Promise<string | null> {
    const rows = (await this.database.execute(sql`
      select code, full_name as "fullName" from app_user where id = ${userId} limit 1
    `)) as unknown as Array<{ code: string; fullName: string }>;
    return rows[0]?.code ?? null;
  }

  async countEnrollmentsInPeriod(studentId: number, periodId: number): Promise<number> {
    const rows = (await this.database.execute(sql`
      select count(*)::int as n
      from enrollment e
      join section s on s.id = e.section_id
      join course_offering co on co.id = s.course_offering_id
      where e.student_id = ${studentId} and co.academic_period_id = ${periodId} and e.status = 'active'
    `)) as unknown as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Período. `uq_academic_period_single_active` es un índice único PARCIAL y NO
   * diferible: PostgreSQL lo evalúa fila a fila, así que primero hay que
   * DESACTIVAR y recién después insertar/activar. Invertir el orden hace fallar
   * con 23505 la primera importación de cada ciclo nuevo.
   */
  async upsertPeriod(tx: Tx, code: string, activate: boolean) {
    const { start, end } = defaultPeriodDates(code);

    if (activate) {
      await tx.execute(sql`
        update academic_period set is_active = false where is_active = true and code <> ${code}
      `);
    }

    const rows = (await tx.execute(sql`
      insert into academic_period (code, start_date, end_date, is_active)
      values (${code}, ${start}::date, ${end}::date, ${activate})
      on conflict (code) do update set is_active = ${activate}
      returning id, code, (xmax = 0) as "created", start_date as "startDate"
    `)) as unknown as Array<{ id: number; code: string; created: boolean; startDate: string }>;

    const row = rows[0];
    return {
      id: Number(row.id),
      code: row.code,
      created: Boolean(row.created),
      datesDefaulted: Boolean(row.created),
      startDate: String(row.startDate),
    };
  }

  /** 17 semanas del período. Sin ellas, schedule y chatbot no resuelven "semana N". */
  async ensureAcademicWeeks(tx: Tx, periodId: number, startDate: string): Promise<void> {
    await tx.execute(sql`
      insert into academic_week (academic_period_id, week_number, start_date, end_date)
      select ${periodId}, gs,
             (${startDate}::date + ((gs - 1) * 7))::date,
             (${startDate}::date + ((gs - 1) * 7) + 6)::date
      from generate_series(1, 17) as gs
      on conflict (academic_period_id, week_number) do nothing
    `);
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `bun test test/HU31_jeff/repository.period.test.ts && bun run build`
Expected: PASS (7 tests) y compilación limpia.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/portal-sync.repository.ts test/HU31_jeff/repository.period.test.ts
git commit -m "feat(portal-sync): repository de periodo academico con orden obligatorio de is_active"
```

---

### Task 9: Repository — catálogo compartido (cursos, docentes, ofertas, secciones, horario)

**Files:**
- Modify: `src/modules/portal-sync/portal-sync.repository.ts`
- Test: `test/HU31_jeff/repository.catalog.test.ts`

**Interfaces:**
- Consumes: `Tx`, tipos `MatriculaRow`, `AulaVirtualRow`, `HorarioSession`.
- Produces, dentro de `PortalSyncRepository`: `teacherCodeFor(fullName): string`, `upsertTeacher(tx, fullName)`, `upsertCourse(tx, code, name, credits)`, `upsertOffering(tx, periodId, courseId, credits)`, `upsertSection(tx, offeringId, code, teacherId)`, `upsertScheduleSession(tx, sectionId, s)`. Todos devuelven `{ id: number; created: boolean }` salvo el de horario, que devuelve `void`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/repository.catalog.test.ts
import { describe, expect, test } from "bun:test";
import { teacherCodeFor } from "../../src/modules/portal-sync/portal-sync.repository.js";

describe("teacherCodeFor", () => {
  test("genera una clave natural estable y unica por docente", () => {
    expect(teacherCodeFor("PERCY DIEZ QUIÑONES PANDURO")).toBe("PORTAL:PERCY-DIEZ-QUINONES-PANDURO");
    expect(teacherCodeFor("  javier   more  sanchez ")).toBe("PORTAL:JAVIER-MORE-SANCHEZ");
  });

  test("el mismo nombre con distinto espaciado o acentos da la misma clave", () => {
    expect(teacherCodeFor("JOSÉ RAÚL DIAZ PARRA")).toBe(teacherCodeFor("JOSE  RAUL DIAZ PARRA"));
  });

  test("sin nombre devuelve el placeholder", () => {
    expect(teacherCodeFor("")).toBe("PORTAL:SIN-DOCENTE");
  });

  test("respeta el limite de 50 caracteres de teacher_code", () => {
    const largo = teacherCodeFor("MARIA DE LOS ANGELES FERNANDEZ DE LA TORRE Y QUISPE");
    expect(largo.length).toBeLessThanOrEqual(50);
    expect(largo.startsWith("PORTAL:")).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/repository.catalog.test.ts`
Expected: FAIL — `teacherCodeFor` no existe.

- [ ] **Step 3: Implementar**

Agregar en `src/modules/portal-sync/portal-sync.repository.ts`, antes de la clase:

```ts
/**
 * `teacher` NO tiene UNIQUE sobre full_name, así que no admite ON CONFLICT por
 * nombre. Se deriva una clave natural sintética sobre teacher_code (que sí es
 * unique) para poder hacer upsert atómico y no duplicar docentes cuando dos
 * alumnos de la misma sección importan a la vez.
 */
export const teacherCodeFor = (fullName: string): string => {
  const slug = (fullName ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return "PORTAL:SIN-DOCENTE";
  return `PORTAL:${slug}`.slice(0, 50).replace(/-+$/, "");
};

export const PLACEHOLDER_TEACHER = "DOCENTE POR ASIGNAR";
```

Y dentro de la clase `PortalSyncRepository`:

```ts
  async upsertTeacher(tx: Tx, fullName: string) {
    const name = fullName || PLACEHOLDER_TEACHER;
    const rows = (await tx.execute(sql`
      insert into teacher (teacher_code, full_name)
      values (${teacherCodeFor(fullName)}, ${name})
      on conflict (teacher_code) do update set full_name = excluded.full_name
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** `name` es NOT NULL: se actualiza solo si el entrante es MÁS LARGO (menos truncado). */
  async upsertCourse(tx: Tx, code: string, name: string, credits: number) {
    const credit = Math.max(1, Math.ceil(credits || 0));   // chk_course_default_credit > 0
    const rows = (await tx.execute(sql`
      insert into course (code, name, default_credit)
      values (${code}, ${name}, ${credit})
      on conflict (code) do update
        set name = case when length(excluded.name) > length(course.name) then excluded.name else course.name end
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** total_hours = créditos x 16: attendance-risk descarta secciones con total_hours <= 0. */
  async upsertOffering(tx: Tx, periodId: number, courseId: number, credits: number) {
    const hours = Math.max(1, Math.ceil(credits || 0)) * 16;
    const rows = (await tx.execute(sql`
      insert into course_offering (academic_period_id, course_id, total_hours)
      values (${periodId}, ${courseId}, ${hours})
      on conflict (academic_period_id, course_id) do update
        set total_hours = greatest(course_offering.total_hours, excluded.total_hours)
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** El docente solo se pisa si el guardado es el placeholder. jp_id nunca se toca. */
  async upsertSection(tx: Tx, offeringId: number, code: string, teacherId: number) {
    const rows = (await tx.execute(sql`
      insert into section (course_offering_id, code, teacher_id)
      values (${offeringId}, ${code}, ${teacherId})
      on conflict (course_offering_id, code) do update
        set teacher_id = case
          when (select t.teacher_code from teacher t where t.id = section.teacher_id) = 'PORTAL:SIN-DOCENTE'
          then excluded.teacher_id else section.teacher_id end
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  /** uq_schedule_session es de TRES columnas: (section_id, day_of_week, start_time). */
  async upsertScheduleSession(
    tx: Tx,
    sectionId: number,
    s: { dayOfWeek: number; startTime: string; endTime: string; classroom: string | null },
  ): Promise<void> {
    await tx.execute(sql`
      insert into schedule_session (section_id, day_of_week, start_time, end_time, classroom)
      values (${sectionId}, ${s.dayOfWeek}, ${s.startTime}::time, ${s.endTime}::time, ${s.classroom})
      on conflict (section_id, day_of_week, start_time) do update
        set end_time = excluded.end_time, classroom = excluded.classroom
    `);
  }
```

- [ ] **Step 4: Verificar que pasa**

Run: `bun test test/HU31_jeff/repository.catalog.test.ts && bun run build`
Expected: PASS (4 tests) y compilación limpia.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/portal-sync.repository.ts test/HU31_jeff/repository.catalog.test.ts
git commit -m "feat(portal-sync): upserts atomicos de curso, docente, oferta, seccion y horario"
```

---

### Task 10: Repository — datos del alumno (matrícula, progreso, alerta)

**Files:**
- Modify: `src/modules/portal-sync/portal-sync.repository.ts`
- Test: `test/HU31_jeff/repository.student.test.ts`

**Interfaces:**
- Consumes: `Tx`.
- Produces: `upsertEnrollment(tx, studentId, sectionId, finalGrade)`, `withdrawMissingEnrollments(tx, studentId, periodId, keepSectionIds): Promise<number>`, `countActiveEnrollments(tx, studentId): Promise<number>`, `findCurriculumCourseId(tx, curriculumId, courseCode): Promise<number | null>`, `upsertProgress(tx, studentId, curriculumId, curriculumCourseId, status)`, `upsertImpedimentAlert(tx, studentId, message): Promise<boolean>`, `updateStudentLevel(tx, studentId, level)`, `fillFullNameIfEmpty(tx, userId, fullName)`, y la función pura `progressStatusFor(grade, isCurrentPeriod)`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/repository.student.test.ts
import { describe, expect, test } from "bun:test";
import { pickBestRecordRow, progressStatusFor } from "../../src/modules/portal-sync/portal-sync.repository.js";

describe("progressStatusFor", () => {
  test("11 o mas aprueba", () => {
    expect(progressStatusFor(11, false)).toBe("approved");
    expect(progressStatusFor(20, false)).toBe("approved");
  });
  test("menos de 11 desaprueba", () => {
    expect(progressStatusFor(10, false)).toBe("failed");
    expect(progressStatusFor(0, false)).toBe("failed");
  });
  test("sin nota en el ciclo vigente queda en curso", () => {
    expect(progressStatusFor(null, true)).toBe("in_progress");
  });
  test("sin nota en un ciclo pasado se omite", () => {
    expect(progressStatusFor(null, false)).toBeNull();
  });
});

describe("pickBestRecordRow", () => {
  test("gana la VEZ mas alta", () => {
    const rows = [
      { periodCode: "2024-1", courseCode: "650002", courseName: "X", attempt: 1, credits: 3, grade: 8, sectionCode: "1" },
      { periodCode: "2024-2", courseCode: "650002", courseName: "X", attempt: 2, credits: 3, grade: 15, sectionCode: "2" },
    ];
    expect(pickBestRecordRow(rows)?.grade).toBe(15);
  });
  test("a igual VEZ gana el ciclo mas reciente", () => {
    const rows = [
      { periodCode: "2024-1", courseCode: "650002", courseName: "X", attempt: 1, credits: 3, grade: 12, sectionCode: "1" },
      { periodCode: "2025-1", courseCode: "650002", courseName: "X", attempt: 1, credits: 3, grade: 17, sectionCode: "2" },
    ];
    expect(pickBestRecordRow(rows)?.grade).toBe(17);
  });
  test("lista vacia devuelve null", () => {
    expect(pickBestRecordRow([])).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/repository.student.test.ts`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Implementar**

Agregar en `portal-sync.repository.ts`, antes de la clase:

```ts
import type { RecordRow } from "./portal-sync.types.js";

export type ProgressStatus = "in_progress" | "approved" | "failed";

/** Nota >= 11 aprueba. Sin nota: en curso si es el ciclo vigente, si no se omite. */
export const progressStatusFor = (grade: number | null, isCurrentPeriod: boolean): ProgressStatus | null => {
  if (grade === null) return isCurrentPeriod ? "in_progress" : null;
  return grade >= 11 ? "approved" : "failed";
};

/** Con varias filas del mismo curso gana la VEZ más alta; a igual VEZ, el ciclo más reciente. */
export const pickBestRecordRow = (rows: RecordRow[]): RecordRow | null => {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.attempt - a.attempt || b.periodCode.localeCompare(a.periodCode))[0];
};
```

Y dentro de la clase:

```ts
  async fillFullNameIfEmpty(tx: Tx, userId: number, fullName: string): Promise<void> {
    if (!fullName) return;
    // institutional_email NUNCA se toca: es NOT NULL UNIQUE y es la clave del login con Google.
    await tx.execute(sql`
      update app_user set full_name = ${fullName}
      where id = ${userId} and (full_name is null or btrim(full_name) = '')
    `);
  }

  async updateStudentLevel(tx: Tx, studentId: number, level: number): Promise<void> {
    if (!Number.isInteger(level) || level < 1 || level > 10) return;  // chk_student_current_level
    await tx.execute(sql`update student set current_level = ${level} where id = ${studentId}`);
  }

  async upsertEnrollment(tx: Tx, studentId: number, sectionId: number, finalGrade: number | null) {
    const rows = (await tx.execute(sql`
      insert into enrollment (student_id, section_id, status, final_grade)
      values (${studentId}, ${sectionId}, 'active', ${finalGrade})
      on conflict (student_id, section_id) do update
        set status = 'active',
            final_grade = coalesce(excluded.final_grade, enrollment.final_grade)
      returning id, (xmax = 0) as "created"
    `)) as unknown as Array<{ id: number; created: boolean }>;
    return { id: Number(rows[0].id), created: Boolean(rows[0].created) };
  }

  async countActiveEnrollments(tx: Tx, studentId: number): Promise<number> {
    const rows = (await tx.execute(sql`
      select count(*)::int as n from enrollment where student_id = ${studentId} and status = 'active'
    `)) as unknown as Array<{ n: number }>;
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Retira solo matrículas DEL PERÍODO IMPORTADO (enrollment no tiene columna de
   * período: se resuelve por join). Nunca deja al alumno con cero matrículas
   * activas: ambos logins exigen hasActiveEnrollment y lo dejarían fuera de la app.
   */
  async withdrawMissingEnrollments(
    tx: Tx, studentId: number, periodId: number, keepSectionIds: number[],
  ): Promise<number> {
    const keep = keepSectionIds.length ? keepSectionIds : [-1];
    const candidates = (await tx.execute(sql`
      select e.id
      from enrollment e
      join section s on s.id = e.section_id
      join course_offering co on co.id = s.course_offering_id
      where e.student_id = ${studentId}
        and co.academic_period_id = ${periodId}
        and e.status = 'active'
        and e.section_id <> all(${keep})
    `)) as unknown as Array<{ id: number }>;
    if (!candidates.length) return 0;

    const active = await this.countActiveEnrollments(tx, studentId);
    if (active - candidates.length <= 0) return -1;   // -1 = se omitió para no bloquear el login

    const ids = candidates.map((r) => Number(r.id));
    await tx.execute(sql`update enrollment set status = 'withdrawn' where id = any(${ids})`);
    return ids.length;
  }

  async findCurriculumCourseId(tx: Tx, curriculumId: number, courseCode: string): Promise<number | null> {
    const rows = (await tx.execute(sql`
      select cc.id from curriculum_course cc
      join course c on c.id = cc.course_id
      where cc.curriculum_id = ${curriculumId} and c.code = ${courseCode}
      limit 1
    `)) as unknown as Array<{ id: number }>;
    return rows[0] ? Number(rows[0].id) : null;
  }

  async upsertProgress(
    tx: Tx, studentId: number, curriculumId: number, curriculumCourseId: number, status: ProgressStatus,
  ): Promise<void> {
    await tx.execute(sql`
      insert into student_course_progress (student_id, curriculum_id, curriculum_course_id, status)
      values (${studentId}, ${curriculumId}, ${curriculumCourseId}, ${status}::student_course_status)
      on conflict (student_id, curriculum_course_id) do update set status = excluded.status
    `);
  }

  /** Idempotente: no crea otra alerta aunque la anterior ya esté leída. */
  async upsertImpedimentAlert(tx: Tx, studentId: number, message: string): Promise<boolean> {
    const rows = (await tx.execute(sql`
      insert into alert (student_id, type, title, message)
      select ${studentId}, 'academic_risk', 'Impedimento de matrícula', ${message}
      where not exists (
        select 1 from alert
        where student_id = ${studentId} and title = 'Impedimento de matrícula'
      )
      returning id
    `)) as unknown as Array<{ id: number }>;
    if (rows.length) return true;
    await tx.execute(sql`
      update alert set message = ${message}
      where student_id = ${studentId} and title = 'Impedimento de matrícula' and message <> ${message}
    `);
    return false;
  }

  async findStudent(studentId: number) {
    const rows = (await this.database.execute(sql`
      select s.id, s.user_id as "userId", s.career_id as "careerId", s.curriculum_id as "curriculumId",
             c.name as "careerName"
      from student s join career c on c.id = s.career_id
      where s.id = ${studentId} limit 1
    `)) as unknown as Array<{ id: number; userId: number; careerId: number; curriculumId: number; careerName: string }>;
    return rows[0] ?? null;
  }
```

- [ ] **Step 4: Verificar que pasa**

Run: `bun test test/HU31_jeff/repository.student.test.ts && bun run build`
Expected: PASS (7 tests) y compilación limpia.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/portal-sync.repository.ts test/HU31_jeff/repository.student.test.ts
git commit -m "feat(portal-sync): matricula, progreso y alerta de impedimento con guarda anti-bloqueo"
```

---

### Task 11: Service — orquestación, identidad y advertencias

**Files:**
- Create: `src/modules/portal-sync/portal-sync.service.ts`
- Test: `test/HU31_jeff/service.import.test.ts`

**Interfaces:**
- Consumes: `PortalClient`, `PortalSyncRepository`, todos los parsers, tipos de la Tarea 2.
- Produces: `PortalSyncService` con `getStatus(studentId): Promise<SyncStatus>` e `importFromPortal(userId, studentId, cookies): Promise<ImportResult>`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/service.import.test.ts
import { describe, expect, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU31_jeff/fixtures/record.html").text();
const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

// Código de alumno que trae el fixture anonimizado.
const CODE_EN_FIXTURE = matricula.match(/\b(\d{8})\b/)![1];

const fakeClient = (over: Partial<PortalClient> = {}): PortalClient =>
  ({
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record, datosPersonales: "<html></html>" }),
    logout: async () => {},
    ...over,
  }) as unknown as PortalClient;

const fakeRepo = (over: Partial<PortalSyncRepository> = {}): PortalSyncRepository =>
  ({
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => CODE_EN_FIXTURE,
    findStudent: async () => ({ id: 7, userId: 3, careerId: 1, curriculumId: 1, careerName: "INGENIERÍA DE SISTEMAS" }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({ id: 2, code: "2026-2", created: true, datesDefaulted: true, startDate: "2026-08-01" }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseId: async () => 60,
    upsertProgress: async () => {},
    upsertImpedimentAlert: async () => true,
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    ...over,
  }) as unknown as PortalSyncRepository;

describe("PortalSyncService.importFromPortal", () => {
  test("importa y devuelve resumen con el periodo del portal", async () => {
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    const r = await svc.importFromPortal(3, 7, cookies);
    expect(r.period.code).toBe("2026-2");
    expect(r.identity.portalCode).toBe(CODE_EN_FIXTURE);
    expect(r.summary.enrollmentsUpserted).toBe(5);
    expect(r.summary.sessionsUpserted).toBeGreaterThan(0);
  });

  test("403 si el codigo del portal no es el del alumno autenticado", async () => {
    const svc = new PortalSyncService(fakeRepo({ findUserCode: async () => "99999999" }), fakeClient());
    await expect(svc.importFromPortal(3, 7, cookies)).rejects.toMatchObject({
      statusCode: 403, code: "PORTAL_IDENTITY_MISMATCH",
    });
  });

  test("422 si el consolidado no es parseable (identidad no verificable)", async () => {
    const client = fakeClient({
      fetchAll: async () => ({ matricula: "<html>vacio</html>", record, datosPersonales: "" }),
    } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo(), client);
    await expect(svc.importFromPortal(3, 7, cookies)).rejects.toMatchObject({
      statusCode: 422, code: "PORTAL_IDENTITY_UNVERIFIABLE",
    });
  });

  test("no escribe nada cuando la identidad falla", async () => {
    let tx = 0;
    const repo = fakeRepo({
      findUserCode: async () => "99999999",
      runInTransaction: (async (fn: (t: unknown) => Promise<unknown>) => { tx++; return fn({}); }) as never,
    });
    const svc = new PortalSyncService(repo, fakeClient());
    await svc.importFromPortal(3, 7, cookies).catch(() => {});
    expect(tx).toBe(0);
  });

  test("advierte cuando el retiro se omite para no bloquear el login", async () => {
    const svc = new PortalSyncService(fakeRepo({ withdrawMissingEnrollments: async () => -1 }), fakeClient());
    const r = await svc.importFromPortal(3, 7, cookies);
    expect(r.warnings.some((w) => w.code === "WITHDRAW_SKIPPED_WOULD_LOCK_OUT")).toBe(true);
    expect(r.summary.enrollmentsWithdrawn).toBe(0);
  });

  test("cierra la sesion del portal siempre, incluso si la importacion falla", async () => {
    let logouts = 0;
    const client = fakeClient({ logout: async () => { logouts++; } } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo({ findUserCode: async () => "99999999" }), client);
    await svc.importFromPortal(3, 7, cookies).catch(() => {});
    expect(logouts).toBe(1);
  });
});

describe("PortalSyncService.getStatus", () => {
  test("needsImport true cuando no hay matricula en el periodo activo", async () => {
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    expect(await svc.getStatus(7)).toEqual({
      activePeriod: { id: 1, code: "2026-1" }, enrollmentsInActivePeriod: 0, needsImport: true,
    });
  });

  test("needsImport false cuando ya tiene matricula", async () => {
    const svc = new PortalSyncService(fakeRepo({ countEnrollmentsInPeriod: async () => 5 }), fakeClient());
    expect((await svc.getStatus(7)).needsImport).toBe(false);
  });

  test("needsImport true cuando no hay periodo activo", async () => {
    const svc = new PortalSyncService(fakeRepo({ findActivePeriod: async () => null }), fakeClient());
    const s = await svc.getStatus(7);
    expect(s.activePeriod).toBeNull();
    expect(s.needsImport).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/service.import.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar el service**

```ts
// src/modules/portal-sync/portal-sync.service.ts
import { HttpError } from "../../shared/errors/http-error.js";
import type { PortalClient } from "../../services/portal.client.js";
import {
  PortalSyncRepository, periodCodeIsNewer, pickBestRecordRow, progressStatusFor, teacherCodeFor,
} from "./portal-sync.repository.js";
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseImpedimentos, parseInfoAcademica, parseRecordAcademico,
} from "./parsers/index.js";
import type {
  ImportResult, ImportSummary, PortalCookies, RecordRow, SyncStatus, SyncWarning,
} from "./portal-sync.types.js";

const emptySummary = (): ImportSummary => ({
  coursesCreated: 0, teachersCreated: 0, sectionsCreated: 0, sectionsUpdated: 0,
  sessionsUpserted: 0, enrollmentsUpserted: 0, enrollmentsWithdrawn: 0,
  progressUpserted: 0, progressSkipped: 0, alertsCreated: 0,
});

export class PortalSyncService {
  constructor(
    private readonly repository: PortalSyncRepository,
    private readonly client: PortalClient,
  ) {}

  async getStatus(studentId: number): Promise<SyncStatus> {
    const activePeriod = await this.repository.findActivePeriod();
    if (!activePeriod) return { activePeriod: null, enrollmentsInActivePeriod: 0, needsImport: true };
    const n = await this.repository.countEnrollmentsInPeriod(studentId, activePeriod.id);
    return { activePeriod, enrollmentsInActivePeriod: n, needsImport: n === 0 };
  }

  async importFromPortal(userId: number, studentId: number, cookies: PortalCookies): Promise<ImportResult> {
    try {
      return await this.runImport(userId, studentId, cookies);
    } finally {
      await this.client.logout(cookies);   // best effort, siempre
    }
  }

  private async runImport(userId: number, studentId: number, cookies: PortalCookies): Promise<ImportResult> {
    const warnings: SyncWarning[] = [];
    const summary = emptySummary();

    // ── 1. Descargas (FUERA de la transacción) ──────────────────────────────
    const layout = await this.client.fetchPage("layout.jsp", cookies);
    const ciclo = parseCicloActivo(layout);
    if (!ciclo.ok) throw new HttpError(502, "No se pudo determinar el ciclo en miUlima.", "PORTAL_UNAVAILABLE");
    const pages = await this.client.fetchAll(ciclo.data.cocicloUrl, cookies);

    // ── 2. Identidad: sin degradación, antes de escribir nada ───────────────
    const mat = parseConsolidadoMatricula(pages.matricula);
    if (!mat.ok) {
      throw new HttpError(422, "No se pudo confirmar tu identidad en el portal.", "PORTAL_IDENTITY_UNVERIFIABLE");
    }
    const userCode = await this.repository.findUserCode(userId);
    if (!userCode) throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
    if (mat.data.studentCode !== userCode) {
      throw new HttpError(403, "La cuenta de miUlima no corresponde a tu usuario.", "PORTAL_IDENTITY_MISMATCH");
    }

    const student = await this.repository.findStudent(studentId);
    if (!student) throw new HttpError(422, "Perfil de alumno no encontrado.", "PORTAL_IDENTITY_UNVERIFIABLE");
    if (mat.data.careerName && student.careerName && mat.data.careerName !== student.careerName) {
      warnings.push({
        code: "CAREER_MISMATCH", block: "matricula",
        message: `El portal reporta "${mat.data.careerName}" y en ULima++ figura "${student.careerName}". No se modificó la carrera.`,
      });
    }

    // ── 3. Parsers restantes (degradan a warnings) ──────────────────────────
    const aula = parseAulaVirtual(layout);
    if (!aula.ok) warnings.push({ code: "PARSER_FAILED", block: "aula-virtual", message: aula.reason });
    const horario = parseHorario(layout);
    if (!horario.ok) warnings.push({ code: "PARSER_FAILED", block: "horario", message: horario.reason });
    const rec = parseRecordAcademico(pages.record);
    if (!rec.ok) warnings.push({ code: "PARSER_FAILED", block: "record", message: rec.reason });
    const info = parseInfoAcademica(layout);
    const imped = parseImpedimentos(layout);

    const nameByCode = new Map<string, string>();
    const teacherByCourse = new Map<string, string>();
    if (aula.ok) {
      for (const r of aula.data) {
        nameByCode.set(r.courseCode, r.courseName);
        teacherByCourse.set(r.courseCode, r.teacherName);
      }
    }

    // ── 4. Escrituras (todas dentro de UNA transacción) ─────────────────────
    const period = await this.repository.runInTransaction(async (tx) => {
      const active = await this.repository.findActivePeriod();
      const activate = periodCodeIsNewer(ciclo.data.periodCode, active?.code ?? null);
      const p = await this.repository.upsertPeriod(tx, ciclo.data.periodCode, activate);
      if (p.created) {
        await this.repository.ensureAcademicWeeks(tx, p.id, p.startDate);
        warnings.push({
          code: "PERIOD_DATES_DEFAULTED", block: "periodo",
          message: `Se creó el período ${p.code} con fechas por defecto; Sistemas debe corregirlas.`,
        });
      }

      const sectionIdByCourse = new Map<string, number>();
      for (const row of mat.data.rows) {
        const teacherName = teacherByCourse.get(row.courseCode) ?? "";
        const t = await this.repository.upsertTeacher(tx, teacherName);
        if (t.created) summary.teachersCreated++;
        if (!teacherName) {
          warnings.push({
            code: "TEACHER_MISSING", block: "aula-virtual",
            message: `El portal no indica docente para ${row.courseCode}; se usó ${teacherCodeFor("")}.`,
          });
        }

        const courseName = nameByCode.get(row.courseCode) ?? row.courseName;
        const c = await this.repository.upsertCourse(tx, row.courseCode, courseName, row.credits);
        if (c.created) summary.coursesCreated++;

        const off = await this.repository.upsertOffering(tx, p.id, c.id, row.credits);
        const sec = await this.repository.upsertSection(tx, off.id, row.sectionCode, t.id);
        if (sec.created) summary.sectionsCreated++; else summary.sectionsUpdated++;
        sectionIdByCourse.set(row.courseCode, sec.id);

        // Nota final del récord para ESTE curso y ciclo, si ya existe.
        const finalGrade = rec.ok
          ? (rec.data.find((x) => x.periodCode === p.code && x.courseCode === row.courseCode)?.grade ?? null)
          : null;
        await this.repository.upsertEnrollment(tx, studentId, sec.id, finalGrade);
        summary.enrollmentsUpserted++;
      }

      if (horario.ok) {
        for (const s of horario.data) {
          const sectionId = sectionIdByCourse.get(s.courseCode);
          if (!sectionId) continue;
          await this.repository.upsertScheduleSession(tx, sectionId, s);
          summary.sessionsUpserted++;
        }
      }

      const withdrawn = await this.repository.withdrawMissingEnrollments(
        tx, studentId, p.id, [...sectionIdByCourse.values()],
      );
      if (withdrawn === -1) {
        warnings.push({
          code: "WITHDRAW_SKIPPED_WOULD_LOCK_OUT", block: "matricula",
          message: "No se retiraron matrículas porque te habrías quedado sin acceso a la app.",
        });
      } else {
        summary.enrollmentsWithdrawn = withdrawn;
      }

      // Progreso de malla, con todos los ciclos del récord.
      if (rec.ok) {
        const byCourse = new Map<string, RecordRow[]>();
        for (const r of rec.data) {
          byCourse.set(r.courseCode, [...(byCourse.get(r.courseCode) ?? []), r]);
        }
        for (const [code, rows] of byCourse) {
          const best = pickBestRecordRow(rows);
          if (!best) continue;
          const status = progressStatusFor(best.grade, best.periodCode === p.code);
          if (!status) { summary.progressSkipped++; continue; }
          const ccId = await this.repository.findCurriculumCourseId(tx, student.curriculumId, code);
          if (!ccId) { summary.progressSkipped++; continue; }
          await this.repository.upsertProgress(tx, studentId, student.curriculumId, ccId, status);
          summary.progressUpserted++;
        }
        if (summary.progressSkipped > 0) {
          warnings.push({
            code: "PROGRESS_SKIPPED", block: "record",
            message: `${summary.progressSkipped} cursos del récord no están en tu malla (convalidaciones o códigos antiguos).`,
          });
        }
      }

      // Nivel del alumno, del consolidado del ciclo importado.
      const level = Math.max(0, ...mat.data.rows.map((r) => r.level));
      if (level >= 1 && level <= 10) {
        await this.repository.updateStudentLevel(tx, studentId, level);
      } else if (level > 10) {
        warnings.push({
          code: "LEVEL_OUT_OF_RANGE", block: "matricula",
          message: `El portal reporta nivel ${level}, fuera del rango 1..10; no se actualizó.`,
        });
      }

      // Nombre: solo se completa si app_user.full_name está vacío (nunca el correo).
      await this.repository.fillFullNameIfEmpty(tx, userId, mat.data.studentName);

      if (imped.hasImpediment || imped.hasDebt) {
        const created = await this.repository.upsertImpedimentAlert(tx, studentId, imped.text);
        if (created) summary.alertsCreated++;
      }

      return p;
    });

    return {
      period: { id: period.id, code: period.code, created: period.created },
      identity: {
        portalCode: mat.data.studentCode,
        fullName: mat.data.studentName,
        career: info.ok && info.data.careerName ? info.data.careerName : mat.data.careerName,
      },
      summary,
      warnings,
    };
  }
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `bun test test/HU31_jeff/service.import.test.ts && bun run build`
Expected: PASS (9 tests) y compilación limpia.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync test/HU31_jeff/service.import.test.ts
git commit -m "feat(portal-sync): service de importacion con identidad estricta y advertencias"
```

---

### Task 12: Controller, rutas, validación y registro del módulo

**Files:**
- Create: `src/modules/portal-sync/portal-sync.schemas.ts`
- Create: `src/modules/portal-sync/portal-sync.controller.ts`
- Create: `src/modules/portal-sync/portal-sync.routes.ts`
- Create: `src/modules/portal-sync/index.ts`
- Modify: `src/modules/index.ts`
- Modify: `src/shared/middleware/rate-limit.ts`
- Modify: `src/server.ts` (lista `modules` del health check)
- Test: `test/HU31_jeff/schemas.import.test.ts`

**Interfaces:**
- Consumes: `PortalSyncService`, `authMiddleware`, `requireRole`, `STUDENT_ROLES`, `validateJson`, `HttpError`.
- Produces: `portalSyncRoutes` (Hono app) montado en `/portal-sync`; `importCookiesSchema`; middleware `portalSyncRateLimit`.

- [ ] **Step 1: Escribir el test que falla**

```ts
// test/HU31_jeff/schemas.import.test.ts
import { describe, expect, test } from "bun:test";
import { importCookiesSchema } from "../../src/modules/portal-sync/portal-sync.schemas.js";

describe("importCookiesSchema", () => {
  test("acepta las dos cookies obligatorias", () => {
    const r = importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a", LtpaToken2: "b" } });
    expect(r.success).toBe(true);
  });

  test("acepta LtpaToken opcional", () => {
    const r = importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a", LtpaToken2: "b", LtpaToken: "c" } });
    expect(r.success).toBe(true);
  });

  test("rechaza si falta LtpaToken2", () => {
    expect(importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a" } }).success).toBe(false);
  });

  test("rechaza cookies vacias o gigantes", () => {
    expect(importCookiesSchema.safeParse({ cookies: { JSESSIONID: "", LtpaToken2: "b" } }).success).toBe(false);
    expect(importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a".repeat(5000), LtpaToken2: "b" } }).success).toBe(false);
  });

  test("descarta claves desconocidas en vez de propagarlas", () => {
    const r = importCookiesSchema.parse({ cookies: { JSESSIONID: "a", LtpaToken2: "b", evil: "x" } });
    expect(Object.keys(r.cookies).sort()).toEqual(["JSESSIONID", "LtpaToken2"]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `bun test test/HU31_jeff/schemas.import.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar schemas, controller y rutas**

```ts
// src/modules/portal-sync/portal-sync.schemas.ts
import { z } from "zod";

const cookie = z.string().min(1).max(4096);

/** `.strip()` es deliberado: cualquier cookie extra se descarta, no se reenvía al portal. */
export const importCookiesSchema = z.object({
  cookies: z.object({
    JSESSIONID: cookie,
    LtpaToken2: cookie,
    LtpaToken: cookie.optional(),
  }).strip(),
});

export type ImportCookiesDto = z.infer<typeof importCookiesSchema>;
```

```ts
// src/modules/portal-sync/portal-sync.controller.ts
import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import { validateJson } from "../../shared/middleware/validate-dto.js";
import { importCookiesSchema } from "./portal-sync.schemas.js";
import type { PortalSyncService } from "./portal-sync.service.js";

export class PortalSyncController {
  constructor(readonly service: PortalSyncService) {}

  private requireStudentId(c: Context): number {
    const studentId = c.get("studentId");
    if (!studentId) throw new HttpError(403, "Solo alumnos pueden sincronizar.", "FORBIDDEN");
    return Number(studentId);
  }

  async getStatus(c: Context) {
    return c.json(await this.service.getStatus(this.requireStudentId(c)));
  }

  async importFromPortal(c: Context) {
    // El body NUNCA se registra en logs: lleva cookies de sesión del portal.
    const { cookies } = await validateJson(c, importCookiesSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    return c.json(await this.service.importFromPortal(userId, studentId, cookies));
  }
}
```

```ts
// src/modules/portal-sync/portal-sync.routes.ts
import { Hono } from "hono";
import { authMiddleware, requireRole, STUDENT_ROLES } from "../../shared/middleware/auth-middleware.js";
import { portalSyncRateLimit } from "../../shared/middleware/rate-limit.js";
import type { PortalSyncController } from "./portal-sync.controller.js";

export const createPortalSyncRoutes = (controller: PortalSyncController) => {
  const app = new Hono<{ Variables: { userId: number; studentId: number; role: string } }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));

  app.get("/status", (c) => controller.getStatus(c));
  app.post("/import", portalSyncRateLimit, (c) => controller.importFromPortal(c));

  return app;
};
```

```ts
// src/modules/portal-sync/index.ts
import { db } from "../../db/index.js";
import { portalClient } from "../../services/portal.client.js";
import { PortalSyncController } from "./portal-sync.controller.js";
import { PortalSyncRepository } from "./portal-sync.repository.js";
import { createPortalSyncRoutes } from "./portal-sync.routes.js";
import { PortalSyncService } from "./portal-sync.service.js";

const portalSyncRepository = new PortalSyncRepository(db);
const portalSyncService = new PortalSyncService(portalSyncRepository, portalClient);
const portalSyncController = new PortalSyncController(portalSyncService);

export const portalSyncRoutes = createPortalSyncRoutes(portalSyncController);

export { PortalSyncController } from "./portal-sync.controller.js";
export { PortalSyncRepository } from "./portal-sync.repository.js";
export { PortalSyncService } from "./portal-sync.service.js";
```

- [ ] **Step 4: Agregar el rate limit**

Al final de `src/shared/middleware/rate-limit.ts`:

```ts
const portalStore = new Map<number, RateLimitEntry>();
const PORTAL_MAX_PER_HOUR = 5;

/** Cada importación dispara ~5 peticiones salientes al portal de la Universidad. */
export async function portalSyncRateLimit(c: Context, next: Next) {
  const studentId = c.get("studentId") as number | undefined;
  if (!studentId) return next();

  const now = Date.now();
  const entry = portalStore.get(studentId);
  if (!entry || now > entry.resetAt) {
    portalStore.set(studentId, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (entry.count >= PORTAL_MAX_PER_HOUR) {
    const minutesLeft = Math.ceil((entry.resetAt - now) / 60000);
    return c.json({
      error: {
        code: "RATE_LIMITED",
        message: `Demasiadas sincronizaciones. Intenta de nuevo en ${minutesLeft} minuto(s).`,
        details: { retryAfterMinutes: minutesLeft },
      },
    }, 429);
  }
  entry.count++;
  return next();
}
```

> **Limitación conocida**: el contador vive en un `Map` en memoria, igual que `chatbotRateLimit`. En Vercel serverless cada instancia tiene el suyo, así que el límite es por instancia, no global. Se acepta por consistencia con el módulo existente; endurecerlo requiere almacenamiento compartido y spec propia.

- [ ] **Step 5: Registrar el módulo**

En `src/modules/index.ts`, agregar el import y la ruta:

```ts
import { portalSyncRoutes } from "./portal-sync/index.js";
```

```ts
  app.route("/portal-sync", portalSyncRoutes);
```

Y en `src/server.ts`, añadir `"/portal-sync"` al array `modules` del health check.

- [ ] **Step 6: Verificar que pasa**

```bash
bun test test/HU31_jeff/ && bun run build
```
Expected: PASS en toda la carpeta y compilación limpia.

- [ ] **Step 7: Commit**

```bash
git add src/modules src/shared/middleware/rate-limit.ts src/server.ts test/HU31_jeff/schemas.import.test.ts
git commit -m "feat(portal-sync): rutas, controller, validacion de cookies y rate limit"
```

---

### Task 13: Verificación end-to-end contra el portal real

Esta tarea **no** se automatiza: aplica la migración a la base real y prueba con un alumno real. Requiere confirmación explícita del owner antes de ejecutar `db:apply`.

**Files:**
- Modify: `docs/specs/feature-index.md` (estado de la feature)
- Modify: `specs/features/portal-sync/portal-sync.spec.md` (enlaces `[@test]`)

- [ ] **Step 1: Confirmar con el owner antes de tocar la base**

Preguntar explícitamente: "¿aplico la migración `0004_portal_sync_final_grade` a la base de producción?". No continuar sin un sí.

- [ ] **Step 2: Aplicar la migración**

```bash
bun run db:apply
```
Expected: la columna `final_grade` existe en `enrollment`.

- [ ] **Step 3: Levantar el backend y obtener un token**

```bash
bun run dev
```

En otra terminal, iniciar sesión como alumno de prueba y guardar el token en `TOKEN`.

- [ ] **Step 4: Verificar el estado inicial**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/portal-sync/status
```
Expected: `needsImport` en `true` si el alumno no tiene matrícula en el período activo.

- [ ] **Step 5: Importar con cookies reales**

Obtener `JSESSIONID` y `LtpaToken2` iniciando sesión en miUlima en el navegador (DevTools, Application, Cookies) y ejecutar:

```bash
curl -s -X POST http://localhost:3000/portal-sync/import -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"cookies":{"JSESSIONID":"<valor>","LtpaToken2":"<valor>"}}'
```
Expected: `200` con `period`, `identity`, `summary` y `warnings`.

- [ ] **Step 6: Verificar idempotencia**

Repetir el paso 5 con cookies nuevas. Expected: mismos conteos de creación en `0`, sin filas duplicadas:

```bash
psql "$DATABASE_URL" -c "select count(*) from section s join course_offering co on co.id=s.course_offering_id join academic_period p on p.id=co.academic_period_id where p.code='2026-2';"
```

- [ ] **Step 7: Verificar RS-BE-4 (no se tocaron datos propios de la app)**

Antes de importar, guardar los conteos; después, comprobar que no cambiaron:

```bash
psql "$DATABASE_URL" -c "select (select count(*) from simulated_grades) as simuladas, (select count(*) from student_curriculum_simulation) as simulacion, (select count(*) from student_specialty) as especialidades, (select count(*) from announcement) as anuncios, (select count(*) from course_advising_session) as asesorias;"
```
Expected: idénticos antes y después de la importación.

- [ ] **Step 8: Verificar que los módulos existentes leen los datos nuevos**

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/schedule/me/sessions
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/curriculum/me
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/portal-sync/status
```
Expected: el horario trae las sesiones importadas, la malla refleja el avance y `needsImport` pasó a `false`.

- [ ] **Step 9: Cerrar la documentación**

Agregar los enlaces `[@test]` en la spec junto a cada requisito verificado y cambiar el estado en `docs/specs/feature-index.md` a "Implementado". Commit:

```bash
git add docs specs
git commit -m "docs(portal-sync): enlaza tests y marca la feature como implementada"
```

---

## Notas para quien ejecute el plan

- **Los índices de columna de los parsers son la parte frágil.** Si un test de parser falla, la fuente de verdad es el fixture HTML, no el código de este plan: contar las `<td>` reales y ajustar.
- **Nunca invertir el orden del paso de período** (desactivar y después insertar). Es la causa del fallo garantizado en la primera importación de cada ciclo.
- **Nunca cambiar `409 PORTAL_SESSION_INVALID` por 401.** El cliente HTTP del frontend cierra la sesión del usuario ante cualquier 401.
- El plan del frontend se escribe aparte y **depende de un spike previo**: verificar en un iPhone real que se pueden leer las cookies HttpOnly del WebView. Si ese spike falla, el contrato de `POST /portal-sync/import` cambia y esta implementación necesita un método de login en `PortalClient`.
