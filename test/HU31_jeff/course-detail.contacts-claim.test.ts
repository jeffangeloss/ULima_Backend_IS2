import { describe, expect, mock, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-19 y RS-20: guarda de pertenencia y fallback a claims de
 * `GET /course-detail/sections/:sectionId/contacts`.
 *
 * El handler NO pasa por un service: arma SQL crudo y lo manda con
 * `db.execute` (la propia RS-20 lo dice: `CourseDetailService.getContacts`
 * existe pero ninguna ruta lo registra, así que el punto de extensión es la
 * ruta). Por eso hay que doblar `db`.
 *
 * El doble NO devuelve filas enlatadas: ejecuta el SQL de verdad contra SQLite
 * en memoria. La razón es RS-20: los tres casos del fallback —hay
 * representante real, la persona del claim ya está matriculada, no está
 * nadie— se resuelven DENTRO de la consulta, con dos `not exists`. Un doble
 * que devolviera las filas ya filtradas estaría probando mi reimplementación
 * de la regla, no la regla. Lo mismo vale para la guarda de pertenencia. Las
 * consultas del handler son ANSI (join, left join, exists, order by, limit) y
 * no usan nada exclusivo de Postgres, así que se pueden evaluar tal cual.
 *
 * SQLite en memoria no es "una base real" en el sentido de la consigna: no hay
 * Postgres, ni Neon, ni red, ni estado entre pruebas. Es un doble que sabe
 * ejecutar SQL, y sin eso los casos (1) y (2) de RS-20 no son verificables.
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

// El mock tiene que quedar instalado ANTES de que se cargue la ruta: tanto el
// handler como `authMiddleware` importan este mismo módulo, y el módulo real
// abre un cliente de Postgres al evaluarse. Por eso las importaciones de abajo
// son dinámicas: los `import` estáticos se izan por encima de esta línea.
mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { createCourseDetailRoutes } = await import(
  "../../src/modules/course-detail/course-detail.routes.js"
);
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

// Se monta como en `server.ts`: el handler lanza `HttpError` y quien lo
// traduce a 403 con `code` es el errorHandler global. Sin él, el 403 de
// SECTION_FORBIDDEN saldría como 500 y la prueba mediría otra cosa.
const app = new Hono();
app.onError(errorHandler);
app.route("/course-detail", createCourseDetailRoutes({} as never));

const DDL = `
  create table app_user (id integer primary key, code text, full_name text,
    institutional_email text, token_version integer, networking_opt_in integer);
  create table user_social_link (id integer primary key, user_id integer,
    platform text, url text, label text);
  create table student (id integer primary key, user_id integer, career_id integer);
  create table teacher (id integer primary key, teacher_code text, full_name text, user_id integer);
  create table section (id integer primary key, course_offering_id integer,
    teacher_id integer, code text, jp_id integer);
  create table enrollment (id integer primary key, student_id integer, section_id integer);
  create table section_representative (id integer primary key, section_id integer,
    enrollment_id integer, position text, is_active integer);
  create table section_representative_claim (id integer primary key, section_id integer,
    position text, student_code text, full_name text, observed_at text);
`;

/** Identificadores del mundo de prueba. Códigos y nombres ficticios (RS-23). */
const SEC_A = 10; // sección propia: titular T_TITULAR, JP T_JP
const SEC_B = 20; // sección ajena: titular T_AJENO
const T_TITULAR = 1, T_JP = 2, T_AJENO = 3;
const U_ANA = 100, U_BRUNO = 101, U_CARLA = 102;
const E_ANA = 1000, E_BRUNO = 1001;
const COD_BRUNO = "20200002";
const COD_FANTASMA = "20239999"; // nadie con cuenta tiene este código

/** Mundo mínimo pero completo: dos secciones, dos alumnos en la propia y uno
 *  en la ajena, tres docentes. Cada prueba agrega encima sus claims. */
const sembrar = () => {
  bd = new Database(":memory:");
  bd.run(DDL);

  const usuario = (id: number, code: string, nombre: string) =>
    bd.run(
      `insert into app_user (id, code, full_name, institutional_email, token_version, networking_opt_in)
       values (?, ?, ?, ?, 1, 0)`,
      [id, code, nombre, `u${id}@aloe.ulima.edu.pe`],
    );

  usuario(U_ANA, "20200001", "CASTRO VEGA ANA LUCIA");
  usuario(U_BRUNO, COD_BRUNO, "QUISPE ROJAS BRUNO");
  usuario(U_CARLA, "20200003", "SALAZAR PINTO CARLA");
  usuario(200, "D001", "GARCIA LOPEZ ROSA MARIA");
  usuario(201, "D002", "TORRES DIAZ LUIS ALBERTO");
  usuario(202, "D003", "MENDOZA SOLIS ELENA");

  for (const [id, user] of [[U_ANA, U_ANA], [U_BRUNO, U_BRUNO], [U_CARLA, U_CARLA]] as const) {
    bd.run(`insert into student (id, user_id, career_id) values (?, ?, 5)`, [id, user]);
  }

  bd.run(`insert into teacher (id, teacher_code, full_name, user_id) values (?,?,?,?)`,
    [T_TITULAR, "T001", "GARCIA LOPEZ ROSA MARIA", 200]);
  bd.run(`insert into teacher (id, teacher_code, full_name, user_id) values (?,?,?,?)`,
    [T_JP, "T002", "TORRES DIAZ LUIS ALBERTO", 201]);
  bd.run(`insert into teacher (id, teacher_code, full_name, user_id) values (?,?,?,?)`,
    [T_AJENO, "T003", "MENDOZA SOLIS ELENA", 202]);

  bd.run(`insert into section (id, course_offering_id, teacher_id, code, jp_id) values (?,1,?,?,?)`,
    [SEC_A, T_TITULAR, "952", T_JP]);
  bd.run(`insert into section (id, course_offering_id, teacher_id, code, jp_id) values (?,1,?,?,null)`,
    [SEC_B, T_AJENO, "958"]);

  bd.run(`insert into enrollment (id, student_id, section_id) values (?,?,?)`, [E_ANA, U_ANA, SEC_A]);
  bd.run(`insert into enrollment (id, student_id, section_id) values (?,?,?)`, [E_BRUNO, U_BRUNO, SEC_A]);
  bd.run(`insert into enrollment (id, student_id, section_id) values (1002,?,?)`, [U_CARLA, SEC_B]);
};

const claim = (sectionId: number, position: string, code: string, nombre: string) =>
  bd.run(
    `insert into section_representative_claim (section_id, position, student_code, full_name, observed_at)
     values (?,?,?,?, '2026-09-04T12:00:00Z')`,
    [sectionId, position, code, nombre],
  );

const representanteReal = (sectionId: number, enrollmentId: number, position: string, activo = true) =>
  bd.run(
    `insert into section_representative (section_id, enrollment_id, position, is_active) values (?,?,?,?)`,
    [sectionId, enrollmentId, position, activo ? 1 : 0],
  );

const tokenAlumno = (userId: number, studentId: number, role = "student") =>
  jwt.sign({ sub: String(userId), studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = (userId: number, teacherId: number) =>
  jwt.sign({ sub: String(userId), teacherId, role: "teacher", tokenVersion: 1 }, config.auth.jwtSecret);

const contactos = (sectionId: number, token: string) =>
  app.request(`/course-detail/sections/${sectionId}/contacts`, {
    headers: { Authorization: `Bearer ${token}` },
  });

type Cuerpo = {
  docente: unknown;
  jefePractica: unknown;
  alumnos: Array<{ user: { code: string }; roleInSection: string }>;
  representantesPendientes: Array<{
    code: string; firstName: string; lastName: string; position: string; contactable: boolean;
  }>;
};

beforeEach(sembrar);

describe("RS-20 precondición: guarda de pertenencia", () => {
  test("el alumno matriculado en la sección sí puede leer sus contactos", async () => {
    // El caso feliz existe para que el 403 de abajo signifique algo: si la
    // guarda rechazara a todo el mundo, la prueba de acceso denegado pasaría
    // igual y no probaría nada.
    const res = await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA));
    expect(res.status).toBe(200);
    const body = await res.json() as Cuerpo;
    expect(body.alumnos.map((a) => a.user.code).sort()).toEqual(["20200001", COD_BRUNO]);
  });

  test("un alumno de OTRA sección recibe 403 SECTION_FORBIDDEN", async () => {
    // El invariante que más importa de toda la feature. Antes de la guarda la
    // ruta solo exigía JWT + rol, sin ningún predicado sobre QUIÉN pregunta:
    // cualquiera podía iterar `sectionId` y leerse la nómina de cualquier
    // sección. Con los claims encima, eso sería un padrón consultable de los
    // delegados de toda la universidad.
    const res = await contactos(SEC_A, tokenAlumno(U_CARLA, U_CARLA));
    expect(res.status).toBe(403);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("SECTION_FORBIDDEN");
  });

  test("matricular a esa misma alumna la deja pasar: la guarda depende de eso y de nada más", async () => {
    // Contraprueba del test anterior. Un 403 puede salir por el motivo
    // equivocado (rol, ruta mal escrita, token inválido) y la prueba pasaría
    // igual. Acá cambia UN dato —la fila de `enrollment`— y con el mismo token
    // y la misma URL la respuesta pasa a 200: queda demostrado que lo que
    // decide es la matrícula.
    bd.run(`insert into enrollment (id, student_id, section_id) values (1005, ?, ?)`, [U_CARLA, SEC_A]);
    const res = await contactos(SEC_A, tokenAlumno(U_CARLA, U_CARLA));
    expect(res.status).toBe(200);
  });

  test("el 403 no filtra ni un solo dato de la sección ajena", async () => {
    // Rechazar con el cuerpo lleno sería igual de grave que responder 200: lo
    // que se protege es el dato, no el código de estado.
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");
    const texto = await (await contactos(SEC_A, tokenAlumno(U_CARLA, U_CARLA))).text();
    expect(texto).not.toContain(COD_FANTASMA);
    expect(texto).not.toContain("PEREZ");
    expect(texto).not.toContain("alumnos");
    expect(texto).not.toContain("representantesPendientes");
  });

  test("una sección que no existe también responde 403, no 404", async () => {
    // Distinguir "no existe" de "no perteneces" convertiría la guarda en un
    // oráculo de qué ids de sección están ocupados. Además el handler no
    // consulta la existencia por separado: la misma consulta resuelve ambas
    // cosas, así que iterar ids no dice nada.
    const res = await contactos(999, tokenAlumno(U_ANA, U_ANA));
    expect(res.status).toBe(403);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("SECTION_FORBIDDEN");
  });

  test("el docente titular de la sección puede leerla", async () => {
    // Un token de docente no trae `studentId`: la guarda tiene que reconocerlo
    // por `section.teacher_id` y no caer en el centinela.
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");
    const res = await contactos(SEC_A, tokenDocente(200, T_TITULAR));
    expect(res.status).toBe(200);
    // Y ve la sección entera, pendientes incluidos: saber a quién nombró la
    // sección como delegado es justamente lo que el docente necesita.
    const body = await res.json() as Cuerpo;
    expect(body.alumnos).toHaveLength(2);
    expect(body.representantesPendientes.map((r) => r.code)).toEqual([COD_FANTASMA]);
  });

  test("el jefe de práctica de la sección también puede leerla", async () => {
    // HU18: el JP cuelga de `section.jp_id`, una columna distinta del titular.
    // Sin esa rama, el JP quedaría fuera de la pestaña de contactos de su
    // propia sección.
    const res = await contactos(SEC_A, tokenDocente(201, T_JP));
    expect(res.status).toBe(200);
  });

  test("un docente de OTRA sección recibe 403 SECTION_FORBIDDEN", async () => {
    // Ser docente no es un pase libre: la pertenencia se evalúa contra ESTA
    // sección. `T_AJENO` es titular de SEC_B y no tiene nada que ver con SEC_A.
    const res = await contactos(SEC_A, tokenDocente(202, T_AJENO));
    expect(res.status).toBe(403);
    expect((await res.json() as { error: { code: string } }).error.code).toBe("SECTION_FORBIDDEN");
  });

  test("un alumno cuyo student.id coincide con el teacher.id del titular NO entra", async () => {
    // `student.id` y `teacher.id` son secuencias independientes: que existan un
    // alumno 1 y un docente 1 no es rebuscado, es lo normal. La guarda compara
    // `sec.teacher_id` contra `teacherId` (ausente en un token de alumno, de
    // ahí el centinela 0) y jamás contra `studentId`. Si las cruzara, el alumno
    // con el id del titular leería la sección sin estar matriculado.
    bd.run(`insert into app_user (id, code, full_name, institutional_email, token_version, networking_opt_in)
            values (103, '20200004', 'DIEGO RIOS PAREDES', 'u103@aloe.ulima.edu.pe', 1, 0)`);
    bd.run(`insert into student (id, user_id, career_id) values (?, 103, 5)`, [T_TITULAR]);
    bd.run(`insert into enrollment (id, student_id, section_id) values (1004, ?, ?)`, [T_TITULAR, SEC_B]);

    const res = await contactos(SEC_A, tokenAlumno(103, T_TITULAR));
    expect(res.status).toBe(403);
  });

  test("un docente cuyo teacher.id coincide con el student.id de un matriculado NO entra", async () => {
    // El cruce simétrico: `e.student_id` se compara contra `studentId`, ausente
    // en un token de docente. Ana está matriculada en SEC_A con student.id 100;
    // un docente ajeno con teacher.id 100 no puede heredar su matrícula.
    bd.run(`insert into teacher (id, teacher_code, full_name, user_id) values (?, 'T004', 'VARGAS LEON PEDRO', 202)`,
      [U_ANA]);
    const res = await contactos(SEC_A, tokenDocente(202, U_ANA));
    expect(res.status).toBe(403);
  });
});

describe("RS-20 caso (1): hay representante REAL activo", () => {
  test("con section_representative activo el claim de ese cargo NO se emite", async () => {
    // La tabla de permisos manda sobre lo que dice el portal: si ya hay
    // delegado de verdad, el claim es información vieja y emitirla mostraría
    // dos delegados para la misma sección.
    representanteReal(SEC_A, E_ANA, "delegate");
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes).toEqual([]);
    expect(body.alumnos.find((a) => a.user.code === "20200001")?.roleInSection).toBe("delegado");
  });

  test("la resolución es POR CARGO: un delegado real no tapa el claim de subdelegado", async () => {
    // RS-20 dice "por cargo". Si el `not exists` no comparara `position`, la
    // sola existencia de un delegado real borraría también al subdelegado
    // pendiente y la app dejaría de mostrarlo.
    representanteReal(SEC_A, E_ANA, "delegate");
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");
    claim(SEC_A, "subdelegate", "20239998", "FLORES SOTO MARIA ELENA");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes.map((r) => r.position)).toEqual(["subdelegate"]);
  });

  test("un representante DESACTIVADO no tapa el claim: solo el activo manda", async () => {
    // `is_active = false` es como se revoca un cargo (RS-15 prohíbe borrar la
    // fila porque los anuncios la referencian). Si el `not exists` no filtrara
    // por `is_active`, una sección que reasignó delegado se quedaría sin
    // mostrar al nuevo para siempre.
    representanteReal(SEC_A, E_ANA, "delegate", false);
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes.map((r) => r.code)).toEqual([COD_FANTASMA]);
  });

  test("un representante activo de OTRA sección no tapa el claim de esta", async () => {
    // El `not exists` empata por `sr.section_id = c.section_id`. Sin esa
    // igualdad, cualquier delegado de cualquier sección silenciaría los claims
    // de todas las demás.
    bd.run(`insert into enrollment (id, student_id, section_id) values (1003,?,?)`, [U_ANA, SEC_B]);
    representanteReal(SEC_B, 1003, "delegate");
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes.map((r) => r.code)).toEqual([COD_FANTASMA]);
  });
});

describe("RS-20 caso (2): la persona del claim ya tiene cuenta y matrícula", () => {
  test("REGRESIÓN: el claim se emite igual, porque tener cuenta no da el badge", async () => {
    // Producción, 2026-09-04. Este endpoint filtraba los claims de quien ya
    // estuviera matriculado con cuenta, dando por hecho que su `roleInSection`
    // traería el cargo. No lo trae: `roleInSection` sale de
    // `section_representative`, que SOLO se escribe cuando esa persona importa
    // desde miUlima. Un compañero con cuenta sembrada que nunca sincronizó se
    // pintaba como un alumno más y el delegado quedaba invisible, con el portal
    // desmentido en pantalla.
    //
    // Ahora el backend dice lo que el portal dice y punto; evitar el duplicado
    // es trabajo de la app, que cruza por `code` y le pone el badge a la
    // tarjeta que ya existe en vez de agregar otra.
    claim(SEC_A, "delegate", COD_BRUNO, "QUISPE ROJAS BRUNO");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes.map((r) => r.code)).toEqual([COD_BRUNO]);
    // Y sigue saliendo UNA sola vez en alumnos: el backend no lo duplica.
    expect(body.alumnos.filter((a) => a.user.code === COD_BRUNO)).toHaveLength(1);
  });

  test("si esa persona SÍ tiene representante activo, el claim no se emite", async () => {
    // Acá manda la tabla de permisos: `roleInSection` ya trae el cargo y el
    // claim sobra. Es la única supresión que queda.
    claim(SEC_A, "delegate", COD_BRUNO, "QUISPE ROJAS BRUNO");
    representanteReal(SEC_A, E_BRUNO, "delegate");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes).toEqual([]);
  });

  test("la comparación es por matrícula EN ESTA sección, no por tener cuenta", async () => {
    // Carla tiene cuenta pero está matriculada en SEC_B. Si el `not exists`
    // solo mirara `app_user.code` sin atarlo a `enrollment.section_id`, su
    // claim en SEC_A se silenciaría y la sección no vería a su delegada por
    // ningún lado: ni en `alumnos[]` (no está matriculada) ni en pendientes.
    claim(SEC_A, "delegate", "20200003", "SALAZAR PINTO CARLA");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes.map((r) => r.code)).toEqual(["20200003"]);
    expect(body.alumnos.map((a) => a.user.code)).not.toContain("20200003");
  });
});

describe("RS-20 caso (3): nadie con ese código está matriculado", () => {
  test("se emite la entrada con contactable:false y el nombre partido", async () => {
    // RQ-2: el alumno ve a su delegada aunque ella no use ULima++. La marca es
    // `contactable: false` y habla de una CAPACIDAD (la app no debe ofrecer
    // chatear con quien no existe), no de la persona.
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes).toEqual([{
      code: COD_FANTASMA,
      firstName: "JUAN CARLOS",
      lastName: "PEREZ RAMIREZ",
      position: "delegate",
      contactable: false,
    }]);
  });

  test("el nombre se parte con el mismo splitName del módulo, no se inventa otro", async () => {
    // El portal entrega "APELLIDOS Y NOMBRES" en una sola cadena. `splitName`
    // toma los DOS primeros tokens como apellidos; un nombre de tres tokens
    // deja un solo nombre de pila. Se fija el comportamiento para que la app
    // no reciba de golpe una partición distinta a la del resto de contactos.
    claim(SEC_A, "subdelegate", "20239998", "FLORES SOTO MARIA");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes[0]).toMatchObject({
      firstName: "MARIA",
      lastName: "FLORES SOTO",
      position: "subdelegate",
    });
  });

  test("los claims de OTRA sección no se mezclan con los de esta", async () => {
    // El filtro `c.section_id = :sectionId` es lo único que impide que la
    // pestaña de contactos liste a los delegados del resto de la universidad.
    claim(SEC_B, "delegate", "20239997", "RAMOS VILA JORGE LUIS");
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes.map((r) => r.code)).toEqual([COD_FANTASMA]);
  });

  test("sin claims la clave existe igual, como arreglo vacío", async () => {
    // La app no debe tener que distinguir entre "sin delegados pendientes" y
    // "campo ausente": el contrato dice arreglo siempre.
    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.representantesPendientes).toEqual([]);
  });
});

describe("RS-19: un claim no otorga permisos ni contamina alumnos[]", () => {
  test("representantesPendientes es clave HERMANA de alumnos, nunca un elemento adentro", async () => {
    // Los elementos de `alumnos[]` exigen `email`, `career_id` y
    // `setupComplete`, que un claim no tiene y que no se pueden inventar sin
    // fabricar una cuenta (RQ-4). Meterlo adentro rompería al cliente.
    claim(SEC_A, "delegate", COD_FANTASMA, "PEREZ RAMIREZ JUAN CARLOS");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(Object.keys(body)).toContain("representantesPendientes");
    expect(body.alumnos).toHaveLength(2);
    expect(body.alumnos.some((a) => "contactable" in a)).toBe(false);
    expect(body.alumnos.map((a) => a.user.code)).not.toContain(COD_FANTASMA);
  });

  test("el claim no marca a nadie como delegado en alumnos[]: el rol sale de section_representative", async () => {
    // RS-19: solo `section_representative` autoriza. Mientras el delegado no
    // tenga cuenta, su sección no tiene quién publique anuncios, y eso es
    // correcto. Bruno figura en el claim pero no tiene fila de representante:
    // su `roleInSection` tiene que seguir siendo "estudiante".
    claim(SEC_A, "delegate", COD_BRUNO, "QUISPE ROJAS BRUNO");

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.alumnos.map((a) => a.roleInSection)).toEqual(["estudiante", "estudiante"]);
  });

  test("un representante DESACTIVADO tampoco etiqueta: el rol rancio no otorga nada", async () => {
    // RS-18: al alumno desactivado se le deja el rol rancio en el token hasta
    // el próximo login porque no otorga nada, y `requireRepresentative`
    // revalida sección por sección. La pestaña de contactos tiene que contar la
    // misma historia: el join de `alumnos[]` filtra por `sr.is_active = true`,
    // así que un ex delegado vuelve a figurar como "estudiante".
    representanteReal(SEC_A, E_ANA, "delegate", false);

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.alumnos.find((a) => a.user.code === "20200001")?.roleInSection).toBe("estudiante");
  });

  test("varios enlaces sociales no duplican al alumno en alumnos[]", async () => {
    // El `left join user_social_link` multiplica filas: un alumno con dos redes
    // vuelve dos veces del SQL. El agrupado por `enrollment_id` es lo que evita
    // que aparezca dos veces, el mismo invariante que RS-20 exige del claim,
    // solo que por otro camino.
    bd.run(`insert into user_social_link (user_id, platform, url, label)
            values (?, 'linkedin', 'https://example.test/a', null)`, [U_ANA]);
    bd.run(`insert into user_social_link (user_id, platform, url, label)
            values (?, 'github', 'https://example.test/b', null)`, [U_ANA]);

    const body = await (await contactos(SEC_A, tokenAlumno(U_ANA, U_ANA))).json() as Cuerpo;
    expect(body.alumnos).toHaveLength(2);
    expect(body.alumnos.filter((a) => a.user.code === "20200001")).toHaveLength(1);
  });
});
