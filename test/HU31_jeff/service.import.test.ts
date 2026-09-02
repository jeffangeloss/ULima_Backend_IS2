import { describe, expect, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU31_jeff/fixtures/record.html").text();
const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

// Código de alumno que trae el fixture anonimizado.
const CODE_EN_FIXTURE = matricula.match(/\b(\d{8})\b/)![1];

const fakeClient = (over: Partial<PortalClient> = {}): PortalClient =>
  ({
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record, datosPersonales: "<html></html>" }),
    logout: async () => {},
    ...over,
  }) as unknown as PortalClient;

const fakeRepo = (over: Partial<PortalSyncRepository> = {}): PortalSyncRepository =>
  ({
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => CODE_EN_FIXTURE,
    findStudent: async () => ({ id: 7, userId: 3, careerId: 1, curriculumId: 1, careerName: "INGENIERÍA DE SISTEMAS" }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({ id: 2, code: "2026-2", created: true, datesDefaulted: true, startDate: "2026-08-01" }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseId: async () => 60,
    upsertProgress: async () => {},
    upsertImpedimentAlert: async () => true,
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    ...over,
  }) as unknown as PortalSyncRepository;

describe("PortalSyncService.importFromPortal", () => {
  test("importa y devuelve resumen con el periodo del portal", async () => {
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    const r = await svc.importFromPortal(3, 7, cookies);
    expect(r.period.code).toBe("2026-2");
    expect(r.identity.portalCode).toBe(CODE_EN_FIXTURE);
    expect(r.summary.enrollmentsUpserted).toBe(5);
    expect(r.summary.sessionsUpserted).toBeGreaterThan(0);
  });

  test("403 si el codigo del portal no es el del alumno autenticado", async () => {
    const svc = new PortalSyncService(fakeRepo({ findUserCode: async () => "99999999" }), fakeClient());
    await expect(svc.importFromPortal(3, 7, cookies)).rejects.toMatchObject({
      statusCode: 403, code: "PORTAL_IDENTITY_MISMATCH",
    });
  });

  test("422 si el consolidado no es parseable (identidad no verificable)", async () => {
    const client = fakeClient({
      fetchAll: async () => ({ matricula: "<html>vacio</html>", record, datosPersonales: "" }),
    } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo(), client);
    await expect(svc.importFromPortal(3, 7, cookies)).rejects.toMatchObject({
      statusCode: 422, code: "PORTAL_IDENTITY_UNVERIFIABLE",
    });
  });

  test("no escribe nada cuando la identidad falla", async () => {
    let tx = 0;
    const repo = fakeRepo({
      findUserCode: async () => "99999999",
      runInTransaction: (async (fn: (t: unknown) => Promise<unknown>) => { tx++; return fn({}); }) as never,
    });
    const svc = new PortalSyncService(repo, fakeClient());
    await svc.importFromPortal(3, 7, cookies).catch(() => {});
    expect(tx).toBe(0);
  });

  test("advierte cuando el retiro se omite para no bloquear el login", async () => {
    const svc = new PortalSyncService(fakeRepo({ withdrawMissingEnrollments: async () => -1 }), fakeClient());
    const r = await svc.importFromPortal(3, 7, cookies);
    expect(r.warnings.some((w) => w.code === "WITHDRAW_SKIPPED_WOULD_LOCK_OUT")).toBe(true);
    expect(r.summary.enrollmentsWithdrawn).toBe(0);
  });

  test("cierra la sesion del portal siempre, incluso si la importacion falla", async () => {
    let logouts = 0;
    const client = fakeClient({ logout: async () => { logouts++; } } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo({ findUserCode: async () => "99999999" }), client);
    await svc.importFromPortal(3, 7, cookies).catch(() => {});
    expect(logouts).toBe(1);
  });

  test("dos filas del consolidado con el mismo curso y distinta seccion (GR.) llegan AMBAS al keep del retiro", async () => {
    // sectionIdByCourse es un Map por courseCode: si el retiro usara sus .values()
    // perdería una de las dos secciones y la retiraría por error en la misma
    // transacción que la creó. keepSectionIds no debe colapsar por curso.
    const row0 = matricula.match(/<tr class=cursosMatRow id=cMatrow0>[\s\S]*?<\/tr>/)?.[0];
    if (!row0) throw new Error("fixture sin cMatrow0");
    const dupRow = row0.replace("id=cMatrow0", "id=cMatrowDup").replace("952", "953");
    const matriculaConDosSecciones = matricula.replace(row0, row0 + "\n" + dupRow);

    // upsertCourse/upsertOffering hacen eco del código de curso como id, para
    // poder distinguir en upsertSection las DOS secciones de 650033 de una
    // sección de otro curso que por casualidad comparta el mismo código de
    // sección literal ("952" se repite en el fixture para otro curso).
    let keptSectionIds: number[] = [];
    let sectionCallCounter = 0;
    const idsFor650033: number[] = [];
    const repo = fakeRepo({
      upsertCourse: async (_tx, code: string) => ({ id: Number(code), created: true }),
      upsertOffering: async (_tx, _periodId, courseId: number) => ({ id: courseId, created: true }),
      upsertSection: async (_tx, offeringId: number) => {
        const id = 1000 + (sectionCallCounter += 1);
        if (offeringId === 650033) idsFor650033.push(id);
        return { id, created: true };
      },
      withdrawMissingEnrollments: async (_tx, _studentId, _periodId, keep: number[]) => {
        keptSectionIds = keep;
        return 0;
      },
    } as never);
    const client = fakeClient({
      fetchAll: async () => ({ matricula: matriculaConDosSecciones, record, datosPersonales: "<html></html>" }),
    } as Partial<PortalClient>);

    const svc = new PortalSyncService(repo, client);
    await svc.importFromPortal(3, 7, cookies);

    // Sanity: el fixture editado en verdad generó dos secciones para 650033.
    expect(idsFor650033).toHaveLength(2);
    for (const id of idsFor650033) expect(keptSectionIds).toContain(id);
  });
});

describe("PortalSyncService.getStatus", () => {
  test("needsImport true cuando no hay matricula en el periodo activo", async () => {
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    expect(await svc.getStatus(7)).toEqual({
      activePeriod: { id: 1, code: "2026-1" }, enrollmentsInActivePeriod: 0, needsImport: true,
    });
  });

  test("needsImport false cuando ya tiene matricula", async () => {
    const svc = new PortalSyncService(fakeRepo({ countEnrollmentsInPeriod: async () => 5 }), fakeClient());
    expect((await svc.getStatus(7)).needsImport).toBe(false);
  });

  test("needsImport true cuando no hay periodo activo", async () => {
    const svc = new PortalSyncService(fakeRepo({ findActivePeriod: async () => null }), fakeClient());
    const s = await svc.getStatus(7);
    expect(s.activePeriod).toBeNull();
    expect(s.needsImport).toBe(true);
  });
});
