import { describe, expect, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { ProvisionFn, ValidateFn } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import type { ImportSummary } from "../../src/modules/portal-sync/portal-sync.types.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

// Mismos fixtures que test/HU31_jeff/service.import.test.ts: no se duplican
// porque son los mismos HTML del portal, solo que acá el código y el nombre
// de la fila de identidad se sustituyen por los que pida cada test (ver
// `armar`), igual que layout.replaceAll hace con el período en ese archivo.
const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matriculaOriginal = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU31_jeff/fixtures/record.html").text();

// Código y nombre sintéticos que ya trae el fixture (no son de un alumno real).
const CODIGO_FIXTURE = matriculaOriginal.match(/\b(\d{8})\b/)![1];
const NOMBRE_FIXTURE = "JUAN CARLOS PEREZ RAMIREZ";

// Perfil que devuelve el hook de aprovisionamiento: ids DISTINTOS de los que
// usa `armar` para la cuenta ya existente (7/3), para que el test 3 pueda
// comprobar que el import corre con los ids del hook y no con los de siempre.
const PERFIL_APROVISIONADO = {
  id: 77, userId: 55, careerId: 1, curriculumId: 1,
  currentLevel: null as number | null, careerName: "Ingeniería de Sistemas",
};

// Se resetea al inicio de cada `armar()`: el mismo `provisionHook` (una sola
// instancia, a nivel de módulo, tal como lo usan los tests) escribe en el
// log del `armar()` MÁS RECIENTE, así que cada test queda aislado siempre que
// llame a `armar()` antes de usar el hook, que es como los tests lo hacen.
const provisionadoLog: Array<{ studentCode: string; studentName: string }> = [];

const provisionHook: ProvisionFn = async (_tx, identidad) => {
  provisionadoLog.push({ studentCode: identidad.studentCode, studentName: identidad.studentName });
  return PERFIL_APROVISIONADO;
};

function armar(opts: {
  codigoEnLaCuenta?: string;
  codigoEnElPortal?: string;
  fallarEnMatricula?: boolean;
} = {}) {
  const codigoEnElPortal = opts.codigoEnElPortal ?? CODIGO_FIXTURE;
  const codigoEnLaCuenta = opts.codigoEnLaCuenta ?? codigoEnElPortal;

  // El fixture trae un código y un nombre fijos en la fila de identidad; se
  // sustituyen por los que pida el test.
  const matricula = matriculaOriginal
    .replaceAll(CODIGO_FIXTURE, codigoEnElPortal)
    .replace(NOMBRE_FIXTURE, "Garcia Lopez, Maria");

  provisionadoLog.length = 0;
  const matriculas: Array<{ studentId: number }> = [];
  let confirmado = false;

  const client = {
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as PortalClient;

  const repo = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => codigoEnLaCuenta,
    findStudent: async () => (
      { id: 7, userId: 3, careerId: 1, curriculumId: 1, currentLevel: null, careerName: "Ingeniería de Sistemas" }
    ),
    countEnrollmentsInPeriod: async () => 0,
    // Espejo del repo real: confirma SOLO si el callback no lanza. Es lo único
    // que puede distinguir, en este nivel de doble, una transacción que
    // revierte de una que confirma.
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const r = await fn({});
      confirmado = true;
      return r;
    },
    upsertPeriod: async () => (
      { id: 2, code: "2026-2", created: true, datesDefaulted: false, startDate: "2026-08-24", endDate: "2026-12-14" }
    ),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async (_tx: unknown, studentId: number) => {
      matriculas.push({ studentId });
      if (opts.fallarEnMatricula) throw new Error("fallo simulado en upsertEnrollment");
      return { id: 50, created: true };
    },
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.map((c, i) => [c, 60 + i])),
    findEquivalentCurriculumCourseIds: async () => new Map<string, number>(),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => items.length,
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
  } as unknown as PortalSyncRepository;

  return {
    service: new PortalSyncService(repo, client),
    provisionado: provisionadoLog,
    matriculas,
    // Valor en el momento de llamar a `armar()` (siempre `false`, todavía no
    // corrió nada). `estaConfirmado()` lee el mismo cierre DESPUÉS de que la
    // importación terminó, y es la comprobación que de verdad prueba algo.
    confirmado,
    estaConfirmado: () => confirmado,
  };
}

describe("los dos modos de runImport", () => {
  test("SIN hook: si el codigo del portal no es el de la cuenta, 403", async () => {
    const { service } = armar({ codigoEnLaCuenta: "20230001", codigoEnElPortal: "20239999" });
    await expect(service.importFromPortal(3, 7, { cookies: {} as never }))
      .rejects.toMatchObject({ code: "PORTAL_IDENTITY_MISMATCH" });
  });

  test("CON hook: no compara contra ninguna cuenta previa y aprovisiona", async () => {
    const { service, provisionado } = armar({ codigoEnElPortal: "20230001" });
    await service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook);
    expect(provisionado).toEqual([{ studentCode: "20230001", studentName: "Garcia Lopez, Maria" }]);
  });

  test("CON hook: el import usa los ids que devolvio el hook", async () => {
    const { service, matriculas } = armar({ codigoEnElPortal: "20230001" });
    await service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook);
    expect(matriculas.every((m) => m.studentId === 77)).toBe(true);
  });

  test("CON hook: si la importacion falla, la transaccion revierte (RS-BE-18)", async () => {
    const { service, confirmado } = armar({ codigoEnElPortal: "20230001", fallarEnMatricula: true });
    await expect(service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook)).rejects.toThrow();
    expect(confirmado).toBe(false);
  });
});

describe("hook de validacion final antes de cerrar la transaccion (RS-BE-18)", () => {
  test("si `validate` lanza, la transaccion no se confirma y no queda nada escrito", async () => {
    const { service, estaConfirmado } = armar({ codigoEnElPortal: "20230001" });
    let summaryRecibido: ImportSummary | undefined;
    const validate: ValidateFn = (summary) => {
      // Se captura ANTES de lanzar: sirve para comprobar que `validate` ve el
      // summary ya completo, no uno a medio llenar.
      summaryRecibido = summary;
      throw new HttpError(403, "No hay matricula activa en el ciclo.", "NOT_ENROLLED");
    };

    await expect(
      service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook, validate),
    ).rejects.toMatchObject({ code: "NOT_ENROLLED" });

    // El summary ya reflejaba la matrícula escrita DENTRO de la transacción:
    // `validate` corre como último paso, no antes. 5 porque `matricula.html`
    // (mismo fixture que test/HU31_jeff) trae 5 filas de curso — ver
    // test/HU31_jeff/service.import.test.ts:84, que asume lo mismo.
    expect(summaryRecibido?.enrollmentsUpserted).toBe(5);
    // Y sin embargo la transacción nunca confirmó: todo o nada (RS-BE-18).
    expect(estaConfirmado()).toBe(false);
  });
});
