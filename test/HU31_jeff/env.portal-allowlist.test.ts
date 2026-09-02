import { describe, expect, test } from "bun:test";
import { isAllowedPortalBaseUrl } from "../../src/config/env.js";

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
});
