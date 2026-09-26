import { HttpError } from "../../shared/errors/http-error.js";

/**
 * RS-BE-50 · guarda de inicio de sesión en curso y tope de rechazos.
 *
 * Los comparten POST /portal-sync/refresh y POST /portal-sync/import con
 * credentials, porque los dos inician sesión en la misma cuenta de miUlima.
 * Dos inicios casi simultáneos gastan el mismo código de un solo uso, y el
 * segundo se leería como un rechazo, y tres rechazos seguidos pueden bloquear
 * la cuenta del alumno en la Universidad.
 *
 * LÍMITE DEL MECANISMO. Vive en la memoria de cada instancia, como los
 * limitadores de `rate-limit.ts`, así que no es un límite global.
 */

const VENTANA_RECHAZOS_MS = 15 * 60 * 1000;
const TOPE_RECHAZOS = 3;

export type TipoInicioSesion = "refresh" | "import";

export const refreshInProgress = (): HttpError =>
  new HttpError(409, "Ya hay una lectura de miUlima en curso. Espera a que termine.", "PORTAL_REFRESH_IN_PROGRESS");

export const tooManyRejectedLogins = (minutos: number): HttpError =>
  new HttpError(
    429,
    `Demasiados intentos con datos rechazados. Intenta de nuevo en ${minutos} minuto(s).`,
    "RATE_LIMITED",
    { retryAfterMinutes: minutos, kind: "rejected_logins" },
  );

export class PortalLoginGuard {
  private readonly enCurso = new Map<number, Record<TipoInicioSesion, number>>();
  private readonly rechazos = new Map<number, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Marca un inicio de sesión en curso. La recarga no entra si hay cualquier
   * otro en curso, y la importación no entra si hay una recarga. Entre dos
   * importaciones rige lo de hoy.
   */
  tryStart(studentId: number, kind: TipoInicioSesion): boolean {
    const actual = this.enCurso.get(studentId) ?? { refresh: 0, import: 0 };
    if (actual.refresh > 0) return false;
    if (kind === "refresh" && actual.import > 0) return false;
    actual[kind]++;
    this.enCurso.set(studentId, actual);
    return true;
  }

  /** Suelta la marca. Va siempre en un `finally`, después del cierre de sesión. */
  finish(studentId: number, kind: TipoInicioSesion): void {
    const actual = this.enCurso.get(studentId);
    if (!actual) return;
    actual[kind] = Math.max(0, actual[kind] - 1);
    if (actual.refresh === 0 && actual.import === 0) this.enCurso.delete(studentId);
  }

  /** Minutos hasta que el alumno vuelva a tener menos de tres rechazos en la ventana, o null. */
  rejectedLoginsWait(studentId: number): number | null {
    const vigentes = this.vigentes(studentId);
    if (vigentes.length < TOPE_RECHAZOS) return null;
    const libre = vigentes[vigentes.length - TOPE_RECHAZOS]! + VENTANA_RECHAZOS_MS;
    return Math.max(1, Math.ceil((libre - this.now()) / 60_000));
  }

  /** Suma un PORTAL_LOGIN_REJECTED. Devolver el cupo por hora no lo borra. */
  recordRejectedLogin(studentId: number): void {
    this.rechazos.set(studentId, [...this.vigentes(studentId), this.now()]);
  }

  private vigentes(studentId: number): number[] {
    const desde = this.now() - VENTANA_RECHAZOS_MS;
    const vigentes = (this.rechazos.get(studentId) ?? []).filter((t) => t > desde);
    if (vigentes.length) this.rechazos.set(studentId, vigentes);
    else this.rechazos.delete(studentId);
    return vigentes;
  }
}

/** La instancia única que comparten la importación y la recarga (index.ts). */
export const portalLoginGuard = new PortalLoginGuard();
