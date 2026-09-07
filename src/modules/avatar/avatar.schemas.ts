import { z } from "zod";

/** La `version` la devuelve Cloudinary al subir; entra en la URL y hace de
 *  rompe-caché. Se acepta solo como dígitos para que no pueda inyectar nada en
 *  la ruta que se construye con ella. */
export const confirmarAvatarSchema = z.object({
  version: z.union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => /^\d{1,20}$/.test(v), "La versión debe ser numérica"),
});

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});
