import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { envSchema } from "../../src/config/env.js";

/**
 * .env.example tiene que seguir al esquema de src/config/env.ts.
 *
 * Lee el archivo del repositorio y valida con el mismo esquema del arranque, sin
 * tocar process.env, la red ni la base de datos, así que corre igual en la CI.
 */
const plantilla = readFileSync(join(import.meta.dir, "..", "..", ".env.example"), "utf8");

// El esquema termina en superRefine (ZodEffects), así que sus claves salen del objeto interno.
const clavesDelEsquema = Object.keys(envSchema.innerType().shape);

// Una variable es una línea NOMBRE=valor sin comentar. Los comentarios y las líneas vacías no cuentan.
const clavesDeLaPlantilla = plantilla
  .split(/\r?\n/)
  .flatMap((linea) => /^([A-Z][A-Z0-9_]*)=/.exec(linea)?.[1] ?? []);

describe(".env.example frente al esquema de src/config/env.ts", () => {
  test("lista todas las variables del esquema y ninguna otra", () => {
    const faltan = clavesDelEsquema.filter((clave) => !clavesDeLaPlantilla.includes(clave));
    const sobran = clavesDeLaPlantilla.filter((clave) => !clavesDelEsquema.includes(clave));
    expect({ faltan, sobran }).toEqual({ faltan: [], sobran: [] });
  });

  test("no repite ninguna variable", () => {
    const repetidas = clavesDeLaPlantilla.filter((clave, i) => clavesDeLaPlantilla.indexOf(clave) !== i);
    expect(repetidas).toEqual([]);
  });

  test("sigue el mismo orden que el esquema", () => {
    expect(clavesDeLaPlantilla).toEqual(clavesDelEsquema);
  });

  test("sus valores de ejemplo pasan el esquema, así que el backend arranca con ella", () => {
    const resultado = envSchema.safeParse(parse(plantilla));
    expect(resultado.success).toBe(true);
  });
});
