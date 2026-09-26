import type { Pedir } from "../../src/modules/portal-sync/refresh/refresh.types.js";

/**
 * Datos y dobles de las pruebas de la recarga (HU37). Todo es inventado y sale
 * de la lista de datos de ejemplo de recarga-portal.spec.md (RS-BE-59).
 */

export const ALUMNO = "20230001";
export const CICLO = "2026-2";

/** Los cinco cursos del menú de lista, en su orden, con su matrícula y su sección. */
export const CURSOS = [
  { aula: "900101", curso: "690417", seccion: "812", nombre: "TALLER DE PROTOTIPADO", enrollmentId: 501, sectionId: 81 },
  { aula: "900102", curso: "690418", seccion: "812", nombre: "ANALITICA DE DATOS", enrollmentId: 502, sectionId: 82 },
  { aula: "900103", curso: "690419", seccion: "815", nombre: "GESTION DE PROYECTOS", enrollmentId: 503, sectionId: 83 },
  { aula: "900104", curso: "690420", seccion: "1020", nombre: "ETICA PROFESIONAL", enrollmentId: 504, sectionId: 84 },
  { aula: "900105", curso: "690421", seccion: "903", nombre: "ESTADISTICA APLICADA", enrollmentId: 505, sectionId: 85 },
];

export const cursoDe = (aula: string) => {
  const curso = CURSOS.find((c) => c.aula === aula);
  if (!curso) throw new Error(`aula sin curso en las pruebas: ${aula}`);
  return curso;
};

/** El aula de una ruta del Aula Virtual. */
export const aulaDe = (path: string): string => /prm_sNuAula=(\d+)/.exec(path)?.[1] ?? "";

const leer = (ruta: string) => Bun.file(ruta).text();
export const PAGINA_ASISTENCIA = await leer("test/HU37_jeff/fixtures/asistencia-curso-900101.html");
export const PAGINA_NOTA = await leer("test/HU37_jeff/fixtures/nota-curso-900101.html");
export const MENU_ASISTENCIA = await leer("test/HU31_jeff/fixtures/menu-lista-asistencia.html");
export const LAYOUT = '<html><body><font face="Arial" size="2">CICLO: 2026-2</font></body></html>';

/** Cambia el `value` de un oculto de la página de asistencia. */
export const conOculto = (html: string, nombre: string, valor: string): string =>
  html.replace(new RegExp(`(name="${nombre}" value=")[^"]*`), (_t, pre: string) => pre + valor);

type Oculto = "prm_sCoUserAlum" | "prm_sAaCicl" | "prm_sNuCicl" | "prm_sCoCurs" | "prm_sCoSecc";

/** Página de asistencia de un aula, derivada del fixture de 900101. */
export const asistenciaDe = (aula: string, cambios: Partial<Record<Oculto, string>> = {}): string => {
  const c = cursoDe(aula);
  const valores: Record<string, string> = { prm_sNuAula: aula, prm_sCoCurs: c.curso, prm_sCoSecc: c.seccion, ...cambios };
  return Object.entries(valores).reduce((html, [nombre, valor]) => conOculto(html, nombre, valor), PAGINA_ASISTENCIA);
};

/** Cambia el valor de una asignación `var nombre = '…'` de la página de notas. */
export const conVar = (html: string, nombre: string, valor: string): string =>
  html.replace(new RegExp(`(\\bvar ${nombre} = )'[^']*'`), (_t, pre: string) => `${pre}'${valor}'`);

/** Página de notas del curso de un aula, derivada del fixture de 900101. */
export const notaDe = (
  aula: string,
  cambios: { codCurso?: string; seccion?: string; notaPROM?: string; aulaMarco?: string } = {},
): string => {
  const c = cursoDe(aula);
  let html = conVar(conVar(PAGINA_NOTA, "codCurso", cambios.codCurso ?? c.curso), "seccion", cambios.seccion ?? c.seccion);
  if (cambios.notaPROM !== undefined) html = conVar(html, "notaPROM", cambios.notaPROM);
  return html.replace("prm_sNuAula=900101", `prm_sNuAula=${cambios.aulaMarco ?? aula}`);
};

/** Una hoja de la tabla «Detalle Evaluaciones». */
export type Hoja = { id: string; nombre: string; semana: string; peso: string; nota: string };

/** Las cinco evaluaciones del fixture de evaluaciones vacías. */
export const HOJAS: Hoja[] = [
  { id: "07.13", nombre: "Examen escrito 1", semana: "3", peso: "15", nota: "" },
  { id: "07.14", nombre: "Trabajo de producción 1", semana: "6", peso: "15", nota: "" },
  { id: "07.15", nombre: "Exposición", semana: "10", peso: "20", nota: "" },
  { id: "07.16", nombre: "Examen escrito 2", semana: "12", peso: "20", nota: "" },
  { id: "07.17", nombre: "Proyecto final", semana: "15", peso: "30", nota: "" },
];

/** Marco «Detalle Evaluaciones» con un solo grupo EVC y las hojas dadas. */
export const marco = (hojas: Hoja[] = HOJAS): string => [
  '<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1"></head><body>',
  '<p class="subtitulo">Evaluaciones</p><table class="treetable">',
  "<tr><th></th><th>Detalle Evaluaciones</th><th>Semana</th><th>Peso</th><th>Nota</th><th></th></tr>",
  '<tr data-tt-id="07"><td></td><td>EVC</td><td>&nbsp;</td><td>100</td><td>&nbsp;</td><td></td></tr>',
  ...hojas.map((h) => `<tr data-tt-id="${h.id}" data-tt-parent-id='07'><td></td><td>${h.nombre}</td>`
    + `<td>${h.semana}</td><td>${h.peso}</td><td>${h.nota || "&nbsp;"}</td><td></td></tr>`),
  "</table></body></html>",
].join("\n");

/** Menú de lista con las aulas y las secciones dadas. */
export const menuLista = (
  fn: "OpenAsistenciaAlumno" | "OpenNotaAlumnoPrePost", aulas: Array<{ aula: string; seccion: string }>,
): string =>
  `<html><body><ul class="asignaturas">\n${aulas.map((a) =>
    `<li class="curso">CARRERA ING.SI. / CURSO INVENTADO / ${a.seccion}</li>\n`
    + `&nbsp;&nbsp;&nbsp;- <a href="javascript:${fn}('${a.aula}');">Ver</a><br><br>\n`).join("")}</ul></body></html>`;

/** `pedir` falso. Anota cada ruta con el reloj al pedirla y avanza el reloj. */
export const pedirFalso = (
  respuestas: (path: string) => string | Error,
  reloj: { t: number; paso: number } = { t: 0, paso: 0 },
) => {
  const pedidos: Array<{ path: string; t: number; opciones?: unknown }> = [];
  const pedir: Pedir = async (path, opciones) => {
    pedidos.push({ path, t: reloj.t, opciones });
    reloj.t += reloj.paso;
    const r = respuestas(path);
    if (r instanceof Error) throw r;
    return r;
  };
  return { pedir, pedidos, reloj };
};
