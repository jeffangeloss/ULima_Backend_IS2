import { config } from "../../config/app-config.js";
import { db } from "../../db/index.js";
import { AppSettingRepository } from "./app-setting.repository.js";
import { crearLectorDelModo } from "./modo-estatico.lector.js";

const appSettingRepository = new AppSettingRepository(db);

/**
 * RF-IRM-2. Lector único del modo para todo el backend, con una instancia y una caché por
 * proceso. Lee la fila de `app_setting` y su respaldo es `config.modoEstatico`, el único acceso a
 * `MODO_ESTATICO` (RF-EST-1). Ningún otro archivo de `src/modules` lee esa configuración.
 */
export const modoEstatico = crearLectorDelModo({
  consultar: () => appSettingRepository.leerModoEstatico(),
  respaldo: config.modoEstatico,
});

export { AppSettingRepository } from "./app-setting.repository.js";
export { crearLectorDelModo, modoFijo } from "./modo-estatico.lector.js";
export type { ConsultaDelModo, LectorDelModo } from "./modo-estatico.lector.js";
