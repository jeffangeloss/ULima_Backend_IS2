import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { representativePositionEnum } from "../../src/db/schema/schema.js";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { DelegadosNomina } from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * Escritura de delegados (RS-5a, RS-14, RS-15, RS-16, RS-22).
 *
 * Los cuatro métodos son SQL crudo dentro de la transacción de la importación,
 * así que lo que hay que proteger no es un valor de retorno sino la FORMA de
 * la consulta: el conflict target, la guarda de `observed_at`, el orden de las
 * escrituras y qué tabla se borra. Un error en cualquiera de esos cuatro
 * puntos no rompe un test de integración feliz — rompe la SEGUNDA importación,
 * y como todo vive en una sola transacción se lleva por delante notas, horario
 * y matrícula (RQ-6). Por eso se afirma sobre el SQL renderizado, que es lo
 * más cerca de Postgres que se llega sin base.
 */

/** `tx` de mentira: captura cada consulta y responde según el SQL emitido.
 *  Responder por consulta es imprescindible en `promoteClaimIfAny`, que
 *  primero LEE el claim y después decide si escribe: devolverle lo mismo a
 *  las tres consultas ocultaría justamente la rama que hay que probar. */
const fakeTx = (responder: (sql: string) => unknown[] = () => [{ id: 1 }]) => {
  const capturadas: SQL[] = [];
  return {
    tx: {
      execute: async (q: SQL) => {
        capturadas.push(q);
        return responder(new PgDialect().sqlToQuery(q).sql);
      },
    } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const sqls = (cs: Array<{ sql: string }>) => cs.map((c) => norm(c.sql));

/** Un DELETE sobre `section_representative` que NO sea sobre la tabla de
 *  claims. El `\b` no separa `section_representative` de `_claim` (el guion
 *  bajo es carácter de palabra), así que la distinción sale gratis. */
const BORRA_REPRESENTANTE = /delete\s+from\s+section_representative\b/;

const DELEGADA = { code: "20209999", fullName: "JUAN CARLOS PEREZ RAMIREZ" };
const SUBDELEGADO = { code: "20201111", fullName: "MARIA LUCIA GARCIA SOTO" };
const OBSERVADO = new Date("2026-09-04T15:04:05.000Z");

// ---------------------------------------------------------------------------
// upsertRepresentativeClaims
// ---------------------------------------------------------------------------

describe("upsertRepresentativeClaims: qué se escribe y qué se borra", () => {
  test("cargo presente se escribe; cargo ausente borra ese (section_id, position)", async () => {
    // RS-5a: un parseo `ok:true` sin subdelegado significa que la sección lo
    // revocó o todavía no lo eligió, y el portal es la fuente de verdad.
    // Dejar el claim viejo haría que la app mintiera el resto del ciclo.
    const { tx, consultas } = fakeTx();
    const r = await repo.upsertRepresentativeClaims(tx, 42, { delegate: DELEGADA }, OBSERVADO);

    const qs = sqls(consultas());
    expect(qs).toHaveLength(2);
    expect(qs[0]).toContain("insert into section_representative_claim");
    expect(consultas()[0]!.params).toEqual([
      42, "delegate", DELEGADA.code, DELEGADA.fullName, OBSERVADO.toISOString(),
    ]);
    expect(qs[1]).toContain("delete from section_representative_claim");
    expect(consultas()[1]!.params).toEqual([42, "subdelegate"]);
    expect(r).toEqual({ upserted: 1, deleted: 1 });
  });

  test("los dos cargos presentes: dos upserts y ningún borrado", async () => {
    const { tx, consultas } = fakeTx();
    const r = await repo.upsertRepresentativeClaims(
      tx, 42, { delegate: DELEGADA, subdelegate: SUBDELEGADO }, OBSERVADO,
    );

    const qs = sqls(consultas());
    expect(qs).toHaveLength(2);
    expect(qs.every((q) => q.includes("insert into"))).toBe(true);
    expect(consultas()[1]!.params).toEqual([
      42, "subdelegate", SUBDELEGADO.code, SUBDELEGADO.fullName, OBSERVADO.toISOString(),
    ]);
    expect(r).toEqual({ upserted: 2, deleted: 0 });
  });

  test("sección que todavía no eligió (RS-5): borra los dos cargos, no uno solo", async () => {
    const { tx, consultas } = fakeTx();
    const r = await repo.upsertRepresentativeClaims(tx, 42, {}, OBSERVADO);

    const qs = sqls(consultas());
    expect(qs).toHaveLength(2);
    expect(qs.every((q) => q.includes("delete from section_representative_claim"))).toBe(true);
    expect(consultas().map((c) => c.params)).toEqual([[42, "delegate"], [42, "subdelegate"]]);
    expect(r).toEqual({ upserted: 0, deleted: 2 });
  });

  test("RS-5a: un cargo descartado por dato inservible NO se escribe y TAMPOCO se borra", async () => {
    // Es el caso más importante del método. El parser devuelve el cargo como
    // ausente cuando el código o el nombre no caben en la tabla (RS-6a), pero
    // lo declara en `warnings`. Confundir ese descarte con una revocación
    // borraría un claim BUENO de una importación anterior por un problema de
    // formato del portal, y la app se quedaría sin delegado hasta el próximo
    // ciclo. Ausencia declarada != ausencia observada.
    const nomina: DelegadosNomina = {
      subdelegate: SUBDELEGADO,
      warnings: [{ position: "delegate", reason: "código de 34 caracteres" }],
    };
    const { tx, consultas } = fakeTx();
    const r = await repo.upsertRepresentativeClaims(tx, 42, nomina, OBSERVADO);

    const qs = sqls(consultas());
    expect(qs).toHaveLength(1);
    expect(qs[0]).toContain("insert into section_representative_claim");
    // Ni una sola consulta menciona al cargo descartado, en ningún parámetro.
    expect(consultas().flatMap((c) => c.params)).not.toContain("delegate");
    expect(qs.some((q) => q.includes("delete"))).toBe(false);
    expect(r).toEqual({ upserted: 1, deleted: 0 });
  });

  test("RS-5a: descartar un cargo no le quita el borrado al OTRO", async () => {
    // El descarte es por posición, no por nómina: el subdelegado vino
    // inservible, pero que el delegado esté ausente sigue siendo una
    // revocación real y su claim tiene que irse.
    const nomina: DelegadosNomina = {
      warnings: [{ position: "subdelegate", reason: "nombre vacío" }],
    };
    const { tx, consultas } = fakeTx();
    const r = await repo.upsertRepresentativeClaims(tx, 42, nomina, OBSERVADO);

    expect(sqls(consultas())).toHaveLength(1);
    expect(consultas()[0]!.params).toEqual([42, "delegate"]);
    expect(r).toEqual({ upserted: 0, deleted: 1 });
  });

  test("RS-5a: con los dos cargos descartados no se toca la tabla", async () => {
    const nomina: DelegadosNomina = {
      warnings: [
        { position: "delegate", reason: "nombre de 190 caracteres" },
        { position: "subdelegate", reason: "nombre vacío" },
      ],
    };
    const { tx, consultas } = fakeTx();
    const r = await repo.upsertRepresentativeClaims(tx, 42, nomina, OBSERVADO);

    expect(consultas()).toHaveLength(0);
    expect(r).toEqual({ upserted: 0, deleted: 0 });
  });
});

describe("upsertRepresentativeClaims: forma del upsert (RS-16)", () => {
  const upsert = async () => {
    const { tx, consultas } = fakeTx();
    await repo.upsertRepresentativeClaims(tx, 42, { delegate: DELEGADA }, OBSERVADO);
    return consultas()[0]!;
  };

  test("el conflict target es la constraint nombrada, no la lista de columnas", async () => {
    // `on conflict (section_id, position)` obligaría a Postgres a deducir el
    // índice y dejaría de coincidir el día que la constraint cambie de forma;
    // nombrarla es lo que la spec exige y lo que ata el upsert al UNIQUE real.
    const q = norm((await upsert()).sql);
    expect(q).toContain("on conflict on constraint uq_section_representative_claim_position");
    expect(q).toContain("do update");
    expect(q).not.toMatch(/on conflict\s*\(/);
  });

  test("la actualización está condicionada por observed_at: una observación vieja no pisa a una nueva", async () => {
    // Dos alumnos de la misma sección pueden sincronizar con segundos de
    // diferencia y CONFIRMAR en orden inverso al de observación. Sin este
    // `where`, la transacción que confirma última —aunque haya observado
    // primero— deja persistida la observación más vieja.
    const q = norm((await upsert()).sql);
    expect(q).toContain(
      "where excluded.observed_at > section_representative_claim.observed_at",
    );
    expect(q).toContain("observed_at = excluded.observed_at");
    expect(q).toContain("student_code = excluded.student_code");
    expect(q).toContain("full_name = excluded.full_name");
  });

  test("observed_at es el instante de la respuesta HTTP, no el del INSERT", async () => {
    // La descarga ocurre FUERA de la transacción: entre observar y escribir
    // pasan segundos. Si el valor lo pusiera la BD, la guarda de arriba
    // compararía horas de escritura y el desempate por observación no
    // significaría nada.
    const c = await upsert();
    expect(c.params[4]).toBe(OBSERVADO.toISOString());
    const q = norm(c.sql);
    expect(q).not.toContain("now()");
    expect(q).not.toContain("current_timestamp");
    expect(q).not.toContain("default");
  });

  test("la posición viaja parametrizada y con el cast al enum", async () => {
    // Sin `::representative_position` Postgres no sabe resolver el tipo del
    // parámetro contra la columna del enum.
    const q = norm((await upsert()).sql);
    expect(q).toContain("$2::representative_position");
    expect(q).not.toContain("'delegate'");
  });

  test("no cuenta como escrito lo que la guarda de observed_at rechazó", async () => {
    // El `where` falso hace que el `returning` no traiga filas. `claimsUpserted`
    // cuenta filas efectivamente escritas, no intentos.
    const { tx } = fakeTx(() => []);
    expect(await repo.upsertRepresentativeClaims(tx, 42, { delegate: DELEGADA }, OBSERVADO))
      .toEqual({ upserted: 0, deleted: 0 });
  });

  test("no cuenta como borrado lo que no existía", async () => {
    const { tx } = fakeTx(() => []);
    expect(await repo.upsertRepresentativeClaims(tx, 42, {}, OBSERVADO))
      .toEqual({ upserted: 0, deleted: 0 });
  });

  test("RS-15: el borrado del claim nunca alcanza a section_representative", async () => {
    // `announcement.section_representative_id` es FK sin cascada: borrar un
    // representante real dejaría anuncios huérfanos. La revocación de un claim
    // es un DELETE, pero solo sobre la tabla de claims, que no tiene
    // dependientes.
    const { tx, consultas } = fakeTx();
    await repo.upsertRepresentativeClaims(
      tx, 42, { delegate: DELEGADA }, OBSERVADO,
    );
    for (const q of sqls(consultas())) expect(q).not.toMatch(BORRA_REPRESENTANTE);
  });
});

// ---------------------------------------------------------------------------
// promoteClaimIfAny
// ---------------------------------------------------------------------------

/** Responde al SELECT del claim con el cargo indicado (o con nada) y con
 *  vacío a las escrituras, que no devuelven filas. */
const txPromocion = (cargo: "delegate" | "subdelegate" | null) =>
  fakeTx((s) => (s.includes("select position") && cargo ? [{ position: cargo }] : []));

describe("promoteClaimIfAny", () => {
  test("RS-14: sin claim del alumno devuelve null y no escribe NADA sobre section_representative", async () => {
    // La importación de cualquier alumno pasa por acá una vez por sección. Si
    // la rama sin claim escribiera aunque sea un UPDATE, cada import de un
    // alumno común tocaría la tabla de permisos, que es exactamente lo que
    // RS-BE-4 acota.
    const { tx, consultas } = txPromocion(null);
    expect(await repo.promoteClaimIfAny(tx, 42, 777, "20209999")).toBeNull();

    const qs = sqls(consultas());
    expect(qs).toHaveLength(1);
    expect(qs[0]).toContain("select position from section_representative_claim");
    expect(qs.some((q) => q.includes("update section_representative"))).toBe(false);
    expect(qs.some((q) => q.includes("insert into section_representative"))).toBe(false);
  });

  test("el claim se busca por sección Y código de alumno", async () => {
    // El empate es contra `app_user.code`; `student` no tiene columna de
    // código. Sin el `section_id`, un delegado de una sección se promovería en
    // todas las demás donde esté matriculado.
    const { tx, consultas } = txPromocion("delegate");
    await repo.promoteClaimIfAny(tx, 42, 777, "20209999");
    expect(consultas()[0]!.params).toEqual([42, "20209999"]);
    expect(norm(consultas()[0]!.sql)).toContain("limit 1");
  });

  test("RS-14: primero DESACTIVA y después inserta, en ese orden", async () => {
    // `uq_active_section_representative_position` es un índice único PARCIAL y
    // NO diferible: insertar al nuevo delegado antes de desactivar al anterior
    // choca contra el índice en el mismo statement, lanza 23505 y hace
    // rollback de la importación entera. Misma lección de `upsertPeriod`.
    const { tx, consultas } = txPromocion("delegate");
    expect(await repo.promoteClaimIfAny(tx, 42, 777, "20209999")).toBe("delegate");

    const qs = sqls(consultas());
    expect(qs).toHaveLength(3);
    expect(qs[1]).toContain("update section_representative set is_active = false");
    expect(qs[2]).toContain("insert into section_representative");
  });

  test("RS-14: el `on conflict` va sobre enrollment_id, NO sobre (section_id, position)", async () => {
    // `section_representative.enrollment_id` tiene un UNIQUE PLANO: la fila
    // desactivada sigue ocupando el valor. Con el target por posición, la
    // SEGUNDA importación del mismo delegado lanza 23505 y tumba notas,
    // horario y matrícula. Con este target, reimportar es idempotente y pasar
    // de delegado a subdelegado en la misma sección es un UPDATE.
    const { tx, consultas } = txPromocion("delegate");
    await repo.promoteClaimIfAny(tx, 42, 777, "20209999");

    const insert = norm(consultas()[2]!.sql);
    expect(insert).toContain("on conflict (enrollment_id) do update");
    expect(insert).not.toContain("(section_id, position)");
    // Reactivar es parte del upsert: la fila desactivada de una reasignación
    // anterior tiene que volver a is_active = true, no quedarse apagada.
    expect(insert).toContain("is_active = true");
    expect(insert).toContain("position = excluded.position");
    expect(consultas()[2]!.params).toEqual([42, 777, "delegate"]);
  });

  test("la desactivación excluye al propio enrollment: reimportar es idempotente", async () => {
    // Sin `enrollment_id <> :e` el mismo delegado se apagaría a sí mismo en
    // cada importación y el insert siguiente tendría que resucitarlo: una
    // ventana dentro de la transacción en la que la sección no tiene
    // representante, y una escritura de más por sección y por import.
    const { tx, consultas } = txPromocion("delegate");
    await repo.promoteClaimIfAny(tx, 42, 777, "20209999");

    const update = norm(consultas()[1]!.sql);
    expect(update).toContain("enrollment_id <> $3");
    expect(update).toContain("is_active = true");   // solo toca a los activos
    expect(update).toContain("position = $2::representative_position");
    expect(consultas()[1]!.params).toEqual([42, "delegate", 777]);
  });

  test("promueve también al subdelegado, con su propia posición", async () => {
    const { tx, consultas } = txPromocion("subdelegate");
    expect(await repo.promoteClaimIfAny(tx, 42, 777, "20201111")).toBe("subdelegate");
    expect(consultas()[1]!.params).toEqual([42, "subdelegate", 777]);
    expect(consultas()[2]!.params).toEqual([42, 777, "subdelegate"]);
  });

  test("RS-15: la reasignación apaga al anterior, nunca lo borra", async () => {
    // Los anuncios que ese representante publicó cuelgan de su fila por una FK
    // sin cascada: borrarla es un 23503 o, peor, anuncios huérfanos.
    const { tx, consultas } = txPromocion("delegate");
    await repo.promoteClaimIfAny(tx, 42, 777, "20209999");
    for (const q of sqls(consultas())) expect(q).not.toMatch(BORRA_REPRESENTANTE);
  });

  test("el desempate del claim se apoya en el orden de declaración del enum", async () => {
    // El SELECT ordena por `position` a secas: en Postgres un enum ordena por
    // orden de DECLARACIÓN, así que `delegate` gana solo si sigue declarado
    // primero. Reordenar el enum en el esquema invertiría el desempate en
    // silencio, promoviendo a subdelegado a quien el portal marcó delegado.
    const { tx, consultas } = txPromocion("delegate");
    await repo.promoteClaimIfAny(tx, 42, 777, "20209999");
    expect(norm(consultas()[0]!.sql)).toContain("order by position");
    expect(representativePositionEnum.enumValues[0]).toBe("delegate");
  });
});

// ---------------------------------------------------------------------------
// deleteClaimsOfInactivePeriods
// ---------------------------------------------------------------------------

describe("deleteClaimsOfInactivePeriods (RS-22)", () => {
  test("filtra por período NO activo, llegando por section -> course_offering -> academic_period", async () => {
    // Es lo que hace defendible guardar el nombre y el código de alguien que no
    // es usuario de la app: el dato muere con su ciclo. El claim no tiene
    // columna de período — el aislamiento sale del join, y si el join se
    // rompiera el barrido borraría claims del ciclo VIGENTE.
    const { tx, consultas } = fakeTx();
    await repo.deleteClaimsOfInactivePeriods(tx, 77);

    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("delete from section_representative_claim c");
    expect(q).toContain("c.section_id = s.id");
    expect(q).toContain("s.course_offering_id = co.id");
    expect(q).toContain("co.academic_period_id = ap.id");
    expect(q).toContain("ap.is_active = false");
    expect(consultas()).toHaveLength(1);
  });

  test("EXCLUYE el período que se está importando aunque esté inactivo", async () => {
    // Regresión. `shouldActivatePeriod` devuelve false para un ciclo creado
    // ANTES de su fecha de inicio (el caso que el service reporta como
    // PERIOD_NOT_ACTIVATED_YET) y `upsertPeriod` lo escribe con
    // is_active = false. Sin esta exclusión, ese ciclo se ve igual que uno
    // cerrado y la SEGUNDA importación hecha todavía antes de la fecha de
    // inicio borra sus claims al abrir la transacción; después solo se
    // reescriben las secciones cuya nómina se pudo descargar y parsear, porque
    // RS-17 degrada por aula. Las demás quedan sin delegado.
    const { tx, consultas } = fakeTx();
    await repo.deleteClaimsOfInactivePeriods(tx, 77);

    const c = consultas()[0]!;
    expect(norm(c.sql)).toContain("ap.id <>");
    // Parametrizado, no concatenado.
    expect(c.params).toContain(77);
  });

  test("devuelve el conteo de filas efectivamente borradas", async () => {
    // `summary.claimsDeleted` sale de acá: sin `returning` habría que confiar
    // en el rowcount del driver, que este repositorio no expone.
    const { tx, consultas } = fakeTx(() => [{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(await repo.deleteClaimsOfInactivePeriods(tx, 77)).toBe(3);
    expect(norm(consultas()[0]!.sql)).toContain("returning c.id");
  });

  test("sin ciclos cerrados devuelve 0 y es idempotente", async () => {
    // Corre en TODAS las importaciones, no solo en la primera del ciclo nuevo.
    const { tx } = fakeTx(() => []);
    expect(await repo.deleteClaimsOfInactivePeriods(tx, 77)).toBe(0);
  });

  test("RS-15: el barrido no alcanza a section_representative", async () => {
    // Un representante real de un ciclo cerrado conserva su fila: sus anuncios
    // siguen existiendo y su permiso ya no vale porque la sección es de otro
    // ciclo.
    const { tx, consultas } = fakeTx();
    await repo.deleteClaimsOfInactivePeriods(tx, 77);
    for (const q of sqls(consultas())) expect(q).not.toMatch(BORRA_REPRESENTANTE);
  });
});

// ---------------------------------------------------------------------------
// findActiveRepresentativePosition
// ---------------------------------------------------------------------------

/** Este método NO recibe `tx`: se consulta después de que la transacción
 *  confirmó, para re-firmar el token con el rol ya persistido. Por eso el
 *  doble va en el constructor y no en el parámetro. */
const repoConFilas = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  const r = new PortalSyncRepository({
    execute: async (q: SQL) => { capturadas.push(q); return rows; },
  } as never);
  return { repo: r, consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)) };
};

describe("findActiveRepresentativePosition", () => {
  test("delegate gana el desempate sobre subdelegate", async () => {
    // El rol del token nuevo NO se deriva del claim recién promovido: alguien
    // que ya era `delegate` en otra sección y acaba de ser promovido a
    // `subdelegate` en esta no puede terminar con un token degradado. El
    // desempate es explícito para no depender del orden del enum.
    const { repo: r, consultas } = repoConFilas([{ position: "delegate" }]);
    await r.findActiveRepresentativePosition(9);

    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("order by case when sr.position = 'delegate' then 0 else 1 end");
    expect(q).toContain("limit 1");
    // El `limit 1` sin `order by` devolvería una fila cualquiera.
    expect(q.indexOf("order by")).toBeLessThan(q.indexOf("limit 1"));
  });

  test("solo mira cargos ACTIVOS y del alumno indicado", async () => {
    // Una fila desactivada por RS-14 (reasignación) no puede seguir dando rol:
    // la degradación es parte del contrato.
    const { repo: r, consultas } = repoConFilas([{ position: "subdelegate" }]);
    await r.findActiveRepresentativePosition(9);

    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("join enrollment e on e.id = sr.enrollment_id");
    expect(q).toContain("e.student_id = $1");
    expect(q).toContain("sr.is_active = true");
    expect(consultas()[0]!.params).toEqual([9]);
  });

  test("devuelve el cargo vigente", async () => {
    const { repo: r } = repoConFilas([{ position: "subdelegate" }]);
    expect(await r.findActiveRepresentativePosition(9)).toBe("subdelegate");
  });

  test("sin cargo devuelve null, no undefined", async () => {
    // `ImportResult.token` es `string | null` y el rol viaja al `signToken`:
    // un `undefined` acá se convertiría en un token sin rol.
    const { repo: r } = repoConFilas([]);
    expect(await r.findActiveRepresentativePosition(9)).toBeNull();
  });

  test("no lee la tabla de claims: un claim no otorga permisos (RS-19)", async () => {
    // El rol sale de `section_representative`, la única tabla que autoriza.
    // Derivarlo del claim le daría permisos a quien el portal señala pero que
    // todavía no fue promovido dentro de la transacción.
    const { repo: r, consultas } = repoConFilas([{ position: "delegate" }]);
    await r.findActiveRepresentativePosition(9);
    expect(norm(consultas()[0]!.sql)).not.toContain("section_representative_claim");
  });
});
