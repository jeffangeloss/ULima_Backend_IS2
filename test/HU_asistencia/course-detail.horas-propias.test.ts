import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-12: las horas de asistencia que ve un alumno son LAS SUYAS.
 *
 * `GET /course-detail/sections` hacía `left join enrollment e on e.section_id =
 * sec.id` sin filtrar por alumno, y después agregaba con `min(attended_hours)` y
 * `max(absent_hours)` sobre TODAS las matrículas de la sección. O sea que al
 * alumno se le mostraba, como propio, el mínimo de horas asistidas y el máximo
 * de faltas de cualquier compañero del salón.
 *
 * `promedioSeccion` sí es de la sección y no se toca: va por su propio join.
 */

const consultas: string[] = [];

const fakeDb = {
  execute: async (q: SQL) => {
    const sql = new PgDialect().sqlToQuery(q).sql;
    consultas.push(sql);
    if (sql.includes("token_version")) return [{ token_version: 1 }];
    return [];
  },
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { createCourseDetailRoutes } = await import(
  "../../src/modules/course-detail/course-detail.routes.js"
);
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

const app = new Hono();
app.onError(errorHandler);
app.route("/", createCourseDetailRoutes());

const tokenAlumno = (studentId: number) =>
  jwt.sign(
    { sub: "1", studentId, role: "student", tokenVersion: 1 },
    config.auth.jwtSecret,
  );

/** Devuelve el SQL de la consulta de secciones (la que trae las horas). */
const sqlDeSecciones = async (studentId = 55) => {
  consultas.length = 0;
  await app.request("/sections", {
    headers: { Authorization: `Bearer ${tokenAlumno(studentId)}` },
  });
  const q = consultas.find((s) => s.includes("attended_hours"));
  expect(q).toBeDefined();
  return q!;
};

describe("GET /course-detail/sections: las horas son del alumno autenticado", () => {
  test("la consulta filtra las matriculas por student_id", async () => {
    expect(await sqlDeSecciones()).toContain("student_id");
  });

  test("las horas NO salen de un agregado sobre todo el salon", async () => {
    const q = await sqlDeSecciones();
    // min(attended_hours) devolvía el peor compañero como si fuera el alumno.
    expect(q).not.toMatch(/min\(\s*e\.attended_hours/i);
    expect(q).not.toMatch(/max\(\s*e\.absent_hours/i);
    expect(q).not.toMatch(/max\(\s*e\.total_hours/i);
  });

  test("el id del alumno viaja parametrizado, no concatenado", async () => {
    expect(await sqlDeSecciones(55)).not.toContain("55");
  });

  test("promedioSeccion sigue siendo de la seccion, no del alumno", async () => {
    // Su join no debe quedar atado al alumno: es el promedio del salón.
    expect(await sqlDeSecciones()).toContain("avg(");
  });
});
