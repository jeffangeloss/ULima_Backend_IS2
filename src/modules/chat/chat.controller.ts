import { db } from "../../db/index.js";
import { firebaseService } from "../../services/firebase.service.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { canDeleteAnyMessage, canIssueToken } from "./chat.logic.js";
import { ChatRepository } from "./chat.repository.js";
import type { ChatParticipant } from "./chat.types.js";

/** Quién pide, tal como lo deja `authMiddleware` en el contexto. */
type ChatRequester = {
  userId: number;
  role: string;
  studentId?: number;
  teacherId?: number;
};

/** R-CHAT-4: no participa de la sección, o el mensaje es ajeno y no es el titular. */
const forbiddenDelete = () =>
  new HttpError(403, "Solo puedes eliminar tus propios mensajes.", "CHAT_DELETE_FORBIDDEN");

export class ChatController {
  constructor(readonly repository = new ChatRepository(db)) {}

  /**
   * Resuelve al solicitante como participante de la sección según el rol del
   * JWT: `teacher` ⇒ por `teacherId` (profesor titular o JP); cualquier otro
   * ⇒ por `studentId` (matrícula activa + representación). `null` si no
   * participa o si al token le falta el identificador de su rol.
   */
  private async resolveParticipant(
    input: ChatRequester & { sectionId: number },
  ): Promise<ChatParticipant | null> {
    if (input.role === "teacher") {
      return input.teacherId == null
        ? null
        : this.repository.findTeacherParticipant(input.teacherId, input.sectionId);
    }
    return input.studentId == null
      ? null
      : this.repository.findStudentParticipant(input.studentId, input.sectionId);
  }

  async createFirebaseToken(input: ChatRequester & { sectionId: number }) {
    const participant = await this.resolveParticipant(input);

    if (!canIssueToken(participant, input.userId)) {
      throw new HttpError(
        403,
        "No perteneces a esta sección o no tienes acceso al chat.",
        "CHAT_SECTION_FORBIDDEN",
      );
    }

    await firebaseService.upsertChatMember(participant);

    const token = await firebaseService.generateCustomToken(participant.uid, {
      role: participant.role,
      sectionId: participant.sectionId,
      moderator: participant.isModerator,
      weight: participant.weight,
    });

    return {
      token,
      uid: participant.uid,
      displayName: participant.displayName,
      role: participant.role,
      roleLabel: participant.roleLabel,
      isModerator: participant.isModerator,
      weight: participant.weight,
    };
  }

  /**
   * HU23 / R-CHAT-4: elimina (borrado suave) un mensaje del chat de la sección.
   * Cada participante (alumno, delegado, subdelegado, JP o profesor) borra sus
   * propios mensajes; el profesor titular borra además los de cualquiera. La
   * autoría la comprueba el servicio contra el `senderId` guardado, nunca la
   * declara el cliente. Un mensaje ya borrado no se reescribe (200 idempotente).
   * 403 si no participa o si el mensaje es ajeno; 404 si no existe.
   */
  async deleteMessage(input: ChatRequester & { sectionId: number; messageId: string }) {
    const participant = await this.resolveParticipant(input);

    if (!canIssueToken(participant, input.userId)) {
      throw forbiddenDelete();
    }

    const result = await firebaseService.softDeleteChatMessage(
      input.sectionId,
      input.messageId,
      {
        deletedBy: participant.displayName,
        deletedByUid: participant.uid,
        deletedByRole: participant.role,
      },
      canDeleteAnyMessage(participant.role) ? {} : { requireSenderUid: participant.uid },
    );

    if (!result.existed) {
      throw new HttpError(404, "El mensaje no existe.", "CHAT_MESSAGE_NOT_FOUND");
    }
    if (result.forbidden) {
      throw forbiddenDelete();
    }

    return {
      deleted: true,
      messageId: input.messageId,
      deletedBy: result.alreadyDeleted
        ? result.deletedBy ?? participant.displayName
        : participant.displayName,
    };
  }
}
