import { modoEstatico } from "../app-setting/index.js";
import { createPublicConfigRoutes } from "./public-config.routes.js";

/** RF-IRM-4. Solo depende del lector del modo, nunca de la base. */
export const publicConfigRoutes = createPublicConfigRoutes(modoEstatico);

export { createPublicConfigRoutes } from "./public-config.routes.js";
