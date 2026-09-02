import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
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
    .refine((v) => new URL(v).host === "webaloe.ulima.edu.pe", "PORTAL_BASE_URL debe apuntar a webaloe.ulima.edu.pe"),
  PORTAL_TIMEOUT_MS: z.string().optional().transform((v) => {
    const n = parseInt(v ?? "8000", 10);
    return Number.isInteger(n) && n > 0 ? n : 8000;
  }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Error de validación en las variables de entorno:");
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
