import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  REFRESH_BUDGET_DEFAULT_MS, REFRESH_BUDGET_MAX_MS, REFRESH_BUDGET_MIN_MS,
  effectiveRefreshBudgetMs, env, envSchema,
} from "../../src/config/env.js";
import { config } from "../../src/config/app-config.js";

/**
 * RS-BE-50 · PORTAL_REFRESH_BUDGET_MS y el presupuesto efectivo de la recarga.
 *
 * Se valida con el mismo esquema del arranque sobre un entorno armado a mano,
 * sin tocar process.env. Los tres secretos son ficticios.
 */
const BASE = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/test",
  JWT_SECRET: "test-jwt-secret",
  COHERE_API_KEY: "test-cohere-key",
};
const arrancar = (extra: Record<string, string> = {}) => envSchema.safeParse({ ...BASE, ...extra });

describe("PORTAL_REFRESH_BUDGET_MS", () => {
  test("sin la variable vale 60 000", () => {
    const r = arrancar();
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.PORTAL_REFRESH_BUDGET_MS).toBe(60_000);
    expect(REFRESH_BUDGET_DEFAULT_MS).toBe(60_000);
  });

  test("65 000 se acepta y 66 000 se rechaza", () => {
    const r = arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.PORTAL_REFRESH_BUDGET_MS).toBe(65_000);
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "66000" }).success).toBe(false);
    expect(REFRESH_BUDGET_MAX_MS).toBe(65_000);
  });

  test("20 000 se acepta y 19 999 se rechaza", () => {
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "20000" }).success).toBe(true);
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "19999" }).success).toBe(false);
    expect(REFRESH_BUDGET_MIN_MS).toBe(20_000);
  });

  test("un valor que no es entero detiene el arranque en vez de caer al valor por defecto", () => {
    for (const valor of ["abc", "60000.5", "", "6e4x"]) {
      expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: valor }).success).toBe(false);
    }
  });
});

describe("presupuesto efectivo", () => {
  test("con 65 000, un timeout de 8 000 lo deja en 65 000, uno de 15 000 en 51 000 y uno de 30 000 en 21 000", () => {
    expect(effectiveRefreshBudgetMs(65_000, 8_000)).toBe(65_000);
    expect(effectiveRefreshBudgetMs(65_000, 15_000)).toBe(51_000);
    expect(effectiveRefreshBudgetMs(65_000, 30_000)).toBe(21_000);
  });

  test("con PORTAL_TIMEOUT_MS de 31 000 el arranque falla", () => {
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000", PORTAL_TIMEOUT_MS: "31000" }).success).toBe(false);
  });

  test("el límite exacto es un timeout de 30 500", () => {
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000", PORTAL_TIMEOUT_MS: "30500" }).success).toBe(true);
    expect(arrancar({ PORTAL_REFRESH_BUDGET_MS: "65000", PORTAL_TIMEOUT_MS: "30501" }).success).toBe(false);
  });

  test("config.portal.refreshBudgetMs sale del presupuesto y del timeout que valida el arranque", () => {
    // Vale con cualquier .env local, porque compara contra lo que el arranque leyó.
    expect(config.portal.refreshBudgetMs)
      .toBe(effectiveRefreshBudgetMs(env.PORTAL_REFRESH_BUDGET_MS, env.PORTAL_TIMEOUT_MS));
  });

  test("config.portal.refreshBudgetMs ya viene acotado por el timeout", () => {
    // Con el timeout de 8 000 de las pruebas la cota no actúa, así que config se
    // lee en un proceso aparte con 15 000 y 65 000. Ese proceso corre en la
    // carpeta de esta prueba, que no tiene .env, y su entorno lleva solo esas dos
    // variables y los secretos ficticios de BASE.
    const appConfig = join(import.meta.dir, "..", "..", "src", "config", "app-config.ts");
    const hijo = Bun.spawnSync({
      cmd: [
        process.execPath, "-e",
        `const { config } = await import(${JSON.stringify(appConfig)}); console.log(config.portal.refreshBudgetMs);`,
      ],
      cwd: import.meta.dir,
      env: { ...BASE, PORTAL_TIMEOUT_MS: "15000", PORTAL_REFRESH_BUDGET_MS: "65000" },
    });
    expect(hijo.stderr.toString()).toBe("");
    expect(hijo.exitCode).toBe(0);
    expect(hijo.stdout.toString().trim()).toBe("51000");
  });
});
