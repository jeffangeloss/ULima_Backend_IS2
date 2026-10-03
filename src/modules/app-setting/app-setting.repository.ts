import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";

/**
 * RF-IRM-1 y RF-IRM-2. Única lectura de `app_setting`, en SQL crudo como el resto de los
 * repositories. No atrapa errores de la base, porque qué hacer sin base lo decide el lector del
 * modo (`modo-estatico.lector.ts`).
 */
export class AppSettingRepository {
  constructor(readonly database: typeof db) {}

  /** `static_mode` de la fila 1, o null si la fila no existe. */
  async leerModoEstatico(): Promise<boolean | null> {
    const filas = (await this.database.execute(sql`
      select static_mode
      from app_setting
      where id = 1
    `)) as unknown as Array<{ static_mode: unknown }>;
    const valor = filas[0]?.static_mode;
    return typeof valor === "boolean" ? valor : null;
  }
}
