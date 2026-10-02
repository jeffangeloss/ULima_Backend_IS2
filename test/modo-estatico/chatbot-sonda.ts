/**
 * Sonda del cableado de RF-EST-8. La corre `modo-estatico.chatbot.test.ts` en un proceso aparte,
 * porque `MODO_ESTATICO` se lee una sola vez al importar `src/config/env.ts`.
 *
 * Importa el repositorio real del chatbot de `src/modules/chatbot/index.ts`, le sustituye la
 * ejecución en la base por una función que solo anota la consulta, y escribe en la salida
 * estándar una línea JSON con los parámetros de `getAlerts` y si lleva el filtro. No toca la base.
 */
import { PgDialect } from "drizzle-orm/pg-core";

const { db } = await import("../../src/db/index.js");
const { chatbotRepository } = await import("../../src/modules/chatbot/index.js");

let capturada: { sql: string; params: unknown[] } | undefined;
(db as unknown as { execute: unknown }).execute = async (q: Parameters<PgDialect["sqlToQuery"]>[0]) => {
  capturada = new PgDialect().sqlToQuery(q);
  return [];
};

await chatbotRepository.getAlerts(7);
console.log("RESULTADOS=" + JSON.stringify({ params: capturada!.params, filtra: capturada!.sql.includes("starts_with") }));
process.exit(0);
