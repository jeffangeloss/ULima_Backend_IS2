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

/**
 * RS-BE-17: `code` es el único campo con forma propia (código de alumno,
 * `^\d{6,10}$`, igual que exige la spec de registro). `portalPassword` y
 * `passcode` son las credenciales de miUlima: no se valida su forma más allá
 * de no estar vacías porque el portal es quien las juzga. `password` sigue la
 * misma regla laxa que el resto del módulo (login, SSO, password-reset):
 * endurecerla es una decisión de producto que abarca los tres endpoints y
 * queda anotada como deuda, no entra en esta feature.
 */
export const registerSchema = z.object({
  code: z.string().regex(/^\d{6,10}$/),
  portalPassword: z.string().min(1),
  passcode: z.string().min(1),
  password: z.string().min(1),
});
