import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { createAuthRoutes } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";

const authRepository = new AuthRepository(db);
const authService = new AuthService(authRepository, eventBus);
const authController = new AuthController(authService);

export const authRoutes = createAuthRoutes(authController);

/** Se exporta la MISMA instancia (no una nueva) para que portal-sync pueda
 *  re-firmar el token del alumno que acaba de ser promovido a delegado. */
export { authService };

export { AuthController } from "./auth.controller.js";
export { AuthRepository } from "./auth.repository.js";
export { AuthService } from "./auth.service.js";
export { loginSchema } from "./auth.schemas.js";
export type { AppRole } from "./auth.types.js";
