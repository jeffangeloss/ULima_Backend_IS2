/**
 * RS-BE-38 · Lo que la app recibe del contenido, y la traducción de cada
 * clave a su id de `specialty`. Funciones puras.
 *
 * Viaja lo que la app necesita para conducir el test sin red entre pregunta y
 * pregunta. No viaja el nombre del ícono en Flutter, los resúmenes y los
 * electivos de cada tarea, los pesos, el umbral, las plantillas, las líneas de
 * Ulises del resultado salvo `loading`, las del desempate, los desempates, los
 * ejemplos, el balance ni las fuentes: son del cálculo y del motivo.
 */
import { plain } from "./specialty-test.templates.js";
import type {
  ContentTask,
  PublicContent,
  PublicTask,
  PublicTiebreak,
  SpecialtyIds,
  SpecialtyTestContent,
  Tiebreaker,
} from "./specialty-test.types.js";
import { SPECIALTY_KEYS } from "./specialty-test.types.js";

/** Nombre sin tildes, sin mayúsculas y sin espacios al borde. */
const clave = (nombre: string): string => plain(nombre).trim();

/**
 * Busca, entre las especialidades activas de la carrera del alumno, la que
 * tiene el mismo nombre que cada clave del contenido. Si alguna de las cuatro
 * no aparece, devuelve null: el test no está disponible para ese alumno.
 */
export const resolveSpecialtyIds = (
  content: SpecialtyTestContent,
  activas: ReadonlyArray<{ id: number; name: string }>,
): SpecialtyIds | null => {
  const ids: Partial<SpecialtyIds> = {};
  for (const k of SPECIALTY_KEYS) {
    const especialidad = content.specialties.find((s) => s.key === k);
    const fila = especialidad && activas.find((a) => clave(a.name) === clave(especialidad.name));
    if (!fila) return null;
    ids[k] = fila.id;
  }
  return ids as SpecialtyIds;
};

const tareaPublica = (id: string, tarea: ContentTask): PublicTask => ({
  id,
  specialty: tarea.specialty,
  text: tarea.text,
  illustration: tarea.illustration,
  icon: tarea.icon.lucide,
});

export const toPublicContent = (content: SpecialtyTestContent, ids: SpecialtyIds): PublicContent => {
  const lineas = content.ulisesLines;
  return {
    version: content.version,
    specialties: content.specialties.map((s) => ({
      key: s.key,
      specialtyId: ids[s.key],
      name: s.name,
      tagline: s.tagline,
      color: { light: s.color.light, dark: s.color.dark },
      icon: s.icon.lucide,
      totalCredits: s.totalCredits,
      electives: s.electives.map((e) => ({
        code: e.code,
        name: e.name,
        shortName: e.shortName,
        credits: e.credits,
        prerequisite: e.prerequisite,
      })),
    })),
    ulises: {
      welcome: [...lineas.welcome],
      startButton: lineas.startButton,
      duelHelp: lineas.duelHelp,
      scaleHelp: lineas.scaleHelp,
      reactions: {
        pick: [...lineas.reactions.pick],
        both: [...lineas.reactions.both],
        none: [...lineas.reactions.none],
        scale: [...lineas.reactions.scale],
      },
      loading: lineas.result.loading,
    },
    duelOptions: content.meta.duelOptions.map((o) => ({ id: o.id, label: o.label })),
    scaleOptions: content.weights.scale.options.map((o) => ({ id: o.id, label: o.label })),
    questions: content.questions.map((q) =>
      q.type === "duel"
        ? {
            id: q.id,
            n: q.n,
            type: "duel" as const,
            prompt: q.prompt,
            top: tareaPublica(`${q.id}.top`, q.top),
            bottom: tareaPublica(`${q.id}.bottom`, q.bottom),
            reaction: q.reaction,
          }
        : {
            id: q.id,
            n: q.n,
            type: "scale" as const,
            prompt: q.prompt,
            task: tareaPublica(`${q.id}.task`, q.task),
            blockClose: q.blockClose,
          },
    ),
  };
};

export const toPublicTiebreak = (t: Tiebreaker): PublicTiebreak => ({
  id: t.id,
  order: t.order,
  prompt: t.prompt,
  top: tareaPublica(`${t.id}.top`, t.top),
  bottom: tareaPublica(`${t.id}.bottom`, t.bottom),
});
