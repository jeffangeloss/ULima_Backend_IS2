# Récord académico (backend) — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** Guardar en ULima++ la copia completa del récord académico que la sincronización ya descarga y hoy tira —solo con el consentimiento del alumno y solo si el récord cuadra con su propio pie—, mostrársela únicamente a su dueño, dejar que la borre cuando quiera y usarla para desmarcar los electivos aprobados falsos que dejó la carga inicial de la malla.

**Arquitectura:** Los parsers de `portal-sync` dejan de leer la página entera y pasan a ubicar por cabecera validada la tabla del récord y la del pie (`parseRecordPage` devuelve filas, descartes y pie), mientras `parseInfoAcademica` se amplía con la información general y la del bloque por período; todo lo que decide —confianza del récord, bloqueos de la limpieza, armado del DTO— vive en funciones puras de `src/modules/academic-record/academic-record.logic.ts`, que no importan `db`. La escritura se cuelga de la transacción que ya existe en `portal-sync.service.ts`, detrás de una única guarda `guardarRecord = consent && confianza.ok`, con un `pg_advisory_xact_lock` por alumno y cinco métodos nuevos del `PortalSyncRepository` que reemplazan enteras la copia y el resumen por ciclo, hacen upsert de la foto y borran los electivos sin respaldo. La lectura es un módulo `academic-record` nuevo con la plantilla del repo (routes → controller → service → repository, auth, roles de alumno, `Cache-Control: no-store` y `studentId` tomado solo del token) sobre las tres tablas de la migración 0011, que no tienen relación con la malla vigente.

**Stack:** Bun + TypeScript + Hono + Drizzle ORM + PostgreSQL (Neon) + Zod

**Spec:** `specs/features/academic-record/academic-record.spec.md` (y la contraparte en el otro repo: `ULima_Frontend_IS2/specs/features/academic-record/academic-record.spec.md`)

**Repo y rama:** `.`, rama `feat/record-academico`

## Restricciones globales

- **Variables de los comandos.** Los comandos de este plan usan `$BUN` y `$TMP` para no fijar rutas de una maquina concreta. `$BUN` es tu ejecutable de Bun; si no lo tienes instalado, `npm install --prefix /tmp/bunhome bun` y entonces `export BUN=/tmp/bunhome/node_modules/.bin/bun`. `$TMP` es cualquier carpeta temporal para salidas de prueba. Las rutas relativas son desde la raiz de este repo.
- Español en comentarios, nombres de test y mensajes de commit. Nombres de test sin tildes, como el resto del repo.
- Commits: el autor ya está configurado en git (Jeffangeloss, noreply de GitHub). **Sin** trailer Co-Authored-By. Un commit por tarea con `git add` explícito de los archivos de esa tarea. Formato `feat(academic-record): …`, `test(academic-record): …`, `docs(academic-record): …`.
- No hacer push ni abrir PR: lo decide el dueño. Si alguna vez se hace: `git push origin feat/record-academico`, nunca `git push` a secas.
- Repo PÚBLICO: ningún dato real. Alumno sintético `20230001`. Fixtures HU34 con valores inventados. **Prohibido** reutilizar `test/HU31_jeff/fixtures/record.html` o `layout.html` en pruebas HU34 (tienen notas reales), y copiar valores de `spike-portal/`.
- Build: `bun run build` (= `tsc`, solo compila `src/`). Tras cada tarea que toque `src/`.
- Tests: bun no está en PATH. Comando SIEMPRE con este prefijo, porque el `.env` del worktree apunta a la base de PRODUCCIÓN y bun lo carga solo:
  `DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test <ruta>`
  (el build igual: `…/bunhome/node_modules/.bin/bun run build`).
- Nunca `db:push`, `db:migrate`, `db:generate`, `db:seed` ni `db:apply`. La migración 0011 se escribe y se prueba estáticamente; aplicarla es del dueño (paso PARAR de la última tarea).
- Toda prueba que importe algo que cargue `src/db/index.ts` (rutas, auth-middleware, módulos) hace `mock.module("../../src/db/index.js", () => ({ db: … }))` ANTES de cualquier `await import(...)`; los imports de esos módulos son dinámicos.
- Arquitectura routes → controller → service → repository. Los services no importan `db`. Zod para bodies. Nunca exponer secretos.
- Plantilla `sql` de Drizzle: nunca interpolar un arreglo JS (`${[1,2]}` se vuelve `($1,$2)` → error 42809). Enteros con `intArray` (privado de `portal-sync.repository.ts:31`), textos con `any(select json_array_elements_text(${JSON.stringify(xs)}::json))`, lotes con `json_array_elements(${payload}::json) as x`.
- `numeric` llega de Postgres como string y `timestamptz` como string: el repository convierte con `x == null ? null : Number(x)` y `new Date(x)`. 0 no es null.
- Logs: `console.warn("[portal-sync] …")` con el motivo; nunca notas, nombres ni código de alumno (el `studentId` interno sí).
- Texto que ve el alumno: solo el de la spec. Único texto nuevo: el warning `PROGRESS_REMOVED`.

## Estructura de archivos

| ruta | acción | responsabilidad |
|:---|:---|:---|
| `specs/features/academic-record/academic-record.spec.md` | modificar | targets (+ `parsers/html.ts`, `portal-sync.controller.ts`, `auth.controller.ts`), las dos viñetas de RS-BE-19 (modo compatible y quinto motivo de descarte) y `[@test]` que falten — **todo con PARAR: la spec está aprobada** |
| `src/modules/portal-sync/parsers/html.ts` | modificar | `normalizeCareerName` (movida acá, sin cambios) y `normalizeLabel` |
| `src/modules/portal-sync/parsers/record.ts` | modificar | `parseRecordPage` (tabla + pie + descartes), `recordRows`, `parseRecordAcademico` (envoltorio compatible) |
| `src/modules/portal-sync/parsers/info-academica.ts` | modificar | `parseInfoAcademica` amplía con información general y por período |
| `src/modules/portal-sync/portal-sync.types.ts` | modificar | `RecordRow` + `gradeRaw`/`observation`; `RecordFooter`, `RecordPage`, `CountCredits`, `AcademicGeneral`, `AcademicPeriodBlock`, `InfoAcademica` ampliada; `WarningCode` + `PROGRESS_REMOVED`; `ImportSummary` + `progressRemoved` |
| `src/modules/portal-sync/portal-sync.repository.ts` | modificar | re-exporta `normalizeCareerName`; métodos nuevos con `tx`: `lockAcademicRecord`, `replaceRecordEntries`, `upsertAcademicSnapshot`, `replacePeriodSummaries`, `deleteUnbackedElectives` |
| `src/modules/portal-sync/portal-sync.schemas.ts` | modificar | `consent` opcional en `importSchema` |
| `src/modules/portal-sync/portal-sync.controller.ts` | modificar | pasa `consent` al service |
| `src/modules/portal-sync/portal-sync.service.ts` | modificar | `consent` en `entrada`; parseo de página; regla de confianza; candado; guardar copia/foto/resumen; limpieza de electivos; `PROGRESS_REMOVED` |
| `src/modules/auth/auth.schemas.ts`, `auth.controller.ts`, `auth.service.ts` | modificar | `consent` en el registro y en el tipo `Registrar` |
| `src/modules/academic-record/academic-record.logic.ts` | crear | funciones puras: `evaluateRecordTrust`, `cleanupBlockers`, `progressRemovedMessage`, `buildAcademicRecordDto` |
| `src/modules/academic-record/academic-record.types.ts` | crear | tipos de filas leídas y DTO del contrato |
| `src/modules/academic-record/academic-record.repository.ts` | crear | lecturas y borrado de las tres tablas |
| `src/modules/academic-record/academic-record.service.ts` | crear | `getMine`, `deleteMine` |
| `src/modules/academic-record/academic-record.controller.ts` | crear | adapta HTTP; `studentId` solo del token |
| `src/modules/academic-record/academic-record.routes.ts` | crear | auth + roles de alumno + `Cache-Control: no-store`; `GET /me`, `DELETE /me` |
| `src/modules/academic-record/index.ts` | crear | ensamblado del módulo |
| `src/modules/index.ts` | modificar | `app.route("/academic-record", academicRecordRoutes)` |
| `src/db/schema/schema.ts` | modificar | las tres tablas nuevas |
| `drizzle/0011_academic_record.sql` | crear | migración aditiva e idempotente |
| `test/HU34_jeff/fixtures/record.html`, `test/HU34_jeff/fixtures/layout.html` | crear | fixtures inventados con estructura fiel |
| `test/HU34_jeff/*.test.ts` | crear | ver cada tarea |
| `test/HU31_jeff/parsers.info.test.ts` | modificar | la aserción de claves de `InfoAcademica` |
| `docs/specs/api-contracts.md`, `docs/specs/feature-index.md`, `specs/features/portal-sync/portal-sync.spec.md`, `specs/features/registro/registro.spec.md` | modificar | "Cambios en otras specs" |

## Orden y cobertura

| requisito | tareas |
|:---|:---|
| RS-BE-19 | 1 |
| RS-BE-20 | 1 |
| RS-BE-21 | 2, 6 |
| RS-BE-22 | 4, 5, 6, 8 |
| RS-BE-23 | 5, 7 |
| RS-BE-24 | 3, 6 |
| RS-BE-25 | 4, 5, 6 |
| RS-BE-26 | 9 |
| RS-BE-27 | 9 |
| RS-BE-28 | 9 |
| RS-BE-29 | 6, 8 |
| Modelo de datos (0011) | 4, 10 |
| Contrato (tipos, periods, consent) | 6, 8, 9 |
| Fixtures inventados | 1, 3 |
| Cambios en otras specs: portal-sync.spec.md | 3, 6, 7 |
| Cambios en otras specs: registro.spec.md | 8 |
| Cambios en otras specs: api-contracts.md | 6, 7, 8, 9 |
| Cambios en otras specs: feature-index.md | 9 |

---

### Tarea 1: Normalizador de rótulos y lector del récord (RS-BE-19, RS-BE-20)

**Archivos:**
- Modificar: `specs/features/academic-record/academic-record.spec.md:6-13` (bloque `targets` del frontmatter: agrega `parsers/html.ts`, `portal-sync.controller.ts` y `auth.controller.ts`; no cambia ningún comportamiento) y `:64-67` y `:77-80` (las dos viñetas de RS-BE-19 que el Paso 3f pone al día con lo que el parser hace). **Los tres cambios tocan una spec APROBADA y llevan PARAR: el dueño los aprueba antes de escribirlos.**
- Modificar: `src/modules/portal-sync/portal-sync.types.ts:19-22` (`RecordRow`, más `RecordFooter` y `RecordPage` nuevos)
- Modificar: `src/modules/portal-sync/parsers/html.ts:35-37` (inserción después de `cellsOf`: `normalizeCareerName` movida y `normalizeLabel` nueva)
- Modificar: `src/modules/portal-sync/portal-sync.repository.ts:3` (import) y `:230-237` (la definición de `normalizeCareerName` pasa a ser un re-export)
- Modificar: `src/modules/portal-sync/parsers/record.ts:1-42` (se reemplaza el archivo entero)
- Crear: `test/HU34_jeff/fixtures/record.html`
- Test: `test/HU34_jeff/record-parser.test.ts`

**Interfaces:**
- Consume (repo actual, firmas exactas):
  - `src/modules/portal-sync/parsers/html.ts:2`: `export type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string };`
  - `src/modules/portal-sync/parsers/html.ts:29`: `export const trsOf = (html: string): string[]` (regex `/<tr[\s\S]*?<\/tr>/gi`)
  - `src/modules/portal-sync/parsers/html.ts:36-37`: `export const cellsOf = (tr: string): string[]`. Devuelve `clean(stripTags(td))` de cada `<td>`/`<th>`. `clean` (`:25-26`) decodifica `&nbsp;` a espacio y recorta, así que una celda `&nbsp;` llega como `""`. Su regex `<t[dh]` también atrapa `<thead`, por eso se aplica a una `<tr>` y nunca a una tabla entera.
  - `src/modules/portal-sync/portal-sync.repository.ts:234-237`: `export const normalizeCareerName = (name: string): string`. Esta tarea la mueve. `careerNamesDiffer` (`:240-243`) es su único uso en `src/`; ninguna prueba la importa por su nombre.
- Produce (las tareas 2, 3, 5 y 6 lo usan tal cual):
  ```ts
  // parsers/html.ts
  export const normalizeCareerName = (name: string): string  // MOVIDA sin cambios desde el repository (mismo cuerpo)
  export const normalizeLabel = (s: string): string
  //   normalizeCareerName(s).replace(/[^A-Z0-9. ]/g, " ").replace(/\s+/g, " ").trim()
  // portal-sync.repository.ts: import { normalizeCareerName } from "./parsers/html.js"; export { normalizeCareerName };
  //   (careerNamesDiffer y el service siguen importando del repository, sin cambios)

  // portal-sync.types.ts
  export interface RecordRow {
    periodCode: string; courseCode: string; courseName: string;
    attempt: number; credits: number; grade: number | null; sectionCode: string;
    gradeRaw: string | null; observation: string | null;
  }
  export interface RecordFooter {
    weightedAverage: number; convalidatedCredits: number; approvedCredits: number; validCredits: number;
    convalidatedCourses: number; approvedCourses: number; validCourses: number;
    failedCredits: number; failedCourses: number;
  }
  export interface RecordPage {
    rows: RecordRow[];            // filas leídas
    headerOk: boolean;            // se halló la tabla con la cabecera exacta y se leyó solo esa tabla
    discarded: number;            // filas de datos descartadas (solo se cuentan con headerOk)
    footer: RecordFooter | null;  // null = pie ausente o ilegible
  }

  // parsers/record.ts
  export const RECORD_HEADER: readonly string[] =
    ["CICLO","COD.","ASIGNATURA","VIG.","FAC.","VEZ","CRD.","NOTA","SEC.","TOMO","FOLIO","OBSERVACION"];
  export const FOOTER_HEADER: readonly string[] =
    ["COD. CAR.","PROM. POND.","CRD. CONV.","CRD. APROB.","TOTAL CRD. VALIDOS","ASIG. CONV.","ASIG. APR.","TOTAL ASIG. VALIDOS","CRD. DESAP.","ASIG. DESAP."];
  export const labelMatches = (actual: string, expected: string): boolean
  export const parseRecordPage = (html: string): RecordPage   // nunca lanza
  export const recordRows = (page: RecordPage): ParseResult<RecordRow[]>
  //   rows.length ? { ok: true, data: rows } : { ok: false, reason: "no se encontraron filas de récord" }
  export const parseRecordAcademico = (html: string): ParseResult<RecordRow[]>  // = recordRows(parseRecordPage(html))
  ```
  `src/modules/portal-sync/parsers/index.ts` **no se toca**. Sigue exportando `parseRecordAcademico` (`:6`) y, por `export * from "./html.js"` (`:1`), también las dos funciones nuevas de `html.ts`. Las tareas posteriores importan `parseRecordPage` y `recordRows` directamente de `./parsers/record.js`. No se agregan a `index.ts` porque `scripts/verificar-readme.py:68` cuenta los `parse[A-Z]\w*` de ese archivo y el README cita esa cifra.

Todos los comandos se corren desde la raíz del worktree: las pruebas abren los fixtures con rutas relativas al cwd. Bun no está en el PATH. El prefijo `DATABASE_URL=…` es obligatorio porque el `.env` del worktree apunta a PRODUCCIÓN. No abras ni imprimas `.env`.

- [ ] **Paso 0: Medir la línea base de la suite (antes de tocar nada)**

```bash
cd . && git status --short && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test 2>&1 | tail -6
```

Esperado: `git status --short` vacío (el árbol está limpio y la rama es `feat/record-academico`). El resumen debería rondar las 1217 pruebas en verde y 0 fail, sobre los 99 `*.test.ts` que hoy tiene `test/`. Anota las cifras exactas de `pass`, `fail` y `Ran N tests across K files` en el plan de ejecución: la Tarea 10 las compara contra la suite final.

- [ ] **Paso 1: Escribir el fixture inventado y la prueba que falla**

Crea `test/HU34_jeff/fixtures/record.html` (la carpeta `test/HU34_jeff/` todavía no existe) en UTF-8 **sin BOM y en forma NFC** —tildes precompuestas, `Ó` = U+00D3 y `Á` = U+00C1, no `O` + U+0301—, con las tildes literales. El archivo de prueba compara contra esos caracteres, unas veces escritos con escape (`Ó`) y otras literales (`"MATEMÁTICA DE PRUEBA"`): si el fixture o el test quedaran en NFD, `variante` fallaría con "el HTML no contiene: …". El fixture tiene la estructura de la página real: dos `<table>` sin anidar con la misma clase, la celda CICLO con `&nbsp;` en las filas de continuación, celdas en varias líneas y un pie de 10 columnas. Todos los valores son inventados:
- un curso jalado en VEZ 1 (08) y aprobado en VEZ 2 (12);
- un crédito de 1.5 con una observación con texto;
- el ciclo 2026-2 en curso, sin nota;
- un pie coherente: 3 aprobadas que suman 8.5 créditos, 1 desaprobada de 4.0 créditos y promedio ponderado (8·4 + 14·3 + 12·4 + 17·1.5) / 12.5 = 147.5 / 12.5 = 11.8.

**Prohibido** copiar `test/HU31_jeff/fixtures/record.html` o datos de `spike-portal/`: tienen notas reales.

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <meta http-equiv="Pragma" content="no-cache">
    <meta http-equiv="Expires" content="0">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Record Académico del Alumno - Universidad de Lima</title>
</head>
<body>
<div class="container-fluid">
    <div class="row ulima-header align-items-center">
        <div class="col-md-2 text-center text-md-start">
            <a href="https://www.ulima.edu.pe/"><img src="logo.png" alt="logo"></a>
        </div>
        <div class="col-md-10 text-center text-md-start">
            <div class="ulima-title text-center text-md-start">RECORD ACADÉMICO DEL ALUMNO</div>
            <div class="ulima-subtitle">DOCUMENTO REFERENCIAL NO OFICIAL</div>
        </div>
    </div>
    <div class="card ul-card shadow-sm mb-4">
        <div class="card-body">
            <div class="row">
                <p><strong>NOMBRE:</strong> ALUMNO DE PRUEBA</p>
                <p><strong>CARRERA:</strong> INGENIERÍA INDUSTRIAL</p>
            </div>
        </div>
    </div>

    <div class="card shadow-sm mb-4">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                    <tr class="text-center">
                        <th>CICLO</th>
                        <th>COD.</th>
                        <th>ASIGNATURA</th>
                        <th>VIG.</th>
                        <th>FAC.</th>
                        <th>VEZ</th>
                        <th>CRD.</th>
                        <th>NOTA</th>
                        <th>SEC.</th>
                        <th>TOMO</th>
                        <th>FOLIO</th>
                        <th>OBSERVACIÓN</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td class="text-center" style="white-space: nowrap;">

                            2023-1

                        </td>
                        <td class="text-center">659001</td>
                        <td>MATEMÁTICA DE PRUEBA</td>
                        <td class="text-center">
                            659001
                        </td>
                        <td class="text-center">100200</td>
                        <td class="text-center">1</td>
                        <td class="text-center">4.0</td>
                        <td class="text-center">

                            08

                        </td>
                        <td class="text-center">101</td>
                        <td class="text-center">0101</td>
                        <td class="text-center">0021</td>
                        <td>

                            &nbsp;

                        </td>
                    </tr>
                    <tr>
                        <td class="text-center" style="white-space: nowrap;">
                            &nbsp;

                        </td>
                        <td class="text-center">4901</td>
                        <td>LENGUAJE DE PRUEBA</td>
                        <td class="text-center">
                            4901
                        </td>
                        <td class="text-center">100200</td>
                        <td class="text-center">1</td>
                        <td class="text-center">3.0</td>
                        <td class="text-center">

                            14

                        </td>
                        <td class="text-center">102</td>
                        <td class="text-center">0101</td>
                        <td class="text-center">0022</td>
                        <td>

                            &nbsp;

                        </td>
                    </tr>
                    <tr>
                        <td class="text-center" style="white-space: nowrap;">

                            2023-2

                        </td>
                        <td class="text-center">659001</td>
                        <td>MATEMÁTICA DE PRUEBA</td>
                        <td class="text-center">
                            659001
                        </td>
                        <td class="text-center">100200</td>
                        <td class="text-center">2</td>
                        <td class="text-center">4.0</td>
                        <td class="text-center">

                            12

                        </td>
                        <td class="text-center">201</td>
                        <td class="text-center">0102</td>
                        <td class="text-center">0010</td>
                        <td>

                            &nbsp;

                        </td>
                    </tr>
                    <tr>
                        <td class="text-center" style="white-space: nowrap;">
                            &nbsp;

                        </td>
                        <td class="text-center">659002</td>
                        <td>TALLER DE PRUEBA</td>
                        <td class="text-center">
                            659002
                        </td>
                        <td class="text-center">100200</td>
                        <td class="text-center">1</td>
                        <td class="text-center">1.5</td>
                        <td class="text-center">

                            17

                        </td>
                        <td class="text-center">917</td>
                        <td class="text-center">0102</td>
                        <td class="text-center">0011</td>
                        <td>

                            OBSERVACIÓN DE PRUEBA

                        </td>
                    </tr>
                    <tr>
                        <td class="text-center" style="white-space: nowrap;">

                            2026-2

                        </td>
                        <td class="text-center">659003</td>
                        <td>CURSO EN CURSO UNO</td>
                        <td class="text-center">

                            659003

                        </td>
                        <td class="text-center">100200</td>
                        <td class="text-center">1</td>
                        <td class="text-center">3.0</td>
                        <td class="text-center">
                            &nbsp;
                        </td>
                        <td class="text-center">301</td>
                        <td class="text-center">&nbsp;</td>
                        <td class="text-center">&nbsp;</td>
                        <td>

                        </td>
                    </tr>
                    <tr>
                        <td class="text-center" style="white-space: nowrap;">
                            &nbsp;

                        </td>
                        <td class="text-center">659004</td>
                        <td>CURSO EN CURSO DOS</td>
                        <td class="text-center">

                            659004

                        </td>
                        <td class="text-center">100200</td>
                        <td class="text-center">1</td>
                        <td class="text-center">4.0</td>
                        <td class="text-center">
                            &nbsp;
                        </td>
                        <td class="text-center">1302</td>
                        <td class="text-center">&nbsp;</td>
                        <td class="text-center">&nbsp;</td>
                        <td>

                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="card shadow-sm mb-4">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                    <tr class="text-center">
                        <th>COD. CAR.</th>
                        <th>PROM. POND.</th>
                        <th>CRD. CONV.</th>
                        <th>CRD. APROB.</th>
                        <th>TOTAL CRD. VÁLIDOS</th>
                        <th>ASIG. CONV.</th>
                        <th>ASIG. APR.</th>
                        <th>TOTAL ASIG. VÁLIDOS</th>
                        <th>CRD. DESAP.</th>
                        <th>ASIG. DESAP.</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td style="white-space: nowrap;">
                            0001

                        </td>

                        <td class="text-center">
                            11.8000
                        </td>

                        <td class="text-center">
                            0.0
                        </td>

                        <td class="text-center">
                            8.5
                        </td>

                        <td class="text-center">
                            8.5
                        </td>

                        <td class="text-center">0</td>
                        <td class="text-center">3</td>
                        <td class="text-center">3</td>

                        <td class="text-center">
                            4.0
                        </td>

                        <td class="text-center">1</td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="d-flex justify-content-between align-items-center footer-links mb-4">
        <a class="btn btn-plomo text-white" href="ComandoListarResumenAcademico?Origen=">Ver resumen del Record Académico</a>
        <a href="javascript:window.close()" class="btn btn-ulima text-white">Cerrar</a>
    </div>
</div>
</body>
</html>
```

Las variantes se arman dentro de la prueba y dependen de que estos fragmentos aparezcan **exactamente una vez** en el fixture (el HTML de arriba cumple los doce; `variante` lo verifica y falla nombrando el fragmento si el fixture cambia):
- `2023-1`, `2023-2`, `11.8000`
- `<td class="text-center">0022</td>`, `<td class="text-center">4901</td>`, `<td class="text-center">2</td>`, `<td class="text-center">1.5</td>`
- `<th>NOTA</th>`, `<th>TOMO</th>`, `<th>ASIG. APR.</th>`, `<th>OBSERVACIÓN</th>`, `<th>TOTAL CRD. VÁLIDOS</th>`, `<th>TOTAL ASIG. VÁLIDOS</th>`

Crea `test/HU34_jeff/record-parser.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { normalizeCareerName, normalizeLabel } from "../../src/modules/portal-sync/parsers/html.js";
import {
  FOOTER_HEADER, RECORD_HEADER, labelMatches, parseRecordAcademico, parseRecordPage, recordRows,
} from "../../src/modules/portal-sync/parsers/record.js";
import type { RecordFooter, RecordRow } from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-19 y RS-BE-20 (specs/features/academic-record/academic-record.spec.md).
 *
 * El fixture es INVENTADO: el repo es público y el fixture de récord de HU31
 * trae notas reales, así que aquí no se usa. Copia la ESTRUCTURA de la página del
 * portal (tabla de 12 columnas con la celda CICLO vacía en las filas de
 * continuación, pie de 10 columnas) con valores de prueba: un curso jalado en VEZ 1
 * y aprobado en VEZ 2, un crédito 1.5, una observación con texto y el ciclo en curso
 * sin nota. Las variantes se arman en cada prueba con `variante`.
 */
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();

/** Reemplaza un fragmento que TIENE que estar UNA vez en el HTML: si el fixture
 *  cambia, la prueba falla aquí nombrando el fragmento, no con un conteo raro más
 *  abajo. La unicidad se exige porque `String.replace` con una cadena solo cambia
 *  la primera aparición. */
const variante = (html: string, antes: string, despues: string): string => {
  const i = html.indexOf(antes);
  if (i < 0) throw new Error(`el HTML no contiene: ${antes}`);
  if (html.indexOf(antes, i + 1) >= 0) throw new Error(`el HTML lo contiene mas de una vez: ${antes}`);
  return html.slice(0, i) + despues + html.slice(i + antes.length);
};

/** La página sin la tabla del pie (la segunda `<table>`). */
const sinPie = (html: string): string => {
  const inicio = html.indexOf("<table", html.indexOf("</table>"));
  const fin = html.indexOf("</table>", inicio) + "</table>".length;
  return html.slice(0, inicio) + html.slice(fin);
};

// Rótulos con tilde escritos con escapes, para que ningún editor los recomponga.
const TH_OBSERVACION = "<th>OBSERVACIÓN</th>";          // OBSERVACIÓN
const TH_CRD_VALIDOS = "<th>TOTAL CRD. VÁLIDOS</th>";    // TOTAL CRD. VÁLIDOS
const TH_ASIG_VALIDOS = "<th>TOTAL ASIG. VÁLIDOS</th>";  // TOTAL ASIG. VÁLIDOS

/** UTF-8 leído como windows-1252 (lo que hace `TextDecoder("iso-8859-1")`):
 *  Ó (C3 93) llega como "Ã“" y Á (C3 81) como "Ã" + U+0081. */
const conMojibakeWindows1252 = (html: string): string =>
  variante(variante(variante(html,
    TH_OBSERVACION, "<th>OBSERVACIÃ“N</th>"),
    TH_CRD_VALIDOS, "<th>TOTAL CRD. VÃLIDOS</th>"),
    TH_ASIG_VALIDOS, "<th>TOTAL ASIG. VÃLIDOS</th>");

/** ISO-8859-1 leído como UTF-8: la letra con tilde llega como U+FFFD. */
const conCaracterDeReemplazo = (html: string): string =>
  variante(variante(variante(html,
    TH_OBSERVACION, "<th>OBSERVACI�N</th>"),
    TH_CRD_VALIDOS, "<th>TOTAL CRD. V�LIDOS</th>"),
    TH_ASIG_VALIDOS, "<th>TOTAL ASIG. V�LIDOS</th>");

const FILAS_DEL_FIXTURE: RecordRow[] = [
  { periodCode: "2023-1", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 1, credits: 4,
    grade: 8, sectionCode: "101", gradeRaw: "08", observation: null },
  { periodCode: "2023-1", courseCode: "4901", courseName: "LENGUAJE DE PRUEBA", attempt: 1, credits: 3,
    grade: 14, sectionCode: "102", gradeRaw: "14", observation: null },
  { periodCode: "2023-2", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 2, credits: 4,
    grade: 12, sectionCode: "201", gradeRaw: "12", observation: null },
  { periodCode: "2023-2", courseCode: "659002", courseName: "TALLER DE PRUEBA", attempt: 1, credits: 1.5,
    grade: 17, sectionCode: "917", gradeRaw: "17", observation: "OBSERVACIÓN DE PRUEBA" },
  { periodCode: "2026-2", courseCode: "659003", courseName: "CURSO EN CURSO UNO", attempt: 1, credits: 3,
    grade: null, sectionCode: "301", gradeRaw: null, observation: null },
  { periodCode: "2026-2", courseCode: "659004", courseName: "CURSO EN CURSO DOS", attempt: 1, credits: 4,
    grade: null, sectionCode: "1302", gradeRaw: null, observation: null },
];

const PIE_DEL_FIXTURE: RecordFooter = {
  weightedAverage: 11.8, convalidatedCredits: 0, approvedCredits: 8.5, validCredits: 8.5,
  convalidatedCourses: 0, approvedCourses: 3, validCourses: 3, failedCredits: 4, failedCourses: 1,
};

describe("normalizeLabel", () => {
  test("quita tildes, pasa a mayusculas y colapsa espacios", () => {
    expect(normalizeLabel("OBSERVACIÓN")).toBe("OBSERVACION");
    expect(normalizeLabel("Observación")).toBe("OBSERVACION");
    expect(normalizeLabel("  total  crd.   válidos ")).toBe("TOTAL CRD. VALIDOS");
    expect(normalizeLabel("COD. CAR.")).toBe("COD. CAR.");
  });

  test("todo lo que no es letra, digito, punto o espacio sale y se vuelve a recortar", () => {
    expect(normalizeLabel("Relativa (*)")).toBe("RELATIVA");
    expect(normalizeLabel("Ubicación Relativa (*)")).toBe("UBICACION RELATIVA");
    expect(normalizeLabel("OBSERVACIÃ“N")).toBe("OBSERVACIA N");
  });

  test("normalizeCareerName se muda a html.ts sin cambiar lo que hace", () => {
    expect(normalizeCareerName("Ingeniería  de   Sistemas ")).toBe("INGENIERIA DE SISTEMAS");
    // No quita signos: eso es solo de normalizeLabel.
    expect(normalizeCareerName("Relativa (*)")).toBe("RELATIVA (*)");
  });
});

describe("labelMatches", () => {
  test("los rotulos comunes se comparan por igualdad", () => {
    expect(labelMatches("Cod.", "COD.")).toBe(true);
    expect(labelMatches("COD", "COD.")).toBe(false);
    expect(labelMatches("NOTA", "TOMO")).toBe(false);
  });

  test("OBSERVACION se compara por el prefijo OBSERVACI, tambien con mojibake", () => {
    expect(labelMatches("OBSERVACIÓN", "OBSERVACION")).toBe(true);
    expect(labelMatches("OBSERVACIÃ“N", "OBSERVACION")).toBe(true);
    expect(labelMatches("OBSERVACI�N", "OBSERVACION")).toBe(true);
    expect(labelMatches("OBSERV.", "OBSERVACION")).toBe(false);
  });

  test("los dos VALIDOS se comparan por posicion: su propio prefijo y el sufijo LIDOS", () => {
    expect(labelMatches("TOTAL CRD. VÃLIDOS", "TOTAL CRD. VALIDOS")).toBe(true);
    expect(labelMatches("TOTAL ASIG. V�LIDOS", "TOTAL ASIG. VALIDOS")).toBe(true);
    expect(labelMatches("TOTAL ASIG. VÁLIDOS", "TOTAL CRD. VALIDOS")).toBe(false);
    expect(labelMatches("TOTAL CRD. VIGENTES", "TOTAL CRD. VALIDOS")).toBe(false);
  });

  test("las cabeceras esperadas son exactamente las de la spec", () => {
    expect(RECORD_HEADER.join("|")).toBe("CICLO|COD.|ASIGNATURA|VIG.|FAC.|VEZ|CRD.|NOTA|SEC.|TOMO|FOLIO|OBSERVACION");
    expect(FOOTER_HEADER.join("|")).toBe(
      "COD. CAR.|PROM. POND.|CRD. CONV.|CRD. APROB.|TOTAL CRD. VALIDOS|ASIG. CONV.|ASIG. APR.|TOTAL ASIG. VALIDOS|CRD. DESAP.|ASIG. DESAP.",
    );
  });
});

describe("parseRecordPage con el fixture completo", () => {
  test("halla la tabla del record por su cabecera y lee las seis filas con sus columnas", () => {
    const page = parseRecordPage(record);
    expect(page.headerOk).toBe(true);
    expect(page.rows).toEqual(FILAS_DEL_FIXTURE);
  });

  test("la cabecera y la fila del pie no cuentan como descartadas", () => {
    const page = parseRecordPage(record);
    expect(page.discarded).toBe(0);
    expect(page.rows).toHaveLength(6);
  });

  test("arrastra el ciclo a las filas con la celda CICLO vacia", () => {
    const page = parseRecordPage(record);
    expect(page.rows.map((r) => r.periodCode)).toEqual(["2023-1", "2023-1", "2023-2", "2023-2", "2026-2", "2026-2"]);
  });

  test("los creditos conservan el decimal, sin redondear", () => {
    const taller = parseRecordPage(record).rows.find((r) => r.courseCode === "659002");
    expect(taller?.credits).toBe(1.5);
  });

  test("grade sigue la regla de hoy y gradeRaw guarda el texto de la celda", () => {
    const jalado = parseRecordPage(record).rows.find((r) => r.courseCode === "659001" && r.attempt === 1);
    expect(jalado?.grade).toBe(8);
    expect(jalado?.gradeRaw).toBe("08");
  });

  test("ciclo en curso: grade y gradeRaw null, nunca cadena vacia", () => {
    const enCurso = parseRecordPage(record).rows.filter((r) => r.periodCode === "2026-2");
    expect(enCurso).toHaveLength(2);
    for (const fila of enCurso) {
      expect(fila.grade).toBeNull();
      expect(fila.gradeRaw).toBeNull();
    }
  });

  test("la observacion solo aparece cuando la celda trae texto", () => {
    const rows = parseRecordPage(record).rows;
    expect(rows.find((r) => r.courseCode === "659002")?.observation).toBe("OBSERVACIÓN DE PRUEBA");
    expect(rows.filter((r) => r.courseCode !== "659002").every((r) => r.observation === null)).toBe(true);
  });

  test("lee el pie con sus nueve numeros e ignora COD. CAR.", () => {
    expect(parseRecordPage(record).footer).toEqual(PIE_DEL_FIXTURE);
  });
});

describe("parseRecordPage con cabeceras distintas", () => {
  test("mojibake UTF-8 leido como windows-1252: la cabecera coincide y el pie se lee", () => {
    const page = parseRecordPage(conMojibakeWindows1252(record));
    expect(page.headerOk).toBe(true);
    expect(page.discarded).toBe(0);
    expect(page.rows).toHaveLength(6);
    expect(page.footer).toEqual(PIE_DEL_FIXTURE);
  });

  test("mojibake con el caracter de reemplazo U+FFFD: la cabecera coincide y el pie se lee", () => {
    const page = parseRecordPage(conCaracterDeReemplazo(record));
    expect(page.headerOk).toBe(true);
    expect(page.rows).toHaveLength(6);
    expect(page.footer).toEqual(PIE_DEL_FIXTURE);
  });

  test("cabecera reordenada (NOTA y TOMO intercambiadas): headerOk false", () => {
    const reordenada = variante(variante(variante(record,
      "<th>NOTA</th>", "<th>@@</th>"), "<th>TOMO</th>", "<th>NOTA</th>"), "<th>@@</th>", "<th>TOMO</th>");
    const page = parseRecordPage(reordenada);
    expect(page.headerOk).toBe(false);
    expect(page.discarded).toBe(0);
  });

  test("pie con un rotulo cambiado: footer null y el record se lee igual", () => {
    const page = parseRecordPage(variante(record, "<th>ASIG. APR.</th>", "<th>ASIG. APROBADAS</th>"));
    expect(page.headerOk).toBe(true);
    expect(page.footer).toBeNull();
  });
});

describe("parseRecordPage sin pie o con la pagina incompleta", () => {
  test("sin la tabla del pie: footer null y la tabla del record se lee igual", () => {
    const page = parseRecordPage(sinPie(record));
    expect(page.headerOk).toBe(true);
    expect(page.rows).toHaveLength(6);
    expect(page.footer).toBeNull();
  });

  test("pie con una celda no numerica: footer null", () => {
    const page = parseRecordPage(variante(record, "11.8000", "S/N"));
    expect(page.headerOk).toBe(true);
    expect(page.footer).toBeNull();
  });

  test("tabla cortada a la mitad: no hay tabla del record ni pie", () => {
    const cortada = record.slice(0, record.indexOf("2023-2"));
    const page = parseRecordPage(cortada);
    expect(page.headerOk).toBe(false);
    expect(page.footer).toBeNull();
    // Modo compatible: lee las dos filas completas anteriores al corte, sin contar descartes.
    expect(page.rows.map((r) => r.courseCode)).toEqual(["659001", "4901"]);
    expect(page.discarded).toBe(0);
  });
});

describe("parseRecordPage descarta y cuenta las filas invalidas", () => {
  test("una fila con 11 celdas", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">0022</td>', ""));
    expect(page.discarded).toBe(1);
    expect(page.rows).toHaveLength(5);
    expect(page.rows.some((r) => r.courseCode === "4901")).toBe(false);
  });

  test("un codigo que no tiene de 4 a 6 digitos", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">4901</td>', '<td class="text-center">ABC</td>'));
    expect(page.discarded).toBe(1);
    expect(page.rows).toHaveLength(5);
  });

  test("una VEZ que no es un entero mayor o igual a 1", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">2</td>', '<td class="text-center">0</td>'));
    expect(page.discarded).toBe(1);
    expect(page.rows.some((r) => r.courseCode === "659001" && r.periodCode === "2023-2")).toBe(false);
  });

  test("un CRD. que no es numerico", () => {
    const page = parseRecordPage(variante(record, '<td class="text-center">1.5</td>', '<td class="text-center">UNO</td>'));
    expect(page.discarded).toBe(1);
    expect(page.rows.some((r) => r.courseCode === "659002")).toBe(false);
  });

  test("las filas anteriores al primer CICLO", () => {
    const page = parseRecordPage(variante(record, "2023-1", "&nbsp;"));
    expect(page.discarded).toBe(2);
    expect(page.rows).toHaveLength(4);
    expect(page.rows[0].periodCode).toBe("2023-2");
  });
});

describe("parseRecordPage sin la cabecera del record (modo compatible)", () => {
  test("lee las filas como hoy y no cuenta descartes", () => {
    // Así arma su récord la prueba de equivalencias de HU31: una tabla sin cabecera.
    const html = "<table>"
      + "<tr><td>2023-1</td><td>659001</td><td>CURSO 0</td><td>V</td><td>SIS</td><td>1</td><td>1.5</td>"
      + "<td>15</td><td>1000</td><td></td><td></td><td></td></tr>"
      + "<tr><td>&nbsp;</td><td>ABC</td><td>CURSO 1</td><td>V</td><td>SIS</td><td>1</td><td>3</td>"
      + "<td>11</td><td>1001</td><td></td><td></td><td></td></tr>"
      + "</table>";
    expect(parseRecordPage(html)).toEqual({
      rows: [{ periodCode: "2023-1", courseCode: "659001", courseName: "CURSO 0", attempt: 1, credits: 1.5,
        grade: 15, sectionCode: "1000", gradeRaw: "15", observation: null }],
      headerOk: false,
      discarded: 0,
      footer: null,
    });
  });

  test("nunca lanza: HTML vacio", () => {
    expect(parseRecordPage("")).toEqual({ rows: [], headerOk: false, discarded: 0, footer: null });
  });
});

describe("recordRows y parseRecordAcademico", () => {
  test("recordRows devuelve ok:false con el motivo de siempre si no hay filas", () => {
    expect(recordRows({ rows: [], headerOk: true, discarded: 0, footer: null }))
      .toEqual({ ok: false, reason: "no se encontraron filas de récord" });
  });

  test("parseRecordAcademico es recordRows sobre parseRecordPage", () => {
    const r = parseRecordAcademico(record);
    expect(r).toEqual(recordRows(parseRecordPage(record)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(6);
  });

  test("parseRecordAcademico falla con ok:false si no hay filas", () => {
    expect(parseRecordAcademico("<html></html>").ok).toBe(false);
  });
});
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/record-parser.test.ts
```

Esperado: FAIL. El archivo no llega a cargar porque todavía no existen las exportaciones:
`SyntaxError: Export named 'normalizeCareerName' not found in module './src/modules/portal-sync/parsers/html.ts'.`
El resumen muestra `0 pass` y 1 error. Si el error nombra `FOOTER_HEADER`, `parseRecordPage` u otra exportación de `record.ts`, falla por la misma razón. Si el error es `ENOENT` sobre el fixture, falta el Paso 1.

- [ ] **Paso 3: Implementación mínima**

**PARAR — cambio de spec aprobada.** Los tres `targets` nuevos (`parsers/html.ts`, `portal-sync.controller.ts`, `auth.controller.ts`) amplían los archivos que el dueño autorizó el 2026-09-18 (`academic-record.spec.md:21-24`, "Estado: **APROBADA** … parte por parte"), y `targets` es justamente lo que delimita esa superficie. Muéstrale el diff del front-matter y espera su sí explícito antes de escribirlo. Si prefiere no ampliar `targets`: `portal-sync.controller.ts` y `auth.controller.ts` son imprescindibles para RS-BE-29 (el controller tiene que pasar `consent`), pero `parsers/html.ts` se puede evitar definiendo `normalizeCareerName` y `normalizeLabel` en `src/modules/portal-sync/parsers/record.ts` —que ya es target— y haciendo que `info-academica.ts` y `portal-sync.repository.ts` las importen de ahí. Si el dueño recorta la lista, avísalo: el Paso 4 de la Tarea 10 espera hoy `15` targets y habría que ajustar esa cifra a la que él apruebe.

**3a. Targets de la spec.** `AGENTS.md:24` ("Implementa solo archivos incluidos en `targets`") obliga a que este cambio vaya primero. En `specs/features/academic-record/academic-record.spec.md` (líneas 6-13 del frontmatter), reemplaza:

```yaml
  - ../../../src/modules/portal-sync/parsers/record.ts
  - ../../../src/modules/portal-sync/parsers/info-academica.ts
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/modules/portal-sync/portal-sync.schemas.ts
  - ../../../src/modules/portal-sync/portal-sync.types.ts
  - ../../../src/modules/auth/auth.schemas.ts
  - ../../../src/modules/auth/auth.service.ts
```

por:

```yaml
  - ../../../src/modules/portal-sync/parsers/html.ts
  - ../../../src/modules/portal-sync/parsers/record.ts
  - ../../../src/modules/portal-sync/parsers/info-academica.ts
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.controller.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/modules/portal-sync/portal-sync.schemas.ts
  - ../../../src/modules/portal-sync/portal-sync.types.ts
  - ../../../src/modules/auth/auth.schemas.ts
  - ../../../src/modules/auth/auth.controller.ts
  - ../../../src/modules/auth/auth.service.ts
```

Verificación: `grep -c '^  - \.\./\.\./\.\./' specs/features/academic-record/academic-record.spec.md` debe dar `15` (antes daba 12). En **este** paso no cambies nada más de la spec (los dos cambios de texto de RS-BE-19 van aparte, en el Paso 3f, y tienen su propio PARAR): el `[@test] ../../../test/HU34_jeff/record-parser.test.ts` ya está bajo RS-BE-19 (línea 92) y RS-BE-20 (línea 101).

**3b. Tipos.** En `src/modules/portal-sync/portal-sync.types.ts` (líneas 19-22), reemplaza:

```ts
export interface RecordRow {
  periodCode: string; courseCode: string; courseName: string;
  attempt: number; credits: number; grade: number | null; sectionCode: string;
}
```

por:

```ts
/** Una fila del récord académico (RS-BE-19 de academic-record). `credits` trae
 *  el decimal del portal, sin redondear. `grade` es la nota entera 0–20 o `null`
 *  (alimenta `enrollment.final_grade`); `gradeRaw` es el texto de la celda NOTA
 *  tal cual, o `null` si vino vacía. `observation` es `null` si la celda no trae
 *  texto. */
export interface RecordRow {
  periodCode: string; courseCode: string; courseName: string;
  attempt: number; credits: number; grade: number | null; sectionCode: string;
  gradeRaw: string | null; observation: string | null;
}

/** Totales del pie del récord (RS-BE-20), leídos por posición. La celda
 *  COD. CAR. no se guarda. */
export interface RecordFooter {
  weightedAverage: number; convalidatedCredits: number; approvedCredits: number; validCredits: number;
  convalidatedCourses: number; approvedCourses: number; validCourses: number;
  failedCredits: number; failedCourses: number;
}

/** Lo que el lector ve en la página del récord. La regla de confianza
 *  (RS-BE-21) decide con esto si la copia se puede guardar. */
export interface RecordPage {
  /** Filas leídas. */
  rows: RecordRow[];
  /** Se halló la tabla con la cabecera exacta y se leyó solo esa tabla. */
  headerOk: boolean;
  /** Filas de datos descartadas; solo se cuentan con `headerOk`. */
  discarded: number;
  /** `null` = pie ausente o ilegible. */
  footer: RecordFooter | null;
}
```

En `src/`, el único lugar que construye `RecordRow` es `parsers/record.ts`. `test/HU31_jeff/repository.student.test.ts:27-35` arma literales de `RecordRow` sin los campos nuevos para probar `pickBestRecordRow`. Eso no rompe ninguna corrida: `tsc` solo compila `src/` (`tsconfig.json` → `"include": ["src/**/*"]`) y `bun test` no chequea tipos; lo único que se ve es un subrayado en el editor por `test/tsconfig.json`. No toques ese archivo: no está en los targets y la Tarea 10 no lo pide.

**3c. `html.ts`.** En `src/modules/portal-sync/parsers/html.ts` (líneas 35-37), reemplaza:

```ts
/** Texto ya normalizado de cada celda (`td` o `th`) de una fila. */
export const cellsOf = (tr: string): string[] =>
  (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((td) => clean(stripTags(td)));
```

por:

```ts
/** Texto ya normalizado de cada celda (`td` o `th`) de una fila. */
export const cellsOf = (tr: string): string[] =>
  (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map((td) => clean(stripTags(td)));

/**
 * Texto del portal listo para COMPARAR (no para guardar): sin acentos, en
 * mayúsculas y con los espacios colapsados.
 *
 * Los acentos se quitan porque el portal es ISO-8859-1 y no siempre los conserva
 * igual; el espacio, porque el consolidado a veces trae dobles. Nació para
 * comparar carreras (`careerNamesDiffer`, en el repository, que además la
 * re-exporta) y vive aquí desde el récord académico: un parser no puede importar
 * el repository sin cargar la base de datos.
 */
export const normalizeCareerName = (name: string): string =>
  (name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Rótulo de cabecera listo para comparar contra una secuencia esperada
 * (RS-BE-19 de academic-record): `normalizeCareerName` y, además, todo carácter
 * fuera de `[A-Z0-9. ]` pasa a espacio y se vuelven a colapsar los espacios.
 * "Relativa (*)" queda "RELATIVA"; un mojibake como "OBSERVACIÃ“N" queda
 * "OBSERVACIA N", que conserva el prefijo "OBSERVACI".
 */
export const normalizeLabel = (s: string): string =>
  normalizeCareerName(s).replace(/[^A-Z0-9. ]/g, " ").replace(/\s+/g, " ").trim();
```

> **Ojo con la clase de caracteres.** La línea `.normalize("NFD").replace(/[…]/g, "")` del bloque de arriba
> va con los **escapes ASCII** —barra invertida, `u`, `0300`—, no con los caracteres combinantes U+0300 y
> U+036F literales, que son invisibles y se pegan al `[` anterior. Es, carácter por carácter, la misma
> línea que hoy está en `src/modules/portal-sync/portal-sync.repository.ts:236`:
>
> ```ts
>     .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
> ```
>
> Si al copiar el cuerpo te queda un corchete con un acento encima, se perdieron los escapes: vuelve a
> copiarlo del repository (`sed -n '234,237p' src/modules/portal-sync/portal-sync.repository.ts`). Solo con
> los escapes es literalmente cierto que la función va "MOVIDA sin cambios desde el repository (mismo
> cuerpo)" y `html.ts` no queda con dos combinantes sueltos dentro de una clase de caracteres.

**3d. Repository: se re-exporta en lugar de definirse.** En `src/modules/portal-sync/portal-sync.repository.ts`, línea 3, reemplaza:

```ts
import { mismaPersona } from "../../shared/utils/nombre-persona.js";
```

por:

```ts
import { mismaPersona } from "../../shared/utils/nombre-persona.js";
import { normalizeCareerName } from "./parsers/html.js";
```

Y en las líneas 230-237 (el final del comentario "¿Son la misma carrera, escritas distinto?" y la definición), reemplaza:

> **Ojo con la tercera línea del bloque "viejo".** Está escrita con los escapes ASCII, byte por byte como
> en el archivo: `    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")`
> (`portal-sync.repository.ts:236`). Si la herramienta con la que copias los convierte en los caracteres
> combinantes U+0300 y U+036F literales, la coincidencia exacta falla con "string not found": en ese caso
> ubica el bloque por su **rango de líneas**
> (`sed -n '228,240p' src/modules/portal-sync/portal-sync.repository.ts` para confirmar que 230-237 siguen
> siendo el comentario de tres líneas más la definición) o por el ancla ASCII
> `export const normalizeCareerName = (name: string): string =>`, y bórralo entero. El resto del bloque de
> abajo —el comentario, la firma y `.toUpperCase().replace(/\s+/g, " ").trim();`— no corre ese riesgo.


```ts
 * Se normaliza quitando acentos, pasando a mayúsculas y colapsando espacios.
 * Los acentos entran porque el portal es ISO-8859-1 y no siempre los conserva
 * igual; el espacio, porque el consolidado a veces trae dobles.
 */
export const normalizeCareerName = (name: string): string =>
  (name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
```

por:

```ts
 * Por eso se comparan con `normalizeCareerName` (sin acentos, en mayúsculas y
 * con los espacios colapsados). Su definición se mudó sin cambios a
 * `parsers/html.ts`: el lector del récord la reutiliza para comparar rótulos y
 * un parser no puede importar este archivo sin cargar la base de datos. Se
 * re-exporta aquí para que quien la importe de este módulo no cambie.
 */
export { normalizeCareerName };
```

`careerNamesDiffer` (`:240-243`, justo debajo) queda idéntica y sigue usando `normalizeCareerName`, ahora importada. No se crea ningún ciclo, porque `html.ts` no importa nada. `portal-sync.service.ts:9` sigue importando `careerNamesDiffer` del repository sin cambios, y `test/HU31_jeff/repository.catalog.test.ts:2` sigue importándola de la misma ruta.

**3e. `record.ts`.** Reemplaza el contenido entero de `src/modules/portal-sync/parsers/record.ts`. Hoy son 42 líneas con solo `parseRecordAcademico`, con el `Math.ceil` de la línea 34. El contenido nuevo es:

```ts
import { cellsOf, normalizeLabel, trsOf, type ParseResult } from "./html.js";
import type { RecordFooter, RecordPage, RecordRow } from "../portal-sync.types.js";

/**
 * Récord académico (RS-BE-19 y RS-BE-20 de academic-record.spec.md).
 *
 * La página trae dos tablas sin anidar y con la MISMA clase, así que solo la
 * cabecera las distingue:
 * - la del récord, 12 columnas:
 *   CICLO | COD. | ASIGNATURA | VIG. | FAC. | VEZ | CRD. | NOTA | SEC. | TOMO | FOLIO | OBSERVACIÓN
 *   La celda CICLO SOLO trae valor en la primera fila de cada grupo (&nbsp; en
 *   las demás): se arrastra el último valor no vacío.
 * - la del pie, 10 columnas con los totales (una sola fila de valores).
 *
 * Si no aparece la tabla del récord con su cabecera exacta, se lee la página
 * entera como antes (`headerOk: false`): el récord no será de confianza
 * (RS-BE-21), pero el resto de la importación sigue como hoy.
 */

/** Cabecera del récord, ya normalizada con `normalizeLabel`. */
export const RECORD_HEADER: readonly string[] = [
  "CICLO", "COD.", "ASIGNATURA", "VIG.", "FAC.", "VEZ", "CRD.", "NOTA", "SEC.", "TOMO", "FOLIO", "OBSERVACION",
];

/** Cabecera del pie, ya normalizada con `normalizeLabel`. */
export const FOOTER_HEADER: readonly string[] = [
  "COD. CAR.", "PROM. POND.", "CRD. CONV.", "CRD. APROB.", "TOTAL CRD. VALIDOS",
  "ASIG. CONV.", "ASIG. APR.", "TOTAL ASIG. VALIDOS", "CRD. DESAP.", "ASIG. DESAP.",
];

const PERIOD_RE = /^\d{4}-[0-2]$/;
const COURSE_CODE_RE = /^\d{4,6}$/;
const INTEGER_RE = /^\d+$/;
const NUMBER_RE = /^\d+(\.\d+)?$/;
const VALIDOS = "VALIDOS";

/**
 * ¿El rótulo crudo `actual` es el rótulo esperado `expected` (ya normalizado)?
 *
 * Las únicas tildes de las dos cabeceras están en OBSERVACIÓN y en los dos
 * VÁLIDOS. Si el portal mandó UTF-8 y `portal.client.ts` lo decodificó como
 * ISO-8859-1 (o al revés), esa letra llega rota: por eso OBSERVACIÓN se compara
 * por el prefijo "OBSERVACI" y los dos VÁLIDOS por su prefijo y el sufijo
 * "LIDOS". Dos rótulos terminan en LIDOS: la comparación es por posición,
 * nunca por búsqueda.
 */
export const labelMatches = (actual: string, expected: string): boolean => {
  const label = normalizeLabel(actual);
  if (expected === "OBSERVACION") return label.startsWith("OBSERVACI");
  if (expected.endsWith(VALIDOS)) {
    return label.startsWith(expected.slice(0, -VALIDOS.length)) && label.endsWith("LIDOS");
  }
  return label === expected;
};

const headerMatches = (cells: string[], expected: readonly string[]): boolean =>
  cells.length === expected.length && cells.every((cell, i) => labelMatches(cell, expected[i]));

/**
 * `<tr>` crudas de la primera tabla cuya primera fila es la cabecera esperada,
 * o `null`. La página del récord no anida tablas, así que cada tabla termina en
 * el primer `</table>`. `cellsOf` se aplica a la `<tr>` y nunca a la tabla
 * entera: su regex `<t[dh]` también atrapa `<thead`.
 */
const findTable = (html: string, expected: readonly string[]): string[] | null => {
  for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const trs = trsOf(table);
    if (trs.length && headerMatches(cellsOf(trs[0]), expected)) return trs;
  }
  return null;
};

/** Una fila ya validada. `grade` conserva exactamente la regla de siempre. */
const toRow = (periodCode: string, cells: string[]): RecordRow => {
  const gradeText = cells[7];
  const gradeNum = Number.parseInt(gradeText, 10);
  const grade = /^\d{1,2}$/.test(gradeText) && gradeNum >= 0 && gradeNum <= 20 ? gradeNum : null;
  const observation = cells[11] ?? "";
  return {
    periodCode,
    courseCode: cells[1],
    courseName: cells[2],
    attempt: Number.parseInt(cells[5], 10) || 1,
    credits: Number.parseFloat(cells[6]) || 0,
    grade,
    sectionCode: cells[8],
    gradeRaw: gradeText === "" ? null : gradeText,
    observation: observation === "" ? null : observation,
  };
};

/** Filas de la tabla del récord, con las descartadas contadas. */
const readRecordTable = (trs: string[]): { rows: RecordRow[]; discarded: number } => {
  const rows: RecordRow[] = [];
  let discarded = 0;
  let currentPeriod = "";

  for (const tr of trs.slice(1)) {
    const cells = cellsOf(tr);
    if (cells.length !== RECORD_HEADER.length) { discarded++; continue; }
    if (PERIOD_RE.test(cells[0])) currentPeriod = cells[0];
    const valid =
      currentPeriod !== "" &&
      COURSE_CODE_RE.test(cells[1]) &&
      INTEGER_RE.test(cells[5]) && Number.parseInt(cells[5], 10) >= 1 &&
      NUMBER_RE.test(cells[6]);
    if (!valid) { discarded++; continue; }
    rows.push(toRow(currentPeriod, cells));
  }
  return { rows, discarded };
};

/** Lectura de antes, sobre la página entera: para HTML sin la cabecera del
 *  récord. No cuenta descartes. */
const readLoose = (html: string): RecordRow[] => {
  const rows: RecordRow[] = [];
  let currentPeriod = "";

  for (const tr of trsOf(html)) {
    const cells = cellsOf(tr);
    if (cells.length < 9) continue;
    if (PERIOD_RE.test(cells[0])) currentPeriod = cells[0];
    if (!currentPeriod) continue;
    if (!COURSE_CODE_RE.test(cells[1])) continue;
    rows.push(toRow(currentPeriod, cells));
  }
  return rows;
};

/** Primera fila de valores del pie. `null` si falta o si alguna de las
 *  celdas 1..9 no es un número. */
const readFooter = (trs: string[] | null): RecordFooter | null => {
  if (!trs || trs.length < 2) return null;
  const cells = cellsOf(trs[1]);
  if (cells.length !== FOOTER_HEADER.length) return null;
  if (!cells.slice(1).every((cell) => NUMBER_RE.test(cell))) return null;
  const n = (i: number): number => Number(cells[i]);
  return {
    weightedAverage: n(1), convalidatedCredits: n(2), approvedCredits: n(3), validCredits: n(4),
    convalidatedCourses: n(5), approvedCourses: n(6), validCourses: n(7),
    failedCredits: n(8), failedCourses: n(9),
  };
};

/** Lee la página del récord completa. Nunca lanza. */
export const parseRecordPage = (html: string): RecordPage => {
  const source = html ?? "";
  const footer = readFooter(findTable(source, FOOTER_HEADER));
  const recordTrs = findTable(source, RECORD_HEADER);
  if (!recordTrs) return { rows: readLoose(source), headerOk: false, discarded: 0, footer };
  const { rows, discarded } = readRecordTable(recordTrs);
  return { rows, headerOk: true, discarded, footer };
};

/** Las filas en la forma de siempre de los parsers. */
export const recordRows = (page: RecordPage): ParseResult<RecordRow[]> =>
  page.rows.length
    ? { ok: true, data: page.rows }
    : { ok: false, reason: "no se encontraron filas de récord" };

/** Envoltorio compatible: las filas del récord, como antes. */
export const parseRecordAcademico = (html: string): ParseResult<RecordRow[]> =>
  recordRows(parseRecordPage(html));
```

Qué queda fuera, a propósito:
- El `Math.ceil` desaparece solo de `record.ts`. Los de `parsers/matricula.ts:57` y `portal-sync.repository.ts:549` son de la matrícula y **no se tocan**.
- `portal-sync.service.ts` no cambia en esta tarea. Sigue llamando a `parseRecordAcademico` desde `./parsers/index.js` (`:14` el import, `:181` la llamada) y recibe las mismas filas, ahora con dos campos más.
- El modo sin cabecera (`readLoose`) repite la lógica de hoy. Existe para no romper `test/HU31_jeff/service.equivalencias.test.ts:24-28`, cuyo `recordCon` arma una tabla sin cabecera. **Ojo: es una divergencia con la spec aprobada y la cierra el Paso 3f, no este paso.**
- `README.md` no se toca. Sí queda desactualizada su insignia `99_suites` (esta tarea agrega el archivo 100), que `scripts/verificar-readme.py` compara contra `test/**/*.test.ts`. Ese script no lo corre ninguna prueba ni el build, así que nada se pone rojo; el README es asunto de la Tarea 10 y del dueño.

**3f. PARAR — dos cambios en la spec aprobada, para que spec e implementación coincidan.**

`AGENTS.md` §Verificación dice "No terminar una feature si spec, contrato e implementación no coinciden", y el Paso 3e deja dos divergencias con el texto aprobado el 2026-09-18. **Muéstrale estos dos reemplazos al dueño y espera su sí explícito antes de escribirlos.** No cambian ni una línea de código: solo declaran lo que el código hace.

*(i) El modo compatible.* La spec dice hoy que el parser "ya no usa `trsOf` sobre la página entera", y `readLoose` sí lo hace cuando no encuentra la cabecera. En `specs/features/academic-record/academic-record.spec.md`, reemplazar la viñeta de las líneas 64-67:

```markdown
- **Se lee por tabla, no por página.** La página trae dos tablas: la del récord (12
  columnas) y la del pie (10 columnas). El parser ubica la tabla del récord por su
  cabecera y recorre solo sus filas; ya no usa `trsOf` sobre la página entera.
```

por:

```markdown
- **Se lee por tabla, no por página.** La página trae dos tablas: la del récord (12
  columnas) y la del pie (10 columnas). El parser ubica la tabla del récord por su
  cabecera y recorre solo sus filas. Si esa tabla no aparece con su cabecera exacta
  —y solo entonces— el lector cae al **modo compatible** de hoy: recorre las `<tr>` de
  toda la página, devuelve `headerOk: false` y no cuenta descartes. Ese récord nunca es
  de confianza (RS-BE-21), así que no se guarda ni dispara la limpieza; el modo existe
  únicamente para que el resto de la importación —`enrollment.final_grade` y el
  progreso— siga funcionando como hoy.
```

*(ii) El quinto motivo de descarte.* La spec enumera cuatro motivos; `readRecordTable` agrega uno más —la fila anterior al primer CICLO con valor—, y no es cosmético: `discarded > 0` vuelve el récord no confiable (RS-BE-21, condición 3) y con eso bloquea el guardado, la foto, el resumen y la limpieza. El plan incluso lo fija con la prueba "las filas anteriores al primer CICLO" (`discarded: 2`). Reemplazar la viñeta de las líneas 77-80:

```markdown
- **Fila de datos** es cada `<tr>` de la tabla del récord posterior a su cabecera. Se
  **descarta** si no tiene 12 celdas, si su código no cumple `/^\d{4,6}$/`, si VEZ no es un
  entero ≥ 1 o si CRD. no es numérico. Las descartadas se cuentan. La cabecera y las filas
  del pie no son filas de datos y nunca cuentan como descartadas.
```

por:

```markdown
- **Fila de datos** es cada `<tr>` de la tabla del récord posterior a su cabecera. Se
  **descarta** si no tiene 12 celdas, si todavía no se ha leído ningún CICLO con valor
  (la celda CICLO llega vacía antes de la primera fila de un grupo), si su código no
  cumple `/^\d{4,6}$/`, si VEZ no es un entero ≥ 1 o si CRD. no es numérico. Las
  descartadas se cuentan. La cabecera y las filas del pie no son filas de datos y nunca
  cuentan como descartadas.
```

Si el dueño prefiere que el código se ajuste a la spec en vez de al revés, **PARAR igual**: sacar `readLoose` rompe `test/HU31_jeff/service.equivalencias.test.ts` y no contar la fila sin CICLO cambia la regla de confianza; las dos son decisiones suyas, no del ejecutor. `specs/features/academic-record/academic-record.spec.md` ya está en el `git add` del Paso final de esta tarea.

**Ojo con los números de línea de la spec.** Entre el Paso 3a (+3 líneas de `targets`) y este (+5 en la viñeta de la tabla y +2 en la de "Fila de datos") todo lo que está debajo de la línea 80 de `academic-record.spec.md` se corre **+10**. Los números que citan las Tareas 4 (`:310-313`), 5 (`:198`, `:242`), 7 (`targets` en 5, 8 y 11; `[@test]` en 198) y 10 (`:310-313`, `:354`) son los de `d97714f`: ubícalos siempre **por su texto**, nunca por el número, como ya hace el resto del plan.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/record-parser.test.ts
```

Esperado: PASS, con `32 pass` y `0 fail`.

- [ ] **Paso 5: Regresión de HU31 y HU33 (parser viejo, service y registro)**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU31_jeff test/HU33_jeff
```

Esperado: PASS con `0 fail`. Tres archivos importan especialmente:
- `test/HU31_jeff/parsers.record.test.ts` (4 pass): su fixture real tiene las dos cabeceras exactas, así que ahora se lee por tabla y da las mismas 58 filas, con 0 descartes, los mismos `periodCode`/`courseCode`/`courseName`/`attempt`/`grade`/`sectionCode` y los mismos créditos (ninguna fila cambia al quitar el `Math.ceil`; `510002` sigue con `credits` 1 y `grade` 18, 2023-1 sigue con 6 filas y 2026-2 con 5).
- `service.equivalencias.test.ts`: modo compatible.
- `repository.catalog.test.ts`: `careerNamesDiffer` con la función re-exportada.

Si algo falla, **no** cambies esas pruebas. Revisa el Paso 3 y compara con las firmas de arriba.

- [ ] **Paso 6: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `tsc` termina sin errores ni salida. Emite en `dist/`, que está en `.gitignore`. Los fallos típicos serían `noUnusedLocals` (un import que sobra en `record.ts`) o un `export { normalizeCareerName }` sin su import en el repository.

- [ ] **Paso final: Commit**

```bash
cd . && git status --short && git add \
  specs/features/academic-record/academic-record.spec.md \
  src/modules/portal-sync/parsers/html.ts \
  src/modules/portal-sync/parsers/record.ts \
  src/modules/portal-sync/portal-sync.types.ts \
  src/modules/portal-sync/portal-sync.repository.ts \
  test/HU34_jeff/fixtures/record.html \
  test/HU34_jeff/record-parser.test.ts \
&& git commit -m "feat(academic-record): lector del récord por tabla, con pie y normalizador de rótulos" \
  -m "RS-BE-19 y RS-BE-20. parseRecordPage ubica la tabla del récord y la del pie por su cabecera normalizada (normalizeLabel, tolerante al mojibake), cuenta las filas descartadas y lee los totales del pie. RecordRow suma gradeRaw y observation, y los créditos conservan el decimal. Sin la cabecera se lee como antes. normalizeCareerName se muda sin cambios a parsers/html.ts y el repository la re-exporta. La spec suma tres targets y pone al día las dos viñetas de RS-BE-19 (modo compatible sin cabecera y quinto motivo de descarte), las tres cosas aprobadas por el dueño; sin comportamiento nuevo." \
&& git log -1 --format='%an <%ae>%n%n%B'
```

Esperado: antes del `add`, `git status --short` muestra seis líneas —las cinco ` M` de los archivos versionados y un solo `?? test/HU34_jeff/`, porque git colapsa los directorios nuevos—. Tras el `add`, `git status --short` mostraría los 7 archivos (5 `M` y 2 `A`); si aparece alguno más, no lo incluyas. El `git log` muestra el autor ya configurado (noreply de GitHub) y un mensaje **sin** trailer `Co-Authored-By`. No hagas push. `README.md` no se toca en esta tarea.

### Tarea 2: Regla de confianza del récord (RS-BE-21)

**Archivos:**
- Crear: `src/modules/academic-record/academic-record.logic.ts` (la carpeta `src/modules/academic-record/` todavía no existe)
- Crear: `test/HU34_jeff/record-trust.test.ts`
- Test: `test/HU34_jeff/record-trust.test.ts`

No se modifica ningún archivo existente. La spec ya tiene el target `../../../src/modules/academic-record/**`
(línea 5) y el `[@test] ../../../test/HU34_jeff/record-trust.test.ts` bajo RS-BE-21 (línea 131): no se toca.
Todos los comandos se corren desde la raíz del worktree `.`.

**Interfaces:**

- Consume (Tarea 1, ya commiteada; si no lo está, PARAR y completarla: ver el chequeo del Paso 2):
  ```ts
  // src/modules/portal-sync/portal-sync.types.ts
  export interface RecordRow {
    periodCode: string; courseCode: string; courseName: string;
    attempt: number; credits: number; grade: number | null; sectionCode: string;
    gradeRaw: string | null; observation: string | null;
  }
  export interface RecordFooter {
    weightedAverage: number; convalidatedCredits: number; approvedCredits: number; validCredits: number;
    convalidatedCourses: number; approvedCourses: number; validCourses: number;
    failedCredits: number; failedCourses: number;
  }
  export interface RecordPage {
    rows: RecordRow[]; headerOk: boolean; discarded: number; footer: RecordFooter | null;
  }
  // src/modules/portal-sync/parsers/record.ts (solo lo usa el test)
  export const parseRecordPage = (html: string): RecordPage   // nunca lanza
  // test/HU34_jeff/fixtures/record.html: fixture inventado (alumno sintético, sin datos reales).
  //   2023-1: 659001 VEZ 1 nota 08 (4.0 crd) y 4901 nota 14 (3.0);
  //   2023-2: 659001 VEZ 2 nota 12 (4.0) y 659002 nota 17 (1.5, "OBSERVACIÓN DE PRUEBA");
  //   2026-2 en curso: 659003 y 659004 sin nota; pie 0001 | 11.8000 | 0.0 | 8.5 | 8.5 | 0 | 3 | 3 | 4.0 | 1
  ```

- Produce (lo usan las Tareas 6 y 7; la Tarea 9 amplía el mismo archivo con `buildAcademicRecordDto`):
  ```ts
  // src/modules/academic-record/academic-record.logic.ts
  export type RecordTrust = { ok: true } | { ok: false; reason: string };
  export const CREDIT_TOLERANCE = 0.05;
  export const approvedRows = (rows: readonly RecordRow[]): RecordRow[]  // grade entero 11..20
  export const failedRows = (rows: readonly RecordRow[]): RecordRow[]    // grade entero 0..10
  export const evaluateRecordTrust = (page: RecordPage): RecordTrust
  ```
  Motivos literales, en este orden de evaluación (se devuelve el de la primera condición que falla).
  La Tarea 6 espía `console.warn` y busca `"pie ausente o ilegible"`:
  1. `"tabla del récord ausente o con cabecera distinta"`
  2. `"pie ausente o ilegible"`
  3. `"sin filas"`
  4. `` `${n} filas descartadas` ``
  5. `"aprobadas no coinciden con ASIG. APR."`
  6. `"créditos aprobados no coinciden con CRD. APROB."`
  7. `"hay convalidados (ASIG. CONV. > 0)"`
  8. `"desaprobadas no coinciden con ASIG. DESAP."`

  `evaluateRecordTrust` recibe la página que ya leyó `parseRecordPage`. Es una función pura: no lleva base
  de datos, HTTP ni `console`. Más adelante la llama `portal-sync.service.ts` (Tarea 6), que escribe el
  motivo en el log del servidor.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU34_jeff/record-trust.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import {
  CREDIT_TOLERANCE,
  approvedRows,
  evaluateRecordTrust,
  failedRows,
} from "../../src/modules/academic-record/academic-record.logic.js";
import { parseRecordPage } from "../../src/modules/portal-sync/parsers/record.js";
import type {
  RecordFooter,
  RecordPage,
  RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";

// RS-BE-21 — Regla de confianza del récord.
// Fixture inventado de HU34 (alumno sintético, sin datos reales). Cuadra con su pie:
// aprobadas 14 (3.0 crd), 12 (4.0) y 17 (1.5) → ASIG. APR. 3 y CRD. APROB. 8.5;
// desaprobada 08 → ASIG. DESAP. 1; ASIG. CONV. 0; el ciclo 2026-2 va sin nota.
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();

const tablas = record.match(/<table[\s\S]*?<\/table>/gi) ?? [];
const tablaPie = tablas[1] ?? "";

// Fila de valores del pie del fixture, por posición:
// COD. CAR. | PROM. POND. | CRD. CONV. | CRD. APROB. | TOTAL CRD. VÁLIDOS |
// ASIG. CONV. | ASIG. APR. | TOTAL ASIG. VÁLIDOS | CRD. DESAP. | ASIG. DESAP.
const PIE_FIXTURE = ["0001", "11.8000", "0.0", "8.5", "8.5", "0", "3", "3", "4.0", "1"];

/** El fixture con la fila de valores del pie reescrita; `cambios` va por posición. */
const pieCon = (cambios: Record<number, string>): string => {
  const valores = PIE_FIXTURE.map((v, i) => cambios[i] ?? v);
  const filaPie = `<tr>${valores.map((v) => `<td class="text-center">${v}</td>`).join("")}</tr>`;
  const nuevoPie = tablaPie.replace(/<tbody>[\s\S]*<\/tbody>/, () => `<tbody>${filaPie}</tbody>`);
  return record.replace(tablaPie, () => nuevoPie);
};

/** Intercambia la primera aparición de `a` con la primera de `b`. */
const intercambiar = (html: string, a: string, b: string): string =>
  html.replace(a, "@@INTERCAMBIO@@").replace(b, a).replace("@@INTERCAMBIO@@", b);

const confianza = (html: string) => evaluateRecordTrust(parseRecordPage(html));

const NO_CABECERA = { ok: false, reason: "tabla del récord ausente o con cabecera distinta" };
const NO_PIE = { ok: false, reason: "pie ausente o ilegible" };

/** Fila sintética con todos los campos de RecordRow. */
const filaCon = (grade: number | null, credits: number, courseCode: string): RecordRow => ({
  periodCode: "2024-1",
  courseCode,
  courseName: "CURSO DE PRUEBA",
  attempt: 1,
  credits,
  grade,
  sectionCode: "101",
  gradeRaw: grade === null ? null : String(grade),
  observation: null,
});

// Página armada a mano: dos aprobadas de 3 créditos y una desaprobada, con su pie coherente.
const FILAS: RecordRow[] = [filaCon(15, 3, "659101"), filaCon(12, 3, "659102"), filaCon(8, 3, "659103")];
const PIE: RecordFooter = {
  weightedAverage: 11.6667, convalidatedCredits: 0, approvedCredits: 6, validCredits: 6,
  convalidatedCourses: 0, approvedCourses: 2, validCourses: 2, failedCredits: 3, failedCourses: 1,
};
const pagina = (cambios: Partial<RecordPage>): RecordPage => ({
  rows: FILAS, headerOk: true, discarded: 0, footer: PIE, ...cambios,
});

describe("fixture HU34 del record", () => {
  test("trae las dos tablas y los literales que usan las variantes", () => {
    expect(tablas).toHaveLength(2);
    for (const literal of [
      "<th>NOTA</th>",
      "<th>TOMO</th>",
      "<th>OBSERVACIÓN</th>",
      "<th>TOTAL CRD. VÁLIDOS</th>",
      "<th>TOTAL ASIG. VÁLIDOS</th>",
      "<th>ASIG. CONV.</th>",
      "<th>ASIG. APR.</th>",
      '<td class="text-center">0022</td>',
    ]) {
      expect(record).toContain(literal);
    }
  });

  test("pieCon sin cambios reproduce el pie del fixture", () => {
    const original = parseRecordPage(record).footer;
    expect(original).not.toBeNull();
    expect(parseRecordPage(pieCon({})).footer).toEqual(original);
  });
});

describe("evaluateRecordTrust con el fixture", () => {
  test("el fixture completo es de confianza", () => {
    expect(confianza(record)).toEqual({ ok: true });
  });

  test("sin pie no es de confianza: la comparacion nunca se omite", () => {
    expect(confianza(record.replace(tablaPie, ""))).toEqual(NO_PIE);
  });

  test("pie con una celda numerica ilegible no es de confianza", () => {
    expect(confianza(pieCon({ 2: "N/D" }))).toEqual(NO_PIE);
  });

  test("pie con ASIG. CONV. y ASIG. APR. intercambiadas no es de confianza", () => {
    const html = intercambiar(record, "<th>ASIG. CONV.</th>", "<th>ASIG. APR.</th>");
    expect(confianza(html)).toEqual(NO_PIE);
  });

  test("tabla cortada a la mitad no es de confianza aunque se lean filas", () => {
    const corte = record.indexOf("659002");
    // El corte cae dentro del <tbody> de la primera tabla; el resto de la página se pierde.
    expect(corte).toBeGreaterThan(0);
    expect(corte).toBeLessThan(record.indexOf("</table>"));
    const cortada = record.slice(0, corte);
    // Así llega hoy un récord truncado con HTTP 200: las filas se leen...
    expect(parseRecordPage(cortada).rows.length).toBeGreaterThan(0);
    // ...pero no es de confianza.
    expect(confianza(cortada)).toEqual(NO_CABECERA);
  });

  test("cabecera reordenada (NOTA y TOMO intercambiadas) no es de confianza", () => {
    expect(confianza(intercambiar(record, "<th>NOTA</th>", "<th>TOMO</th>"))).toEqual(NO_CABECERA);
  });

  test("tabla del record sin filas de datos no es de confianza", () => {
    // El primer <tbody> es el de la tabla del récord.
    const vacia = record.replace(/<tbody>[\s\S]*?<\/tbody>/, "<tbody></tbody>");
    expect(confianza(vacia)).toEqual({ ok: false, reason: "sin filas" });
  });

  test("una fila de datos con 11 celdas no es de confianza", () => {
    // Quita la celda FOLIO de la fila 4901: queda con 11 celdas y se descarta.
    const sinFolio = record.replace('<td class="text-center">0022</td>', "");
    expect(confianza(sinFolio)).toEqual({ ok: false, reason: "1 filas descartadas" });
  });

  test("una fila descartada basta aunque los totales cuadren", () => {
    // El primer </tbody> es el de la tabla del récord.
    const conBasura = record.replace("</tbody>", "<tr><td>FILA DE PRUEBA</td></tr></tbody>");
    expect(parseRecordPage(conBasura).rows).toHaveLength(6);
    expect(confianza(conBasura)).toEqual({ ok: false, reason: "1 filas descartadas" });
  });

  test("ASIG. APR. distinto de las filas aprobadas no es de confianza", () => {
    expect(confianza(pieCon({ 6: "4" }))).toEqual({
      ok: false,
      reason: "aprobadas no coinciden con ASIG. APR.",
    });
  });

  test("CRD. APROB. dentro de la tolerancia de 0.05 es de confianza", () => {
    expect(confianza(pieCon({ 3: "8.54" }))).toEqual({ ok: true });
    expect(confianza(pieCon({ 3: "8.46" }))).toEqual({ ok: true });
  });

  test("CRD. APROB. fuera de la tolerancia no es de confianza", () => {
    const motivo = { ok: false, reason: "créditos aprobados no coinciden con CRD. APROB." };
    expect(confianza(pieCon({ 3: "8.6" }))).toEqual(motivo);
    expect(confianza(pieCon({ 3: "8.4" }))).toEqual(motivo);
  });

  test("ASIG. CONV. mayor que 0 no es de confianza", () => {
    expect(confianza(pieCon({ 5: "1" }))).toEqual({
      ok: false,
      reason: "hay convalidados (ASIG. CONV. > 0)",
    });
  });

  test("ASIG. DESAP. distinto de las filas desaprobadas no es de confianza", () => {
    const motivo = { ok: false, reason: "desaprobadas no coinciden con ASIG. DESAP." };
    expect(confianza(pieCon({ 9: "0" }))).toEqual(motivo);
    expect(confianza(pieCon({ 9: "2" }))).toEqual(motivo);
  });

  test("TOTAL CRD. VALIDOS y TOTAL ASIG. VALIDOS se leen pero no deciden", () => {
    const html = pieCon({ 4: "99.0", 7: "42" });
    expect(parseRecordPage(html).footer?.validCourses).toBe(42);
    expect(confianza(html)).toEqual({ ok: true });
  });

  test("cabecera con mojibake de windows-1252 es de confianza", () => {
    // UTF-8 leído como ISO-8859-1: Ó → "Ã“", Á → "Ã" + U+0081.
    const html = record
      .replace("<th>OBSERVACIÓN</th>", "<th>OBSERVACI\u00c3\u201cN</th>")
      .replaceAll("VÁLIDOS", "V\u00c3\u0081LIDOS");
    expect(html).not.toContain("VÁLIDOS");
    expect(confianza(html)).toEqual({ ok: true });
  });

  test("cabecera con caracter de reemplazo U+FFFD es de confianza", () => {
    // Latin-1 leído como UTF-8: la vocal con tilde se vuelve U+FFFD.
    const html = record
      .replace("<th>OBSERVACIÓN</th>", "<th>OBSERVACI\uFFFDN</th>")
      .replaceAll("VÁLIDOS", "V\uFFFDLIDOS");
    expect(confianza(html)).toEqual({ ok: true });
  });
});

describe("approvedRows y failedRows", () => {
  const filas = parseRecordPage(record).rows;
  const resumen = (rows: RecordRow[]) => rows.map((r) => [r.courseCode, r.attempt, r.grade]);

  test("el curso jalado en VEZ 1 y aprobado en VEZ 2 cuenta una vez en cada lado", () => {
    expect(resumen(approvedRows(filas))).toEqual([
      ["4901", 1, 14],
      ["659001", 2, 12],
      ["659002", 1, 17],
    ]);
    expect(resumen(failedRows(filas))).toEqual([["659001", 1, 8]]);
  });

  test("las filas del ciclo en curso no cuentan en ningun total", () => {
    const enCurso = filas.filter((r) => r.periodCode === "2026-2");
    expect(enCurso).toHaveLength(2);
    expect(enCurso.every((r) => r.grade === null)).toBe(true);
    const contadas = [...approvedRows(filas), ...failedRows(filas)];
    expect(contadas.some((r) => r.periodCode === "2026-2")).toBe(false);
  });

  test("solo cuentan notas enteras: 11 a 20 aprueba, 0 a 10 desaprueba", () => {
    const rows = [0, 10, 11, 20, null, 10.5].map((g, i) => filaCon(g, 3, `65900${i}`));
    expect(approvedRows(rows).map((r) => r.grade)).toEqual([11, 20]);
    expect(failedRows(rows).map((r) => r.grade)).toEqual([0, 10]);
  });
});

describe("evaluateRecordTrust: orden y alcance de las condiciones", () => {
  test("la pagina base es de confianza", () => {
    expect(evaluateRecordTrust(pagina({}))).toEqual({ ok: true });
  });

  test("la cabecera se evalua antes que el pie y las filas", () => {
    const page = pagina({ headerOk: false, footer: null, rows: [], discarded: 3 });
    expect(evaluateRecordTrust(page)).toEqual(NO_CABECERA);
  });

  test("sin pie no es de confianza aunque las filas esten bien", () => {
    expect(evaluateRecordTrust(pagina({ footer: null }))).toEqual(NO_PIE);
  });

  test("sin filas se evalua antes que los descartes", () => {
    expect(evaluateRecordTrust(pagina({ rows: [], discarded: 2 }))).toEqual({
      ok: false,
      reason: "sin filas",
    });
  });

  test("el motivo lleva la cantidad de filas descartadas", () => {
    expect(evaluateRecordTrust(pagina({ discarded: 2 }))).toEqual({
      ok: false,
      reason: "2 filas descartadas",
    });
  });

  test("el orden de las cuatro comparaciones del pie es fijo", () => {
    // Con varias condiciones rotas a la vez, el motivo es siempre el de la primera.
    const roto = (cambios: Partial<RecordFooter>) =>
      evaluateRecordTrust(pagina({ footer: { ...PIE, ...cambios } }));
    expect(roto({ approvedCourses: 5, approvedCredits: 99, convalidatedCourses: 1, failedCourses: 9 }))
      .toEqual({ ok: false, reason: "aprobadas no coinciden con ASIG. APR." });
    expect(roto({ approvedCredits: 99, convalidatedCourses: 1, failedCourses: 9 }))
      .toEqual({ ok: false, reason: "créditos aprobados no coinciden con CRD. APROB." });
    expect(roto({ convalidatedCourses: 1, failedCourses: 9 }))
      .toEqual({ ok: false, reason: "hay convalidados (ASIG. CONV. > 0)" });
    expect(roto({ failedCourses: 9 }))
      .toEqual({ ok: false, reason: "desaprobadas no coinciden con ASIG. DESAP." });
  });

  test("filas sin nota o con una marca no suman cursos ni creditos", () => {
    const rows: RecordRow[] = [
      ...FILAS,
      filaCon(null, 4, "659104"),
      { ...filaCon(null, 3, "659105"), gradeRaw: "RET" },
    ];
    expect(evaluateRecordTrust(pagina({ rows }))).toEqual({ ok: true });
  });

  test("la tolerancia de creditos es 0.05", () => {
    expect(CREDIT_TOLERANCE).toBe(0.05);
  });
});
```

Notas para el ejecutor:
- El test no importa nada que cargue `src/db/index.ts`: `parsers/record.ts` solo importa `./html.js` y
  tipos, y el archivo de lógica solo importa tipos. Por eso no hace falta `mock.module`. El prefijo
  `DATABASE_URL=…` se usa igual, porque es obligatorio en todo el plan.
- El fixture se lee con ruta relativa a la raíz del repo (`Bun.file("test/HU34_jeff/fixtures/record.html")`),
  como el resto de la suite (p. ej. `test/HU31_jeff/parsers.record.test.ts:4`): por eso todos los comandos
  se corren desde la raíz del worktree.
- Si una variante hecha con `replace` no encuentra su literal, el primer test del archivo lo dice
  explícitamente. En ese caso no ajustes el test: revisa que el fixture de la Tarea 1 sea copia fiel del
  esqueleto (`notas-be-parsers.md` §2).
- El mojibake va escrito con escapes (`\u00c3\u201c`, `\u00c3\u0081`, `\uFFFD`) a propósito: `U+0081` es un
  carácter de control invisible y pegarlo literal se pierde al copiar.

- [ ] **Paso 2: Correr la prueba y ver que falla**

Primero, comprobar la precondición (Tarea 1 commiteada). Sin esto, el fallo del Paso 2 es el mismo aunque
falte la Tarea 1, porque el import que no resuelve es siempre el primero:

```bash
cd . && grep -c "export const parseRecordPage" src/modules/portal-sync/parsers/record.ts && grep -c "gradeRaw" src/modules/portal-sync/portal-sync.types.ts && ls test/HU34_jeff/fixtures/record.html
```

Esperado: `1`, `1` y la ruta del fixture. Si algo sale en 0 o `No such file or directory`, la Tarea 1 no
está hecha: PARAR y completarla primero.

Después, la prueba:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/record-trust.test.ts
```

Esperado: FAIL al cargar el archivo, con
`error: Cannot find module '../../src/modules/academic-record/academic-record.logic.js' from './test/HU34_jeff/record-trust.test.ts'`.
Ninguna prueba llega a correr (`0 pass`).

- [ ] **Paso 3: Implementación mínima**

Crear `src/modules/academic-record/academic-record.logic.ts` con este contenido completo. Solo importa
tipos: no agregues `db`, el repository ni `parsers/record.ts`, porque la función recibe la página ya
parseada.

```ts
/**
 * academic-record.logic.ts — Reglas puras del récord académico.
 *
 * Sin base de datos ni HTTP: reciben lo que ya leyó el parser del portal y
 * devuelven una decisión. Las usa `portal-sync.service.ts` durante la
 * importación, así que este archivo no importa `db` ni nada que lo cargue.
 */
import type { RecordPage, RecordRow } from "../portal-sync/portal-sync.types.js";

/** Veredicto de la regla de confianza (RS-BE-21). `reason` va solo al log del
 *  servidor: describe la condición que falló y nunca lleva notas, nombres ni
 *  códigos de alumno. */
export type RecordTrust = { ok: true } | { ok: false; reason: string };

/** Diferencia máxima admitida entre la suma de CRD. de las filas aprobadas y
 *  CRD. APROB. del pie. El pie trae un decimal y los créditos pueden ser 1.5:
 *  la tolerancia absorbe el error de coma flotante de la suma. */
export const CREDIT_TOLERANCE = 0.05;

/** `grade` es un entero dentro de [min, max]. `null` —ciclo en curso o una
 *  marca del portal en lugar de un número— nunca cumple. */
const notaEnteraEntre = (grade: number | null, min: number, max: number): boolean =>
  grade !== null && Number.isInteger(grade) && grade >= min && grade <= max;

/** Filas aprobadas: NOTA entera entre 11 y 20. Cada fila cuenta por separado:
 *  un curso jalado y luego aprobado aporta una aprobada y una desaprobada. */
export const approvedRows = (rows: readonly RecordRow[]): RecordRow[] =>
  rows.filter((r) => notaEnteraEntre(r.grade, 11, 20));

/** Filas desaprobadas: NOTA entera entre 0 y 10. */
export const failedRows = (rows: readonly RecordRow[]): RecordRow[] =>
  rows.filter((r) => notaEnteraEntre(r.grade, 0, 10));

/**
 * RS-BE-21: un récord es de confianza solo si se cumplen TODAS estas
 * condiciones. Se evalúan en este orden y se devuelve la primera que falla:
 *
 * 1. se halló la tabla del récord con su cabecera exacta (`headerOk`);
 * 2. se halló el pie con su cabecera de 10 columnas y todos sus números
 *    (`footer`). Sin pie no hay contra qué comparar: es un fallo, nunca un
 *    "se omite la comparación";
 * 3. hay al menos una fila de datos y ninguna se descartó;
 * 4. filas aprobadas === ASIG. APR.;
 * 5. suma de CRD. de esas filas, sin redondear, === CRD. APROB. (± CREDIT_TOLERANCE);
 * 6. ASIG. CONV. es 0 (todavía no se sabe cómo marca el portal un
 *    convalidado) y filas desaprobadas === ASIG. DESAP.
 *
 * TOTAL CRD. VÁLIDOS y TOTAL ASIG. VÁLIDOS se leen pero no deciden. Las filas
 * sin nota numérica no entran en ningún total: quedan fuera de los dos filtros.
 */
export const evaluateRecordTrust = (page: RecordPage): RecordTrust => {
  if (!page.headerOk) {
    return { ok: false, reason: "tabla del récord ausente o con cabecera distinta" };
  }
  const footer = page.footer;
  if (footer === null) return { ok: false, reason: "pie ausente o ilegible" };
  if (page.rows.length === 0) return { ok: false, reason: "sin filas" };
  if (page.discarded > 0) return { ok: false, reason: `${page.discarded} filas descartadas` };

  const aprobadas = approvedRows(page.rows);
  if (aprobadas.length !== footer.approvedCourses) {
    return { ok: false, reason: "aprobadas no coinciden con ASIG. APR." };
  }
  const creditosAprobados = aprobadas.reduce((suma, r) => suma + r.credits, 0);
  if (Math.abs(creditosAprobados - footer.approvedCredits) > CREDIT_TOLERANCE) {
    return { ok: false, reason: "créditos aprobados no coinciden con CRD. APROB." };
  }
  if (footer.convalidatedCourses > 0) {
    return { ok: false, reason: "hay convalidados (ASIG. CONV. > 0)" };
  }
  if (failedRows(page.rows).length !== footer.failedCourses) {
    return { ok: false, reason: "desaprobadas no coinciden con ASIG. DESAP." };
  }
  return { ok: true };
};
```

Por qué el caso de 8.54/8.46 pasa y el de 8.6/8.4 no: la suma 3.0 + 4.0 + 1.5 da exactamente 8.5.
`|8.5 − 8.54|` da 0.0399… (≤ 0.05) y `|8.5 − 8.6|` da 0.0999… (> 0.05). No agregues un caso de 8.55 al
test: en coma flotante da 0.05000000000000071 y cae fuera de la tolerancia.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/record-trust.test.ts
```

Esperado: PASS, `30 pass`, `0 fail`.

- [ ] **Paso 5: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ningún error y exit 0. La salida en `dist/` está en `.gitignore`. Si `tsc` reclama
por `RecordPage` o `RecordRow` inexistentes en `portal-sync.types.ts`, falta la Tarea 1.

- [ ] **Paso 6: Correr la carpeta HU34 completa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff
```

Esperado: PASS en `record-parser.test.ts` (Tarea 1) y en `record-trust.test.ts`, `0 fail`. Esta tarea no
modifica ningún archivo existente, así que no hay regresión que medir fuera de HU34.

- [ ] **Paso final: Commit**

```bash
cd . && git add src/modules/academic-record/academic-record.logic.ts test/HU34_jeff/record-trust.test.ts && git commit -m "feat(academic-record): regla de confianza del récord (RS-BE-21)"
```

Sin trailer Co-Authored-By y sin push.

### Tarea 3: Información académica general y por período (RS-BE-24)

**Archivos:**
- Crear: `test/HU34_jeff/fixtures/layout.html` (fixture inventado; la carpeta `test/HU34_jeff/fixtures/` ya existe si la Tarea 1 se hizo antes)
- Crear: `test/HU34_jeff/info-academica-parser.test.ts`
- Modificar: `src/modules/portal-sync/portal-sync.types.ts:24` (hoy la línea 24 es exactamente `export interface InfoAcademica { careerName: string | null }`; la Tarea 1 inserta `RecordFooter` y `RecordPage` antes de ella, así que el número corre: el ancla es el texto, no la línea)
- Modificar: `src/modules/portal-sync/parsers/info-academica.ts:1-25` (imports, comentario de cabecera y `parseInfoAcademica`; `parseImpedimentos`, líneas 27-34, NO se toca)
- Modificar: `test/HU31_jeff/parsers.info.test.ts:14-18` (la prueba de `Object.keys`)
- Modificar: `specs/features/portal-sync/portal-sync.spec.md:229-230` (§Parsers, la viñeta de `parseInfoAcademica` y su `[@test]`)
- Test: `test/HU34_jeff/info-academica-parser.test.ts`

Dos archivos que **no** se tocan, comprobados:
- `specs/features/academic-record/academic-record.spec.md`: ya trae el target
  `../../../src/modules/portal-sync/parsers/info-academica.ts` (línea 7) y el
  `[@test] ../../../test/HU34_jeff/info-academica-parser.test.ts` bajo RS-BE-24 (línea 223).
- `src/modules/portal-sync/parsers/index.ts` (el barrel): NO está en los `targets` de la spec y
  `AGENTS.md:24` prohíbe tocar lo que no esté ahí. Por eso las constantes nuevas se importan
  siempre desde `./parsers/info-academica.js` y nunca desde `./parsers/index.js` (lo necesita la
  Tarea 6, que hoy importa los parsers del barrel: `portal-sync.service.ts:12-16`).

Todos los comandos se corren desde la raíz del worktree `.`.

**Interfaces:**

- Consume (repo actual, `src/modules/portal-sync/parsers/html.ts`, copiado del archivo):
  ```ts
  export type ParseResult<T> = { ok: true; data: T } | { ok: false; reason: string };   // :2
  export const stripTags = (s: string): string   // :22  s.replace(/<[^>]*>/g, " ")
  export const clean = (s: string): string       // :25-26  decodeEntities + colapsa espacios + trim
  export const trsOf = (html: string): string[]  // :29  html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  export const cellsOf = (tr: string): string[]  // :36-37  clean(stripTags(td)) de cada <td>/<th>
  ```
  `clean` decodifica `&nbsp;` a espacio y recorta, así que una celda `&nbsp;` llega como `""`.
  `trsOf` y `cellsOf` llevan el flag `i`: el portal mezcla mayúsculas y minúsculas en las etiquetas.
- Consume (Tarea 1, ya commiteada; si no lo está, PARAR: ver el chequeo del Paso 2):
  ```ts
  // src/modules/portal-sync/parsers/html.ts
  export const normalizeCareerName = (name: string): string  // NFD, sin diacríticos, MAYÚSCULAS, espacios colapsados
  export const normalizeLabel = (s: string): string
  //   normalizeCareerName(s).replace(/[^A-Z0-9. ]/g, " ").replace(/\s+/g, " ").trim()
  ```
- Produce (lo usan la Tarea 5 —`AcademicGeneral`, `AcademicPeriodBlock` como parámetros del
  repository— y la Tarea 6 —`parseInfoAcademica` y `EMPTY_GENERAL` en el service—):
  ```ts
  // src/modules/portal-sync/portal-sync.types.ts
  export interface CountCredits { courses: number | null; credits: number | null }
  export interface AcademicGeneral {
    ppa: number | null; relativePosition: string | null;
    convalidated: CountCredits; approved: CountCredits;
    creditsAccumulated: number | null; creditsRequired: number | null;
  }
  export interface AcademicPeriodBlock {
    periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
    convalidated: CountCredits; enrolled: CountCredits; approved: CountCredits; failed: CountCredits;
  }
  export interface InfoAcademica {
    careerName: string | null;
    general: AcademicGeneral;             // siempre presente; campos null si no se leen
    period: AcademicPeriodBlock | null;   // null si no se halla el bloque o su código de ciclo
    unreadable: string[];                 // campos no leídos, para el log (p. ej. "general.ppa", "period")
  }

  // src/modules/portal-sync/parsers/info-academica.ts
  export const GENERAL_HEADER: readonly string[]   // 10 rótulos normalizados: cabecera 1 (6) + cabecera 2 (4)
  export const PERIOD_HEADER: readonly string[]    // 15 rótulos normalizados: cabecera 1 (7) + cabecera 2 (8)
  export const EMPTY_GENERAL: AcademicGeneral      // todos los campos en null, congelado
  export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica>
  //   sigue devolviendo { ok: false, reason: "no se encontró el bloque Información Académica" }
  //   cuando no halla la carrera, exactamente como hoy
  ```
  El orden de las claves de `data` es **`careerName`, `general`, `period`, `unreadable`**: dos pruebas
  (esta tarea y HU31) lo fijan con `Object.keys`.

  Nombres que se acumulan en `unreadable`, en el orden en que se leen los campos:
  `"general"` y `"period"` cuando falta el bloque entero o su cabecera no coincide; si el bloque se lee,
  `"general.ppa"`, `"general.relativePosition"`, `"general.convalidated.courses"`,
  `"general.convalidated.credits"`, `"general.approved.courses"`, `"general.approved.credits"`,
  `"general.creditsAccumulated"`, `"general.creditsRequired"`, `"period.average"`,
  `"period.relativePosition"`, `"period.level"`, `"period.convalidated.courses"`,
  `"period.convalidated.credits"`, `"period.enrolled.courses"`, `"period.enrolled.credits"`,
  `"period.approved.courses"`, `"period.approved.credits"`, `"period.failed.courses"`,
  `"period.failed.credits"`. Nunca lleva valores, solo nombres de campo: va al log de un repo público.

- [ ] **Paso 1: Escribir la prueba que falla**

Primero la carpeta y el fixture:

```bash
cd . && mkdir -p test/HU34_jeff/fixtures
```

Crear `test/HU34_jeff/fixtures/layout.html` (UTF-8, sin espacios al final de línea) con este
contenido completo. Es un esqueleto fiel del bloque real —rótulos con entidades, tres niveles de
tablas anidadas, cabecera en dos filas y una sola fila de valores— con **valores inventados**:
ninguno sale de un alumno real, y la carrera no es la del fixture de HU31.

```html
<html><body>
<a name=c7></a>
<table border=0 cellpadding=1 cellspacing=4 width="100%">
  <tr>
    <td bgcolor=#FF9A31>
      <table border=0 cellpadding=0 cellspacing=0 width="100%" bgcolor="#FF9A31">
        <tr>
          <td>
            <span CLASS="PortalTitleText">&nbsp;Información Académica</span>
          </td>
          <td nowrap valign="middle" align=right>
            &nbsp;
            &nbsp;
          </td>
        </tr>
      </table>
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td bgcolor="#ffffff">
<table border=0 cellpadding=3 cellspacing=0 width="100%" bgcolor="#ffffff">
              <tr>
                <td valign=top>
                  <div class="PortalChannelText">
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0//EN"
                      "http://www.w3.org/TR/WD-html-in-xml/DTD/xhtml1-strict.dtd">
<table width="100%" border="0">
    <tr>
        <td><b>
                <font face="Arial" size="2">INGENIER&Iacute;A INDUSTRIAL</font>
            </b>
        </td><td align="right"><a href="#"><img
                    vspace="0" hspace="0" alt="x"
                    height="26" width="211" border="0" src="x.gif">
            </a><font face="Arial" size="1">
                <br>
                <br>
            </font>
        </td></tr>
</table>
<br>
<b>
    <font face="Arial" size="2">- Informaci&oacute;n General </font>
</b>
<br>
<br>
<table bgcolor="#CCCCCC" width="100%" cellspacing="0" align="top" border="0">
    <tr>
        <td align="left" valign="top"><div align="left">
                <table bgcolor="#FFFFFF" cellspacing="0" width="100%" border="0">
                    <tr>
                        <td align="left" valign="top"><div align="left">
                                <table cellspacing="1" cellpadding="2"
                                    width="100%" border="0">
                                    <tr>
                                    <td bgcolor="#CCCCCC"
                                    rowspan="2" width="10%"><b>
                                    <font face="Arial"
                                    size="1">Promedio
                                    Ponderado Acumulado</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    rowspan="2" width="30%"><b>
                                    <font face="Arial"
                                    size="1">Ubicaci&oacute;n Relativa</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    colspan="2" width="20%"><b>
                                    <font face="Arial" size="1">Convalidados</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    colspan="2" width="20%"><b>
                                    <font face="Arial" size="1">Aprobados</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    rowspan="2" width="10%"><b>
                                    <font face="Arial"
                                    size="1">Cr&eacute;ditos Acumulados</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    rowspan="2" width="10%"><b>
                                    <font face="Arial"
                                    size="1">Cr&eacute;ditos
                                    Requeridos Especialidad</font>
                                    </b>
                                    </td></tr>
                                    <tr>
                                    <td bgcolor="#CCCCCC" width="11%"><b>
                                    <font face="Arial" size="1">Cursos</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC" width="10%"><b>
                                    <font face="Arial" size="1">Cr&eacute;ditos</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC" width="4%"><b>
                                    <font face="Arial" size="1">Cursos</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC" width="9%"><b>
                                    <font face="Arial" size="1">Cr&eacute;ditos</font>
                                    </b>
                                    </td></tr>
                                    <tr>
                                    <td bgcolor="#EFEFEF" width="10%"><b>
                                    <font face="Arial" size="1">14.2500</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="30%"><b>
                                    <font face="Arial"
                                    size="1">TERCIO SUPERIOR</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="4%"><b>
                                    <font face="Arial" size="1">2</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="9%"><b>
                                    <font face="Arial" size="1">6</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="11%"><b>
                                    <font face="Arial" size="1">30</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="10%"><b>
                                    <font face="Arial" size="1">100</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="10%"><b>
                                    <font face="Arial" size="1">106</font>
                                    </b>
                                    </td><td bgcolor="#EFEFEF" width="10%"><b>
                                    <font face="Arial" size="1">210.0</font>
                                    </b>
                                    </td></tr>
                                </table>
                            </div>
                        </td></tr>
                </table>
            </div>
        </td></tr>
</table>
<br>
<BR>
<BR>
<b>
    <font face="Arial" size="2">- Informaci&oacute;n por Per&iacute;odo
        Acad&eacute;mico: Ciclo 2026-1</font>
</b>
<br>
<br>
<table bgcolor="#CCCCCC" width="100%" cellspacing="0" align="top" border="0">
    <tr>
        <td align="left" valign="top"><div align="left">
                <table bgcolor="#FFFFFF" cellspacing="0" width="100%" border="0">
                    <tr>
                        <td align="left" valign="top"><div align="left">
                                <table cellspacing="1" cellpadding="2"
                                    width="100%" border="0">
                                    <tr>
                                    <td bgcolor="#CCCCCC"
                                    rowspan="2" width="10%"><b>
                                    <font face="Arial"
                                    size="1">Promedio Per&iacute;odo</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    rowspan="2" width="30%"><b>
                                    <font face="Arial"
                                    size="1">Ubicaci&oacute;n
                                    Relativa (*)</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    rowspan="2" width="10%"><b>
                                    <font face="Arial" size="1.5pt">Nivel</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    colspan="2" width="10%"><b>
                                    <font face="Arial" size="1">Convalidados</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    colspan="2" width="10%"><b>
                                    <font face="Arial" size="1">Matriculados</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    colspan="2" width="10%"><b>
                                    <font face="Arial" size="1">Aprobados</font>
                                    </b>
                                    </td><td bgcolor="#CCCCCC"
                                    colspan="2" width="10%"><b>
                                    <font face="Arial" size="1">Desaprobados</font>
                                    </b>
                                    </td></tr>
                                    <tr>
                                    <td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cursos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cr&eacute;ditos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cursos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cr&eacute;ditos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cursos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cr&eacute;ditos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cursos</font></b>
                                    </td><td bgcolor="#CCCCCC" width="5%"><b><font face="Arial" size="1">Cr&eacute;ditos</font></b>
                                    </td></tr>
                                    <tr>
                                    <td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">13.2500</font></b>
                                    </td><td bgcolor="#EFEFEF" width="30%"><b><font face="Arial"
                                    size="1">MEDIO SUPERIOR</font></b>
                                    </td><td bgcolor="#EFEFEF" width="10%"><b><font face="Arial" size="1">4</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">1</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">3.0</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">7</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">23</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">5</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">16.0</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">2</font></b>
                                    </td><td bgcolor="#EFEFEF" width="5%"><b><font face="Arial" size="1">7.0</font></b>
                                    </td></tr>
                                </table>
                            </div>
                        </td></tr>
                </table>
            </div>
        </td></tr>
</table>
<br>
<br>
<table width="100%">
    <tr>
        <td><div align="left">
                <a href="#"><img alt="x" border="0" src="x.gif"></a></div>
        </td></tr>
</table>
<br>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<a name=c8></a>
<table border=0 cellpadding=1 cellspacing=4 width="100%"><tr><td bgcolor=#FF9A31>
  <span CLASS="PortalTitleText">&nbsp;Información para Matrícula</span>
</td></tr></table>
</body></html>
```

Después, crear `test/HU34_jeff/info-academica-parser.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import {
  EMPTY_GENERAL,
  GENERAL_HEADER,
  PERIOD_HEADER,
  parseInfoAcademica,
} from "../../src/modules/portal-sync/parsers/info-academica.js";

// RS-BE-24 — Información académica de `layout.jsp`: general y por período.
// Fixture inventado de HU34: ningún valor sale de un alumno real.
const layout = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();

/** Datos del parser. Todas las variantes de este archivo siguen siendo `ok`:
 *  lo que cambia es cuántos campos quedan en `null`. */
const leer = (html: string) => {
  const r = parseInfoAcademica(html);
  if (!r.ok) throw new Error(`parser fallo: ${r.reason}`);
  return r.data;
};

// Literales del fixture sobre los que se arman las variantes.
const PPA = 'size="1">14.2500</font>';
const ROTULO_GENERAL = 'size="1">Cr&eacute;ditos Acumulados</font>';
const ROTULO_PERIODO = 'size="1">Desaprobados</font>';
const BLOQUE_PERIODO = "- Informaci&oacute;n por Per&iacute;odo";
const CICLO_PERIODO = "Acad&eacute;mico: Ciclo 2026-1</font>";
const UBICACION_PERIODO = 'size="1">MEDIO SUPERIOR</font>';
const NIVEL_PERIODO = 'size="1">4</font>';

/** El bloque por período cuando su cabecera no coincide: queda el ciclo y nada más. */
const PERIODO_VACIO = {
  periodCode: "2026-1",
  average: null,
  relativePosition: null,
  level: null,
  convalidated: { courses: null, credits: null },
  enrolled: { courses: null, credits: null },
  approved: { courses: null, credits: null },
  failed: { courses: null, credits: null },
};

describe("fixture HU34 de layout", () => {
  test("cada literal que usan las variantes aparece exactamente una vez", () => {
    for (const literal of [
      PPA, ROTULO_GENERAL, ROTULO_PERIODO, BLOQUE_PERIODO,
      CICLO_PERIODO, UBICACION_PERIODO, NIVEL_PERIODO,
    ]) {
      expect(layout.split(literal)).toHaveLength(2);
    }
  });
});

describe("parseInfoAcademica con el bloque completo", () => {
  test("devuelve carrera, general, periodo y los campos no leidos", () => {
    expect(Object.keys(leer(layout))).toEqual(["careerName", "general", "period", "unreadable"]);
  });

  test("la carrera se sigue leyendo como antes", () => {
    expect(leer(layout).careerName).toBe("INGENIERÍA INDUSTRIAL");
  });

  test("lee la informacion general completa", () => {
    expect(leer(layout).general).toEqual({
      ppa: 14.25,
      relativePosition: "TERCIO SUPERIOR",
      convalidated: { courses: 2, credits: 6 },
      approved: { courses: 30, credits: 100 },
      creditsAccumulated: 106,
      creditsRequired: 210,
    });
  });

  test("lee el bloque por periodo con el ciclo que el mismo declara", () => {
    expect(leer(layout).period).toEqual({
      periodCode: "2026-1",
      average: 13.25,
      relativePosition: "MEDIO SUPERIOR",
      level: 4,
      convalidated: { courses: 1, credits: 3 },
      enrolled: { courses: 7, credits: 23 },
      approved: { courses: 5, credits: 16 },
      failed: { courses: 2, credits: 7 },
    });
  });

  test("con todo leido unreadable queda vacio", () => {
    expect(leer(layout).unreadable).toEqual([]);
  });

  test("las etiquetas de cierre en mayusculas no rompen el corte del bloque", () => {
    const d = leer(layout.replaceAll("</table>", "</TABLE>"));
    expect(d.general.ppa).toBe(14.25);
    expect(d.period?.periodCode).toBe("2026-1");
    expect(d.unreadable).toEqual([]);
  });
});

describe("parseInfoAcademica sin bloque por periodo", () => {
  const sinRotulo = () => leer(layout.replace(BLOQUE_PERIODO, "- Otra secci&oacute;n"));

  test("sin el rotulo del bloque, period es null y se anota en unreadable", () => {
    expect(sinRotulo().period).toBeNull();
    expect(sinRotulo().unreadable).toEqual(["period"]);
  });

  test("sin codigo de ciclo tampoco hay bloque por periodo", () => {
    const d = leer(layout.replace(CICLO_PERIODO, "Acad&eacute;mico: Ciclo</font>"));
    expect(d.period).toBeNull();
    expect(d.unreadable).toEqual(["period"]);
  });

  test("el bloque general se sigue leyendo sin el bloque por periodo", () => {
    expect(sinRotulo().general.ppa).toBe(14.25);
  });
});

describe("parseInfoAcademica con una cabecera que no coincide", () => {
  const generalRota = () => leer(layout.replace(ROTULO_GENERAL, 'size="1">Cr&eacute;ditos Totales</font>'));

  test("un rotulo distinto en General deja todos sus campos en null", () => {
    expect(generalRota().general).toEqual(EMPTY_GENERAL);
    expect(generalRota().unreadable).toEqual(["general"]);
  });

  test("con la cabecera General rota el bloque por periodo se sigue leyendo", () => {
    expect(generalRota().period?.average).toBe(13.25);
  });

  test("un rotulo distinto por periodo deja el periodCode y el resto en null", () => {
    const d = leer(layout.replace(ROTULO_PERIODO, 'size="1">Jalados</font>'));
    expect(d.period).toEqual(PERIODO_VACIO);
    expect(d.unreadable).toEqual(["period"]);
  });

  test("las dos secuencias esperadas son las que publica el portal", () => {
    expect(GENERAL_HEADER).toEqual([
      "PROMEDIO PONDERADO ACUMULADO", "UBICACION RELATIVA", "CONVALIDADOS", "APROBADOS",
      "CREDITOS ACUMULADOS", "CREDITOS REQUERIDOS ESPECIALIDAD",
      "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
    ]);
    expect(PERIOD_HEADER).toEqual([
      "PROMEDIO PERIODO", "UBICACION RELATIVA", "NIVEL",
      "CONVALIDADOS", "MATRICULADOS", "APROBADOS", "DESAPROBADOS",
      "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
    ]);
  });
});

describe("parseInfoAcademica con valores que no se pueden leer", () => {
  const conRaya = () => leer(layout.replace(PPA, 'size="1">—</font>'));

  test("un valor con raya deja el campo en null y nunca en 0", () => {
    expect(conRaya().general.ppa).toBeNull();
    expect(conRaya().general.ppa).not.toBe(0);
    expect(conRaya().unreadable).toEqual(["general.ppa"]);
  });

  test("el resto del bloque se lee aunque un valor falle", () => {
    expect(conRaya().general.relativePosition).toBe("TERCIO SUPERIOR");
    expect(conRaya().general.creditsRequired).toBe(210);
  });

  test("nivel no entero y ubicacion vacia quedan en null y se anotan", () => {
    const d = leer(
      layout
        .replace(NIVEL_PERIODO, 'size="1">N/D</font>')
        .replace(UBICACION_PERIODO, 'size="1">&nbsp;</font>'),
    );
    expect(d.period?.level).toBeNull();
    expect(d.period?.relativePosition).toBeNull();
    expect(d.period?.average).toBe(13.25);
    expect(d.unreadable).toEqual(["period.relativePosition", "period.level"]);
  });
});

describe("EMPTY_GENERAL y las paginas sin tablas", () => {
  test("EMPTY_GENERAL tiene todo en null y esta congelado", () => {
    expect(EMPTY_GENERAL).toEqual({
      ppa: null,
      relativePosition: null,
      convalidated: { courses: null, credits: null },
      approved: { courses: null, credits: null },
      creditsAccumulated: null,
      creditsRequired: null,
    });
    expect(Object.isFrozen(EMPTY_GENERAL)).toBe(true);
    expect(Object.isFrozen(EMPTY_GENERAL.convalidated)).toBe(true);
    expect(Object.isFrozen(EMPTY_GENERAL.approved)).toBe(true);
  });

  test("con la carrera pero sin las tablas devuelve ok con todo en null", () => {
    const d = leer("<html>Información Académica INGENIERÍA INDUSTRIAL - Información General</html>");
    expect(d.careerName).toBe("INGENIERÍA INDUSTRIAL");
    expect(d.general).toEqual(EMPTY_GENERAL);
    expect(d.period).toBeNull();
    expect(d.unreadable).toEqual(["general", "period"]);
  });

  test("sin el bloque Informacion Academica el parser falla como hoy", () => {
    const r = parseInfoAcademica("<html>nada</html>");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no se encontró el bloque Información Académica");
  });
});
```

Notas para el ejecutor:
- El fixture se lee con ruta relativa a la raíz del repo, como el resto de la suite
  (`test/HU31_jeff/parsers.info.test.ts:4`): por eso todos los comandos se corren desde la raíz del worktree.
- El test no importa nada que cargue `src/db/index.ts` (`info-academica.ts` solo importa `./html.js` y
  tipos), así que no hace falta `mock.module`. El prefijo `DATABASE_URL=…` se usa igual: es obligatorio en
  todo el plan porque `test/env.setup.ts` hace `process.env.DATABASE_URL ||= …` y bun ya cargó el `.env`
  del worktree, que apunta a PRODUCCIÓN.
- Si el primer test falla, el fixture no es copia fiel: no ajustes el test, corrige el fixture.
- `'size="1">—</font>'` lleva una raya larga U+2014 literal. `'size="1">&nbsp;</font>'` se decodifica a
  espacio y la celda queda vacía: es el caso "el portal no publicó ese dato".
- El caso de `</TABLE>` en mayúsculas no es hipotético: `test/HU31_jeff/fixtures/layout.html` trae 74
  `</table>` y **1** `</TABLE>`. Por eso el corte del bloque se hace con una regex `i` y no con
  `indexOf("</table>")`.

- [ ] **Paso 2: Correr la prueba y ver que falla**

Primero, la precondición (Tarea 1 commiteada). Sin esto el fallo sería confuso, porque `normalizeLabel`
todavía no existiría:

```bash
cd . && grep -c "export const normalizeLabel" src/modules/portal-sync/parsers/html.ts
```

Esperado: `1`. Si sale `0`, la Tarea 1 no está hecha: PARAR y completarla primero.

Después, la prueba:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/info-academica-parser.test.ts
```

Esperado: FAIL al cargar el archivo, con

```
SyntaxError: Export named 'EMPTY_GENERAL' not found in module './src/modules/portal-sync/parsers/info-academica.ts'.
```

y `0 pass`, `1 fail`: el módulo no enlaza y ninguna prueba llega a correr. Bun nombra el primero de los
tres exports nuevos que no encuentra; si nombra `GENERAL_HEADER` o `PERIOD_HEADER` el fallo es el mismo y
vale igual. Lo que NO vale es un fallo de aserción: eso significaría que los exports ya existen.

- [ ] **Paso 3: Implementación mínima**

**3.a — `src/modules/portal-sync/portal-sync.types.ts`.**

Reemplazar esto (hoy la línea 24, entre la llave de cierre de `RecordRow` y `export interface Impedimentos`):

```ts
export interface InfoAcademica { careerName: string | null }
```

por esto:

```ts
/** Cursos y créditos de un grupo del bloque "Información Académica"
 *  ("Convalidados", "Aprobados"…). Cada número puede faltar por separado:
 *  `null` es "no se pudo leer", nunca 0. */
export interface CountCredits { courses: number | null; credits: number | null }

/** Sub-bloque "Información General" de `layout.jsp` (RS-BE-24). */
export interface AcademicGeneral {
  ppa: number | null; relativePosition: string | null;
  convalidated: CountCredits; approved: CountCredits;
  creditsAccumulated: number | null; creditsRequired: number | null;
}

/** Sub-bloque "Información por Período Académico" de `layout.jsp` (RS-BE-24).
 *  `periodCode` es el ciclo que el propio bloque declara, que es el ANTERIOR
 *  al que se está importando: nunca se guarda como "período actual". */
export interface AcademicPeriodBlock {
  periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
  convalidated: CountCredits; enrolled: CountCredits; approved: CountCredits; failed: CountCredits;
}

export interface InfoAcademica {
  careerName: string | null;
  /** Siempre presente; sus campos quedan `null` si no se pudieron leer. */
  general: AcademicGeneral;
  /** `null` si no se halla el bloque o su código de ciclo. */
  period: AcademicPeriodBlock | null;
  /** Nombres de los campos que no se pudieron leer ("general.ppa", "period"…),
   *  para el log del servidor. Nunca lleva valores: el repo es público. */
  unreadable: string[];
}
```

**3.b — `src/modules/portal-sync/parsers/info-academica.ts`, imports.**

Reemplazar esto (líneas 1-2):

```ts
import { clean, stripTags, type ParseResult } from "./html.js";
import type { Impedimentos, InfoAcademica } from "../portal-sync.types.js";
```

por esto:

```ts
import { cellsOf, clean, normalizeLabel, stripTags, trsOf, type ParseResult } from "./html.js";
import type {
  AcademicGeneral,
  AcademicPeriodBlock,
  Impedimentos,
  InfoAcademica,
} from "../portal-sync.types.js";
```

**3.c — `src/modules/portal-sync/parsers/info-academica.ts`, comentario y `parseInfoAcademica`.**

Reemplazar esto (líneas 4-25, desde el `/**` hasta el `};` que cierra `parseInfoAcademica`; el
`parseImpedimentos` que viene después NO se toca):

```ts
/**
 * Bloque "Información Académica". Solo se extrae la carrera.
 *
 * NO se extrae el nivel: la sincronización lo toma del consolidado de
 * matrícula del ciclo importado, porque el bloque "Información por Período"
 * describe el ciclo ANTERIOR. Tampoco se extraen PPA ni ubicación relativa:
 * no hay columna donde guardarlos.
 *
 * Los sub-bloques "Información General" e "Información por Período" tienen
 * marcado idéntico y solo se distinguen por su rótulo de texto, así que hay
 * que anclarse en el rótulo y nunca en el orden de las tablas.
 */
export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica> => {
  const text = clean(stripTags(html));
  const careerName = text.match(
    /Informaci[óo]n Acad[ée]mica\s+([A-ZÁÉÍÓÚÑ .]{5,60}?)\s+-\s*Informaci[óo]n General/i,
  )?.[1];
  if (!careerName) {
    return { ok: false, reason: "no se encontró el bloque Información Académica" };
  }
  return { ok: true, data: { careerName: clean(careerName) } };
};
```

por esto:

```ts
/** Secuencia exacta de rótulos normalizados de "Información General":
 *  cabecera 1 (6 celdas) seguida de cabecera 2 (4 celdas). */
export const GENERAL_HEADER: readonly string[] = [
  "PROMEDIO PONDERADO ACUMULADO", "UBICACION RELATIVA", "CONVALIDADOS", "APROBADOS",
  "CREDITOS ACUMULADOS", "CREDITOS REQUERIDOS ESPECIALIDAD",
  "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
];

/** Secuencia exacta de rótulos normalizados de "Información por Período":
 *  cabecera 1 (7 celdas) seguida de cabecera 2 (8 celdas). El "(*)" de
 *  "Ubicación Relativa (*)" lo borra `normalizeLabel`. */
export const PERIOD_HEADER: readonly string[] = [
  "PROMEDIO PERIODO", "UBICACION RELATIVA", "NIVEL",
  "CONVALIDADOS", "MATRICULADOS", "APROBADOS", "DESAPROBADOS",
  "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS", "CURSOS", "CREDITOS",
];

/** Información general sin un solo campo leído. Congelada porque se devuelve
 *  por referencia cada vez que el bloque falta o su cabecera no coincide. */
export const EMPTY_GENERAL: AcademicGeneral = Object.freeze({
  ppa: null,
  relativePosition: null,
  convalidated: Object.freeze({ courses: null, credits: null }),
  approved: Object.freeze({ courses: null, credits: null }),
  creditsAccumulated: null,
  creditsRequired: null,
});

/** Rótulos crudos: el portal los emite con entidades y los parte en líneas. */
const GENERAL_RE = /Informaci(?:&oacute;|ó|o)n General/i;
const PERIOD_RE =
  /Informaci(?:&oacute;|ó|o)n por Per(?:&iacute;|í|i)odo\s+Acad(?:&eacute;|é|e)mico:\s*Ciclo\s+(\d{4}-[0-2])/i;

const NUMERO = /^\d+(\.\d+)?$/;
const ENTERO = /^\d+$/;
/** El portal mezcla `</table>` y `</TABLE>` en la misma página, así que el
 *  cierre se busca con una regex insensible a mayúsculas y no con `indexOf`. */
const CIERRE = /<\/table\s*>/i;

/** Las 3 `tr` del sub-bloque que empieza en `desde`: dos de cabecera y una de
 *  valores. `null` si el corte no las trae. */
const filasDelBloque = (html: string, desde: number): string[] | null => {
  const resto = html.slice(desde);
  const cierre = CIERRE.exec(resto);
  if (!cierre) return null;
  const trs = trsOf(resto.slice(0, cierre.index + cierre[0].length));
  return trs.length >= 3 ? trs : null;
};

const cabeceraOk = (trs: string[], esperada: readonly string[]): boolean => {
  const rotulos = [...cellsOf(trs[0]), ...cellsOf(trs[1])].map(normalizeLabel);
  return rotulos.length === esperada.length && rotulos.every((r, i) => r === esperada[i]);
};

/** Lector por posición que anota en `unreadable` toda celda que no se pudo
 *  leer. `cells` puede ser más corta que las posiciones pedidas. */
const crearLector = (cells: string[], prefijo: string, unreadable: string[]) => {
  const anotar = (campo: string): null => {
    unreadable.push(`${prefijo}.${campo}`);
    return null;
  };
  return {
    /** Entero o decimal. Un valor ilegible da `null`, nunca 0. */
    numero: (i: number, campo: string): number | null => {
      const v = cells[i] ?? "";
      return NUMERO.test(v) ? Number(v) : anotar(campo);
    },
    /** Solo entero: cursos y nivel. */
    entero: (i: number, campo: string): number | null => {
      const v = cells[i] ?? "";
      return ENTERO.test(v) ? Number(v) : anotar(campo);
    },
    /** Texto ya normalizado por `cellsOf`; vacío es "no leído". */
    texto: (i: number, campo: string): string | null => {
      const v = cells[i] ?? "";
      return v === "" ? anotar(campo) : v;
    },
  };
};

const leerGeneral = (html: string, unreadable: string[]): AcademicGeneral => {
  const m = GENERAL_RE.exec(html);
  const trs = m ? filasDelBloque(html, m.index) : null;
  if (!trs || !cabeceraOk(trs, GENERAL_HEADER)) {
    unreadable.push("general");
    return EMPTY_GENERAL;
  }
  const lee = crearLector(cellsOf(trs[2]), "general", unreadable);
  return {
    ppa: lee.numero(0, "ppa"),
    relativePosition: lee.texto(1, "relativePosition"),
    convalidated: {
      courses: lee.entero(2, "convalidated.courses"),
      credits: lee.numero(3, "convalidated.credits"),
    },
    approved: {
      courses: lee.entero(4, "approved.courses"),
      credits: lee.numero(5, "approved.credits"),
    },
    creditsAccumulated: lee.numero(6, "creditsAccumulated"),
    creditsRequired: lee.numero(7, "creditsRequired"),
  };
};

const leerPeriodo = (html: string, unreadable: string[]): AcademicPeriodBlock | null => {
  const m = PERIOD_RE.exec(html);
  const periodCode = m?.[1];
  if (!m || !periodCode) {
    unreadable.push("period");
    return null;
  }
  const trs = filasDelBloque(html, m.index);
  if (!trs || !cabeceraOk(trs, PERIOD_HEADER)) {
    unreadable.push("period");
    return {
      periodCode,
      average: null, relativePosition: null, level: null,
      convalidated: { courses: null, credits: null },
      enrolled: { courses: null, credits: null },
      approved: { courses: null, credits: null },
      failed: { courses: null, credits: null },
    };
  }
  const lee = crearLector(cellsOf(trs[2]), "period", unreadable);
  return {
    periodCode,
    average: lee.numero(0, "average"),
    relativePosition: lee.texto(1, "relativePosition"),
    level: lee.entero(2, "level"),
    convalidated: {
      courses: lee.entero(3, "convalidated.courses"),
      credits: lee.numero(4, "convalidated.credits"),
    },
    enrolled: {
      courses: lee.entero(5, "enrolled.courses"),
      credits: lee.numero(6, "enrolled.credits"),
    },
    approved: {
      courses: lee.entero(7, "approved.courses"),
      credits: lee.numero(8, "approved.credits"),
    },
    failed: {
      courses: lee.entero(9, "failed.courses"),
      credits: lee.numero(10, "failed.credits"),
    },
  };
};

/**
 * Bloque "Información Académica" de `layout.jsp`: carrera, información general
 * e información por período (RS-BE-24).
 *
 * De "Información General" salen PPA, ubicación relativa, cursos y créditos
 * convalidados y aprobados, créditos acumulados y créditos requeridos de la
 * especialidad. De "Información por Período" salen su código de ciclo,
 * promedio, ubicación relativa, nivel y los cursos y créditos convalidados,
 * matriculados, aprobados y desaprobados.
 *
 * El `level` de ese bloque NO es el nivel del alumno hoy: el bloque describe el
 * ciclo ANTERIOR y por eso se guarda con el código de ciclo que él mismo
 * declara. La sincronización sigue tomando el nivel del consolidado de
 * matrícula del ciclo importado.
 *
 * Los sub-bloques tienen marcado idéntico y solo se distinguen por su rótulo de
 * texto, así que hay que anclarse en el rótulo y nunca en el orden de las
 * tablas. Además son tres niveles de tablas anidadas: `/<table…<\/table>/` no
 * sirve para recortarlos y se corta desde el rótulo hasta el primer cierre de
 * tabla.
 *
 * La cabecera tiene grupos ("Convalidados", "Aprobados"…) con "Cursos |
 * Créditos" repetido debajo y una sola fila de valores, así que primero se
 * valida la secuencia completa de rótulos normalizados y recién entonces se
 * leen los valores por posición. Si la secuencia no coincide, todos los campos
 * de ese bloque quedan `null`. Un campo ilegible queda `null` —nunca 0— y su
 * nombre se acumula en `unreadable` para que el service lo escriba en el log.
 */
export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica> => {
  const text = clean(stripTags(html));
  const careerName = text.match(
    /Informaci[óo]n Acad[ée]mica\s+([A-ZÁÉÍÓÚÑ .]{5,60}?)\s+-\s*Informaci[óo]n General/i,
  )?.[1];
  if (!careerName) {
    return { ok: false, reason: "no se encontró el bloque Información Académica" };
  }
  const unreadable: string[] = [];
  const general = leerGeneral(html, unreadable);
  const period = leerPeriodo(html, unreadable);
  return { ok: true, data: { careerName: clean(careerName), general, period, unreadable } };
};
```

Detalles que no se pueden cambiar sin romper una prueba:
- `GENERAL_RE`, `PERIOD_RE` y `CIERRE` **no** llevan el flag `g`: con `g`, `exec` arrastra `lastIndex`
  entre llamadas y la segunda invocación del parser sobre el mismo módulo devolvería `null`.
- `general` y `period` se calculan en variables antes del `return` para que el orden de claves de `data`
  sea `careerName, general, period, unreadable`.
- `cells[i] ?? ""` parece redundante para TypeScript (el tipo es `string` porque el repo no usa
  `noUncheckedIndexedAccess`), pero en ejecución la fila puede traer menos celdas que las posiciones
  pedidas; sin el `?? ""`, `texto` devolvería `undefined`.
- El comentario largo va pegado a `parseInfoAcademica`, como hoy: si se deja suelto arriba del archivo
  queda un bloque JSDoc huérfano.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/info-academica-parser.test.ts
```

Esperado: PASS, `20 pass`, `0 fail`, `46 expect() calls` (40 llamadas escritas, una de ellas dentro de un
bucle de 7 literales).

- [ ] **Paso 5: Actualizar la prueba de HU31 que el cambio rompe**

`test/HU31_jeff/parsers.info.test.ts` fija hoy que `InfoAcademica` tiene una sola clave. Reemplazar esto
(líneas 14-18):

```ts
  test("solo extrae la carrera: ni PPA, ni ubicacion, ni nivel", () => {
    const r = parseInfoAcademica(layout);
    if (!r.ok) throw new Error("parser fallo");
    expect(Object.keys(r.data)).toEqual(["careerName"]);
  });
```

por esto:

```ts
  test("devuelve carrera, general, periodo y los campos no leidos", () => {
    const r = parseInfoAcademica(layout);
    if (!r.ok) throw new Error("parser fallo");
    expect(Object.keys(r.data)).toEqual(["careerName", "general", "period", "unreadable"]);
  });
```

Y correr la carpeta HU31 completa, que es la prueba de regresión de esta tarea (usa el fixture real de
`layout.jsp`; se comprobó emulando el parser sobre ese fixture que las dos cabeceras coinciden exactamente,
que cada bloque da sus 3 `tr` y que `unreadable` queda vacío, así que el parser nuevo lo lee entero):

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU31_jeff
```

Esperado: `0 fail`. `parsers.info.test.ts` aporta `5 pass`. Si algún `service.*.test.ts` falla, NO es por
esta tarea: `info.data.careerName` no cambió y es lo único que el service consume hoy
(`portal-sync.service.ts:724`), y ningún otro archivo de `src/` ni de `test/` construye un `InfoAcademica`
(comprobado con `grep -rn "InfoAcademica" src test`).

- [ ] **Paso 6: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ningún error y exit 0. Si `tsc` reclama que `normalizeLabel` no existe en
`parsers/html.ts`, falta la Tarea 1.

- [ ] **Paso 7: Documentación — `specs/features/portal-sync/portal-sync.spec.md` §Parsers**

Reemplazar esto (líneas 229-230):

```markdown
- `parseInfoAcademica(html)` → `{ careerName, lastPeriodLevel }`. Los bloques "Información General" e "Información por Período" son dos tablas de marcado idéntico separadas solo por el texto rotulador: hay que anclarse en ese rótulo, no en el orden de tablas. **PPA y ubicación relativa no se extraen**: no existe columna donde guardarlos (ver §Decisiones pendientes).
  `[@test] ../../../test/HU31_jeff/parsers.info.test.ts`
```

por esto:

```markdown
- `parseInfoAcademica(html)` → `{ careerName, general, period, unreadable }`, con la forma que fija **RS-BE-24** de `../academic-record/academic-record.spec.md`. Los bloques "Información General" e "Información por Período" son dos tablas de marcado idéntico separadas solo por el texto rotulador: hay que anclarse en ese rótulo, no en el orden de tablas. De "Información General" salen PPA, ubicación relativa, cursos y créditos convalidados y aprobados, créditos acumulados y créditos requeridos de la especialidad; de "Información por Período", su código de ciclo, promedio, ubicación relativa, nivel y los cursos y créditos convalidados, matriculados, aprobados y desaprobados. Son tres niveles de tablas anidadas, así que el bloque se recorta desde su rótulo hasta el primer cierre de tabla (con regex insensible a mayúsculas: la página mezcla `</table>` y `</TABLE>`). La secuencia normalizada de rótulos de la cabecera se valida antes de leer los valores por posición; si no coincide, todos los campos de ese bloque quedan `null`. Un campo que no se puede leer queda `null` —nunca 0— y su nombre va en `unreadable`, que el service escribe en el log del servidor.
  `[@test] ../../../test/HU31_jeff/parsers.info.test.ts`
  `[@test] ../../../test/HU34_jeff/info-academica-parser.test.ts`
```

Comprobar que la viñeta quedó bien y que las dos rutas existen:

```bash
cd . && grep -n "parseInfoAcademica" specs/features/portal-sync/portal-sync.spec.md && ls test/HU31_jeff/parsers.info.test.ts test/HU34_jeff/info-academica-parser.test.ts
```

Esperado: una sola línea con `parseInfoAcademica` (la nueva, sin `lastPeriodLevel`) y las dos rutas
listadas. El resto de `portal-sync.spec.md` —inventario de datos, decisiones #2 y #7, body de `/import`—
lo toca la Tarea 6, y la viñeta de `parseRecordAcademico` (línea 227) no es de esta tarea: no adelantarlas acá.

- [ ] **Paso final: Commit**

```bash
cd . && git add src/modules/portal-sync/parsers/info-academica.ts src/modules/portal-sync/portal-sync.types.ts test/HU34_jeff/fixtures/layout.html test/HU34_jeff/info-academica-parser.test.ts test/HU31_jeff/parsers.info.test.ts specs/features/portal-sync/portal-sync.spec.md && git commit -m "feat(academic-record): información académica general y por período (RS-BE-24)"
```

Sin trailer Co-Authored-By y sin push.

### Tarea 4: Modelo de datos: schema y migración 0011

**Archivos:**
- Crear: `drizzle/0011_academic_record.sql`
- Crear: `test/HU34_jeff/migration-0011.test.ts`
- Modificar: `src/db/schema/schema.ts:624-632` (las tres tablas se agregan al final del archivo, después del bloque `chatbotMessage`, que hoy termina en la línea 632 —la última—; no se toca ninguna línea existente ni la lista de imports de las líneas 1-21, que ya trae todo lo necesario)
- Modificar: `specs/features/academic-record/academic-record.spec.md:310-313` (se agrega el `[@test]` de la migración bajo "Modelo de datos", antes de `## Contrato`)
- Test: `test/HU34_jeff/migration-0011.test.ts`

Todos los comandos se corren desde la raíz del worktree `.`.
Bun no está en el PATH. El prefijo `DATABASE_URL=…` es obligatorio porque el `.env` del worktree
apunta a PRODUCCIÓN. No abras ni imprimas `.env`.

Esta tarea **no depende de las Tareas 1, 2 ni 3**: no importa nada de ellas. Lo único que hereda es la
carpeta `test/HU34_jeff/`, que crea la Tarea 1 (hoy **no existe**: `test/` tiene HU01…HU33 y `HU_asistencia`,
no HU34). Si al empezar sigue sin existir, `mkdir -p test/HU34_jeff` antes del Paso 1.

**Interfaces:**

- Consume (todo del repo actual, nada de tareas anteriores):
  ```ts
  // src/db/schema/schema.ts:1-21 — ya importados, NO hay que agregar ningún import
  import {
    boolean, check, date, decimal, foreignKey, index, integer, pgEnum, pgTable, primaryKey,
    smallint, text, time, timestamp, unique, uniqueIndex, uuid, varchar,
  } from "drizzle-orm/pg-core";
  import { sql } from "drizzle-orm";

  // src/db/schema/schema.ts:131-144 — la tabla a la que apuntan las tres FK
  export const student = pgTable("student", { id: integer("id").generatedByDefaultAsIdentity().primaryKey(), … })

  // Estilo del archivo, a copiar tal cual:
  //   pgTable("nombre", {…}, (t) => ({ … }))            ← tercer argumento OBJETO, no arreglo
  //   integer("id").generatedByDefaultAsIdentity().primaryKey()          (schema.ts:132)
  //   decimal("col", { precision: p, scale: s })         ← `numeric` NO se importa en este archivo
  //   timestamp("col", { mode: "date", withTimezone: true }).notNull()   (schema.ts:594)
  //   .references(() => student.id, { onDelete: "cascade" })             (schema.ts:616)
  //   check("chk_…", sql`${t.col} …`), unique("uq_…").on(…), index("idx_…").on(…)   (schema.ts:139-143)

  // drizzle-orm/pg-core (solo en el test) — drizzle-orm 0.45.2, node_modules/drizzle-orm/pg-core/utils.d.ts
  export declare function getTableConfig<TTable extends PgTable>(table: TTable): {
    columns: PgColumn[]; indexes: Index[]; foreignKeys: ForeignKey[]; checks: Check[];
    primaryKeys: PrimaryKey[]; uniqueConstraints: UniqueConstraint[]; name: string; …
  }
  // De cada pieza el test usa: columna → .name, .notNull, .primary, .getSQLType();
  // check → .name; unique → .name y .columns; index → .config.name;
  // foreignKey → .getName(), .onDelete y .reference().foreignColumns.
  // Todas son públicas en los .d.ts de 0.45.2 (checks.d.ts:11, unique-constraint.d.ts:17,
  // indexes.d.ts:69, foreign-keys.d.ts:25).

  // Formato de los .sql del repo, a imitar:
  //   drizzle/0010_course_weekly_hours.sql:1-15  → cabecera de comentarios con el porqué,
  //     la línea `bun run db:apply …` y el aviso de no usar db:migrate
  //   drizzle/0008_course_equivalence.sql:1-8 y drizzle/0003_groovy_kulan_gath.sql:1-9
  //     → CREATE TABLE con identity, CONSTRAINT UNIQUE/CHECK dentro del CREATE, sangría con TAB
  //   drizzle/0003_groovy_kulan_gath.sql:13 → `CREATE INDEX … USING btree (…)`
  //   nombre de FK estilo drizzle-kit `<tabla>_<col>_<tablaRef>_<colRef>_fk`, con
  //     `ON DELETE … ON UPDATE no action`, y `--> statement-breakpoint` entre statements
  ```

- Produce (lo usan la Tarea 5 —SQL crudo con estos nombres de columna— y la Tarea 9 —lecturas y borrado—):
  ```ts
  // src/db/schema/schema.ts
  export const studentRecordEntry = pgTable("student_record_entry", {
    id, studentId, periodCode, courseCode, courseName, attempt, credits, grade, gradeRaw, sectionCode, observation
  });
  export const studentAcademicSnapshot = pgTable("student_academic_snapshot", {
    studentId, ppa, relativePosition, convalidatedCourses, convalidatedCredits,
    approvedCourses, approvedCredits, creditsAccumulated, creditsRequired, syncedAt
  });
  export const studentPeriodSummary = pgTable("student_period_summary", {
    id, studentId, periodCode, average, relativePosition, level,
    convalidatedCourses, convalidatedCredits, enrolledCourses, enrolledCredits,
    approvedCourses, approvedCredits, failedCourses, failedCredits
  });
  ```
  Nombres SQL exactos, que son los que escriben y leen las Tareas 5 y 9:

  | tabla | columna | tipo SQL | nulable |
  |:---|:---|:---|:---|
  | `student_record_entry` | `id` | `integer` identity PK | no |
  | | `student_id` | `integer` FK → `student(id)` ON DELETE cascade | no |
  | | `period_code` | `varchar(10)` | no |
  | | `course_code` | `varchar(10)` | no |
  | | `course_name` | `text` | no |
  | | `attempt` | `smallint` | no |
  | | `credits` | `numeric(4, 1)` | no |
  | | `grade` | `smallint` | sí |
  | | `grade_raw` | `text` | sí |
  | | `section_code` | `text` | sí |
  | | `observation` | `text` | sí |
  | `student_academic_snapshot` | `student_id` | `integer` PK + FK → `student(id)` ON DELETE cascade | no |
  | | `ppa` | `numeric(6, 4)` | sí |
  | | `relative_position` | `text` | sí |
  | | `convalidated_courses` | `integer` | sí |
  | | `convalidated_credits` | `numeric(6, 1)` | sí |
  | | `approved_courses` | `integer` | sí |
  | | `approved_credits` | `numeric(6, 1)` | sí |
  | | `credits_accumulated` | `numeric(6, 1)` | sí |
  | | `credits_required` | `numeric(6, 1)` | sí |
  | | `synced_at` | `timestamp with time zone` | no |
  | `student_period_summary` | `id` | `integer` identity PK | no |
  | | `student_id` | `integer` FK → `student(id)` ON DELETE cascade | no |
  | | `period_code` | `varchar(10)` | no |
  | | `average` | `numeric(6, 4)` | sí |
  | | `relative_position` | `text` | sí |
  | | `level` | `smallint` | sí |
  | | `convalidated_courses` / `convalidated_credits` | `integer` / `numeric(6, 1)` | sí |
  | | `enrolled_courses` / `enrolled_credits` | `integer` / `numeric(6, 1)` | sí |
  | | `approved_courses` / `approved_credits` | `integer` / `numeric(6, 1)` | sí |
  | | `failed_courses` / `failed_credits` | `integer` / `numeric(6, 1)` | sí |

  Restricciones con nombre (las usan el `.sql` y el test):
  `uq_student_record_entry` UNIQUE(`student_id`,`period_code`,`course_code`,`attempt`);
  `chk_student_record_entry_attempt`; `chk_student_record_entry_credits`;
  `chk_student_record_entry_grade`; índice `idx_student_record_entry_student`;
  `uq_student_period_summary` UNIQUE(`student_id`,`period_code`);
  FK `student_record_entry_student_id_student_id_fk`,
  `student_academic_snapshot_student_id_student_id_fk`,
  `student_period_summary_student_id_student_id_fk`.

  **`student_period_summary` NO lleva columna de procedencia** (nada de `source`): hoy la única fuente es
  el bloque "por período" de `layout.jsp`; cuando exista el lector de `ComandoListarResumenAcademico`, su
  propia migración decidirá cómo distinguirlas (spec §Qué NO entra, l.386).
  **Sin FK a `course` ni a `curriculum_course`** (RS-BE-22, spec l.306): el récord es histórico y trae
  códigos que ya no existen en la malla vigente.

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU34_jeff/migration-0011.test.ts` con este contenido completo. Es una prueba **estática**: lee
el `.sql` como texto y el `schema.ts` como módulo, y no abre ninguna conexión. `src/db/schema/schema.ts`
solo importa de `drizzle-orm/pg-core` (líneas 1-20) y `sql` de `drizzle-orm` (línea 21) —comprobado: no
tiene ningún otro `import`—, así que **no** carga `src/db/index.ts` y **no** hace falta `mock.module`.

```ts
import { describe, expect, test } from "bun:test";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  studentAcademicSnapshot,
  studentPeriodSummary,
  studentRecordEntry,
} from "../../src/db/schema/schema.js";

// El .sql se lee como texto plano: esta prueba NO aplica la migracion ni toca
// la base. Aplicarla es del dueno (MIGRATIONS.md).
const migracion = await Bun.file("drizzle/0011_academic_record.sql").text();

const veces = (aguja: string): number => migracion.split(aguja).length - 1;

const columnas = (tabla: PgTable): string[] => getTableConfig(tabla).columns.map((c) => c.name);

const tipos = (tabla: PgTable): Record<string, string> =>
  Object.fromEntries(getTableConfig(tabla).columns.map((c) => [c.name, c.getSQLType()]));

const nulables = (tabla: PgTable): string[] =>
  getTableConfig(tabla).columns.filter((c) => !c.notNull).map((c) => c.name);

describe("drizzle/0011_academic_record.sql", () => {
  test("crea las tres tablas y ninguna mas, todas con IF NOT EXISTS", () => {
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_record_entry"');
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_academic_snapshot"');
    expect(migracion).toContain('CREATE TABLE IF NOT EXISTS "student_period_summary"');
    expect(veces("CREATE TABLE")).toBe(3);
  });

  test("el indice por alumno tambien es idempotente", () => {
    expect(migracion).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_student_record_entry_student" ON "student_record_entry" USING btree ("student_id")',
    );
    expect(veces("CREATE INDEX")).toBe(1);
  });

  test("es aditiva: no altera ni borra nada de lo que ya existe", () => {
    expect(migracion).not.toContain("ALTER TABLE");
    expect(migracion).not.toContain("DROP");
    expect(veces("--> statement-breakpoint")).toBe(3);
  });

  test("las tres claves foraneas apuntan a student y borran en cascada", () => {
    expect(veces("ON DELETE cascade")).toBe(3);
    expect(migracion).toContain(
      'CONSTRAINT "student_record_entry_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(migracion).toContain(
      'CONSTRAINT "student_academic_snapshot_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
    expect(migracion).toContain(
      'CONSTRAINT "student_period_summary_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action',
    );
  });

  test("no ata la copia del record a la malla vigente", () => {
    expect(migracion).not.toContain("curriculum_course");
    expect(migracion).not.toContain('REFERENCES "public"."course"');
  });

  test("student_period_summary no lleva columna de procedencia", () => {
    expect(migracion).not.toContain("source");
  });

  test("student_record_entry lleva sus tres CHECK", () => {
    expect(migracion).toContain(
      'CONSTRAINT "chk_student_record_entry_attempt" CHECK ("student_record_entry"."attempt" >= 1)',
    );
    expect(migracion).toContain(
      'CONSTRAINT "chk_student_record_entry_credits" CHECK ("student_record_entry"."credits" >= 0)',
    );
    expect(migracion).toContain(
      'CONSTRAINT "chk_student_record_entry_grade" CHECK ("student_record_entry"."grade" IS NULL OR "student_record_entry"."grade" BETWEEN 0 AND 20)',
    );
  });

  test("los dos UNIQUE de la copia del record", () => {
    expect(migracion).toContain(
      'CONSTRAINT "uq_student_record_entry" UNIQUE("student_id","period_code","course_code","attempt")',
    );
    expect(migracion).toContain(
      'CONSTRAINT "uq_student_period_summary" UNIQUE("student_id","period_code")',
    );
  });

  test("los tipos de las columnas son los de la spec", () => {
    expect(migracion).toContain('"credits" numeric(4, 1) NOT NULL');
    expect(migracion).toContain('"attempt" smallint NOT NULL');
    expect(migracion).toContain('"grade" smallint');
    expect(migracion).toContain('"course_name" text NOT NULL');
    expect(migracion).toContain('"observation" text');
    expect(migracion).toContain('"ppa" numeric(6, 4)');
    expect(migracion).toContain('"synced_at" timestamp with time zone NOT NULL');
  });

  test("la cabecera dice como se aplica", () => {
    expect(migracion.trimStart().startsWith("--")).toBe(true);
    expect(migracion).toContain("bun run db:apply drizzle/0011_academic_record.sql");
  });
});

describe("schema.ts · student_record_entry", () => {
  test("nombre de tabla y columnas, en orden", () => {
    expect(getTableConfig(studentRecordEntry).name).toBe("student_record_entry");
    expect(columnas(studentRecordEntry)).toEqual([
      "id",
      "student_id",
      "period_code",
      "course_code",
      "course_name",
      "attempt",
      "credits",
      "grade",
      "grade_raw",
      "section_code",
      "observation",
    ]);
  });

  test("tipos sql: creditos con decimal, nombres y observacion en text", () => {
    expect(tipos(studentRecordEntry)).toEqual({
      id: "integer",
      student_id: "integer",
      period_code: "varchar(10)",
      course_code: "varchar(10)",
      course_name: "text",
      attempt: "smallint",
      credits: "numeric(4, 1)",
      grade: "smallint",
      grade_raw: "text",
      section_code: "text",
      observation: "text",
    });
  });

  test("solo nota, nota original, seccion y observacion son nulables", () => {
    expect(nulables(studentRecordEntry)).toEqual([
      "grade",
      "grade_raw",
      "section_code",
      "observation",
    ]);
    const id = getTableConfig(studentRecordEntry).columns.find((c) => c.name === "id");
    expect(id?.primary).toBe(true);
  });

  test("UNIQUE por alumno-ciclo-curso-vez, tres CHECK e indice por alumno", () => {
    const cfg = getTableConfig(studentRecordEntry);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["uq_student_record_entry"]);
    expect(cfg.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
      "student_id",
      "period_code",
      "course_code",
      "attempt",
    ]);
    expect(cfg.checks.map((k) => k.name)).toEqual([
      "chk_student_record_entry_attempt",
      "chk_student_record_entry_credits",
      "chk_student_record_entry_grade",
    ]);
    expect(cfg.indexes.map((i) => i.config.name)).toEqual(["idx_student_record_entry_student"]);
  });

  test("una sola FK, a student, en cascada: nada de malla", () => {
    const fks = getTableConfig(studentRecordEntry).foreignKeys;
    expect(fks.length).toBe(1);
    expect(fks[0]?.getName()).toBe("student_record_entry_student_id_student_id_fk");
    expect(fks[0]?.onDelete).toBe("cascade");
    expect(fks[0]?.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);
  });
});

describe("schema.ts · student_academic_snapshot", () => {
  test("nombre de tabla, columnas y PK sobre student_id", () => {
    const cfg = getTableConfig(studentAcademicSnapshot);
    expect(cfg.name).toBe("student_academic_snapshot");
    expect(columnas(studentAcademicSnapshot)).toEqual([
      "student_id",
      "ppa",
      "relative_position",
      "convalidated_courses",
      "convalidated_credits",
      "approved_courses",
      "approved_credits",
      "credits_accumulated",
      "credits_required",
      "synced_at",
    ]);
    expect(cfg.columns.find((c) => c.name === "student_id")?.primary).toBe(true);
  });

  test("tipos sql, synced_at obligatorio y el resto nulable", () => {
    expect(tipos(studentAcademicSnapshot)).toEqual({
      student_id: "integer",
      ppa: "numeric(6, 4)",
      relative_position: "text",
      convalidated_courses: "integer",
      convalidated_credits: "numeric(6, 1)",
      approved_courses: "integer",
      approved_credits: "numeric(6, 1)",
      credits_accumulated: "numeric(6, 1)",
      credits_required: "numeric(6, 1)",
      synced_at: "timestamp with time zone",
    });
    expect(nulables(studentAcademicSnapshot)).toEqual([
      "ppa",
      "relative_position",
      "convalidated_courses",
      "convalidated_credits",
      "approved_courses",
      "approved_credits",
      "credits_accumulated",
      "credits_required",
    ]);
  });

  test("FK a student en cascada, sin UNIQUE, CHECK ni indice", () => {
    const cfg = getTableConfig(studentAcademicSnapshot);
    expect(cfg.foreignKeys.length).toBe(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe("student_academic_snapshot_student_id_student_id_fk");
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
    expect(cfg.uniqueConstraints).toEqual([]);
    expect(cfg.checks).toEqual([]);
    expect(cfg.indexes).toEqual([]);
  });
});

describe("schema.ts · student_period_summary", () => {
  test("nombre de tabla y columnas, sin columna de procedencia", () => {
    expect(getTableConfig(studentPeriodSummary).name).toBe("student_period_summary");
    expect(columnas(studentPeriodSummary)).toEqual([
      "id",
      "student_id",
      "period_code",
      "average",
      "relative_position",
      "level",
      "convalidated_courses",
      "convalidated_credits",
      "enrolled_courses",
      "enrolled_credits",
      "approved_courses",
      "approved_credits",
      "failed_courses",
      "failed_credits",
    ]);
    expect(columnas(studentPeriodSummary)).not.toContain("source");
  });

  test("tipos sql y campos nulables del resumen", () => {
    expect(tipos(studentPeriodSummary)).toEqual({
      id: "integer",
      student_id: "integer",
      period_code: "varchar(10)",
      average: "numeric(6, 4)",
      relative_position: "text",
      level: "smallint",
      convalidated_courses: "integer",
      convalidated_credits: "numeric(6, 1)",
      enrolled_courses: "integer",
      enrolled_credits: "numeric(6, 1)",
      approved_courses: "integer",
      approved_credits: "numeric(6, 1)",
      failed_courses: "integer",
      failed_credits: "numeric(6, 1)",
    });
    expect(nulables(studentPeriodSummary)).toEqual([
      "average",
      "relative_position",
      "level",
      "convalidated_courses",
      "convalidated_credits",
      "enrolled_courses",
      "enrolled_credits",
      "approved_courses",
      "approved_credits",
      "failed_courses",
      "failed_credits",
    ]);
  });

  test("UNIQUE por alumno y ciclo, y FK a student en cascada", () => {
    const cfg = getTableConfig(studentPeriodSummary);
    expect(cfg.uniqueConstraints.map((u) => u.name)).toEqual(["uq_student_period_summary"]);
    expect(cfg.uniqueConstraints[0]?.columns.map((c) => c.name)).toEqual([
      "student_id",
      "period_code",
    ]);
    expect(cfg.foreignKeys.length).toBe(1);
    expect(cfg.foreignKeys[0]?.getName()).toBe("student_period_summary_student_id_student_id_fk");
    expect(cfg.foreignKeys[0]?.onDelete).toBe("cascade");
  });
});
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/migration-0011.test.ts
```

Esperado: FAIL al cargar el archivo, antes de correr ninguna prueba. El resumen es
`0 pass`, `1 fail`, `1 error`, `Ran 1 test across 1 file`, y el error es:

```
# Unhandled error between tests
-------------------------------
SyntaxError: Export named 'studentAcademicSnapshot' not found in module './src/db/schema/schema.ts'.
-------------------------------
```

Los imports se resuelven antes que el `await Bun.file(...)` de arriba, así que el fallo es por el export
que falta y no por el `.sql` inexistente. Si el mensaje nombra a `studentPeriodSummary` o a
`studentRecordEntry` en vez de a `studentAcademicSnapshot`, es el mismo fallo: ninguna de las tres tablas
existe todavía. Si en cambio sale
`ENOENT: no such file or directory, open 'drizzle/0011_academic_record.sql'`, alguien ya agregó las tablas
al schema: revisar `git diff src/db/schema/schema.ts` antes de seguir.

- [ ] **Paso 3: Implementación mínima**

**3.a — `src/db/schema/schema.ts`.** Las tres tablas van al FINAL del archivo. No se agrega ni se quita
ningún import: `pgTable`, `integer`, `varchar`, `text`, `smallint`, `decimal`, `timestamp`, `check`,
`unique` e `index` ya están en las líneas 1-20, y `sql` en la 21.

Reemplazar esto (últimas 9 líneas del archivo, `schema.ts:624-632`):

```ts
export const chatbotMessage = pgTable("chatbot_message", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => chatbotSession.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  idxChatbotMessageSession: index("idx_chatbot_message_session").on(t.sessionId),
}));
```

por esto:

```ts
export const chatbotMessage = pgTable("chatbot_message", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => chatbotSession.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
}, (t) => ({
  idxChatbotMessageSession: index("idx_chatbot_message_session").on(t.sessionId),
}));

/**
 * RS-BE-22 · Copia del récord académico del portal, curso por curso.
 *
 * Es una COPIA, no historia propia de la app: cada sincronización aceptada
 * borra las filas del alumno y vuelve a insertar las que trae el portal. El
 * alumno puede borrarla entera (DELETE /academic-record/me), y por eso cuelga
 * de `student` con borrado en cascada.
 *
 * SIN relación con la malla, a propósito: el récord es histórico y trae cursos
 * de planes anteriores que ya no existen en `curriculum_course`. Guardarlos con
 * su código y su nombre originales es lo único que conserva la historia real
 * del alumno; emparejarlos con la malla es trabajo de `student_course_progress`.
 *
 * `course_name`, `grade_raw`, `section_code` y `observation` son `text` y no
 * `varchar(n)`: un valor más largo que el límite abortaría TODA la transacción
 * de la importación, y con ella el horario y la matrícula del alumno. Los tres
 * CHECK que sí van ya los garantiza el parser (RS-BE-19).
 */
export const studentRecordEntry = pgTable("student_record_entry", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id, { onDelete: "cascade" }),
  /** Ciclo tal como lo publica el récord: "2026-1", "2025-0". */
  periodCode: varchar("period_code", { length: 10 }).notNull(),
  courseCode: varchar("course_code", { length: 10 }).notNull(),
  courseName: text("course_name").notNull(),
  /** Columna VEZ: 1 la primera matrícula del curso, 2 la repetición. */
  attempt: smallint("attempt").notNull(),
  /** Créditos SIN redondear (RS-BE-19): un curso de 1.5 no es uno de 2. */
  credits: decimal("credits", { precision: 4, scale: 1 }).notNull(),
  /** Nota entera 0-20; NULL si la celda no es un número (ciclo en curso o marca). */
  grade: smallint("grade"),
  /** La celda NOTA tal cual, para no perder las marcas que no son un número. */
  gradeRaw: text("grade_raw"),
  sectionCode: text("section_code"),
  observation: text("observation"),
}, (t) => ({
  uqStudentRecordEntry: unique("uq_student_record_entry").on(t.studentId, t.periodCode, t.courseCode, t.attempt),
  chkStudentRecordEntryAttempt: check("chk_student_record_entry_attempt", sql`${t.attempt} >= 1`),
  chkStudentRecordEntryCredits: check("chk_student_record_entry_credits", sql`${t.credits} >= 0`),
  chkStudentRecordEntryGrade: check(
    "chk_student_record_entry_grade",
    sql`${t.grade} IS NULL OR ${t.grade} BETWEEN 0 AND 20`,
  ),
  idxStudentRecordEntryStudent: index("idx_student_record_entry_student").on(t.studentId),
}));

/**
 * RS-BE-25 · Foto de la Información Académica general del alumno (layout.jsp).
 *
 * Una fila por alumno, reemplazada en cada sincronización aceptada. Todos los
 * campos son nulables porque el portal puede no publicarlos: un campo que no se
 * lee se guarda como NULL y NUNCA como 0 (RS-BE-24). `ppa` no lleva CHECK de
 * rango: un valor inesperado del portal no debe abortar la importación entera.
 */
export const studentAcademicSnapshot = pgTable("student_academic_snapshot", {
  studentId: integer("student_id").primaryKey().references(() => student.id, { onDelete: "cascade" }),
  ppa: decimal("ppa", { precision: 6, scale: 4 }),
  relativePosition: text("relative_position"),
  convalidatedCourses: integer("convalidated_courses"),
  convalidatedCredits: decimal("convalidated_credits", { precision: 6, scale: 1 }),
  approvedCourses: integer("approved_courses"),
  approvedCredits: decimal("approved_credits", { precision: 6, scale: 1 }),
  creditsAccumulated: decimal("credits_accumulated", { precision: 6, scale: 1 }),
  creditsRequired: decimal("credits_required", { precision: 6, scale: 1 }),
  /** Cuándo se tomó la foto: es la fecha que la pantalla del récord le muestra al alumno. */
  syncedAt: timestamp("synced_at", { mode: "date", withTimezone: true }).notNull(),
});

/**
 * RS-BE-25 · Resumen del bloque "Información por Período Académico" de layout.jsp.
 *
 * Una fila por ciclo. Hoy el portal publica un solo bloque —el último ciclo con
 * notas—, así que en la práctica hay 0 o 1 fila por alumno; la clave
 * (student_id, period_code) deja el lugar listo para los demás ciclos cuando
 * exista el lector del resumen académico completo. Sin columna de procedencia
 * mientras la fuente sea una sola: esa decisión es de la migración que traiga
 * la segunda.
 */
export const studentPeriodSummary = pgTable("student_period_summary", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  studentId: integer("student_id").notNull().references(() => student.id, { onDelete: "cascade" }),
  periodCode: varchar("period_code", { length: 10 }).notNull(),
  average: decimal("average", { precision: 6, scale: 4 }),
  relativePosition: text("relative_position"),
  level: smallint("level"),
  convalidatedCourses: integer("convalidated_courses"),
  convalidatedCredits: decimal("convalidated_credits", { precision: 6, scale: 1 }),
  enrolledCourses: integer("enrolled_courses"),
  enrolledCredits: decimal("enrolled_credits", { precision: 6, scale: 1 }),
  approvedCourses: integer("approved_courses"),
  approvedCredits: decimal("approved_credits", { precision: 6, scale: 1 }),
  failedCourses: integer("failed_courses"),
  failedCredits: decimal("failed_credits", { precision: 6, scale: 1 }),
}, (t) => ({
  uqStudentPeriodSummary: unique("uq_student_period_summary").on(t.studentId, t.periodCode),
}));
```

**3.b — `drizzle/0011_academic_record.sql`.** Crear el archivo con este contenido completo. La sangría
dentro de los `CREATE TABLE` es un **TAB**, como en `0003_groovy_kulan_gath.sql` y
`0008_course_equivalence.sql` (si el editor la convierte en espacios no se rompe ninguna prueba, pero el
archivo deja de parecerse a los demás). Ojo con la cabecera: la prueba cuenta `CREATE TABLE` (3),
`CREATE INDEX` (1), `ON DELETE cascade` (3) y `--> statement-breakpoint` (3) sobre TODO el archivo,
comentarios incluidos, y prohíbe las palabras `source`, `curriculum_course`, `DROP` y `ALTER TABLE` en
cualquier parte. Por eso los comentarios hablan en español de "borrado en cascada" y de "la malla
vigente".

```sql
-- RS-BE-22, RS-BE-24 y RS-BE-25 · Copia del récord académico del portal.
--
-- Tres tablas nuevas y ninguna columna tocada de las que ya existen:
--   student_record_entry       una fila por curso del récord (ciclo, código, vez).
--   student_academic_snapshot  una fila por alumno: PPA, ubicación relativa y créditos.
--   student_period_summary     una fila por ciclo del bloque "por período" de layout.jsp.
--
-- Son una copia del portal, no datos propios de la app: cada sincronización
-- aceptada las reemplaza enteras, y el alumno puede borrarlas cuando quiera
-- (DELETE /academic-record/me). Las tres cuelgan de "student" con borrado en
-- cascada: si algún día se borra a un alumno, su récord no queda huérfano.
--
-- Sin relación con la malla, a propósito (RS-BE-22): el récord es histórico y
-- trae cursos de planes anteriores que ya no existen en la malla vigente. Se
-- guardan con el código y el nombre que publica el portal.
--
-- Los nombres y las observaciones son "text" y no "varchar(n)": un valor más
-- largo que el límite abortaría TODA la transacción de la importación, y con
-- ella el horario y la matrícula del alumno. Por lo mismo, ni el PPA ni el
-- promedio del ciclo llevan CHECK de rango. Los tres CHECK que sí van —vez >= 1,
-- créditos >= 0 y nota entre 0 y 20— ya los garantiza el parser (RS-BE-19), así
-- que no pueden dispararse por un dato inesperado del portal.
--
-- Aditiva e idempotente: las tres tablas y el índice llevan IF NOT EXISTS y los
-- CONSTRAINT viajan dentro de la definición, así que se puede re-aplicar sin daño.
--
--   bun run db:apply drizzle/0011_academic_record.sql
--
-- Con db:apply y NO con db:migrate ni db:generate: drizzle/meta/_journal.json
-- se quedó en la 0009 (9 entradas), así que ni la 0010 ni esta quedan
-- registradas ahí.

CREATE TABLE IF NOT EXISTS "student_record_entry" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "student_record_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"student_id" integer NOT NULL,
	"period_code" varchar(10) NOT NULL,
	"course_code" varchar(10) NOT NULL,
	"course_name" text NOT NULL,
	"attempt" smallint NOT NULL,
	"credits" numeric(4, 1) NOT NULL,
	"grade" smallint,
	"grade_raw" text,
	"section_code" text,
	"observation" text,
	CONSTRAINT "uq_student_record_entry" UNIQUE("student_id","period_code","course_code","attempt"),
	CONSTRAINT "chk_student_record_entry_attempt" CHECK ("student_record_entry"."attempt" >= 1),
	CONSTRAINT "chk_student_record_entry_credits" CHECK ("student_record_entry"."credits" >= 0),
	CONSTRAINT "chk_student_record_entry_grade" CHECK ("student_record_entry"."grade" IS NULL OR "student_record_entry"."grade" BETWEEN 0 AND 20),
	CONSTRAINT "student_record_entry_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_student_record_entry_student" ON "student_record_entry" USING btree ("student_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_academic_snapshot" (
	"student_id" integer PRIMARY KEY NOT NULL,
	"ppa" numeric(6, 4),
	"relative_position" text,
	"convalidated_courses" integer,
	"convalidated_credits" numeric(6, 1),
	"approved_courses" integer,
	"approved_credits" numeric(6, 1),
	"credits_accumulated" numeric(6, 1),
	"credits_required" numeric(6, 1),
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "student_academic_snapshot_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_period_summary" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "student_period_summary_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"student_id" integer NOT NULL,
	"period_code" varchar(10) NOT NULL,
	"average" numeric(6, 4),
	"relative_position" text,
	"level" smallint,
	"convalidated_courses" integer,
	"convalidated_credits" numeric(6, 1),
	"enrolled_courses" integer,
	"enrolled_credits" numeric(6, 1),
	"approved_courses" integer,
	"approved_credits" numeric(6, 1),
	"failed_courses" integer,
	"failed_credits" numeric(6, 1),
	CONSTRAINT "uq_student_period_summary" UNIQUE("student_id","period_code"),
	CONSTRAINT "student_period_summary_student_id_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."student"("id") ON DELETE cascade ON UPDATE no action
);
```

`db:apply` manda el archivo entero a Postgres con el protocolo simple, dentro de una sola transacción
(`src/db/apply-migration.ts:36-38`): los `--> statement-breakpoint` viajan como comentarios `--` y no hay
que separar nada. El `CHECK` calificado con el nombre de la tabla dentro del `CREATE TABLE` es el mismo
que ya usa `drizzle/0003_groovy_kulan_gath.sql:8`.

**No** se toca `drizzle/meta/_journal.json` ni se crea ningún `*_snapshot.json`: la 0011 es huérfana a
propósito, igual que la 0010 (el journal tiene 9 entradas y termina en `0009_avatar`). **No** se corre
`db:generate`, `db:push`, `db:migrate` ni `db:apply`.

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/migration-0011.test.ts
```

Esperado: PASS, `21 pass`, `0 fail`, `64 expect() calls`, `Ran 21 tests across 1 file`.

- [ ] **Paso 5: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ninguna salida y exit 0. `tsconfig.json` tiene `include: ["src/**/*"]` y
`rootDir: "./src"`, así que ni el `.sql` ni el archivo de prueba entran al build; lo único que compila de
esta tarea es `schema.ts`. El test sí lo revisa el editor con `test/tsconfig.json`, y también compila
limpio: no hay `any` implícito ni acceso a nada marcado `@internal` en drizzle.

- [ ] **Paso 6: Enlazar la prueba desde la spec**

En `specs/features/academic-record/academic-record.spec.md`, reemplazar esto (líneas 310-313):

```md
`ON DELETE CASCADE` es la base del borrado: si algún día se borra a un alumno, su récord
no queda huérfano.

## Contrato
```

por esto:

```md
`ON DELETE CASCADE` es la base del borrado: si algún día se borra a un alumno, su récord
no queda huérfano.

`[@test] ../../../test/HU34_jeff/migration-0011.test.ts`

## Contrato
```

Es el único cambio en la spec de esta tarea: agrega el enlace a la prueba, no cambia ningún requisito.
Con esto, la Tarea 10 ya no tiene que agregarlo. Los targets `../../../drizzle/0011_academic_record.sql`
(línea 16) y `../../../src/db/schema/schema.ts` (línea 15) ya están en el front-matter: no se tocan.

- [ ] **Paso 7: Regresión**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff
```

Esperado: PASS también en las pruebas de las Tareas 1, 2 y 3 (`record-parser.test.ts`,
`record-trust.test.ts`, `info-academica-parser.test.ts`), `0 fail`.

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU31_jeff
```

Esperado: `0 fail`. `schema.ts` lo reexporta `src/db/schema/index.ts` y lo carga `src/db/index.ts`, que
importan casi todos los repositorios; esta tarea solo agrega exports nuevos (no hay colisión de nombres:
`student_record_entry`, `student_academic_snapshot` y `student_period_summary` no aparecen hoy en `src/`
ni en `drizzle/`), así que no debería moverse nada. Si algo falla aquí, es por una tarea anterior, no por
esta: comparar con la regresión de HU31 del Paso 5 de la Tarea 1 y con la línea base del Paso 0 de la
Tarea 1.

- [ ] **Paso final: Commit**

```bash
cd . && git add src/db/schema/schema.ts drizzle/0011_academic_record.sql test/HU34_jeff/migration-0011.test.ts specs/features/academic-record/academic-record.spec.md && git commit -m "feat(academic-record): tablas del récord y migración 0011 (RS-BE-22, RS-BE-25)"
```

Sin trailer Co-Authored-By y sin push. La migración **no se aplica** en esta tarea: aplicarla, con respaldo
previo y según `MIGRATIONS.md`, es del dueño y está en el paso PARAR de la Tarea 10.

### Tarea 5: Escritura en la base desde la importación (repository)

**Archivos:**
- Modificar: `src/modules/portal-sync/portal-sync.repository.ts:5` (la línea `import type { DelegadosNomina, RecordRow, SyllabusEntry } …`; en HEAD es la **línea 4**, y la Tarea 1 la corre a la 5 porque inserta `import { normalizeCareerName } from "./parsers/html.js";` justo encima, después de `mismaPersona`) y `:1186-1190` (los cinco métodos nuevos se agregan **al final de la clase**, después de `createStudentAccount`, que cierra en la línea 1189; la 1190 es la llave de la clase y la última del archivo)
- Crear: `test/HU34_jeff/record-persistence.test.ts`
- Crear: `test/HU34_jeff/electives-cleanup.test.ts`
- Test: `test/HU34_jeff/record-persistence.test.ts` y `test/HU34_jeff/electives-cleanup.test.ts`

**Numeración después de la Tarea 1.** Esa tarea suma una línea arriba (el `import`) y quita una abajo
(el bloque `230-237`, de 8 líneas, pasa a 7), así que el archivo sigue teniendo **1190 líneas** y todo lo
que está después de la antigua línea 237 conserva su número: `export class PortalSyncRepository` en la
373, `constructor` en la 374, `upsertProgressBatch` en la 1032, `deleteImpedimentAlert` en la 1059, el
cierre de `createStudentAccount` en la 1189 y la llave de la clase en la 1190. Solo corren una línea
`export type Tx` (`:7` → `:8`) e `intArray` (`:31-32` → `:32-33`).

Todos los comandos se corren desde la raíz del worktree `.`.
Bun no está en el PATH. El prefijo `DATABASE_URL=…` es **obligatorio** en cada comando: bun carga solo el
`.env` del worktree, que apunta a la base de PRODUCCIÓN, y `test/env.setup.ts` solo rellena con
`process.env.DATABASE_URL ||= …` (línea 6), así que sin el prefijo gana el valor real del `.env`. No abras
ni imprimas `.env`. Ninguna prueba de esta tarea abre una conexión —el `tx` es de mentira y
`postgres()` no conecta hasta la primera consulta—, pero importar el repository carga
`src/db/index.ts` → `src/config/app-config.ts` → `src/config/env.ts:33`, que exige que `DATABASE_URL` sea
una URL válida; el prefijo la da y además impide que la de producción entre en juego.

Esta tarea **no toca la spec**: `specs/features/academic-record/academic-record.spec.md` ya lista
`../../../src/modules/portal-sync/portal-sync.repository.ts` en sus `targets` (línea 9) y ya enlaza
`[@test] ../../../test/HU34_jeff/record-persistence.test.ts` bajo RS-BE-22 (línea 152) y RS-BE-25
(línea 242) y `[@test] ../../../test/HU34_jeff/electives-cleanup.test.ts` bajo RS-BE-23 (línea 198).
Esta tarea hace que esos dos archivos existan.

Los dos archivos de prueba los **amplían** tareas posteriores con pruebas de nivel service:
`record-persistence.test.ts` la Tarea 6 y `electives-cleanup.test.ts` la Tarea 7. Por eso cada uno queda
con sus `describe` cerrados al final del archivo y sin estado compartido entre grupos: agregar un
`describe` al final y un `import` arriba tiene que bastar.

**Interfaces:**

- Consume:
  ```ts
  // Tarea 1 — src/modules/portal-sync/portal-sync.types.ts
  export interface RecordRow {
    periodCode: string; courseCode: string; courseName: string;
    attempt: number; credits: number; grade: number | null; sectionCode: string;
    gradeRaw: string | null; observation: string | null;
  }

  // Tarea 3 — src/modules/portal-sync/portal-sync.types.ts
  export interface CountCredits { courses: number | null; credits: number | null }
  export interface AcademicGeneral {
    ppa: number | null; relativePosition: string | null;
    convalidated: CountCredits; approved: CountCredits;
    creditsAccumulated: number | null; creditsRequired: number | null;
  }
  export interface AcademicPeriodBlock {
    periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
    convalidated: CountCredits; enrolled: CountCredits; approved: CountCredits; failed: CountCredits;
  }

  // Tarea 4 — nombres SQL exactos de las tres tablas que esta tarea escribe, en el orden
  // en que la migración 0011 declara sus columnas
  // student_record_entry(id, student_id, period_code, course_code, course_name, attempt,
  //                      credits numeric(4,1), grade smallint, grade_raw, section_code, observation)
  //   UNIQUE uq_student_record_entry (student_id, period_code, course_code, attempt)
  // student_academic_snapshot(student_id PK, ppa numeric(6,4), relative_position,
  //                      convalidated_courses, convalidated_credits, approved_courses, approved_credits,
  //                      credits_accumulated, credits_required, synced_at timestamptz NOT NULL)
  // student_period_summary(id, student_id, period_code, average numeric(6,4), relative_position,
  //                      level smallint, convalidated_courses, convalidated_credits,
  //                      enrolled_courses, enrolled_credits, approved_courses, approved_credits,
  //                      failed_courses, failed_credits)
  //   UNIQUE uq_student_period_summary (student_id, period_code)

  // Repo actual — src/modules/portal-sync/portal-sync.repository.ts (líneas ya con la Tarea 1 aplicada)
  export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];            // :8
  const intArray = (values: number[]) =>                                           // :32-33, privado
    sql`string_to_array(${values.map((v) => Number(v)).join(",")}, ',')::int[]`;
  export class PortalSyncRepository {                                              // :373
    constructor(readonly database: typeof db) {}                                   // :374
    async upsertProgressBatch(tx: Tx, studentId: number, curriculumId: number, …)  // :1032, patrón json_array_elements
    async deleteImpedimentAlert(tx: Tx, studentId: number): Promise<number>        // :1059, patrón delete … returning
    async withdrawMissingEnrollments(tx: Tx, …, keepSectionIds: number[])          // :916, usa intArray con centinela [-1]
  }

  // Repo actual — src/db/schema/schema.ts, lo que la limpieza de electivos filtra
  export const studentCourseStatusEnum = pgEnum("student_course_status", ["in_progress","approved","failed","withdrawn"]);  // :30
  export const courseCategoryEnum = pgEnum("course_category", ["general_studies","common","faculty","elective"]);  // :63
  export const curriculumCourse = pgTable("curriculum_course", { … });             // :213, columna category (:220)
  export const studentCourseProgress = pgTable("student_course_progress", { … });  // :392, columnas student_id, curriculum_id, curriculum_course_id, status

  // Repo actual — patrón de prueba, test/HU31_jeff/repository.progress-batch.test.ts:17-27
  const fakeTx = (rows: unknown[]) => ({ tx, consultas, llamadas });
  const repo = new PortalSyncRepository({} as never);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  // y test/HU31_jeff/repository.withdraw-array.test.ts:60, que ya fija cómo rinde intArray:
  //   expect(params).toEqual([6, 2, "294,295,296,297,298"]);
  ```

- Produce (métodos nuevos de `PortalSyncRepository`; los llaman la Tarea 6 —los cuatro primeros— y la
  Tarea 7 —`deleteUnbackedElectives`—, siempre con el `tx` de la transacción de la importación):
  ```ts
  async lockAcademicRecord(tx: Tx, studentId: number): Promise<void>
  async replaceRecordEntries(tx: Tx, studentId: number, rows: RecordRow[]): Promise<number>
  async upsertAcademicSnapshot(
    tx: Tx, studentId: number, general: AcademicGeneral, syncedAt: Date,
  ): Promise<void>
  async replacePeriodSummaries(
    tx: Tx, studentId: number, periods: AcademicPeriodBlock[],
  ): Promise<number>
  async deleteUnbackedElectives(
    tx: Tx, studentId: number, curriculumId: number, backingIds: number[],
  ): Promise<number>
  ```
  Contratos que las tareas posteriores dan por ciertos:
  - `lockAcademicRecord` emite `select pg_advisory_xact_lock(hashtext('academic-record'), $1::int)`.
  - `replaceRecordEntries` borra **todas** las filas del alumno y luego inserta las recibidas ya
    deduplicadas por `periodCode|courseCode|attempt` (gana la primera); devuelve las filas que la base
    dice haber escrito. Con `rows` vacío hace solo el DELETE y devuelve 0.
  - `upsertAcademicSnapshot` escribe una sola fila con `on conflict (student_id) do update`, pisando
    todas las columnas, incluida `synced_at`.
  - `replacePeriodSummaries` borra las del alumno y luego inserta las recibidas (0 o 1 en esta versión);
    devuelve las filas escritas.
  - `deleteUnbackedElectives` devuelve `0` **sin consultar nada** si `backingIds` está vacío; si no,
    borra de `student_course_progress` los electivos aprobados del alumno en esa malla cuyo
    `curriculum_course_id` no esté en `backingIds`, y devuelve cuántos borró.

---

- [ ] **Paso 1: Escribir la prueba que falla**

Son dos archivos nuevos. Si `test/HU34_jeff/` todavía no existe (lo crea la Tarea 1), `mkdir -p test/HU34_jeff` antes.

**1a. Crear `test/HU34_jeff/record-persistence.test.ts`** con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type {
  AcademicGeneral,
  AcademicPeriodBlock,
  RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-22 y RS-BE-25: dentro de la transaccion de la importacion, con record
 * de confianza y consentimiento, se toma un candado por alumno y se reemplazan
 * la copia del record y el resumen por ciclo, y se pisa la foto acumulada.
 *
 * Estas pruebas miran el SQL RENDERIZADO ademas del resultado, como
 * `repository.progress-batch.test.ts` y `repository.withdraw-array.test.ts`:
 * la clase de defecto que importa aca la produce Postgres al ejecutar (un
 * parametro que se evapora, un arreglo que se vuelve constructor de fila, un
 * UNIQUE que aborta la transaccion entera) y no el codigo al armar. No abren
 * ninguna conexion: el `tx` es de mentira.
 *
 * Datos 100% inventados, alumno sintetico 20230001 (studentId interno 77).
 */
const fakeTx = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Las 6 filas que la Tarea 1 lee de `test/HU34_jeff/fixtures/record.html`. */
const FILAS: RecordRow[] = [
  { periodCode: "2023-1", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 1, credits: 4,
    grade: 8, sectionCode: "101", gradeRaw: "08", observation: null },
  { periodCode: "2023-1", courseCode: "4901", courseName: "LENGUAJE DE PRUEBA", attempt: 1, credits: 3,
    grade: 14, sectionCode: "102", gradeRaw: "14", observation: null },
  { periodCode: "2023-2", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA", attempt: 2, credits: 4,
    grade: 12, sectionCode: "201", gradeRaw: "12", observation: null },
  { periodCode: "2023-2", courseCode: "659002", courseName: "TALLER DE PRUEBA", attempt: 1, credits: 1.5,
    grade: 17, sectionCode: "917", gradeRaw: "17", observation: "OBSERVACIÓN DE PRUEBA" },
  { periodCode: "2026-2", courseCode: "659003", courseName: "CURSO EN CURSO UNO", attempt: 1, credits: 3,
    grade: null, sectionCode: "301", gradeRaw: null, observation: null },
  { periodCode: "2026-2", courseCode: "659004", courseName: "CURSO EN CURSO DOS", attempt: 1, credits: 4,
    grade: null, sectionCode: "1302", gradeRaw: null, observation: null },
];

/** Bloque "Informacion General" del layout HU34, con los mismos valores inventados. */
const GENERAL: AcademicGeneral = {
  ppa: 14.25,
  relativePosition: "TERCIO SUPERIOR",
  convalidated: { courses: 2, credits: 6 },
  approved: { courses: 30, credits: 100 },
  creditsAccumulated: 106,
  creditsRequired: 210,
};

/** Misma forma que `EMPTY_GENERAL` (Tarea 3): el bloque no se pudo leer. */
const GENERAL_VACIO: AcademicGeneral = {
  ppa: null,
  relativePosition: null,
  convalidated: { courses: null, credits: null },
  approved: { courses: null, credits: null },
  creditsAccumulated: null,
  creditsRequired: null,
};

/** Bloque "Informacion por Periodo Academico: Ciclo 2026-1" del layout HU34. */
const PERIODO: AcademicPeriodBlock = {
  periodCode: "2026-1",
  average: 13.25,
  relativePosition: "MEDIO SUPERIOR",
  level: 4,
  convalidated: { courses: 1, credits: 3 },
  enrolled: { courses: 7, credits: 23 },
  approved: { courses: 5, credits: 16 },
  failed: { courses: 2, credits: 7 },
};

const FECHA = new Date("2026-09-19T15:00:00.000Z");

describe("lockAcademicRecord", () => {
  test("toma el candado por alumno con hashtext y un solo parametro", async () => {
    const { tx, consultas, llamadas } = fakeTx([]);
    await repo.lockAcademicRecord(tx, 77);
    expect(llamadas()).toBe(1);
    const { sql: texto, params } = consultas()[0]!;
    expect(norm(texto)).toContain("pg_advisory_xact_lock(hashtext('academic-record'), $1::int)");
    expect(params).toEqual([77]);
  });

  test("es candado de TRANSACCION, no de sesion", async () => {
    // `pg_advisory_lock` se suelta a mano o al cerrar la conexion, y la
    // conexion vuelve al pool: un candado colgado bloquearia al alumno para
    // siempre. `_xact_` se suelta solo en el commit o el rollback.
    const { tx, consultas } = fakeTx([]);
    await repo.lockAcademicRecord(tx, 77);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("pg_advisory_xact_lock(");
    expect(q).not.toContain("pg_advisory_lock(");
    expect(q).not.toContain("pg_try_advisory");
  });
});

describe("replaceRecordEntries", () => {
  test("reemplaza entera la copia del alumno: primero borra y despues inserta", async () => {
    const { tx, consultas, llamadas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    expect(llamadas()).toBe(2);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_record_entry where student_id = $1");
    expect(consultas()[0]!.params).toEqual([77]);
    expect(norm(consultas()[1]!.sql)).toContain("insert into student_record_entry");
  });

  test("las 6 filas viajan en UN solo parametro JSON", async () => {
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    const { sql: texto, params } = consultas()[1]!;
    // studentId + payload: el numero de parametros no crece con el record.
    expect(params).toHaveLength(2);
    expect(params[0]).toBe(77);
    expect(JSON.parse(String(params[1]))).toEqual([
      { p: "2023-1", c: "659001", n: "MATEMÁTICA DE PRUEBA", a: 1, cr: 4, g: 8, gr: "08", s: "101", o: null },
      { p: "2023-1", c: "4901", n: "LENGUAJE DE PRUEBA", a: 1, cr: 3, g: 14, gr: "14", s: "102", o: null },
      { p: "2023-2", c: "659001", n: "MATEMÁTICA DE PRUEBA", a: 2, cr: 4, g: 12, gr: "12", s: "201", o: null },
      { p: "2023-2", c: "659002", n: "TALLER DE PRUEBA", a: 1, cr: 1.5, g: 17, gr: "17", s: "917",
        o: "OBSERVACIÓN DE PRUEBA" },
      { p: "2026-2", c: "659003", n: "CURSO EN CURSO UNO", a: 1, cr: 3, g: null, gr: null, s: "301", o: null },
      { p: "2026-2", c: "659004", n: "CURSO EN CURSO DOS", a: 1, cr: 4, g: null, gr: null, s: "1302", o: null },
    ]);
    // Nada del record concatenado dentro del SQL.
    expect(texto).not.toContain("659001");
    expect(norm(texto)).toContain("from json_array_elements($2::json) as x");
  });

  test("escribe las diez columnas en el orden de la tabla", async () => {
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    expect(norm(consultas()[1]!.sql)).toContain(
      "insert into student_record_entry (student_id, period_code, course_code, course_name, "
      + "attempt, credits, grade, grade_raw, section_code, observation)",
    );
  });

  test("castea cada campo del JSON al tipo de su columna y la seccion vacia entra como null", async () => {
    // `x->>'…'` siempre devuelve texto: sin cast, `attempt` y `grade` (smallint)
    // y `credits` (numeric) fallarian con 42804 y abortarian la importacion.
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, FILAS);
    const q = norm(consultas()[1]!.sql);
    expect(q).toContain("(x->>'a')::smallint");
    expect(q).toContain("(x->>'cr')::numeric");
    expect(q).toContain("(x->>'g')::smallint");
    expect(q).toContain("nullif(x->>'s', '')");
    // La seccion vacia del portal viaja como "" y es `nullif` quien la vuelve
    // NULL en la base: si el payload la mandara como null, `nullif` sobraria.
    const vacia = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(vacia.tx, 77, [{ ...FILAS[0]!, sectionCode: "" }]);
    const fila = JSON.parse(String(vacia.consultas()[1]!.params[1])) as Array<{ s: string }>;
    expect(fila[0]!.s).toBe("");
  });

  test("deduplica ciclo+curso+vez y se queda con la primera fila", async () => {
    // `uq_student_record_entry (student_id, period_code, course_code, attempt)`
    // responderia 23505 y tumbaria la transaccion ENTERA de la importacion.
    const repetida: RecordRow = { ...FILAS[0]!, courseName: "FILA REPETIDA" };
    const { tx, consultas } = fakeTx([{ id: 1 }]);
    await repo.replaceRecordEntries(tx, 77, [...FILAS, repetida]);
    const payload = JSON.parse(String(consultas()[1]!.params[1])) as Array<{ c: string; n: string }>;
    expect(payload).toHaveLength(6);
    expect(payload[0]!.n).toBe("MATEMÁTICA DE PRUEBA");
    expect(payload.some((x) => x.n === "FILA REPETIDA")).toBe(false);
  });

  test("sin filas borra igual y no intenta insertar nada", async () => {
    // El record confiable siempre trae filas (RS-BE-21 condicion 3), pero el
    // service llama igual con [] cuando `rec` no es ok: la copia vieja no
    // puede sobrevivir a una importacion aceptada.
    const { tx, consultas, llamadas } = fakeTx([]);
    expect(await repo.replaceRecordEntries(tx, 77, [])).toBe(0);
    expect(llamadas()).toBe(1);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_record_entry");
  });

  test("devuelve lo que la base dice haber escrito, no lo que se intento", async () => {
    // Se mandan 6 filas y la base devuelve 4 `returning id`: el metodo tiene
    // que contar las de la base, no `rows.length` ni las deduplicadas.
    const { tx } = fakeTx([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(await repo.replaceRecordEntries(tx, 77, FILAS)).toBe(4);
  });
});

describe("upsertAcademicSnapshot", () => {
  test("escribe la foto en UNA sentencia con ON CONFLICT sobre el alumno", async () => {
    const { tx, consultas, llamadas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    expect(llamadas()).toBe(1);
    expect(norm(consultas()[0]!.sql)).toContain("on conflict (student_id) do update set");
  });

  test("el do update pisa TODAS las columnas, incluida synced_at", async () => {
    // Una columna olvidada dejaria mezclada la foto de dos importaciones y
    // `syncedAt` mentiria sobre la copia visible (RS-BE-25).
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    const q = norm(consultas()[0]!.sql);
    for (const columna of [
      "ppa", "relative_position", "convalidated_courses", "convalidated_credits",
      "approved_courses", "approved_credits", "credits_accumulated", "credits_required", "synced_at",
    ]) {
      expect(q).toContain(`${columna} = excluded.${columna}`);
    }
  });

  test("los valores viajan como parametros, en el orden de las columnas", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL, FECHA);
    expect(consultas()[0]!.params).toEqual([77, 14.25, "TERCIO SUPERIOR", 2, 6, 30, 100, 106, 210, FECHA]);
  });

  test("un campo que no se pudo leer entra como null, nunca como 0", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, GENERAL_VACIO, FECHA);
    const { params } = consultas()[0]!;
    expect(params).toEqual([77, null, null, null, null, null, null, null, null, FECHA]);
    expect(params).not.toContain(0);
  });

  test("un campo undefined no se evapora del SQL", async () => {
    // La plantilla `sql` de Drizzle rinde un chunk `undefined` como CADENA
    // VACIA (sql.js, buildQueryFromSourceParams: `if (chunk === void 0) return
    // { sql: "", params: [] }`), no como parametro: el `values` quedaria con 9
    // elementos y el resto correria una columna. Por eso cada valor nulable va
    // con `?? null`.
    const roto = { ...GENERAL, relativePosition: undefined } as unknown as AcademicGeneral;
    const { tx, consultas } = fakeTx([]);
    await repo.upsertAcademicSnapshot(tx, 77, roto, FECHA);
    const { params } = consultas()[0]!;
    expect(params).toHaveLength(10);
    expect(params[2]).toBeNull();
  });
});

describe("replacePeriodSummaries", () => {
  test("reemplaza entero el resumen del alumno: borra y despues inserta", async () => {
    const { tx, consultas, llamadas } = fakeTx([{ id: 9 }]);
    expect(await repo.replacePeriodSummaries(tx, 77, [PERIODO])).toBe(1);
    expect(llamadas()).toBe(2);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_period_summary where student_id = $1");
    expect(consultas()[0]!.params).toEqual([77]);
    expect(norm(consultas()[1]!.sql)).toContain("insert into student_period_summary");
  });

  test("el bloque viaja en UN solo parametro JSON con sus doce campos", async () => {
    const { tx, consultas } = fakeTx([{ id: 9 }]);
    await repo.replacePeriodSummaries(tx, 77, [PERIODO]);
    const { params } = consultas()[1]!;
    expect(params).toHaveLength(2);
    expect(params[0]).toBe(77);
    expect(JSON.parse(String(params[1]))).toEqual([{
      pc: "2026-1", av: 13.25, rp: "MEDIO SUPERIOR", lv: 4,
      cc: 1, ccr: 3, ec: 7, ecr: 23, ac: 5, acr: 16, fc: 2, fcr: 7,
    }]);
  });

  test("castea el promedio y el nivel al tipo de su columna", async () => {
    const { tx, consultas } = fakeTx([{ id: 9 }]);
    await repo.replacePeriodSummaries(tx, 77, [PERIODO]);
    const q = norm(consultas()[1]!.sql);
    expect(q).toContain("(x->>'av')::numeric");
    expect(q).toContain("(x->>'lv')::smallint");
    expect(q).toContain("(x->>'cc')::int");
  });

  test("un campo no leido entra como null, nunca como 0", async () => {
    const vacio: AcademicPeriodBlock = {
      periodCode: "2026-1", average: null, relativePosition: null, level: null,
      convalidated: { courses: null, credits: null }, enrolled: { courses: null, credits: null },
      approved: { courses: null, credits: null }, failed: { courses: null, credits: null },
    };
    const { tx, consultas } = fakeTx([{ id: 9 }]);
    await repo.replacePeriodSummaries(tx, 77, [vacio]);
    expect(JSON.parse(String(consultas()[1]!.params[1]))).toEqual([{
      pc: "2026-1", av: null, rp: null, lv: null,
      cc: null, ccr: null, ec: null, ecr: null, ac: null, acr: null, fc: null, fcr: null,
    }]);
  });

  test("sin bloque por periodo borra igual y no inserta", async () => {
    // El layout puede no traer el bloque (RS-BE-24): entonces el resumen del
    // alumno queda vacio, no con el del ciclo anterior.
    const { tx, consultas, llamadas } = fakeTx([]);
    expect(await repo.replacePeriodSummaries(tx, 77, [])).toBe(0);
    expect(llamadas()).toBe(1);
    expect(norm(consultas()[0]!.sql)).toContain("delete from student_period_summary");
  });
});
```

**1b. Crear `test/HU34_jeff/electives-cleanup.test.ts`** con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";

/**
 * RS-BE-23: la limpieza borra de `student_course_progress` los electivos
 * APROBADOS que ninguna fila del record respalda.
 *
 * Es la unica escritura de esta funcionalidad que BORRA datos propios del
 * alumno, asi que las pruebas miran el SQL renderizado: lo que importa no es
 * solo lo que la sentencia hace, sino todo lo que NO puede llegar a tocar.
 *
 * Datos inventados: alumno sintetico 20230001 (studentId interno 77), malla 1,
 * curriculum_course 5 y 6 como respaldo.
 */
const fakeTx = (rows: unknown[]) => {
  const capturadas: SQL[] = [];
  return {
    tx: { execute: async (q: SQL) => { capturadas.push(q); return rows; } } as never,
    consultas: () => capturadas.map((q) => new PgDialect().sqlToQuery(q)),
    llamadas: () => capturadas.length,
  };
};

const repo = new PortalSyncRepository({} as never);
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

describe("deleteUnbackedElectives", () => {
  test("con el respaldo vacio devuelve 0 SIN consultar nada", async () => {
    // `intArray([])` rinde `string_to_array('', ',')::int[]`, que es '{}', y
    // `<> all('{}')` es verdadero para TODA fila: la consulta borraria todos
    // los electivos aprobados del alumno. La guarda corta antes.
    const { tx, llamadas } = fakeTx([{ id: 31 }]);
    expect(await repo.deleteUnbackedElectives(tx, 77, 1, [])).toBe(0);
    expect(llamadas()).toBe(0);
  });

  test("borra en UNA sentencia y devuelve lo que la base dice haber borrado", async () => {
    // Tres filas borradas con dos ids de respaldo: el numero sale del
    // `returning`, no del largo de `backingIds`.
    const { tx, consultas, llamadas } = fakeTx([{ id: 31 }, { id: 32 }, { id: 33 }]);
    expect(await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6])).toBe(3);
    expect(llamadas()).toBe(1);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("delete from student_course_progress scp using curriculum_course cc");
    expect(q).toContain("returning scp.id");
  });

  test("solo electivos aprobados, del alumno y de su malla", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const q = norm(consultas()[0]!.sql);
    expect(q).toContain("scp.curriculum_course_id = cc.id");
    expect(q).toContain("scp.student_id = $1");
    expect(q).toContain("scp.curriculum_id = $2");
    expect(q).toContain("cc.category = 'elective'");
    expect(q).toContain("scp.status = 'approved'");
    expect(q).toContain("scp.curriculum_course_id <> all(");
  });

  test("nunca toca otros estados, otras categorias ni la simulacion", async () => {
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const q = norm(consultas()[0]!.sql);
    for (const prohibido of [
      "in_progress", "failed", "withdrawn",
      "general_studies", "common", "faculty",
      "student_curriculum_simulation",
    ]) {
      expect(q).not.toContain(prohibido);
    }
  });

  test("los ids del respaldo viajan en UN solo parametro de texto", async () => {
    // Mismo defecto de 42809 que tumbo la primera importacion real: un arreglo
    // de JS interpolado se vuelve `all(($3, $4))`, un constructor de fila.
    const { tx, consultas } = fakeTx([]);
    await repo.deleteUnbackedElectives(tx, 77, 1, [5, 6]);
    const { sql: texto, params } = consultas()[0]!;
    expect(params).toEqual([77, 1, "5,6"]);
    expect(norm(texto)).not.toMatch(/all\(\s*\(\s*\$\d/);
    expect(norm(texto)).toContain("::int[]");
  });
});
```

Nota: hasta el Paso 3 el editor va a marcar `Property 'lockAcademicRecord' does not exist on type
'PortalSyncRepository'` y lo mismo con los otros cuatro métodos. Es lo esperado: `bun test` no
typechequea, ejecuta.

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/record-persistence.test.ts test/HU34_jeff/electives-cleanup.test.ts
```

Esperado: FAIL, `0 pass`, `24 fail` (19 de `record-persistence.test.ts` y 5 de
`electives-cleanup.test.ts`). Cada fallo es el mismo tipo de error, porque el método todavía no existe
en la clase; el primero:

`TypeError: repo.lockAcademicRecord is not a function. (In 'repo.lockAcademicRecord(tx, 77)', 'repo.lockAcademicRecord' is undefined)`

y los demás con `repo.replaceRecordEntries`, `repo.upsertAcademicSnapshot`,
`repo.replacePeriodSummaries` y `repo.deleteUnbackedElectives`. Si en vez de eso aparece un error al
importar (`Cannot find module`, o el `ZodError` de `DATABASE_URL debe ser una URL de conexión válida de
PostgreSQL`), falta el prefijo `DATABASE_URL=…` o falta la Tarea 1. Los tipos `AcademicGeneral` y
`AcademicPeriodBlock` (Tarea 3) y los campos `gradeRaw`/`observation` de `RecordRow` (Tarea 1) entran por
`import type`, así que su ausencia no rompe la ejecución, pero sí el editor.

- [ ] **Paso 3: Implementación mínima**

**3a. El import de tipos.** En `src/modules/portal-sync/portal-sync.repository.ts`, reemplaza esta línea
(la 5 con la Tarea 1 aplicada; la 4 en HEAD):

```ts
import type { DelegadosNomina, RecordRow, SyllabusEntry } from "./portal-sync.types.js";
```

por:

```ts
import type {
  AcademicGeneral, AcademicPeriodBlock, DelegadosNomina, RecordRow, SyllabusEntry,
} from "./portal-sync.types.js";
```

**3b. Los cinco métodos.** Al final del archivo, reemplaza este bloque (el cierre de
`createStudentAccount` y la llave de la clase, líneas 1186-1190; `careerName: input.careerName,`
aparece una sola vez en el archivo, igual que `currentLevel: null as number | null,`):

```ts
      currentLevel: null as number | null,
      careerName: input.careerName,
    };
  }
}
```

por esto:

```ts
      currentLevel: null as number | null,
      careerName: input.careerName,
    };
  }

  /**
   * Candado de TRANSACCIÓN para toda la escritura del récord (RS-BE-22).
   *
   * Dos importaciones del mismo alumno pueden solaparse de verdad: el cliente
   * corta a los 90 s y el servidor sigue hasta 300 s, así que el alumno
   * reintenta mientras la primera todavía corre. Sin candado, las dos borran e
   * insertan `student_record_entry` a la vez y la segunda puede violar
   * `uq_student_record_entry` o dejar la copia mezclada.
   *
   * `_xact_` y no `pg_advisory_lock`: el candado de sesión se suelta a mano o
   * al cerrar la conexión, y acá la conexión vuelve al pool de postgres-js. El
   * de transacción se libera solo en el commit o el rollback.
   *
   * `hashtext('academic-record')` da el espacio de nombres para que no choque
   * con ningún otro candado futuro, y el `::int` explícito evita la ambigüedad
   * entre `pg_advisory_xact_lock(int4, int4)` y la variante de un `int8`.
   */
  async lockAcademicRecord(tx: Tx, studentId: number): Promise<void> {
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtext('academic-record'), ${studentId}::int)
    `);
  }

  /**
   * Reemplaza ENTERA la copia del récord del alumno (RS-BE-22).
   *
   * Es una copia del portal, no historia propia: borrar e insertar es más
   * simple y más fiel que reconciliar fila por fila, y deja el estado igual a
   * lo que el portal muestra hoy. Va dentro de la transacción de la
   * importación y bajo el candado de `lockAcademicRecord`.
   *
   * Se deduplica en JS por `ciclo|curso|vez` antes de armar el payload: la
   * misma sentencia con dos filas de la misma clave choca contra
   * `uq_student_record_entry` con 23505 y aborta la transacción ENTERA de la
   * importación, no solo esta escritura. Gana la primera, que es el orden en
   * que el portal las muestra. El parser no debería producir duplicados, así
   * que esto es una defensa, no la regla.
   *
   * Las filas viajan como UN parámetro JSON y se expanden con
   * `json_array_elements`, igual que `upsertProgressBatch`: el número de
   * parámetros no crece con el tamaño del récord y la consulta que llega a
   * Postgres es siempre la misma.
   *
   * `x->>'…'` siempre devuelve texto, de ahí los cast explícitos; y
   * `nullif(x->>'s', '')` porque una sección vacía del portal es "no hay
   * sección", no la cadena vacía. Una nota nula sigue nula: `->>` sobre un
   * `null` de JSON devuelve NULL, no "null".
   */
  async replaceRecordEntries(tx: Tx, studentId: number, rows: RecordRow[]): Promise<number> {
    await tx.execute(sql`
      delete from student_record_entry where student_id = ${studentId}
    `);
    const vistas = new Set<string>();
    const unicas = rows.filter((r) => {
      const clave = `${r.periodCode}|${r.courseCode}|${r.attempt}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
    if (!unicas.length) return 0;
    const payload = JSON.stringify(unicas.map((r) => ({
      p: r.periodCode,
      c: r.courseCode,
      n: r.courseName,
      a: Number(r.attempt),
      cr: Number(r.credits),
      g: r.grade == null ? null : Number(r.grade),
      gr: r.gradeRaw ?? null,
      s: r.sectionCode ?? "",
      o: r.observation ?? null,
    })));
    const escritas = (await tx.execute(sql`
      insert into student_record_entry
        (student_id, period_code, course_code, course_name, attempt, credits,
         grade, grade_raw, section_code, observation)
      select ${studentId}, x->>'p', x->>'c', x->>'n', (x->>'a')::smallint, (x->>'cr')::numeric,
             (x->>'g')::smallint, x->>'gr', nullif(x->>'s', ''), x->>'o'
        from json_array_elements(${payload}::json) as x
      returning id
    `)) as unknown as Array<{ id: number }>;
    return escritas.length;
  }

  /**
   * Foto acumulada del alumno (RS-BE-25). Una fila por alumno, de ahí el
   * `on conflict (student_id) do update` sobre la PK.
   *
   * El `do update` pisa TODAS las columnas, incluida `synced_at`: si alguna se
   * quedara afuera, la foto sería una mezcla de dos importaciones y `syncedAt`
   * dejaría de corresponder a la copia visible, que es justo la garantía que
   * da RS-BE-25.
   *
   * Cada valor nulable va con `?? null`. No es decorativo: la plantilla `sql`
   * de Drizzle rinde un chunk `undefined` como cadena VACÍA en vez de como
   * parámetro, así que un campo `undefined` no dejaría un NULL, correría todo
   * el `values` una columna y escribiría la ubicación relativa en otro campo.
   * `??` no toca el 0, que acá es un dato válido.
   *
   * Sin CHECK de rango en `ppa`: un valor raro del portal no puede abortar la
   * transacción de la importación (ver la migración 0011).
   */
  async upsertAcademicSnapshot(
    tx: Tx, studentId: number, general: AcademicGeneral, syncedAt: Date,
  ): Promise<void> {
    await tx.execute(sql`
      insert into student_academic_snapshot
        (student_id, ppa, relative_position, convalidated_courses, convalidated_credits,
         approved_courses, approved_credits, credits_accumulated, credits_required, synced_at)
      values (
        ${studentId}, ${general.ppa ?? null}, ${general.relativePosition ?? null},
        ${general.convalidated.courses ?? null}, ${general.convalidated.credits ?? null},
        ${general.approved.courses ?? null}, ${general.approved.credits ?? null},
        ${general.creditsAccumulated ?? null}, ${general.creditsRequired ?? null}, ${syncedAt}
      )
      on conflict (student_id) do update set
        ppa = excluded.ppa,
        relative_position = excluded.relative_position,
        convalidated_courses = excluded.convalidated_courses,
        convalidated_credits = excluded.convalidated_credits,
        approved_courses = excluded.approved_courses,
        approved_credits = excluded.approved_credits,
        credits_accumulated = excluded.credits_accumulated,
        credits_required = excluded.credits_required,
        synced_at = excluded.synced_at
    `);
  }

  /**
   * Reemplaza ENTERO el resumen por ciclo del alumno (RS-BE-25).
   *
   * DELETE + INSERT y no upsert: hoy la única fuente es el bloque "por
   * período" de `layout.jsp`, que trae UN ciclo (el anterior al que se
   * importa). Si el layout deja de traerlo, el resumen tiene que quedar
   * vacío y no con el del ciclo de hace seis meses, que ya sería un dato
   * falso. Por eso el borrado no depende de que haya algo que insertar.
   *
   * El payload va en JSON como en `replaceRecordEntries`, aunque hoy sean 0 o
   * 1 filas: cuando exista el lector de `ComandoListarResumenAcademico` van a
   * ser N y la sentencia no cambia. El DELETE previo garantiza que
   * `uq_student_period_summary` no pueda chocar con filas viejas.
   */
  async replacePeriodSummaries(
    tx: Tx, studentId: number, periods: AcademicPeriodBlock[],
  ): Promise<number> {
    await tx.execute(sql`
      delete from student_period_summary where student_id = ${studentId}
    `);
    if (!periods.length) return 0;
    const payload = JSON.stringify(periods.map((p) => ({
      pc: p.periodCode,
      av: p.average ?? null,
      rp: p.relativePosition ?? null,
      lv: p.level ?? null,
      cc: p.convalidated.courses ?? null,
      ccr: p.convalidated.credits ?? null,
      ec: p.enrolled.courses ?? null,
      ecr: p.enrolled.credits ?? null,
      ac: p.approved.courses ?? null,
      acr: p.approved.credits ?? null,
      fc: p.failed.courses ?? null,
      fcr: p.failed.credits ?? null,
    })));
    const escritas = (await tx.execute(sql`
      insert into student_period_summary
        (student_id, period_code, average, relative_position, level,
         convalidated_courses, convalidated_credits, enrolled_courses, enrolled_credits,
         approved_courses, approved_credits, failed_courses, failed_credits)
      select ${studentId}, x->>'pc', (x->>'av')::numeric, x->>'rp', (x->>'lv')::smallint,
             (x->>'cc')::int, (x->>'ccr')::numeric, (x->>'ec')::int, (x->>'ecr')::numeric,
             (x->>'ac')::int, (x->>'acr')::numeric, (x->>'fc')::int, (x->>'fcr')::numeric
        from json_array_elements(${payload}::json) as x
      returning id
    `)) as unknown as Array<{ id: number }>;
    return escritas.length;
  }

  /**
   * Borra los electivos APROBADOS que el récord no respalda (RS-BE-23).
   *
   * Es la única escritura de esta funcionalidad que borra datos propios del
   * alumno, así que las condiciones son todas explícitas y el filtro por
   * categoría y estado va en el SQL, no en quien llama:
   * `cc.category = 'elective'` y `scp.status = 'approved'`. Nunca un
   * obligatorio, nunca un `in_progress`, `failed` ni `withdrawn`, y nunca
   * `student_curriculum_simulation`. Por qué solo electivos: la tabla de
   * equivalencias está incompleta y para un obligatorio el código no puede
   * distinguir "no lo aprobó" de "lo aprobó con un código que no sé leer".
   *
   * **La guarda del arreglo vacío no es defensiva, es la funcionalidad.**
   * `intArray([])` rinde `string_to_array('', ',')::int[]`, o sea `'{}'`, y
   * `<> all('{}')` es VERDADERO para toda fila: la consulta borraría todos los
   * electivos aprobados del alumno. Por eso se corta antes de consultar, como
   * pide la spec y como ya hace `withdrawMissingEnrollments` con su centinela
   * `[-1]`.
   *
   * Los ids van por `intArray`: interpolar el arreglo de JS lo convertiría en
   * `all(($3, $4))`, un constructor de fila, y Postgres lo rechaza con 42809
   * (ver el comentario de `intArray` arriba).
   *
   * Devuelve cuántas filas borró de verdad, que es lo que suma
   * `summary.progressRemoved`.
   */
  async deleteUnbackedElectives(
    tx: Tx, studentId: number, curriculumId: number, backingIds: number[],
  ): Promise<number> {
    if (!backingIds.length) return 0;
    const rows = (await tx.execute(sql`
      delete from student_course_progress scp
      using curriculum_course cc
      where scp.curriculum_course_id = cc.id
        and scp.student_id = ${studentId}
        and scp.curriculum_id = ${curriculumId}
        and cc.category = 'elective'
        and scp.status = 'approved'
        and scp.curriculum_course_id <> all(${intArray(backingIds)})
      returning scp.id
    `)) as unknown as Array<{ id: number }>;
    return rows.length;
  }
}
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/record-persistence.test.ts test/HU34_jeff/electives-cleanup.test.ts
```

Esperado: PASS, `24 pass`, `0 fail`, `Ran 24 tests across 2 files`.

- [ ] **Paso 5: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ninguna salida y exit 0. `tsconfig.json` solo incluye `src/**/*`, así que lo único
que compila de esta tarea es `portal-sync.repository.ts`; los dos archivos de prueba no pasan por `tsc`.
Los fallos típicos serían `AcademicGeneral` o `AcademicPeriodBlock` sin existir en `portal-sync.types.ts`
(falta la Tarea 3), `gradeRaw`/`observation` sin existir en `RecordRow` (falta la Tarea 1), o
`noUnusedLocals` si algún nombre del import de tipos quedó sin usar.

- [ ] **Paso 6: Regresión**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU31_jeff test/HU33_jeff test/HU34_jeff
```

Esperado: `0 fail`. Esta tarea solo **agrega** métodos a `PortalSyncRepository` y no cambia ninguno de
los existentes, así que los 19 archivos de prueba de HU31 y HU33 que importan esa clase
(`repository.*.test.ts`, `service.*.test.ts`, `registro.*.test.ts`) no deberían moverse. Hay un
vigésimo fuera de estas dos carpetas, `test/HU_asistencia/attendance-risk.sin-datos.test.ts`, que por la
misma razón tampoco se mueve y por eso no se corre acá. Tampoco se llama a los métodos nuevos desde el
service todavía: eso es la Tarea 6, y por eso los dobles de repositorio de HU31 y HU33 —que no los
tienen— siguen sirviendo. Si algo falla acá, es de una tarea anterior: comparar con la línea base
anotada en el Paso 0 de la Tarea 1.

- [ ] **Paso final: Commit**

```bash
cd . && git add src/modules/portal-sync/portal-sync.repository.ts test/HU34_jeff/record-persistence.test.ts test/HU34_jeff/electives-cleanup.test.ts && git commit -m "feat(academic-record): escritura del récord en la base desde la importación (RS-BE-22, RS-BE-23, RS-BE-25)

El repositorio suma cinco métodos transaccionales: el candado por alumno con pg_advisory_xact_lock, el reemplazo entero de la copia del récord (deduplicada por ciclo, curso y vez), el upsert de la foto acumulada, el reemplazo del resumen por ciclo y el borrado de los electivos aprobados que el récord no respalda. Las filas viajan como un solo parámetro JSON y los ids del respaldo con intArray; con el respaldo vacío no se consulta nada. Nadie los llama todavía: eso son las Tareas 6 y 7."
```

Sin trailer `Co-Authored-By` y sin `push`. La migración 0011 **no se aplica**: hasta que el dueño la
aplique (paso PARAR de la Tarea 10), estos métodos existen pero no los invoca nadie, así que ninguna
importación los alcanza.

### Tarea 6: Consentimiento, confianza y copia en la importación (RS-BE-21, RS-BE-22, RS-BE-25, RS-BE-29)

**Archivos:**
- Crear: `test/HU34_jeff/fixtures/matricula.html` (consolidado sintético: código `20230001`, dos cursos inventados; el de `test/HU31_jeff/fixtures/` **no** se reutiliza)
- Crear: `test/HU34_jeff/consent-gate.test.ts`
- Modificar: `test/HU34_jeff/record-persistence.test.ts` (lo crea la Tarea 5; esta tarea le agrega el bloque de nivel service)
- Modificar: `src/modules/portal-sync/portal-sync.schemas.ts:36-39` (`consent` dentro del `z.object`, antes del `.refine`)
- Modificar: `src/modules/portal-sync/portal-sync.controller.ts:20-27` (desestructura `consent` y lo pasa al service)
- Modificar: `src/modules/portal-sync/portal-sync.service.ts:12-16` (imports), `:114-116` (firma de `importFromPortal`), `:137` (llamada a `runImport`), `:143-146` (firma de `runImport`), `:181-183` (parseo del récord + regla de confianza), `:400-402` (candado), `:649-651` (copia, foto y resumen)
- Modificar: `specs/features/portal-sync/portal-sync.spec.md:124` (§API Contract Draft), `:150-153` (§Login con credenciales), `:388` (§Fuera de alcance explícito), `:393-394` (§Privacidad y base legal), `:406-407` (§DTO validation), `:423-425` y `:431-433` y `:436` (§Decisiones: #2 y #7)
- Modificar: `docs/specs/api-contracts.md:608` (body de `POST /portal-sync/import`)
- Test: `test/HU34_jeff/consent-gate.test.ts` y `test/HU34_jeff/record-persistence.test.ts`

Las líneas de `portal-sync.service.ts`, `portal-sync.schemas.ts` y `portal-sync.controller.ts` son las de hoy y **no se corren** con las Tareas 1-5: ninguna de ellas toca esos tres archivos (Tarea 1: `parsers/html.ts`, `parsers/record.ts`, `portal-sync.types.ts`, `portal-sync.repository.ts`; Tarea 3: `parsers/info-academica.ts`, `portal-sync.types.ts`; Tarea 5: `portal-sync.repository.ts`).

Las de `portal-sync.spec.md`, en cambio, **sí se corren**: la Tarea 3 reemplaza la viñeta de `parseInfoAcademica` (líneas 229-230, dos líneas) por una de tres, así que todo lo que está por debajo baja **+1**. Con la Tarea 3 ya hecha, `:388` → 389, `:393-394` → 394-395, `:406-407` → 407-408, `:423-425` → 424-426, `:431-433` → 432-434, `:436` → 437. Las líneas 124 y 150-153 están por encima y no se mueven. `docs/specs/api-contracts.md:608` no lo toca ninguna tarea previa. **Todas las anclas de abajo son texto literal, no números**: si el número no calza, busca el texto.

`specs/features/academic-record/academic-record.spec.md` **no se toca**: ya trae los `[@test]` de `consent-gate.test.ts` (línea 296) y de `record-persistence.test.ts` (líneas 152 y 242), y `portal-sync.controller.ts` entró a sus `targets` en la Tarea 1.

Todos los comandos se corren desde la raíz del worktree `.`: las pruebas abren los fixtures con rutas relativas al cwd. Bun no está en el PATH. El prefijo `DATABASE_URL=…` es obligatorio porque el `.env` del worktree apunta a PRODUCCIÓN y bun lo carga solo. No abras ni imprimas `.env`.

**Interfaces:**

- Consume (Tarea 1, `src/modules/portal-sync/parsers/record.ts`):
  ```ts
  export const parseRecordPage = (html: string): RecordPage   // nunca lanza
  export const recordRows = (page: RecordPage): ParseResult<RecordRow[]>
  //   rows.length ? { ok: true, data: rows } : { ok: false, reason: "no se encontraron filas de récord" }
  export interface RecordRow {   // portal-sync.types.ts
    periodCode: string; courseCode: string; courseName: string;
    attempt: number; credits: number; grade: number | null; sectionCode: string;
    gradeRaw: string | null; observation: string | null;
  }
  export interface RecordPage { rows: RecordRow[]; headerOk: boolean; discarded: number; footer: RecordFooter | null }
  ```
- Consume (Tarea 2, `src/modules/academic-record/academic-record.logic.ts`):
  ```ts
  export type RecordTrust = { ok: true } | { ok: false; reason: string };
  export const evaluateRecordTrust = (page: RecordPage): RecordTrust
  //   motivo literal cuando falta el pie: "pie ausente o ilegible"
  ```
- Consume (Tarea 3, `src/modules/portal-sync/parsers/info-academica.ts` y `portal-sync.types.ts`):
  ```ts
  export const EMPTY_GENERAL: AcademicGeneral            // todo null, congelado
  export const parseInfoAcademica = (html: string): ParseResult<InfoAcademica>
  export interface InfoAcademica {
    careerName: string | null; general: AcademicGeneral;
    period: AcademicPeriodBlock | null; unreadable: string[];
  }
  export interface AcademicGeneral {
    ppa: number | null; relativePosition: string | null;
    convalidated: CountCredits; approved: CountCredits;
    creditsAccumulated: number | null; creditsRequired: number | null;
  }
  export interface AcademicPeriodBlock {
    periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
    convalidated: CountCredits; enrolled: CountCredits; approved: CountCredits; failed: CountCredits;
  }
  ```
- Consume (Tarea 5, métodos de `PortalSyncRepository`; esta tarea usa los cuatro primeros, el quinto lo llama la Tarea 7):
  ```ts
  async lockAcademicRecord(tx: Tx, studentId: number): Promise<void>
  async replaceRecordEntries(tx: Tx, studentId: number, rows: RecordRow[]): Promise<number>
  async upsertAcademicSnapshot(tx: Tx, studentId: number, general: AcademicGeneral, syncedAt: Date): Promise<void>
  async replacePeriodSummaries(tx: Tx, studentId: number, periods: AcademicPeriodBlock[]): Promise<number>
  ```
- Consume (repo actual, sin cambios):
  ```ts
  // portal-sync.service.ts:34-45
  export type ProvisionFn = (tx: Tx, identidad: { studentCode: string; studentName: string; careerName: string }) => Promise<StudentProfile>;
  export type ValidateFn = (summary: ImportSummary) => void;
  // portal-sync.service.ts:79-96
  constructor(repository: PortalSyncRepository, client: PortalClient, auth?: { reissueToken(...): Promise<string | null> })
  // portal-sync.controller.ts:10-14
  private requireStudentId(c: Context): number
  // shared/middleware/validate-dto.ts:5
  export const validateJson = async <T>(c: Context, schema: ZodSchema<T>) => Promise<T>
  //   un safeParse fallido lanza HttpError(400, "Invalid request body", "INVALID_REQUEST_BODY")
  ```
- Produce (lo usan las Tareas 7 y 8):
  ```ts
  // portal-sync.schemas.ts: dentro del z.object de importSchema, ANTES del .refine
  consent: z.boolean().optional(),

  // portal-sync.service.ts
  importFromPortal(
    userId: number, studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string }; consent?: boolean },
    provision?: ProvisionFn, validate?: ValidateFn,
  ): Promise<ImportResult>
  private runImport(
    userId: number, studentId: number, cookies: PortalCookies, consent: boolean,
    provision?: ProvisionFn, validate?: ValidateFn,
  ): Promise<ImportResult>
  // dentro de runImport, visible para la Tarea 7:
  //   const recordPage = parseRecordPage(pages.record);
  //   const rec = recordRows(recordPage);
  //   const confianza = evaluateRecordTrust(recordPage);
  //   const guardarRecord = consent && confianza.ok;   // boolean

  // portal-sync.controller.ts
  const { cookies, credentials, consent } = await validateJson(c, importSchema);
  … this.service.importFromPortal(userId, studentId, { cookies, credentials, consent: consent === true })
  ```
  Fixture nuevo que la Tarea 7 también usa: `test/HU34_jeff/fixtures/matricula.html` (código `20230001`, alumno `ALUMNO DE PRUEBA`, carrera `INGENIERÍA INDUSTRIAL`, cursos `659003` sec. `301` y `659004` sec. `1302`, período `2026-2`).

---

- [ ] **Paso 1: Escribir el fixture de matrícula y las pruebas que fallan**

**1.a — `test/HU34_jeff/fixtures/matricula.html`** (crear). Es el consolidado de matrícula que el service usa como **fuente de identidad**: sin él, `runImport` aborta con 422 antes de llegar a lo que esta tarea prueba. Copia la estructura del consolidado real (tabla de identidad de 3 columnas bajo el encabezado `CÓDIGO`, tabla de cursos de 8 columnas `CAR. | COD | SEC. | GR. | NOMBRE | Nv. | CRD. | VEZ`, rótulo `Período` + código en dos `<span>` separados) con **valores inventados**. El de `test/HU31_jeff/fixtures/matricula.html` **no** se reutiliza: aunque su código de alumno está anonimizado, sus cursos, secciones y docentes son los de una matrícula real, y el esqueleto del plan prohíbe expresamente que los fixtures de HU34 salgan de `test/HU31_jeff/fixtures/`. UTF-8, tildes literales.

```html
<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
<html>
<head>
	<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
	<title>Consolidado de Matrícula</title>
</head>
<body>

<TABLE border=0 cellpadding=0 width=700>
<TR>
	<TD align=center>
		<span class=tituloConsolidado>CONSOLIDADO DE MATRÍCULA</span>
	</TD>
	<TD width=30 align=right valign=bottom>
		<span class=periodoConsolidado>Período</span>
		<br>
		<span class=periodoConsolidado>2026-2</span>
		<br><br>
	</TD>
</TR>
</TABLE>

<TABLE border=1 bordercolor=cccccc cellspacing=0 cellpadding=2 width=700>
<TR bgcolor="e0e0e0">
	<TD align=center><span class=defaultTxtBold>CÓDIGO</span></TD>
	<TD align=center><span class=defaultTxtBold>NOMBRES Y APELLIDOS</span></TD>
	<TD align=center><span class=defaultTxtBold>CARRERA</span></TD>
</TR>
<TR bgcolor="white">
	<TD align=center><span class=defaultTxt>20230001</span></TD>
	<TD align=center><span class=defaultTxt>ALUMNO DE PRUEBA</span></TD>
	<TD align=center><span class=defaultTxt>INGENIERÍA INDUSTRIAL</span></TD>
</TR>
</TABLE>

<BR><BR>

	<!-- Cursos Matriculados -->
	<form name=cursosMatriculados1>
	<table border=0 cellpadding=1 cellspacing=1 width=700>
	<tr bgcolor=e0e0e0>
		<td align=center><span class=defaultTxtBold>CAR.</span></td>
		<td align=center><span class=defaultTxtBold>COD</span></td>
		<td align=center><span class=defaultTxtBold>SEC.</span></td>
		<td align=center><span class=defaultTxtBold>GR.</span></td>
		<td><span class=defaultTxtBold>&nbsp;NOMBRE ASIGNATURA</span></td>
		<td align=center><span class=defaultTxtBold>Nv.</span></td>
		<td align=center><span class=defaultTxtBold>CRD.</span></td>
		<td align=center><span class=defaultTxtBold>VEZ</span></td>
	</tr>

	<tr class=cursosMatRow id=cMatrow1>
		<td align=center width=40><span class=defaultTxt> 0001 </span></td>
		<td align=center width=40><span class=defaultTxt> 659003 </span></td>
		<td align=center width=40><span class=defaultTxt> 301 </span></td>
		<td align=center width=40><span class=defaultTxt> &nbsp; </span></td>
		<td><span class=defaultTxt> CURSO EN CURSO UNO </span></td>
		<td align=center width=40><span class=defaultTxt> 6 </span></td>
		<td align=center width=40><span class=defaultTxt> 3.0 </span></td>
		<td align=center width=40><span class=defaultTxt> 1 </span></td>
	</tr>

	<tr class=cursosMatRow id=cMatrow2>
		<td align=center width=40><span class=defaultTxt> 0001 </span></td>
		<td align=center width=40><span class=defaultTxt> 659004 </span></td>
		<td align=center width=40><span class=defaultTxt> 1302 </span></td>
		<td align=center width=40><span class=defaultTxt> &nbsp; </span></td>
		<td><span class=defaultTxt> CURSO EN CURSO DOS </span></td>
		<td align=center width=40><span class=defaultTxt> 6 </span></td>
		<td align=center width=40><span class=defaultTxt> 4.0 </span></td>
		<td align=center width=40><span class=defaultTxt> 1 </span></td>
	</tr>
	</table>
	</form>

</body>
</html>
```

Por qué cada pieza, contra `src/modules/portal-sync/parsers/matricula.ts`: el texto tiene que traer `CÓDIGO` (`:13`) y `Período … 2026-2` (`:4`, `:15`); la fila de encabezado es la única con **3** celdas y `CÓDIGO` en la primera (`:23-26`); bajo ella tiene que haber **exactamente una** fila de 3 celdas con 8 dígitos al inicio (`:31-41`), por eso `20230001` aparece una sola vez en todo el archivo; las filas de curso necesitan ≥8 celdas con `CAR.` de 4 dígitos, `COD` de 4 a 6 y `SEC.` de 1 a 4 (`:48-49`). Los códigos `659003`/`659004` y las secciones `301`/`1302` son los mismos del ciclo en curso de `fixtures/record.html` para que el fixture sea coherente: el récord dice que el alumno está cursando justo esos dos cursos. Con eso la búsqueda de nota final del service (`portal-sync.service.ts:507-508`) sí encuentra la fila del récord para cada curso del ciclo, y `enrollment.final_grade` queda en `null` porque esas filas todavía no tienen nota — que es lo que el portal reporta a mitad de ciclo.

**1.b — `test/HU34_jeff/consent-gate.test.ts`** (crear), con este contenido completo:

```ts
import { describe, expect, spyOn, test } from "bun:test";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { ProvisionFn } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient } from "../../src/services/portal.client.js";
import { importSchema } from "../../src/modules/portal-sync/portal-sync.schemas.js";
import type {
  AcademicGeneral, AcademicPeriodBlock, RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";

/**
 * RS-BE-29 (consentimiento) y las consecuencias de RS-BE-21 en la importación
 * (specs/features/academic-record/academic-record.spec.md).
 *
 * Lo que se fija acá: sin `consent: true` la importación corre EXACTAMENTE como
 * hoy y no toca ninguna de las tres tablas nuevas; con consentimiento y un
 * récord de confianza, el candado va primero y las tres escrituras después del
 * progreso; con consentimiento pero sin confianza, el motivo va al log del
 * servidor y el alumno no recibe ningún aviso nuevo.
 *
 * Fixtures INVENTADOS (el repo es público): alumno sintético 20230001, notas y
 * cursos de prueba. Los fixtures de HU31 traen datos reales y no se
 * usan acá.
 */
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();
const layoutBase = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();
const matricula = await Bun.file("test/HU34_jeff/fixtures/matricula.html").text();

// El fixture de layout de HU34 trae el bloque "Información Académica" pero no el
// rótulo del ciclo vigente, y sin él `parseCicloActivo` aborta con 502 antes de
// llegar a nada de esta tarea. Se agrega acá y no en el fixture porque el fixture
// es de la Tarea 3 y su prueba fija su contenido. `CICLO:` va en mayúsculas y con
// dos puntos: es la grafía que `parseCicloActivo` exige (sin flag `i`) y la que lo
// distingue del "Ciclo 2026-1" del bloque por período.
const layout = layoutBase.replace("</body>", '<span class="PortalChannelText">CICLO: 2026-2</span></body>');

// Récord sin la tabla del pie: `evaluateRecordTrust` responde "pie ausente o ilegible".
const tablaPie = (record.match(/<table[\s\S]*?<\/table>/gi) ?? [])[1] ?? "";
const recordSinPie = record.replace(tablaPie, "");

// Layout con un rótulo cambiado en la cabecera de "Información General": el
// bloque deja de leerse y `unreadable` queda en ["general"].
const layoutGeneralRota = layout.replace(
  'size="1">Cr&eacute;ditos Acumulados</font>',
  'size="1">Cr&eacute;ditos Totales</font>',
);

const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

/** Perfil que devuelve el hook de registro: ids distintos de los de la cuenta ya
 *  existente (7/3), para que se note si el candado recibiera el studentId viejo. */
const PERFIL_APROVISIONADO = {
  id: 77, userId: 55, careerId: 1, curriculumId: 1,
  currentLevel: null as number | null, careerName: "INGENIERÍA INDUSTRIAL",
};
const provisionHook: ProvisionFn = async () => PERFIL_APROVISIONADO;

/** Cada llamada a un método nuevo del repositorio, con sus argumentos. */
type Escritura =
  | { metodo: "lockAcademicRecord"; studentId: number }
  | { metodo: "replaceRecordEntries"; studentId: number; rows: RecordRow[] }
  | { metodo: "upsertAcademicSnapshot"; studentId: number; general: AcademicGeneral; syncedAt: Date }
  | { metodo: "replacePeriodSummaries"; studentId: number; periods: AcademicPeriodBlock[] };

/**
 * Doble del repositorio con las MISMAS claves que el service.import de HU31
 * (ahí está el inventario de lo que el service llama), más los cuatro métodos
 * nuevos como espías y un `orden` global que ordena las escrituras entre sí.
 * `runInTransaction` confirma solo si el callback no lanza, como el repo real.
 */
const armarServicio = (opts: { record?: string; layout?: string } = {}) => {
  const escrituras: Escritura[] = [];
  const orden: string[] = [];
  let confirmado = false;

  const client = {
    fetchPage: async () => opts.layout ?? layout,
    fetchAll: async () => ({ matricula, record: opts.record ?? record }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as PortalClient;

  const repo = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => "20230001",
    findStudent: async () => ({
      id: 7, userId: 3, careerId: 1, curriculumId: 1,
      currentLevel: null, careerName: "INGENIERÍA INDUSTRIAL",
    }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const r = await fn({});
      confirmado = true;
      return r;
    },
    // `created: false` a propósito: un período ya existente no dispara
    // ensureAcademicWeeks ni los warnings de fechas, que no son de esta tarea.
    upsertPeriod: async () => {
      orden.push("upsertPeriod");
      return {
        id: 2, code: "2026-2", created: false, datesDefaulted: false,
        startDate: "2026-08-24", endDate: "2026-12-14",
      };
    },
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.map((c, i) => [c, 60 + i])),
    findEquivalentCurriculumCourseIds: async () => new Map<string, number>(),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => {
      orden.push("upsertProgressBatch");
      return items.length;
    },
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    // Métodos de la Tarea 5. Si el service los llamara sin consentimiento, los
    // dobles de HU31 y HU33 —que NO los tienen— reventarían: esa es la prueba de
    // regresión del gate, y por eso acá se registran uno por uno.
    lockAcademicRecord: async (_tx: unknown, studentId: number) => {
      orden.push("lockAcademicRecord");
      escrituras.push({ metodo: "lockAcademicRecord", studentId });
    },
    replaceRecordEntries: async (_tx: unknown, studentId: number, rows: RecordRow[]) => {
      orden.push("replaceRecordEntries");
      escrituras.push({ metodo: "replaceRecordEntries", studentId, rows });
      return rows.length;
    },
    upsertAcademicSnapshot: async (
      _tx: unknown, studentId: number, general: AcademicGeneral, syncedAt: Date,
    ) => {
      orden.push("upsertAcademicSnapshot");
      escrituras.push({ metodo: "upsertAcademicSnapshot", studentId, general, syncedAt });
    },
    replacePeriodSummaries: async (
      _tx: unknown, studentId: number, periods: AcademicPeriodBlock[],
    ) => {
      orden.push("replacePeriodSummaries");
      escrituras.push({ metodo: "replacePeriodSummaries", studentId, periods });
      return periods.length;
    },
  } as unknown as PortalSyncRepository;

  return {
    service: new PortalSyncService(repo, client),
    escrituras,
    orden,
    estaConfirmado: () => confirmado,
  };
};

/** Lo único que la importación escribe hoy y que este archivo ordena. */
const ORDEN_SIN_RECORD = ["upsertPeriod", "upsertProgressBatch"];
const ORDEN_CON_RECORD = [
  "lockAcademicRecord",
  "upsertPeriod",
  "upsertProgressBatch",
  "replaceRecordEntries",
  "upsertAcademicSnapshot",
  "replacePeriodSummaries",
];

describe("fixtures sinteticos de HU34", () => {
  test("el layout lleva un solo cierre de body y un solo rotulo de ciclo vigente", () => {
    expect(layoutBase.split("</body>")).toHaveLength(2);
    expect(layout.split("CICLO: 2026-2")).toHaveLength(2);
  });

  test("la matricula es del alumno sintetico 20230001 y no trae ningun otro codigo", () => {
    expect(matricula).toContain("ALUMNO DE PRUEBA");
    expect(matricula.match(/\b\d{8}\b/g)).toEqual(["20230001"]);
  });

  test("el record sin pie pierde la segunda tabla y conserva la del record", () => {
    expect(tablaPie).toContain("ASIG. DESAP.");
    expect(recordSinPie).not.toContain("ASIG. DESAP.");
    expect(recordSinPie).toContain("<th>CICLO</th>");
  });
});

describe("importSchema con consent (RS-BE-29)", () => {
  test("acepta consent true junto a las cookies", () => {
    expect(importSchema.safeParse({ cookies, consent: true }).success).toBe(true);
  });

  test("acepta el body sin consent: es lo que mandan las apps ya instaladas", () => {
    expect(importSchema.safeParse({ cookies }).success).toBe(true);
  });

  test("rechaza un consent que no es booleano en vez de descartarlo en silencio", () => {
    expect(importSchema.safeParse({ cookies, consent: "si" }).success).toBe(false);
  });

  test("consent no reemplaza a cookies ni a credentials", () => {
    expect(importSchema.safeParse({ consent: true }).success).toBe(false);
  });
});

describe("sin consentimiento la importacion corre como hoy (RS-BE-29)", () => {
  test("sin el campo consent no se toca ninguna tabla nueva", async () => {
    const a = armarServicio();
    const r = await a.service.importFromPortal(3, 7, { cookies });
    expect(a.escrituras).toEqual([]);
    expect(a.orden).toEqual(ORDEN_SIN_RECORD);
    expect(r.summary.enrollmentsUpserted).toBe(2);
  });

  test("consent false se comporta igual que no mandarlo", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(3, 7, { cookies, consent: false });
    expect(a.escrituras).toEqual([]);
    expect(a.orden).toEqual(ORDEN_SIN_RECORD);
  });

  test("guardar la copia no cambia ni el resumen ni los avisos", async () => {
    const sin = armarServicio();
    const rSin = await sin.service.importFromPortal(3, 7, { cookies });
    const con = armarServicio();
    const rCon = await con.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(rCon.summary).toEqual(rSin.summary);
    expect(rCon.warnings).toEqual(rSin.warnings);
  });
});

describe("con consentimiento y record de confianza (RS-BE-22, RS-BE-25)", () => {
  test("el candado va primero y las tres escrituras despues del progreso", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.orden).toEqual(ORDEN_CON_RECORD);
    expect(a.estaConfirmado()).toBe(true);
  });

  test("las cuatro llamadas reciben el studentId del token", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.escrituras.map((e) => e.studentId)).toEqual([7, 7, 7, 7]);
  });

  test("en el registro reciben el id que devolvio provision, nunca 0", async () => {
    const a = armarServicio();
    await a.service.importFromPortal(0, 0, { cookies: {} as never, consent: true }, provisionHook);
    expect(a.orden).toEqual(ORDEN_CON_RECORD);
    expect(a.escrituras.map((e) => e.studentId)).toEqual([77, 77, 77, 77]);
  });

  test("con el record completo no se registra nada en el log del servidor", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio();
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(warn).toHaveBeenCalledTimes(0);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("con consentimiento y record NO confiable (RS-BE-21)", () => {
  test("no se toca ninguna de las tres tablas nuevas", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: recordSinPie });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.escrituras).toEqual([]);
      expect(a.orden).toEqual(ORDEN_SIN_RECORD);
    } finally {
      warn.mockRestore();
    }
  });

  test("el motivo va al log del servidor, sin datos del alumno", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: recordSinPie });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe("[portal-sync] récord no confiable:");
      expect(warn.mock.calls[0]?.[1]).toBe("pie ausente o ilegible");
      // El repo es público y esto va a los logs de Vercel: ni código ni notas.
      expect(String(warn.mock.calls[0]?.[1])).not.toContain("20230001");
    } finally {
      warn.mockRestore();
    }
  });

  test("una pagina sin filas tambien registra el motivo en el log", async () => {
    // El caso más grave de RS-BE-21: sesión caída o página de error con HTTP
    // 200. El alumno recibe su PARSER_FAILED, pero el motivo de la regla de
    // confianza tiene que quedar igual en el log del servidor.
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: "<html></html>" });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.escrituras).toEqual([]);
      expect(warn.mock.calls[0]?.[0]).toBe("[portal-sync] récord no confiable:");
      expect(warn.mock.calls[0]?.[1]).toBe("tabla del récord ausente o con cabecera distinta");
    } finally {
      warn.mockRestore();
    }
  });

  test("el alumno no recibe ningun aviso nuevo", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sin = armarServicio({ record: recordSinPie });
      const rSin = await sin.service.importFromPortal(3, 7, { cookies });
      const con = armarServicio({ record: recordSinPie });
      const rCon = await con.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(rCon.warnings).toEqual(rSin.warnings);
    } finally {
      warn.mockRestore();
    }
  });

  test("el resto de la importacion sigue igual que hoy", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ record: recordSinPie });
      const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(r.period.code).toBe("2026-2");
      expect(r.identity.portalCode).toBe("20230001");
      expect(r.summary.enrollmentsUpserted).toBe(2);
      expect(a.estaConfirmado()).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("informacion academica incompleta (RS-BE-24)", () => {
  test("los campos que no se leyeron van al log del servidor", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const a = armarServicio({ layout: layoutGeneralRota });
      await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe("[portal-sync] información académica incompleta:");
      expect(warn.mock.calls[0]?.[1]).toBe("general");
    } finally {
      warn.mockRestore();
    }
  });
});
```

**1.c — `test/HU34_jeff/record-persistence.test.ts`** (ampliar; lo creó la Tarea 5 con las pruebas de SQL del repositorio). Dos bloques:

**Bloque A — imports.** Agregar **inmediatamente después del último `import` del archivo**. Casi todos los nombres van **con alias** a propósito: la Tarea 5 importa en ese mismo archivo `PortalSyncRepository` (la clase), y muy probablemente `RecordRow`, `AcademicGeneral` y `AcademicPeriodBlock` para armar sus payloads; un segundo import con el mismo nombre sería un identificador duplicado. La única excepción es `EMPTY_GENERAL`, que va **sin alias**: la Tarea 5 no lo importa, y el alias obvio —`GENERAL_VACIO`— ya existe en este archivo como `const` de módulo (Tarea 5, Paso 1a), así que aliasearlo así daría `SyntaxError: Cannot declare a variable twice: 'GENERAL_VACIO'` y tumbaría las 25 pruebas del archivo antes de correr ninguna. Los nombres de módulo que dejó la Tarea 5 son `fakeTx`, `repo`, `norm`, `FILAS`, `GENERAL`, `GENERAL_VACIO`, `PERIODO` y `FECHA`: `EMPTY_GENERAL` no choca con ninguno. **No** repitas el import de `bun:test`: `describe`, `expect` y `test` ya están (y este bloque no usa `spyOn`).

```ts
// ── Tarea 6: las tres escrituras vistas desde el service (RS-BE-22, RS-BE-25) ──
// Alias en los nombres que ya usa este archivo para las pruebas de SQL del
// repositorio. `EMPTY_GENERAL` va sin alias: `GENERAL_VACIO` ya es una const
// de módulo acá (Tarea 5) y reusar ese nombre sería declararlo dos veces.
import { PortalSyncService as ServicioPortalSync } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { PortalSyncRepository as RepositorioPortalSync } from "../../src/modules/portal-sync/portal-sync.repository.js";
import type { PortalClient as ClientePortal } from "../../src/services/portal.client.js";
import { EMPTY_GENERAL } from "../../src/modules/portal-sync/parsers/info-academica.js";
import type {
  AcademicGeneral as GeneralAcademico,
  AcademicPeriodBlock as BloquePeriodo,
  RecordRow as FilaRecord,
} from "../../src/modules/portal-sync/portal-sync.types.js";
```

**Bloque B — fixtures, armado y pruebas.** Agregar **al final del archivo**, después del último `describe`:

```ts
// ── Nivel service: qué reciben exactamente los métodos de la Tarea 5 ──────────
// Fixtures INVENTADOS de HU34 (alumno sintético 20230001). Los de HU31 traen
// datos reales y no se usan acá.
const recordHU34 = await Bun.file("test/HU34_jeff/fixtures/record.html").text();
const layoutHU34Base = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();
const matriculaHU34 = await Bun.file("test/HU34_jeff/fixtures/matricula.html").text();

// El rótulo del ciclo vigente no está en el fixture de layout (es de la Tarea 3):
// sin él `parseCicloActivo` aborta con 502.
const layoutHU34 = layoutHU34Base.replace(
  "</body>", '<span class="PortalChannelText">CICLO: 2026-2</span></body>',
);
const cookiesHU34 = { JSESSIONID: "a", LtpaToken2: "b" };

/** Las seis filas del fixture, en el orden del documento. */
const RECORD_ESPERADO: FilaRecord[] = [
  {
    periodCode: "2023-1", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA",
    attempt: 1, credits: 4, grade: 8, sectionCode: "101", gradeRaw: "08", observation: null,
  },
  {
    periodCode: "2023-1", courseCode: "4901", courseName: "LENGUAJE DE PRUEBA",
    attempt: 1, credits: 3, grade: 14, sectionCode: "102", gradeRaw: "14", observation: null,
  },
  {
    periodCode: "2023-2", courseCode: "659001", courseName: "MATEMÁTICA DE PRUEBA",
    attempt: 2, credits: 4, grade: 12, sectionCode: "201", gradeRaw: "12", observation: null,
  },
  {
    periodCode: "2023-2", courseCode: "659002", courseName: "TALLER DE PRUEBA",
    attempt: 1, credits: 1.5, grade: 17, sectionCode: "917", gradeRaw: "17",
    observation: "OBSERVACIÓN DE PRUEBA",
  },
  {
    periodCode: "2026-2", courseCode: "659003", courseName: "CURSO EN CURSO UNO",
    attempt: 1, credits: 3, grade: null, sectionCode: "301", gradeRaw: null, observation: null,
  },
  {
    periodCode: "2026-2", courseCode: "659004", courseName: "CURSO EN CURSO DOS",
    attempt: 1, credits: 4, grade: null, sectionCode: "1302", gradeRaw: null, observation: null,
  },
];

const GENERAL_ESPERADO: GeneralAcademico = {
  ppa: 14.25,
  relativePosition: "TERCIO SUPERIOR",
  convalidated: { courses: 2, credits: 6 },
  approved: { courses: 30, credits: 100 },
  creditsAccumulated: 106,
  creditsRequired: 210,
};

const PERIODO_ESPERADO: BloquePeriodo = {
  periodCode: "2026-1",
  average: 13.25,
  relativePosition: "MEDIO SUPERIOR",
  level: 4,
  convalidated: { courses: 1, credits: 3 },
  enrolled: { courses: 7, credits: 23 },
  approved: { courses: 5, credits: 16 },
  failed: { courses: 2, credits: 7 },
};

type EscrituraSvc =
  | { metodo: "lockAcademicRecord"; studentId: number }
  | { metodo: "replaceRecordEntries"; studentId: number; rows: FilaRecord[] }
  | { metodo: "upsertAcademicSnapshot"; studentId: number; general: GeneralAcademico; syncedAt: Date }
  | { metodo: "replacePeriodSummaries"; studentId: number; periods: BloquePeriodo[] };

/** La escritura del método pedido, ya estrechada, o falla el test nombrándolo. */
function escrituraSvc<T extends EscrituraSvc["metodo"]>(
  todas: EscrituraSvc[], metodo: T,
): Extract<EscrituraSvc, { metodo: T }> {
  const hallada = todas.find((e) => e.metodo === metodo);
  if (!hallada) throw new Error(`no se llamó a ${metodo}`);
  return hallada as Extract<EscrituraSvc, { metodo: T }>;
}

/** Mismo armado que test/HU34_jeff/consent-gate.test.ts; acá solo interesan los
 *  argumentos que reciben los métodos nuevos, no el orden. */
const armarServicioHU34 = (opts: { layout?: string } = {}) => {
  const escrituras: EscrituraSvc[] = [];

  const client = {
    fetchPage: async () => opts.layout ?? layoutHU34,
    fetchAll: async () => ({ matricula: matriculaHU34, record: recordHU34 }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as ClientePortal;

  const repo = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => "20230001",
    findStudent: async () => ({
      id: 7, userId: 3, careerId: 1, curriculumId: 1,
      currentLevel: null, careerName: "INGENIERÍA INDUSTRIAL",
    }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({
      id: 2, code: "2026-2", created: false, datesDefaulted: false,
      startDate: "2026-08-24", endDate: "2026-12-14",
    }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      new Map(codes.map((c, i) => [c, 60 + i])),
    findEquivalentCurriculumCourseIds: async () => new Map<string, number>(),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => items.length,
    deleteImpedimentAlert: async () => 0,
    findCycleCoverage: async () => [],
    updateStudentLevel: async () => {},
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    lockAcademicRecord: async (_tx: unknown, studentId: number) => {
      escrituras.push({ metodo: "lockAcademicRecord", studentId });
    },
    replaceRecordEntries: async (_tx: unknown, studentId: number, rows: FilaRecord[]) => {
      escrituras.push({ metodo: "replaceRecordEntries", studentId, rows });
      return rows.length;
    },
    upsertAcademicSnapshot: async (
      _tx: unknown, studentId: number, general: GeneralAcademico, syncedAt: Date,
    ) => {
      escrituras.push({ metodo: "upsertAcademicSnapshot", studentId, general, syncedAt });
    },
    replacePeriodSummaries: async (
      _tx: unknown, studentId: number, periods: BloquePeriodo[],
    ) => {
      escrituras.push({ metodo: "replacePeriodSummaries", studentId, periods });
      return periods.length;
    },
  } as unknown as RepositorioPortalSync;

  return { service: new ServicioPortalSync(repo, client), escrituras };
};

describe("la importacion con consentimiento guarda la copia del record (RS-BE-22)", () => {
  test("replaceRecordEntries recibe las seis filas del fixture, sin redondear los creditos", async () => {
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    const e = escrituraSvc(a.escrituras, "replaceRecordEntries");
    expect(e.rows).toEqual(RECORD_ESPERADO);
    expect(e.rows.map((f) => f.credits)).toContain(1.5);
    expect(e.studentId).toBe(7);
  });

  test("las filas en curso van con grade y gradeRaw en null, nunca en cadena vacia", async () => {
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    const enCurso = escrituraSvc(a.escrituras, "replaceRecordEntries")
      .rows.filter((f) => f.periodCode === "2026-2");
    expect(enCurso).toHaveLength(2);
    expect(enCurso.map((f) => f.grade)).toEqual([null, null]);
    expect(enCurso.map((f) => f.gradeRaw)).toEqual([null, null]);
  });
});

describe("la importacion con consentimiento guarda la foto y el resumen (RS-BE-25)", () => {
  test("upsertAcademicSnapshot recibe la informacion general del layout y la fecha de la importacion", async () => {
    const antes = Date.now();
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    const e = escrituraSvc(a.escrituras, "upsertAcademicSnapshot");
    expect(e.general).toEqual(GENERAL_ESPERADO);
    expect(e.syncedAt).toBeInstanceOf(Date);
    expect(e.syncedAt.getTime()).toBeGreaterThanOrEqual(antes);
    expect(e.syncedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test("replacePeriodSummaries recibe el unico bloque por periodo del layout", async () => {
    const a = armarServicioHU34();
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    expect(escrituraSvc(a.escrituras, "replacePeriodSummaries").periods).toEqual([PERIODO_ESPERADO]);
  });

  test("un layout sin bloque por periodo deja el resumen vacio, no lo inventa", async () => {
    const sinPeriodo = layoutHU34.replace(
      "- Informaci&oacute;n por Per&iacute;odo", "- Otra secci&oacute;n",
    );
    const a = armarServicioHU34({ layout: sinPeriodo });
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    expect(escrituraSvc(a.escrituras, "replacePeriodSummaries").periods).toEqual([]);
    // La copia del récord se guarda igual: no depende del layout.
    expect(escrituraSvc(a.escrituras, "replaceRecordEntries").rows).toHaveLength(6);
  });

  test("un bloque general ilegible guarda la foto vacia, nunca ceros", async () => {
    const generalRota = layoutHU34.replace(
      'size="1">Cr&eacute;ditos Acumulados</font>',
      'size="1">Cr&eacute;ditos Totales</font>',
    );
    const a = armarServicioHU34({ layout: generalRota });
    await a.service.importFromPortal(3, 7, { cookies: cookiesHU34, consent: true });
    // Contra el `EMPTY_GENERAL` real del parser, no contra la copia literal que
    // la Tarea 5 dejó en este archivo como `GENERAL_VACIO`.
    expect(escrituraSvc(a.escrituras, "upsertAcademicSnapshot").general).toEqual(EMPTY_GENERAL);
  });
});
```

Notas para el ejecutor sobre estas dos pruebas:
- Los tres fixtures se abren con ruta relativa a la raíz del repo, como el resto de la suite: por eso todos los comandos se corren desde la raíz del worktree.
- `bun test` **no** hace chequeo de tipos (transpila y descarta los tipos), y `tsc` solo compila `src/` (`tsconfig.json`, `"include": ["src/**/*"]`). Por eso, en el Paso 2, `{ cookies, consent: true }` corre sin problema aunque la firma de `importFromPortal` todavía no tenga `consent`: los fallos que se esperan son de aserción, no de compilación. No "arregles" el test por eso.
- Las pruebas de este paso **no** necesitan `mock.module("../../src/db/index.js", …)`: importar `PortalSyncService` carga `src/db/index.ts`, pero su cliente `postgres` es perezoso y no conecta (es lo que ya hace `test/HU31_jeff/service.import.test.ts`). El prefijo `DATABASE_URL=…` del comando se usa igual, siempre.
- Los `spyOn(console, "warn")` de `consent-gate.test.ts` van en `try`/`finally` con `mockRestore()`: sin eso, un fallo dejaría `console.warn` silenciado para el resto del archivo.
- En `record-persistence.test.ts` no se espía `console` a propósito: las dos pruebas con el layout alterado imprimirán `[portal-sync] información académica incompleta: period` y `…: general` una vez cada una. Es ruido esperado del Paso 3, no un fallo.
- Si el primer `describe` (`fixtures sinteticos de HU34`) falla, el problema está en un fixture, no en el código: corrige el fixture, no la prueba.

- [ ] **Paso 2: Correr la prueba y ver que falla**

Primero las precondiciones (Tareas 1, 2, 3 y 5 commiteadas). `grep -c` sale con código 1 cuando no encuentra nada, así que la cadena se corta en el primer faltante y el número que imprimió antes dice hasta dónde llegó:

```bash
cd . && grep -c "export const parseRecordPage" src/modules/portal-sync/parsers/record.ts && grep -c "export const evaluateRecordTrust" src/modules/academic-record/academic-record.logic.ts && grep -c "export const EMPTY_GENERAL" src/modules/portal-sync/parsers/info-academica.ts && grep -c "lockAcademicRecord" src/modules/portal-sync/portal-sync.repository.ts && ls test/HU34_jeff/fixtures/record.html test/HU34_jeff/fixtures/layout.html test/HU34_jeff/record-persistence.test.ts
```

Esperado: `1`, `1`, `1`, un número ≥ 1, y los tres archivos listados. Si algo sale `0` o falta, PARAR y completar la tarea correspondiente (1, 2, 3 o 5) antes de seguir.

Después, las dos pruebas:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/consent-gate.test.ts test/HU34_jeff/record-persistence.test.ts
```

Esperado: FAIL. `consent-gate.test.ts` tiene 20 pruebas y da **7 fallos** de aserción (los otros 13 pasan: son los que fijan que sin consentimiento nada cambia, y hoy nada cambia nunca):

```
(fail) importSchema con consent (RS-BE-29) > rechaza un consent que no es booleano
error: expect(received).toBe(expected)
Expected: false
Received: true

(fail) con consentimiento y record de confianza (RS-BE-22, RS-BE-25) > el candado va primero y las tres escrituras despues del progreso
error: expect(received).toEqual(expected)
  Expected: ["lockAcademicRecord", "upsertPeriod", "upsertProgressBatch", "replaceRecordEntries", "upsertAcademicSnapshot", "replacePeriodSummaries"]
  Received: ["upsertPeriod", "upsertProgressBatch"]

(fail) con consentimiento y record de confianza (RS-BE-22, RS-BE-25) > las cuatro llamadas reciben el studentId del token
(fail) con consentimiento y record de confianza (RS-BE-22, RS-BE-25) > en el registro reciben el id que devolvio provision, nunca 0
(fail) con consentimiento y record NO confiable (RS-BE-21) > el motivo va al log del servidor, sin datos del alumno
error: expect(received).toHaveBeenCalledTimes(expected)
Expected number of calls: 1
Received number of calls: 0

(fail) con consentimiento y record NO confiable (RS-BE-21) > una pagina sin filas tambien registra el motivo en el log
error: expect(received).toBe(expected)
Expected: "[portal-sync] récord no confiable:"
Received: undefined

(fail) informacion academica incompleta (RS-BE-24) > los campos que no se leyeron van al log del servidor
```

Y en `record-persistence.test.ts`, **6 fallos nuevos** (2 del primer `describe` agregado y 4 del segundo; los de la Tarea 5 siguen en verde), todos por el mismo motivo, que es el correcto: el service nunca llama a los métodos:

```
error: no se llamó a replaceRecordEntries
error: no se llamó a upsertAcademicSnapshot
error: no se llamó a replacePeriodSummaries
```

Lo que **no** vale: un fallo al cargar el módulo (`SyntaxError: Export named … not found`) — eso significa que falta una tarea previa —, ni un `502 PORTAL_UNAVAILABLE` o un `422 PORTAL_IDENTITY_UNVERIFIABLE` lanzado desde `importFromPortal`: eso sería un fixture mal armado (falta el rótulo `CICLO: 2026-2` en el layout, o la fila de identidad de `matricula.html`), no el comportamiento que se está midiendo.

- [ ] **Paso 3: Implementación mínima**

**3.a — `src/modules/portal-sync/portal-sync.schemas.ts`.**

Reemplazar esto (líneas 36-39):

```ts
export const importSchema = z.object({
  cookies: cookiesObject.optional(),
  credentials: credentialsObject.optional(),
}).refine(
```

por esto:

```ts
export const importSchema = z.object({
  cookies: cookiesObject.optional(),
  credentials: credentialsObject.optional(),
  /**
   * RS-BE-29. `true` solo si el alumno aceptó la pantalla de consentimiento del
   * récord académico. Es OPCIONAL a propósito: las apps ya instaladas no tienen
   * esa pantalla y su importación tiene que seguir corriendo igual que hoy.
   *
   * Va DENTRO del `z.object` y antes del `.refine`: después, `importSchema` ya
   * es un `ZodEffects` (zod 3) y no acepta claves nuevas. Tipado como booleano y
   * no como `unknown` para que un `"si"` se rechace con 400 en vez de descartarse
   * en silencio y dejar al alumno creyendo que aceptó.
   */
  consent: z.boolean().optional(),
}).refine(
```

**3.b — `src/modules/portal-sync/portal-sync.controller.ts`.**

Reemplazar esto (líneas 20-27):

```ts
  async importFromPortal(c: Context) {
    // El body NUNCA se registra en logs: lleva cookies de sesión del portal o,
    // en la variante con credenciales, la contraseña de miUlima del alumno.
    const { cookies, credentials } = await validateJson(c, importSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    return c.json(await this.service.importFromPortal(userId, studentId, { cookies, credentials }));
  }
```

por esto:

```ts
  async importFromPortal(c: Context) {
    // El body NUNCA se registra en logs: lleva cookies de sesión del portal o,
    // en la variante con credenciales, la contraseña de miUlima del alumno.
    //
    // `consent` (RS-BE-29) viaja en el body y no en un header ni en la query:
    // es parte de la petición que el alumno acaba de autorizar en la pantalla de
    // consentimiento, y así queda validado por el mismo esquema que el resto.
    // Se normaliza a booleano acá: `undefined` (apps viejas) y `false` son lo
    // mismo para el service, que solo entiende "aceptó" o "no aceptó".
    const { cookies, credentials, consent } = await validateJson(c, importSchema);
    const studentId = this.requireStudentId(c);
    const userId = Number(c.get("userId"));
    return c.json(await this.service.importFromPortal(
      userId, studentId, { cookies, credentials, consent: consent === true },
    ));
  }
```

**3.c — `src/modules/portal-sync/portal-sync.service.ts`, imports.**

Reemplazar esto (líneas 12-16):

```ts
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseInfoAcademica, parseRecordAcademico, parseSyllabusEntry,
  parseAulas, parseDelegados, parseAsistenciaCurso,
} from "./parsers/index.js";
```

por esto:

```ts
import {
  parseAulaVirtual, parseCicloActivo, parseConsolidadoMatricula, parseHorario,
  parseInfoAcademica, parseSyllabusEntry,
  parseAulas, parseDelegados, parseAsistenciaCurso,
} from "./parsers/index.js";
// `parseRecordPage`, `recordRows` y `EMPTY_GENERAL` NO están en el barrel
// `./parsers/index.js`, que no se toca: `scripts/verificar-readme.py:68` cuenta
// sus `parse[A-Z]\w*` y el README cita esa cifra. Se importan del módulo concreto.
// `parseRecordAcademico` sale de la lista de arriba porque deja de usarse acá
// (`noUnusedLocals` rompería el build); sigue exportado para quien lo necesite.
import { parseRecordPage, recordRows } from "./parsers/record.js";
import { EMPTY_GENERAL } from "./parsers/info-academica.js";
import { evaluateRecordTrust } from "../academic-record/academic-record.logic.js";
```

**3.d — `portal-sync.service.ts`, firma de `importFromPortal`.**

Reemplazar esto (líneas 114-116):

```ts
  async importFromPortal(
    userId: number, studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string } },
```

por esto:

```ts
  async importFromPortal(
    userId: number, studentId: number,
    entrada: {
      cookies?: PortalCookies;
      credentials?: { password: string; passcode: string };
      /** RS-BE-29: `true` solo si el alumno aceptó la pantalla de consentimiento.
       *  Opcional para que `auth.service.ts` (registro) y las apps viejas sigan
       *  llamando igual que siempre. */
      consent?: boolean;
    },
```

**3.e — `portal-sync.service.ts`, llamada a `runImport`.**

Reemplazar esto (línea 137):

```ts
      return await this.runImport(userId, studentId, sesion, provision, validate);
```

por esto:

```ts
      return await this.runImport(userId, studentId, sesion, entrada.consent === true, provision, validate);
```

**3.f — `portal-sync.service.ts`, firma de `runImport`.**

Reemplazar esto (líneas 143-146):

```ts
  private async runImport(
    userId: number, studentId: number, cookies: PortalCookies,
    provision?: ProvisionFn, validate?: ValidateFn,
  ): Promise<ImportResult> {
```

por esto:

```ts
  private async runImport(
    userId: number, studentId: number, cookies: PortalCookies, consent: boolean,
    provision?: ProvisionFn, validate?: ValidateFn,
  ): Promise<ImportResult> {
```

**3.g — `portal-sync.service.ts`, lectura del récord y regla de confianza.**

Reemplazar esto (líneas 181-183):

```ts
    const rec = parseRecordAcademico(pages.record);
    if (!rec.ok) warnings.push({ code: "PARSER_FAILED", block: "record", message: rec.reason });
    const info = parseInfoAcademica(layout);
```

por esto:

```ts
    // RS-BE-19/RS-BE-20: se lee la PÁGINA entera (tabla del récord, pie y filas
    // descartadas) y recién después se la reduce a las filas, que es lo único
    // que el resto de la importación usaba hasta hoy. `rec` conserva su forma y
    // su motivo de fallo exactos, así que nada de lo que sigue cambia.
    const recordPage = parseRecordPage(pages.record);
    const rec = recordRows(recordPage);
    if (!rec.ok) warnings.push({ code: "PARSER_FAILED", block: "record", message: rec.reason });
    const info = parseInfoAcademica(layout);

    // RS-BE-21: la confianza se evalúa SIEMPRE, con o sin consentimiento, y su
    // motivo va al log del servidor. El alumno NO recibe un aviso nuevo: no hay
    // nada que pueda hacer al respecto, y el resto de la importación —horario,
    // matrícula, malla y enrollment.final_grade— sigue exactamente igual.
    //
    // El log se emite SIEMPRE que el récord no sea de confianza, sin condición:
    // RS-BE-21 no la pone, y el caso más grave —la página no trae ninguna fila
    // legible: sesión caída, página de error con HTTP 200, récord truncado— es
    // justamente el que no puede quedar sin traza. El `PARSER_FAILED` no lo
    // sustituye: es un aviso al ALUMNO en la respuesta, no un registro en el
    // servidor, y no lleva el motivo de la regla de confianza.
    // Nunca lleva notas, nombres ni el código del alumno: este repo es público y
    // estas líneas terminan en los logs de Vercel.
    const confianza = evaluateRecordTrust(recordPage);
    if (!confianza.ok) console.warn("[portal-sync] récord no confiable:", confianza.reason);
    if (info.ok && info.data.unreadable.length) {
      console.warn("[portal-sync] información académica incompleta:", info.data.unreadable.join(", "));
    }
    // RS-BE-22/RS-BE-25/RS-BE-29: la ÚNICA condición para tocar las tres tablas
    // nuevas. Sin consentimiento o sin confianza, esta importación corre como la
    // de hoy y no llama a ninguno de los métodos nuevos del repositorio.
    const guardarRecord = consent && confianza.ok;
```

**3.h — `portal-sync.service.ts`, el candado.**

Reemplazar esto (líneas 400-402):

```ts
        student = found;
      }
      if (careerNamesDiffer(mat.data.careerName, student.careerName)) {
```

por esto:

```ts
        student = found;
      }
      // RS-BE-22: el candado va PRIMERO, y este es el primer punto donde
      // `studentId` ya es el definitivo en los dos modos (en el registro vale 0
      // hasta que `provision` devuelve el perfil, unas líneas más arriba).
      // Serializa dos importaciones del mismo alumno: el cliente corta a los
      // 90 s y el servidor sigue hasta 300 s, así que el alumno puede reintentar
      // mientras la primera todavía corre. Es `pg_advisory_xact_lock`: se suelta
      // solo cuando la transacción termina, confirme o revierta.
      if (guardarRecord) await this.repository.lockAcademicRecord(tx, studentId);
      if (careerNamesDiffer(mat.data.careerName, student.careerName)) {
```

**3.i — `portal-sync.service.ts`, la copia, la foto y el resumen.**

Reemplazar esto (líneas 649-651; el `}` es el que cierra el bloque `if (rec.ok) { … }` del progreso):

```ts
      }

      // Nivel del alumno: el ciclo del curso obligatorio más bajo que aún le
```

por esto:

```ts
      }

      // RS-BE-22 y RS-BE-25: la copia del récord, la foto acumulada y el resumen
      // por ciclo. Van DENTRO de la misma transacción y bajo el mismo candado de
      // arriba, así que si `validate` lanza (registro sin matrícula del ciclo
      // activo) se revierten con todo lo demás, y una importación concurrente del
      // mismo alumno espera en vez de pisar la copia a medio reemplazar.
      //
      // `rec.ok` ya está implícito en `guardarRecord` —un récord sin filas no es
      // de confianza—, pero el ternario deja explícito que acá nunca se escribe
      // una copia a medias. Con el layout ilegible se guarda `EMPTY_GENERAL`:
      // todo en null, jamás ceros inventados.
      if (guardarRecord) {
        await this.repository.replaceRecordEntries(tx, studentId, rec.ok ? rec.data : []);
        await this.repository.upsertAcademicSnapshot(
          tx, studentId, info.ok ? info.data.general : EMPTY_GENERAL, new Date(),
        );
        await this.repository.replacePeriodSummaries(
          tx, studentId, info.ok && info.data.period ? [info.data.period] : [],
        );
      }

      // Nivel del alumno: el ciclo del curso obligatorio más bajo que aún le
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/consent-gate.test.ts test/HU34_jeff/record-persistence.test.ts
```

Esperado: PASS, `0 fail`. `consent-gate.test.ts` aporta `20 pass`; `record-persistence.test.ts` aporta los de la Tarea 5 más `6 pass` nuevos. En la salida aparecen dos líneas `[portal-sync] información académica incompleta: …` de las pruebas de layout alterado de `record-persistence.test.ts`: es el ruido esperado que se anunció en el Paso 1, no un fallo.

Y la carpeta HU34 completa, que a esta altura ya tiene las pruebas de las Tareas 1 a 5:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff
```

Esperado: `0 fail`.

- [ ] **Paso 5: Regresión de HU31 y HU33 (el gate de consentimiento, probado por omisión)**

Los dobles de repositorio de `test/HU31_jeff` y `test/HU33_jeff` **no tienen** los métodos nuevos (comprobado: `service.import.test.ts:30-76` y `service.registro-import.test.ts:66-111`). Si el camino sin `consent` llamara a alguno, esas pruebas reventarían con `… is not a function`: correrlas completas **es** la prueba de que el gate cierra.

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU31_jeff test/HU33_jeff
```

Esperado: `0 fail`.

**Ruido esperado, que no es un fallo:** la salida ahora puede imprimir dos clases de línea nuevas en las pruebas de service de HU31 y HU33:
- `[portal-sync] récord no confiable: …` — correcto: sus fixtures de récord (el de HU31 y el `recordCon` sintético de `service.equivalencias.test.ts`) no cumplen la regla de confianza, y el log se emite con o sin consentimiento por diseño (RS-BE-21).
- `[portal-sync] información académica incompleta: …` — si el `layout.html` de HU31 tiene algún campo que el parser de la Tarea 3 no logra leer. También es por diseño (RS-BE-24).

Ninguna prueba de esas dos carpetas espía `console` (comprobado con `grep -rn "console" test/HU31_jeff test/HU33_jeff`, que no devuelve nada), así que ninguna falla por eso. Si alguna prueba de HU31/HU33 **sí** falla, no es por ruido: revisa que el camino sin consentimiento no esté llamando a un método nuevo.

- [ ] **Paso 6: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ningún error y exit 0. Dos fallos previsibles y qué significan:
- `'parseRecordAcademico' is declared but its value is never read` → quedó en el import del barrel (paso 3.c).
- `Argument of type '{ cookies: PortalCookies | undefined; ... }' is not assignable...` en `src/modules/portal-sync/index.ts:20` (el `authService.setRegistrar(portalSyncService)`) → no debería ocurrir: `consent` es opcional y `Registrar.importFromPortal` (`auth.service.ts:54-62`) sigue siendo asignable porque su `entrada` más estrecha entra en la más ancha. Si aparece, PARAR: el tipo de `entrada` se escribió mal, no hay que tocar `auth.service.ts` (eso es la Tarea 8).

- [ ] **Paso 7: Documentación — `docs/specs/api-contracts.md`**

Reemplazar esto (línea 608):

```markdown
  - Body: `{ "cookies": { "JSESSIONID": string, "LtpaToken2": string, "LtpaToken": string|null } }` (cookies de `webaloe.ulima.edu.pe`; nunca se persisten ni se registran en logs)
```

por esto:

```markdown
  - Body: `{ "cookies": { "JSESSIONID": string, "LtpaToken2": string, "LtpaToken": string|null } }` **o** `{ "credentials": { "password": string, "passcode": string } }`, exactamente uno de los dos (cookies de `webaloe.ulima.edu.pe`; nunca se persisten ni se registran en logs), más el campo opcional `"consent": true`.
  - `consent` (RS-BE-29 de `specs/features/academic-record/academic-record.spec.md`): la app lo manda después de que el alumno acepta la pantalla de consentimiento del récord. Con `consent: true` **y** un récord de confianza, la importación guarda además la copia del récord, la foto acumulada y el resumen por ciclo. Sin él —es lo que mandan las apps ya instaladas— la importación corre igual que siempre (horario, matrícula, malla y `enrollment.final_grade`) y no se guarda nada de eso. Cualquier valor que no sea booleano se rechaza con `400 INVALID_REQUEST_BODY`.
```

- [ ] **Paso 8: Documentación — `specs/features/portal-sync/portal-sync.spec.md`**

**8.a — §API Contract Draft.** Reemplazar esto (línea 124):

```markdown
- `POST /portal-sync/import` — body `{ cookies }` **o** `{ credentials }`; response `{ period, identity, summary, warnings }`.
```

por esto:

```markdown
- `POST /portal-sync/import` — body `{ cookies }` **o** `{ credentials }`, más el campo opcional `consent` (RS-BE-29 de `../academic-record/academic-record.spec.md`); response `{ period, identity, summary, warnings }`.
```

**8.b — §Login con credenciales.** Reemplazar esto (líneas 150-153):

```markdown
El body de `POST /portal-sync/import` acepta **una de dos formas**, nunca las dos:

- `{ cookies: { JSESSIONID, LtpaToken2, LtpaToken? } }` — la sesión del portal ya la obtuvo el cliente.
- `{ credentials: { password, passcode } }` — el backend hace el login contra miUlima y obtiene la sesión él mismo.
```

por esto:

```markdown
El body de `POST /portal-sync/import` acepta **una de dos formas**, nunca las dos:

- `{ cookies: { JSESSIONID, LtpaToken2, LtpaToken? } }` — la sesión del portal ya la obtuvo el cliente.
- `{ credentials: { password, passcode } }` — el backend hace el login contra miUlima y obtiene la sesión él mismo.

Junto a cualquiera de las dos viaja el campo **opcional** `consent: true` (**RS-BE-29** de `../academic-record/academic-record.spec.md`): el alumno aceptó la pantalla de consentimiento del récord académico. Es ortogonal a la forma de la sesión y no interviene en el login; solo decide si la importación guarda además la copia del récord, la foto acumulada y el resumen por ciclo. Sin él la importación corre igual que hoy.
```

**8.c — §Fuera de alcance explícito.** Reemplazar esto (línea 388 de hoy; 389 con la Tarea 3 hecha):

```markdown
- No se persiste fecha de última sincronización: `needsImport` se deriva de la matrícula en el período activo.
```

por esto:

```markdown
- No se persiste fecha de última sincronización **para esta feature**: `needsImport` se deriva de la matrícula en el período activo. **Enmendado por `../academic-record/academic-record.spec.md` (RS-BE-25)**: la copia del récord sí guarda su `student_academic_snapshot.synced_at`, que es la fecha de la copia visible y **no** interviene en `needsImport` ni en `GET /portal-sync/status`.
```

**8.d — §Privacidad y base legal.** Reemplazar esto (líneas 393-394 de hoy; 394-395 con la Tarea 3 hecha):

```markdown
- Inventario de datos importados: nombre completo, código de alumno, carrera, nivel, cursos, secciones, docentes, horarios, matrícula, notas históricas y estado de impedimento/deuda. Nada más.
- El alumno puede pedir el borrado de lo importado; el procedimiento debe existir antes de publicar la feature (decisión pendiente: si es autoservicio o vía soporte).
```

por esto:

```markdown
- Inventario de datos importados: nombre completo, código de alumno, carrera, nivel, cursos, secciones, docentes, horarios, matrícula, notas históricas y estado de impedimento/deuda. Con `consent: true` (**RS-BE-29**) se agregan, y solo entonces: la copia del récord académico (ciclo, código y nombre del curso, vez, créditos, nota, sección y observación), el promedio ponderado acumulado, la ubicación relativa, los cursos y créditos convalidados y aprobados, los créditos acumulados y requeridos, y el resumen del último ciclo (promedio, ubicación, nivel y cursos y créditos convalidados, matriculados, aprobados y desaprobados). Nada más.
- El alumno puede pedir el borrado de lo importado. Para los datos que agrega `academic-record` el procedimiento es **autoservicio**: `DELETE /academic-record/me` (**RS-BE-27**). Ver la decisión #7 abajo.
```

**8.e — §Decisiones, sacar la #2 de la tabla de "resueltas por diseño".** Reemplazar esto (líneas 423-425 de hoy; 424-426 con la Tarea 3 hecha):

```markdown
| # | Decisión | Resolución |
| --- | --- | --- |
| 2 | PPA y ubicación relativa | **DESCARTADO**: no se extraen ni se guardan. No existe columna y no los consume ninguna pantalla. |
```

por esto:

```markdown
| # | Decisión | Resolución |
| --- | --- | --- |
```

La tabla no queda vacía: abajo siguen las filas #5 y #6.

**8.f — §Decisiones, sacar la #7 de la tabla de pendientes.** Reemplazar esto (líneas 431-433 de hoy; 432-434 con la Tarea 3 hecha):

```markdown
| # | Decisión | Por qué importa |
| --- | --- | --- |
| 7 | Procedimiento de borrado de los datos importados a pedido del alumno | Requisito de la Ley 29733. Debe existir antes de publicar la feature, no antes de implementarla. |
```

por esto:

```markdown
| # | Decisión | Por qué importa |
| --- | --- | --- |
```

La tabla no queda vacía: abajo sigue la fila #10.

**8.g — §Decisiones, la tabla nueva.** Reemplazar esto (línea 436 de hoy; 437 con la Tarea 3 hecha):

```markdown
## Verification
```

por esto:

```markdown
Reabiertas y resueltas por `../academic-record/academic-record.spec.md`, aprobada por el dueño el 2026-09-18:

| # | Decisión | Resolución |
| --- | --- | --- |
| 2 | PPA y ubicación relativa | **REABIERTA y APROBADA (2026-09-18)**: sí se extraen y sí se guardan, con cambio de BD (`student_academic_snapshot` y `student_period_summary`, migración `0011_academic_record.sql`), y los consume la pantalla de récord académico. Solo con `consent: true` y un récord de confianza (RS-BE-24, RS-BE-25, RS-BE-29). |
| 7 | Procedimiento de borrado de los datos importados a pedido del alumno | **RESUELTA (2026-09-18)** a favor del **autoservicio**, para los datos que agrega `academic-record`: `DELETE /academic-record/me` borra la copia del récord, la foto y el resumen del alumno, y no toca `student_course_progress` (RS-BE-27). El resto del inventario de esta spec sigue sin procedimiento de borrado propio. |

## Verification
```

**8.h — §DTO validation.** Reemplazar esto (líneas 406-407 de hoy; 407-408 con la Tarea 3 hecha):

```markdown
- Body de `POST /portal-sync/import`: `cookies.JSESSIONID` y `cookies.LtpaToken2` string 1..4096 obligatorios; `cookies.LtpaToken` opcional. Cualquier otra clave se ignora. El body nunca se registra en logs.
  `[@test] ../../../test/HU31_jeff/schemas.import.test.ts`
```

por esto:

```markdown
- Body de `POST /portal-sync/import`: `cookies.JSESSIONID` y `cookies.LtpaToken2` string 1..4096 obligatorios; `cookies.LtpaToken` opcional; `consent` booleano opcional (RS-BE-29) — un valor que no sea booleano se rechaza con `400`, no se descarta. Cualquier otra clave se ignora. El body nunca se registra en logs.
  `[@test] ../../../test/HU31_jeff/schemas.import.test.ts`
  `[@test] ../../../test/HU34_jeff/consent-gate.test.ts`
```

**8.i — comprobación de los ocho cambios de documentación.** Al final del paso, con 8.a a 8.h ya aplicados:

```bash
cd . && grep -n "consent" specs/features/portal-sync/portal-sync.spec.md docs/specs/api-contracts.md && grep -c "^| 2 |\|^| 5 |\|^| 6 |\|^| 7 |\|^| 10 |" specs/features/portal-sync/portal-sync.spec.md
```

Esperado, en `portal-sync.spec.md`, **seis** líneas: las **cinco nuevas** (§API Contract Draft; el párrafo nuevo de §Login con credenciales; el inventario de §Privacidad; la fila #2 de la tabla nueva de §Decisiones; §DTO validation) y **una que ya estaba** — la de "consentimiento informado" de §Privacidad (línea 392 de hoy): `grep` la trae porque "consentimiento" contiene "consent". En `docs/specs/api-contracts.md`, **dos** líneas (el body y la viñeta de `consent`). Y `5` filas de decisión (#2, #5, #6, #7 y #10, cada una una sola vez): si sale 4, una fila se borró de más; si sale 6, una quedó duplicada.

- [ ] **Paso final: Commit**

```bash
cd . && git add src/modules/portal-sync/portal-sync.schemas.ts src/modules/portal-sync/portal-sync.controller.ts src/modules/portal-sync/portal-sync.service.ts test/HU34_jeff/fixtures/matricula.html test/HU34_jeff/consent-gate.test.ts test/HU34_jeff/record-persistence.test.ts specs/features/portal-sync/portal-sync.spec.md docs/specs/api-contracts.md && git commit -m "feat(academic-record): guarda el récord solo con consentimiento y récord de confianza (RS-BE-21, RS-BE-22, RS-BE-25, RS-BE-29)"
```

Sin trailer `Co-Authored-By`, sin `push` y sin abrir PR.

### Tarea 7: Limpieza de electivos no respaldados (RS-BE-23)

**Archivos:**
- Modificar: `src/modules/portal-sync/portal-sync.types.ts:67` (cierre de `WarningCode`) y `:78-79` (dentro de `ImportSummary`)
- Modificar: `src/modules/portal-sync/portal-sync.service.ts:50` (`emptySummary`), `:640-648` (final del bloque `if (rec.ok)` del progreso) y el import de `academic-record.logic.js` que deja la Tarea 6 (en HEAD, `:12-16` es el bloque de `./parsers/index.js` que esa tarea reemplaza)
- Modificar: `src/modules/academic-record/academic-record.logic.ts` (se agrega al final; hoy termina en `evaluateRecordTrust`)
- Modificar: `docs/specs/api-contracts.md:617`, `:619` y el final del archivo (`:627`)
- Modificar: `specs/features/portal-sync/portal-sync.spec.md:290` (paso 10, "Progreso") y `:227-228` (§Parsers, la viñeta de `parseRecordAcademico`, que es el último pendiente de "Cambios en otras specs")
- Modificar: `test/HU34_jeff/consent-gate.test.ts` (el objeto `repo` de `armarServicio`) y `test/HU34_jeff/record-persistence.test.ts` (el objeto `repo` de `armarServicioHU34`): los dos dobles de repositorio que creó la Tarea 6 necesitan el método nuevo, o toda prueba con `consent: true` revienta. Ver el Paso 1, puntos 1d y 1e.
- Test: `test/HU34_jeff/electives-cleanup.test.ts` (lo creó la Tarea 5; esta tarea le agrega imports arriba y tres `describe` al final)

**Los números de línea son los de HEAD** (commit `d97714f`). Las Tareas 1 y 3 agregan tipos más arriba en `portal-sync.types.ts` y la Tarea 6 agrega líneas más arriba en `portal-sync.service.ts`, así que todo se habrá corrido hacia abajo. Por eso **todos los reemplazos del Paso 3 van por ancla literal, no por número**: las anclas que se citan se copiaron del archivo actual (o, para el import de la lógica, del texto exacto que escribe la Tarea 6) y ninguna tarea anterior las toca.

`specs/features/academic-record/academic-record.spec.md` **no se toca**: ya lista `../../../src/modules/academic-record/**`, `../../../src/modules/portal-sync/portal-sync.service.ts` y `portal-sync.types.ts` en sus `targets` (líneas 5, 8 y 11) y ya enlaza `[@test] ../../../test/HU34_jeff/electives-cleanup.test.ts` bajo RS-BE-23 (línea 198).

Todos los comandos se corren desde la raíz del worktree `.`. Bun no está en el PATH y el prefijo `DATABASE_URL=…` es **obligatorio** en cada comando: bun carga solo el `.env` del worktree, que apunta a la base de PRODUCCIÓN. No abras ni imprimas `.env`. Ninguna prueba de esta tarea abre una conexión (el `tx` es `{}` y `postgres()` no conecta hasta la primera consulta), pero importar el service carga `src/db/index.ts` → `src/config/env.ts`, que exige que `DATABASE_URL` sea una URL válida.

**Interfaces:**

- Consume:
  ```ts
  // Tarea 2 — src/modules/academic-record/academic-record.logic.ts
  export const approvedRows = (rows: readonly RecordRow[]): RecordRow[]   // grade entero 11..20

  // Tarea 1 — src/modules/portal-sync/portal-sync.types.ts
  export interface RecordRow {
    periodCode: string; courseCode: string; courseName: string;
    attempt: number; credits: number; grade: number | null; sectionCode: string;
    gradeRaw: string | null; observation: string | null;
  }

  // Tarea 5 — método de PortalSyncRepository
  async deleteUnbackedElectives(
    tx: Tx, studentId: number, curriculumId: number, backingIds: number[],
  ): Promise<number>   // backingIds vacío → 0 SIN consultar

  // Tarea 6 — src/modules/portal-sync/portal-sync.service.ts
  //   `const guardarRecord = consent && confianza.ok;`  (const local de `runImport`,
  //   visible dentro de la transacción)
  importFromPortal(
    userId: number, studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string }; consent?: boolean },
    provision?: ProvisionFn, validate?: ValidateFn,
  ): Promise<ImportResult>
  // Tarea 6 — fixture de HU34 que esta tarea reutiliza:
  //   test/HU34_jeff/fixtures/matricula.html  (alumno sintético 20230001, ALUMNO DE PRUEBA)
  // Tarea 1 y 3:
  //   test/HU34_jeff/fixtures/record.html, test/HU34_jeff/fixtures/layout.html

  // Repo actual — src/modules/portal-sync/portal-sync.repository.ts:958 y :999
  async findCurriculumCourseIds(
    tx: Tx, curriculumId: number, courseCodes: string[],
  ): Promise<Map<string, number>>
  async findEquivalentCurriculumCourseIds(
    tx: Tx, curriculumId: number, legacyCodes: string[],
  ): Promise<Map<string, number>>

  // Repo actual — src/db/seed/equivalencias.logic.ts:57 (el archivo no tiene ningún import)
  export const SIN_EQUIVALENCIA_CONOCIDA: readonly string[]  // 12 códigos de Estudios Generales
  ```

- Produce (lo consume el service de esta misma tarea; la Tarea 9 amplía el mismo archivo de lógica con `buildAcademicRecordDto`):
  ```ts
  // academic-record.logic.ts
  export const cleanupBlockers = (
    rows: readonly RecordRow[], resolved: ReadonlySet<string>, knownUnmatched: readonly string[],
  ): string[]   // códigos distintos de filas aprobadas (grade 11..20) que no están en resolved ni en knownUnmatched; [] = la limpieza puede correr
  export const progressRemovedMessage = (n: number): string
  //   n === 1 → "Se desmarcó 1 electivo que tu récord no respalda."
  //   n > 1   → `Se desmarcaron ${n} electivos que tu récord no respalda.`
  // types: WarningCode | "PROGRESS_REMOVED"; ImportSummary.progressRemoved: number (0 en emptySummary)
  ```

---

- [ ] **Paso 1: Escribir la prueba que falla**

El archivo `test/HU34_jeff/electives-cleanup.test.ts` ya existe (Tarea 5) con un solo `describe("deleteUnbackedElectives")` de 5 pruebas a nivel repository. Esta tarea le agrega **dos bloques de imports arriba y tres `describe` al final**, sin tocar nada de lo que ya hay.

**1a. Reemplazar la primera línea del archivo** (hace falta `spyOn` para los dos casos que van al log):

```ts
import { describe, expect, test } from "bun:test";
```

por:

```ts
import { describe, expect, spyOn, test } from "bun:test";
```

**1b. Agregar estos imports inmediatamente después de** la línea

```ts
import { PortalSyncRepository } from "../../src/modules/portal-sync/portal-sync.repository.js";
```

(o sea, al final del bloque de imports del archivo):

```ts
import {
  cleanupBlockers,
  progressRemovedMessage,
} from "../../src/modules/academic-record/academic-record.logic.js";
import { PortalSyncService } from "../../src/modules/portal-sync/portal-sync.service.js";
import type { RecordRow } from "../../src/modules/portal-sync/portal-sync.types.js";
import { SIN_EQUIVALENCIA_CONOCIDA } from "../../src/db/seed/equivalencias.logic.js";
import type { PortalClient } from "../../src/services/portal.client.js";
```

**1c. Agregar al FINAL del archivo**, después del `});` que cierra `describe("deleteUnbackedElectives")`, este bloque completo:

```ts

// ─────────────────────────────────────────────────────────────────────────────
// RS-BE-23 a nivel de servicio: cuándo corre la limpieza, con qué conjunto de
// respaldo, cuánto suma y qué avisa. Lo de arriba prueba la SENTENCIA; esto
// prueba la DECISIÓN de ejecutarla, que es donde está el riesgo de borrar de
// más. Todos los datos son inventados: alumno sintético 20230001 (id interno
// 7), malla 1, curriculum_course 61..64 y 71.
// ─────────────────────────────────────────────────────────────────────────────

const layoutBase = await Bun.file("test/HU34_jeff/fixtures/layout.html").text();
// El layout de HU34 trae solo el bloque "Información Académica": no declara el
// ciclo vigente, y sin él `parseCicloActivo` aborta la importación con 502. Se
// agrega acá, igual que en `consent-gate.test.ts` de la Tarea 6 y por la misma
// razón (el fixture es de la Tarea 3 y su prueba fija su contenido). El rótulo
// va en MAYÚSCULAS y con dos puntos, que es la grafía que ese parser exige; el
// "Ciclo 2026-1" del bloque por período es el ciclo ANTERIOR y por eso no lo
// reconoce (parsers/ciclo.ts: la regex va sin flag `i`).
const layout = layoutBase.replace(
  "</body>", '<span class="PortalChannelText">CICLO: 2026-2</span></body>',
);
const matricula = await Bun.file("test/HU34_jeff/fixtures/matricula.html").text();
const record = await Bun.file("test/HU34_jeff/fixtures/record.html").text();
// Código del alumno sintético tal como lo trae el fixture de matrícula.
const CODE_EN_FIXTURE = matricula.match(/\b(\d{8})\b/)![1];
const cookies = { JSESSIONID: "a", LtpaToken2: "b" };

/** Valores del pie del fixture, por posición: COD. CAR. | PROM. POND. |
 *  CRD. CONV. | CRD. APROB. | TOTAL CRD. VÁLIDOS | ASIG. CONV. | ASIG. APR. |
 *  TOTAL ASIG. VÁLIDOS | CRD. DESAP. | ASIG. DESAP. */
const PIE_FIXTURE = ["0001", "11.8000", "0.0", "8.5", "8.5", "0", "3", "3", "4.0", "1"];

/** Reescribe la fila de valores del pie. Una variante que cambia una nota tiene
 *  que ajustar el pie: si no, `evaluateRecordTrust` rechaza el récord y la
 *  limpieza no corre, pero por otra razón que la que se quiere medir. */
const conPie = (html: string, cambios: Record<number, string>): string => {
  const pie = (html.match(/<table[\s\S]*?<\/table>/gi) ?? [])[1] ?? "";
  const valores = PIE_FIXTURE.map((v, i) => cambios[i] ?? v);
  const fila = `<tr>${valores.map((v) => `<td class="text-center">${v}</td>`).join("")}</tr>`;
  return html.replace(pie, () => pie.replace(/<tbody>[\s\S]*<\/tbody>/, () => `<tbody>${fila}</tbody>`));
};

/** Reemplaza literales exigiendo que cada uno aparezca EXACTAMENTE una vez: si
 *  el fixture cambia, la prueba lo dice en vez de medir otra cosa en silencio. */
const unaVez = (html: string, cambios: Array<[string, string]>): string => {
  let out = html;
  for (const [de, a] of cambios) {
    const veces = out.split(de).length - 1;
    if (veces !== 1) throw new Error(`"${de}" aparece ${veces} veces en el fixture; se esperaba 1`);
    out = out.replace(de, () => a);
  }
  return out;
};

/** 4901 pasa de nota 14 a la marca "CONV": deja de ser fila aprobada (el pie
 *  baja a 2 aprobadas y 5.5 créditos) pero su código sigue en el récord, así
 *  que su curriculum_course TIENE que entrar igual en el respaldo. */
const RECORD_CON_MARCA = conPie(
  unaVez(record, [["14", "CONV"]]),
  { 3: "5.5", 4: "5.5", 6: "2", 7: "2" },
);

/** El curso aprobado con 17 pasa a un código que no está en la malla, ni en
 *  `course_equivalence`, ni en SIN_EQUIVALENCIA_CONOCIDA. */
const RECORD_CON_DESCONOCIDO = record.replaceAll("659002", "700001");

/** Mismo curso, pero con un código que SÍ está en SIN_EQUIVALENCIA_CONOCIDA. */
const RECORD_CON_ESTUDIOS_GENERALES = record.replaceAll("659002", "6505");

/** Los tres códigos aprobados pasan a códigos de SIN_EQUIVALENCIA_CONOCIDA:
 *  nada bloquea, pero tampoco hay nada que respalde. */
const RECORD_TODO_SIN_EQUIVALENCIA = record
  .replaceAll("659001", "6506")
  .replaceAll("4901", "6510")
  .replaceAll("659002", "6512");

/** Sin tabla de pie: `evaluateRecordTrust` da "pie ausente o ilegible". */
const RECORD_SIN_PIE = record.replace((record.match(/<table[\s\S]*?<\/table>/gi) ?? [])[1] ?? "", "");

/** Códigos del récord que resuelven por código DIRECTO en la malla. */
const DIRECTOS: Record<string, number> = { "659001": 61, "659002": 62, "659003": 63, "659004": 64 };
/** Códigos que solo resuelven por `course_equivalence`. */
const LEGADOS: Record<string, number> = { "4901": 71 };

const mapa = (tabla: Record<string, number>, codes: string[]) =>
  new Map(codes.filter((c) => c in tabla).map((c) => [c, tabla[c]] as [string, number]));

interface Borrado { studentId: number; curriculumId: number; backingIds: number[] }

/**
 * Service con repositorio y cliente falsos. Mismo armado que
 * el `service.import` de HU31, con dos agregados: los cinco
 * métodos nuevos de la Tarea 5 (para poder afirmar que NO se llaman) y el
 * registro de cada lista de códigos que se consulta contra la malla, que es lo
 * que distingue la consulta de la fase de progreso de la de la limpieza.
 */
const armar = (opciones: {
  record?: string;
  borradas?: number;
  directos?: Record<string, number>;
  legados?: Record<string, number>;
} = {}) => {
  const recordHtml = opciones.record ?? record;
  const borrados: Borrado[] = [];
  const codigosConsultados: string[][] = [];
  const niveles: number[] = [];
  let coberturas = 0;

  const repository = {
    findActivePeriod: async () => ({ id: 1, code: "2026-1" }),
    findUserCode: async () => CODE_EN_FIXTURE,
    findStudent: async () => ({
      id: 7, userId: 3, careerId: 1, curriculumId: 1, currentLevel: null,
      careerName: "INGENIERÍA INDUSTRIAL",
    }),
    countEnrollmentsInPeriod: async () => 0,
    runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    upsertPeriod: async () => ({
      id: 2, code: "2026-2", created: true, datesDefaulted: false,
      startDate: "2026-08-24", endDate: "2026-12-14",
    }),
    ensureAcademicWeeks: async () => {},
    upsertTeacher: async () => ({ id: 10, created: true }),
    upsertCourse: async () => ({ id: 20, created: true }),
    upsertOffering: async () => ({ id: 30, created: true }),
    recomputeOfferingHoursFromSchedule: async () => {},
    upsertSection: async () => ({ id: 40, created: true }),
    upsertScheduleSession: async () => {},
    upsertEnrollment: async () => ({ id: 50, created: true }),
    upsertRepresentativeClaims: async () => ({ upserted: 0, deleted: 0 }),
    promoteClaimIfAny: async () => null,
    deleteClaimsOfInactivePeriods: async () => 0,
    findActiveRepresentativePosition: async () => null,
    withdrawMissingEnrollments: async () => 0,
    countActiveEnrollments: async () => 5,
    findCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) => {
      codigosConsultados.push([...codes]);
      return mapa(opciones.directos ?? DIRECTOS, codes);
    },
    findEquivalentCurriculumCourseIds: async (_tx: unknown, _cid: number, codes: string[]) =>
      mapa(opciones.legados ?? LEGADOS, codes),
    upsertProgressBatch: async (_tx: unknown, _sid: number, _cid: number, items: unknown[]) => items.length,
    deleteImpedimentAlert: async () => 0,
    // Ciclo 1 completo y ciclo 2 a medias → levelFromCoverage da 2.
    findCycleCoverage: async () => {
      coberturas++;
      return [{ cycle: 1, total: 2, approved: 2 }, { cycle: 2, total: 2, approved: 1 }];
    },
    updateStudentLevel: async (_tx: unknown, _sid: number, level: number) => { niveles.push(level); },
    fillFullNameIfEmpty: async () => {},
    upsertSyllabus: async () => ({ id: 999, created: true }),
    // Escrituras del récord (Tarea 5). Inertes acá: lo que se mide es la
    // limpieza, pero tienen que existir porque con consentimiento se llaman.
    lockAcademicRecord: async () => {},
    replaceRecordEntries: async () => 0,
    upsertAcademicSnapshot: async () => {},
    replacePeriodSummaries: async () => 0,
    deleteUnbackedElectives: async (
      _tx: unknown, studentId: number, curriculumId: number, backingIds: number[],
    ) => {
      borrados.push({ studentId, curriculumId, backingIds: [...backingIds] });
      return opciones.borradas ?? 0;
    },
  } as unknown as PortalSyncRepository;

  const client = {
    fetchPage: async () => layout,
    fetchAll: async () => ({ matricula, record: recordHtml }),
    fetchSyllabus: async () => null,
    syllabusBaseUrl: "https://cactus.ulima.edu.pe",
    logout: async () => {},
  } as unknown as PortalClient;

  return {
    service: new PortalSyncService(repository, client),
    borrados, codigosConsultados, niveles, coberturas: () => coberturas,
  };
};

/** Líneas que llegaron a `console.warn`, ya unidas en un solo string. */
const lineasDe = (warn: { mock: { calls: unknown[][] } }): string[] =>
  warn.mock.calls.map((c) => c.map((x) => String(x)).join(" "));

const ordenados = (ids: number[]) => [...ids].sort((a, b) => a - b);

describe("limpieza de electivos en la importacion (RS-BE-23)", () => {
  test("el respaldo lleva los ids de TODAS las filas del record", async () => {
    const a = armar();
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(1);
    expect(a.borrados[0]!.studentId).toBe(7);
    expect(a.borrados[0]!.curriculumId).toBe(1);
    // 61 y 62 vienen de las aprobadas, 63 y 64 de las filas EN CURSO del ciclo
    // 2026-2 (sin nota) y 71 del código legado 4901, que solo resuelve por
    // equivalencia. Ninguna fila queda fuera del respaldo.
    expect(ordenados(a.borrados[0]!.backingIds)).toEqual([61, 62, 63, 64, 71]);
    expect(r.summary.progressRemoved).toBe(0);   // el doble dice que borró 0
  });

  test("el respaldo no reutiliza la resolucion de la fase de progreso", async () => {
    // 4901 llega con la marca "CONV": la fase de progreso lo descarta por no
    // tener nota numérica, pero la limpieza SÍ tiene que resolverlo. Si se
    // reutilizara `ccIdPorCodigo`/`ccIdPorLegado`, su electivo quedaría sin
    // respaldo y esta misma importación lo borraría.
    const a = armar({ record: RECORD_CON_MARCA });
    await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.codigosConsultados).toHaveLength(2);
    expect(a.codigosConsultados[0]).toEqual(["659001", "659002", "659003", "659004"]);
    expect(a.codigosConsultados[1]).toEqual(["659001", "4901", "659002", "659003", "659004"]);
    expect(a.borrados).toHaveLength(1);
    expect(a.borrados[0]!.backingIds).toContain(71);
  });

  test("un codigo aprobado sin resolver bloquea la limpieza y va al log", async () => {
    const a = armar({ record: RECORD_CON_DESCONOCIDO });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.borrados).toHaveLength(0);
      expect(r.summary.progressRemoved).toBe(0);
      expect(r.warnings.some((w) => w.code === "PROGRESS_REMOVED")).toBe(false);
      expect(lineasDe(warn).some((l) =>
        l.includes("[portal-sync] limpieza de electivos omitida: códigos aprobados sin resolver:")
        && l.includes("700001"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  test("un codigo aprobado de SIN_EQUIVALENCIA_CONOCIDA no bloquea la limpieza", async () => {
    expect(SIN_EQUIVALENCIA_CONOCIDA).toContain("6505");
    const a = armar({ record: RECORD_CON_ESTUDIOS_GENERALES, borradas: 1 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(1);
    // 6505 es de Estudios Generales: no bloquea, pero tampoco respalda nada.
    expect(ordenados(a.borrados[0]!.backingIds)).toEqual([61, 63, 64, 71]);
    expect(r.summary.progressRemoved).toBe(1);
  });

  test("con el respaldo vacio NO se llama a deleteUnbackedElectives", async () => {
    // `<> all('{}')` es verdadero para toda fila: sin esta guarda la limpieza
    // borraría TODOS los electivos aprobados del alumno.
    const a = armar({ record: RECORD_TODO_SIN_EQUIVALENCIA, directos: {}, legados: {}, borradas: 9 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(0);
    expect(r.summary.progressRemoved).toBe(0);
  });

  test("sin consent no se consulta ni se borra nada nuevo", async () => {
    const a = armar({ borradas: 3 });
    const r = await a.service.importFromPortal(3, 7, { cookies });
    expect(a.borrados).toHaveLength(0);
    // Una sola consulta de códigos: la de la fase de progreso.
    expect(a.codigosConsultados).toHaveLength(1);
    expect(r.summary.progressRemoved).toBe(0);
    expect(r.warnings.some((w) => w.code === "PROGRESS_REMOVED")).toBe(false);
  });

  test("consent false se comporta igual que no mandarlo", async () => {
    const a = armar({ borradas: 3 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: false });
    expect(a.borrados).toHaveLength(0);
    expect(a.codigosConsultados).toHaveLength(1);
    expect(r.summary.progressRemoved).toBe(0);
  });

  test("con consent pero record no confiable no se consulta ni se borra", async () => {
    const a = armar({ record: RECORD_SIN_PIE, borradas: 3 });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
      expect(a.borrados).toHaveLength(0);
      expect(a.codigosConsultados).toHaveLength(1);
      expect(r.summary.progressRemoved).toBe(0);
      expect(lineasDe(warn).some((l) => l.includes("pie ausente o ilegible"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  test("con 2 filas borradas el summary suma 2 y el warning va en plural", async () => {
    const a = armar({ borradas: 2 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(r.summary.progressRemoved).toBe(2);
    expect(r.warnings).toContainEqual({
      code: "PROGRESS_REMOVED", block: "record",
      message: "Se desmarcaron 2 electivos que tu récord no respalda.",
    });
  });

  test("con 1 fila borrada el warning va en singular", async () => {
    const a = armar({ borradas: 1 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(r.summary.progressRemoved).toBe(1);
    expect(r.warnings).toContainEqual({
      code: "PROGRESS_REMOVED", block: "record",
      message: "Se desmarcó 1 electivo que tu récord no respalda.",
    });
  });

  test("si no se borro nada no hay warning", async () => {
    const a = armar({ borradas: 0 });
    const r = await a.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(a.borrados).toHaveLength(1);
    expect(r.summary.progressRemoved).toBe(0);
    expect(r.warnings.some((w) => w.code === "PROGRESS_REMOVED")).toBe(false);
  });

  test("el nivel del alumno se calcula igual con limpieza y sin ella", async () => {
    // `levelNeverGoesDown` no cambia: `findCycleCoverage` filtra con
    // `cc.category <> 'elective'`, así que la cobertura de ciclos no ve nada de
    // lo que la limpieza borra.
    const sin = armar({ borradas: 2 });
    await sin.service.importFromPortal(3, 7, { cookies });
    const con = armar({ borradas: 2 });
    await con.service.importFromPortal(3, 7, { cookies, consent: true });
    expect(sin.coberturas()).toBe(1);
    expect(con.coberturas()).toBe(1);
    expect(sin.niveles).toEqual([2]);
    expect(con.niveles).toEqual([2]);
  });
});

describe("cleanupBlockers", () => {
  const fila = (courseCode: string, grade: number | null): RecordRow => ({
    periodCode: "2024-1", courseCode, courseName: "CURSO DE PRUEBA", attempt: 1,
    credits: 3, grade, sectionCode: "101",
    gradeRaw: grade === null ? null : String(grade), observation: null,
  });

  test("si toda aprobada resolvio, la limpieza puede correr", () => {
    const rows = [fila("659001", 15), fila("659002", 8), fila("659003", null)];
    expect(cleanupBlockers(rows, new Set(["659001"]), [])).toEqual([]);
  });

  test("una aprobada sin resolver bloquea la limpieza", () => {
    const rows = [fila("659001", 15), fila("659002", 11)];
    expect(cleanupBlockers(rows, new Set(["659001"]), [])).toEqual(["659002"]);
  });

  test("las desaprobadas y las filas sin nota nunca bloquean", () => {
    const rows = [fila("659002", 10), fila("659003", null), fila("659004", 0)];
    expect(cleanupBlockers(rows, new Set(), [])).toEqual([]);
  });

  test("los codigos de knownUnmatched no bloquean", () => {
    const rows = [fila("6505", 14), fila("659002", 14)];
    expect(cleanupBlockers(rows, new Set(), SIN_EQUIVALENCIA_CONOCIDA)).toEqual(["659002"]);
  });

  test("un codigo repetido sale una sola vez y en el orden del record", () => {
    const rows = [fila("659009", 12), fila("659008", 20), fila("659009", 14)];
    expect(cleanupBlockers(rows, new Set(), [])).toEqual(["659009", "659008"]);
  });
});

describe("progressRemovedMessage", () => {
  test("1 va en singular", () => {
    expect(progressRemovedMessage(1)).toBe("Se desmarcó 1 electivo que tu récord no respalda.");
  });

  test("mas de 1 va en plural", () => {
    expect(progressRemovedMessage(2)).toBe("Se desmarcaron 2 electivos que tu récord no respalda.");
    expect(progressRemovedMessage(12)).toBe("Se desmarcaron 12 electivos que tu récord no respalda.");
  });
});
```

Notas para el ejecutor:

- Los fixtures se leen con ruta relativa a la raíz del repo, como el resto de la suite: por eso todos los comandos se corren desde la raíz del worktree.
- Si `unaVez` lanza `"14" aparece N veces en el fixture; se esperaba 1`, **no ajustes la prueba**: revisa que `test/HU34_jeff/fixtures/record.html` sea copia fiel del que escribió la Tarea 1. En ese fixture `"08"`, `"12"`, `"14"` y `"17"` aparecen exactamente una vez cada uno (verificado contra el fixture del plan de la Tarea 1).
- `PortalSyncRepository` ya está importado en el archivo (la Tarea 5 lo usa con `new`): el doble se castea a esa clase con `as unknown as`, sin agregar un segundo import.
- `console.warn` se espía solo en los dos casos que lo usan y se restaura en `finally`: los demás no lo tocan para que un warn inesperado siga saliendo por consola. Ningún otro caso de este archivo llega a `console.warn` (el récord base es de confianza y no tiene bloqueos).
- No hace falta `mock.module("../../src/db/index.js", …)`: el service se importa estáticamente y `postgres()` no conecta hasta la primera consulta, igual que en las pruebas de la Tarea 5 de este mismo archivo. El prefijo `DATABASE_URL=…` sigue siendo obligatorio porque `src/config/env.ts` valida el formato al cargar.
- Ruido esperado en la salida: `parseAulas` no reconoce el layout de HU34, así que cada importación agrega los warnings `PARSER_FAILED` de los bloques `delegado`, `asistencia`, `aula-virtual` y `horario` y un `SYLLABUS_UNAVAILABLE`. Ninguna aserción los mira y ninguno llega a `console.warn`.

**1d. Dar el método nuevo al doble de `test/HU34_jeff/consent-gate.test.ts`.** Sin esto, la limpieza que agrega el Paso 3 tumba las pruebas de RS-BE-22, RS-BE-25 y RS-BE-29 que la Tarea 6 dejó verdes: su `findCurriculumCourseIds` resuelve TODOS los códigos, así que con `consent: true` y el récord de confianza del fixture `cleanupBlockers` devuelve `[]`, el conjunto de respaldo queda con cinco ids y el service llama a un método que el doble no tiene → `TypeError: this.repository.deleteUnbackedElectives is not a function`.

Dentro del objeto `repo` de `armarServicio`, inmediatamente después del cierre `},` de la propiedad `replacePeriodSummaries` y antes de `} as unknown as PortalSyncRepository;`, agregar:

```ts
    // Tarea 7 (RS-BE-23): con consentimiento y récord de confianza la limpieza
    // corre dentro del mismo `if (guardarRecord)`. Inerte acá a propósito: este
    // archivo mide el gate y el ORDEN de las escrituras del récord, no el
    // borrado, que lo mide test/HU34_jeff/electives-cleanup.test.ts.
    deleteUnbackedElectives: async () => 0,
```

**No** hace `orden.push`: `ORDEN_CON_RECORD` no cambia. Y devolver `0` deja `summary.progressRemoved` en 0, así que el `expect(rCon.summary).toEqual(rSin.summary)` de "el alumno no recibe ningun aviso nuevo" sigue pasando.

**1e. Lo mismo en `test/HU34_jeff/record-persistence.test.ts`.** Dentro del objeto `repo` de `armarServicioHU34`, inmediatamente después del cierre `},` de la propiedad `replacePeriodSummaries` y antes de `} as unknown as RepositorioPortalSync;`, agregar:

```ts
    deleteUnbackedElectives: async () => 0,
```

Son las seis pruebas del Bloque B de la Tarea 6, todas con `consent: true`: sin el doble se caen todas con el mismo `TypeError`.

---

- [ ] **Paso 2: Correr la prueba y ver que falla**

Primero, la precondición (Tareas 1, 2, 3, 5 y 6 commiteadas). Sin esto el fallo del Paso 2 es el mismo aunque falte una tarea anterior, porque el import que no resuelve es siempre el primero. Los comandos van separados por `;` y no por `&&` a propósito: `grep -c` devuelve exit 1 cuando cuenta 0 y cortaría la cadena antes de mostrar los demás.

```bash
cd . && grep -c "guardarRecord" src/modules/portal-sync/portal-sync.service.ts; grep -c "deleteUnbackedElectives" src/modules/portal-sync/portal-sync.repository.ts; grep -c "export const approvedRows" src/modules/academic-record/academic-record.logic.ts; ls test/HU34_jeff/fixtures/record.html test/HU34_jeff/fixtures/layout.html test/HU34_jeff/fixtures/matricula.html
```

Esperado: tres números ≥ 1 y las tres rutas. Si alguno sale `0` o aparece `No such file or directory`, falta una tarea anterior: PARAR y completarla.

Después, la prueba:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/electives-cleanup.test.ts
```

Esperado: FAIL. El archivo entero no llega a cargarse, porque el import nombra un export que todavía no existe:

`SyntaxError: Export named 'cleanupBlockers' not found in module './src/modules/academic-record/academic-record.logic.ts'.`

Ninguna prueba corre (`0 pass`), tampoco las 5 de la Tarea 5 que ya estaban verdes en este archivo.

---

- [ ] **Paso 3: Implementación mínima**

Hazlo en este orden: 3a (lógica pura), 3b (tipos), 3c (service). Después de 3a el archivo ya carga y los fallos pasan a ser de comportamiento —`expect(a.borrados).toHaveLength(1)` recibiendo `0`—, que es el fallo que confirma que la prueba mide la limpieza y no un import.

**3a. `src/modules/academic-record/academic-record.logic.ts`.** Agregar al FINAL del archivo, después de `evaluateRecordTrust`, que hoy termina con estas tres líneas:

```ts
  return { ok: true };
};
```

Agregar debajo (no toques el bloque `import type` de arriba: `RecordRow` ya está importado y `approvedRows` vive en este mismo archivo):

```ts

/**
 * RS-BE-23, precondición de la limpieza: códigos DISTINTOS de filas aprobadas
 * que no resolvieron a la malla vigente y que tampoco están en la lista de
 * códigos que se sabe que no respaldan un electivo
 * (`SIN_EQUIVALENCIA_CONOCIDA`, todos de Estudios Generales).
 *
 * Lista vacía = la limpieza puede correr. Con cualquier código adentro no se
 * borra nada: "si hay duda, no se borra" (decisión 7 del dueño). La tabla de
 * equivalencias tiene 14 pares y ninguno es de un electivo, así que un
 * electivo aprobado con un código viejo sin pareja no quedaría respaldado, se
 * borraría, y ninguna importación posterior lo repondría.
 *
 * Solo miran las filas APROBADAS: una desaprobada o una fila sin nota no
 * respalda nada, así que no poder resolverla no pone en riesgo ningún borrado.
 *
 * Devuelve los códigos en el orden en que aparecen en el récord y sin
 * repetirlos: el resultado se escribe en el log del servidor.
 */
export const cleanupBlockers = (
  rows: readonly RecordRow[], resolved: ReadonlySet<string>, knownUnmatched: readonly string[],
): string[] => {
  const conocidos = new Set(knownUnmatched);
  const bloqueos: string[] = [];
  for (const r of approvedRows(rows)) {
    if (resolved.has(r.courseCode) || conocidos.has(r.courseCode)) continue;
    if (!bloqueos.includes(r.courseCode)) bloqueos.push(r.courseCode);
  }
  return bloqueos;
};

/**
 * Texto del warning `PROGRESS_REMOVED`. Es el ÚNICO texto nuevo que el récord
 * académico le muestra al alumno: un récord no confiable o una información
 * académica incompleta van solo al log. Solo el conteo, nunca la lista
 * (decisión 5: la lista ya la muestra la pantalla del récord).
 *
 * Se llama únicamente con n > 0, pero la rama plural cubre el 0 sin inventar
 * un texto aparte.
 */
export const progressRemovedMessage = (n: number): string =>
  n === 1
    ? "Se desmarcó 1 electivo que tu récord no respalda."
    : `Se desmarcaron ${n} electivos que tu récord no respalda.`;
```

**3b. `src/modules/portal-sync/portal-sync.types.ts`.** Dos reemplazos.

Reemplazar esto (cierre de `WarningCode`):

```ts
  | "ASISTENCIA_UNAVAILABLE";
```

por esto:

```ts
  | "ASISTENCIA_UNAVAILABLE"
  // RS-BE-23: la limpieza desmarcó electivos que el récord no respalda. Es el
  // único aviso nuevo del récord académico; los demás motivos (récord no
  // confiable, información académica incompleta) van solo al log del servidor.
  | "PROGRESS_REMOVED";
```

Reemplazar esto (dentro de `ImportSummary`):

```ts
  progressViaEquivalence: number;
  alertsCreated: number; syllabiUpserted: number;
```

por esto:

```ts
  progressViaEquivalence: number;
  /** Filas de `student_course_progress` BORRADAS por la limpieza de electivos
   *  no respaldados (RS-BE-23). Es el único contador de la importación que
   *  cuenta datos eliminados. Queda en 0 cuando la limpieza no corre: sin
   *  consentimiento, con un récord no confiable, con un código aprobado sin
   *  resolver o con el conjunto de respaldo vacío. */
  progressRemoved: number;
  alertsCreated: number; syllabiUpserted: number;
```

**3c. `src/modules/portal-sync/portal-sync.service.ts`.** Tres reemplazos.

*(i) El import de la lógica.* Ubícalo primero:

```bash
cd . && grep -n "academic-record.logic.js" src/modules/portal-sync/portal-sync.service.ts
```

La Tarea 6 dejó ahí esta línea:

```ts
import { evaluateRecordTrust } from "../academic-record/academic-record.logic.js";
```

Reemplazarla por:

```ts
import {
  cleanupBlockers, evaluateRecordTrust, progressRemovedMessage,
} from "../academic-record/academic-record.logic.js";
// Vive en el seed porque de ahí sale `course_equivalence`, pero acá es otra
// cosa: los 12 códigos de Estudios Generales que se sabe que NO respaldan un
// electivo, y que por eso no bloquean la limpieza (RS-BE-23).
import { SIN_EQUIVALENCIA_CONOCIDA } from "../../db/seed/equivalencias.logic.js";
```

Si la Tarea 6 escribió ese import con otra forma, agrega `cleanupBlockers` y `progressRemovedMessage` a la lista de nombres de ese mismo import y pon el de `SIN_EQUIVALENCIA_CONOCIDA` inmediatamente debajo. **No** agregues un segundo import del mismo módulo.

*(ii) `emptySummary`.* Reemplazar:

```ts
  progressUpserted: 0, progressSkipped: 0, progressViaEquivalence: 0,
```

por:

```ts
  progressUpserted: 0, progressSkipped: 0, progressViaEquivalence: 0, progressRemoved: 0,
```

*(iii) La limpieza.* Reemplazar este bloque, que está al final del `if (rec.ok) { … }` del progreso (sangría de 8 espacios; copiado literal de `portal-sync.service.ts:640-648`):

```ts
        summary.progressUpserted += await this.repository.upsertProgressBatch(
          tx, studentId, student.curriculumId, aEscribir,
        );
        if (summary.progressSkipped > 0) {
          warnings.push({
            code: "PROGRESS_SKIPPED", block: "record",
            message: `${summary.progressSkipped} cursos del récord no están en tu malla (convalidaciones o códigos antiguos).`,
          });
        }
```

por este:

```ts
        summary.progressUpserted += await this.repository.upsertProgressBatch(
          tx, studentId, student.curriculumId, aEscribir,
        );

        // RS-BE-23: limpieza de los electivos aprobados que el récord no
        // respalda. Corre acá —después de escribir el progreso y antes de
        // calcular el nivel— y solo con consentimiento y récord de confianza
        // (`guardarRecord`). La carga inicial de la base, anterior a
        // portal-sync, marcó como aprobados TODOS los electivos de los ciclos
        // ya cursados, y `upsertProgressBatch` nunca borra: sin esto esas
        // filas sobreviven a cualquier importación.
        //
        // El conjunto de respaldo se recalcula sobre TODAS las filas del
        // récord —con nota, sin nota o con una marca— y NO reutiliza
        // `ccIdPorCodigo`/`ccIdPorLegado`: esos solo cubren `conEstado`, del
        // que la fase de progreso ya sacó las filas sin nota numérica.
        // Reutilizarlos dejaría fuera del respaldo a un electivo aprobado con
        // una marca de convalidación, y esta misma limpieza lo borraría.
        if (guardarRecord) {
          const todos = [...new Set(rec.data.map((r) => r.courseCode))];
          const directos = await this.repository.findCurriculumCourseIds(
            tx, student.curriculumId, todos,
          );
          const restantes = todos.filter((c) => !directos.has(c));
          const legados = restantes.length
            ? await this.repository.findEquivalentCurriculumCourseIds(
              tx, student.curriculumId, restantes,
            )
            : new Map<string, number>();
          const resueltos = new Set([...directos.keys(), ...legados.keys()]);
          // "Si hay duda, no se borra" (decisión 7): un código aprobado que no
          // resuelve puede ser un electivo con un código viejo sin
          // equivalencia, y borrarlo sería definitivo.
          const bloqueos = cleanupBlockers(rec.data, resueltos, SIN_EQUIVALENCIA_CONOCIDA);
          if (bloqueos.length) {
            console.warn(
              "[portal-sync] limpieza de electivos omitida: códigos aprobados sin resolver:",
              bloqueos.join(", "),
            );
          } else {
            const respaldo = [...new Set([...directos.values(), ...legados.values()])];
            // Con el respaldo vacío la limpieza NO corre: `<> all('{}')` es
            // verdadero para toda fila y borraría todos los electivos
            // aprobados del alumno. El repository también se guarda de esto;
            // la guarda está en los dos lados a propósito.
            if (respaldo.length) {
              summary.progressRemoved += await this.repository.deleteUnbackedElectives(
                tx, studentId, student.curriculumId, respaldo,
              );
            }
          }
        }

        if (summary.progressSkipped > 0) {
          warnings.push({
            code: "PROGRESS_SKIPPED", block: "record",
            message: `${summary.progressSkipped} cursos del récord no están en tu malla (convalidaciones o códigos antiguos).`,
          });
        }
        if (summary.progressRemoved > 0) {
          warnings.push({
            code: "PROGRESS_REMOVED", block: "record",
            message: progressRemovedMessage(summary.progressRemoved),
          });
        }
```

---

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/electives-cleanup.test.ts
```

Esperado: PASS, `24 pass`, `0 fail` (las 5 de la Tarea 5 más las 19 de esta: 12 de la limpieza en la importación, 5 de `cleanupBlockers` y 2 de `progressRemovedMessage`).

Y, en la misma corrida, las dos suites de la Tarea 6 que ahora pasan por la limpieza (es lo que comprueba que los pasos 1d y 1e quedaron bien):

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/consent-gate.test.ts test/HU34_jeff/record-persistence.test.ts
```

Esperado: `0 fail`, con `20 pass` en `consent-gate.test.ts` y `25 pass` en `record-persistence.test.ts`. Si sale `TypeError: this.repository.deleteUnbackedElectives is not a function`, falta el paso 1d o el 1e.

---

- [ ] **Paso 5: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ninguna salida y exit 0.

Ojo con este paso: `tsconfig.json` **excluye** `src/db/seed/**/*`, pero `exclude` solo filtra los globs de `include`, no impide que un archivo entre al programa por un import. Con el import de (i), `src/db/seed/equivalencias.logic.ts` se compila por primera vez con `strict`, `noUnusedLocals`, `noUnusedParameters` y `noImplicitReturns`. Se comprobó al redactar este plan que ese archivo compila limpio con esas banderas (no tiene imports y todas sus declaraciones se exportan), así que un fallo ahí sería nuevo: **repórtalo y no lo toques**, es código del seed, está fuera de los `targets` de esta spec y arreglarlo es una decisión del dueño.

Los cuatro `emptySummary(): ImportSummary` de `test/HU33_jeff/registro.endpoint.test.ts:76`, `registro.rate-limit.test.ts:56`, `registro.service.test.ts:35` y `registro.atomicidad.test.ts:43` quedan sin el campo `progressRemoved`. **No los toques**: `tsconfig.json` solo incluye `src/**/*`, así que `bun run build` no los ve y `bun test` no typechequea; en tiempo de ejecución un campo de menos en un doble no cambia nada. El editor sí los va a marcar.

---

- [ ] **Paso 6: Regresión de las suites que tocan la importación**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU31_jeff test/HU33_jeff test/HU34_jeff
```

Esperado: `0 fail`. Los dobles de `test/HU31_jeff` y `test/HU33_jeff` no tienen `deleteUnbackedElectives` (y `service.import.test.ts` tampoco tiene `findEquivalentCurriculumCourseIds`), así que verlas verdes es la prueba de que la limpieza no se ejecuta sin `consent: true` y récord de confianza. Si aparece `this.repository.deleteUnbackedElectives is not a function` en alguna de esas dos carpetas, la guarda `if (guardarRecord)` quedó mal puesta; si aparece en `test/HU34_jeff`, falta el paso 1d o el 1e (ahí sí corresponde que la limpieza se ejecute, con el doble inerte que devuelve 0).

---

- [ ] **Paso 7: Documentación — `docs/specs/api-contracts.md`**

Tres cambios en la sección `## Portal Sync (carga de ciclo desde miUlima) — Implementado`.

*(i)* Reemplazar esta línea del ejemplo de `summary` (`:617`):

```
        "progressUpserted": 53, "progressSkipped": 4, "alertsCreated": 1, "syllabiUpserted": 3
```

por:

```
        "progressUpserted": 53, "progressSkipped": 4, "progressRemoved": 2, "alertsCreated": 1, "syllabiUpserted": 3
```

*(ii)* Reemplazar esta línea de la lista de `warnings` (`:619`):

```
      "warnings": [ { "code": "PERIOD_DATES_DEFAULTED" | "PERIOD_NOT_ACTIVATED_YET" | "TEACHER_MISSING" | "PARSER_FAILED" | "CAREER_MISMATCH" | "PROGRESS_SKIPPED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE" | "SYLLABUS_UNAVAILABLE", "block": "string", "message": "string" } ]
```

por:

```
      "warnings": [ { "code": "PERIOD_DATES_DEFAULTED" | "PERIOD_NOT_ACTIVATED_YET" | "TEACHER_MISSING" | "PARSER_FAILED" | "CAREER_MISMATCH" | "PROGRESS_SKIPPED" | "PROGRESS_REMOVED" | "WITHDRAW_SKIPPED_WOULD_LOCK_OUT" | "LEVEL_OUT_OF_RANGE" | "SYLLABUS_UNAVAILABLE", "block": "string", "message": "string" } ]
```

*(iii)* Agregar esta viñeta al final de la sección, justo después de la que empieza con `  - **La importación NO pisa sílabos existentes**:` (hoy es la última línea del archivo, `:627`; si la Tarea 9 ya agregó la sección `## Academic Record`, va antes de ese encabezado):

```
  - **Limpieza de electivos (RS-BE-23)**: con `consent: true` y un récord de confianza, la importación borra de `student_course_progress` los electivos en estado `approved` que ninguna fila del récord respalda, y cuenta lo borrado en `summary.progressRemoved`. Es la única parte de la importación que BORRA progreso. No corre si alguna fila aprobada del récord no resolvió a la malla (ni por código directo ni por `course_equivalence`, salvo los códigos de Estudios Generales ya conocidos), ni si el conjunto de respaldo queda vacío; en esos casos el motivo va al log del servidor y `progressRemoved` queda en 0. Nunca toca un obligatorio ni un curso de Estudios Generales, ni una fila `in_progress`, `failed` o `withdrawn`, ni `student_curriculum_simulation`. Si `progressRemoved` es mayor que 0 la respuesta trae el warning `PROGRESS_REMOVED` con el mensaje `"Se desmarcaron N electivos que tu récord no respalda."` (con `"Se desmarcó 1 electivo que tu récord no respalda."` en singular). El nivel del alumno no se mueve: la cobertura de ciclos ya excluye electivos. Ver `specs/features/academic-record/academic-record.spec.md` §RS-BE-23.
```

---

- [ ] **Paso 8: Documentación — `specs/features/portal-sync/portal-sync.spec.md`**

**8.a — §Flujo, paso 10.** En el paso 10 ("Progreso") de §Flujo, reemplazar esta línea (`:290`, empieza con cuatro espacios de sangría):

```
    Un código que no resuelve por ninguno de los dos se omite y se cuenta en `summary.progressSkipped`, con el warning `PROGRESS_SKIPPED` (convalidaciones, cursos de otra facultad, códigos legados aún sin equivalencia). Lo recuperado por (b) se cuenta aparte en `summary.progressViaEquivalence`.
```

por:

```
    Un código que no resuelve por ninguno de los dos se omite y se cuenta en `summary.progressSkipped`, con el warning `PROGRESS_SKIPPED` (convalidaciones, cursos de otra facultad, códigos legados aún sin equivalencia). Lo recuperado por (b) se cuenta aparte en `summary.progressViaEquivalence`.

    **Limpieza de electivos (RS-BE-23).** Justo después de escribir el progreso, y solo con el consentimiento del alumno y un récord de confianza, se borran de `student_course_progress` los electivos `approved` que ninguna fila del récord respalda. Es la única parte de la importación que BORRA progreso: no corre si alguna fila aprobada del récord no resolvió a la malla, ni si el conjunto de respaldo queda vacío. Lo borrado se cuenta en `summary.progressRemoved` y, si es mayor que 0, agrega el warning `PROGRESS_REMOVED`. El respaldo se recalcula sobre TODAS las filas del récord y **no** reutiliza el resultado de (a) y (b) de arriba, que ya descartó las filas sin nota numérica. Ver `specs/features/academic-record/academic-record.spec.md` §RS-BE-23.
    `[@test] ../../../test/HU34_jeff/electives-cleanup.test.ts`
```

**8.b — §Parsers, la viñeta de `parseRecordAcademico`.** Es el último cambio que pide la spec en "Cambios en otras specs" (`academic-record.spec.md:371-374`: "`parseRecordAcademico` lee por tabla y devuelve también el pie (RS-BE-19 y RS-BE-20)") y ninguna tarea anterior lo hace: la Tarea 3 tocó solo la viñeta de `parseInfoAcademica` y dijo expresamente que esta no era suya. Hoy la viñeta describe un parser que ya no existe —firma sin `gradeRaw`/`observation`, sin pie, sin descartes, sin lectura por tabla— y no enlaza la prueba de HU34.

Reemplazar las dos líneas de `specs/features/portal-sync/portal-sync.spec.md` que hoy son la 227 y la 228 (el número habrá bajado +1 por la Tarea 3; ubícalas con `grep -n "parseRecordAcademico" specs/features/portal-sync/portal-sync.spec.md`):

```markdown
- `parseRecordAcademico(html)` → `[{ periodCode, courseCode, courseName, attempt, credits, grade|null, sectionCode }]`. La fila real tiene 12 columnas (`CICLO, COD., ASIGNATURA, VIG., FAC., VEZ, CRD., NOTA, SEC., TOMO, FOLIO, OBSERVACIÓN`): el mapeo es por índice de columna, no por orden de la lista anterior. La celda `CICLO` solo trae valor en la **primera fila de cada grupo** (`&nbsp;` en las demás): se arrastra el último valor no vacío. `NOTA` vacía = curso en curso; `NOTA` no numérica se trata como sin nota.
  `[@test] ../../../test/HU31_jeff/parsers.record.test.ts`
```

por:

```markdown
- `parseRecordPage(html)` → `{ rows, headerOk, discarded, footer }`, y `parseRecordAcademico(html)` = `recordRows(parseRecordPage(html))` → `[{ periodCode, courseCode, courseName, attempt, credits, grade|null, sectionCode, gradeRaw|null, observation|null }]`, con la forma que fijan **RS-BE-19 y RS-BE-20** de `../academic-record/academic-record.spec.md`. Se lee **por tabla, no por página**: la tabla del récord se ubica por su cabecera normalizada de 12 columnas (`CICLO, COD., ASIGNATURA, VIG., FAC., VEZ, CRD., NOTA, SEC., TOMO, FOLIO, OBSERVACIÓN`) y la del pie por la suya de 10; el mapeo es por índice de columna. La celda `CICLO` solo trae valor en la **primera fila de cada grupo** (`&nbsp;` en las demás): se arrastra el último valor no vacío. `NOTA` vacía = curso en curso; `NOTA` no numérica se trata como sin nota en `grade`, pero el texto de la celda se conserva en `gradeRaw`. Los créditos **no se redondean**. Las filas de datos que no pasan la validación se cuentan en `discarded`, y `footer` es `null` si el pie falta o si alguna de sus celdas numéricas no se lee. Si la tabla no aparece con su cabecera exacta, el lector cae al modo compatible (recorre toda la página, `headerOk: false`) y ese récord nunca es de confianza.
  `[@test] ../../../test/HU31_jeff/parsers.record.test.ts`
  `[@test] ../../../test/HU34_jeff/record-parser.test.ts`
```

Comprobar:

```bash
cd . && grep -n "parseRecordPage\|parseRecordAcademico" specs/features/portal-sync/portal-sync.spec.md && ls test/HU31_jeff/parsers.record.test.ts test/HU34_jeff/record-parser.test.ts
```

Esperado: una sola línea de viñeta (la nueva, con `parseRecordPage` y `gradeRaw`) y las dos rutas listadas.

---

- [ ] **Paso final: Commit**

```bash
cd . && git add src/modules/academic-record/academic-record.logic.ts src/modules/portal-sync/portal-sync.types.ts src/modules/portal-sync/portal-sync.service.ts test/HU34_jeff/electives-cleanup.test.ts test/HU34_jeff/consent-gate.test.ts test/HU34_jeff/record-persistence.test.ts docs/specs/api-contracts.md specs/features/portal-sync/portal-sync.spec.md && git commit -m "feat(academic-record): limpieza de electivos no respaldados (RS-BE-23)"
```

Sin trailer `Co-Authored-By` y sin push: abrir PR o subir la rama lo decide el dueño.

### Tarea 8: Consentimiento en el registro (RS-BE-29, RS-BE-22 registro)

`POST /auth/register` corre exactamente la misma importación que `POST /portal-sync/import`: `AuthService.register` llama a `registrar.importFromPortal(...)`, que en producción **es** `PortalSyncService.importFromPortal` (lo inyecta `portal-sync/index.ts:20` con `authService.setRegistrar(portalSyncService)`). La Tarea 6 ya puso toda la lógica del gate adentro de ese método. Lo único que falta —y lo único que esta tarea hace— es que el consentimiento **llegue** desde el registro: hoy `register` llama con `{ cookies }` y el campo se pierde antes de nacer, porque `registerSchema` descarta en silencio las claves que no declara.

Sin este cambio, un alumno que se registra desde la app nueva aceptando la pantalla de consentimiento importaría su ciclo pero no guardaría su récord, y RS-BE-22 exige lo contrario (`academic-record.spec.md:148-150`): *"El registro (`auth.service.ts`, que llama al mismo `importFromPortal`) guarda el récord, la foto y el resumen igual que la importación de Portal Sync, con la misma condición de consentimiento."*

**Archivos:**

- Modificar: `src/modules/auth/auth.schemas.ts:40-45` (`registerSchema` suma `consent`)
- Modificar: `src/modules/auth/auth.controller.ts:15-17` (tipo de `register`)
- Modificar: `src/modules/auth/auth.service.ts:54-62` (tipo `Registrar`), `:201-203` (firma de `register`), `:274-275` (la llamada a `importFromPortal`)
- Modificar: `specs/features/registro/registro.spec.md:55-61` (§API Contract)
- Modificar: `docs/specs/api-contracts.md:60` (Request de `POST /auth/register`)
- Test: `test/HU34_jeff/consent-gate.test.ts` (**ampliar**; lo creó la Tarea 6)

`specs/features/academic-record/academic-record.spec.md` **no se toca**: RS-BE-29 ya trae su `[@test] ../../../test/HU34_jeff/consent-gate.test.ts` (línea 296), `auth.schemas.ts` y `auth.service.ts` ya están en sus `targets` (líneas 12-13), y `auth.controller.ts` entró a esa lista en la Tarea 1.

**Interfaces:**

- Consume — de la Tarea 6, ya implementado en `src/modules/portal-sync/portal-sync.service.ts`:
  ```ts
  async importFromPortal(
    userId: number, studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string }; consent?: boolean },
    provision?: ProvisionFn,
    validate?: ValidateFn,
  ): Promise<ImportResult>
  ```
- Consume — del repo actual, sin cambios:
  ```ts
  // src/modules/auth/auth.service.ts:167-183
  constructor(
    readonly repository: AuthRepository,
    readonly events: EventBus,
    private readonly googleTokenVerifier: GoogleTokenVerifier = googleClient,
    private readonly portalSyncRepository?: PortalSyncRepository,
    private readonly portalClient: PortalClient = defaultPortalClient,
  )
  setRegistrar(registrar: Registrar): void            // :185-187

  // src/modules/auth/auth.controller.ts:4-5 — no se toca
  export class AuthController { constructor(readonly service: AuthService) {} }

  // src/modules/portal-sync/portal-sync.service.ts:24-45 (tipos de los hooks)
  export type StudentProfile = {
    id: number; userId: number; careerId: number; curriculumId: number;
    currentLevel: number | null; careerName: string;
  };
  export type ProvisionFn = (
    tx: Tx,
    identidad: { studentCode: string; studentName: string; careerName: string },
  ) => Promise<StudentProfile>;
  export type ValidateFn = (summary: ImportSummary) => void;

  // src/modules/portal-sync/portal-sync.types.ts:1, :90-100
  export interface PortalCookies { JSESSIONID: string; LtpaToken2: string; LtpaToken?: string }
  export interface ImportResult {
    period: { id: number; code: string; created: boolean };
    identity: { portalCode: string; fullName: string; career: string };
    summary: ImportSummary;
    warnings: SyncWarning[];
    token: string | null;
  }

  // src/modules/auth/auth.routes.ts:39-41 — no se toca
  const body = await validateJson(c, registerSchema);
  return c.json(await controller.register(body), 201);
  ```
- Produce — lo que consumen el controller, el router y las pruebas:
  ```ts
  // src/modules/auth/auth.schemas.ts
  export const registerSchema = z.object({
    code: z.string().regex(/^\d{6,10}$/),
    portalPassword: z.string().min(1),
    passcode: z.string().min(1),
    password: z.string().min(1),
    consent: z.boolean().optional(),
  });

  // src/modules/auth/auth.controller.ts
  register(input: {
    code: string; portalPassword: string; passcode: string; password: string; consent?: boolean;
  })

  // src/modules/auth/auth.service.ts
  export type Registrar = {
    importFromPortal(
      userId: number,
      studentId: number,
      entrada: {
        cookies?: PortalCookies;
        credentials?: { password: string; passcode: string };
        consent?: boolean;
      },
      provision?: ProvisionFn,
      validate?: ValidateFn,
    ): Promise<ImportResult>;
  };

  async register(input: {
    code: string; portalPassword: string; passcode: string; password: string; consent?: boolean;
  })
  // llama con: { cookies, consent: input.consent === true }
  ```

---

- [ ] **Paso 1: Escribir la prueba que falla**

`test/HU34_jeff/consent-gate.test.ts` ya existe (lo creó la Tarea 6, con 20 pruebas). Se le agregan **dos bloques**.

**Bloque A — imports.** El archivo arranca con siete `import` y el **último** es este bloque de tres líneas:

```ts
import type {
  AcademicGeneral, AcademicPeriodBlock, RecordRow,
} from "../../src/modules/portal-sync/portal-sync.types.js";
```

Agregar **inmediatamente después de ese `};` de cierre** —o sea después de la línea `} from "../../src/modules/portal-sync/portal-sync.types.js";`— y **antes** del comentario de cabecera `/** RS-BE-29 (consentimiento) … */`:

```ts
// ── Tarea 8: el consentimiento también entra por POST /auth/register ─────────
// `PortalSyncRepository` y `PortalClient` ya están importados arriba como tipos
// y se reutilizan tal cual: un segundo import con el mismo nombre sería un
// identificador duplicado. `describe`, `expect` y `test` también están ya.
// `ImportSummary` y `PortalCookies` salen del MISMO módulo que la línea de
// arriba, en un import aparte: así este bloque es puramente aditivo y no hay
// que reescribir el import que ya estaba.
import { AuthService } from "../../src/modules/auth/auth.service.js";
import type { Registrar } from "../../src/modules/auth/auth.service.js";
import { AuthController } from "../../src/modules/auth/auth.controller.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { registerSchema } from "../../src/modules/auth/auth.schemas.js";
import type { ImportSummary, PortalCookies } from "../../src/modules/portal-sync/portal-sync.types.js";
import { EventBus } from "../../src/events/index.js";
```

**Bloque B — armado y pruebas.** Agregar **al final del archivo**, después del cierre del último `describe` (`describe("informacion academica incompleta (RS-BE-24)", …)`). Ningún nombre de acá choca con los que el archivo ya declara (`record`, `layoutBase`, `layout`, `matricula`, `tablaPie`, `recordSinPie`, `layoutGeneralRota`, `cookies`, `PERFIL_APROVISIONADO`, `provisionHook`, `Escritura`, `armarServicio`, `ORDEN_SIN_RECORD`, `ORDEN_CON_RECORD`):

```ts
// ── RS-BE-29 en el registro: POST /auth/register acepta y traslada `consent` ──
// El registro llama al MISMO `importFromPortal` (auth.service.ts:274-275), así
// que acá NO se vuelve a probar qué se guarda —eso ya está más arriba en este
// archivo, con el service real, incluido el modo registro con `provisionHook`—:
// se prueba lo único que el registro decide, que es que el consentimiento
// llegue, y que llegue siempre como booleano.

/** Datos SINTÉTICOS (el repo es público): 20230001 no es el código de nadie y
 *  las credenciales son inventadas. */
const ENTRADA_REGISTRO = {
  code: "20230001",
  portalPassword: "clave-portal-sintetica",
  passcode: "123456",
  password: "clave-nueva-sintetica",
};
const CARRERA_SINTETICA = "INGENIERÍA INDUSTRIAL";

/** El tercer argumento con el que `register` invoca al Registrar. Se escribe
 *  entero (y no `Parameters<...>`) para que la prueba falle si alguien recorta
 *  el tipo estructural de `Registrar` en vez de seguirlo. */
type EntradaImport = {
  cookies?: PortalCookies;
  credentials?: { password: string; passcode: string };
  consent?: boolean;
};

/**
 * `AuthService.register` con todas sus dependencias falseadas. Es el armado de
 * test/HU33_jeff/registro.service.test.ts:62-206 reducido a lo que esta prueba
 * necesita: acá no se miden el 409 temprano, la atomicidad ni el doble logout,
 * que ya tienen sus propios archivos en HU33. Por eso el Registrar falso
 * tampoco simula el `finally` con `portalClient.logout(...)` que sí tiene el de
 * HU33: `register` le entrega las cookies y no vuelve a cerrarlas, y ninguna
 * aserción de este bloque cuenta logouts.
 *
 * `entradaDeLaImportacion` es una FUNCIÓN y no un valor desestructurado: leído
 * antes de `register()` quedaría congelado en `null` y la aserción nunca podría
 * fallar. Lleva anotación de retorno explícita para que el tipo no dependa de
 * cómo TypeScript analice una variable que solo se asigna dentro de un closure.
 */
const armarRegistro = () => {
  let entradaImport: EntradaImport | null = null;

  const authRepository = {
    codeExists: async () => false,
    // Vuelve vacía a propósito: `register` cae a su `usuarioDeRespaldo`
    // (auth.service.ts:114-141), que se arma con lo que `provision` insertó y
    // no vuelve a la BD. Nada de lo que esta prueba mide depende del `user`.
    findById: async () => null,
  } as unknown as AuthRepository;

  const portalSyncRepository = {
    findSoleCareerAndCurriculum: async () => ({
      careerId: 1, curriculumId: 1, careerName: CARRERA_SINTETICA,
    }),
    createStudentAccount: async () => ({
      id: 77, userId: 55, careerId: 1, curriculumId: 1,
      currentLevel: null, careerName: CARRERA_SINTETICA,
    }),
  } as unknown as PortalSyncRepository;

  const portalClient = {
    login: async () => ({ JSESSIONID: "a", LtpaToken2: "b" }),
    logout: async () => {},
  } as unknown as PortalClient;

  const registrar: Registrar = {
    importFromPortal: async (_userId, _studentId, entrada, provision, validate) => {
      entradaImport = entrada;
      await provision!({} as never, {
        studentCode: ENTRADA_REGISTRO.code,
        studentName: "ALUMNO DE PRUEBA",
        careerName: CARRERA_SINTETICA,
      });
      // De todo `ImportSummary` acá solo interviene `enrollmentsUpserted`: es lo
      // que mira el `validate` que pasa `register` (403 NOT_ENROLLED con 0). El
      // resto de los campos no cambia ninguna aserción de este bloque.
      const summary = { enrollmentsUpserted: 5 } as unknown as ImportSummary;
      validate?.(summary);
      return {
        period: { id: 1, code: "2026-2", created: false },
        identity: {
          portalCode: ENTRADA_REGISTRO.code,
          fullName: "ALUMNO DE PRUEBA",
          career: CARRERA_SINTETICA,
        },
        summary,
        warnings: [],
        token: null,
      };
    },
  };

  const service = new AuthService(
    authRepository, new EventBus(), undefined, portalSyncRepository, portalClient,
  );
  service.setRegistrar(registrar);

  const entradaDeLaImportacion = (): EntradaImport | null => entradaImport;
  return { service, controller: new AuthController(service), entradaDeLaImportacion };
};

describe("registerSchema con consent (RS-BE-29)", () => {
  test("acepta consent true y lo conserva en el body validado", () => {
    // Se mira el objeto VALIDADO y no `success`: hoy zod ya acepta este body
    // —descarta en silencio la clave que el esquema no declara—, así que un
    // `safeParse(...).success` solo no detectaría que `consent` se pierde antes
    // de llegar al controller.
    expect(registerSchema.parse({ ...ENTRADA_REGISTRO, consent: true }))
      .toMatchObject({ consent: true });
  });

  test("acepta el body sin consent: es lo que mandan las apps ya instaladas", () => {
    const body = registerSchema.parse(ENTRADA_REGISTRO);
    expect(body.code).toBe("20230001");
    expect(body.consent).toBeUndefined();
  });

  test("rechaza un consent que no es booleano en vez de descartarlo en silencio", () => {
    expect(registerSchema.safeParse({ ...ENTRADA_REGISTRO, consent: "si" }).success).toBe(false);
  });

  test("consent no reemplaza a ningun campo obligatorio del registro", () => {
    expect(registerSchema.safeParse({ code: "20230001", consent: true }).success).toBe(false);
  });
});

describe("AuthService.register traslada el consentimiento (RS-BE-29, RS-BE-22)", () => {
  test("con consent true el Registrar lo recibe en true", async () => {
    const a = armarRegistro();
    await a.service.register({ ...ENTRADA_REGISTRO, consent: true });
    expect(a.entradaDeLaImportacion()?.consent).toBe(true);
  });

  test("sin el campo consent el Registrar recibe false, nunca undefined", async () => {
    const a = armarRegistro();
    await a.service.register(ENTRADA_REGISTRO);
    // `false` y no `undefined`: el registro manda siempre un booleano, así el
    // gate del service no depende de distinguir "no vino" de "vino en false".
    expect(a.entradaDeLaImportacion()?.consent).toBe(false);
  });

  test("consent false llega como false", async () => {
    const a = armarRegistro();
    await a.service.register({ ...ENTRADA_REGISTRO, consent: false });
    expect(a.entradaDeLaImportacion()?.consent).toBe(false);
  });

  test("el consentimiento no desplaza a las cookies ni cambia la respuesta del registro", async () => {
    const a = armarRegistro();
    const r = await a.service.register({ ...ENTRADA_REGISTRO, consent: true });
    expect(a.entradaDeLaImportacion()?.cookies).toEqual({ JSESSIONID: "a", LtpaToken2: "b" });
    // El registro SIEMPRE entrega la sesión ya hecha; nunca las credenciales.
    expect(a.entradaDeLaImportacion()?.credentials).toBeUndefined();
    expect(r.user.code).toBe("20230001");
    expect(typeof r.token).toBe("string");
  });

  test("ni la contrasena del portal ni el passcode viajan en la entrada de la importacion", async () => {
    const a = armarRegistro();
    await a.service.register({ ...ENTRADA_REGISTRO, consent: true });
    const serializada = JSON.stringify(a.entradaDeLaImportacion());
    expect(serializada).not.toContain(ENTRADA_REGISTRO.portalPassword);
    expect(serializada).not.toContain(ENTRADA_REGISTRO.passcode);
    expect(serializada).not.toContain(ENTRADA_REGISTRO.password);
  });
});

describe("el cuerpo validado del registro llega hasta la importacion (RS-BE-29)", () => {
  test("el consent que sobrevive a registerSchema llega al Registrar", async () => {
    // Las dos capas de arriba se prueban por separado; esta las COMPONE en el
    // mismo orden que la ruta (auth.routes.ts:39-41): primero el esquema, y su
    // salida —no el objeto original— entra al controller. Sin esto, un esquema
    // que descarta `consent` y un service que lo reenvía pasarían sus pruebas
    // por separado y el endpoint seguiría sin guardar nada.
    const a = armarRegistro();
    const body = registerSchema.parse({ ...ENTRADA_REGISTRO, consent: true });
    await a.controller.register(body);
    expect(a.entradaDeLaImportacion()?.consent).toBe(true);
  });
});
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/consent-gate.test.ts
```

Esperado: FAIL, `24 pass, 6 fail` sobre 30 pruebas (las 20 que el archivo ya tenía siguen verdes; de las 10 nuevas fallan 6). Los fallos concretos:

1. `registerSchema con consent (RS-BE-29) > acepta consent true y lo conserva en el body validado`
   ```
   error: expect(received).toMatchObject(expected)
   - Expected  - 1
   + Received  + 0
     Object {
   -   "consent": true,
     }
   ```
   (`registerSchema` no declara `consent`, así que zod lo descarta del objeto validado.)
2. `registerSchema con consent (RS-BE-29) > rechaza un consent que no es booleano en vez de descartarlo en silencio`
   ```
   error: expect(received).toBe(expected)
   Expected: false
   Received: true
   ```
3. `AuthService.register traslada el consentimiento (RS-BE-29, RS-BE-22) > con consent true el Registrar lo recibe en true`
   ```
   error: expect(received).toBe(expected)
   Expected: true
   Received: undefined
   ```
4. `… > sin el campo consent el Registrar recibe false, nunca undefined` → `Expected: false / Received: undefined`
5. `… > consent false llega como false` → `Expected: false / Received: undefined`
6. `el cuerpo validado del registro llega hasta la importacion (RS-BE-29) > el consent que sobrevive a registerSchema llega al Registrar` → `Expected: true / Received: undefined`

Todos fallan por el motivo correcto: `auth.service.ts:275` invoca con `{ cookies }` y el campo no existe en ninguna capa.

> Lo que **no** debe aparecer: `TypeError: … .deleteUnbackedElectives is not a function` en pruebas que ya existían. El doble de `armarServicio` lo recibe en el paso 1d de la Tarea 7. Si sale, esa tarea quedó a medias: vuelve a ella, no lo parches acá.

- [ ] **Paso 3: Implementación mínima**

**3.a — `src/modules/auth/auth.schemas.ts`.** Reemplazar el bloque de las líneas 40-45:

```ts
export const registerSchema = z.object({
  code: z.string().regex(/^\d{6,10}$/),
  portalPassword: z.string().min(1),
  passcode: z.string().min(1),
  password: z.string().min(1),
});
```

por:

```ts
export const registerSchema = z.object({
  code: z.string().regex(/^\d{6,10}$/),
  portalPassword: z.string().min(1),
  passcode: z.string().min(1),
  password: z.string().min(1),
  /**
   * RS-BE-29 (academic-record). Consentimiento para guardar la copia del
   * récord académico, la foto y el resumen por ciclo.
   *
   * OPCIONAL a propósito: las apps ya instaladas no tienen la pantalla de
   * consentimiento y no lo mandan, y su registro tiene que seguir funcionando
   * exactamente igual que hoy (decisión 8 del dueño). Booleano estricto y no
   * `z.any()`: un `"si"` de un cliente mal escrito tiene que salir como 400 y
   * no colarse como verdadero.
   */
  consent: z.boolean().optional(),
});
```

(El bloque de comentario de las líneas 31-39, el que explica `code`/`portalPassword`/`password`, queda tal cual: no entra en el reemplazo.)

**3.b — `src/modules/auth/auth.controller.ts`.** Reemplazar las líneas 15-17:

```ts
  register(input: { code: string; portalPassword: string; passcode: string; password: string }) {
    return this.service.register(input);
  }
```

por:

```ts
  /** `consent` (RS-BE-29) viaja tal cual hasta la importación: el controller no
   *  decide nada con él, solo lo deja pasar, igual que hace
   *  `portal-sync.controller.ts` con el body de `/import`. */
  register(input: {
    code: string; portalPassword: string; passcode: string; password: string; consent?: boolean;
  }) {
    return this.service.register(input);
  }
```

**3.c — `src/modules/auth/auth.service.ts`, edición 1** (tipo `Registrar`, líneas 54-62). Reemplazar:

```ts
export type Registrar = {
  importFromPortal(
    userId: number,
    studentId: number,
    entrada: { cookies?: PortalCookies; credentials?: { password: string; passcode: string } },
    provision?: ProvisionFn,
    validate?: ValidateFn,
  ): Promise<ImportResult>;
};
```

por:

```ts
export type Registrar = {
  importFromPortal(
    userId: number,
    studentId: number,
    entrada: {
      cookies?: PortalCookies;
      credentials?: { password: string; passcode: string };
      /**
       * RS-BE-29. Sin este campo en el tipo ESTRUCTURAL, `register` no puede
       * pasar el consentimiento aunque `PortalSyncService` ya lo acepte: es
       * este tipo, y no la clase, lo que `auth` conoce de `portal-sync`.
       */
      consent?: boolean;
    },
    provision?: ProvisionFn,
    validate?: ValidateFn,
  ): Promise<ImportResult>;
};
```

(El comentario de las líneas 47-53, el que explica por qué el tipo es estructural, queda tal cual.)

**3.d — `src/modules/auth/auth.service.ts`, edición 2** (firma de `register`, líneas 201-203). Reemplazar:

```ts
  async register(input: {
    code: string; portalPassword: string; passcode: string; password: string;
  }) {
```

por:

```ts
  async register(input: {
    code: string; portalPassword: string; passcode: string; password: string;
    /**
     * RS-BE-29: el alumno aceptó que se guarde la copia de su récord. Opcional
     * porque las apps ya instaladas no lo mandan. `register` no lo interpreta:
     * lo traslada a `importFromPortal`, que es el único que decide si guarda.
     */
    consent?: boolean;
  }) {
```

**3.e — `src/modules/auth/auth.service.ts`, edición 3** (la llamada, líneas 274-275). Reemplazar:

```ts
      const resultado = await registrar.importFromPortal(
        0, 0, { cookies },
```

por:

```ts
      const resultado = await registrar.importFromPortal(
        // `input.consent === true` y no `input.consent` a secas: el registro
        // manda SIEMPRE un booleano, así que un body de una app vieja llega
        // como `false` y no como `undefined`. El gate del service queda con un
        // solo caso que mirar (RS-BE-29).
        //
        // RS-BE-22: con esto el registro guarda el récord, la foto y el
        // resumen exactamente igual que `POST /portal-sync/import`, porque es
        // el MISMO `importFromPortal`. El candado de récord lo toma el service
        // después de que `provision` devuelve el `studentId` real — antes vale
        // 0 —, y todo cae dentro de la misma transacción: si `validate` lanza
        // por falta de matrícula, la copia del récord se revierte con la
        // cuenta.
        0, 0, { cookies, consent: input.consent === true },
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/consent-gate.test.ts
```

Esperado: PASS, `30 pass`, `0 fail`.

- [ ] **Paso 5: Compilar**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: PASS — `tsc` termina sin imprimir nada y con código de salida 0. (`tsconfig.json` tiene `"include": ["src/**/*"]`, así que el build valida las tres ediciones de `auth/` pero no el test; el test lo transpila `bun` sin chequeo de tipos.) La comprobación que importa acá es que `portal-sync/index.ts:20` (`authService.setRegistrar(portalSyncService)`) sigue compilando: `PortalSyncService.importFromPortal`, con el `consent?: boolean` que le puso la Tarea 6, satisface el tipo `Registrar` recién ampliado.

- [ ] **Paso 6: Regresión de HU33 (el registro completo) y de HU31**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU33_jeff test/HU31_jeff
```

Esperado: PASS, `0 fail`. Es la prueba de que el registro sin `consent` sigue comportándose como hoy:

- Los tres `Registrar` falsos de HU33 —`registro.service.test.ts:162-189`, `registro.atomicidad.test.ts:122-157` y `registro.endpoint.test.ts:161-184`— reciben ahora `{ cookies, consent: false }` en vez de `{ cookies }`. Ninguno mira ese campo: los tres solo usan `entradaImport.cookies` para el logout simulado, y ninguno compara la entrada entera con `toEqual`, así que la clave nueva no rompe ninguna aserción.
- `registro.endpoint.test.ts` es el único que pasa por la ruta real y por `registerSchema`: manda un body **sin** `consent` y tiene que seguir dando `201`, porque el campo es opcional.
- `service.registro-import.test.ts` no tiene Registrar falso: llama directo a `PortalSyncService.importFromPortal(0, 0, { cookies: {} as never }, provisionHook)`, o sea el modo registro sin consentimiento. Es la comprobación de que ese camino no toca nada nuevo: sus dobles de repositorio, igual que los de HU31, **no** tienen los métodos de la Tarea 5, así que si el camino sin consentimiento llamara a alguno reventarían con `is not a function`.

- [ ] **Paso 7: Documentación**

**7.a — `specs/features/registro/registro.spec.md`.** Reemplazar el bloque de las líneas 55-61:

````markdown
```json
{ "code": "20230001", "portalPassword": "…", "passcode": "123456", "password": "…" }
```

- `code`: código de alumno, `^\d{6,10}$`.
- `portalPassword` y `passcode`: credenciales de **miUlima**. Se usan para el login y se descartan; no se persisten ni se registran en logs (RS-BE-7 de portal-sync, que esta feature hereda).
- `password`: la contraseña que la persona quiere para ULima++.
````

por:

````markdown
```json
{ "code": "20230001", "portalPassword": "…", "passcode": "123456", "password": "…", "consent": true }
```

- `code`: código de alumno, `^\d{6,10}$`.
- `portalPassword` y `passcode`: credenciales de **miUlima**. Se usan para el login y se descartan; no se persisten ni se registran en logs (RS-BE-7 de portal-sync, que esta feature hereda).
- `password`: la contraseña que la persona quiere para ULima++.
- `consent` (opcional, booleano): el alumno aceptó que se guarde la copia de su récord académico. Lo define RS-BE-29 de `../academic-record/academic-record.spec.md`; el registro no lo interpreta, solo lo traslada a la importación, que es la misma de `POST /portal-sync/import`. Con `true` se guardan el récord, la foto académica y el resumen del ciclo; sin el campo —lo que mandan las apps ya instaladas— el registro corre **exactamente igual que hoy** y no se guarda ninguno de los tres. Un valor que no sea booleano se rechaza con `400`.
  `[@test] ../../../test/HU34_jeff/consent-gate.test.ts`
````

**7.b — `docs/specs/api-contracts.md`.** Reemplazar la línea 60. Ninguna tarea previa la mueve —la Tarea 6 toca la línea ~608 y la Tarea 7 las ~614-619, las dos por debajo—, pero conviene confirmar el número antes de editar:

```bash
cd . && grep -n 'Request: `{ "code": "string", "portalPassword"' docs/specs/api-contracts.md
```

Reemplazar:

```markdown
  - Request: `{ "code": "string", "portalPassword": "string", "passcode": "string", "password": "string" }`. `code`: `^\d{6,10}$`. `portalPassword`/`passcode` son credenciales de **miUlima** (se usan para el login y se descartan, nunca se persisten ni se registran en logs). `password` es la contraseña nueva de ULima++.
```

por:

```markdown
  - Request: `{ "code": "string", "portalPassword": "string", "passcode": "string", "password": "string", "consent"?: true }`. `code`: `^\d{6,10}$`. `portalPassword`/`passcode` son credenciales de **miUlima** (se usan para el login y se descartan, nunca se persisten ni se registran en logs). `password` es la contraseña nueva de ULima++. `consent` es opcional y booleano (RS-BE-29, `specs/features/academic-record/academic-record.spec.md`): con `true` la importación que corre dentro del registro guarda la copia del récord académico, la foto académica y el resumen por ciclo, igual que `POST /portal-sync/import`; sin el campo el registro funciona como hoy y no guarda ninguno de los tres. Un valor no booleano responde `400`.
```

Comprobación de los dos documentos:

```bash
cd . && grep -c "consent" specs/features/registro/registro.spec.md && grep -n '"consent"' docs/specs/api-contracts.md
```

Esperado: `3` en `registro.spec.md` —tres líneas: el `"consent": true` del JSON, la viñeta nueva y su `[@test]`, cuyo nombre de archivo contiene la palabra— y, en `api-contracts.md`, la línea 60 recién editada más la del body de `POST /portal-sync/import` que dejó la Tarea 6 (l. ~608).

- [ ] **Paso final: Commit**

```bash
cd . && git add src/modules/auth/auth.schemas.ts src/modules/auth/auth.controller.ts src/modules/auth/auth.service.ts test/HU34_jeff/consent-gate.test.ts specs/features/registro/registro.spec.md docs/specs/api-contracts.md && git commit -m "feat(academic-record): el registro traslada el consentimiento a la importación (RS-BE-29)"
```

### Tarea 9: Módulo `academic-record` — lectura, borrado y aislamiento del chatbot (RS-BE-26, RS-BE-27, RS-BE-28, Contrato)

Las Tareas 1 a 8 dejaron el récord **guardado** en la base; nadie lo lee todavía. Esta tarea agrega el módulo que
lo devuelve a su dueño y el que lo borra, y fija con una prueba que el chatbot no lo toca. Es el único módulo
nuevo de la funcionalidad: sigue la plantilla de `curriculum` y `avatar` (routes → controller → service →
repository), el `studentId` sale **solo** del token y la respuesta lleva `Cache-Control: no-store`.

**Archivos:**

- Crear: `src/modules/academic-record/academic-record.types.ts`
- Crear: `src/modules/academic-record/academic-record.repository.ts`
- Crear: `src/modules/academic-record/academic-record.service.ts`
- Crear: `src/modules/academic-record/academic-record.controller.ts`
- Crear: `src/modules/academic-record/academic-record.routes.ts`
- Crear: `src/modules/academic-record/index.ts`
- Modificar: `src/modules/academic-record/academic-record.logic.ts` (lo creó la Tarea 2 y lo amplió la Tarea 7; acá se suma un bloque `import type` después de los imports que ya tiene y `buildAcademicRecordDto` al final)
- Modificar: `src/modules/index.ts:17` (import) y `src/modules/index.ts:35-36` (ruta)
- Modificar: `docs/specs/api-contracts.md` (sección nueva al **final** del archivo; hoy el archivo tiene 627 líneas, pero las Tareas 6, 7 y 8 editan líneas anteriores —~60, ~608 y ~614-619—, así que el número habrá cambiado: el ancla es la última línea, no un número)
- Modificar: `docs/specs/feature-index.md:22` (se conserva la fila 16 y se agrega debajo la fila 17)
- Test: `test/HU34_jeff/academic-record.routes.test.ts` (crear)
- Test: `test/HU34_jeff/chatbot-isolation.test.ts` (crear)

`specs/features/academic-record/academic-record.spec.md` **no se toca**: ya trae
`[@test] ../../../test/HU34_jeff/academic-record.routes.test.ts` bajo RS-BE-26 (línea 260) y RS-BE-27
(línea 273), `[@test] ../../../test/HU34_jeff/chatbot-isolation.test.ts` bajo RS-BE-28 (línea 282), y sus
targets ya cubren lo que se toca: `../../../src/modules/academic-record/**` (línea 5) para los seis archivos
nuevos y `../../../src/modules/index.ts` (línea 14) para el registro de la ruta.

`src/server.ts` **tampoco se toca**: su lista de `modules` en `GET /` (líneas 33-44) ya está desactualizada
—le faltan `official-grades`, `chat`, `chatbot`, `attendance-risk`, `networking` y `avatar`— y el archivo no
está en los targets de la spec. Arreglar esa lista es otra tarea.

Todos los comandos se corren desde la raíz del worktree `.`.

**Interfaces:**

- Consume — Tarea 4 (tablas de `drizzle/0011_academic_record.sql`; el repository usa SQL crudo, así que lo
  que importa son los nombres SQL, no los identificadores de `schema.ts`):
  ```sql
  student_academic_snapshot(student_id, ppa, relative_position, convalidated_courses,
    convalidated_credits, approved_courses, approved_credits, credits_accumulated,
    credits_required, synced_at)                     -- ppa/credits: numeric; synced_at: timestamptz NOT NULL
  student_record_entry(id, student_id, period_code, course_code, course_name, attempt,
    credits, grade, grade_raw, section_code, observation)   -- credits numeric(4,1); grade smallint null
  student_period_summary(id, student_id, period_code, average, relative_position, level,
    convalidated_courses, convalidated_credits, enrolled_courses, enrolled_credits,
    approved_courses, approved_credits, failed_courses, failed_credits)
  ```

- Consume — Tarea 2 y Tarea 7 (`src/modules/academic-record/academic-record.logic.ts`, que esta tarea amplía).
  La Tarea 2 crea el archivo con, al menos, este import —el único que el archivo necesita, porque la lógica es
  pura— y con `evaluateRecordTrust`, `approvedRows`, `failedRows`, `RecordTrust` y `CREDIT_TOLERANCE`; la
  Tarea 7 le agrega `cleanupBlockers` y `progressRemovedMessage`:
  ```ts
  import type { RecordPage, RecordRow } from "../portal-sync/portal-sync.types.js";
  ```

- Consume — repo actual (firmas exactas, copiadas de los archivos):
  ```ts
  // src/shared/middleware/auth-middleware.ts:8-15, :20, :92, :101
  export type AuthVariables = { userId: number; studentId?: number; teacherId?: number; role: string };
  export const authMiddleware: MiddlewareHandler
  export const requireRole = (...roles: string[]): MiddlewareHandler
  export const STUDENT_ROLES = ["student", "delegate", "subdelegate"] as const;
  // src/shared/errors/http-error.ts:4-14
  export class HttpError extends AppError {
    constructor(readonly statusCode: ContentfulStatusCode, message: string, code = "HTTP_ERROR", details?: unknown)
  }
  // src/events/index.ts:5  → export { EventBus, eventBus } from "./event-bus.js";   (new EventBus() no lleva argumentos)
  // src/db/index.ts:8      → export const db = drizzle(client, { schema: {...} });
  // src/shared/middleware/error-handler.ts:4 → export const errorHandler: ErrorHandler
  // src/config/app-config.ts:17-18 → config.auth.jwtSecret
  // Guarda de studentId, patrón de src/modules/portal-sync/portal-sync.controller.ts:10-14
  private requireStudentId(c: Context): number
  // Plantilla de módulo: src/modules/curriculum/index.ts y src/modules/avatar/avatar.routes.ts:15-28
  ```

- Produce (lo consume la Tarea 10 solo como suite verde; el frontend consume el DTO):
  ```ts
  // src/modules/academic-record/academic-record.types.ts
  export interface CountCreditsDto { courses: number | null; credits: number | null }
  export interface SnapshotRecord {
    ppa: number | null; relativePosition: string | null;
    convalidatedCourses: number | null; convalidatedCredits: number | null;
    approvedCourses: number | null; approvedCredits: number | null;
    creditsAccumulated: number | null; creditsRequired: number | null; syncedAt: Date;
  }
  export interface EntryRecord {
    periodCode: string; courseCode: string; courseName: string; attempt: number; credits: number;
    grade: number | null; gradeRaw: string | null; sectionCode: string | null; observation: string | null;
  }
  export interface PeriodSummaryRecord {
    periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
    convalidatedCourses: number | null; convalidatedCredits: number | null;
    enrolledCourses: number | null; enrolledCredits: number | null;
    approvedCourses: number | null; approvedCredits: number | null;
    failedCourses: number | null; failedCredits: number | null;
  }
  export interface AcademicRecordDto {
    syncedAt: string | null;
    snapshot: {
      ppa: number | null; relativePosition: string | null;
      creditsAccumulated: number | null; creditsRequired: number | null;
      approved: CountCreditsDto; convalidated: CountCreditsDto;
    } | null;
    periods: Array<{
      periodCode: string; average: number | null; relativePosition: string | null; level: number | null;
      convalidated: CountCreditsDto; enrolled: CountCreditsDto; approved: CountCreditsDto; failed: CountCreditsDto;
    }>;
    record: Array<{ periodCode: string; courses: Array<{
      code: string; name: string; attempt: number; credits: number; grade: number | null;
      gradeRaw: string | null; section: string | null; observation: string | null;
    }> }>;
  }

  // src/modules/academic-record/academic-record.logic.ts (se agrega al final)
  export const buildAcademicRecordDto = (
    snapshot: SnapshotRecord | null, entries: EntryRecord[], periods: PeriodSummaryRecord[],
  ): AcademicRecordDto

  // src/modules/academic-record/academic-record.repository.ts
  export class AcademicRecordRepository {
    constructor(readonly database: typeof db) {}
    findSnapshot(studentId: number): Promise<SnapshotRecord | null>
    findEntries(studentId: number): Promise<EntryRecord[]>
    findPeriodSummaries(studentId: number): Promise<PeriodSummaryRecord[]>
    deleteAll(studentId: number): Promise<void>
  }

  // src/modules/academic-record/academic-record.service.ts
  export class AcademicRecordService {
    constructor(readonly repository: AcademicRecordRepository, readonly events: EventBus) {}
    getMine(studentId: number): Promise<AcademicRecordDto>
    deleteMine(studentId: number): Promise<{ ok: true }>
  }

  // src/modules/academic-record/academic-record.controller.ts
  export class AcademicRecordController {
    constructor(readonly service: AcademicRecordService) {}
    getMine(c: Context): Promise<Response>
    deleteMine(c: Context): Promise<Response>
  }

  // src/modules/academic-record/academic-record.routes.ts
  export const createAcademicRecordRoutes = (controller: AcademicRecordController) => Hono

  // src/modules/academic-record/index.ts
  export const academicRecordRoutes
  // + re-exports de AcademicRecordController, AcademicRecordRepository, AcademicRecordService,
  //   createAcademicRecordRoutes y los tipos del contrato

  // src/modules/index.ts
  app.route("/academic-record", academicRecordRoutes);
  ```

- [ ] **Paso 1: Escribir la prueba que falla**

Crear `test/HU34_jeff/academic-record.routes.test.ts` con este contenido completo. Todos los valores son
inventados (alumno sintético; el DTO no lleva código de alumno).

```ts
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import jwt from "jsonwebtoken";

/**
 * RS-BE-26 y RS-BE-27 — GET y DELETE /academic-record/me.
 *
 * El récord son las notas del alumno: solo lo lee su dueño, sale únicamente del
 * token y la respuesta no se cachea. El DELETE borra las tres tablas de esta
 * funcionalidad y nada más: `student_course_progress` lo necesita la malla.
 *
 * La base es falsa y registra `{ sql, params }` de cada consulta. `mock.module`
 * va ANTES de cualquier `await import(...)` porque `authMiddleware` consulta
 * `token_version` en cada petición y el `.env` del worktree apunta a producción.
 */

type Consulta = { sql: string; params: unknown[] };
type Respuestas = { snapshot: unknown[]; record: unknown[]; periods: unknown[] };

const consultas: Consulta[] = [];
let respuestas: Respuestas = { snapshot: [], record: [], periods: [] };

const ejecutar = async (q: SQL) => {
  const { sql, params } = new PgDialect().sqlToQuery(q);
  consultas.push({ sql, params });
  if (sql.includes("token_version")) return [{ token_version: 1 }];
  if (sql.includes("student_academic_snapshot")) return respuestas.snapshot;
  if (sql.includes("student_record_entry")) return respuestas.record;
  if (sql.includes("student_period_summary")) return respuestas.periods;
  return [];
};

const fakeDb = {
  execute: ejecutar,
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ execute: ejecutar }),
};

mock.module("../../src/db/index.js", () => ({ db: fakeDb }));

const { AcademicRecordController } = await import(
  "../../src/modules/academic-record/academic-record.controller.js"
);
const { AcademicRecordRepository } = await import(
  "../../src/modules/academic-record/academic-record.repository.js"
);
const { AcademicRecordService } = await import(
  "../../src/modules/academic-record/academic-record.service.js"
);
const { createAcademicRecordRoutes } = await import(
  "../../src/modules/academic-record/academic-record.routes.js"
);
const { EventBus } = await import("../../src/events/index.js");
const { errorHandler } = await import("../../src/shared/middleware/error-handler.js");
const { config } = await import("../../src/config/app-config.js");

// La cadena se arma a mano, sin pasar por `academic-record/index.js`: esa
// instancia quedaría atada a la base que se evaluó primero.
const app = new Hono();
app.onError(errorHandler);
app.route(
  "/academic-record",
  createAcademicRecordRoutes(
    new AcademicRecordController(
      new AcademicRecordService(new AcademicRecordRepository(fakeDb as never), new EventBus()),
    ),
  ),
);

const tokenDe = (role: string, studentId = 42) =>
  jwt.sign({ sub: "1", studentId, role, tokenVersion: 1 }, config.auth.jwtSecret);

const tokenDocente = jwt.sign(
  { sub: "2", teacherId: 7, role: "teacher", tokenVersion: 1 },
  config.auth.jwtSecret,
);

const pedir = async (
  ruta: string,
  opciones: { token?: string; metodo?: string; datos?: Partial<Respuestas> } = {},
) => {
  consultas.length = 0;
  respuestas = { snapshot: [], record: [], periods: [], ...(opciones.datos ?? {}) };
  return await app.request(ruta, {
    method: opciones.metodo ?? "GET",
    ...(opciones.token ? { headers: { Authorization: `Bearer ${opciones.token}` } } : {}),
  });
};

// --- Filas tal como las devuelve Postgres: claves snake_case, `numeric` como
// string y `timestamptz` como string. Valores inventados. ---

const FILA_SNAPSHOT = {
  ppa: "14.6200",
  relative_position: "TERCIO SUPERIOR",
  convalidated_courses: 0,
  convalidated_credits: "0.0",
  approved_courses: 50,
  approved_credits: "164.0",
  credits_accumulated: "164.0",
  credits_required: "200.0",
  synced_at: "2026-09-18 15:00:00+00",
};

// Llegan desordenadas a propósito: el orden del contrato lo pone el DTO.
// `grade` viene como number en una fila y como string en otra: smallint puede
// llegar de las dos formas y las dos tienen que salir como number.
const FILAS_RECORD = [
  {
    period_code: "2023-1", course_code: "659001", course_name: "CURSO DE PRUEBA UNO",
    attempt: 1, credits: "4.0", grade: "8", grade_raw: "08",
    section_code: "101", observation: null,
  },
  {
    period_code: "2026-1", course_code: "659003", course_name: "CURSO DE PRUEBA TRES",
    attempt: 1, credits: "1.5", grade: null, grade_raw: null,
    section_code: "917", observation: null,
  },
  {
    period_code: "2026-1", course_code: "659004", course_name: "CURSO DE PRUEBA CUATRO",
    attempt: 2, credits: "3.0", grade: 17, grade_raw: "17",
    section_code: null, observation: "OBSERVACIÓN DE PRUEBA",
  },
];

const FILAS_PERIODOS = [
  {
    period_code: "2025-2", average: "13.2500", relative_position: "MEDIO SUPERIOR", level: 4,
    convalidated_courses: 0, convalidated_credits: "0.0",
    enrolled_courses: 7, enrolled_credits: "23.0",
    approved_courses: 5, approved_credits: "16.0",
    failed_courses: 2, failed_credits: "7.0",
  },
  // Bloque que el portal no dejó leer: todo null, nunca 0.
  {
    period_code: "2026-1", average: null, relative_position: null, level: null,
    convalidated_courses: null, convalidated_credits: null,
    enrolled_courses: null, enrolled_credits: null,
    approved_courses: null, approved_credits: null,
    failed_courses: null, failed_credits: null,
  },
];

const filaRecord = (ciclo: string, codigo: string) => ({
  period_code: ciclo, course_code: codigo, course_name: "CURSO DE PRUEBA",
  attempt: 1, credits: "3.0", grade: 14, grade_raw: "14",
  section_code: "101", observation: null,
});

describe("GET /academic-record/me: quien puede leer (RS-BE-26)", () => {
  test("sin token responde 401 MISSING_TOKEN", async () => {
    const res = await pedir("/academic-record/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
  });

  test("un token de docente responde 403 FORBIDDEN", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDocente });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("student, delegate y subdelegate leen su propio record", async () => {
    for (const rol of ["student", "delegate", "subdelegate"]) {
      const res = await pedir("/academic-record/me", { token: tokenDe(rol) });
      expect(res.status).toBe(200);
    }
  });

  test("no existe ruta para leer el record de otro alumno", async () => {
    // RS-BE-26: "no hay parámetro de alumno ni ruta para docentes o delegados".
    // El middleware corre igual (consulta token_version), pero no hay handler.
    const res = await pedir("/academic-record/1", { token: tokenDe("student") });
    expect(res.status).toBe(404);
    expect(consultas.filter((q) => !q.sql.includes("token_version"))).toHaveLength(0);
  });

  test("un token de alumno sin studentId util responde 403 FORBIDDEN", async () => {
    // La guarda del controller: `authMiddleware` acepta studentId 0 (es entero),
    // así que este caso la alcanza y ninguna tabla del récord se consulta.
    const res = await pedir("/academic-record/me", { token: tokenDe("student", 0) });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(consultas.filter((q) => !q.sql.includes("token_version"))).toHaveLength(0);
  });

  test("la respuesta lleva Cache-Control: no-store", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDe("student") });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("el alumno sale del token: ?studentId=99 se ignora", async () => {
    const res = await pedir("/academic-record/me?studentId=99", {
      token: tokenDe("student", 42),
      datos: { snapshot: [FILA_SNAPSHOT], record: FILAS_RECORD, periods: FILAS_PERIODOS },
    });
    expect(res.status).toBe(200);
    const delRecord = consultas.filter((q) => !q.sql.includes("token_version"));
    expect(delRecord).toHaveLength(3);
    for (const q of delRecord) {
      expect(q.params).toEqual([42]);
      // El id viaja como parámetro, nunca concatenado en el texto del SQL.
      expect(q.sql).not.toContain("99");
      expect(q.sql).not.toContain("42");
    }
  });
});

describe("GET /academic-record/me: contrato (RS-BE-26)", () => {
  test("sin sincronizar devuelve el estado vacio con 200", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDe("student") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      syncedAt: null, snapshot: null, periods: [], record: [],
    });
  });

  test("devuelve la foto, el resumen por ciclo y el record agrupado", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student"),
      datos: { snapshot: [FILA_SNAPSHOT], record: FILAS_RECORD, periods: FILAS_PERIODOS },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      syncedAt: "2026-09-18T15:00:00.000Z",
      snapshot: {
        ppa: 14.62,
        relativePosition: "TERCIO SUPERIOR",
        creditsAccumulated: 164,
        creditsRequired: 200,
        approved: { courses: 50, credits: 164 },
        convalidated: { courses: 0, credits: 0 },
      },
      periods: [
        {
          periodCode: "2026-1", average: null, relativePosition: null, level: null,
          convalidated: { courses: null, credits: null },
          enrolled: { courses: null, credits: null },
          approved: { courses: null, credits: null },
          failed: { courses: null, credits: null },
        },
        {
          periodCode: "2025-2", average: 13.25, relativePosition: "MEDIO SUPERIOR", level: 4,
          convalidated: { courses: 0, credits: 0 },
          enrolled: { courses: 7, credits: 23 },
          approved: { courses: 5, credits: 16 },
          failed: { courses: 2, credits: 7 },
        },
      ],
      record: [
        {
          periodCode: "2026-1",
          courses: [
            {
              code: "659003", name: "CURSO DE PRUEBA TRES", attempt: 1, credits: 1.5,
              grade: null, gradeRaw: null, section: "917", observation: null,
            },
            {
              code: "659004", name: "CURSO DE PRUEBA CUATRO", attempt: 2, credits: 3,
              grade: 17, gradeRaw: "17", section: null, observation: "OBSERVACIÓN DE PRUEBA",
            },
          ],
        },
        {
          periodCode: "2023-1",
          courses: [
            {
              code: "659001", name: "CURSO DE PRUEBA UNO", attempt: 1, credits: 4,
              grade: 8, gradeRaw: "08", section: "101", observation: null,
            },
          ],
        },
      ],
    });
  });

  test("un 0 del portal no se confunde con un campo sin dato", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student"),
      datos: {
        snapshot: [{
          ...FILA_SNAPSHOT,
          ppa: null, relative_position: null,
          convalidated_courses: 0, convalidated_credits: "0.0",
          credits_accumulated: null,
        }],
      },
    });
    expect(await res.json()).toMatchObject({
      snapshot: {
        ppa: null,
        relativePosition: null,
        creditsAccumulated: null,
        convalidated: { courses: 0, credits: 0 },
      },
    });
  });

  test("los ciclos van del mas reciente al mas viejo aunque lleguen en otro orden", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student"),
      datos: {
        record: [
          filaRecord("2024-2", "659010"),
          filaRecord("2026-1", "659011"),
          filaRecord("2024-1", "659012"),
          filaRecord("2025-2", "659013"),
        ],
        periods: [
          { ...FILAS_PERIODOS[0], period_code: "2024-1" },
          { ...FILAS_PERIODOS[0], period_code: "2026-1" },
        ],
      },
    });
    const dto = (await res.json()) as {
      record: Array<{ periodCode: string }>;
      periods: Array<{ periodCode: string }>;
    };
    expect(dto.record.map((r) => r.periodCode)).toEqual(["2026-1", "2025-2", "2024-2", "2024-1"]);
    expect(dto.periods.map((p) => p.periodCode)).toEqual(["2026-1", "2024-1"]);
  });
});

describe("DELETE /academic-record/me (RS-BE-27)", () => {
  test("sin token responde 401 MISSING_TOKEN", async () => {
    const res = await pedir("/academic-record/me", { metodo: "DELETE" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "MISSING_TOKEN" } });
  });

  test("un token de docente responde 403 FORBIDDEN", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDocente, metodo: "DELETE" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  test("responde { ok: true } y borra en las tres tablas del record", async () => {
    const res = await pedir("/academic-record/me", {
      token: tokenDe("student", 42), metodo: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const borrados = consultas.filter((q) => q.sql.includes("delete from"));
    expect(borrados).toHaveLength(3);
    expect(borrados.map((q) => q.params)).toEqual([[42], [42], [42]]);
    for (const tabla of [
      "student_record_entry", "student_period_summary", "student_academic_snapshot",
    ]) {
      expect(
        borrados.some((q) => q.sql.includes(`delete from ${tabla} where student_id = $1`)),
      ).toBe(true);
    }
  });

  test("no toca student_course_progress ni el resto de lo importado", async () => {
    await pedir("/academic-record/me", { token: tokenDe("student"), metodo: "DELETE" });
    for (const q of consultas) {
      expect(q.sql).not.toContain("student_course_progress");
      expect(q.sql).not.toContain("student_curriculum_simulation");
      expect(q.sql).not.toContain("enrollment");
    }
  });

  test("la respuesta lleva Cache-Control: no-store", async () => {
    const res = await pedir("/academic-record/me", { token: tokenDe("student"), metodo: "DELETE" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
```

Notas para el ejecutor:
- `new Date("2026-09-18 15:00:00+00").toISOString()` da `"2026-09-18T15:00:00.000Z"` en Bun (comprobado): por
  eso el contrato lleva milisegundos aunque el ejemplo de la spec (línea 321) los omita.
- El bucle final de "no toca student_course_progress" recorre **todas** las consultas, incluida la de
  `token_version` de `authMiddleware`: ninguna de las tres cadenas prohibidas aparece ahí.
- Los tres `select` del GET se cuentan en el caso de `?studentId=99`: si en el futuro el service agrega una
  cuarta lectura, ese `toHaveLength(3)` es el que avisa.
- No agregues un `expect` sobre el orden de los `select`: el contrato no lo fija.

- [ ] **Paso 2: Correr la prueba y ver que falla**

Primero, comprobar las precondiciones (Tareas 2, 4 y 7 commiteadas; el módulo todavía no existe). Los comandos
van separados con `;` a propósito: con `&&` un `grep -c` que devuelve 0 corta la cadena y los demás no llegan a
correr.

```bash
cd . && ls src/modules/academic-record/; grep -c "export const evaluateRecordTrust" src/modules/academic-record/academic-record.logic.ts; grep -c "export const progressRemovedMessage" src/modules/academic-record/academic-record.logic.ts; grep -c "studentAcademicSnapshot" src/db/schema/schema.ts; grep -n "^import" src/modules/academic-record/academic-record.logic.ts
```

Esperado: el listado contiene **solo** `academic-record.logic.ts`; los dos primeros `grep -c` dan `1`; el del
schema da **1 o más** (si da `0`, falta la Tarea 4: PARAR y completarla); y el último `grep -n` imprime las
líneas `import` del archivo — anotar el número de la **última**, que es donde el Paso 3.2 inserta el bloque
nuevo.

Después, la prueba:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/academic-record.routes.test.ts
```

Esperado: FAIL al cargar el archivo, con

```
# Unhandled error between tests
error: Cannot find module '../../src/modules/academic-record/academic-record.controller.js' from './test/HU34_jeff/academic-record.routes.test.ts'
```

y el resumen `0 pass`, `1 fail`, `1 error`. Ninguna prueba llega a correr.

- [ ] **Paso 3: Implementación mínima**

**3.1. Crear `src/modules/academic-record/academic-record.types.ts`** con este contenido completo:

```ts
/**
 * Tipos del récord académico.
 *
 * Los `*Record` son lo que devuelve el repository: una fila por objeto, ya
 * convertida (`numeric` y `smallint` a number, `timestamptz` a Date). El
 * `AcademicRecordDto` es el contrato que ve el alumno (RS-BE-26): todo número
 * viaja como number JSON —nunca como string— y un campo sin dato viaja como
 * null, nunca como 0. En los pares de cursos y créditos cada número va por
 * separado, porque el portal puede dejar uno solo sin leer.
 */

/** Par "cursos | créditos" de la información académica. */
export interface CountCreditsDto {
  courses: number | null;
  credits: number | null;
}

/** Fila de `student_academic_snapshot`. `syncedAt` es la fecha de la copia
 *  visible y nunca es null: la columna es NOT NULL. */
export interface SnapshotRecord {
  ppa: number | null;
  relativePosition: string | null;
  convalidatedCourses: number | null;
  convalidatedCredits: number | null;
  approvedCourses: number | null;
  approvedCredits: number | null;
  creditsAccumulated: number | null;
  creditsRequired: number | null;
  syncedAt: Date;
}

/** Fila de `student_record_entry`. `credits` conserva el decimal del portal. */
export interface EntryRecord {
  periodCode: string;
  courseCode: string;
  courseName: string;
  attempt: number;
  credits: number;
  grade: number | null;
  gradeRaw: string | null;
  sectionCode: string | null;
  observation: string | null;
}

/** Fila de `student_period_summary`. */
export interface PeriodSummaryRecord {
  periodCode: string;
  average: number | null;
  relativePosition: string | null;
  level: number | null;
  convalidatedCourses: number | null;
  convalidatedCredits: number | null;
  enrolledCourses: number | null;
  enrolledCredits: number | null;
  approvedCourses: number | null;
  approvedCredits: number | null;
  failedCourses: number | null;
  failedCredits: number | null;
}

/** Respuesta de `GET /academic-record/me`. */
export interface AcademicRecordDto {
  /** ISO-8601 de `student_academic_snapshot.synced_at`, o null si no hay foto. */
  syncedAt: string | null;
  snapshot: {
    ppa: number | null;
    relativePosition: string | null;
    creditsAccumulated: number | null;
    creditsRequired: number | null;
    approved: CountCreditsDto;
    convalidated: CountCreditsDto;
  } | null;
  periods: Array<{
    periodCode: string;
    average: number | null;
    relativePosition: string | null;
    level: number | null;
    convalidated: CountCreditsDto;
    enrolled: CountCreditsDto;
    approved: CountCreditsDto;
    failed: CountCreditsDto;
  }>;
  /** Ciclos del más reciente al más viejo; dentro, los cursos en el orden leído. */
  record: Array<{
    periodCode: string;
    courses: Array<{
      code: string;
      name: string;
      attempt: number;
      credits: number;
      grade: number | null;
      gradeRaw: string | null;
      section: string | null;
      observation: string | null;
    }>;
  }>;
}
```

**3.2. Modificar `src/modules/academic-record/academic-record.logic.ts`** (dos cambios; el archivo lo dejaron
las Tareas 2 y 7, así que la inserción se ubica por el `grep -n "^import"` del Paso 2, no por un número de
línea fijo).

**Cambio A — imports.** Insertar este bloque **justo después de la última línea `import` del archivo** (la
Tarea 2 deja al menos `import type { RecordPage, RecordRow } from "../portal-sync/portal-sync.types.js";`; si
la Tarea 7 agregó otro `import`, el bloque va después de ese). No se toca ningún import existente:

```ts
import type {
  AcademicRecordDto,
  EntryRecord,
  PeriodSummaryRecord,
  SnapshotRecord,
} from "./academic-record.types.js";
```

Comprobación después de escribirlo:

```bash
cd . && grep -n "^import\|^}" src/modules/academic-record/academic-record.logic.ts | head -20
```

Esperado: los imports quedan todos juntos al principio, sin ninguna línea de código entre ellos.

**Cambio B — la función.** Agregar este bloque **al final del archivo**, después de lo último que dejó la
Tarea 7 (`progressRemovedMessage`). No se toca nada de lo anterior:

```ts
/** Orden de ciclos del más reciente al más viejo. Los códigos son "AAAA-N":
 *  mismo largo, dígitos y guion, así que el orden de string descendente es el
 *  cronológico inverso ("2026-2" > "2026-1" > "2025-2"). */
const cicloDesc = (a: string, b: string): number => (a < b ? 1 : a > b ? -1 : 0);

/**
 * RS-BE-26: arma la respuesta de `GET /academic-record/me` con lo que leyó el
 * repository. Función pura: no consulta nada, no inventa valores y no
 * convierte un null en 0. Los ciclos salen del más reciente al más viejo; los
 * cursos de cada ciclo, en el orden en que llegaron.
 */
export const buildAcademicRecordDto = (
  snapshot: SnapshotRecord | null,
  entries: EntryRecord[],
  periods: PeriodSummaryRecord[],
): AcademicRecordDto => {
  const porCiclo = new Map<string, AcademicRecordDto["record"][number]["courses"]>();
  for (const entrada of entries) {
    const cursos = porCiclo.get(entrada.periodCode) ?? [];
    cursos.push({
      code: entrada.courseCode,
      name: entrada.courseName,
      attempt: entrada.attempt,
      credits: entrada.credits,
      grade: entrada.grade,
      gradeRaw: entrada.gradeRaw,
      section: entrada.sectionCode,
      observation: entrada.observation,
    });
    porCiclo.set(entrada.periodCode, cursos);
  }

  return {
    syncedAt: snapshot ? snapshot.syncedAt.toISOString() : null,
    snapshot: snapshot
      ? {
          ppa: snapshot.ppa,
          relativePosition: snapshot.relativePosition,
          creditsAccumulated: snapshot.creditsAccumulated,
          creditsRequired: snapshot.creditsRequired,
          approved: { courses: snapshot.approvedCourses, credits: snapshot.approvedCredits },
          convalidated: {
            courses: snapshot.convalidatedCourses,
            credits: snapshot.convalidatedCredits,
          },
        }
      : null,
    periods: [...periods]
      .sort((a, b) => cicloDesc(a.periodCode, b.periodCode))
      .map((p) => ({
        periodCode: p.periodCode,
        average: p.average,
        relativePosition: p.relativePosition,
        level: p.level,
        convalidated: { courses: p.convalidatedCourses, credits: p.convalidatedCredits },
        enrolled: { courses: p.enrolledCourses, credits: p.enrolledCredits },
        approved: { courses: p.approvedCourses, credits: p.approvedCredits },
        failed: { courses: p.failedCourses, credits: p.failedCredits },
      })),
    record: [...porCiclo.entries()]
      .map(([periodCode, courses]) => ({ periodCode, courses }))
      .sort((a, b) => cicloDesc(a.periodCode, b.periodCode)),
  };
};
```

**3.3. Crear `src/modules/academic-record/academic-record.repository.ts`** con este contenido completo:

```ts
import { sql } from "drizzle-orm";
import type { db } from "../../db/index.js";
import type {
  EntryRecord,
  PeriodSummaryRecord,
  SnapshotRecord,
} from "./academic-record.types.js";

/** Fila cruda de `database.execute`: claves snake_case y valores sin convertir. */
type Fila = Record<string, unknown>;

/** El driver devuelve `numeric` como string y `smallint`/`integer` como number:
 *  `Number` cubre los dos casos. El null se conserva, porque 0 es un dato y
 *  "sin dato" es null (RS-BE-24 y §Contrato). */
const numero = (valor: unknown): number | null => (valor == null ? null : Number(valor));
const texto = (valor: unknown): string | null => (valor == null ? null : String(valor));

/**
 * Lecturas y borrado de las tres tablas del récord. SQL crudo, como el resto
 * de los repositories del repo. Todas las consultas filtran por `student_id` y
 * lo pasan como parámetro: el id lo pone el controller desde el token y nunca
 * se concatena en el texto de la consulta.
 */
export class AcademicRecordRepository {
  constructor(readonly database: typeof db) {}

  async findSnapshot(studentId: number): Promise<SnapshotRecord | null> {
    const filas = await this.database.execute(sql`
      select ppa, relative_position, convalidated_courses, convalidated_credits,
             approved_courses, approved_credits, credits_accumulated, credits_required, synced_at
      from student_academic_snapshot
      where student_id = ${studentId}
      limit 1
    `) as unknown as Fila[];

    const fila = filas[0];
    if (!fila) return null;

    return {
      ppa: numero(fila.ppa),
      relativePosition: texto(fila.relative_position),
      convalidatedCourses: numero(fila.convalidated_courses),
      convalidatedCredits: numero(fila.convalidated_credits),
      approvedCourses: numero(fila.approved_courses),
      approvedCredits: numero(fila.approved_credits),
      creditsAccumulated: numero(fila.credits_accumulated),
      creditsRequired: numero(fila.credits_required),
      // `timestamptz` también vuelve como string con este driver.
      syncedAt: new Date(fila.synced_at as string),
    };
  }

  async findEntries(studentId: number): Promise<EntryRecord[]> {
    const filas = await this.database.execute(sql`
      select period_code, course_code, course_name, attempt, credits,
             grade, grade_raw, section_code, observation
      from student_record_entry
      where student_id = ${studentId}
      order by period_code desc, id asc
    `) as unknown as Fila[];

    return filas.map((fila) => ({
      periodCode: String(fila.period_code),
      courseCode: String(fila.course_code),
      courseName: String(fila.course_name),
      attempt: Number(fila.attempt),
      credits: Number(fila.credits),
      grade: numero(fila.grade),
      gradeRaw: texto(fila.grade_raw),
      sectionCode: texto(fila.section_code),
      observation: texto(fila.observation),
    }));
  }

  async findPeriodSummaries(studentId: number): Promise<PeriodSummaryRecord[]> {
    const filas = await this.database.execute(sql`
      select period_code, average, relative_position, level,
             convalidated_courses, convalidated_credits,
             enrolled_courses, enrolled_credits,
             approved_courses, approved_credits,
             failed_courses, failed_credits
      from student_period_summary
      where student_id = ${studentId}
      order by period_code desc
    `) as unknown as Fila[];

    return filas.map((fila) => ({
      periodCode: String(fila.period_code),
      average: numero(fila.average),
      relativePosition: texto(fila.relative_position),
      level: numero(fila.level),
      convalidatedCourses: numero(fila.convalidated_courses),
      convalidatedCredits: numero(fila.convalidated_credits),
      enrolledCourses: numero(fila.enrolled_courses),
      enrolledCredits: numero(fila.enrolled_credits),
      approvedCourses: numero(fila.approved_courses),
      approvedCredits: numero(fila.approved_credits),
      failedCourses: numero(fila.failed_courses),
      failedCredits: numero(fila.failed_credits),
    }));
  }

  /**
   * RS-BE-27: borra las tres tablas del récord del alumno, todo o nada. No
   * toca `student_course_progress`: ese progreso lo necesita la malla y es de
   * otra funcionalidad. Si el alumno vuelve a sincronizar y acepta, la copia
   * se guarda otra vez.
   */
  async deleteAll(studentId: number): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.execute(sql`delete from student_record_entry where student_id = ${studentId}`);
      await tx.execute(sql`delete from student_period_summary where student_id = ${studentId}`);
      await tx.execute(sql`delete from student_academic_snapshot where student_id = ${studentId}`);
    });
  }
}
```

**3.4. Crear `src/modules/academic-record/academic-record.service.ts`** con este contenido completo:

```ts
import type { EventBus } from "../../events/index.js";
import { buildAcademicRecordDto } from "./academic-record.logic.js";
import type { AcademicRecordRepository } from "./academic-record.repository.js";
import type { AcademicRecordDto } from "./academic-record.types.js";

/**
 * RS-BE-26 y RS-BE-27. El service no importa `db`: recibe el repository ya
 * construido. `events` está por la arquitectura del repo (igual que en
 * `curriculum.service.ts:5-9`); esta funcionalidad todavía no publica eventos.
 */
export class AcademicRecordService {
  constructor(
    readonly repository: AcademicRecordRepository,
    readonly events: EventBus,
  ) {}

  /** Todo lo que el alumno ve de su récord. Si nunca sincronizó con
   *  consentimiento y un récord de confianza, las tres lecturas vienen vacías
   *  y el DTO sale en su estado vacío, con 200. */
  async getMine(studentId: number): Promise<AcademicRecordDto> {
    const snapshot = await this.repository.findSnapshot(studentId);
    const entries = await this.repository.findEntries(studentId);
    const periods = await this.repository.findPeriodSummaries(studentId);
    return buildAcademicRecordDto(snapshot, entries, periods);
  }

  async deleteMine(studentId: number): Promise<{ ok: true }> {
    await this.repository.deleteAll(studentId);
    return { ok: true };
  }
}
```

**3.5. Crear `src/modules/academic-record/academic-record.controller.ts`** con este contenido completo:

```ts
import type { Context } from "hono";
import { HttpError } from "../../shared/errors/http-error.js";
import type { AcademicRecordService } from "./academic-record.service.js";

export class AcademicRecordController {
  constructor(readonly service: AcademicRecordService) {}

  /**
   * RS-BE-26: el alumno sale SOLO del token. No hay parámetro ni ruta para
   * leer el récord de otro, ni para docentes o delegados. `authMiddleware`
   * acepta un `studentId` 0 (es entero), así que esta guarda sí se alcanza y
   * corta antes de consultar nada. El código y el texto son los mismos que ya
   * devuelve `requireRole`, para no inventar un mensaje nuevo.
   */
  private requireStudentId(c: Context): number {
    const studentId = c.get("studentId");
    if (!studentId) {
      throw new HttpError(403, "No tiene permisos para acceder a este recurso.", "FORBIDDEN");
    }
    return Number(studentId);
  }

  async getMine(c: Context): Promise<Response> {
    return c.json(await this.service.getMine(this.requireStudentId(c)));
  }

  async deleteMine(c: Context): Promise<Response> {
    return c.json(await this.service.deleteMine(this.requireStudentId(c)));
  }
}
```

**3.6. Crear `src/modules/academic-record/academic-record.routes.ts`** con este contenido completo:

```ts
import { Hono } from "hono";
import {
  authMiddleware, requireRole, STUDENT_ROLES, type AuthVariables,
} from "../../shared/middleware/auth-middleware.js";
import type { AcademicRecordController } from "./academic-record.controller.js";

/**
 * Récord académico del alumno (RS-BE-26 y RS-BE-27).
 *
 * Solo el dueño de los datos: `requireRole(...STUDENT_ROLES)` deja fuera a los
 * docentes y el `studentId` sale del token, así que no hay forma de pedir el
 * récord de otra persona.
 *
 * `Cache-Control: no-store` va en un middleware propio para cubrir el GET y el
 * DELETE a la vez: son las notas del alumno y no se guardan en ninguna caché
 * intermedia. Va después de la autenticación, igual que el header que pone
 * `rate-limit.ts:26-28` antes de `next()`.
 */
export const createAcademicRecordRoutes = (controller: AcademicRecordController) => {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.use("*", authMiddleware);
  app.use("*", requireRole(...STUDENT_ROLES));
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });

  app.get("/me", (c) => controller.getMine(c));
  app.delete("/me", (c) => controller.deleteMine(c));

  return app;
};
```

**3.7. Crear `src/modules/academic-record/index.ts`** con este contenido completo:

```ts
import { db } from "../../db/index.js";
import { eventBus } from "../../events/index.js";
import { AcademicRecordController } from "./academic-record.controller.js";
import { AcademicRecordRepository } from "./academic-record.repository.js";
import { createAcademicRecordRoutes } from "./academic-record.routes.js";
import { AcademicRecordService } from "./academic-record.service.js";

const academicRecordRepository = new AcademicRecordRepository(db);
const academicRecordService = new AcademicRecordService(academicRecordRepository, eventBus);
const academicRecordController = new AcademicRecordController(academicRecordService);

export const academicRecordRoutes = createAcademicRecordRoutes(academicRecordController);

export { AcademicRecordController } from "./academic-record.controller.js";
export { AcademicRecordRepository } from "./academic-record.repository.js";
export { AcademicRecordService } from "./academic-record.service.js";
export { createAcademicRecordRoutes } from "./academic-record.routes.js";
export type {
  AcademicRecordDto, CountCreditsDto, EntryRecord, PeriodSummaryRecord, SnapshotRecord,
} from "./academic-record.types.js";
```

`portal-sync.service.ts` importa la lógica por su ruta directa
(`../academic-record/academic-record.logic.js`, Tarea 6) y no por este `index.ts`: así la importación no
arrastra `db` ni el router.

**3.8. Modificar `src/modules/index.ts`** (dos cambios).

Reemplazar esto (líneas 17-19):

```ts
import { portalSyncRoutes } from "./portal-sync/index.js";

export const registerModules = (app: Hono) => {
```

por esto:

```ts
import { portalSyncRoutes } from "./portal-sync/index.js";
import { academicRecordRoutes } from "./academic-record/index.js";

export const registerModules = (app: Hono) => {
```

Y reemplazar esto (líneas 35-36):

```ts
  app.route("/portal-sync", portalSyncRoutes);
};
```

por esto:

```ts
  app.route("/portal-sync", portalSyncRoutes);
  app.route("/academic-record", academicRecordRoutes);
};
```

- [ ] **Paso 4: Correr la prueba y ver que pasa**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/academic-record.routes.test.ts
```

Esperado: PASS, `16 pass`, `0 fail`, `55 expect() calls`.

- [ ] **Paso 5: El guardia del chatbot (RS-BE-28)**

Crear `test/HU34_jeff/chatbot-isolation.test.ts` con este contenido completo:

```ts
import { describe, expect, test } from "bun:test";

/**
 * RS-BE-28: el récord queda fuera del alcance del chatbot.
 *
 * El chatbot manda su contexto a un proveedor externo (Cohere). Esta prueba fija
 * que ni el repository ni el service del chatbot nombran las tablas del récord
 * ni importan el módulo `academic-record`, para que nadie lo conecte después
 * "porque sería útil". Es un guardia: pasa desde el primer día.
 */

const ARCHIVOS = [
  "src/modules/chatbot/chatbot.repository.ts",
  "src/modules/chatbot/chatbot.service.ts",
];

// Los nombres SQL y los identificadores que tendrían esas tablas en schema.ts:
// con el constructor de consultas de Drizzle se puede leer una tabla sin
// escribir nunca su nombre SQL. No se busca el prefijo "student_": el chatbot
// lee legítimamente student_course_progress y student_score.
const PROHIBIDOS = [
  "student_record_entry", "student_academic_snapshot", "student_period_summary",
  "studentRecordEntry", "studentAcademicSnapshot", "studentPeriodSummary",
];

describe("RS-BE-28: el chatbot no ve el record", () => {
  for (const ruta of ARCHIVOS) {
    test(`${ruta} no nombra las tablas del record`, async () => {
      // Si el archivo se renombra o se borra, Bun.file falla y el test también:
      // el guardia no se vuelve verde por desaparecer su objeto.
      const texto = await Bun.file(ruta).text();
      expect(texto.length).toBeGreaterThan(0);
      for (const prohibido of PROHIBIDOS) expect(texto).not.toContain(prohibido);
    });

    test(`${ruta} no importa el modulo academic-record`, async () => {
      const texto = await Bun.file(ruta).text();
      expect(texto).not.toMatch(/from\s+["'][^"']*academic-record[^"']*["']/);
      expect(texto).not.toMatch(/import\s*\(\s*["'][^"']*academic-record/);
    });
  }
});
```

Correrlo:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/chatbot-isolation.test.ts
```

Esperado: PASS, `4 pass`, `0 fail`.

Como este guardia pasa desde el principio, hay que comprobar que **puede** fallar. Antes de ensuciar el
archivo, confirmar que no tiene cambios sin commitear —el `git checkout --` de después los borraría, y en este
árbol trabaja más de una sesión:

```bash
cd . && git status --short src/modules/chatbot/chatbot.repository.ts
```

Esperado: **no imprime nada**. Si imprime algo, PARAR: no ensuciar el archivo ni correr el `git checkout`;
avisar al dueño y dar el guardia por verificado solo con el `4 pass`.

Con el archivo limpio, ensuciarlo a propósito, correr y revertir (el `git checkout` no es opcional):

```bash
cd . && printf '\n// prueba del guardia: student_record_entry\n' >> src/modules/chatbot/chatbot.repository.ts && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/chatbot-isolation.test.ts; git checkout -- src/modules/chatbot/chatbot.repository.ts && git status --short src/modules/chatbot/
```

Esperado: `3 pass`, `1 fail` en
`(fail) RS-BE-28: el chatbot no ve el record > src/modules/chatbot/chatbot.repository.ts no nombra las tablas del record`,
con `error: expect(received).not.toContain(expected)` y `Expected to not contain: "student_record_entry"`
(el volcado del archivo entero en la salida es normal). Después del `git checkout`, `git status --short` no
imprime nada. Volver a correr el comando anterior y confirmar `4 pass`.

- [ ] **Paso 6: Build**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: `$ tsc` sin ningún error y exit 0. `tsc` compila solo `src/`, así que este paso valida los siete
archivos del módulo y `src/modules/index.ts`; los tests no entran. Si reclama por `noUnusedParameters` en el
middleware del header, revisar que use `c` y `next` (los usa: `c.header(...)` y `await next()`).

- [ ] **Paso 7: Regresión de la carpeta HU34**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff
```

Esperado: `0 fail`, con los archivos de las Tareas 1 a 8 en verde además de los dos nuevos. Esta tarea no
modifica ningún archivo de `src/` que ya existiera salvo `src/modules/index.ts` (dos líneas agregadas) y
`academic-record.logic.ts` (un bloque de imports y una función nuevos), y ninguna prueba del repo importa
`src/modules/index.ts` ni `src/server.ts`, así que no hay otra regresión que medir; la suite completa es de la
Tarea 10.

- [ ] **Paso 8: Documentación**

**8.1. `docs/specs/api-contracts.md`.** La sección nueva se **anexa al final del archivo, sin reemplazar ninguna línea existente**. Ojo: la última línea ya **no** es la de sílabos —la Tarea 7, que corre antes, agregó debajo la viñeta de la limpieza de electivos—, así que un reemplazo anclado en la de sílabos metería la sección nueva en medio de la sección de Portal Sync y dejaría la viñeta de la limpieza colgando del encabezado equivocado. Confirmar primero dónde termina el archivo:

```bash
cd . && tail -n 1 docs/specs/api-contracts.md; grep -c "Limpieza de electivos (RS-BE-23)" docs/specs/api-contracts.md
```

Esperado: la última línea es la viñeta que dejó la Tarea 7 (`  - **Limpieza de electivos (RS-BE-23)**: …`) y el `grep -c` da `1`. Si da `0`, falta la Tarea 7: PARAR y completarla.

Dejar esa última línea intacta y **añadir debajo**, separada por una línea en blanco, esto:

````md
## Academic Record (récord académico)

Copia del récord que la importación guarda cuando el alumno da su consentimiento y el récord es de confianza. Detalle en `specs/features/academic-record/academic-record.spec.md`. **Solo el dueño de los datos los lee**: el alumno sale del JWT, no hay parámetro ni ruta para docentes o delegados, y el chatbot no toca estas tablas (RS-BE-28).

### GET /academic-record/me

Récord del alumno autenticado: la foto acumulada, el resumen por ciclo y el récord agrupado por ciclo, del más reciente al más viejo.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK` (todos los valores del ejemplo son inventados; el DTO no lleva código de alumno, porque el alumno se identifica por el token):
  ```json
  {
    "syncedAt": "2026-09-18T15:00:00.000Z",
    "snapshot": {
      "ppa": 14.62,
      "relativePosition": "TERCIO SUPERIOR",
      "creditsAccumulated": 164,
      "creditsRequired": 200,
      "approved": { "courses": 50, "credits": 164 },
      "convalidated": { "courses": 0, "credits": 0 }
    },
    "periods": [
      {
        "periodCode": "2025-2",
        "average": 13.25,
        "relativePosition": "MEDIO SUPERIOR",
        "level": 4,
        "convalidated": { "courses": 0, "credits": 0 },
        "enrolled": { "courses": 7, "credits": 23 },
        "approved": { "courses": 5, "credits": 16 },
        "failed": { "courses": 2, "credits": 7 }
      }
    ],
    "record": [
      {
        "periodCode": "2026-1",
        "courses": [
          {
            "code": "659003",
            "name": "CURSO DE PRUEBA TRES",
            "attempt": 1,
            "credits": 1.5,
            "grade": null,
            "gradeRaw": null,
            "section": "917",
            "observation": null
          }
        ]
      }
    ]
  }
  ```
- **`Cache-Control: no-store`** en la respuesta: son las notas del alumno y no se guardan en ninguna caché intermedia.
- **Orden**: `record` y `periods` van del ciclo más reciente al más viejo; dentro de cada ciclo, los cursos en el orden en que el portal los listó.
- **Tipos**: todo numérico es `number`, nunca string; `credits`, `ppa`, `average` y los `credits*` pueden traer decimal, y `attempt`, `grade`, `level` y los `courses` son enteros. Un campo sin dato es `null`, nunca 0, y en los pares `{ courses, credits }` cada número va por separado.
- `syncedAt` es `student_academic_snapshot.synced_at` en ISO-8601 UTC con milisegundos, o `null` si no hay foto.
- **Estado vacío**: si el alumno nunca sincronizó —o nunca con consentimiento y un récord de confianza— la respuesta es `{ "syncedAt": null, "snapshot": null, "periods": [], "record": [] }` con `200`.
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`

### DELETE /academic-record/me

Borra la copia del récord del alumno autenticado: `student_record_entry`, `student_period_summary` y `student_academic_snapshot`, en una sola transacción.

- **Auth**: Bearer token, roles `student`, `delegate`, `subdelegate`
- **Response** `200 OK`: `{ "ok": true }`
- **`Cache-Control: no-store`** también en esta respuesta.
- **No** toca `student_course_progress`: ese progreso lo necesita la malla y es de otra funcionalidad. Tampoco borra matrícula, horario ni notas oficiales.
- Si el alumno vuelve a sincronizar y acepta de nuevo, la copia se guarda otra vez.
- **Errors**: `401` `MISSING_TOKEN`, `401` `INVALID_TOKEN`, `403` `FORBIDDEN`
````

**8.2. `docs/specs/feature-index.md`.** Reemplazar esto (línea 22, última fila de la tabla):

```md
| 16 | Registro de alumno | `specs/features/registro/registro.spec.md` | RS-BE-17, RS-BE-18 | Alta de cuenta autenticando contra miUlima y cargando el ciclo en el mismo acto | `src/modules/auth`, `src/modules/portal-sync` | Aprobada — pendiente de implementar |
```

por esto:

```md
| 16 | Registro de alumno | `specs/features/registro/registro.spec.md` | RS-BE-17, RS-BE-18 | Alta de cuenta autenticando contra miUlima y cargando el ciclo en el mismo acto | `src/modules/auth`, `src/modules/portal-sync` | Aprobada — pendiente de implementar |
| 17 | Récord académico | `specs/features/academic-record/academic-record.spec.md` | RS-BE-19 … RS-BE-29 | Copia del récord del portal con el consentimiento del alumno, lectura y borrado por su propio dueño, y limpieza de los electivos que el récord no respalda | `src/modules/academic-record`, `src/modules/portal-sync`, `src/modules/auth` | Aprobada — en implementación |
```

(La tabla no tiene prioridad 15 y termina en la 16, así que la siguiente es la 17; las columnas son
`Priority | Feature | Spec | User Stories | Requirements | Backend target | Status`, y la fila 14 ya usa la
misma convención de poner los `RS-BE-xx` en *User Stories*.)

- [ ] **Paso final: Commit**

```bash
cd . && git status --short && git add src/modules/academic-record/academic-record.types.ts src/modules/academic-record/academic-record.logic.ts src/modules/academic-record/academic-record.repository.ts src/modules/academic-record/academic-record.service.ts src/modules/academic-record/academic-record.controller.ts src/modules/academic-record/academic-record.routes.ts src/modules/academic-record/index.ts src/modules/index.ts test/HU34_jeff/academic-record.routes.test.ts test/HU34_jeff/chatbot-isolation.test.ts docs/specs/api-contracts.md docs/specs/feature-index.md && git commit -m "feat(academic-record): lectura y borrado del récord, fuera del alcance del chatbot (RS-BE-26, RS-BE-27, RS-BE-28)"
```

Sin trailer Co-Authored-By y sin push. En el `git status --short` de adelante, `src/modules/chatbot/chatbot.repository.ts`
**no** debe aparecer modificado: si aparece, falta el `git checkout --` del Paso 5.

Las rutas quedan registradas pero **la base todavía no tiene las tablas**: hasta que el dueño aplique
`drizzle/0011_academic_record.sql` (paso PARAR de la Tarea 10), `GET /academic-record/me` contra la base real
falla con `relation "student_academic_snapshot" does not exist`. Por eso la Tarea 10 pide no desplegar ni
hacer merge antes de la migración.

### Tarea 10: Cierre: suite completa, enlaces de la spec y migración (PARAR)

Esta es la única tarea del plan que **no escribe código ni pruebas nuevas**. Su trabajo es demostrar, con comandos y salidas concretas, que la rama `feat/record-academico` quedó entera y coherente: la suite completa en verde comparada contra la línea base que midió el Paso 0 de la Tarea 1, el build limpio, cada `[@test]` de la spec apuntando a un archivo que existe, cada archivo de `src/` y `drizzle/` que la rama tocó cubierto por un `target` que existe, y ningún dato real ni ruta del scratchpad dentro de un repo que es **público**. Termina con un **PARAR**: la migración `drizzle/0011_academic_record.sql` la aplica el dueño en la base de producción, y hasta que lo haga no se mergea ni se despliega nada.

Por qué el PARAR no es una formalidad: toda la importación corre dentro de una sola transacción (`portal-sync.service.ts:386`, `const period = await this.repository.runInTransaction(async (tx) => {`). Si el código nuevo llega a producción antes que las tablas, la primera importación con `consent: true` y récord de confianza toma el candado (`lockAcademicRecord` es `pg_advisory_xact_lock` y no necesita tablas) y acto seguido ejecuta `replaceRecordEntries`; Postgres responde `relation "student_record_entry" does not exist`, la transacción entera hace ROLLBACK y el alumno pierde **toda** la sincronización (matrícula, horario, progreso), no solo la copia del récord. Y `GET /academic-record/me` respondería 500 en vez del estado vacío. El orden que exige `MIGRATIONS.md` §"Protocolo manual", punto 3, es estricto: **el SQL se aplica en la BD ANTES del merge/deploy del código que lo usa**.

**Archivos:**

- Modificar (**solo si falta**, ver Paso 3): `specs/features/academic-record/academic-record.spec.md:310-313` (el `[@test]` de la migración bajo "## Modelo de datos"). Ojo con las líneas: **310-313** es la numeración del árbol tal como está en `d97714f`. Si la Tarea 1 ya hizo su Paso 3a, el front-matter creció 3 líneas y el ancla vive en **313-316**. El bloque de texto es el mismo en los dos casos; anclarse en el texto, no en el número. Lo normal es que la Tarea 4 ya lo haya puesto en su Paso 6 y que esta tarea no toque nada.
- Modificar (**solo si faltan**, ver Paso 4): `specs/features/academic-record/academic-record.spec.md:6-13` (los tres `targets` que agrega la Tarea 1 en su Paso 3a). Acá el número sí es estable: el `[@test]` de la Tarea 4 va en el cuerpo, después del front-matter, y no mueve estas líneas.
- Test: la suite completa, `test/**/*.test.ts` (108 archivos al terminar la rama). **No se crea ni se modifica ningún archivo de prueba.**
- No se toca: nada de `src/`, nada de `drizzle/`, `README.md`, `MIGRATIONS.md`, `AGENTS.md`, ni `drizzle/meta/`.

**Interfaces:**

- Consume — las nueve pruebas que dejaron verdes las Tareas 1 a 9, con el conteo que cada una reportó en su propio Paso 4 (es la cifra contra la que se compara acá):

  | archivo | pruebas | quién lo dejó así |
  |:---|---:|:---|
  | `test/HU34_jeff/record-parser.test.ts` | 32 | Tarea 1 |
  | `test/HU34_jeff/record-trust.test.ts` | 30 | Tarea 2 |
  | `test/HU34_jeff/info-academica-parser.test.ts` | 20 | Tarea 3 |
  | `test/HU34_jeff/migration-0011.test.ts` | 21 | Tarea 4 |
  | `test/HU34_jeff/record-persistence.test.ts` | 25 | Tarea 5 (19) + Tarea 6 (6) |
  | `test/HU34_jeff/electives-cleanup.test.ts` | 24 | Tarea 5 (5) + Tarea 7 (19) |
  | `test/HU34_jeff/consent-gate.test.ts` | 30 | Tarea 6 (20) + Tarea 8 (10) |
  | `test/HU34_jeff/academic-record.routes.test.ts` | 16 | Tarea 9 |
  | `test/HU34_jeff/chatbot-isolation.test.ts` | 4 | Tarea 9 |

  Total fijo de las nueve tareas: **202 pruebas en 9 archivos** (32+30+20+21+25+24+30+16+4). Las nueve cifras salen del Paso 4 de cada tarea (las dos últimas, de `plan.md` Tarea 9, pasos 4 y 5: `16 pass` y `4 pass`). El Paso 1 de acá las vuelve a medir una por una: la comparación sirve justamente para detectar que una tarea no quedó como dice su Paso 4, así que **ninguna se "ajusta" desde acá**.

- Consume — del repo actual, sin modificarlos (todo verificado sobre el árbol en `d97714f`):
  - `package.json:9` → `"build": "tsc"`. `tsconfig.json` tiene `"include": ["src/**/*"]`, así que el build compila solo `src/`.
  - `bunfig.toml:3` → `preload = ["./test/env.setup.ts"]`. Ese archivo rellena `JWT_SECRET`, `DATABASE_URL` y `COHERE_API_KEY` con dummies **solo si faltan** (`||=`, líneas 5, 6 y 9). Por eso el prefijo `DATABASE_URL=…` del comando es obligatorio: sin él bun carga el `.env` del worktree, que apunta a **producción**.
  - `scripts/verificar-readme.py` → `python3 scripts/verificar-readme.py`, sin dependencias, mide el árbol y compara con las cifras del `README.md`; sale 1 si algo no cuadra. Medido hoy sobre `d97714f`: sale **0** y todo en verde.
  - `AGENTS.md:24` → `8. Implementa solo archivos incluidos en targets.` y `AGENTS.md:26` → `10. Si agregas tests, enlázalos en la spec con [@test].`
  - `MIGRATIONS.md:5` §"Dónde vive la BD" y `MIGRATIONS.md:45` §"Protocolo manual": `pg_dump` por ruta completa `/opt/homebrew/opt/libpq/bin/pg_dump` (el de `postgresql@16` se niega contra el servidor 17), una sola persona aplica (Jeff, punto 4), con backup previo, y requiere datos móviles (el wifi de la ULima bloquea el 5432). El registro final va en `MIGRATIONS.md:106` §"Migraciones aplicadas / reconciliaciones".
  - `.gitignore:5` → `dist/`; `.gitignore:53` → `backup_*.sql`.
  - Commit base de la rama: `d97714f docs(academic-record): spec del récord académico (RS-BE-19 a RS-BE-29)`, de `Jeffangeloss <178797184+jeffangeloss@users.noreply.github.com>`.
- Produce: **nada**. No hay tarea posterior, ninguna firma nueva, ningún archivo nuevo. El entregable es el informe del Paso 8 y la rama lista para que el dueño decida.

Todos los comandos se corren desde la raíz del worktree `.`. Bun no está en el PATH: se invoca por ruta completa. **No abras, no imprimas y no copies `.env`.**

- [ ] **Paso 1: Correr la suite completa y compararla con la línea base**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test 2>&1 | tee $TMP/suite-final.txt | tail -12
```

Es el **mismo comando** del Paso 0 de la Tarea 1, más un `tee` que guarda la salida completa en el scratchpad (no en el repo) para poder citarla en el informe del Paso 8.

Esperado: PASS.

- `0 fail`. Es la única cifra no negociable.
- `Ran N tests across 108 files.` — 108 = los **99** `*.test.ts` de la línea base (contados hoy: `find . -name "*.test.ts" -not -path "./node_modules/*"` da exactamente 99, todos bajo `test/`) más los **9** de `test/HU34_jeff/`. Ninguna tarea borró ni renombró un archivo de prueba; la Tarea 3 modificó `test/HU31_jeff/parsers.info.test.ts` por dentro (la prueba de `Object.keys`, líneas 14-18), pero el archivo sigue teniendo sus 5 pruebas.
- `N pass` = (el `pass` que anotaste en el Paso 0 de la Tarea 1, alrededor de 1217) + **202** (las nueve tareas).

Y el desglose de la carpeta nueva:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff 2>&1 | tail -5
```

Esperado: `0 fail` y `Ran 202 tests across 9 files.`. Si el número de archivos no es 9, falta un archivo o alguna tarea quedó a medias: identifica cuál con `ls test/HU34_jeff` y vuelve a esa tarea. Si el total no es 202, compara archivo por archivo con la tabla de **Interfaces** y vuelve a la tarea que no cuadre.

Y, por separado, las dos suites de la Tarea 9, que son las últimas en escribirse y las que más fácil quedan a medias:

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/academic-record.routes.test.ts 2>&1 | tail -4 && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN test test/HU34_jeff/chatbot-isolation.test.ts 2>&1 | tail -4
```

Esperado: `0 fail` en los dos, con `16 pass` en el primero y `4 pass` en el segundo. Si alguna cifra no es la esperada, esa tarea no quedó como dice su Paso 4: vuelve a ella, **no** ajustes este número.

Ruido esperado en la salida, que **no** es un fallo — son `console.warn` reales que las pruebas provocan a propósito y que **nadie espía**, así que llegan a la consola:

- `[portal-sync] información académica incompleta: period` y `[portal-sync] información académica incompleta: general`, de las dos pruebas de layout alterado de `record-persistence.test.ts` ("un layout sin bloque por periodo deja el resumen vacio, no lo inventa" y "un bloque general ilegible guarda la foto vacia, nunca ceros", Tarea 6). El service imprime `info.data.unreadable.join(", ")`, que en esos dos casos vale `["period"]` y `["general"]`.
- `[portal-sync] récord no confiable: …` y, si el layout de HU31 tiene algún campo que el parser nuevo no lee, `[portal-sync] información académica incompleta: …`, en las pruebas de service de `test/HU31_jeff` y `test/HU33_jeff`. Es lo que anunció el Paso 5 de la Tarea 6: sus fixtures de récord (el de HU31 y el `recordCon` sintético de `service.equivalencias.test.ts`) no cumplen la regla de confianza, y el log se emite con o sin consentimiento por diseño (RS-BE-21). El motivo es un literal de `evaluateRecordTrust` (`"pie ausente o ilegible"`, `"sin filas"`, `"N filas descartadas"`, `"aprobadas no coinciden con ASIG. APR."`, `"créditos aprobados no coinciden con CRD. APROB."`, `"hay convalidados (ASIG. CONV. > 0)"`, `"desaprobadas no coinciden con ASIG. DESAP."`, `"tabla del récord ausente o con cabecera distinta"`): nunca lleva datos.

Lo que **no** vas a ver, aunque exista en el código: `[portal-sync] limpieza de electivos omitida: códigos aprobados sin resolver: …`. Su única prueba ("un codigo aprobado sin resolver bloquea la limpieza y va al log", `electives-cleanup.test.ts`, Tarea 7) lo captura con `spyOn(console, "warn").mockImplementation(() => {})` dentro de un `try`/`finally`, así que se asierta pero no se imprime. Si **sí** aparece en la salida, el `mockRestore()` del `finally` no está o alguna otra prueba está llegando a ese camino: vuelve a la Tarea 7.

Ninguna de esas líneas puede traer una nota, un nombre ni un código de alumno del portal: solo el motivo y, como mucho, el `studentId` interno. Si ves un nombre propio o una nota en el log, es un defecto de la tarea que lo emitió y hay que volver a ella.

Si `fail > 0`: **no** "arregles" la suite editando la prueba que falla. Ubica a qué tarea pertenece el archivo con la tabla de **Interfaces**, vuelve a esa tarea y compara contra su Paso 4. Lo mismo si falla algo de `test/HU31_jeff`, `test/HU33_jeff` o `test/HU_asistencia`: eso es una regresión, no una prueba desactualizada, y ninguna tarea de este plan autoriza tocar esos archivos (la única excepción es `test/HU31_jeff/parsers.info.test.ts`, que ya editó la Tarea 3).

- [ ] **Paso 2: Compilar**

```bash
cd . && DATABASE_URL=postgres://user:pass@localhost:5432/test $BUN run build
```

Esperado: PASS — imprime `$ tsc` y nada más, exit 0.

Dos cosas que este build valida y que ninguna prueba cubre, porque `bun test` transpila sin chequear tipos:

- El módulo `academic-record` entero de la Tarea 9 y su `app.route("/academic-record", academicRecordRoutes)` en `src/modules/index.ts`.
- `src/db/seed/equivalencias.logic.ts`, que `tsconfig.json` **excluye** (`"exclude": ["node_modules", "dist", "drizzle", "src/db/seed/**/*"]`) pero que entra igual al build porque el service lo importa desde la Tarea 7: `SIN_EQUIVALENCIA_CONOCIDA` está declarado en `src/db/seed/equivalencias.logic.ts:57`. `exclude` solo recorta el conjunto inicial que arma `include`; un archivo importado por uno incluido se compila igual, y ahora lo hace por primera vez bajo `strict`, `noUnusedLocals` y `noUnusedParameters`. Si el build falla y el error apunta a un archivo de `src/db/seed/`, **no lo toques**: no está en los `targets` de la spec. **PARAR:** anótalo como **bloqueante** en el informe del Paso 8 (riesgo ya previsto por el plan, §Riesgos abiertos del esqueleto) y **no sigas con los pasos 3 a 7** hasta que el dueño decida, porque una rama que no compila no se puede mergear ni desplegar.

`dist/` está en `.gitignore` (línea 5), así que compilar no ensucia `git status`.

- [ ] **Paso 3: Comprobar los enlaces `[@test]` de la spec**

Primero, que cada ruta enlazada exista (las rutas del `[@test]` son relativas a la carpeta de la spec, por eso el `cd` es a esa carpeta):

```bash
cd ./specs/features/academic-record && grep -c "@test" academic-record.spec.md && grep -o '\[@test\] [^`]*' academic-record.spec.md | sed 's/\[@test\] //' | sort -u | while read -r p; do if [ -f "$p" ]; then echo "OK    $p"; else echo "FALTA $p"; fi; done
```

Esperado: `12` y nueve líneas, todas `OK`. Las doce líneas con `[@test]` son las once que ya trae la spec aprobada (RS-BE-19 y RS-BE-20 apuntan las dos a `record-parser.test.ts`; RS-BE-22 y RS-BE-24 las dos a `record-persistence.test.ts`; RS-BE-26 y RS-BE-27 las dos a `academic-record.routes.test.ts`) más la de la migración que agrega la Tarea 4; por eso doce líneas y nueve archivos distintos:

```
OK    ../../../test/HU34_jeff/academic-record.routes.test.ts
OK    ../../../test/HU34_jeff/chatbot-isolation.test.ts
OK    ../../../test/HU34_jeff/consent-gate.test.ts
OK    ../../../test/HU34_jeff/electives-cleanup.test.ts
OK    ../../../test/HU34_jeff/info-academica-parser.test.ts
OK    ../../../test/HU34_jeff/migration-0011.test.ts
OK    ../../../test/HU34_jeff/record-parser.test.ts
OK    ../../../test/HU34_jeff/record-persistence.test.ts
OK    ../../../test/HU34_jeff/record-trust.test.ts
```

Y al revés —que ninguna prueba nueva quedó sin enlazar, que es lo que pide `AGENTS.md:26` ("Si agregas tests, enlázalos en la spec con `[@test]`")—:

```bash
cd . && for f in test/HU34_jeff/*.test.ts; do if grep -q "$(basename "$f")" specs/features/academic-record/academic-record.spec.md; then echo "OK         $f"; else echo "SIN ENLACE $f"; fi; done
```

Esperado: nueve líneas `OK`.

**Si el conteo da `11` y `migration-0011.test.ts` sale como `FALTA` / `SIN ENLACE`**, la Tarea 4 se saltó su Paso 6. Arréglalo acá, y es el único cambio que esta tarea puede hacer en la spec. En `specs/features/academic-record/academic-record.spec.md`, al final de la sección `## Modelo de datos (migración 0011_academic_record.sql)` —líneas **313-316** si la Tarea 1 ya agregó sus tres targets, **310-313** si tampoco los agregó—, reemplazar esto:

```md
`ON DELETE CASCADE` es la base del borrado: si algún día se borra a un alumno, su récord
no queda huérfano.

## Contrato
```

por esto:

```md
`ON DELETE CASCADE` es la base del borrado: si algún día se borra a un alumno, su récord
no queda huérfano.

`[@test] ../../../test/HU34_jeff/migration-0011.test.ts`

## Contrato
```

Vuelve a correr los dos comandos de arriba: ahora `grep -c "@test"` da `12` y las nueve líneas salen `OK`.

**No agregues ningún otro `[@test]`.** Las nueve pruebas ya están enlazadas una por una desde el requisito que verifican; la sección `## Contrato` no lleva enlace propio porque `academic-record.routes.test.ts`, que es quien la verifica, ya cuelga de RS-BE-26 (línea 260 del árbol base) y RS-BE-27 (línea 273). Tampoco cambies el texto de ningún requisito: la spec está **APROBADA** por el dueño y esta tarea no reabre nada.

- [ ] **Paso 4: Comprobar los `targets` del front-matter**

Dos comprobaciones distintas, y conviene no confundirlas. `AGENTS.md:24` dice "Implementa solo archivos incluidos en `targets`": eso manda sobre los archivos de **implementación** —`src/` y `drizzle/`—, que son los que la spec lista. Las specs y los `docs/specs/*.md` que la rama toca los rigen los puntos 5 y 6 del mismo flujo ("Si la spec no cubre el cambio, actualízala primero" y "Si hay API nueva o cambiada, actualiza `docs/specs/api-contracts.md`"), y los archivos de `test/` el punto 10. Ninguno de esos tres grupos va en `targets`, y que no vayan no es un defecto.

**4.a — Cada target apunta a algo que existe:**

```bash
cd ./specs/features/academic-record && grep -c '^  - \.\./\.\./\.\./' academic-record.spec.md && sed -n '/^targets:/,/^---$/p' academic-record.spec.md | grep '^  - ' | sed 's/^  - //' | while read -r t; do b="${t%/\*\*}"; if [ -e "$b" ]; then echo "OK    $t"; else echo "FALTA $t"; fi; done
```

Esperado: `15` y quince líneas `OK`, en este orden (es el orden del front-matter después del Paso 3a de la Tarea 1):

```
OK    ../../../src/modules/academic-record/**
OK    ../../../src/modules/portal-sync/parsers/html.ts
OK    ../../../src/modules/portal-sync/parsers/record.ts
OK    ../../../src/modules/portal-sync/parsers/info-academica.ts
OK    ../../../src/modules/portal-sync/portal-sync.service.ts
OK    ../../../src/modules/portal-sync/portal-sync.controller.ts
OK    ../../../src/modules/portal-sync/portal-sync.repository.ts
OK    ../../../src/modules/portal-sync/portal-sync.schemas.ts
OK    ../../../src/modules/portal-sync/portal-sync.types.ts
OK    ../../../src/modules/auth/auth.schemas.ts
OK    ../../../src/modules/auth/auth.controller.ts
OK    ../../../src/modules/auth/auth.service.ts
OK    ../../../src/modules/index.ts
OK    ../../../src/db/schema/schema.ts
OK    ../../../drizzle/0011_academic_record.sql
```

(El `**` se recorta antes de comprobar —`b="${t%/\*\*}"` quita el `/**` literal—, así que `../../../src/modules/academic-record/**` se verifica como carpeta. Y el `grep -c` sobre el archivo entero da lo mismo que sobre el front-matter: comprobado, en el cuerpo de la spec no hay ninguna otra línea que empiece con `  - ../../../`.)

**4.b — Y al revés: cada archivo de `src/` o `drizzle/` que la rama tocó está cubierto por un target.** Esto es lo que de verdad pide `AGENTS.md:24`, y el 4.a solo no lo comprueba:

```bash
cd . && git diff --name-only d97714f..HEAD | grep -E '^(src|drizzle)/' | while read -r f; do s=$(sed -n '/^targets:/,/^---$/p' specs/features/academic-record/academic-record.spec.md); if printf '%s\n' "$s" | grep -qxF "  - ../../../$f" || printf '%s\n' "$s" | grep -qxF "  - ../../../${f%/*}/**"; then echo "OK         $f"; else echo "SIN TARGET $f"; fi; done
```

Esperado: **21 líneas, todas `OK`**. Son los 21 archivos de implementación de los 39 de la rama: `src/db/schema/schema.ts` (1), los siete de `src/modules/academic-record/` (cubiertos por el target con `**`), los tres de `src/modules/auth/`, `src/modules/index.ts`, los ocho de `src/modules/portal-sync/` y `drizzle/0011_academic_record.sql`. Los otros 18 (2 de `docs/specs/`, 3 de `specs/features/`, 13 de `test/`) no llevan target por diseño.

Si sale `SIN TARGET`, no inventes un target nuevo: significa que una tarea tocó un archivo que la spec aprobada no autoriza. Vuelve a esa tarea y revierte el archivo.

**Si el conteo de 4.a da `12`**, la Tarea 1 se saltó su Paso 3a. Reemplaza en el front-matter (líneas 6-13):

```yaml
  - ../../../src/modules/portal-sync/parsers/record.ts
  - ../../../src/modules/portal-sync/parsers/info-academica.ts
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/modules/portal-sync/portal-sync.schemas.ts
  - ../../../src/modules/portal-sync/portal-sync.types.ts
  - ../../../src/modules/auth/auth.schemas.ts
  - ../../../src/modules/auth/auth.service.ts
```

por:

```yaml
  - ../../../src/modules/portal-sync/parsers/html.ts
  - ../../../src/modules/portal-sync/parsers/record.ts
  - ../../../src/modules/portal-sync/parsers/info-academica.ts
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.controller.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/modules/portal-sync/portal-sync.schemas.ts
  - ../../../src/modules/portal-sync/portal-sync.types.ts
  - ../../../src/modules/auth/auth.schemas.ts
  - ../../../src/modules/auth/auth.controller.ts
  - ../../../src/modules/auth/auth.service.ts
```

y vuelve a correr los dos comandos: `15` con quince `OK` en 4.a, y veintiún `OK` en 4.b.

Si aparece `FALTA` en un target que no sea por esto —por ejemplo `../../../drizzle/0011_academic_record.sql`—, no es un problema de la spec sino de una tarea sin terminar: vuelve a la Tarea 4.

- [ ] **Paso 5: Revisión de privacidad de la rama (el repo es público)**

Cuatro comprobaciones sobre **todo** lo que la rama agregó desde `d97714f`, más un inventario. Las cuatro primeras no deben encontrar nada; la quinta (5.e) no bloquea: solo mide lo que ya estaba.

**5.a — Ningún código de alumno real.** El único permitido en toda la rama es el sintético `20230001`:

```bash
cd . && git diff d97714f..HEAD | grep -E '^\+' | grep -oE '\b20[0-9]{6}\b' | sort -u
```

Esperado: exactamente una línea, `20230001`. Cualquier otro número de ocho dígitos hay que mirarlo antes de seguir: si es una fecha `AAAAMMDD` dentro de un comentario o de un nombre de backup, está bien; si es un código de alumno, **se quita** y se rehace el commit de la tarea que lo metió. Un código real en un repo público son notas de una persona identificable.

**5.b — Las pruebas HU34 no reutilizan material con datos reales.** Lo exige la spec (`academic-record.spec.md:354`, §Fixtures: "Las pruebas HU34 **no** reutilizan `test/HU31_jeff/fixtures/record.html`"):

```bash
cd . && grep -rn "HU31_jeff\|spike-portal" test/HU34_jeff || echo "OK: ninguna prueba HU34 lee fixtures de HU31 ni de spike-portal"
```

Esperado: la línea `OK: …`. Los tres fixtures de `test/HU34_jeff/fixtures/` (`record.html` de la Tarea 1, `layout.html` de la Tarea 3, `matricula.html` de la Tarea 6) son inventados. El patrón busca la **ruta** `HU31_jeff`, no la cadena `HU31`: `record-persistence.test.ts` lleva a propósito el comentario "Los de HU31 traen datos reales y no se usan acá", que dice `HU31` a secas y por eso no dispara el grep. Si lo cambias a `HU31` a secas, ese comentario dará un falso positivo.

**5.c — Ni host, ni credenciales, ni nada de `.env` en el diff:**

```bash
cd . && git diff d97714f..HEAD | grep -E '^\+' | grep -E 'neon\.tech|sslmode=|postgres://|ep-[a-z0-9]{6}' || echo "OK: ningun host ni credencial en el diff"
```

Esperado: la línea `OK: …`. El `postgres://user:pass@localhost:5432/test` vive en `test/env.setup.ts:6`, que esta rama no toca, y en los comandos de este plan, que no están en el repo. Que la prueba de rutas firme tokens con `config.auth.jwtSecret` (`src/config/app-config.ts:18` → `env.JWT_SECRET`) está bien: ese valor sale del dummy que pone `test/env.setup.ts:5`, igual que en `test/HU31_jeff/course-detail.contacts-claim.test.ts:155`.

**5.d — Ninguna ruta del scratchpad quedó dentro del árbol:**

```bash
cd . && grep -rn "private/tmp/claude-501" src test specs docs drizzle || echo "OK: ninguna ruta del scratchpad quedo en el arbol"
```

Esperado: la línea `OK: …`. Las rutas absolutas del bun del scratchpad son del plan de ejecución, no del repo: una prueba que las cite no corre en la máquina de nadie más.

**5.e — Inventario de lo PREEXISTENTE en los archivos que la rama toca (no bloquea, solo informa).** El 5.a mira únicamente las líneas **añadidas** del diff, así que por construcción no puede ver un código real que ya estaba en un archivo que esta rama modifica. Eso deja al dueño con un inventario incompleto de un repo **público**. Este comando lista archivo y línea **sin imprimir el código**:

```bash
cd . && git diff --name-only d97714f..HEAD | grep -E '^(src|docs|specs)/' | xargs grep -nE '\b20[0-9]{6}\b' | grep -v 20230001 | cut -d: -f1,2
```

El `cut -d: -f1,2` corta el contenido de la línea y deja solo `ruta:número`: no hay forma de que un código real termine en la salida ni en el informe. Medido hoy sobre `d97714f`, los archivos de la rama que ya citaban un código real de ocho dígitos son `src/modules/portal-sync/portal-sync.service.ts`, `src/modules/portal-sync/portal-sync.repository.ts`, `src/db/schema/schema.ts`, `docs/specs/api-contracts.md` (el `"portalCode"` del ejemplo de respuesta de `POST /portal-sync/import`) y `specs/features/portal-sync/portal-sync.spec.md`. Ninguno lo agrega esta rama y ninguno se corrige acá —varios están fuera de los `targets`—: va al punto 7 del informe y lo decide el dueño. Si aparece una ruta que **no** esté en esa lista, mírala: puede ser un código que sí metió la rama y que el 5.a no atrapó.

- [ ] **Paso 6: Revisar la historia de la rama**

```bash
cd . && git status --short && git log --oneline d97714f..HEAD && git log d97714f..HEAD --format='%an <%ae>' | sort -u; git log d97714f..HEAD --format='%B' | grep -i "co-authored-by" && echo "PROBLEMA: hay trailer Co-Authored-By" || echo "OK: ningun commit lleva Co-Authored-By"
```

Esperado:

- `git status --short` **vacío** (si el Paso 3 o el 4 cambiaron la spec, mostrará esa única línea ` M specs/features/academic-record/academic-record.spec.md`, que se commitea en el Paso final).
- Nueve commits sobre `d97714f`, del más nuevo al más viejo: el de la Tarea 9, y luego
  - `feat(academic-record): el registro traslada el consentimiento a la importación (RS-BE-29)`
  - `feat(academic-record): limpieza de electivos no respaldados (RS-BE-23)`
  - `feat(academic-record): guarda el récord solo con consentimiento y récord de confianza (RS-BE-21, RS-BE-22, RS-BE-25, RS-BE-29)`
  - `feat(academic-record): escritura del récord en la base desde la importación (RS-BE-22, RS-BE-23, RS-BE-25)`
  - `feat(academic-record): tablas del récord y migración 0011 (RS-BE-22, RS-BE-25)`
  - `feat(academic-record): información académica general y por período (RS-BE-24)`
  - `feat(academic-record): regla de confianza del récord (RS-BE-21)`
  - `feat(academic-record): lector del récord por tabla, con pie y normalizador de rótulos`
- Un solo autor: `Jeffangeloss <178797184+jeffangeloss@users.noreply.github.com>` (es el que ya tiene configurado el worktree, comprobado con `git config user.email`). Nunca el correo universitario.
- `OK: ningun commit lleva Co-Authored-By`.

Y que la rama no tocó nada fuera de lo planeado:

```bash
cd . && git diff --name-only d97714f..HEAD | sort && git diff --stat d97714f..HEAD | tail -1
```

Esperado: **39 archivos**, y exactamente esta lista:

```
docs/specs/api-contracts.md
docs/specs/feature-index.md
drizzle/0011_academic_record.sql
specs/features/academic-record/academic-record.spec.md
specs/features/portal-sync/portal-sync.spec.md
specs/features/registro/registro.spec.md
src/db/schema/schema.ts
src/modules/academic-record/academic-record.controller.ts
src/modules/academic-record/academic-record.logic.ts
src/modules/academic-record/academic-record.repository.ts
src/modules/academic-record/academic-record.routes.ts
src/modules/academic-record/academic-record.service.ts
src/modules/academic-record/academic-record.types.ts
src/modules/academic-record/index.ts
src/modules/auth/auth.controller.ts
src/modules/auth/auth.schemas.ts
src/modules/auth/auth.service.ts
src/modules/index.ts
src/modules/portal-sync/parsers/html.ts
src/modules/portal-sync/parsers/info-academica.ts
src/modules/portal-sync/parsers/record.ts
src/modules/portal-sync/portal-sync.controller.ts
src/modules/portal-sync/portal-sync.repository.ts
src/modules/portal-sync/portal-sync.schemas.ts
src/modules/portal-sync/portal-sync.service.ts
src/modules/portal-sync/portal-sync.types.ts
test/HU31_jeff/parsers.info.test.ts
test/HU34_jeff/academic-record.routes.test.ts
test/HU34_jeff/chatbot-isolation.test.ts
test/HU34_jeff/consent-gate.test.ts
test/HU34_jeff/electives-cleanup.test.ts
test/HU34_jeff/fixtures/layout.html
test/HU34_jeff/fixtures/matricula.html
test/HU34_jeff/fixtures/record.html
test/HU34_jeff/info-academica-parser.test.ts
test/HU34_jeff/migration-0011.test.ts
test/HU34_jeff/record-parser.test.ts
test/HU34_jeff/record-persistence.test.ts
test/HU34_jeff/record-trust.test.ts
```

Y las ausencias buscadas, en un comando que no depende de leer la lista a ojo:

```bash
cd . && git diff --name-only d97714f..HEAD | grep -E '^(README\.md|MIGRATIONS\.md|AGENTS\.md|src/server\.ts|drizzle/meta/|backup_)' || echo "OK: ni README, ni MIGRATIONS, ni AGENTS, ni server.ts, ni el journal, ni un backup"
```

Esperado: la línea `OK: …`. `src/server.ts` queda fuera porque su lista de `GET /` no entra en los targets, y `drizzle/meta/` porque el journal no registra la 0011, igual que no registró la 0010 (comprobado: `drizzle/meta/_journal.json` termina en `0009_avatar`, y hay 12 `.sql` en `drizzle/`). Si aparece cualquiera de ellos, hay que revertir ese archivo antes de seguir. **No hagas `git push`**: publicar la rama lo decide el dueño, y si algún día se hace es `git push origin feat/record-academico`, nunca `git push` a secas.

- [ ] **Paso 7: Medir los conteos del `README.md` (medir y reportar, NO editar)**

```bash
cd . && python3 scripts/verificar-readme.py; echo "EXIT=$?"
```

Esperado: **FAIL con `EXIT=1` y 10 discrepancias**, todas del mismo origen: el README cita cifras del árbol de antes de esta rama. Las diez líneas, literales:

```
  ✗ tablas               dice 35, son 38 (insignia del ORM)
  ✗ tablas               dice 35, son 38 (tabla de metadatos)
  ✗ tablas               dice 35, son 38 (título de la sección de tablas)
  ✗ modulos              dice 16, son 17 (insignia de superficie)
  ✗ modulos              dice 16, son 17 (tabla de metadatos)
  ✗ modulos              dice 16, son 17 (título de la sección de módulos)
  ✗ endpoints            dice 76, son 78 (insignia de superficie)
  ✗ endpoints            dice 76, son 78 (título del catálogo)
  ✗ migraciones          dice 12, son 13 (tabla de metadatos)
  ✗ suites               dice 99, son 108 (insignia de verificación)
```

y al final:

```
10 discrepancia(s). El README no está al día.
```

De dónde sale cada una: +3 `pgTable(` en `schema.ts` (Tarea 4; hoy son 35), +1 `app.route(` en `src/modules/index.ts` (Tarea 9; hoy son 16) y +2 rutas en el `*.routes.ts` nuevo —el script suma los `^\s*…\.(get|post|put|patch|delete)\(` de todos los `src/modules/**/*.routes.ts` más 3 fijos por las de `server.ts`, y `app.get("/me")` y `app.delete("/me")` cuentan mientras que los tres `app.use("*", …)` no—, +1 `.sql` en `drizzle/` (Tarea 4; hoy son 12), +9 `*.test.ts` (Tareas 1 a 9; hoy son 99). Deben seguir en verde `enums` (11) y `parsers` (11): la Tarea 1 no toca `src/modules/portal-sync/parsers/index.ts` justamente para no mover esa cifra. Y "Rutas de archivo citadas: ✓ todas existen" tiene que seguir apareciendo: la rama solo agrega archivos, nunca borra uno que el README cite.

Línea base para el informe, medida hoy sobre `d97714f`: el script sale **0** y las doce afirmaciones están en verde. Así que si el verificador reporta algo **distinto** de esas diez líneas, anótalo: significa que la rama movió un conteo que nadie previó.

**No edites `README.md` en esta tarea.** No está en los `targets` de la spec, y sus secciones (`### Los 16 módulos` en la línea 371, `### Las 35 tablas` en la 786, `### El catálogo: 76 endpoints` en la 1805, en un archivo de 7392 líneas) enumeran los elementos uno por uno: cambiar solo el número del título dejaría un encabezado que promete 38 tablas sobre una lista de 35, que es peor que la cifra vieja. Actualizarlo es una tarea de documentación propia, y va **después** de que el dueño aplique la migración y mergee. Lo que sí hace esta tarea es dejarle las cifras medidas, ya listas, en el informe del Paso 8.

- [ ] **Paso 8: PARAR — acción del dueño y informe final**

**El ejecutor se detiene acá.** No aplica la migración, no lee `.env`, no mergea, no despliega y no hace push. Entrega este informe al dueño:

1. **Suite:** el `N pass`, `0 fail` y `Ran N tests across 108 files` del Paso 1, junto a la línea base anotada en el Paso 0 de la Tarea 1 (`pass` de entonces, `0 fail`, 99 archivos), y la diferencia: 202 pruebas nuevas en 9 archivos, todas de esta rama, medidas una por una en el Paso 1. La salida completa quedó en `$TMP/suite-final.txt`.
2. **Build:** `bun run build` limpio. Si falló, el error literal y el archivo, sin haberlo tocado: es **bloqueante** junto con la migración, porque la rama no compila y no se puede mergear ni desplegar.
3. **Spec:** 12 líneas `[@test]` que apuntan a 9 archivos y los nueve existen; los nueve archivos de prueba están enlazados; 15 `targets` y todos existen; los 21 archivos de `src/`/`drizzle/` de la rama están cubiertos por un target. Si el Paso 3 o el 4 tuvieron que completar algo, decir cuál y que fue por un paso saltado de la Tarea 4 o de la Tarea 1.
4. **Privacidad:** las cuatro comprobaciones 5.a–5.d del Paso 5 en verde; el único código de alumno que la rama agrega es `20230001`. El inventario de 5.e va aparte, en el punto 7.
5. **Historia:** nueve commits sobre `d97714f`, autor `Jeffangeloss <178797184+…@users.noreply.github.com>`, sin `Co-Authored-By`, 39 archivos, árbol limpio, sin push.
6. **README desactualizado** (pendiente, no bloqueante): las diez cifras del Paso 7, con los valores nuevos ya medidos — tablas 38, módulos 17, endpoints 78, migraciones 13, suites 108.
7. **Hallazgo anterior a la rama** (no bloqueante, fuera del alcance de este plan): el código real de ocho dígitos de un alumno está citado en varios archivos del repo, y **no solo** en el comentario de `src/db/seed/equivalencias.logic.ts:46` que el build arrastra desde la Tarea 7. Entre ellos hay archivos que esta rama **sí** modifica: `src/modules/portal-sync/portal-sync.service.ts`, `src/modules/portal-sync/portal-sync.repository.ts`, `src/db/schema/schema.ts`, `docs/specs/api-contracts.md` (el `"portalCode"` del ejemplo de respuesta de `POST /portal-sync/import`) y `specs/features/portal-sync/portal-sync.spec.md`. Pega la salida de 5.e, que es la lista exacta de `ruta:línea`. Ninguna de esas líneas la agrega esta rama y ninguna se corrige acá —varias están fuera de los `targets`—, pero el repo es **público** y lo decide el dueño. **No transcribas el código** al reportarlo: bastan archivo y línea.
8. **Bloqueante:** la migración `drizzle/0011_academic_record.sql` **no está aplicada**. Sin ella, el código nuevo en producción hace fallar toda importación con `consent: true` (ROLLBACK de la transacción entera de `runInTransaction`, no solo del récord) y responde 500 en `GET /academic-record/me`.

**Acción del dueño** (una sola persona aplica, con datos móviles porque el wifi de la ULima bloquea el 5432, y con respaldo previo, según `MIGRATIONS.md` §"Protocolo manual", punto 4):

**NO EJECUTAR — estos comandos los corre el dueño en su sesión, no el ejecutor de este plan.** Leer `.env` y correr `db:apply` están prohibidos por las restricciones globales (§Restricciones globales): el bloque va en `text` justamente para que ninguna herramienta lo tome por un comando de este plan.

```text
cd .
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
/opt/homebrew/opt/libpq/bin/pg_dump "$DATABASE_URL" > backup_pre_0011_$(date +%Y%m%d).sql
bun run db:apply drizzle/0011_academic_record.sql
```

- El `export` es solo para `pg_dump`: `db:apply` (`package.json:25` → `bun run src/db/apply-migration.ts`) lee `.env` por su cuenta vía `dotenv`.
- El `pg_dump` va por ruta completa a propósito: el de `postgresql@16` se niega contra el servidor 17 de Neon ("aborting because of server version mismatch"), según `MIGRATIONS.md:9`.
- `backup_*.sql` está en `.gitignore:53`: el respaldo nunca se versiona.
- Si `bun` no está en el PATH de la Mac, el dueño lo resuelve en su propia sesión: este plan **no** da la ruta, para que nadie la copie desde acá y termine corriendo `db:apply` sin querer.
- La migración es aditiva e idempotente (`CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`) y corre en transacción: si algo falla, ROLLBACK y la base queda intacta. Se puede reaplicar sin daño.

Verificación, con la URL ya exportada. **NO EJECUTAR — también es del dueño:**

```text
/opt/homebrew/opt/libpq/bin/psql "$DATABASE_URL" -c "select to_regclass('public.student_record_entry'), to_regclass('public.student_academic_snapshot'), to_regclass('public.student_period_summary');"
```

Esperado: las tres columnas con el nombre de la tabla, ninguna `NULL`.

Después, y recién después: registrar la 0011 en la tabla de `MIGRATIONS.md:106` §"Migraciones aplicadas / reconciliaciones" con la evidencia, avisar al equipo, y entonces sí mergear y desplegar. El orden no es negociable (`MIGRATIONS.md` §"Protocolo manual", punto 3). Si hay demo en menos de 48 horas, aplica el freeze pre-demo del punto 6: no se ejecuta DDL.

- [ ] **Paso final: Commit (solo si el Paso 3 o el Paso 4 cambiaron la spec)**

Caso normal —la Tarea 1 puso sus tres targets y la Tarea 4 su `[@test]`—: no hay nada que commitear. Comprueba y cierra:

```bash
cd . && git status --short
```

Esperado: salida vacía. La Tarea 10 termina sin commit propio, que es el mejor resultado posible: quiere decir que las nueve tareas anteriores dejaron la spec completa.

Si el Paso 3 o el Paso 4 sí editaron la spec, ese es el único archivo modificado y va en un commit:

```bash
cd . && git add specs/features/academic-record/academic-record.spec.md && git commit -m "docs(academic-record): completa los targets y los enlaces [@test] de la spec" && git status --short
```

Sin trailer `Co-Authored-By` y sin `push`. `git status --short` debe quedar vacío después.
