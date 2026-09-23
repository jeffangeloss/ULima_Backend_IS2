import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * R-CHAT-4 visto desde HTTP: `DELETE /chat/sections/:sectionId/messages/:messageId`.
 *
 * Antes la ruta exigía `requireRole("teacher")`, así que un alumno recibía
 * `403 FORBIDDEN` sin llegar al controller. Ahora entra cualquier rol
 * autenticado y el controller decide con el participante que resuelve desde
 * el JWT (`studentId` o `teacherId`), nunca desde la URL.
 *
 * La cadena es la real (routes → controller → repository) y solo la base es
 * falsa: contesta `token_version` y las dos consultas de participante, y anota
 * sus parámetros. Firebase se reemplaza por la lógica real de la lápida
 * (`softDeleteMessageRef`) sobre mensajes en memoria. `mock.module` va ANTES
 * de cualquier `await import(...)` porque `authMiddleware` consulta la base.
 *
 * Datos INVENTADOS (el repo es público): sección 7; alumna studentId 51 /
 * userId 501; delegada studentId 53 / userId 503; profesora titular
 * teacherId 61 / userId 601; JP teacherId 62 / userId 602.
 */

type Consulta = { sql: string; params: unknown[] };
const consultas: Consulta[] = [];

const SECCION = 7;
const ALUMNOS: Record<number, { user_id: number; full_name: string; position: "delegate" | "subdelegate" | null }> = {
  51: { user_id: 501, full_name: "Alumna De Prueba", position: null },
  53: { user_id: 503, full_name: "Delegada De Prueba", position: "delegate" },
};
const DOCENTES: Record<number, { user_id: number; full_name: string; section_role: "teacher" | "jp" }> = {
  61: { user_id: 601, full_name: "Docente De Prueba", section_role: "teacher" },
  62: { user_id: 602, full_name: "JP De Prueba", section_role: "jp" },
};

const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  const texto = sql.toLowerCase();
  if (texto.includes("token_version")) return [{ token_version: 1 }];
  if (texto.includes("section_representative")) {
    // findStudentParticipant: e.student_id = $1 and e.section_id = $2
    const [studentId, sectionId] = params as [number, number];
    const fila = sectionId === SECCION ? ALUMNOS[studentId] : undefined;
    return fila ? [fila] : [];
  }
  if (texto.includes("jp_id")) {
    // findTeacherParticipant: t.id = $1, sec.id = $2
    const [teacherId, sectionId] = params as [number, number];
    const fila = sectionId === SECCION ? DOCENTES[teacherId] : undefined;
    return fila ? [fila] : [];
  }
  return [];
};

const fakeDb = { execute: ejecutar };

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { ChatController } = await import("../../src/modules/chat/chat.controller.js");
const { ChatRepository } = await import("../../src/modules/chat/chat.repository.js");
const { createChatRoutes } = await import("../../src/modules/chat/chat.routes.js");
const { firebaseService, softDeleteMessageRef } = await import("../../src/services/firebase.service.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

type Mensaje = Record<string, unknown>;
let mensajes = new Map<string, Mensaje>();
const originalSoftDelete = firebaseService.softDeleteChatMessage;

/**
 * Referencia en memoria que imita a RTDB con rutas anidadas: si `messageId`
 * trae `/` (Hono decodifica %2F), el resto es un CAMPO del mensaje, y un
 * `update` sobre ese campo lo reemplaza por un objeto, como haría Firebase.
 */
const refEnMemoria = (sectionId: number, messageId: string) => {
  const [id, ...resto] = messageId.split("/");
  const clave = `${sectionId}/${id}`;
  const campo = resto.join("/");
  return {
    get: async () => {
      const mensaje = mensajes.get(clave);
      const valor = campo ? mensaje?.[campo] ?? null : mensaje ?? null;
      return { exists: () => valor != null, val: () => valor };
    },
    update: async (cambios: Mensaje) => {
      const mensaje = mensajes.get(clave) ?? {};
      mensajes.set(clave, campo ? { ...mensaje, [campo]: { ...cambios } } : { ...mensaje, ...cambios });
    },
  };
};

beforeAll(() => {
  firebaseService.softDeleteChatMessage = async (sectionId, messageId, patch, options) =>
    softDeleteMessageRef(refEnMemoria(sectionId, messageId), patch, options);
});

afterAll(() => {
  firebaseService.softDeleteChatMessage = originalSoftDelete;
});

beforeEach(() => {
  consultas.length = 0;
  mensajes = new Map<string, Mensaje>([
    [`${SECCION}/-Nalumna`, { senderId: "501", senderName: "Alumna De Prueba", body: "hola", createdAt: 1 }],
    [`${SECCION}/-Ndelegada`, { senderId: "503", senderName: "Delegada De Prueba", body: "hola", createdAt: 2 }],
    [`${SECCION}/-Njp`, { senderId: "602", senderName: "JP De Prueba", body: "hola", createdAt: 3 }],
  ]);
});

const app = new Hono();
app.onError(errorHandler);
app.route("/chat", createChatRoutes(new ChatController(new ChatRepository(fakeDb as never))));

const tokenAlumno = (sub: number, studentId: number, role = "student") =>
  jwt.sign({ sub: String(sub), studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);
const tokenDocente = (sub: number, teacherId: number) =>
  jwt.sign({ sub: String(sub), teacherId, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);

const borrar = (path: string, token?: string) =>
  app.request(path, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

type Cuerpo = { deleted?: boolean; messageId?: string; deletedBy?: string; error?: { code?: string; message?: string } };
const cuerpo = async (res: Response) => (await res.json()) as Cuerpo;

describe("DELETE /chat/sections/:sectionId/messages/:messageId — alumnos", () => {
  test("alumno (rol student) borra su propio mensaje ⇒ 200 y la ruta ya no lo corta por rol", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Nalumna`, tokenAlumno(501, 51));
    expect(res.status).toBe(200);
    expect(await cuerpo(res)).toEqual({ deleted: true, messageId: "-Nalumna", deletedBy: "Alumna De Prueba" });
    expect(mensajes.get(`${SECCION}/-Nalumna`)).toMatchObject({ deleted: true, deletedByUid: "501", deletedByRole: "student" });
  });

  test("el alumno se resuelve con el studentId del JWT y la sección de la URL", async () => {
    await borrar(`/chat/sections/${SECCION}/messages/-Nalumna`, tokenAlumno(501, 51));
    const participante = consultas.find((q) => q.sql.includes("section_representative"));
    expect(participante?.params).toEqual([51, SECCION]);
    expect(consultas.some((q) => q.sql.includes("jp_id"))).toBe(false);
  });

  test("alumno sobre el mensaje de otro ⇒ 403 CHAT_DELETE_FORBIDDEN con el mensaje nuevo", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Ndelegada`, tokenAlumno(501, 51));
    expect(res.status).toBe(403);
    expect((await cuerpo(res)).error).toMatchObject({
      code: "CHAT_DELETE_FORBIDDEN",
      message: "Solo puedes eliminar tus propios mensajes.",
    });
    expect(mensajes.get(`${SECCION}/-Ndelegada`)?.deleted).toBeUndefined();
  });

  test("delegada (rol delegate) borra su propio mensaje ⇒ 200", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Ndelegada`, tokenAlumno(503, 53, "delegate"));
    expect(res.status).toBe(200);
    expect(mensajes.get(`${SECCION}/-Ndelegada`)?.deletedByRole).toBe("delegate");
  });

  test("alumno de otra sección ⇒ 403 CHAT_DELETE_FORBIDDEN", async () => {
    const res = await borrar(`/chat/sections/8/messages/-Nalumna`, tokenAlumno(501, 51));
    expect(res.status).toBe(403);
    expect((await cuerpo(res)).error?.code).toBe("CHAT_DELETE_FORBIDDEN");
  });

  test("mensaje inexistente ⇒ 404 CHAT_MESSAGE_NOT_FOUND", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Nzzz`, tokenAlumno(501, 51));
    expect(res.status).toBe(404);
    expect((await cuerpo(res)).error?.code).toBe("CHAT_MESSAGE_NOT_FOUND");
  });
});

describe("DELETE /chat/sections/:sectionId/messages/:messageId — docentes", () => {
  test("JP borra su propio mensaje ⇒ 200, resuelto con el teacherId del JWT", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Njp`, tokenDocente(602, 62));
    expect(res.status).toBe(200);
    const participante = consultas.find((q) => q.sql.includes("jp_id"));
    expect(participante?.params[0]).toBe(62);
    expect(participante?.params[1]).toBe(SECCION);
  });

  test("JP sobre el mensaje de un alumno ⇒ 403", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Nalumna`, tokenDocente(602, 62));
    expect(res.status).toBe(403);
    expect((await cuerpo(res)).error?.code).toBe("CHAT_DELETE_FORBIDDEN");
  });

  test("profesora titular con un messageId que apunta a un campo (%2F) ⇒ 404 y el campo no cambia", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Nalumna%2Fbody`, tokenDocente(601, 61));
    expect(res.status).toBe(404);
    expect((await cuerpo(res)).error?.code).toBe("CHAT_MESSAGE_NOT_FOUND");
    expect(mensajes.get(`${SECCION}/-Nalumna`)?.body).toBe("hola");
  });

  test("profesora titular borra el mensaje de un alumno ⇒ 200", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Nalumna`, tokenDocente(601, 61));
    expect(res.status).toBe(200);
    expect((await cuerpo(res)).deletedBy).toBe("Docente De Prueba");
    expect(mensajes.get(`${SECCION}/-Nalumna`)).toMatchObject({ deletedByUid: "601", deletedByRole: "teacher" });
  });
});

describe("DELETE /chat/sections/:sectionId/messages/:messageId — entrada", () => {
  test("sin token ⇒ 401", async () => {
    const res = await borrar(`/chat/sections/${SECCION}/messages/-Nalumna`);
    expect(res.status).toBe(401);
  });

  test("sectionId no numérico ⇒ 400 INVALID_ROUTE_PARAMS", async () => {
    const res = await borrar(`/chat/sections/abc/messages/-Nalumna`, tokenAlumno(501, 51));
    expect(res.status).toBe(400);
    expect((await cuerpo(res)).error?.code).toBe("INVALID_ROUTE_PARAMS");
  });
});
