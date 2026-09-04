import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

/**
 * El cargo de representante CADUCA con el ciclo.
 *
 * `section_representative` dice "el alumno X es delegado de la sección Y" y no
 * tiene columna de período: el ciclo sale de la sección
 * (`section -> course_offering -> academic_period`). Sin unir hasta
 * `academic_period` y exigir `ap.is_active = true`, un delegado de 2026-1
 * conserva el cargo para siempre. Reportado en producción el 2026-09-04: un
 * alumno en 2026-2 seguía viendo que era delegado de cursos de ciclos pasados.
 *
 * Lo que hace falta probar es SQL, no TypeScript. Las cuatro consultas
 * arregladas son SQL crudo (`db.execute`) y el filtro nuevo es un join más una
 * condición; un doble que devolviera filas ya filtradas estaría probando mi
 * reimplementación de la regla, no la regla. Por eso se usa la misma técnica
 * que `course-detail.contacts-claim.test.ts`: un `db` de mentira que traduce
 * los marcadores de Drizzle y EJECUTA la consulta contra SQLite en memoria.
 * Las cuatro son ANSI (join, exists, group by, count, case/order by) y no usan
 * nada exclusivo de Postgres, así que se evalúan tal cual.
 *
 * SQLite en memoria no es "una base real": no hay Postgres, ni Neon, ni red,
 * ni estado entre pruebas. Es un doble que sabe ejecutar SQL, y sin eso el
 * invariante de este archivo no es verificable con dobles.
 */

const dialect = new PgDialect();
let bd = new Database(":memory:");

/** `db` de mentira. Traduce lo que Drizzle emite ($1, $2…) a los marcadores
 *  posicionales de SQLite, respetando el orden en que aparecen (un mismo $n
 *  repetido se liga las veces que haga falta). */
const fakeDb = {
  execute: async (query: SQL) => {
    const { sql: texto, params } = dialect.sqlToQuery(query);
    const ligados: unknown[] = [];
    const traducido = texto.replace(/\$(\d+)/g, (_todo, n: string) => {
      ligados.push(params[Number(n) - 1]);
      return "?";
    });
    return bd.query(traducido).all(...(ligados as never[]));
  },
};

// El mock tiene que quedar instalado ANTES de cargar los repositorios:
// `portal-sync.repository.ts` importa `db` como VALOR y el módulo real abre un
// cliente de Postgres al evaluarse. Por eso las importaciones de abajo son
// dinámicas: los `import` estáticos se izan por encima de esta línea.
mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { AuthRepository } = await import("../../src/modules/auth/auth.repository.js");
const { SectionManagementRepository } = await import(
  "../../src/modules/section-management/section-management.repository.js"
);
const { PortalSyncRepository } = await import(
  "../../src/modules/portal-sync/portal-sync.repository.js"
);
const { ChatRepository } = await import("../../src/modules/chat/chat.repository.js");

const auth = new AuthRepository(fakeDb as never);
const secciones = new SectionManagementRepository(fakeDb as never);
const portal = new PortalSyncRepository(fakeDb as never);
const chat = new ChatRepository(fakeDb as never);

const DDL = `
  create table academic_period (id integer primary key, code text,
    start_date text, end_date text, is_active integer);
  create table course (id integer primary key, code text, name text, default_credit integer);
  create table course_offering (id integer primary key, academic_period_id integer,
    course_id integer, total_hours text);
  create table section (id integer primary key, course_offering_id integer,
    teacher_id integer, code text, jp_id integer);
  create table enrollment (id integer primary key, student_id integer,
    section_id integer, status text);
  create table section_representative (id integer primary key, section_id integer,
    enrollment_id integer, position text, is_active integer);
  create table app_user (id integer primary key, code text, full_name text,
    institutional_email text, token_version integer);
  create table student (id integer primary key, user_id integer, career_id integer);
`;

/** Identificadores del mundo de prueba. Códigos y nombres ficticios (RS-23). */
const P_PASADO = 1, P_VIGENTE = 2;          // academic_period: 2026-1 cerrado, 2026-2 activo
const CUR_ALGO = 1, CUR_IS2 = 2, CUR_BD = 3;
const OF_PASADA = 10, OF_VIGENTE = 20, OF_VIGENTE2 = 21;
const SEC_PASADA = 100;                      // '820', ciclo 2026-1 (cerrado)
const SEC_VIGENTE = 200, SEC_VIGENTE2 = 201; // '952' y '741', ciclo 2026-2
const A_JEFF = 1, A_OTRA = 2;                // student.id
const U_JEFF = 900, U_OTRA = 901;            // app_user.id
const M_PASADA = 1000;                       // matrícula de A_JEFF en SEC_PASADA
const M_VIGENTE = 1001, M_VIGENTE2 = 1002;   // matrículas de A_JEFF en 2026-2
const M_OTRA = 1003;                         // compañera en SEC_VIGENTE

/**
 * Mundo mínimo: dos períodos (uno cerrado, uno vigente), tres secciones y un
 * alumno matriculado en las tres.
 *
 * TODAS las matrículas quedan en `status = 'active'`, incluida la del ciclo
 * cerrado, y eso no es descuido: es como está la base. `upsertEnrollment`
 * escribe siempre `'active'` y `withdrawMissingEnrollments` solo retira dentro
 * del período que se está importando, así que nada mueve una matrícula vieja a
 * 'completed' al cambiar de ciclo. De ahí que `e.status = 'active'` no sirva
 * para caducar el cargo: lo único que separa los ciclos es
 * `academic_period.is_active`.
 *
 * Cada prueba agrega encima sus propias filas de `section_representative`.
 */
const sembrar = () => {
  bd = new Database(":memory:");
  bd.run(DDL);

  const periodo = (id: number, code: string, activo: boolean) =>
    bd.run(`insert into academic_period (id, code, start_date, end_date, is_active)
            values (?, ?, '2026-03-16', '2026-07-19', ?)`, [id, code, activo ? 1 : 0]);

  periodo(P_PASADO, "2026-1", false);
  periodo(P_VIGENTE, "2026-2", true);

  const curso = (id: number, code: string, nombre: string) =>
    bd.run(`insert into course (id, code, name, default_credit) values (?,?,?,4)`, [id, code, nombre]);

  curso(CUR_ALGO, "IN101", "ALGORITMOS Y ESTRUCTURAS DE DATOS");
  curso(CUR_IS2, "IN202", "INGENIERIA DE SOFTWARE II");
  curso(CUR_BD, "IN203", "BASE DE DATOS APLICADA");

  const oferta = (id: number, periodoId: number, cursoId: number) =>
    bd.run(`insert into course_offering (id, academic_period_id, course_id, total_hours)
            values (?,?,?,'64')`, [id, periodoId, cursoId]);

  oferta(OF_PASADA, P_PASADO, CUR_ALGO);
  oferta(OF_VIGENTE, P_VIGENTE, CUR_IS2);
  oferta(OF_VIGENTE2, P_VIGENTE, CUR_BD);

  const seccion = (id: number, ofertaId: number, code: string) =>
    bd.run(`insert into section (id, course_offering_id, teacher_id, code, jp_id)
            values (?,?,1,?,null)`, [id, ofertaId, code]);

  seccion(SEC_PASADA, OF_PASADA, "820");
  seccion(SEC_VIGENTE, OF_VIGENTE, "952");
  seccion(SEC_VIGENTE2, OF_VIGENTE2, "741");

  const usuario = (id: number, code: string, nombre: string) =>
    bd.run(`insert into app_user (id, code, full_name, institutional_email, token_version)
            values (?,?,?,?,1)`, [id, code, nombre, `u${id}@aloe.ulima.edu.pe`]);

  usuario(U_JEFF, "20200001", "CASTRO VEGA ANA LUCIA");
  usuario(U_OTRA, "20200002", "QUISPE ROJAS BRUNO");
  bd.run(`insert into student (id, user_id, career_id) values (?,?,5)`, [A_JEFF, U_JEFF]);
  bd.run(`insert into student (id, user_id, career_id) values (?,?,5)`, [A_OTRA, U_OTRA]);

  const matricula = (id: number, alumnoId: number, seccionId: number) =>
    bd.run(`insert into enrollment (id, student_id, section_id, status) values (?,?,?,'active')`,
      [id, alumnoId, seccionId]);

  matricula(M_PASADA, A_JEFF, SEC_PASADA);
  matricula(M_VIGENTE, A_JEFF, SEC_VIGENTE);
  matricula(M_VIGENTE2, A_JEFF, SEC_VIGENTE2);
  matricula(M_OTRA, A_OTRA, SEC_VIGENTE);
};

/** Fila de `section_representative`: el cargo, sin período propio. */
const representante = (
  seccionId: number,
  matriculaId: number,
  cargo: "delegate" | "subdelegate",
  activo = true,
) =>
  bd.run(`insert into section_representative (section_id, enrollment_id, position, is_active)
          values (?,?,?,?)`, [seccionId, matriculaId, cargo, activo ? 1 : 0]);

beforeEach(sembrar);

// ---------------------------------------------------------------------------
// 1. AuthRepository.findActiveRepresentation — el rol que va FIRMADO en el JWT
// ---------------------------------------------------------------------------

describe("findActiveRepresentation: el rol del token caduca con el ciclo", () => {
  test("delegado SOLO en una sección de ciclo cerrado -> null (el token sale como student)", async () => {
    // El caso reportado. Esta consulta decide el `role` que se FIRMA en el JWT,
    // así que un cargo rancio no es cosmético: el alumno entra a la app con rol
    // de delegado y `requireRole('delegate')` le abre las pantallas de gestión
    // un ciclo entero después de haber dejado el cargo.
    representante(SEC_PASADA, M_PASADA, "delegate");

    expect(await auth.findActiveRepresentation(A_JEFF)).toBeNull();
  });

  test("delegado en el ciclo vigente -> devuelve el cargo", async () => {
    // Contraprueba imprescindible: si el join nuevo estuviera mal escrito y
    // filtrara a todo el mundo, la prueba de arriba pasaría igual sin probar
    // nada. Acá cambia UNA cosa —la sección es de 2026-2— y el cargo aparece.
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    expect(await auth.findActiveRepresentation(A_JEFF)).toEqual({ position: "delegate" });
  });

  test("delegado en AMBOS ciclos -> devuelve el cargo: el viejo no estorba", async () => {
    // El filtro descarta filas, no alumnos. Quien sigue siendo delegado hoy
    // conserva su rol aunque arrastre cargos de ciclos anteriores.
    representante(SEC_PASADA, M_PASADA, "delegate");
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    expect(await auth.findActiveRepresentation(A_JEFF)).toEqual({ position: "delegate" });
  });

  test("delegado en el ciclo cerrado y SUBdelegado en el vigente -> subdelegate", async () => {
    // El `order by` pone 'delegate' primero. Si el filtro de período corriera
    // después del orden —o no corriera— la fila ganadora sería la del ciclo
    // cerrado y el token diría 'delegate': un ASCENSO de permisos heredado de
    // un ciclo que ya terminó. Esta prueba fija que primero se filtra y recién
    // después se desempata.
    representante(SEC_PASADA, M_PASADA, "delegate");
    representante(SEC_VIGENTE, M_VIGENTE, "subdelegate");

    expect(await auth.findActiveRepresentation(A_JEFF)).toEqual({ position: "subdelegate" });
  });

  test("un representante desactivado del ciclo vigente sigue sin contar", async () => {
    // `is_active = false` es como se revoca un cargo dentro del ciclo (RS-15
    // prohíbe borrar la fila porque los anuncios la referencian). El filtro de
    // período se SUMA a ese, no lo reemplaza.
    representante(SEC_VIGENTE, M_VIGENTE, "delegate", false);

    expect(await auth.findActiveRepresentation(A_JEFF)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. SectionManagementRepository.findRepresentativesByStudent — qué gestiona
// ---------------------------------------------------------------------------

describe("findRepresentativesByStudent: solo las secciones del ciclo vigente", () => {
  test("la sección de ciclo cerrado no aparece en la lista", async () => {
    // Es la pantalla donde el delegado elige a qué sección publicarle. Con la
    // sección vieja adentro, el alumno ve cursos que ya aprobó ofreciéndose a
    // gestionarlos.
    representante(SEC_PASADA, M_PASADA, "delegate");
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    const filas = await secciones.findRepresentativesByStudent(A_JEFF);
    expect(filas.map((f) => f.section_id)).toEqual([SEC_VIGENTE]);
    expect(filas.map((f) => f.course_name)).toEqual(["INGENIERIA DE SOFTWARE II"]);
  });

  test("si TODOS sus cargos son de ciclos cerrados la lista queda vacía", async () => {
    representante(SEC_PASADA, M_PASADA, "delegate");

    expect(await secciones.findRepresentativesByStudent(A_JEFF)).toEqual([]);
  });

  test("con dos secciones del ciclo vigente devuelve las dos, ordenadas por curso", async () => {
    // Contraprueba: el `exists` sobre `academic_period` está dentro del mismo
    // `where` que alimenta el `group by`. Si estuviera mal ubicado podría
    // colapsar filas legítimas o dejar una sola.
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");
    representante(SEC_VIGENTE2, M_VIGENTE2, "subdelegate");

    const filas = await secciones.findRepresentativesByStudent(A_JEFF);
    expect(filas.map((f) => f.course_name)).toEqual([
      "BASE DE DATOS APLICADA",
      "INGENIERIA DE SOFTWARE II",
    ]);
    expect(filas.map((f) => f.position)).toEqual(["subdelegate", "delegate"]);
  });

  test("el conteo de matriculados sigue saliendo bien con el filtro puesto", async () => {
    // `enrolled_students` sale de un `left join` + `count` agrupado. El filtro
    // nuevo se escribió como `exists (...)` justamente para no meter otra tabla
    // en el producto cartesiano: si se hubiera hecho con un join más, cada
    // alumno se contaría una vez por período y el número saldría inflado.
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    const filas = await secciones.findRepresentativesByStudent(A_JEFF);
    expect(Number(filas[0]?.enrolled_students)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. SectionManagementRepository.findRepresentativeAccess — autorización
// ---------------------------------------------------------------------------

describe("findRepresentativeAccess: publicar anuncios exige cargo VIGENTE", () => {
  test("sobre una sección de ciclo cerrado devuelve null", async () => {
    // Esta es la guarda que decide si el alumno puede PUBLICAR un anuncio.
    // Sin el filtro, el delegado de 2026-1 podía seguir publicando en el muro
    // de una sección que ya no cursa nadie, y con el rol rancio del token nada
    // más lo detenía.
    representante(SEC_PASADA, M_PASADA, "delegate");

    expect(await secciones.findRepresentativeAccess(A_JEFF, SEC_PASADA)).toBeNull();
  });

  test("sobre una sección del ciclo vigente devuelve el acceso", async () => {
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    expect(await secciones.findRepresentativeAccess(A_JEFF, SEC_VIGENTE)).toEqual({
      id: 1,
      sectionId: SEC_VIGENTE,
      studentId: A_JEFF,
      position: "delegate",
    });
  });

  test("ser delegado hoy no da acceso a la sección del ciclo pasado", async () => {
    // El cargo se evalúa contra ESTA sección y su período. Un delegado en
    // funciones no hereda permisos sobre su sección vieja.
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    expect(await secciones.findRepresentativeAccess(A_JEFF, SEC_PASADA)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. PortalSyncRepository.findActiveRepresentativePosition — re-firma del token
// ---------------------------------------------------------------------------

describe("findActiveRepresentativePosition: el rol con el que se re-firma el token", () => {
  test("solo cargo en ciclo cerrado -> null", async () => {
    // Esta consulta corre al terminar de importar desde miUlima y decide con
    // qué rol se re-firma el token. Es además la MÁS expuesta de las cuatro:
    // no filtra por `e.status`, así que antes del arreglo no tenía absolutamente
    // ningún predicado temporal y el cargo era vitalicio.
    representante(SEC_PASADA, M_PASADA, "delegate");

    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBeNull();
  });

  test("cargo en el ciclo vigente -> devuelve el cargo", async () => {
    representante(SEC_VIGENTE, M_VIGENTE, "subdelegate");

    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBe("subdelegate");
  });

  test("'delegate' sigue ganando el desempate sobre 'subdelegate' dentro del ciclo vigente", async () => {
    // El desempate no se rompió al agregar el filtro: entre dos cargos válidos
    // del mismo ciclo manda el más alto, que es lo que el token debe llevar.
    representante(SEC_VIGENTE, M_VIGENTE, "subdelegate");
    representante(SEC_VIGENTE2, M_VIGENTE2, "delegate");

    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBe("delegate");
  });

  test("el 'delegate' del ciclo cerrado NO le gana al 'subdelegate' vigente", async () => {
    // Mismo desempate, con una fila caduca de por medio: la del ciclo cerrado
    // ni siquiera entra al orden. Sin el filtro, re-importar el ciclo nuevo le
    // devolvía el rol de delegado a quien hoy es subdelegado.
    representante(SEC_PASADA, M_PASADA, "delegate");
    representante(SEC_VIGENTE, M_VIGENTE, "subdelegate");

    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBe("subdelegate");
  });

  test("una matrícula RETIRADA del ciclo vigente ya no devuelve el cargo", async () => {
    // Fuera del alcance del arreglo de período, pero sale a la luz al poner las
    // cuatro consultas una al lado de la otra: ésta es la ÚNICA que no exige
    // `e.status = 'active'`. Las otras tres lo tienen.
    //
    // Nada desactiva `section_representative` cuando la matrícula se retira:
    // `withdrawMissingEnrollments` solo escribe `enrollment.status`, y los
    // únicos `update section_representative set is_active = false` son el
    // relevo por (section_id, position) durante la importación y las
    // revocaciones explícitas de section-management/academic-profile. Así que
    // con el cargo todavía activo y el período vigente, esta consulta lo
    // devuelve.
    //
    // El resultado es que la MISMA persona sale con roles distintos según el
    // camino: al iniciar sesión `findActiveRepresentation` dice student, y tras
    // sincronizar con el portal esta consulta re-firma el token como delegate.
    //
    // CORREGIDO el 2026-09-04: se le agregó `and e.status = 'active'`, que era
    // el único predicado que le faltaba respecto de las otras tres. El test
    // queda como regresión de esa asimetría.
    bd.run(`update enrollment set status = 'withdrawn' where id = ?`, [M_VIGENTE]);
    representante(SEC_VIGENTE, M_VIGENTE, "delegate");

    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBeNull();
    // Y la contraparte de login ya responde bien hoy: de ahí la asimetría.
    expect(await auth.findActiveRepresentation(A_JEFF)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. El porqué: las cuatro consultas a la vez
// ---------------------------------------------------------------------------

describe("el invariante completo: delegado en el ciclo viejo y nada en el nuevo", () => {
  test("ninguna de las cuatro consultas le da el cargo", async () => {
    // El escenario exacto que reportó el usuario: dos períodos, el viejo con
    // `is_active = false`, cargo solo en el viejo. Las cuatro consultas cubren
    // los cuatro caminos por los que el cargo llegaba a la app —el JWT del
    // login, la lista de cursos que gestiona, la autorización para publicar y
    // la re-firma tras sincronizar—. Que las cuatro digan lo mismo es el punto:
    // arreglar tres de cuatro deja la puerta abierta por la que falta.
    representante(SEC_PASADA, M_PASADA, "delegate");

    expect(await auth.findActiveRepresentation(A_JEFF)).toBeNull();
    expect(await secciones.findRepresentativesByStudent(A_JEFF)).toEqual([]);
    expect(await secciones.findRepresentativeAccess(A_JEFF, SEC_PASADA)).toBeNull();
    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBeNull();
  });

  test("la matrícula vieja sigue en 'active': por eso el estado de matrícula no alcanzaba", async () => {
    // Anclaje del PORQUÉ hacía falta tocar el SQL. Tres de las cuatro
    // consultas ya exigían `e.status = 'active'` y aun así el cargo no
    // caducaba, porque nada mueve la matrícula de un ciclo terminado:
    // `upsertEnrollment` escribe siempre 'active' y `withdrawMissingEnrollments`
    // solo retira dentro del período que se importa. Si algún día la matrícula
    // pasara a 'completed' al cerrar el ciclo, esta prueba falla y avisa que el
    // razonamiento de arriba cambió.
    representante(SEC_PASADA, M_PASADA, "delegate");

    const fila = bd.query(`select status from enrollment where id = ?`)
      .get(M_PASADA) as { status: string };
    expect(fila.status).toBe("active");
    expect(await auth.findActiveRepresentation(A_JEFF)).toBeNull();
  });

  test("reactivar el período viejo devuelve el cargo: is_active es lo único que decide", async () => {
    // Cierra la argumentación por el otro lado. Cambia UN dato —el `is_active`
    // del período— sin tocar representantes ni matrículas, y las cuatro
    // consultas vuelven a otorgar el cargo. Queda demostrado que lo que caduca
    // el cargo es el período y no algún otro filtro que ya estuviera puesto.
    representante(SEC_PASADA, M_PASADA, "delegate");
    bd.run(`update academic_period set is_active = 0 where id = ?`, [P_VIGENTE]);
    bd.run(`update academic_period set is_active = 1 where id = ?`, [P_PASADO]);

    expect(await auth.findActiveRepresentation(A_JEFF)).toEqual({ position: "delegate" });
    expect(await secciones.findRepresentativesByStudent(A_JEFF)).toHaveLength(1);
    expect(await secciones.findRepresentativeAccess(A_JEFF, SEC_PASADA)).toMatchObject({
      sectionId: SEC_PASADA,
      position: "delegate",
    });
    expect(await portal.findActiveRepresentativePosition(A_JEFF)).toBe("delegate");
  });
});

// ---------------------------------------------------------------------------
// 6. Contraste deliberado: el chat NO se filtra por ciclo
// ---------------------------------------------------------------------------

describe("chat: el ex delegado sigue moderando el chat de SU sección vieja", () => {
  test("findStudentParticipant devuelve 'delegate' e isModerator en la sección de ciclo cerrado", async () => {
    // `chat.repository.ts` quedó SIN el filtro a propósito y esta prueba lo
    // documenta para que nadie lo "arregle" por simetría. Su join es por
    // SECCIÓN (`sr.section_id = e.section_id` y `e.section_id = :sectionId`):
    // el rol que devuelve solo vale dentro de ese chat, y el chat de una
    // sección de 2026-1 es de gente de 2026-1. Quitarle el moderador a esa
    // conversación no protege nada y deja el historial sin quién lo modere.
    //
    // La diferencia con las otras cuatro es esa: aquéllas responden "¿qué es
    // esta persona AHORA?" y por eso tienen que mirar el ciclo; ésta responde
    // "¿qué es esta persona DENTRO de esta sección?", que no depende del ciclo.
    representante(SEC_PASADA, M_PASADA, "delegate");

    const participante = await chat.findStudentParticipant(A_JEFF, SEC_PASADA);
    expect(participante).toMatchObject({
      userId: U_JEFF,
      sectionId: SEC_PASADA,
      role: "delegate",
      isModerator: true,
    });
  });
});
