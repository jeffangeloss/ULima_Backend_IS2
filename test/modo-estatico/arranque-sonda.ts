/**
 * Sonda del arranque real. La corre `modo-estatico.arranque.test.ts` en un proceso
 * aparte, porque `MODO_ESTATICO` se lee una sola vez al importar `src/config/env.ts`
 * y una misma suite no puede importar la app en los dos modos.
 *
 * Carga `src/server.ts` completo (el mismo que sirve Vercel), hace las peticiones que
 * llegan en el argumento 2 como JSON y escribe en la salida estándar una línea JSON con
 * el estado y el cuerpo de cada una. Todas las peticiones elegidas se resuelven sin
 * tocar la base: o las corta un validador o el middleware de sesión, o las apaga el
 * modo estático.
 */
type Peticion = { metodo: string; ruta: string; cuerpo?: unknown };

const peticiones = JSON.parse(process.argv[2] ?? "[]") as Peticion[];
const { default: app } = await import("../../src/server.js");

const resultados = [];
for (const p of peticiones) {
  const res = await app.request(p.ruta, {
    method: p.metodo,
    headers: { "Content-Type": "application/json" },
    body: p.cuerpo === undefined ? undefined : JSON.stringify(p.cuerpo),
  });
  resultados.push({ ...p, estado: res.status, cuerpo: await res.json().catch(() => null) });
}
console.log("RESULTADOS=" + JSON.stringify(resultados));
process.exit(0);
