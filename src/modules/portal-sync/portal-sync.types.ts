export interface PortalCookies { JSESSIONID: string; LtpaToken2: string; LtpaToken?: string }

export interface CicloActivo { cocicloUrl: string; periodCode: string }

export interface MatriculaRow {
  carCode: string; courseCode: string; sectionCode: string; groupCode: string;
  courseName: string; level: number; credits: number; attempt: number;
}
export interface Matricula {
  studentCode: string; studentName: string; careerName: string; periodCode: string; rows: MatriculaRow[];
}

export interface AulaVirtualRow { courseCode: string; courseName: string; sectionCode: string; teacherName: string }

export interface HorarioSession {
  courseCode: string; dayOfWeek: number; startTime: string; endTime: string; classroom: string | null;
}

export interface RecordRow {
  periodCode: string; courseCode: string; courseName: string;
  attempt: number; credits: number; grade: number | null; sectionCode: string;
}

export interface InfoAcademica { careerName: string | null }
export interface Impedimentos { hasImpediment: boolean; hasDebt: boolean; text: string }

/** Entrada de sílabo resuelta de la vista Domino `vSyllabusXCicloAV`, ya
 *  lista para persistir. `unid` es el identificador único del documento
 *  Domino; `url` ya lleva el filename percent-encoded. */
export interface SyllabusEntry { unid: string; fileName: string; url: string }

export type WarningCode =
  | "PERIOD_DATES_DEFAULTED" | "PERIOD_NOT_ACTIVATED_YET" | "TEACHER_MISSING" | "PARSER_FAILED"
  | "CAREER_MISMATCH" | "PROGRESS_SKIPPED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE"
  | "SYLLABUS_UNAVAILABLE";
export interface SyncWarning { code: WarningCode; block: string; message: string }

export interface ImportSummary {
  coursesCreated: number; teachersCreated: number; sectionsCreated: number; sectionsUpdated: number;
  sessionsUpserted: number; enrollmentsUpserted: number; enrollmentsWithdrawn: number;
  progressUpserted: number; progressSkipped: number; alertsCreated: number; syllabiUpserted: number;
}

export interface ImportResult {
  period: { id: number; code: string; created: boolean };
  identity: { portalCode: string; fullName: string; career: string };
  summary: ImportSummary;
  warnings: SyncWarning[];
}

export interface SyncStatus {
  activePeriod: { id: number; code: string } | null;
  enrollmentsInActivePeriod: number;
  needsImport: boolean;
}
