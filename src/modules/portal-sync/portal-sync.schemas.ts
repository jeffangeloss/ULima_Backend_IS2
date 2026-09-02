import { z } from "zod";

const cookie = z.string().min(1).max(4096);

/** `.strip()` es deliberado: cualquier cookie extra se descarta, no se reenvía al portal. */
export const importCookiesSchema = z.object({
  cookies: z.object({
    JSESSIONID: cookie,
    LtpaToken2: cookie,
    LtpaToken: cookie.optional(),
  }).strip(),
});

export type ImportCookiesDto = z.infer<typeof importCookiesSchema>;
