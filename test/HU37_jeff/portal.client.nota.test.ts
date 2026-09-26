import { describe, expect, test } from "bun:test";
import { PORTAL_PATHS, PortalClient } from "../../src/services/portal.client.js";

/**
 * RS-BE-52 y RS-BE-53, punto 8 · rutas del panel Nota y opciones de la página.
 * Aulas y cookies inventadas.
 */
const BASE = "https://webaloe.ulima.edu.pe";
const cookies = { JSESSIONID: "sesion-de-prueba", LtpaToken2: "ltpa-de-prueba" };

describe("rutas del panel Nota (RS-BE-52)", () => {
  test("el menú del panel Nota es una ruta fija sin parámetros", () => {
    expect(PORTAL_PATHS.cursosNota).toBe("av/servlets/ComandoListarCursosXOpcionAulaVirtualNota");
  });

  test("la página del curso es el servlet que fija V1, con el aula como único parámetro", () => {
    expect(PORTAL_PATHS.notaCurso("900101")).toBe("gada/servlets/ComandoListarNotasAcadAlum?prm_sNuAula=900101");
  });

  test("el marco de evaluaciones se arma con el aula, nunca con el src del HTML", () => {
    expect(PORTAL_PATHS.tareaAcademica("900101")).toBe(
      "gada/servlets/ComandoConsultarTareaAcademica?prm_sNuAula=900101",
    );
  });

  test("un aula mal formada revienta antes de llegar a la red", () => {
    for (const aula of ["901", "900101&x=1", "../1234", "123456789"]) {
      expect(() => PORTAL_PATHS.notaCurso(aula)).toThrow();
      expect(() => PORTAL_PATHS.tareaAcademica(aula)).toThrow();
    }
  });
});

describe("opciones de fetchPage (RS-BE-53, punto 8)", () => {
  /** Bytes ISO-8859-1 de un texto con caracteres bajo U+0100. */
  const latin1 = (s: string) => new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));

  const responder = (cuerpo: Uint8Array, contentType: string, vistos: Array<Record<string, string>> = []) =>
    (async (_url: string, init?: RequestInit) => {
      vistos.push({ ...(init?.headers as Record<string, string>) });
      return new Response(cuerpo, { status: 200, headers: { "Content-Type": contentType } });
    }) as unknown as typeof fetch;

  test("con charset ISO-8859-1, tildes y eñes llegan intactas aunque la cabecera diga UTF-8", async () => {
    const c = new PortalClient(BASE, 8000, responder(latin1("<td>Diseño de interacción</td>"), "text/html; charset=UTF-8"));
    const html = await c.fetchPage(PORTAL_PATHS.tareaAcademica("900101"), cookies, { charset: "iso-8859-1" });
    expect(html).toContain("Diseño de interacción");
  });

  test("sin la opción, decodifica según el Content-Type, como antes", async () => {
    const c = new PortalClient(BASE, 8000, responder(latin1("<td>Diseño</td>"), "text/html; charset=UTF-8"));
    const html = await c.fetchPage(PORTAL_PATHS.tareaAcademica("900101"), cookies);
    expect(html).not.toContain("Diseño");
  });

  test("refererPath manda el Referer que mandaría el navegador", async () => {
    const vistos: Array<Record<string, string>> = [];
    const c = new PortalClient(BASE, 8000, responder(latin1("<html></html>"), "text/html; charset=ISO-8859-1", vistos));
    await c.fetchPage(PORTAL_PATHS.tareaAcademica("900101"), cookies, { refererPath: PORTAL_PATHS.notaCurso("900101") });
    expect(vistos[0]!.Referer).toBe(`${BASE}/portalUL/${PORTAL_PATHS.notaCurso("900101")}`);
  });

  test("sin refererPath no se manda Referer", async () => {
    const vistos: Array<Record<string, string>> = [];
    const c = new PortalClient(BASE, 8000, responder(latin1("<html></html>"), "text/html; charset=ISO-8859-1", vistos));
    await c.fetchPage(PORTAL_PATHS.cursosNota, cookies);
    expect(vistos[0]!.Referer).toBeUndefined();
  });
});
