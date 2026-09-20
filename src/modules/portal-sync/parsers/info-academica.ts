import { cellsOf, clean, normalizeLabel, stripTags, trsOf, type ParseResult } from "./html.js";
import type {
  AcademicGeneral,
  AcademicPeriodBlock,
  Impedimentos,
  InfoAcademica,
} from "../portal-sync.types.js";

/** Secuencia exacta de rótulos normalizados de "Información General":
 *  cabecera 1 (6 celdas) seguida de cabecera 2 (4 celdas). */
export const GENERAL_HEADER: readonly string[] = [
  "PROMEDIO PONDERADO ACUMULADO", "UBICACION RELATIVA", "CONVALIDADOS", "APROBADOS",
  "CREDITOS ACUMULADOS", "CREDITOS REQUERIDOS ESPECIALIDAD",
  "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
];

/** Secuencia exacta de rótulos normalizados de "Información por Período":
 *  cabecera 1 (7 celdas) seguida de cabecera 2 (8 celdas). El "(*)" de
 *  "Ubicación Relativa (*)" lo borra `normalizeLabel`. */
export const PERIOD_HEADER: readonly string[] = [
  "PROMEDIO PERIODO", "UBICACION RELATIVA", "NIVEL",
  "CONVALIDADOS", "MATRICULADOS", "APROBADOS", "DESAPROBADOS",
  "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
];

/** Información general sin un solo campo leído. Congelada porque se devuelve
 *  por referencia cada vez que el bloque falta o su cabecera no coincide. */
export const EMPTY_GENERAL: AcademicGeneral = Object.freeze({
  ppa: null,
  relativePosition: null,
  convalidated: Object.freeze({ courses: null, credits: null }),
  approved: Object.freeze({ courses: null, credits: null }),
  creditsAccumulated: null,
  creditsRequired: null,
});

/** Rótulos crudos: el portal los emite con entidades y los parte en líneas. */
const GENERAL_RE = /Informaci(?:&oacute;|ó|o)n General/i;
const PERIOD_RE =
  /Informaci(?:&oacute;|ó|o)n por Per(?:&iacute;|í|i)odo\s+Acad(?:&eacute;|é|e)mico:\s*Ciclo\s+(\d{4}-[0-2])/i;

const NUMERO = /^\d+(\.\d+)?$/;
const ENTERO = /^\d+$/;
/** El portal mezcla `</table>` y `</TABLE>` en la misma página, así que el
 *  cierre se busca con una regex insensible a mayúsculas y no con `indexOf`. */
const CIERRE = /<\/table\s*>/i;

/** Las 3 `tr` del sub-bloque que empieza en `desde`: dos de cabecera y una de
 *  valores. `null` si el corte no las trae. */
const filasDelBloque = (html: string, desde: number): string[] | null => {
  const resto = html.slice(desde);
  const cierre = CIERRE.exec(resto);
  if (!cierre) return null;
  const trs = trsOf(resto.slice(0, cierre.index + cierre[0].length));
  return trs.length >= 3 ? trs : null;
};

const cabeceraOk = (trs: string[], esperada: readonly string[]): boolean => {
  const rotulos = [...cellsOf(trs[0]), ...cellsOf(trs[1])].map(normalizeLabel);
  return rotulos.length === esperada.length && rotulos.every((r, i) => r === esperada[i]);
};

/** Lector por posición que anota en `unreadable` toda celda que no se pudo
 *  leer. `cells` puede ser más corta que las posiciones pedidas. */
const crearLector = (cells: string[], prefijo: string, unreadable: string[]) => {
  const anotar = (campo: string): null => {
    unreadable.push(`${prefijo}.${campo}`);
    return null;
  };
  return {
    /** Entero o decimal. Un valor ilegible da `null`, nunca 0. */
    numero: (i: number, campo: string): number | null => {
      const v = cells[i] ?? "";
      return NUMERO.test(v) ? Number(v) : anotar(campo);
    },
    /** Solo entero: cursos y nivel. */
    entero: (i: number, campo: string): number | null => {
      const v = cells[i] ?? "";
      return ENTERO.test(v) ? Number(v) : anotar(campo);
    },
    /** Texto ya normalizado por `cellsOf`; vacío es "no leído". */
    texto: (i: number, campo: string): string | null => {
      const v = cells[i] ?? "";
      return v === "" ? anotar(campo) : v;
    },
  };
};

const leerGeneral = (html: string, unreadable: string[]): AcademicGeneral => {
  const m = GENERAL_RE.exec(html);
  const trs = m ? filasDelBloque(html, m.index) : null;
  if (!trs || !cabeceraOk(trs, GENERAL_HEADER)) {
    unreadable.push("general");
    return EMPTY_GENERAL;
  }
  const lee = crearLector(cellsOf(trs[2]), "general", unreadable);
  return {
    ppa: lee.numero(0, "ppa"),
    relativePosition: lee.texto(1, "relativePosition"),
    convalidated: {
      courses: lee.entero(2, "convalidated.courses"),
      credits: lee.numero(3, "convalidated.credits"),
    },
    approved: {
      courses: lee.entero(4, "approved.courses"),
      credits: lee.numero(5, "approved.credits"),
    },
    creditsAccumulated: lee.numero(6, "creditsAccumulated"),
    creditsRequired: lee.numero(7, "creditsRequired"),
  };
};

const leerPeriodo = (html: string, unreadable: string[]): AcademicPeriodBlock | null => {
  const m = PERIOD_RE.exec(html);
  const periodCode = m?.[1];
  if (!m || !periodCode) {
    unreadable.push("period");
    return null;
  }
  const trs = filasDelBloque(html, m.index);
  if (!trs || !cabeceraOk(trs, PERIOD_HEADER)) {
    unreadable.push("period");
    return {
      periodCode,
      average: null, relativePosition: null, level: null,
      convalidated: { courses: null, credits: null },
      enrolled: { courses: null, credits: null },
      approved: { courses: null, credits: null },
      failed: { courses: null, credits: null },
    };
  }
  const lee = crearLector(cellsOf(trs[2]), "period", unreadable);
  return {
    periodCode,
    average: lee.numero(0, "average"),
    relativePosition: lee.texto(1, "relativePosition"),
    level: lee.entero(2, "level"),
    convalidated: {
      courses: lee.entero(3, "convalidated.courses"),
      credits: lee.numero(4, "convalidated.credits"),
    },
    enrolled: {
      courses: lee.entero(5, "enrolled.courses"),
      credits: lee.numero(6, "enrolled.credits"),
    },
    approved: {
      courses: lee.entero(7, "approved.courses"),
      credits: lee.numero(8, "approved.credits"),
    },
    failed: {
      courses: lee.entero(9, "failed.courses"),
      credits: lee.numero(10, "failed.credits"),
    },
  };
};

/**
 * Bloque "Información Académica" de `layout.jsp`: carrera, información general
 * e información por período (RS-BE-24).
 *
 * De "Información General" salen PPA, ubicación relativa, cursos y créditos
 * convalidados y aprobados, créditos acumulados y créditos requeridos de la
 * especialidad. De "Información por Período" salen su código de ciclo,
 * promedio, ubicación relativa, nivel y los cursos y créditos convalidados,
 * matriculados, aprobados y desaprobados.
 *
 * El `level` de ese bloque NO es el nivel del alumno hoy: el bloque describe el
 * ciclo ANTERIOR y por eso se guarda con el código de ciclo que él mismo
 * declara. La sincronización sigue tomando el nivel del consolidado de
 * matrícula del ciclo importado.
 *
 * Los sub-bloques tienen marcado idéntico y solo se distinguen por su rótulo de
 * texto, así que hay que anclarse en el rótulo y nunca en el orden de las
 * tablas. Además son tres niveles de tablas anidadas: `/<table…<\/table>/` no
 * sirve para recortarlos y se corta desde el rótulo hasta el primer cierre de
 * tabla.
 *
 * La cabecera tiene grupos ("Convalidados", "Aprobados"…) con "Cursos |
 * Créditos" repetido debajo y una sola fila de valores, así que primero se
 * valida la secuencia completa de rótulos normalizados y recién entonces se
 * leen los valores por posición. Si la secuencia no coincide, todos los campos
 * de ese bloque quedan `null`. Un campo ilegible queda `null` —nunca 0— y su
 * nombre se acumula en `unreadable` para que el service lo escriba en el log.
 */
export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica> => {
  const text = clean(stripTags(html));
  const careerName = text.match(
    /Informaci[óo]n Acad[ée]mica\s+([A-ZÁÉÍÓÚÑ .]{5,60}?)\s+-\s*Informaci[óo]n General/i,
  )?.[1];
  if (!careerName) {
    return { ok: false, reason: "no se encontró el bloque Información Académica" };
  }
  const unreadable: string[] = [];
  const general = leerGeneral(html, unreadable);
  const period = leerPeriodo(html, unreadable);
  return { ok: true, data: { careerName: clean(careerName), general, period, unreadable } };
};

/** Bloque "Información para Matrícula": impedimentos y deuda. Nunca falla. */
export const parseImpedimentos = (html: string): Impedimentos => {
  const text = clean(stripTags(html));
  const hasImpediment = /TIENES\s+IMPEDIMENTOS?\s+PARA\s+MATR[ÍI]CULA/i.test(text);
  const hasDebt = /DEUDA\s*:?\s*Registra\s+deuda/i.test(text);
  const frag = text.match(/(TIENES\s+IMPEDIMENTOS[\s\S]{0,180}|DEUDA\s*:?\s*Registra[\s\S]{0,120})/i)?.[1] ?? "";
  return { hasImpediment, hasDebt, text: clean(frag) };
};
