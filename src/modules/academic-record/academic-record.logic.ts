/**
 * academic-record.logic.ts — Reglas puras del récord académico.
 *
 * Sin base de datos ni HTTP: reciben lo que ya leyó el parser del portal y
 * devuelven una decisión. Las usa `portal-sync.service.ts` durante la
 * importación, así que este archivo no importa `db` ni nada que lo cargue.
 */
import type { RecordPage, RecordRow } from "../portal-sync/portal-sync.types.js";
import type {
  AcademicRecordDto,
  EntryRecord,
  PeriodSummaryRecord,
  SnapshotRecord,
} from "./academic-record.types.js";

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

/**
 * RS-BE-23, precondición de la limpieza: códigos DISTINTOS de filas aprobadas
 * que no resolvieron a la malla vigente y que tampoco están en la lista de
 * códigos que se sabe que no respaldan un electivo
 * (`SIN_EQUIVALENCIA_CONOCIDA`, todos de Estudios Generales).
 *
 * Lista vacía = la limpieza puede correr. Con cualquier código adentro no se
 * borra nada: "si hay duda, no se borra" (decisión 7 del dueño). La tabla de
 * equivalencias tiene 14 pares y ninguno es de un electivo, así que un
 * electivo aprobado con un código viejo sin pareja no quedaría respaldado, se
 * borraría, y ninguna importación posterior lo repondría.
 *
 * Solo miran las filas APROBADAS: una desaprobada o una fila sin nota no
 * respalda nada, así que no poder resolverla no pone en riesgo ningún borrado.
 *
 * Devuelve los códigos en el orden en que aparecen en el récord y sin
 * repetirlos: el resultado se escribe en el log del servidor.
 */
export const cleanupBlockers = (
  rows: readonly RecordRow[], resolved: ReadonlySet<string>, knownUnmatched: readonly string[],
): string[] => {
  const conocidos = new Set(knownUnmatched);
  const bloqueos: string[] = [];
  for (const r of approvedRows(rows)) {
    if (resolved.has(r.courseCode) || conocidos.has(r.courseCode)) continue;
    if (!bloqueos.includes(r.courseCode)) bloqueos.push(r.courseCode);
  }
  return bloqueos;
};

/**
 * Texto del warning `PROGRESS_REMOVED`. Es el ÚNICO texto nuevo que el récord
 * académico le muestra al alumno: un récord no confiable o una información
 * académica incompleta van solo al log. Solo el conteo, nunca la lista
 * (decisión 5: la lista ya la muestra la pantalla del récord).
 *
 * Se llama únicamente con n > 0, pero la rama plural cubre el 0 sin inventar
 * un texto aparte.
 */
export const progressRemovedMessage = (n: number): string =>
  n === 1
    ? "Se desmarcó 1 electivo que tu récord no respalda."
    : `Se desmarcaron ${n} electivos que tu récord no respalda.`;

/** Orden de ciclos del más reciente al más viejo. Los códigos son "AAAA-N":
 *  mismo largo, dígitos y guion, así que el orden de string descendente es el
 *  cronológico inverso ("2026-2" > "2026-1" > "2025-2"). */
const cicloDesc = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0);

/**
 * RS-BE-26: arma la respuesta de `GET /academic-record/me` con lo que leyó el
 * repository. Función pura: no consulta nada, no inventa valores y no
 * convierte un null en 0. Los ciclos salen del más reciente al más viejo; los
 * cursos de cada ciclo, en el orden en que llegaron.
 */
export const buildAcademicRecordDto = (
  snapshot: SnapshotRecord | null,
  entries: EntryRecord[],
  periods: PeriodSummaryRecord[],
): AcademicRecordDto => {
  const porCiclo = new Map<string, AcademicRecordDto["record"][number]["courses"]>();
  for (const entrada of entries) {
    const cursos = porCiclo.get(entrada.periodCode) ?? [];
    cursos.push({
      code: entrada.courseCode,
      name: entrada.courseName,
      attempt: entrada.attempt,
      credits: entrada.credits,
      grade: entrada.grade,
      gradeRaw: entrada.gradeRaw,
      section: entrada.sectionCode,
      observation: entrada.observation,
    });
    porCiclo.set(entrada.periodCode, cursos);
  }

  return {
    syncedAt: snapshot ? snapshot.syncedAt.toISOString() : null,
    snapshot: snapshot
      ? {
          ppa: snapshot.ppa,
          relativePosition: snapshot.relativePosition,
          creditsAccumulated: snapshot.creditsAccumulated,
          creditsRequired: snapshot.creditsRequired,
          approved: { courses: snapshot.approvedCourses, credits: snapshot.approvedCredits },
          convalidated: {
            courses: snapshot.convalidatedCourses,
            credits: snapshot.convalidatedCredits,
          },
        }
      : null,
    periods: [...periods]
      .sort((a, b) => cicloDesc(a.periodCode, b.periodCode))
      .map((p) => ({
        periodCode: p.periodCode,
        average: p.average,
        relativePosition: p.relativePosition,
        level: p.level,
        convalidated: { courses: p.convalidatedCourses, credits: p.convalidatedCredits },
        enrolled: { courses: p.enrolledCourses, credits: p.enrolledCredits },
        approved: { courses: p.approvedCourses, credits: p.approvedCredits },
        failed: { courses: p.failedCourses, credits: p.failedCredits },
      })),
    record: [...porCiclo.entries()]
      .map(([periodCode, courses]) => ({ periodCode, courses }))
      .sort((a, b) => cicloDesc(a.periodCode, b.periodCode)),
  };
};
