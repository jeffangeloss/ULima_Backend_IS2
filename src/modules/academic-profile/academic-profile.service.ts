import type { EventBus } from "../../events/index.js";
import type { AcademicProfileRepository } from "./academic-profile.repository.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type {
  AppRole,
  ProfileResponse,
  UpdateSpecialtiesRequest,
} from "./academic-profile.types.js";

export class AcademicProfileService {
  constructor(
    readonly repository: AcademicProfileRepository,
    readonly events: EventBus,
  ) {}

  async getProfile(userId: number, role: AppRole): Promise<{ profile: ProfileResponse }> {
    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");

    const specialties = await this.repository.findActiveSpecialties(profile.studentId);
    return {
      profile: {
        ...profile,
        role,
        specialties,
      },
    };
  }

  async getCareers() {
    return { careers: await this.repository.findAllCareers() };
  }

  async getSpecialties(userId: number, careerId?: number) {
    if (careerId != null) {
      if (!Number.isInteger(careerId) || careerId <= 0) {
        throw new HttpError(400, "careerId debe ser un entero positivo.", "INVALID_CAREER_ID");
      }
      return { specialties: await this.repository.findSpecialtiesByCareerId(careerId) };
    }

    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");
    return { specialties: await this.repository.findSpecialtiesByStudentCareer(profile.studentId) };
  }

  async updateSpecialties(userId: number, input: UpdateSpecialtiesRequest) {
    const profile = await this.repository.findProfileByUserId(userId);
    if (!profile) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");

    const primarySpecialtyId = input.primarySpecialtyId ?? null;
    const interestSpecialtyIds = [...new Set(input.interestSpecialtyIds ?? [])];
    if (primarySpecialtyId != null && interestSpecialtyIds.includes(primarySpecialtyId)) {
      throw new HttpError(409, "La especialidad principal no puede repetirse como interés.", "DUPLICATE_PRIMARY");
    }

    const specialtyIds = [
      ...(primarySpecialtyId == null ? [] : [primarySpecialtyId]),
      ...interestSpecialtyIds,
    ];

    for (const specialtyId of specialtyIds) {
      const exists = await this.repository.specialtyExists(specialtyId);
      if (!exists) throw new HttpError(404, "Especialidad no encontrada.", "SPECIALTY_NOT_FOUND");

      const belongsToCareer = await this.repository.specialtyBelongsToCareer(specialtyId, profile.career.id);
      if (!belongsToCareer) {
        throw new HttpError(404, "Especialidad no encontrada para la carrera del estudiante.", "SPECIALTY_NOT_FOUND");
      }
    }

    // BR-AP-08: todo el reemplazo en una sola transacción del repository.
    try {
      await this.repository.replaceStudentSpecialties(
        profile.studentId,
        primarySpecialtyId,
        interestSpecialtyIds,
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new HttpError(409, "Conflicto al guardar especialidad principal.", "DUPLICATE_PRIMARY");
      }
      throw error;
    }

    return {
      message: "Specialties updated" as const,
      setupComplete: true as const,
      specialties: await this.repository.currentSpecialtySelection(profile.studentId),
    };
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  }
}
