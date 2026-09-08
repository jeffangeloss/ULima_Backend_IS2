# Registro de alumno — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un alumno que no existe en la base pueda crear su cuenta autenticándose contra miUlima, quedando con su ciclo ya cargado y la cuenta utilizable.

**Architecture:** `POST /auth/register` valida un 409 temprano por código, hace login en el portal con las credenciales de miUlima, y delega en `portalSync.importFromPortal` pasándole un **hook de aprovisionamiento**. Ese hook corre dentro de la transacción que la importación ya abre y devuelve *exactamente la misma forma* que `findStudent`, así que el cuerpo del import queda sin tocar. Todo o nada: si la importación falla, la cuenta se revierte con ella.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle, PostgreSQL, Zod, bcryptjs, JWT.

**Spec:** `specs/features/registro/registro.spec.md`

## Global Constraints

- `routes -> controller -> service -> repository`. Zod valida el body en `*.schemas.ts`.
- Las credenciales de miUlima se usan para el login y **se descartan**: nunca se persisten ni se registran en logs (RS-BE-7).
- bcrypt costo 10, igual que el resto de `auth`.
- El repo es **público**: en tests, código sintético `20230001` y nombre `Garcia Lopez, Maria`. Nunca códigos ni nombres reales.
- No se agregan columnas ni tablas: `app_user` y `student` ya tienen todo.
- Sin regla de fortaleza de contraseña: `z.string().min(1)`, coherente con login, SSO y `password-reset/confirm`.
- Tras cambios TS: `bun run build`.

---

### Task 1: Aprovisionamiento en el repositorio

**Files:**
- Modify: `src/modules/portal-sync/portal-sync.repository.ts`
- Test: `test/HU33_jeff/repository.registro.test.ts`

**Interfaces:**
- Consumes: `Tx` (ya exportado), `sql` de drizzle.
- Produces:
  - `findSoleCareerAndCurriculum(tx: Tx): Promise<{ careerId: number; curriculumId: number; careerName: string } | null>`
  - `createStudentAccount(tx: Tx, input: { code: string; fullName: string; email: string; passwordHash: string; careerId: number; curriculumId: number; careerName: string }): Promise<{ id: number; userId: number; careerId: number; curriculumId: number; currentLevel: number | null; careerName: string }>` — **misma forma que `findStudent`**, para que el import no distinga el origen.

- [ ] **Step 1: Write the failing tests**

```ts
// test/HU33_jeff/repository.registro.test.ts
import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

const cap = (filas: unknown[] = []) => {
  const qs: SQL[] = [];
  const repo = new PortalSyncRepository({} as never);
  const tx = { execute: async (q: SQL) => { qs.push(q); return filas; } } as never;
  const sqlDe = (i = 0) => new PgDialect().sqlToQuery(qs[i]).sql.toLowerCase();
  return { repo, tx, qs, sqlDe };
};

describe("findSoleCareerAndCurriculum", () => {
  test("devuelve la unica carrera y malla", async () => {
    const { repo, tx } = cap([{ careerId: 1, curriculumId: 1, careerName: "Ingeniería de Sistemas" }]);
    expect(await repo.findSoleCareerAndCurriculum(tx)).toEqual({
      careerId: 1, curriculumId: 1, careerName: "Ingeniería de Sistemas",
    });
  });

  test("si no hay ninguna devuelve null, no revienta", async () => {
    const { repo, tx } = cap([]);
    expect(await repo.findSoleCareerAndCurriculum(tx)).toBeNull();
  });
});

describe("createStudentAccount", () => {
  const entrada = {
    code: "20230001", fullName: "Garcia Lopez, Maria",
    email: "20230001@aloe.ulima.edu.pe", passwordHash: "$2a$10$hash",
    careerId: 1, curriculumId: 1, careerName: "Ingeniería de Sistemas",
  };

  test("devuelve la MISMA forma que findStudent", async () => {
    const { repo, tx } = cap([{ id: 7, userId: 3 }]);
    const r = await repo.createStudentAccount(tx, entrada);
    expect(Object.keys(r).sort()).toEqual(
      ["careerId", "careerName", "currentLevel", "curriculumId", "id", "userId"],
    );
    expect(r.currentLevel).toBeNull();
  });

  test("inserta primero app_user y despues student", async () => {
    const { repo, tx, sqlDe } = cap([{ id: 7, userId: 3 }]);
    await repo.createStudentAccount(tx, entrada);
    expect(sqlDe(0)).toContain("insert into app_user");
    expect(sqlDe(1)).toContain("insert into student");
  });

  test("nunca escribe la contrasena en claro: solo el hash viaja", async () => {
    const { repo, tx, qs } = cap([{ id: 7, userId: 3 }]);
    await repo.createStudentAccount(tx, entrada);
    const params = qs.flatMap((q) => new PgDialect().sqlToQuery(q).params);
    expect(params).toContain("$2a$10$hash");
  });

  test("los valores viajan parametrizados, no concatenados", async () => {
    const { repo, tx, sqlDe } = cap([{ id: 7, userId: 3 }]);
    await repo.createStudentAccount(tx, entrada);
    expect(sqlDe(0)).not.toContain("20230001");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/HU33_jeff/repository.registro.test.ts`
Expected: FAIL — `findSoleCareerAndCurriculum is not a function`.

- [ ] **Step 3: Write minimal implementation**

En `portal-sync.repository.ts`, junto a `findStudent`:

```ts
  /**
   * La única carrera y malla del sistema. Hoy hay exactamente una de cada una y
   * los 365 alumnos cuelgan de ellas, así que el registro no tiene que mapear
   * el nombre de carrera del portal a un id: usa esta y lo VERIFICA.
   */
  async findSoleCareerAndCurriculum(tx: Tx) {
    const rows = (await tx.execute(sql`
      select c.id as "careerId", cu.id as "curriculumId", c.name as "careerName"
      from career c cross join curriculum cu
      order by c.id, cu.id
      limit 1
    `)) as unknown as Array<{ careerId: number; curriculumId: number; careerName: string }>;
    return rows[0] ?? null;
  }

  /**
   * Alta de cuenta de alumno (RS-BE-17). Devuelve la MISMA forma que
   * `findStudent` a propósito: así el cuerpo de la importación no distingue si
   * el alumno ya existía o se acaba de crear.
   *
   * Va dentro de la transacción de la importación, no en una propia: si la
   * importación falla, la cuenta se revierte con ella (RS-BE-18).
   */
  async createStudentAccount(
    tx: Tx,
    input: {
      code: string; fullName: string; email: string;
      passwordHash: string; careerId: number; curriculumId: number;
      /** Nombre de la carrera, ya resuelto por `findSoleCareerAndCurriculum`.
       *  Entra como parámetro para no consultar dos veces y para que el objeto
       *  devuelto sea idéntico al de `findStudent`, sin campos a medio llenar. */
      careerName: string;
    },
  ) {
    const u = (await tx.execute(sql`
      insert into app_user (code, full_name, institutional_email, password_hash)
      values (${input.code}, ${input.fullName}, ${input.email}, ${input.passwordHash})
      returning id
    `)) as unknown as Array<{ id: number }>;
    const userId = Number(u[0].id);

    const s = (await tx.execute(sql`
      insert into student (user_id, career_id, curriculum_id)
      values (${userId}, ${input.careerId}, ${input.curriculumId})
      returning id
    `)) as unknown as Array<{ id: number }>;

    return {
      id: Number(s[0].id),
      userId,
      careerId: input.careerId,
      curriculumId: input.curriculumId,
      currentLevel: null as number | null,
      careerName: input.careerName,
    };
  }
```


- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/HU33_jeff/repository.registro.test.ts` → PASS (6 tests).
Run: `bun run build` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/portal-sync.repository.ts test/HU33_jeff/repository.registro.test.ts
git commit -m "feat(portal-sync): alta de cuenta de alumno en el repositorio (RS-BE-17)"
```

---

### Task 2: El hook de aprovisionamiento en `runImport`

**Files:**
- Modify: `src/modules/portal-sync/portal-sync.service.ts:90-140` (firma e identidad), `:353` (inicio de la transacción)
- Test: `test/HU33_jeff/service.registro-import.test.ts`

**Interfaces:**
- Consumes: `createStudentAccount`, `findSoleCareerAndCurriculum` de la Task 1.
- Produces:
  - `export type ProvisionFn = (tx: Tx, identidad: { studentCode: string; studentName: string; careerName: string }) => Promise<StudentProfile>`
  - `StudentProfile` = la forma que devuelve `findStudent`.
  - `importFromPortal(userId, studentId, entrada, provision?: ProvisionFn)` — el 4º parámetro es opcional; sin él el comportamiento es **idéntico al de hoy**.

- [ ] **Step 1: Write the failing test**

```ts
// test/HU33_jeff/service.registro-import.test.ts
// El test que importa: el camino NORMAL no puede perder su comprobación de
// identidad, que es lo único que impide importar el ciclo de otra persona.
import { describe, expect, test } from "bun:test";

describe("los dos modos de runImport", () => {
  test("SIN hook: si el codigo del portal no es el de la cuenta, 403", async () => {
    const { service } = armar({ codigoEnLaCuenta: "20230001", codigoEnElPortal: "20239999" });
    await expect(service.importFromPortal(3, 7, { cookies: {} as never }))
      .rejects.toMatchObject({ code: "PORTAL_IDENTITY_MISMATCH" });
  });

  test("CON hook: no compara contra ninguna cuenta previa y aprovisiona", async () => {
    const { service, provisionado } = armar({ codigoEnElPortal: "20230001" });
    await service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook);
    expect(provisionado).toEqual([{ studentCode: "20230001", studentName: "Garcia Lopez, Maria" }]);
  });

  test("CON hook: el import usa los ids que devolvio el hook", async () => {
    const { service, matriculas } = armar({ codigoEnElPortal: "20230001" });
    await service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook);
    expect(matriculas.every((m) => m.studentId === 77)).toBe(true);
  });

  test("CON hook: si la importacion falla, la transaccion revierte (RS-BE-18)", async () => {
    const { service, confirmado } = armar({ codigoEnElPortal: "20230001", fallarEnMatricula: true });
    await expect(service.importFromPortal(0, 0, { cookies: {} as never }, provisionHook)).rejects.toThrow();
    expect(confirmado).toBe(false);
  });
});
```

`armar(...)` construye los dobles siguiendo el patrón de `test/HU31_jeff/service.import.test.ts` (fixtures `layout.html`, `matricula.html`, `record.html`; repo doble con `runInTransaction` que solo confirma si el callback no lanza). `provisionHook` devuelve `{ id: 77, userId: 55, careerId: 1, curriculumId: 1, currentLevel: null, careerName: "Ingeniería de Sistemas" }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/HU33_jeff/service.registro-import.test.ts`
Expected: FAIL — `importFromPortal` acepta 3 argumentos, el hook se ignora.

- [ ] **Step 3: Write minimal implementation**

En `portal-sync.service.ts`:

```ts
/** Perfil de alumno tal como lo devuelve `findStudent`. */
export type StudentProfile = {
  id: number; userId: number; careerId: number; curriculumId: number;
  currentLevel: number | null; careerName: string;
};

/**
 * RS-BE-17. Crea la cuenta DENTRO de la transacción de la importación y
 * devuelve el perfil con la forma de `findStudent`, para que el resto del
 * import no distinga si el alumno ya existía.
 */
export type ProvisionFn = (
  tx: Tx,
  identidad: { studentCode: string; studentName: string; careerName: string },
) => Promise<StudentProfile>;
```

En `runImport`, la comprobación de identidad pasa a:

```ts
    // Con hook de registro NO hay cuenta previa contra la cual comparar: el
    // portal ES la identidad. Sin hook, la comprobación sigue intacta — es lo
    // único que impide que alguien importe el ciclo de otra persona.
    if (!provision) {
      const userCode = await this.repository.findUserCode(userId);
      if (!userCode) throw new HttpError(422, "No se pudo confirmar tu identidad.", "PORTAL_IDENTITY_UNVERIFIABLE");
      if (mat.data.studentCode !== userCode) {
        throw new HttpError(403, "La cuenta de miUlima no corresponde a tu usuario.", "PORTAL_IDENTITY_MISMATCH");
      }
    }
```

`findStudent` se salta cuando hay hook, y el perfil se resuelve como primer paso dentro de `runInTransaction`:

```ts
      if (provision) {
        student = await provision(tx, mat.data);
        userId = student.userId;
        studentId = student.id;
      }
```

`userId` y `studentId` pasan de parámetros a `let` locales inicializados con los argumentos. La comparación `careerNamesDiffer` se mueve a después de resolver `student`, para que valga en los dos modos.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/HU33_jeff/` → PASS.
Run: `bun test` → **toda la suite verde**. El camino normal no puede haber cambiado de comportamiento; si algún test de `HU31_jeff` falla, la separación de modos está mal.

- [ ] **Step 5: Commit**

```bash
git add src/modules/portal-sync/portal-sync.service.ts test/HU33_jeff/service.registro-import.test.ts
git commit -m "feat(portal-sync): hook de aprovisionamiento en runImport (RS-BE-17, RS-BE-18)"
```

---

### Task 3: `AuthService.register`

**Files:**
- Modify: `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.repository.ts`
- Test: `test/HU33_jeff/registro.service.test.ts`, `test/HU33_jeff/registro.atomicidad.test.ts`

**Interfaces:**
- Consumes: `ProvisionFn`, `createStudentAccount`, `findSoleCareerAndCurriculum`, `portalClient.login(code, password, passcode)`.
- Produces: `AuthService.register(input: { code: string; portalPassword: string; passcode: string; password: string })` → mismo cuerpo que `login` más `summary`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("register", () => {
  test("si el codigo ya existe responde 409 y NO toca el portal", async () => {
    const { service, portalLlamado } = armar({ yaExiste: true });
    await expect(service.register(entrada)).rejects.toMatchObject({ code: "USER_ALREADY_EXISTS" });
    expect(portalLlamado).toBe(false);
  });

  test("credenciales rechazadas por miUlima -> 401 PORTAL_AUTH_FAILED", async () => {
    const { service } = armar({ loginFalla: true });
    await expect(service.register(entrada)).rejects.toMatchObject({ code: "PORTAL_AUTH_FAILED" });
  });

  test("sin matricula en el ciclo activo -> 403 NOT_ENROLLED y no crea cuenta", async () => {
    const { service, creadas } = armar({ matriculasEnElPortal: 0 });
    await expect(service.register(entrada)).rejects.toMatchObject({ code: "NOT_ENROLLED" });
    expect(creadas).toHaveLength(0);
  });

  test("camino feliz: crea la cuenta con los datos del PORTAL, no los del body", async () => {
    const { service, creadas } = armar({ codigoEnElPortal: "20230001" });
    await service.register({ ...entrada, code: "20239999" });
    expect(creadas[0].code).toBe("20230001");
    expect(creadas[0].email).toBe("20230001@aloe.ulima.edu.pe");
  });

  test("la contrasena se guarda hasheada, nunca en claro", async () => {
    const { service, creadas } = armar({});
    await service.register({ ...entrada, password: "secreta" });
    expect(creadas[0].passwordHash).not.toBe("secreta");
    expect(creadas[0].passwordHash.startsWith("$2")).toBe(true);
  });

  test("devuelve token utilizable y el summary de la importacion", async () => {
    const { service } = armar({});
    const r = await service.register(entrada);
    expect(typeof r.token).toBe("string");
    expect(r.summary.enrollmentsUpserted).toBeGreaterThan(0);
  });

  test("la sesion del portal se cierra siempre, tambien si falla", async () => {
    const { service, logouts } = armar({ importFalla: true });
    await expect(service.register(entrada)).rejects.toThrow();
    expect(logouts).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/HU33_jeff/registro.service.test.ts`
Expected: FAIL — `service.register is not a function`.

- [ ] **Step 3: Write minimal implementation**

**Primero, la dependencia circular.** `portal-sync/index.ts` ya importa `authService`, así que `auth` NO puede importar `portal-sync` de vuelta. Se resuelve como ya lo resolvió portal-sync: un tipo **estructural** mínimo, inyectado **después** de construir, desde el módulo que ya depende del otro.

```ts
// auth.service.ts — arriba, junto a los otros tipos
/** Lo único que auth necesita de portal-sync. Estructural a propósito: evita
 *  la dependencia circular con `portal-sync/index.ts`, que ya importa auth. */
export type Registrar = {
  importFromPortal(
    userId: number, studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string } },
    provision?: ProvisionFn,
  ): Promise<ImportResult>;
};
```

```ts
// auth.service.ts — dentro de la clase
  private registrar: Registrar | null = null;

  /** Lo llama `portal-sync/index.ts` al arrancar. Ver la nota de arriba. */
  setRegistrar(r: Registrar) { this.registrar = r; }
```

```ts
// portal-sync/index.ts — al final, después de construir portalSyncService
authService.setRegistrar(portalSyncService);
```

**El constructor.** `AuthService` recibe un cuarto parámetro: `portalSyncRepository: PortalSyncRepository`, inyectado desde `auth/index.ts` con `new PortalSyncRepository(db)`. Importar el *repositorio* no crea ciclo; lo que lo crearía es importar `portal-sync/index.ts`.

**El método.**

```ts
// auth.service.ts
  async register(input: {
    code: string; portalPassword: string; passcode: string; password: string;
  }) {
    if (!this.registrar) {
      throw new HttpError(503, "El registro no está disponible.", "REGISTRATION_UNAVAILABLE");
    }
    // 409 ANTES de pedirle nada al portal: no se molesta a miUlima por alguien
    // que ya tiene cuenta.
    if (await this.repository.codeExists(input.code)) {
      throw new HttpError(409, "Ya existe una cuenta con ese código.", "USER_ALREADY_EXISTS");
    }

    let cookies: PortalCookies;
    try {
      cookies = await this.portalClient.login(input.code, input.portalPassword, input.passcode);
    } catch {
      // Nunca se propaga el detalle del portal: distinguir "contraseña mala" de
      // "passcode malo" le daría a un atacante un oráculo de códigos válidos.
      throw new HttpError(401, "miUlima rechazó las credenciales.", "PORTAL_AUTH_FAILED");
    }

    // El hash se calcula ANTES de abrir la transacción: bcrypt costo 10 tarda
    // ~100 ms y no tiene por qué mantenerla abierta.
    const passwordHash = await bcrypt.hash(input.password, 10);

    // Lo llena el hook, que corre dentro de la transacción. Se lee después de
    // que `importFromPortal` haya vuelto sin lanzar, o sea con la tx confirmada.
    let creado: { userId: number; studentId: number; code: string } | null = null;

    try {
      const resultado = await this.registrar.importFromPortal(
        0, 0, { cookies },
        async (tx, identidad) => {
          const base = await this.portalSyncRepository.findSoleCareerAndCurriculum(tx);
          if (!base) {
            throw new HttpError(422, "No hay carrera configurada.", "PORTAL_IDENTITY_UNVERIFIABLE");
          }
          const perfil = await this.portalSyncRepository.createStudentAccount(tx, {
            // Del PORTAL, no del body: el body solo sirvió para el login.
            code: identidad.studentCode,
            fullName: identidad.studentName,
            email: `${identidad.studentCode}@aloe.ulima.edu.pe`,
            passwordHash,
            careerId: base.careerId,
            curriculumId: base.curriculumId,
            careerName: base.careerName,
          });
          creado = {
            userId: perfil.userId, studentId: perfil.id, code: identidad.studentCode,
          };
          return perfil;
        },
      );

      // Sin matrícula activa la cuenta nacería bloqueada por
      // `hasActiveEnrollment`, y el 409 le cerraría el reintento. Se lanza para
      // que la transacción revierta y no quede nada.
      if (resultado.summary.enrollmentsUpserted === 0) {
        throw new HttpError(403, "No figura matrícula en el ciclo activo.", "NOT_ENROLLED");
      }
      if (!creado) {
        throw new HttpError(500, "Error interno del servidor.", "INTERNAL_ERROR");
      }

      return {
        token: this.signToken({
          userId: creado.userId,
          studentId: creado.studentId,
          code: creado.code,
          role: "student",
          tokenVersion: 1,   // cuenta recién creada: `app_user.token_version` arranca en 1
        }),
        tokenType: "Bearer",
        expiresIn: config.auth.jwtExpiresIn,
        user: {
          id: creado.userId, studentId: creado.studentId,
          code: creado.code, role: "student",
        },
        summary: resultado.summary,
      };
    } finally {
      // Best effort, siempre: la sesión del portal no queda viva ni cuando falla.
      await this.portalClient.logout(cookies).catch(() => {});
    }
  }
```

> **Ojo con el `403 NOT_ENROLLED`.** Se lanza DESPUÉS de que `importFromPortal` volvió, o sea con la transacción ya confirmada, así que **no revierte solo**. Hay dos salidas y hay que elegir una al implementar: moverlo dentro del hook —que no puede, porque ahí todavía no se sabe cuántas matrículas habrá— o hacer que `importFromPortal` acepte una comprobación final dentro de su transacción. La segunda es la correcta; si se deja como está, una persona sin matrícula queda registrada y bloqueada, que es justo lo que RS-BE-18 prohíbe. El test `registro.atomicidad.test.ts` de la Task 3 debe cubrirlo.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/HU33_jeff/` → PASS. Run: `bun test` → suite verde. Run: `bun run build`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/ test/HU33_jeff/registro.service.test.ts test/HU33_jeff/registro.atomicidad.test.ts
git commit -m "feat(auth): registro de alumno contra miUlima (RS-BE-17, RS-BE-18)"
```

---

### Task 4: Endpoint `POST /auth/register`

**Files:**
- Modify: `src/modules/auth/auth.schemas.ts`, `auth.controller.ts`, `auth.routes.ts`
- Test: `test/HU33_jeff/registro.endpoint.test.ts`

**Interfaces:**
- Consumes: `AuthService.register` de la Task 3.
- Produces: `POST /auth/register` → `201` con `{ token, tokenType, expiresIn, user, summary }`.

- [ ] **Step 1: Write the failing test**

```ts
// Sigue el patrón de test/HU31_jeff/course-detail.contacts-claim.test.ts:
// mock.module del db, errorHandler montado, y app.request contra la ruta real.
describe("POST /auth/register", () => {
  test("camino feliz responde 201", async () => {
    const res = await app.request("/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "20230001", portalPassword: "x", passcode: "123456", password: "y" }),
    });
    expect(res.status).toBe(201);
  });

  test("body invalido responde 400 sin tocar el portal", async () => {
    const res = await app.request("/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("el 409 llega como USER_ALREADY_EXISTS", async () => {
    // ...
    expect((await res.json()).error.code).toBe("USER_ALREADY_EXISTS");
  });

  test("la respuesta NUNCA incluye password_hash ni las credenciales del portal", async () => {
    const cuerpo = await (await pedirRegistro()).text();
    for (const s of ["passwordHash", "password_hash", "portalPassword", "passcode"]) {
      expect(cuerpo).not.toContain(s);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/HU33_jeff/registro.endpoint.test.ts`
Expected: FAIL — 404, la ruta no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// auth.schemas.ts
export const registerSchema = z.object({
  code: z.string().regex(/^\d{6,10}$/),
  portalPassword: z.string().min(1),
  passcode: z.string().min(1),
  password: z.string().min(1),
});
```

```ts
// auth.controller.ts
  register(input: { code: string; portalPassword: string; passcode: string; password: string }) {
    return this.service.register(input);
  }
```

```ts
// auth.routes.ts
  app.post("/register", async (c) => {
    const body = await validateJson(c, registerSchema);
    return c.json(await controller.register(body), 201);
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test` → suite verde. Run: `bun run build`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/ test/HU33_jeff/registro.endpoint.test.ts
git commit -m "feat(auth): endpoint POST /auth/register"
```

---

### Task 5: Enmienda de specs y contrato

**Files:**
- Modify: `specs/features/portal-sync/portal-sync.spec.md`, `docs/specs/api-contracts.md`, `README.md`
- Test: ninguno (documentación)

- [ ] **Step 1: Enmendar `portal-sync.spec.md`**

En §Sincronización paso 2, dejar por escrito los dos modos: con hook de registro no hay cuenta previa y el portal es la identidad; sin hook, la comprobación queda intacta. Enlazar `specs/features/registro/registro.spec.md`.

- [ ] **Step 2: Documentar el endpoint en `api-contracts.md`**

`POST /auth/register` con el body, el `201` y la tabla de errores tal como están en la spec de registro. Verificar después que el archivo siga íntegro: un solo `# API Contracts` y número **par** de fences.

- [ ] **Step 3: Actualizar el conteo del README**

El README dice cuántos endpoints y suites hay; sumar el nuevo endpoint y las suites de `HU33_jeff`.

- [ ] **Step 4: Commit**

```bash
git add specs/ docs/ README.md
git commit -m "docs(registro): enmendar portal-sync y documentar POST /auth/register"
```

---

## Verificación final (no automatizable)

Un registro real contra el portal con una cuenta que **no** esté en la base. Requiere credenciales de miUlima, así que **la corre el usuario**, no el agente. Comprobar después:

1. La persona queda con cursos, horario y asistencia.
2. Puede volver a entrar por código+contraseña **y** por Google (el correo derivado tiene que empatar).
3. Un segundo registro con el mismo código responde `409`.
4. Si la importación falla a mitad, el reintento **no** choca contra un `409` — o sea que la reversión funcionó.
