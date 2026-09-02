import { describe, expect, test } from "bun:test";
import {
  levelFromCoverage, levelNeverGoesDown, pickBestRecordRow, progressStatusFor,
  withdrawalWouldLockOut,
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

describe("levelFromCoverage", () => {
  const c = (cycle: number, total: number, approved: number) => ({ cycle, total, approved });

  test("el pendiente mas bajo, cuando no hay huecos de datos", () => {
    expect(levelFromCoverage([c(1, 6, 6), c(2, 6, 6), c(3, 6, 1), c(4, 6, 0)])).toBe(3);
  });

  test("CASO REAL (2026-09-02): ignora los ciclos bajos sin datos y devuelve 9, no 1", () => {
    // Cobertura exacta del alumno 20235218 en la primera importacion real. De
    // sus 52 obligatorios solo 26 tenian fila de progreso: los otros 26 estan
    // en su record con codigos que no calzan con la malla (convalidaciones,
    // codigos antiguos) y se contaban como pendientes. La regla anterior
    // tomaba el minimo y lo mandaba de ciclo 8 a ciclo 1.
    const real = [
      c(1, 6, 1), c(2, 6, 3), c(3, 6, 0), c(4, 6, 1), c(5, 6, 2),
      c(6, 6, 6), c(7, 5, 5), c(8, 4, 4), c(9, 4, 1), c(10, 3, 0),
    ];
    expect(levelFromCoverage(real)).toBe(9);
  });

  test("el recorte se ancla en el ciclo completo MAS ALTO, no en el primero", () => {
    // Completos: 2 y 5. Manda el 5, asi que el 3 (incompleto) no cuenta.
    expect(levelFromCoverage([c(2, 4, 4), c(3, 4, 1), c(5, 4, 4), c(6, 4, 0)])).toBe(6);
  });

  test("alumno que recien empieza: sin ningun ciclo completo no se recorta nada", () => {
    expect(levelFromCoverage([c(1, 6, 0), c(2, 6, 0)])).toBe(1);
  });

  test("todo aprobado devuelve null: no hay ciclo que asignar", () => {
    expect(levelFromCoverage([c(1, 6, 6), c(2, 6, 6)])).toBeNull();
  });

  test("sin obligatorios devuelve null", () => {
    expect(levelFromCoverage([])).toBeNull();
    expect(levelFromCoverage([{ cycle: 1, total: 0, approved: 0 }])).toBeNull();
  });

  test("entrada desordenada: el resultado no depende del orden de las filas", () => {
    const filas = [c(9, 4, 1), c(1, 6, 1), c(8, 4, 4), c(3, 6, 0)];
    expect(levelFromCoverage(filas)).toBe(9);
    expect(levelFromCoverage([...filas].reverse())).toBe(9);
  });

  test("mas aprobados que el total (dato sucio) cuenta el ciclo como completo", () => {
    expect(levelFromCoverage([c(1, 4, 5), c(2, 4, 1)])).toBe(2);
  });
});

describe("levelNeverGoesDown", () => {
  test("un calculo mas bajo que lo guardado no baja al alumno, y se marca", () => {
    expect(levelNeverGoesDown(1, 8)).toEqual({ level: 8, regresion: true });
  });

  test("un calculo mas alto si avanza", () => {
    expect(levelNeverGoesDown(9, 8)).toEqual({ level: 9, regresion: false });
  });

  test("igual no es regresion", () => {
    expect(levelNeverGoesDown(8, 8)).toEqual({ level: 8, regresion: false });
  });

  test("sin nivel guardado se acepta el calculo tal cual", () => {
    expect(levelNeverGoesDown(3, null)).toEqual({ level: 3, regresion: false });
  });

  test("calculo nulo no toca nada ni marca regresion", () => {
    expect(levelNeverGoesDown(null, 8)).toEqual({ level: null, regresion: false });
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
