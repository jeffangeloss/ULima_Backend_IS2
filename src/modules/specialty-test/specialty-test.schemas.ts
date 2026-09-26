/**
 * Zod del test de especialidad (RS-BE-39 y RS-BE-44). Zod v3.
 *
 * `evaluateBodySchema` es el paso 3 de la validación: solo la forma. Que las
 * respuestas correspondan a la versión (paso 5) y que los desempates sean los
 * que tocan (paso 7) lo decide el service, con sus propios códigos de error.
 */
import { z } from "zod";
import { DUEL_ANSWERS, SCALE_ANSWERS, SPECIALTY_KEYS } from "./specialty-test.types.js";

/** `AAAA-MM-DD.N`, la forma de RS-BE-37 y del CHECK `chk_specialty_test_version`. */
export const VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;

const MAX_ANSWER_KEYS = 20;

export const evaluateBodySchema = z.object({
  version: z.string().max(20).regex(VERSION_PATTERN, "Versión inválida."),
  answers: z
    .record(
      z.string().regex(/^q\d{2}$/, "Id de pregunta inválido."),
      z.enum([...DUEL_ANSWERS, ...SCALE_ANSWERS]),
    )
    .refine((answers) => Object.keys(answers).length <= MAX_ANSWER_KEYS, {
      message: `Como mucho ${MAX_ANSWER_KEYS} respuestas.`,
    }),
  tiebreakAnswers: z
    .array(z.object({ id: z.string().max(24), answer: z.enum(DUEL_ANSWERS) }))
    .max(2)
    .optional()
    .default([]),
});

/**
 * El cuerpo como lo tipa `validateJson`, que infiere el tipo de ENTRADA del
 * esquema: `tiebreakAnswers` queda opcional en el tipo aunque Zod ya lo
 * rellena con `[]`. El service lo lee con `?? []`.
 */
export type EvaluateBody = z.input<typeof evaluateBodySchema>;

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
