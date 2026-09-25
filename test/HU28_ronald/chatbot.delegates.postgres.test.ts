import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { db } from "../../src/db/index.js";
import * as relations from "../../src/db/relations/index.js";
import * as schema from "../../src/db/schema/index.js";
import { ChatbotRepository } from "../../src/modules/chatbot/chatbot.repository.js";
import type { SectionRepresentativesData } from "../../src/modules/chatbot/chatbot.types.js";

/**
 * BR-CB-16: delegado y subdelegado por curso y sección, contra un PostgreSQL de
 * verdad.
 *
 * `getSectionRepresentatives` resuelve en una sola sentencia qué fuente manda
 * para cada sección y cada cargo (`section_representative` activo de esa misma
 * sección y, si falta, `section_representative_claim`). Esa precedencia vive en
 * el SQL, así que solo una base real la prueba. Es también la consulta que
 * corrige el bug reportado: el delegado de otro curso ya no puede aparecer en
 * la sección por la que se pregunta.
 *
 * Solo corre con `TEST_DATABASE_URL`. Sin esa variable se salta entera, así que
 * `bun test` sigue sin tocar ninguna base. Con ella exige, como
 * `test/HU35_jeff/time-blocks.postgres.test.ts`, que el host sea local y que la
 * base esté vacía (sin `public.student`). Todo corre en UNA transacción que se
 * deshace al final y cada prueba en su propio savepoint, así que la base queda
 * vacía y se puede reusar. Dentro de la transacción aplica el esquema real de
 * esas tablas, `drizzle/0000_baseline.sql` y `drizzle/0006_delegado_claim.sql`.
 *
 * Cómo correrla con un Postgres desechable (producción es PostgreSQL 17; el 16
 * de Homebrew también sirve):
 *
 *   PGBIN=/opt/homebrew/opt/postgresql@16/bin
 *   PGTMP=$(mktemp -d)
 *   "$PGBIN/initdb" -D "$PGTMP/data" -U postgres -A trust > /dev/null
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p 54329 -k $PGTMP" -l "$PGTMP/log" -w start
 *   "$PGBIN/createdb" -h 127.0.0.1 -p 54329 -U postgres delegados
 *   DATABASE_URL=postgres://user:pass@localhost:5432/test \
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/delegados \
 *     bun test test/HU28_ronald/chatbot.delegates.postgres.test.ts
 *   "$PGBIN/pg_ctl" -D "$PGTMP/data" -w stop && rm -rf "$PGTMP"
 *
 * Datos INVENTADOS (el repo es público): la alumna sintética 20230001, nombres
 * de fantasía y correos en el dominio reservado `.invalid`.
 */

const URL_DE_PRUEBA = process.env.TEST_DATABASE_URL ?? "";

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const esBaseLocal = (url: string): boolean => {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

const CODIGO_ALUMNA = "20230001";
const NOMBRE_ALUMNA = "LUCIA INVENTADA PAREDES";

let cliente: postgres.Sql | null = null;
let repositorio: ChatbotRepository;
let alumna = 0;
let periodoActivo = 0;
let periodoInactivo = 0;
let docente = 0;
let contador = 0;

const base = (): postgres.Sql => {
  if (!cliente) throw new Error("La conexión de prueba no se abrió (ver beforeAll).");
  return cliente;
};

type Cargo = "delegate" | "subdelegate";

/** app_user + student; devuelve `student.id`. */
const persona = async (nombre: string, codigo?: string): Promise<number> => {
  contador++;
  const [usuario] = await base()`
    insert into app_user (code, full_name, institutional_email, password_hash)
    values (${codigo ?? `INV-${contador}`}, ${nombre}, ${`persona${contador}@ejemplo.invalid`}, 'sin-uso')
    returning id`;
  const [estudiante] = await base()`
    insert into student (user_id, career_id, curriculum_id)
    values (${usuario.id}, 1, 1)
    returning id`;
  return estudiante.id as number;
};

/** course + course_offering en el período dado; devuelve `course_offering.id`. */
const curso = async (nombre: string, periodo: number = periodoActivo): Promise<number> => {
  contador++;
  const [c] = await base()`
    insert into course (code, name, default_credit) values (${`CUR-${contador}`}, ${nombre}, 4) returning id`;
  const [o] = await base()`
    insert into course_offering (academic_period_id, course_id) values (${periodo}, ${c.id}) returning id`;
  return o.id as number;
};

const seccion = async (oferta: number, codigo: string): Promise<number> => {
  const [s] = await base()`
    insert into section (course_offering_id, teacher_id, code) values (${oferta}, ${docente}, ${codigo}) returning id`;
  return s.id as number;
};

const matricular = async (
  estudiante: number,
  idSeccion: number,
  estado: "active" | "withdrawn" | "completed" = "active",
): Promise<number> => {
  const [e] = await base()`
    insert into enrollment (student_id, section_id, status) values (${estudiante}, ${idSeccion}, ${estado}) returning id`;
  return e.id as number;
};

/** Fila de `section_representative`. `idSeccion` puede no ser la de la matrícula. */
const representante = async (idSeccion: number, matricula: number, cargo: Cargo, activo = true): Promise<void> => {
  await base()`
    insert into section_representative (section_id, enrollment_id, position, is_active)
    values (${idSeccion}, ${matricula}, ${cargo}, ${activo})`;
};

const claim = async (idSeccion: number, cargo: Cargo, codigo: string, nombre: string): Promise<void> => {
  await base()`
    insert into section_representative_claim (section_id, position, student_code, full_name, observed_at)
    values (${idSeccion}, ${cargo}, ${codigo}, ${nombre}, '2026-09-20T12:00:00Z'::timestamptz)`;
};

/** Una persona matriculada en la sección y representante de ese cargo. */
const representanteReal = async (idSeccion: number, nombre: string, cargo: Cargo): Promise<number> => {
  const quien = await persona(nombre);
  const matricula = await matricular(quien, idSeccion);
  await representante(idSeccion, matricula, cargo);
  return quien;
};

const titular = (fullName: string, isSelf = false) => ({ fullName, isSelf });

const consultar = (estudiante: number = alumna): Promise<SectionRepresentativesData[]> =>
  repositorio.getSectionRepresentatives(estudiante);

// Los ganchos de la conexión van fuera del `describe`, como en la prueba de
// bloques: dentro de un `describe` saltado, bun cuenta cada gancho como una
// prueba saltada más. Sin TEST_DATABASE_URL los dos vuelven sin hacer nada.
beforeAll(async () => {
  if (!URL_DE_PRUEBA) return;
  if (!esBaseLocal(URL_DE_PRUEBA)) {
    throw new Error(
      "TEST_DATABASE_URL tiene que apuntar a un Postgres local (localhost, 127.0.0.1 o ::1): esta prueba escribe tablas y filas.",
    );
  }
  const baseline = await Bun.file("drizzle/0000_baseline.sql").text();
  const claims = await Bun.file("drizzle/0006_delegado_claim.sql").text();

  // max: 1 deja abrir la transacción a mano y hace que las sentencias del
  // repositorio vayan por la misma conexión.
  cliente = postgres(URL_DE_PRUEBA, { max: 1, onnotice: () => {} });
  const database: typeof db = drizzle(cliente, { schema: { ...schema, ...relations } });
  repositorio = new ChatbotRepository(database);

  await cliente.unsafe("begin");
  const [previa] = await cliente`select to_regclass('public.student') is not null as hay_student`;
  if (previa?.hay_student) {
    throw new Error(
      "La base de TEST_DATABASE_URL ya tiene public.student: usa una base vacía y desechable (createdb).",
    );
  }
  await cliente.unsafe(baseline);
  await cliente.unsafe(claims);

  const [activo] = await cliente`
    insert into academic_period (code, start_date, end_date, is_active)
    values ('2026-2', '2026-08-17'::date, '2026-12-15'::date, true) returning id`;
  const [inactivo] = await cliente`
    insert into academic_period (code, start_date, end_date, is_active)
    values ('2026-1', '2026-03-16'::date, '2026-07-20'::date, false) returning id`;
  const [profe] = await cliente`insert into teacher (full_name) values ('DOCENTE INVENTADO') returning id`;
  periodoActivo = activo.id as number;
  periodoInactivo = inactivo.id as number;
  docente = profe.id as number;
  alumna = await persona(NOMBRE_ALUMNA, CODIGO_ALUMNA);
});

afterAll(async () => {
  if (!cliente) return;
  await cliente.unsafe("rollback").catch(() => {});
  await cliente.end();
});

describe.skipIf(!URL_DE_PRUEBA)("BR-CB-16: delegados por curso y sección contra PostgreSQL real (TEST_DATABASE_URL)", () => {
  beforeEach(async () => {
    if (cliente) await cliente.unsafe("savepoint caso");
  });

  afterEach(async () => {
    if (cliente) await cliente.unsafe("rollback to savepoint caso");
  });

  test("el bug reportado: dos cursos con delegados distintos y uno solo con claim, cada curso con los suyos", async () => {
    const seguridad = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    const planeamiento = await seccion(await curso("PLANEAMIENTO ESTRATEGICO"), "802");
    await matricular(alumna, seguridad);
    await matricular(alumna, planeamiento);

    // Delegado y subdelegado reales de PLANEAMIENTO, que TAMBIÉN llevan
    // SEGURIDAD como alumnos comunes. Es lo que antes los hacía aparecer como
    // «Delegado» sin curso.
    const bruno = await representanteReal(planeamiento, "BRUNO INVENTADO SOTO", "delegate");
    const carla = await representanteReal(planeamiento, "CARLA INVENTADA DIAZ", "subdelegate");
    await matricular(bruno, seguridad);
    await matricular(carla, seguridad);
    // SEGURIDAD no tiene representante activo: su delegada solo está en el portal.
    await claim(seguridad, "delegate", "INV-PORTAL-1", "ANA FICTICIA ROJAS");

    expect(await consultar()).toEqual([
      {
        courseName: "PLANEAMIENTO ESTRATEGICO",
        sectionCode: "802",
        delegate: titular("BRUNO INVENTADO SOTO"),
        subdelegate: titular("CARLA INVENTADA DIAZ"),
      },
      {
        courseName: "SEGURIDAD DE SISTEMAS",
        sectionCode: "801",
        delegate: titular("ANA FICTICIA ROJAS"),
        subdelegate: null,
      },
    ]);
  });

  test("solo claim: los dos cargos salen del portal", async () => {
    const s = await seccion(await curso("ETICA PROFESIONAL"), "803");
    await matricular(alumna, s);
    await claim(s, "delegate", "INV-PORTAL-2", "DIEGO INVENTADO LUNA");
    await claim(s, "subdelegate", "INV-PORTAL-3", "ELENA INVENTADA CRUZ");

    expect(await consultar()).toEqual([
      {
        courseName: "ETICA PROFESIONAL",
        sectionCode: "803",
        delegate: titular("DIEGO INVENTADO LUNA"),
        subdelegate: titular("ELENA INVENTADA CRUZ"),
      },
    ]);
  });

  test("real y claim del mismo cargo: gana el real; cada cargo se resuelve por separado", async () => {
    const s = await seccion(await curso("CALCULO I"), "804");
    await matricular(alumna, s);
    await representanteReal(s, "FABIO INVENTADO REAL", "delegate");
    await claim(s, "delegate", "INV-PORTAL-4", "GINA INVENTADA PORTAL");
    await claim(s, "subdelegate", "INV-PORTAL-5", "HUGO INVENTADO PORTAL");

    expect(await consultar()).toEqual([
      {
        courseName: "CALCULO I",
        sectionCode: "804",
        delegate: titular("FABIO INVENTADO REAL"),
        subdelegate: titular("HUGO INVENTADO PORTAL"),
      },
    ]);
  });

  test("sección sin representante ni claim: sale con los dos cargos vacíos", async () => {
    const s = await seccion(await curso("ETICA PROFESIONAL"), "803");
    await matricular(alumna, s);

    expect(await consultar()).toEqual([
      { courseName: "ETICA PROFESIONAL", sectionCode: "803", delegate: null, subdelegate: null },
    ]);
  });

  test("una persona matriculada en dos secciones y delegada solo en una sale solo en esa", async () => {
    const a = await seccion(await curso("ALGEBRA LINEAL"), "801");
    const b = await seccion(await curso("BIOLOGIA GENERAL"), "802");
    await matricular(alumna, a);
    await matricular(alumna, b);
    const ivan = await representanteReal(a, "IVAN INVENTADO PEREZ", "delegate");
    await matricular(ivan, b);

    expect(await consultar()).toEqual([
      { courseName: "ALGEBRA LINEAL", sectionCode: "801", delegate: titular("IVAN INVENTADO PEREZ"), subdelegate: null },
      { courseName: "BIOLOGIA GENERAL", sectionCode: "802", delegate: null, subdelegate: null },
    ]);
  });

  test("la propia alumna como subdelegada real sale con isSelf", async () => {
    const s = await seccion(await curso("PLANEAMIENTO ESTRATEGICO"), "802");
    const matricula = await matricular(alumna, s);
    await representante(s, matricula, "subdelegate");
    await representanteReal(s, "BRUNO INVENTADO SOTO", "delegate");

    expect(await consultar()).toEqual([
      {
        courseName: "PLANEAMIENTO ESTRATEGICO",
        sectionCode: "802",
        delegate: titular("BRUNO INVENTADO SOTO"),
        subdelegate: titular(NOMBRE_ALUMNA, true),
      },
    ]);
  });

  test("un claim cuyo student_code es el app_user.code de la alumna sale con isSelf", async () => {
    const s = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    await matricular(alumna, s);
    await claim(s, "delegate", CODIGO_ALUMNA, "LUCIA INVENTADA PAREDES (PORTAL)");
    await claim(s, "subdelegate", "INV-PORTAL-6", "JULIA INVENTADA RAMOS");

    expect(await consultar()).toEqual([
      {
        courseName: "SEGURIDAD DE SISTEMAS",
        sectionCode: "801",
        delegate: titular("LUCIA INVENTADA PAREDES (PORTAL)", true),
        subdelegate: titular("JULIA INVENTADA RAMOS"),
      },
    ]);
  });

  test("un representante real con matrícula withdrawn sigue contando, como en la pantalla del curso", async () => {
    const s = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    await matricular(alumna, s);
    const kevin = await persona("KEVIN INVENTADO RETIRADO");
    const matricula = await matricular(kevin, s, "withdrawn");
    await representante(s, matricula, "delegate");
    await claim(s, "delegate", "INV-PORTAL-7", "LAURA INVENTADA PORTAL");

    expect(await consultar()).toEqual([
      {
        courseName: "SEGURIDAD DE SISTEMAS",
        sectionCode: "801",
        delegate: titular("KEVIN INVENTADO RETIRADO"),
        subdelegate: null,
      },
    ]);
  });

  test("un representante activo cuya matrícula es de otra sección no cuenta y deja pasar el claim", async () => {
    const s1 = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    const s2 = await seccion(await curso("PLANEAMIENTO ESTRATEGICO"), "802");
    await matricular(alumna, s1);
    await matricular(alumna, s2);
    // Matriculado en PLANEAMIENTO, pero la fila de representante dice SEGURIDAD.
    const mario = await persona("MARIO INVENTADO CRUZADO");
    const matriculaEnOtra = await matricular(mario, s2);
    await representante(s1, matriculaEnOtra, "delegate");
    await claim(s1, "delegate", "INV-PORTAL-8", "NORA INVENTADA PORTAL");

    expect(await consultar()).toEqual([
      { courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802", delegate: null, subdelegate: null },
      { courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801", delegate: titular("NORA INVENTADA PORTAL"), subdelegate: null },
    ]);
  });

  test("un representante inactivo no cuenta: cae al claim o queda vacío", async () => {
    const s = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    await matricular(alumna, s);
    const olga = await persona("OLGA INVENTADA ANTERIOR");
    await representante(s, await matricular(olga, s), "delegate", false);
    const pablo = await persona("PABLO INVENTADO ANTERIOR");
    await representante(s, await matricular(pablo, s), "subdelegate", false);
    await claim(s, "delegate", "INV-PORTAL-9", "QUIQUE INVENTADO PORTAL");

    expect(await consultar()).toEqual([
      { courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801", delegate: titular("QUIQUE INVENTADO PORTAL"), subdelegate: null },
    ]);
  });

  test("una sección de un período inactivo no sale, aunque la matrícula siga activa y tenga delegado", async () => {
    const vieja = await seccion(await curso("SEGURIDAD DE SISTEMAS", periodoInactivo), "801");
    await matricular(alumna, vieja);
    await representanteReal(vieja, "RAUL INVENTADO VIEJO", "delegate");
    const actual = await seccion(await curso("PLANEAMIENTO ESTRATEGICO"), "802");
    await matricular(alumna, actual);

    expect(await consultar()).toEqual([
      { courseName: "PLANEAMIENTO ESTRATEGICO", sectionCode: "802", delegate: null, subdelegate: null },
    ]);
  });

  test("una sección donde la matrícula de la alumna no está activa no sale", async () => {
    const retirada = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    await matricular(alumna, retirada, "withdrawn");
    await representanteReal(retirada, "SARA INVENTADA SOTO", "delegate");

    expect(await consultar()).toEqual([]);
  });

  test("las secciones de otros alumnos no salen, aunque tengan delegados", async () => {
    const ajena = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    const otro = await persona("TOMAS INVENTADO AJENO");
    await matricular(otro, ajena);
    await representanteReal(ajena, "URSULA INVENTADA AJENA", "delegate");

    expect(await consultar()).toEqual([]);
    expect(await consultar(otro)).toEqual([
      { courseName: "SEGURIDAD DE SISTEMAS", sectionCode: "801", delegate: titular("URSULA INVENTADA AJENA"), subdelegate: null },
    ]);
  });

  test("ordena por nombre de curso y código de sección", async () => {
    const zoologia = await curso("ZOOLOGIA APLICADA");
    const algebra = await curso("ALGEBRA LINEAL");
    await matricular(alumna, await seccion(zoologia, "801"));
    await matricular(alumna, await seccion(algebra, "802"));
    await matricular(alumna, await seccion(algebra, "801"));

    const resultado = await consultar();
    expect(resultado.map((r) => `${r.courseName} ${r.sectionCode}`)).toEqual([
      "ALGEBRA LINEAL 801",
      "ALGEBRA LINEAL 802",
      "ZOOLOGIA APLICADA 801",
    ]);
  });

  test("35 matriculados por sección no cambian el resultado (sin LIMIT ni lista de compañeros)", async () => {
    const s1 = await seccion(await curso("SEGURIDAD DE SISTEMAS"), "801");
    const s2 = await seccion(await curso("PLANEAMIENTO ESTRATEGICO"), "802");
    await matricular(alumna, s1);
    await matricular(alumna, s2);
    await representanteReal(s1, "VALENTIN INVENTADO DELEGADO", "delegate");
    await claim(s2, "subdelegate", "INV-PORTAL-10", "WENDY INVENTADA PORTAL");
    const antes = await consultar();

    for (let i = 0; i < 35; i++) {
      const companero = await persona(`COMPANERO INVENTADO ${i}`);
      await matricular(companero, s1);
      await matricular(companero, s2);
    }

    const despues = await consultar();
    expect(despues).toEqual(antes);
    expect(despues).toHaveLength(2);
    expect(JSON.stringify(despues)).not.toContain("COMPANERO INVENTADO");
  });

  test("un alumno que no existe no trae nada", async () => {
    expect(await consultar(987654)).toEqual([]);
  });
});
