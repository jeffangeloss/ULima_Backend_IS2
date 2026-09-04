import { describe, expect, test } from "bun:test";
import { PORTAL_PATHS, PortalClient } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

/** Cliente que cuenta peticiones y no le importa la respuesta: en este archivo
 *  lo que se mide es si una ruta mal formada LLEGA o no a la red. */
const clienteQueCuenta = (contador: { n: number }, verUrl: (url: string) => void = () => {}) =>
  new PortalClient(
    "https://webaloe.ulima.edu.pe", 8000,
    ((url: string) => {
      contador.n++;
      verUrl(url);
      return Promise.resolve(new Response("<html>ok</html>", {
        status: 200, headers: { "Content-Type": "text/html;charset=ISO-8859-1" },
      }));
    }) as unknown as typeof fetch,
  );

/** Lo que lanza HOY un COCICLO mal formado. RS-8 pide el mismo criterio y el
 *  mismo error para el aula, así que los tests se comparan contra este error
 *  real en vez de contra un 502 escrito a mano: si mañana `fetchAll` cambia de
 *  código, el test del aula se cae con él en vez de quedar mintiendo. */
const errorDeCocicloInvalido = (): Promise<HttpError> =>
  clienteQueCuenta({ n: 0 }).fetchAll("../evil", cookies).then(
    () => { throw new Error("fetchAll aceptó un COCICLO inválido"); },
    (e: unknown) => e as HttpError,
  );

/** Ejecuta el constructor de ruta y devuelve el error, o `null` si no lanzó. */
const capturar = (aula: string): HttpError | null => {
  try {
    PORTAL_PATHS.nominaDelegado(aula);
    return null;
  } catch (e) {
    return e as HttpError;
  }
};

describe("PORTAL_PATHS del panel de delegados (RS-8)", () => {
  test("el sidebar es una ruta fija: no interpola nada y no lleva query", () => {
    // El servlet responde según la sesión del alumno, así que no hay ningún
    // valor del portal que meter en la URL y, por lo tanto, nada que validar.
    expect(PORTAL_PATHS.cursosDelegado).toBe("av/servlets/ComandoListarCursosXOpcionAulaVirtualDelegado");
    expect(PORTAL_PATHS.cursosDelegado).not.toContain("?");
  });

  test("un aula válida produce la ruta de la nómina con prm_sNuAula", () => {
    // 154508 es una de las 5 aulas observadas contra el portal el 2026-09-04.
    expect(PORTAL_PATHS.nominaDelegado("154508")).toBe(
      "av/servlets/ComandoListarAulaDelegadoAulaVirtual?prm_sNuAula=154508",
    );
  });

  test("acepta los dos extremos del rango 4-8 dígitos", () => {
    // El ancho real observado es 6; el rango tiene holgura a ambos lados
    // porque el portal no lo documenta.
    expect(PORTAL_PATHS.nominaDelegado("1545")).toContain("prm_sNuAula=1545");
    expect(PORTAL_PATHS.nominaDelegado("15450800")).toContain("prm_sNuAula=15450800");
  });

  test("las dos rutas llegan enteras a la red bajo /portalUL/, con fetchPage tal cual", async () => {
    // `fetchPage` ya es genérico: la feature no necesita un método nuevo en el
    // cliente, solo estas dos rutas.
    let vista = "";
    const contador = { n: 0 };
    const c = clienteQueCuenta(contador, (u) => { vista = u; });

    await c.fetchPage(PORTAL_PATHS.cursosDelegado, cookies);
    expect(vista).toBe(
      "https://webaloe.ulima.edu.pe/portalUL/av/servlets/ComandoListarCursosXOpcionAulaVirtualDelegado",
    );

    await c.fetchPage(PORTAL_PATHS.nominaDelegado("154508"), cookies);
    expect(vista).toBe(
      "https://webaloe.ulima.edu.pe/portalUL/av/servlets/ComandoListarAulaDelegadoAulaVirtual?prm_sNuAula=154508",
    );
    expect(contador.n).toBe(2);
  });

  test("las N nóminas se pueden pedir a la vez: el cliente no serializa (RS-9)", () => {
    // RS-9 pide las nóminas en paralelo, y quien las dispara es el service.
    // Lo que se verifica acá es la mitad que le toca al cliente: `fetchPage`
    // no comparte estado entre llamadas (cada una arma su propio
    // AbortController y su propio timer), así que las 5 salen juntas y el
    // presupuesto de tiempo del import paga una ronda, no cinco.
    const aulas = ["154508", "154516", "154604", "154607", "154621"];
    let enVuelo = 0;
    let pico = 0;
    const soltar: Array<() => void> = [];
    const c = new PortalClient(
      "https://webaloe.ulima.edu.pe", 8000,
      ((_url: string) => {
        enVuelo++;
        pico = Math.max(pico, enVuelo);
        return new Promise<Response>((resolve) => {
          soltar.push(() => {
            enVuelo--;
            resolve(new Response("<html>ok</html>", { status: 200 }));
          });
        });
      }) as unknown as typeof fetch,
    );

    const todas = Promise.all(aulas.map((a) => c.fetchPage(PORTAL_PATHS.nominaDelegado(a), cookies)));
    // Sin ningún await de por medio: si el cliente serializara, acá habría una
    // sola petición en vuelo esperando a que la anterior responda.
    expect(soltar).toHaveLength(5);
    for (const s of soltar) s();
    return todas.then(() => { expect(pico).toBe(5); });
  });
});

describe("PORTAL_PATHS.nominaDelegado rechaza un aula mal formada (RS-8)", () => {
  // El aula NO sale de nuestra base: sale del HTML del sidebar del portal, que
  // puede cambiar sin aviso. Cada caso de acá, interpolado crudo, deja de ser
  // un parámetro y pasa a ser otra petición hecha con la sesión viva del alumno.
  const invalidas: Record<string, string> = {
    "vacía": "",
    "solo espacios": "   ",
    "con letras": "15A508",
    "muy corta (3 dígitos)": "154",
    "muy larga (9 dígitos)": "154508999",
    "con inyección de query": "154508&prm_sNuAula=999999",
    "con un parámetro pegado": "154508&Fg=1",
    "con inyección de ruta": "../servlets/CustomLogoutServlet",
    "con espacio interno": "154 508",
    "con espacios alrededor": " 154508 ",
    "negativa": "-154508",
    "en notación científica": "1e5",
    "con salto de línea al final": "154508\n",
    "con dígitos no ASCII": "١٥٤٥٠٨",
  };

  for (const [nombre, aula] of Object.entries(invalidas)) {
    test(`rechaza un aula ${nombre}`, () => {
      const err = capturar(aula);
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toMatchObject({ statusCode: 502, code: "PORTAL_UNAVAILABLE" });
    });
  }

  test("se rechaza del MISMO modo que un COCICLO inválido: mismo tipo, status y code", async () => {
    const cociclo = await errorDeCocicloInvalido();
    const aula = capturar("154508&prm_sNuAula=999999");
    expect(aula).toBeInstanceOf(HttpError);
    expect(aula?.constructor).toBe(cociclo.constructor);
    expect(aula?.statusCode).toBe(cociclo.statusCode);
    expect(aula?.code).toBe(cociclo.code);
  });

  test("el mensaje no devuelve el valor rechazado: puede venir del HTML del portal", () => {
    const err = capturar("154508&SECRETO=12345678");
    expect(err?.message).not.toContain("SECRETO");
    expect(err?.message).not.toContain("12345678");
  });

  test("un aula inválida nunca llega a la red: revienta antes del fetch", () => {
    // Es la única guarda: la ruta de la nómina se arma y se pide en el mismo
    // renglón, así que si el constructor no lanzara, la URL envenenada saldría.
    const contador = { n: 0 };
    const c = clienteQueCuenta(contador);
    expect(() => c.fetchPage(PORTAL_PATHS.nominaDelegado("../servlets/CustomLogoutServlet"), cookies))
      .toThrow(HttpError);
    expect(contador.n).toBe(0);
  });
});
