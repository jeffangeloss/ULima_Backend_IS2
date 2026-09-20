import { describe, expect, spyOn, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { ProvisionFn } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import { importSchema } from "../../src/modules/portal-sync/portal-sync.schemas.js";
import type {
  AcademicGeneral, AcademicPeriodBlock, RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";

// ── Tarea 8: el consentimiento también entra por POST /auth/register ─────────
// `PortalSyncRepository` y `PortalClient` ya están importados arriba como tipos
// y se reutilizan tal cual: un segundo import con el mismo nombre sería un
// identificador duplicado. `describe`, `expect` y `test` también están ya.
// `ImportSummary` y `PortalCookies` salen del MISMO módulo que la línea de
// arriba, en un import aparte: así este bloque es puramente aditivo y no hay
// que reescribir el import que ya estaba.
import { AuthService } from "../../src/modules/auth/auth.service.js";
import type { Registrar } from "../../src/modules/auth/auth.service.js";
import { AuthController } from "../../src/modules/auth/auth.controller.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { registerSchema } from "../../src/modules/auth/auth.schemas.js";
import type { ImportSummary, PortalCookies } from "../../src/modules/portal-sync/portal-sync.types.js";
import { EventBus } from "../../src/events/index.js";

/**
 * RS-BE-29 (consentimiento) y las consecuencias de RS-BE-21 en la importación
 * (specs/features/academic-record/academic-record.spec.md).
 *
 * Lo que se fija acá: sin `consent: true` la importación corre EXACTAMENTE como
 * hoy y no toca ninguna de las tres tablas nuevas; con consentimiento y un
 * récord de confianza, el candado va primero y las tres escrituras después del
 * progreso; con consentimiento pero sin confianza, el motivo va al log del
 * servidor y el alumno no recibe ningún aviso nuevo.
 *
 * Fixtures INVENTADOS (el repo es público): alumno sintético 20230001, notas y
 * cursos de prueba. Los fixtures de HU31 traen datos reales y no se
 * usan acá.
 */
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();
const layoutBase = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU34_jeff/fixtures/matricula.html").text();

// El fixture de layout de HU34 trae el bloque "Información Académica" pero no el
// rótulo del ciclo vigente, y sin él `parseCicloActivo` aborta con 502 antes de
// llegar a nada de esta tarea. Se agrega acá y no en el fixture porque el fixture
// es de la Tarea 3 y su prueba fija su contenido. `CICLO:` va en mayúsculas y con
// dos puntos: es la grafía que `parseCicloActivo` exige (sin flag `i`) y la que lo
// distingue del "Ciclo 2026-1" del bloque por período.
const layout = layoutBase.replace("</body>", '<span class="PortalChannelText">CICLO: 2026-2</span></body>');

// Récord sin la tabla del pie: `evaluateRecordTrust` responde "pie ausente o ilegible".
const tablaPie = (record.match(/<table[\s\S]*?<\/table>/gi) ?? [])[1] ?? "";
const recordSinPie = record.replace(tablaPie, "");

// Layout con un rótulo cambiado en la cabecera de "Información General": el
// bloque deja de leerse y `unreadable` queda en ["general"].
const layoutGeneralRota = layout.replace(
  'size="1">Cr&eacute;ditos Acumulados</font>',
  'size="1">Cr&eacute;ditos Totales</font>',
);

const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

/** Perfil que devuelve el hook de registro: ids distintos de los de la cuenta ya
 *  existente (7/3), para que se note si el candado recibiera el studentId viejo. */
const PERFIL_APROVISIONADO = {
  id: 77, userId: 55, careerId: 1, curriculumId: 1,
  currentLevel: null as number | null, careerName: "INGENIERÍA INDUSTRIAL",
};
const provisionHook: ProvisionFn = async () => PERFIL_APROVISIONADO;

/** Cada llamada a un método nuevo del repositorio, con sus argumentos. */
type Escritura =
  | { metodo: "lockAcademicRecord"; studentId: number }
  | { metodo: "replaceRecordEntries"; studentId: number; rows: RecordRow[] }
  | { metodo: "upsertAcademicSnapshot"; studentId: number; general: AcademicGeneral; syncedAt: Date }
  | { metodo: "replacePeriodSummaries"; studentId: number; periods: AcademicPeriodBlock[] };

/**
 * Doble del repositorio con las MISMAS claves que el service.import de HU31
 * (ahí está el inventario de lo que el service llama), más los cuatro métodos
 * nuevos como espías y un `orden` global que ordena las escrituras entre sí.
 * `runInTransaction` confirma solo si el callback no lanza, como el repo real.
 */
const armarServicio = (opts: { record?: string; layout?: string } = {}) => {
  const escrituras: Escritura[] = [];
  const orden: string[] = [];
  let confirmado = false;

  const client = {
    fetchPage: async () => opts.layout ?? layout,
    fetchAll: async () => ({ matricula, record: opts.record ?? record }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as PortalClient;

  const repo = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => "20230001",
    findStudent: async () => ({
      id: 7, userId: 3, careerId: 1, curriculumId: 1,
      currentLevel: null, careerName: "INGENIERÍA INDUSTRIAL",
    }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const r = await fn({});
      confirmado = true;
      return r;
    },
    // `created: false` a propósito: un período ya existente no dispara
    // ensureAcademicWeeks ni los warnings de fechas, que no son de esta tarea.
    upsertPeriod: async () => {
      orden.push("upsertPeriod");
      return {
        id: 2, code: "2026-2", created: false, datesDefaulted: false,
        startDate: "2026-08-24", endDate: "2026-12-14",
      };
    },
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
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.map((c, i) => [c, 60 + i])),
    findEquivalentCurriculumCourseIds: async () => new Map<string, number>(),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => {
      orden.push("upsertProgressBatch");
      return items.length;
    },
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    // Métodos de la Tarea 5. Si el service los llamara sin consentimiento, los
    // dobles de HU31 y HU33 —que NO los tienen— reventarían: esa es la prueba de
    // regresión del gate, y por eso acá se registran uno por uno.
    lockAcademicRecord: async (_tx: unknown, studentId: number) => {
      orden.push("lockAcademicRecord");
      escrituras.push({ metodo: "lockAcademicRecord", studentId });
    },
    replaceRecordEntries: async (_tx: unknown, studentId: number, rows: RecordRow[]) => {
      orden.push("replaceRecordEntries");
      escrituras.push({ metodo: "replaceRecordEntries", studentId, rows });
      return rows.length;
    },
    upsertAcademicSnapshot: async (
      _tx: unknown, studentId: number, general: AcademicGeneral, syncedAt: Date,
    ) => {
      orden.push("upsertAcademicSnapshot");
      escrituras.push({ metodo: "upsertAcademicSnapshot", studentId, general, syncedAt });
    },
    replacePeriodSummaries: async (
      _tx: unknown, studentId: number, periods: AcademicPeriodBlock[],
    ) => {
      orden.push("replacePeriodSummaries");
      escrituras.push({ metodo: "replacePeriodSummaries", studentId, periods });
      return periods.length;
    },
    // Tarea 7 (RS-BE-23): con consentimiento y récord de confianza la limpieza
    // corre dentro del mismo `if (guardarRecord)`. Inerte acá a propósito: este
    // archivo mide el gate y el ORDEN de las escrituras del récord, no el
    // borrado, que lo mide test/HU34_jeff/electives-cleanup.test.ts.
    deleteUnbackedElectives: async () => 0,
  } as unknown as PortalSyncRepository;

  return {
    service: new PortalSyncService(repo, client),
    escrituras,
    orden,
    estaConfirmado: () => confirmado,
  };
};

/** Lo único que la importación escribe hoy y que este archivo ordena. */
const ORDEN_SIN_RECORD = ["upsertPeriod", "upsertProgressBatch"];
const ORDEN_CON_RECORD = [
  "lockAcademicRecord",
  "upsertPeriod",
  "upsertProgressBatch",
  "replaceRecordEntries",
  "upsertAcademicSnapshot",
  "replacePeriodSummaries",
];

describe("fixtures sinteticos de HU34", () => {
  test("el layout lleva un solo cierre de body y un solo rotulo de ciclo vigente", () => {
    expect(layoutBase.split("</body>")).toHaveLength(2);
    expect(layout.split("CICLO: 2026-2")).toHaveLength(2);
  });

  test("la matricula es del alumno sintetico 20230001 y no trae ningun otro codigo", () => {
    expect(matricula).toContain("ALUMNO DE PRUEBA");
    expect(matricula.match(/\b\d{8}\b/g)).toEqual(["20230001"]);
  });

  test("el record sin pie pierde la segunda tabla y conserva la del record", () => {
    expect(tablaPie).toContain("ASIG. DESAP.");
    expect(recordSinPie).not.toContain("ASIG. DESAP.");
    expect(recordSinPie).toContain("<th>CICLO</th>");
  });
});

describe("importSchema con consent (RS-BE-29)", () => {
  test("acepta consent true junto a las cookies", () => {
    expect(importSchema.safeParse({ cookies, consent: true }).success).toBe(true);
  });

  test("acepta el body sin consent: es lo que mandan las apps ya instaladas", () => {
    expect(importSchema.safeParse({ cookies }).success).toBe(true);
  });

  test("rechaza un consent que no es booleano en vez de descartarlo en silencio", () => {
    expect(importSchema.safeParse({ cookies, consent: "si" }).success).toBe(false);
  });

  test("consent no reemplaza a cookies ni a credentials", () => {
    expect(importSchema.safeParse({ consent: true }).success).toBe(false);
  });
});

describe("sin consentimiento la importacion corre como hoy (RS-BE-29)", () => {
  test("sin el campo consent no se toca ninguna tabla nueva", async () => {
    const a = armarServicio();
    const r = await a.service.importFromPortal(3, 7, { cookies });
    expect(a.escrituras).toEqual([]);
    expect(a.orden).toEqual(ORDEN_SIN_RECORD);
    expect(r.summary.enrollmentsUpserted).toBe(2);
  });

  test("consent false se comporta igual que no mandarlo", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(3, 7, { cookies, consent: false });
    expect(a.escrituras).toEqual([]);
    expect(a.orden).toEqual(ORDEN_SIN_RECORD);
  });

  test("guardar la copia no cambia ni el resumen ni los avisos", async () => {
    const sin = armarServicio();
    const rSin = await sin.service.importFromPortal(3, 7, { cookies });
    const con = armarServicio();
    const rCon = await con.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(rCon.summary).toEqual(rSin.summary);
    expect(rCon.warnings).toEqual(rSin.warnings);
  });
});

describe("con consentimiento y record de confianza (RS-BE-22, RS-BE-25)", () => {
  test("el candado va primero y las tres escrituras despues del progreso", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.orden).toEqual(ORDEN_CON_RECORD);
    expect(a.estaConfirmado()).toBe(true);
  });

  test("las cuatro llamadas reciben el studentId del token", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.escrituras.map((e) => e.studentId)).toEqual([7, 7, 7, 7]);
  });

  test("en el registro reciben el id que devolvio provision, nunca 0", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(0, 0, { cookies: {} as never, consent: true }, provisionHook);
    expect(a.orden).toEqual(ORDEN_CON_RECORD);
    expect(a.escrituras.map((e) => e.studentId)).toEqual([77, 77, 77, 77]);
  });

  test("con el record completo no se registra nada en el log del servidor", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio();
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(warn).toHaveBeenCalledTimes(0);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("con consentimiento y record NO confiable (RS-BE-21)", () => {
  test("no se toca ninguna de las tres tablas nuevas", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: recordSinPie });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.escrituras).toEqual([]);
      expect(a.orden).toEqual(ORDEN_SIN_RECORD);
    } finally {
      warn.mockRestore();
    }
  });

  test("el motivo va al log del servidor, sin datos del alumno", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: recordSinPie });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe("[portal-sync] récord no confiable:");
      expect(warn.mock.calls[0]?.[1]).toBe("pie ausente o ilegible");
      // El repo es público y esto va a los logs de Vercel: ni código ni notas.
      expect(String(warn.mock.calls[0]?.[1])).not.toContain("20230001");
    } finally {
      warn.mockRestore();
    }
  });

  test("una pagina sin filas tambien registra el motivo en el log", async () => {
    // El caso más grave de RS-BE-21: sesión caída o página de error con HTTP
    // 200. El alumno recibe su PARSER_FAILED, pero el motivo de la regla de
    // confianza tiene que quedar igual en el log del servidor.
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: "<html></html>" });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.escrituras).toEqual([]);
      expect(warn.mock.calls[0]?.[0]).toBe("[portal-sync] récord no confiable:");
      expect(warn.mock.calls[0]?.[1]).toBe("tabla del récord ausente o con cabecera distinta");
    } finally {
      warn.mockRestore();
    }
  });

  test("el alumno no recibe ningun aviso nuevo", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sin = armarServicio({ record: recordSinPie });
      const rSin = await sin.service.importFromPortal(3, 7, { cookies });
      const con = armarServicio({ record: recordSinPie });
      const rCon = await con.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(rCon.warnings).toEqual(rSin.warnings);
    } finally {
      warn.mockRestore();
    }
  });

  test("el resto de la importacion sigue igual que hoy", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: recordSinPie });
      const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(r.period.code).toBe("2026-2");
      expect(r.identity.portalCode).toBe("20230001");
      expect(r.summary.enrollmentsUpserted).toBe(2);
      expect(a.estaConfirmado()).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("informacion academica incompleta (RS-BE-24)", () => {
  test("los campos que no se leyeron van al log del servidor", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ layout: layoutGeneralRota });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      // Dos avisos: el de esta spec (incondicional, sin importar
      // `guardarRecord`) y el nuevo de RS-BE-25 (arreglo 3) que además explica
      // que con "general" ilegible no se pisa la foto ni el resumen.
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0]?.[0]).toBe("[portal-sync] información académica incompleta:");
      expect(warn.mock.calls[0]?.[1]).toBe("general");
      expect(warn.mock.calls[1]?.[0]).toBe(
        "[portal-sync] información general ilegible, no se actualiza la foto ni el resumen del ciclo:",
      );
    } finally {
      warn.mockRestore();
    }
  });
});

// ── RS-BE-29 en el registro: POST /auth/register acepta y traslada `consent` ──
// El registro llama al MISMO `importFromPortal` (auth.service.ts:274-275), así
// que acá NO se vuelve a probar qué se guarda —eso ya está más arriba en este
// archivo, con el service real, incluido el modo registro con `provisionHook`—:
// se prueba lo único que el registro decide, que es que el consentimiento
// llegue, y que llegue siempre como booleano.

/** Datos SINTÉTICOS (el repo es público): 20230001 no es el código de nadie y
 *  las credenciales son inventadas. */
const ENTRADA_REGISTRO = {
  code: "20230001",
  portalPassword: "clave-portal-sintetica",
  passcode: "123456",
  password: "clave-nueva-sintetica",
};
const CARRERA_SINTETICA = "INGENIERÍA INDUSTRIAL";

/** El tercer argumento con el que `register` invoca al Registrar. Se escribe
 *  entero (y no `Parameters<...>`) para que la prueba falle si alguien recorta
 *  el tipo estructural de `Registrar` en vez de seguirlo. */
type EntradaImport = {
  cookies?: PortalCookies;
  credentials?: { password: string; passcode: string };
  consent?: boolean;
};

/**
 * `AuthService.register` con todas sus dependencias falseadas. Es el armado de
 * test/HU33_jeff/registro.service.test.ts:62-206 reducido a lo que esta prueba
 * necesita: acá no se miden el 409 temprano, la atomicidad ni el doble logout,
 * que ya tienen sus propios archivos en HU33. Por eso el Registrar falso
 * tampoco simula el `finally` con `portalClient.logout(...)` que sí tiene el de
 * HU33: `register` le entrega las cookies y no vuelve a cerrarlas, y ninguna
 * aserción de este bloque cuenta logouts.
 *
 * `entradaDeLaImportacion` es una FUNCIÓN y no un valor desestructurado: leído
 * antes de `register()` quedaría congelado en `null` y la aserción nunca podría
 * fallar. Lleva anotación de retorno explícita para que el tipo no dependa de
 * cómo TypeScript analice una variable que solo se asigna dentro de un closure.
 */
const armarRegistro = () => {
  let entradaImport: EntradaImport | null = null;

  const authRepository = {
    codeExists: async () => false,
    // Vuelve vacía a propósito: `register` cae a su `usuarioDeRespaldo`
    // (auth.service.ts:114-141), que se arma con lo que `provision` insertó y
    // no vuelve a la BD. Nada de lo que esta prueba mide depende del `user`.
    findById: async () => null,
  } as unknown as AuthRepository;

  const portalSyncRepository = {
    findSoleCareerAndCurriculum: async () => ({
      careerId: 1, curriculumId: 1, careerName: CARRERA_SINTETICA,
    }),
    createStudentAccount: async () => ({
      id: 77, userId: 55, careerId: 1, curriculumId: 1,
      currentLevel: null, careerName: CARRERA_SINTETICA,
    }),
  } as unknown as PortalSyncRepository;

  const portalClient = {
    login: async () => ({ JSESSIONID: "a", LtpaToken2: "b" }),
    logout: async () => {},
  } as unknown as PortalClient;

  const registrar: Registrar = {
    importFromPortal: async (_userId, _studentId, entrada, provision, validate) => {
      entradaImport = entrada;
      await provision!({} as never, {
        studentCode: ENTRADA_REGISTRO.code,
        studentName: "ALUMNO DE PRUEBA",
        careerName: CARRERA_SINTETICA,
      });
      // De todo `ImportSummary` acá solo interviene `enrollmentsUpserted`: es lo
      // que mira el `validate` que pasa `register` (403 NOT_ENROLLED con 0). El
      // resto de los campos no cambia ninguna aserción de este bloque.
      const summary = { enrollmentsUpserted: 5 } as unknown as ImportSummary;
      validate?.(summary);
      return {
        period: { id: 1, code: "2026-2", created: false },
        identity: {
          portalCode: ENTRADA_REGISTRO.code,
          fullName: "ALUMNO DE PRUEBA",
          career: CARRERA_SINTETICA,
        },
        summary,
        warnings: [],
        token: null,
      };
    },
  };

  const service = new AuthService(
    authRepository, new EventBus(), undefined, portalSyncRepository, portalClient,
  );
  service.setRegistrar(registrar);

  const entradaDeLaImportacion = (): EntradaImport | null => entradaImport;
  return { service, controller: new AuthController(service), entradaDeLaImportacion };
};

describe("registerSchema con consent (RS-BE-29)", () => {
  test("acepta consent true y lo conserva en el body validado", () => {
    // Se mira el objeto VALIDADO y no `success`: hoy zod ya acepta este body
    // —descarta en silencio la clave que el esquema no declara—, así que un
    // `safeParse(...).success` solo no detectaría que `consent` se pierde antes
    // de llegar al controller.
    expect(registerSchema.parse({ ...ENTRADA_REGISTRO, consent: true }))
      .toMatchObject({ consent: true });
  });

  test("acepta el body sin consent: es lo que mandan las apps ya instaladas", () => {
    const body = registerSchema.parse(ENTRADA_REGISTRO);
    expect(body.code).toBe("20230001");
    expect(body.consent).toBeUndefined();
  });

  test("rechaza un consent que no es booleano en vez de descartarlo en silencio", () => {
    expect(registerSchema.safeParse({ ...ENTRADA_REGISTRO, consent: "si" }).success).toBe(false);
  });

  test("consent no reemplaza a ningun campo obligatorio del registro", () => {
    expect(registerSchema.safeParse({ code: "20230001", consent: true }).success).toBe(false);
  });
});

describe("AuthService.register traslada el consentimiento (RS-BE-29, RS-BE-22)", () => {
  test("con consent true el Registrar lo recibe en true", async () => {
    const a = armarRegistro();
    await a.service.register({ ...ENTRADA_REGISTRO, consent: true });
    expect(a.entradaDeLaImportacion()?.consent).toBe(true);
  });

  test("sin el campo consent el Registrar recibe false, nunca undefined", async () => {
    const a = armarRegistro();
    await a.service.register(ENTRADA_REGISTRO);
    // `false` y no `undefined`: el registro manda siempre un booleano, así el
    // gate del service no depende de distinguir "no vino" de "vino en false".
    expect(a.entradaDeLaImportacion()?.consent).toBe(false);
  });

  test("consent false llega como false", async () => {
    const a = armarRegistro();
    await a.service.register({ ...ENTRADA_REGISTRO, consent: false });
    expect(a.entradaDeLaImportacion()?.consent).toBe(false);
  });

  test("el consentimiento no desplaza a las cookies ni cambia la respuesta del registro", async () => {
    const a = armarRegistro();
    const r = await a.service.register({ ...ENTRADA_REGISTRO, consent: true });
    expect(a.entradaDeLaImportacion()?.cookies).toEqual({ JSESSIONID: "a", LtpaToken2: "b" });
    // El registro SIEMPRE entrega la sesión ya hecha; nunca las credenciales.
    expect(a.entradaDeLaImportacion()?.credentials).toBeUndefined();
    expect(r.user.code).toBe("20230001");
    expect(typeof r.token).toBe("string");
  });

  test("ni la contrasena del portal ni el passcode viajan en la entrada de la importacion", async () => {
    const a = armarRegistro();
    await a.service.register({ ...ENTRADA_REGISTRO, consent: true });
    const serializada = JSON.stringify(a.entradaDeLaImportacion());
    expect(serializada).not.toContain(ENTRADA_REGISTRO.portalPassword);
    expect(serializada).not.toContain(ENTRADA_REGISTRO.passcode);
    expect(serializada).not.toContain(ENTRADA_REGISTRO.password);
  });
});

describe("el cuerpo validado del registro llega hasta la importacion (RS-BE-29)", () => {
  test("el consent que sobrevive a registerSchema llega al Registrar", async () => {
    // Las dos capas de arriba se prueban por separado; esta las COMPONE en el
    // mismo orden que la ruta (auth.routes.ts:39-41): primero el esquema, y su
    // salida —no el objeto original— entra al controller. Sin esto, un esquema
    // que descarta `consent` y un service que lo reenvía pasarían sus pruebas
    // por separado y el endpoint seguiría sin guardar nada.
    const a = armarRegistro();
    const body = registerSchema.parse({ ...ENTRADA_REGISTRO, consent: true });
    await a.controller.register(body);
    expect(a.entradaDeLaImportacion()?.consent).toBe(true);
  });
});
