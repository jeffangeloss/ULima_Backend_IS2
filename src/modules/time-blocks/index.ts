import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { TimeBlocksController } from "./time-blocks.controller.js";
import { TimeBlocksRepository } from "./time-blocks.repository.js";
import { createTimeBlocksRoutes } from "./time-blocks.routes.js";
import { TimeBlocksService } from "./time-blocks.service.js";

const timeBlocksRepository = new TimeBlocksRepository(db);
const timeBlocksService = new TimeBlocksService(timeBlocksRepository, eventBus);
const timeBlocksController = new TimeBlocksController(timeBlocksService);

export const timeBlocksRoutes = createTimeBlocksRoutes(timeBlocksController);

export { TimeBlocksController } from "./time-blocks.controller.js";
export { TimeBlocksRepository } from "./time-blocks.repository.js";
export { TimeBlocksService } from "./time-blocks.service.js";
export { createTimeBlocksRoutes } from "./time-blocks.routes.js";
export type { TimeBlockWithExceptions } from "./time-blocks.service.js";
export type {
  TimeBlockException, TimeBlockInput, TimeBlockOccurrence, TimeBlockRule, TimeBlockWeekHours,
} from "./time-blocks.types.js";
