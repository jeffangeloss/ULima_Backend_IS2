import { describe, expect, test } from "bun:test";
import { refreshSchema } from "../../src/modules/portal-sync/portal-sync.schemas.js";

/** RS-BE-49 · cuerpo de POST /portal-sync/refresh, en modo estricto. Credenciales ficticias. */
const VALIDO = { credentials: { password: "clave-sintetica", passcode: "123456" }, consent: true };
const acepta = (cuerpo: unknown) => refreshSchema.safeParse(cuerpo).success;

describe("RS-BE-49 · cuerpo de la recarga", () => {
  test("acepta las credenciales con consent true, con código de 6 a 8 dígitos", () => {
    expect(acepta(VALIDO)).toBe(true);
    expect(acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, passcode: "12345678" } })).toBe(true);
  });

  test("consent tiene que ser el literal true", () => {
    for (const consent of [false, "true", 1, undefined]) expect(acepta({ ...VALIDO, consent })).toBe(false);
  });

  test("no existe la variante con cookies", () => {
    expect(acepta({ ...VALIDO, cookies: { JSESSIONID: "a", LtpaToken2: "b" } })).toBe(false);
    expect(acepta({ cookies: { JSESSIONID: "a", LtpaToken2: "b" }, consent: true })).toBe(false);
  });

  test("una clave de más, afuera o dentro de credentials, se rechaza", () => {
    expect(acepta({ ...VALIDO, extra: 1 })).toBe(false);
    expect(acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, usuario: "20230001" } })).toBe(false);
  });

  test("un código del autenticador mal formado se rechaza", () => {
    for (const passcode of ["12345", "123456789", "12a456", ""]) {
      expect(acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, passcode } })).toBe(false);
    }
  });

  test("la contraseña mide de 1 a 200 caracteres", () => {
    const con = (password: string) => acepta({ ...VALIDO, credentials: { ...VALIDO.credentials, password } });
    expect(con("")).toBe(false);
    expect(con("x".repeat(200))).toBe(true);
    expect(con("x".repeat(201))).toBe(false);
  });
});
