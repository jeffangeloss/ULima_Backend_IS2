import { describe, expect, test } from "bun:test";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import type { Registrar } from "../../src/modules/auth/auth.service.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import type { ImportSummary } from "../../src/modules/portal-sync/portal-sync.types.js";
import { EventBus } from "../../src/events/index.js";

/**
 * RS-BE-18: el registro es todo o nada. O queda una cuenta con su ciclo
 * cargado y utilizable, o no queda ninguna cuenta — nunca una cuenta creada
 * que no pueda iniciar sesión.
 *
 * El riesgo concreto que esta suite existe para atajar (documentado en la
 * spec de registro): el `403 NOT_ENROLLED` se decide DESPUÉS de que el hook
 * de aprovisionamiento ya insertó la fila. Si esa comprobación corriera
 * FUERA de la transacción de `importFromPortal`, la cuenta quedaría creada
 * y bloqueada por `hasActiveEnrollment` — y el propio `409
 * USER_ALREADY_EXISTS` le cerraría el reintento a esa persona para siempre.
 *
 * Por eso el doble de `Registrar` de abajo simula una transacción de
 * verdad: `provision` ESCRIBE en `staged` (igual que un INSERT sin
 * confirmar), y esa escritura solo se vuelve visible en `creadas` (lo que
 * `codeExists` real vería) si `validate` no lanza. Cada test comprueba
 * `creadas`, nunca un flag interno de "¿se llamó a algo?": una aserción así
 * podría no fallar nunca si la implementación cambiara de forma que
 * preservara el flag pero no el rollback real (ver Task 2 en progress.md,
 * donde ese exacto patrón de aserción muerta hubo que corregirlo dos veces).
 */

const CODIGO_EN_EL_PORTAL = "20230001";
const NOMBRE_EN_EL_PORTAL = "Garcia Lopez, Maria";
const CARRERA = "Ingeniería de Sistemas";

const entrada = {
  code: "20230001",
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

function armar(opts: {
  matriculasEnElPortal?: number;
  importFalla?: boolean; // el registrar lanza DESPUES de que `provision` corrio,
                          // simulando un fallo a mitad de la importacion (p.ej.
                          // upsertEnrollment), no ligado a NOT_ENROLLED.
} = {}) {
  let enrollments = opts.matriculasEnElPortal ?? 5;

  let logouts = 0;
  // `creadas`: lo REALMENTE persistido (lo que un `codeExists` de verdad
  // vería). `staged`: lo escrito a mitad de la transaccion en CURSO, todavia
  // sin confirmar.
  const creadas: Creada[] = [];
  let staged: Creada | null = null;

  const authRepository = {
    // Refleja SOLO lo persistido: es la comprobacion que demuestra que un
    // segundo intento, tras un rollback, no choca con USER_ALREADY_EXISTS.
    codeExists: async (code: string) => creadas.some((c) => c.code === code),
    // Lo que usa `register()` para armar el `user` de la respuesta DESPUÉS de
    // que la importación confirmó (RS-BE-17). Solo se llama en el camino
    // feliz, cuando `creadas` ya tiene la fila recién confirmada.
    findById: async (userId: number, role: string) => {
      const ultimo = creadas[creadas.length - 1];
      if (!ultimo) return null;
      return {
        id: userId,
        studentId: 77,
        code: ultimo.code,
        tokenVersion: 1,
        fullName: NOMBRE_EN_EL_PORTAL,
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
        specialties: [],
        courseProgress: {
          approvedLevels: [], approvedCourseIds: [], approvedElectives: [], currentCourses: [],
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
    login: async () => ({ JSESSIONID: "s", LtpaToken2: "l" }),
    logout: async () => {
      logouts += 1;
    },
  } as unknown as PortalClient;

  const registrar: Registrar = {
    importFromPortal: async (_userId, _studentId, entradaImport, provision, validate) => {
      staged = null;
      try {
        await provision!({} as never, {
          studentCode: CODIGO_EN_EL_PORTAL, studentName: NOMBRE_EN_EL_PORTAL, careerName: CARRERA,
        });

        if (opts.importFalla) {
          // Fallo a mitad de la importación (p.ej. un upsert de matrícula que
          // revienta), ANTES de llegar a `validate`. La transacción real
          // revertiría todo lo escrito hasta acá, incluida la cuenta: `staged`
          // se descarta sin más, nunca llega a `creadas`.
          throw new Error("fallo simulado en la importacion");
        }

        const summary = { ...emptySummary(), enrollmentsUpserted: enrollments };
        // Último paso DENTRO de la transacción: si lanza, no hay "commit".
        validate?.(summary);
        if (staged) creadas.push(staged);
        return {
          period: { id: 1, code: "2026-1", created: false },
          identity: { portalCode: CODIGO_EN_EL_PORTAL, fullName: NOMBRE_EN_EL_PORTAL, career: CARRERA },
          summary,
          warnings: [],
          token: null,
        };
      } finally {
        // Simula el `finally` REAL de `PortalSyncService.importFromPortal`
        // (portal-sync.service.ts:136-140): cierra SIEMPRE la sesión que le
        // pasó el llamador, feliz o no. Sin este `finally` acá, esta suite no
        // puede detectar el doble-logout de `register()` (hallazgo 3 de la
        // revisión): con el bug, `cantidadLogouts()` daría 2 en vez de 1 en
        // ambos tests de logout de más abajo.
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
    cantidadLogouts: () => logouts,
    fijarMatriculas: (n: number) => { enrollments = n; },
  };
}

describe("AuthService.register — todo o nada (RS-BE-18)", () => {
  test("sin matricula en el ciclo activo -> 403 NOT_ENROLLED y NO queda cuenta creada", async () => {
    const { service, creadas } = armar({ matriculasEnElPortal: 0 });
    await expect(service.register(entrada)).rejects.toMatchObject({ code: "NOT_ENROLLED" });
    // No un flag interno: el estado que un `codeExists` real vería.
    expect(creadas).toHaveLength(0);
  });

  test("si la importacion falla a mitad (no por falta de matricula), tampoco queda cuenta creada", async () => {
    const { service, creadas } = armar({ importFalla: true });
    await expect(service.register(entrada)).rejects.toThrow();
    expect(creadas).toHaveLength(0);
  });

  test("tras el rollback por NOT_ENROLLED, un segundo intento CON matricula sí puede registrarse", async () => {
    // Esta es la prueba de verdad de la reversión: si el primer intento
    // hubiera dejado la cuenta a medio crear, `codeExists` la vería y este
    // segundo intento fallaría con 409 USER_ALREADY_EXISTS en vez de crear
    // la cuenta — exactamente el escenario que RS-BE-18 prohíbe ("el 409 le
    // cerraría el reintento").
    const { service, creadas, fijarMatriculas } = armar({ matriculasEnElPortal: 0 });

    await expect(service.register(entrada)).rejects.toMatchObject({ code: "NOT_ENROLLED" });
    expect(creadas).toHaveLength(0);

    fijarMatriculas(5);
    await service.register(entrada);
    expect(creadas).toHaveLength(1);
    expect(creadas[0]!.code).toBe(CODIGO_EN_EL_PORTAL);
  });

  test("la sesion del portal se cierra siempre, tambien si la importacion falla", async () => {
    const { service, cantidadLogouts } = armar({ importFalla: true });
    await expect(service.register(entrada)).rejects.toThrow();
    expect(cantidadLogouts()).toBe(1);
  });

  test("la sesion del portal se cierra tambien en el camino feliz", async () => {
    const { service, cantidadLogouts } = armar({});
    await service.register(entrada);
    expect(cantidadLogouts()).toBe(1);
  });

  // Hallazgo 3 de la revisión: `importFromPortal` cierra la sesión en su
  // PROPIO `finally` apenas se lo invoca, así que `register()` no debe
  // cerrarla de nuevo — sería un logout de más contra miUlima en cada
  // registro. Pero hay una ventana ANTES de esa invocación (acá, `bcrypt.hash`
  // dentro de `register()`) donde `importFromPortal` todavía no existe para
  // hacerse cargo: si algo revienta ahí, la sesión recién abierta por
  // `portalClient.login` no la conoce nadie más, y hay que cerrarla en
  // `register()` mismo o quedaría viva para siempre. Se usa `bcrypt.hash`
  // REAL (no un doble) porque es justamente el único punto de este código que
  // hoy puede lanzar en esa ventana: pasarle `null` rechaza la promesa antes
  // de que `register()` llegue a invocar a `registrar.importFromPortal`.
  test("si algo lanza ANTES de invocar a importFromPortal, la sesion del portal igual se cierra", async () => {
    const { service, cantidadLogouts } = armar({});
    await expect(
      service.register({ ...entrada, password: null as unknown as string }),
    ).rejects.toThrow();
    expect(cantidadLogouts()).toBe(1);
  });
});
