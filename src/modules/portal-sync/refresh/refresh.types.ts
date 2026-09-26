/**
 * Tipos de la recarga de notas parciales y asistencia (recarga-portal.spec.md).
 */

/** RS-BE-49. Una matrícula activa del alumno en el período activo. La recarga
 *  solo escribe sobre estas, resueltas en el servidor. */
export type MatriculaActiva = {
  enrollmentId: number;
  sectionId: number;
  courseCode: string;
  sectionCode: string;
  courseName: string;
};

/** RS-BE-49, condición previa 1. Sin período activo, `period` es null. */
export type ContextoRecarga = { period: { id: number; code: string } | null; matriculas: MatriculaActiva[] };
