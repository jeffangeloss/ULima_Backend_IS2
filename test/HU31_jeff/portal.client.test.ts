import { describe, expect, test } from "bun:test";
import { PortalClient } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

const clientWith = (impl: (url: string) => Promise<Response>) =>
  new PortalClient("https://webaloe.ulima.edu.pe", 8000, impl as unknown as typeof fetch);

describe("PortalClient", () => {
  test("manda las cookies y no sigue redirecciones", async () => {
    let seen = "";
    const c = clientWith(async (url) => {
      seen = url;
      return new Response("<html>ok</html>", { status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" } });
    });
    const html = await c.fetchPage("layout.jsp", cookies);
    expect(html).toContain("ok");
    expect(seen).toBe("https://webaloe.ulima.edu.pe/portalUL/layout.jsp");
  });

  test("302 hacia inicio.jsp => 409 PORTAL_SESSION_INVALID", async () => {
    const c = clientWith(async () =>
      new Response(null, { status: 302, headers: { Location: "https://webaloe.ulima.edu.pe/portalUL/inicio.jsp" } }));
    await expect(c.fetchPage("layout.jsp", cookies)).rejects.toMatchObject({ statusCode: 409, code: "PORTAL_SESSION_INVALID" });
  });

  test("cuerpo con solicitarValidarToken => 409 PORTAL_SESSION_INVALID", async () => {
    const c = clientWith(async () => new Response("<html>solicitarValidarToken</html>", { status: 200 }));
    await expect(c.fetchPage("layout.jsp", cookies)).rejects.toMatchObject({ statusCode: 409 });
  });

  test("5xx => 502 PORTAL_UNAVAILABLE", async () => {
    const c = clientWith(async () => new Response("boom", { status: 503 }));
    await expect(c.fetchPage("layout.jsp", cookies)).rejects.toMatchObject({ statusCode: 502, code: "PORTAL_UNAVAILABLE" });
  });

  test("decodifica ISO-8859-1 segun el Content-Type", async () => {
    const bytes = new Uint8Array([0x49, 0x4e, 0x47, 0x2e, 0xd1]); // "ING.Ñ" en latin1
    const c = clientWith(async () =>
      new Response(bytes, { status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" } }));
    expect(await c.fetchPage("layout.jsp", cookies)).toBe("ING.Ñ");
  });

  test("el error nunca lleva HTML del portal en el mensaje", async () => {
    const c = clientWith(async () => new Response("<html>SECRETO 12345678</html>", { status: 500 }));
    const err = await c.fetchPage("layout.jsp", cookies).catch((e) => e as HttpError);
    expect(err.message).not.toContain("SECRETO");
  });

  test("rechaza un cociclo que no sea de 5 digitos", async () => {
    const c = clientWith(async () => new Response("ok", { status: 200 }));
    await expect(c.fetchAll("../evil", cookies)).rejects.toMatchObject({ code: "PORTAL_UNAVAILABLE" });
  });
});
