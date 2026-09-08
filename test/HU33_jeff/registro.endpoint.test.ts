import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RS-BE-17/RS-BE-18 a nivel de ENDPOINT (Task 4 de la feature "registro de
 * alumno"). La lógica de negocio de `AuthService.register` ya está probada en
 * `registro.service.test.ts` (feliz, 409, 401, 502, 504) y `registro.atomicidad.test.ts`
 * (todo o nada). Lo que falta y prueba este archivo es la CADENA
 * routes -> controller -> service -> errorHandler:
 *
 *   - Zod valida el body ANTES de llamar al service (un body inválido no debe
 *     tocar el portal).
 *   - El 201 lleva el contrato { token, tokenType, expiresIn, user, summary }.
 *   - Un error de negocio real (409 USER_ALREADY_EXISTS) llega como JSON con
 *     el `code` correcto — es decir, que la ruta esté montada bajo el
 *     `errorHandler` global.
 *   - La respuesta nunca incluye el hash ni las credenciales del portal.
 *
 * Se instancia un `AuthService` REAL (no un controller de mentira) con las
 * MISMAS dependencias falseadas que `registro.service.test.ts` (mismo
 * "armar"): así el 409 y el "nunca se filtra el secreto" ejercitan el camino
 * real controller->service->repository, no una reimplementación de la regla
 * en un doble de control.
 *
 * `db/index.js` se mockea porque `auth.routes.js` importa `authMiddleware`
 * (para las OTRAS rutas del router), que abre un cliente de Postgres al
 * evaluarse — igual que en `HU31_jeff/course-detail.contacts-claim.test.ts`.
 * El doble nunca se consulta: `/auth/register` no pasa por `db`, todo es
 * inyección por constructor.
 *
 * Códigos y nombres SINTÉTICOS a propósito (repo público): `20230001` y
 * `20239999` no son códigos reales de alumno.
 */
mock.module("../../src/db/index.js", () => ({ db: {} }));

const { AuthService } = await import("../../src/modules/auth/auth.service.js");
const { AuthController } = await import("../../src/modules/auth/auth.controller.js");
const { createAuthRoutes } = await import("../../src/modules/auth/auth.routes.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { EventBus } = await import("../../src/events/index.js");

import type { Registrar } from "../../src/modules/auth/auth.service.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import type { ImportSummary } from "../../src/modules/portal-sync/portal-sync.types.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

const CODIGO_EN_EL_PORTAL_DEFECTO = "20230001";
const NOMBRE_EN_EL_PORTAL = "Garcia Lopez, Maria";
const CARRERA = "Ingeniería de Sistemas";

const entrada = {
  code: "20239999",
  portalPassword: "clave-portal-sintetica",
  passcode: "123456",
  password: "clave-nueva-sintetica",
};

/**
 * Un `code` de cuerpo DISTINTO por petición.
 *
 * La ruta pasa por `registerRateLimit` (5 intentos por código por hora) y ese
 * contador vive en un `Map` de módulo compartido por todo el proceso de test.
 * Con un código fijo, esta suite se quedaría a un test de distancia de
 * empezar a fallar por 429 sin que nadie tocara el endpoint. El rango 2023
 * 9xxx es exclusivo de este archivo (el de límite de tasa usa 2023 1xxx).
 * Códigos SINTÉTICOS: no son códigos reales de alumno (repo público).
 *
 * Que el código del cuerpo varíe no afecta a ningún test: la identidad la
 * pone el portal, que siempre certifica `CODIGO_EN_EL_PORTAL_DEFECTO`.
 */
let siguienteCodigo = 20239100;
const codigoDeCuerpo = () => String(siguienteCodigo++);

const emptySummary = (): ImportSummary => ({
  coursesCreated: 0, teachersCreated: 0, sectionsCreated: 0, sectionsUpdated: 0,
  sessionsUpserted: 0, enrollmentsUpserted: 0, enrollmentsWithdrawn: 0,
  progressUpserted: 0, progressSkipped: 0, progressViaEquivalence: 0,
  alertsCreated: 0, syllabiUpserted: 0,
  claimsUpserted: 0, claimsDeleted: 0, representativesPromoted: 0, alertsDeleted: 0,
  attendanceUpdated: 0, attendanceSkipped: 0,
});

type Creada = { code: string; email: string; passwordHash: string };

/**
 * Arma la app Hono real (`/auth` montada con `createAuthRoutes`, bajo el
 * `errorHandler` global) sobre un `AuthService` real cuyas dependencias
 * externas (repositorio, portal, registrar) están falseadas — mismo patrón
 * que `armar()` en `registro.service.test.ts`.
 */
function armarApp(opts: { yaExiste?: boolean } = {}) {
  let portalLlamado = false;
  const creadas: Creada[] = [];
  let staged: Creada | null = null;

  const authRepository = {
    codeExists: async (code: string) => {
      if (opts.yaExiste) return true;
      return creadas.some((c) => c.code === code);
    },
    // Forma RICA (auth.types.ts AuthUser), no el mínimo {id, studentId, code,
    // role}: así "nunca filtra password_hash" prueba algo real y no un objeto
    // que ya de entrada no tenía dónde filtrar el secreto.
    findById: async (userId: number, role: string) => {
      const ultimo = creadas[creadas.length - 1];
      if (!ultimo) return null;
      return {
        id: userId,
        studentId: 77,
        code: ultimo.code,
        tokenVersion: 1,
        fullName: NOMBRE_EN_EL_PORTAL,
        firstName: "Garcia Lopez",
        lastName: "Maria",
        institutionalEmail: ultimo.email,
        email: ultimo.email,
        avatarUrl: null,
        role,
        careerId: 1,
        career_id: 1,
        curriculumId: 1,
        currentLevel: null,
        currentCycle: "2026-1",
        setupComplete: false,
        specialtySetupCompleted: false,
        especialidad_principal: null,
        especialidades_interes: [],
        especialidades: [],
        specialties: [],
        courseProgress: {
          approvedLevels: [],
          approvedCourseIds: [],
          approvedElectives: [],
          currentCourses: [],
        },
      };
    },
  } as unknown as AuthRepository;

  const portalSyncRepository = {
    findSoleCareerAndCurriculum: async () => ({ careerId: 1, curriculumId: 1, careerName: CARRERA }),
    createStudentAccount: async (
      _tx: unknown,
      input: { code: string; email: string; passwordHash: string },
    ) => {
      staged = { code: input.code, email: input.email, passwordHash: input.passwordHash };
      return { id: 77, userId: 55, careerId: 1, curriculumId: 1, currentLevel: null, careerName: CARRERA };
    },
  } as unknown as PortalSyncRepository;

  const portalClient = {
    login: async () => {
      portalLlamado = true;
      return { JSESSIONID: "s", LtpaToken2: "l" };
    },
    logout: async () => {},
  } as unknown as PortalClient;

  const registrar: Registrar = {
    importFromPortal: async (_userId, _studentId, entradaImport, provision, validate) => {
      staged = null;
      try {
        await provision!({} as never, {
          studentCode: CODIGO_EN_EL_PORTAL_DEFECTO,
          studentName: NOMBRE_EN_EL_PORTAL,
          careerName: CARRERA,
        });
        const summary = { ...emptySummary(), enrollmentsUpserted: 5 };
        validate?.(summary);
        if (staged) creadas.push(staged);
        return {
          period: { id: 1, code: "2026-1", created: false },
          identity: { portalCode: CODIGO_EN_EL_PORTAL_DEFECTO, fullName: NOMBRE_EN_EL_PORTAL, career: CARRERA },
          summary,
          warnings: [],
          token: null,
        };
      } finally {
        await portalClient.logout(entradaImport.cookies!);
      }
    },
  };

  const service = new AuthService(
    authRepository,
    new EventBus(),
    undefined,
    portalSyncRepository,
    portalClient,
  );
  service.setRegistrar(registrar);
  const controller = new AuthController(service);

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/auth", createAuthRoutes(controller));

  return { app, estaPortalLlamado: () => portalLlamado };
}

const pedirRegistro = (app: Hono, body: unknown) =>
  app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /auth/register", () => {
  test("camino feliz responde 201 con el contrato { token, tokenType, expiresIn, user, summary }", async () => {
    const { app } = armarApp();
    const res = await pedirRegistro(app, { ...entrada, code: codigoDeCuerpo() });
    expect(res.status).toBe(201);

    const body = await res.json() as {
      token: string; tokenType: string; expiresIn: unknown;
      user: { role: string; fullName: string };
      summary: { enrollmentsUpserted: number };
    };
    expect(typeof body.token).toBe("string");
    expect(body.tokenType).toBe("Bearer");
    expect(body.expiresIn).toBeDefined();
    expect(body.user.role).toBe("student");
    expect(body.user.fullName).toBe(NOMBRE_EN_EL_PORTAL);
    expect(body.summary.enrollmentsUpserted).toBe(5);
  });

  test("body invalido responde 400 y NO toca el portal", async () => {
    const { app, estaPortalLlamado } = armarApp();
    const res = await pedirRegistro(app, { code: "" });
    expect(res.status).toBe(400);
    expect(estaPortalLlamado()).toBe(false);
  });

  test("el 409 real de AuthService.register llega como USER_ALREADY_EXISTS, no como 500", async () => {
    const { app, estaPortalLlamado } = armarApp({ yaExiste: true });
    const res = await pedirRegistro(app, { ...entrada, code: codigoDeCuerpo() });
    expect(res.status).toBe(409);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("USER_ALREADY_EXISTS");
    // El 409 se responde ANTES de pedirle nada al portal (RS-BE-17): si la
    // ruta llamara al service con otro orden, esto detectaría la regresión.
    expect(estaPortalLlamado()).toBe(false);
  });

  test("un 502 PORTAL_UNAVAILABLE del service tambien pasa por el errorHandler intacto", async () => {
    // Contraprueba del 409: distinto código, distinto statusCode, mismo
    // mecanismo. Si el controller aplastara todo a un solo código, esto lo
    // detectaría. Se arma una app aparte (en vez de reusar `armarApp`) para
    // que el portal falle en el login sin tocar los dobles del resto de casos.
    const authRepository = {
      codeExists: async () => false,
    } as unknown as AuthRepository;
    const portalClient = {
      login: async () => {
        throw new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE");
      },
      logout: async () => {},
    } as unknown as PortalClient;
    const service = new AuthService(authRepository, new EventBus(), undefined, {} as PortalSyncRepository, portalClient);
    service.setRegistrar({ importFromPortal: async () => { throw new Error("no debería llamarse"); } });
    const controller = new AuthController(service);
    const app2 = new Hono();
    app2.onError(errorHandler);
    app2.route("/auth", createAuthRoutes(controller));

    const res = await pedirRegistro(app2, { ...entrada, code: codigoDeCuerpo() });
    expect(res.status).toBe(502);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("PORTAL_UNAVAILABLE");
  });

  test("un 504 PORTAL_TIMEOUT llega con su propio status, no aplastado a 401 ni a 502", async () => {
    // Gemelo del test del 502. `portal.client.ts` emite 504 PORTAL_TIMEOUT
    // para un `AbortError`, que es el fallo más probable de miUlima; con el
    // criterio viejo salía como 401 PORTAL_AUTH_FAILED y mandaba a la persona
    // a cambiar su contraseña universitaria sin motivo.
    const authRepository = { codeExists: async () => false } as unknown as AuthRepository;
    const portalClient = {
      login: async () => {
        throw new HttpError(504, "miUlima tardó demasiado en responder.", "PORTAL_TIMEOUT");
      },
      logout: async () => {},
    } as unknown as PortalClient;
    const service = new AuthService(authRepository, new EventBus(), undefined, {} as PortalSyncRepository, portalClient);
    service.setRegistrar({ importFromPortal: async () => { throw new Error("no debería llamarse"); } });
    const app3 = new Hono();
    app3.onError(errorHandler);
    app3.route("/auth", createAuthRoutes(new AuthController(service)));

    const res = await pedirRegistro(app3, { ...entrada, code: codigoDeCuerpo() });
    expect(res.status).toBe(504);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("PORTAL_TIMEOUT");
  });

  test("la respuesta NUNCA incluye password_hash, portalPassword ni passcode", async () => {
    const { app } = armarApp();
    const cuerpo = await (await pedirRegistro(app, { ...entrada, code: codigoDeCuerpo() })).text();
    for (const secreto of ["passwordHash", "password_hash", "portalPassword", "passcode", entrada.portalPassword, entrada.password]) {
      expect(cuerpo).not.toContain(secreto);
    }
  });
});
