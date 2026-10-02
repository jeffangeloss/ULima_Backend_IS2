import type { NotaInput } from "./grades.types.js";

export function calcularPromedioPonderado(notas: NotaInput[]): number {
  // Guard redundante y a la vez legible: con `notas` vacío el bucle de abajo deja
  // `suma = 0` y retorna 0 igual. Por eso mutar esta condición genera un MUTANTE
  // EQUIVALENTE (mismo resultado con o sin el guard), imposible de matar con un
  // test; se excluye de la mutación con la directiva oficial de Stryker.
  // Stryker disable next-line ConditionalExpression
  if (notas.length === 0) return 0;
  let suma = 0;
  for (const n of notas) {
    suma += n.valor * (n.peso / 100);
  }
  return suma;
}

export function sumaDePesos(notas: NotaInput[]): number {
  return notas.reduce((sum, n) => sum + n.peso, 0);
}

const HOSTS_DE_DRIVE = new Set(["drive.google.com", "drive.usercontent.google.com", "docs.google.com"]);

/**
 * RF-EST-7. Los mismos tres hosts que acepta `SilaboLink.tryParse` en la app. Una URL de
 * cactus u otra cualquiera no cuenta como enlace de Drive.
 */
export function esUrlDeDrive(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && HOSTS_DE_DRIVE.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
