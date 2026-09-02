import { describe, expect, test } from "bun:test";
import { PortalClient } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

const clientWith = (impl: (url: string) => Promise<Response>) =>
  new PortalClient("https://webaloe.ulima.edu.pe", 8000, impl as unknown as typeof fetch);

const clientWithSyllabus = (impl: (url: string) => Promise<Response>) =>
  new PortalClient(
    "https://webaloe.ulima.edu.pe", 8000, impl as unknown as typeof fetch, "https://cactus.ulima.edu.pe",
  );

/** Error tal como lo emite un fetch abortado. */
const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

/** Responde cabeceras 200 y luego NUNCA termina de emitir el cuerpo (proxy a
 *  medio morir, respuesta chunked truncada). El stream solo falla si se aborta
 *  la señal del fetch, que es lo que hace el fetch real cuando el
 *  AbortController se dispara: si el timeout ya se desarmó, cuelga para
 *  siempre. */
const respuestaConCuerpoColgado = (init?: RequestInit): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<html>"));
        (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () => controller.error(abortError()));
      },
    }),
    { status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" } },
  );

/** Espera `p` con un tope propio: si la promesa NUNCA resuelve (justo el bug
 *  que se cubre) devuelve "colgada" en vez de dejar colgado el runner. */
/** Captura la cabecera `Cookie` que se manda en la petición. */
const clienteQueCapturaCookie = (capturar: (cookie: string) => void) =>
  new PortalClient(
    "https://webaloe.ulima.edu.pe", 8000,
    ((_url: string, init?: RequestInit) => {
      capturar(String((init?.headers as Record<string, string> | undefined)?.Cookie ?? ""));
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch,
    "https://cactus.ulima.edu.pe",
  );

const conTope = async <T>(p: Promise<T>, ms = 800): Promise<T | Error | "colgada"> =>
  Promise.race([
    p.catch((e: Error) => e),
    new Promise<"colgada">((resolve) => { setTimeout(() => resolve("colgada"), ms); }),
  ]);

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

  test("un cuerpo que nunca termina de llegar corta por timeout, no cuelga la petición", async () => {
    // fetch resuelve al llegar las CABECERAS: si el timer se desarma ahí, la
    // lectura del cuerpo corre sin límite de tiempo y con el AbortController
    // ya desactivado. Un host que responde 200 y deja de emitir bytes colgaba
    // la promesa para siempre, y con ella la importación entera.
    const c = new PortalClient(
      "https://webaloe.ulima.edu.pe", 50,
      ((_url: string, init?: RequestInit) => Promise.resolve(respuestaConCuerpoColgado(init))) as unknown as typeof fetch,
    );
    const r = await conTope(c.fetchPage("layout.jsp", cookies));
    expect(r).not.toBe("colgada");
    expect(r).toMatchObject({ statusCode: 504, code: "PORTAL_TIMEOUT" });
  }, 5000);

  test("rechaza un cociclo que no sea de 5 digitos", async () => {
    const c = clientWith(async () => new Response("ok", { status: 200 }));
    await expect(c.fetchAll("../evil", cookies)).rejects.toMatchObject({ code: "PORTAL_UNAVAILABLE" });
  });

  test("fetchAll solo descarga matricula y record: datosPersonales no se pide, nadie lo lee", async () => {
    const urls: string[] = [];
    const c = clientWith(async (url) => {
      urls.push(url);
      return new Response("<html>ok</html>", { status: 200 });
    });
    const pages = await c.fetchAll("20262", cookies);
    expect(Object.keys(pages).sort()).toEqual(["matricula", "record"]);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => /DatosPersonales/i.test(u))).toBe(false);
  });
});

describe("PortalClient.fetchSyllabus", () => {
  test("arma la URL contra el host de sílabos con COCICLO_courseCode", async () => {
    let seen = "";
    const c = clientWithSyllabus(async (url) => {
      seen = url;
      return new Response("{}", { status: 200 });
    });
    await c.fetchSyllabus("20262", "650033", cookies);
    expect(seen).toBe(
      "https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV" +
      "?ReadViewEntries&OutputFormat=JSON&Count=5&RestrictToCategory=20262_650033",
    );
  });

  test("decodifica SIEMPRE como UTF-8, sin mirar el Content-Type declarado", async () => {
    // "É" en UTF-8 es 0xC3 0x89; si se decodificara como ISO-8859-1 (lo que
    // dice, a propósito, el Content-Type) saldría mal ("Ã‰").
    const bytes = new TextEncoder().encode('{"x":"ESTRATÉGICO"}');
    const c = clientWithSyllabus(async () =>
      new Response(bytes, { status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" } }));
    const body = await c.fetchSyllabus("20262", "650033", cookies);
    expect(body).toBe('{"x":"ESTRATÉGICO"}');
  });

  test("una redireccion significa sesion muerta => 409 PORTAL_SESSION_INVALID", async () => {
    const c = clientWithSyllabus(async () =>
      new Response(null, { status: 302, headers: { Location: "https://cactus.ulima.edu.pe/names.nsf?Login" } }));
    await expect(c.fetchSyllabus("20262", "650033", cookies)).rejects.toMatchObject({
      statusCode: 409, code: "PORTAL_SESSION_INVALID",
    });
  });

  test("un status inesperado (ni 200 ni redireccion) se degrada a null, nunca lanza", async () => {
    const c = clientWithSyllabus(async () => new Response("boom", { status: 500 }));
    expect(await c.fetchSyllabus("20262", "650033", cookies)).toBeNull();
  });

  test("un error de red o timeout se degrada a null, nunca lanza: el silabo es un extra", async () => {
    const c = clientWithSyllabus(async () => { throw new Error("network down"); });
    expect(await c.fetchSyllabus("20262", "650033", cookies)).toBeNull();
  });

  test("cociclo con formato invalido => null, sin llegar a pedir la red", async () => {
    let calls = 0;
    const c = clientWithSyllabus(async () => { calls++; return new Response("{}", { status: 200 }); });
    expect(await c.fetchSyllabus("no-es-cociclo", "650033", cookies)).toBeNull();
    expect(calls).toBe(0);
  });

  test("courseCode con formato invalido => null, sin llegar a pedir la red", async () => {
    let calls = 0;
    const c = clientWithSyllabus(async () => { calls++; return new Response("{}", { status: 200 }); });
    expect(await c.fetchSyllabus("20262", "abc", cookies)).toBeNull();
    expect(calls).toBe(0);
  });
  test("un cuerpo que nunca termina de llegar se degrada a null por timeout, no cuelga la importación", async () => {
    // Mismo bug que en fetchPage, pero multiplicado por N sílabos: el
    // Promise.all del service espera a que resuelvan TODAS las promesas, así
    // que una sola colgada dejaba la importación sin escribir nada.
    const c = new PortalClient(
      "https://webaloe.ulima.edu.pe", 50,
      ((_url: string, init?: RequestInit) => Promise.resolve(respuestaConCuerpoColgado(init))) as unknown as typeof fetch,
      "https://cactus.ulima.edu.pe",
    );
    const r = await conTope(c.fetchSyllabus("20262", "650033", cookies));
    expect(r).not.toBe("colgada");
    expect(r).toBeNull();
  }, 5000);
  test("a cactus se le mandan SOLO las cookies LTPA, nunca el JSESSIONID de webaloe", async () => {
    // JSESSIONID es la sesión de WebSphere atada a webaloe; según la §SSO de
    // la spec solo el LTPA autentica Domino, y un navegador jamás mandaría esa
    // cookie cross-host. Mandarla dejaba el identificador de sesión vivo del
    // alumno en los logs de un segundo servidor, sin necesidad.
    let cookie = "";
    const c = clienteQueCapturaCookie((v) => { cookie = v; });
    await c.fetchSyllabus("20262", "650033", { JSESSIONID: "sesion-viva", LtpaToken2: "b", LtpaToken: "c" });
    expect(cookie).not.toContain("JSESSIONID");
    expect(cookie).toContain("LtpaToken2=b");
    expect(cookie).toContain("LtpaToken=c");
  });

  test("a webaloe (fetchPage) se le siguen mandando las tres cookies", async () => {
    let cookie = "";
    const c = clienteQueCapturaCookie((v) => { cookie = v; });
    await c.fetchPage("layout.jsp", { JSESSIONID: "sesion-viva", LtpaToken2: "b", LtpaToken: "c" });
    expect(cookie).toContain("JSESSIONID=sesion-viva");
    expect(cookie).toContain("LtpaToken2=b");
  });
});
