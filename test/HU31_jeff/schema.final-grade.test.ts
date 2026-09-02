import { describe, expect, test } from "bun:test";
import { enrollment } from "../../src/db/schema/schema.js";

describe("enrollment.final_grade", () => {
  test("la columna existe en el esquema Drizzle", () => {
    expect(Object.keys(enrollment)).toContain("finalGrade");
  });

  test("mapea a la columna final_grade y admite null", () => {
    const col = (enrollment as unknown as Record<string, { name: string; notNull: boolean }>).finalGrade;
    expect(col.name).toBe("final_grade");
    expect(col.notNull).toBe(false);
  });
});
