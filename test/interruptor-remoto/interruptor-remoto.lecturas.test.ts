import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { PgDialect } from "drizzle-orm/pg-core";
import type { db } from "../../src/db/index.js";
import type { EventBus } from "../../src/events/index.js";
import { ChatbotRepository, PREFIJO_ALERTA_INASISTENCIAS } from "../../src/modules/chatbot/chatbot.repository.js";
import type { GradesRepository } from "../../src/modules/grades/grades.repository.js";
import { GradesService } from "../../src/modules/grades/grades.service.js";

/**
 * RF-IRM-3 sobre las dos lecturas que filtra el backend, `silaboUrl` de `GET /grades/me/courses`
 * (RF-EST-7) y las alertas del contexto del chatbot (RF-EST-8). El servicio y el repositorio
 * reciben un lector que la prueba cambia entre dos llamadas sin construirlos de nuevo. No toca
 * ninguna base. Al final, RF-IRM-2 exige un único lector en `src/modules`.
 */
const DRIVE = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view";
const CACTUS = "https://cactus.ulima.edu.pe/ac/ac_bd001.nsf/vSyllabusXCicloAV/ABC123/$File/silabo.pdf";

const interruptor = () => {
  let estatico = true;
  let lecturas = 0;
  return {
    leer: async () => {
      lecturas++;
      return estatico;
    },
    fijar: (valor: boolean) => {
      estatico = valor;
    },
    lecturas: () => lecturas,
  };
};

const fila = (id: number, url: string) => ({
  curriculum_course_id: id, course_id: id, course_name: `Curso ${id}`, period_code: "2026-1",
  syllabus_url: url, section_id: null,
});

describe("silaboUrl sigue al modo en cada petición (RF-IRM-3)", () => {
  test("oculta cactus en estático, lo entrega en dinámico y vuelve a ocultarlo sin reconstruir el servicio", async () => {
    const modo = interruptor();
    const servicio = new GradesService(
      { findCoursesAndAssessments: async () => [fila(1, DRIVE), fila(2, CACTUS)] } as unknown as GradesRepository,
      {} as EventBus,
      { modoEstatico: modo.leer },
    );
    const urls = async () =>
      Object.fromEntries((await servicio.getCoursesAndSyllabi()).cursos.map((c: any) => [c.id, c.silaboUrl]));
    expect(await urls()).toEqual({ "1": DRIVE, "2": null });
    modo.fijar(false);
    expect(await urls()).toEqual({ "1": DRIVE, "2": CACTUS });
    modo.fijar(true);
    expect(await urls()).toEqual({ "1": DRIVE, "2": null });
    expect(modo.lecturas()).toBe(3);
  });
});

describe("las alertas del chatbot siguen al modo en cada petición (RF-IRM-3)", () => {
  test("filtra en estático, no filtra en dinámico y vuelve a filtrar sin reconstruir el repositorio", async () => {
    const modo = interruptor();
    const parametros: unknown[][] = [];
    const base = {
      execute: async (q: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        parametros.push(new PgDialect().sqlToQuery(q).params);
        return [];
      },
    } as unknown as typeof db;
    const repositorio = new ChatbotRepository(base, { modoEstatico: modo.leer });
    await repositorio.getAlerts(7);
    modo.fijar(false);
    await repositorio.getAlerts(7);
    modo.fijar(true);
    await repositorio.getAlerts(7);
    expect(parametros).toEqual([[7, PREFIJO_ALERTA_INASISTENCIAS], [7], [7, PREFIJO_ALERTA_INASISTENCIAS]]);
  });
});

describe("un único lector del modo (RF-IRM-2)", () => {
  test("en src/modules solo app-setting/index.ts lee config.modoEstatico", async () => {
    const conAcceso: string[] = [];
    for await (const ruta of new Glob("src/modules/**/*.ts").scan(".")) {
      if ((await Bun.file(ruta).text()).includes("config.modoEstatico")) conAcceso.push(ruta);
    }
    expect(conAcceso).toEqual(["src/modules/app-setting/index.ts"]);
  });

  test("los cuatro consumidores usan la instancia de app-setting/index.ts", async () => {
    for (const archivo of ["auth", "portal-sync", "grades", "chatbot"].map((m) => `src/modules/${m}/index.ts`)) {
      const texto = await Bun.file(archivo).text();
      expect([archivo, texto.includes('import { modoEstatico } from "../app-setting/index.js";')]).toEqual([archivo, true]);
    }
  });
});
