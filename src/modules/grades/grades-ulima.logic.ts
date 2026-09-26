import type { UlimaAssessment, UlimaCourse, UlimaGradeRow, UlimaGradesView } from "./grades.types.js";

/** RS-BE-57. Por semana, con las null al final, y después por key. */
const ordenEvaluaciones = (a: UlimaAssessment, b: UlimaAssessment): number => {
  if (a.week !== b.week) {
    if (a.week === null) return 1;
    if (b.week === null) return -1;
    return a.week - b.week;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
};

/**
 * RS-BE-57. Arma la vista de las notas de la ULima desde las filas del
 * repositorio. Una entrada por matrícula activa, aunque nunca se haya leído, y
 * `lastReadAt` de arriba es el máximo de los cursos. Las horas llegan ya como
 * texto ISO 8601 UTC con milisegundos, así que se comparan como texto.
 */
export const construirVistaUlima = (filas: UlimaGradeRow[]): UlimaGradesView => {
  const cursos = new Map<number, UlimaCourse>();
  for (const f of filas) {
    let curso = cursos.get(Number(f.enrollment_id));
    if (!curso) {
      curso = {
        sectionId: Number(f.section_id),
        courseCode: f.course_code,
        courseName: f.course_name,
        sectionCode: f.section_code,
        lastReadAt: f.last_read_at ?? null,
        assessments: [],
      };
      cursos.set(Number(f.enrollment_id), curso);
    }
    if (f.portal_key === null || f.name === null || f.weight === null || f.mark === null || f.match_rule === null) continue;
    curso.assessments.push({
      key: f.portal_key,
      group: f.group_name,
      name: f.name,
      week: f.week_number === null ? null : Number(f.week_number),
      weight: Number(f.weight),
      value: f.value === null ? null : Number(f.value),
      mark: f.mark as UlimaAssessment["mark"],
      assessmentId: f.assessment_id === null ? null : Number(f.assessment_id),
      match: f.match_rule as UlimaAssessment["match"],
    });
  }
  const lista = [...cursos.values()];
  for (const c of lista) c.assessments.sort(ordenEvaluaciones);
  const horas = lista.map((c) => c.lastReadAt).filter((h): h is string => h !== null);
  return { lastReadAt: horas.length ? horas.reduce((a, b) => (b > a ? b : a)) : null, courses: lista };
};
