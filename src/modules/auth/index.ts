import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { createAuthRoutes } from "./auth.routes.js";
import { AuthService } from "./auth.service.js";
// RS-BE-17: se importa el *repositorio* de portal-sync, no `portal-sync/index.ts`
// (que ya importa `authService`). Importar el repositorio no cierra el ciclo.
import { PortalSyncRepository } from "../portal-sync/portal-sync.repository.js";

const authRepository = new AuthRepository(db);
// Instancia PROPIA de PortalSyncRepository (sin estado más allá de `db`, así
// que no importa que `portal-sync/index.ts` cree la suya): solo se usa para
// las dos lecturas/escrituras de alta de cuenta dentro de `register()`.
const authService = new AuthService(authRepository, eventBus, undefined, new PortalSyncRepository(db));
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
