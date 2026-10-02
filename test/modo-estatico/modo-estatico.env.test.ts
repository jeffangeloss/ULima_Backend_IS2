import { describe, expect, test } from "bun:test";
import { envSchema } from "../../src/config/env.js";
import { config } from "../../src/config/app-config.js";

/**
 * RF-EST-1. `MODO_ESTATICO` es un booleano que llega como texto, vale `false` si falta y
 * detiene el arranque con cualquier otro valor, para que un error de tipeo en Vercel no
 * deje la versión con el portal encendido sin que nadie lo note.
 */
const base = {
  DATABASE_URL: "postgres://ci:ci@localhost:5432/no-se-usa",
  JWT_SECRET: "secreto-solo-para-ci",
  COHERE_API_KEY: "clave-falsa-de-ci",
};

describe("MODO_ESTATICO en el esquema de entorno (RF-EST-1)", () => {
  test("sin la variable vale false", () => {
    const r = envSchema.safeParse(base);
    expect(r.success && r.data.MODO_ESTATICO).toBe(false);
  });

  test('"true" vale true y "false" vale false', () => {
    const si = envSchema.safeParse({ ...base, MODO_ESTATICO: "true" });
    const no = envSchema.safeParse({ ...base, MODO_ESTATICO: "false" });
    expect(si.success && si.data.MODO_ESTATICO).toBe(true);
    expect(no.success && no.data.MODO_ESTATICO).toBe(false);
  });

  test.each(["1", "yes", "si", "TRUE", "", " true"])("rechaza %p", (valor) => {
    expect(envSchema.safeParse({ ...base, MODO_ESTATICO: valor }).success).toBe(false);
  });

  test("config.modoEstatico sigue a env y, sin la variable en la suite, vale false", () => {
    expect(config.modoEstatico).toBe(false);
  });
});
