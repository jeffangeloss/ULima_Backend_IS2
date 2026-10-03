import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { appSetting } from "../../src/db/schema/schema.js";

/**
 * RF-IRM-1. El .sql se lee como texto, así que esta prueba no aplica la migración ni toca
 * ninguna base. La aplica dos veces contra PostgreSQL `app-setting.postgres.test.ts`. Los
 * comentarios del encabezado se quitan antes de contar, para que una palabra del texto no cuente
 * como sentencia.
 */
const migracion = await Bun.file("drizzle/0016_app_setting.sql").text();
const sentencias = migracion
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const veces = (aguja: string): number => sentencias.split(aguja).length - 1;

describe("drizzle/0016_app_setting.sql (RF-IRM-1)", () => {
  test("crea una sola tabla con IF NOT EXISTS y una sola fila posible", () => {
    expect(sentencias).toContain("CREATE TABLE IF NOT EXISTS app_setting (");
    expect(veces("CREATE TABLE")).toBe(1);
    expect(sentencias).toContain("id smallint PRIMARY KEY DEFAULT 1,");
    expect(sentencias).toContain("static_mode boolean NOT NULL,");
    expect(sentencias).toContain("updated_at timestamptz NOT NULL DEFAULT now(),");
    expect(sentencias).toContain("CONSTRAINT chk_app_setting_single_row CHECK (id = 1)");
  });

  test("inserta la fila (1, true) sin pisar una que ya exista", () => {
    expect(sentencias).toContain(
      "INSERT INTO app_setting (id, static_mode) VALUES (1, true)\nON CONFLICT (id) DO NOTHING;",
    );
    expect(veces("INSERT INTO")).toBe(1);
  });

  test("es aditiva y no toca otra tabla ni otra fila", () => {
    expect(sentencias).not.toContain("ALTER TABLE");
    expect(sentencias).not.toContain("DROP");
    expect(sentencias).not.toContain("UPDATE");
    expect(sentencias).not.toContain("DELETE");
    expect(migracion).not.toContain("db:push");
  });

  test("el esquema de Drizzle declara la misma tabla", () => {
    const tabla = getTableConfig(appSetting);
    expect(tabla.name).toBe("app_setting");
    expect(Object.fromEntries(tabla.columns.map((c) => [c.name, c.getSQLType()]))).toEqual({
      id: "smallint",
      static_mode: "boolean",
      updated_at: "timestamp with time zone",
    });
    expect(tabla.columns.every((c) => c.notNull)).toBe(true);
    expect(tabla.columns.filter((c) => c.primary).map((c) => c.name)).toEqual(["id"]);
    expect(tabla.checks.map((c) => c.name)).toEqual(["chk_app_setting_single_row"]);
  });
});
