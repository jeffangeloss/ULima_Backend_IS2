import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { db } from "../../src/db/index.js";
import { buildContext } from "../../src/modules/chatbot/context-builder.js";
import { ChatbotRepository, PREFIJO_ALERTA_INASISTENCIAS } from "../../src/modules/chatbot/chatbot.repository.js";
import { modoFijo } from "../../src/modules/app-setting/modo-estatico.lector.js";

/**
 * RF-EST-8. Con `MODO_ESTATICO=true`, el contexto que el chatbot arma para Cohere no incluye las
 * alertas de inasistencias (el riesgo de asistencia que dejó la importación del portal) ni datos
 * de asistencia leídos del portal. Con `false` o sin la variable el contexto es el de siempre.
 *
 * La tabla `alert` solo tiene `type` (`academic_risk` o `high_load`) y `title`. El riesgo de
 * asistencia y el riesgo de notas comparten `type = 'academic_risk'`, así que la columna de tipo
 * no distingue una alerta de la otra y el único discriminador que existe es el prefijo del
 * título, el mismo que descarta el front (`lib/services/alert_service.dart`).
 */
const dialecto = new PgDialect();
const ALUMNO = 7;
const T0 = new Date("2026-10-01T10:00:00Z");

const alertas = [
  { type: "academic_risk", title: "Alerta de inasistencias - Cálculo I", message: "Estás a 2 falta(s) de alcanzar el límite de inasistencias (30%) en Cálculo I (Sección 03). Tu porcentaje actual es de 25%.", is_read: false, created_at: T0 },
  { type: "academic_risk", title: "Riesgo Académico: Física II", message: "Tu promedio actual en Física II es 8.50.", is_read: false, created_at: T0 },
  { type: "high_load", title: "Alta Carga: Semana 5", message: "Tienes 3 evaluaciones programadas en la semana 5 de tu ciclo.", is_read: true, created_at: T0 },
  { type: "academic_risk", title: "Alerta de inasistencias - Programación", message: "Has superado el límite de inasistencias permitidas (30%) en Programación (Sección 01). Tu porcentaje actual es de 40%.", is_read: false, created_at: T0 },
];

/**
 * Una base falsa que imita el único filtro que la consulta de alertas aplica cuando se lo piden
 * (`NOT starts_with(a.title, $2)`), para recorrer repositorio, datos y contexto sin PostgreSQL.
 * El texto SQL real se comprueba aparte.
 */
const baseFalsa = (consultas: Array<{ sql: string; params: unknown[] }>) =>
  ({
    execute: async (q: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const { sql, params } = dialecto.sqlToQuery(q);
      consultas.push({ sql, params });
      const prefijo = params.find((p) => p === PREFIJO_ALERTA_INASISTENCIAS);
      return alertas.filter((a) => prefijo === undefined || !a.title.startsWith(prefijo as string));
    },
  }) as unknown as typeof db;

const repositorio = (modoEstatico?: boolean) => {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const repo = new ChatbotRepository(
    baseFalsa(consultas),
    modoEstatico === undefined ? undefined : { modoEstatico: modoFijo(modoEstatico) },
  );
  return { repo, consultas };
};

const contextoDeAlertas = async (modoEstatico?: boolean) => {
  const { repo } = repositorio(modoEstatico);
  const alertsData = await repo.getAlerts(ALUMNO);
  return buildContext({
    studentName: "Alumna Inventada",
    careerName: "Ingeniería de Sistemas",
    currentLevel: 5,
    intents: ["alerts"],
    dateContext: { today: "2026-10-02" },
    alertsData,
    question: "¿Qué alertas tengo?",
  }).message;
};

describe("alertas de inasistencias en el contexto del chatbot (RF-EST-8)", () => {
  test("con true el contexto no menciona alertas de inasistencias y conserva las demás", async () => {
    const mensaje = await contextoDeAlertas(true);
    expect(mensaje).not.toContain("Alerta de inasistencias");
    expect(mensaje).not.toContain("inasistencias");
    expect(mensaje).not.toContain("Cálculo I");
    expect(mensaje).toContain("Riesgo Académico: Física II");
    expect(mensaje).toContain("Alta Carga: Semana 5");
  });

  test("con false y sin la variable el contexto trae todas las alertas y es idéntico", async () => {
    const apagado = await contextoDeAlertas(false);
    const sinVariable = await contextoDeAlertas();
    expect(apagado).toBe(sinVariable);
    expect(apagado).toContain("Alerta de inasistencias - Cálculo I");
    expect(apagado).toContain("Alerta de inasistencias - Programación");
    expect(apagado).toContain("Riesgo Académico: Física II");
  });
});

describe("SQL de getAlerts (RF-EST-8)", () => {
  test("con true filtra por el prefijo del título antes de ordenar y limitar a 20", async () => {
    const { repo, consultas } = repositorio(true);
    await repo.getAlerts(ALUMNO);
    const { sql, params } = consultas[0]!;
    expect(params).toEqual([ALUMNO, PREFIJO_ALERTA_INASISTENCIAS]);
    const plano = sql.replace(/\s+/g, " ");
    expect(plano).toContain("NOT starts_with(a.title, $2)");
    expect(plano.indexOf("NOT starts_with")).toBeLessThan(plano.indexOf("ORDER BY"));
    expect(plano).toContain("ORDER BY a.created_at DESC LIMIT 20");
  });

  test("con false y sin la variable la consulta es la de siempre, sin el filtro", async () => {
    const apagado = repositorio(false);
    const sinVariable = repositorio();
    await apagado.repo.getAlerts(ALUMNO);
    await sinVariable.repo.getAlerts(ALUMNO);
    expect(apagado.consultas[0]!.params).toEqual([ALUMNO]);
    expect(apagado.consultas[0]!.sql.replace(/\s+/g, " ")).toBe(sinVariable.consultas[0]!.sql.replace(/\s+/g, " "));
    expect(apagado.consultas[0]!.sql).not.toContain("starts_with");
  });

  test("el prefijo es el que descarta el front y el que escribe attendance-risk", () => {
    expect(PREFIJO_ALERTA_INASISTENCIAS).toBe("Alerta de inasistencias - ");
    const emisor = readFileSync(join(import.meta.dir, "../../src/modules/attendance-risk/attendance-risk.service.ts"), "utf8");
    expect(emisor).toContain("`Alerta de inasistencias - ${courseName}`");
  });
});

describe("el chatbot no lee otros datos de asistencia del portal (RF-EST-8)", () => {
  // Columnas y tablas donde la importación y la recarga del portal dejan la asistencia, el récord
  // y las notas de la ULima. Ningún archivo del chatbot las consulta, y esta prueba avisa si una
  // consulta nueva las empieza a leer sin pasar por el interruptor.
  const PROHIBIDOS = [
    "absent_hours",
    "attended_hours",
    "portal_attendance_read_at",
    "attendance_read_at",
    "student_portal_score",
    "academic_record",
    "student_academic",
  ];

  test("ningún archivo de src/modules/chatbot menciona esas columnas o tablas", () => {
    const carpeta = join(import.meta.dir, "../../src/modules/chatbot");
    for (const archivo of readdirSync(carpeta).filter((f) => f.endsWith(".ts"))) {
      const texto = readFileSync(join(carpeta, archivo), "utf8");
      for (const p of PROHIBIDOS) expect([archivo, texto.includes(p)]).toEqual([archivo, false]);
    }
  });
});

describe("cableado con la configuración real (RF-EST-8)", () => {
  const correr = (modoEstatico?: string): { params: unknown[]; filtra: boolean } => {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? "",
      DATABASE_URL: "postgres://ci:ci@localhost:5432/no-se-usa",
      JWT_SECRET: "secreto-solo-para-ci",
      COHERE_API_KEY: "clave-falsa-de-ci",
      NODE_ENV: "test",
    };
    if (modoEstatico !== undefined) env.MODO_ESTATICO = modoEstatico;
    const proc = Bun.spawnSync({
      cmd: [process.execPath, "run", join(import.meta.dir, "chatbot-sonda.ts")],
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

  test("MODO_ESTATICO=true instala el filtro en el repositorio real del chatbot", () => {
    expect(correr("true")).toEqual({ params: [ALUMNO, PREFIJO_ALERTA_INASISTENCIAS], filtra: true });
  });

  test("MODO_ESTATICO=false y sin variable no lo instalan", () => {
    expect(correr("false")).toEqual({ params: [ALUMNO], filtra: false });
    expect(correr()).toEqual({ params: [ALUMNO], filtra: false });
  });
});
