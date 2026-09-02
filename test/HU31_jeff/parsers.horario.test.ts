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

  test("parseAulaVirtual falla con ok:false sin tabla de cursos", () => {
    expect(parseAulaVirtual("<html>nada</html>").ok).toBe(false);
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

  test("parseHorario falla con ok:false sin tabla de horario", () => {
    expect(parseHorario("<html>nada</html>").ok).toBe(false);
  });
});
