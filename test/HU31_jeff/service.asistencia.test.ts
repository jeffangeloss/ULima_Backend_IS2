import { describe, expect, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";

/**
 * RS-BE-15 · el cableado: que la asistencia descargada llegue de verdad a
 * `enrollment`, con el enrollment_id correcto, y que un fallo del portal NO
 * escriba nada ni aborte la importación.
 */

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU31_jeff/fixtures/record.html").text();
const sidebarAsis = await Bun.file("test/HU31_jeff/fixtures/asistencia-sidebar.html").text();
const curso508 = await Bun.file("test/HU31_jeff/fixtures/asistencia-curso-154508.html").text();

const CODE = matricula.match(/\b(\d{8})\b/)![1];   // el que declara el fixture de matrícula

/** El (curso, sección) que declara cada aula del sidebar de asistencia. */
const PAR_POR_AULA: Record<string, { curso: string; sec: string }> = {
  "154508": { curso: "650033", sec: "952" },
  "154516": { curso: "650035", sec: "958" },
  "154604": { curso: "650067", sec: "952" },
  "154607": { curso: "650070", sec: "654" },
  "154621": { curso: "650084", sec: "1051" },
};

/**
 * Página de asistencia de cualquier aula, derivada del fixture real de 154508.
 * Las horas llevan el aula adentro para que, si dos peticiones concurrentes se
 * cruzaran, el test lo note en vez de ver números idénticos.
 */
const asistenciaDe = (aula: string): string => {
  const { curso, sec } = PAR_POR_AULA[aula];
  return curso508
    .replaceAll("154508", aula)
    // el parser exige que la página declare al alumno autenticado
    .replace(/(name="prm_sCoUserAlum"[^>]*value=")[^"]*/i, `$1${CODE}`)
    .replace(/(name="prm_sCoCurs"[^>]*value=")[^"]*/i, `$1${curso}`)
    .replace(/(name="prm_sCoSecc"[^>]*value=")[^"]*/i, `$1${sec}`);
};

/** Asigna un id de sección estable y único por (oferta, código). */
const seccionIds = new Map<string, number>();
const idSeccion = (off: number, code: string): number => {
  const k = `${off}|${code}`;
  if (!seccionIds.has(k)) seccionIds.set(k, seccionIds.size + 1);
  return seccionIds.get(k)!;
};

const RUTA = "av/servlets/ComandoListarAsistenciaAulaVirtualAlumno?prm_sNuAula=";

const fakeClient = (asisFalla = false): PortalClient =>
  ({
    fetchPage: async (path: string) => {
      if (path === PORTAL_PATHS.layout) return layout;
      if (path === PORTAL_PATHS.cursosAsistencia) {
        if (asisFalla) throw new Error("portal caído");
        return sidebarAsis;
      }
      if (path === PORTAL_PATHS.cursosDelegado) return "<html></html>";
      if (path.startsWith(RUTA)) return asistenciaDe(path.slice(RUTA.length));
      return "<html></html>";
    },
    fetchAll: async () => ({ matricula, record }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  }) as unknown as PortalClient;

/** Repo mínimo. `upsertEnrollment` devuelve un id distinto por sección para
 *  poder afirmar que cada asistencia se escribió en SU matrícula. */
const fakeRepo = (escrituras: { id: number; h: unknown }[], over: Partial<PortalSyncRepository> = {}) =>
  ({
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => CODE,
    findStudent: async () => ({ id: 7, userId: 3, careerId: 1, curriculumId: 1, currentLevel: null, careerName: "INGENIERÍA DE SISTEMAS" }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({ id: 2, code: "2026-2", created: true, datesDefaulted: false, startDate: "2026-08-24", endDate: "2026-12-14" }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async (_tx: unknown, code: string) => ({ id: Number(code), created: true, weeklyHours: null }),
    upsertOffering: async (_tx: unknown, _p: number, courseId: number) => ({ id: courseId, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    // Id único por (oferta, código): dos cursos distintos pueden tener secciones
    // con el MISMO código (952 aparece en 650033 y en 650067), así que derivar
    // el id solo del código las fusionaría.
    upsertSection: async (_tx: unknown, off: number, code: string) => ({ id: idSeccion(off, code), created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async (_tx: unknown, _sid: number, sectionId: number) => ({ id: 5000 + sectionId, created: true }),
    updateAttendanceHours: async (_tx: unknown, id: number, h: unknown) => { escrituras.push({ id, h }); return true; },
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _c: number, codes: string[]) => new Map(codes.map((c, i) => [c, 60 + i])),
    findEquivalentCurriculumCourseIds: async () => new Map(),
    upsertProgressBatch: async (_tx: unknown, _s: number, _c: number, items: unknown[]) => items.length,
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    ...over,
  }) as unknown as PortalSyncRepository;

const importar = async (repo: PortalSyncRepository, client: PortalClient) =>
  new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies: {} as never });

describe("la asistencia llega a enrollment", () => {
  test("escribe las horas de cada curso en SU matrícula", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), fakeClient());

    expect(escrituras.length).toBeGreaterThan(0);
    expect(res.summary.attendanceUpdated).toBe(escrituras.length);
    // El fixture publica 64 programadas / 8 asistidas / 0 de falta.
    expect(escrituras[0].h).toEqual({ total: "64.00", attended: "8.00", absent: "0.00" });
  });

  test("cada escritura va a un enrollment_id distinto", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    await importar(fakeRepo(escrituras), fakeClient());
    expect(new Set(escrituras.map((e) => e.id)).size).toBe(escrituras.length);
  });
});

describe("degradación: un fallo de asistencia no rompe nada", () => {
  test("si el panel se cae, la importación sigue y NO escribe horas", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), fakeClient(true));

    expect(escrituras).toHaveLength(0);
    expect(res.summary.attendanceUpdated).toBe(0);
    // Nunca escribir 0 por ausencia: dejaría al alumno en `sin_datos` y
    // borraría un impedido legítimo.
    expect(res.summary.enrollmentsUpserted).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.code === "ASISTENCIA_UNAVAILABLE")).toBe(true);
  });

  test("si el UPDATE no toca ninguna fila, se cuenta como omitida", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const repo = fakeRepo(escrituras, {
      updateAttendanceHours: async () => false,
    } as Partial<PortalSyncRepository>);
    const res = await importar(repo, fakeClient());

    expect(res.summary.attendanceUpdated).toBe(0);
    expect(res.summary.attendanceSkipped).toBeGreaterThan(0);
  });
});

// ── RS-BE-48 · el menú de lista ──────────────────────────────────────────────
// El menú nuevo no trae el código del curso. Las aulas inventadas 900101 a
// 900105 se identifican por su página de asistencia, que declara los mismos
// pares del fixture de matrícula, así que cada una tiene matrícula que escribir.
const PAR_LISTA: Record<string, { curso: string; sec: string }> = {
  "900101": { curso: "650033", sec: "952" },
  "900102": { curso: "650035", sec: "958" },
  "900103": { curso: "650067", sec: "952" },
  "900104": { curso: "650070", sec: "654" },
  "900105": { curso: "650084", sec: "1051" },
};
Object.assign(PAR_POR_AULA, PAR_LISTA);
const AULAS_LISTA = Object.keys(PAR_LISTA);

/** Menú de lista armado a mano, con la estructura de `menu-lista-asistencia.html`. */
const menuLista = (secciones: Record<string, string> = {}): string =>
  `<html><body><ul class="asignaturas">\n${AULAS_LISTA.map((aula) =>
    `<li class="curso">CARRERA ING.SI. / CURSO INVENTADO / ${secciones[aula] ?? PAR_LISTA[aula]!.sec}</li>\n`
    + `&nbsp;&nbsp;&nbsp;- <a href="javascript:OpenAsistenciaAlumno('${aula}');">Asistencia</a><br><br>\n`).join("")}`
  + "</ul></body></html>";

/** Portal con el menú de lista. `pagina` permite cambiar la respuesta de un aula. */
const clienteLista = (
  opciones: { secciones?: Record<string, string>; pagina?: (aula: string) => string } = {},
): PortalClient =>
  ({
    fetchPage: async (path: string) => {
      if (path === PORTAL_PATHS.layout) return layout;
      if (path === PORTAL_PATHS.cursosAsistencia) return menuLista(opciones.secciones);
      if (path === PORTAL_PATHS.cursosDelegado) return "<html></html>";
      if (path.startsWith(RUTA)) {
        const aula = path.slice(RUTA.length);
        return opciones.pagina ? opciones.pagina(aula) : asistenciaDe(aula);
      }
      return "<html></html>";
    },
    fetchAll: async () => ({ matricula, record }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  }) as unknown as PortalClient;

const avisosDeAsistencia = (res: { warnings: Array<{ code: string; block: string; message: string }> }) =>
  res.warnings.filter((w) => w.block === "asistencia");
const sinNull = (res: { warnings: Array<{ message: string }> }) =>
  expect(res.warnings.map((w) => w.message).join(" | ")).not.toContain("null");

describe("RS-BE-48 · la asistencia con el menú de lista", () => {
  test("escribe las cinco matrículas, identificadas por su página de asistencia", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), clienteLista());

    expect(escrituras).toHaveLength(5);
    expect(new Set(escrituras.map((e) => e.id)).size).toBe(5);
    expect(res.summary.attendanceUpdated).toBe(5);
    expect(avisosDeAsistencia(res)).toEqual([]);
  });

  test("la sección del menú distinta de la de la página no escribe asistencia y avisa con el aula", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), clienteLista({ secciones: { "900102": "959" } }));

    expect(escrituras).toHaveLength(4);
    expect(res.summary.attendanceUpdated).toBe(4);
    expect(avisosDeAsistencia(res)).toEqual([{
      code: "PARSER_FAILED", block: "asistencia",
      message: "La sección del menú no coincide con la de la página de asistencia del aula 900102.",
    }]);
  });

  test("una sección null en el menú no contrasta y la matrícula se escribe", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), clienteLista({ secciones: { "900102": "SIN SECCION" } }));

    expect(escrituras).toHaveLength(5);
    expect(avisosDeAsistencia(res)).toEqual([]);
  });

  test("un aula cuya página no se descarga avisa con el aula y nunca con null", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), clienteLista({
      pagina: (aula) => { if (aula === "900103") throw new Error("ETIMEDOUT"); return asistenciaDe(aula); },
    }));

    expect(escrituras).toHaveLength(4);
    expect(avisosDeAsistencia(res)).toEqual([{
      code: "ASISTENCIA_UNAVAILABLE", block: "asistencia",
      message: "No se pudo traer la asistencia del aula 900103.",
    }]);
    sinNull(res);
  });

  test("un aula cuya página no se identifica avisa con el aula y el motivo", async () => {
    const login = "<html><body><form action='j_security_check'><input name='j_username'></form></body></html>";
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), clienteLista({
      pagina: (aula) => (aula === "900104" ? login : asistenciaDe(aula)),
    }));

    expect(escrituras).toHaveLength(4);
    expect(avisosDeAsistencia(res)).toEqual([{
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia del aula 900104: la respuesta no es una página de asistencia",
    }]);
    sinNull(res);
  });

  test("una página que se identifica y falla en los totales avisa con su curso", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const res = await importar(fakeRepo(escrituras), clienteLista({
      pagina: (aula) => {
        const html = asistenciaDe(aula);
        return aula === "900105" ? html.replace(/Total horas programadas/, "Total horas dictadas") : html;
      },
    }));

    expect(escrituras).toHaveLength(4);
    expect(avisosDeAsistencia(res)).toEqual([{
      code: "PARSER_FAILED", block: "asistencia",
      message: "No se entendió la asistencia de 650084/1051: faltan los totales de asistencia (2 de 3)",
    }]);
  });
});

describe("RS-BE-48 · el contraste de sección rige también con arreglos", () => {
  test("una página que declara otra sección que la del arreglo no se escribe", async () => {
    const escrituras: { id: number; h: unknown }[] = [];
    const cliente = fakeClient();
    const base = cliente.fetchPage.bind(cliente);
    (cliente as unknown as { fetchPage: (p: string) => Promise<string> }).fetchPage = async (path: string) => {
      const html = await base(path, {} as never);
      return path === `${RUTA}154516`
        ? html.replace(/(name="prm_sCoSecc"[^>]*value=")[^"]*/i, "$1959")
        : html;
    };
    const res = await importar(fakeRepo(escrituras), cliente);

    expect(escrituras).toHaveLength(4);
    expect(avisosDeAsistencia(res)).toEqual([{
      code: "PARSER_FAILED", block: "asistencia",
      message: "La sección del menú no coincide con la de la página de asistencia del aula 154516.",
    }]);
  });
});
