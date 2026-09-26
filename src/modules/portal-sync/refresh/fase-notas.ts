import { PORTAL_PATHS } from "../../../services/portal.client.js";
import { parseAulas } from "../parsers/index.js";
import { parseDetalleEvaluaciones, parseNotaCurso } from "../parsers/nota.js";
import type { AsistenciaIdentificada, AulaMenu } from "../portal-sync.types.js";
import { falloDe } from "./refresh.logic.js";
import type { AulaNotas, ContextoFase, FaseNotas, MenuDescargado } from "./refresh.types.js";

/**
 * RS-BE-52 y RS-BE-53 · fase de notas de la recarga, fuera de la transacción.
 *
 * Por cada aula del menú de Nota, primero la página del curso y después su
 * marco, y los cursos uno tras otro. El marco no trae ningún identificador, así
 * que este orden es lo único que lo ata a su curso mientras la verificación V3
 * no pruebe que no depende de un estado de sesión que deja la página del curso.
 */
export const leerNotas = async (
  ctx: ContextoFase, menu: MenuDescargado, mapaAsistencia: Map<string, AsistenciaIdentificada>,
): Promise<FaseNotas> => {
  const fase: FaseNotas = { menu: "ok", aulas: [], identificadas: new Map(), fallos: [] };
  if (!menu.ok) {
    fase.menu = "unavailable";
    fase.fallos.push(menu.fallo);
    return fase;
  }
  const aulas = parseAulas(menu.html, "OpenNotaAlumnoPrePost");
  if (!aulas.ok) {
    fase.menu = "unreadable";
    fase.fallos.push("PORTAL_UNREADABLE");
    return fase;
  }
  for (const [i, aula] of aulas.data.entries()) {
    fase.aulas.push(await leerCurso(ctx, aula, i, mapaAsistencia, fase));
  }
  return fase;
};

const leerCurso = async (
  ctx: ContextoFase, aula: AulaMenu, i: number, mapa: Map<string, AsistenciaIdentificada>, fase: FaseNotas,
): Promise<AulaNotas> => {
  if (ctx.now() >= ctx.deadline) return { aula, i, estado: "not_reached" };
  let pagina: string;
  try {
    pagina = await ctx.pedir(PORTAL_PATHS.notaCurso(aula.aula), { refererPath: PORTAL_PATHS.cursosNota });
  } catch (e) {
    const fallo = falloDe(e);
    fase.fallos.push(fallo);
    return { aula, i, estado: "unavailable", fallo };
  }
  const curso = parseNotaCurso(pagina, aula.aula);
  if (!curso.ok) {
    fase.fallos.push("PORTAL_UNREADABLE");
    return { aula, i, estado: "failed", motivo: curso.reason };
  }
  const par: AsistenciaIdentificada = { courseCode: curso.data.courseCode, sectionCode: curso.data.sectionCode };
  // RS-BE-52, punto 6. La sección del menú, o el curso o la sección que dio la
  // página de asistencia de la misma aula, tienen que coincidir.
  const enAsistencia = mapa.get(aula.aula);
  const menuDistinto = aula.sectionCode !== null && aula.sectionCode !== par.sectionCode;
  const asistenciaDistinta = enAsistencia !== undefined
    && (enAsistencia.courseCode !== par.courseCode || enAsistencia.sectionCode !== par.sectionCode);
  if (menuDistinto || asistenciaDistinta) {
    fase.fallos.push("PORTAL_UNREADABLE");
    return { aula, i, estado: "contraste" };
  }
  // Identificación verificada de la página de notas, que RS-BE-48 usa para
  // atribuir un aula cuya página de asistencia falla.
  fase.identificadas.set(aula.aula, par);

  if (ctx.now() >= ctx.deadline) return { aula, i, estado: "not_reached" };
  let marco: string;
  try {
    // El cliente arma la ruta con el aula del menú y nunca sigue el src del HTML.
    marco = await ctx.pedir(PORTAL_PATHS.tareaAcademica(aula.aula), {
      charset: "iso-8859-1", refererPath: PORTAL_PATHS.notaCurso(aula.aula),
    });
  } catch (e) {
    const fallo = falloDe(e);
    fase.fallos.push(fallo);
    return { aula, i, estado: "unavailable", fallo };
  }
  const leidaEn = new Date(ctx.now());
  const tabla = parseDetalleEvaluaciones(marco);
  if (!tabla.ok) {
    fase.fallos.push("PORTAL_UNREADABLE");
    return { aula, i, estado: "failed", motivo: tabla.reason };
  }
  return { aula, i, estado: "leida", par, evaluaciones: tabla.data, agregados: curso.data.agregados, leidaEn };
};
