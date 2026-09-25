import { describe, expect, test } from "bun:test";
import ts from "typescript";

/**
 * RS-BE-35 (ajustada el 2026-09-25): el chatbot lee solo los bloques del
 * propio alumno, por una única función acotada.
 *
 * Hasta el 2026-09-23 esta prueba prohibía todo import de `time-blocks` desde
 * el chatbot. Por decisión del dueño del 2026-09-25, el chatbot puede leer los
 * bloques del alumno que pregunta (BR-CB-18 y BR-CB-19 de la spec del chatbot),
 * pero solo por `readOwnTimeBlocksForAssistant`, que exporta
 * `src/modules/time-blocks/index.ts`. El guardia queda así:
 *
 *   - Sigue recorriendo TODO `src/modules/chatbot/**\/*.ts` con `Bun.Glob`, y
 *     sigue prohibiendo los nombres de las tablas y del enum, en SQL y en
 *     camelCase: el chatbot no lee esas tablas por su cuenta.
 *   - De `time-blocks` permite un único origen, `../time-blocks/index.js`, y
 *     solo dos nombres, `readOwnTimeBlocksForAssistant` y `OwnTimeBlocksSummary`.
 *   - `readOwnTimeBlocksForAssistant` se importa como valor solo en
 *     `chatbot/index.ts`, que la inyecta por constructor. Los demás archivos la
 *     nombran, si hace falta, con una declaración `import type { … }`.
 *   - `OwnTimeBlocksSummary` se importa siempre con `import type { … }`,
 *     también en `chatbot/index.ts`.
 *   - El modificador en línea (`import { type … }`) no cuenta como importación
 *     de tipo: la declaración que lo usa es de valor y cae en las reglas de
 *     arriba.
 *   - Cualquier otra ruta de `time-blocks`, cualquier otro nombre, el import por
 *     defecto o de espacio de nombres, el de solo efecto, el dinámico, el
 *     `require`, el `export … from` y cualquier cadena que nombre
 *     `time-blocks` fuera de una declaración `import` fallan.
 *
 * La distinción entre valor y tipo sale de la FORMA de la declaración, así que
 * se lee con el analizador de TypeScript (`typescript`, que ya es dependencia
 * de desarrollo por `tsc`) y no con expresiones regulares sobre el texto: un
 * `import` de varias líneas, un comentario o una cadena no la confunden.
 *
 * Es un guardia, como el del récord (`test/HU34_jeff/chatbot-isolation.test.ts`,
 * RS-BE-28, que no cambia). Al final, un bloque de casos sintéticos comprueba
 * que el propio analizador muerde en cada forma prohibida.
 */

const DIRECTORIO = "src/modules/chatbot";
const INDEX_DEL_CHATBOT = `${DIRECTORIO}/index.ts`;

const ORIGEN_PERMITIDO = "../time-blocks/index.js";
const FUNCION = "readOwnTimeBlocksForAssistant";
const TIPO = "OwnTimeBlocksSummary";
const NOMBRES_PERMITIDOS = new Set([FUNCION, TIPO]);

/** Todos los `.ts` del módulo, con la ruta completa desde la raíz del repo. */
const ARCHIVOS: string[] = [];
for await (const ruta of new Bun.Glob("**/*.ts").scan(DIRECTORIO)) {
  ARCHIVOS.push(`${DIRECTORIO}/${ruta}`);
}
ARCHIVOS.sort();

// Los nombres SQL y los identificadores que tienen en schema.ts: con el
// constructor de consultas de Drizzle se puede leer una tabla sin escribir
// nunca su nombre SQL. `student_time_block` ya es prefijo de
// `student_time_block_exception`, y lo mismo pasa en camelCase; se listan las
// dos para que la lista diga en claro qué se protege. No se busca un prefijo
// más corto ("student_", "time"): el chatbot lee legítimamente otras tablas
// del alumno y habla de horas de clase.
const PROHIBIDOS = [
  "student_time_block",
  "student_time_block_exception",
  "time_block_exception_status",
  "studentTimeBlock",
  "studentTimeBlockException",
  "timeBlockExceptionStatusEnum",
];

const nombraTimeBlocks = (texto: string): boolean => texto.includes("time-blocks");

/**
 * `import type { … }` es la única forma que cuenta como importación de tipo.
 * Desde TypeScript 5.9 la marca vive en `phaseModifier`; `isTypeOnly` queda
 * como respaldo para versiones anteriores.
 */
const esDeclaracionDeTipo = (clausula: ts.ImportClause): boolean =>
  "phaseModifier" in clausula && clausula.phaseModifier !== undefined
    ? clausula.phaseModifier === ts.SyntaxKind.TypeKeyword
    : clausula.isTypeOnly === true;

const textoDeCadena = (nodo: ts.Node): string | null => {
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  if (ts.isTemplateHead(nodo) || ts.isTemplateMiddle(nodo) || ts.isTemplateTail(nodo)) return nodo.text;
  return null;
};

/**
 * Las violaciones de RS-BE-35 en el texto de un archivo del chatbot. Vacía si
 * el archivo cumple. Cada violación dice la línea y el motivo, para que el
 * fallo explique qué hay que cambiar.
 */
const violacionesDeImportacion = (ruta: string, texto: string): string[] => {
  const archivo = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violaciones: string[] = [];
  const especificadoresRevisados = new Set<ts.Node>();
  const linea = (nodo: ts.Node) => archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1;
  const falla = (nodo: ts.Node, motivo: string) => violaciones.push(`${ruta}:${linea(nodo)}: ${motivo}`);

  const revisarImport = (declaracion: ts.ImportDeclaration) => {
    const especificador = declaracion.moduleSpecifier;
    especificadoresRevisados.add(especificador);
    const origen = ts.isStringLiteral(especificador) ? especificador.text : "";
    const clausula = declaracion.importClause;

    // Los dos nombres permitidos solo pueden llegar desde el origen permitido:
    // si otro archivo los reexportara, esa sería una segunda puerta.
    if (!nombraTimeBlocks(origen)) {
      const enlaces = clausula?.namedBindings;
      if (enlaces && ts.isNamedImports(enlaces)) {
        for (const elemento of enlaces.elements) {
          const nombre = (elemento.propertyName ?? elemento.name).text;
          if (NOMBRES_PERMITIDOS.has(nombre)) {
            falla(elemento, `${nombre} solo se importa desde ${ORIGEN_PERMITIDO}, no desde "${origen}"`);
          }
        }
      }
      return;
    }

    if (origen !== ORIGEN_PERMITIDO) {
      falla(declaracion, `origen no permitido "${origen}": el único es ${ORIGEN_PERMITIDO}`);
      return;
    }
    if (!clausula) {
      falla(declaracion, `import de solo efecto de ${ORIGEN_PERMITIDO}`);
      return;
    }
    if (clausula.name) falla(clausula, "import por defecto de time-blocks");
    const enlaces = clausula.namedBindings;
    if (enlaces && ts.isNamespaceImport(enlaces)) {
      falla(enlaces, "import de espacio de nombres de time-blocks");
      return;
    }
    const elementos = enlaces && ts.isNamedImports(enlaces) ? enlaces.elements : [];
    if (!clausula.name && elementos.length === 0) {
      falla(declaracion, `import vacío de ${ORIGEN_PERMITIDO}, que solo sirve por su efecto`);
      return;
    }

    const deTipo = esDeclaracionDeTipo(clausula);
    for (const elemento of elementos) {
      const nombre = (elemento.propertyName ?? elemento.name).text;
      if (!NOMBRES_PERMITIDOS.has(nombre)) {
        falla(elemento, `nombre no permitido de time-blocks: ${nombre}`);
      } else if (nombre === TIPO && !deTipo) {
        falla(elemento, `${TIPO} se importa siempre con una declaración import type { … }`);
      } else if (nombre === FUNCION && !deTipo && ruta !== INDEX_DEL_CHATBOT) {
        falla(elemento, `${FUNCION} se importa como valor solo en ${INDEX_DEL_CHATBOT}; aquí va con import type { … }`);
      }
    }
  };

  const visitar = (nodo: ts.Node) => {
    if (ts.isImportDeclaration(nodo)) {
      revisarImport(nodo);
    } else if (ts.isExportDeclaration(nodo)) {
      const origen = nodo.moduleSpecifier && ts.isStringLiteral(nodo.moduleSpecifier) ? nodo.moduleSpecifier.text : "";
      if (nombraTimeBlocks(origen)) {
        if (nodo.moduleSpecifier) especificadoresRevisados.add(nodo.moduleSpecifier);
        falla(nodo, `export … from "${origen}": el chatbot no reexporta time-blocks`);
      }
      // `export { readOwnTimeBlocksForAssistant }` sin `from` también abriría
      // una segunda puerta.
      if (nodo.exportClause && ts.isNamedExports(nodo.exportClause)) {
        for (const elemento of nodo.exportClause.elements) {
          const nombre = (elemento.propertyName ?? elemento.name).text;
          if (NOMBRES_PERMITIDOS.has(nombre)) falla(elemento, `el chatbot no reexporta ${nombre}`);
        }
      }
    } else if (ts.isImportEqualsDeclaration(nodo)) {
      const referencia = nodo.moduleReference;
      if (ts.isExternalModuleReference(referencia) && ts.isStringLiteral(referencia.expression)) {
        if (nombraTimeBlocks(referencia.expression.text)) {
          especificadoresRevisados.add(referencia.expression);
          falla(nodo, `import = require("${referencia.expression.text}")`);
        }
      }
    } else if (!especificadoresRevisados.has(nodo)) {
      // Import dinámico, `require`, `import("…")` en un tipo o una ruta armada
      // en una variable: toda cadena que nombra time-blocks fuera de una
      // declaración import es una puerta lateral.
      const texto = textoDeCadena(nodo);
      if (texto !== null && nombraTimeBlocks(texto)) {
        falla(nodo, `cadena que nombra time-blocks fuera de una declaración import: "${texto}"`);
      }
    }
    ts.forEachChild(nodo, visitar);
  };

  visitar(archivo);
  return violaciones;
};

describe("RS-BE-35: el chatbot no lee las tablas de los bloques", () => {
  // Si el directorio desaparece o se queda sin archivos `.ts` (se renombra el
  // módulo entero), el guardia tiene que fallar por quedarse sin nada que
  // recorrer, no volverse verde por un `describe` sin pruebas adentro.
  test(`${DIRECTORIO} tiene al menos un archivo .ts para revisar`, () => {
    expect(ARCHIVOS.length).toBeGreaterThan(0);
    expect(ARCHIVOS).toContain(INDEX_DEL_CHATBOT);
  });

  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra las tablas de los bloques ni su enum`, async () => {
      // Si el archivo se renombra o se borra, Bun.file falla y el test también:
      // el guardia no se vuelve verde por desaparecer su objeto.
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });
  }
});

describe("RS-BE-35: de time-blocks, solo la función acotada y su tipo", () => {
  for (const ruta of ARCHIVOS) {
    test(`${ruta} importa de time-blocks solo lo permitido y en la forma permitida`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(violacionesDeImportacion(ruta, texto)).toEqual([]);
    });
  }

  test("chatbot/index.ts es la puerta: importa la función como valor desde ../time-blocks/index.js", async () => {
    const texto = await Bun.file(INDEX_DEL_CHATBOT).text();
    const archivo = ts.createSourceFile(INDEX_DEL_CHATBOT, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const deValor = archivo.statements.filter(
      (s): s is ts.ImportDeclaration =>
        ts.isImportDeclaration(s) &&
        ts.isStringLiteral(s.moduleSpecifier) &&
        s.moduleSpecifier.text === ORIGEN_PERMITIDO &&
        s.importClause !== undefined &&
        !esDeclaracionDeTipo(s.importClause),
    );
    const nombres = deValor.flatMap((s) => {
      const enlaces = s.importClause?.namedBindings;
      return enlaces && ts.isNamedImports(enlaces) ? enlaces.elements.map((e) => (e.propertyName ?? e.name).text) : [];
    });
    expect(nombres).toEqual([FUNCION]);
  });
});

describe("RS-BE-35: el analizador del guardia muerde (casos sintéticos)", () => {
  const OTRO = `${DIRECTORIO}/chatbot.service.ts`;

  const permitidos: Array<[string, string, string]> = [
    ["la función como valor en index.ts", INDEX_DEL_CHATBOT, `import { ${FUNCION} } from "${ORIGEN_PERMITIDO}";`],
    ["el tipo con import type en index.ts", INDEX_DEL_CHATBOT, `import type { ${TIPO} } from "${ORIGEN_PERMITIDO}";`],
    ["los dos con import type en otro archivo", OTRO, `import type {\n  ${TIPO},\n  ${FUNCION},\n} from "${ORIGEN_PERMITIDO}";`],
    ["la función con alias en una declaración de tipo", OTRO, `import type { ${FUNCION} as Leer } from "${ORIGEN_PERMITIDO}";`],
    ["un comentario que nombra time-blocks", OTRO, `// lee ../time-blocks/index.js por constructor\nconst x = 1;`],
    ["otros módulos", OTRO, `import { scheduleService } from "../schedule/index.js";`],
  ];

  for (const [nombre, ruta, codigo] of permitidos) {
    test(`permite: ${nombre}`, () => {
      expect(violacionesDeImportacion(ruta, codigo)).toEqual([]);
    });
  }

  const prohibidos: Array<[string, string, string]> = [
    ["la función como valor fuera de index.ts", OTRO, `import { ${FUNCION} } from "${ORIGEN_PERMITIDO}";`],
    ["la función con el modificador en línea fuera de index.ts", OTRO, `import { type ${FUNCION} } from "${ORIGEN_PERMITIDO}";`],
    ["el tipo como valor, incluso en index.ts", INDEX_DEL_CHATBOT, `import { ${TIPO} } from "${ORIGEN_PERMITIDO}";`],
    ["el tipo con el modificador en línea, incluso en index.ts", INDEX_DEL_CHATBOT, `import { ${FUNCION}, type ${TIPO} } from "${ORIGEN_PERMITIDO}";`],
    ["otro nombre del índice", INDEX_DEL_CHATBOT, `import { TimeBlocksService } from "${ORIGEN_PERMITIDO}";`],
    ["otro nombre del índice como tipo", OTRO, `import type { TimeBlockRule } from "${ORIGEN_PERMITIDO}";`],
    ["el repository", OTRO, `import type { TimeBlocksRepository } from "../time-blocks/time-blocks.repository.js";`],
    ["la lógica", INDEX_DEL_CHATBOT, `import { expandOccurrences } from "../time-blocks/time-blocks.logic.js";`],
    ["el índice sin extensión", INDEX_DEL_CHATBOT, `import { ${FUNCION} } from "../time-blocks";`],
    ["import por defecto", INDEX_DEL_CHATBOT, `import bloques from "${ORIGEN_PERMITIDO}";`],
    ["espacio de nombres", INDEX_DEL_CHATBOT, `import * as bloques from "${ORIGEN_PERMITIDO}";`],
    ["espacio de nombres de tipo", OTRO, `import type * as bloques from "${ORIGEN_PERMITIDO}";`],
    ["import vacío", OTRO, `import {} from "${ORIGEN_PERMITIDO}";`],
    ["import de solo efecto", OTRO, `import "${ORIGEN_PERMITIDO}";`],
    ["import dinámico", OTRO, `const m = await import("${ORIGEN_PERMITIDO}");`],
    ["import dinámico de otra ruta", OTRO, `const m = await import("../time-blocks/time-blocks.service.js");`],
    ["require", OTRO, `const m = require("${ORIGEN_PERMITIDO}");`],
    ["import = require", OTRO, `import m = require("${ORIGEN_PERMITIDO}");`],
    ["import() en un tipo", OTRO, `type R = import("${ORIGEN_PERMITIDO}").${TIPO};`],
    ["una ruta armada en una variable", OTRO, "const ruta = `../time-blocks/${'index'}.js`;"],
    ["export … from", INDEX_DEL_CHATBOT, `export { ${FUNCION} } from "${ORIGEN_PERMITIDO}";`],
    ["export type … from", OTRO, `export type { ${TIPO} } from "${ORIGEN_PERMITIDO}";`],
    ["export * from", OTRO, `export * from "${ORIGEN_PERMITIDO}";`],
    ["reexportar la función ya importada", INDEX_DEL_CHATBOT, `import { ${FUNCION} } from "${ORIGEN_PERMITIDO}";\nexport { ${FUNCION} };`],
    ["traer la función por otra puerta", OTRO, `import { ${FUNCION} } from "./index.js";`],
    ["traer el tipo por otra puerta", OTRO, `import type { ${TIPO} } from "./chatbot.types.js";`],
  ];

  for (const [nombre, ruta, codigo] of prohibidos) {
    test(`rechaza: ${nombre}`, () => {
      expect(violacionesDeImportacion(ruta, codigo).length).toBeGreaterThan(0);
    });
  }
});
