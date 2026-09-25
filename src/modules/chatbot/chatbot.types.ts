/** Dominios de BR-CB-04. `delegates` reemplaza a `classmates`; `own_blocks` es nuevo. */
export type ChatbotIntent =
  | "grades"
  | "schedule"
  | "curriculum"
  | "alerts"
  | "announcements"
  | "delegates"
  | "own_blocks"
  | "chat";

export interface ChatbotSessionRow {
  id: string;
  studentId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatbotMessageRow {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export type { AssessmentResponse } from "../schedule/schedule.types.js";
export type { AssessmentsResult } from "../schedule/schedule.types.js";

/**
 * Una sesión semanal de `getSchedule`, con las claves que proyecta la consulta.
 * El repositorio castea las filas sin mapearlas, así que llegan en snake_case y
 * con las horas de `time::text`, con segundos ("08:00:00"). Viajan tal cual en
 * el JSON del bloque 3 de BR-CB-24, y `weeklyClassHours` lee `start_time` y
 * `end_time` (BR-CB-19).
 */
export interface ScheduleData {
  day_name: string;
  start_time: string;
  end_time: string;
  course_name: string;
  section_code: string;
  classroom: string | null;
}

export interface CurriculumData {
  courseName: string;
  cycle: number;
  status: string;
  credit: number;
}

export interface AlertData {
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface AnnouncementData {
  title: string;
  message: string;
  courseName: string;
  sectionCode: string;
  publishedAt: Date;
}

/**
 * Delegado o subdelegado de una sección (BR-CB-16). `isSelf` marca que es el
 * alumno que pregunta, por su `student.id` o por el código del claim del portal.
 */
export interface SectionRepresentativePerson {
  fullName: string;
  isSelf: boolean;
}

/**
 * Una sección activa del alumno con su delegado y su subdelegado (BR-CB-16).
 * `null` = ese cargo no tiene a nadie registrado, ni en la app ni en el portal.
 * No lleva códigos, correos ni el origen del dato.
 */
export interface SectionRepresentativesData {
  courseName: string;
  sectionCode: string;
  delegate: SectionRepresentativePerson | null;
  subdelegate: SectionRepresentativePerson | null;
}

/** Fila cruda de notas OFICIALES (student_score) por evaluación del período activo. */
export interface OfficialGradeRow {
  course_id: number;
  course_name: string;
  section_code: string | null;
  assessment_id: number | null;
  assessment_code: string | null;
  assessment_name: string | null;
  assessment_weight: string | null;
  score_value: string | null;
}

/** Resumen por curso de notas oficiales + cuánto falta para aprobar (mín. 10.5). */
export interface OfficialCourseGrades {
  courseName: string;
  sectionCode: string | null;
  evaluaciones: Array<{ nombre: string; peso: number; nota: number | null }>;
  pesoCalificado: number; // % del curso ya calificado
  promedioActual: number; // promedio ponderado sobre lo calificado (0-20)
  notaAcumulada: number; // contribución actual a la nota final (Σ nota*peso/100)
  estado: "aprobado" | "en_curso" | "imposible" | "sin_notas";
  necesitaEnLoRestante: number | null; // nota promedio requerida en lo que falta (0-20)
}
