export type ChatbotIntent =
  | "grades"
  | "schedule"
  | "curriculum"
  | "alerts"
  | "announcements"
  | "classmates"
  | "chat";

export interface ChatMessage {
  id: string;
  senderName: string;
  body: string;
  createdAt: number;
}

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

export interface ScheduleData {
  dayName: string;
  startTime: string;
  endTime: string;
  courseName: string;
  sectionCode: string;
  classroom: string;
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

export interface ClassmateData {
  fullName: string;
  role: string;
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
