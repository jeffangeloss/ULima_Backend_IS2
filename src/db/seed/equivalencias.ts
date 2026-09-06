// Seed de `course_equivalence` — equivalencias de la malla anterior hacia la
// vigente (portal-sync.spec.md §Equivalencias de malla).
//
// Human-gated, mismo protocolo que `docentes.ts`: se corre con datos móviles
// (el wifi de la ULima bloquea el 5432), DESPUÉS de aplicar la migración
// `drizzle/0008_course_equivalence.sql`.
//
//   bun run src/db/seed/equivalencias.ts            # DRY-RUN: imprime el plan, no escribe
//   bun run src/db/seed/equivalencias.ts --apply    # aplica en una transacción
//
// Override por variable de entorno:
//   CURRICULUM_ID=1            fija la malla destino (si hubiera más de una)
//
// Es idempotente (`on conflict do nothing`) y solo escribe en
// `course_equivalence`: no crea cursos, no toca la malla y no toca el progreso
// de ningún alumno. Los alumnos recogen el efecto en su próxima importación.

import "dotenv/config";
import postgres from "postgres";
import {
  EQUIVALENCIAS, FUENTE, SIN_EQUIVALENCIA_CONOCIDA,
  consultarCursosVigentes, consultarLegadosVivos,
  planDeSiembra, problemasDeLaTabla,
} from "./equivalencias.logic.js";

// Conexión propia (no importa la config/db de la app, que exige JWT_SECRET y
// otras vars que este seed no usa). Mismo driver y misma URL que producción.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ Falta DATABASE_URL en .env");
  process.exit(1);
}
const sql = postgres(DATABASE_URL);

const APPLY = process.argv.includes("--apply");
const CURRICULUM_ID = process.env.CURRICULUM_ID ? Number(process.env.CURRICULUM_ID) : null;

async function main() {
  console.log(`\n=== Seed course_equivalence — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`);

  // 0. La tabla, antes de mirar la base: un código legado repetido se perdería
  //    en silencio bajo el `on conflict do nothing`.
  const problemas = problemasDeLaTabla(EQUIVALENCIAS);
  if (problemas.length > 0) {
    throw new Error(`La tabla de equivalencias tiene problemas:\n  - ${problemas.join("\n  - ")}`);
  }

  // 1. Malla destino. La BD tiene una sola y todos los alumnos cuelgan de ella;
  //    si algún día hubiera más, este seed NO adivina cuál.
  const mallas = (await sql`
    select c.id, c.name, count(cc.id)::int as cursos
    from curriculum c
    left join curriculum_course cc on cc.curriculum_id = c.id
    group by c.id, c.name
    order by c.id
  `) as unknown as Array<{ id: number; name: string; cursos: number }>;

  if (mallas.length === 0) throw new Error("No hay ninguna fila en `curriculum`.");
  const malla = CURRICULUM_ID !== null
    ? mallas.find((m) => m.id === CURRICULUM_ID)
    : mallas.length === 1 ? mallas[0] : undefined;
  if (!malla) {
    console.error("Mallas en la BD:");
    for (const m of mallas) console.error(`  [${m.id}] ${m.name} — ${m.cursos} cursos`);
    throw new Error(
      CURRICULUM_ID !== null
        ? `CURRICULUM_ID=${CURRICULUM_ID} no existe.`
        : "Hay más de una malla: fija cuál con CURRICULUM_ID=<id>.",
    );
  }
  console.log(`Malla destino: [${malla.id}] ${malla.name} — ${malla.cursos} cursos\n`);

  // 2. Resolver los códigos VIGENTES contra la malla. Los ids de
  //    `curriculum_course` son de la instancia, nunca del documento.
  const filas = await consultarCursosVigentes(
    sql, malla.id, EQUIVALENCIAS.map((e) => e.vigente),
  );
  const idPorCodigo = new Map(filas.map((f) => [String(f.code), Number(f.curriculum_course_id)]));

  const { aInsertar, sinCursoVigente } = planDeSiembra(EQUIVALENCIAS, idPorCodigo);

  // 3. Chequeo de sanidad: un código "legado" que TODAVÍA existe en la malla no
  //    es legado. El match directo de portal-sync ya lo resuelve y la
  //    equivalencia sería, en el mejor caso, letra muerta.
  const legadosVivos = await consultarLegadosVivos(
    sql, malla.id, EQUIVALENCIAS.map((e) => e.legacy),
  );

  console.log(`Plan (fuente: ${FUENTE}):`);
  for (const f of aInsertar) {
    console.log(`  ✓ ${f.legacy.padEnd(8)} → ${f.vigente.padEnd(8)} (curriculum_course ${f.curriculumCourseId})`);
  }
  for (const e of sinCursoVigente) {
    console.log(`  ✗ ${e.legacy.padEnd(8)} → ${e.vigente.padEnd(8)} NO se inserta: ese código no está en la malla`);
  }
  if (legadosVivos.length > 0) {
    console.log(`\n⚠️  Estos códigos "legados" SIGUEN en la malla vigente, así que el match`);
    console.log(`   directo ya los resuelve y la equivalencia sobra — revisa la tabla:`);
    for (const l of legadosVivos) console.log(`     ${l.code}`);
  }

  console.log(`\nResumen: ${aInsertar.length} a insertar, ${sinCursoVigente.length} sin curso vigente.`);
  console.log(`Pendientes SIN equivalencia conocida (${SIN_EQUIVALENCIA_CONOCIDA.length}, todos de Estudios`);
  console.log(`Generales): ${SIN_EQUIVALENCIA_CONOCIDA.join(", ")}`);
  console.log(`Necesitan la tabla oficial 2026-1 ↔ 2025-1; hasta entonces siguen contando`);
  console.log(`en el warning PROGRESS_SKIPPED de la importación.`);

  if (sinCursoVigente.length > 0) {
    console.log(`\n⚠️  Las marcadas con ✗ no se insertan. Si esperabas que cruzaran, el`);
    console.log(`   código vigente de la tabla está mal o la malla cargada no es la que crees.`);
  }

  if (!APPLY) {
    console.log(`\n(DRY-RUN) No se escribió nada. Revisa el plan y corre con --apply.\n`);
    return;
  }
  if (aInsertar.length === 0) {
    console.log(`\nNada que insertar.\n`);
    return;
  }

  // Transacción de postgres.js: si algo lanza, ROLLBACK automático.
  let insertadas = 0;
  await sql.begin(async (tx) => {
    for (const f of aInsertar) {
      const r = (await tx`
        insert into course_equivalence (curriculum_id, legacy_code, curriculum_course_id, source)
        values (${malla.id}, ${f.legacy}, ${f.curriculumCourseId}, ${FUENTE})
        on conflict (curriculum_id, legacy_code) do nothing
        returning id
      `) as unknown as Array<{ id: number }>;
      insertadas += r.length;
    }
  });

  console.log(`\n✓ Seed aplicado. Insertadas ${insertadas}; ${aInsertar.length - insertadas} ya existían.`);
  console.log(`  Los alumnos lo recogen en su próxima importación desde el portal.\n`);
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("\n✗ Seed falló:", e instanceof Error ? e.message : e);
    await sql.end().catch(() => {});
    process.exit(1);
  });
