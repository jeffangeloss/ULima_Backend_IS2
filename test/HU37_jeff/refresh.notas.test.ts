import { describe, expect, test } from "bun:test";
import { leerNotas } from "../../src/modules/portal-sync/refresh/fase-notas.js";
import { promedioNoCuadra, sumaPonderada } from "../../src/modules/portal-sync/refresh/refresh.logic.js";
import type { AgregadoUlima, EvaluacionUlima } from "../../src/modules/portal-sync/portal-sync.types.js";
import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import { CURSOS, MENU_NOTA, asistenciaDe, aulaDe, marco, menuLista, notaDe, pedirFalso } from "./recarga.dobles.js";
import { armar } from "./recarga.servicio.js";

/**
 * RS-BE-52 y RS-BE-53 · fase de notas de la recarga, con un `pedir` falso. El
 * marco de evaluaciones no trae ningún identificador, así que el orden de las
 * peticiones es lo único que lo ata a su curso, y por eso tiene sus pruebas.
 */
const MAPA = new Map(CURSOS.map((c) => [c.aula, { courseCode: c.curso, sectionCode: c.seccion }]));

const respuestas = (sobre: Record<string, string | Error> = {}) => (path: string): string | Error => {
  if (path in sobre) return sobre[path]!;
  const aula = aulaDe(path);
  if (path === PORTAL_PATHS.notaCurso(aula)) return notaDe(aula);
  if (path === PORTAL_PATHS.tareaAcademica(aula)) return marco();
  return new Error(`ruta inesperada en la prueba: ${path}`);
};

const leer = async (sobre: Record<string, string | Error> = {}, mapa = MAPA, menu = MENU_NOTA) => {
  const f = pedirFalso(respuestas(sobre));
  const fase = await leerNotas({ pedir: f.pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: menu }, mapa);
  return { fase, pedidos: f.pedidos };
};

describe("RS-BE-53 · orden de las peticiones", () => {
  test("cada marco se pide justo después de la página de su curso, curso por curso", async () => {
    const { pedidos } = await leer();
    expect(pedidos.map((p) => p.path)).toEqual(CURSOS.flatMap((c) => [
      PORTAL_PATHS.notaCurso(c.aula), PORTAL_PATHS.tareaAcademica(c.aula),
    ]));
    expect(pedidos[0]!.opciones).toEqual({ refererPath: PORTAL_PATHS.cursosNota });
    expect(pedidos[1]!.opciones).toEqual({ charset: "iso-8859-1", refererPath: PORTAL_PATHS.notaCurso("900101") });
  });

  test("nunca hay dos cadenas en vuelo", async () => {
    let enVuelo = 0;
    let maximo = 0;
    const base = respuestas();
    const pedir: Pedir = async (path) => {
      enVuelo++;
      maximo = Math.max(maximo, enVuelo);
      await new Promise((r) => setTimeout(r, 2));
      enVuelo--;
      const r = base(path);
      if (r instanceof Error) throw r;
      return r;
    };
    await leerNotas({ pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: MENU_NOTA }, MAPA);
    expect(maximo).toBe(1);
  });
});

describe("RS-BE-52 · identificación y contraste", () => {
  test("lee las cinco aulas con su par verificado, sus evaluaciones y sus agregados", async () => {
    const { fase } = await leer();
    expect(fase.menu).toBe("ok");
    expect(fase.aulas.map((a) => a.estado)).toEqual(["leida", "leida", "leida", "leida", "leida"]);
    const primera = fase.aulas[0]!;
    if (primera.estado !== "leida") throw new Error("la primera aula debía leerse");
    expect(primera.par).toEqual({ courseCode: "690417", sectionCode: "812" });
    expect(primera.evaluaciones).toHaveLength(5);
    expect(primera.agregados.map((a) => a.clave)).toEqual(["EP", "TA", "EF", "PROM"]);
    expect(fase.identificadas.size).toBe(5);
  });

  test("la sección del menú distinta de la de la página no pide el marco ni identifica", async () => {
    const menu = menuLista("OpenNotaAlumnoPrePost", CURSOS.map((c) => ({ aula: c.aula, seccion: c.aula === "900101" ? "999" : c.seccion })));
    const { fase, pedidos } = await leer({}, MAPA, menu);
    expect(fase.aulas[0]).toMatchObject({ estado: "contraste" });
    expect(pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica("900101"))).toBe(false);
    expect(fase.identificadas.has("900101")).toBe(false);
  });

  test("el mapa de la asistencia con otro curso para esa aula es contraste", async () => {
    const mapa = new Map(MAPA);
    mapa.set("900102", { courseCode: "690499", sectionCode: "812" });
    const { fase, pedidos } = await leer({}, mapa);
    expect(fase.aulas[1]).toMatchObject({ estado: "contraste" });
    expect(pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica("900102"))).toBe(false);
    expect(fase.identificadas.has("900102")).toBe(false);
  });

  test("el mapa de la asistencia con otra sección para esa aula es contraste", async () => {
    const mapa = new Map(MAPA);
    mapa.set("900102", { courseCode: "690418", sectionCode: "813" });
    const { fase, pedidos } = await leer({}, mapa);
    expect(fase.aulas[1]).toMatchObject({ estado: "contraste" });
    expect(pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica("900102"))).toBe(false);
    expect(fase.identificadas.has("900102")).toBe(false);
  });

  test("un aula que la asistencia no identificó se lee igual", async () => {
    const mapa = new Map(MAPA);
    mapa.delete("900103");
    const { fase } = await leer({}, mapa);
    expect(fase.aulas[2]).toMatchObject({ estado: "leida" });
  });

  test("la página del curso que no llega deja el aula unavailable y no pide su marco", async () => {
    const { fase, pedidos } = await leer({
      [PORTAL_PATHS.notaCurso("900104")]: new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
    });
    expect(fase.aulas[3]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_UNAVAILABLE" });
    expect(pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica("900104"))).toBe(false);
  });

  test("una página del curso que no se entiende es failed con su motivo", async () => {
    const { fase } = await leer({ [PORTAL_PATHS.notaCurso("900105")]: "<html><body>login</body></html>" });
    expect(fase.aulas[4]).toMatchObject({ estado: "failed", motivo: "la respuesta no es la página de notas de un curso" });
    expect(fase.fallos).toEqual(["PORTAL_UNREADABLE"]);
  });

  test("un marco que falla conserva la identificación de la página del curso", async () => {
    const { fase } = await leer({
      [PORTAL_PATHS.tareaAcademica("900101")]: new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT"),
    });
    expect(fase.aulas[0]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_TIMEOUT" });
    expect(fase.identificadas.get("900101")).toEqual({ courseCode: "690417", sectionCode: "812" });
  });

  test("un marco que no se entiende es failed con su motivo", async () => {
    const { fase } = await leer({ [PORTAL_PATHS.tareaAcademica("900102")]: "<html></html>" });
    expect(fase.aulas[1]).toMatchObject({ estado: "failed", motivo: "la tabla de evaluaciones no tiene la cabecera esperada" });
  });

  test("un menú que no llega o que no se entiende deja la fase sin aulas", async () => {
    const vacio = async () => "";
    const sinMenu = await leerNotas({ pedir: vacio, now: () => 0, deadline: 60_000 }, { ok: false, fallo: "PORTAL_UNAVAILABLE" }, MAPA);
    expect(sinMenu).toMatchObject({ menu: "unavailable", aulas: [], fallos: ["PORTAL_UNAVAILABLE"] });
    const raro = await leerNotas({ pedir: vacio, now: () => 0, deadline: 60_000 }, { ok: true, html: "<html></html>" }, MAPA);
    expect(raro).toMatchObject({ menu: "unreadable", aulas: [], fallos: ["PORTAL_UNREADABLE"] });
  });
});

describe("RS-BE-53, punto 7 · chequeo con el promedio de la ULima", () => {
  const ev = (value: number | null, weight: number, mark: EvaluacionUlima["mark"] = value === null ? "pending" : "graded"): EvaluacionUlima =>
    ({ key: `k${weight}`, group: "EVC", name: "Evaluación", week: 3, weight, value, mark });
  const prom = (valor: number | null): AgregadoUlima[] => [{ clave: "PROM", etiqueta: "Promedio", valor }];

  test("avisa cuando la suma ponderada difiere del promedio en más de 0,5", () => {
    const todas = [ev(10, 40), ev(16, 60)];
    expect(sumaPonderada(todas)).toBeCloseTo(13.6, 5);
    expect(promedioNoCuadra(todas, prom(15))).toBe(true);
    expect(promedioNoCuadra(todas, prom(14))).toBe(false);
  });

  test("calla cuando falta una nota, cuando hay un NP o cuando el promedio es 0", () => {
    expect(promedioNoCuadra([ev(10, 40), ev(null, 60)], prom(18))).toBe(false);
    expect(promedioNoCuadra([ev(10, 40), ev(null, 60, "np")], prom(18))).toBe(false);
    expect(promedioNoCuadra([ev(10, 40), ev(16, 60)], prom(null))).toBe(false);
    expect(promedioNoCuadra([ev(10, 40), ev(16, 60)], [])).toBe(false);
  });
});

describe("RS-BE-52, punto 6 · el servicio ante un contraste entre los paneles", () => {
  /**
   * Con el servicio entero y sus dobles (recarga.servicio.ts). En los tres
   * casos el aula no pide su marco, su matrícula no escribe notas, las otras
   * cuatro sí, y el único aviso del bloque nota es el del contraste, que nombra
   * el aula y no lleva ninguna nota.
   */
  const aviso = (aula: string) => ({
    code: "PARSER_FAILED", block: "nota", message: `El curso del aula ${aula} no coincide entre los paneles de miUlima.`,
  });

  const comprobar = async (a: ReturnType<typeof armar>, aula: string) => {
    const res = await a.servicio.refresh(a.entrada());
    const otras = CURSOS.filter((c) => c.aula !== aula).map((c) => c.enrollmentId);
    expect(a.pedidos.some((p) => p.path === PORTAL_PATHS.tareaAcademica(aula))).toBe(false);
    expect(a.de("markGradesRead").map(([id]) => id)).toEqual(otras);
    expect(a.de("replacePortalScores").map(([id]) => id)).toEqual(otras);
    expect(res.grades).toEqual({ read: 4, failed: 1, unavailable: 0, withValue: 0 });
    expect(res.warnings.filter((w) => w.block === "nota")).toEqual([aviso(aula)]);
    return res;
  };

  test("la sección del menú de Nota distinta de la de la página no escribe notas y avisa", async () => {
    const menu = menuLista("OpenNotaAlumnoPrePost", CURSOS.map((c) => ({ aula: c.aula, seccion: c.aula === "900101" ? "999" : c.seccion })));
    const res = await comprobar(armar({ paginas: { [PORTAL_PATHS.cursosNota]: menu } }), "900101");
    expect(res.courses[0]).toMatchObject({ courseCode: "690417", attendance: "updated", grades: "failed" });
  });

  test("el mapa de la asistencia con otro curso para esa aula no escribe notas y avisa", async () => {
    await comprobar(armar({ paginas: {
      [PORTAL_PATHS.asistenciaAlumno("900102")]: asistenciaDe("900102", { prm_sCoCurs: "690499" }),
    } }), "900102");
  });

  test("el mapa de la asistencia con otra sección para esa aula no escribe notas y avisa", async () => {
    // El menú de Asistencia trae la misma sección que la página, para que la
    // fase de asistencia no caiga en su propio contraste y el aula entre al mapa.
    const menuAsistencia = menuLista("OpenAsistenciaAlumno", CURSOS.map((c) => ({ aula: c.aula, seccion: c.aula === "900102" ? "813" : c.seccion })));
    await comprobar(armar({ paginas: {
      [PORTAL_PATHS.cursosAsistencia]: menuAsistencia,
      [PORTAL_PATHS.asistenciaAlumno("900102")]: asistenciaDe("900102", { prm_sCoSecc: "813" }),
    } }), "900102");
  });
});
