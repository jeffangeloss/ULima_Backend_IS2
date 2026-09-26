export type GradeValue = number | null;

export type NotaInput = {
  valor: number;
  peso: number;
};

export type CalculateAverageResponse = {
  promedio: number;
  sumaPesos: number;
};

export type CourseRawRow = {
  course_id: number;
  curriculum_course_id: number | null;
  course_name: string;
  period_code: string;
  section_id: number | null;
  section_code: string | null;
  assessment_id: number | null;
  assessment_name: string | null;
  assessment_code: string | null;
  syllabus_url: string | null;
  assessment_weight: string | null;
  assessment_type: string | null;
};

export type NotaEntry = {
  assessmentId: number;
  valor: number | null;
};

export type CursoNotasEntry = {
  sectionId: number;
  notas: NotaEntry[];
};

export type SaveNotasRequest = {
  cursos: CursoNotasEntry[];
};

export type LoadNotasResponse = {
  cursos: CursoNotasEntry[];
};

export type StudentScoreRow = {
  section_id: number;
  assessment_id: number;
  value: string | null;
};

/** RS-BE-57. Marca de una evaluación de la ULima. */
export type UlimaMark = "graded" | "pending" | "np";
/** RS-BE-57. Regla con la que la evaluación encontró pareja en el sílabo. */
export type UlimaMatch = "exact" | "exact_other_name" | "week_shift" | "none";

/** RS-BE-57. Una evaluación de la ULima, con las claves en inglés de GET /official-grades/me. */
export type UlimaAssessment = {
  key: string;
  group: string | null;
  name: string;
  week: number | null;
  weight: number;
  value: number | null;
  mark: UlimaMark;
  assessmentId: number | null;
  match: UlimaMatch;
};

/** RS-BE-57. Una matrícula activa, leída o no. */
export type UlimaCourse = {
  sectionId: number;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  lastReadAt: string | null;
  assessments: UlimaAssessment[];
};

/** RS-BE-57. Respuesta de GET /grades/me/ulima y `view` de POST /portal-sync/refresh. */
export type UlimaGradesView = { lastReadAt: string | null; courses: UlimaCourse[] };

/** Fila cruda de `findUlimaGrades`, una por evaluación o una sola sin notas. */
export type UlimaGradeRow = {
  enrollment_id: number;
  section_id: number;
  course_code: string;
  course_name: string;
  section_code: string;
  last_read_at: string | null;
  portal_key: string | null;
  group_name: string | null;
  name: string | null;
  week_number: number | null;
  weight: string | null;
  value: string | null;
  mark: string | null;
  assessment_id: number | null;
  match_rule: string | null;
};
