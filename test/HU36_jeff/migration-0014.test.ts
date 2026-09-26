import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { studentSpecialtyTestResult } from "../../src/db/schema/schema.js";

// El .sql se lee como texto plano: esta prueba NO aplica la migración ni toca
// la base. Aplicarla es del dueño, en el despliegue (MIGRATIONS.md).
const migracion = await Bun.file("drizzle/0014_specialty_test_result.sql").text();

/** Solo las sentencias: la cabecera de comentarios nombra INSERT y ON CONFLICT al explicar el guardado. */
const sentencias = migracion
  .split("\n")
  .filter((linea) => !linea.trimStart().startsWith("--"))
  .join("\n");

const veces = (aguja: string): number => sentencias.split(aguja).length - 1;

describe("drizzle/0014_specialty_test_result.sql (RS-BE-44)", () => {
  test("crea una sola tabla, con IF NOT EXISTS", () => {
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_specialty_test_result" (');
    expect(veces("CREATE TABLE")).toBe(1);
  });

  test("las cinco columnas con los tipos de la spec, y student_id como clave", () => {
    expect(migracion).toContain('"student_id" integer PRIMARY KEY NOT NULL,');
    expect(migracion).toContain('"content_version" varchar(20) NOT NULL,');
    expect(migracion).toContain('"ranking" jsonb NOT NULL,');
    expect(migracion).toContain('"is_tie" boolean NOT NULL,');
    expect(migracion).toContain('"completed_at" timestamp with time zone DEFAULT now() NOT NULL,');
    expect(veces("PRIMARY KEY")).toBe(1);
  });

  test("los dos CHECK con el nombre y la expresion de la spec", () => {
    expect(migracion).toContain(
      `CONSTRAINT "chk_specialty_test_version" CHECK ("student_specialty_test_result"."content_version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]+$')`,
    );
    expect(migracion).toContain(
      `CONSTRAINT "chk_specialty_test_ranking" CHECK (jsonb_typeof("student_specialty_test_result"."ranking") = 'array' and jsonb_array_length("student_specialty_test_result"."ranking") = 4)`,
    );
    expect(veces("CHECK (")).toBe(2);
  });

  test("una sola FK, a student, que borra en cascada, y ninguna hacia specialty", () => {
    expect(migracion).toContain(
      'CONSTRAINT "student_specialty_test_result_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(veces("FOREIGN KEY")).toBe(1);
    expect(sentencias).not.toContain('REFERENCES "public"."specialty"');
  });

  test("es aditiva: no altera ni borra nada, no crea indices ni tipos", () => {
    for (const prohibido of ["ALTER TABLE", "DROP", "CREATE INDEX", "CREATE TYPE", "INSERT INTO", "DELETE FROM", "TRUNCATE"]) {
      expect(sentencias).not.toContain(prohibido);
    }
    expect(veces("--> statement-breakpoint")).toBe(0);
  });

  test("la cabecera dice como se aplica y que no va por db:migrate", () => {
    expect(migracion.trimStart().startsWith("--")).toBe(true);
    expect(migracion).toContain("bun run db:apply drizzle/0014_specialty_test_result.sql");
    expect(migracion).toContain("NO con db:migrate ni db:generate");
  });
});

describe("schema.ts · student_specialty_test_result (RS-BE-44)", () => {
  const cfg = getTableConfig(studentSpecialtyTestResult);

  test("nombre, columnas en orden y tipos SQL", () => {
    expect(cfg.name).toBe("student_specialty_test_result");
    expect(Object.fromEntries(cfg.columns.map((col) => [col.name, col.getSQLType()]))).toEqual({
      student_id: "integer",
      content_version: "varchar(20)",
      ranking: "jsonb",
      is_tie: "boolean",
      completed_at: "timestamp with time zone",
    });
    expect(cfg.columns.map((col) => col.name)).toEqual([
      "student_id", "content_version", "ranking", "is_tie", "completed_at",
    ]);
  });

  test("ninguna columna es nulable, student_id es la PK y completed_at tiene default", () => {
    expect(cfg.columns.filter((col) => !col.notNull).map((col) => col.name)).toEqual([]);
    expect(cfg.columns.find((col) => col.name === "student_id")?.primary).toBe(true);
    expect(cfg.columns.find((col) => col.name === "completed_at")?.hasDefault).toBe(true);
  });

  test("los dos CHECK con el SQL de la migracion", () => {
    const dialecto = new PgDialect();
    const checks = Object.fromEntries(
      cfg.checks.map((k) => [k.name, dialecto.sqlToQuery(k.value).sql]),
    );
    expect(checks).toEqual({
      chk_specialty_test_version: `"student_specialty_test_result"."content_version" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.[0-9]+$'`,
      chk_specialty_test_ranking: `jsonb_typeof("student_specialty_test_result"."ranking") = 'array' and jsonb_array_length("student_specialty_test_result"."ranking") = 4`,
    });
  });

  test("una sola FK, a student, en cascada, sin indices ni UNIQUE", () => {
    expect(cfg.foreignKeys).toHaveLength(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe("student_specialty_test_result_student_id_student_id_fk");
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
    expect(cfg.indexes).toEqual([]);
    expect(cfg.uniqueConstraints).toEqual([]);
  });
});
