import { describe, expect, test } from "bun:test";
import { join } from "node:path";

/**
 * RF-EST-2, RF-EST-3, RF-EST-5, RF-EST-6, RF-IRM-2 y RF-IRM-4 sobre la app completa, con el
 * cableado real de `env.ts` a `src/server.ts`. Cada valor de `MODO_ESTATICO` corre en un proceso
 * propio (`arranque-sonda.ts`), porque la variable se lee una sola vez al importar la
 * configuración. El entorno del proceso hijo es mínimo y falso, nunca hereda el del que lo lanza
 * ni lee un `.env` de producción. Su `DATABASE_URL` no sirve, así que la consulta del lector del
 * modo a `app_setting` falla (sin servidor, sin rol o sin base) y rige la variable, que es el
 * respaldo de RF-IRM-2. Un tope de 30 s mata la sonda si algo la colgara, y la prueba falla con
 * su salida en lugar de quedarse esperando.
 */
type Peticion = { metodo: string; ruta: string; cuerpo?: unknown };
type Resultado = Peticion & { estado: number; cacheControl: string | null; cuerpo: unknown };

const PETICIONES: Peticion[] = [
  { metodo: "GET", ruta: "/health" },
  { metodo: "GET", ruta: "/config" },
  { metodo: "GET", ruta: "/" },
  { metodo: "POST", ruta: "/auth/register", cuerpo: { code: "20239501", portalPassword: "clave-portal-sintetica", passcode: "123456", password: "clave-nueva-sintetica" } },
  { metodo: "POST", ruta: "/auth/register", cuerpo: {} },
  { metodo: "POST", ruta: "/auth/login", cuerpo: {} },
  { metodo: "POST", ruta: "/auth/google", cuerpo: {} },
  { metodo: "POST", ruta: "/auth/password-reset/request", cuerpo: {} },
  { metodo: "GET", ruta: "/auth/me" },
  { metodo: "GET", ruta: "/schedule/me" },
  { metodo: "GET", ruta: "/portal-sync/status" },
  { metodo: "POST", ruta: "/portal-sync/import", cuerpo: {} },
  { metodo: "POST", ruta: "/portal-sync/refresh", cuerpo: {} },
];

const correr = (modoEstatico?: string): Resultado[] => {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    DATABASE_URL: "postgres://ci:ci@localhost:5432/no-se-usa",
    JWT_SECRET: "secreto-solo-para-ci",
    COHERE_API_KEY: "clave-falsa-de-ci",
    NODE_ENV: "test",
  };
  if (modoEstatico !== undefined) env.MODO_ESTATICO = modoEstatico;
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", join(import.meta.dir, "arranque-sonda.ts"), JSON.stringify(PETICIONES)],
    env,
    cwd: join(import.meta.dir, "..", ".."),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const salida = proc.stdout.toString();
  const linea = salida.split("\n").find((l) => l.startsWith("RESULTADOS="));
  if (!linea) throw new Error(`La sonda no devolvió resultados.\n${salida}\n${proc.stderr.toString()}`);
  return JSON.parse(linea.slice("RESULTADOS=".length)) as Resultado[];
};

const de = (r: Resultado[], metodo: string, ruta: string, i = 0) =>
  r.filter((x) => x.metodo === metodo && x.ruta === ruta)[i]!;

const PORTAL_DESACTIVADO = {
  error: { code: "PORTAL_DESACTIVADO", message: "Esta versión de ULima++ no se conecta con la Universidad de Lima." },
};

const apagado = correr("false");
const sinVariable = correr();
const estatico = correr("true");

describe("app completa con MODO_ESTATICO=true", () => {
  test("RF-EST-2: POST /auth/register responde 503 REGISTRATION_UNAVAILABLE con cualquier cuerpo", () => {
    for (const i of [0, 1]) {
      const r = de(estatico, "POST", "/auth/register", i);
      expect(r.estado).toBe(503);
      expect((r.cuerpo as { error: { code: string } }).error.code).toBe("REGISTRATION_UNAVAILABLE");
    }
  });

  test("RF-EST-3: toda ruta de /portal-sync responde 503 PORTAL_DESACTIVADO, sin sesión", () => {
    for (const [m, ruta] of [["GET", "/portal-sync/status"], ["POST", "/portal-sync/import"], ["POST", "/portal-sync/refresh"]]) {
      const r = de(estatico, m!, ruta!);
      expect([r.estado, r.cuerpo]).toEqual([503, PORTAL_DESACTIVADO]);
    }
  });

  test("RF-EST-5: lo demás responde igual que con el modo apagado", () => {
    // `/config` difiere entre modos a propósito (RF-IRM-4) y tiene su propia prueba abajo.
    const resto = (r: Resultado[]) =>
      r.filter((x) => !x.ruta.startsWith("/portal-sync") && !(x.ruta === "/auth/register") && x.ruta !== "/config")
        .map((x) => [x.metodo, x.ruta, x.estado, x.ruta === "/health" ? null : x.cuerpo]);
    expect(resto(estatico)).toEqual(resto(apagado));
    expect(de(estatico, "GET", "/health").estado).toBe(200);
    expect(de(estatico, "POST", "/auth/login").estado).toBe(400);
    expect(de(estatico, "GET", "/auth/me").estado).toBe(401);
  });
});

describe("app completa con MODO_ESTATICO=false y sin la variable (RF-EST-6)", () => {
  test.each([["false", apagado], ["sin variable", sinVariable]])("%s: /portal-sync y el registro siguen como antes", (_n, r) => {
    expect(de(r, "GET", "/portal-sync/status").estado).toBe(401);
    expect(de(r, "POST", "/portal-sync/import").estado).toBe(401);
    expect(de(r, "POST", "/portal-sync/refresh").estado).toBe(401);
    expect(de(r, "POST", "/auth/register", 1).estado).toBe(400);
    expect(JSON.stringify(r)).not.toContain("PORTAL_DESACTIVADO");
    expect(JSON.stringify(r)).not.toContain("REGISTRATION_UNAVAILABLE");
  });

  test("sin la variable responde igual que con false", () => {
    const sinHora = (r: Resultado[]) => r.map((x) => [x.metodo, x.ruta, x.estado, x.ruta === "/health" ? null : x.cuerpo]);
    expect(sinHora(sinVariable)).toEqual(sinHora(apagado));
  });
});

describe("GET /config en la app completa, sin la fila (RF-IRM-2 y RF-IRM-4)", () => {
  test.each([
    ["true", estatico, true],
    ["false", apagado, false],
    ["sin variable", sinVariable, false],
  ] as const)("MODO_ESTATICO %s: 200, el modo de la variable y no-store", (_n, r, valor) => {
    const x = de(r, "GET", "/config");
    expect([x.estado, x.cuerpo, x.cacheControl]).toEqual([200, { modoEstatico: valor }, "no-store"]);
  });
});
