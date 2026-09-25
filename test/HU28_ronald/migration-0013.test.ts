import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { chatbotMessage } from "../../src/db/schema/schema.js";

/**
 * BR-CB-20: la migración `0013` crea el índice del historial y nada más.
 *
 * El .sql se lee como texto plano, como en `migration-0012.test.ts`: esta
 * prueba NO aplica la migración ni toca ninguna base. Aplicarla es del dueño,
 * con `bun run db:apply` y respaldo previo (MIGRATIONS.md).
 */

const RUTA = "drizzle/0013_chatbot_message_history.sql";
const archivo = Bun.file(RUTA);
const migracion = (await archivo.exists()) ? await archivo.text() : "";

/** El SQL sin los comentarios de línea (`-- …`), que la migración usa para documentarse. */
const sinComentarios = (texto: string): string =>
  texto
    .split("\n")
    .map((linea) => linea.replace(/--.*$/, ""))
    .join("\n");

/** Colapsa los espacios en blanco para comparar sentencias sin depender del sangrado. */
const normalizar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

const sentencias = (texto: string): string[] =>
  sinComentarios(texto)
    .split(";")
    .map(normalizar)
    .filter((s) => s !== "");

const INDICE_DE_LA_SPEC =
  'CREATE INDEX IF NOT EXISTS "idx_chatbot_message_session_created" ON "chatbot_message" ("session_id", "created_at")';

describe(`${RUTA} (BR-CB-20)`, () => {
  test("el archivo existe", async () => {
    expect(await archivo.exists()).toBe(true);
  });

  test("tiene una sola sentencia: el índice de la spec, con IF NOT EXISTS", () => {
    expect(sentencias(migracion)).toEqual([INDICE_DE_LA_SPEC]);
  });

  test("la sentencia es la misma que fija la sección «Base de Datos» de la spec", async () => {
    const spec = await Bun.file("specs/features/chatbot/chatbot.spec.md").text();
    const bloques = [...spec.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
    const delIndice = bloques.filter((b) => b.includes("idx_chatbot_message_session_created"));
    expect(delIndice.length).toBe(1);
    expect(sentencias(delIndice[0])).toEqual(sentencias(migracion));
  });

  test("es aditiva: no borra, no altera ni escribe filas", () => {
    const sql = sinComentarios(migracion).toUpperCase();
    for (const prohibida of ["DROP", "ALTER", "DELETE", "INSERT", "UPDATE", "TRUNCATE"]) {
      expect(sql).not.toContain(prohibida);
    }
  });

  test("no usa CONCURRENTLY, que no corre dentro de la transacción de db:apply", () => {
    expect(sinComentarios(migracion).toUpperCase()).not.toContain("CONCURRENTLY");
  });

  test("el borrado único de BR-CB-22b queda como paso de despliegue documentado, no como SQL de la migración", () => {
    expect(migracion).toContain("BR-CB-22b");
    expect(sinComentarios(migracion)).not.toContain("chatbot_session");
  });
});

describe("src/db/schema/schema.ts declara el mismo índice (BR-CB-20)", () => {
  const indices = getTableConfig(chatbotMessage).indexes.map((i) => ({
    nombre: i.config.name,
    columnas: i.config.columns.map((c) => (c as { name: string }).name),
    unico: i.config.unique,
  }));

  test("chatbot_message tiene el índice nuevo por (session_id, created_at), en ese orden y sin UNIQUE", () => {
    expect(indices).toContainEqual({
      nombre: "idx_chatbot_message_session_created",
      columnas: ["session_id", "created_at"],
      unico: false,
    });
  });

  test("el índice viejo por session_id sigue: la migración solo agrega", () => {
    expect(indices.map((i) => i.nombre).sort()).toEqual([
      "idx_chatbot_message_session",
      "idx_chatbot_message_session_created",
    ]);
  });
});
