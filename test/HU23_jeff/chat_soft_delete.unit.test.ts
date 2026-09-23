import { describe, expect, test } from "bun:test";
import { softDeleteMessageRef } from "../../src/services/firebase.service.js";

/**
 * ============================================================================
 * PRUEBA UNITARIA — Lápida de un mensaje del chat (R-CHAT-4)
 * Fuente: src/services/firebase.service.ts (softDeleteMessageRef)
 * ============================================================================
 * `softDeleteChatMessage` resuelve la referencia RTDB del mensaje y delega en
 * `softDeleteMessageRef`, que es la parte con reglas. Aquí la referencia es un
 * doble en memoria que anota cada lectura y cada escritura, así que no hay red
 * ni Firebase real.
 *
 * Qué se exige:
 *   - lee el mensaje ANTES de escribir y no escribe si no existe;
 *   - con `requireSenderUid`, solo escribe si el `senderId` guardado es ese uid
 *     (comparación estricta de texto: ausente o de otro tipo ⇒ prohibido);
 *   - un mensaje con `deleted === true` no se reescribe (idempotente) y se
 *     devuelve el `deletedBy` que ya tenía;
 *   - la lápida lleva exactamente deleted, deletedBy, deletedByUid,
 *     deletedByRole y deletedAt, con `update` (el resto del mensaje queda).
 *
 * Datos inventados: uid 501 es «Alumna De Prueba», uid 502 otro
 * alumno y uid 601 la profesora titular.
 */

type Mensaje = Record<string, unknown>;

/** Doble de `Reference` de firebase-admin: solo `get` y `update`. */
const refFalsa = (inicial: Mensaje | null) => {
  let valor: Mensaje | null = inicial == null ? null : { ...inicial };
  const llamadas: string[] = [];
  const escrituras: Mensaje[] = [];
  return {
    llamadas,
    escrituras,
    actual: () => valor,
    ref: {
      get: async () => {
        llamadas.push("get");
        const foto = valor == null ? null : { ...valor };
        return { exists: () => foto != null, val: () => foto };
      },
      update: async (cambios: Mensaje) => {
        llamadas.push("update");
        escrituras.push(cambios);
        valor = { ...(valor ?? {}), ...cambios };
      },
    },
  };
};

const MENSAJE_ALUMNA: Mensaje = {
  senderId: "501",
  senderName: "Alumna De Prueba",
  senderRole: "student",
  body: "¿Alguien tiene la práctica 2?",
  createdAt: 1_700_000_000_000,
};

const LAPIDA_ALUMNA = {
  deletedBy: "Alumna De Prueba",
  deletedByUid: "501",
  deletedByRole: "student",
};

const LAPIDA_PROFESORA = {
  deletedBy: "Docente De Prueba",
  deletedByUid: "601",
  deletedByRole: "teacher",
};

const ahora = () => 1_800_000_000_000;

describe("softDeleteMessageRef — mensaje inexistente", () => {
  test("no existe ⇒ existed=false y no escribe", async () => {
    const f = refFalsa(null);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "501" }, ahora);
    expect(r).toEqual({ existed: false, forbidden: false, alreadyDeleted: false });
    expect(f.llamadas).toEqual(["get"]);
  });
});

describe("softDeleteMessageRef — la referencia no apunta a un mensaje", () => {
  // Hono decodifica %2F dentro de :messageId, así que "-Nalumna%2Fbody" llega
  // como "-Nalumna/body" y la referencia cae en un CAMPO del mensaje. Un valor
  // que no es objeto no es un mensaje: se trata como inexistente y no se escribe.
  test("valor de texto (un campo) sin exigir remitente ⇒ existed=false y no escribe", async () => {
    const f = refFalsa(null);
    const campo = {
      get: async () => ({ exists: () => true, val: () => "¿Alguien tiene la práctica 2?" }),
      update: f.ref.update,
    };
    const r = await softDeleteMessageRef(campo, LAPIDA_PROFESORA, {}, ahora);
    expect(r).toEqual({ existed: false, forbidden: false, alreadyDeleted: false });
    expect(f.escrituras).toHaveLength(0);
  });

  test("valor numérico o lista exigiendo remitente ⇒ existed=false y no escribe", async () => {
    for (const valor of [1_700_000_000_000, ["501"]]) {
      const f = refFalsa(null);
      const campo = {
        get: async () => ({ exists: () => true, val: () => valor }),
        update: f.ref.update,
      };
      const r = await softDeleteMessageRef(campo, LAPIDA_ALUMNA, { requireSenderUid: "501" }, ahora);
      expect(r.existed).toBe(false);
      expect(f.escrituras).toHaveLength(0);
    }
  });
});

describe("softDeleteMessageRef — sin exigir remitente (profesor titular)", () => {
  test("escribe la lápida completa con update y conserva el resto del mensaje", async () => {
    const f = refFalsa(MENSAJE_ALUMNA);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_PROFESORA, {}, ahora);
    expect(r).toEqual({ existed: true, forbidden: false, alreadyDeleted: false });
    expect(f.llamadas).toEqual(["get", "update"]);
    expect(f.escrituras).toEqual([
      {
        deleted: true,
        deletedBy: "Docente De Prueba",
        deletedByUid: "601",
        deletedByRole: "teacher",
        deletedAt: 1_800_000_000_000,
      },
    ]);
    expect(f.actual()?.body).toBe("¿Alguien tiene la práctica 2?");
    expect(f.actual()?.senderId).toBe("501");
  });

  test("sin opciones se comporta igual que con {} (compatibilidad)", async () => {
    const f = refFalsa(MENSAJE_ALUMNA);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_PROFESORA);
    expect(r.forbidden).toBe(false);
    expect(f.escrituras).toHaveLength(1);
    expect(typeof f.escrituras[0]!.deletedAt).toBe("number");
  });
});

describe("softDeleteMessageRef — exigiendo remitente (autor del mensaje)", () => {
  test("el senderId coincide ⇒ lee primero y después escribe", async () => {
    const f = refFalsa(MENSAJE_ALUMNA);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "501" }, ahora);
    expect(r).toEqual({ existed: true, forbidden: false, alreadyDeleted: false });
    expect(f.llamadas).toEqual(["get", "update"]);
    expect(f.actual()?.deleted).toBe(true);
    expect(f.actual()?.deletedByUid).toBe("501");
  });

  test("el senderId es de otro ⇒ forbidden y no escribe", async () => {
    const f = refFalsa(MENSAJE_ALUMNA);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "502" }, ahora);
    expect(r).toEqual({ existed: true, forbidden: true, alreadyDeleted: false });
    expect(f.llamadas).toEqual(["get"]);
    expect(f.actual()?.deleted).toBeUndefined();
  });

  test("senderId numérico (no texto) ⇒ forbidden: la comparación es estricta", async () => {
    const f = refFalsa({ ...MENSAJE_ALUMNA, senderId: 501 });
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "501" }, ahora);
    expect(r.forbidden).toBe(true);
    expect(f.escrituras).toHaveLength(0);
  });

  test("mensaje sin senderId ⇒ forbidden", async () => {
    const { senderId: _omitido, ...sinRemitente } = MENSAJE_ALUMNA;
    const f = refFalsa(sinRemitente);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "501" }, ahora);
    expect(r.forbidden).toBe(true);
    expect(f.escrituras).toHaveLength(0);
  });
});

describe("softDeleteMessageRef — mensaje ya borrado (idempotente)", () => {
  const YA_BORRADO: Mensaje = {
    ...MENSAJE_ALUMNA,
    deleted: true,
    deletedBy: "Alumna De Prueba",
    deletedByUid: "501",
    deletedByRole: "student",
    deletedAt: 1_750_000_000_000,
  };

  test("el profesor titular lo borra otra vez ⇒ alreadyDeleted, sin escribir, con el deletedBy original", async () => {
    const f = refFalsa(YA_BORRADO);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_PROFESORA, {}, ahora);
    expect(r).toEqual({
      existed: true,
      forbidden: false,
      alreadyDeleted: true,
      deletedBy: "Alumna De Prueba",
    });
    expect(f.llamadas).toEqual(["get"]);
    expect(f.actual()?.deletedByUid).toBe("501");
    expect(f.actual()?.deletedAt).toBe(1_750_000_000_000);
  });

  test("su autor lo borra otra vez ⇒ alreadyDeleted y no escribe", async () => {
    const f = refFalsa(YA_BORRADO);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "501" }, ahora);
    expect(r.alreadyDeleted).toBe(true);
    expect(r.forbidden).toBe(false);
    expect(f.escrituras).toHaveLength(0);
  });

  test("otro alumno sobre un mensaje ajeno ya borrado ⇒ forbidden (la autoría va primero) y no escribe", async () => {
    const f = refFalsa(YA_BORRADO);
    const r = await softDeleteMessageRef(f.ref, LAPIDA_ALUMNA, { requireSenderUid: "502" }, ahora);
    expect(r.forbidden).toBe(true);
    expect(f.escrituras).toHaveLength(0);
  });

  test("deletedBy guardado que no es texto ⇒ se devuelve sin deletedBy", async () => {
    const f = refFalsa({ ...YA_BORRADO, deletedBy: 7 });
    const r = await softDeleteMessageRef(f.ref, LAPIDA_PROFESORA, {}, ahora);
    expect(r.alreadyDeleted).toBe(true);
    expect(r.deletedBy).toBeUndefined();
  });

  test("deleted distinto de true (por ejemplo \"true\" en texto) no cuenta como borrado", async () => {
    const f = refFalsa({ ...MENSAJE_ALUMNA, deleted: "true" });
    const r = await softDeleteMessageRef(f.ref, LAPIDA_PROFESORA, {}, ahora);
    expect(r.alreadyDeleted).toBe(false);
    expect(f.escrituras).toHaveLength(1);
  });
});
