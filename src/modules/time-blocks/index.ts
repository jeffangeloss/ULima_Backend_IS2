import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { TimeBlocksController } from "./time-blocks.controller.js";
import { TimeBlocksRepository } from "./time-blocks.repository.js";
import { createTimeBlocksRoutes } from "./time-blocks.routes.js";
import { TimeBlocksService } from "./time-blocks.service.js";
import type { OwnTimeBlocksSummary } from "./time-blocks.types.js";

const timeBlocksRepository = new TimeBlocksRepository(db);
const timeBlocksService = new TimeBlocksService(timeBlocksRepository, eventBus);
const timeBlocksController = new TimeBlocksController(timeBlocksService);

export const timeBlocksRoutes = createTimeBlocksRoutes(timeBlocksController);

/**
 * RS-BE-35 — La única puerta del chatbot a los bloques de horario propios.
 *
 * Devuelve, solo en lectura, los bloques vigentes y futuros del alumno
 * `studentId` en la ventana de la semana de `today` y la siguiente, sin id ni
 * color, con sus cambios de la ventana y las horas de las dos semanas. El
 * chatbot la recibe por constructor y solo `chatbot/index.ts` la importa como
 * valor; el resto de este módulo no se le expone.
 */
export const readOwnTimeBlocksForAssistant = (
  studentId: number,
  today: string,
): Promise<OwnTimeBlocksSummary> => timeBlocksService.assistantSummary(studentId, today);

export { TimeBlocksController } from "./time-blocks.controller.js";
export { TimeBlocksRepository } from "./time-blocks.repository.js";
export { TimeBlocksService } from "./time-blocks.service.js";
export { createTimeBlocksRoutes } from "./time-blocks.routes.js";
export type { TimeBlockWithExceptions } from "./time-blocks.service.js";
export type {
  OwnTimeBlocksSummary,
  TimeBlockException, TimeBlockInput, TimeBlockOccurrence, TimeBlockRule, TimeBlockWeekHours,
} from "./time-blocks.types.js";
