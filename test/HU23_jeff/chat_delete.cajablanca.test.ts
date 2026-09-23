import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ChatController } from "../../src/modules/chat/chat.controller.js";
import type { ChatRepository } from "../../src/modules/chat/chat.repository.js";
import { buildParticipant } from "../../src/modules/chat/chat.logic.js";
import type { ChatParticipant } from "../../src/modules/chat/chat.types.js";
import { firebaseService, softDeleteMessageRef } from "../../src/services/firebase.service.js";

/**
 * ============================================================================
 * CAJA BLANCA — Autorización del chat: ChatController.deleteMessage() +
 *               ChatController.createFirebaseToken()  (HU23, R-CHAT-1 y R-CHAT-4)
 * Fuente: src/modules/chat/chat.controller.ts
 * ============================================================================
 * Se recorre cada camino de AUTORIZACIÓN, aislando Firebase (se reemplazan sus
 * métodos por espías) y la BD (repositorio falso); no hay red ni base real.
 * El espía de `softDeleteChatMessage` delega en la lógica real
 * (`softDeleteMessageRef`) sobre mensajes guardados en memoria, así que la
 * autoría se decide con el `senderId` guardado y no con lo que diga la prueba.
 *
 * deleteMessage — cada participante borra lo suyo; el profesor titular, todo:
 *   P1  alumno / delegado / subdelegado / JP borran su mensaje   -> 200 + lápida
 *   P2  los mismos sobre un mensaje ajeno                         -> 403 «Solo puedes eliminar tus propios mensajes.»
 *   P3  profesor titular borra el de cualquiera (sin exigir remitente) -> 200
 *   P4  no participa de la sección (repo null)                    -> 403 y no toca Firebase
 *   P5  sin studentId / sin teacherId en el token                 -> 403
 *   P6  userId del JWT != participante                            -> 403 (anti-suplantación)
 *   P7  mensaje inexistente                                       -> 404 CHAT_MESSAGE_NOT_FOUND
 *   P8  mensaje ya borrado                                        -> 200 sin reescribir la lápida
 *
 * createFirebaseToken — solo un participante de la sección obtiene token:
 *   rechazos (403 CHAT_SECTION_FORBIDDEN): sin teacherId, docente ajeno, alumno
 *   sin studentId, userId suplantado, y "no escribe /members ni firma si rechaza".
 *   éxito: profesor (peso 100, moderador) / alumno (peso 10) / delegado (peso 70),
 *   con el espejo /members escrito y el token firmado con el rol/peso correctos.
 *
 * Datos INVENTADOS (el repo es público): sección 1; alumnos con studentId 51-54
 * y userId 501-504; profesora titular teacherId 61 / userId 601; JP teacherId
 * 62 / userId 602.
 */

// --- Espías de Firebase: se reemplazan los métodos reales por dobles que
//     capturan en memoria lo que el controller intenta escribir/firmar. Se
//     restauran al final para no contaminar otros archivos de la suite. ---
const originales = {
  upsertChatMember: firebaseService.upsertChatMember,
  generateCustomToken: firebaseService.generateCustomToken,
  softDeleteChatMessage: firebaseService.softDeleteChatMessage,
};

let mirrored: ChatParticipant[] = [];                 // captura los /members escritos (espejo de membresía)

type Mensaje = Record<string, unknown>;
type Lapida = { deletedBy: string; deletedByUid: string; deletedByRole: string };
let mensajes = new Map<string, Mensaje>();            // sections/1/messages en memoria
let softDeletes: Array<{
  sectionId: number;
  messageId: string;
  patch: Lapida;
  options: { requireSenderUid?: string } | undefined;
}> = [];

const refEnMemoria = (messageId: string) => ({
  get: async () => {
    const valor = mensajes.get(messageId) ?? null;
    return { exists: () => valor != null, val: () => valor };
  },
  update: async (cambios: Mensaje) => {
    mensajes.set(messageId, { ...(mensajes.get(messageId) ?? {}), ...cambios });
  },
});

beforeAll(() => {
  firebaseService.upsertChatMember = async (p: ChatParticipant) => {
    mirrored.push(p);                                 // en vez de escribir en Firebase, guardamos el participante
  };
  firebaseService.generateCustomToken = async (
    uid: string,
    claims: Record<string, unknown> = {},
  ) => `token:${uid}:${claims.role}:${claims.weight}`;
  firebaseService.softDeleteChatMessage = async (
    sectionId: number,
    messageId: string,
    patch: Lapida,
    options?: { requireSenderUid?: string },
  ) => {
    softDeletes.push({ sectionId, messageId, patch, options });
    return softDeleteMessageRef(refEnMemoria(messageId), patch, options, () => 1_800_000_000_000);
  };
});

afterAll(() => {
  Object.assign(firebaseService, originales);
});

const fakeRepo = (over: Partial<ChatRepository>): ChatRepository =>
  ({
    findStudentParticipant: async () => null,
    findTeacherParticipant: async () => null,
    ...over,
  }) as unknown as ChatRepository;

// Participantes de la sección 1 (nombres inventados).
const teacher: ChatParticipant = buildParticipant(
  { user_id: 601, full_name: "Ibarra Luna, Marta" },
  1,
  "teacher",
);
const jp: ChatParticipant = buildParticipant(
  { user_id: 602, full_name: "Nunez Soto, Diego" },
  1,
  "jp",
);
const student: ChatParticipant = buildParticipant(
  { user_id: 501, full_name: "Torres Pino, Lucia" },
  1,
  "student",
);
const otroAlumno: ChatParticipant = buildParticipant(
  { user_id: 502, full_name: "Vargas Leon, Mateo" },
  1,
  "student",
);
const delegate: ChatParticipant = buildParticipant(
  { user_id: 503, full_name: "Campos Rey, Sofia" },
  1,
  "delegate",
);
const subdelegate: ChatParticipant = buildParticipant(
  { user_id: 504, full_name: "Salas Mori, Andres" },
  1,
  "subdelegate",
);

/** Alumnos por studentId y docentes por teacherId, solo en la sección 1. */
const ALUMNOS: Record<number, ChatParticipant> = {
  51: student,
  52: otroAlumno,
  53: delegate,
  54: subdelegate,
};
const DOCENTES: Record<number, ChatParticipant> = { 61: teacher, 62: jp };

const repoSeccion = () =>
  fakeRepo({
    findStudentParticipant: async (studentId: number, sectionId: number) =>
      sectionId === 1 ? ALUMNOS[studentId] ?? null : null,
    findTeacherParticipant: async (teacherId: number, sectionId: number) =>
      sectionId === 1 ? DOCENTES[teacherId] ?? null : null,
  });

/** Un mensaje vivo de `autor` en la sección 1. */
const mensajeDe = (autor: ChatParticipant): Mensaje => ({
  senderId: autor.uid,
  senderName: autor.displayName,
  senderRole: autor.role,
  body: `hola, soy ${autor.displayName}`,
  createdAt: 1_700_000_000_000,
});

const LAPIDA_PREVIA = {
  deleted: true,
  deletedBy: "Vargas Leon, Mateo",
  deletedByUid: "502",
  deletedByRole: "student",
  deletedAt: 1_750_000_000_000,
};

const expectForbidden = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    throw new Error("se esperaba un 403 y no se lanzó");
  } catch (e) {
    const err = e as { statusCode?: number; code?: string };
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("CHAT_SECTION_FORBIDDEN");
  }
};

beforeEach(() => {
  mirrored = [];
  softDeletes = [];
  mensajes = new Map<string, Mensaje>([
    ["-Nlucia", mensajeDe(student)],
    ["-Nmateo", mensajeDe(otroAlumno)],
    ["-Nsofia", mensajeDe(delegate)],
    ["-Nandres", mensajeDe(subdelegate)],
    ["-Ndiego", mensajeDe(jp)],
    ["-Nmarta", mensajeDe(teacher)],
    ["-Nborrado", { ...mensajeDe(otroAlumno), ...LAPIDA_PREVIA }],
  ]);
});

const expectDeleteForbidden = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    throw new Error("se esperaba un 403 y no se lanzó");
  } catch (e) {
    const err = e as { statusCode?: number; code?: string; message?: string };
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("CHAT_DELETE_FORBIDDEN");
    expect(err.message).toBe("Solo puedes eliminar tus propios mensajes.");
  }
};

const expectNotFound = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    throw new Error("se esperaba un 404 y no se lanzó");
  } catch (e) {
    const err = e as { statusCode?: number; code?: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("CHAT_MESSAGE_NOT_FOUND");
  }
};

/** Pedido de borrado tal como lo arma la ruta desde el JWT. */
const comoAlumno = (p: ChatParticipant, studentId: number, messageId: string) => ({
  sectionId: 1,
  messageId,
  userId: p.userId,
  role: p.role,                                        // el JWT lleva student/delegate/subdelegate
  studentId,
});
const comoDocente = (p: ChatParticipant, teacherId: number, messageId: string) => ({
  sectionId: 1,
  messageId,
  userId: p.userId,
  role: "teacher",                                     // profesor y JP entran con rol teacher en el JWT
  teacherId,
});

const sigueVivo = (messageId: string) => {
  expect(mensajes.get(messageId)?.deleted).toBeUndefined();
};

describe("ChatController.deleteMessage — cada participante borra lo suyo (P1)", () => {
  test("alumno borra su propio mensaje ⇒ 200 y lápida con sus datos", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoAlumno(student, 51, "-Nlucia"));
    expect(res).toEqual({ deleted: true, messageId: "-Nlucia", deletedBy: "Torres Pino, Lucia" });
    expect(mensajes.get("-Nlucia")).toMatchObject({
      deleted: true,
      deletedBy: "Torres Pino, Lucia",
      deletedByUid: "501",
      deletedByRole: "student",
      deletedAt: 1_800_000_000_000,
    });
    // La autoría la comprueba el servidor: se exige el uid del alumno.
    expect(softDeletes).toHaveLength(1);
    expect(softDeletes[0]!.sectionId).toBe(1);
    expect(softDeletes[0]!.options).toEqual({ requireSenderUid: "501" });
  });

  test("delegado borra su propio mensaje ⇒ 200", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoAlumno(delegate, 53, "-Nsofia"));
    expect(res.deletedBy).toBe("Campos Rey, Sofia");
    expect(mensajes.get("-Nsofia")?.deletedByRole).toBe("delegate");
    expect(softDeletes[0]!.options).toEqual({ requireSenderUid: "503" });
  });

  test("subdelegado borra su propio mensaje ⇒ 200", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoAlumno(subdelegate, 54, "-Nandres"));
    expect(res.deleted).toBe(true);
    expect(mensajes.get("-Nandres")?.deletedByRole).toBe("subdelegate");
  });

  test("JP borra su propio mensaje ⇒ 200", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoDocente(jp, 62, "-Ndiego"));
    expect(res.deletedBy).toBe("Nunez Soto, Diego");
    expect(mensajes.get("-Ndiego")).toMatchObject({ deleted: true, deletedByUid: "602", deletedByRole: "jp" });
    expect(softDeletes[0]!.options).toEqual({ requireSenderUid: "602" });
  });

  test("profesor titular borra su propio mensaje ⇒ 200", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoDocente(teacher, 61, "-Nmarta"));
    expect(res.deletedBy).toBe("Ibarra Luna, Marta");
    expect(mensajes.get("-Nmarta")?.deleted).toBe(true);
  });
});

describe("ChatController.deleteMessage — nadie salvo el titular borra lo ajeno (P2)", () => {
  test("alumno sobre el mensaje de otro alumno ⇒ 403 con el mensaje nuevo y no escribe", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoAlumno(student, 51, "-Nmateo")));
    sigueVivo("-Nmateo");
  });

  test("alumno sobre el mensaje del profesor ⇒ 403", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoAlumno(student, 51, "-Nmarta")));
    sigueVivo("-Nmarta");
  });

  test("delegado (moderador) sobre el mensaje de un alumno ⇒ 403: moderar no habilita borrar lo ajeno", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoAlumno(delegate, 53, "-Nlucia")));
    sigueVivo("-Nlucia");
  });

  test("subdelegado sobre el mensaje de un alumno ⇒ 403", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoAlumno(subdelegate, 54, "-Nlucia")));
    sigueVivo("-Nlucia");
  });

  test("JP sobre el mensaje de un alumno ⇒ 403 (solo el titular borra lo ajeno)", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoDocente(jp, 62, "-Nlucia")));
    sigueVivo("-Nlucia");
  });

  test("JP sobre el mensaje del profesor titular ⇒ 403", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoDocente(jp, 62, "-Nmarta")));
    sigueVivo("-Nmarta");
  });
});

describe("ChatController.deleteMessage — el profesor titular borra cualquiera (P3)", () => {
  test("profesor titular borra el mensaje de un alumno ⇒ 200 y lápida con sus datos", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoDocente(teacher, 61, "-Nlucia"));
    expect(res).toEqual({ deleted: true, messageId: "-Nlucia", deletedBy: "Ibarra Luna, Marta" });
    expect(mensajes.get("-Nlucia")).toMatchObject({
      deleted: true,
      deletedBy: "Ibarra Luna, Marta",
      deletedByUid: "601",
      deletedByRole: "teacher",
    });
    // No se exige remitente: el titular modera toda la sección.
    expect(softDeletes[0]!.options?.requireSenderUid).toBeUndefined();
  });

  test("profesor titular borra el mensaje del JP y el de un delegado ⇒ 200", async () => {
    const c = new ChatController(repoSeccion());
    await c.deleteMessage(comoDocente(teacher, 61, "-Ndiego"));
    await c.deleteMessage(comoDocente(teacher, 61, "-Nsofia"));
    expect(mensajes.get("-Ndiego")?.deleted).toBe(true);
    expect(mensajes.get("-Nsofia")?.deleted).toBe(true);
  });
});

describe("ChatController.deleteMessage — quién es el solicitante (P4-P6)", () => {
  test("alumno que no participa de la sección (repo null) ⇒ 403 y no toca Firebase", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage({ ...comoAlumno(student, 51, "-Nlucia"), sectionId: 2 }));
    expect(softDeletes).toHaveLength(0);
  });

  test("docente que no dicta la sección (repo null) ⇒ 403 y no toca Firebase", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoDocente(teacher, 99, "-Nlucia")));
    expect(softDeletes).toHaveLength(0);
  });

  test("token de alumno sin studentId ⇒ 403", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() =>
      c.deleteMessage({ sectionId: 1, messageId: "-Nlucia", userId: 501, role: "student" }),
    );
    expect(softDeletes).toHaveLength(0);
  });

  test("token de docente sin teacherId ⇒ 403", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() =>
      c.deleteMessage({ sectionId: 1, messageId: "-Nlucia", userId: 601, role: "teacher" }),
    );
    expect(softDeletes).toHaveLength(0);
  });

  test("rol teacher en el JWT resuelve por teacherId aunque traiga studentId", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() =>
      c.deleteMessage({ sectionId: 1, messageId: "-Nlucia", userId: 501, role: "teacher", studentId: 51 }),
    );
    sigueVivo("-Nlucia");
  });

  test("userId del JWT distinto al del participante ⇒ 403 (anti-suplantación)", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() =>
      c.deleteMessage({ ...comoAlumno(student, 51, "-Nlucia"), userId: 999 }),
    );
    await expectDeleteForbidden(() =>
      c.deleteMessage({ ...comoDocente(teacher, 61, "-Nlucia"), userId: 999 }),
    );
    sigueVivo("-Nlucia");
    expect(softDeletes).toHaveLength(0);
  });
});

describe("ChatController.deleteMessage — mensaje inexistente o ya borrado (P7-P8)", () => {
  test("mensaje inexistente pedido por un alumno ⇒ 404 CHAT_MESSAGE_NOT_FOUND", async () => {
    const c = new ChatController(repoSeccion());
    await expectNotFound(() => c.deleteMessage(comoAlumno(student, 51, "-Nzzz")));
  });

  test("mensaje inexistente pedido por el profesor titular ⇒ 404 CHAT_MESSAGE_NOT_FOUND", async () => {
    const c = new ChatController(repoSeccion());
    await expectNotFound(() => c.deleteMessage(comoDocente(teacher, 61, "-Nzzz")));
  });

  test("su autor borra otra vez un mensaje ya borrado ⇒ 200 y la lápida no cambia", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoAlumno(otroAlumno, 52, "-Nborrado"));
    expect(res).toEqual({ deleted: true, messageId: "-Nborrado", deletedBy: "Vargas Leon, Mateo" });
    expect(mensajes.get("-Nborrado")).toMatchObject(LAPIDA_PREVIA);
  });

  test("el profesor titular sobre un mensaje ya borrado ⇒ 200, responde el deletedBy original y no reescribe", async () => {
    const c = new ChatController(repoSeccion());
    const res = await c.deleteMessage(comoDocente(teacher, 61, "-Nborrado"));
    expect(res).toEqual({ deleted: true, messageId: "-Nborrado", deletedBy: "Vargas Leon, Mateo" });
    expect(mensajes.get("-Nborrado")).toMatchObject(LAPIDA_PREVIA);
  });

  test("otro alumno sobre un mensaje ajeno ya borrado ⇒ 403 y no reescribe", async () => {
    const c = new ChatController(repoSeccion());
    await expectDeleteForbidden(() => c.deleteMessage(comoAlumno(student, 51, "-Nborrado")));
    expect(mensajes.get("-Nborrado")).toMatchObject(LAPIDA_PREVIA);
  });
});

describe("ChatController.createFirebaseToken — autorización (caja blanca)", () => {
  test("docente sin teacherId ⇒ 403", async () => {
    const c = new ChatController(fakeRepo({}));
    await expectForbidden(() =>
      c.createFirebaseToken({ sectionId: 1, userId: 601, role: "teacher" }),
    );
  });

  test("docente que no dicta la sección (repo null) ⇒ 403", async () => {
    const c = new ChatController(
      fakeRepo({ findTeacherParticipant: async () => null }),
    );
    await expectForbidden(() =>
      c.createFirebaseToken({
        sectionId: 1,
        userId: 601,
        role: "teacher",
        teacherId: 61,
      }),
    );
  });

  test("alumno sin studentId ⇒ 403", async () => {
    const c = new ChatController(fakeRepo({}));
    await expectForbidden(() =>
      c.createFirebaseToken({ sectionId: 1, userId: 501, role: "student" }),
    );
  });

  test("userId del JWT distinto al del participante ⇒ 403 (anti-suplantación)", async () => {
    const c = new ChatController(
      fakeRepo({ findStudentParticipant: async () => student }),
    );
    await expectForbidden(() =>
      c.createFirebaseToken({
        sectionId: 1,
        userId: 999,
        role: "student",
        studentId: 51,
      }),
    );
  });

  test("no escribe /members ni firma token cuando rechaza", async () => {
    const c = new ChatController(fakeRepo({}));
    await expectForbidden(() =>
      c.createFirebaseToken({ sectionId: 1, userId: 501, role: "student" }),
    );
    expect(mirrored).toHaveLength(0);
  });
});

describe("ChatController.createFirebaseToken — éxito", () => {
  test("profesor válido ⇒ token + rol/peso de profesor y espejo escrito", async () => {
    const c = new ChatController(
      fakeRepo({ findTeacherParticipant: async () => teacher }),
    );
    const res = await c.createFirebaseToken({
      sectionId: 1,
      userId: 601,
      role: "teacher",
      teacherId: 61,
    });
    expect(res.role).toBe("teacher");
    expect(res.roleLabel).toBe("Profesor");
    expect(res.isModerator).toBe(true);
    expect(res.weight).toBe(100);
    expect(res.uid).toBe("601");
    expect(res.token).toBe("token:601:teacher:100");
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]!.userId).toBe(601);
  });

  test("alumno raso válido ⇒ no moderador, peso 10", async () => {
    const c = new ChatController(
      fakeRepo({ findStudentParticipant: async () => student }),
    );
    const res = await c.createFirebaseToken({
      sectionId: 1,
      userId: 501,
      role: "student",
      studentId: 51,
    });
    expect(res.isModerator).toBe(false);
    expect(res.weight).toBe(10);
    expect(res.token).toBe("token:501:student:10");
  });

  test("delegado válido ⇒ moderador, peso 70", async () => {
    const c = new ChatController(
      fakeRepo({ findStudentParticipant: async () => delegate }),
    );
    const res = await c.createFirebaseToken({
      sectionId: 1,
      userId: 503,
      role: "student",
      studentId: 53,
    });
    expect(res.role).toBe("delegate");
    expect(res.isModerator).toBe(true);
    expect(res.weight).toBe(70);
  });
});
