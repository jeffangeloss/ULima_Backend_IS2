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
