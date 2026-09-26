import { describe, expect, test } from "bun:test";
import {
  REFRESH_BUDGET_DEFAULT_MS, REFRESH_BUDGET_MAX_MS, REFRESH_BUDGET_MIN_MS,
  effectiveRefreshBudgetMs, envSchema,
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

  test("config.portal.refreshBudgetMs ya viene acotado por el timeout", () => {
    // El entorno de las pruebas no define PORTAL_REFRESH_BUDGET_MS.
    expect(config.portal.refreshBudgetMs).toBe(effectiveRefreshBudgetMs(60_000, config.portal.timeoutMs));
  });
});
