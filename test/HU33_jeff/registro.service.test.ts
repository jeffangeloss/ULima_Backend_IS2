import { describe, expect, test } from "bun:test";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import type { Registrar } from "../../src/modules/auth/auth.service.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import type { ImportSummary } from "../../src/modules/portal-sync/portal-sync.types.js";
import { EventBus } from "../../src/events/index.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

/**
 * RS-BE-17: `AuthService.register` orquesta, en un solo acto, el 409
 * temprano, el login contra miUlima, el alta de cuenta y la importación del
 * ciclo. Los tests de atomicidad "todo o nada" (RS-BE-18) viven aparte, en
 * `registro.atomicidad.test.ts`.
 *
 * Códigos y nombres SINTÉTICOS a propósito (repo público): `20230001` no es
 * un código real de alumno.
 */

const CODIGO_EN_EL_PORTAL_DEFECTO = "20230001";
const NOMBRE_EN_EL_PORTAL = "Garcia Lopez, Maria";
const CARRERA = "Ingeniería de Sistemas";

// El código del body es DISTINTO del que "certifica" el portal en la mayoría
// de tests: así, si algún test asume que se persiste el del body, falla.
const entrada = {
  code: "20239999",
  portalPassword: "clave-portal-sintetica",
  passcode: "123456",
  password: "clave-nueva-sintetica",
};

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
 * Arma un `AuthService.register` con TODAS sus dependencias falseadas.
 *
 * El `registrar` (lo que `portal-sync/index.ts` inyecta con `setRegistrar`
 * en producción) es una mini-simulación de una transacción: `provision`
 * ESCRIBE en `staged`, y solo se mueve a `creadas` (lo que un `codeExists`
 * real vería) si `validate` no lanza — igual que `runInTransaction` confirma
 * solo si su callback no lanza. Así, `creadas` refleja el estado REALMENTE
 * persistido, nunca lo escrito a mitad de una transacción que revirtió.
 *
 * Se usan FUNCIONES (`estaPortalLlamado`, `cantidadLogouts`), no primitivos
 * desestructurados, para leer el estado DESPUÉS de que `register()` corrió:
 * un booleano/número desestructurado antes de esa llamada queda congelado en
 * su valor inicial y la aserción nunca podría fallar (el mismo error que
 * hubo que corregir en la Task 2, ver `progress.md`).
 */
function armar(opts: {
  yaExiste?: boolean;
  loginFalla?: boolean;
  /** Para simular un portal caído (502) en vez de credenciales rechazadas. */
  loginLanza?: HttpError;
  matriculasEnElPortal?: number;
  codigoEnElPortal?: string;
} = {}) {
  const codigoEnElPortal = opts.codigoEnElPortal ?? CODIGO_EN_EL_PORTAL_DEFECTO;
  const enrollments = opts.matriculasEnElPortal ?? 5;

  let portalLlamado = false;
  let logouts = 0;
  const creadas: Creada[] = [];
  let staged: Creada | null = null;

  const authRepository = {
    codeExists: async (code: string) => {
      if (opts.yaExiste) return true;
      // Solo mira lo persistido, nunca lo `staged`.
      return creadas.some((c) => c.code === code);
    },
    // Lo que usa `register()` para armar el `user` de la respuesta DESPUÉS de
    // que la importación confirmó (RS-BE-17: "mismo cuerpo que login"). Se
    // arma con la forma completa de `AuthUser` (auth.types.ts), no el mínimo
    // {id, studentId, code, role}, para que un test pueda distinguir uno de
    // otro.
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
      if (opts.loginLanza) throw opts.loginLanza;
      if (opts.loginFalla) throw new HttpError(409, "credenciales rechazadas", "PORTAL_LOGIN_REJECTED");
      return { JSESSIONID: "s", LtpaToken2: "l" };
    },
    logout: async () => {
      logouts += 1;
    },
  } as unknown as PortalClient;

  const registrar: Registrar = {
    importFromPortal: async (_userId, _studentId, entradaImport, provision, validate) => {
      staged = null;
      try {
        await provision!({} as never, {
          studentCode: codigoEnElPortal, studentName: NOMBRE_EN_EL_PORTAL, careerName: CARRERA,
        });
        const summary = { ...emptySummary(), enrollmentsUpserted: enrollments };
        // Último paso, DENTRO de la "transacción": si lanza, `staged` nunca se
        // mueve a `creadas` (confirma solo si `validate` no lanza).
        validate?.(summary);
        if (staged) creadas.push(staged);
        return {
          period: { id: 1, code: "2026-1", created: false },
          identity: { portalCode: codigoEnElPortal, fullName: NOMBRE_EN_EL_PORTAL, career: CARRERA },
          summary,
          warnings: [],
          token: null,
        };
      } finally {
        // Simula el `finally` REAL de `PortalSyncService.importFromPortal`:
        // cierra SIEMPRE la sesión que le pasó el llamador, feliz o no. Sin
        // esto acá, el doble no detecta el doble-logout de `register()`: con
        // el bug, `cantidadLogouts()` daría 2 en vez de 1.
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

  return {
    service,
    creadas,
    estaPortalLlamado: () => portalLlamado,
    cantidadLogouts: () => logouts,
  };
}

describe("AuthService.register", () => {
  test("si el codigo ya existe responde 409 y NO toca el portal", async () => {
    const { service, estaPortalLlamado } = armar({ yaExiste: true });
    await expect(service.register(entrada)).rejects.toMatchObject({ code: "USER_ALREADY_EXISTS" });
    expect(estaPortalLlamado()).toBe(false);
  });

  test("credenciales rechazadas por miUlima -> 401 PORTAL_AUTH_FAILED", async () => {
    const { service } = armar({ loginFalla: true });
    await expect(service.register(entrada)).rejects.toMatchObject({ code: "PORTAL_AUTH_FAILED" });
  });

  // Hallazgo 1 de la revisión: un portal CAÍDO (timeout, 5xx, respuesta
  // inesperada) es un fallo distinto de credenciales rechazadas, y la tabla
  // de errores de la spec exige que llegue como 502 PORTAL_UNAVAILABLE, no
  // aplastado al mismo 401 que un passcode vencido.
  test("portal caido (502 PORTAL_UNAVAILABLE) NO se reporta como credenciales rechazadas", async () => {
    const { service } = armar({
      loginLanza: new HttpError(502, "No se pudo contactar a miUlima.", "PORTAL_UNAVAILABLE"),
    });
    await expect(service.register(entrada)).rejects.toMatchObject({
      code: "PORTAL_UNAVAILABLE",
      statusCode: 502,
    });
  });

  test("camino feliz: crea la cuenta con los datos del PORTAL, no los del body", async () => {
    const { service, creadas } = armar({ codigoEnElPortal: "20230001" });
    await service.register({ ...entrada, code: "20239999" });
    expect(creadas[0]!.code).toBe("20230001");
    expect(creadas[0]!.email).toBe("20230001@aloe.ulima.edu.pe");
  });

  test("la contrasena se guarda hasheada, nunca en claro", async () => {
    const { service, creadas } = armar({});
    await service.register({ ...entrada, password: "secreta" });
    expect(creadas[0]!.passwordHash).not.toBe("secreta");
    expect(creadas[0]!.passwordHash.startsWith("$2")).toBe(true);
  });

  test("devuelve token utilizable y el summary de la importacion", async () => {
    const { service } = armar({});
    const r = await service.register(entrada);
    expect(typeof r.token).toBe("string");
    expect(r.tokenType).toBe("Bearer");
    expect(r.user.role).toBe("student");
    expect(r.summary.enrollmentsUpserted).toBeGreaterThan(0);
  });

  // Hallazgo 2 de la revisión: la spec exige "el mismo cuerpo que POST
  // /auth/login" — el objeto rico que arma `buildUser` (auth.repository.ts),
  // no el mínimo {id, studentId, code, role} que alcanza para firmar el
  // token. Sin esto, el cliente Flutter tendría que hacer un login o una
  // llamada de perfil extra tras registrarse, y `setupComplete` —que decide
  // si va al onboarding de especialidades— ni siquiera estaría.
  test("el user de la respuesta trae los mismos campos que el de login, no solo id/studentId/code/role", async () => {
    const { service } = armar({});
    const r = await service.register(entrada);
    expect(r.user.fullName).toBe(NOMBRE_EN_EL_PORTAL);
    expect(r.user).toHaveProperty("institutionalEmail");
    expect(r.user).toHaveProperty("avatarUrl");
    expect(r.user).toHaveProperty("setupComplete");
    expect(r.user).toHaveProperty("courseProgress");
    expect(r.user).toHaveProperty("specialties");
    // Nunca debe filtrarse el hash, ni siquiera con el objeto rico.
    expect(r.user).not.toHaveProperty("passwordHash");
  });
});
