/**
 * Tipos del récord académico.
 *
 * Los `*Record` son lo que devuelve el repository: una fila por objeto, ya
 * convertida (`numeric` y `smallint` a number, `timestamptz` a Date). El
 * `AcademicRecordDto` es el contrato que ve el alumno (RS-BE-26): todo número
 * viaja como number JSON —nunca como string— y un campo sin dato viaja como
 * null, nunca como 0. En los pares de cursos y créditos cada número va por
 * separado, porque el portal puede dejar uno solo sin leer.
 */

/** Par "cursos | créditos" de la información académica. */
export interface CountCreditsDto {
  courses: number | null;
  credits: number | null;
}

/** Fila de `student_academic_snapshot`. `syncedAt` es la fecha de la copia
 *  visible y nunca es null: la columna es NOT NULL. */
export interface SnapshotRecord {
  ppa: number | null;
  relativePosition: string | null;
  convalidatedCourses: number | null;
  convalidatedCredits: number | null;
  approvedCourses: number | null;
  approvedCredits: number | null;
  creditsAccumulated: number | null;
  creditsRequired: number | null;
  syncedAt: Date;
}

/** Fila de `student_record_entry`. `credits` conserva el decimal del portal. */
export interface EntryRecord {
  periodCode: string;
  courseCode: string;
  courseName: string;
  attempt: number;
  credits: number;
  grade: number | null;
  gradeRaw: string | null;
  sectionCode: string | null;
  observation: string | null;
}

/** Fila de `student_period_summary`. */
export interface PeriodSummaryRecord {
  periodCode: string;
  average: number | null;
  relativePosition: string | null;
  level: number | null;
  convalidatedCourses: number | null;
  convalidatedCredits: number | null;
  enrolledCourses: number | null;
  enrolledCredits: number | null;
  approvedCourses: number | null;
  approvedCredits: number | null;
  failedCourses: number | null;
  failedCredits: number | null;
}

/** Respuesta de `GET /academic-record/me`. */
export interface AcademicRecordDto {
  /** ISO-8601 de `student_academic_snapshot.synced_at`, o null si no hay foto. */
  syncedAt: string | null;
  snapshot: {
    ppa: number | null;
    relativePosition: string | null;
    creditsAccumulated: number | null;
    creditsRequired: number | null;
    approved: CountCreditsDto;
    convalidated: CountCreditsDto;
  } | null;
  periods: Array<{
    periodCode: string;
    average: number | null;
    relativePosition: string | null;
    level: number | null;
    convalidated: CountCreditsDto;
    enrolled: CountCreditsDto;
    approved: CountCreditsDto;
    failed: CountCreditsDto;
  }>;
  /** Ciclos del más reciente al más viejo; dentro, los cursos en el orden leído. */
  record: Array<{
    periodCode: string;
    courses: Array<{
      code: string;
      name: string;
      attempt: number;
      credits: number;
      grade: number | null;
      gradeRaw: string | null;
      section: string | null;
      observation: string | null;
    }>;
  }>;
}
