# Runbook de Migraciones de Base de Datos

Estado real auditado el 2026-07-05 y protocolo vigente hasta el fin del ciclo 2026-1.

## Estado real de la BD (auditoría 2026-07-05)

- La BD productiva (PostgreSQL 18 en AWS RDS) **coincide con `src/db/schema/schema.ts`**: 28/28 tablas tras aplicar la 0003, sin tablas sobrantes ni faltantes.
- La tabla `__drizzle_migrations` **no existe** en la BD: ninguna migración se aplicó nunca vía `drizzle-kit migrate`; históricamente todo se aplicó a mano.
- El journal (`drizzle/meta/_journal.json`) registra las entradas 0000 y 0002 **cuyos archivos SQL no existen** en `drizzle/`; el snapshot 0000 está obsoleto (describe tablas que nunca llegaron a la BD final). El journal es registro histórico, no fuente de verdad.
- Consecuencia (histórica): `drizzle-kit generate` (diff automático) y `drizzle-kit migrate` producían resultados incorrectos o destructivos.

## Re-baseline de Drizzle (TT04 — 2026-07-07)

Para retomar el flujo oficial de Drizzle se hizo un **re-baseline**. Estado:

- ✅ **Parte local (hecha, sin tocar la BD, reversible por git)**: se descartó el meta roto (journal con 0000/0002 sin SQL, snapshot 0000 obsoleto) y los `.sql` sueltos, y se regeneró desde `schema.ts` un único **`drizzle/0000_baseline.sql`** con `meta/_journal.json` y `meta/0000_snapshot.json` frescos. Verificado **sin drift**: `bun run db:generate` dice "No schema changes". El baseline contiene las **29 tablas** reales (incluye `advising_rsvp` de HU18). `bun run build` y `bun test` (54) en verde.
- ⏳ **Parte en la BD (PENDIENTE — post-demo, requiere datos móviles)**: la BD viva ya tiene todo el esquema del baseline, así que **NO se re-ejecuta** ese SQL. Solo hay que **sellarlo** como aplicado:
  ```bash
  bun run db:stamp-baseline            # dry-run: muestra el baseline y su hash
  bun run db:stamp-baseline -- --apply # crea drizzle.__drizzle_migrations y registra el baseline
  ```
  Drizzle decide qué aplicar por `created_at` (= `when` del journal); tras sellar, `db:migrate` omite el baseline y aplica solo lo nuevo.

### Flujo oficial DESPUÉS de sellar (reemplaza al SQL manual)

1. Editas `src/db/schema/schema.ts`.
2. `bun run db:generate` → crea `drizzle/000N_nombre.sql` + actualiza el meta.
3. Revisas el SQL en el PR (que siga siendo aditivo; nada destructivo).
4. Con backup y en datos móviles: `bun run db:migrate` → aplica y registra en `__drizzle_migrations`. (Usa el migrador de `drizzle-orm` vía `src/db/migrate.ts`, no el CLI `drizzle-kit migrate`, que trata como error el NOTICE inofensivo `relation "__drizzle_migrations" already exists`.)
5. `db:push` sigue **prohibido** siempre (puede generar DROPs).

Mientras la BD no esté sellada, sigue vigente el protocolo manual de abajo (`db:apply`).

## Protocolo manual (interino, hasta sellar el baseline)

1. **`drizzle-kit generate`/`migrate` congelados. `db:push` prohibido siempre** (diffea contra un snapshot obsoleto y puede generar DROPs de objetos reales).
2. Todo cambio de BD = **SQL aditivo escrito a mano**, numerado secuencialmente (`drizzle/000N_nombre.sql`), **dentro del PR** que lo necesita, con `IF NOT EXISTS` donde aplique. Solo `CREATE TABLE`, `ADD COLUMN` (nullable o con default) y `CREATE INDEX`; nada destructivo.
3. **Orden estricto: el SQL se aplica en la BD ANTES del merge/deploy del código que lo usa.**
4. **Una sola persona aplica** (Jeff), con backup previo (`pg_dump`, requiere cliente v18: `/opt/homebrew/opt/libpq/bin/pg_dump`), en transacción, y **avisa al equipo** con la evidencia de verificación (`to_regclass` + columnas + smoke test).
5. Todo lo aplicado se registra en la tabla de abajo. Esa lista es el insumo del **re-baseline post-demo** (recrear el journal desde el esquema real y adoptar `drizzle-kit migrate` con `__drizzle_migrations`).
6. **Freeze pre-demo:** nadie ejecuta DDL en las 48 horas previas a la exposición. Lo que no esté migrado 48h antes, no entra a la demo.

## Registro de migraciones aplicadas

| # | Archivo | Qué hace | Aplicada | Por | Verificación |
|---|---|---|---|---|---|
| 0001 | `0001_student_specialty_setup_completed.sql` | `student.specialty_setup_completed` | (histórico, junio 2026) | equipo | columna existe en BD ✔ |
| 0003 | `0003_password_reset_token.sql` | Tabla `password_reset_token` + índice + FK (HU20) | 2026-07-05 | Jeff | `to_regclass` ✔, 7 columnas ✔, índice ✔, FK ✔, smoke test local ✔. Backup previo con `pg_dump` ✔ |
| 0004 | `0004_advising_teacher_role.sql` | HU18: `teacher.user_id`; `section.jp_id` + CHECK + índice único parcial `uq_section_jp`; enum `advising_kind`; `course_advising_session.kind/session_date/capacity` + checks; **re-scope de `uq_course_advising_session_course/section` a `kind='recurring'`** + nuevo `uq_course_advising_session_extra`; tabla `advising_rsvp` + índice | 2026-07-06 | Jeff | Aplicada con `db:apply` + backup; smoke test de login docente/JP en prod ✔ |

> Nota histórica: el journal viejo listaba 0000/0002 sin SQL y 0001/0003/0004 sueltos. Tras el re-baseline (2026-07-07) el journal tiene una sola entrada `0000_baseline` que representa TODO el esquema real; los `.sql` 0001/0003/0004 quedan en el historial de git. Los cambios futuros usan `db:generate` (numeración nueva 0001, 0002, …).

### Aplicación de la 0004 (runbook)

Requiere **datos móviles** (el wifi de la ULima bloquea el 5432). `DATABASE_URL`
vive en `.env`, NO como variable de shell: hay que sourcearla. Los scripts
`db:apply`/`db:seed:docentes` la leen solos vía `dotenv`; solo el backup con
`pg_dump` necesita exportarla.

Paso 1 — backup (dos comandos):
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
```
```bash
/opt/homebrew/opt/libpq/bin/pg_dump "$DATABASE_URL" > backup_pre_0004_$(date +%Y%m%d).sql
```

Paso 2 — aplicar la migración (bun, transaccional, reusa la conexión de la app; no depende de psql/SSL):
```bash
bun run db:apply drizzle/0004_advising_teacher_role.sql
```

Paso 3 — seed de docentes, primero el plan y luego aplicar:
```bash
bun run db:seed:docentes
```
```bash
bun run db:seed:docentes -- --apply
```

Paso 4 — verificar en la BD, y recién entonces mergear/deployar el código HU18.

⚠️ El único paso no puramente aditivo es el `DROP INDEX`/`CREATE INDEX` de los
dos únicos de asesorías (metadato, sin pérdida de filas): se reconstruyen con la
condición `kind='recurring'`. Todo corre en una transacción: si algo falla,
ROLLBACK y la BD queda intacta.

> Alternativa a bun para el paso 2 (si prefieres psql), con la URL ya exportada
> arriba: `/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -1 -f drizzle/0004_advising_teacher_role.sql`

## Verificación rápida del despliegue

`GET /version` en el backend devuelve el SHA del commit desplegado (Vercel inyecta `VERCEL_GIT_COMMIT_SHA`). Si no coincide con `main`, el deploy está desactualizado — exactamente el incidente detectado el 2026-07-05 (producción sirviendo código de junio).

## Migraciones aplicadas / reconciliaciones

- **`drizzle/0008_course_equivalence.sql` (equivalencias de malla) — ⏳ PENDIENTE DE APLICAR.** Aditiva y no destructiva: crea la tabla `course_equivalence` (código de la malla anterior → `curriculum_course` de la vigente), su unique `uq_course_equivalence (curriculum_id, legacy_code)` y **una FK compuesta** `(curriculum_course_id, curriculum_id)` → `uq_curriculum_course_id_curriculum`, que impide apuntar a un curso de otra malla. No toca ninguna tabla existente. Diseño en `specs/features/portal-sync/portal-sync.spec.md` §Equivalencias de malla. Runbook, con datos móviles y backup previo:
  ```bash
  bun run db:migrate
  ```
  ```bash
  bun run db:seed:equivalencias
  ```
  ```bash
  bun run db:seed:equivalencias -- --apply
  ```
  El seed es dry-run por defecto e idempotente (`on conflict do nothing`); solo escribe en `course_equivalence`. Verificación: `to_regclass('course_equivalence')`, 14 filas sembradas, y una importación de prueba desde el portal cuyo `summary.progressViaEquivalence` sea > 0 y cuyo `progressSkipped` haya bajado.

- **`drizzle/0001_flowery_jack_flag.sql` (HU27 — carnet de networking) — ✅ APLICADA a prod (2026-07-11)** con `bun run db:migrate`. Aditiva y no-destructiva: enum `social_platform` + tabla `user_social_link` + columna `app_user.networking_opt_in boolean default false NOT NULL`. Diseño en `specs/features/networking/networking.spec.md`. BD lista para que meltiruiz implemente HU27.
- **Reconciliación de drift (2026-07-11)**: la BD viva tenía una columna `teacher.linkedin_link varchar(500)` agregada **directamente en la BD** (fuera de Drizzle y del schema.ts — un compañero empezó networking por su lado). Estaba 100% en NULL. Se **dropeó** (`ALTER TABLE teacher DROP COLUMN linkedin_link`) para eliminar el drift y consolidar el networking en el diseño de HU27 (`user_social_link` sobre `app_user`, que cubre alumnos **y** docentes). Backup previo de `teacher` (175 filas) tomado antes del drop.
- **`drizzle/0002_slim_miracleman.sql` (HU19 — estado de simulación `simulated_available`) — ✅ APLICADA a prod (2026-07-11)**. Agrega el valor `simulated_available` al enum `curriculum_simulation_status` (habilita simular "des-aprobar" un curso: aprobado→disponible; antes el `PUT /curriculum/me/simulation` daba 400). ⚠️ **GOTCHA: `ALTER TYPE ... ADD VALUE` NO corre dentro de una transacción** → `bun run db:migrate` (y `db:apply`, que envuelven en transacción) **fallan** con ese error, PERO el valor **igual se agrega** (ADD VALUE es no-transaccional y no se revierte). Reconciliación hecha: se verificó que el enum ya tenía el valor y se **selló manualmente la 0002** en `drizzle.__drizzle_migrations` (insert de `hash=sha256(0002.sql)` + `created_at=journal.when`) → `db:migrate` volvió a quedar no-op. **Para futuros `ADD VALUE`**: correr el `ALTER TYPE` en autocommit (sin `sql.begin`) y luego sellar la migración, en vez de `db:migrate`.
