import { Hono } from "hono";
import type { CourseDetailController } from "./course-detail.controller.js";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import { HttpError } from "../../shared/errors/http-error.js";

const splitName = (fullName: string) => {
  if (fullName.includes(",")) {
    const parts = fullName.split(",");
    return {
      lastName: parts[0].trim(),
      firstName: parts.slice(1).join(",").trim(),
    };
  }
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 2) {
    return {
      lastName: parts.slice(0, 2).join(" "),
      firstName: parts.slice(2).join(" "),
    };
  } else if (parts.length === 2) {
    return {
      lastName: parts[0],
      firstName: parts[1],
    };
  }
  
  return {
    firstName: fullName,
    lastName: "",
  };
};

export const createCourseDetailRoutes = (controller: CourseDetailController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  // Todas las rutas de detalle de curso exponen datos académicos sensibles
  // (secciones, docentes, matrículas, contactos): requieren JWT válido de alumno.
  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES, "teacher"));

  // Nota: estas rutas usan SQL crudo (deuda reconocida en la auditoría). No
  // atrapan errores de BD: un fallo se propaga al errorHandler global (500 real)
  // en vez de devolver listas vacías con 200. Ver docs/AUDITORIA_TECNICA.md §6.1.
  app.get("/sections", async (c) => {
    const rows = await db.execute(sql`
      select
        sec.id as section_id,
        sec.code as section_code,
        t.teacher_code,
        c.id as course_id,
        c.name as course_name,
        coalesce(avg(sscore.value), 0) as promedio,
        coalesce(min(e.attended_hours), 0) as attended_hours,
        coalesce(max(e.absent_hours), 0) as absent_hours,
        coalesce(max(e.total_hours), 0) as total_hours
      from section sec
      join teacher t on t.id = sec.teacher_id
      join course_offering co on co.id = sec.course_offering_id
      join course c on c.id = co.course_id
      left join enrollment e on e.section_id = sec.id
      left join student_score sscore on sscore.enrollment_id = e.id
      group by sec.id, sec.code, t.teacher_code, c.id, c.name
      order by c.name, sec.code
    `) as unknown as Array<any>;

    return c.json({
      secciones: rows.map((row) => ({
        idSeccion: String(row.section_id),
        codigoSeccion: row.section_code,
        docenteCode: row.teacher_code ?? "",
        promedioSeccion: Number(row.promedio ?? 0),
        idCurso: String(row.course_id),
        curso: row.course_name,
        asistido: Number(row.attended_hours ?? 0),
        inasistencia: Number(row.absent_hours ?? 0),
        total: Number(row.total_hours ?? 0),
      })),
    });
  });

  app.get("/teachers", async (c) => {
    const rows = await db.execute(sql`
      select teacher_code, full_name
      from teacher
      order by full_name
    `) as unknown as Array<{ teacher_code: string | null; full_name: string }>;

    return c.json({
      docentes: rows.map((row) => ({
        code: row.teacher_code ?? "",
        ...splitName(row.full_name),
      })),
    });
  });

  app.get("/enrollments", async (c) => {
    const rows = await db.execute(sql`
      select
        e.id,
        au.code as student_code,
        co.course_id,
        e.section_id
      from enrollment e
      join student st on st.id = e.student_id
      join app_user au on au.id = st.user_id
      join section sec on sec.id = e.section_id
      join course_offering co on co.id = sec.course_offering_id
      order by e.section_id, au.code
    `) as unknown as Array<any>;

    return c.json({
      enrollments: rows.map((row) => ({
        id: String(row.id),
        studentCode: row.student_code,
        idCurso: String(row.course_id),
        idSeccion: String(row.section_id),
      })),
    });
  });

  app.get("/sections/:sectionId", async (c) => {
    const sectionId = c.req.param("sectionId");
    // Reenvía el Authorization para que la sub-petición interna pase authMiddleware.
    const response = await app.request("/sections", {
      headers: { Authorization: c.req.header("Authorization") ?? "" },
    });
    const data = await response.json() as { secciones: any[] };
    return c.json({ section: data.secciones.find((section) => section.idSeccion === sectionId) ?? null });
  });

  app.get("/sections/:sectionId/announcements", (c) => controller.getAnnouncements(c));

  app.get("/sections/:sectionId/contacts", async (c) => {
    const sectionId = Number(c.req.param("sectionId"));

    // Pertenencia. Hasta acá la ruta solo exigía JWT + rol, sin ningún predicado
    // sobre QUIÉN pregunta: cualquier usuario autenticado podía iterar
    // `sectionId` y leerse la nómina de cualquier sección. Con los delegados
    // pendientes eso se convertiría además en un padrón consultable de
    // delegados de toda la universidad, así que la guarda es precondición del
    // fallback de más abajo, no un extra.
    //
    // Pasan: el alumno matriculado en la sección, y el docente o jefe de
    // práctica de esa misma sección. El `?? 0` es un centinela que nunca empata
    // (los id son identity y arrancan en 1): un alumno no trae teacherId y un
    // docente no trae studentId.
    const studentId = c.get("studentId");
    const teacherId = c.get("teacherId");
    const allowed = (await db.execute(sql`
      select 1 as ok from section sec
      where sec.id = ${sectionId}
        and (
          sec.teacher_id = ${teacherId ?? 0}
          or sec.jp_id = ${teacherId ?? 0}
          or exists (
            select 1 from enrollment e
            where e.section_id = sec.id and e.student_id = ${studentId ?? 0}
          )
        )
      limit 1
    `)) as unknown as Array<{ ok: number }>;
    if (!allowed.length) {
      throw new HttpError(403, "No perteneces a esta sección.", "SECTION_FORBIDDEN");
    }
    const teacherRows = await db.execute(sql`
      select
        t.teacher_code,
        t.full_name,
        au.networking_opt_in,
        usl.platform,
        usl.url,
        usl.label
      from section sec
      join teacher t on t.id = sec.teacher_id
      left join app_user au on au.id = t.user_id
      left join user_social_link usl on usl.user_id = au.id
      where sec.id = ${sectionId}
    `) as unknown as Array<any>;
    // HU18: jefe de práctica de la sección (0 o 1).
    const jpRows = await db.execute(sql`
      select
        t.teacher_code,
        t.full_name,
        au.networking_opt_in,
        usl.platform,
        usl.url,
        usl.label
      from section sec
      join teacher t on t.id = sec.jp_id
      left join app_user au on au.id = t.user_id
      left join user_social_link usl on usl.user_id = au.id
      where sec.id = ${sectionId}
    `) as unknown as Array<any>;
    const rows = await db.execute(sql`
      select
        e.id as enrollment_id,
        au.code,
        au.full_name,
        au.institutional_email,
        au.networking_opt_in,
        s.career_id,
        sr.position,
        usl.platform,
        usl.url,
        usl.label
      from enrollment e
      join student s on s.id = e.student_id
      join app_user au on au.id = s.user_id
      left join user_social_link usl on usl.user_id = au.id
      left join section_representative sr on sr.enrollment_id = e.id and sr.is_active = true
      where e.section_id = ${sectionId}
      order by au.full_name
    `) as unknown as Array<any>;

    const networkingFromRows = (items: Array<any>) => ({
      optIn: Boolean(items[0]?.networking_opt_in),
      links: items
        .filter((item) => item.platform != null && item.url != null)
        .slice(0, 1)
        .map((item) => ({
          platform: item.platform,
          url: item.url,
          label: item.label ?? null,
        })),
    });

    const mapTeacherContact = (items: Array<any>) =>
      items[0]
        ? {
            code: items[0].teacher_code ?? "",
            ...splitName(items[0].full_name),
            networking: networkingFromRows(items),
          }
        : null;

    // Delegados que el portal publica pero que todavía no son usuarios.
    //
    // Se resuelve por COMPARACIÓN, no por existencia: un claim se emite solo si
    // (1) no hay representante REAL activo para ese cargo —si lo hay, manda la
    // tabla de permisos— y (2) esa persona no está ya matriculada con cuenta,
    // porque entonces ya sale dentro de `alumnos[]` y marcarla como ausente
    // sería mentira. Así nadie aparece dos veces.
    const claimRows = (await db.execute(sql`
      select c.position, c.student_code, c.full_name
      from section_representative_claim c
      where c.section_id = ${sectionId}
        and not exists (
          select 1 from section_representative sr
          where sr.section_id = c.section_id
            and sr.position = c.position
            and sr.is_active = true
        )
        and not exists (
          select 1 from enrollment e
          join student s on s.id = e.student_id
          join app_user au on au.id = s.user_id
          where e.section_id = c.section_id and au.code = c.student_code
        )
      order by c.position
    `)) as unknown as Array<{ position: string; student_code: string; full_name: string }>;

    const studentsByEnrollment = new Map<number, Array<any>>();
    for (const row of rows) {
      const current = studentsByEnrollment.get(row.enrollment_id) ?? [];
      current.push(row);
      studentsByEnrollment.set(row.enrollment_id, current);
    }

    return c.json({
      docente: mapTeacherContact(teacherRows),
      // HU18: grupo "Jefe de Práctica" (entre Docente y Alumnos). null si la sección no tiene JP.
      jefePractica: mapTeacherContact(jpRows),
      alumnos: Array.from(studentsByEnrollment.values()).map((studentRows) => {
        const row = studentRows[0];
        return {
          user: {
            code: row.code,
            ...splitName(row.full_name),
            email: row.institutional_email,
            role: row.position === "delegate" ? "delegado" : row.position === "subdelegate" ? "subdelegado" : "estudiante",
            career_id: row.career_id,
            currentCycle: "2026-1",
            setupComplete: true,
          },
          roleInSection: row.position === "delegate" ? "delegado" : row.position === "subdelegate" ? "subdelegado" : "estudiante",
          networking: networkingFromRows(studentRows),
        };
      }),
      // Clave HERMANA de `alumnos`, no un elemento más: los alumnos exigen
      // email, career_id y setupComplete, que un claim no tiene y que no se
      // pueden inventar. `contactable: false` habla de una CAPACIDAD (la app no
      // debe ofrecer chatear con quien no existe), no de la persona.
      representantesPendientes: claimRows.map((row) => ({
        code: row.student_code,
        ...splitName(row.full_name),
        position: row.position,
        contactable: false,
      })),
    });
  });

  return app;
};
