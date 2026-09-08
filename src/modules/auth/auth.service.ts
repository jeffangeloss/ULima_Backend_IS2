import type { EventBus } from "../../events/index.js";
import type { AuthRepository } from "./auth.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../../config/app-config.js";
import type { AppRole, PasswordResetUser } from "./auth.types.js";
import {
  generateOtp,
  hashOtp,
  maskEmail,
  MAX_RESET_ATTEMPTS,
  MIN_PASSWORD_LENGTH,
  OTP_EXPIRATION_MINUTES,
  validateNewPassword,
  validateResetToken,
} from "./password-reset.logic.js";
import { sendPasswordResetEmail } from "../../shared/email/resend-client.js";
// `PortalClient` es de `services/`, no de `portal-sync`: no participa del
// ciclo (portal-sync/index.ts -> auth/index.ts), así que se importa normal,
// valor incluido, igual que `googleClient` más abajo.
import { portalClient as defaultPortalClient } from "../../services/portal.client.js";
import type { PortalClient } from "../../services/portal.client.js";
// RS-BE-17/18 (registro). Todo lo que sigue es SOLO de tipos y a propósito:
// `portal-sync/index.ts` ya importa `authService`, así que un import de
// RUNTIME de `auth` hacia `portal-sync` cerraría el ciclo. `import type` no
// deja rastro en el JS compilado.
import type { PortalSyncRepository } from "../portal-sync/portal-sync.repository.js";
import type { ProvisionFn, ValidateFn } from "../portal-sync/portal-sync.service.js";
import type { ImportResult, PortalCookies } from "../portal-sync/portal-sync.types.js";

type GoogleIdTokenPayload = {
  email?: string;
  sub?: string;
};

/** Dependencia mínima del cliente de Google, inyectable para probar el flujo
 * sin llamar a servicios externos. */
export type GoogleTokenVerifier = {
  verifyIdToken(input: { idToken: string }): Promise<{
    getPayload(): GoogleIdTokenPayload | undefined;
  }>;
};

/**
 * RS-BE-17/RS-BE-18 (registro). Lo único que `auth` necesita de
 * `portal-sync`: un tipo ESTRUCTURAL, a propósito, para no importar
 * `portal-sync/index.ts` (que ya importa `authService`) y cerrar un ciclo.
 * Lo implementa `PortalSyncService`; lo inyecta `portal-sync/index.ts` al
 * arrancar, vía `setRegistrar`, DESPUÉS de construirse (ver más abajo).
 */
export type Registrar = {
  importFromPortal(
    userId: number,
    studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string } },
    provision?: ProvisionFn,
    validate?: ValidateFn,
  ): Promise<ImportResult>;
};

const googleClient: GoogleTokenVerifier = new OAuth2Client();
const STUDENT_EMAIL_SUFFIX = "@aloe.ulima.edu.pe";
const TEACHER_EMAIL_SUFFIX = "@ulima.edu.pe";

// Mismo costo por defecto de bcryptjs (10) usado en los hashes existentes de app_user.
const BCRYPT_COST = 10;

// Rate limit: máximo 3 tokens de restablecimiento creados por usuario por hora.
// Configurable por PASSWORD_RESET_MAX_PER_HOUR (default 3, anti-abuso).
const RESET_RATE_LIMIT_MAX_TOKENS = config.auth.passwordResetMaxPerHour;
const RESET_RATE_LIMIT_WINDOW_MINUTES = 60;

// Mensaje genérico: nunca revela si la cuenta existe.
const GENERIC_RESET_REQUEST_MESSAGE = "Si la cuenta existe, enviamos un código a tu correo institucional.";

export class AuthService {
  /**
   * Lo llama `portal-sync/index.ts` al arrancar, con la MISMA instancia de
   * `portalSyncService` (ver el comentario de `Registrar`). Empieza en
   * `null`: si nadie la llama todavía (o el registro está deshabilitado),
   * `register()` responde 503 en vez de un `TypeError` a mitad de camino.
   */
  private registrar: Registrar | null = null;

  constructor(
    readonly repository: AuthRepository,
    readonly events: EventBus,
    private readonly googleTokenVerifier: GoogleTokenVerifier = googleClient,
    /**
     * RS-BE-17. 4º parámetro y OPCIONAL a propósito: los tests existentes
     * construyen `new AuthService(repo, eventBus)` con dos o tres argumentos,
     * y volverlo obligatorio los rompería a todos. Inyectado desde
     * `auth/index.ts` con `new PortalSyncRepository(db)` — importar el
     * *repositorio* no cierra el ciclo; lo que lo cerraría es importar
     * `portal-sync/index.ts`.
     */
    private readonly portalSyncRepository?: PortalSyncRepository,
    /** Mismo patrón que `googleTokenVerifier`: dependencia real por defecto,
     *  reemplazable en tests. */
    private readonly portalClient: PortalClient = defaultPortalClient,
  ) {}

  setRegistrar(registrar: Registrar): void {
    this.registrar = registrar;
  }

  /**
   * RS-BE-17/RS-BE-18: alta de cuenta para un alumno que todavía no existe en
   * la base, autenticando contra miUlima. El portal es quien certifica que la
   * persona es alumna matriculada — nunca una deducción de este backend — y
   * en el mismo acto entrega los datos con los que se crea la cuenta.
   *
   * Todo o nada: la cuenta y la importación del ciclo viven en la MISMA
   * transacción (la que abre `this.registrar.importFromPortal`). Si algo
   * falla — incluida la comprobación de matrícula activa, ver `validate` más
   * abajo — no debe quedar ninguna fila escrita; ver el comentario junto al
   * chequeo de `enrollmentsUpserted`.
   */
  async register(input: {
    code: string; portalPassword: string; passcode: string; password: string;
  }) {
    if (!this.registrar || !this.portalSyncRepository) {
      throw new HttpError(503, "El registro no está disponible.", "REGISTRATION_UNAVAILABLE");
    }
    // Copias locales, no `this.x`: son `readonly`/no reasignables, pero el
    // hook de más abajo las usa dentro de un closure y así queda blindado
    // frente a cualquier análisis de flujo que dude de esa garantía.
    const registrar = this.registrar;
    const portalSyncRepository = this.portalSyncRepository;

    // 409 ANTES de pedirle nada al portal: no se molesta a miUlima por
    // alguien que ya tiene cuenta.
    if (await this.repository.codeExists(input.code)) {
      throw new HttpError(409, "Ya existe una cuenta con ese código.", "USER_ALREADY_EXISTS");
    }

    let cookies: PortalCookies;
    try {
      cookies = await this.portalClient.login(input.code, input.portalPassword, input.passcode);
    } catch (e) {
      // 502 PORTAL_UNAVAILABLE (portal caído, timeout, 5xx, respuesta
      // inesperada) no es un fallo de credenciales y se re-lanza tal cual: la
      // razón por la que el resto se aplasta más abajo —no dar un oráculo que
      // distinga password de passcode— no aplica acá, porque un 502 no revela
      // nada sobre la credencial. Aplastarlo también haría que una caída de
      // miUlima se lea como "credenciales rechazadas" y mande a la gente a
      // cambiar su contraseña sin motivo.
      if (e instanceof HttpError && e.code === "PORTAL_UNAVAILABLE") throw e;
      // Nunca se propaga el detalle del portal: distinguir "contraseña mala"
      // de "passcode malo" le daría a un atacante un oráculo de códigos
      // válidos.
      throw new HttpError(401, "miUlima rechazó las credenciales.", "PORTAL_AUTH_FAILED");
    }

    // A partir de acá la sesión del portal está abierta y hay que cerrarla
    // EXACTAMENTE una vez. `importFromPortal` cierra la suya en su PROPIO
    // `finally` apenas se la invoca —también cuando las cookies se las pasa
    // el llamador, que es siempre este caso—, así que de acá en más la
    // responsabilidad es de `importFromPortal`, no de este método: cerrarla
    // otra vez sería una petición de logout extra a miUlima en cada
    // registro, feliz o fallido, con cookies ya muertas.
    //
    // La única ventana en la que SÍ es responsabilidad de `register` es
    // ANTES de esa llamada: si algo entre el login y `importFromPortal` lanza
    // (hoy, en la práctica, solo `bcrypt.hash`), nadie más conoce esta sesión
    // y quedaría abierta para siempre si no se cierra acá.
    let entregadoAlImport = false;
    try {
      // El hash se calcula ANTES de abrir la transacción: bcrypt cuesta ~100 ms
      // y no tiene por qué mantenerla abierta.
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

      // Lo llena el hook de aprovisionamiento, que corre DENTRO de la
      // transacción de la importación. Se lee después de que
      // `importFromPortal` haya vuelto sin lanzar, o sea con la tx confirmada.
      let creado: { userId: number; studentId: number; code: string } | null = null;

      // A partir de esta línea `importFromPortal` es dueño de `cookies`.
      entregadoAlImport = true;
      const resultado = await registrar.importFromPortal(
        0, 0, { cookies },
        // provision: crea la cuenta como primer paso de la transacción.
        async (tx, identidad) => {
          const base = await portalSyncRepository.findSoleCareerAndCurriculum(tx);
          if (!base) {
            throw new HttpError(422, "No hay carrera configurada.", "PORTAL_IDENTITY_UNVERIFIABLE");
          }
          const perfil = await portalSyncRepository.createStudentAccount(tx, {
            // Del PORTAL, no del body: el body solo sirvió para el login. Si
            // el código del cuerpo y el del portal difieren, gana el portal.
            code: identidad.studentCode,
            fullName: identidad.studentName,
            email: `${identidad.studentCode}@aloe.ulima.edu.pe`,
            passwordHash,
            careerId: base.careerId,
            curriculumId: base.curriculumId,
            careerName: base.careerName,
          });
          creado = { userId: perfil.userId, studentId: perfil.id, code: identidad.studentCode };
          return perfil;
        },
        // validate: comprobación FINAL, dentro de la misma transacción, justo
        // antes de que cierre. Si lanza, `importFromPortal` revierte TODO lo
        // escrito, incluida la cuenta que acaba de crear `provision` — así el
        // 409 de arriba no le cierra el reintento a quien todavía no tiene
        // matrícula. Se lanza acá y no dentro de `provision` porque ahí
        // todavía no se sabe cuántas matrículas trajo la importación.
        (summary) => {
          if (summary.enrollmentsUpserted === 0) {
            throw new HttpError(403, "No figura matrícula en el ciclo activo.", "NOT_ENROLLED");
          }
        },
      );

      if (!creado) {
        throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
      }
      // `creado` se llena dentro del closure de `provision`, así que TS no
      // puede ver esa asignación como parte del flujo lineal de acá y
      // "estrecha" el chequeo de arriba a `never` en vez de al tipo no-nulo.
      // El cast es seguro: en tiempo de ejecución, si `provision` no llegó a
      // correr, `importFromPortal` ya habría lanzado antes de llegar acá.
      const cuenta = creado as { userId: number; studentId: number; code: string };

      // La spec exige "el mismo cuerpo que POST /auth/login": el objeto rico
      // que arma `buildUser` (nombre partido, avatarUrl, especialidades,
      // courseProgress, setupComplete, etc.), no el mínimo con el que
      // `provision` deja constancia de lo que acaba de insertar. Se relee con
      // `findById` —el mismo repositorio que ya usa `reissueToken`— DESPUÉS
      // de que `importFromPortal` volvió, o sea con la cuenta y la matrícula
      // ya confirmadas. `findById` nunca selecciona `password_hash`, así que
      // no hay riesgo de filtrarlo acá.
      const usuario = await this.repository.findById(cuenta.userId, "student");
      if (!usuario) {
        // La transacción ya confirmó (se llegó hasta acá): esto no debería
        // pasar nunca. Se corta con 500 en vez de devolver un cuerpo a medio
        // llenar.
        throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
      }

      return {
        token: this.signToken({
          userId: cuenta.userId,
          studentId: cuenta.studentId,
          code: cuenta.code,
          role: "student",
          tokenVersion: 1, // cuenta recién creada: `app_user.token_version` arranca en 1
        }),
        tokenType: "Bearer",
        expiresIn: config.auth.jwtExpiresIn,
        user: usuario,
        summary: resultado.summary,
      };
    } finally {
      // Solo si NUNCA se llegó a invocar `importFromPortal`: si se llegó,
      // esa llamada ya es dueña de `cookies` y cierra su propia sesión en su
      // propio `finally` (ver el comentario de `entregadoAlImport` más
      // arriba). `PortalClient.logout` ya traga sus propios errores
      // (best-effort), así que no hace falta un `.catch()` acá.
      if (!entregadoAlImport) {
        await this.portalClient.logout(cookies);
      }
    }
  }

  async login(input: { code: string; password: string }) {
    try {
      const user = await this.repository.findByCodeWithPassword(input.code);

      // HU18: si el código no es de un alumno, puede ser de un docente. Un
      // `app_user` es de alumno O de docente, nunca ambos, así que solo se
      // intenta el camino docente cuando no hay perfil de alumno.
      if (!user) {
        return await this.loginTeacher(input);
      }

      const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
      if (!passwordMatches) throw new HttpError(401, "Contraseña incorrecta.", "INVALID_PASSWORD");

      const hasActiveEnrollment = await this.repository.hasActiveEnrollment(user.studentId);
      if (!hasActiveEnrollment) {
        throw new HttpError(403, "El estudiante no tiene una matrícula activa.", "NOT_ENROLLED");
      }

      const representation = await this.repository.findActiveRepresentation(user.studentId);
      const role = representation?.position ?? "student";
      const newTokenVersion = await this.repository.incrementTokenVersion(user.id);

      const safeUser = { ...user, tokenVersion: newTokenVersion };
      delete (safeUser as { passwordHash?: string }).passwordHash;
      const authenticatedUser = { ...safeUser, role };

      return {
        token: this.signToken({
          userId: authenticatedUser.id,
          studentId: authenticatedUser.studentId,
          code: authenticatedUser.code,
          role,
          tokenVersion: newTokenVersion,
        }),
        tokenType: "Bearer",
        expiresIn: config.auth.jwtExpiresIn,
        user: authenticatedUser,
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service login', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  /**
   * HU18: login docente (profesor/JP). No exige matrícula ni consulta
   * representación; firma un JWT con `teacherId` y sin `studentId`. Se llama solo
   * cuando el código no corresponde a un alumno; si tampoco es docente → 401.
   */
  private async loginTeacher(input: { code: string; password: string }) {
    const teacher = await this.repository.findTeacherByCodeWithPassword(input.code);
    if (!teacher) throw new HttpError(401, "Código no encontrado en la base de datos.", "USER_NOT_FOUND");

    const passwordMatches = await bcrypt.compare(input.password, teacher.passwordHash);
    if (!passwordMatches) throw new HttpError(401, "Contraseña incorrecta.", "INVALID_PASSWORD");

    const newTokenVersion = await this.repository.incrementTokenVersion(teacher.id);

    const safeTeacher = { ...teacher, tokenVersion: newTokenVersion };
    delete (safeTeacher as { passwordHash?: string }).passwordHash;

    return {
      token: this.signToken({
        userId: safeTeacher.id,
        teacherId: safeTeacher.teacherId,
        code: safeTeacher.code,
        role: "teacher",
        tokenVersion: newTokenVersion,
      }),
      tokenType: "Bearer",
      expiresIn: config.auth.jwtExpiresIn,
      user: safeTeacher,
    };
  }

  async loginWithGoogle(input: { idToken: string }) {
    try {
      let ticket: Awaited<ReturnType<GoogleTokenVerifier["verifyIdToken"]>>;
      try {
        ticket = await this.googleTokenVerifier.verifyIdToken({
          idToken: input.idToken,
        });
      } catch {
        // Firma, issuer o expiración inválidos son un fallo de credencial,
        // no un error interno. Los errores posteriores de BD conservan 500.
        throw new HttpError(401, "Token de Google inválido.", "INVALID_TOKEN");
      }
      const payload = ticket.getPayload();

      if (!payload || !payload.email) {
        throw new HttpError(401, "Token de Google inválido.", "INVALID_TOKEN");
      }

      const email = payload.email.trim().toLowerCase();
      if (!email) {
        throw new HttpError(401, "Token de Google inválido.", "INVALID_TOKEN");
      }

      const isStudentEmail = email.endsWith(STUDENT_EMAIL_SUFFIX);
      const isTeacherEmail = email.endsWith(TEACHER_EMAIL_SUFFIX);

      if (!isStudentEmail && !isTeacherEmail) {
        throw new HttpError(
          403,
          "Debe usar un correo institucional (@aloe.ulima.edu.pe o @ulima.edu.pe).",
          "INVALID_DOMAIN",
        );
      }

      // HU18: el dominio docente habilita el lookup del perfil, pero no otorga
      // el rol por sí solo. La cuenta debe estar vinculada a teacher.user_id.
      if (isTeacherEmail) {
        const teacher = await this.repository.findTeacherByEmail(email);
        if (!teacher) {
          throw new HttpError(401, "Usuario no registrado en la base de datos.", "USER_NOT_FOUND");
        }

        if (payload.sub) {
          await this.repository.linkGoogleId(teacher.id, payload.sub);
        }

        const newTokenVersion = await this.repository.incrementTokenVersion(teacher.id);
        const authenticatedTeacher = { ...teacher, tokenVersion: newTokenVersion };

        return {
          token: this.signToken({
            userId: authenticatedTeacher.id,
            teacherId: authenticatedTeacher.teacherId,
            code: authenticatedTeacher.code,
            role: "teacher",
            tokenVersion: newTokenVersion,
          }),
          tokenType: "Bearer",
          expiresIn: config.auth.jwtExpiresIn,
          user: authenticatedTeacher,
        };
      }

      const user = await this.repository.findByEmail(email);
      if (!user) throw new HttpError(401, "Usuario no registrado en la base de datos.", "USER_NOT_FOUND");

      // Vincular la cuenta de Google: guarda el `sub` (ID único de Google) como google_id.
      if (payload.sub) {
        await this.repository.linkGoogleId(user.id, payload.sub);
      }

      const hasActiveEnrollment = await this.repository.hasActiveEnrollment(user.studentId);
      if (!hasActiveEnrollment) {
        throw new HttpError(403, "El estudiante no tiene una matrícula activa.", "NOT_ENROLLED");
      }

      const representation = await this.repository.findActiveRepresentation(user.studentId);
      const role = representation?.position ?? "student";
      const newTokenVersion = await this.repository.incrementTokenVersion(user.id);

      const authenticatedUser = { ...user, tokenVersion: newTokenVersion, role };

      return {
        token: this.signToken({
          userId: authenticatedUser.id,
          studentId: authenticatedUser.studentId,
          code: authenticatedUser.code,
          role,
          tokenVersion: newTokenVersion,
        }),
        tokenType: "Bearer",
        expiresIn: config.auth.jwtExpiresIn,
        user: authenticatedUser,
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service loginWithGoogle', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  async logout(userId: number) {
    try {
      await this.repository.incrementTokenVersion(userId);
    } catch (e) {
      console.error('DB Error in auth.service logout', e);
    }
  }

  async me(userId: number, role: AppRole) {
    try {
      // HU18: los docentes tienen su propio shape (sin datos de alumno).
      if (role === "teacher") {
        const teacher = await this.repository.findTeacherById(userId);
        if (!teacher) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");
        return { user: teacher };
      }

      // El cargo se RECALCULA, no se repite el claim del token.
      //
      // El rol viaja firmado y solo se computaba al iniciar sesión, así que un
      // delegado del ciclo pasado seguía viéndose como delegado hasta que el
      // JWT venciera (24 h por defecto). Como `findActiveRepresentation` ya
      // filtra por período activo, basta con volver a preguntarle: la app
      // llama a /auth/me al arrancar y tras sincronizar, así que la pestaña
      // aparece y desaparece sola.
      //
      // Esto NO reemplaza al token: `requireRole` sigue leyendo el claim. Lo
      // que corrige es lo que la app MUESTRA, que es donde se ve el problema.
      const base = await this.repository.findById(userId, "student");
      if (!base) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");

      const representacion = await this.repository.findActiveRepresentation(base.studentId);
      const user = { ...base, role: representacion?.position ?? ("student" as AppRole) };
      if (!user) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");
      return { user };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service me', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  /**
   * RS-18 (delegados desde el portal): re-emite el JWT del alumno cuando la
   * importación acaba de promoverlo a delegado o subdelegado, para que el rol
   * nuevo viaje en el token sin obligarlo a volver a iniciar sesión.
   *
   * **NO se llama a `incrementTokenVersion`, y no es un olvido del patrón que
   * usa el login.** Se re-firma con el `token_version` VIGENTE y lo único que
   * cambia es `role`; ese es el motivo entero de que este método exista en vez
   * de reusar el camino de login. Hay Single Active Session: `authMiddleware`
   * compara el `tokenVersion` del JWT contra `app_user.token_version` en CADA
   * petición y responde 401 si difieren. Incrementarlo acá invalidaría el token
   * que la app está usando en ese mismo instante —el de la importación en
   * curso—, y el `ApiClient` de Flutter trata TODO 401 como expiración de
   * sesión y cierra la sesión: darle a alguien el rol de delegado lo echaría de
   * la app. Es la misma razón por la que portal-sync eligió 409 y no 401 para
   * la sesión inválida del portal. Quien "arregle" esto agregando el
   * incremento rompe la feature completa.
   *
   * El `role` llega calculado por el llamador con `findActiveRepresentation`
   * DESPUÉS de que la transacción confirmó, nunca derivado del claim recién
   * promovido: a alguien que ya era `delegate` en otra sección no se lo puede
   * degradar a `subdelegate` por una promoción nueva.
   *
   * Los demás campos que `signToken` exige (`code`, `studentId`) y la versión
   * se releen de la BD con `findById` —el mismo repositorio del que los saca el
   * login— en vez de recibirlos por parámetro: así se firma la versión que
   * `app_user` tiene AHORA. Entre el login del alumno y esta re-emisión pudo
   * haber un cambio de contraseña, que sí sube la versión
   * (`updatePasswordAndInvalidateSessions`); firmar una versión traída de
   * memoria emitiría un token nacido muerto.
   *
   * Devuelve `null` en lugar de lanzar cuando el usuario no se puede leer: la
   * promoción ya quedó confirmada en BD y un fallo acá no puede tumbar una
   * importación que ya escribió notas, horario y matrícula (RQ-6). Sin token
   * nuevo el rol solo queda rancio hasta el próximo login y no otorga nada
   * —`SectionManagementService.requireRepresentative` revalida sección por
   * sección—, que es exactamente la degradación simétrica que RS-18 ya acepta
   * en el caso contrario (al representante desactivado tampoco se le toca la
   * sesión). El campo del contrato es `ImportResult.token: string | null`.
   */
  async reissueToken(userId: number, role: AppRole): Promise<string | null> {
    // Un token docente lleva `teacherId` y no `studentId`, y ningún docente se
    // promueve desde la importación: `section_representative` cuelga de
    // `enrollment`, que es de alumno. Se corta acá para no firmar nunca un
    // token de alumno con rol docente, que `authMiddleware` rechazaría con 401
    // por falta de la claim que ese rol exige.
    if (role === "teacher") return null;

    try {
      const user = await this.repository.findById(userId, role);
      // Sin fila de alumno no hay `studentId` que firmar. No se inventa el
      // token: el llamador reporta `token: null` y el rol se actualiza solo
      // en el próximo login.
      if (!user) return null;

      return this.signToken({
        userId: user.id,
        studentId: user.studentId,
        code: user.code,
        role,
        // Versión vigente leída de app_user, deliberadamente sin incrementar.
        tokenVersion: user.tokenVersion,
      });
    } catch (e) {
      console.error('DB Error in auth.service reissueToken', e);
      return null;
    }
  }

  /**
   * HU20: solicita un código de restablecimiento por código de alumno o correo
   * institucional. Siempre responde el mismo mensaje genérico (200), exista o
   * no la cuenta, para no permitir enumeración de usuarios.
   */
  async requestPasswordReset(input: { identifier: string }) {
    const genericResponse = { message: GENERIC_RESET_REQUEST_MESSAGE };
    try {
      const user = await this.repository.findUserForPasswordReset(input.identifier);
      if (!user) return genericResponse;

      await this.issuePasswordResetToken(user);
      return genericResponse;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service requestPasswordReset', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  /**
   * HU20: igual que `requestPasswordReset`, pero para el usuario autenticado
   * (JWT). Responde el correo enmascarado para que el frontend lo muestre.
   */
  async requestPasswordResetForCurrentUser(userId: number) {
    try {
      const user = await this.repository.findUserForPasswordResetById(userId);
      if (!user) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");

      await this.issuePasswordResetToken(user);
      return {
        message: "Enviamos un código a tu correo institucional.",
        email: maskEmail(user.institutionalEmail),
      };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service requestPasswordResetForCurrentUser', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  /**
   * HU20: confirma el código y cambia la contraseña. En cualquier fallo del
   * código responde el mismo 400 genérico ("Código inválido o expirado.") sin
   * distinguir si el usuario existe. En éxito invalida todas las sesiones.
   */
  /**
   * Comprueba el código SIN consumir el token (RS-AUTH-17 a RS-AUTH-19).
   *
   * Existe porque el frontend dejaba pasar cualquier código de seis dígitos a
   * la pantalla de contraseña nueva: solo validaba el formato en local, y el
   * código real recién se contrastaba al confirmar, cuando el usuario ya había
   * escrito la contraseña dos veces y gastado un intento sin saberlo.
   *
   * NO marca el token como usado: `/confirm` tiene que poder gastarlo después
   * con el mismo código. Sí reserva un intento, por la misma razón que
   * `/confirm` — sin la reserva atómica, N peticiones concurrentes podrían
   * saltarse el límite leyendo un `attempts` obsoleto. Por eso RS-AUTH-22 sube
   * el máximo a 6: un flujo correcto ahora gasta dos.
   *
   * Nunca es un permiso: `/confirm` vuelve a validar por su cuenta, así que un
   * cliente que la llame directo se comporta exactamente como antes.
   */
  async verifyPasswordResetCode(input: { identifier: string; code: string }) {
    try {
      const user = await this.repository.findUserForPasswordReset(input.identifier);
      if (!user) throw this.invalidResetCodeError();

      const token = await this.repository.findLatestPasswordResetToken(user.id);
      if (!token) throw this.invalidResetCodeError();

      const consumed = await this.repository.consumePasswordResetAttempt(token.id, MAX_RESET_ATTEMPTS);
      if (!consumed) throw this.invalidResetCodeError();

      const validation = validateResetToken({
        tokenHash: consumed.tokenHash,
        expiresAt: consumed.expiresAt,
        usedAt: consumed.usedAt,
        // El intento en curso ya quedó reservado; se descuenta para que la
        // validación pura no lo cuente dos veces.
        attempts: consumed.attempts - 1,
        now: new Date(),
        candidateOtp: input.code,
      });

      if (validation.status !== "ok") throw this.invalidResetCodeError();

      // No se devuelve cuántos intentos quedan: sería un oráculo.
      return { valid: true as const };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service verifyPasswordResetCode', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  async confirmPasswordReset(input: { identifier: string; code: string; newPassword: string }) {
    try {
      // Este error sí puede ser específico: no revela existencia de la cuenta.
      if (!validateNewPassword(input.newPassword)) {
        throw new HttpError(
          400,
          `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
          "WEAK_PASSWORD",
        );
      }

      const user = await this.repository.findUserForPasswordReset(input.identifier);
      if (!user) throw this.invalidResetCodeError();

      const token = await this.repository.findLatestPasswordResetToken(user.id);
      if (!token) throw this.invalidResetCodeError();

      // Reservar el intento de forma atómica ANTES de comparar: el UPDATE
      // condicional (attempts < máximo AND used_at IS NULL) no devuelve fila
      // si el token está usado o agotado, de modo que N peticiones
      // concurrentes no pueden superar el límite de intentos leyendo un
      // valor obsoleto de `attempts`.
      const consumed = await this.repository.consumePasswordResetAttempt(token.id, MAX_RESET_ATTEMPTS);
      if (!consumed) throw this.invalidResetCodeError();

      const validation = validateResetToken({
        tokenHash: consumed.tokenHash,
        expiresAt: consumed.expiresAt,
        usedAt: consumed.usedAt,
        // El intento en curso ya quedó reservado en BD; se descuenta para
        // que la validación pura no lo cuente dos veces.
        attempts: consumed.attempts - 1,
        now: new Date(),
        candidateOtp: input.code,
      });

      if (validation.status !== "ok") throw this.invalidResetCodeError();

      const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
      // Marcar el token como usado primero: si la actualización fallara, el
      // código ya no puede reutilizarse (un solo uso).
      await this.repository.markPasswordResetTokenUsed(token.id);
      await this.repository.updatePasswordAndInvalidateSessions(user.id, passwordHash);

      return { message: "Contraseña actualizada correctamente." };
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error('DB Error in auth.service confirmPasswordReset', e);
      throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
    }
  }

  /**
   * Aplica el rate limit, invalida tokens previos, crea el token nuevo y envía
   * el correo. Si el usuario excedió el límite, no hace nada (la respuesta al
   * cliente sigue siendo la genérica). El envío de correo nunca lanza errores.
   *
   * Trade-off aceptado (documentado en la revisión de HU20): el `await` del
   * envío hace que la latencia de /request difiera entre cuentas existentes y
   * no existentes (oráculo de timing). No se envía en segundo plano porque en
   * Vercel serverless el trabajo posterior a la respuesta puede no ejecutarse
   * (el correo no llegaría). Mitigación real: el rate limit corta la señal a
   * partir del cuarto intento por usuario; una cola de correos queda como
   * mejora futura.
   */
  private async issuePasswordResetToken(user: PasswordResetUser): Promise<void> {
    const since = new Date(Date.now() - RESET_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    const recentTokens = await this.repository.countRecentPasswordResetTokens(user.id, since);
    if (recentTokens >= RESET_RATE_LIMIT_MAX_TOKENS) return;

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

    await this.repository.invalidateActivePasswordResetTokens(user.id);
    await this.repository.createPasswordResetToken(user.id, hashOtp(otp), expiresAt);
    await sendPasswordResetEmail({
      to: user.institutionalEmail,
      otp,
      expiresMinutes: OTP_EXPIRATION_MINUTES,
    });
  }

  private invalidResetCodeError() {
    return new HttpError(400, "Código inválido o expirado.", "INVALID_RESET_CODE");
  }

  private signToken(input: { userId: number; code: string; role: AppRole; tokenVersion: number; studentId?: number; teacherId?: number }) {
    return jwt.sign(
      {
        sub: input.userId,
        // Un token es de alumno (studentId) o de docente (teacherId), nunca
        // ambos: se emite solo la claim presente.
        ...(input.studentId != null ? { studentId: input.studentId } : {}),
        ...(input.teacherId != null ? { teacherId: input.teacherId } : {}),
        code: input.code,
        role: input.role,
        tokenVersion: input.tokenVersion,
      },
      config.auth.jwtSecret,
      {
        algorithm: "HS256",
        expiresIn: config.auth.jwtExpiresIn,
      },
    );
  }
}
