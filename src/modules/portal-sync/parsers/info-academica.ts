import { clean, stripTags, type ParseResult } from "./html.js";
import type { Impedimentos, InfoAcademica } from "../portal-sync.types.js";

/**
 * Bloque "Información Académica". Los sub-bloques "Información General" e
 * "Información por Período" son dos tablas de marcado IDÉNTICO separadas solo
 * por su rótulo de texto: hay que anclarse en el rótulo, no en el orden.
 * PPA y ubicación relativa NO se extraen (decisión 2 de la spec: descartados).
 */
export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica> => {
  const text = clean(stripTags(html));
  const careerName = text.match(/Informaci[óo]n Acad[ée]mica\s+([A-ZÁÉÍÓÚÑ .]{5,60}?)\s+-\s*Informaci[óo]n General/i)?.[1];
  const level = text.match(/Informaci[óo]n por Per[ií]odo[\s\S]{0,400}?Nivel[\s\S]{0,200}?\b(\d{1,2})\b/i)?.[1];
  const lastPeriodLevel = level ? Number.parseInt(level, 10) : null;
  if (!careerName && lastPeriodLevel === null) {
    return { ok: false, reason: "no se encontró el bloque Información Académica" };
  }
  return { ok: true, data: { careerName: careerName ? clean(careerName) : null, lastPeriodLevel } };
};

/** Bloque "Información para Matrícula": impedimentos y deuda. Nunca falla. */
export const parseImpedimentos = (html: string): Impedimentos => {
  const text = clean(stripTags(html));
  const hasImpediment = /TIENES\s+IMPEDIMENTOS?\s+PARA\s+MATR[ÍI]CULA/i.test(text);
  const hasDebt = /DEUDA\s*:?\s*Registra\s+deuda/i.test(text);
  const frag = text.match(/(TIENES\s+IMPEDIMENTOS[\s\S]{0,180}|DEUDA\s*:?\s*Registra[\s\S]{0,120})/i)?.[1] ?? "";
  return { hasImpediment, hasDebt, text: clean(frag) };
};
