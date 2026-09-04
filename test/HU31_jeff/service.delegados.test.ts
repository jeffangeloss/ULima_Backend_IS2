import { describe, expect, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import { PORTAL_PATHS } from "../../src/services/portal.client.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import type { DelegadosNomina } from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * La FASE de delegados de `portal-sync.service.ts`, de punta a punta y con
 * dobles: sidebar -> nóminas en paralelo -> claims dentro de la transacción ->
 * promoción -> token re-firmado.
 *
 * Los parsers tienen su propio archivo (`parsers.delegado.test.ts`) y el SQL el
 * suyo (`repository.claim.test.ts`); acá se mide lo que solo se ve armando la
 * importación entera: qué se le pasa al repositorio, qué se degrada a warning y
 * qué NO puede romperse cuando el portal falla.
 */

const layout = await Bun.file("test/HU31_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU31_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU31_jeff/fixtures/record.html").text();
const sidebar = await Bun.file("test/HU31_jeff/fixtures/delegado-sidebar.html").text();
const nomina154508 = await Bun.file("test/HU31_jeff/fixtures/delegado-nomina-154508.html").text();
const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

// Código de alumno que trae el fixture anonimizado.
const CODE_EN_FIXTURE = matricula.match(/\b(\d{8})\b/)![1];

/** Las 5 aulas del sidebar del fixture, con el par (curso, sección) que cada
 *  una declara. Las 5 empatan, cadena contra cadena, con las 5 filas del
 *  consolidado de matrícula: es el 5/5 medido contra el portal real. */
const PAR_POR_AULA: Record<string, { courseCode: string; sectionCode: string }> = {
  "154508": { courseCode: "650033", sectionCode: "952" },
  "154516": { courseCode: "650035", sectionCode: "958" },
  "154604": { courseCode: "650067", sectionCode: "952" },
  "154607": { courseCode: "650070", sectionCode: "654" },
  "154621": { courseCode: "650084", sectionCode: "1051" },
};
const AULAS = Object.keys(PAR_POR_AULA);

/**
 * Nómina de cualquier aula, derivada del fixture real de 154508 (40 alumnos,
 * delegado en la fila 29 y subdelegado en la 26).
 *
 * Los códigos de los dos marcados se reescriben con el número de aula adentro,
 * a propósito: si dos peticiones en paralelo se cruzaran y la nómina de un aula
 * terminara escrita en la sección de otra, con códigos idénticos el test no
 * notaría nada. Así el claim de cada sección solo puede provenir de SU aula.
 */
const nominaDe = (aula: string): string =>
  nomina154508
    .replaceAll("154508", aula)
    .replaceAll("20200029", `2029${aula}`)
    .replaceAll("20200026", `2026${aula}`);

const codigoDelegado = (aula: string) => `2029${aula}`;
const codigoSubdelegado = (aula: string) => `2026${aula}`;

/** Prefijo de la ruta de nómina, para reconocer el aula que el service pide. */
const RUTA_NOMINA = "av/servlets/ComandoListarAulaDelegadoAulaVirtual?prm_sNuAula=";
const aulaDeRuta = (path: string): string | null =>
  path.startsWith(RUTA_NOMINA) ? path.slice(RUTA_NOMINA.length) : null;

/** El portal, resumido a las 3 páginas que la importación pide con `fetchPage`:
 *  layout, sidebar de delegados y una nómina por aula. Una ruta no prevista
 *  revienta en vez de devolver el layout: un doble que responde cualquier cosa
 *  a cualquier ruta haría pasar tests que en producción piden otra página. */
const paginaPortal = (path: string): string => {
  if (path === PORTAL_PATHS.layout) return layout;
  if (path === PORTAL_PATHS.cursosDelegado) return sidebar;
  const aula = aulaDeRuta(path);
  if (aula) return nominaDe(aula);
  throw new Error(`ruta no prevista por el doble: ${path}`);
};

const fakeClient = (over: Partial<PortalClient> = {}): PortalClient =>
  ({
    fetchPage: async (path: string) => paginaPortal(path),
    fetchAll: async () => ({ matricula, record }),
    fetchSyllabus: async () => null,
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
    upsertOffering: async () => ({ id: 30, created: true }),
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
      new Map(codes.map((c, i) => [c, 60 + i])),
    upsertProgressBatch: async (
      _tx: unknown, _sid: number, _cid: number, items: unknown[],
    ) => items.length,
    upsertImpedimentAlert: async () => true,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    ...over,
  }) as unknown as PortalSyncRepository;

interface Captura {
  /** Todo lo que el service le manda escribir al repositorio como claim. */
  claims: Array<{ sectionId: number; delegados: DelegadosNomina; observedAt: Date }>;
  /** Las secciones que la importación creó, para poder decir a qué par
   *  (curso, sección) corresponde cada `section_id`. */
  secciones: Array<{ id: number; offeringId: number; sectionCode: string }>;
  promociones: Array<{ sectionId: number; enrollmentId: number; studentCode: string }>;
  /** Rol con el que se re-firmó el JWT (RS-18). */
  reissues: Array<{ userId: number; role: string }>;
  /** Cuántas veces se releyó el cargo vigente después de la transacción. */
  relecturas: number;
  /** Traza de orden: peticiones de red y apertura de la transacción. */
  orden: string[];
}

/**
 * Repositorio con los ids distinguibles por sección. El doble base devuelve la
 * MISMA oferta (30) y la MISMA sección (40) para todos los cursos: con eso no
 * se puede afirmar que cada claim fue a su propia sección, que es justo lo que
 * RS-12 exige. Acá la oferta hace eco del código de curso y cada sección recibe
 * un id propio.
 */
const conCapturas = (over: Partial<PortalSyncRepository> = {}) => {
  const cap: Captura = {
    claims: [], secciones: [], promociones: [], reissues: [], relecturas: 0, orden: [],
  };
  const repo = fakeRepo({
    upsertCourse: async (_tx: unknown, code: string) => ({ id: Number(code), created: true }),
    upsertOffering: async (_tx: unknown, _p: number, courseId: number) => ({ id: courseId, created: true }),
    upsertSection: async (_tx: unknown, offeringId: number, sectionCode: string) => {
      const id = 1000 + cap.secciones.length;
      cap.secciones.push({ id, offeringId, sectionCode });
      return { id, created: true };
    },
    // Un enrollment propio por sección: RS-13 exige que la promoción use el id
    // que devolvió ESTE upsertEnrollment, no uno cualquiera.
    upsertEnrollment: async () => ({ id: 500 + cap.secciones.length, created: true }),
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      cap.orden.push("tx:inicio");
      return fn({});
    },
    upsertRepresentativeClaims: async (
      _tx: unknown, sectionId: number, delegados: DelegadosNomina, observedAt: Date,
    ) => {
      cap.claims.push({ sectionId, delegados, observedAt });
      return {
        upserted: (delegados.delegate ? 1 : 0) + (delegados.subdelegate ? 1 : 0),
        deleted: 0,
      };
    },
    promoteClaimIfAny: async (
      _tx: unknown, sectionId: number, enrollmentId: number, studentCode: string,
    ) => {
      cap.promociones.push({ sectionId, enrollmentId, studentCode });
      return null;
    },
    findActiveRepresentativePosition: async () => { cap.relecturas++; return null; },
    ...over,
  } as never);
  return { repo, cap };
};

/** Doble de auth: solo re-firma. Es el TERCER argumento del service y es
 *  opcional a propósito (sin él, `token` sale null). */
const fakeAuth = (cap: Captura, token: string | null = "tok") => ({
  reissueToken: async (userId: number, role: "delegate" | "subdelegate") => {
    cap.reissues.push({ userId, role });
    return token;
  },
});

/** El id que la importación le dio a la sección de ese par del portal. */
const seccionDe = (cap: Captura, aula: string): number => {
  const par = PAR_POR_AULA[aula]!;
  const s = cap.secciones.find(
    (x) => x.offeringId === Number(par.courseCode) && x.sectionCode === par.sectionCode,
  );
  if (!s) throw new Error(`la importación no creó sección para el aula ${aula}`);
  return s.id;
};

const claimDe = (cap: Captura, aula: string) =>
  cap.claims.find((c) => c.sectionId === seccionDe(cap, aula));

const delegadoWarnings = (warnings: Array<{ code: string; block: string; message: string }>) =>
  warnings.filter((w) => w.block === "delegado");

describe("PortalSyncService — fase de delegados, camino feliz", () => {
  test("pide una nómina por aula del sidebar y escribe el claim en la sección de ESA aula", async () => {
    // RS-12: el claim se escribe con el section_id que produjo `upsertSection`
    // de su propia fila de matrícula. Cruzar dos secciones acá significaría
    // publicar como delegado de un curso a quien lo es de otro.
    const rutas: string[] = [];
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => { rutas.push(path); return paginaPortal(path); },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    for (const aula of AULAS) {
      expect(rutas).toContain(PORTAL_PATHS.nominaDelegado(aula));
      const c = claimDe(cap, aula);
      expect(c?.delegados.delegate?.code).toBe(codigoDelegado(aula));
      expect(c?.delegados.subdelegate?.code).toBe(codigoSubdelegado(aula));
    }
    expect(cap.claims).toHaveLength(5);
    expect(delegadoWarnings(r.warnings)).toEqual([]);
  });

  test("summary.claimsUpserted refleja lo que el repositorio dijo haber escrito, no lo intentado", async () => {
    // 5 secciones × 2 cargos = 10. El contador suma el retorno del repositorio:
    // con el upsert condicionado de RS-16 una escritura puede no escribir nada
    // (observación más vieja) y eso NO debe contarse.
    const { repo } = conCapturas();
    const r = await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });
    expect(r.summary.claimsUpserted).toBe(10);

    const { repo: repoMudo } = conCapturas({
      upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 3 }),
    } as never);
    const r2 = await new PortalSyncService(repoMudo, fakeClient()).importFromPortal(3, 7, { cookies });
    expect(r2.summary.claimsUpserted).toBe(0);
    expect(r2.summary.claimsDeleted).toBe(15);
  });

  test("el nombre completo llega al claim, no solo el código", async () => {
    // Sin nombre la app mostraría un número hasta que esa persona se registre:
    // el "Día 2" del escenario de la spec depende de que el nombre se guarde.
    const { repo, cap } = conCapturas();
    await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });
    expect(claimDe(cap, "154508")?.delegados.delegate?.fullName).toBe("ROJAS RAMIREZ LUCIA BEATRIZ");
    expect(claimDe(cap, "154508")?.delegados.subdelegate?.fullName).toBe("FLORES RAMIREZ JORGE ENRIQUE");
  });

  test("RS-10: las nóminas se descargan y parsean ANTES de abrir la transacción", async () => {
    // Mantener la conexión de BD abierta mientras se esperan N peticiones al
    // portal es lo que convierte una fase secundaria en un riesgo para la
    // importación entera.
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        const aula = aulaDeRuta(path);
        if (aula) cap.orden.push(`nomina:${aula}`);
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    const inicioTx = cap.orden.indexOf("tx:inicio");
    expect(inicioTx).toBeGreaterThan(-1);
    expect(cap.orden.filter((x) => x.startsWith("nomina:"))).toHaveLength(5);
    for (const [i, evento] of cap.orden.entries()) {
      if (evento.startsWith("nomina:")) expect(i).toBeLessThan(inicioTx);
    }
  });

  test("RS-9: las 5 nóminas se piden en paralelo, no una detrás de otra", async () => {
    // Secuencial, el presupuesto de tiempo del import (medido en 40-47 s contra
    // un corte de cliente a los 90 s) no aguanta N+1 peticiones más.
    const traza: string[] = [];
    const { repo } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        const aula = aulaDeRuta(path);
        if (!aula) return paginaPortal(path);
        traza.push(`pide:${aula}`);
        await new Promise((r) => setTimeout(r, 5));
        traza.push(`llega:${aula}`);
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    // En paralelo las 5 salen antes de que llegue la primera; en serie la traza
    // sería pide/llega intercalados.
    expect(traza.slice(0, 5).every((x) => x.startsWith("pide:"))).toBe(true);
  });
});

describe("PortalSyncService — lo que se le pasa al repositorio", () => {
  test("RS-16: observed_at es el instante de la RESPUESTA, no el de la escritura", async () => {
    // Entre observar y escribir pasan segundos: la descarga es fuera de la
    // transacción. Ese instante es el que decide qué observación gana entre dos
    // alumnos importando la misma sección, así que fijarlo en el INSERT
    // (o con defaultNow()) dejaría persistida la observación más vieja.
    let escrituraEn = 0;
    const { repo, cap } = conCapturas({
      runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        await new Promise((r) => setTimeout(r, 30));
        return fn({});
      },
      upsertRepresentativeClaims: async (
        _tx: unknown, sectionId: number, delegados: DelegadosNomina, observedAt: Date,
      ) => {
        escrituraEn = Date.now();
        cap.claims.push({ sectionId, delegados, observedAt });
        return { upserted: 2, deleted: 0 };
      },
    } as never);

    await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });

    for (const c of cap.claims) {
      expect(c.observedAt).toBeInstanceOf(Date);
      expect(escrituraEn - c.observedAt.getTime()).toBeGreaterThanOrEqual(25);
    }
  });

  test("RS-5a: una sección sin cargos marcados TAMBIÉN se le pasa al repositorio", async () => {
    // Cero casillas es una sección que revocó o que aún no elige, y el portal
    // es la fuente de verdad: el repositorio necesita esa llamada para borrar
    // el claim viejo. Si el service se saltara la escritura por "no hay nada
    // que escribir", un delegado revocado se quedaría publicado para siempre.
    const sinCargos = await Bun.file("test/HU31_jeff/fixtures/delegado-nomina-sin-cargos.html").text();
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (aulaDeRuta(path) === "154516" ? sinCargos : paginaPortal(path)),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    const c = claimDe(cap, "154516");
    expect(c).toBeDefined();
    expect(c?.delegados.delegate).toBeUndefined();
    expect(c?.delegados.subdelegate).toBeUndefined();
    expect(delegadoWarnings(r.warnings)).toEqual([]);   // no es un error
    expect(r.summary.claimsUpserted).toBe(8);           // las otras 4 secciones
  });

  test("RS-6a: un cargo descartado se avisa y el descarte viaja al repositorio junto al otro cargo", async () => {
    // El descarte NO es una revocación: el repositorio lo necesita marcado para
    // no borrar un claim bueno de una importación anterior por un problema de
    // formato del portal.
    const sinNombre = nominaDe("154621")
      .replace(/name="prm_sNoCmpUser_29" value="[^"]*"/, 'name="prm_sNoCmpUser_29" value=""');
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (aulaDeRuta(path) === "154621" ? sinNombre : paginaPortal(path)),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    const c = claimDe(cap, "154621")!;
    expect(c.delegados.delegate).toBeUndefined();
    expect(c.delegados.subdelegate?.code).toBe(codigoSubdelegado("154621"));
    expect(c.delegados.warnings?.map((w) => w.position)).toEqual(["delegate"]);
    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("PARSER_FAILED");
    expect(w[0]!.message).toContain("650084");
    expect(r.summary.claimsUpserted).toBe(9);
  });
});

describe("PortalSyncService — RS-21: de la nómina solo se persisten los 2 marcados", () => {
  test("de 40 alumnos bajados, al repositorio solo llegan el delegado y el subdelegado", async () => {
    // Se leen las 40 filas porque no hay otra forma de saber quiénes son los 2
    // marcados, pero lo que cruza hacia la BD son 2 personas. Esta es la
    // afirmación de privacidad de la feature entera: si un día el service
    // empezara a pasar la nómina completa, el claim dejaría de ser "los dos
    // representantes" y pasaría a ser el padrón del salón.
    const { repo, cap } = conCapturas();
    await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });

    const html = nominaDe("154508");
    const codigos = [...html.matchAll(/name="prm_sCoUser_\d+" value="([^"]*)"/g)].map((m) => m[1]!);
    const nombres = [...html.matchAll(/name="prm_sNoCmpUser_\d+" value="([^"]*)"/g)].map((m) => m[1]!);
    expect(codigos).toHaveLength(40);   // el fixture de verdad trae 40 filas

    const c = claimDe(cap, "154508")!;
    expect(Object.keys(c.delegados).sort()).toEqual(["delegate", "subdelegate"]);

    const escrito = JSON.stringify(cap.claims);
    for (const codigo of codigos) {
      const esMarcado = codigo === codigoDelegado("154508") || codigo === codigoSubdelegado("154508");
      expect(escrito.includes(codigo)).toBe(esMarcado);
    }
    for (const nombre of nombres) {
      const esMarcado = nombre === "ROJAS RAMIREZ LUCIA BEATRIZ" || nombre === "FLORES RAMIREZ JORGE ENRIQUE";
      expect(escrito.includes(nombre)).toBe(esMarcado);
    }
  });
});

describe("PortalSyncService — RS-17: la fase degrada por aula, nunca por importación", () => {
  test("una nómina que no se puede descargar no arrastra a las otras cuatro", async () => {
    // El punto entero de la feature: `Promise.all` rechazando al primer fallo
    // descartaría los delegados de las 5 secciones por una sola nómina caída.
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        if (aulaDeRuta(path) === "154516") {
          throw new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");
        }
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(4);
    expect(cap.claims.map((c) => c.sectionId)).not.toContain(seccionDe(cap, "154516"));
    for (const aula of AULAS.filter((a) => a !== "154516")) {
      expect(claimDe(cap, aula)?.delegados.delegate?.code).toBe(codigoDelegado(aula));
    }
    expect(r.summary.claimsUpserted).toBe(8);

    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("DELEGADOS_UNAVAILABLE");
    // El mensaje identifica curso y sección: sin eso el alumno ve "algo falló".
    expect(w[0]!.message).toContain("650035");
    expect(w[0]!.message).toContain("958");
  });

  test("el 409 de sesión inválida de una nómina NO aborta la importación: notas, horario y matrícula se escriben igual", async () => {
    // Excepción explícita a la regla de portal-sync (sesión inválida aborta):
    // los delegados son secundarios y no pueden borrar el resto.
    const { repo } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        if (aulaDeRuta(path) === "154516") {
          throw new HttpError(409, "La sesión de miUlima no es válida o expiró.", "PORTAL_SESSION_INVALID");
        }
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(r.period.code).toBe("2026-2");
    expect(r.identity.portalCode).toBe(CODE_EN_FIXTURE);
    expect(r.summary.enrollmentsUpserted).toBe(5);      // matrícula
    expect(r.summary.sessionsUpserted).toBeGreaterThan(0);   // horario
    expect(r.summary.progressUpserted).toBeGreaterThan(0);   // notas del récord
  });

  test("un parseo ok:false de un aula sale como PARSER_FAILED y no toca a las demás", async () => {
    // Este portal devuelve la página de login con HTTP 200: la descarga
    // "funciona" y lo que falla es el parseo. Los dos casos se distinguen a
    // propósito — DELEGADOS_UNAVAILABLE no dice nada del portal, PARSER_FAILED sí.
    const login = "<html><head><title>miUlima</title></head><body>"
      + "<form name=\"loginForm\"><input type=\"text\" name=\"j_username\"></form></body></html>";
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (aulaDeRuta(path) === "154604" ? login : paginaPortal(path)),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(4);
    expect(cap.claims.map((c) => c.sectionId)).not.toContain(seccionDe(cap, "154604"));
    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("PARSER_FAILED");
    expect(w[0]!.message).toContain("650067");
    expect(r.summary.enrollmentsUpserted).toBe(5);
  });

  test("una nómina que llega con el aula equivocada se descarta: no se escribe en la sección de otro curso", async () => {
    // RS-6: con 5 peticiones en paralelo, dos respuestas cruzadas escribirían
    // los delegados de una sección dentro de otra. Se pide 154607 y responde
    // la nómina de 154508: el parser lo detecta y ese aula queda sin claim.
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (
        aulaDeRuta(path) === "154607" ? nominaDe("154508") : paginaPortal(path)
      ),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(4);
    expect(claimDe(cap, "154607")).toBeUndefined();
    // Y el delegado de 154508 sigue estando solo en SU sección.
    const conCodigo508 = cap.claims.filter((c) => c.delegados.delegate?.code === codigoDelegado("154508"));
    expect(conCodigo508.map((c) => c.sectionId)).toEqual([seccionDe(cap, "154508")]);
    expect(delegadoWarnings(r.warnings)[0]!.code).toBe("PARSER_FAILED");
  });

  test("si TODAS las nóminas fallan, la importación igual termina bien y sale un warning por aula", async () => {
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        if (aulaDeRuta(path)) throw new Error("ETIMEDOUT");
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(0);
    expect(r.summary.claimsUpserted).toBe(0);
    expect(r.summary.enrollmentsUpserted).toBe(5);
    expect(r.warnings.filter((w) => w.code === "DELEGADOS_UNAVAILABLE")).toHaveLength(5);
  });

  // Falla hoy: con las 5 descargas caídas el service emite, ADEMÁS de los 5
  // DELEGADOS_UNAVAILABLE, el warning de RS-11 ("ninguna aula empató con tu
  // matrícula"). Ese warning se calcula sobre las nóminas que sobrevivieron a
  // la descarga y no sobre las aulas que el sidebar declaró, así que afirma una
  // causa falsa —un cambio en el portal— cuando lo que hubo fue una caída de
  // red. Es el mismo error de diagnóstico que el propio módulo se prohíbe en el
  // mensaje de SYLLABUS_UNAVAILABLE.
  test("con todas las descargas caídas NO se acusa además un desempate con la matrícula", async () => {
    const { repo } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        if (aulaDeRuta(path)) throw new Error("ETIMEDOUT");
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(delegadoWarnings(r.warnings).map((w) => w.code)).toEqual(
      ["DELEGADOS_UNAVAILABLE", "DELEGADOS_UNAVAILABLE", "DELEGADOS_UNAVAILABLE",
        "DELEGADOS_UNAVAILABLE", "DELEGADOS_UNAVAILABLE"],
    );
  });
});

describe("PortalSyncService — la fase entera se puede omitir sin consecuencias", () => {
  test("si el sidebar de delegados no responde, se omite la fase y la importación termina bien", async () => {
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        if (path === PORTAL_PATHS.cursosDelegado) throw new Error("ECONNRESET");
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(0);
    expect(r.period.code).toBe("2026-2");
    expect(r.summary.enrollmentsUpserted).toBe(5);
    expect(r.summary.sessionsUpserted).toBeGreaterThan(0);
    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("DELEGADOS_UNAVAILABLE");
  });

  test("si el sidebar llega pero no es el sidebar (login con HTTP 200), se omite la fase con warning", async () => {
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (
        path === PORTAL_PATHS.cursosDelegado
          ? "<html><body><form name=\"loginForm\"></form></body></html>"
          : paginaPortal(path)
      ),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(0);
    expect(r.summary.enrollmentsUpserted).toBe(5);
    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(1);
    expect(w[0]!.code).toBe("PARSER_FAILED");
  });

  test("los mensajes de los warnings de delegados NUNCA llevan fragmentos del HTML del portal", async () => {
    // Los warnings viajan al cliente Flutter y quedan en logs de soporte: un
    // pedazo del HTML del portal ahí es filtrar la nómina —nombres y códigos de
    // terceros— por la puerta de atrás, además de ruido ilegible.
    const paginaConMarcado = "<html><head><title>Aula Delegado 999999</title></head><body>"
      + "<table><tr><td><input type=\"TEXT\" name=\"prm_sCoUser_1\" value=\"20200001\">"
      + "<input type=\"TEXT\" name=\"prm_sNoCmpUser_1\" value=\"PEREZ RAMIREZ JUAN CARLOS\"></td></tr></table>"
      + "<script>OpenDelegado('999999');</script></body></html>";
    const { repo } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => {
        const aula = aulaDeRuta(path);
        if (aula === "154508") return paginaConMarcado;                 // aula equivocada
        if (aula === "154516") return "<html><body>vacío</body></html>";  // sin filas de alumno
        if (aula === "154604") throw new Error("<html>500 Internal Server Error</html>");
        return paginaPortal(path);
      },
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(3);
    for (const { message } of w) {
      expect(message).not.toContain("<");
      expect(message).not.toContain(">");
      expect(message).not.toContain("prm_s");
      expect(message).not.toContain("script");
      expect(message).not.toContain("20200001");
      expect(message).not.toContain("PEREZ RAMIREZ");
    }
  });
});

describe("PortalSyncService — RS-11: el empate es por el par (curso, sección)", () => {
  test("un aula del sidebar que no está en la matrícula se ignora en silencio", async () => {
    // Ignorar quiere decir ignorar: no crea sección, no crea oferta, no escribe
    // claim y tampoco molesta al alumno con una advertencia. Un curso retirado
    // que sigue apareciendo en el panel del portal es un caso normal.
    const sidebarConIntrusa = sidebar.replace('aCurs[0]="650033"', 'aCurs[0]="659999"');
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (
        path === PORTAL_PATHS.cursosDelegado ? sidebarConIntrusa : paginaPortal(path)
      ),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(4);
    expect(claimDe(cap, "154508")).toBeUndefined();
    expect(cap.secciones).toHaveLength(5);   // las 5 de la matrícula, ni una más
    expect(delegadoWarnings(r.warnings)).toEqual([]);
  });

  test("si NINGUNA aula empata, sale un warning: el portal cambió", async () => {
    const sidebarSinEmpate = sidebar.replace(/aCurs\[(\d+)\]="\d+"/g, 'aCurs[$1]="659999"');
    const { repo, cap } = conCapturas();
    const client = fakeClient({
      fetchPage: async (path: string) => (
        path === PORTAL_PATHS.cursosDelegado ? sidebarSinEmpate : paginaPortal(path)
      ),
    } as Partial<PortalClient>);

    const r = await new PortalSyncService(repo, client).importFromPortal(3, 7, { cookies });

    expect(cap.claims).toHaveLength(0);
    expect(r.summary.claimsUpserted).toBe(0);
    const w = delegadoWarnings(r.warnings);
    expect(w).toHaveLength(1);
    expect(w[0]!.message).toContain("matrícula");
    // Y la importación no se resiente: es un aviso, no un fallo.
    expect(r.summary.enrollmentsUpserted).toBe(5);
  });

  test("el mismo código de sección en dos cursos distintos no cruza claims", async () => {
    // En la muestra real 650033 y 650067 comparten la sección "952": empatar
    // solo por sectionCode escribiría la nómina de uno en el otro.
    const { repo, cap } = conCapturas();
    await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });

    expect(claimDe(cap, "154508")?.delegados.delegate?.code).toBe(codigoDelegado("154508"));
    expect(claimDe(cap, "154604")?.delegados.delegate?.code).toBe(codigoDelegado("154604"));
    expect(seccionDe(cap, "154508")).not.toBe(seccionDe(cap, "154604"));
  });
});

describe("PortalSyncService — RS-13 y RS-18: promoción y token re-firmado", () => {
  test("promoteClaimIfAny recibe la sección, SU enrollment y el código del alumno autenticado", async () => {
    // RS-13: el empate es contra `app_user.code`, y el enrollment es el que
    // acaba de devolver `upsertEnrollment` para esa misma sección.
    const { repo, cap } = conCapturas();
    await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });

    expect(cap.promociones).toHaveLength(5);
    for (const p of cap.promociones) expect(p.studentCode).toBe(CODE_EN_FIXTURE);
    // Cada sección con su propio enrollment: 1000+n ↔ 500+n+1 en el doble.
    expect(new Set(cap.promociones.map((p) => p.enrollmentId)).size).toBe(5);
  });

  test("una promoción sube el contador y devuelve token nuevo", async () => {
    const { repo, cap } = conCapturas({
      promoteClaimIfAny: async (_tx: unknown, sectionId: number) => (
        sectionId === 1000 ? "delegate" : null
      ),
      findActiveRepresentativePosition: async () => "delegate",
    } as never);

    const r = await new PortalSyncService(repo, fakeClient(), fakeAuth(cap))
      .importFromPortal(3, 7, { cookies });

    expect(r.summary.representativesPromoted).toBe(1);
    expect(r.token).toBe("tok");
    expect(cap.reissues).toEqual([{ userId: 3, role: "delegate" }]);
  });

  test("sin promoción el token es null y no se re-firma nada", async () => {
    // El campo viaja siempre; `null` es el valor normal. Re-firmar de más
    // gastaría un token nuevo por cada importación de cada alumno.
    const { repo, cap } = conCapturas();
    const r = await new PortalSyncService(repo, fakeClient(), fakeAuth(cap))
      .importFromPortal(3, 7, { cookies });

    expect(r.summary.representativesPromoted).toBe(0);
    expect(r.token).toBeNull();
    expect(cap.reissues).toEqual([]);
    expect(cap.relecturas).toBe(0);
  });

  test("RS-18: el rol del token nuevo sale de la relectura post-transacción, NO del claim promovido", async () => {
    // El caso que justifica la regla: esta importación lo promueve a
    // SUBDELEGADO de una sección, pero en otra sección ya era DELEGADO. Firmar
    // con el cargo recién promovido lo degradaría, quitándole permisos que
    // conserva. La relectura corre con la transacción ya confirmada.
    const { repo, cap } = conCapturas({
      promoteClaimIfAny: async (_tx: unknown, sectionId: number) => (
        sectionId === 1000 ? "subdelegate" : null
      ),
      findActiveRepresentativePosition: async () => "delegate",
    } as never);

    const r = await new PortalSyncService(repo, fakeClient(), fakeAuth(cap))
      .importFromPortal(3, 7, { cookies });

    expect(r.summary.representativesPromoted).toBe(1);
    expect(cap.reissues).toEqual([{ userId: 3, role: "delegate" }]);
    expect(r.token).toBe("tok");
  });

  test("sin doble de auth (dos argumentos) el token es null y no revienta nada", async () => {
    // El tercer argumento es opcional a propósito: la degradación aceptada es
    // que el rol se actualice en el próximo login, nunca una excepción.
    const { repo } = conCapturas({
      promoteClaimIfAny: async (_tx: unknown, sectionId: number) => (
        sectionId === 1000 ? "delegate" : null
      ),
      findActiveRepresentativePosition: async () => "delegate",
    } as never);

    const r = await new PortalSyncService(repo, fakeClient()).importFromPortal(3, 7, { cookies });

    expect(r.summary.representativesPromoted).toBe(1);
    expect(r.token).toBeNull();
    expect(r.summary.enrollmentsUpserted).toBe(5);
  });

  test("promovido pero sin cargo activo al releer: no se firma un token con rol inventado", async () => {
    const { repo, cap } = conCapturas({
      promoteClaimIfAny: async (_tx: unknown, sectionId: number) => (
        sectionId === 1000 ? "delegate" : null
      ),
      findActiveRepresentativePosition: async () => null,
    } as never);

    const r = await new PortalSyncService(repo, fakeClient(), fakeAuth(cap))
      .importFromPortal(3, 7, { cookies });

    expect(r.token).toBeNull();
    expect(cap.reissues).toEqual([]);
  });
});
