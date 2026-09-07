/**
 * `sin_datos` NO es un grado de riesgo: es la ausencia de dato. Existe porque
 * `enrollment.total_hours = 0` significa "nunca se escribió asistencia"
 * (lo garantiza el CHECK chk_enrollment_attendance_hours), y antes esas filas
 * caían en `normal` con 0% de ausencia. Ver RS-BE-10.
 */
export type StudentRiskStatus = "impedido" | "en_riesgo" | "normal" | "sin_datos";

export type AttendanceRiskRawRow = {
  code: string;
  full_name: string;
  current_level: number | null;
  absent_hours: string;
  /** Denominador de la SECCIÓN (course_offering), no dice si hay dato del alumno. */
  total_section_hours: string;
  /** Horas de la MATRÍCULA. 0 = nunca se escribió asistencia para este alumno. */
  enrollment_total_hours: string;
  cycle: number;
};

export type StudentNotifyRow = {
  student_id: number;
  code: string;
  full_name: string;
  current_level: number | null;
  absent_hours: string;
  total_section_hours: string;
  /** Horas de la MATRÍCULA. 0 = nunca se escribió asistencia para este alumno. */
  enrollment_total_hours: string;
  course_name: string;
  section_code: string;
  cycle: number;
};

export type NotifyResult = {
  notified: number;
  message: string;
};

export type AttendanceRiskStudentResponse = {
  code: string;
  firstName: string;
  lastName: string;
  currentLevel: number | null;
  cycle: number | null;
  absentHours: number;
  totalHours: number;
  /** `null` cuando no hay dato: un 0 acá se leía como asistencia perfecta. */
  absencePercentage: number | null;
  status: StudentRiskStatus;
  missingFaltas: number | null;
};

export type AttendanceRiskSummary = {
  impedido: number;
  en_riesgo: number;
  normal: number;
  /** Matrículas sin asistencia cargada. No se suman a `normal`. */
  sin_datos: number;
  total: number;
};

export type AttendanceRiskResponse = {
  students: AttendanceRiskStudentResponse[];
  summary: AttendanceRiskSummary;
};
