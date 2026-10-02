import { config } from "../../config/app-config.js";
import { db } from "../../db/index.js";
import { authService } from "../auth/index.js";
import { gradesService } from "../grades/index.js";
import { portalClient } from "../../services/portal.client.js";
import { PortalSyncController } from "./portal-sync.controller.js";
import { PortalSyncRepository } from "./portal-sync.repository.js";
import { createPortalSyncRoutes } from "./portal-sync.routes.js";
import { elegirRutasPortalSync } from "./portal-sync-desactivado.routes.js";
import { PortalSyncService } from "./portal-sync.service.js";
import { portalLoginGuard } from "./portal-login-guard.js";
import { PortalRefreshRepository } from "./refresh/refresh.repository.js";
import { PortalRefreshService } from "./refresh/refresh.service.js";

// RF-EST-3. En modo estático `/portal-sync` lo sirve un router que responde 503
// PORTAL_DESACTIVADO y no se construye ningún servicio ni repositorio del portal. El
// código activo queda intacto detrás de este interruptor.
const construirRutasActivas = () => {
  const portalSyncRepository = new PortalSyncRepository(db);
  const portalSyncService = new PortalSyncService(portalSyncRepository, portalClient, authService, portalLoginGuard);
  // RS-BE-49. La recarga comparte con la importación la guarda de inicio de
  // sesión y el tope de rechazos (una sola instancia) y devuelve en `view` la
  // vista de GET /grades/me/ulima.
  const portalRefreshService = new PortalRefreshService({
    repository: new PortalRefreshRepository(db),
    client: portalClient,
    guard: portalLoginGuard,
    leerVista: (studentId) => gradesService.getUlimaGrades(studentId),
    budgetMs: config.portal.refreshBudgetMs,
  });
  const portalSyncController = new PortalSyncController(portalSyncService, portalRefreshService);

  // RS-BE-17: `AuthService.register` necesita poder correr una importación
  // (para crear la cuenta y cargar el ciclo en la misma transacción), pero
  // `auth` no puede importar `portal-sync/index.ts` sin cerrar el ciclo (este
  // archivo ya importa `authService`). Se inyecta acá la MISMA instancia,
  // después de construirse, contra el tipo estructural `Registrar`. En modo
  // estático no se llama y `register()` responde 503 REGISTRATION_UNAVAILABLE.
  authService.setRegistrar(portalSyncService);

  return createPortalSyncRoutes(portalSyncController);
};

export const portalSyncRoutes = elegirRutasPortalSync(config.modoEstatico, construirRutasActivas);

export { PortalSyncController } from "./portal-sync.controller.js";
export { PortalSyncRepository } from "./portal-sync.repository.js";
export { PortalSyncService } from "./portal-sync.service.js";
export { PortalRefreshService } from "./refresh/refresh.service.js";
