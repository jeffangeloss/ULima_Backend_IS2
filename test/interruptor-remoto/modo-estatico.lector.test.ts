import { describe, expect, test } from "bun:test";
import {
  crearLectorDelModo,
  modoFijo,
  TOPE_DE_LA_CONSULTA_MS,
  VIGENCIA_DEL_MODO_MS,
  type ConsultaDelModo,
} from "../../src/modules/app-setting/modo-estatico.lector.js";

/**
 * RF-IRM-2. El lector resuelve el modo en este orden. Primero la fila de `app_setting`; si la
 * consulta falla o la fila no existe, el último valor leído; si no hay ninguno, el respaldo de
 * `MODO_ESTATICO`. Recuerda el valor 10 s, corta la consulta a los 5 s y nunca lanza. La
 * consulta y el reloj son dobles, así que la prueba no toca ninguna base.
 */
type Respuesta = boolean | null | Error;

/** Lector con un reloj manual y una consulta que entrega las respuestas en orden y repite la última. */
const armar = (respuestas: Respuesta[], respaldo: boolean) => {
  let ahora = 0;
  let llamadas = 0;
  const consultar: ConsultaDelModo = async () => {
    const respuesta = respuestas[Math.min(llamadas, respuestas.length - 1)] ?? null;
    llamadas++;
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  };
  const leer = crearLectorDelModo({ consultar, respaldo, ahora: () => ahora });
  return {
    leer,
    avanzar: (ms: number) => {
      ahora += ms;
    },
    llamadas: () => llamadas,
  };
};

describe("orden de resolución del lector (RF-IRM-2)", () => {
  test("la fila manda sobre el respaldo, en true y en false", async () => {
    expect(await armar([true], false).leer()).toBe(true);
    expect(await armar([false], true).leer()).toBe(false);
  });

  test("sin fila y sin valor previo rige el respaldo", async () => {
    expect(await armar([null], true).leer()).toBe(true);
    expect(await armar([null], false).leer()).toBe(false);
  });

  test("con error de consulta y sin valor previo rige el respaldo", async () => {
    expect(await armar([new Error("sin base")], true).leer()).toBe(true);
    expect(await armar([new Error("sin base")], false).leer()).toBe(false);
  });

  test("con error de consulta después de una lectura rige el último valor leído", async () => {
    const lector = armar([false, new Error("sin base")], true);
    expect(await lector.leer()).toBe(false);
    lector.avanzar(VIGENCIA_DEL_MODO_MS);
    expect(await lector.leer()).toBe(false);
    expect(lector.llamadas()).toBe(2);
  });

  test("sin fila después de una lectura rige el último valor leído", async () => {
    const lector = armar([false, null], true);
    expect(await lector.leer()).toBe(false);
    lector.avanzar(VIGENCIA_DEL_MODO_MS);
    expect(await lector.leer()).toBe(false);
    expect(lector.llamadas()).toBe(2);
  });
});

describe("caché, tope y consultas simultáneas (RF-IRM-2 y RF-IRM-5)", () => {
  test("recuerda el valor 10 s y vuelve a consultar al cumplirse", async () => {
    const lector = armar([true, false], false);
    expect(await lector.leer()).toBe(true);
    lector.avanzar(VIGENCIA_DEL_MODO_MS - 1);
    expect(await lector.leer()).toBe(true);
    expect(lector.llamadas()).toBe(1);
    lector.avanzar(1);
    expect(await lector.leer()).toBe(false);
    expect(lector.llamadas()).toBe(2);
  });

  test("una consulta que no responde se corta en su tope y rige el respaldo", async () => {
    const leer = crearLectorDelModo({
      consultar: () => new Promise<boolean | null>(() => {}),
      respaldo: true,
      topeMs: 20,
    });
    expect(await leer()).toBe(true);
  });

  test("peticiones simultáneas comparten una sola consulta", async () => {
    const lector = armar([false], true);
    expect(await Promise.all([lector.leer(), lector.leer(), lector.leer()])).toEqual([false, false, false]);
    expect(lector.llamadas()).toBe(1);
  });

  test("la vigencia es de 10 s y el tope de 5 s", () => {
    expect(VIGENCIA_DEL_MODO_MS).toBe(10_000);
    expect(TOPE_DE_LA_CONSULTA_MS).toBe(5_000);
  });
});

describe("el lector nunca lanza (RF-IRM-2)", () => {
  test("ni con una consulta que lanza al llamarla ni con un valor que no es booleano", async () => {
    const lanzaAlLlamar = (() => {
      throw new Error("falla antes de devolver la promesa");
    }) as unknown as ConsultaDelModo;
    await expect(crearLectorDelModo({ consultar: lanzaAlLlamar, respaldo: false })()).resolves.toBe(false);
    const texto = (async () => "true") as unknown as ConsultaDelModo;
    await expect(crearLectorDelModo({ consultar: texto, respaldo: false })()).resolves.toBe(false);
  });
});

describe("modoFijo", () => {
  test("devuelve siempre el valor con el que se crea", async () => {
    expect(await modoFijo(true)()).toBe(true);
    expect(await modoFijo(false)()).toBe(false);
  });
});
