import { env } from "./env.js";

export const config = {
  db: {
    url: env.DATABASE_URL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    passwordResetMaxPerHour: env.PASSWORD_RESET_MAX_PER_HOUR,
  },
  email: {
    resendApiKey: env.RESEND_API_KEY,
    resendFrom: env.RESEND_FROM,
    replyTo: env.RESEND_REPLY_TO,
  },
  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
    databaseUrl: env.FIREBASE_DATABASE_URL,
  },
  server: {
    port: env.PORT,
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === "production",
    isDevelopment: env.NODE_ENV === "development",
    corsOrigins: env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? [],
  },
  chatbot: {
    cohereApiKey: env.COHERE_API_KEY,
    rateLimit: env.CHATBOT_RATE_LIMIT,
  },
  portal: {
    baseUrl: env.PORTAL_BASE_URL,
    timeoutMs: env.PORTAL_TIMEOUT_MS,
  },
  syllabus: {
    baseUrl: env.SYLLABUS_BASE_URL,
  },
} as const;

export type AppConfig = typeof config;
