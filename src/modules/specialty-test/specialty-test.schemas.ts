/**
 * Zod del test de especialidad (RS-BE-39 y RS-BE-44). Zod v3.
 *
 * `storedRankingSchema` valida el ranking que se guarda en
 * `student_specialty_test_result.ranking`, al escribirlo y al leerlo.
 */
import { z } from "zod";
import { SPECIALTY_KEYS } from "./specialty-test.types.js";

/** Un elemento de `student_specialty_test_result.ranking`, al escribir y al leer. */
export const storedRankingSchema = z
  .array(
    z.object({
      key: z.enum(SPECIALTY_KEYS),
      specialtyId: z.number().int().positive(),
      affinity: z.number().int().min(0).max(100),
    }),
  )
  .length(4)
  .refine((ranking) => new Set(ranking.map((e) => e.key)).size === 4, {
    message: "Cada especialidad va una sola vez.",
  });
