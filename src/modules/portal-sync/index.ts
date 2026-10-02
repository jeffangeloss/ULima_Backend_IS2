import { config } from "../../config/app-config.js";
import { db } from "../../db/index.js";
import { modoEstatico } from "../app-setting/index.js";
import { authService } from "../auth/index.js";
import { gradesService } from "../grades/index.js";
import { portalClient } from "../../services/portal.client.js";
import { PortalSyncController } from "./portal-sync.controller.js";
import { PortalSyncRepository } from "./portal-sync.repository.js";
import { createPortalSyncRoutes } from "./portal-sync.routes.js";
import { protegerRutasPortalSync } from "./portal-sync-desactivado.routes.js";
import { PortalSyncService } from "./portal-sync.service.js";
import { portalLoginGuard } from "./portal-login-guard.js";
import { PortalRefreshRepository } from "./refresh/refresh.repository.js";
import { PortalRefreshService } from "./refresh/refresh.service.js";

// RF-IRM-3. Los servicios y repositorios del portal se construyen siempre, porque construirlos no
// hace ninguna petición. Lo que decide si una petición llega al portal es la guarda de
// `protegerRutasPortalSync`, que consulta el lector del modo en cada petición y en modo estático
// responde 503 PORTAL_DESACTIVADO (RF-EST-3) antes del middleware de sesión.
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
  // después de construirse, contra el tipo estructural `Registrar`. Se instala
  // siempre (RF-IRM-3). En modo estático la guarda de `POST /auth/register`
  // responde 503 REGISTRATION_UNAVAILABLE y nunca llega aquí.
  authService.setRegistrar(portalSyncService);

  return createPortalSyncRoutes(portalSyncController);
};

export const portalSyncRoutes = protegerRutasPortalSync(modoEstatico, construirRutasActivas());

export { PortalSyncController } from "./portal-sync.controller.js";
export { PortalSyncRepository } from "./portal-sync.repository.js";
export { PortalSyncService } from "./portal-sync.service.js";
export { PortalRefreshService } from "./refresh/refresh.service.js";
