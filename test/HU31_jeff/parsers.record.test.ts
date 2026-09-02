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
