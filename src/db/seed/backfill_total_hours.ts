// Backfill RS-BE-9 — corrige `course_offering.total_hours` del período ACTIVO.
//
// Las ofertas escritas antes de RS-BE-9 conservan su `créditos x 16`, que
// subestima las horas reales entre 20% y 40%. El código nuevo ya las calcula
// bien, pero solo las reescribe cuando alguien vuelve a importar del portal;
// esto las corrige de una vez.
//
//   bun run src/db/seed/backfill_total_hours.ts            # DRY-RUN
//   bun run src/db/seed/backfill_total_hours.ts --apply    # aplica en una transacción
//
// SOLO toca el período con `is_active = true`. Las 257 filas con horas del
// período cerrado 2026-1 vienen de una carga manual que nadie documentó y son
// el único conjunto de contraste que existe: no se tocan.
//
// La precedencia NO se reimplementa acá: se importa `resolveOfferingTotalHours`,
// la misma función que usa la importación, para que backfill y runtime no puedan
// divergir. Eso arrastra `src/db/index.ts` y por lo tanto la config de la app,
// así que este script sí necesita las vars de entorno completas (JWT_SECRET
// incluido), a diferencia del resto de los seeds.

import "dotenv/config";
import postgres from "postgres";
import {
  academicWeekCount,
  resolveOfferingTotalHours,
} from "../../modules/portal-sync/portal-sync.repository.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ Falta DATABASE_URL en .env");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const sql = postgres(DATABASE_URL);

type Fila = {
  offering_id: number;
  code: string;
  name: string;
  credits: number;
  curriculum_hsem: number | null;
  schedule_hsem: string | null;
  total_actual: string;
};

async function main() {
  const periodos = await sql<{ id: number; code: string; start_date: string; end_date: string }[]>`
    select id, code, start_date::text, end_date::text
    from academic_period where is_active = true
  `;
  if (periodos.length !== 1) {
    console.error(`❌ Se esperaba exactamente 1 período activo, hay ${periodos.length}. Abortando.`);
    process.exitCode = 1;
    return;
  }
  const p = periodos[0];
  const weeks = academicWeekCount(p.start_date, p.end_date);
  console.log(`${APPLY ? "APLICANDO" : "DRY-RUN"} · período ${p.code} · ${weeks} semanas\n`);

  const filas = await sql<Fila[]>`
    select
      co.id                as offering_id,
      c.code, c.name,
      c.default_credit     as credits,
      c.weekly_hours       as curriculum_hsem,
      co.total_hours       as total_actual,
      (
        select max(x.horas) from (
          select sum(extract(epoch from (ss.end_time - ss.start_time)) / 3600.0) as horas
          from schedule_session ss
          join section sec2 on sec2.id = ss.section_id
          where sec2.course_offering_id = co.id
          group by ss.section_id
        ) x
      )                    as schedule_hsem
    from course_offering co
    join course c on c.id = co.course_id
    join academic_period ap on ap.id = co.academic_period_id
    where ap.is_active = true
    order by c.code
  `;

  const porFuente = { schedule: 0, curriculum: 0, credits: 0 };
  const cambios: { id: number; code: string; name: string; antes: number; despues: number; fuente: string }[] = [];

  for (const f of filas) {
    const { hours, source } = resolveOfferingTotalHours(
      {
        scheduleWeeklyHours: f.schedule_hsem == null ? null : Number(f.schedule_hsem),
        curriculumWeeklyHours: f.curriculum_hsem,
        credits: Number(f.credits),
      },
      weeks,
    );
    porFuente[source] += 1;
    const antes = Number(f.total_actual);
    const despues = Math.max(1, Math.round(hours));
    if (antes !== despues) {
      cambios.push({ id: f.offering_id, code: f.code, name: f.name, antes, despues, fuente: source });
    }
  }

  console.log(`  ofertas del período: ${filas.length}`);
  console.log(`  fuente horario:      ${porFuente.schedule}`);
  console.log(`  fuente malla:        ${porFuente.curriculum}`);
  console.log(`  fuente créditos:     ${porFuente.credits}   <- degradación, no debería haber muchas`);
  console.log(`  a corregir:          ${cambios.length}\n`);

  if (cambios.length) {
    console.log("  cambios:");
    for (const c of cambios) {
      const flecha = `${String(c.antes).padStart(6)} -> ${String(c.despues).padStart(6)} h`;
      console.log(`     ${c.code}  ${flecha}  (${c.fuente})  ${c.name}`);
    }
    const bajan = cambios.filter((c) => c.despues < c.antes);
    if (bajan.length) {
      console.log(`\n  ⚠ ${bajan.length} oferta(s) BAJAN de total. Bajar el denominador sube el % de`);
      console.log("    inasistencia y adelanta el umbral de impedido: revisar una por una.");
    }
  }

  if (!APPLY) {
    console.log("\nDRY-RUN: no se escribió nada. Repetir con --apply.");
    return;
  }
  if (cambios.length === 0) {
    console.log("Nada que corregir.");
    return;
  }

  // Todo o nada: una corrección parcial deja el denominador nuevo para unos
  // cursos y el viejo para otros, y el % de inasistencia deja de ser comparable.
  await sql.begin(async (tx) => {
    for (const c of cambios) {
      await tx`
        update course_offering set total_hours = ${c.despues}
        where id = ${c.id}
          and academic_period_id = (select id from academic_period where is_active = true)
      `;
    }
  });
  console.log(`\n✓ ${cambios.length} ofertas corregidas.`);
}

main()
  .catch((e) => { console.error("❌", e); process.exitCode = 1; })
  .finally(() => sql.end());
