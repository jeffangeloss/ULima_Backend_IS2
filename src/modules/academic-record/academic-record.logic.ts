/**
 * academic-record.logic.ts — Reglas puras del récord académico.
 *
 * Sin base de datos ni HTTP: reciben lo que ya leyó el parser del portal y
 * devuelven una decisión. Las usa `portal-sync.service.ts` durante la
 * importación, así que este archivo no importa `db` ni nada que lo cargue.
 */
import type { RecordPage, RecordRow } from "../portal-sync/portal-sync.types.js";

/** Veredicto de la regla de confianza (RS-BE-21). `reason` va solo al log del
 *  servidor: describe la condición que falló y nunca lleva notas, nombres ni
 *  códigos de alumno. */
export type RecordTrust = { ok: true } | { ok: false; reason: string };

/** Diferencia máxima admitida entre la suma de CRD. de las filas aprobadas y
 *  CRD. APROB. del pie. El pie trae un decimal y los créditos pueden ser 1.5:
 *  la tolerancia absorbe el error de coma flotante de la suma. */
export const CREDIT_TOLERANCE = 0.05;

/** `grade` es un entero dentro de [min, max]. `null` —ciclo en curso o una
 *  marca del portal en lugar de un número— nunca cumple. */
const notaEnteraEntre = (grade: number | null, min: number, max: number): boolean =>
  grade !== null && Number.isInteger(grade) && grade >= min && grade <= max;

/** Filas aprobadas: NOTA entera entre 11 y 20. Cada fila cuenta por separado:
 *  un curso jalado y luego aprobado aporta una aprobada y una desaprobada. */
export const approvedRows = (rows: readonly RecordRow[]): RecordRow[] =>
  rows.filter((r) => notaEnteraEntre(r.grade, 11, 20));

/** Filas desaprobadas: NOTA entera entre 0 y 10. */
export const failedRows = (rows: readonly RecordRow[]): RecordRow[] =>
  rows.filter((r) => notaEnteraEntre(r.grade, 0, 10));

/**
 * RS-BE-21: un récord es de confianza solo si se cumplen TODAS estas
 * condiciones. Se evalúan en este orden y se devuelve la primera que falla:
 *
 * 1. se halló la tabla del récord con su cabecera exacta (`headerOk`);
 * 2. se halló el pie con su cabecera de 10 columnas y todos sus números
 *    (`footer`). Sin pie no hay contra qué comparar: es un fallo, nunca un
 *    "se omite la comparación";
 * 3. hay al menos una fila de datos y ninguna se descartó;
 * 4. filas aprobadas === ASIG. APR.;
 * 5. suma de CRD. de esas filas, sin redondear, === CRD. APROB. (± CREDIT_TOLERANCE);
 * 6. ASIG. CONV. es 0 (todavía no se sabe cómo marca el portal un
 *    convalidado) y filas desaprobadas === ASIG. DESAP.
 *
 * TOTAL CRD. VÁLIDOS y TOTAL ASIG. VÁLIDOS se leen pero no deciden. Las filas
 * sin nota numérica no entran en ningún total: quedan fuera de los dos filtros.
 */
export const evaluateRecordTrust = (page: RecordPage): RecordTrust => {
  if (!page.headerOk) {
    return { ok: false, reason: "tabla del récord ausente o con cabecera distinta" };
  }
  const footer = page.footer;
  if (footer === null) return { ok: false, reason: "pie ausente o ilegible" };
  if (page.rows.length === 0) return { ok: false, reason: "sin filas" };
  if (page.discarded > 0) return { ok: false, reason: `${page.discarded} filas descartadas` };

  const aprobadas = approvedRows(page.rows);
  if (aprobadas.length !== footer.approvedCourses) {
    return { ok: false, reason: "aprobadas no coinciden con ASIG. APR." };
  }
  const creditosAprobados = aprobadas.reduce((suma, r) => suma + r.credits, 0);
  if (Math.abs(creditosAprobados - footer.approvedCredits) > CREDIT_TOLERANCE) {
    return { ok: false, reason: "créditos aprobados no coinciden con CRD. APROB." };
  }
  if (footer.convalidatedCourses > 0) {
    return { ok: false, reason: "hay convalidados (ASIG. CONV. > 0)" };
  }
  if (failedRows(page.rows).length !== footer.failedCourses) {
    return { ok: false, reason: "desaprobadas no coinciden con ASIG. DESAP." };
  }
  return { ok: true };
};
