-- RF-IRM-1 · Interruptor remoto del modo estático
-- (specs/features/interruptor-remoto/interruptor-remoto.spec.md).
--
-- Crea la tabla app_setting con una sola fila posible. Su columna static_mode
-- decide si el backend y las APK 2.1.0 corren en modo estático (true) o en modo
-- dinámico (false). Inserta la fila (1, true) si no existe, así que una base
-- recién migrada queda en modo estático, como producción al publicar la 2.1.0.
--
-- Aditiva e idempotente, con CREATE TABLE IF NOT EXISTS y ON CONFLICT DO NOTHING,
-- de modo que aplicarla dos veces no cambia nada ni pisa un valor ya editado.
-- Se aplica con
--
--   bun run db:apply drizzle/0016_app_setting.sql
--
-- y no con db:migrate ni db:generate, porque drizzle/meta/_journal.json sigue en
-- la 0009. Primero en la rama develop de Neon y después en producción, con el
-- permiso explícito del dueño. Si el código llega antes que la tabla, la consulta
-- falla y el backend usa la variable MODO_ESTATICO, así que el orden no rompe
-- nada. Se registra en MIGRATIONS.md con su fecha, su respaldo y su verificación.

CREATE TABLE IF NOT EXISTS app_setting (
  id smallint PRIMARY KEY DEFAULT 1,
  static_mode boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_app_setting_single_row CHECK (id = 1)
);

INSERT INTO app_setting (id, static_mode) VALUES (1, true)
ON CONFLICT (id) DO NOTHING;
