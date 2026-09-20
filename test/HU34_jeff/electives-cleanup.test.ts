import { describe, expect, spyOn, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import {
  cleanupBlockers,
  progressRemovedMessage,
} from "../../src/modules/academic-record/academic-record.logic.js";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { RecordRow } from "../../src/modules/portal-sync/portal-sync.types.js";
import { SIN_EQUIVALENCIA_CONOCIDA } from "../../src/db/seed/equivalencias.logic.js";
import type { PortalClient } from "../../src/services/portal.client.js";

/**
 * RS-BE-23: la limpieza borra de `student_course_progress` los electivos
 * APROBADOS que ninguna fila del record respalda.
 *
 * Es la unica escritura de esta funcionalidad que BORRA datos propios del
 * alumno, asi que las pruebas miran el SQL renderizado: lo que importa no es
 * solo lo que la sentencia hace, sino todo lo que NO puede llegar a tocar.
 *
 * Datos inventados: alumno sintetico 20230001 (studentId interno 77), malla 1,
 * curriculum_course 5 y 6 como respaldo.
 */
const fakeTx = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

describe("deleteUnbackedElectives", () => {
  test("con el respaldo vacio devuelve 0 SIN consultar nada", async () => {
    // `intArray([])` rinde `string_to_array('', ',')::int[]`, que es '{}', y
    // `<> all('{}')` es verdadero para TODA fila: la consulta borraria todos
    // los electivos aprobados del alumno. La guarda corta antes.
    const { tx, llamadas } = fakeTx([{ id: 31 }]);
    expect(await repo.deleteUnbackedElectives(tx, 77, 1, [])).toBe(0);
    expect(llamadas()).toBe(0);
  });

  test("borra en UNA sentencia y devuelve lo que la base dice haber borrado", async () => {
    // Tres filas borradas con dos ids de respaldo: el numero sale del
    // `returning`, no del largo de `backingIds`.
    const { tx, consultas, llamadas } = fakeTx([{ id: 31 }, { id: 32 }, { id: 33 }]);
    expect(await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6])).toBe(3);
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("delete from student_course_progress scp using curriculum_course cc");
    expect(q).toContain("returning scp.id");
  });

  test("solo electivos aprobados, del alumno y de su malla", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("scp.curriculum_course_id = cc.id");
    expect(q).toContain("scp.student_id = $1");
    expect(q).toContain("scp.curriculum_id = $2");
    expect(q).toContain("cc.category = 'elective'");
    expect(q).toContain("scp.status = 'approved'");
    expect(q).toContain("scp.curriculum_course_id <> all(");
  });

  test("nunca toca otros estados, otras categorias ni la simulacion", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const q = norm(consultas()[0]!.sql);
    for (const prohibido of [
      "in_progress", "failed", "withdrawn",
      "general_studies", "common", "faculty",
      "student_curriculum_simulation",
    ]) {
      expect(q).not.toContain(prohibido);
    }
  });

  test("los ids del respaldo viajan en UN solo parametro de texto", async () => {
    // Mismo defecto de 42809 que tumbo la primera importacion real: un arreglo
    // de JS interpolado se vuelve `all(($3, $4))`, un constructor de fila.
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const { sql: texto, params } = consultas()[0]!;
    expect(params).toEqual([77, 1, "5,6"]);
    expect(norm(texto)).not.toMatch(/all\(\s*\(\s*\$\d/);
    expect(norm(texto)).toContain("::int[]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RS-BE-23 a nivel de servicio: cuándo corre la limpieza, con qué conjunto de
// respaldo, cuánto suma y qué avisa. Lo de arriba prueba la SENTENCIA; esto
// prueba la DECISIÓN de ejecutarla, que es donde está el riesgo de borrar de
// más. Todos los datos son inventados: alumno sintético 20230001 (id interno
// 7), malla 1, curriculum_course 61..64 y 71.
// ─────────────────────────────────────────────────────────────────────────────

const layoutBase = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();
// El layout de HU34 trae solo el bloque "Información Académica": no declara el
// ciclo vigente, y sin él `parseCicloActivo` aborta la importación con 502. Se
// agrega acá, igual que en `consent-gate.test.ts` de la Tarea 6 y por la misma
// razón (el fixture es de la Tarea 3 y su prueba fija su contenido). El rótulo
// va en MAYÚSCULAS y con dos puntos, que es la grafía que ese parser exige; el
// "Ciclo 2026-1" del bloque por período es el ciclo ANTERIOR y por eso no lo
// reconoce (parsers/ciclo.ts: la regex va sin flag `i`).
const layout = layoutBase.replace(
  "</body>", '<span class="PortalChannelText">CICLO: 2026-2</span></body>',
);
const matricula = await Bun.file("test/HU34_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();
// Código del alumno sintético tal como lo trae el fixture de matrícula.
const CODE_EN_FIXTURE = matricula.match(/\b(\d{8})\b/)![1];
const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

/** Valores del pie del fixture, por posición: COD. CAR. | PROM. POND. |
 *  CRD. CONV. | CRD. APROB. | TOTAL CRD. VÁLIDOS | ASIG. CONV. | ASIG. APR. |
 *  TOTAL ASIG. VÁLIDOS | CRD. DESAP. | ASIG. DESAP. */
const PIE_FIXTURE = ["0001", "11.8000", "0.0", "8.5", "8.5", "0", "3", "3", "4.0", "1"];

/** Reescribe la fila de valores del pie. Una variante que cambia una nota tiene
 *  que ajustar el pie: si no, `evaluateRecordTrust` rechaza el récord y la
 *  limpieza no corre, pero por otra razón que la que se quiere medir. */
const conPie = (html: string, cambios: Record<number, string>): string => {
  const pie = (html.match(/<table[\s\S]*?<\/table>/gi) ?? [])[1] ?? "";
  const valores = PIE_FIXTURE.map((v, i) => cambios[i] ?? v);
  const fila = `<tr>${valores.map((v) => `<td class="text-center">${v}</td>`).join("")}</tr>`;
  return html.replace(pie, () => pie.replace(/<tbody>[\s\S]*<\/tbody>/, () => `<tbody>${fila}</tbody>`));
};

/** Reemplaza literales exigiendo que cada uno aparezca EXACTAMENTE una vez: si
 *  el fixture cambia, la prueba lo dice en vez de medir otra cosa en silencio. */
const unaVez = (html: string, cambios: Array<[string, string]>): string => {
  let out = html;
  for (const [de, a] of cambios) {
    const veces = out.split(de).length - 1;
    if (veces !== 1) throw new Error(`"${de}" aparece ${veces} veces en el fixture; se esperaba 1`);
    out = out.replace(de, () => a);
  }
  return out;
};

/** 4901 pasa de nota 14 a la marca "CONV": deja de ser fila aprobada (el pie
 *  baja a 2 aprobadas y 5.5 créditos) pero su código sigue en el récord, así
 *  que su curriculum_course TIENE que entrar igual en el respaldo. */
const RECORD_CON_MARCA = conPie(
  unaVez(record, [["14", "CONV"]]),
  { 3: "5.5", 4: "5.5", 6: "2", 7: "2" },
);

/** El curso aprobado con 17 pasa a un código que no está en la malla, ni en
 *  `course_equivalence`, ni en SIN_EQUIVALENCIA_CONOCIDA. */
const RECORD_CON_DESCONOCIDO = record.replaceAll("659002", "700001");

/** Mismo curso, pero con un código que SÍ está en SIN_EQUIVALENCIA_CONOCIDA. */
const RECORD_CON_ESTUDIOS_GENERALES = record.replaceAll("659002", "6505");

/** Los tres códigos aprobados pasan a códigos de SIN_EQUIVALENCIA_CONOCIDA:
 *  nada bloquea, pero tampoco hay nada que respalde. */
const RECORD_TODO_SIN_EQUIVALENCIA = record
  .replaceAll("659001", "6506")
  .replaceAll("4901", "6510")
  .replaceAll("659002", "6512");

/** Sin tabla de pie: `evaluateRecordTrust` da "pie ausente o ilegible". */
const RECORD_SIN_PIE = record.replace((record.match(/<table[\s\S]*?<\/table>/gi) ?? [])[1] ?? "", "");

/** Códigos del récord que resuelven por código DIRECTO en la malla. */
const DIRECTOS: Record<string, number> = { "659001": 61, "659002": 62, "659003": 63, "659004": 64 };
/** Códigos que solo resuelven por `course_equivalence`. */
const LEGADOS: Record<string, number> = { "4901": 71 };

const mapa = (tabla: Record<string, number>, codes: string[]) =>
  new Map(codes.filter((c) => c in tabla).map((c) => [c, tabla[c]] as [string, number]));

interface Borrado { studentId: number; curriculumId: number; backingIds: number[] }

/**
 * Service con repositorio y cliente falsos. Mismo armado que
 * el `service.import` de HU31, con dos agregados: los cinco
 * métodos nuevos de la Tarea 5 (para poder afirmar que NO se llaman) y el
 * registro de cada lista de códigos que se consulta contra la malla, que es lo
 * que distingue la consulta de la fase de progreso de la de la limpieza.
 */
const armar = (opciones: {
  record?: string;
  borradas?: number;
  directos?: Record<string, number>;
  legados?: Record<string, number>;
} = {}) => {
  const recordHtml = opciones.record ?? record;
  const borrados: Borrado[] = [];
  const codigosConsultados: string[][] = [];
  const niveles: number[] = [];
  let coberturas = 0;

  const repository = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => CODE_EN_FIXTURE,
    findStudent: async () => ({
      id: 7, userId: 3, careerId: 1, curriculumId: 1, currentLevel: null,
      careerName: "INGENIERÍA INDUSTRIAL",
    }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({
      id: 2, code: "2026-2", created: true, datesDefaulted: false,
      startDate: "2026-08-24", endDate: "2026-12-14",
    }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) => {
      codigosConsultados.push([...codes]);
      return mapa(opciones.directos ?? DIRECTOS, codes);
    },
    findEquivalentCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      mapa(opciones.legados ?? LEGADOS, codes),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => items.length,
    deleteImpedimentAlert: async () => 0,
    // Ciclo 1 completo y ciclo 2 a medias → levelFromCoverage da 2.
    findCycleCoverage: async () => {
      coberturas++;
      return [{ cycle: 1, total: 2, approved: 2 }, { cycle: 2, total: 2, approved: 1 }];
    },
    updateStudentLevel: async (_tx: unknown, _sid: number, level: number) => { niveles.push(level); },
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    // Escrituras del récord (Tarea 5). Inertes acá: lo que se mide es la
    // limpieza, pero tienen que existir porque con consentimiento se llaman.
    lockAcademicRecord: async () => {},
    replaceRecordEntries: async () => 0,
    upsertAcademicSnapshot: async () => {},
    replacePeriodSummaries: async () => 0,
    deleteUnbackedElectives: async (
      _tx: unknown, studentId: number, curriculumId: number, backingIds: number[],
    ) => {
      borrados.push({ studentId, curriculumId, backingIds: [...backingIds] });
      return opciones.borradas ?? 0;
    },
  } as unknown as PortalSyncRepository;

  const client = {
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record: recordHtml }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as PortalClient;

  return {
    service: new PortalSyncService(repository, client),
    borrados, codigosConsultados, niveles, coberturas: () => coberturas,
  };
};

/** Líneas que llegaron a `console.warn`, ya unidas en un solo string. */
const lineasDe = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls.map((c) => c.map((x) => String(x)).join(" "));

const ordenados = (ids: number[]) => [...ids].sort((a, b) => a - b);

describe("limpieza de electivos en la importacion (RS-BE-23)", () => {
  test("el respaldo lleva los ids de TODAS las filas del record", async () => {
    const a = armar();
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(1);
    expect(a.borrados[0]!.studentId).toBe(7);
    expect(a.borrados[0]!.curriculumId).toBe(1);
    // 61 y 62 vienen de las aprobadas, 63 y 64 de las filas EN CURSO del ciclo
    // 2026-2 (sin nota) y 71 del código legado 4901, que solo resuelve por
    // equivalencia. Ninguna fila queda fuera del respaldo.
    expect(ordenados(a.borrados[0]!.backingIds)).toEqual([61, 62, 63, 64, 71]);
    expect(r.summary.progressRemoved).toBe(0);   // el doble dice que borró 0
  });

  test("el respaldo no reutiliza la resolucion de la fase de progreso", async () => {
    // 4901 llega con la marca "CONV": la fase de progreso lo descarta por no
    // tener nota numérica, pero la limpieza SÍ tiene que resolverlo. Si se
    // reutilizara `ccIdPorCodigo`/`ccIdPorLegado`, su electivo quedaría sin
    // respaldo y esta misma importación lo borraría.
    const a = armar({ record: RECORD_CON_MARCA });
    await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.codigosConsultados).toHaveLength(2);
    expect(a.codigosConsultados[0]).toEqual(["659001", "659002", "659003", "659004"]);
    expect(a.codigosConsultados[1]).toEqual(["659001", "4901", "659002", "659003", "659004"]);
    expect(a.borrados).toHaveLength(1);
    expect(a.borrados[0]!.backingIds).toContain(71);
  });

  test("un codigo aprobado sin resolver bloquea la limpieza y va al log", async () => {
    const a = armar({ record: RECORD_CON_DESCONOCIDO });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.borrados).toHaveLength(0);
      expect(r.summary.progressRemoved).toBe(0);
      expect(r.warnings.some((w) => w.code === "PROGRESS_REMOVED")).toBe(false);
      expect(lineasDe(warn).some((l) =>
        l.includes("[portal-sync] limpieza de electivos omitida: códigos aprobados sin resolver:")
        && l.includes("700001"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  test("un codigo aprobado de SIN_EQUIVALENCIA_CONOCIDA no bloquea la limpieza", async () => {
    expect(SIN_EQUIVALENCIA_CONOCIDA).toContain("6505");
    const a = armar({ record: RECORD_CON_ESTUDIOS_GENERALES, borradas: 1 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(1);
    // 6505 es de Estudios Generales: no bloquea, pero tampoco respalda nada.
    expect(ordenados(a.borrados[0]!.backingIds)).toEqual([61, 63, 64, 71]);
    expect(r.summary.progressRemoved).toBe(1);
  });

  test("con el respaldo vacio NO se llama a deleteUnbackedElectives", async () => {
    // `<> all('{}')` es verdadero para toda fila: sin esta guarda la limpieza
    // borraría TODOS los electivos aprobados del alumno.
    const a = armar({ record: RECORD_TODO_SIN_EQUIVALENCIA, directos: {}, legados: {}, borradas: 9 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(0);
    expect(r.summary.progressRemoved).toBe(0);
  });

  test("sin consent no se consulta ni se borra nada nuevo", async () => {
    const a = armar({ borradas: 3 });
    const r = await a.service.importFromPortal(3, 7, { cookies });
    expect(a.borrados).toHaveLength(0);
    // Una sola consulta de códigos: la de la fase de progreso.
    expect(a.codigosConsultados).toHaveLength(1);
    expect(r.summary.progressRemoved).toBe(0);
    expect(r.warnings.some((w) => w.code === "PROGRESS_REMOVED")).toBe(false);
  });

  test("consent false se comporta igual que no mandarlo", async () => {
    const a = armar({ borradas: 3 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: false });
    expect(a.borrados).toHaveLength(0);
    expect(a.codigosConsultados).toHaveLength(1);
    expect(r.summary.progressRemoved).toBe(0);
  });

  test("con consent pero record no confiable no se consulta ni se borra", async () => {
    const a = armar({ record: RECORD_SIN_PIE, borradas: 3 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.borrados).toHaveLength(0);
      expect(a.codigosConsultados).toHaveLength(1);
      expect(r.summary.progressRemoved).toBe(0);
      expect(lineasDe(warn).some((l) => l.includes("pie ausente o ilegible"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  test("con 2 filas borradas el summary suma 2 y el warning va en plural", async () => {
    const a = armar({ borradas: 2 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(r.summary.progressRemoved).toBe(2);
    expect(r.warnings).toContainEqual({
      code: "PROGRESS_REMOVED", block: "record",
      message: "Se desmarcaron 2 electivos que tu récord no respalda.",
    });
  });

  test("con 1 fila borrada el warning va en singular", async () => {
    const a = armar({ borradas: 1 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(r.summary.progressRemoved).toBe(1);
    expect(r.warnings).toContainEqual({
      code: "PROGRESS_REMOVED", block: "record",
      message: "Se desmarcó 1 electivo que tu récord no respalda.",
    });
  });

  test("si no se borro nada no hay warning", async () => {
    const a = armar({ borradas: 0 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(1);
    expect(r.summary.progressRemoved).toBe(0);
    expect(r.warnings.some((w) => w.code === "PROGRESS_REMOVED")).toBe(false);
  });

  test("el nivel del alumno se calcula igual con limpieza y sin ella", async () => {
    // `levelNeverGoesDown` no cambia: `findCycleCoverage` filtra con
    // `cc.category <> 'elective'`, así que la cobertura de ciclos no ve nada de
    // lo que la limpieza borra.
    const sin = armar({ borradas: 2 });
    await sin.service.importFromPortal(3, 7, { cookies });
    const con = armar({ borradas: 2 });
    await con.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(sin.coberturas()).toBe(1);
    expect(con.coberturas()).toBe(1);
    expect(sin.niveles).toEqual([2]);
    expect(con.niveles).toEqual([2]);
  });
});

describe("cleanupBlockers", () => {
  const fila = (courseCode: string, grade: number | null): RecordRow => ({
    periodCode: "2024-1", courseCode, courseName: "CURSO DE PRUEBA", attempt: 1,
    credits: 3, grade, sectionCode: "101",
    gradeRaw: grade === null ? null : String(grade), observation: null,
  });

  test("si toda aprobada resolvio, la limpieza puede correr", () => {
    const rows = [fila("659001", 15), fila("659002", 8), fila("659003", null)];
    expect(cleanupBlockers(rows, new Set(["659001"]), [])).toEqual([]);
  });

  test("una aprobada sin resolver bloquea la limpieza", () => {
    const rows = [fila("659001", 15), fila("659002", 11)];
    expect(cleanupBlockers(rows, new Set(["659001"]), [])).toEqual(["659002"]);
  });

  test("las desaprobadas y las filas sin nota nunca bloquean", () => {
    const rows = [fila("659002", 10), fila("659003", null), fila("659004", 0)];
    expect(cleanupBlockers(rows, new Set(), [])).toEqual([]);
  });

  test("los codigos de knownUnmatched no bloquean", () => {
    const rows = [fila("6505", 14), fila("659002", 14)];
    expect(cleanupBlockers(rows, new Set(), SIN_EQUIVALENCIA_CONOCIDA)).toEqual(["659002"]);
  });

  test("un codigo repetido sale una sola vez y en el orden del record", () => {
    const rows = [fila("659009", 12), fila("659008", 20), fila("659009", 14)];
    expect(cleanupBlockers(rows, new Set(), [])).toEqual(["659009", "659008"]);
  });
});

describe("progressRemovedMessage", () => {
  test("1 va en singular", () => {
    expect(progressRemovedMessage(1)).toBe("Se desmarcó 1 electivo que tu récord no respalda.");
  });

  test("mas de 1 va en plural", () => {
    expect(progressRemovedMessage(2)).toBe("Se desmarcaron 2 electivos que tu récord no respalda.");
    expect(progressRemovedMessage(12)).toBe("Se desmarcaron 12 electivos que tu récord no respalda.");
  });
});
