/**
 * Lógica PURA de la fusión de docentes duplicados. Sin base de datos: todo
 * entra por parámetros y sale por valor, para poder probar a quién elige y
 * cuándo se niega a fusionar.
 *
 * El duplicado lo creó `upsertTeacher` al resolver solo por `teacher_code`:
 * las filas sembradas a mano no lo tienen, así que la misma persona entraba de
 * nuevo con el nombre en otro orden. La prevención ya está en el repositorio;
 * esto repara lo que quedó.
 */
import { claveNombre } from "../../shared/utils/nombre-persona.js";

export type DocenteFila = {
  id: number; fullName: string; teacherCode: string | null;
  institutionalEmail: string | null; userId: number | null;
};
export type Seccion = { id: number; teacherId: number; jpId: number | null };
export type Asesoria = {
  id: number; teacherId: number; offeringId: number; sectionId: number | null;
  dayOfWeek: number; startTime: string; kind: string; sessionDate: string | null;
};
export type Fusion = {
  clave: string; superviviente: DocenteFila; perdedores: DocenteFila[];
  /** por qué ganó: sirve para que el humano revise el DRY-RUN */
  motivo: string;
  rellenarCodigo: string | null; moverEmail: string | null;
  secciones: number[]; jps: number[]; asesorias: number[];
};
export type Saltado = { clave: string; ids: number[]; motivo: string };
export type PlanFusion = { fusionar: Fusion[]; saltados: Saltado[] };

type Entrada = {
  docentes: DocenteFila[]; secciones: Seccion[]; asesorias: Asesoria[];
  /** secciones del período activo: desempatan a favor de la fila que se está usando hoy. */
  seccionesActivas: Set<number>;
};

/** Clave del índice único que aplica a esta asesoría, según su tipo. Dos filas
 *  con la misma clave no pueden coexistir con el mismo docente. */
const claveAsesoria = (a: Asesoria): string =>
  a.kind === "extra"
    ? `extra|${a.sectionId ?? ""}|${a.sessionDate ?? ""}|${a.startTime}`
    : `rec|${a.sectionId === null ? `curso:${a.offeringId}` : `sec:${a.sectionId}`}|${a.dayOfWeek}|${a.startTime}`;

export const planificarFusion = (e: Entrada): PlanFusion => {
  const grupos = new Map<string, DocenteFila[]>();
  for (const doc of e.docentes) {
    const clave = claveNombre(doc.fullName);
    if (!clave) continue;                       // sin nombre no hay identidad que comparar
    (grupos.get(clave) ?? grupos.set(clave, []).get(clave)!).push(doc);
  }

  const fusionar: Fusion[] = []; const saltados: Saltado[] = [];
  for (const [clave, filas] of [...grupos].sort(([a], [b]) => a.localeCompare(b))) {
    if (filas.length < 2) continue;
    const ids = filas.map((f) => f.id).sort((a, b) => a - b);
    const saltar = (motivo: string) => saltados.push({ clave, ids, motivo });
    const enGrupo = new Set(ids);

    // Dos cuentas = dos personas que entran a la app. Fusionarlas dejaría a una
    // sin acceso, y elegir cuál no es una decisión que pueda tomar un script.
    const conCuenta = filas.filter((f) => f.userId !== null);
    if (conCuenta.length > 1) { saltar(`${conCuenta.length} filas tienen cuenta de usuario (#${conCuenta.map((f) => f.id).join(", #")})`); continue; }

    // chk_section_jp_not_teacher: el JP no puede ser el profesor de su sección.
    const choqueJp = e.secciones.find((s) => enGrupo.has(s.teacherId) && s.jpId !== null && enGrupo.has(s.jpId));
    if (choqueJp) { saltar(`es profesor y jefe de práctica de la misma sección ${choqueJp.id}: la fusión violaría chk_section_jp_not_teacher`); continue; }

    // uq_section_jp: un JP pertenece a una sola sección.
    const comoJp = e.secciones.filter((s) => s.jpId !== null && enGrupo.has(s.jpId));
    if (comoJp.length > 1) { saltar(`quedaría como jefe de práctica de ${comoJp.length} secciones (${comoJp.map((s) => s.id).join(", ")}): la fusión violaría uq_section_jp`); continue; }

    // Índices únicos de asesorías: dos del grupo con la misma clave chocarían.
    const asesoriasGrupo = e.asesorias.filter((a) => enGrupo.has(a.teacherId));
    const porClave = new Map<string, number[]>();
    for (const a of asesoriasGrupo) (porClave.get(claveAsesoria(a)) ?? porClave.set(claveAsesoria(a), []).get(claveAsesoria(a))!).push(a.id);
    const choque = [...porClave.values()].find((v) => v.length > 1);
    if (choque) { saltar(`dos asesorías chocarían al fusionar (ids ${choque.join(", ")}): mismo curso, día y hora`); continue; }

    // Elección. Con cuenta primero; después, la que las secciones del ciclo
    // activo ya están usando; después, la que tiene código; y al final el id
    // menor, para que dos corridas den siempre el mismo resultado.
    const usadaHoy = (f: DocenteFila) =>
      e.secciones.some((s) => e.seccionesActivas.has(s.id) && (s.teacherId === f.id || s.jpId === f.id));
    const puntaje = (f: DocenteFila) => [Number(f.userId !== null), Number(usadaHoy(f)), Number(Boolean(f.teacherCode))];
    const ordenadas = [...filas].sort((a, b) => {
      const [pa, pb] = [puntaje(a), puntaje(b)];
      for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
      return a.id - b.id;
    });
    const superviviente = ordenadas[0];
    const perdedores = ordenadas.slice(1);
    const motivo = superviviente.userId !== null ? "tiene cuenta de usuario"
      : usadaHoy(superviviente) ? "es la que usan las secciones del ciclo activo"
      : superviviente.teacherCode ? "es la única con teacher_code"
      : "id menor (las demás no se distinguen)";

    const perdedoresIds = new Set(perdedores.map((f) => f.id));
    fusionar.push({
      clave, superviviente, perdedores, motivo,
      // Rellenar el código deja a la fila encontrable por la próxima importación.
      rellenarCodigo: superviviente.teacherCode ? null : (perdedores.find((f) => f.teacherCode)?.teacherCode ?? null),
      // `institutional_email` es unique: si no se rescata antes del borrado, se pierde.
      moverEmail: superviviente.institutionalEmail ? null : (perdedores.find((f) => f.institutionalEmail)?.institutionalEmail ?? null),
      secciones: e.secciones.filter((s) => perdedoresIds.has(s.teacherId)).map((s) => s.id).sort((a, b) => a - b),
      jps: e.secciones.filter((s) => s.jpId !== null && perdedoresIds.has(s.jpId)).map((s) => s.id).sort((a, b) => a - b),
      asesorias: e.asesorias.filter((a) => perdedoresIds.has(a.teacherId)).map((a) => a.id).sort((a, b) => a - b),
    });
  }
  return { fusionar, saltados };
};
