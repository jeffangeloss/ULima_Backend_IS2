import { describe, expect, test } from "bun:test";
import {
  CURSOS_MULTIASESOR, claveTokens, clasificarFila, codigoPortalDesdePdf, diaIso, docenteEnPdf,
  horaSql, modalidadDe, normalizar, parsearHorarioPdf, planificar, resolverCurso, resolverDocente,
  type CursoBd, type DocenteBd,
} from "../../src/db/seed/asesorias.logic.js";

/**
 * Carga de asesorías 2026-2 desde el Excel de la facultad, validada contra el
 * horario oficial (PDF). Todo lo semántico vive en funciones puras y se prueba
 * acá con datos INVENTADOS: el Excel real trae Zoom personales de más de cien
 * profesores y el repo es público.
 */

// ── fixtures sintéticos ──────────────────────────────────────────────────────
const bd = (over: Partial<DocenteBd> & { id: number; fullName: string }): DocenteBd => ({
  teacherCode: null, conCuenta: false, enSecciones: false, ...over,
});
const cursos: CursoBd[] = [
  { code: "650059", name: "ESTRUCTURA DE DATOS I", offeringId: 11 },
  { code: "650061", name: "ESTRUCTURA DE DATOS II", offeringId: 12 },
  { code: "650015", name: "REDES DE COMPUTADORAS", offeringId: 13 },
  { code: "400002", name: "REDES DE COMPUTADORAS", offeringId: null },   // legado, sin oferta
  { code: "650035", name: "SEMINARIO DE INVESTIGACIÓN I", offeringId: 14 },
  { code: "650040", name: "SEMINARIO DE INVESTIGACIÓN II", offeringId: 15 },
  { code: "650066", name: "PROPUESTA DE INVESTIGACIÓN", offeringId: 16 },
  { code: "5674",   name: "GESTIÓN DE PROYECTOS", offeringId: 17 },       // no aparece en el PDF
  { code: "650084", name: "DEVOPS", offeringId: 18 },
];
// Mismo formato que produce pypdf sobre el PDF real: hora, docente "APELLIDOS, NOMBRES",
// sección (3 dígitos), créditos (1), nombre de curso truncado, código (6). Las filas de
// continuación NO repiten el curso: se hereda del anterior.
const PDF = `03/08/2026Referencial, actualizado al :
TERCER NIVEL
PROFESOR TITULARSECCCrdNOMBRE CURSOCOD
LUNES MARTES MIERCOLES JUEVES VIERNES SABADO
7-97-9PEREZ RAMIREZ, JUAN CARLOS3514ESTRUCTURA DATO650059
9-119-11QUISPE ROJAS, ANA MARIA352
11-1311-13TORRES HUAMANI, LUIS ALBERTO ENRIQ353
14-1614-16PEREZ RAMIREZ, JUAN CARLOS3514ESTRUCTURA DATO650061
10-13SALAZAR PINTO, CARLA3013DEVOPS650084
CUARTO NIVEL
17-19FLORES CASTRO, MARIA3013RED.COMPU.650015
DECIMO NIVEL
7-920-22QUISPE ROJAS, ANA MARIA10513ARQUI. EMPRESAR650082
19-2220-22FLORES CASTRO, MARIA1053
OCTAVO NIVEL
17-1917-19SALAZAR PINTO, CARLA8514ING. SOFT. II1327
18-2018-20TORRES HUAMANI, LUIS ALBERTO ENRIQ856
 3SIST.ERP650028
20-2220-22FLORES CASTRO, MARIA852
`;

describe("normalizar / tokens", () => {
  test("mayúsculas, sin tildes, sin comas, espacios colapsados", () => {
    expect(normalizar("  Pérez  Ramírez, Juan  ")).toBe("PEREZ RAMIREZ JUAN");
  });
  test("la clave de tokens no depende del orden (portal-sync invierte apellidos y nombres)", () => {
    expect(claveTokens("JUAN CARLOS PEREZ RAMIREZ")).toBe(claveTokens("Perez Ramirez, Juan Carlos"));
  });
});

describe("diaIso / horaSql / modalidadDe", () => {
  test("días en español con y sin tilde, ISO 1..7", () => {
    expect(diaIso("Lunes")).toBe(1); expect(diaIso("miércoles")).toBe(3);
    expect(diaIso("MIERCOLES")).toBe(3); expect(diaIso("Sábado")).toBe(6); expect(diaIso("Día")).toBeNull();
  });
  test("horas enteras a time de Postgres; fuera de rango o no numéricas → null", () => {
    expect(horaSql(9)).toBe("09:00:00"); expect(horaSql("19")).toBe("19:00:00");
    expect(horaSql(24)).toBeNull(); expect(horaSql("Inicio")).toBeNull(); expect(horaSql(null)).toBeNull();
  });
  test("modalidad: VIRTUAL→virtual, Zoom+aula→hybrid (como las 153 de 2026-1), solo aula→classroom, solo Zoom→virtual", () => {
    expect(modalidadDe("VIRTUAL", "https://z").modalidad).toBe("virtual");
    expect(modalidadDe("I2-407 (24)", "https://z").modalidad).toBe("hybrid");
    expect(modalidadDe("I2-407 (24)", null).modalidad).toBe("classroom");
    expect(modalidadDe(null, "https://z").modalidad).toBe("virtual");
  });
  test("sin aula ni Zoom cae al default de la tabla (hybrid) pero se marca para el reporte", () => {
    const m = modalidadDe(null, null);
    expect(m.modalidad).toBe("hybrid"); expect(m.sinDatos).toBe(true);
  });
});

describe("resolverDocente — el duplicado importa", () => {
  test("empate exacto sin importar orden ni tildes", () => {
    const d = [bd({ id: 1, fullName: "PEREZ RAMIREZ JUAN CARLOS" })];
    expect(resolverDocente("Pérez Ramírez Juan Carlos", d)?.docente.id).toBe(1);
  });
  test("con cuenta gana sobre PORTAL: y sobre la sembrada: si no, el profesor no ve sus propias horas", () => {
    const d = [
      bd({ id: 5, fullName: "QUISPE ROJAS, ANA MARIA" }),
      bd({ id: 9, fullName: "ANA MARIA QUISPE ROJAS", teacherCode: "PORTAL:ANA-MARIA-QUISPE-ROJAS", enSecciones: true }),
      bd({ id: 7, fullName: "QUISPE ROJAS ANA MARIA", conCuenta: true }),
    ];
    const r = resolverDocente("Quispe Rojas Ana Maria", d);
    expect(r?.docente.id).toBe(7); expect(r?.modo).toBe("cuenta");
  });
  test("sin cuenta, gana la fila PORTAL: que ya referencian las secciones 2026-2", () => {
    const d = [
      bd({ id: 5, fullName: "QUISPE ROJAS, ANA MARIA" }),
      bd({ id: 9, fullName: "ANA MARIA QUISPE ROJAS", teacherCode: "PORTAL:ANA-MARIA-QUISPE-ROJAS", enSecciones: true }),
    ];
    const r = resolverDocente("Quispe Rojas Ana Maria", d);
    expect(r?.docente.id).toBe(9); expect(r?.modo).toBe("portal");
  });
  test("prefijo: la BD trae el nombre recortado (o el Excel trae un apellido de más)", () => {
    const d = [bd({ id: 3, fullName: "TORRES HUAMANI LUIS ALBERTO" })];
    expect(resolverDocente("Torres Huamani Luis Alberto Enrique", d)?.modo).toBe("prefijo");
  });
  test("la BD trae el nombre TRUNCADO a 32 caracteres (sembrado desde un PDF viejo): empata por tokens-prefijo", () => {
    // 14 docentes reales están así en producción. Sin esto se los volvería a
    // crear, fabricando justo los duplicados que este seed quiere evitar.
    // 32 caracteres exactos: la marca de que el PDF de origen lo cortó.
    const d = [bd({ id: 52, fullName: "VILLANUEVA PAREDES, ROBERTO CARL" }), bd({ id: 1, fullName: "PEREZ RAMIREZ JUAN CARLOS" })];
    const r = resolverDocente("Villanueva Paredes Roberto Carlos", d);
    expect(r?.docente.id).toBe(52); expect(r?.modo).toBe("prefijo");
  });
  test("tokens-prefijo exige al menos 3 tokens: un apellido suelto no empata", () => {
    const d = [bd({ id: 9, fullName: "VILLANUEVA, JOSE" })];
    expect(resolverDocente("Villanueva Paredes Roberto Carlos", d)).toBeNull();
  });
  test("homónimo PARCIAL: 'JUAN' no es 'JUANA' salvo que haya evidencia de truncado (32 chars)", () => {
    // Sin esto, dos apellidos iguales + un nombre que es prefijo de otro daban un
    // único candidato equivocado, indetectable como ambigüedad.
    const d = [bd({ id: 3, fullName: "PEREZ RAMIREZ, JUAN" })];
    expect(resolverDocente("Perez Ramirez Juana Maria", d)).toBeNull();
    const d2 = [bd({ id: 4, fullName: "PEREZ RAMIREZ CASTILLO, JUAN CARL" })];   // 32: truncado
    expect(resolverDocente("Perez Ramirez Castillo Juan Carlos", d2)?.docente.id).toBe(4);
  });
  test("prefijo ambiguo o sin candidatos → null (no se adivina)", () => {
    // Dos filas que son prefijo/extensión del mismo nombre: no hay forma de elegir sin adivinar.
    const d = [bd({ id: 3, fullName: "TORRES HUAMANI LUIS" }), bd({ id: 4, fullName: "TORRES HUAMANI LUIS ALBERTO ENRIQUE" })];
    expect(resolverDocente("Torres Huamani Luis Alberto", d)).toBeNull();
    expect(resolverDocente("Nadie Existe", d)).toBeNull();
  });
});

describe("parsearHorarioPdf", () => {
  const pdf = parsearHorarioPdf(PDF);
  test("saca los pares (docente, curso) heredando el curso en filas de continuación", () => {
    expect(pdf.pares.has(`${claveTokens("QUISPE ROJAS ANA MARIA")}|650059`)).toBe(true);  // continuación
    expect(pdf.pares.has(`${claveTokens("PEREZ RAMIREZ JUAN CARLOS")}|650061`)).toBe(true);
    expect(pdf.pares.has(`${claveTokens("PEREZ RAMIREZ JUAN CARLOS")}|650084`)).toBe(false);
  });
  test("conserva la forma 'APELLIDOS, NOMBRES' tal como la imprime el PDF (sirve para el código PORTAL)", () => {
    expect(pdf.docentes.get(claveTokens("SALAZAR PINTO CARLA"))).toBe("SALAZAR PINTO, CARLA");
  });
  test("mapea abreviatura de curso → código", () => {
    expect(pdf.cursos.get("650015")).toEqual(["RED.COMPU."]);
    expect(pdf.cursos.get("650059")).toEqual(["ESTRUCTURA DATO"]);
  });
  test("DÉCIMO NIVEL: las secciones tienen 4 dígitos (1051, 1053) y se parsean igual", () => {
    // Sin esto, ningún curso del nivel 10 entraba al mapa del PDF y sus
    // asesorías se cargaban SIN validar ("curso ausente del PDF").
    expect(pdf.cursos.get("650082")).toEqual(["ARQUI. EMPRESAR"]);
    expect(pdf.pares.has(`${claveTokens("QUISPE ROJAS ANA MARIA")}|650082`)).toBe(true);
    expect(pdf.pares.has(`${claveTokens("FLORES CASTRO MARIA")}|650082`)).toBe(true);   // continuación con sección 1053
  });
  test("código de curso de 4 dígitos (cursos legado como 1327 o 5674) se lee igual que uno de 6", () => {
    // Antes no parseaba: esos cursos quedaban 'ausentes del PDF' y sus filas entraban sin validar.
    expect(pdf.cursos.get("1327")).toEqual(["ING. SOFT. II"]);
    expect(pdf.pares.has(`${claveTokens("SALAZAR PINTO CARLA")}|1327`)).toBe(true);
  });
  test("una fila partida por pypdf en el salto de página se vuelve a unir", () => {
    // "…, LUIS ALBERTO ENRIQ856" + " 3SIST.ERP650028" es UNA fila. Sin unirla, la
    // primera heredaba el curso anterior (par falso) y la continuación siguiente
    // se quedaba sin curso.
    expect(pdf.cursos.get("650028")).toEqual(["SIST.ERP"]);
    expect(pdf.pares.has(`${claveTokens("TORRES HUAMANI LUIS ALBERTO ENRIQ")}|650028`)).toBe(true);
    expect(pdf.pares.has(`${claveTokens("TORRES HUAMANI LUIS ALBERTO ENRIQ")}|1327`)).toBe(false);
    expect(pdf.pares.has(`${claveTokens("FLORES CASTRO MARIA")}|650028`)).toBe(true);
  });
  test("una línea que NO parsea no deja un curso viejo 'vigente' para las siguientes", () => {
    // Si el código del curso nuevo estuviera en una línea ilegible, las filas de
    // continuación heredarían el curso ANTERIOR y se respaldarían pares falsos.
    const roto = parsearHorarioPdf("7-9PEREZ RAMIREZ, JUAN CARLOS3514ESTRUCTURA DATO650059\n%%LINEA ILEGIBLE CON CODIGO 650084%%\n9-11QUISPE ROJAS, ANA MARIA352\n");
    expect(roto.pares.has(`${claveTokens("QUISPE ROJAS ANA MARIA")}|650059`)).toBe(true);
  });
  test("las cabeceras y la fecha no producen pares", () => {
    expect([...pdf.pares].some((p) => /REFERENCIAL|TITULAR|LUNES/.test(p))).toBe(false);
  });
});

describe("docenteEnPdf — el PDF trunca nombres largos", () => {
  const pdf = parsearHorarioPdf(PDF);
  test("exacto", () => { expect(docenteEnPdf("Perez Ramirez Juan Carlos", pdf)).toBe(claveTokens("PEREZ RAMIREZ JUAN CARLOS")); });
  test("truncado: 'TORRES HUAMANI, LUIS ALBERTO ENRIQ' empata con el nombre completo del Excel", () => {
    expect(docenteEnPdf("Torres Huamani Luis Alberto Enrique", pdf)).not.toBeNull();
  });
  test("ausente → null", () => { expect(docenteEnPdf("Zapata Rondon Jose", pdf)).toBeNull(); });
  test("si más de una clave del PDF empata, es ambiguo → null (no se elige la primera)", () => {
    // Dos PERSONAS distintas cuyos nombres son ambos subconjunto del que trae el
    // Excel. Elegir "la primera" le colgaría las asesorías a cualquiera de las dos.
    const amb = parsearHorarioPdf("7-9GOMEZ DIAZ, JUAN CARLOS3514ESTRUCTURA DATO650059\n7-9GOMEZ DIAZ, JUAN ALBERTO352\n");
    expect(amb.docentes.size).toBe(2);
    expect(docenteEnPdf("Gomez Diaz Juan Carlos Alberto", amb)).toBeNull();
  });
});

describe("codigoPortalDesdePdf — para que la próxima importación NO duplique al docente", () => {
  test("apellidos de la coma del PDF + nombres completos del Excel, en el orden de portal-sync", () => {
    expect(codigoPortalDesdePdf("VILLANUEVA PAREDES, ROBERTO CARL", "Villanueva Paredes Roberto Carlos"))
      .toBe("PORTAL:ROBERTO-CARLOS-VILLANUEVA-PAREDES");
  });
  test("si el Excel no viene en orden APELLIDOS NOMBRES, los apellidos se quitan donde estén", () => {
    expect(codigoPortalDesdePdf("SALAZAR PINTO, CARLA", "Carla Salazar Pinto")).toBe("PORTAL:CARLA-SALAZAR-PINTO");
  });
  test("tildes y eñes como las trata teacherCodeFor", () => {
    expect(codigoPortalDesdePdf("MUÑOZ IBÁÑEZ, SEBASTIÁN ANDRE", "Muñoz Ibáñez Sebastián Andrés"))
      .toBe("PORTAL:SEBASTIAN-ANDRES-MUNOZ-IBANEZ");
  });
});

describe("resolverCurso — abreviaturas del Excel", () => {
  const pdf = parsearHorarioPdf(PDF);
  test("por abreviatura del PDF, distinguiendo numerales romanos", () => {
    expect(resolverCurso("Estructura Datos I", pdf.cursos, cursos)).toBe("650059");
    expect(resolverCurso("Estructura Datos II", pdf.cursos, cursos)).toBe("650061");
  });
  test("por nombre completo en BD cuando el PDF no lo trae, y ante empate gana el que tiene oferta", () => {
    expect(resolverCurso("Redes de Computadoras", pdf.cursos, cursos)).toBe("650015");
    expect(resolverCurso("Gest.Proyectos", pdf.cursos, cursos)).toBe("5674");
  });
  test("Seminario I vs II no se confunden", () => {
    expect(resolverCurso("Sem.Inves.I", pdf.cursos, cursos)).toBe("650035");
    expect(resolverCurso("Sem.Inves.II", pdf.cursos, cursos)).toBe("650040");
  });
  test("irresoluble → null", () => { expect(resolverCurso("Cosa Inexistente", pdf.cursos, cursos)).toBeNull(); });
});

describe("clasificarFila — qué entra y qué se retiene, con motivo", () => {
  const pdf = parsearHorarioPdf(PDF);
  const doc = bd({ id: 1, fullName: "PEREZ RAMIREZ JUAN CARLOS" });
  const base = { fila: 10, docente: "Perez Ramirez Juan Carlos", asignatura: "Estructura Datos I", dia: "Lunes", inicio: 9, fin: 10, ambiente: "I2-407", zoom: "https://z" };
  const ctx = (o: object = {}) => ({ docente: doc, code: "650059", pdf, cursos, ...o });

  test("respaldada: el PDF lo tiene dictando ese curso", () => {
    expect(clasificarFila(base, ctx())).toMatchObject({ estado: "cargar", categoria: "respaldada" });
  });
  test("sospechosa: docente y curso existen, pero el PDF pone a OTRO en ese curso", () => {
    const r = clasificarFila({ ...base, asignatura: "Devops" }, ctx({ code: "650084" }));
    expect(r).toMatchObject({ estado: "retener", categoria: "sospechosa" });
    expect(r.motivo).toContain("650084");
  });
  test("sin juez: el curso no aparece en el PDF, así que no se puede juzgar → entra", () => {
    expect(clasificarFila({ ...base, asignatura: "Gest.Proyectos" }, ctx({ code: "5674" })))
      .toMatchObject({ estado: "cargar", categoria: "sin_juez" });
  });
  test("seminarios de investigación: muchos asesores por sección, el PDF solo lista al titular → entra", () => {
    for (const code of CURSOS_MULTIASESOR) {
      expect(clasificarFila({ ...base, asignatura: "Sem" }, ctx({ code })).categoria).toBe("seminario");
    }
  });
  test("hora imposible (9→18) se retiene ANTES de mirar el PDF", () => {
    expect(clasificarFila({ ...base, fin: 18 }, ctx())).toMatchObject({ estado: "retener", categoria: "hora_invalida" });
    expect(clasificarFila({ ...base, fin: 9 }, ctx())).toMatchObject({ estado: "retener", categoria: "hora_invalida" });
  });
  test("docente que el PDF no menciona en ningún curso se retiene", () => {
    const r = clasificarFila({ ...base, docente: "Zapata Rondon Jose" }, ctx({ docente: bd({ id: 8, fullName: "ZAPATA RONDON JOSE" }) }));
    expect(r).toMatchObject({ estado: "retener", categoria: "docente_no_en_pdf" });
  });
  test("docente nuevo (no en BD) pero presente en el PDF → entra y se marca para crear", () => {
    const r = clasificarFila({ ...base, docente: "Salazar Pinto Carla", asignatura: "Devops" }, ctx({ docente: null, code: "650084" }));
    expect(r).toMatchObject({ estado: "cargar", categoria: "respaldada", crearDocente: "SALAZAR PINTO, CARLA" });
  });
  test("curso sin resolver o día inválido se retienen con su motivo", () => {
    expect(clasificarFila(base, ctx({ code: null })).categoria).toBe("curso_no_resuelto");
    expect(clasificarFila({ ...base, dia: "Feriado" }, ctx()).categoria).toBe("dia_invalido");
  });
});

describe("planificar — el plan completo que imprime el DRY-RUN", () => {
  const pdf = parsearHorarioPdf(PDF);
  const docentes = [bd({ id: 1, fullName: "PEREZ RAMIREZ JUAN CARLOS" }), bd({ id: 8, fullName: "ZAPATA RONDON JOSE" })];
  const atencion = [
    { fila: 10, docente: "Perez Ramirez Juan Carlos", asignatura: "Estructura Datos I", dia: "Lunes", inicio: 9, fin: 10, ambiente: "I2-407 (3)", zoom: "https://z/1" },
    { fila: 11, docente: "Perez Ramirez Juan Carlos", asignatura: "Devops", dia: "Martes", inicio: 9, fin: 10, ambiente: "I2-407 (3)", zoom: null },   // sospechosa
    { fila: 12, docente: "Salazar Pinto Carla", asignatura: "Devops", dia: "Jueves", inicio: 17, fin: 18, ambiente: "VIRTUAL", zoom: "https://z/2" }, // docente nueva
    { fila: 13, docente: "Zapata Rondon Jose", asignatura: "Devops", dia: "Jueves", inicio: 20, fin: 21, ambiente: "VIRTUAL", zoom: "https://z/3" }, // no en PDF
    { fila: 14, docente: "Perez Ramirez Juan Carlos", asignatura: "Estructura Datos I", dia: "Lunes", inicio: 9, fin: 10, ambiente: "I2-407 (3)", zoom: "https://z/1" }, // duplicada exacta
  ];
  const tesis = [{ fila: 3, docente: "PEREZ RAMIREZ JUAN CARLOS", dia: "LUNES", inicio: 14, fin: 15, ambiente: "Pab. O1", zoom: "https://z/t" }];
  const existentes = [
    { id: 900, offeringId: 18, teacherId: 1, dayOfWeek: 5, startTime: "10:00:00", tieneRsvp: false }, // ya no está en el Excel → borrar
    { id: 901, offeringId: 18, teacherId: 1, dayOfWeek: 5, startTime: "11:00:00", tieneRsvp: true },  // con RSVP → conservar
  ];
  const plan = planificar({ atencion, tesis, pdf, docentes, cursos, existentes });

  test("crea las respaldadas y las de tesis por triplicado (propuesta, seminario I y II)", () => {
    const codigos = plan.crear.map((s) => s.offeringId).sort();
    // fila 10 (650059→11), fila 12 (650084→18), tesis ×3 (16,14,15)
    expect(codigos).toEqual([11, 14, 15, 16, 18]);
    expect(plan.crear.filter((s) => s.nota === "Asesoría de tesis")).toHaveLength(3);
  });
  test("una fila duplicada en el Excel no produce dos sesiones (el índice único la rechazaría)", () => {
    expect(plan.crear.filter((s) => s.offeringId === 11)).toHaveLength(1);
    expect(plan.retener.some((r) => r.categoria === "duplicada" && r.fila === 14)).toBe(true);
  });
  test("retiene con motivo: sospechosa y docente ausente del PDF", () => {
    expect(plan.retener.map((r) => [r.fila, r.categoria])).toEqual(expect.arrayContaining([[11, "sospechosa"], [13, "docente_no_en_pdf"]]));
  });
  test("docentes nuevos, una sola vez, con su código PORTAL derivado", () => {
    expect(plan.docentesNuevos).toEqual([{ fullName: "SALAZAR PINTO CARLA", teacherCode: "PORTAL:CARLA-SALAZAR-PINTO", desde: "SALAZAR PINTO, CARLA" }]);
  });
  test("la misma docente nueva escrita con y sin tilde en dos filas es UNA y sus sesiones apuntan al mismo nombre", () => {
    const p2 = planificar({ atencion: [
      { fila: 1, docente: "Salazar Pinto Carla", asignatura: "Devops", dia: "Jueves", inicio: 17, fin: 18, ambiente: "VIRTUAL", zoom: "z" },
      { fila: 2, docente: "Sálazar Pinto Cárla", asignatura: "Devops", dia: "Viernes", inicio: 17, fin: 18, ambiente: "VIRTUAL", zoom: "z" },
    ], tesis: [], pdf, docentes: [], cursos, existentes: [] });
    expect(p2.docentesNuevos).toHaveLength(1);
    expect(new Set(p2.crear.map((s) => s.docenteNuevo)).size).toBe(1);
    expect(p2.crear[0].docenteNuevo).toBe(p2.docentesNuevos[0].fullName);
  });
  test("el plan expone a qué fila de teacher se resolvió cada nombre del Excel (para el human-gate)", () => {
    expect(plan.docentesResueltos).toEqual(expect.arrayContaining([
      expect.objectContaining({ nombreExcel: "Perez Ramirez Juan Carlos", id: 1, modo: "sembrado" }),
    ]));
  });
  test("la sesión de una docente nueva referencia su nombre, no un id que aún no existe", () => {
    const s = plan.crear.find((x) => x.offeringId === 18)!;
    expect(s.teacherId).toBeNull(); expect(s.docenteNuevo).toBe("SALAZAR PINTO CARLA");
  });
  test("borra las 2026-2 que ya no están en el Excel SOLO si no tienen RSVP", () => {
    expect(plan.borrar.map((b) => b.id)).toEqual([900]);
    expect(plan.conservarConRsvp.map((b) => b.id)).toEqual([901]);
  });
  test("modalidad y horas ya vienen listas para insertar", () => {
    const s = plan.crear.find((x) => x.offeringId === 11)!;
    expect(s).toMatchObject({ dayOfWeek: 1, startTime: "09:00:00", endTime: "10:00:00", modality: "hybrid", classroom: "I2-407 (3)", meetingUrl: "https://z/1" });
  });
});
