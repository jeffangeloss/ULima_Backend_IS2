import { describe, expect, test } from "bun:test";
import { isAllowedPortalBaseUrl, isAllowedSyllabusBaseUrl } from "../../src/config/env.js";

describe("allowlist anti-SSRF de PORTAL_BASE_URL", () => {
  test("acepta el host del portal", () => {
    expect(isAllowedPortalBaseUrl("https://webaloe.ulima.edu.pe")).toBe(true);
  });

  test("rechaza otro host", () => {
    expect(isAllowedPortalBaseUrl("https://evil.com")).toBe(false);
  });

  test("rechaza el host del portal usado como subdominio de otro", () => {
    expect(isAllowedPortalBaseUrl("https://webaloe.ulima.edu.pe.evil.com")).toBe(false);
  });

  test("rechaza el truco de userinfo", () => {
    expect(isAllowedPortalBaseUrl("https://webaloe.ulima.edu.pe@evil.com")).toBe(false);
  });

  test("rechaza un puerto distinto", () => {
    expect(isAllowedPortalBaseUrl("https://webaloe.ulima.edu.pe:8443")).toBe(false);
  });

  test("no lanza con una cadena que no es URL", () => {
    expect(isAllowedPortalBaseUrl("no-es-una-url")).toBe(false);
  });

  test("rechaza el host de sílabos: cada variable está fija a UN solo host", () => {
    expect(isAllowedPortalBaseUrl("https://cactus.ulima.edu.pe")).toBe(false);
  });
});

describe("allowlist anti-SSRF de SYLLABUS_BASE_URL", () => {
  test("acepta el host de sílabos", () => {
    expect(isAllowedSyllabusBaseUrl("https://cactus.ulima.edu.pe")).toBe(true);
  });

  test("rechaza otro host", () => {
    expect(isAllowedSyllabusBaseUrl("https://evil.com")).toBe(false);
  });

  test("rechaza el host de sílabos usado como subdominio de otro", () => {
    expect(isAllowedSyllabusBaseUrl("https://cactus.ulima.edu.pe.evil.com")).toBe(false);
  });

  test("rechaza el truco de userinfo", () => {
    expect(isAllowedSyllabusBaseUrl("https://cactus.ulima.edu.pe@evil.com")).toBe(false);
  });

  test("rechaza un puerto distinto", () => {
    expect(isAllowedSyllabusBaseUrl("https://cactus.ulima.edu.pe:8443")).toBe(false);
  });

  test("no lanza con una cadena que no es URL", () => {
    expect(isAllowedSyllabusBaseUrl("no-es-una-url")).toBe(false);
  });

  test("rechaza el host del portal: cada variable está fija a UN solo host", () => {
    expect(isAllowedSyllabusBaseUrl("https://webaloe.ulima.edu.pe")).toBe(false);
  });
});
