import { z } from "zod";

export const loginSchema = z.object({
  code: z.string().min(1),
  password: z.string().min(1),
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});

// `identifier` acepta código de alumno o correo institucional.
export const passwordResetRequestSchema = z.object({
  identifier: z.string().min(1),
});

// La longitud mínima de `newPassword` se valida en el service con
// `validateNewPassword` para responder con un mensaje claro en español.
/** RS-AUTH-17: solo comprueba el código, sin contraseña nueva. */
export const passwordResetVerifySchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(1),
});

export const passwordResetConfirmSchema = z.object({
  identifier: z.string().min(1),
  code: z.string().min(1),
  newPassword: z.string().min(1),
});
