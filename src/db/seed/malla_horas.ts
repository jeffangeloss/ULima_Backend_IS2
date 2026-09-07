// Seed RS-BE-9 — horas de clase SEMANALES del plan de estudios oficial.
//
// Fuente: "Plan de estudios 2026-1", Carrera de Ingeniería de Sistemas, Facultad
// de Ingeniería (ULima). Columna TOT = TEO + PRA. Documento oficial de la
// Universidad, no dato inventado: mismo criterio que `course_equivalence`.
//
// Por qué existe: `course_offering.total_hours` se calculaba como créditos x 16 y
// eso subestima las horas reales entre 20% y 40% (PARADIGMAS son 3 créditos y
// 5 h/sem = 80 h, no 48 h). Ese número es el denominador del % de inasistencia,
// así que quedarse corto adelanta el umbral de impedido. Ver RS-BE-9 en
// specs/features/portal-sync/portal-sync.spec.md.
//
// Solo escribe `course.weekly_hours`. No crea cursos ni toca ninguna otra
// columna: un código que no exista en la BD se reporta y se omite.
//
//   bun run src/db/seed/malla_horas.ts            # DRY-RUN: imprime el plan, no escribe
//   bun run src/db/seed/malla_horas.ts --apply    # aplica en una transacción
//
// Requiere la migración drizzle/0009_course_weekly_hours.sql ya aplicada.
// Requiere datos móviles: el wifi de la ULima bloquea el 5432.

import "dotenv/config";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ Falta DATABASE_URL en .env");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

/** code -> horas semanales (columna TOT del plan oficial 2026-1). */
export const MALLA_HORAS: ReadonlyArray<{ code: string; weeklyHours: number; name: string }> = [
  { code: "510003", weeklyHours: 6, name: "LENGUAJE Y COMUNICACIÓN I" },
  { code: "510005", weeklyHours: 4, name: "INTRODUCCIÓN A LA INGENIERÍA" },
  { code: "510006", weeklyHours: 4, name: "PROCESOS PSICOLÓGICOS" },
  { code: "6508", weeklyHours: 4, name: "METODOLOGÍAS DE INVESTIGACIÓN" },
  { code: "510007", weeklyHours: 2, name: "ÉTICA CIUDADANA" },
  { code: "510014", weeklyHours: 6, name: "PRECÁLCULO" },
  { code: "6511", weeklyHours: 4, name: "LENGUAJE Y COMUNICACIÓN II" },
  { code: "510011", weeklyHours: 4, name: "INTRODUCCIÓN AL COMERCIO INTERNACIONAL" },
  { code: "6384", weeklyHours: 4, name: "ÁLGEBRA LINEAL" },
  { code: "510015", weeklyHours: 4, name: "FUNDAMENTOS DE ECONOMÍA" },
  { code: "510010", weeklyHours: 4, name: "FILOSOFÍA APLICADA" },
  { code: "6503", weeklyHours: 6, name: "CÁLCULO I" },
  { code: "560042", weeklyHours: 5, name: "CÁLCULO II" },
  { code: "650053", weeklyHours: 5, name: "FÍSICA PARA SISTEMAS" },
  { code: "650054", weeklyHours: 5, name: "INTRODUCCIÓN A LA PROGRAMACIÓN" },
  { code: "560040", weeklyHours: 4, name: "INTELIGENCIA ARTIFICIAL APLICADA" },
  { code: "650055", weeklyHours: 5, name: "ESTRUCTURAS DISCRETAS DE COMPUTACIÓN" },
  { code: "560047", weeklyHours: 3, name: "CÁLCULO III" },
  { code: "560046", weeklyHours: 4, name: "ESTADÍSTICA Y PROBABILIDAD" },
  { code: "650008", weeklyHours: 4, name: "MODELACIÓN E INTEGRACIÓN DE SISTEMAS" },
  { code: "650056", weeklyHours: 6, name: "ARQUITECTURA DE COMPUTADORAS" },
  { code: "560043", weeklyHours: 3, name: "COSTEO DE OPERACIONES" },
  { code: "650086", weeklyHours: 6, name: "PROGRAMACIÓN ORIENTADA A OBJETOS" },
  { code: "560048", weeklyHours: 4, name: "INVESTIGACIÓN DE OPERACIONES I" },
  { code: "650057", weeklyHours: 6, name: "SISTEMAS OPERATIVOS" },
  { code: "650058", weeklyHours: 5, name: "ESTADÍSTICA APLICADA" },
  { code: "650009", weeklyHours: 4, name: "DESARROLLO DE COMPETENCIAS GERENCIALES" },
  { code: "650059", weeklyHours: 6, name: "ESTRUCTURAS DE DATOS I" },
  { code: "650060", weeklyHours: 5, name: "MODELAMIENTO DE BASE DE DATOS" },
  { code: "650010", weeklyHours: 4, name: "INGENIERÍA DE PROCESOS DE NEGOCIO" },
  { code: "650015", weeklyHours: 6, name: "REDES DE COMPUTADORAS" },
  { code: "650018", weeklyHours: 4, name: "SIMULACIÓN" },
  { code: "650061", weeklyHours: 6, name: "ESTRUCTURAS DE DATOS II" },
  { code: "650022", weeklyHours: 5, name: "PROGRAMACIÓN WEB" },
  { code: "650016", weeklyHours: 4, name: "GESTIÓN FINANCIERA" },
  { code: "650062", weeklyHours: 5, name: "SISTEMAS DE INTELIGENCIA EMPRESARIAL" },
  { code: "650019", weeklyHours: 4, name: "GESTIÓN DE OPERACIONES" },
  { code: "650063", weeklyHours: 5, name: "INGENIERÍA DE SOFTWARE I" },
  { code: "650064", weeklyHours: 5, name: "APRENDIZAJE DE MÁQUINA / MACHINE LEARNING" },
  { code: "650065", weeklyHours: 5, name: "CIBERSEGURIDAD / CYBERSECURITY" },
  { code: "650066", weeklyHours: 5, name: "PROPUESTA DE INVESTIGACIÓN" },
  { code: "650028", weeklyHours: 4, name: "SISTEMAS ERP" },
  { code: "650042", weeklyHours: 4, name: "AUDITORÍA Y CONTROL DE SISTEMAS" },
  { code: "1327", weeklyHours: 6, name: "INGENIERÍA DE SOFTWARE II" },
  { code: "650033", weeklyHours: 4, name: "PLANEAMIENTO ESTRATÉGICO" },
  { code: "5674", weeklyHours: 4, name: "GESTIÓN DE PROYECTOS" },
  { code: "650035", weeklyHours: 6, name: "SEMINARIO DE INVESTIGACIÓN I" },
  { code: "650067", weeklyHours: 5, name: "SEGURIDAD DE SISTEMAS" },
  { code: "650040", weeklyHours: 6, name: "SEMINARIO DE INVESTIGACIÓN II" },
  { code: "650068", weeklyHours: 5, name: "GESTIÓN DE SERVICIOS DIGITALES" },
  { code: "650069", weeklyHours: 5, name: "PROYECTO INTEGRADOR DE SISTEMAS" },
  { code: "650070", weeklyHours: 5, name: "PARADIGMAS DE PROGRAMACIÓN" },
  { code: "650012", weeklyHours: 5, name: "INTERNET DE LAS COSAS / INTERNET OF THINGS" },
  { code: "650071", weeklyHours: 5, name: "GESTIÓN DE BASE DE DATOS" },
  { code: "650072", weeklyHours: 5, name: "ANÁLISIS Y DISEÑO DE ALGORITMOS" },
  { code: "650073", weeklyHours: 5, name: "REDES AVANZADAS" },
  { code: "650074", weeklyHours: 3, name: "INGENIERÍA DEL CONOCIMIENTO" },
  { code: "650075", weeklyHours: 5, name: "DEEP LEARNING" },
  { code: "650030", weeklyHours: 5, name: "PROGRAMACIÓN MÓVIL" },
  { code: "650076", weeklyHours: 5, name: "TÓPICOS AVANZADOS EN CIBERSEGURIDAD" },
  { code: "650077", weeklyHours: 4, name: "SISTEMAS DISTRIBUIDOS" },
  { code: "650044", weeklyHours: 4, name: "ANALÍTICA CON BIG DATA" },
  { code: "650078", weeklyHours: 4, name: "ANALÍTICA DE NEGOCIOS" },
  { code: "650079", weeklyHours: 5, name: "PROYECTO DE DESARROLLO DE SOFTWARE" },
  { code: "650025", weeklyHours: 5, name: "COMPUTACIÓN EN LA NUBE" },
  { code: "650080", weeklyHours: 4, name: "INNOVACIÓN DIGITAL" },
  { code: "650081", weeklyHours: 5, name: "PROYECTO DE VIDEOJUEGOS" },
  { code: "650082", weeklyHours: 4, name: "ARQUITECTURA EMPRESARIAL" },
  { code: "650083", weeklyHours: 5, name: "ARQUITECTURA DE TECNOLOGÍAS DE LA INFORMACIÓN" },
  { code: "650084", weeklyHours: 4, name: "DEVOPS" },
  { code: "650085", weeklyHours: 5, name: "ARQUITECTURA DE SOFTWARE" },
];

const sql = postgres(DATABASE_URL);

async function main() {
  console.log(`${APPLY ? "APLICANDO" : "DRY-RUN"} · ${MALLA_HORAS.length} cursos del plan 2026-1
`);

  const codes = MALLA_HORAS.map((m) => m.code);
  const enBd = await sql`
    select code, default_credit, weekly_hours from course where code = any(${codes})
  `;
  const porCode = new Map(enBd.map((r) => [String(r.code), r]));

  const faltantes = MALLA_HORAS.filter((m) => !porCode.has(m.code));
  const cambios = MALLA_HORAS.filter((m) => {
    const r = porCode.get(m.code);
    return r && Number(r.weekly_hours ?? -1) !== m.weeklyHours;
  });

  console.log(`  en la BD:   ${porCode.size}/${MALLA_HORAS.length}`);
  console.log(`  a escribir: ${cambios.length}`);
  console.log(`  sin match:  ${faltantes.length}`);
  if (faltantes.length) {
    console.log("
  ⚠ códigos del plan que NO existen en course (se omiten):");
    for (const f of faltantes) console.log(`     ${f.code}  ${f.name}`);
  }
  if (cambios.length) {
    console.log("
  cambios:");
    for (const c of cambios) {
      const antes = porCode.get(c.code)!.weekly_hours;
      console.log(`     ${c.code}  ${String(antes ?? "null").padStart(4)} -> ${String(c.weeklyHours).padStart(2)} h/sem   ${c.name}`);
    }
  }

  if (!APPLY) {
    console.log("
DRY-RUN: no se escribió nada. Repetir con --apply.");
    return;
  }
  if (cambios.length === 0) {
    console.log("
Nada que escribir.");
    return;
  }

  // Todo o nada: una carga parcial dejaría el denominador correcto para unos
  // cursos y el viejo para otros, que es peor que no tocar nada.
  await sql.begin(async (tx) => {
    for (const c of cambios) {
      await tx`update course set weekly_hours = ${c.weeklyHours} where code = ${c.code}`;
    }
  });
  console.log(`
✓ ${cambios.length} cursos actualizados.`);
}

main()
  .catch((e) => { console.error("❌", e); process.exitCode = 1; })
  .finally(() => sql.end());
