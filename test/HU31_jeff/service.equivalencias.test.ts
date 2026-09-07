import { describe, expect, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";

/**
 * Segundo intento de emparejamiento del récord contra la malla vigente.
 *
 * La malla cambió al plan 2026-1 y el récord es histórico: 26 de los 53 cursos
 * aprobados del récord real de 20235218 no calzan por código. `course_equivalence`
 * los recupera, pero al hacerlo abre una puerta que el match directo solo no
 * tenía: dos filas del récord pueden caer en el MISMO `curriculum_course`. Eso
 * importa porque `upsertProgressBatch` lleva `distinct on (curriculum_course_id)`
 * SIN `order by` — dos filas con la misma clave darían un ganador arbitrario.
 * Por eso la mitad de estas pruebas son sobre el desempate.
 */
const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();
const cookies = { JSESSIONID: "a", LtpaToken2: "b" };
const CODE_EN_FIXTURE = matricula.match(/\b(\d{8})\b/)![1];

/** Récord sintético: acá el detalle que importa es qué código trae cada fila y
 *  con qué nota, no el HTML del portal (eso lo cubre `parsers.record.test.ts`). */
const recordCon = (filas: Array<{ code: string; nota: string }>) => `<table>${filas
  .map((f, i) => `<tr><td>${i === 0 ? "2023-1" : "&nbsp;"}</td><td>${f.code}</td>`
    + `<td>CURSO ${i}</td><td>V</td><td>SIS</td><td>1</td><td>3</td>`
    + `<td>${f.nota}</td><td>100${i}</td><td></td><td></td><td></td></tr>`)
  .join("")}</table>`;

const fakeClient = (record: string): PortalClient =>
  ({
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  }) as unknown as PortalClient;

type Escrito = { curriculumCourseId: number; status: string };

/** Devuelve el service ya armado más los espías de los dos intentos. */
const armar = (opciones: {
  record: Array<{ code: string; nota: string }>;
  directo?: Record<string, number>;
  equivalencias?: Record<string, number>;
}) => {
  const escritos: Escrito[] = [];
  const legadosConsultados: string[][] = [];

  const repo = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => CODE_EN_FIXTURE,
    findStudent: async () => ({ id: 7, userId: 3, careerId: 1, curriculumId: 1, currentLevel: null, careerName: "INGENIERÍA DE SISTEMAS" }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => (
      { id: 2, code: "2026-2", created: true, datesDefaulted: false, startDate: "2026-08-24", endDate: "2026-12-14" }
    ),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},   // RS-BE-9 paso 8.b
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.filter((c) => opciones.directo?.[c]).map((c) => [c, opciones.directo![c]!])),
    findEquivalentCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) => {
      legadosConsultados.push([...codes]);
      return new Map(codes.filter((c) => opciones.equivalencias?.[c]).map((c) => [c, opciones.equivalencias![c]!]));
    },
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: Escrito[]) => {
      escritos.push(...items);
      return items.length;
    },
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
  } as unknown as PortalSyncRepository;

  return {
    svc: new PortalSyncService(repo, fakeClient(recordCon(opciones.record))),
    escritos,
    legadosConsultados,
  };
};

describe("segundo intento por equivalencia", () => {
  test("recupera un curso cuyo código ya no existe en la malla vigente", async () => {
    const { svc, escritos } = armar({
      record: [{ code: "650003", nota: "16" }],
      directo: {},
      equivalencias: { "650003": 100 },
    });
    await svc.importFromPortal(3, 7, { cookies });
    expect(escritos).toEqual([{ curriculumCourseId: 100, status: "approved" }]);
  });

  test("al segundo intento solo van los códigos que el directo NO resolvió", async () => {
    const { svc, legadosConsultados } = armar({
      record: [{ code: "650055", nota: "16" }, { code: "650003", nota: "16" }],
      directo: { "650055": 11 },
      equivalencias: { "650003": 100 },
    });
    await svc.importFromPortal(3, 7, { cookies });
    expect(legadosConsultados).toEqual([["650003"]]);
  });

  test("si el directo resolvió todo, no se consulta la tabla de equivalencias", async () => {
    // El viaje de más ocurriría DENTRO de la transacción de la importación, que
    // es justo lo que el lote del paso 10 existe para no hacer.
    const { svc, legadosConsultados } = armar({
      record: [{ code: "650055", nota: "16" }],
      directo: { "650055": 11 },
    });
    await svc.importFromPortal(3, 7, { cookies });
    expect(legadosConsultados).toEqual([]);
  });
});

describe("desempate cuando dos filas del récord caen en el mismo curso", () => {
  test("el match directo gana sobre el de equivalencia", async () => {
    // Peor nota en el directo a propósito: si ganara "el mejor estado" saldría
    // approved. Debe salir failed, que es lo que dice el código VIGENTE.
    const { svc, escritos } = armar({
      record: [{ code: "650055", nota: "05" }, { code: "650003", nota: "18" }],
      directo: { "650055": 100 },
      equivalencias: { "650003": 100 },
    });
    await svc.importFromPortal(3, 7, { cookies });
    expect(escritos).toEqual([{ curriculumCourseId: 100, status: "failed" }]);
  });

  test("entre dos códigos legados fusionados en un mismo curso gana el mejor estado", async () => {
    // Aprobar la mitad de un curso fusionado no se pierde porque la otra mitad
    // esté desaprobada.
    const { svc, escritos } = armar({
      record: [{ code: "650003", nota: "05" }, { code: "1459", nota: "18" }],
      equivalencias: { "650003": 100, "1459": 100 },
    });
    await svc.importFromPortal(3, 7, { cookies });
    expect(escritos).toEqual([{ curriculumCourseId: 100, status: "approved" }]);
  });

  test("nunca manda dos filas con el mismo curriculum_course_id", async () => {
    // `upsertProgressBatch` desempata con `distinct on` SIN `order by`: dos
    // filas con la misma clave darían un ganador arbitrario.
    const { svc, escritos } = armar({
      record: [{ code: "650003", nota: "16" }, { code: "1459", nota: "14" }, { code: "5644", nota: "12" }],
      equivalencias: { "650003": 100, "1459": 100, "5644": 100 },
    });
    await svc.importFromPortal(3, 7, { cookies });
    expect(escritos).toHaveLength(1);
  });
});

describe("conteo y advertencia", () => {
  test("lo recuperado por equivalencia NO cuenta como omitido", async () => {
    const { svc } = armar({
      record: [{ code: "650003", nota: "16" }, { code: "1459", nota: "18" }],
      equivalencias: { "650003": 100, "1459": 101 },
    });
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.summary.progressSkipped).toBe(0);
    expect(r.warnings.some((w) => w.code === "PROGRESS_SKIPPED")).toBe(false);
  });

  test("cuenta aparte cuántos cursos entraron por equivalencia", async () => {
    const { svc } = armar({
      record: [{ code: "650055", nota: "16" }, { code: "650003", nota: "16" }, { code: "1459", nota: "18" }],
      directo: { "650055": 11 },
      equivalencias: { "650003": 100, "1459": 101 },
    });
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.summary.progressViaEquivalence).toBe(2);
  });

  test("lo que no resuelve por código NI por equivalencia sigue omitido", async () => {
    // Los 12 de Estudios Generales están en este caso hasta que llegue la tabla
    // oficial 2026-1 ↔ 2025-1.
    const { svc } = armar({
      record: [{ code: "650003", nota: "16" }, { code: "6505", nota: "12" }],
      equivalencias: { "650003": 100 },
    });
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.summary.progressSkipped).toBe(1);
    expect(r.summary.progressViaEquivalence).toBe(1);
    expect(r.warnings.some((w) => w.code === "PROGRESS_SKIPPED")).toBe(true);
  });
});
