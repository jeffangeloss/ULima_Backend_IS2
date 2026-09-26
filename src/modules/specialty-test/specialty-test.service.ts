import type { EventBus } from "../../events/index.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { evaluateAnswers, roundAffinity } from "./specialty-test.logic.js";
import { buildResultUlises, buildTemplateReason, nameOf } from "./specialty-test.templates.js";
import { buildReasonData, writeReason, type CohereChat } from "./specialty-test.reason.js";
import type { SpecialtyTestRepository } from "./specialty-test.repository.js";
import type { EvaluateBody } from "./specialty-test.schemas.js";
import type {
  Answer,
  ContentRegistry,
  EvaluateResponse,
  PublicContent,
  SpecialtyIds,
  SpecialtyTestContent,
  StoredRankingEntry,
  StoredResultResponse,
} from "./specialty-test.types.js";
import { DUEL_ANSWERS, SCALE_ANSWERS } from "./specialty-test.types.js";
import { resolveSpecialtyIds, toPublicContent, toPublicTiebreak } from "./specialty-test.view.js";

const DUELO = new Set<string>(DUEL_ANSWERS);
const ESCALA = new Set<string>(SCALE_ANSWERS);

/**
 * Reglas del test de especialidad (RS-BE-38 a RS-BE-45).
 *
 * Recibe el repository, el `EventBus` (sin eventos en esta funcionalidad), el
 * cliente de Cohere y el registro de versiones. Los dos últimos se inyectan
 * para que las pruebas no llamen a Cohere y puedan armar un registro con más
 * de una versión. El alumno siempre llega desde el token.
 */
export class SpecialtyTestService {
  constructor(
    readonly repository: SpecialtyTestRepository,
    readonly events: EventBus,
    readonly cohere: CohereChat,
    readonly registry: ContentRegistry,
  ) {}

  private vigente(): SpecialtyTestContent {
    const content = this.registry.byVersion.get(this.registry.currentVersion);
    if (!content) throw new Error("La versión vigente del test no está en el registro.");
    return content;
  }

  /**
   * RS-BE-38 y RS-BE-45: el alumno tiene que existir y las cuatro claves
   * tienen que encontrar su especialidad activa en su carrera.
   */
  private async disponibilidad(studentId: number, content: SpecialtyTestContent): Promise<SpecialtyIds> {
    const alumno = await this.repository.findStudentCareer(studentId);
    if (!alumno) throw new HttpError(404, "Usuario no encontrado.", "USER_NOT_FOUND");
    const activas = await this.repository.findActiveSpecialties(alumno.careerId);
    const ids = resolveSpecialtyIds(content, activas);
    if (!ids) {
      throw new HttpError(
        404,
        "El test de especialidad no está disponible para tu carrera.",
        "SPECIALTY_TEST_NOT_AVAILABLE",
      );
    }
    return ids;
  }

  async getContent(studentId: number): Promise<PublicContent> {
    const content = this.vigente();
    return toPublicContent(content, await this.disponibilidad(studentId, content));
  }

  /** RS-BE-39, pasos 4 a 7, y RS-BE-41 a RS-BE-44. El paso 3 ya lo hizo Zod. */
  async evaluate(studentId: number, body: EvaluateBody): Promise<EvaluateResponse> {
    // Paso 4: la versión tiene que estar en el registro.
    const content = this.registry.byVersion.get(body.version);
    if (!content) {
      throw new HttpError(409, "El test se actualizó. Vuelve a empezarlo.", "SPECIALTY_TEST_VERSION_OUTDATED", {
        currentVersion: this.registry.currentVersion,
      });
    }

    // Paso 5: exactamente las 14 preguntas de esa versión, cada una con su tipo de respuesta.
    const answers = this.respuestasDeLaVersion(content, body.answers);

    // Paso 6: el alumno y sus cuatro especialidades.
    const ids = await this.disponibilidad(studentId, content);

    // Paso 7: los desempates recibidos tienen que ser justo los que tocan.
    const paso = evaluateAnswers(content, answers, body.tiebreakAnswers ?? []);
    if (paso.kind === "mismatch") {
      throw new HttpError(
        400,
        "Los desempates enviados no son los que corresponden a estas respuestas.",
        "SPECIALTY_TEST_TIEBREAK_MISMATCH",
        { expected: paso.expected },
      );
    }
    if (paso.kind === "tiebreak") {
      const lineas = content.ulisesLines.tiebreak;
      return {
        status: "tiebreak",
        tiebreak: toPublicTiebreak(paso.tiebreaker),
        ulisesLine: paso.line === "first" ? lineas.first : lineas.second,
      };
    }

    const ev = paso.evaluation;
    const ranking = ev.ranking.map((key) => ({
      key,
      specialtyId: ids[key],
      name: nameOf(content, key),
      affinity: roundAffinity(ev.scores[key].S),
    }));

    // RS-BE-44: el guardado va ANTES de Cohere. Si falla, sube como 500 sin gastar la llamada.
    const guardado: StoredRankingEntry[] = ranking.map(({ key, specialtyId, affinity }) => ({
      key,
      specialtyId,
      affinity,
    }));
    const { completedAt } = await this.repository.saveResult(studentId, content.version, guardado, ev.tie);

    const plantillas = buildTemplateReason(content, answers, ev);
    const motivo = await writeReason(
      this.cohere,
      buildReasonData(content, answers, ev, plantillas.main),
      plantillas.text,
      content.specialties.map((s) => s.name),
    );

    return {
      status: "result",
      result: {
        version: content.version,
        completedAt,
        tie: ev.tie,
        ranking,
        reason: motivo.reason,
        reasonSource: motivo.reasonSource,
        ulises: buildResultUlises(content, ev),
      },
    };
  }

  async getResult(studentId: number): Promise<StoredResultResponse> {
    const content = this.vigente();
    await this.disponibilidad(studentId, content);

    const fila = await this.repository.findResult(studentId);
    if (!fila) return { result: null };

    return {
      result: {
        version: fila.contentVersion,
        isCurrentVersion: fila.contentVersion === this.registry.currentVersion,
        completedAt: fila.completedAt,
        tie: fila.isTie,
        ranking: fila.ranking.map((e) => ({
          key: e.key,
          specialtyId: e.specialtyId,
          name: nameOf(content, e.key),
          affinity: e.affinity,
        })),
      },
    };
  }

  /**
   * Paso 5 de RS-BE-39. `missing` son las preguntas de la versión que faltan,
   * en el orden de la versión; `unexpected`, los ids que la versión no tiene,
   * en orden alfabético; `invalid`, las preguntas con una respuesta del otro
   * tipo, en el orden de la versión.
   */
  private respuestasDeLaVersion(
    content: SpecialtyTestContent,
    recibidas: Readonly<Record<string, string>>,
  ): Record<string, Answer> {
    const ids = new Set(content.questions.map((q) => q.id));
    const missing = content.questions.filter((q) => !Object.hasOwn(recibidas, q.id)).map((q) => q.id);
    const unexpected = Object.keys(recibidas).filter((id) => !ids.has(id)).sort((a, b) => a.localeCompare(b));
    const invalid = content.questions
      .filter((q) => Object.hasOwn(recibidas, q.id))
      .filter((q) => !(q.type === "duel" ? DUELO : ESCALA).has(recibidas[q.id]!))
      .map((q) => q.id);

    if (missing.length > 0 || unexpected.length > 0 || invalid.length > 0) {
      throw new HttpError(
        400,
        "Las respuestas no corresponden a esta versión del test.",
        "SPECIALTY_TEST_INVALID_ANSWERS",
        { missing, unexpected, invalid },
      );
    }
    return recibidas as Record<string, Answer>;
  }
}
