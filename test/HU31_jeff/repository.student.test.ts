import { describe, expect, test } from "bun:test";
import {
  minOutstandingCycle, pickBestRecordRow, progressStatusFor, withdrawalWouldLockOut,
} from "../../src/modules/portal-sync/portal-sync.repository.js";

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

describe("minOutstandingCycle", () => {
  test("varios cursos pendientes: gana el ciclo mas bajo", () => {
    expect(minOutstandingCycle([{ cycle: 9 }, { cycle: 6 }, { cycle: 10 }])).toBe(6);
  });
  test("lista vacia devuelve null: ya aprobo todos los obligatorios", () => {
    expect(minOutstandingCycle([])).toBeNull();
  });
  test("una sola fila devuelve su propio ciclo", () => {
    expect(minOutstandingCycle([{ cycle: 5 }])).toBe(5);
  });
  test("entrada desordenada: sigue ganando el mas bajo", () => {
    expect(minOutstandingCycle([{ cycle: 8 }, { cycle: 3 }, { cycle: 7 }, { cycle: 4 }])).toBe(3);
  });
});

describe("withdrawalWouldLockOut", () => {
  test("retirar todas las matriculas activas bloquearia al alumno", () => {
    expect(withdrawalWouldLockOut(5, 5)).toBe(true);
  });

  test("retirar algunas pero no todas es seguro", () => {
    expect(withdrawalWouldLockOut(5, 4)).toBe(false);
  });

  test("no retirar nada es seguro", () => {
    expect(withdrawalWouldLockOut(5, 0)).toBe(false);
  });

  test("un alumno sin matriculas activas no puede perder mas", () => {
    expect(withdrawalWouldLockOut(0, 0)).toBe(true);
  });

  test("retirar mas de las que hay tambien bloquearia", () => {
    expect(withdrawalWouldLockOut(3, 4)).toBe(true);
  });
});
