// Seed — fusiona los docentes duplicados que dejó el `upsertTeacher` viejo.
//
// Human-gated: correr con datos móviles (el wifi de la ULima bloquea el 5432).
//
//   bun run src/db/seed/fusionar-docentes.ts            # DRY-RUN: imprime el plan, no escribe
//   bun run src/db/seed/fusionar-docentes.ts --ensayo   # ejecuta la transacción y la REVIERTE
//   bun run src/db/seed/fusionar-docentes.ts --apply    # aplica en UNA transacción
//
// El duplicado nació de resolver el docente solo por `teacher_code`: las filas
// sembradas a mano no lo tienen, así que la misma persona entraba otra vez con
// el nombre en otro orden ("DIAZ PARRA, JOSE RAUL" vs "JOSE RAUL DIAZ PARRA").
// La prevención ya vive en portal-sync.repository.ts; esto repara lo anterior.
//
// Solo tres columnas apuntan a `teacher`: section.teacher_id, section.jp_id y
// course_advising_session.teacher_id. Se repuntan las tres al superviviente y
// recién entonces se borran las filas perdedoras.
//
// Un grupo se SALTA (y se reporta) si fusionarlo violaría una constraint o
// exigiría una decisión humana: dos cuentas, profesor y JP de la misma sección,
// dos jefaturas de práctica, o dos asesorías que chocarían en curso/día/hora.
import "dotenv/config";
import postgres from "postgres";
import { planificarFusion, type Asesoria, type DocenteFila, type PlanFusion, type Seccion } from "./fusionar-docentes.logic.js";

const APPLY = process.argv.includes("--apply");
const ENSAYO = process.argv.includes("--ensayo");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("❌ Falta DATABASE_URL en .env"); process.exit(1); }
const sql = postgres(DATABASE_URL, { max: 1 });

async function cargar() {
  const docentes = (await sql`
    select id, full_name, teacher_code, institutional_email, user_id from teacher order by id`) as unknown as Array<{ id: number; full_name: string; teacher_code: string | null; institutional_email: string | null; user_id: number | null }>;
  const secciones = (await sql`select id, teacher_id, jp_id from section order by id`) as unknown as Array<{ id: number; teacher_id: number; jp_id: number | null }>;
  const asesorias = (await sql`
    select id, teacher_id, course_offering_id, section_id, day_of_week, start_time::text as start_time, kind, session_date::text as session_date
    from course_advising_session order by id`) as unknown as Array<{ id: number; teacher_id: number; course_offering_id: number; section_id: number | null; day_of_week: number; start_time: string; kind: string; session_date: string | null }>;
  const activas = (await sql`
    select s.id from section s join course_offering co on co.id = s.course_offering_id
    join academic_period ap on ap.id = co.academic_period_id where ap.is_active`) as unknown as Array<{ id: number }>;
  return {
    docentes: docentes.map((t): DocenteFila => ({ id: Number(t.id), fullName: t.full_name, teacherCode: t.teacher_code, institutionalEmail: t.institutional_email, userId: t.user_id === null ? null : Number(t.user_id) })),
    secciones: secciones.map((s): Seccion => ({ id: Number(s.id), teacherId: Number(s.teacher_id), jpId: s.jp_id === null ? null : Number(s.jp_id) })),
    asesorias: asesorias.map((a): Asesoria => ({ id: Number(a.id), teacherId: Number(a.teacher_id), offeringId: Number(a.course_offering_id), sectionId: a.section_id === null ? null : Number(a.section_id), dayOfWeek: Number(a.day_of_week), startTime: a.start_time, kind: a.kind, sessionDate: a.session_date })),
    seccionesActivas: new Set(activas.map((a) => Number(a.id))),
  };
}

function imprimir(plan: PlanFusion) {
  console.log(`\n=== Fusión de docentes duplicados — ${APPLY ? "APPLY" : ENSAYO ? "ENSAYO (se revierte)" : "DRY-RUN"} ===\n`);
  console.log(`FUSIONAR ${plan.fusionar.length} grupos`);
  for (const f of plan.fusionar) {
    console.log(`\n   conservar #${f.superviviente.id} ${f.superviviente.fullName}  [${f.superviviente.teacherCode ?? "sin código"}]${f.superviviente.userId ? " · CUENTA" : ""}`);
    console.log(`     porque ${f.motivo}`);
    for (const p of f.perdedores) console.log(`     borrar   #${p.id} ${p.fullName}  [${p.teacherCode ?? "sin código"}]`);
    const mueve = [
      f.secciones.length ? `${f.secciones.length} secciones como profesor (${f.secciones.join(", ")})` : "",
      f.jps.length ? `${f.jps.length} como jefe de práctica (${f.jps.join(", ")})` : "",
      f.asesorias.length ? `${f.asesorias.length} asesorías` : "",
    ].filter(Boolean);
    console.log(`     repuntar ${mueve.length ? mueve.join(" · ") : "(nada: la copia no se usaba)"}`);
    if (f.rellenarCodigo) console.log(`     rellenar teacher_code = ${f.rellenarCodigo}`);
    if (f.moverEmail) console.log(`     rescatar correo ${f.moverEmail}`);
  }
  console.log(`\nSALTADOS ${plan.saltados.length}`);
  for (const s of plan.saltados) console.log(`   #${s.ids.join(", #")}  ${s.motivo}`);
  const totalBorrar = plan.fusionar.reduce((n, f) => n + f.perdedores.length, 0);
  console.log(`\nfilas de teacher a borrar: ${totalBorrar}`);
}

async function aplicar(plan: PlanFusion, revertir: boolean) {
  class Revertir extends Error {}
  const resumen = { secciones: 0, jps: 0, asesorias: 0, codigos: 0, correos: 0, borradas: 0 };
  try {
    await sql.begin(async (tx) => {
      for (const f of plan.fusionar) {
        const vivo = f.superviviente.id;
        const muertos = f.perdedores.map((p) => p.id);
        // Primero se rescata lo que el borrado se llevaría: el correo es unique,
        // así que hay que liberarlo del perdedor antes de ponerlo en el vivo.
        if (f.moverEmail) {
          await tx`update teacher set institutional_email = null where id = any(${muertos}::int[]) and institutional_email = ${f.moverEmail}`;
          await tx`update teacher set institutional_email = ${f.moverEmail} where id = ${vivo}`;
          resumen.correos++;
        }
        if (f.rellenarCodigo) {
          await tx`update teacher set teacher_code = null where id = any(${muertos}::int[]) and teacher_code = ${f.rellenarCodigo}`;
          await tx`update teacher set teacher_code = ${f.rellenarCodigo} where id = ${vivo}`;
          resumen.codigos++;
        }
        const s = await tx`update section set teacher_id = ${vivo} where teacher_id = any(${muertos}::int[]) returning id`;
        const j = await tx`update section set jp_id = ${vivo} where jp_id = any(${muertos}::int[]) returning id`;
        const a = await tx`update course_advising_session set teacher_id = ${vivo} where teacher_id = any(${muertos}::int[]) returning id`;
        resumen.secciones += s.length; resumen.jps += j.length; resumen.asesorias += a.length;
        const b = await tx`delete from teacher where id = any(${muertos}::int[]) returning id`;
        resumen.borradas += b.length;
      }
      console.log(`\n${revertir ? "🧪 ENSAYO" : "✅"} secciones repuntadas ${resumen.secciones} · jefaturas ${resumen.jps} · asesorías ${resumen.asesorias} · códigos ${resumen.codigos} · correos ${resumen.correos} · docentes borrados ${resumen.borradas}`);
      if (revertir) throw new Revertir();
    });
  } catch (e) {
    if (e instanceof Revertir) { console.log("   transacción revertida: la base quedó igual que antes"); return; }
    throw e;
  }
}

async function main() {
  const ctx = await cargar();
  console.log(`contexto: ${ctx.docentes.length} docentes · ${ctx.secciones.length} secciones · ${ctx.asesorias.length} asesorías · ${ctx.seccionesActivas.size} secciones del ciclo activo`);
  const plan = planificarFusion(ctx);
  imprimir(plan);
  if (!APPLY && !ENSAYO) { console.log("\n(DRY-RUN) No se escribió nada. Revisa el plan y corre con --apply.\n"); return; }
  await aplicar(plan, ENSAYO);
}

main().catch((e) => { console.error("❌", e); process.exitCode = 1; }).finally(() => sql.end());
