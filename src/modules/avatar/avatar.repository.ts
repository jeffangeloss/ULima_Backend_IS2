import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import type { RolModerador } from "./avatar.logic.js";

export class AvatarRepository {
  constructor(readonly database: typeof db) {}

  /** Guarda la foto recién subida. `updated_at` lo pone la BD, no el cliente. */
  async guardar(userId: number, publicId: string, version: string): Promise<void> {
    await this.database.execute(sql`
      update app_user
      set avatar_public_id = ${publicId}, avatar_version = ${version}, avatar_updated_at = now()
      where id = ${userId}
    `);
  }

  /**
   * Anula la foto. El `public_id` que había se lee ANTES con `publicIdDe`, en
   * una consulta aparte: recuperar el valor viejo dentro del mismo UPDATE
   * depende de cómo Postgres resuelve la subconsulta, y no vale la sutileza
   * para ahorrar un viaje.
   */
  async borrar(userId: number): Promise<void> {
    await this.database.execute(sql`
      update app_user
      set avatar_public_id = null, avatar_version = null, avatar_updated_at = null
      where id = ${userId}
    `);
  }

  /** `public_id` actual, sin modificar nada. */
  async publicIdDe(userId: number): Promise<string | null> {
    const rows = (await this.database.execute(sql`
      select avatar_public_id as "publicId" from app_user where id = ${userId} limit 1
    `)) as unknown as Array<{ publicId: string | null }>;
    return rows[0]?.publicId ?? null;
  }

  async existeUsuario(userId: number): Promise<boolean> {
    const rows = (await this.database.execute(sql`
      select 1 as ok from app_user where id = ${userId} limit 1
    `)) as unknown as Array<{ ok: number }>;
    return rows.length > 0;
  }

  /**
   * Rol del solicitante en alguna sección que COMPARTA con el objetivo, o
   * `null` si no comparten ninguna o si es un compañero sin cargo.
   *
   * Acotado al período activo, igual que el resto de las consultas de
   * representante: un delegado del ciclo pasado no modera nada.
   *
   * `delegate` gana el desempate solo para que el motivo que se registra sea
   * estable; a efectos de permiso los cuatro roles valen lo mismo.
   */
  async rolEnSeccionCompartida(
    solicitanteUserId: number,
    objetivoUserId: number,
  ): Promise<RolModerador> {
    const rows = (await this.database.execute(sql`
      with secciones_objetivo as (
        select e.section_id
        from enrollment e
        join student s on s.id = e.student_id
        join app_user au on au.id = s.user_id
        join section sec on sec.id = e.section_id
        join course_offering co on co.id = sec.course_offering_id
        join academic_period ap on ap.id = co.academic_period_id and ap.is_active
        where au.code is not null and au.id = ${objetivoUserId} and e.status = 'active'
      )
      select rol from (
        -- representante de una sección donde el objetivo está matriculado
        select sr.position::text as rol,
               case when sr.position = 'delegate' then 0 else 1 end as prioridad
        from section_representative sr
        join enrollment e on e.id = sr.enrollment_id
        join student s on s.id = e.student_id
        join secciones_objetivo so on so.section_id = sr.section_id
        where s.user_id = ${solicitanteUserId} and sr.is_active = true and e.status = 'active'
        union all
        -- docente o jefe de práctica de esa misma sección
        select case when sec.jp_id = t.id then 'jp' else 'teacher' end as rol, 2 as prioridad
        from teacher t
        join section sec on sec.teacher_id = t.id or sec.jp_id = t.id
        join secciones_objetivo so on so.section_id = sec.id
        where t.user_id = ${solicitanteUserId}
      ) candidatos
      order by prioridad
      limit 1
    `)) as unknown as Array<{ rol: RolModerador }>;
    return rows[0]?.rol ?? null;
  }
}
