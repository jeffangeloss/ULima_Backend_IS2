import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Lógica pura del flujo de restablecimiento de contraseña (HU20).
 * Sin acceso a base de datos ni efectos: todo es testeable con `bun test`.
 *
 * Política: OTP de 6 dígitos, expiración de 30 minutos, máximo 6 intentos,
 * un solo uso, contraseña nueva de mínimo 8 caracteres.
 */

export const OTP_LENGTH = 6;
export const OTP_EXPIRATION_MINUTES = 30;
/**
 * Intentos por token. Son 6 y no 5 desde RS-AUTH-22: un flujo correcto gasta
 * DOS (uno en `/password-reset/verify`, otro en `/password-reset/confirm`), así
 * que con 6 el presupuesto de equivocaciones del usuario sigue siendo 4, el
 * mismo que cuando solo existía `/confirm`.
 */
export const MAX_RESET_ATTEMPTS = 6;
export const MIN_PASSWORD_LENGTH = 8;

/** Genera un OTP de 6 dígitos con aleatoriedad criptográficamente segura. */
export const generateOtp = (): string =>
  randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");

/** SHA-256 en hex (64 caracteres) del OTP; solo el hash se persiste. */
export const hashOtp = (otp: string): string =>
  createHash("sha256").update(otp).digest("hex");

export type ResetTokenValidation =
  | { status: "ok" }
  | { status: "expired" }
  | { status: "already_used" }
  | { status: "too_many_attempts" }
  | { status: "mismatch" };

export type ValidateResetTokenInput = {
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  now: Date;
  candidateOtp: string;
};

/**
 * Valida un OTP candidato contra el estado persistido del token.
 * Orden de evaluación: uso previo → expiración → intentos → comparación de hash.
 * La comparación de hashes es en tiempo constante (`timingSafeEqual`).
 */
export const validateResetToken = (input: ValidateResetTokenInput): ResetTokenValidation => {
  if (input.usedAt != null) return { status: "already_used" };
  if (input.now.getTime() >= input.expiresAt.getTime()) return { status: "expired" };
  if (input.attempts >= MAX_RESET_ATTEMPTS) return { status: "too_many_attempts" };

  const candidateHash = Buffer.from(hashOtp(input.candidateOtp), "hex");
  const storedHash = Buffer.from(input.tokenHash, "hex");
  const matches = candidateHash.length === storedHash.length && timingSafeEqual(candidateHash, storedHash);
  if (!matches) return { status: "mismatch" };

  return { status: "ok" };
};

/** La nueva contraseña debe tener al menos 8 caracteres. */
export const validateNewPassword = (password: string): boolean =>
  password.length >= MIN_PASSWORD_LENGTH;

/**
 * Enmascara un correo para mostrarlo sin exponerlo completo.
 * Ej.: "20235218@aloe.ulima.edu.pe" → "2023****@aloe.ulima.edu.pe".
 */
export const maskEmail = (email: string): string => {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "****";
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visibleLength = Math.min(4, Math.max(1, local.length - 1));
  return `${local.slice(0, visibleLength)}****${domain}`;
};
