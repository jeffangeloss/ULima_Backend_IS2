import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/** `tx` de mentira: captura la consulta y devuelve las filas que se le digan.
 *  No hace falta base de datos para verificar QUÉ se escribe y cómo se
 *  interpreta lo que vuelve. */
const fakeTx = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never,
    consulta: () => new PgDialect().sqlToQuery(capturadas[0]!),
  };
};

const repo = new PortalSyncRepository({} as never);
const entry = {
  unid: "E86886A81087A25805258E4F00502E2C",
  fileName: "2026-2 SIL PLANEAMIENTO ESTRATÉGICO.pdf",
  url: "https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV/E86886A/$File/x.pdf",
};

describe("PortalSyncRepository.upsertSyllabus", () => {
  test("usa `on conflict do nothing` SIN target: cubre TODAS las restricciones únicas de syllabus", async () => {
    // `syllabus` tiene dos uniques: uq_syllabus_course_offering y
    // syllabus_drive_file_id_unique. Un target explícito solo cubre el
    // primero: un UNID repetido entre dos ofertas (un sílabo compartido por
    // dos códigos de curso) lanzaba 23505, envenenaba la transacción y tumbaba
    // la importación entera (matrícula, récord, progreso, nivel, alertas).
    const { tx, consulta } = fakeTx([{ id: 7 }]);
    await repo.upsertSyllabus(tx, 30, entry);
    const q = consulta().sql.toLowerCase().replace(/\s+/g, " ");
    expect(q).toContain("on conflict do nothing");
    expect(q).not.toContain("do update");
    expect(q).not.toContain("on conflict (");
  });

  test("nunca pisa una fila existente: no hay `set` de title, drive_file_id ni drive_file_url", async () => {
    // Las filas sembradas traen enlaces de Google Drive que el visor de la app
    // SÍ abre y que grades.repository sirve a TODOS los alumnos de la oferta.
    const { tx, consulta } = fakeTx([{ id: 7 }]);
    await repo.upsertSyllabus(tx, 30, entry);
    expect(consulta().sql.toLowerCase()).not.toContain(" set ");
  });

  test("escribe la oferta, el título, el UNID y la URL, en ese orden", async () => {
    const { tx, consulta } = fakeTx([{ id: 7 }]);
    await repo.upsertSyllabus(tx, 30, entry);
    expect(consulta().params).toEqual([30, entry.fileName, entry.unid, entry.url]);
  });

  test("devuelve la fila cuando el insert sí escribió", async () => {
    const { tx } = fakeTx([{ id: 7 }]);
    expect(await repo.upsertSyllabus(tx, 30, entry)).toEqual({ id: 7, created: true });
  });

  test("devuelve null cuando el `do nothing` no escribió nada (la oferta ya tenía sílabo)", async () => {
    // `returning` no trae filas: leer rows[0] a ciegas reventaba acá.
    const { tx } = fakeTx([]);
    expect(await repo.upsertSyllabus(tx, 30, entry)).toBeNull();
  });
});
