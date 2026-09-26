import { describe, expect, test } from "bun:test";
import { leerAsistencia } from "../../src/modules/portal-sync/refresh/fase-asistencia.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import {
  ALUMNO, CICLO, CURSOS, MENU_ASISTENCIA, asistenciaDe, aulaDe, menuLista, pedirFalso,
} from "./recarga.dobles.js";

/**
 * RS-BE-51 · fase de asistencia de la recarga, con un `pedir` falso. La parte
 * del servicio (matrícula, escritura y estados) está en refresh.service.test.ts.
 */
const leer = async (
  respuestas: (aula: string) => string | Error = (aula) => asistenciaDe(aula), menu = MENU_ASISTENCIA,
) => {
  const f = pedirFalso((path) => respuestas(aulaDe(path)));
  const fase = await leerAsistencia({ pedir: f.pedir, now: () => 0, deadline: 60_000 }, { ok: true, html: menu }, ALUMNO, CICLO);
  return { fase, pedidos: f.pedidos };
};

describe("RS-BE-51 · fase de asistencia", () => {
  test("lee las cinco aulas del menú de lista, cada una identificada por su página", async () => {
    const { fase, pedidos } = await leer();
    expect(pedidos.map((p) => p.path)).toEqual(CURSOS.map((c) => PORTAL_PATHS.asistenciaAlumno(c.aula)));
    expect(fase.menu).toBe("ok");
    expect(fase.aulas.map((a) => a.estado)).toEqual(["leida", "leida", "leida", "leida", "leida"]);
    expect([...fase.identificadas]).toEqual(CURSOS.map((c) => [c.aula, { courseCode: c.curso, sectionCode: c.seccion }]));
    const primera = fase.aulas[0]!;
    expect(primera.estado === "leida" && primera.datos).toEqual({
      courseCode: "690417", sectionCode: "812", totalHours: 48, attendedHours: 4, absentHours: 2,
    });
    expect(fase.fallos).toEqual([]);
  });

  test("la hora de lectura es el instante en que llega la página, no el del pedido", async () => {
    let t = 1_000;
    const f = pedirFalso((path) => asistenciaDe(aulaDe(path)));
    const pedir = async (path: string) => {
      const html = await f.pedir(path);
      t += 10;
      return html;
    };
    const fase = await leerAsistencia({ pedir, now: () => t, deadline: 60_000 }, { ok: true, html: MENU_ASISTENCIA }, ALUMNO, CICLO);
    for (const a of fase.aulas) expect(a.estado === "leida" && a.leidaEn.getTime()).toBeGreaterThan(1_000);
  });

  test("una página de otro ciclo marca otroCiclo", async () => {
    const { fase } = await leer((aula) => asistenciaDe(aula, aula === "900102" ? { prm_sNuCicl: "1" } : {}));
    expect(fase.otroCiclo).toBe(true);
  });

  test("un ciclo mal formado es un fallo de ese curso, sin otroCiclo", async () => {
    const { fase } = await leer((aula) => asistenciaDe(aula, aula === "900102" ? { prm_sAaCicl: "26" } : {}));
    expect(fase.otroCiclo).toBe(false);
    expect(fase.aulas[1]).toMatchObject({ estado: "failed", motivo: "la página es de otro ciclo" });
    expect(fase.fallos).toEqual(["PORTAL_UNREADABLE"]);
  });

  test("un código de alumno distinto marca identityMismatch", async () => {
    const { fase } = await leer((aula) => asistenciaDe(aula, aula === "900103" ? { prm_sCoUserAlum: "20230002" } : {}));
    expect(fase.identityMismatch).toBe(true);
  });

  test("una descarga que falla deja el aula unavailable con su fallo, fuera del mapa", async () => {
    const { fase } = await leer((aula) => (aula === "900104"
      ? new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE")
      : asistenciaDe(aula)));
    expect(fase.aulas[3]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_UNAVAILABLE" });
    expect(fase.identificadas.has("900104")).toBe(false);
    expect(fase.fallos).toEqual(["PORTAL_UNAVAILABLE"]);
  });

  test("una sesión que muere a mitad de camino se anota como PORTAL_SESSION_INVALID", async () => {
    const { fase } = await leer((aula) => (aula === "900101"
      ? new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID")
      : asistenciaDe(aula)));
    expect(fase.aulas[0]).toMatchObject({ estado: "unavailable", fallo: "PORTAL_SESSION_INVALID" });
  });

  test("una página que identifica el curso y falla en los totales entra al mapa", async () => {
    const { fase } = await leer((aula) => (aula === "900105"
      ? asistenciaDe(aula).replace("Total horas programadas", "Total horas dictadas")
      : asistenciaDe(aula)));
    expect(fase.aulas[4]).toMatchObject({ estado: "failed" });
    expect(fase.identificadas.get("900105")).toEqual({ courseCode: "690421", sectionCode: "903" });
  });

  test("la sección del menú distinta de la de la página no entra al mapa (RS-BE-48)", async () => {
    const menu = menuLista("OpenAsistenciaAlumno", CURSOS.map((c) => ({ aula: c.aula, seccion: c.aula === "900101" ? "999" : c.seccion })));
    const { fase } = await leer(undefined, menu);
    expect(fase.aulas[0]).toMatchObject({ estado: "contraste" });
    expect(fase.identificadas.has("900101")).toBe(false);
  });

  test("un menú que no se descargó deja la fase sin aulas y con su fallo", async () => {
    const fase = await leerAsistencia(
      { pedir: async () => "", now: () => 0, deadline: 60_000 }, { ok: false, fallo: "PORTAL_TIMEOUT" }, ALUMNO, CICLO,
    );
    expect(fase).toMatchObject({ menu: "unavailable", aulas: [], fallos: ["PORTAL_TIMEOUT"] });
  });

  test("un menú en un formato desconocido es PORTAL_UNREADABLE", async () => {
    const { fase, pedidos } = await leer(undefined, "<html><body>otra cosa</body></html>");
    expect(fase).toMatchObject({ menu: "unreadable", aulas: [], fallos: ["PORTAL_UNREADABLE"] });
    expect(pedidos).toHaveLength(0);
  });
});
