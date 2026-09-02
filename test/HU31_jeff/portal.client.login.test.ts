import { describe, expect, test } from "bun:test";
import { PortalClient } from "../../src/services/portal.client.js";

/**
 * Login con credenciales contra miUlima. Este es el camino que reemplazó al
 * diseño con WebView: el backend hace el login y obtiene la sesión.
 *
 * Las dos trampas del portal, ambas descubiertas en el spike contra el portal
 * real, están cubiertas acá porque ninguna es deducible del código:
 *  - un passcode rechazado devuelve 200 con la MISMA página y sin mensaje;
 *  - volver a pedir `redirectJsp.jsp` tumba la sesión recién creada.
 */

const BASE = "https://webaloe.ulima.edu.pe";
const R = `${BASE}/portalUL/`;

interface Paso { status: number; location?: string; setCookie?: string[]; body?: string }
interface Pedido { url: string; method: string; body: string; cookie: string }
interface Ruta { match: RegExp; method?: string; when?: (p: Pedido) => boolean; paso: Paso }

/** Sin sesión todavía: es como se distingue el layout.jsp del paso 1 del paso 4. */
const sinSesion = (p: Pedido) => !p.cookie.includes("JSESSIONID");
const conSesion = (p: Pedido) => p.cookie.includes("JSESSIONID");

/** Portal de mentira: responde por URL+método (+ opcionalmente por el estado de
 *  la sesión) y registra lo que se le pidió. */
const fakePortal = (rutas: Ruta[]) => {
  const pedidas: Pedido[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const pedido: Pedido = {
      url, method,
      body: typeof init?.body === "string" ? init.body : "",
      cookie: (init?.headers as Record<string, string> | undefined)?.Cookie ?? "",
    };
    pedidas.push(pedido);
    const r = rutas.find((x) => x.match.test(url)
      && (!x.method || x.method === method)
      && (!x.when || x.when(pedido)));
    const paso = r?.paso ?? { status: 404 };
    const h = new Headers();
    if (paso.location) h.set("location", paso.location);
    for (const sc of paso.setCookie ?? []) h.append("set-cookie", sc);
    return new Response(paso.body ?? "", { status: paso.status, headers: h });
  }) as unknown as typeof fetch;
  return { fetchImpl, pedidas };
};

const OK_LAYOUT = { status: 200, body: "<html>Bienvenido JEFFERSON</html>" };

/** Camino feliz completo, con segundo factor. */
const rutasFelices = () => [
  { match: /layout\.jsp$/, method: "GET", when: sinSesion, paso: { status: 200, body: "" } },
  { match: /j_security_check/, paso: {
    status: 302, location: `${R}solicitarValidarToken.jsp?bAv=0`,
    setCookie: ["JSESSIONID=abc123; Path=/; HttpOnly"],
  } },
  { match: /solicitarValidarToken/, method: "POST", paso: {
    status: 302, location: `${R}redirectJsp.jsp`,
    setCookie: ["LtpaToken2=ltpa2val; Path=/; HttpOnly", "LtpaToken=ltpaval; Domain=.ulima.edu.pe"],
  } },
];

const clientCon = (rutas: Ruta[]) => {
  const { fetchImpl, pedidas } = fakePortal(rutas);
  return { client: new PortalClient(BASE, 5000, fetchImpl), pedidas };
};

describe("PortalClient.login", () => {
  test("devuelve las cookies acumuladas a lo largo de toda la cadena", async () => {
    // Ninguna respuesta sola trae las tres: webaloe las reparte entre saltos.
    const { client } = clientCon([
      ...rutasFelices(),
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: OK_LAYOUT },
    ]);
    const cookies = await client.login("20235218", "clave", "123456");
    expect(cookies).toEqual({ JSESSIONID: "abc123", LtpaToken2: "ltpa2val", LtpaToken: "ltpaval" });
  });

  test("NUNCA vuelve a pedir redirectJsp.jsp: hacerlo tumba la sesión", async () => {
    const { client, pedidas } = clientCon([
      ...rutasFelices(),
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: OK_LAYOUT },
    ]);
    await client.login("20235218", "clave", "123456");
    expect(pedidas.some((p) => p.url.includes("redirectJsp.jsp"))).toBe(false);
  });

  test("manda el código del alumno como j_username, no algo del cliente", async () => {
    const { client, pedidas } = clientCon([
      ...rutasFelices(),
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: OK_LAYOUT },
    ]);
    await client.login("20235218", "clave", "123456");
    const login = pedidas.find((p) => p.url.includes("j_security_check"))!;
    expect(login.body).toContain("j_username=20235218");
    expect(login.body).not.toContain("sPasscode");
  });

  test("un passcode rechazado (200 con la misma página, sin mensaje) => 409 PORTAL_LOGIN_REJECTED", async () => {
    // La trampa: el portal NO devuelve error. La única señal es que no redirige.
    const { client } = clientCon([
      { match: /layout\.jsp$/, method: "GET", when: sinSesion, paso: { status: 200, body: "" } },
      { match: /j_security_check/, paso: {
        status: 302, location: `${R}solicitarValidarToken.jsp?bAv=0`,
        setCookie: ["JSESSIONID=abc123; Path=/"],
      } },
      { match: /solicitarValidarToken/, method: "POST", paso: {
        status: 200, body: "<html>Ingrese su passcode</html>",
      } },
    ]);
    await expect(client.login("20235218", "clave", "000000")).rejects.toMatchObject({
      statusCode: 409, code: "PORTAL_LOGIN_REJECTED",
    });
  });

  test("credenciales malas (rebota a inicio.jsp sin segundo factor) => 409, no 401", async () => {
    // 401 haría que el ApiClient de la app cierre la sesión de ULima++: un
    // tipeo en la contraseña no puede echar al alumno de la app.
    const { client } = clientCon([
      { match: /layout\.jsp$/, method: "GET", when: sinSesion, paso: { status: 200, body: "" } },
      { match: /j_security_check/, paso: { status: 302, location: `${R}inicio.jsp?error=1` } },
      { match: /inicio\.jsp/, paso: { status: 200, body: "<html>login</html>" } },
    ]);
    const err = await client.login("20235218", "mala", "123456").catch((e) => e);
    expect(err.statusCode).toBe(409);
    expect(err.statusCode).not.toBe(401);
    expect(err.code).toBe("PORTAL_LOGIN_REJECTED");
  });

  test("el mensaje de error NUNCA revela la contraseña ni el passcode", async () => {
    const { client } = clientCon([
      { match: /layout\.jsp$/, method: "GET", when: sinSesion, paso: { status: 200, body: "" } },
      { match: /j_security_check/, paso: { status: 302, location: `${R}inicio.jsp` } },
      { match: /inicio\.jsp/, paso: { status: 200, body: "" } },
    ]);
    const err = await client.login("20235218", "MiClaveSecreta", "987654").catch((e) => e);
    const texto = `${err.message} ${err.code} ${JSON.stringify(err.details ?? {})}`;
    expect(texto).not.toContain("MiClaveSecreta");
    expect(texto).not.toContain("987654");
    // Tampoco distingue cuál de los dos falló: eso permitiría verificar
    // contraseñas contra el portal.
    expect(err.message.toLowerCase()).toContain("contraseña");
    expect(err.message.toLowerCase()).toContain("código");
  });

  test("sesión que no queda establecida (layout no dice Bienvenid) => 409", async () => {
    const { client } = clientCon([
      ...rutasFelices(),
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: { status: 200, body: "<html>otra cosa</html>" } },
    ]);
    await expect(client.login("20235218", "clave", "123456")).rejects.toMatchObject({
      code: "PORTAL_LOGIN_REJECTED",
    });
  });

  test("si faltan las cookies obligatorias no se devuelve una sesión a medias", async () => {
    const { client } = clientCon([
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: OK_LAYOUT },
      { match: /j_security_check/, paso: {
        status: 302, location: `${R}layout.jsp`, setCookie: ["JSESSIONID=solo-una; Path=/"],
      } },
    ]);
    await expect(client.login("20235218", "clave", "123456")).rejects.toMatchObject({
      code: "PORTAL_LOGIN_REJECTED",
    });
  });

  test("un portal caído se traduce a 502, no a credenciales rechazadas", async () => {
    const fetchImpl = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    const client = new PortalClient(BASE, 5000, fetchImpl);
    await expect(client.login("20235218", "clave", "123456")).rejects.toMatchObject({
      statusCode: 502, code: "PORTAL_UNAVAILABLE",
    });
  });

  test("el portal que no pide segundo factor también funciona", async () => {
    const { client } = clientCon([
      { match: /j_security_check/, paso: {
        status: 302, location: `${R}layout.jsp`,
        setCookie: ["JSESSIONID=abc; Path=/", "LtpaToken2=xyz; Path=/"],
      } },
      { match: /layout\.jsp$/, method: "GET", when: conSesion, paso: OK_LAYOUT },
    ]);
    const cookies = await client.login("20235218", "clave", "123456");
    expect(cookies.JSESSIONID).toBe("abc");
    expect(cookies.LtpaToken2).toBe("xyz");
  });
});
