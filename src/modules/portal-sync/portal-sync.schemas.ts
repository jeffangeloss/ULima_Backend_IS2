import { z } from "zod";

const cookie = z.string().min(1).max(4096);

/** `.strip()` es deliberado: cualquier cookie extra se descarta, no se reenvía al portal. */
const cookiesObject = z.object({
  JSESSIONID: cookie,
  LtpaToken2: cookie,
  LtpaToken: cookie.optional(),
}).strip();

/**
 * Credenciales de miUlima. NO incluye el usuario: el usuario del portal es el
 * código del alumno, que el backend ya tiene en `app_user.code` a partir del
 * JWT. Pedirlo acá sería innecesario y abriría una vía para importar en nombre
 * de otro alumno.
 *
 * Ni la contraseña ni el passcode se registran, se persisten ni aparecen en
 * ningún mensaje de error (ver §Login con credenciales en la spec).
 */
const credentialsObject = z.object({
  password: z.string().min(1).max(200),
  // RSA SecurID a través de Google Authenticator: 6 dígitos. Se aceptan 6 a 8
  // por si alguna cuenta usa un largo distinto; cualquier cosa que no sean
  // dígitos se rechaza antes de tocar el portal.
  passcode: z.string().regex(/^\d{6,8}$/, "El código del authenticator son 6 dígitos"),
}).strip();

/**
 * El body trae `cookies` **o** `credentials`, exactamente uno.
 *
 * Se modela con dos campos opcionales y un refine en vez de `z.union` para que
 * el error que ve el cliente diga qué falta, en lugar de la lista de fallos de
 * las dos ramas.
 */
export const importSchema = z.object({
  cookies: cookiesObject.optional(),
  credentials: credentialsObject.optional(),
}).refine(
  (d) => (d.cookies === undefined) !== (d.credentials === undefined),
  { message: "Manda `cookies` o `credentials`, exactamente uno de los dos." },
);

export type ImportDto = z.infer<typeof importSchema>;

/** Compatibilidad: el nombre viejo, cuando el body solo aceptaba cookies. */
export const importCookiesSchema = importSchema;
export type ImportCookiesDto = ImportDto;
