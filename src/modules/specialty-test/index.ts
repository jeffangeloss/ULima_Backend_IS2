import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { cohereClient } from "../../services/cohere.client.js";
import { CONTENT_REGISTRY } from "./content/index.js";
import { SpecialtyTestController } from "./specialty-test.controller.js";
import { SpecialtyTestRepository } from "./specialty-test.repository.js";
import { createSpecialtyTestRoutes } from "./specialty-test.routes.js";
import { SpecialtyTestService } from "./specialty-test.service.js";

const specialtyTestRepository = new SpecialtyTestRepository(db);
const specialtyTestService = new SpecialtyTestService(
  specialtyTestRepository,
  eventBus,
  cohereClient,
  CONTENT_REGISTRY,
);
const specialtyTestController = new SpecialtyTestController(specialtyTestService);

export const specialtyTestRoutes = createSpecialtyTestRoutes(specialtyTestController);

export { CONTENT_BY_VERSION, CONTENT_REGISTRY, CURRENT_VERSION } from "./content/index.js";
export { SpecialtyTestController } from "./specialty-test.controller.js";
export { SpecialtyTestRepository } from "./specialty-test.repository.js";
export { SpecialtyTestService } from "./specialty-test.service.js";
export { createSpecialtyTestRoutes } from "./specialty-test.routes.js";
