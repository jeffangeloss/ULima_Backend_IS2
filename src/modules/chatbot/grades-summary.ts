// Resumen de notas OFICIALES por curso para el chatbot: por cada curso del
// período activo calcula el promedio actual y CUÁNTO le falta al alumno para
// aprobar (mínimo 10.5), reutilizando la lógica pura y ya testeada de alerts.
// Sin acceso a BD ni efectos: testeable con `bun test`.
import {
  aggregateCourseScores,
  personalAverage,
  requiredOnRemaining,
  PASSING_GRADE,
} from "../alerts/alerts.logic.js";
import type { OfficialGradeRow, OfficialCourseGrades } from "./chatbot.types.js";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function summarizeOfficialGrades(rows: OfficialGradeRow[]): OfficialCourseGrades[] {
  // Agregados por curso (gradedWeight / weightedSum / totalWeight) via alerts.logic.
  const aggregates = aggregateCourseScores(
    rows.map((r) => ({
      course_id: r.course_id,
      course_name: r.course_name,
      assessment_id: r.assessment_id,
      assessment_weight: r.assessment_weight,
      score_value: r.score_value,
    })),
  );
  const aggByCourse = new Map(aggregates.map((a) => [a.courseId, a]));

  // Filas agrupadas por curso para el detalle por evaluación.
  const byCourse = new Map<number, OfficialGradeRow[]>();
  for (const r of rows) {
    const list = byCourse.get(r.course_id);
    if (list) list.push(r);
    else byCourse.set(r.course_id, [r]);
  }

  const result: OfficialCourseGrades[] = [];
  for (const [courseId, courseRows] of byCourse) {
    const agg = aggByCourse.get(courseId);
    if (!agg) continue;

    const seen = new Set<number>();
    const evaluaciones: OfficialCourseGrades["evaluaciones"] = [];
    for (const r of courseRows) {
      if (r.assessment_id === null || seen.has(r.assessment_id)) continue;
      seen.add(r.assessment_id);
      evaluaciones.push({
        nombre: r.assessment_name ?? r.assessment_code ?? "Evaluación",
        peso: Number(r.assessment_weight ?? 0),
        nota: r.score_value === null ? null : Number(r.score_value),
      });
    }

    const remaining = agg.totalWeight - agg.gradedWeight;
    const promedioActual = personalAverage(agg.gradedWeight, agg.weightedSum);
    const req = requiredOnRemaining(agg.gradedWeight, agg.weightedSum, agg.totalWeight);

    let estado: OfficialCourseGrades["estado"];
    let necesita: number | null;
    if (agg.gradedWeight <= 0) {
      estado = "sin_notas";
      necesita = null;
    } else if (remaining <= 0) {
      // Todo calificado: ya es aprobó/reprobó, no "necesita X".
      estado = promedioActual >= PASSING_GRADE ? "aprobado" : "imposible";
      necesita = null;
    } else if (req <= 0) {
      estado = "aprobado"; // ya aprobó pase lo que pase en lo restante
      necesita = 0;
    } else if (req > 20) {
      estado = "imposible"; // ni con 20 en todo lo restante alcanza
      necesita = round2(req);
    } else {
      estado = "en_curso";
      necesita = round2(req);
    }

    result.push({
      courseName: courseRows[0].course_name,
      sectionCode: courseRows[0].section_code,
      evaluaciones,
      pesoCalificado: agg.gradedWeight,
      promedioActual: round2(promedioActual),
      notaAcumulada: round2(agg.weightedSum / 100),
      estado,
      necesitaEnLoRestante: necesita,
    });
  }
  return result;
}
