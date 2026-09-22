/**
 * Reglas de los bloques propios (RS-BE-31, RS-BE-32, RS-BE-33 y RS-BE-34).
 *
 * El service recibe el repository y el `EventBus` y nunca importa `db`, como
 * `academic-record.service.ts:11-15`. `events` está por la arquitectura del
 * repo; esta funcionalidad todavía no publica eventos.
 *
 * El `studentId` llega SIEMPRE del token (lo pone el controller) y baja a cada
 * consulta del repository. La pertenencia se comprueba acá, en el service, como
 * `findSectionOwnedByTeacher` en `advising/teacher` (`teacher.service.ts:38-40`),
 * y además el SQL de la Tarea 3 la vuelve a acotar por `student_id`.
 */
import type { EventBus } from "../../events/index.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  WINDOW_MAX_DAYS,
  addDays,
  dayOfWeekOf,
  expandOccurrences,
  mondayOf,
  weeklyHours,
  withinGrid,
} from "./time-blocks.logic.js";
import type { TimeBlocksRepository } from "./time-blocks.repository.js";
import type { ExceptionInput } from "./time-blocks.schemas.js";
import type {
  TimeBlockException,
  TimeBlockInput,
  TimeBlockOccurrence,
  TimeBlockRule,
  TimeBlockWeekHours,
} from "./time-blocks.types.js";

/** Tope de bloques por alumno (RS-BE-31). No es una regla de negocio: es el
 *  techo que mantiene acotada la expansión de una ventana. Cuenta todos los
 *  bloques guardados, también los vencidos (ver `countBlocks`). */
export const MAX_BLOCKS_PER_STUDENT = 20;

/** La excepción como la ve el alumno: sin `blockId`, que ya es el bloque que
 *  la contiene o el `:id` de la ruta (forma del contrato de la spec, también
 *  en la respuesta del PUT). */
export type TimeBlockExceptionView = Omit<TimeBlockException, "blockId">;

/** Un bloque con sus excepciones, que es lo que devuelven las rutas de
 *  RS-BE-31. Las excepciones salen ordenadas por fecha. */
export interface TimeBlockWithExceptions extends TimeBlockRule {
  exceptions: TimeBlockExceptionView[];
}

const vistaDeExcepcion = (excepcion: TimeBlockException): TimeBlockExceptionView => ({
  date: excepcion.date,
  status: excepcion.status,
  startTime: excepcion.startTime,
  endTime: excepcion.endTime,
});

const conExcepciones = (
  block: TimeBlockRule,
  exceptions: readonly TimeBlockException[],
): TimeBlockWithExceptions => ({
  ...block,
  exceptions: exceptions
    .filter((excepcion) => excepcion.blockId === block.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(vistaDeExcepcion),
});

export class TimeBlocksService {
  constructor(
    readonly repository: TimeBlocksRepository,
    readonly events: EventBus,
  ) {}

  async listBlocks(studentId: number): Promise<{ blocks: TimeBlockWithExceptions[] }> {
    const blocks = await this.repository.findBlocks(studentId);
    const exceptions = await this.repository.findExceptions(
      studentId,
      blocks.map((block) => block.id),
    );
    return { blocks: blocks.map((block) => conExcepciones(block, exceptions)) };
  }

  async createBlock(
    studentId: number,
    input: TimeBlockInput,
  ): Promise<{ block: TimeBlockWithExceptions }> {
    this.exigirHorasDeLaGrilla(input.startTime, input.endTime);

    // El tope se comprueba después de las horas: así un body imposible no
    // gasta una consulta, y el alumno que ya llegó a 20 igual ve primero el
    // error de su formulario.
    const cuantos = await this.repository.countBlocks(studentId);
    if (cuantos >= MAX_BLOCKS_PER_STUDENT) {
      throw new HttpError(
        400,
        `Llegaste al máximo de ${MAX_BLOCKS_PER_STUDENT} bloques guardados, contando los que ya terminaron. Borra uno viejo para crear otro.`,
        "TIME_BLOCK_LIMIT_REACHED",
      );
    }

    const block = await this.repository.insertBlock(studentId, input);
    return { block: { ...block, exceptions: [] } };
  }

  async updateBlock(
    studentId: number,
    blockId: number,
    input: TimeBlockInput,
  ): Promise<{ block: TimeBlockWithExceptions }> {
    this.exigirHorasDeLaGrilla(input.startTime, input.endTime);

    // RS-BE-31: el PATCH reemplaza la regla entera y NO toca las excepciones.
    // Por eso acá solo se actualiza y se vuelven a leer: nada las borra.
    const block = await this.repository.updateBlock(studentId, blockId, input);
    if (block === null) throw this.bloqueNoEncontrado();

    const exceptions = await this.repository.findExceptions(studentId, [blockId]);
    return { block: conExcepciones(block, exceptions) };
  }

  async deleteBlock(studentId: number, blockId: number): Promise<{ ok: true }> {
    const borrado = await this.repository.deleteBlock(studentId, blockId);
    if (!borrado) throw this.bloqueNoEncontrado();
    return { ok: true };
  }

  async setException(
    studentId: number,
    blockId: number,
    date: string,
    body: ExceptionInput,
  ): Promise<{ exception: TimeBlockExceptionView }> {
    const block = await this.repository.findBlockOwnedBy(studentId, blockId);
    if (block === null) throw this.bloqueNoEncontrado();

    this.exigirFechaDelPatron(block, date);
    if (body.status === "moved") {
      this.exigirHorasDeLaGrilla(body.startTime, body.endTime);
    }

    const exception = await this.repository.upsertException(
      studentId,
      blockId,
      date,
      body.status,
      body.status === "moved" ? body.startTime : null,
      body.status === "moved" ? body.endTime : null,
    );
    // null: el bloque dejó de ser del alumno (se borró) entre la lectura y la escritura.
    if (exception === null) throw this.bloqueNoEncontrado();
    return { exception: vistaDeExcepcion(exception) };
  }

  async clearException(studentId: number, blockId: number, date: string): Promise<{ ok: true }> {
    const block = await this.repository.findBlockOwnedBy(studentId, blockId);
    if (block === null) throw this.bloqueNoEncontrado();

    // Sin exigir que la fecha esté en el patrón y sin mirar si había algo que
    // borrar: quitar una excepción es idempotente y una fila vieja que quedó
    // fuera del patrón —porque el alumno movió el rango del bloque— también
    // se tiene que poder limpiar. Que la fecha exista ya lo garantiza
    // `occurrenceParamsSchema`.
    await this.repository.deleteException(studentId, blockId, date);
    return { ok: true };
  }

  async occurrences(
    studentId: number,
    from: string,
    to: string,
  ): Promise<{ occurrences: TimeBlockOccurrence[]; weeks: TimeBlockWeekHours[] }> {
    this.exigirVentana(from, to);

    const blocks = await this.repository.findBlocks(studentId);
    const exceptions = await this.repository.findExceptions(
      studentId,
      blocks.map((block) => block.id),
    );

    // RS-BE-34 pide, por cada semana que toca la ventana, el total de horas de
    // la semana ENTERA, aunque la ventana la corte. Por eso se expande del
    // lunes de `from` al domingo de la semana de `to`, las horas se suman
    // sobre eso, y recién después las ocurrencias se recortan a [from, to].
    // Las horas salen de las ocurrencias ya expandidas: el service no vuelve a
    // sumar por su cuenta.
    const semanasCompletas = expandOccurrences(
      blocks,
      exceptions,
      mondayOf(from),
      addDays(mondayOf(to), 6),
    );
    const occurrences = semanasCompletas.filter(
      (ocurrencia) => ocurrencia.date >= from && ocurrencia.date <= to,
    );
    return { occurrences, weeks: weeklyHours(semanasCompletas, from, to) };
  }

  /** 404 y no 403 a propósito: un id de otro alumno no tiene por qué revelar
   *  que el bloque existe. El repository ya acota por `student_id`, así que
   *  "no es tuyo" y "no existe" llegan acá como el mismo `null`. */
  private bloqueNoEncontrado(): HttpError {
    return new HttpError(404, "No existe ese bloque.", "TIME_BLOCK_NOT_FOUND");
  }

  /** RS-BE-31: las dos horas dentro de 07:00–22:00, bordes incluidos. Que la
   *  de fin sea mayor que la de inicio lo exigen los esquemas (400
   *  INVALID_REQUEST_BODY): la spec reserva TIME_BLOCK_OUT_OF_GRID para la
   *  grilla. Si una llamada sin Zod delante llegara con las horas invertidas,
   *  la frenan `chk_time_block_horas` y `chk_time_block_exc_movido` en la base. */
  private exigirHorasDeLaGrilla(startTime: string, endTime: string): void {
    if (!withinGrid(startTime, endTime)) {
      throw new HttpError(
        400,
        "El bloque tiene que empezar y terminar entre las 07:00 y las 22:00.",
        "TIME_BLOCK_OUT_OF_GRID",
      );
    }
  }

  /** RS-BE-32: la fecha existe, cae dentro del rango del bloque y en uno de
   *  sus días. Por HTTP la existencia ya la garantiza `occurrenceParamsSchema`;
   *  acá se repite porque es parte de la regla —el patrón no genera un día que
   *  no existe— y el service no depende de quién lo llame. `addDays(date, 0)`
   *  rearma la fecha con `Date.UTC` y la reimprime, así que "2026-02-30" vuelve
   *  como "2026-03-02" y no coincide consigo misma. */
  private exigirFechaDelPatron(block: TimeBlockRule, date: string): void {
    const existe = addDays(date, 0) === date;
    const enRango = date >= block.startDate && date <= block.endDate;
    if (!existe || !enRango || !block.daysOfWeek.includes(dayOfWeekOf(date))) {
      throw new HttpError(
        400,
        "Ese día no forma parte del bloque.",
        "TIME_BLOCK_OCCURRENCE_NOT_IN_PATTERN",
      );
    }
  }

  /** RS-BE-33: la ventana no pasa de `WINDOW_MAX_DAYS` días contando los dos
   *  extremos. Que `to` no sea anterior a `from` lo exige `windowQuerySchema`
   *  (400 INVALID_QUERY_PARAMS): una ventana al revés no es "demasiado ancha". */
  private exigirVentana(from: string, to: string): void {
    if (to > addDays(from, WINDOW_MAX_DAYS - 1)) {
      throw new HttpError(
        400,
        `La ventana no puede pasar de ${WINDOW_MAX_DAYS} días.`,
        "TIME_BLOCK_WINDOW_TOO_WIDE",
      );
    }
  }
}
