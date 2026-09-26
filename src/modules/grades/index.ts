import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { GradesController } from "./grades.controller.js";
import { GradesRepository } from "./grades.repository.js";
import { createGradesRoutes } from "./grades.routes.js";
import { GradesService } from "./grades.service.js";

const gradesRepository = new GradesRepository(db);
const gradesService = new GradesService(gradesRepository, eventBus);
const gradesController = new GradesController(gradesService);

export const gradesRoutes = createGradesRoutes(gradesController);

// RS-BE-56. La recarga devuelve en `view` exactamente esta vista, ya con lo
// guardado, así que portal-sync recibe el servicio por composición.
export { gradesService };

export { GradesController } from "./grades.controller.js";
export { GradesRepository } from "./grades.repository.js";
export { GradesService } from "./grades.service.js";
export { calculateAverageSchema, saveNotasSchema } from "./grades.schemas.js";
export type {
  GradeValue, NotaInput, CalculateAverageResponse, SaveNotasRequest, LoadNotasResponse,
  UlimaAssessment, UlimaCourse, UlimaGradesView,
} from "./grades.types.js";
