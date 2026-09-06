import { partirNombre as splitName } from "../../shared/utils/nombre-persona.js";
import type { EventBus } from "../../events/index.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type {
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
} from "./section-management.schemas.js";
import type { SectionManagementRepository } from "./section-management.repository.js";
import { computeSectionStatistics, type SectionStatistics } from "./section-statistics.logic.js";
import type {
  AnnouncementResponse,
  AnnouncementRow,
  AnnouncementsResult,
  RepresentativePosition,
  RepresentativesResult,
} from "./section-management.types.js";


const formatDate = (value: Date | string | null) => {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
};

const roleLabel = (position: RepresentativePosition) =>
  position === "subdelegate" ? "subdelegado" : "delegado";

export class SectionManagementService {
  constructor(
    readonly repository: SectionManagementRepository,
    readonly events: EventBus,
  ) {}

  async getRepresentatives(studentId: number): Promise<RepresentativesResult> {
    try {
      const rows = await this.repository.findRepresentativesByStudent(studentId);
      return {
        sectionRepresentatives: rows.map((row) => ({
          id: String(row.id),
          enrollmentId: String(row.enrollment_id),
          idSeccion: String(row.section_id),
          codigoSeccion: row.section_code,
          idCurso: String(row.course_id),
          nombreCurso: row.course_name,
          role: roleLabel(row.position),
          alumnosMatriculados: Number(row.enrolled_students),
        })),
      };
    } catch (e) {
      throw this.wrap(e, "getRepresentatives");
    }
  }

  async getAnnouncements(
    studentId: number,
    sectionId: number,
  ): Promise<AnnouncementsResult> {
    try {
      const representative = await this.requireRepresentative(studentId, sectionId);
      const rows = await this.repository.findAnnouncementsByRepresentative(representative.id);
      return { anuncios: rows.map((row) => this.mapAnnouncement(row)) };
    } catch (e) {
      throw this.wrap(e, "getAnnouncements");
    }
  }

  // HU11: estadísticas REALES del salón (promedio, % aprobados, histograma)
  // calculadas desde las notas oficiales. Solo el delegado/subdelegado de la
  // sección puede verlas.
  async getStatistics(studentId: number, sectionId: number): Promise<SectionStatistics> {
    try {
      await this.requireRepresentative(studentId, sectionId);
      const rows = await this.repository.findSectionScoresForStats(sectionId);
      return computeSectionStatistics(rows);
    } catch (e) {
      throw this.wrap(e, "getStatistics");
    }
  }

  async createAnnouncement(
    studentId: number,
    sectionId: number,
    body: CreateAnnouncementBody,
  ) {
    try {
      const representative = await this.requireRepresentative(studentId, sectionId);
      const id = await this.repository.createAnnouncement({
        sectionRepresentativeId: representative.id,
        title: body.title,
        message: body.message,
      });
      const created = await this.repository.findAnnouncementById(id);
      if (!created) {
        throw new HttpError(500, "No se pudo recuperar el anuncio publicado.", "ANNOUNCEMENT_CREATE_FAILED");
      }

      return {
        message: "Anuncio publicado correctamente.",
        anuncio: this.mapAnnouncement(created),
      };
    } catch (e) {
      throw this.wrap(e, "createAnnouncement");
    }
  }

  async updateAnnouncement(
    studentId: number,
    id: number,
    body: UpdateAnnouncementBody,
  ) {
    try {
      await this.requireAnnouncementOwner(studentId, id);
      await this.repository.updateAnnouncement({
        id,
        title: body.title,
        message: body.message,
      });
      const updated = await this.repository.findAnnouncementById(id);
      if (!updated) {
        throw new HttpError(404, "Anuncio no encontrado.", "ANNOUNCEMENT_NOT_FOUND");
      }

      return {
        message: "Cambios guardados correctamente.",
        anuncio: this.mapAnnouncement(updated),
      };
    } catch (e) {
      throw this.wrap(e, "updateAnnouncement");
    }
  }

  async deleteAnnouncement(studentId: number, id: number) {
    try {
      await this.requireAnnouncementOwner(studentId, id);
      await this.repository.softDeleteAnnouncement(id);
      return { message: "Anuncio eliminado correctamente." };
    } catch (e) {
      throw this.wrap(e, "deleteAnnouncement");
    }
  }

  private async requireRepresentative(studentId: number, sectionId: number) {
    const representative = await this.repository.findRepresentativeAccess(studentId, sectionId);
    if (!representative) {
      throw new HttpError(
        403,
        "No puedes gestionar anuncios en esta sección.",
        "SECTION_FORBIDDEN",
      );
    }

    return representative;
  }

  private async requireAnnouncementOwner(studentId: number, id: number) {
    const ownership = await this.repository.findAnnouncementOwnership(id);
    if (!ownership || !ownership.isActive) {
      throw new HttpError(404, "Anuncio no encontrado.", "ANNOUNCEMENT_NOT_FOUND");
    }
    if (ownership.studentId !== studentId) {
      throw new HttpError(
        403,
        "Solo puedes modificar anuncios publicados por ti.",
        "ANNOUNCEMENT_FORBIDDEN",
      );
    }

    return ownership;
  }

  private mapAnnouncement(row: AnnouncementRow): AnnouncementResponse {
    const role = roleLabel(row.position);
    return {
      id: String(row.id),
      idSeccion: String(row.section_id),
      titulo: row.title,
      mensaje: row.message,
      fecha: formatDate(row.published_at),
      autorCode: row.autor_code,
      autor: {
        code: row.autor_code,
        ...splitName(row.full_name),
        email: row.institutional_email,
        role,
        career_id: null,
        currentCycle: "2026-1",
        setupComplete: true,
      },
    };
  }

  private wrap(e: unknown, where: string): HttpError {
    if (e instanceof HttpError) return e;
    console.error(`DB Error in section-management.service ${where}`, e);
    return new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
  }
}
