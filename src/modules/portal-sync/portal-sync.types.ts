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

/** Una fila del sidebar del panel Delegado: el `aula` es la llave del portal;
 *  `courseCode` + `sectionCode` es la llave con la que empata contra las
 *  secciones que la matrícula está creando. */
export interface DelegadoAula { aula: string; courseCode: string; sectionCode: string }

/** El representante tal como el portal lo publica: sin cuenta, sin correo. */
export interface DelegadoPersona { code: string; fullName: string }

/** Un cargo que el portal SÍ marcó pero que se descartó por venir inservible
 *  (código o nombre fuera de los largos de la tabla, o nombre vacío).
 *
 *  Lleva la posición y no solo un texto porque el service necesita
 *  distinguirla de una ausencia real: un cargo descartado NO es una
 *  revocación, y tratarlo como tal borraría un claim bueno. */
export interface DelegadoDescarte { position: "delegate" | "subdelegate"; reason: string }

/** Los dos cargos de una sección. Ambos son opcionales: una sección que
 *  todavía no eligió es un resultado válido, no un error. */
export interface DelegadosNomina {
  delegate?: DelegadoPersona;
  subdelegate?: DelegadoPersona;
  warnings?: DelegadoDescarte[];
}

export type WarningCode =
  | "PERIOD_DATES_DEFAULTED" | "PERIOD_NOT_ACTIVATED_YET" | "TEACHER_MISSING" | "PARSER_FAILED"
  | "CAREER_MISMATCH" | "PROGRESS_SKIPPED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE"
  | "LEVEL_REGRESSION_BLOCKED"
  | "SYLLABUS_UNAVAILABLE"
  // La nómina de un aula no se pudo DESCARGAR (red, 5xx, timeout o el 409
  // de sesión inválida). Distinto de PARSER_FAILED, que es "llegó pero no
  // se entendió": el primero no dice nada sobre el portal, el segundo sí.
  | "DELEGADOS_UNAVAILABLE";
export interface SyncWarning { code: WarningCode; block: string; message: string }

export interface ImportSummary {
  coursesCreated: number; teachersCreated: number; sectionsCreated: number; sectionsUpdated: number;
  sessionsUpserted: number; enrollmentsUpserted: number; enrollmentsWithdrawn: number;
  progressUpserted: number; progressSkipped: number; alertsCreated: number; syllabiUpserted: number;
  claimsUpserted: number; claimsDeleted: number; representativesPromoted: number;
  alertsDeleted: number;
}

export interface ImportResult {
  period: { id: number; code: string; created: boolean };
  identity: { portalCode: string; fullName: string; career: string };
  summary: ImportSummary;
  warnings: SyncWarning[];
  /** JWT re-firmado cuando la importación promovió al propio alumno a
   *  delegado o subdelegado; `null` en cualquier otro caso. El rol viaja
   *  DENTRO del token y solo se calcula en el login, así que sin esto el
   *  recién promovido no vería su pestaña hasta volver a entrar. */
  token: string | null;
}

export interface SyncStatus {
  activePeriod: { id: number; code: string } | null;
  enrollmentsInActivePeriod: number;
  needsImport: boolean;
}
