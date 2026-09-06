import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * `upsertTeacher` y los docentes duplicados.
 *
 * El bug (producción, 2026-09-05: 11 grupos duplicados): el upsert resolvía por
 * `teacher_code`, y las filas sembradas a mano no lo tienen. Al importar del
 * portal, la misma persona no se encontraba y se insertaba otra vez con nombre
 * en orden distinto ("DIAZ PARRA, JOSE RAUL" sembrada vs "JOSE RAUL DIAZ PARRA"
 * del portal). Las secciones nuevas apuntaban a la copia, así que un docente con
 * cuenta dejaba de ver sus propias secciones.
 */

/** `tx` de mentira: responde según el SQL emitido, porque este método LEE antes
 *  de decidir si escribe y hay que poder distinguir cada rama. */
const fakeTx = (responder: (sql: string) => unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return responder(new PgDialect().sqlToQuery(q).sql); } } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
  };
};
const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const es = (sql: string, frag: string) => norm(sql).includes(frag);

describe("upsertTeacher — no vuelve a crear a alguien que ya está", () => {
  test("camino rápido: ya existe con ese teacher_code, no se escanea la tabla entera", async () => {
    const { tx, consultas } = fakeTx((s) => (es(s, "where teacher_code =") ? [{ id: 7 }] : []));
    const r = await repo.upsertTeacher(tx, "Percy Diez Quiñones Panduro");
    expect(r).toEqual({ id: 7, created: false });
    // Busca por código y refresca el nombre (comportamiento de siempre), pero NO
    // lee las 199 filas: ese escaneo es solo para el caso que antes duplicaba.
    expect(sqlsDe(consultas()).some((x) => es(x, "select id, full_name, teacher_code, user_id from teacher"))).toBe(false);
    expect(sqlsDe(consultas()).some((x) => es(x, "set full_name ="))).toBe(true);
  });

  test("la misma persona sembrada con el nombre AL REVÉS se reusa, no se duplica", async () => {
    // Es literalmente el caso que dejó 11 duplicados en producción.
    const { tx, consultas } = fakeTx((s) => {
      if (es(s, "where teacher_code =")) return [];
      if (es(s, "from teacher")) return [{ id: 54, full_name: "DIEZ QUIÑONES PANDURO, PERCY", teacher_code: null, user_id: null }];
      return [];
    });
    const r = await repo.upsertTeacher(tx, "PERCY DIEZ QUIÑONES PANDURO");
    expect(r).toEqual({ id: 54, created: false });
    expect(sqlsDe(consultas()).some((s) => es(s, "insert into teacher"))).toBe(false);
  });

  test("al reusar una fila SIN código se le rellena el que usará el portal", async () => {
    // Sin esto, la siguiente importación volvería a no encontrarla.
    const { tx, consultas } = fakeTx((s) => {
      if (es(s, "where teacher_code =")) return [];
      if (es(s, "from teacher")) return [{ id: 54, full_name: "DIEZ QUIÑONES PANDURO, PERCY", teacher_code: null, user_id: null }];
      return [];
    });
    await repo.upsertTeacher(tx, "PERCY DIEZ QUIÑONES PANDURO");
    const update = sqlsDe(consultas()).find((s) => es(s, "update teacher"));
    expect(update).toBeDefined();
    expect(es(update!, "set teacher_code =")).toBe(true);
    expect(consultas().some((c) => c.params.includes("PORTAL:PERCY-DIEZ-QUINONES-PANDURO"))).toBe(true);
  });

  test("una fila que YA tiene otro código se reusa pero NO se le pisa el código", async () => {
    // `DOC005` viene del seed de cuentas docentes: sobrescribirlo rompería el
    // vínculo que ese seed usa para encontrarla.
    const { tx, consultas } = fakeTx((s) => {
      if (es(s, "where teacher_code =")) return [];
      if (es(s, "from teacher")) return [{ id: 5, full_name: "MACHUCA DE PINA JUAN MANUEL", teacher_code: "DOC005", user_id: null }];
      return [];
    });
    const r = await repo.upsertTeacher(tx, "Juan Manuel Machuca De Pina");
    expect(r.id).toBe(5);
    expect(sqlsDe(consultas()).some((s) => es(s, "set teacher_code ="))).toBe(false);
  });

  test("si NADIE empata se inserta, conservando el on conflict como red de carreras", async () => {
    const { tx, consultas } = fakeTx((s) => (es(s, "insert into teacher") ? [{ id: 300, created: true }] : []));
    const r = await repo.upsertTeacher(tx, "Nueva Persona Que No Existe");
    expect(r).toEqual({ id: 300, created: true });
    expect(sqlsDe(consultas()).some((s) => es(s, "on conflict (teacher_code)"))).toBe(true);
  });

  test("con varias filas de la misma persona gana la que tiene cuenta, no la de menor id", async () => {
    // Elegir por id le colgaría las secciones a una fila sin cuenta y el docente
    // seguiría sin ver las suyas: exactamente el síntoma que se está arreglando.
    const { tx } = fakeTx((s) => {
      if (es(s, "where teacher_code =")) return [];
      if (es(s, "from teacher")) return [
        { id: 129, full_name: "QUINTANA CRUZ, HERNAN ALEJANDRO", teacher_code: null, user_id: 900 },
        { id: 12, full_name: "HERNAN ALEJANDRO QUINTANA CRUZ", teacher_code: null, user_id: null },
      ];
      return [];
    });
    expect((await repo.upsertTeacher(tx, "Hernan Alejandro Quintana Cruz")).id).toBe(129);
  });

  test("sin nombre usa el placeholder y su código fijo, sin escanear la tabla", async () => {
    const { tx, consultas } = fakeTx((s) => (es(s, "where teacher_code =") ? [{ id: 1 }] : []));
    const r = await repo.upsertTeacher(tx, "");
    expect(r.id).toBe(1);
    expect(consultas()[0].params).toContain("PORTAL:SIN-DOCENTE");
  });

  test("un nombre nuevo NO empata con el placeholder ni con nadie por nombre vacío", async () => {
    const { tx } = fakeTx((s) => {
      // El orden importa: la consulta por código TAMBIÉN dice "from teacher".
      if (es(s, "where teacher_code =")) return [];
      if (es(s, "insert into teacher")) return [{ id: 400, created: true }];
      if (es(s, "from teacher")) return [{ id: 1, full_name: "DOCENTE POR ASIGNAR", teacher_code: "PORTAL:SIN-DOCENTE", user_id: null }];
      return [];
    });
    expect((await repo.upsertTeacher(tx, "Persona Real Nueva")).created).toBe(true);
  });
});

function sqlsDe(cs: Array<{ sql: string }>): string[] { return cs.map((c) => c.sql); }
