import { describe, expect, test } from "bun:test";
import { recentMessagesFromSnapshot } from "../../src/services/firebase.service.js";

/**
 * ============================================================================
 * PRUEBA UNITARIA — Lectura de mensajes recientes con su marca de borrado
 * Fuente: src/services/firebase.service.ts (recentMessagesFromSnapshot)
 * ============================================================================
 * R-CHAT-4 de `chat` borra un mensaje con una lápida que conserva `body` y
 * agrega `deleted: true`. BR-CB-23 del chatbot omite esos mensajes, así que la
 * lectura de `getRecentMessages` tiene que dejar pasar la marca. Aquí se prueba
 * la parte pura de la lectura, sin red ni Firebase. Mensajes inventados.
 */

describe("recentMessagesFromSnapshot - marca de borrado (R-CHAT-4, BR-CB-23)", () => {
  test("deleted es true solo si el mensaje guarda deleted === true", () => {
    const mensajes = recentMessagesFromSnapshot({
      a: { senderName: "REMITENTE INVENTADO", body: "visible", createdAt: 3 },
      b: {
        senderName: "REMITENTE INVENTADO",
        body: "borrado",
        createdAt: 1,
        deleted: true,
        deletedBy: "REMITENTE INVENTADO",
        deletedByUid: "501",
        deletedByRole: "student",
        deletedAt: 5,
      },
      c: { senderName: "OTRO INVENTADO", body: "texto", createdAt: 2, deleted: "true" },
    });

    expect(mensajes.map((m) => [m.id, m.deleted])).toEqual([
      ["b", true],
      ["c", false],
      ["a", false],
    ]);
  });

  test("ordena por createdAt, rellena los campos ausentes y respeta since", () => {
    const datos = {
      x: { body: "tarde", createdAt: 20 },
      y: { createdAt: 10 },
      z: { body: "temprano", createdAt: 5, deleted: true },
    };

    expect(recentMessagesFromSnapshot(datos)).toEqual([
      { id: "z", senderName: "Desconocido", body: "temprano", createdAt: 5, deleted: true },
      { id: "y", senderName: "Desconocido", body: "", createdAt: 10, deleted: false },
      { id: "x", senderName: "Desconocido", body: "tarde", createdAt: 20, deleted: false },
    ]);
    expect(recentMessagesFromSnapshot(datos, 10).map((m) => m.id)).toEqual(["y", "x"]);
  });

  test("sin datos devuelve una lista vacía", () => {
    expect(recentMessagesFromSnapshot(null)).toEqual([]);
  });
});
