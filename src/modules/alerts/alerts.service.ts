import type { EventBus } from "../../events/index.js";
import type { AlertsRepository, EnrollmentWithScore, StoredAlert } from "./alerts.repository.js";
import {
  aggregateCourseScores,
  isAcademicRisk,
  isCriticalRisk,
  personalAverage,
  requiredOnRemaining,
} from "./alerts.logic.js";

export class AlertsService {
  constructor(
    readonly repository: AlertsRepository,
    readonly events: EventBus,
  ) {}

  private buildCourseMap(enrollments: EnrollmentWithScore[]): Map<string, { courseName: string; sectionCode: string }> {
    const map = new Map<string, { courseName: string; sectionCode: string }>();
    for (const e of enrollments) {
      if (!map.has(e.course_name)) {
        map.set(e.course_name, { courseName: e.course_name, sectionCode: e.section_code ?? "" });
      }
    }
    return map;
  }

  private augmentAlerts(alerts: StoredAlert[], courseMap: Map<string, { courseName: string; sectionCode: string }>): StoredAlert[] {
    return alerts.map(a => {
      if (a.type === "academic_risk") {
        let courseNameFromTitle: string | null = null;
        if (a.title.startsWith("Riesgo Académico: ")) {
          courseNameFromTitle = a.title.replace("Riesgo Académico: ", "").trim();
        } else if (a.title.startsWith("Alerta de inasistencias - ")) {
          courseNameFromTitle = a.title.replace("Alerta de inasistencias - ", "").trim();
        }
        if (a.title.startsWith("Riesgo Crítico: ")) {
          courseNameFromTitle = a.title.replace("Riesgo Crítico: ", "").trim();
        }
        if (courseNameFromTitle) {
          const info = courseMap.get(courseNameFromTitle);
          if (info) {
            return { ...a, courseName: info.courseName, sectionCode: info.sectionCode };
          }
        }
      }
      return a;
    });
  }

  async getAlertsForStudent(studentId: number): Promise<StoredAlert[]> {
    const enrollments = await this.repository.getActiveEnrollmentsWithScores(studentId);
    const courseMap = this.buildCourseMap(enrollments);
    // Agregación y umbrales viven en alerts.logic.ts (puro, testeable).
    const courseGroups = aggregateCourseScores(enrollments);

    // Evaluate risk for each course. El riesgo CRÍTICO tiene precedencia sobre el
    // académico: si un alumno ya casi no puede aprobar (necesita >15 en lo que
    // resta), se emite solo la alerta crítica para no duplicar el aviso.
    for (const group of courseGroups) {
      if (isCriticalRisk(group.gradedWeight, group.weightedSum, group.totalWeight)) {
        const req = requiredOnRemaining(group.gradedWeight, group.weightedSum, group.totalWeight);
        const title = `Riesgo Crítico: ${group.name}`;
        const exists = await this.repository.findAlertByTitle(studentId, title);
        if (!exists) {
          const message = req > 20
            ? `Con tus notas actuales en ${group.name} ya no es posible alcanzar la nota aprobatoria. Acércate a tu profesor y toma asesorías cuanto antes.`
            : `Estás en riesgo crítico en ${group.name}: necesitarías al menos ${req.toFixed(1)} en las evaluaciones restantes para aprobar. Te recomendamos tomar asesorías cuanto antes.`;
          await this.repository.createAlert(studentId, "academic_risk", title, message);
        }
        continue;
      }
      if (isAcademicRisk(group.gradedWeight, group.weightedSum)) {
        const promedioPersonal = personalAverage(group.gradedWeight, group.weightedSum);
        const title = `Riesgo Académico: ${group.name}`;
        const exists = await this.repository.findAlertByTitle(studentId, title);
        if (!exists) {
          const message = `Tu promedio actual en ${group.name} es ${promedioPersonal.toFixed(2)} (avance evaluado del ${group.gradedWeight.toFixed(0)}%). Te sugerimos tomar asesorías.`;
          await this.repository.createAlert(studentId, "academic_risk", title, message);
        }
      }
    }

    // Evaluate high load weeks
    const highLoadWeeks = await this.repository.getHighLoadWeeks(studentId);
    for (const week of highLoadWeeks) {
      const title = `Alta Carga: Semana ${week.week_number}`;
      const exists = await this.repository.findAlertByTitle(studentId, title);
      if (!exists) {
        const message = `Tienes ${week.assessment_count} evaluaciones programadas en la semana ${week.week_number} de tu ciclo.`;
        await this.repository.createAlert(studentId, "high_load", title, message);
      }
    }

    // Solo las alertas del período ACTIVO: las de ciclos anteriores no tienen
    // por qué seguir en el buzón.
    //
    // `alert` no tiene columna de período —solo student_id y created_at—, así
    // que el corte es por fecha contra el inicio del ciclo vigente. Sin período
    // activo no se filtra, que es el comportamiento de siempre.
    //
    // Este filtro ya estaba escrito, pero quedó DEBAJO de un `return`: era
    // código muerto y nunca corrió. Aquella versión además se saltaba
    // `augmentAlerts`, así que activarla tal cual habría dejado a cada alerta
    // sin su información de curso. Detectado el 2026-09-04, con el buzón
    // mostrando alertas de 2026-1 estando en 2026-2.
    const periodStart = await this.repository.getActivePeriodStart();
    const alerts = await this.repository.getAlerts(studentId, periodStart ?? undefined);
    return this.augmentAlerts(alerts, courseMap);
  }

  async markAlertAsRead(studentId: number, alertId: number): Promise<boolean> {
    return await this.repository.markAlertAsRead(studentId, alertId);
  }
}

