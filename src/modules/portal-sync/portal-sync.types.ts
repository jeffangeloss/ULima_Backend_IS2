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

/** Una fila del récord académico (RS-BE-19 de academic-record). `credits` trae
 *  el decimal del portal, sin redondear. `grade` es la nota entera 0–20 o `null`
 *  (alimenta `enrollment.final_grade`); `gradeRaw` es el texto de la celda NOTA
 *  tal cual, o `null` si vino vacía. `observation` es `null` si la celda no trae
 *  texto. */
export interface RecordRow {
  periodCode: string; courseCode: string; courseName: string;
  attempt: number; credits: number; grade: number | null; sectionCode: string;
  gradeRaw: string | null; observation: string | null;
}

/** Totales del pie del récord (RS-BE-20), leídos por posición. La celda
 *  COD. CAR. no se guarda. */
export interface RecordFooter {
  weightedAverage: number; convalidatedCredits: number; approvedCredits: number; validCredits: number;
  convalidatedCourses: number; approvedCourses: number; validCourses: number;
  failedCredits: number; failedCourses: number;
}

/** Lo que el lector ve en la página del récord. La regla de confianza
 *  (RS-BE-21) decide con esto si la copia se puede guardar. */
export interface RecordPage {
  /** Filas leídas. */
  rows: RecordRow[];
  /** Se halló la tabla con la cabecera exacta y se leyó solo esa tabla. */
  headerOk: boolean;
  /** Filas de datos descartadas; solo se cuentan con `headerOk`. */
  discarded: number;
  /** `null` = pie ausente o ilegible. */
  footer: RecordFooter | null;
}

/** Cursos y créditos de un grupo del bloque "Información Académica"
 *  ("Convalidados", "Aprobados"…). Cada número puede faltar por separado:
 *  `null` es "no se pudo leer", nunca 0. */
export interface CountCredits { courses: number | null; credits: number | null }

/** Sub-bloque "Información General" de `layout.jsp` (RS-BE-24). */
export interface AcademicGeneral {
  ppa: number | null; relativePosition: string | null;
  convalidated: CountCredits; approved: CountCredits;
  creditsAccumulated: number | null; creditsRequired: number | null;
}

/** Sub-bloque "Información por Período Académico" de `layout.jsp` (RS-BE-24).
 *  `periodCode` es el ciclo que el propio bloque declara, que es el ANTERIOR
 *  al que se está importando: nunca se guarda como "período actual". */
export interface AcademicPeriodBlock {
  periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
  convalidated: CountCredits; enrolled: CountCredits; approved: CountCredits; failed: CountCredits;
}

export interface InfoAcademica {
  careerName: string | null;
  /** Siempre presente; sus campos quedan `null` si no se pudieron leer. */
  general: AcademicGeneral;
  /** `null` si no se halla el bloque o su código de ciclo. */
  period: AcademicPeriodBlock | null;
  /** Nombres de los campos que no se pudieron leer ("general.ppa", "period"…),
   *  para el log del servidor. Nunca lleva valores: el repo es público. */
  unreadable: string[];
}
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
  | "DELEGADOS_UNAVAILABLE"
  // La página de asistencia de un aula no se pudo DESCARGAR. Misma distinción
  // que arriba respecto de PARSER_FAILED.
  | "ASISTENCIA_UNAVAILABLE"
  // RS-BE-23: la limpieza desmarcó electivos que el récord no respalda. Es el
  // único aviso nuevo del récord académico; los demás motivos (récord no
  // confiable, información académica incompleta) van solo al log del servidor.
  | "PROGRESS_REMOVED";
export interface SyncWarning { code: WarningCode; block: string; message: string }

export interface ImportSummary {
  coursesCreated: number; teachersCreated: number; sectionsCreated: number; sectionsUpdated: number;
  sessionsUpserted: number; enrollmentsUpserted: number; enrollmentsWithdrawn: number;
  progressUpserted: number; progressSkipped: number;
  /** Cursos DE LA MALLA cuyo progreso entró por `course_equivalence` y no por
   *  código directo. Cuenta cursos y no filas del récord, para que sea
   *  comparable con `progressUpserted`: dos códigos viejos fusionados en uno
   *  cuentan una vez. Existe para medir cuánto aporta la tabla sin leer la BD. */
  progressViaEquivalence: number;
  /** Filas de `student_course_progress` BORRADAS por la limpieza de electivos
   *  no respaldados (RS-BE-23). Es el único contador de la importación que
   *  cuenta datos eliminados. Queda en 0 cuando la limpieza no corre: sin
   *  consentimiento, con un récord no confiable, con un código aprobado sin
   *  resolver o con el conjunto de respaldo vacío. */
  progressRemoved: number;
  alertsCreated: number; syllabiUpserted: number;
  claimsUpserted: number; claimsDeleted: number; representativesPromoted: number;
  alertsDeleted: number;
  /** Matrículas cuyas horas de asistencia se escribieron (RS-BE-15). */
  attendanceUpdated: number;
  /** Matrículas con asistencia disponible que NO se escribió: triple incoherente
   *  o el UPDATE no tocó ninguna fila. Se cuenta para que "0 actualizadas" se
   *  pueda distinguir de "el portal no reportó nada". */
  attendanceSkipped: number;
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

/**
 * Asistencia de UN curso, tal como la publica el panel Asistencia del Aula
 * Virtual para el alumno autenticado (RS-BE-15).
 *
 * CINCO CAMPOS Y NINGUNO DE TEXTO LIBRE. La ausencia de campos para la sesión
 * individual, la marca y la columna "Observación" es la garantía de
 * minimización de datos, no un olvido: esa página trae el nombre del alumno, el
 * del docente y observaciones que mencionan a terceros. No agregar campos acá
 * sin pasar por la spec.
 */
export type AsistenciaCurso = {
  courseCode: string;
  sectionCode: string;
  /** "Total horas programadas" del portal. Es el denominador del alumno. */
  totalHours: number;
  /** "Total horas asistidas". */
  attendedHours: number;
  /** Horas del bloque "Total inasistencias"; NUNCA derivado de los otros dos. */
  absentHours: number;
};
