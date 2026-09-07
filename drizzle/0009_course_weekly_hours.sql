-- RS-BE-9 · Horas de clase semanales del plan de estudios oficial.
--
-- `course_offering.total_hours` se calculaba como créditos x 16, y eso subestima
-- las horas reales entre 20% y 40% (PARADIGMAS son 5 h/sem = 80 h, no 48 h). Ese
-- número es el denominador del % de inasistencia, así que un valor corto adelanta
-- el umbral de impedido. Esta columna guarda la columna TOT del plan oficial y
-- cubre las ofertas que todavía no tienen horario importado.
--
-- Aditiva y NULLABLE: `NULL` = el curso no está en la malla cargada.
-- Idempotente: se puede re-aplicar sin daño.
--
--   bun run db:apply drizzle/0009_course_weekly_hours.sql
--
-- Con db:apply y NO con db:migrate: la BD tiene 10 filas selladas en
-- drizzle.__drizzle_migrations contra 8 entradas en drizzle/meta/_journal.json.

ALTER TABLE "course" ADD COLUMN IF NOT EXISTS "weekly_hours" smallint;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "course" ADD CONSTRAINT "chk_course_weekly_hours"
    CHECK ("course"."weekly_hours" IS NULL OR "course"."weekly_hours" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
