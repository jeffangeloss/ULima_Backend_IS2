import type { ParseResult } from "./html.js";
import type { CicloActivo } from "../portal-sync.types.js";

/**
 * Ciclo vigente de layout.jsp. CUIDADO: la página contiene DOS ciclos distintos.
 * El bloque "Información por Período Académico: Ciclo 2026-1" es el ciclo
 * ANTERIOR y aparece ANTES en el HTML: una búsqueda ingenua e insensible a
 * mayúsculas devuelve el ciclo equivocado (verificado contra el fixture real).
 *
 * Fuente primaria: los enlaces de sílabo llevan el ciclo embebido
 * (`RestrictToCategory=20262_650033`), los genera el portal y no son ambiguos.
 * Fuente secundaria: el rótulo `CICLO: 2026-2` de Información para Matrícula y
 * Aula Virtual, en MAYÚSCULAS y con dos puntos — esa grafía es justo lo que lo
 * distingue del "Ciclo 2026-1" del bloque por período.
 * Si ambas fuentes discrepan se falla en vez de adivinar.
 */
export const parseCicloActivo = (html: string): ParseResult<CicloActivo> => {
  const fromSilabo = [...html.matchAll(/RestrictToCategory=(\d{5})_\d{4,6}/g)].map((m) => m[1]);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  // Sin flag `i` a propósito.
  const fromLabel = [...text.matchAll(/\bCICLO\s*:\s*(\d{4})\s*-\s*([0-2])/g)].map((m) => `${m[1]}${m[2]}`);

  const candidates = [...new Set([...fromSilabo, ...fromLabel])];
  if (candidates.length === 0) return { ok: false, reason: "no se encontró el ciclo vigente en layout.jsp" };
  if (candidates.length > 1) {
    return { ok: false, reason: `el portal reporta ciclos contradictorios: ${candidates.join(", ")}` };
  }
  const cociclo = candidates[0];
  return { ok: true, data: { cocicloUrl: cociclo, periodCode: `${cociclo.slice(0, 4)}-${cociclo.slice(4)}` } };
};
