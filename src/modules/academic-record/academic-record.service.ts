import type { EventBus } from "../../events/index.js";
import { buildAcademicRecordDto } from "./academic-record.logic.js";
import type { AcademicRecordRepository } from "./academic-record.repository.js";
import type { AcademicRecordDto } from "./academic-record.types.js";

/**
 * RS-BE-26 y RS-BE-27. El service no importa `db`: recibe el repository ya
 * construido. `events` está por la arquitectura del repo (igual que en
 * `curriculum.service.ts:5-9`); esta funcionalidad todavía no publica eventos.
 */
export class AcademicRecordService {
  constructor(
    readonly repository: AcademicRecordRepository,
    readonly events: EventBus,
  ) {}

  /** Todo lo que el alumno ve de su récord. Si nunca sincronizó con
   *  consentimiento y un récord de confianza, las tres lecturas vienen vacías
   *  y el DTO sale en su estado vacío, con 200. */
  async getMine(studentId: number): Promise<AcademicRecordDto> {
    const snapshot = await this.repository.findSnapshot(studentId);
    const entries = await this.repository.findEntries(studentId);
    const periods = await this.repository.findPeriodSummaries(studentId);
    return buildAcademicRecordDto(snapshot, entries, periods);
  }

  async deleteMine(studentId: number): Promise<{ ok: true }> {
    await this.repository.deleteAll(studentId);
    return { ok: true };
  }
}
