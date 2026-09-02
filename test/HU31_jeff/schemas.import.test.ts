import { describe, expect, test } from "bun:test";
import { importCookiesSchema } from "../../src/modules/portal-sync/portal-sync.schemas.js";

describe("importCookiesSchema", () => {
  test("acepta las dos cookies obligatorias", () => {
    const r = importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a", LtpaToken2: "b" } });
    expect(r.success).toBe(true);
  });

  test("acepta LtpaToken opcional", () => {
    const r = importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a", LtpaToken2: "b", LtpaToken: "c" } });
    expect(r.success).toBe(true);
  });

  test("rechaza si falta LtpaToken2", () => {
    expect(importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a" } }).success).toBe(false);
  });

  test("rechaza cookies vacias o gigantes", () => {
    expect(importCookiesSchema.safeParse({ cookies: { JSESSIONID: "", LtpaToken2: "b" } }).success).toBe(false);
    expect(importCookiesSchema.safeParse({ cookies: { JSESSIONID: "a".repeat(5000), LtpaToken2: "b" } }).success).toBe(false);
  });

  test("descarta claves desconocidas en vez de propagarlas", () => {
    const r = importCookiesSchema.parse({ cookies: { JSESSIONID: "a", LtpaToken2: "b", evil: "x" } });
    expect(Object.keys(r.cookies).sort()).toEqual(["JSESSIONID", "LtpaToken2"]);
  });
});
