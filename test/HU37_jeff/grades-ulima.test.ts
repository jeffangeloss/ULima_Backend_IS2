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
