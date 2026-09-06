/**
 * Identidad de una persona a partir de su nombre.
 *
 * Vive acá, y no dentro de un módulo, porque la comparten portal-sync (que
 * escribe `teacher` al importar) y los seeds (que la escriben a mano). Cuando
 * cada uno tenía su propia regla, la misma persona entraba dos veces: el seed
 * la guardaba como "APELLIDOS, NOMBRES" y portal-sync como "NOMBRES APELLIDOS",
 * y ninguna comparación los reconocía. En producción eso dejó 11 docentes
 * duplicados (2026-09-05).
 */

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Mayúsculas, sin tildes, sin comas, espacios colapsados. Para COMPARAR, no para mostrar. */
export const normalizarNombre = (s: unknown): string =>
  sinTildes(String(s ?? "")).toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();

/** Palabras del nombre, únicas y ordenadas alfabéticamente. */
export const tokensNombre = (s: unknown): string[] =>
  [...new Set(normalizarNombre(s).split(" ").filter(Boolean))].sort();

/**
 * Clave de identidad: el conjunto de palabras del nombre, ordenado. Es lo que
 * hace que "DIAZ PARRA, JOSE RAUL" y "JOSE RAUL DIAZ PARRA" sean la misma
 * persona. Un nombre vacío da clave vacía.
 */
export const claveNombre = (s: unknown): string => tokensNombre(s).join(" ");

/**
 * ¿Son la misma persona? Igualdad EXACTA de conjunto de palabras: acá no se
 * tolera un nombre truncado ni un apellido de más, porque el resultado se
 * escribe en la base. La tolerancia con evidencia de truncado vive en el seed
 * de asesorías, donde el horario oficial sirve de juez.
 *
 * Dos nombres vacíos no son la misma persona: nadie es nadie.
 */
export const mismaPersona = (a: unknown, b: unknown): boolean => {
  const clave = claveNombre(a);
  return clave !== "" && clave === claveNombre(b);
};
