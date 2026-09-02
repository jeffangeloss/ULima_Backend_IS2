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

const silabo = await Bun.file("test/HU31_jeff/fixtures/silabo.json").text();

const fakeClient = (over: Partial<PortalClient> = {}): PortalClient =>
  ({
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record }),
    // Por defecto el portal no publica sílabo para ningún curso: es el caso
    // más común (no todo curso lo publica) y no debe romper nada.
    fetchSyllabus: async () => null,
    // Base del host de sílabos: el service se la pasa al parser para armar la
    // URL que se persiste (misma base con la que se descargó).
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
    ...over,
  }) as unknown as PortalClient;

const fakeRepo = (over: Partial<PortalSyncRepository> = {}): PortalSyncRepository =>
  ({
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
    // OJO: devuelve la MISMA oferta (30) para todos los cursos. Un test que
    // dependa de una oferta por curso — cualquiera que toque sílabos — debe
    // sobreescribir upsertCourse/upsertOffering para que hagan eco del código,
    // o ejercitará sin querer el camino de deduplicación por oferta.
    upsertOffering: async () => ({ id: 30, created: true }),
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    // El progreso se resuelve en lote: una consulta para todos los codigos y
    // una sentencia para todas las filas. El doble le da un id distinto a cada
    // codigo (60, 61, 62...) para que dos cursos no colapsen en la misma clave.
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.map((c, i) => [c, 60 + i])),
    upsertProgressBatch: async (
      _tx: unknown, _sid: number, _cid: number, items: unknown[],
    ) => items.length,
    upsertImpedimentAlert: async () => true,
    // Sin obligatorios: levelFromCoverage devuelve null y no se toca el nivel.
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    ...over,
  }) as unknown as PortalSyncRepository;

describe("PortalSyncService.importFromPortal", () => {
  test("importa y devuelve resumen con el periodo del portal", async () => {
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.period.code).toBe("2026-2");
    expect(r.identity.portalCode).toBe(CODE_EN_FIXTURE);
    expect(r.summary.enrollmentsUpserted).toBe(5);
    expect(r.summary.sessionsUpserted).toBeGreaterThan(0);
  });

  test("no reporta PERIOD_DATES_DEFAULTED si el periodo creado tiene calendario publicado", async () => {
    // El mock por defecto crea "2026-2", que SI tiene calendario publicado
    // (KNOWN_PERIOD_CALENDARS): sus fechas son correctas, no hay nada que avisar.
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.warnings.some((w) => w.code === "PERIOD_DATES_DEFAULTED")).toBe(false);
  });

  test("reporta PERIOD_DATES_DEFAULTED si el periodo creado NO tiene calendario publicado", async () => {
    const repo = fakeRepo({
      upsertPeriod: async () => (
        { id: 2, code: "2027-2", created: true, datesDefaulted: true, startDate: "2027-08-02", endDate: "2027-12-20" }
      ),
    } as never);
    const svc = new PortalSyncService(repo, fakeClient());
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.warnings.some((w) => w.code === "PERIOD_DATES_DEFAULTED")).toBe(true);
  });

  test("no advierte PERIOD_NOT_ACTIVATED_YET cuando el periodo activa normalmente (fecha de inicio ya llegada)", async () => {
    // El fixture trae "2026-2" con calendario publicado (24-ago-2026), ya
    // pasado respecto a la fecha real de ejecucion de los tests: activa sin
    // advertencia.
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.warnings.some((w) => w.code === "PERIOD_NOT_ACTIVATED_YET")).toBe(false);
  });

  test("crea el periodo pero NO lo activa si su fecha de inicio aun no llega, y advierte PERIOD_NOT_ACTIVATED_YET", async () => {
    // Se reescribe el layout para que el ciclo detectado sea uno SIN
    // calendario publicado y muy en el futuro (2099-2, via el mismo cociclo
    // en las dos fuentes que usa parseCicloActivo: RestrictToCategory y el
    // rotulo "CICLO: "): su fecha de inicio aproximada (defaultPeriodDates)
    // cae muy despues de "ahora", asi que aunque el codigo sea mas nuevo que
    // el periodo activo, la guarda de fecha debe impedir la activacion.
    const layoutCicloFuturo = layout.replaceAll("2026-2", "2099-2").replaceAll("20262", "20992");
    const client = fakeClient({ fetchPage: async () => layoutCicloFuturo } as Partial<PortalClient>);

    const activateSeen: boolean[] = [];
    const repo = fakeRepo({
      upsertPeriod: async (_tx, code: string, activate: boolean) => {
        activateSeen.push(activate);
        return { id: 99, code, created: true, datesDefaulted: true, startDate: "2099-08-03", endDate: "2099-12-20" };
      },
    } as never);

    const svc = new PortalSyncService(repo, client);
    const r = await svc.importFromPortal(3, 7, { cookies });

    expect(activateSeen).toEqual([false]);
    expect(r.period.code).toBe("2099-2");
    expect(r.warnings.some((w) => w.code === "PERIOD_NOT_ACTIVATED_YET")).toBe(true);
  });

  test("403 si el codigo del portal no es el del alumno autenticado", async () => {
    const svc = new PortalSyncService(fakeRepo({ findUserCode: async () => "99999999" }), fakeClient());
    await expect(svc.importFromPortal(3, 7, { cookies })).rejects.toMatchObject({
      statusCode: 403, code: "PORTAL_IDENTITY_MISMATCH",
    });
  });

  test("422 si el consolidado no es parseable (identidad no verificable)", async () => {
    const client = fakeClient({
      fetchAll: async () => ({ matricula: "<html>vacio</html>", record }),
    } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo(), client);
    await expect(svc.importFromPortal(3, 7, { cookies })).rejects.toMatchObject({
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
    await svc.importFromPortal(3, 7, { cookies }).catch(() => {});
    expect(tx).toBe(0);
  });

  test("advierte cuando el retiro se omite para no bloquear el login", async () => {
    const svc = new PortalSyncService(fakeRepo({ withdrawMissingEnrollments: async () => -1 }), fakeClient());
    const r = await svc.importFromPortal(3, 7, { cookies });
    expect(r.warnings.some((w) => w.code === "WITHDRAW_SKIPPED_WOULD_LOCK_OUT")).toBe(true);
    expect(r.summary.enrollmentsWithdrawn).toBe(0);
  });

  test("cierra la sesion del portal siempre, incluso si la importacion falla", async () => {
    let logouts = 0;
    const client = fakeClient({ logout: async () => { logouts++; } } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo({ findUserCode: async () => "99999999" }), client);
    await svc.importFromPortal(3, 7, { cookies }).catch(() => {});
    expect(logouts).toBe(1);
  });

  test("findActivePeriod se lee antes de abrir la transaccion, no adentro", async () => {
    // Antes, findActivePeriod se llamaba con this.repository DENTRO del
    // callback de runInTransaction: corria sobre el pool, no sobre tx, y leia
    // una foto tomada fuera de la transaccion. Dos alumnos importando al
    // inicio de ciclo podian leer ambos "sin activo" y ambos decidir
    // activate=true, violando el indice unico de periodo activo en el
    // segundo insert. Se verifica que ahora se lee y termina ANTES de que
    // runInTransaction siquiera empiece.
    const calls: string[] = [];
    const repo = fakeRepo({
      findActivePeriod: async () => { calls.push("findActivePeriod"); return { id: 1, code: "2026-1" }; },
      runInTransaction: (async (fn: (t: unknown) => Promise<unknown>) => {
        calls.push("runInTransaction:start");
        return fn({});
      }) as never,
    });
    const svc = new PortalSyncService(repo, fakeClient());
    await svc.importFromPortal(3, 7, { cookies });

    expect(calls).toEqual(["findActivePeriod", "runInTransaction:start"]);
  });

  test("la decision de activar el periodo usa el snapshot leido antes de la transaccion", async () => {
    // El fixture trae el ciclo "2026-2". Si el periodo activo leido ANTES de
    // la transaccion ya es mas nuevo ("2026-3"), periodCodeIsNewer debe dar
    // false y esa es la bandera que debe llegarle a upsertPeriod: prueba que
    // la decision se toma con el valor leido afuera, no con una lectura
    // nueva de adentro.
    const activateSeen: boolean[] = [];
    const repo = fakeRepo({
      findActivePeriod: async () => ({ id: 9, code: "2026-3" }),
      upsertPeriod: async (_tx, _code, activate: boolean) => {
        activateSeen.push(activate);
        return {
          id: 2, code: "2026-2", created: true, datesDefaulted: false, startDate: "2026-08-24", endDate: "2026-12-14",
        };
      },
    } as never);
    const svc = new PortalSyncService(repo, fakeClient());
    await svc.importFromPortal(3, 7, { cookies });

    expect(activateSeen).toEqual([false]);
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
      fetchAll: async () => ({ matricula: matriculaConDosSecciones, record }),
    } as Partial<PortalClient>);

    const svc = new PortalSyncService(repo, client);
    await svc.importFromPortal(3, 7, { cookies });

    // Sanity: el fixture editado en verdad generó dos secciones para 650033.
    expect(idsFor650033).toHaveLength(2);
    for (const id of idsFor650033) expect(keptSectionIds).toContain(id);
  });

  test("el nivel sale de la cobertura por ciclo: el pendiente mas bajo sobre el ultimo completo", async () => {
    // Ciclos 1..5 completos, el 6 a medias: el nivel es 6.
    const updates: Array<{ studentId: number; level: number }> = [];
    const repo = fakeRepo({
      findCycleCoverage: async () => [
        { cycle: 1, total: 6, approved: 6 }, { cycle: 2, total: 6, approved: 6 },
        { cycle: 3, total: 6, approved: 6 }, { cycle: 4, total: 6, approved: 6 },
        { cycle: 5, total: 6, approved: 6 }, { cycle: 6, total: 6, approved: 2 },
      ],
      updateStudentLevel: async (_tx, studentId: number, level: number) => {
        updates.push({ studentId, level });
      },
    } as never);
    const svc = new PortalSyncService(repo, fakeClient());
    await svc.importFromPortal(3, 7, { cookies });

    expect(updates).toEqual([{ studentId: 7, level: 6 }]);
  });

  test("no escribe el nivel cuando ya aprobo todos los obligatorios", async () => {
    let updateCalls = 0;
    const repo = fakeRepo({
      findCycleCoverage: async () => [{ cycle: 1, total: 4, approved: 4 }],
      updateStudentLevel: async () => { updateCalls++; },
    });
    const svc = new PortalSyncService(repo, fakeClient());
    await svc.importFromPortal(3, 7, { cookies });

    expect(updateCalls).toBe(0);
  });
});

describe("PortalSyncService.importFromPortal — sílabos", () => {
  test("cuenta en el resumen un sílabo por cada curso que el portal devuelve", async () => {
    // El fakeRepo por defecto hace eco de un mismo id (30) de oferta para
    // TODOS los cursos (no distingue por curso); acá se necesita una oferta
    // DISTINTA por curso para comprobar que se cuenta uno por curso y no un
    // único upsert que se deduplica de más.
    const repo = fakeRepo({
      upsertCourse: async (_tx, code: string) => ({ id: Number(code), created: true }),
      upsertOffering: async (_tx, _periodId, courseId: number) => ({ id: courseId, created: true }),
    } as never);
    const client = fakeClient({ fetchSyllabus: async () => silabo } as Partial<PortalClient>);
    const svc = new PortalSyncService(repo, client);
    const r = await svc.importFromPortal(3, 7, { cookies });

    // El fixture de matrícula trae 5 cursos distintos (650033, 650035,
    // 650067, 650070, 650084): con el portal devolviendo sílabo para todos,
    // el resumen debe contar los 5.
    expect(r.summary.syllabiUpserted).toBe(5);
    expect(r.warnings.some((w) => w.code === "SYLLABUS_UNAVAILABLE")).toBe(false);
  });

  test("SYLLABUS_UNAVAILABLE si el portal no publica sílabo para ningún curso (caso por defecto)", async () => {
    const svc = new PortalSyncService(fakeRepo(), fakeClient());
    const r = await svc.importFromPortal(3, 7, { cookies });

    expect(r.summary.syllabiUpserted).toBe(0);
    expect(r.warnings.some((w) => w.code === "SYLLABUS_UNAVAILABLE")).toBe(true);
  });

  test("un curso sin sílabo es normal: sílabo parcial no advierte, solo cuenta lo que llegó", async () => {
    const client = fakeClient({
      fetchSyllabus: async (_cociclo: string, courseCode: string) => (courseCode === "650033" ? silabo : null),
    } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo(), client);
    const r = await svc.importFromPortal(3, 7, { cookies });

    expect(r.summary.syllabiUpserted).toBe(1);
    // Ni SYLLABUS_UNAVAILABLE (al menos un curso trajo sílabo) ni ninguna
    // advertencia por cada uno de los 4 cursos que no trajeron.
    expect(r.warnings.filter((w) => w.code === "SYLLABUS_UNAVAILABLE")).toHaveLength(0);
  });

  test("no advierte SYLLABUS_UNAVAILABLE si hubo sílabos aunque no se escribiera NINGUNA fila", async () => {
    // Todas las ofertas ya tenían sílabo (filas sembradas): el `do nothing` no
    // escribe nada y syllabiUpserted queda en 0, pero el portal SÍ los
    // devolvió. La advertencia no puede salir del contador.
    const repo = fakeRepo({ upsertSyllabus: async () => null } as never);
    const client = fakeClient({ fetchSyllabus: async () => silabo } as Partial<PortalClient>);
    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(r.summary.syllabiUpserted).toBe(0);
    expect(r.warnings.some((w) => w.code === "SYLLABUS_UNAVAILABLE")).toBe(false);
  });

  test("el mensaje de SYLLABUS_UNAVAILABLE no afirma que el portal no publicó nada", async () => {
    // El mismo warning se emite con cactus caído, con la sesión de Domino
    // muerta y con todas las peticiones expiradas: desde el backend no se
    // distinguen. Afirmar la causa manda a soporte a descartar un problema de
    // infraestructura como "la Universidad no publicó nada".
    const r = await new PortalSyncService(fakeRepo(), fakeClient()).importFromPortal(3, 7, { cookies });
    const w = r.warnings.find((x) => x.code === "SYLLABUS_UNAVAILABLE");

    expect(w).toBeDefined();
    expect(w?.message).toBe("No se pudo obtener el sílabo de ningún curso de este ciclo.");
    expect(w?.message).not.toContain("publicó");
  });

  test("un fallo al buscar el sílabo (excepción de red) NUNCA aborta la importación", async () => {
    const client = fakeClient({
      fetchSyllabus: async () => { throw new Error("cactus.ulima.edu.pe no respondió"); },
    } as Partial<PortalClient>);
    const svc = new PortalSyncService(fakeRepo(), client);

    const r = await svc.importFromPortal(3, 7, { cookies });

    // El resto de la importación (identidad, matrícula) sigue intacto.
    expect(r.period.code).toBe("2026-2");
    expect(r.summary.enrollmentsUpserted).toBe(5);
    expect(r.summary.syllabiUpserted).toBe(0);
    expect(r.warnings.some((w) => w.code === "SYLLABUS_UNAVAILABLE")).toBe(true);
  });

  test("syllabiUpserted cuenta filas escritas: una oferta que ya tenía sílabo no suma", async () => {
    // Con `on conflict do nothing` la escritura puede no escribir nada (fila
    // sembrada con enlace de Drive, o importación anterior): el repository
    // devuelve null y ese curso NO debe contarse como sílabo guardado.
    const repo = fakeRepo({
      upsertCourse: async (_tx, code: string) => ({ id: Number(code), created: true }),
      upsertOffering: async (_tx, _periodId, courseId: number) => ({ id: courseId, created: true }),
      upsertSyllabus: async (_tx, offeringId: number) => (offeringId === 650033 ? null : { id: 1, created: true }),
    } as never);
    const client = fakeClient({ fetchSyllabus: async () => silabo } as Partial<PortalClient>);
    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    // 5 cursos distintos en el fixture; 650033 ya tenía fila.
    expect(r.summary.syllabiUpserted).toBe(4);
  });

  test("la URL persistida se arma con la base del cliente que descargó, no con la global", async () => {
    // El parser leía `config.syllabus.baseUrl`: un cliente construido con otra
    // base descargaba de un host y persistía la URL de otro.
    const urls: string[] = [];
    const repo = fakeRepo({
      upsertCourse: async (_tx, code: string) => ({ id: Number(code), created: true }),
      upsertOffering: async (_tx, _periodId, courseId: number) => ({ id: courseId, created: true }),
      upsertSyllabus: async (_tx, _offeringId: number, entry: { url: string }) => {
        urls.push(entry.url);
        return { id: 1, created: true };
      },
    } as never);
    const client = fakeClient({
      fetchSyllabus: async () => silabo,
      syllabusBaseUrl: "https://cactus-replica.ulima.edu.pe",
    } as unknown as Partial<PortalClient>);

    await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(urls).not.toHaveLength(0);
    for (const u of urls) expect(u.startsWith("https://cactus-replica.ulima.edu.pe/ac/")).toBe(true);
  });

  test("dos secciones del mismo curso comparten oferta: el sílabo se upsertea UNA sola vez", async () => {
    const row0 = matricula.match(/<tr class=cursosMatRow id=cMatrow0>[\s\S]*?<\/tr>/)?.[0];
    if (!row0) throw new Error("fixture sin cMatrow0");
    const dupRow = row0.replace("id=cMatrow0", "id=cMatrowDup").replace("952", "953");
    const matriculaConDosSecciones = matricula.replace(row0, row0 + "\n" + dupRow);

    const upsertSyllabusCalls: number[] = [];
    const repo = fakeRepo({
      upsertCourse: async (_tx, code: string) => ({ id: Number(code), created: true }),
      upsertOffering: async (_tx, _periodId, courseId: number) => ({ id: courseId, created: true }),
      upsertSyllabus: async (_tx, offeringId: number) => {
        upsertSyllabusCalls.push(offeringId);
        return { id: 1, created: true };
      },
    } as never);
    const client = fakeClient({
      fetchAll: async () => ({ matricula: matriculaConDosSecciones, record }),
      fetchSyllabus: async () => silabo,
    } as Partial<PortalClient>);

    const svc = new PortalSyncService(repo, client);
    const r = await svc.importFromPortal(3, 7, { cookies });

    // 650033 aparece dos veces (dos secciones) pero es UNA sola oferta.
    expect(upsertSyllabusCalls.filter((id) => id === 650033)).toHaveLength(1);
    expect(r.summary.syllabiUpserted).toBe(5);
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
