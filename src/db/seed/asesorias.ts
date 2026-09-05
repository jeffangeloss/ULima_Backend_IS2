// Seed — asesorías del ciclo desde el Excel de la facultad ("Rol de atención de
// alumnos" + "Asesoría de tesis"), validadas contra el horario oficial (PDF).
//
// Human-gated: correr con datos móviles (el wifi de la ULima bloquea el 5432).
//
//   python3 scripts/asesorias-extraer.py <atencion.xlsx> <horario.pdf> --periodo 2026-2
//   bun run src/db/seed/asesorias.ts                         # DRY-RUN: imprime el plan, no escribe
//   bun run src/db/seed/asesorias.ts --ensayo                # ejecuta la transacción y la REVIERTE
//   bun run src/db/seed/asesorias.ts --apply                 # aplica en UNA transacción
//   bun run src/db/seed/asesorias.ts --periodo=2026-2        # (default 2026-2)
//
// Qué hace, en orden:
//   1. Lee scripts/out/asesorias-<periodo>.json y horario-<periodo>.txt (gitignored:
//      el Excel trae enlaces Zoom personales y el repo es público).
//   2. Resuelve cada fila a (course_offering del período, teacher) y la clasifica
//      contra el PDF: entra lo respaldado, lo que el PDF no puede juzgar (curso
//      ausente o seminario multi-asesor); se RETIENE lo sospechoso, lo inválido y
//      lo que no resuelve, cada una con su motivo.
//   3. Crea los docentes que no existen (todos confirmados en el PDF) con el código
//      PORTAL: que usará portal-sync, para no duplicarlos después.
//   4. Escribe SOLO sesiones recurrentes a nivel de curso (section_id NULL) del
//      período objetivo. Es dueño de ese conjunto: las que ya no están en el Excel
//      se borran si no tienen RSVP; con RSVP se conservan y se reportan.
//      Ningún otro período se toca (2026-1 tiene confirmaciones colgando).
//
// Toda la lógica está en asesorias.logic.ts y probada en test/HU18_jeff.
import "dotenv/config";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import {
  parsearHorarioPdf, planificar,
  type CursoBd, type DocenteBd, type FilaAtencion, type FilaTesis, type Plan, type SesionExistente,
} from "./asesorias.logic.js";

const APPLY = process.argv.includes("--apply");
// Ensayo: corre exactamente el mismo SQL contra Postgres (lo que SQLite no puede
// validar: el ON CONFLICT sobre un índice único parcial) y deshace todo al final.
const ENSAYO = process.argv.includes("--ensayo");
class Revertir extends Error {}
const PERIODO = (process.argv.find((a) => a.startsWith("--periodo=")) ?? "").split("=")[1] || "2026-2";
const JSON_PATH = process.env.ASESORIAS_JSON ?? `scripts/out/asesorias-${PERIODO}.json`;
const PDF_TXT = process.env.HORARIO_TXT ?? `scripts/out/horario-${PERIODO}.txt`;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("❌ Falta DATABASE_URL en .env"); process.exit(1); }
const sql = postgres(DATABASE_URL, { max: 1 });

const leer = (p: string) => { try { return readFileSync(p, "utf8"); } catch { console.error(`❌ No encuentro ${p}. Corre primero scripts/asesorias-extraer.py`); process.exit(1); } };

async function cargarContexto(periodId: number) {
  const docentes = (await sql`
    select t.id, t.teacher_code, t.full_name, (t.user_id is not null) as con_cuenta,
      exists (select 1 from section s join course_offering co on co.id = s.course_offering_id
              where co.academic_period_id = ${periodId} and (s.teacher_id = t.id or s.jp_id = t.id)) as en_secciones
    from teacher t order by t.id`) as unknown as Array<{ id: number; teacher_code: string | null; full_name: string; con_cuenta: boolean; en_secciones: boolean }>;
  const cursos = (await sql`
    select c.code, c.name, co.id as offering_id
    from course c left join course_offering co on co.course_id = c.id and co.academic_period_id = ${periodId}`) as unknown as Array<{ code: string; name: string; offering_id: number | null }>;
  const existentes = (await sql`
    select cas.id, cas.course_offering_id, cas.teacher_id, cas.day_of_week, cas.start_time::text as start_time,
      exists (select 1 from advising_rsvp r where r.advising_session_id = cas.id) as tiene_rsvp
    from course_advising_session cas join course_offering co on co.id = cas.course_offering_id
    where co.academic_period_id = ${periodId} and cas.kind = 'recurring' and cas.section_id is null`) as unknown as Array<{ id: number; course_offering_id: number; teacher_id: number; day_of_week: number; start_time: string; tiene_rsvp: boolean }>;
  return {
    docentes: docentes.map((d): DocenteBd => ({ id: Number(d.id), teacherCode: d.teacher_code, fullName: d.full_name, conCuenta: Boolean(d.con_cuenta), enSecciones: Boolean(d.en_secciones) })),
    cursos: cursos.map((c): CursoBd => ({ code: c.code, name: c.name, offeringId: c.offering_id === null ? null : Number(c.offering_id) })),
    existentes: existentes.map((x): SesionExistente => ({ id: Number(x.id), offeringId: Number(x.course_offering_id), teacherId: Number(x.teacher_id), dayOfWeek: Number(x.day_of_week), startTime: x.start_time, tieneRsvp: Boolean(x.tiene_rsvp) })),
  };
}

function imprimir(plan: Plan, periodo: string) {
  const porCat = (xs: { categoria: string }[]) => Object.entries(xs.reduce<Record<string, number>>((acc, x) => ((acc[x.categoria] = (acc[x.categoria] ?? 0) + 1), acc), {}))
    .sort().map(([k, n]) => `${k}=${n}`).join("  ");
  console.log(`\n=== Asesorías ${periodo} — ${APPLY ? "APPLY" : ENSAYO ? "ENSAYO (se revierte)" : "DRY-RUN"} ===\n`);
  console.log(`CREAR ${plan.crear.length} sesiones   [${porCat(plan.crear)}]`);
  console.log(`   atención: ${plan.crear.filter((s) => s.origen === "atencion").length}   tesis: ${plan.crear.filter((s) => s.origen === "tesis").length}   modalidad: ${porCat(plan.crear.map((s) => ({ categoria: s.modality })))}`);
  const sinDatos = plan.crear.filter((s) => s.sinDatosModalidad);
  if (sinDatos.length) console.log(`   ⚠ sin aula ni Zoom (quedan hybrid): ${[...new Set(sinDatos.map((s) => `${s.origen} f${s.fila}`))].join(", ")}`);
  console.log(`\nDOCENTES RESUELTOS ${plan.docentesResueltos.length}   [${porCat(plan.docentesResueltos.map((d) => ({ categoria: d.modo })))}]`);
  for (const d of plan.docentesResueltos.filter((x) => x.modo !== "cuenta" && x.modo !== "sembrado")) {
    console.log(`   ${d.modo.padEnd(12)} ${d.nombreExcel}  ->  ${d.id === null ? "(crear)" : "#" + d.id}  ${d.fullName ?? ""}  [${d.teacherCode ?? "sin código"}]`);
  }
  console.log(`   (los 'cuenta' y 'sembrado' son empates exactos; se omiten por brevedad)`);
  console.log(`\nDOCENTES NUEVOS ${plan.docentesNuevos.length}`);
  for (const d of plan.docentesNuevos) console.log(`   + ${d.fullName}   [${d.teacherCode}]   (PDF: ${d.desde})`);
  console.log(`\nRETENIDAS ${plan.retener.length}   [${porCat(plan.retener)}]`);
  for (const r of plan.retener) console.log(`   f${String(r.fila).padEnd(4)} ${r.categoria.padEnd(19)} ${r.docente} · ${r.asignatura}\n         ${r.motivo}`);
  console.log(`\nBORRAR ${plan.borrar.length} (del período, sin RSVP, ya no están en el Excel)${plan.borrar.length ? ": ids " + plan.borrar.map((b) => b.id).join(", ") : ""}`);
  if (plan.conservarConRsvp.length) console.log(`CONSERVAR con RSVP ${plan.conservarConRsvp.length}: ids ${plan.conservarConRsvp.map((b) => b.id).join(", ")}`);
}

async function aplicar(plan: Plan, revertir: boolean) {
  await sql.begin(async (tx) => {
    // Primero los borrados: si alguna fila "nueva" resultara ser una existente, el
    // upsert de abajo no debe pisar sesiones que luego se borrarían. La guarda de
    // RSVP cubre una confirmación creada entre el DRY-RUN y el APPLY.
    let borradas = 0;
    for (const b of plan.borrar) {
      const r = await tx`delete from course_advising_session where id = ${b.id}
        and not exists (select 1 from advising_rsvp r where r.advising_session_id = ${b.id}) returning id`;
      borradas += r.length;
    }
    const idNuevo = new Map<string, number>();
    for (const d of plan.docentesNuevos) {
      const rows = await tx`
        insert into teacher (teacher_code, full_name) values (${d.teacherCode}, ${d.fullName})
        on conflict (teacher_code) do update set full_name = teacher.full_name
        returning id, (xmax = 0) as created`;
      // Un "nuevo" que ya existía con ese código es una persona distinta con el
      // mismo slug, o un plan desactualizado: no se le cuelga nada a ciegas.
      if (!rows[0].created) throw new Error(`teacher_code ${d.teacherCode} ya existía (#${rows[0].id}); el plan lo daba por nuevo`);
      idNuevo.set(d.fullName, Number(rows[0].id));
    }
    let creadas = 0, actualizadas = 0;
    for (const s of plan.crear) {
      const teacherId = s.teacherId ?? idNuevo.get(s.docenteNuevo!);
      if (!teacherId) throw new Error(`sin teacher_id para ${s.docenteNombre}`);
      // Índice único parcial uq_course_advising_session_course: el ON CONFLICT
      // lleva el MISMO predicado para que Postgres lo reconozca.
      const rows = await tx`
        insert into course_advising_session
          (course_offering_id, section_id, teacher_id, day_of_week, start_time, end_time, classroom, meeting_url, modality, note, kind)
        values (${s.offeringId}, null, ${teacherId}, ${s.dayOfWeek}, ${s.startTime}, ${s.endTime}, ${s.classroom}, ${s.meetingUrl}, ${s.modality}, ${s.nota}, 'recurring')
        on conflict (course_offering_id, teacher_id, day_of_week, start_time) where section_id is null and kind = 'recurring'
        do update set end_time = excluded.end_time, classroom = excluded.classroom, meeting_url = excluded.meeting_url,
                      modality = excluded.modality, note = excluded.note
        returning (xmax = 0) as created`;
      if (rows[0].created) creadas++; else actualizadas++;
    }
    console.log(`\n${revertir ? "🧪 ENSAYO" : "✅"} docentes nuevos ${idNuevo.size} · sesiones creadas ${creadas} · actualizadas ${actualizadas} · borradas ${borradas}`);
    if (revertir) throw new Revertir();
  }).catch((e) => { if (e instanceof Revertir) console.log("   transacción revertida: la base quedó igual que antes"); else throw e; });
}

async function main() {
  const datos = JSON.parse(leer(JSON_PATH)) as { periodo: string; atencion: FilaAtencion[]; tesis: FilaTesis[] };
  if (datos.periodo !== PERIODO) { console.error(`❌ El JSON es del período ${datos.periodo}, no ${PERIODO}`); process.exit(1); }
  const pdf = parsearHorarioPdf(leer(PDF_TXT));
  const periodo = (await sql`select id, is_active from academic_period where code = ${PERIODO}`)[0] as { id: number; is_active: boolean } | undefined;
  if (!periodo) { console.error(`❌ No existe el período ${PERIODO} en la BD`); process.exit(1); }
  if (!periodo.is_active) console.warn(`⚠ El período ${PERIODO} NO está activo en la BD`);
  const ctx = await cargarContexto(Number(periodo.id));
  console.log(`contexto: ${ctx.docentes.length} docentes · ${ctx.cursos.filter((c) => c.offeringId).length} cursos con oferta · ${ctx.existentes.length} asesorías propias ya cargadas`);
  console.log(`PDF: ${pdf.docentes.size} docentes · ${pdf.cursos.size} cursos · ${pdf.pares.size} pares docente↔curso`);
  const plan = planificar({ atencion: datos.atencion, tesis: datos.tesis, pdf, ...ctx });
  imprimir(plan, PERIODO);
  if (!APPLY && !ENSAYO) { console.log("\n(DRY-RUN) No se escribió nada. Revisa el plan y corre con --apply.\n"); return; }
  await aplicar(plan, !APPLY);
}

main().catch((e) => { console.error("❌", e); process.exitCode = 1; }).finally(() => sql.end());
