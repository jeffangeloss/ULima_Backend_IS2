import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { AttendanceRiskRepository } from "../../src/modules/attendance-risk/attendance-risk.repository.js";

/**
 * RS-BE-14: notificar a una sección es todo o nada.
 *
 * `createAlerts` insertaba en un `for` sin transacción; su propio comentario lo
 * admitía: "un fallo a mitad deja alertas parciales insertadas". Reintentar
 * después duplica las alertas de los primeros alumnos, porque `alert` no tiene
 * restricción única que lo impida, y el docente no tiene forma de saber a
 * quiénes ya les llegó.
 */

const dato = (studentId: number) => ({
  studentId,
  type: "academic_risk",
  title: "Alerta de inasistencias",
  message: "mensaje",
});

/**
 * Doble de BD fiel a Postgres: un `execute` FUERA de transacción autocommitea
 * (por eso cuenta como confirmado al toque), y dentro de una transacción queda
 * en vuelo hasta el commit.
 */
const fakeDb = (fallarEnLaEnesima?: number) => {
  const confirmadas: number[] = [];
  let enVuelo: number[] | null = null;
  let n = 0;
  const ejecutar = async (_q: unknown) => {
    n += 1;
    if (fallarEnLaEnesima === n) throw new Error("fallo de BD");
    if (enVuelo === null) confirmadas.push(n);   // autocommit
    else enVuelo.push(n);
    return [] as unknown[];
  };
  return {
    confirmadas,
    db: {
      execute: ejecutar,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        enVuelo = [];
        try {
          const r = await fn({ execute: ejecutar });
          confirmadas.push(...enVuelo);          // COMMIT
          return r;
        } catch (e) {
          throw e;                               // ROLLBACK: se descarta enVuelo
        } finally {
          enVuelo = null;
        }
      },
    },
  };
};

describe("createAlerts es atomico", () => {
  test("un fallo a mitad no deja ninguna alerta insertada", async () => {
    const { db, confirmadas } = fakeDb(2);
    const repo = new AttendanceRiskRepository(db as never);

    await expect(repo.createAlerts([dato(1), dato(2), dato(3)])).rejects.toThrow();
    expect(confirmadas).toHaveLength(0);
  });

  test("sin fallos se confirman todas y devuelve cuantas", async () => {
    const { db, confirmadas } = fakeDb();
    const repo = new AttendanceRiskRepository(db as never);

    expect(await repo.createAlerts([dato(1), dato(2), dato(3)])).toBe(3);
    expect(confirmadas).toHaveLength(3);
  });

  test("una lista vacia no abre transaccion ni escribe nada", async () => {
    let abrio = false;
    const repo = new AttendanceRiskRepository({
      execute: async () => [],
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        abrio = true;
        return fn({ execute: async () => [] });
      },
    } as never);

    expect(await repo.createAlerts([])).toBe(0);
    expect(abrio).toBe(false);
  });
});
