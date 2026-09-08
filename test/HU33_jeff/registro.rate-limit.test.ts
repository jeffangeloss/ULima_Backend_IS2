import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

/**
 * RS-BE-17 — límite de tasa de `POST /auth/register`.
 *
 * El endpoint es PÚBLICO y cada petición dispara una secuencia real de login
 * contra miUlima con credenciales que elige quien llama. Lo que esta suite
 * existe para atajar no es el gasto propio, sino esto: sin contador,
 * cualquiera puede pedir el registro del código de una persona real con
 * contraseñas basura, en bucle, hasta que el portal de la Universidad le
 * BLOQUEE la cuenta a esa persona.
 *
 * Se prueban los dos limitadores de `src/shared/middleware/rate-limit.ts`:
 *
 *   - `registerRateLimit`: 5 intentos por `code` y por hora, SIN devolución
 *     de cupo por login rechazado (a diferencia de `portalSyncRateLimit`).
 *   - `registerConcurrencyLimit`: tope global de peticiones en vuelo, sin
 *     clave, que es lo que un contador por clave no puede acotar.
 *
 * CÓDIGOS DISTINTOS EN CADA TEST, a propósito: los contadores viven en un
 * `Map` de módulo compartido por todo el proceso de test. Un código reusado
 * arrastraría cupo de un test a otro y los volvería dependientes del orden.
 * El rango 2023 1xxx es exclusivo de este archivo (el de endpoint usa 2023
 * 9xxx). Códigos SINTÉTICOS: no son códigos reales de alumno (repo público).
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

const NOMBRE_EN_EL_PORTAL = "Garcia Lopez, Maria";
const CARRERA = "Ingeniería de Sistemas";

/** Tiene que coincidir con `REGISTER_MAX_PER_HOUR` de rate-limit.ts. */
const MAX_POR_CODIGO = 5;
/** Tiene que coincidir con `REGISTER_MAX_IN_FLIGHT` de rate-limit.ts. */
const MAX_EN_VUELO = 4;

const credenciales = {
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

/**
 * App Hono real (`/auth` con `createAuthRoutes`, o sea CON los limitadores
 * montados) sobre un `AuthService` real de dependencias falseadas.
 *
 * `loginFalla` simula credenciales rechazadas por miUlima; `puertaLenta` deja
 * el login colgado hasta que el test llame a `liberar()`, que es lo que
 * permite tener varias peticiones EN VUELO a la vez.
 */
function armarApp(opts: { loginFalla?: boolean; puertaLenta?: boolean } = {}) {
  let loginsIniciados = 0;
  let puertaAbierta = false;
  const puertas: Array<() => void> = [];

  const authRepository = {
    codeExists: async () => false,
    findById: async (userId: number, role: string) => ({
      id: userId, studentId: 77, code: "20231000", tokenVersion: 1,
      fullName: NOMBRE_EN_EL_PORTAL, firstName: "Garcia Lopez", lastName: "Maria",
      institutionalEmail: "20231000@aloe.ulima.edu.pe", email: "20231000@aloe.ulima.edu.pe",
      avatarUrl: null, role, careerId: 1, career_id: 1, curriculumId: 1,
      currentLevel: null, currentCycle: "2026-1", setupComplete: false,
      specialtySetupCompleted: false, especialidad_principal: null,
      especialidades_interes: [], especialidades: [], specialties: [],
      courseProgress: {
        approvedLevels: [], approvedCourseIds: [], approvedElectives: [], currentCourses: [],
      },
    }),
  } as unknown as AuthRepository;

  const portalSyncRepository = {
    findSoleCareerAndCurriculum: async () => ({ careerId: 1, curriculumId: 1, careerName: CARRERA }),
    createStudentAccount: async () => ({
      id: 77, userId: 55, careerId: 1, curriculumId: 1, currentLevel: null, careerName: CARRERA,
    }),
  } as unknown as PortalSyncRepository;

  const portalClient = {
    login: async () => {
      loginsIniciados += 1;
      if (opts.puertaLenta && !puertaAbierta) {
        await new Promise<void>((resolver) => puertas.push(resolver));
      }
      if (opts.loginFalla) {
        throw new HttpError(409, "rechazado", "PORTAL_LOGIN_REJECTED");
      }
      return { JSESSIONID: "s", LtpaToken2: "l" };
    },
    logout: async () => {},
  } as unknown as PortalClient;

  const registrar: Registrar = {
    importFromPortal: async (_userId, _studentId, _entrada, provision, validate) => {
      await provision!({} as never, {
        studentCode: "20231000", studentName: NOMBRE_EN_EL_PORTAL, careerName: CARRERA,
      });
      const summary = { ...emptySummary(), enrollmentsUpserted: 5 };
      validate?.(summary);
      return {
        period: { id: 1, code: "2026-1", created: false },
        identity: { portalCode: "20231000", fullName: NOMBRE_EN_EL_PORTAL, career: CARRERA },
        summary, warnings: [], token: null,
      };
    },
  };

  const service = new AuthService(
    authRepository, new EventBus(), undefined, portalSyncRepository, portalClient,
  );
  service.setRegistrar(registrar);

  const app = new Hono();
  app.onError(errorHandler);
  app.route("/auth", createAuthRoutes(new AuthController(service)));

  return {
    app,
    loginsIniciados: () => loginsIniciados,
    /** Suelta los logins colgados y deja la puerta ABIERTA: lo que venga
     *  después ya no se cuelga (si no, el propio test se quedaría esperando). */
    liberar: () => {
      puertaAbierta = true;
      for (const abrir of puertas.splice(0)) abrir();
    },
  };
}

const pedirRegistro = (app: Hono, code: string) =>
  app.request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...credenciales, code }),
  });

/** Espera activa cortita: no hay reloj falso, y los 4 logins en vuelo se
 *  resuelven en el mismo tick del bucle de eventos. */
const hastaQue = async (condicion: () => boolean) => {
  for (let intento = 0; intento < 200 && !condicion(); intento++) {
    await new Promise((resolver) => setTimeout(resolver, 1));
  }
  if (!condicion()) throw new Error("la condición nunca se cumplió");
};

describe("POST /auth/register — límite por código", () => {
  test(`el intento ${MAX_POR_CODIGO + 1} con el mismo codigo responde 429 y NO toca el portal`, async () => {
    const { app, loginsIniciados } = armarApp();
    const codigo = "20231001";

    for (let intento = 0; intento < MAX_POR_CODIGO; intento++) {
      expect((await pedirRegistro(app, codigo)).status).toBe(201);
    }
    expect(loginsIniciados()).toBe(MAX_POR_CODIGO);

    const res = await pedirRegistro(app, codigo);
    expect(res.status).toBe(429);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    // Lo que de verdad importa: el rechazo ocurre ANTES de pedirle nada a
    // miUlima. Si el limitador corriera después del service, el contador no
    // serviría de nada — el portal ya habría recibido el intento.
    expect(loginsIniciados()).toBe(MAX_POR_CODIGO);
  });

  test("el contador es POR CODIGO: otro codigo no arrastra el cupo gastado", async () => {
    const { app } = armarApp();
    const victima = "20231002";

    for (let intento = 0; intento < MAX_POR_CODIGO; intento++) {
      await pedirRegistro(app, victima);
    }
    expect((await pedirRegistro(app, victima)).status).toBe(429);

    // Contraprueba: si el contador fuera global, este también daría 429 y
    // un solo abusador dejaría a todo el mundo sin poder registrarse.
    expect((await pedirRegistro(app, "20231003")).status).toBe(201);
  });

  test("un login RECHAZADO por miUlima tambien gasta cupo (no hay devolucion)", async () => {
    // Esta es la propiedad que hace que el contador sirva para algo.
    // `portalSyncRateLimit` SÍ devuelve cupo cuando el portal rechaza el
    // login, porque ahí quien se equivoca tipeando su passcode es el dueño de
    // la cuenta. Acá el login rechazado es exactamente la señal del abuso que
    // se quiere frenar: si se devolviera cupo, un atacante podría probar
    // contraseñas contra el portal para siempre y bloquear la cuenta
    // universitaria de un tercero.
    const { app, loginsIniciados } = armarApp({ loginFalla: true });
    const codigo = "20231004";

    for (let intento = 0; intento < MAX_POR_CODIGO; intento++) {
      expect((await pedirRegistro(app, codigo)).status).toBe(401);
    }
    expect(loginsIniciados()).toBe(MAX_POR_CODIGO);

    const res = await pedirRegistro(app, codigo);
    expect(res.status).toBe(429);
    expect(loginsIniciados()).toBe(MAX_POR_CODIGO);
  });
});

describe("POST /auth/register — tope de peticiones en vuelo", () => {
  test(`con ${MAX_EN_VUELO} registros colgados, el siguiente responde 429 sin tocar el portal`, async () => {
    const { app, loginsIniciados, liberar } = armarApp({ puertaLenta: true });

    // Códigos distintos: así el 429 solo puede venir del tope global, nunca
    // del contador por código (ninguno llega ni a 2 intentos).
    const enVuelo = Array.from(
      { length: MAX_EN_VUELO },
      (_, indice) => pedirRegistro(app, String(20231010 + indice)),
    );
    await hastaQue(() => loginsIniciados() === MAX_EN_VUELO);

    const rechazada = await pedirRegistro(app, "20231020");
    expect(rechazada.status).toBe(429);
    expect((await rechazada.json() as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    // No entró: el portal sigue con los mismos logins abiertos de antes.
    expect(loginsIniciados()).toBe(MAX_EN_VUELO);

    liberar();
    for (const respuesta of await Promise.all(enVuelo)) {
      expect(respuesta.status).toBe(201);
    }
  });

  test("el cupo en vuelo se devuelve al terminar: despues del pico se vuelve a poder registrar", async () => {
    // Contraprueba del test anterior. Sin la devolución (el `finally` del
    // middleware), el tope se consumiría para siempre y el endpoint quedaría
    // muerto tras el primer pico — un modo de fallo peor que el que se quería
    // evitar.
    const { app, loginsIniciados, liberar } = armarApp({ puertaLenta: true });

    const enVuelo = Array.from(
      { length: MAX_EN_VUELO },
      (_, indice) => pedirRegistro(app, String(20231030 + indice)),
    );
    await hastaQue(() => loginsIniciados() === MAX_EN_VUELO);
    expect((await pedirRegistro(app, "20231040")).status).toBe(429);

    liberar();
    await Promise.all(enVuelo);

    expect((await pedirRegistro(app, "20231041")).status).toBe(201);
  });
});

describe("POST /auth/register — el tope en vuelo no cobra cupo por codigo", () => {
  test("un 429 por concurrencia NO gasta ninguno de los 5 intentos del codigo", async () => {
    const { app, loginsIniciados, liberar } = armarApp({ puertaLenta: true });
    const rebotado = "20231050";

    const enVuelo = Array.from(
      { length: MAX_EN_VUELO },
      (_, indice) => pedirRegistro(app, String(20231060 + indice)),
    );
    await hastaQue(() => loginsIniciados() === MAX_EN_VUELO);

    expect((await pedirRegistro(app, rebotado)).status).toBe(429);

    liberar();
    await Promise.all(enVuelo);

    // Lo que este test fija: el 429 de arriba invitaba a reintentar en unos
    // segundos, así que el reintento tiene que encontrar el cupo entero.
    for (let intento = 0; intento < MAX_POR_CODIGO; intento++) {
      expect((await pedirRegistro(app, rebotado)).status).toBe(201);
    }
    expect((await pedirRegistro(app, rebotado)).status).toBe(429);
  });
});

describe("POST /auth/register — orden de los limitadores", () => {
  test("una peticion frenada en el contador por codigo no ocupa cupo en vuelo", async () => {
    const { app, loginsIniciados, liberar } = armarApp({ puertaLenta: true });

    // Cuerpo que nunca termina de llegar: la petición se queda dentro del
    // primer middleware, en `await c.req.json()`, sin llegar al handler.
    const cerrojos: Array<() => void> = [];
    const colgadas = [0, 1].map(() => {
      const cuerpo = new ReadableStream({
        start(controller) { cerrojos.push(() => controller.close()); },
      });
      return app.request("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: cuerpo,
        duplex: "half",
      } as RequestInit);
    });

    // Si el tope global corriera PRIMERO, esas dos ya tendrían tomado la mitad
    // del cupo en vuelo mientras esperan su propio cuerpo, y estas cuatro no
    // cabrían.
    const enVuelo = Array.from(
      { length: MAX_EN_VUELO },
      (_, indice) => pedirRegistro(app, String(20231070 + indice)),
    );
    await hastaQue(() => loginsIniciados() === MAX_EN_VUELO);

    liberar();
    for (const respuesta of await Promise.all(enVuelo)) {
      expect(respuesta.status).toBe(201);
    }

    for (const cerrar of cerrojos) cerrar();
    await Promise.all(colgadas);
  });
});
