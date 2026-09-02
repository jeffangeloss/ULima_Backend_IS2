import { db } from "../../db/index.js";
import { portalClient } from "../../services/portal.client.js";
import { PortalSyncController } from "./portal-sync.controller.js";
import { PortalSyncRepository } from "./portal-sync.repository.js";
import { createPortalSyncRoutes } from "./portal-sync.routes.js";
import { PortalSyncService } from "./portal-sync.service.js";

const portalSyncRepository = new PortalSyncRepository(db);
const portalSyncService = new PortalSyncService(portalSyncRepository, portalClient);
const portalSyncController = new PortalSyncController(portalSyncService);

export const portalSyncRoutes = createPortalSyncRoutes(portalSyncController);

export { PortalSyncController } from "./portal-sync.controller.js";
export { PortalSyncRepository } from "./portal-sync.repository.js";
export { PortalSyncService } from "./portal-sync.service.js";
