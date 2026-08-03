import { describe, expect, test } from "bun:test";
import { summarizeOfficialGrades } from "../../src/modules/chatbot/grades-summary.js";
import type { OfficialGradeRow } from "../../src/modules/chatbot/chatbot.types.js";

// Caja blanca de la lógica nueva del chatbot: resumen de notas OFICIALES por
// curso + "cuánto falta para aprobar" (reusa alerts.logic, PASSING_GRADE = 10.5).
function row(over: Partial<OfficialGradeRow>): OfficialGradeRow {
  return {
    course_id: 1,
    course_name: "CURSO",
    section_code: "100",
    assessment_id: 1,
    assessment_code: "EV01",
    assessment_name: "Examen 1",
    assessment_weight: "30",
    score_value: null,
    ...over,
  };
}

describe("summarizeOfficialGrades — cuánto falta para aprobar", () => {
  test("en_curso: EV01(30%)=8 y EV02(70%) sin nota → necesita ~11.57 en lo restante", () => {
    const rows = [
      row({ assessment_id: 1, assessment_weight: "30", score_value: "8" }),
      row({ assessment_id: 2, assessment_code: "EV02", assessment_name: "Proyecto", assessment_weight: "70", score_value: null }),
    ];
    const [c] = summarizeOfficialGrades(rows);
    expect(c.estado).toBe("en_curso");
    expect(c.promedioActual).toBe(8);
    expect(c.necesitaEnLoRestante).toBeCloseTo(11.57, 1);
    expect(c.evaluaciones).toHaveLength(2);
  });

  test("aprobado: EV01(80%)=15 ya asegura aprobar pase lo que pase (necesita 0)", () => {
    const rows = [
      row({ assessment_id: 1, assessment_weight: "80", score_value: "15" }),
      row({ assessment_id: 2, assessment_code: "EV02", assessment_weight: "20", score_value: null }),
    ];
    const [c] = summarizeOfficialGrades(rows);
    expect(c.estado).toBe("aprobado");
    expect(c.necesitaEnLoRestante).toBe(0);
  });

  test("imposible: EV01(80%)=5 ya no alcanza ni con 20 en lo restante", () => {
    const rows = [
      row({ assessment_id: 1, assessment_weight: "80", score_value: "5" }),
      row({ assessment_id: 2, assessment_code: "EV02", assessment_weight: "20", score_value: null }),
    ];
    const [c] = summarizeOfficialGrades(rows);
    expect(c.estado).toBe("imposible");
  });

  test("sin_notas: sin ninguna nota registrada no calcula requerido", () => {
    const rows = [row({ assessment_id: 1, assessment_weight: "100", score_value: null })];
    const [c] = summarizeOfficialGrades(rows);
    expect(c.estado).toBe("sin_notas");
    expect(c.necesitaEnLoRestante).toBeNull();
  });

  test("agrupa por curso y no duplica evaluaciones", () => {
    const rows = [
      row({ course_id: 1, course_name: "A", assessment_id: 1, assessment_weight: "50", score_value: "12" }),
      row({ course_id: 1, course_name: "A", assessment_id: 2, assessment_weight: "50", score_value: null }),
      row({ course_id: 2, course_name: "B", assessment_id: 3, assessment_weight: "100", score_value: "14" }),
    ];
    const res = summarizeOfficialGrades(rows);
    expect(res).toHaveLength(2);
    expect(res.find((c) => c.courseName === "A")?.evaluaciones).toHaveLength(2);
  });
});
