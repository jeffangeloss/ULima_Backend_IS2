import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { config } from "../config/app-config.js";
import type { ChatParticipant } from "../modules/chat/chat.types.js";

/** Datos de quien borra que se guardan en la lápida del mensaje (R-CHAT-4). */
export type ChatTombstone = { deletedBy: string; deletedByUid: string; deletedByRole: string };

export type ChatSoftDeleteOptions = {
  /**
   * Si viene, solo se borra cuando el `senderId` guardado en el mensaje es
   * exactamente este uid (el solicitante no es el profesor titular).
   */
  requireSenderUid?: string;
};

export type ChatSoftDeleteResult = {
  /** El mensaje existe en RTDB. */
  existed: boolean;
  /** Se exigió remitente y el mensaje es de otro: no se escribió nada. */
  forbidden: boolean;
  /** El mensaje ya tenía `deleted === true`: no se reescribió la lápida. */
  alreadyDeleted: boolean;
  /** `deletedBy` que ya guardaba el mensaje, solo cuando `alreadyDeleted`. */
  deletedBy?: string;
};

/** Mensaje del chat de una sección tal como lo devuelve `getRecentMessages`. */
export type RecentMessage = {
  id: string;
  senderName: string;
  body: string;
  createdAt: number;
  /** Lápida de R-CHAT-4: el mensaje conserva `body` y lleva `deleted: true`. */
  deleted: boolean;
};

/** Valor de `sections/{sectionId}/messages` en RTDB (un mensaje trae más campos, como la lápida). */
export type RecentMessagesSnapshot = Record<
  string,
  { senderName?: string; body?: string; createdAt?: number; deleted?: unknown; [field: string]: unknown }
> | null;

/**
 * Parte pura de `getRecentMessages`: convierte el valor leído de RTDB en la
 * lista de mensajes ordenada por `createdAt`, con los que son anteriores a
 * `since` fuera. `deleted` pasa solo cuando el mensaje guarda `deleted === true`
 * (R-CHAT-4), para que quien lee pueda omitir los borrados (BR-CB-23 del chatbot).
 */
export const recentMessagesFromSnapshot = (
  data: RecentMessagesSnapshot,
  since?: number,
): RecentMessage[] => {
  if (!data) return [];

  let messages = Object.entries(data).map(([id, msg]) => ({
    id,
    senderName: msg.senderName ?? "Desconocido",
    body: msg.body ?? "",
    createdAt: msg.createdAt ?? 0,
    deleted: msg.deleted === true,
  }));

  if (since) {
    messages = messages.filter((m) => m.createdAt >= since);
  }

  return messages.sort((a, b) => a.createdAt - b.createdAt);
};

/** Lo mínimo de `Reference` de firebase-admin que usa el borrado suave. */
export type ChatMessageRef = {
  get(): Promise<{ exists(): boolean; val(): unknown }>;
  update(values: Record<string, unknown>): Promise<unknown>;
};

/**
 * R-CHAT-4: núcleo del borrado suave sobre la referencia de UN mensaje. Lee el
 * mensaje antes de escribir y, en este orden: si no existe (o el valor no es
 * un objeto de mensaje), no escribe; si se exige remitente y el `senderId` no
 * es ese uid, no escribe (forbidden); si ya tiene `deleted === true`, no
 * reescribe la lápida (idempotente). Solo en otro caso escribe la lápida con
 * `update`, que conserva el resto del mensaje.
 */
export const softDeleteMessageRef = async (
  ref: ChatMessageRef,
  patch: ChatTombstone,
  options: ChatSoftDeleteOptions = {},
  now: () => number = Date.now,
): Promise<ChatSoftDeleteResult> => {
  const snapshot = await ref.get();
  const value: unknown = snapshot.exists() ? snapshot.val() : null;
  // Un mensaje es siempre un objeto. Un valor suelto sale de un `messageId` con
  // `/` (Hono decodifica %2F) que apunta a un campo: no es un mensaje.
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { existed: false, forbidden: false, alreadyDeleted: false };
  }

  const message = value as {
    senderId?: unknown;
    deleted?: unknown;
    deletedBy?: unknown;
  };
  const alreadyDeleted = message.deleted === true;

  if (options.requireSenderUid !== undefined && message.senderId !== options.requireSenderUid) {
    return { existed: true, forbidden: true, alreadyDeleted };
  }

  if (alreadyDeleted) {
    return {
      existed: true,
      forbidden: false,
      alreadyDeleted: true,
      ...(typeof message.deletedBy === "string" ? { deletedBy: message.deletedBy } : {}),
    };
  }

  await ref.update({
    deleted: true,
    deletedBy: patch.deletedBy,
    deletedByUid: patch.deletedByUid,
    deletedByRole: patch.deletedByRole,
    deletedAt: now(),
  });
  return { existed: true, forbidden: false, alreadyDeleted: false };
};

class FirebaseService {
  private static instance: FirebaseService;
  private initialized = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  private initialize() {
    if (this.initialized) return;

    const { projectId, clientEmail, privateKey, databaseUrl } = config.firebase;

    // We only initialize if we have the minimum required credentials
    if (!projectId || !clientEmail || !privateKey) {
      console.warn("⚠️ Firebase Admin SDK config is missing. Chat features will not work.");
      return;
    }

    try {
      if (getApps().length === 0) {
        // Ensure private key newlines are handled correctly whether from .env or Vercel config
        const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");

        initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
          }),
          databaseURL: databaseUrl,
        });
      }

      this.initialized = true;
      console.log("✅ Firebase Admin SDK initialized successfully.");
    } catch (error) {
      console.error("❌ Failed to initialize Firebase Admin SDK:", error);
    }
  }

  public async generateCustomToken(
    uid: string,
    claims: Record<string, unknown> = {},
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error("Firebase Admin SDK is not initialized.");
    }

    try {
      return await getAuth().createCustomToken(uid, claims);
    } catch (error) {
      console.error("Error creating custom token:", error);
      throw new Error("Failed to generate Firebase custom token");
    }
  }

  public async upsertChatMember(participant: ChatParticipant): Promise<void> {
    if (!this.initialized) {
      throw new Error("Firebase Admin SDK is not initialized.");
    }

    if (!config.firebase.databaseUrl) {
      throw new Error("Firebase Realtime Database URL is not configured.");
    }

    try {
      await getDatabase()
        .ref(`members/${participant.sectionId}/${participant.uid}`)
        .set({
          displayName: participant.displayName,
          role: participant.role,
          roleLabel: participant.roleLabel,
          moderator: participant.isModerator,
          weight: participant.weight,
          updatedAt: Date.now(),
          expiresAt: Date.now() + 60 * 60 * 1000,
        });
    } catch (error) {
      console.error("Error writing chat member:", error);
      throw new Error("Failed to register chat member");
    }
  }
  public async getRecentMessages(
    sectionId: number,
    limit: number = 200,
    since?: number,
  ): Promise<RecentMessage[]> {
    if (!this.initialized) {
      console.warn("Firebase not initialized, skipping chat message fetch");
      return [];
    }

    try {
      const ref = getDatabase().ref(`sections/${sectionId}/messages`);
      let query = ref.orderByChild("createdAt").limitToLast(limit);

      const snapshot = await query.once("value");
      return recentMessagesFromSnapshot(snapshot.val() as RecentMessagesSnapshot, since);
    } catch (error) {
      console.error("Error reading chat messages from Firebase:", error);
      return [];
    }
  }

  /**
   * HU23 / R-CHAT-4: borrado suave de un mensaje (lápida en vez de borrar el
   * nodo). El controller ya resolvió quién pide; con `requireSenderUid` esta
   * capa comprueba además la autoría contra el `senderId` guardado.
   */
  public async softDeleteChatMessage(
    sectionId: number,
    messageId: string,
    patch: ChatTombstone,
    options: ChatSoftDeleteOptions = {},
  ): Promise<ChatSoftDeleteResult> {
    if (!this.initialized) {
      throw new Error("Firebase Admin SDK is not initialized.");
    }
    if (!config.firebase.databaseUrl) {
      throw new Error("Firebase Realtime Database URL is not configured.");
    }

    try {
      const ref = getDatabase().ref(`sections/${sectionId}/messages/${messageId}`);
      return await softDeleteMessageRef(ref, patch, options);
    } catch (error) {
      console.error("Error soft-deleting chat message:", error);
      throw new Error("Failed to delete chat message");
    }
  }
}

export const firebaseService = FirebaseService.getInstance();
