import "dotenv/config";
import { z } from "zod";

/** Host único permitido para el portal. La URL base NUNCA puede depender de
 *  quien llama: el endpoint acepta cookies del cliente y hace peticiones
 *  salientes, así que el destino tiene que estar fijado aquí (anti-SSRF). */
export const PORTAL_ALLOWED_HOST = "webaloe.ulima.edu.pe";

export const isAllowedPortalBaseUrl = (value: string): boolean => {
  try {
    return new URL(value).host === PORTAL_ALLOWED_HOST;
  } catch {
    return false;
  }
};

/** Host único permitido para la base Domino de sílabos. Variable SEPARADA de
 *  `PORTAL_ALLOWED_HOST` (y con su propio predicado) a propósito: si fueran
 *  una sola variable aceptando dos hosts, cualquiera de los dos sistemas
 *  podría apuntarse al otro. Con dos variables, cada una fija a un solo host,
 *  eso no es posible (anti-SSRF). */
export const SYLLABUS_ALLOWED_HOST = "cactus.ulima.edu.pe";

export const isAllowedSyllabusBaseUrl = (value: string): boolean => {
  try {
    return new URL(value).host === SYLLABUS_ALLOWED_HOST;
  } catch {
    return false;
  }
};

/** RS-BE-50. Límites de PORTAL_REFRESH_BUDGET_MS (decisión 4 de recarga-portal.spec.md). */
export const REFRESH_BUDGET_MIN_MS = 20_000;
export const REFRESH_BUDGET_MAX_MS = 65_000;
export const REFRESH_BUDGET_DEFAULT_MS = 60_000;

/**
 * RS-BE-50. Presupuesto efectivo de la recarga. A los 90 s de la app se les
 * restan una petición en vuelo y el cierre de sesión (2 · PORTAL_TIMEOUT_MS),
 * 6 s para la transacción y la respuesta y 3 s para la red del teléfono, así
 * que el peor caso de la respuesta nunca pasa de 87 s.
 */
export const effectiveRefreshBudgetMs = (budgetMs: number, timeoutMs: number): number =>
  Math.min(budgetMs, 81_000 - 2 * timeoutMs);

export const envSchema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL debe ser una URL de conexión válida de PostgreSQL"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET debe tener al menos 8 caracteres"),
  JWT_EXPIRES_IN: z.string().optional()
    .transform((v) => parseInt(v ?? "86400", 10))
    .refine((v) => Number.isInteger(v) && v > 0, "JWT_EXPIRES_IN debe ser un entero positivo"),
  PORT: z.string().optional().transform((v) => parseInt(v ?? "3000", 10)),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
  // Lista de orígenes permitidos para CORS, separados por coma.
  // Si no se define, se mantiene comportamiento permisivo (*) — restringir en producción.
  CORS_ORIGINS: z.string().optional(),
  // Clave de API de Resend para enviar correos transaccionales (restablecer contraseña).
  // Si está vacía y NODE_ENV !== 'production', el OTP se loguea en consola con prefijo [DEV ONLY].
  RESEND_API_KEY: z.string().optional().default(""),
  // Cloudinary (fotos de perfil). Opcionales: sin ellas la app funciona igual y
  // todos se ven con iniciales, que es el estado de hoy. El SECRET nunca sale
  // del backend y se define como variable de entorno en Vercel: el repo es
  // público y el APK es descargable por cualquiera.
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(""),
  CLOUDINARY_API_KEY: z.string().optional().default(""),
  CLOUDINARY_API_SECRET: z.string().optional().default(""),
  // Remitente de los correos enviados con Resend, formato "Nombre <correo@dominio>".
  // Default = dominio verificado del proyecto (DKIM/SPF/DMARC en mail.grupo5app.lat):
  // así, aun si RESEND_FROM no está seteada en algún entorno, NO se envía desde
  // onboarding@resend.dev (Gmail lo mira con más sospecha). En Vercel debe estar
  // igualmente seteada RESEND_FROM con este mismo valor.
  // OJO: NO usar un buzón "no-reply" en el local-part — Resend/Gmail lo marcan
  // como señal de spam. Usamos "notificaciones@" (dirección con propósito claro).
  RESEND_FROM: z.string().optional().default("ULima+ <notificaciones@mail.grupo5app.lat>"),
  // Dirección de respuesta (Reply-To). Conviene un buzón REAL y monitoreado:
  // que los correos puedan responderse mejora la entregabilidad (Gmail toma la
  // interacción como señal positiva) y evita el patrón "solo no-reply". Si está
  // vacía, no se agrega Reply-To. Setear también en Vercel.
  RESEND_REPLY_TO: z.string().optional().default(""),
  // Máximo de códigos de restablecimiento por usuario por hora. Default 3
  // (anti-abuso); subirlo solo temporalmente en períodos de prueba/QA.
  PASSWORD_RESET_MAX_PER_HOUR: z.string().optional().transform((v) => {
    const n = parseInt(v ?? "3", 10);
    return Number.isInteger(n) && n > 0 ? n : 3;
  }),
  // Firebase Admin SDK (HU23 chat). Opcionales para no romper módulos que no
  // usan chat; el servicio de chat debe validar presencia antes de firmar tokens.
  FIREBASE_PROJECT_ID: z.string().optional().default(""),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional().or(z.literal("")).default(""),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(""),
  FIREBASE_DATABASE_URL: z.string().url().optional().or(z.literal("")).default(""),
  COHERE_API_KEY: z.string().min(1, "COHERE_API_KEY es requerida para el chatbot"),
  CHATBOT_RATE_LIMIT: z.string().optional().transform((v) => {
    const n = parseInt(v ?? "20", 10);
    return Number.isInteger(n) && n > 0 ? n : 20;
  }),
  // portal-sync (miUlima). Host FIJO por seguridad: si se cambia, debe seguir
  // siendo webaloe.ulima.edu.pe; cualquier otro valor es rechazado (anti-SSRF).
  PORTAL_BASE_URL: z.string().url().optional().default("https://webaloe.ulima.edu.pe")
    .refine(isAllowedPortalBaseUrl, "PORTAL_BASE_URL debe apuntar a webaloe.ulima.edu.pe"),
  PORTAL_TIMEOUT_MS: z.string().optional().transform((v) => {
    const n = parseInt(v ?? "8000", 10);
    return Number.isInteger(n) && n > 0 ? n : 8000;
  }),
  // RS-BE-50. Presupuesto de tiempo de POST /portal-sync/refresh, en ms. Un
  // valor fuera de 20 000 a 65 000 detiene el arranque en vez de caer en
  // silencio al valor por defecto, porque de él depende el plazo de la app.
  PORTAL_REFRESH_BUDGET_MS: z.string().optional().transform((v, ctx) => {
    const n = Number(v ?? String(REFRESH_BUDGET_DEFAULT_MS));
    if (!Number.isInteger(n) || n < REFRESH_BUDGET_MIN_MS || n > REFRESH_BUDGET_MAX_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PORTAL_REFRESH_BUDGET_MS debe ser un entero entre 20000 y 65000",
      });
      return z.NEVER;
    }
    return n;
  }),
  // Sílabos (base Domino ac_bd001.nsf). Host FIJO por seguridad, igual que
  // PORTAL_BASE_URL pero con su propia allowlist: debe seguir siendo
  // cactus.ulima.edu.pe; cualquier otro valor es rechazado (anti-SSRF).
  SYLLABUS_BASE_URL: z.string().url().optional().default("https://cactus.ulima.edu.pe")
    .refine(isAllowedSyllabusBaseUrl, "SYLLABUS_BASE_URL debe apuntar a cactus.ulima.edu.pe"),
}).superRefine((e, ctx) => {
  // RS-BE-50. Con un PORTAL_TIMEOUT_MS mayor que 30 500 el presupuesto efectivo
  // queda bajo 20 000 y la recarga no alcanzaría a leer nada.
  if (typeof e.PORTAL_REFRESH_BUDGET_MS !== "number" || typeof e.PORTAL_TIMEOUT_MS !== "number") return;
  if (effectiveRefreshBudgetMs(e.PORTAL_REFRESH_BUDGET_MS, e.PORTAL_TIMEOUT_MS) < REFRESH_BUDGET_MIN_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PORTAL_TIMEOUT_MS"],
      message: "PORTAL_TIMEOUT_MS deja el presupuesto de la recarga bajo 20000 ms",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Error de validación en las variables de entorno:");
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
