import { describe, expect, test } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  studentAcademicSnapshot,
  studentPeriodSummary,
  studentRecordEntry,
} from "../../src/db/schema/schema.js";

// El .sql se lee como texto plano: esta prueba NO aplica la migracion ni toca
// la base. Aplicarla es del dueno (MIGRATIONS.md).
const migracion = await Bun.file("drizzle/0011_academic_record.sql").text();

const veces = (aguja: string): number => migracion.split(aguja).length - 1;

const columnas = (tabla: PgTable): string[] => getTableConfig(tabla).columns.map((c) => c.name);

const tipos = (tabla: PgTable): Record<string, string> =>
  Object.fromEntries(getTableConfig(tabla).columns.map((c) => [c.name, c.getSQLType()]));

const nulables = (tabla: PgTable): string[] =>
  getTableConfig(tabla).columns.filter((c) => !c.notNull).map((c) => c.name);

describe("drizzle/0011_academic_record.sql", () => {
  test("crea las tres tablas y ninguna mas, todas con IF NOT EXISTS", () => {
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_record_entry"');
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_academic_snapshot"');
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_period_summary"');
    expect(veces("CREATE TABLE")).toBe(3);
  });

  test("el indice por alumno tambien es idempotente", () => {
    expect(migracion).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_student_record_entry_student" ON "student_record_entry" USING btree ("student_id")',
    );
    expect(veces("CREATE INDEX")).toBe(1);
  });

  test("es aditiva: no altera ni borra nada de lo que ya existe", () => {
    expect(migracion).not.toContain("ALTER TABLE");
    expect(migracion).not.toContain("DROP");
    expect(veces("--> statement-breakpoint")).toBe(3);
  });

  test("las tres claves foraneas apuntan a student y borran en cascada", () => {
    expect(veces("ON DELETE cascade")).toBe(3);
    expect(migracion).toContain(
      'CONSTRAINT "student_record_entry_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(migracion).toContain(
      'CONSTRAINT "student_academic_snapshot_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(migracion).toContain(
      'CONSTRAINT "student_period_summary_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
  });

  test("no ata la copia del record a la malla vigente", () => {
    expect(migracion).not.toContain("curriculum_course");
    expect(migracion).not.toContain('REFERENCES "public"."course"');
  });

  test("student_period_summary no lleva columna de procedencia", () => {
    expect(migracion).not.toContain("source");
  });

  test("student_record_entry lleva sus tres CHECK", () => {
    expect(migracion).toContain(
      'CONSTRAINT "chk_student_record_entry_attempt" CHECK ("student_record_entry"."attempt" >= 1)',
    );
    expect(migracion).toContain(
      'CONSTRAINT "chk_student_record_entry_credits" CHECK ("student_record_entry"."credits" >= 0)',
    );
    expect(migracion).toContain(
      'CONSTRAINT "chk_student_record_entry_grade" CHECK ("student_record_entry"."grade" IS NULL OR "student_record_entry"."grade" BETWEEN 0 AND 20)',
    );
  });

  test("los dos UNIQUE de la copia del record", () => {
    expect(migracion).toContain(
      'CONSTRAINT "uq_student_record_entry" UNIQUE("student_id","period_code","course_code","attempt")',
    );
    expect(migracion).toContain(
      'CONSTRAINT "uq_student_period_summary" UNIQUE("student_id","period_code")',
    );
  });

  test("los tipos de las columnas son los de la spec", () => {
    expect(migracion).toContain('"credits" numeric(4, 1) NOT NULL');
    expect(migracion).toContain('"attempt" smallint NOT NULL');
    expect(migracion).toContain('"grade" smallint');
    expect(migracion).toContain('"course_name" text NOT NULL');
    expect(migracion).toContain('"observation" text');
    expect(migracion).toContain('"ppa" numeric(6, 4)');
    expect(migracion).toContain('"synced_at" timestamp with time zone NOT NULL');
  });

  test("la cabecera dice como se aplica", () => {
    expect(migracion.trimStart().startsWith("--")).toBe(true);
    expect(migracion).toContain("bun run db:apply drizzle/0011_academic_record.sql");
  });
});

describe("schema.ts · student_record_entry", () => {
  test("nombre de tabla y columnas, en orden", () => {
    expect(getTableConfig(studentRecordEntry).name).toBe("student_record_entry");
    expect(columnas(studentRecordEntry)).toEqual([
      "id",
      "student_id",
      "period_code",
      "course_code",
      "course_name",
      "attempt",
      "credits",
      "grade",
      "grade_raw",
      "section_code",
      "observation",
    ]);
  });

  test("tipos sql: creditos con decimal, nombres y observacion en text", () => {
    expect(tipos(studentRecordEntry)).toEqual({
      id: "integer",
      student_id: "integer",
      period_code: "varchar(10)",
      course_code: "varchar(10)",
      course_name: "text",
      attempt: "smallint",
      credits: "numeric(4, 1)",
      grade: "smallint",
      grade_raw: "text",
      section_code: "text",
      observation: "text",
    });
  });

  test("solo nota, nota original, seccion y observacion son nulables", () => {
    expect(nulables(studentRecordEntry)).toEqual([
      "grade",
      "grade_raw",
      "section_code",
      "observation",
    ]);
    const id = getTableConfig(studentRecordEntry).columns.find((c) => c.name === "id");
    expect(id?.primary).toBe(true);
  });

  test("UNIQUE por alumno-ciclo-curso-vez, tres CHECK e indice por alumno", () => {
    const cfg = getTableConfig(studentRecordEntry);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["uq_student_record_entry"]);
    expect(cfg.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
      "student_id",
      "period_code",
      "course_code",
      "attempt",
    ]);
    expect(cfg.checks.map((k) => k.name)).toEqual([
      "chk_student_record_entry_attempt",
      "chk_student_record_entry_credits",
      "chk_student_record_entry_grade",
    ]);
    expect(cfg.indexes.map((i) => i.config.name)).toEqual(["idx_student_record_entry_student"]);
  });

  test("una sola FK, a student, en cascada: nada de malla", () => {
    const fks = getTableConfig(studentRecordEntry).foreignKeys;
    expect(fks.length).toBe(1);
    expect(fks[0]?.getName()).toBe("student_record_entry_student_id_student_id_fk");
    expect(fks[0]?.onDelete).toBe("cascade");
    expect(fks[0]?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
  });
});

describe("schema.ts · student_academic_snapshot", () => {
  test("nombre de tabla, columnas y PK sobre student_id", () => {
    const cfg = getTableConfig(studentAcademicSnapshot);
    expect(cfg.name).toBe("student_academic_snapshot");
    expect(columnas(studentAcademicSnapshot)).toEqual([
      "student_id",
      "ppa",
      "relative_position",
      "convalidated_courses",
      "convalidated_credits",
      "approved_courses",
      "approved_credits",
      "credits_accumulated",
      "credits_required",
      "synced_at",
    ]);
    expect(cfg.columns.find((c) => c.name === "student_id")?.primary).toBe(true);
  });

  test("tipos sql, synced_at obligatorio y el resto nulable", () => {
    expect(tipos(studentAcademicSnapshot)).toEqual({
      student_id: "integer",
      ppa: "numeric(6, 4)",
      relative_position: "text",
      convalidated_courses: "integer",
      convalidated_credits: "numeric(6, 1)",
      approved_courses: "integer",
      approved_credits: "numeric(6, 1)",
      credits_accumulated: "numeric(6, 1)",
      credits_required: "numeric(6, 1)",
      synced_at: "timestamp with time zone",
    });
    expect(nulables(studentAcademicSnapshot)).toEqual([
      "ppa",
      "relative_position",
      "convalidated_courses",
      "convalidated_credits",
      "approved_courses",
      "approved_credits",
      "credits_accumulated",
      "credits_required",
    ]);
  });

  test("FK a student en cascada, sin UNIQUE, CHECK ni indice", () => {
    const cfg = getTableConfig(studentAcademicSnapshot);
    expect(cfg.foreignKeys.length).toBe(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe("student_academic_snapshot_student_id_student_id_fk");
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
    expect(cfg.uniqueConstraints).toEqual([]);
    expect(cfg.checks).toEqual([]);
    expect(cfg.indexes).toEqual([]);
  });
});

describe("schema.ts · student_period_summary", () => {
  test("nombre de tabla y columnas, sin columna de procedencia", () => {
    expect(getTableConfig(studentPeriodSummary).name).toBe("student_period_summary");
    expect(columnas(studentPeriodSummary)).toEqual([
      "id",
      "student_id",
      "period_code",
      "average",
      "relative_position",
      "level",
      "convalidated_courses",
      "convalidated_credits",
      "enrolled_courses",
      "enrolled_credits",
      "approved_courses",
      "approved_credits",
      "failed_courses",
      "failed_credits",
    ]);
    expect(columnas(studentPeriodSummary)).not.toContain("source");
  });

  test("tipos sql y campos nulables del resumen", () => {
    expect(tipos(studentPeriodSummary)).toEqual({
      id: "integer",
      student_id: "integer",
      period_code: "varchar(10)",
      average: "numeric(6, 4)",
      relative_position: "text",
      level: "smallint",
      convalidated_courses: "integer",
      convalidated_credits: "numeric(6, 1)",
      enrolled_courses: "integer",
      enrolled_credits: "numeric(6, 1)",
      approved_courses: "integer",
      approved_credits: "numeric(6, 1)",
      failed_courses: "integer",
      failed_credits: "numeric(6, 1)",
    });
    expect(nulables(studentPeriodSummary)).toEqual([
      "average",
      "relative_position",
      "level",
      "convalidated_courses",
      "convalidated_credits",
      "enrolled_courses",
      "enrolled_credits",
      "approved_courses",
      "approved_credits",
      "failed_courses",
      "failed_credits",
    ]);
  });

  test("UNIQUE por alumno y ciclo, y FK a student en cascada", () => {
    const cfg = getTableConfig(studentPeriodSummary);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["uq_student_period_summary"]);
    expect(cfg.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
      "student_id",
      "period_code",
    ]);
    expect(cfg.foreignKeys.length).toBe(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe("student_period_summary_student_id_student_id_fk");
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
  });
});
