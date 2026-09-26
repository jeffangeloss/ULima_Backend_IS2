-- RS-BE-44 · Último resultado del test de especialidad, una fila por alumno.
--
-- Una tabla nueva y ninguna columna tocada de las que ya existen:
--   student_specialty_test_result   versión del contenido, ranking de las cuatro
--                                   especialidades, empate y fecha.
--
-- Solo el último resultado (decisión 5 del dueño): rehacer el test reemplaza la
-- fila con INSERT … ON CONFLICT (student_id) DO UPDATE, que además vuelve a
-- fijar completed_at con now(), porque el DEFAULT solo actúa en el INSERT. No se
-- guardan las respuestas, los desempates, el motivo ni las líneas de Ulises.
--
-- La clave primaria es student_id, igual que student_academic_snapshot en la
-- 0011: una fila por alumno y el destino del ON CONFLICT, sin otro índice,
-- porque las dos lecturas y la escritura van por student_id. El ranking es jsonb
-- porque se escribe y se lee entero y su orden es parte del dato; los dos CHECK
-- aseguran un arreglo de cuatro y Zod valida cada elemento al escribir y al leer.
-- El specialtyId de cada elemento no lleva FK: es una foto del resultado. La
-- fila cae con el alumno (ON DELETE CASCADE).
--
-- Aditiva e idempotente: CREATE TABLE IF NOT EXISTS con los CONSTRAINT dentro de
-- la definición, así que se puede re-aplicar sin daño.
--
--   bun run db:apply drizzle/0014_specialty_test_result.sql
--
-- Con db:apply y NO con db:migrate ni db:generate: drizzle/meta/_journal.json
-- se quedó en la 0009, así que esta migración tampoco queda registrada ahí. El
-- cambio de BD lo aprobó el dueño el 2026-09-25 con la spec; aplicarlo en
-- producción pide además, en el despliegue, el respaldo previo y su permiso
-- explícito, antes del merge del código que la usa, y se registra en
-- MIGRATIONS.md con su fecha, su respaldo y su verificación.

CREATE TABLE IF NOT EXISTS "student_specialty_test_result" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"content_version" varchar(20) NOT NULL,
	"ranking" jsonb NOT NULL,
	"is_tie" boolean NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_specialty_test_version" CHECK ("student_specialty_test_result"."content_version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'),
	CONSTRAINT "chk_specialty_test_ranking" CHECK (jsonb_typeof("student_specialty_test_result"."ranking") = 'array' and jsonb_array_length("student_specialty_test_result"."ranking") = 4),
	CONSTRAINT "student_specialty_test_result_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action
);
