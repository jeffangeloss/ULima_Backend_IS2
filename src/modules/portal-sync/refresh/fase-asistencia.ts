import { PORTAL_PATHS } from "../../../services/portal.client.js";
import { parseAsistenciaCurso, parseAulas } from "../parsers/index.js";
import { TOPE_EN_VUELO, conTope, falloDe } from "./refresh.logic.js";
import type { AulaAsistencia, ContextoFase, FaseAsistencia, MenuDescargado } from "./refresh.types.js";

/**
 * RS-BE-51 · fase de asistencia de la recarga, fuera de la transacción.
 *
 * Lee el menú de Asistencia que trajo la ronda de apertura y pide la página de
 * cada aula con a lo sumo cinco peticiones en vuelo (RS-BE-50). El curso y la
 * sección salen siempre de la página, nunca del menú, y la identificación
 * verificada de cada página arma el mapa aula → (curso, sección) que usan el
 * contraste del panel Nota y los avisos (RS-BE-48).
 *
 * Nada de esta fase escribe. Un fallo de descarga o de lectura deja el aula con
 * su estado y nunca produce un 0.
 */
export const leerAsistencia = async (
  ctx: ContextoFase, menu: MenuDescargado, alumno: string, ciclo: string,
): Promise<FaseAsistencia> => {
  const fase: FaseAsistencia = {
    menu: "ok", aulas: [], identificadas: new Map(), fallos: [], identityMismatch: false, otroCiclo: false,
  };
  if (!menu.ok) {
    fase.menu = "unavailable";
    fase.fallos.push(menu.fallo);
    return fase;
  }
  const aulas = parseAulas(menu.html, "OpenAsistenciaAlumno");
  if (!aulas.ok) {
    fase.menu = "unreadable";
    fase.fallos.push("PORTAL_UNREADABLE");
    return fase;
  }

  fase.aulas = await conTope(TOPE_EN_VUELO, aulas.data.length, async (i): Promise<AulaAsistencia> => {
    const aula = aulas.data[i]!;
    // Pasado el presupuesto no se pide nada más (RS-BE-50). Tras un código de
    // alumno distinto u otro ciclo la recarga entera se aborta, así que
    // tampoco.
    if (ctx.now() >= ctx.deadline || fase.identityMismatch || fase.otroCiclo) {
      return { aula, i, estado: "not_reached" };
    }
    let html: string;
    try {
      html = await ctx.pedir(PORTAL_PATHS.asistenciaAlumno(aula.aula));
    } catch (e) {
      const fallo = falloDe(e);
      fase.fallos.push(fallo);
      return { aula, i, estado: "unavailable", fallo };
    }
    // RS-BE-51, punto 6. El instante en que llega la respuesta.
    const leidaEn = new Date(ctx.now());
    const r = parseAsistenciaCurso(html, aula.aula, alumno, ciclo);
    if (r.identityMismatch) fase.identityMismatch = true;
    if (r.otroCiclo) fase.otroCiclo = true;
    const id = r.identificado;
    // RS-BE-48. Si el menú trae una sección y la página declara otra, no hay
    // forma segura de saber cuál vale, y el aula no entra al mapa.
    if (id && aula.sectionCode !== null && aula.sectionCode !== id.sectionCode) {
      fase.fallos.push("PORTAL_UNREADABLE");
      return { aula, i, estado: "contraste" };
    }
    if (id) fase.identificadas.set(aula.aula, id);
    if (!r.ok) {
      fase.fallos.push("PORTAL_UNREADABLE");
      return { aula, i, estado: "failed", motivo: r.reason };
    }
    return { aula, i, estado: "leida", datos: r.data, leidaEn };
  });
  return fase;
};
