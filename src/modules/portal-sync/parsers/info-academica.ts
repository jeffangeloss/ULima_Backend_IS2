import { clean, stripTags, type ParseResult } from "./html.js";
import type { Impedimentos, InfoAcademica } from "../portal-sync.types.js";

/**
 * Bloque "Información Académica". Solo se extrae la carrera.
 *
 * NO se extrae el nivel: la sincronización lo toma del consolidado de
 * matrícula del ciclo importado, porque el bloque "Información por Período"
 * describe el ciclo ANTERIOR. Tampoco se extraen PPA ni ubicación relativa:
 * no hay columna donde guardarlos.
 *
 * Los sub-bloques "Información General" e "Información por Período" tienen
 * marcado idéntico y solo se distinguen por su rótulo de texto, así que hay
 * que anclarse en el rótulo y nunca en el orden de las tablas.
 */
export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica> => {
  const text = clean(stripTags(html));
  const careerName = text.match(
    /Informaci[óo]n Acad[ée]mica\s+([A-ZÁÉÍÓÚÑ .]{5,60}?)\s+-\s*Informaci[óo]n General/i,
  )?.[1];
  if (!careerName) {
    return { ok: false, reason: "no se encontró el bloque Información Académica" };
  }
  return { ok: true, data: { careerName: clean(careerName) } };
};

/** Bloque "Información para Matrícula": impedimentos y deuda. Nunca falla. */
export const parseImpedimentos = (html: string): Impedimentos => {
  const text = clean(stripTags(html));
  const hasImpediment = /TIENES\s+IMPEDIMENTOS?\s+PARA\s+MATR[ÍI]CULA/i.test(text);
  const hasDebt = /DEUDA\s*:?\s*Registra\s+deuda/i.test(text);
  const frag = text.match(/(TIENES\s+IMPEDIMENTOS[\s\S]{0,180}|DEUDA\s*:?\s*Registra[\s\S]{0,120})/i)?.[1] ?? "";
  return { hasImpediment, hasDebt, text: clean(frag) };
};
