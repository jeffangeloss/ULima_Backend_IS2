import { describe, expect, test } from "bun:test";
import {
  PortalLoginGuard, refreshInProgress, tooManyRejectedLogins,
} from "../../src/modules/portal-sync/portal-login-guard.js";

/**
 * RS-BE-50 · guarda de inicio de sesión en curso y tope de inicios de sesión
 * rechazados. Los dos viven en memoria, por alumno, y los comparten la recarga
 * y la importación con credentials, porque protegen la misma cuenta de miUlima.
 * Ids de alumno inventados.
 */

describe("RS-BE-50 · guarda de inicio de sesión en curso", () => {
  test("una segunda recarga del mismo alumno no entra hasta que la primera termina", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "refresh");
    expect(g.tryStart(42, "refresh")).toBe(true);
  });

  test("una importación con credentials en curso bloquea la recarga, y al revés", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "import")).toBe(true);
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(42, "import")).toBe(false);
  });

  test("entre dos importaciones rige lo de hoy, sin guarda entre ellas", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "import")).toBe(true);
    expect(g.tryStart(42, "import")).toBe(true);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(false);
    g.finish(42, "import");
    expect(g.tryStart(42, "refresh")).toBe(true);
  });

  test("la guarda es por alumno", () => {
    const g = new PortalLoginGuard();
    expect(g.tryStart(42, "refresh")).toBe(true);
    expect(g.tryStart(43, "refresh")).toBe(true);
  });

  test("el 409 lleva el código y el mensaje fijo de la spec", () => {
    expect(refreshInProgress()).toMatchObject({
      statusCode: 409, code: "PORTAL_REFRESH_IN_PROGRESS",
      message: "Ya hay una lectura de miUlima en curso. Espera a que termine.",
    });
  });
});

describe("RS-BE-50 · tope de inicios de sesión rechazados", () => {
  test("tres rechazos en 15 minutos bloquean el cuarto intento por lo que falta de la ventana", () => {
    let t = 0;
    const g = new PortalLoginGuard(() => t);
    for (const minuto of [0, 1, 2]) {
      t = minuto * 60_000;
      expect(g.rejectedLoginsWait(42)).toBeNull();
      g.recordRejectedLogin(42);
    }
    t = 3 * 60_000;
    expect(g.rejectedLoginsWait(42)).toBe(12);
    t = 15 * 60_000 - 1;
    expect(g.rejectedLoginsWait(42)).toBe(1);
    t = 15 * 60_000 + 1;
    expect(g.rejectedLoginsWait(42)).toBeNull();
  });

  test("el contador es uno solo por alumno, lo sume la recarga o la importación", () => {
    const g = new PortalLoginGuard(() => 0);
    g.recordRejectedLogin(42);
    g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(42)).toBeNull();
    g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(42)).toBe(15);
  });

  test("el tope es por alumno", () => {
    const g = new PortalLoginGuard(() => 0);
    for (let i = 0; i < 3; i++) g.recordRejectedLogin(42);
    expect(g.rejectedLoginsWait(43)).toBeNull();
  });

  test("el 429 lleva kind rejected_logins y el mensaje fijo de la spec", () => {
    expect(tooManyRejectedLogins(12)).toMatchObject({
      statusCode: 429, code: "RATE_LIMITED",
      message: "Demasiados intentos con datos rechazados. Intenta de nuevo en 12 minuto(s).",
      details: { retryAfterMinutes: 12, kind: "rejected_logins" },
    });
  });
});
