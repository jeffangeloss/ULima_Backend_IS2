import { describe, expect, test } from "bun:test";
import { pickBestRecordRow, progressStatusFor } from "../../src/modules/portal-sync/portal-sync.repository.js";

describe("progressStatusFor", () => {
  test("11 o mas aprueba", () => {
    expect(progressStatusFor(11, false)).toBe("approved");
    expect(progressStatusFor(20, false)).toBe("approved");
  });
  test("menos de 11 desaprueba", () => {
    expect(progressStatusFor(10, false)).toBe("failed");
    expect(progressStatusFor(0, false)).toBe("failed");
  });
  test("sin nota en el ciclo vigente queda en curso", () => {
    expect(progressStatusFor(null, true)).toBe("in_progress");
  });
  test("sin nota en un ciclo pasado se omite", () => {
    expect(progressStatusFor(null, false)).toBeNull();
  });
});

describe("pickBestRecordRow", () => {
  test("gana la VEZ mas alta", () => {
    const rows = [
      { periodCode: "2024-1", courseCode: "650002", courseName: "X", attempt: 1, credits: 3, grade: 8, sectionCode: "1" },
      { periodCode: "2024-2", courseCode: "650002", courseName: "X", attempt: 2, credits: 3, grade: 15, sectionCode: "2" },
    ];
    expect(pickBestRecordRow(rows)?.grade).toBe(15);
  });
  test("a igual VEZ gana el ciclo mas reciente", () => {
    const rows = [
      { periodCode: "2024-1", courseCode: "650002", courseName: "X", attempt: 1, credits: 3, grade: 12, sectionCode: "1" },
      { periodCode: "2025-1", courseCode: "650002", courseName: "X", attempt: 1, credits: 3, grade: 17, sectionCode: "2" },
    ];
    expect(pickBestRecordRow(rows)?.grade).toBe(17);
  });
  test("lista vacia devuelve null", () => {
    expect(pickBestRecordRow([])).toBeNull();
  });
});
