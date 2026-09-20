import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { AcademicRecordController } from "./academic-record.controller.js";
import { AcademicRecordRepository } from "./academic-record.repository.js";
import { createAcademicRecordRoutes } from "./academic-record.routes.js";
import { AcademicRecordService } from "./academic-record.service.js";

const academicRecordRepository = new AcademicRecordRepository(db);
const academicRecordService = new AcademicRecordService(academicRecordRepository, eventBus);
const academicRecordController = new AcademicRecordController(academicRecordService);

export const academicRecordRoutes = createAcademicRecordRoutes(academicRecordController);

export { AcademicRecordController } from "./academic-record.controller.js";
export { AcademicRecordRepository } from "./academic-record.repository.js";
export { AcademicRecordService } from "./academic-record.service.js";
export { createAcademicRecordRoutes } from "./academic-record.routes.js";
export type {
  AcademicRecordDto, CountCreditsDto, EntryRecord, PeriodSummaryRecord, SnapshotRecord,
} from "./academic-record.types.js";
