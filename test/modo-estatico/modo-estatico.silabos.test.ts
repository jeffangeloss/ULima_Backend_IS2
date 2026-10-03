import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { GradesService } from "../../src/modules/grades/grades.service.js";
import type { GradesRepository } from "../../src/modules/grades/grades.repository.js";
import type { EventBus } from "../../src/events/index.js";
import { modoFijo } from "../../src/modules/app-setting/modo-estatico.lector.js";

/**
 * RF-EST-7 (backend). Con `MODO_ESTATICO=true`, `silaboUrl` de `GET /grades/me/courses` solo
 * entrega enlaces de Drive. La importación guardó en `syllabus.drive_file_url` URLs de cactus
 * y las APK 1.2.0 las abren en el navegador, así que el backend no las publica. Con `false`
 * la respuesta es la de siempre.
 */
const DRIVE = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view";
const CACTUS = "https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV/ABC123/$File/silabo.pdf";

const fila = (id: number, url: string | null) => ({
  curriculum_course_id: id,
  course_id: id,
  course_name: `Curso ${id}`,
  period_code: "2026-1",
  syllabus_url: url,
  section_id: null,
});

const filas = [
  fila(1, DRIVE),
  fila(2, CACTUS),
  fila(3, null),
  fila(4, "http://cactus.ulima.edu.pe/otro.pdf"),
  fila(5, "https://drive.google.com.ejemplo.invalido/file/d/x/view"),
  fila(6, "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit"),
  fila(7, "no es una url"),
];

const servicio = (modoEstatico?: boolean) =>
  new GradesService(
    { findCoursesAndAssessments: async () => filas } as unknown as GradesRepository,
    {} as EventBus,
    modoEstatico === undefined ? undefined : { modoEstatico: modoFijo(modoEstatico) },
  );

const urls = async (s: GradesService) =>
  Object.fromEntries((await s.getCoursesAndSyllabi()).cursos.map((c: any) => [c.id, c.silaboUrl]));

describe("silaboUrl en modo estático (RF-EST-7)", () => {
  test("con true conserva los enlaces de Drive y deja en null todo lo demás", async () => {
    expect(await urls(servicio(true))).toEqual({
      "1": DRIVE,
      "2": null,
      "3": null,
      "4": null,
      "5": null,
      "6": "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
      "7": null,
    });
  });

  test("con false entrega las URLs tal como están guardadas", async () => {
    expect((await urls(servicio(false)))["2"]).toBe(CACTUS);
    expect((await urls(servicio(false)))["7"]).toBe("no es una url");
  });

  test("sin opciones se comporta como con false", async () => {
    expect(await urls(servicio())).toEqual(await urls(servicio(false)));
  });
});

/**
 * Cableado real de RF-EST-7 y RF-IRM-3. `src/modules/grades/index.ts` pasa al servicio el lector
 * del modo. La `DATABASE_URL` falsa no sirve, así que la consulta a `app_setting` falla (sin
 * servidor, sin rol o sin base) y rige `MODO_ESTATICO` (RF-IRM-2). Cada valor corre en un proceso
 * propio con entorno mínimo y falso.
 */
const correr = (modoEstatico?: string): Record<string, string | null> => {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    DATABASE_URL: "postgres://ci:ci@localhost:5432/no-se-usa",
    JWT_SECRET: "secreto-solo-para-ci",
    COHERE_API_KEY: "clave-falsa-de-ci",
    NODE_ENV: "test",
  };
  if (modoEstatico !== undefined) env.MODO_ESTATICO = modoEstatico;
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", join(import.meta.dir, "silabos-sonda.ts")],
    env,
    cwd: join(import.meta.dir, "..", ".."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const salida = proc.stdout.toString();
  const linea = salida.split("\n").find((l) => l.startsWith("RESULTADOS="));
  if (!linea) throw new Error(`La sonda no devolvió resultados.\n${salida}\n${proc.stderr.toString()}`);
  return JSON.parse(linea.slice("RESULTADOS=".length));
};

describe("cableado de silaboUrl con la configuración real (RF-EST-7)", () => {
  test("MODO_ESTATICO=true oculta la URL de cactus y conserva la de Drive", () => {
    expect(correr("true")).toEqual({ "1": DRIVE, "2": null });
  });

  test("MODO_ESTATICO=false y sin variable entregan ambas URLs", () => {
    expect(correr("false")).toEqual({ "1": DRIVE, "2": CACTUS });
    expect(correr()).toEqual({ "1": DRIVE, "2": CACTUS });
  });
});
