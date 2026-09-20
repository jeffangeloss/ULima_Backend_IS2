import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-26 y RS-BE-27 — GET y DELETE /academic-record/me.
 *
 * El récord son las notas del alumno: solo lo lee su dueño, sale únicamente del
 * token y la respuesta no se cachea. El DELETE borra las tres tablas de esta
 * funcionalidad y nada más: `student_course_progress` lo necesita la malla.
 *
 * La base es falsa y registra `{ sql, params }` de cada consulta. `mock.module`
 * va ANTES de cualquier `await import(...)` porque `authMiddleware` consulta
 * `token_version` en cada petición y el `.env` del worktree apunta a producción.
 */

type Consulta = { sql: string; params: unknown[] };
type Respuestas = { snapshot: unknown[]; record: unknown[]; periods: unknown[] };

const consultas: Consulta[] = [];
let respuestas: Respuestas = { snapshot: [], record: [], periods: [] };

const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  if (sql.includes("token_version")) return [{ token_version: 1 }];
  if (sql.includes("student_academic_snapshot")) return respuestas.snapshot;
  if (sql.includes("student_record_entry")) return respuestas.record;
  if (sql.includes("student_period_summary")) return respuestas.periods;
  return [];
};

const fakeDb = {
  execute: ejecutar,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { AcademicRecordController } = await import(
  "../../src/modules/academic-record/academic-record.controller.js"
);
const { AcademicRecordRepository } = await import(
  "../../src/modules/academic-record/academic-record.repository.js"
);
const { AcademicRecordService } = await import(
  "../../src/modules/academic-record/academic-record.service.js"
);
const { createAcademicRecordRoutes } = await import(
  "../../src/modules/academic-record/academic-record.routes.js"
);
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

// La cadena se arma a mano, sin pasar por `academic-record/index.js`: esa
// instancia quedaría atada a la base que se evaluó primero.
const app = new Hono();
app.onError(errorHandler);
app.route(
  "/academic-record",
  createAcademicRecordRoutes(
    new AcademicRecordController(
      new AcademicRecordService(new AcademicRecordRepository(fakeDb as never), new EventBus()),
    ),
  ),
);

const tokenDe = (role: string, studentId = 42) =>
  jwt.sign({ sub: "1", studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = jwt.sign(
  { sub: "2", teacherId: 7, role: "teacher", tokenVersion: 1 },
  config.auth.jwtSecret,
);

const pedir = async (
  ruta: string,
  opciones: { token?: string; metodo?: string; datos?: Partial<Respuestas> } = {},
) => {
  consultas.length = 0;
  respuestas = { snapshot: [], record: [], periods: [], ...(opciones.datos ?? {}) };
  return await app.request(ruta, {
    method: opciones.metodo ?? "GET",
    ...(opciones.token ? { headers: { Authorization: `Bearer ${opciones.token}` } } : {}),
  });
};

// --- Filas tal como las devuelve Postgres: claves snake_case, `numeric` como
// string y `timestamptz` como string. Valores inventados. ---

const FILA_SNAPSHOT = {
  ppa: "14.6200",
  relative_position: "TERCIO SUPERIOR",
  convalidated_courses: 0,
  convalidated_credits: "0.0",
  approved_courses: 50,
  approved_credits: "164.0",
  credits_accumulated: "164.0",
  credits_required: "200.0",
  synced_at: "2026-09-18 15:00:00+00",
};

// Llegan desordenadas a propósito: el orden del contrato lo pone el DTO.
// `grade` viene como number en una fila y como string en otra: smallint puede
// llegar de las dos formas y las dos tienen que salir como number.
const FILAS_RECORD = [
  {
    period_code: "2023-1", course_code: "659001", course_name: "CURSO DE PRUEBA UNO",
    attempt: 1, credits: "4.0", grade: "8", grade_raw: "08",
    section_code: "101", observation: null,
  },
  {
    period_code: "2026-1", course_code: "659003", course_name: "CURSO DE PRUEBA TRES",
    attempt: 1, credits: "1.5", grade: null, grade_raw: null,
    section_code: "917", observation: null,
  },
  {
    period_code: "2026-1", course_code: "659004", course_name: "CURSO DE PRUEBA CUATRO",
    attempt: 2, credits: "3.0", grade: 17, grade_raw: "17",
    section_code: null, observation: "OBSERVACIÓN DE PRUEBA",
  },
];

const FILAS_PERIODOS = [
  {
    period_code: "2025-2", average: "13.2500", relative_position: "MEDIO SUPERIOR", level: 4,
    convalidated_courses: 0, convalidated_credits: "0.0",
    enrolled_courses: 7, enrolled_credits: "23.0",
    approved_courses: 5, approved_credits: "16.0",
    failed_courses: 2, failed_credits: "7.0",
  },
  // Bloque que el portal no dejó leer: todo null, nunca 0.
  {
    period_code: "2026-1", average: null, relative_position: null, level: null,
    convalidated_courses: null, convalidated_credits: null,
    enrolled_courses: null, enrolled_credits: null,
    approved_courses: null, approved_credits: null,
    failed_courses: null, failed_credits: null,
  },
];

const filaRecord = (ciclo: string, codigo: string) => ({
  period_code: ciclo, course_code: codigo, course_name: "CURSO DE PRUEBA",
  attempt: 1, credits: "3.0", grade: 14, grade_raw: "14",
  section_code: "101", observation: null,
});

describe("GET /academic-record/me: quien puede leer (RS-BE-26)", () => {
  test("sin token responde 401 MISSING_TOKEN", async () => {
    const res = await pedir("/academic-record/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
  });

  test("un token de docente responde 403 FORBIDDEN", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDocente });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("student, delegate y subdelegate leen su propio record", async () => {
    for (const rol of ["student", "delegate", "subdelegate"]) {
      const res = await pedir("/academic-record/me", { token: tokenDe(rol) });
      expect(res.status).toBe(200);
    }
  });

  test("no existe ruta para leer el record de otro alumno", async () => {
    // RS-BE-26: "no hay parámetro de alumno ni ruta para docentes o delegados".
    // El middleware corre igual (consulta token_version), pero no hay handler.
    const res = await pedir("/academic-record/1", { token: tokenDe("student") });
    expect(res.status).toBe(404);
    expect(consultas.filter((q) => !q.sql.includes("token_version"))).toHaveLength(0);
  });

  test("un token de alumno sin studentId util responde 403 FORBIDDEN", async () => {
    // La guarda del controller: `authMiddleware` acepta studentId 0 (es entero),
    // así que este caso la alcanza y ninguna tabla del récord se consulta.
    const res = await pedir("/academic-record/me", { token: tokenDe("student", 0) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(consultas.filter((q) => !q.sql.includes("token_version"))).toHaveLength(0);
  });

  test("la respuesta lleva Cache-Control: no-store", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDe("student") });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("el alumno sale del token: ?studentId=99 se ignora", async () => {
    const res = await pedir("/academic-record/me?studentId=99", {
      token: tokenDe("student", 42),
      datos: { snapshot: [FILA_SNAPSHOT], record: FILAS_RECORD, periods: FILAS_PERIODOS },
    });
    expect(res.status).toBe(200);
    const delRecord = consultas.filter((q) => !q.sql.includes("token_version"));
    expect(delRecord).toHaveLength(3);
    for (const q of delRecord) {
      expect(q.params).toEqual([42]);
      // El id viaja como parámetro, nunca concatenado en el texto del SQL.
      expect(q.sql).not.toContain("99");
      expect(q.sql).not.toContain("42");
    }
  });
});

describe("GET /academic-record/me: contrato (RS-BE-26)", () => {
  test("sin sincronizar devuelve el estado vacio con 200", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDe("student") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      syncedAt: null, snapshot: null, periods: [], record: [],
    });
  });

  test("devuelve la foto, el resumen por ciclo y el record agrupado", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student"),
      datos: { snapshot: [FILA_SNAPSHOT], record: FILAS_RECORD, periods: FILAS_PERIODOS },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      syncedAt: "2026-09-18T15:00:00.000Z",
      snapshot: {
        ppa: 14.62,
        relativePosition: "TERCIO SUPERIOR",
        creditsAccumulated: 164,
        creditsRequired: 200,
        approved: { courses: 50, credits: 164 },
        convalidated: { courses: 0, credits: 0 },
      },
      periods: [
        {
          periodCode: "2026-1", average: null, relativePosition: null, level: null,
          convalidated: { courses: null, credits: null },
          enrolled: { courses: null, credits: null },
          approved: { courses: null, credits: null },
          failed: { courses: null, credits: null },
        },
        {
          periodCode: "2025-2", average: 13.25, relativePosition: "MEDIO SUPERIOR", level: 4,
          convalidated: { courses: 0, credits: 0 },
          enrolled: { courses: 7, credits: 23 },
          approved: { courses: 5, credits: 16 },
          failed: { courses: 2, credits: 7 },
        },
      ],
      record: [
        {
          periodCode: "2026-1",
          courses: [
            {
              code: "659003", name: "CURSO DE PRUEBA TRES", attempt: 1, credits: 1.5,
              grade: null, gradeRaw: null, section: "917", observation: null,
            },
            {
              code: "659004", name: "CURSO DE PRUEBA CUATRO", attempt: 2, credits: 3,
              grade: 17, gradeRaw: "17", section: null, observation: "OBSERVACIÓN DE PRUEBA",
            },
          ],
        },
        {
          periodCode: "2023-1",
          courses: [
            {
              code: "659001", name: "CURSO DE PRUEBA UNO", attempt: 1, credits: 4,
              grade: 8, gradeRaw: "08", section: "101", observation: null,
            },
          ],
        },
      ],
    });
  });

  test("un 0 del portal no se confunde con un campo sin dato", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student"),
      datos: {
        snapshot: [{
          ...FILA_SNAPSHOT,
          ppa: null, relative_position: null,
          convalidated_courses: 0, convalidated_credits: "0.0",
          credits_accumulated: null,
        }],
      },
    });
    expect(await res.json()).toMatchObject({
      snapshot: {
        ppa: null,
        relativePosition: null,
        creditsAccumulated: null,
        convalidated: { courses: 0, credits: 0 },
      },
    });
  });

  test("los ciclos van del mas reciente al mas viejo aunque lleguen en otro orden", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student"),
      datos: {
        record: [
          filaRecord("2024-2", "659010"),
          filaRecord("2026-1", "659011"),
          filaRecord("2024-1", "659012"),
          filaRecord("2025-2", "659013"),
        ],
        periods: [
          { ...FILAS_PERIODOS[0], period_code: "2024-1" },
          { ...FILAS_PERIODOS[0], period_code: "2026-1" },
        ],
      },
    });
    const dto = (await res.json()) as {
      record: Array<{ periodCode: string }>;
      periods: Array<{ periodCode: string }>;
    };
    expect(dto.record.map((r) => r.periodCode)).toEqual(["2026-1", "2025-2", "2024-2", "2024-1"]);
    expect(dto.periods.map((p) => p.periodCode)).toEqual(["2026-1", "2024-1"]);
  });
});

describe("DELETE /academic-record/me (RS-BE-27)", () => {
  test("sin token responde 401 MISSING_TOKEN", async () => {
    const res = await pedir("/academic-record/me", { metodo: "DELETE" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
  });

  test("un token de docente responde 403 FORBIDDEN", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDocente, metodo: "DELETE" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("responde { ok: true } y borra en las tres tablas del record", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student", 42), metodo: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const borrados = consultas.filter((q) => q.sql.includes("delete from"));
    expect(borrados).toHaveLength(3);
    expect(borrados.map((q) => q.params)).toEqual([[42], [42], [42]]);
    for (const tabla of [
      "student_record_entry", "student_period_summary", "student_academic_snapshot",
    ]) {
      expect(
        borrados.some((q) => q.sql.includes(`delete from ${tabla} where student_id = $1`)),
      ).toBe(true);
    }
  });

  test("no toca student_course_progress ni el resto de lo importado", async () => {
    await pedir("/academic-record/me", { token: tokenDe("student"), metodo: "DELETE" });
    for (const q of consultas) {
      expect(q.sql).not.toContain("student_course_progress");
      expect(q.sql).not.toContain("student_curriculum_simulation");
      expect(q.sql).not.toContain("enrollment");
    }
  });

  test("la respuesta lleva Cache-Control: no-store", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDe("student"), metodo: "DELETE" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
