/**
 * Tipos de los bloques de horario propios del alumno (RS-BE-30 a RS-BE-35).
 *
 * Las horas viajan como "HH:MM" y las fechas como "YYYY-MM-DD", en hora de
 * Lima y sin zona pegada: son horas de pared, no instantes. El repository
 * (Tarea 3) recorta el "HH:MM:SS" que devuelve Postgres y lee las columnas
 * `date` con `::text`, para que todo el módulo hable un solo formato.
 */

/** Fila de `student_time_block`: la regla que se repite cada semana. */
export interface TimeBlockRule {
  id: number;
  title: string;
  colorHex: string;
  /** 1 = lunes … 7 = domingo, la convención de `schedule_session.day_of_week`. */
  daysOfWeek: number[];
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD" */
  endDate: string;
}

/** Lo que manda el alumno al crear o editar una regla: la fila sin su id. */
export type TimeBlockInput = Omit<TimeBlockRule, "id">;

export type TimeBlockExceptionStatus = "cancelled" | "moved";

/** Fila de `student_time_block_exception`: lo que se sale de la regla en una
 *  fecha. `cancelled` lleva las dos horas en null; `moved`, las dos con valor
 *  (lo fija el CHECK `chk_time_block_exc_movido`). */
export interface TimeBlockException {
  blockId: number;
  date: string;
  status: TimeBlockExceptionStatus;
  startTime: string | null;
  endTime: string | null;
}

/** Un día concreto ya resuelto: la regla con su excepción aplicada. */
export interface TimeBlockOccurrence {
  blockId: number;
  title: string;
  colorHex: string;
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  moved: boolean;
}

/** Horas de una semana de lunes a domingo, en horas decimales sin redondear. */
export interface TimeBlockWeekHours {
  weekStart: string;
  hours: number;
}

/**
 * RS-BE-35 — Un bloque vigente o futuro tal como lo ve el chatbot: la regla
 * sin `id` ni `colorHex`, con las excepciones de la ventana que caen dentro de
 * su patrón, sin `blockId` y ordenadas por fecha.
 */
export interface OwnTimeBlockForAssistant {
  title: string;
  /** 1 = lunes … 7 = domingo. */
  daysOfWeek: number[];
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
  /** "YYYY-MM-DD" */
  startDate: string;
  /** "YYYY-MM-DD" */
  endDate: string;
  exceptions: Array<Omit<TimeBlockException, "blockId">>;
}

/**
 * RS-BE-35 — Lo único que el chatbot recibe de los bloques del alumno que
 * pregunta (BR-CB-18). Solo lectura y solo estos campos.
 */
export interface OwnTimeBlocksSummary {
  /** Del lunes de la semana de `today` al domingo de la semana siguiente (14 días). */
  window: { from: string; to: string };
  /** Los bloques cuya `endDate` es igual o posterior a `window.from`, en el orden de `findBlocks`. */
  blocks: OwnTimeBlockForAssistant[];
  /** La semana actual y la siguiente, con la forma de `weeks` de RS-BE-34. */
  weeks: TimeBlockWeekHours[];
}
