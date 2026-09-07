<div align="center">

# ULima++ · Backend 🎓

> **La API que sostiene ULima++, y las reglas que la gobiernan**
> *Hono sobre Bun, PostgreSQL como única fuente de verdad, y una spec aprobada antes de cada línea de código*

[![Rol](https://img.shields.io/badge/Rol-API_·_esquema_·_specs_·_pruebas-FF6600?style=for-the-badge&logo=bookstack&logoColor=white)](#-qué-es-este-repositorio-y-qué-no)
[![Estado](https://img.shields.io/badge/Estado-En_producción-2EA043?style=for-the-badge&logo=vercel&logoColor=white)](#-despliegue)
[![Runtime](https://img.shields.io/badge/Runtime-Bun_·_TypeScript_5-000000?style=for-the-badge&logo=bun&logoColor=white)](#-arquitectura)

[![API](https://img.shields.io/badge/API-Hono_4_serverless-E36002?style=for-the-badge&logo=hono&logoColor=white)](#-la-api)
[![Base](https://img.shields.io/badge/Base-PostgreSQL_en_Neon-00E599?style=for-the-badge&logo=postgresql&logoColor=white)](#-el-modelo-de-datos)
[![ORM](https://img.shields.io/badge/ORM-Drizzle_·_35_tablas-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](#-el-modelo-de-datos)

[![Superficie](https://img.shields.io/badge/Superficie-16_módulos_·_74_endpoints-1F3A5F?style=for-the-badge&logo=fastapi&logoColor=white)](#-la-api)
[![Verificación](https://img.shields.io/badge/Verificación-92_suites_·_16_429_líneas-6D28D9?style=for-the-badge&logo=testinglibrary&logoColor=white)](#-pruebas-y-calidad)
[![Frontend](https://img.shields.io/badge/Frontend-ULima%2B%2B_Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white)](https://github.com/jeffangeloss/ULima_Frontend_IS2)

</div>

---

## 📑 Metadatos del sistema

| Parámetro | Valor |
|:---|:---|
| **Entidad** | Universidad de Lima · Facultad de Ingeniería · curso de Ingeniería de Software 2 |
| **Producto** | **ULima++** — app académica para estudiantes de la Universidad de Lima; desde HU18, también para docentes y jefes de práctica |
| **Rol de este repositorio** | Backend: la API REST, el esquema Drizzle sobre PostgreSQL, las specs por feature con sus reglas `BR-XXX-NN` y las pruebas que las defienden |
| **Stack** | Bun · TypeScript 5 · Hono 4 · Drizzle ORM · PostgreSQL · Zod · JWT · bcryptjs |
| **API en producción** | https://u-lima-backend-is-2-one.vercel.app — salud en [`/health`](https://u-lima-backend-is-2-one.vercel.app/health), commit desplegado en [`/version`](https://u-lima-backend-is-2-one.vercel.app/version) |
| **Frontend** | [ULima_Frontend_IS2](https://github.com/jeffangeloss/ULima_Frontend_IS2) — app Flutter |
| **Superficie de API** | **16 módulos** · **70 endpoints**: **67 rutas** declaradas en los 16 archivos `*.routes.ts` más 3 de servicio en la raíz (`/`, `/health`, `/version`) · **7** no exigen token |
| **Modelo de datos** | **35 tablas** en `src/db/schema/schema.ts` · 12 archivos de migración |
| **Código** | 16 795 líneas TypeScript en 184 archivos bajo `src/` |
| **Verificación** | **74 suites** · 16 429 líneas de prueba · *mutation testing* con Stryker, una configuración por persona |
| **Specs** | **18 features** especificadas antes de implementarse, en `specs/features/` |
| **Contrato REST** | 600 líneas en [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md) |
| **Historia** | 253 commits · del 2026-05-13 al 2026-09-06 |

---

## 📖 Índice

1. [Qué es este repositorio (y qué no)](#-qué-es-este-repositorio-y-qué-no)
2. [Arquitectura](#-arquitectura)
3. [Mapa del repositorio](#-mapa-del-repositorio)
4. [El modelo de datos](#-el-modelo-de-datos)
5. [La API](#-la-api)
6. [Las reglas del dominio](#-las-reglas-del-dominio)
7. [Seguridad](#-seguridad)
8. [Integraciones externas](#-integraciones-externas)
9. [Requerimientos](#-requerimientos)
10. [Historias de usuario y criterios de aceptación](#-historias-de-usuario-y-criterios-de-aceptación)
11. [Pruebas y calidad](#-pruebas-y-calidad)
12. [Configuración y entorno](#-configuración-y-entorno)
13. [Despliegue](#-despliegue)
14. [Cómo se trabaja aquí](#-cómo-se-trabaja-aquí)
15. [Deuda técnica y límites conocidos](#-deuda-técnica-y-límites-conocidos)
16. [Equipo](#-equipo)
17. [Enlaces](#-enlaces)

---

## ⚡ Qué es este repositorio (y qué no)

**ULima++ es una app académica para estudiantes de la Universidad de Lima.** Resuelve un problema
concreto: la información que un alumno necesita para tomar decisiones está repartida entre el portal
miUlima, el aula virtual, los PDF de sílabos, los grupos de WhatsApp del salón y el cuaderno donde
apunta sus notas parciales. Ninguna de esas fuentes le dice, en una sola pantalla, qué cursos puede
llevar el ciclo que viene, cuánto necesita en el final para aprobar, en qué semana se le juntan tres
evaluaciones o quién es el delegado de su sección. ULima++ junta eso: malla curricular con
prerrequisitos y simulación «¿y si…?», notas oficiales y calculadora personal, horario y evaluaciones,
alertas de riesgo académico y alta carga, anuncios y contactos de sección, asesorías, chat del salón y
un asistente conversacional anclado al expediente real del alumno.

Desde **HU18** el producto dejó de ser solo para alumnos. El docente y el Jefe de Práctica entran con
la misma app: publican asesorías extra y ven quién confirmó asistencia, cargan la grilla de notas
oficiales de su sección, revisan qué alumnos están impedidos o en riesgo por inasistencias y moderan
el chat del salón. La etiqueta **Profesor / JP no es un atributo de la persona**: se deriva de qué
columna de `section` referencia a ese docente — `teacher_id` es Profesor, `jp_id` es Jefe de Práctica —,
así que la misma persona puede ser Profesor en una sección y JP en otra. Los cuatro roles del sistema
son `student`, `delegate`, `subdelegate` y `teacher`, y los tres primeros se recalculan **en cada
login** contra la representación vigente del ciclo activo.

**Este repositorio es la API REST**, y solo eso: Hono sobre Bun y TypeScript, Drizzle ORM sobre
PostgreSQL, Zod para validar toda entrada y JWT para la sesión. Son **16 795 líneas de TypeScript en
184 archivos** bajo [`src/`](src/), organizadas en **15 módulos** que exponen **70 endpoints** — 67
rutas declaradas en los 16 archivos `*.routes.ts` (`advising` aporta dos sub-routers, 3 de alumno y 5
de docente) más las tres de servicio (`/`, `/health`, `/version`) — sobre **34 tablas**. El comportamiento no se improvisa: está escrito
antes en **18 specs** bajo [`specs/features/`](specs/features/) y en el contrato REST de 600 líneas de
[`docs/specs/api-contracts.md`](docs/specs/api-contracts.md), y se defiende con **74 suites de prueba
y 16 429 líneas de test**. Se despliega en un único sitio, Vercel, con preset `hono` y región fija
`iad1`; la producción viva es `u-lima-backend-is-2-one.vercel.app` (ver [Despliegue](#-despliegue)).

**Qué NO es.** No es la app: la interfaz vive en el repo Flutter
[`ULima_Frontend_IS2`](https://github.com/jeffangeloss/ULima_Frontend_IS2), con sus propias 28
pantallas, sus controllers GetX y sus specs espejadas. No hay pantallas ni endpoints de
administración: no existe un `POST /careers`, ni alta de docentes, ni CRUD de secciones o de malla —
el aprovisionamiento de docentes y JP es administrativo y se hace con un seed aprobado
(`bun run db:seed:docentes`), ejecutado a mano. Y este backend **no crea ni puebla tablas por su
cuenta**: `drizzle-kit push` está prohibido siempre porque puede generar `DROP`, cada cambio de
esquema es un `.sql` aditivo numerado en [`drizzle/`](drizzle/) con `IF NOT EXISTS`, y una sola
persona lo aplica en la base — con `pg_dump` previo y en transacción — **antes** de que se mezcle el
código que lo usa. El protocolo completo está en [`MIGRATIONS.md`](MIGRATIONS.md).

### La tensión que le da carácter

Detrás de esa rigidez hay una decisión de arquitectura y una historia. **PostgreSQL es la única
fuente de verdad.** La base de datos ya existía —modelada, poblada y con datos de alumnos reales—
antes de que se escribiera la primera ruta; el backend llegó a servirla, no a inventarla. El
frontend, en cambio, nació antes con archivos JSON de mentira para poder dibujar pantallas. Si el
backend hubiera aceptado esos JSON como respaldo, un dato ausente en producción se habría visto
**exactamente igual** que un dato correcto, y la app habría mentido con seguridad absoluta: una malla
vacía renderizada como «no te falta nada», un promedio calculado sobre cero evaluaciones. Por eso la
regla no es «evitar mocks», es que un fallo de base de datos **se propaga**. El comentario de
[`src/modules/curriculum/curriculum.repository.ts`](src/modules/curriculum/curriculum.repository.ts)`:4-6`
lo dice con todas sus letras: sin catch de rescate, un fallo de BD o un estudiante inexistente se
propaga en vez de simular una malla vacía.

De ahí salen las seis **Decisiones No Negociables** de [`KNOWLEDGE.md`](KNOWLEDGE.md)`:133-140`, que
son literalmente eso: una lista corta que nadie puede saltarse sin aprobación explícita del owner.

> **1 · No mocks JSON como fallback.** Si falta un dato en PostgreSQL, se reporta el dato faltante. No
> se rellena. Un hueco visible es infinitamente más barato que un hueco disfrazado.
>
> **2 · No seeds.** Nadie escribe inserts a mano para completar lo que el portal no trajo. Los seeds
> que sí existen en [`src/db/seed/`](src/db/seed/) (11 archivos: docentes, asesorías, delegados) son
> aprovisionamiento administrativo aprobado y se ejecutan a mano, nunca como parte de una request.
>
> **3 · No migraciones sin aprobación.** `db:push`, `db:migrate`, `db:generate` y `db:seed` no se
> corren sin permiso. La base tiene datos reales de alumnos reales.
>
> **4 · No lógica fuera de spec.** [`AGENTS.md`](AGENTS.md)`:3`: «No implementes comportamiento nuevo
> sin spec aprobada». El código se escribe **después** de la regla, y solo dentro de los `targets` que
> la spec declara.
>
> **5 · No endpoints fuera de [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md).** El
> contrato es un documento, no una consecuencia del código. Si la ruta no está ahí, no existe.
>
> **6 · No modificar `src/db` salvo cambio de BD aprobado.** El schema de 34 tablas se toca solo con
> una spec aprobada Y una aprobación de cambio de modelo, dos permisos distintos.

Esa disciplina existe porque el proyecto se coordina entre dos repos, nueve personas y agentes de IA
que escriben código: sin un contrato escrito antes, cada quien inventa su propia versión de «curso
aprobado». Y hay matices que solo sobreviven si están documentados — `enrollment.status = 'completed'`
**no** significa curso aprobado; la aprobación real es `student_course_progress.status = 'approved'`.
La simulación de malla es visual y **nunca** toca matrícula, notas ni progreso real. `student_score`
son las notas oficiales del docente; `simulated_grades` es la calculadora privada del alumno, y jamás
se mezclan. Están todas en [Las reglas del dominio](#-las-reglas-del-dominio).

### De dónde salen los datos del ciclo

No hay carga manual ni panel de importación. Los datos reales del ciclo entran por
**`POST /portal-sync/import`**: el propio alumno aporta su sesión de miUlima —cookie vigente o
credenciales con passcode SecurID— y el backend descarga y parsea su matrícula, su horario, su récord
académico, sus sílabos y, si es delegado, las nóminas de sus aulas. Antes de escribir **nada** se
verifica identidad: si el código de alumno del portal no coincide con el de la sesión, la importación
muere con `403 PORTAL_IDENTITY_MISMATCH`. Después, las 17 escrituras van dentro de **una sola
transacción**, idempotentes, con techo de 5 importaciones por hora. Los parsers que fallan degradan a
`warnings` con código propio (`SYLLABUS_UNAVAILABLE`, `TEACHER_MISSING`, `CAREER_MISMATCH`…) en vez de
inventar valores. Es el módulo más grande del repo —2 388 líneas— y el detalle completo está en
[Integraciones externas](#-integraciones-externas).

```mermaid
flowchart LR
  P["miUlima · webaloe<br/>HTML ISO-8859-1"] --> S["portal-sync<br/>11 parsers"]
  C["cactus · sílabos<br/>JSON"] --> S
  S -->|"UNA transacción"| DB[("PostgreSQL<br/>34 tablas · única fuente de verdad")]
  DB --> API["Este repo<br/>API REST Hono · 15 módulos · 70 endpoints"]
  API -->|"JSON sobre JWT"| APP["App Flutter ULima++<br/>alumno · delegado · docente · JP"]
  SEED["Seeds administrativos aprobados<br/>docentes · asesorías · delegados"] -.->|"ejecución manual"| DB
  MIG["drizzle/000N.sql aditivo<br/>aplicado a mano antes del merge"] -.-> DB
```

---

## 🧩 Arquitectura

El backend es **una sola aplicación Hono** de 16 795 líneas TypeScript repartidas en 184 archivos bajo `src/`, de las cuales **12 207 viven en `src/modules/`**. No hay microservicios, no hay colas, no hay caché. Hay un archivo de composición de 65 líneas, 15 sub-aplicaciones Hono montadas por prefijo y una sola conexión a PostgreSQL.

Lo que define la arquitectura no es el framework sino **dónde se decide cada cosa**: la autenticación se monta por módulo y no globalmente, las dependencias se cablean a mano en el `index.ts` de cada módulo, y los errores viajan como excepciones hasta un único `onError`. Las tres decisiones se explican abajo, con sus excepciones.

### El stack, con versiones reales

| Capa | Elección | Versión declarada | Versión instalada |
|:---|:---|:---|:---|
| Runtime | **Bun** (canónico) · Node solo vía adapter | — | — |
| Framework HTTP | **Hono** | `^4.6.0` | **4.12.19** |
| Adapter Node | `@hono/node-server` | `^2.0.4` | 2.0.4 |
| ORM / capa SQL | **Drizzle ORM** sobre driver `postgres-js` | `^0.45.2` | 0.45.2 |
| Driver PostgreSQL | `postgres` | `^3.4.0` | — |
| Base de datos | **PostgreSQL** — 34 tablas en [`src/db/schema/schema.ts`](src/db/schema/schema.ts) (569 líneas) | — | — |
| Validación | **Zod** | `^3.23.0` | 3.25.76 |
| Compilador | **TypeScript**, `bun run build` es literalmente `tsc` | `^5.7.0` | 5.9.3 |
| Pruebas | Runner nativo `bun test` — **no hay framework de test declarado** | — | — |
| Despliegue | **Vercel**, preset `hono`, región fija `iad1` | — | — |

Detalle que condiciona todo el código fuente: `tsconfig.json` usa `module: ESNext` + `moduleResolution: bundler` con `"type": "module"`, así que **todos los imports relativos llevan extensión `.js`**, incluso apuntando a archivos `.ts`. Se ve en las 184 fuentes, empezando por [`src/server.ts`](src/server.ts):4-7.

```mermaid
flowchart TD
    FL["App Flutter · ApiClient"] --> CORS["cors — server.ts L16-23"]
    CORS --> LOG["logger — server.ts L24"]
    LOG --> RAIZ{"¿ruta raíz?"}
    RAIZ -->|"sí"| SALUD["GET / · GET /health · GET /version<br/>los 3 únicos endpoints sin JWT"]
    RAIZ -->|"no"| REG["registerModules — modules/index.ts L18-34"]
    REG --> SUB["Sub-app Hono del prefijo<br/>15 módulos montados con app.route"]
    SUB --> MW["authMiddleware + requireRole<br/>montados POR MÓDULO, nunca global"]
    MW --> CTRL["controller — adapta HTTP<br/>lee c.get y valida DTO con Zod"]
    CTRL --> SVC["service — reglas de dominio<br/>lanza HttpError con código de dominio"]
    SVC --> LOGIC["logic.ts — funciones puras sin BD<br/>10 archivos · 8 módulos"]
    SVC --> EXT["src/services — portal, cohere, firebase<br/>todos por fetch"]
    SVC --> REPO["repository — db.execute<br/>con plantilla sql parametrizada"]
    REPO --> DRZ["Drizzle ORM 0.45.2<br/>driver postgres-js"]
    DRZ --> PG[("PostgreSQL — 34 tablas")]
    SVC -.->|"inyectado en 13 services<br/>y nunca usado"| BUS["EventBus — inerte"]
    MW -.-> EH["errorHandler — app.onError<br/>server.ts L25"]
    CTRL -.-> EH
    SVC -.-> EH
    EH --> FL
    SALUD --> FL
```

---

### `src/server.ts`: 65 líneas y un orden que importa

Todo el arranque de la aplicación cabe en un archivo. Este es su contenido, en el orden **literal** en que se ejecuta:

| # | Paso | Línea | Qué hace exactamente |
|---:|:---|:---|:---|
| 0 | `new Hono()` | `server.ts:9` | Instancia raíz. Sin genéricos de `Variables`: los tipos de contexto los declara cada sub-app. |
| 1 | `registerEventObservers()` | `server.ts:11` | Corre **al importar el módulo**, antes de cualquier middleware. Su cuerpo está vacío. Es un no-op (ver más abajo). |
| 2 | `app.use("*", cors({...}))` | `server.ts:16-23` | Primer middleware. `origin` = `CORS_ORIGINS` partido por comas; si la lista queda vacía cae a `"*"`. `allowMethods: GET, POST, PUT, DELETE, OPTIONS` — **sin `PATCH`**. `allowHeaders: Content-Type, Authorization`. |
| 3 | `app.use("*", logger())` | `server.ts:24` | El logger de `hono/logger`. Segundo y **último** middleware global. |
| 4 | `app.onError(errorHandler)` | `server.ts:25` | No es un middleware de la cadena: es el manejador global de excepciones. Cubre las rutas raíz **y también** todas las sub-apps montadas con `app.route(...)`. |
| 5 | `GET /` | `server.ts:28-46` | Banner con `name`, `status`, `health` y un array `modules`. |
| 6 | `GET /health` | `server.ts:48-50` | `{ status: "ok", timestamp: <ISO> }`. **No toca la base de datos.** |
| 7 | `GET /version` | `server.ts:54-60` | `commit` / `ref` / `deployment` leídos de `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` y `VERCEL_DEPLOYMENT_ID`. Sirve para ver de un vistazo si producción quedó detrás de `main`. |
| 8 | `registerModules(app)` | `server.ts:63` | Monta las 16 sub-apps, en el orden de [`src/modules/index.ts`](src/modules/index.ts):20-35. |
| 9 | `export default app` | `server.ts:65` | Entrypoint serverless. **No arranca ningún listener.** |

> **1 · No hay middleware global de autenticación.** La cadena global tiene exactamente dos eslabones: `cors` y `logger`. `authMiddleware` y `requireRole` se montan **dentro de cada `*.routes.ts`**, con `app.use("*", ...)` cuando el módulo entero es homogéneo o ruta por ruta cuando no lo es (`auth`, `official-grades`, `schedule`, `chat` y `advising/student` lo hacen por ruta). La consecuencia es literal: `GET /`, `GET /health` y `GET /version` son los únicos endpoints del backend sin JWT, y lo son porque están declarados **antes** de `registerModules(app)`.

> **2 · Tampoco hay rate-limit global.** Los dos limitadores (`chatbotRateLimit` y `portalSyncRateLimit`) se montan en dos rutas concretas: `POST /chatbot/sessions/:id/ask` y `POST /portal-sync/import`. Ningún otro endpoint tiene límite de tasa.

> **3 · Lo que no está y podría esperarse.** Sin `secureHeaders`, sin compresión, sin `requestId`, sin body-limit, sin timeout de request. El backend confía en que Vercel ponga lo que falta.

Un detalle que delata el desfase entre documentación y código: el array `modules` de `GET /` lista **10 de los 15** prefijos. Faltan `/official-grades`, `/chat`, `/chatbot`, `/attendance-risk` y `/networking`. Está anotado en [Deuda técnica](#-deuda-técnica-y-límites-conocidos).

---

### El patrón de capas: `routes → controller → service → repository`

El contrato lo fijan `README.md:30-41` y `AGENTS.md:38-44`, y es corto:

| Capa | Responsabilidad | Prohibición explícita |
|:---|:---|:---|
| `routes` | Registra endpoints Hono y monta los middlewares del módulo. | No consulta la base de datos. |
| `controller` | Adapta HTTP: lee `c.get(...)`, valida el DTO, arma la respuesta. | No contiene reglas de negocio. |
| `service` | Reglas de dominio y coordinación. Lanza `HttpError`. | «Los services reciben repositories y `EventBus`; **no importan `db` directamente**» (`AGENTS.md:41`). |
| `repository` | Consultas Drizzle / PostgreSQL. | No decide nada del dominio. |
| `schemas` | Validaciones Zod de entrada. | — |
| `types` | DTOs y tipos del módulo. | — |

El módulo canónico son **7 archivos**:

```
src/modules/curriculum/
├── curriculum.routes.ts        16 líneas · app.use authMiddleware + requireRole, 3 rutas
├── curriculum.controller.ts    29 líneas · extrae c.get("studentId"), valida, c.json
├── curriculum.service.ts       84 líneas · arma el grafo de prerrequisitos, lanza 404
├── curriculum.repository.ts    90 líneas · 7 métodos, todos db.execute(sql`…`)
├── curriculum.schemas.ts       13 líneas · 2 esquemas Zod
├── curriculum.types.ts          1 línea  · un solo tipo exportado
└── index.ts                    18 líneas · LA RAÍZ DE COMPOSICIÓN
```

#### El `index.ts` no es un barril: es la raíz de composición

Aquí está la decisión arquitectónica más importante del repositorio. **No hay contenedor de inyección de dependencias, ni Service Locator, ni Facade** — `AGENTS.md:44` los prohíbe explícitamente. En su lugar, el `index.ts` de cada módulo instancia el grafo completo a mano, en tiempo de importación, y exporta el `Hono` ya cableado. El ejemplo textual, de [`src/modules/curriculum/index.ts`](src/modules/curriculum/index.ts):8-12:

```ts
const curriculumRepository = new CurriculumRepository(db);
const curriculumService = new CurriculumService(curriculumRepository, eventBus);
const curriculumController = new CurriculumController(curriculumService);
export const curriculumRoutes = createCurriculumRoutes(curriculumController);
```

Cuatro líneas: repositorio ← `db`, servicio ← repositorio + `eventBus`, controlador ← servicio, rutas ← controlador. El patrón se repite **idéntico en 12 de los 15 módulos**.

Lo que compra este cableado manual: las clases no conocen ningún framework de DI, reciben todo por constructor y por eso los tests las instancian con dobles sin tocar la base de datos. Lo que cuesta: las instancias son **singletons de proceso creados al importar**, así que cualquier ciclo de imports entre módulos se paga en tiempo de arranque.

#### Recorrido real por `curriculum`

| Archivo | Qué hace, verificado |
|:---|:---|
| [`curriculum.routes.ts`](src/modules/curriculum/curriculum.routes.ts) | `app.use("*", authMiddleware)` (`:8`) y `app.use("*", requireRole(...STUDENT_ROLES))` (`:9`). Tres rutas que solo delegan al controller pasándole el `Context`. |
| [`curriculum.controller.ts`](src/modules/curriculum/curriculum.controller.ts) | Extrae `c.get("studentId")` (`:10`, `:16`, `:23`), llama `validateJson(c, updateSimulationSchema)` (`:17`), parsea el path param con `parseInt` (`:25`) y responde con `c.json(result)`. Ni una regla de negocio. |
| [`curriculum.service.ts`](src/modules/curriculum/curriculum.service.ts) | `getCurriculum` orquesta 4 llamadas al repositorio y arma el grafo de prerrequisitos, traduciendo `required_cycle` 5 → `"_V_CICLO_"` y 6 → `"_VI_CICLO_"` (`:22-25`). `updateSimulation` y `deleteSimulation` verifican que el curso pertenezca al currículo y lanzan `HttpError(404, …, "COURSE_NOT_FOUND")` (`:57`, `:75`). |
| [`curriculum.repository.ts`](src/modules/curriculum/curriculum.repository.ts) | 7 métodos, todos ``this.database.execute(sql`…`)`` parametrizado. El comentario `:4-6` deja escrita la decisión: «Sin catch de rescate: un fallo de BD (o un estudiante inexistente) se propaga en vez de simular malla vacía». |

Los repositorios usan **SQL parametrizado con la plantilla `sql` de Drizzle**, no el query builder. `AGENTS.md:42` lo autoriza. El schema tipado se usa solo para generar migraciones — ver [El modelo de datos](#-el-modelo-de-datos).

---

### El ciclo de vida de un request autenticado

```mermaid
sequenceDiagram
    autonumber
    actor App as App Flutter
    participant CO as cors
    participant LG as logger
    participant AU as authMiddleware
    participant RR as requireRole
    participant CT as CurriculumController
    participant SV as CurriculumService
    participant RP as CurriculumRepository
    participant DZ as Drizzle plantilla sql
    participant PG as PostgreSQL
    participant EH as errorHandler

    App->>CO: GET /curriculum/me con Authorization Bearer
    CO->>LG: origen validado contra CORS_ORIGINS
    LG->>AU: traza método, ruta y latencia
    AU->>AU: jwt.verify con JWT_SECRET
    AU->>PG: SELECT token_version FROM app_user WHERE id igual a sub
    PG-->>AU: token_version vigente
    alt header ausente, firma inválida o token_version distinta
        AU-->>EH: throw HttpError 401 MISSING_TOKEN o INVALID_TOKEN
        EH-->>App: 401 con sobre error code message details
    end
    AU->>RR: c.set userId, role y studentId o teacherId
    alt role fuera de STUDENT_ROLES
        RR-->>EH: throw HttpError 403 FORBIDDEN
        EH-->>App: 403 FORBIDDEN
    end
    RR->>CT: handler de la ruta
    CT->>CT: lee c.get studentId y valida el DTO con Zod
    alt body o params no cumplen el schema
        CT-->>EH: throw HttpError 400 con details igual a flatten
        EH-->>App: 400 INVALID_REQUEST_BODY
    end
    CT->>SV: getCurriculum del studentId
    SV->>RP: 4 consultas de malla y prerrequisitos
    RP->>DZ: db.execute con plantilla sql parametrizada
    DZ->>PG: SQL con parámetros ligados
    PG-->>DZ: filas
    DZ-->>RP: resultado
    RP-->>SV: datos crudos
    SV->>SV: arma el grafo de prerrequisitos
    alt curso ajeno al currículo del alumno
        SV-->>EH: throw HttpError 404 COURSE_NOT_FOUND
        EH-->>App: 404 COURSE_NOT_FOUND
    end
    SV-->>CT: currículo armado
    CT-->>App: 200 con c.json
```

Dos observaciones que salen del diagrama y no del papel:

> **4 · Una consulta a PostgreSQL por cada request autenticada.** El paso «Single Active Session» de `authMiddleware` (`auth-middleware.ts:61-68`) lee `app_user.token_version` y lo compara con el claim del JWT. No hay caché ni memoización. Es el precio elegido para poder invalidar sesiones al instante.

> **5 · El error nunca se serializa dos veces.** Toda capa lanza; nadie captura para responder. El único punto que convierte una excepción en JSON es `errorHandler`, registrado con `app.onError`. Las dos excepciones a esta regla están abajo.

---

### Los 16 módulos

Registrados en [`src/modules/index.ts`](src/modules/index.ts):20-35, en este orden exacto. La columna **Archivos** es `nivel 1 / recursivo`; solo difiere en los dos módulos con subcarpetas.

| # | Módulo | Prefijo | Archivos | Propósito | Guarda del sub-app |
|---:|:---|:---|---:|:---|:---|
| 1 | `auth` | `/auth` | 8 | Login por código+contraseña y por Google, JWT con `tokenVersion`, `/me`, logout y reset por OTP. | Ninguna — `authMiddleware` por ruta |
| 2 | `academic-profile` | `/academic-profile` | 7 | Carrera del alumno, catálogo de carreras y especialidades, y selección de especialidad principal y de interés. | `authMiddleware` + `requireRole(...STUDENT_ROLES)` |
| 3 | `curriculum` | `/curriculum` | 7 | Malla curricular con prerrequisitos y la capa de simulación «¿y si…?» del alumno. | `authMiddleware` + `requireRole(...STUDENT_ROLES)` |
| 4 | `grades` | `/grades` | 8 | Notas **no oficiales**: calculadora de promedio ponderado y persistencia en `simulated_grades`. | `authMiddleware` + `requireRole(...STUDENT_ROLES)` |
| 5 | `official-grades` | `/official-grades` | 7 | Notas **oficiales** en `student_score`: el alumno las lee, el docente carga la grilla de su sección. | `authMiddleware`, rol por ruta |
| 6 | `schedule` | `/schedule` | 9 | Horario semanal y evaluaciones en dos vistas, `/me/*` y `/teacher/*`, más aviso de notas cargadas. | `authMiddleware`, rol por ruta |
| 7 | `course-detail` | `/course-detail` | 7 | Detalle de sección: secciones, docentes, matrículas, anuncios y directorio de contactos del salón. | `authMiddleware` + `requireRole(...STUDENT_ROLES, "teacher")` |
| 8 | `alerts` | `/alerts` | 8 | Alertas personales del alumno — riesgo académico y alta carga — y marcado de leídas. | `authMiddleware` + `requireRole(...STUDENT_ROLES)` |
| 9 | `section-management` | `/section-management` | 8 | Funciones de delegado y subdelegado: representantes, anuncios del salón y estadísticas de sección. | `authMiddleware` + `requireRole(...STUDENT_ROLES)`; `delegate`/`subdelegate` en 5 de 6 rutas |
| 10 | `advising` | `/advising` | 1 / 17 | Asesorías extra: el docente las crea y ve asistentes; el alumno las consulta y confirma RSVP. | Definida en cada submódulo |
| 11 | `chat` | `/chat` | 7 | Chat de sección sobre Firebase: custom token con rol, peso y bandera de moderador, y borrado suave por el profesor titular. | `authMiddleware`, rol por ruta |
| 12 | `chatbot` | `/chatbot` | 11 | Asistente «ULimaBot» sobre Cohere: sesiones y respuestas ancladas al contexto académico real del alumno. | `authMiddleware` + `requireRole("student","delegate","subdelegate")` |
| 13 | `attendance-risk` | `/attendance-risk` | 7 | Vista docente de alumnos impedidos o en riesgo por inasistencias, con resumen y notificación masiva. | `authMiddleware` + `requireRole("teacher")` |
| 14 | `networking` | `/networking` | 8 | Carnet de redes sociales con opt-in explícito: lectura y edición propia, lectura pública de otro usuario. | `authMiddleware` + `requireRole(...STUDENT_ROLES, "teacher")` |
| 15 | `avatar` | `/avatar` | 8 | Fotos de perfil sobre Cloudinary: el backend solo firma la subida —la app manda los bytes directo al CDN—, confirma la versión en `app_user` y borra la propia o la de otro si se comparte sección. | `authMiddleware` + `requireRole(...STUDENT_ROLES, "teacher")` |
| 16 | `portal-sync` | `/portal-sync` | 7 / 18 | Importación desde miUlima: descarga y parseo de matrícula, horario, récord, sílabos y delegados, con persistencia transaccional. | `authMiddleware` + `requireRole(...STUDENT_ROLES)`; `portalSyncRateLimit` en `/import` |

`STUDENT_ROLES` es la constante `["student", "delegate", "subdelegate"] as const` de `auth-middleware.ts:101`, expandida con spread en 11 módulos. El detalle endpoint por endpoint está en [La API](#-la-api); el modelo de permisos, en [Seguridad](#-seguridad).

---

### Las excepciones al patrón

El patrón no es uniforme, y conviene decirlo antes de que alguien abra `chat/` esperando un service.

> **1 · Los archivos `.logic.ts`: una capa extra de funciones puras.** Ocho módulos añaden diez archivos con lógica sin base de datos ni efectos —`schedule` aporta dos y `advising` uno por submódulo—, para poder testearla directamente con `bun test` y medirla con Stryker.

| Archivo `.logic.ts` | Líneas | Qué contiene |
|:---|---:|:---|
| [`auth/password-reset.logic.ts`](src/modules/auth/password-reset.logic.ts) | 73 | Generación de OTP con `randomInt`, hash SHA-256, `validateResetToken` con `timingSafeEqual`, `maskEmail`. |
| [`alerts/alerts.logic.ts`](src/modules/alerts/alerts.logic.ts) | 113 | Umbrales de riesgo académico y crítico, `aggregateCourseScores`, `personalAverage`, `requiredOnRemaining`. |
| [`grades/grades.logic.ts`](src/modules/grades/grades.logic.ts) | 19 | `calcularPromedioPonderado` y `sumaDePesos`. Lleva una directiva `// Stryker disable next-line` documentando un mutante equivalente. |
| [`chat/chat.logic.ts`](src/modules/chat/chat.logic.ts) | 83 | `roleLabel`, `roleWeight`, `isModeratorRole`, `buildParticipant`, `canIssueToken`. |
| [`schedule/schedule.logic.ts`](src/modules/schedule/schedule.logic.ts) | 233 | `academicWeekOf`, `mergeScheduleData`, `validateSchedulePayload`. Su cabecera declara la complejidad ciclomática de `mergeScheduleData`. |
| [`schedule/teacherSchedule.logic.ts`](src/modules/schedule/teacherSchedule.logic.ts) | 223 | `resolveTeacherBlock`, `validateCourseBlockInput`, `computeGradesStatus`. |
| [`section-management/section-statistics.logic.ts`](src/modules/section-management/section-statistics.logic.ts) | 74 | `computeSectionStatistics`: promedio del salón, porcentaje de aprobados e histograma. |
| [`networking/networking.logic.ts`](src/modules/networking/networking.logic.ts) | 88 | `isHttpUrl`, `urlBelongsToPlatform`, `validateSocialLink`, `normalizeSocialLink`. |
| [`advising/student/student.logic.ts`](src/modules/advising/student/student.logic.ts) | 39 | `isSessionPast(session, now)` — el reloj entra como parámetro, no se lee dentro. |
| [`advising/teacher/teacher.logic.ts`](src/modules/advising/teacher/teacher.logic.ts) | 99 | `rangesOverlap`, `isDateWithinPeriod`, `limaDateString`, `jpViolatesCycleRule`, `validateCreateAdvising`. |

> **2 · `advising` es el único módulo con submódulos.** Su [`index.ts`](src/modules/advising/index.ts) tiene **11 líneas** y no es una raíz de composición: es un agregador que crea un `Hono` propio y monta dos sub-apps completas — `app.route("/me", teacherRoutes)` (`:6`) y `app.route("/", studentRoutes)` (`:7`). Por eso las rutas docentes viven bajo `/advising/me/*` y las de alumno bajo `/advising/section/:sectionId` y `/advising/:sessionId/rsvp`. Cada submódulo tiene sus **8 archivos** y **su propia raíz de composición** (`advising/teacher/index.ts:8-12`, `advising/student/index.ts:8-12`), y hasta guardas distintas: teacher usa `app.use("*", authMiddleware)` + `requireRole("teacher")`, student las declara ruta por ruta. Total recursivo: **17 archivos**.

> **3 · `chatbot` tiene 4 archivos sueltos fuera del patrón.** Además de los 7 canónicos: [`intent-classifier.ts`](src/modules/chatbot/intent-classifier.ts) (87 líneas, `KEYWORD_MAP` con 7 intenciones), [`context-builder.ts`](src/modules/chatbot/context-builder.ts) (165, el `SYSTEM_PROMPT` de 10 reglas de «ULimaBot»), [`chat-search.ts`](src/modules/chatbot/chat-search.ts) (57, busca en los mensajes de Firebase) y [`grades-summary.ts`](src/modules/chatbot/grades-summary.ts) (89, que **reutiliza la lógica pura de otro módulo**: importa `aggregateCourseScores`, `personalAverage`, `requiredOnRemaining` y `PASSING_GRADE` desde `../alerts/alerts.logic.js`). Su `index.ts` es un IIFE en vez de constantes sueltas, inyecta **otro service** en lugar del `eventBus` — `new ChatbotService(repository, scheduleService)` (`chatbot/index.ts:10`), único caso de service que depende de service — y su controller **no delega los errores al `errorHandler`**: hace `try/catch` y devuelve 400/404/500/503 a mano (`chatbot.controller.ts:54-100`), además de filtrar prompt-injection con 5 regex.

> **4 · `chat` no tiene `service.ts`.** Sus 7 archivos son routes, controller, logic, repository, schemas, types e index. El controller absorbe el rol del service: importa `db` directamente (`chat.controller.ts:1`) —violando `AGENTS.md:41`— y se construye su propio repositorio con un parámetro por defecto, `constructor(readonly repository = new ChatRepository(db)) {}` (`:8`). Su `index.ts` tiene 7 líneas y hace `new ChatController()` sin argumentos.

> **5 · `course-detail` guarda SQL crudo en el archivo de rutas.** [`course-detail.routes.ts`](src/modules/course-detail/course-detail.routes.ts) tiene **318 líneas**: importa `db` y `sql` (`:3-4`), define el helper `splitName` (`:10-36`), la guarda de pertenencia `exigirPertenencia` (`:60-79`) y resuelve 4 de sus 6 rutas con SQL inline en el handler, con ``db.execute(sql`…`)`` repartido por todo el archivo. Solo `/sections/:sectionId/announcements` delega al controller. El propio archivo lo admite en `:46-48`: «estas rutas usan SQL crudo (deuda reconocida en la auditoría)». Además, `GET /sections/:sectionId` se auto-invoca por HTTP (`app.request("/sections", …)`, `:161-163`) reenviando el token para volver a pasar `authMiddleware`.

> **6 · `attendance-risk` dejó la lógica de dominio dentro del service.** `classifyStudent` (`attendance-risk.service.ts:39-116`) y `computeSummary` (`:118-128`) son funciones a nivel de módulo, no exportadas y sin `.logic.ts`. De paso duplica —con una variación menor de estilo, `} else if` partido en dos sentencias— el helper `splitName` que ya está en `course-detail.routes.ts:10-36`.

#### El acoplamiento entre módulos: `portal-sync` importa la instancia viva de `authService`

Es la única dependencia por instancia entre dos módulos, y está puesta a propósito. [`src/modules/auth/index.ts`](src/modules/auth/index.ts):14-16 lo deja escrito:

```ts
/** Se exporta la MISMA instancia (no una nueva) para que portal-sync pueda
 *  re-firmar el token del alumno que acaba de ser promovido a delegado. */
export { authService };
```

Y [`src/modules/portal-sync/index.ts`](src/modules/portal-sync/index.ts):10 la consume:

```ts
const portalSyncService = new PortalSyncService(portalSyncRepository, portalClient, authService);
```

**Por qué existe.** El rol del alumno viaja **dentro del JWT**, y hoy solo se calcula en el login. Cuando una importación desde miUlima descubre que el alumno es delegado o subdelegado de su sección, ese hecho queda en la base pero no en el token que la app está usando en esa misma petición: sin re-firma, el recién promovido no vería su pestaña de delegado hasta volver a entrar. `portal-sync` llama entonces a `authService.reissueToken(userId, position)` (`portal-sync.service.ts:511`) y devuelve el JWT nuevo en `ImportResult.token`.

**Por qué no incrementa `tokenVersion`.** `reissueToken` re-firma con la versión **vigente**, no con una nueva. Subirla mataría el token que la app está usando en ese mismo request, `authMiddleware` respondería 401 y el `ApiClient` de Flutter —que trata todo 401 como expiración— cerraría la sesión. Ascender a alguien a delegado lo echaría de la app. Los comentarios de `auth.service.ts:288-315` lo dicen sin rodeos: quien «arregle» esto agregando el incremento rompe la feature completa.

**Cómo se contuvo el acoplamiento.** La dependencia es el **tercer parámetro, opcional y tipado estructuralmente** (`portal-sync.service.ts:32-45`): `PortalSyncService` no importa el módulo `auth`, solo declara la forma `{ reissueToken(userId, role): Promise<string | null> }`. Los dobles de los tests lo construyen con dos argumentos y `token` sale `null`, que es la degradación aceptada. `portal-sync` es, además, **el único módulo cuyo service no recibe `EventBus`**.

---

### El EventBus: una costura preparada que nunca se conectó

`src/events/` implementa el patrón Observer que pide la rúbrica del curso. Está completo, es correcto y **no se ejecuta nunca**.

**Lo que expone.** [`src/events/event-bus.ts`](src/events/event-bus.ts) (31 líneas) declara `class EventBus` con un `Map<DomainEventName, Set<handler>>` y dos métodos: `subscribe(eventName, handler)`, que devuelve una función de desuscripción (`:18-20`), y `async publish(eventName, payload)`, que ejecuta **todos los handlers en paralelo** con `Promise.all` (`:27`) y sin `try/catch` — un handler que lance rechaza el `publish` entero. La línea 31 exporta el singleton `eventBus`.

**Qué eventos declara: ninguno.** [`src/events/event-types.ts`](src/events/event-types.ts) tiene **2 líneas**:

```ts
export type DomainEventMap = Record<string, unknown>;
export type DomainEventName = keyof DomainEventMap;
```

`DomainEventMap` es un `Record` abierto, así que `DomainEventName` es `string` y los genéricos de `subscribe`/`publish` no restringen nada. **No hay ni un solo evento de dominio definido.**

**Qué hacen los tres observers: nada.** Los tres archivos de `src/events/observers/` son idénticos:

```ts
export const registerAcademicRiskObserver = (bus: EventBus) => {
  void bus;
};
```

Lo mismo en `announcement.observer.ts:3-5` y `section-average.observer.ts:3-5`. El `void bus;` existe únicamente para satisfacer `noUnusedParameters: true` de `tsconfig.json:18`. Y ninguna de las tres funciones se importa desde ningún punto de `src/` ni de `test/`.

**`registerEventObservers()` es un no-op, con todas las letras.** [`src/events/index.ts`](src/events/index.ts):1-3:

```ts
export const registerEventObservers = () => {
  // Observer registration intentionally left empty for future implementation.
};
```

El cuerpo está vacío. `server.ts:11` la llama y no ocurre nada.

**Nadie publica y nadie se suscribe.** Un `grep` de `.publish(` y `.subscribe(` sobre `src/` devuelve **cero resultados**. Aun así, **13 services reciben `readonly events: EventBus` por constructor** —auth, academic-profile, curriculum, grades, schedule, alerts, course-detail, networking, official-grades, section-management, attendance-risk, advising/student y advising/teacher— y sus 13 raíces de composición importan el singleton para pasárselo. `portal-sync`, `chatbot` y `chat` son las tres que no.

El resultado neto: el EventBus es una costura arquitectónica bien construida y **completamente inerte en runtime**. `README.md:10` y `AGENTS.md:11` ya lo documentan como «infraestructura base sin observers de negocio implementados», y nosotros lo repetimos aquí porque leer 13 constructores que reciben un bus invita a suponer lo contrario.

---

### `shared/`: errores, middlewares y reloj

#### Jerarquía de errores: dos clases, una de ellas nunca instanciada

```
Error (nativo)
 └─ AppError        src/shared/errors/app-error.ts:1-10    · 0 instanciaciones
     └─ HttpError   src/shared/errors/http-error.ts:4-14   · 113 instanciaciones
```

| Clase | Constructor | Qué aporta | Instancias en `src/` |
|:---|:---|:---|---:|
| `AppError` | `(message: string, readonly code: string, readonly details?: unknown)` | La semántica de **código de dominio** y un payload libre. **No conoce HTTP.** Fija `name = "AppError"`. | **0** |
| `HttpError` | `(readonly statusCode: ContentfulStatusCode, message: string, code = "HTTP_ERROR", details?: unknown)` | Le añade el status. `ContentfulStatusCode` de `hono/utils/http-status` **impide construir un error con 204 o 304**. Fija `name = "HttpError"`. | **113** |

`AppError` existe solo como base: `grep "new AppError(" src` devuelve cero resultados. La separación paga cuando el dominio necesite un error que no sea una respuesta HTTP; hoy no lo necesita.

Distribución de las 113 instancias por status: 26 de 404, 21 de 401, 19 de 403, 16 de 400, 11 de 500, 8 de 409, 7 de 502, 4 de 422 y 1 de 504. El catálogo completo de códigos está en [La API](#-la-api).

#### Los middlewares

| Artefacto | Firma | Comportamiento |
|:---|:---|:---|
| `authMiddleware` | `MiddlewareHandler` | Exige `Authorization: Bearer <jwt>`; `jwt.verify` con `JWT_SECRET`; valida que `sub`, `role` y `tokenVersion` sean enteros; exige `teacherId` si `role === "teacher"` y `studentId` en cualquier otro rol; consulta `app_user.token_version` y la compara (Single Active Session); setea `userId`, `role` y **exclusivamente uno** de `studentId`/`teacherId`. Cualquier fallo → 401 `MISSING_TOKEN` o `INVALID_TOKEN`. Sus comentarios `:21-23` documentan las tres vías de suplantación eliminadas: `?code=`, header `X-User-Code` y prefijo `Bearer dev-`. |
| `requireRole` | `(...roles: string[]) => MiddlewareHandler` | Lee `c.get("role")`; si no es string o no está en la lista → `HttpError(403, …, "FORBIDDEN")`. Su JSDoc exige que corra **después** de `authMiddleware` — sin el `c.set` previo siempre daría 403. |
| `errorHandler` | `ErrorHandler`, registrado con `app.onError` | `HttpError` → `c.json({ error: { code, message, details } }, statusCode)`. Cualquier otro error → `console.error("Unhandled error:", …)` y `c.json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Unexpected server error" } }, 500)`. No filtra el error original al cliente. |
| `chatbotRateLimit` | `async (c, next)` | `Map<studentId, {count, resetAt}>` en memoria; ventana `WINDOW_MS = 3 600 000` ms; tope `CHATBOT_RATE_LIMIT`, por defecto **20**. Sin `studentId` en contexto **deja pasar sin contar**. Al exceder **devuelve** (no lanza) 429 `RATE_LIMITED` con `details.retryAfterMinutes`. Emite `X-RateLimit-Remaining` y `X-RateLimit-Reset`. |
| `portalSyncRateLimit` | `async (c, next)` | `Map` propio; misma ventana de 1 h; `PORTAL_MAX_PER_HOUR = 5` **hardcodeado**, no configurable por env, porque cada importación dispara ~9-11 peticiones salientes al portal de la Universidad. Descuenta el cupo **antes** de trabajar y, tras `await next()`, inspecciona la respuesta: si es 409 con `code === "PORTAL_LOGIN_REJECTED"`, **reembolsa** el cupo — el passcode SecurID de 6 dígitos caduca cada 30 s y equivocarse es normal. Un 502 del portal **no** reembolsa. No emite cabeceras `X-RateLimit-*`. |
| `validateJson` | `async <T>(c: Context, schema: ZodSchema<T>) => Promise<T>` | Body no-JSON → 400 `INVALID_JSON_BODY`; `safeParse` fallido → 400 `INVALID_REQUEST_BODY` con `details = error.flatten()`. |
| `validateQuery` | `<T>(c: Context, schema: ZodSchema<T>) => T` (síncrona) | `safeParse(c.req.query())`; fallo → 400 `INVALID_QUERY_PARAMS` con `flatten()`. |
| `validateParams` | `<T>(c: Context, schema: ZodSchema<T>) => T` (síncrona) | `safeParse(c.req.param())`; fallo → 400 `INVALID_ROUTE_PARAMS` con `flatten()`. |

> ⚠️ **Los tres `validate*` no son middlewares.** Pese a vivir en [`src/shared/middleware/validate-dto.ts`](src/shared/middleware/validate-dto.ts), se llaman **dentro** del handler o del controller y nunca se montan con `app.use`. Los tres adjuntan `error.flatten()` como `details`, de modo que el cliente recibe el detalle campo a campo. Sus mensajes están en inglés, a diferencia del resto del backend.

> ⚠️ **Dos rutas se saltan el `errorHandler`.** Los dos rate-limiters (`rate-limit.ts:33-39` y `:80-86`) y el `ChatbotController` (`chatbot.controller.ts:54-99`) responden con `c.json(...)` en vez de lanzar. El sobre `{ error: { code, message, details } }` es idéntico, así que el cliente no nota la diferencia; el código sí.

> ⚠️ **Los dos limitadores son por instancia, no globales.** Ambos `Map` viven en la memoria del proceso. En Vercel serverless cada instancia fría estrena contador, así que los topes de 20/h y 5/h son un piso, no un techo. Está en [Deuda técnica](#-deuda-técnica-y-límites-conocidos).

#### `shared/clock.ts`

Seis líneas que resuelven un problema real: el servidor corre en `iad1` (UTC) y todo el dominio razona en fecha de Lima.

```ts
const LIMA_TIMEZONE = "America/Lima";
const LIMA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: LIMA_TIMEZONE });

export const todayISO = (): string => LIMA_DATE_FORMATTER.format(new Date());
export const LIMA_TZ = LIMA_TIMEZONE;
```

El truco es el locale `en-CA`, que formatea como `YYYY-MM-DD` — la fecha de Lima en formato ISO, sin librerías. El `Intl.DateTimeFormat` se construye una vez y se reutiliza, porque instanciarlo es caro.

Otros dos artefactos de `shared/` que conviene conocer: [`src/shared/utils/nombre-persona.ts`](src/shared/utils/nombre-persona.ts) (40 líneas), que identifica personas por conjunto ordenado de palabras y nació de un incidente real —11 docentes duplicados en producción el 2026-09-05 porque el seed guardaba «APELLIDOS, NOMBRES» y portal-sync «NOMBRES APELLIDOS»—, y [`src/shared/email/resend-client.ts`](src/shared/email/resend-client.ts) (89 líneas), que **nunca lanza hacia el llamador** para no filtrar si una cuenta existe.

---

### Dos entrypoints, uno huérfano

| | [`src/server.ts`](src/server.ts) | [`src/node-server.ts`](src/node-server.ts) |
|:---|:---|:---|
| Líneas | 65 | 11 |
| Qué exporta | `export default app` — la instancia `Hono` (`:65`) | Nada. Es un script de arranque |
| Listener | **Ninguno.** Sin `Bun.serve()`, sin `app.listen()`, sin adapter | `serve({ fetch: app.fetch, port }, cb)` con `serve` de `@hono/node-server` (`:6-11`) |
| Puerto | No lo lee | `process.env.PORT ? parseInt(process.env.PORT) : 3000` (`:4`) — **no** usa `config.server.port` |
| Modelo | Serverless: la plataforma invoca `app.fetch` por request | Proceso Node persistente |
| Referenciado por | `package.json:5` (`main`), `:8` (`dev`), `:10` (`start`) y `vercel.json` con el preset `hono` | **Nada.** Ningún script, ningún import, ninguna configuración |

**Vercel usa `src/server.ts`.** El diseño está fijado por spec, no por costumbre: `specs/features/platform-runtime/platform-runtime.spec.md` define **BR-PLATFORM-01** (el archivo debe exportar la instancia `Hono` como default export, conservar `cors`, `logger`, `errorHandler`, `registerEventObservers()`, `GET /`, `GET /health` y `registerModules(app)`, y **no iniciar listeners, puertos ni adapters manuales**), **BR-PLATFORM-02** (compatibilidad con Bun sin `Bun.serve()` explícito) y **BR-PLATFORM-03** (el deploy en Vercel usa el default export como entrypoint serverless).

**`src/node-server.ts` está huérfano, sí.** La misma spec ordena en su plan de implementación eliminar el import de `@hono/node-server`; el archivo sobrevivió al cambio. Nada lo referencia, pero se compila igual —`tsconfig.json:23` incluye `src/**/*` sin excluirlo— y `dist/` termina con `node-server.js` (310 bytes) junto a `server.js` (1 905 bytes), cada uno con su `.d.ts` y su source map. La dependencia `@hono/node-server ^2.0.4` sigue instalada solo para él.

---

### Dependencias por rol

`package.json` declara **12 dependencias** y **6 devDependencies**. Lo más revelador de esta tabla son las filas sin paquete: tres integraciones externas se hablan por `fetch` nativo, sin SDK.

| Rol | Paquete | Versión | Uso verificado |
|:---|:---|:---|:---|
| Runtime HTTP | `hono` | `^4.6.0` → 4.12.19 | `src/server.ts:1` y los 16 `*.routes.ts` |
| Runtime HTTP | `@hono/node-server` | `^2.0.4` | Solo `src/node-server.ts:1` — **archivo huérfano** |
| Datos | `drizzle-orm` | `^0.45.2` → 0.45.2 | Se importan dos submódulos: `drizzle-orm/postgres-js` (3 veces) y `drizzle-orm/pg-core` (1, el schema) |
| Datos | `postgres` | `^3.4.0` | El driver real, en `src/db/index.ts:2,7` |
| Datos | `pg` | `^8.21.0` | ⚠️ **Sin ningún import en `src/`** |
| Datos | `@aws-sdk/client-rds-data` | `^3.1053.0` | ⚠️ **Sin ningún import en `src/`** |
| Configuración | `dotenv` | `^16.4.0` | `import "dotenv/config"` en `src/config/env.ts:1` y `drizzle.config.ts:2` |
| Validación | `zod` | `^3.23.0` → 3.25.76 | Base de `env.ts` y de los 14 `*.schemas.ts` |
| Autenticación | `jsonwebtoken` | `^9.0.2` | Firma en `auth.service.ts:5`, verificación en `auth-middleware.ts:2,35` |
| Autenticación | `bcryptjs` | `^2.4.3` | `bcrypt.compare` en login, con coste 10 |
| Autenticación | `google-auth-library` | `^10.7.0` | `OAuth2Client` para verificar el `idToken` de Google |
| Criptografía | *(ninguno — `node:crypto`)* | — | `createHash`, `randomInt` y `timingSafeEqual` para el OTP de reset |
| Chat en tiempo real | `firebase-admin` | **`12.1.0` exacta, sin rango** | `src/services/firebase.service.ts` — custom tokens y Realtime Database |
| IA / chatbot | *(ninguno)* | — | **No hay SDK de Cohere.** `src/services/cohere.client.ts` (219 líneas) habla por `fetch` contra `api.cohere.com` |
| Correo | *(ninguno)* | — | **No hay SDK de Resend.** `src/shared/email/resend-client.ts` hace `POST` por `fetch` a `api.resend.com/emails` |
| Portal ULima | *(ninguno)* | — | `src/services/portal.client.ts` (410 líneas) usa `fetch` nativo contra el portal, con allowlist de host |
| Dev · build | `typescript` | `^5.7.0` → 5.9.3 | `bun run build` es literalmente `tsc` |
| Dev · tipos | `@types/bun`, `@types/bcryptjs`, `@types/jsonwebtoken` | `latest`, `^2.4.6`, `^9.0.7` | `tsconfig.json:21` fija `types: ["bun-types"]` |
| Dev · migraciones | `drizzle-kit` | `^0.31.10` | `db:generate`, `db:push`, `db:studio` |
| Dev · mutación | `@stryker-mutator/core` | `^9.6.1` | 6 configuraciones `stryker.<persona>.conf.json` y 6 scripts `mut:*` — ver [Pruebas y calidad](#-pruebas-y-calidad) |
| Dev · pruebas | *(ninguno)* | — | `bun test` nativo; `bunfig.toml` precarga `test/env.setup.ts` |

> **1 · Dos dependencias de base de datos que nadie usa.** `pg` y `@aws-sdk/client-rds-data` no tienen un solo import en `src/`. El único driver real es `postgres` vía `drizzle-orm/postgres-js`. No verificamos si `drizzle-kit` los arrastra de forma indirecta en tiempo de migración; en el código de la aplicación, no.

> **2 · `firebase-admin` está pineada sin rango.** `12.1.0` exacta, a diferencia de las otras once dependencias. El motivo está documentado en `KNOWLEDGE.md:144-147`: las v13 y v14 arrastran `jwks-rsa` → `jose` (ESM) y hacen crashear el despliegue de Vercel con `ERR_REQUIRE_ESM`.

> **3 · Tres integraciones sin SDK.** Cohere, Resend y el portal de la Universidad se consumen con `fetch` nativo. Menos superficie de dependencias y menos peso en el bundle serverless, a cambio de escribir y mantener a mano el manejo de timeouts, errores y parseo. El detalle de cada cliente está en [Integraciones externas](#-integraciones-externas).

---

## 📁 Mapa del repositorio

```
ULima_Backend_IS2/
├── src/                              # 184 archivos .ts · 16 795 líneas
│   ├── server.ts                     # 65 · app Hono: CORS, logger, onError, GET / · /health · /version, registerModules
│   ├── node-server.ts                # 11 · listener Node HUÉRFANO: ningún script, import ni config lo referencia
│   ├── config/                       # 2 archivos · 142 líneas
│   │   ├── env.ts                    # 99 · Zod sobre process.env; allowlist anti-SSRF; process.exit(1) si algo falta
│   │   └── app-config.ts             # 43 · el objeto `config` que consume el resto del backend
│   ├── db/                           # 18 archivos · 3 072 líneas
│   │   ├── index.ts                  # 8 · conexión postgres-js + drizzle
│   │   ├── schema/schema.ts          # 569 · las 34 tablas y los 11 enums de PostgreSQL
│   │   ├── relations/index.ts        # 3 · vacío a propósito: los repositorios no usan relaciones Drizzle
│   │   ├── seed/                     # 11 archivos · aprovisionamiento administrativo aprobado, ejecutado a mano
│   │   ├── migrate.ts                # runner de migraciones (`bun run db:migrate`, requiere aprobación)
│   │   ├── apply-migration.ts        # aplica un .sql numerado de drizzle/ (`bun run db:apply`)
│   │   └── stamp-baseline.ts         # sella el baseline tras el re-baseline TT04
│   ├── events/                       # 6 archivos · 54 líneas · EventBus + 3 observers, declarados pero INERTES
│   ├── middleware/index.ts           # 1 línea: `export {}` — barril muerto
│   ├── modules/                      # 137 archivos · 12 207 líneas · los 15 módulos de modules/index.ts:19-33
│   │   ├── auth/                     # 1 441 · login por código y por Google, JWT con tokenVersion, reset por OTP
│   │   ├── academic-profile/         # 493 · carrera, catálogo de especialidades, selección principal / de interés
│   │   ├── curriculum/               # 251 · malla con prerrequisitos + capa de simulación visual «¿y si…?»
│   │   ├── grades/                   # 386 · notas NO oficiales del alumno, persistidas en `simulated_grades`
│   │   ├── official-grades/          # 409 · notas oficiales en `student_score`: las lee el alumno, las carga el docente
│   │   ├── schedule/                 # 1 460 · horario y evaluaciones en vista alumno /me/* y vista docente /teacher/*
│   │   ├── course-detail/            # 618 · secciones, docentes, matrículas, anuncios y contactos del salón
│   │   ├── alerts/                   # 472 · alertas de riesgo académico y alta carga; marcado de leídas
│   │   ├── section-management/       # 747 · delegado y subdelegado: representantes, anuncios y estadísticas
│   │   ├── advising/                 # 1 013 · ÚNICO módulo con submódulos: teacher/ y student/, 8 archivos cada uno
│   │   ├── chat/                     # 350 · puente a Firebase; ÚNICO módulo sin `service.ts`
│   │   ├── chatbot/                  # 1 264 · «ULimaBot» sobre Cohere, anclado al contexto académico real
│   │   ├── attendance-risk/          # 386 · vista docente de alumnos impedidos y en riesgo por inasistencias
│   │   ├── networking/               # 495 · carnet de redes sociales con opt-in explícito
│   │   ├── portal-sync/              # 2 388 · el módulo más grande: 7 archivos de nivel 1 + parsers/ con 10
│   │   └── index.ts                  # 34 · registro y orden exacto de montaje de los 15 prefijos
│   ├── services/                     # 4 archivos · 799 líneas · clientes de terceros
│   │   ├── portal.client.ts          # 410 · miUlima (webaloe) y sílabos (cactus); traduce fallos a HttpError
│   │   ├── cohere.client.ts          # 219 · chat, clasificación, rerank y título, por fetch
│   │   ├── firebase.service.ts       # 169 · custom tokens, membresía del chat y lectura de RTDB
│   │   └── index.ts                  # 1 línea: `export {}` — barril muerto
│   ├── shared/                       # 12 archivos · 442 líneas
│   │   ├── middleware/               # auth-middleware.ts 101 · rate-limit.ts 103 · validate-dto.ts 34 · error-handler.ts 29
│   │   ├── errors/                   # app-error.ts 10 · http-error.ts 14 — HttpError se instancia 113 veces en src/
│   │   ├── types/                    # auth.ts 4 · http.ts 11
│   │   ├── utils/                    # nombre-persona.ts 40 (la regla ÚNICA para partir nombres) + index.ts 1
│   │   ├── email/resend-client.ts    # 89 · envío del OTP por Resend, vía fetch
│   │   └── clock.ts                  # 6 · reloj inyectable, para tests deterministas
│   ├── types/index.ts                # 1 línea: `export {}` — barril muerto
│   └── utils/index.ts                # 1 línea: `export {}` — barril muerto
├── drizzle/                          # 9 .sql aditivos · 444 líneas · de 0000_baseline a 0006_delegado_claim
│   └── meta/                         # 6 snapshots + _journal.json de drizzle-kit
├── specs/                            # 18 specs `.spec.md` + README · 2 922 líneas de markdown
│   ├── README.md                     # convenciones de frontmatter y de `targets`
│   └── features/<feature>/           # auth, curriculum, grades, schedule, advising, portal-sync, chatbot, chat, …
├── docs/                             # 14 .md · 4 010 líneas
│   ├── specs/api-contracts.md        # 600 · EL contrato REST. Ningún endpoint existe fuera de este archivo
│   ├── specs/feature-index.md        # 37 · estado por feature, requisitos R1..R23 y RNF6/RNF7
│   ├── specs/workflow.md             # 54 · el «Orden De Trabajo» de 9 pasos
│   ├── specs/spec-template.md        # 41 · plantilla obligatoria de spec, con la regla de los `[@test]`
│   ├── AUDITORIA_TECNICA.md          # la auditoría que originó los comentarios «sin catch de rescate»
│   ├── DATABASE.md                   # notas del modelo de datos
│   ├── backend/architecture.md       # descripción de las capas routes → controller → service → repository
│   ├── agent_session/                # 5 informes de endurecimiento de seguridad y diagnóstico
│   └── pruebas/                      # guion de exposición + 3 grafos .mmd de complejidad ciclomática
├── test/                             # 74 suites `*.test.ts` · 16 429 líneas · 24 carpetas `HU##_<autor>`
│   ├── env.setup.ts                  # precargado por bunfig.toml: secretos dummy para que env.ts no aborte
│   └── HU01_jeff/ … HU31_jeff/       # una carpeta por historia de usuario y autor responsable
├── scripts/                          # asesorias-extraer.py y diag_<código>.sql; `scripts/out/` está en .gitignore
├── .tessl/                           # tile vendored `tessl-labs/spec-driven-development` v2.0.1: 3 reglas + 4 skills
├── AGENTS.md                         # 76 · flujo obligatorio de 10 pasos, reglas de BD y de arquitectura
├── CLAUDE.md                         # 3 líneas, cuyo contenido útil es `@AGENTS.md`
├── KNOWLEDGE.md                      # 147 · glosario de dominio y las «Decisiones No Negociables»
├── MIGRATIONS.md                     # 99 · db:push prohibido, SQL aditivo numerado, una sola persona aplica
├── DEUDA_TECNICA.md                  # 175 · informe de 128 hallazgos de junio (crudo en `_debt_findings.json`)
├── CAMBIOS_SPRINT0.md                # 91 · bitácora del sprint 0
├── vercel.json                       # 7 · framework `hono`, `bun install`, `bun run build`, `regions: ["iad1"]`
├── drizzle.config.ts                 # 13 · lee src/db/schema/schema.ts y emite en drizzle/
├── bunfig.toml                       # 3 · `preload = ["./test/env.setup.ts"]`
├── tsconfig.json                     # 25 · incluye `src/**/*`; por eso node-server.ts se compila igual a dist/
├── package.json                      # 49 · 18 scripts, entre ellos los 6 `mut:<autor>`
├── tessl.json                        # 9 · declara el tile de Spec Driven Development en modo vendored
├── stryker.jeff.conf.json            # 6 configuraciones de mutación, una por autor del equipo;
├── stryker.sam.conf.json             #   cada una apunta solo a los archivos que ese autor cubre
├── stryker.mel.conf.json             #   con sus propias pruebas (ver Pruebas y calidad)
├── stryker.julio.conf.json
├── stryker.nehemias.conf.json
└── stryker.ronald.conf.json
```

### Los cuatro barriles muertos

> ⚠️ [`src/middleware/index.ts`](src/middleware/index.ts), [`src/services/index.ts`](src/services/index.ts),
> [`src/types/index.ts`](src/types/index.ts) y [`src/utils/index.ts`](src/utils/index.ts) contienen
> **exactamente una línea cada uno: `export {};`**. Son las carpetas que dejó la plantilla inicial y
> que nunca se llenaron, porque el código real acabó en otro sitio: los middlewares en
> `src/shared/middleware/`, los clientes de terceros como archivos sueltos dentro de `src/services/`
> (importados por ruta directa, nunca por el barril), y los tipos junto a cada módulo en su
> `<modulo>.types.ts`. **Ningún archivo de `src/` los importa.** Siguen ahí porque borrarlos toca
> `src/` fuera de los `targets` de cualquier spec vigente, y ese es justo el tipo de cambio que la
> decisión #4 no permite hacer de paso. Se declaran aquí en vez de disimularlos.

Ojo con dos nombres parecidos: `src/utils/index.ts` está muerto, pero
[`src/shared/utils/index.ts`](src/shared/utils/index.ts) **no** — tiene una línea real
(`toApiResponse`) y junto a él vive `nombre-persona.ts`, la regla única para partir nombres y
apellidos que reemplazó al helper `splitName` duplicado en dos archivos.

### Tamaño por carpeta

| Carpeta | Archivos | Líneas |
|:---|---:|---:|
| `src/modules/` | 137 | 12 207 |
| `src/db/` | 18 | 3 072 |
| `src/services/` | 4 | 799 |
| `src/shared/` | 12 | 442 |
| `src/config/` | 2 | 142 |
| `src/` (raíz: `server.ts` + `node-server.ts`) | 2 | 76 |
| `src/events/` | 6 | 54 |
| `src/middleware/` + `src/types/` + `src/utils/` | 3 | 3 |
| **Total `src/`** | **184** | **16 795** |

Y fuera de `src/`, lo que el repo también versiona:

| Carpeta | Archivos | Líneas |
|:---|---:|---:|
| `test/` | 74 suites `*.test.ts` + `env.setup.ts` | 14 473 |
| `docs/` | 14 `.md` | 4 010 |
| `specs/` | 18 `.spec.md` + README | 2 922 |
| `drizzle/` | 9 `.sql` | 444 |

Dos lecturas de esas tablas. La primera: **`src/modules/` es el 73 % del backend** y `portal-sync`
solo, con 2 388 líneas, pesa más que `auth` — importar un ciclo real desde HTML del portal cuesta más
código que autenticar. La segunda: **hay casi tanta prueba como código de producción** (14 473 contra
16 795 líneas), y eso no fue así siempre — en junio la auditoría contó cero pruebas en ambos repos.
El detalle de cómo se llegó hasta aquí está en [Pruebas y calidad](#-pruebas-y-calidad) y en
[Deuda técnica y límites conocidos](#-deuda-técnica-y-límites-conocidos).

---

## 🗄 El modelo de datos

**34 tablas y 11 enums** en un solo archivo: [`src/db/schema/schema.ts`](src/db/schema/schema.ts), 569 líneas. El motor
es PostgreSQL gestionado en **Neon**; la capa de acceso es **Drizzle ORM 0.45** sobre el cliente
`postgres-js` ([`src/db/index.ts`](src/db/index.ts)). El host de la instancia no aparece en este
README ni debe aparecer en el repo: viaja en `DATABASE_URL`. Ojo con la documentación interna: la
auditoría de `MIGRATIONS.md` está fechada en julio de 2026 y todavía describe la instancia anterior,
alojada en AWS RDS.

> ⚠️ **La regla dura: la base ya existía; el backend la modela, no la crea.**
> PostgreSQL es definitivo y la única fuente de verdad. `schema.ts` es un *reflejo* tipado del
> esquema real, no su origen. De ahí las tres prohibiciones que gobiernan este directorio
> (`AGENTS.md:28-34`, `KNOWLEDGE.md:133-140`): no se agregan columnas ni tablas sin spec aprobada
> **y** aprobación explícita de cambio de BD; no se escriben seeds ni inserts manuales para tapar
> un dato faltante — si falta, se reporta; y no se usan los JSON del frontend como datos del
> backend, que son descartables y no se migran.

Consecuencia directa de esa regla en el código: [`src/db/relations/index.ts`](src/db/relations/index.ts)
está **vacío a propósito** (`export {};`, con el motivo escrito en las líneas 1-2). No hay grafo de
relaciones declarado, así que la API relacional de Drizzle — `db.query.<tabla>.findMany({ with: … })` —
**no está disponible**. Todo acceso relacional se escribe como SQL parametrizado dentro de los
repositories. Es una decisión, no un bug, pero tiene un costo: el ER no se puede derivar
automáticamente del código.

### Lo que NO está aquí

`KNOWLEDGE.md:41-47` fija una lista negra explícita de tablas que **no pertenecen al esquema
definitivo**, y las cuatro siguen sin existir (verificado contra `schema.ts` y contra
[`drizzle/0000_baseline.sql`](drizzle/0000_baseline.sql)):

| Tabla prohibida | Por qué no existe |
|:---|:---|
| `study_plan` | El plan de estudios **es** `curriculum` + `curriculum_course`; una tabla paralela duplicaría el eje de la malla. |
| `attendance` | La asistencia se guarda agregada en `enrollment.attended_hours` / `absent_hours` / `total_hours`, no por sesión. |
| `class_session` | El horario vive en `schedule_session` (bloque recurrente por sección), no como instancias de clase. |
| `assessment_event` | La evaluación es del **sílabo** (`assessment`), fechada por `week_number` contra `academic_week`. |
| «cualquier tabla de admin o de login docente independiente» | Regla parcialmente **rota a propósito**: HU18 introdujo login docente, pero sin tabla nueva — reutiliza `teacher.user_id → app_user.id`. `KNOWLEDGE.md:52` lo reconoce. |

Y una ausencia que sorprende a quien busca el chat: **el chat en vivo por sección no está en
PostgreSQL**. Vive en Firebase Realtime Database; el backend solo firma tokens en `POST /chat/token`.
El módulo [`src/modules/chat/`](src/modules/chat/) existe, la tabla no. Las dos tablas `chatbot_*` que
sí están en el esquema son otra cosa: el asistente conversacional (HU28).

---

### Las 35 tablas

Convención de la columna de claves: `PK` = clave primaria; `UQ` = restricción única; `UQ‖` = índice
único **parcial**; `IDX` = índice no único; `CK` = CHECK. Las 31 `id` enteras son
`integer GENERATED BY DEFAULT AS IDENTITY`; las 2 del chatbot son `uuid DEFAULT gen_random_uuid()`;
las 2 restantes son tablas de PK compuesta, sin `id`.

> El desglose por grupo suma **35**: Identidad 4 · Estructura académica 4 · **Malla 5** · Progreso
> del alumno 2 · Ciclo y matrícula 6 · Horario 2 · Asesorías 2 · Evaluaciones y notas 5 ·
> Comunicación 2 · Chat y chatbot 2 · Seguridad 1. La 35.ª es `course_equivalence`, la más joven del
> esquema: la agrega [`drizzle/0008_course_equivalence.sql`](drizzle/0008_course_equivalence.sql),
> que no existía cuando se escribió el conteo de 34.

#### Identidad — 4 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `app_user` | Credenciales de **todos** los que inician sesión, alumnos y docentes en la misma tabla. No hay tabla de roles. Columnas: `code`, `full_name`, `institutional_email`, `password_hash`, `google_id`, `token_version`, `networking_opt_in`. | PK `id`. Sin FKs. UQ `code`, UQ `institutional_email`. `token_version` default `1` (invalida JWT al hacer logout); `networking_opt_in` default `false`. |
| `user_social_link` | Redes del carnet de networking. Una fila por plataforma; el carnet es la unión de las filas del usuario. | PK `id`. FK `user_id → app_user.id`. UQ `uq_user_social_link_platform(user_id, platform)` → máx. 6 filas (tantas como valores del enum). IDX `idx_user_social_link_user`. |
| `student` | Perfil académico del alumno: `career_id`, `curriculum_id`, `current_level`, `specialty_setup_completed`. | PK `id`. **Única FK real**: `user_id → app_user.id` (NOT NULL UNIQUE → 1:0..1 con la cuenta). UQ `uq_student_id_career`, `uq_student_id_curriculum`. CK `chk_student_current_level` (NULL o 1..10). IDX por `user_id` y `curriculum_id`. ⚠️ `career_id` y `curriculum_id` son `NOT NULL` **sin FK** (schema.ts:122-123). |
| `teacher` | Docentes. Dato mayormente **referencial** de secciones y asesorías. `user_id` opcional habilita el login docente de HU18. | PK `id`. FK `user_id → app_user.id` **nullable + UNIQUE** → 0..1 cuentas por docente. UQ `teacher_code`, UQ `institutional_email`, UQ `user_id`. |

#### Estructura académica — 4 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `career` | Carreras: `code`, `name`, `faculty`. | PK `id`. Sin FKs. UQ `code`. |
| `curriculum` | Malla curricular. **Una por carrera, por diseño.** | PK `id`. FK `career_id → career.id`, con `career_id` **UNIQUE** → 1:0..1. UQ `uq_curriculum_id_career`. |
| `specialty` | Catálogo de especialidades por carrera. `is_active` default `true`. | PK `id`. FK `career_id → career.id`. UQ `uq_specialty_career_name(career_id, name)`. |
| `student_specialty` | Elección de especialidad del alumno: primaria o de interés. | **PK compuesta** `(student_id, specialty_id)`. FKs a `student` y `specialty`. UQ‖ `uq_student_specialty_active_primary(student_id) WHERE selection_type='primary' AND is_active`. IDX `idx_student_specialty_student`. |

#### Malla — 5 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `course` | Catálogo global de cursos, independiente de cualquier malla: `code`, `name`, `default_credit`, `origin_faculty`. | PK `id`. Sin FKs. UQ `code`. CK `default_credit > 0`. |
| `curriculum_course` | Curso **posicionado en la malla**: `cycle`, `display_order`, `credit`, `category`. Es el eje real del dominio; prerrequisitos, progreso, simulación y especialidades apuntan aquí, no a `course`. | PK `id`. FKs a `curriculum` y `course`. UQ `uq_curriculum_course(curriculum_id, course_id)`, UQ `uq_curriculum_course_id_curriculum`. CK sobre `cycle`, `display_order` y `credit`, todos `> 0`. IDX `idx_curriculum_course_curriculum`. |
| `curriculum_course_specialty` | Qué cursos de la malla pertenecen a qué especialidad. | **PK compuesta** `(curriculum_course_id, specialty_id)`. FKs a `curriculum_course` y `specialty`. Sin índices adicionales. |
| `course_prerequisite` | Prerrequisitos en dos formas mutuamente excluyentes: por curso, o por ciclo completo aprobado. | PK `id`. FKs a `curriculum`, a `curriculum_course` (el que **exige**) y a `curriculum_course` otra vez (el **exigido**, nullable). 2 UQ‖ + 3 CK — ver [invariantes](#restricciones-e-invariantes-que-no-se-ven-en-el-diagrama). |
| `course_equivalence` | Puente entre el **código viejo** que publica el récord del portal y el curso de la malla vigente. Sin ella `portal-sync` omite los cursos de mallas anteriores. `source` guarda de qué documento oficial salió la equivalencia: mirando la fila no hay otra forma de distinguir una tabla oficial de una completada a ojo. | PK `id`. FK `curriculum_id → curriculum.id`. UQ `uq_course_equivalence(curriculum_id, legacy_code)` → un código viejo apunta a un solo curso por malla. **FK compuesta** `(curriculum_course_id, curriculum_id) → curriculum_course(id, curriculum_id)`, no una simple a `curriculum_course.id`: hace imposible que una equivalencia de una malla apunte a un curso de otra. Se apoya en `uq_curriculum_course_id_curriculum`, que ya existía sin ninguna FK que lo usara. |

#### Progreso del alumno — 2 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `student_course_progress` | Avance **REAL** de malla. `status ∈ {in_progress, approved, failed, withdrawn}`. Aquí y solo aquí vive «aprobó». | PK `id`. FKs a `student`, `curriculum`, `curriculum_course`. UQ `uq_student_course_progress(student_id, curriculum_course_id)` → ≤ 1 fila por curso de malla. IDX por alumno y por curso de malla. |
| `student_curriculum_simulation` | Simulación «¿y si…?» de la malla (HU19). Capa **visual**: nunca toca datos reales. `status ∈ {planned, simulated_completed, simulated_available}`. | PK `id`. FKs idénticas a la anterior. UQ `uq_student_curriculum_simulation(student_id, curriculum_course_id)`. IDX `idx_student_curriculum_simulation_student`. |

#### Ciclo y matrícula — 6 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `academic_period` | Ciclos académicos: `code`, `start_date`, `end_date`, `is_active`. | PK `id`. Sin FKs. UQ `code`. CK `start_date < end_date`. **UQ‖ `uq_academic_period_single_active(is_active) WHERE is_active` → un solo período activo en toda la BD.** |
| `course_offering` | Curso ofertado en un período. El sílabo y las asesorías cuelgan de aquí, **no** de la sección. | PK `id`. FKs a `academic_period` y `course`. UQ `uq_course_offering(academic_period_id, course_id)`. CK `total_hours >= 0`. IDX `idx_course_offering_period`. |
| `section` | Sección de un offering. `teacher_id` es el titular, `jp_id` el jefe de práctica; el rol se deriva de **la columna**, no de la persona. | PK `id`. FKs a `course_offering` y **dos veces** a `teacher` (`teacher_id` NOT NULL, `jp_id` nullable). UQ `uq_section_offering_code`, UQ `uq_section_id_offering`. CK `chk_section_jp_not_teacher`. UQ‖ `uq_section_jp(jp_id) WHERE jp_id IS NOT NULL`. IDX `idx_section_course_offering`. |
| `enrollment` | Matrícula alumno × sección. **Ancla de todo lo «por alumno en un curso»**: notas, representación, asistencia. `final_grade` es la nota oficial del récord traída por portal-sync. | PK `id`. FKs a `student` y `section`. UQ `uq_enrollment_student_section`, UQ `uq_enrollment_id_section`. 5 CK: tres horas `>= 0`, `attended + absent <= total`, y `final_grade` NULL o 0..20. IDX `idx_enrollment_student`. |
| `section_representative` | Delegado / subdelegado **con permisos**. Cuelga de `enrollment`, no del alumno: el cargo muere con la matrícula. | PK `id`. FKs a `section` y `enrollment`. UQ **plano** sobre `enrollment_id`. UQ‖ `uq_active_section_representative_position(section_id, position) WHERE is_active` → un delegado y un subdelegado activos por sección; los históricos inactivos coexisten. |
| `section_representative_claim` | Lo que el **portal miUlima** afirma sobre quién representa una sección, antes de que esa persona exista como usuario. **No otorga permisos.** | PK `id`. FK `section_id → section.id`, y ninguna más — a propósito. UQ `uq_section_representative_claim_position(section_id, position)` → máx. 2 filas por sección. |

Las cuatro decisiones de diseño de `section_representative_claim` están escritas en el propio
esquema (schema.ts:353-388) y verificadas en el código que la consume:

1. **No lleva FK al alumno** porque el delegado casi nunca tiene cuenta, y fabricársela inventaría
   correo institucional, contraseña y carrera, y lo metería en networking, chat y en el contexto que
   el chatbot envía a Cohere.
2. **No guarda quién lo reportó**: evitaría dejar escrito «A delató a B».
3. **No tiene columna de período**: el aislamiento por ciclo sale gratis por
   `section → course_offering → academic_period`.
4. `student_code` replica el tipo y el dominio de `app_user.code` porque `student` **no tiene columna
   de código** y el empate de la promoción se hace contra `app_user`. Los largos 30/150 están
   duplicados como constantes en [`src/modules/portal-sync/parsers/delegado.ts`](src/modules/portal-sync/parsers/delegado.ts):22-23,
   con el motivo explícito: un `22001` dentro de la transacción de importación haría rollback de
   notas, horario y matrícula.

#### Horario — 2 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `academic_week` | Semanas del período. Es lo que le da fecha real a la «semana N» de una evaluación. | PK `id`. FK `academic_period_id → academic_period.id`. UQ `uq_academic_week_period_number`. CK `week_number > 0` y `start_date <= end_date`. |
| `schedule_session` | Bloques de clase por sección: `day_of_week`, `start_time`, `end_time`, `classroom`, `color_hex`. | PK `id`. FK `section_id → section.id`. UQ `uq_schedule_session(section_id, day_of_week, start_time)`. CK día 1..7 y `start_time < end_time`. IDX `idx_schedule_session_section`. |

#### Asesorías — 2 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `course_advising_session` | Asesorías recurrentes y extras. Cuelga de `course_offering`; `section_id` es **opcional** (una asesoría puede ser del curso entero). `modality ∈ {classroom, virtual, hybrid}`, `kind ∈ {recurring, extra}`. | PK `id`. FKs a `course_offering` (NOT NULL), `section` (nullable) y `teacher`. **3 UQ‖** — una por combinación curso / sección / extra. 4 CK: día 1..7, `start < end`, toda `extra` con `session_date`, `capacity` NULL o `> 0`. IDX `idx_course_advising_session_course_offering`. |
| `advising_rsvp` | El «asistiré» del alumno a una asesoría (HU17/HU18). | PK `id`. FKs a `course_advising_session` y `student`. UQ `uq_advising_rsvp(advising_session_id, student_id)`. IDX `idx_advising_rsvp_session`. |

> ⚠️ **No existe constraint que impida superar `capacity`.** `capacity` solo tiene un CHECK de
> positividad; el conteo de RSVPs contra el cupo tendría que hacerse en servicio, y hoy no se hace.

#### Evaluaciones y notas — 5 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `syllabus` | Sílabo del offering. El PDF vive en Google Drive; aquí solo el `drive_file_id` y su URL. | PK `id`. FK `course_offering_id → course_offering.id`. UQ `drive_file_id`, UQ `uq_syllabus_course_offering` → **1:0..1 con el offering**. |
| `assessment_type` | Catálogo de tipos de evaluación: `name`, `abbreviation`, `description`. | PK `id`. Sin FKs. UQ `name`. |
| `assessment` | Evaluación **del sílabo**, no de la sección: `code`, `name`, `week_number`, `weight`. | PK `id`. FKs a `syllabus` y `assessment_type`. UQ `uq_assessment_syllabus_code(syllabus_id, code)`. CK `week_number > 0` y `0 < weight <= 100`. IDX `idx_assessment_syllabus`. |
| `student_score` | Una nota por (matrícula, evaluación). La escribe el profesor titular vía el módulo `official-grades`; la lee el motor de alertas. `value` es **NULLABLE**. | PK `id`. FKs a `enrollment` y `assessment`. UQ `uq_student_score(enrollment_id, assessment_id)`. CK `value IS NULL OR value BETWEEN 0 AND 20`. IDX `idx_student_score_enrollment`. |
| `simulated_grades` | Notas que el **propio alumno** teclea en la calculadora (HU06). Persistidas en BD para que sigan al alumno entre dispositivos; antes vivían en `SharedPreferences`. `value` es **NOT NULL**. | PK `id`. FKs a `enrollment` y `assessment`. UQ `uq_simulated_grade(enrollment_id, assessment_id)`. CK `value BETWEEN 0 AND 20`. IDX `idx_simulated_grade_enrollment`. |

La asimetría de nulidad entre `student_score.value` (nullable) y `simulated_grades.value` (not null)
es deliberada: la primera arrastra histórico de carga inicial en el que la nota podía no existir
todavía; la segunda solo existe si el alumno la escribió.

#### Comunicación — 2 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `announcement` | Anuncios publicados por un representante de sección. | PK `id`. FK `section_representative_id → section_representative.id`. **Ningún índice ni unique propio** — es la única tabla del esquema en esa situación, y la FK no está indexada. `published_at` es `timestamp` **sin zona horaria**. |
| `alert` | Alertas por alumno: `type ∈ {academic_risk, high_load}`, `title`, `message`, `is_read`. | PK `id`. FK `student_id → student.id`. IDX `idx_alert_student`. `created_at` es `timestamp` **sin zona horaria**. |

#### Chat y chatbot — 2 tablas

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `chatbot_session` | Conversación del chatbot de un alumno. `title` default `'Nueva conversacion'` (sin tilde, tal cual está en la BD). | PK **uuid** `gen_random_uuid()`. FK `student_id → student.id` **ON DELETE CASCADE**. IDX `idx_chatbot_session_student`. |
| `chatbot_message` | Mensaje de una conversación: `role varchar(10)`, `content text`. | PK **uuid**. FK `session_id → chatbot_session.id` **ON DELETE CASCADE**. IDX `idx_chatbot_message_session`. ⚠️ `role` no tiene CHECK ni enum: nada en la BD impide un valor arbitrario. |

El chat en vivo por sección **no tiene tabla**: Firebase Realtime Database.

#### Seguridad — 1 tabla

| Tabla | Propósito | Claves y relaciones |
|:---|:---|:---|
| `password_reset_token` | OTP de reseteo de contraseña. **El OTP nunca se guarda en claro**: `token_hash` es el SHA-256 en hexadecimal del código de 6 dígitos — de ahí el `varchar(64)`, que es exactamente la longitud de un SHA-256 hex. | PK `id`. FK `user_id → app_user.id`. IDX `idx_password_reset_token_user`. `attempts` default `0`; `expires_at`, `used_at` y `created_at` son `timestamptz`. |

---

### Los 11 enums

| Enum `pgEnum` | Valores, en orden | Dónde se usa |
|:---|:---|:---|
| `curriculum_simulation_status` | `planned`, `simulated_completed`, `simulated_available` | `student_curriculum_simulation.status` |
| `student_course_status` | `in_progress`, `approved`, `failed`, `withdrawn` | `student_course_progress.status` |
| `representative_position` | `delegate`, `subdelegate` | `section_representative.position`, `section_representative_claim.position` |
| `enrollment_status` | `active`, `withdrawn`, `completed` | `enrollment.status` — default `active` |
| `alert_type` | `academic_risk`, `high_load` | `alert.type` |
| `advising_modality` | `classroom`, `virtual`, `hybrid` | `course_advising_session.modality` — default `hybrid` |
| `advising_kind` | `recurring`, `extra` | `course_advising_session.kind` — default `recurring` |
| `course_category` | `general_studies`, `common`, `faculty`, `elective` | `curriculum_course.category` — default `faculty` |
| `prerequisite_type` | `course`, `completed_cycle` | `course_prerequisite.prerequisite_type` |
| `student_specialty_type` | `primary`, `interest` | `student_specialty.selection_type` — default `interest` |
| `social_platform` | `linkedin`, `instagram`, `github`, `x`, `website`, `other` | `user_social_link.platform` |

Dos apuntes que importan al aplicar migraciones:

- `simulated_available` **no está en el baseline**. `drizzle/0000_baseline.sql:5` crea el tipo solo con
  `('planned','simulated_completed')`; el tercer valor lo agrega
  [`drizzle/0002_slim_miracleman.sql`](drizzle/0002_slim_miracleman.sql) con un `ALTER TYPE … ADD VALUE`.
  Su semántica es simular «des-aprobar» un curso real, es decir devolverlo a disponible.
- `social_platform` es el único enum creado fuera del baseline
  ([`drizzle/0001_flowery_jack_flag.sql`](drizzle/0001_flowery_jack_flag.sql):1).
- Los valores `website` y `other` de `social_platform` son los que dan sentido a
  `user_social_link.label`, la etiqueta libre.

---

### Restricciones e invariantes que no se ven en el diagrama

El resumen numérico: **35 restricciones UNIQUE** (22 con nombre explícito a nivel de tabla + 13 de
columna con nombre autogenerado), **28 CHECK**, **9 índices únicos parciales**, **22 índices no
únicos** y **49 FKs**.

#### Los 9 índices únicos parciales

Son la herramienta que este esquema usa para expresar reglas de negocio en DDL. Cada uno es
`CREATE UNIQUE INDEX … WHERE <predicado>`, así que solo restringe a las filas que cumplen el
predicado y deja convivir el histórico.

| Índice | Tabla · columnas | `WHERE` | Regla que impone |
|:---|:---|:---|:---|
| `uq_student_specialty_active_primary` | `student_specialty (student_id)` | `selection_type='primary' AND is_active` | Como mucho **una** especialidad primaria activa por alumno |
| `uq_course_prerequisite_course` | `course_prerequisite (curriculum_course_id, prerequisite_curriculum_course_id)` | `prerequisite_curriculum_course_id IS NOT NULL` | No se repite el mismo prerrequisito-curso |
| `uq_course_prerequisite_completed_cycle` | `course_prerequisite (curriculum_course_id, prerequisite_type, required_cycle)` | `required_cycle IS NOT NULL` | No se repite la misma exigencia de ciclo |
| `uq_academic_period_single_active` | `academic_period (is_active)` | `is_active` | **Un solo período activo en toda la base** |
| `uq_section_jp` | `section (jp_id)` | `jp_id IS NOT NULL` | Un JP pertenece a **una sola** sección |
| `uq_active_section_representative_position` | `section_representative (section_id, position)` | `is_active` | Un delegado y un subdelegado activos por sección |
| `uq_course_advising_session_course` | `course_advising_session (course_offering_id, teacher_id, day_of_week, start_time)` | `section_id IS NULL AND kind='recurring'` | Unicidad de asesoría recurrente **de curso** |
| `uq_course_advising_session_section` | `course_advising_session (section_id, teacher_id, day_of_week, start_time)` | `section_id IS NOT NULL AND kind='recurring'` | Unicidad de asesoría recurrente **de sección** |
| `uq_course_advising_session_extra` | `course_advising_session (section_id, teacher_id, session_date, start_time)` | `kind='extra'` | Unicidad de asesoría **extra** por fecha concreta |

Los tres últimos nacieron juntos por un fallo concreto: dos asesorías extra en fechas distintas caen
el mismo día de la semana a la misma hora, así que los dos únicos originales tuvieron que
re-alcanzarse a `kind='recurring'` y crearse un tercero fechado.

El de representantes tiene un corolario operativo que ya rompió una importación:
`uq_active_section_representative_position` es un índice **parcial y no diferible**, así que
[`portal-sync.repository.ts`](src/modules/portal-sync/portal-sync.repository.ts):657-699 primero
**desactiva** al ocupante anterior y solo después hace el `insert … on conflict`, y ese `on conflict`
apunta a **`enrollment_id`** —que tiene UNIQUE plano— y no a `(section_id, position)`, porque una fila
desactivada sigue ocupando el valor. Con el target equivocado, la segunda importación del mismo
delegado lanza **23505**, y como toda la escritura vive en una sola transacción, hace rollback de
notas, horario y matrícula.

#### La regla del JP, en tres capas

Es el mejor ejemplo de cómo este esquema reparte una regla entre DDL y servicio. «Un JP pertenece a
una sola sección y no puede ser profesor de esa sección» se hace cumplir así:

| Capa | Mecanismo | Qué garantiza |
|:---|:---|:---|
| DDL · CHECK | `chk_section_jp_not_teacher`: `jp_id IS NULL OR jp_id <> teacher_id` (schema.ts:298) | El JP no es el titular **de su propia** sección |
| DDL · índice parcial | `uq_section_jp` sobre `(jp_id) WHERE jp_id IS NOT NULL` (schema.ts:300) | Un `teacher.id` aparece como `jp_id` en **a lo más una** sección. Ignora los NULL, así que las secciones sin JP no colisionan entre sí |
| Servicio / seed | `jpViolatesCycleRule(jpTeacherId, periodSectionTeacherIds)` en [`src/modules/advising/teacher/teacher.logic.ts`](src/modules/advising/teacher/teacher.logic.ts):48 | Regla **de ciclo**, cross-tabla: quien es `teacher_id` de alguna sección del período activo no puede ser `jp_id` en ese mismo período. No es expresable como CHECK porque cruza filas |

Corolario: **el rol no se guarda en ninguna parte.** Profesor vs. JP se deriva de qué columna de
`section` referencia al `teacher.id` — `case when sec.jp_id = :teacherId then 'JP' else 'Profesor' end` —,
alumno vs. docente se decide por cuál de las dos tablas enlaza el `app_user`, y delegado/subdelegado
sale de las filas activas de `section_representative`. No hay columna `role` en el esquema.

#### Los 28 CHECK

| CHECK | Tabla | Expresión |
|:---|:---|:---|
| `chk_student_current_level` | `student` | `current_level IS NULL OR current_level BETWEEN 1 AND 10` |
| `chk_course_default_credit` | `course` | `default_credit > 0` |
| `chk_curriculum_course_cycle` | `curriculum_course` | `cycle > 0` |
| `chk_curriculum_course_display_order` | `curriculum_course` | `display_order > 0` |
| `chk_curriculum_course_credit` | `curriculum_course` | `credit > 0` |
| `chk_course_prerequisite_kind` | `course_prerequisite` | `course` exige curso y prohíbe ciclo; `completed_cycle` exige ciclo y prohíbe curso. **Exclusión mutua total** |
| `chk_course_prerequisite_required_cycle` | `course_prerequisite` | `required_cycle IS NULL OR required_cycle > 0` |
| `chk_course_prerequisite_not_self` | `course_prerequisite` | `prereq IS NULL OR curriculum_course_id <> prereq` |
| `chk_academic_period_dates` | `academic_period` | `start_date < end_date` — **estricto** |
| `chk_academic_week_number` | `academic_week` | `week_number > 0` |
| `chk_academic_week_dates` | `academic_week` | `start_date <= end_date` — **no estricto**, a diferencia del período |
| `chk_course_offering_total_hours` | `course_offering` | `total_hours >= 0` |
| `chk_enrollment_attended_hours` | `enrollment` | `attended_hours >= 0` |
| `chk_enrollment_absent_hours` | `enrollment` | `absent_hours >= 0` |
| `chk_enrollment_total_hours` | `enrollment` | `total_hours >= 0` |
| `chk_enrollment_attendance_hours` | `enrollment` | `attended_hours + absent_hours <= total_hours` |
| `chk_enrollment_final_grade` | `enrollment` | `final_grade IS NULL OR final_grade BETWEEN 0 AND 20` |
| `chk_section_jp_not_teacher` | `section` | `jp_id IS NULL OR jp_id <> teacher_id` |
| `chk_schedule_session_day` | `schedule_session` | `day_of_week BETWEEN 1 AND 7` |
| `chk_schedule_session_time` | `schedule_session` | `start_time < end_time` |
| `chk_course_advising_day` | `course_advising_session` | `day_of_week BETWEEN 1 AND 7` |
| `chk_course_advising_time` | `course_advising_session` | `start_time < end_time` |
| `chk_course_advising_extra_date` | `course_advising_session` | `kind <> 'extra' OR session_date IS NOT NULL` |
| `chk_course_advising_capacity` | `course_advising_session` | `capacity IS NULL OR capacity > 0` |
| `chk_assessment_week_number` | `assessment` | `week_number > 0` |
| `chk_assessment_weight` | `assessment` | `weight > 0 AND weight <= 100` |
| `chk_student_score_value` | `student_score` | `value IS NULL OR value BETWEEN 0 AND 20` |
| `chk_simulated_grade_value` | `simulated_grades` | `value BETWEEN 0 AND 20` |

Cinco huecos que estos CHECK **no** cubren, y conviene tener presentes antes de confiar en la BD:

1. `chk_assessment_weight` acota cada peso a `(0, 100]`, pero **nada obliga a que la suma de pesos de
   un sílabo sea 100**.
2. `chk_course_prerequisite_not_self` prohíbe el auto-prerrequisito, pero **no detecta ciclos de
   longitud ≥ 2** (A exige B, B exige A).
3. `chk_course_advising_extra_date` obliga a que toda `extra` tenga fecha, pero **no prohíbe** que una
   `recurring` la tenga.
4. `schedule_session.color_hex varchar(20)` no valida formato de color.
5. `chatbot_message.role varchar(10)` no tiene CHECK ni enum.

#### `ON DELETE`, defaults y columnas generadas

- **`ON DELETE`**: 47 de las 49 FKs son `ON DELETE no action ON UPDATE no action`. Las **únicas dos
  con `CASCADE`** son las del chatbot: `chatbot_session.student_id` y `chatbot_message.session_id`.
  Consecuencia práctica: borrar un `student` con datos derivados **falla** por FK, y no hay borrado
  lógico uniforme — `is_active` existe solo en `specialty`, `student_specialty`, `academic_period`,
  `section_representative` y `announcement`.
- **Defaults que llevan semántica**: `app_user.token_version = 1` (base del versionado de tokens que
  invalida los JWT al hacer logout); `app_user.networking_opt_in = false` (el carnet es **opt-in
  explícito**); `student.specialty_setup_completed = false`, que distingue «todavía no configuró» de
  «configuró y eligió no seleccionar»; `enrollment.status = 'active'`;
  `curriculum_course.category = 'faculty'`; `student_specialty.selection_type = 'interest'`;
  `course_advising_session.modality = 'hybrid'` y `kind = 'recurring'`; `alert.is_read = false`;
  `password_reset_token.attempts = 0`; las cuatro columnas `numeric` de horas a `'0'`; y los cinco
  `is_active` a `true`.
- **Columnas generadas**: 30 `id` `integer GENERATED BY DEFAULT AS IDENTITY` y 2 `uuid` con
  `gen_random_uuid()`. **No existe ninguna columna `GENERATED ALWAYS AS`**: todo valor derivado —la
  nota final ponderada, el rol, la etiqueta Profesor/JP, el estado de riesgo— se calcula en lectura,
  nunca se materializa.
- **`timestamp` vs `timestamptz`, inconsistencia real**: llevan zona `advising_rsvp.created_at`,
  `simulated_grades.updated_at`, las tres de `password_reset_token` y
  `section_representative_claim.observed_at`. **No** la llevan `announcement.published_at`,
  `alert.created_at` y las cuatro del chatbot. En una app con horario de Lima, comparar unas contra
  otras produce desfases.

#### Integridad que el esquema declara pero no garantiza

> ⚠️ `student.career_id` y `student.curriculum_id` son `NOT NULL` **sin FK** (schema.ts:122-123;
> confirmado en `drizzle/0000_baseline.sql:350`, donde la única `ALTER TABLE "student" ADD CONSTRAINT`
> es la de `user_id`). Nada en la base impide un `career_id` que no existe.

Y hay un patrón a medio terminar: los seis UNIQUE compuestos del tipo `(id, otra_columna)` —
`uq_student_id_career`, `uq_student_id_curriculum`, `uq_curriculum_id_career`,
`uq_curriculum_course_id_curriculum`, `uq_section_id_offering`, `uq_enrollment_id_section` — existen
exactamente para habilitar **FKs compuestas** que garanticen coherencia entre ramas del grafo (por
ejemplo, que la `curriculum_course` de un progreso pertenezca a la malla del alumno). **Ninguna de
esas FKs compuestas está declarada.** Los índices están; la garantía no.

Tres caminos más que el esquema deja implícitos y hay que recorrer por join, porque no existe FK que
los materialice:

```text
section_representative_claim → section → course_offering → academic_period   # aislamiento por ciclo
student → enrollment → section → course_offering → syllabus → assessment ← student_score   # nota por curso
enrollment  ⟷  student_course_progress                                       # NO EXISTE: se une por course.code
```

Ese último merece énfasis: **no hay ningún camino en la base entre el curso del ciclo
(`enrollment`) y el curso de la malla (`curriculum_course`)**. La unión se hace comparando
`course.code`, en SQL, fuera de toda restricción de integridad.

---

### Cuatro distinciones que se malinterpretan siempre

> **1 · `enrollment.status = 'completed'` NO significa curso aprobado.** El enum de matrícula
> (`active`, `withdrawn`, `completed`) describe el estado de la **matrícula**: `completed` es «el
> ciclo terminó y la matrícula se cerró», y ahí caben tanto el aprobado como el desaprobado. La
> aprobación real vive en otra tabla y en otro enum: `student_course_progress.status = 'approved'`
> (`KNOWLEDGE.md:54-55`). Contar `completed` como avance de malla infla el porcentaje del alumno con
> los cursos que jaló. Y `enrollment.status = 'active'` es lo que alimenta cursos actuales, horario,
> calculadora, asesorías y alertas.

> **2 · `student_score` y `simulated_grades` no son la misma nota, y la documentación se contradice
> sobre cuál es cuál.** `KNOWLEDGE.md:56` dice que `student_score` son «notas personales no
> oficiales». `AGENTS.md:53`, [`docs/DATABASE.md`](docs/DATABASE.md):56 y la spec de `official-grades`
> dicen lo contrario: `student_score` guarda la nota **oficial** que carga el profesor titular por
> `PUT /official-grades/teacher/sections/:sectionId/scores`, y las notas personales del alumno viven
> en `simulated_grades`. **El código le da la razón a `AGENTS.md`**:
> [`src/modules/grades/grades.repository.ts`](src/modules/grades/grades.repository.ts):64,73,85 escribe
> y lee `simulated_grades`, nunca `student_score`; y
> [`src/modules/alerts/alerts.repository.ts`](src/modules/alerts/alerts.repository.ts):48 lee
> `student_score` para el riesgo académico. `KNOWLEDGE.md` quedó anterior a HU06 y HU29 y está
> obsoleto en este punto. La regla operativa vigente: **el alumno jamás escribe `student_score`; el
> docente jamás escribe `simulated_grades`.** Y ninguna de las dos es `enrollment.final_grade`, que es
> la nota del récord oficial traída por portal-sync y que, según su propio comentario
> (schema.ts:311-313), «no sustituye a `student_score` ni a `simulated_grades`».

> **3 · `student_curriculum_simulation` es capa visual y no toca nada real.** Tiene las mismas tres
> FKs que `student_course_progress` y se le parece tanto que invita al error. La diferencia es
> categórica: la simulación de malla **nunca** modifica matrícula, notas ni progreso real
> (`KNOWLEDGE.md:60`, `AGENTS.md:57`). `PUT /curriculum/me/simulation` escribe únicamente ahí, y
> `DELETE /curriculum/me/simulation/:curriculumCourseId` borra la fila y devuelve el curso a su estado
> **calculado** a partir del progreso real. La importación del portal tampoco la toca (RS-BE-4).

> **4 · `app_user` no es «la persona»; es «la cuenta que inicia sesión».** `app_user` solo representa
> credenciales. `student` es el perfil académico y tiene `user_id` NOT NULL UNIQUE: todo alumno tiene
> cuenta. `teacher`, en cambio, es **dato referencial** de secciones y asesorías, y su `user_id` es
> **nullable**: la mayoría de docentes existe en la base sin cuenta alguna, y solo desde HU18 puede
> vincularse una para login docente. Por eso una consulta que salga de `app_user` esperando encontrar
> a todos los docentes devuelve un subconjunto. Y por eso el delegado que reporta el portal se guarda
> como `section_representative_claim` con un `student_code` suelto: no hay cuenta que enlazar.

---

### Historial de migraciones

`drizzle/` tiene **12 archivos `.sql`** versionados (478 líneas) y **8 snapshots** en
`drizzle/meta/`, pero el journal (`drizzle/meta/_journal.json`) tiene **9 entradas**. Los tres
números difieren entre sí, y en la carpeta faltan los nombres `0005` y `0007` mientras que en el
journal falta el `idx` 7. Esa discordancia es la historia completa.

| Archivo | `idx` journal | Fecha (UTC) | Qué hace |
|:---|---:|:---|:---|
| [`0000_baseline.sql`](drizzle/0000_baseline.sql) | 0 | 2026-07-07 | Re-baseline TT04: 10 `CREATE TYPE`, **29 `CREATE TABLE`**, 43 FK, 9 índices únicos parciales, 18 índices btree. Es el esquema completo tal como existía ese día. |
| [`0001_flowery_jack_flag.sql`](drizzle/0001_flowery_jack_flag.sql) | 1 | 2026-07-11 | Networking: enum `social_platform`, tabla `user_social_link` con su unique, FK e índice, y `app_user.networking_opt_in`. |
| [`0001_course_offering_total_hours.sql`](drizzle/0001_course_offering_total_hours.sql) | **—** | 2026-07-11 | `course_offering.total_hours numeric(5,2)` + `chk_course_offering_total_hours`. **Huérfana: `db:migrate` nunca la ejecuta.** |
| [`0002_slim_miracleman.sql`](drizzle/0002_slim_miracleman.sql) | 2 | 2026-07-11 | Una línea: `ALTER TYPE curriculum_simulation_status ADD VALUE 'simulated_available'` (HU19). |
| [`0002_app_user_linkedin_link.sql`](drizzle/0002_app_user_linkedin_link.sql) | **—** | 2026-07-11 | `ALTER TABLE teacher ADD COLUMN IF NOT EXISTS linkedin_link varchar(500)`. **Huérfana y revertida**: la columna se dropeó el mismo día. |
| [`0003_spicy_ironclad.sql`](drizzle/0003_spicy_ironclad.sql) | 3 | 2026-07-12 | Chatbot (HU28): `chatbot_session` y `chatbot_message`, PK `uuid`, las dos únicas FKs `ON DELETE CASCADE` del esquema. |
| [`0003_groovy_kulan_gath.sql`](drizzle/0003_groovy_kulan_gath.sql) | 4 | 2026-07-12 | `simulated_grades` (HU06) con unique, CHECK, 2 FKs e índice. |
| [`0004_portal_sync_final_grade.sql`](drizzle/0004_portal_sync_final_grade.sql) | 5 | 2026-09-02 | `enrollment.final_grade numeric(4,2)` + `chk_enrollment_final_grade`. |
| [`0006_delegado_claim.sql`](drizzle/0006_delegado_claim.sql) | 6 | 2026-09-04 | `section_representative_claim` con su unique y FK a `section`. |
| [`0008_course_equivalence.sql`](drizzle/0008_course_equivalence.sql) | 8 | 2026-09-06 | Equivalencias de malla: tabla `course_equivalence` (PK `identity`, `curriculum_id`, `legacy_code varchar(30)`, `curriculum_course_id`, `source varchar(120)`), unique `uq_course_equivalence (curriculum_id, legacy_code)`, FK a `curriculum` y **la única FK compuesta del esquema**, `(curriculum_course_id, curriculum_id) → curriculum_course (id, curriculum_id)`, que impide apuntar a un curso de otra malla. |
| [`0009_avatar.sql`](drizzle/0009_avatar.sql) | 9 | 2026-09-07 | Tres columnas nulables en `app_user`: `avatar_public_id varchar(255)`, `avatar_version varchar(20)` y `avatar_updated_at timestamptz`. Se guarda el identificador de Cloudinary, no la URL. |
| [`0010_course_weekly_hours.sql`](drizzle/0010_course_weekly_hours.sql) | **—** | 2026-09-07 | RS-BE-9: `course.weekly_hours smallint` (`ADD COLUMN IF NOT EXISTS`) + `chk_course_weekly_hours` dentro de un `DO $$ … EXCEPTION WHEN duplicate_object`. **Huérfana a propósito**, no por accidente: se aplica con `db:apply`. |

#### Por qué hay dos `0001`, dos `0002` y dos `0003`

`drizzle-kit generate` numera a partir del **journal local** en el momento de generar, y le pega un
nombre-clave aleatorio (`flowery_jack_flag`, `slim_miracleman`, `spicy_ironclad`,
`groovy_kulan_gath`). Dos ramas que salen del **mismo estado del journal** producen inevitablemente
**el mismo ordinal**. Eso pasó tres veces en julio de 2026:

| Ordinal | Rama A — generada por drizzle-kit | Rama B |
|:---|:---|:---|
| `0001` | `0001_flowery_jack_flag` · networking | `0001_course_offering_total_hours` · SQL escrito a mano |
| `0002` | `0002_slim_miracleman` · enum HU19 | `0002_app_user_linkedin_link` · SQL escrito a mano |
| `0003` | `0003_spicy_ironclad` · chatbot | `0003_groovy_kulan_gath` · simulated_grades |

En los merges del 2026-07-12 el journal se reconcilió **a favor de las entradas de drizzle-kit** y se
eliminaron de él las dos escritas a mano — pero **los dos `.sql` huérfanos se quedaron en el árbol**.
Siguen ahí hoy. El par `0003` colisionó además en `meta/`: ambas ramas escribieron
`0003_snapshot.json`, y el archivo que hoy lleva ese nombre describe en realidad el estado
**posterior a `idx 4`** (33 tablas); el estado intermedio se perdió. `drizzle/meta/0004_snapshot.json`
**no existe y nunca existió**, aunque la cadena `prevId → id` de snapshots sigue intacta, así que
`db:generate` funciona.

#### Por qué faltan `0005` y `0007`, y por qué el journal salta del `idx` 6 al 8

Desde septiembre hay **dos numeraciones en paralelo** y conviene verlas separadas, porque el
migrador solo respeta una:

- Los **snapshots siguen el `idx` del journal**. Por eso `meta/0005_snapshot.json` acompaña al `idx`
  5, cuyo `.sql` se llama `0004_portal_sync_final_grade`, y por eso ese snapshot parece huérfano: no
  existe ningún `0005_*.sql` y nunca existió.
- El **nombre del `.sql` se pone a mano**. Desde la `0004` los tags dejaron de ser nombres-clave
  aleatorios y pasaron a describir el cambio (`portal_sync_final_grade`, `delegado_claim`,
  `course_equivalence`, `avatar`), y con el renombre se perdió la garantía de que el número del
  archivo coincida con su `idx`.

De ahí salen los dos huecos. El `idx` 7 **nunca existió en `main`**: el journal del padre de
`42f308d` termina en el 6 y ese mismo commit ya escribe la entrada como `idx` 8, y en toda la
historia de `main` no se agregó jamás un `0007_*.sql`. El hueco `0005` en nombres es el reverso: ese
ordinal se consumió en el snapshot y el `.sql` se bautizó `0004`.

Septiembre además estuvo a un commit de repetir la colisión de julio, esta vez con el `0009`. La
migración de horas semanales nació como `0009_course_weekly_hours.sql` en la rama de RS-BE-9
(`4941d46`) mientras `main` publicaba `0009_avatar.sql` por su lado (`941edda`, cuya descripción
todavía dice «Migración 0007» porque la rama se regeneró antes de aterrizar). Se resolvió **antes**
del merge: `b6218a8` renombró el archivo a `0010_course_weekly_hours.sql`, así que `main` nunca llegó
a tener dos `0009` en el mismo árbol. El renombre fue seguro precisamente porque esa migración no
pasa por el journal — es solo un nombre de archivo.

**Qué implica esto para quien aplique migraciones.** El migrador de `drizzle-orm` recorre el **array
`entries` del journal**, en ese orden, y salta las migraciones cuyo `when` sea menor o igual al máximo
`created_at` ya registrado. No mira el nombre del archivo. Por lo tanto:

1. **Nunca apliques `drizzle/*.sql` ordenando el directorio por nombre.** En ese orden correrías
   `0001_course_offering_total_hours` antes que `0001_flowery_jack_flag` y, peor, ejecutarías
   `0002_app_user_linkedin_link`, que reintroduce una columna que ya se eliminó.
2. **Los tres huérfanos jamás se ejecutan** por `db:migrate`. Dos de ellos importan: una base
   reconstruida desde cero solo con `db:migrate` quedaría **sin `course_offering.total_hours`** y
   **sin `course.weekly_hours`**, y sin sus dos CHECK, pese a que `schema.ts:331` y `schema.ts:204`
   las declaran y todos los snapshots ≥ 0001 traen la primera.
3. **Una migración nueva con un `when` anterior al máximo registrado se salta en silencio.** No hay
   error; simplemente no corre.
4. **La `0010` no dejó snapshot, y eso le deja trabajo sucio al próximo `db:generate`.**
   `meta/0009_snapshot.json` —el último— no conoce `course.weekly_hours` ni
   `chk_course_weekly_hours`, así que el próximo diff contra `schema.ts` va a emitir un `ADD COLUMN`
   de una columna que **ya está en la base**, y sin `IF NOT EXISTS`: drizzle-kit no lo pone (compárese
   `0009_avatar.sql`, generado, con la `0010`, escrita a mano). Ese SQL hay que leerlo y descartarlo,
   no aplicarlo a ciegas.
5. **El nombre que proponga ese `db:generate` va a chocar igual.** Los dos ordinales candidatos
   —`0009` y `0010`— ya están tomados como nombre de archivo. Hay que renombrar a mano, como en la
   `0008` y en la `0010`, y dejar el tag del journal y el archivo apuntando al mismo cambio.

> **`MIGRATIONS.md` se quedó en la `0008`.** Su §«Migraciones aplicadas / reconciliaciones» documenta
> la `0008_course_equivalence` (aplicada con `db:migrate` el 2026-09-06, con backup y verificación) y
> **no menciona ni la `0009_avatar` ni la `0010_course_weekly_hours`**: buscar `0009`, `0010`,
> `avatar` o `weekly_hours` en ese archivo no devuelve nada. La única constancia de que ambas ya están
> en la base es la descripción del commit `b6218a8`. Mientras eso no se escriba en el runbook, el
> registro oficial de qué corrió contra Neon está incompleto en dos migraciones.
>
> Ojo también con el conteo del ledger: `docs/DATABASE.md:199`,
> `specs/features/portal-sync/portal-sync.spec.md:339` y la cabecera de la propia `0010` repiten que
> `drizzle.__drizzle_migrations` tiene **10 filas contra 8 entradas de journal**. Ese cruce es del
> 2026-09-06 y ya envejeció: el journal tiene 9 entradas desde que entró la `0009_avatar`. Y los dos
> documentos ni siquiera coinciden en qué son las filas de más — `DATABASE.md` las atribuye a
> «migraciones del fork de Ronald» y la spec de portal-sync a los dos huérfanos de julio.

#### Baseline y stamp: por qué el 0000 no se ejecuta

`0000_baseline.sql` describe una base que **ya existía**. Ejecutarlo contra producción sería absurdo
y destructivo. Lo que se hace es **sellarlo**: registrar que ya está aplicado sin correrlo.

[`src/db/stamp-baseline.ts`](src/db/stamp-baseline.ts) crea el `schema drizzle` y la tabla
`drizzle.__drizzle_migrations`, y para cada entrada del journal inserta el `sha256` del contenido del
`.sql` junto con el `created_at = journal.when` — exactamente lo que el migrador de Drizzle espera
encontrar. Es **dry-run por defecto**; escribe solo con `-- --apply`, y es idempotente porque
comprueba `where created_at = <when>` antes de insertar.

El resto del utillaje de datos:

```text
src/db/
├── schema/schema.ts          # 34 pgTable + 11 pgEnum · fuente de verdad del modelo
├── schema/index.ts           # una línea: export * from "./schema.js"
├── relations/index.ts        # VACÍO a propósito (export {}) · sin API db.query...with
├── index.ts                  # postgres(config.db.url) + drizzle(client, { schema })
├── migrate.ts                # runner propio: migrate(db, { migrationsFolder: "./drizzle" })
├── apply-migration.ts        # aplica UN .sql dentro de sql.begin + tx.unsafe · atómico
└── stamp-baseline.ts         # sella el journal en drizzle.__drizzle_migrations sin ejecutarlo
```

`db:migrate` usa el runner propio de [`src/db/migrate.ts`](src/db/migrate.ts) y **no** el CLI
`drizzle-kit migrate`, por una razón escrita en el comentario de las líneas 3-5: el CLI trata el
NOTICE `relation __drizzle_migrations already exists, skipping` como si fuera un error y aborta.
`db:apply` ([`src/db/apply-migration.ts`](src/db/apply-migration.ts)) aplica un solo `.sql` dentro de
`sql.begin(...)` con `tx.unsafe`, lo que admite varios statements y bloques `DO $$` y garantiza
ROLLBACK si uno falla.

> **Trampa documentada de `ALTER TYPE … ADD VALUE`.** No corre dentro de una transacción, así que
> tanto `db:migrate` como `db:apply` —que envuelven en `sql.begin`— **fallan**… pero el valor **igual
> queda agregado**, porque la sentencia no es transaccional y no se revierte. Fue exactamente lo que
> pasó con la 0002 el 2026-07-11: se verificó el enum y se selló la migración a mano en
> `drizzle.__drizzle_migrations`. Receta para el próximo `ADD VALUE`: correrlo en autocommit, fuera de
> `sql.begin`, y después sellarlo.

#### Por qué `db:*` son comandos restringidos

`package.json` expone ocho scripts de base: `db:generate`, `db:migrate`, `db:push`, `db:studio`,
`db:seed`, `db:seed:docentes`, `db:apply`, `db:stamp-baseline`. **Ninguno se ejecuta sin aprobación
explícita** (`AGENTS.md:30`; «Decisiones No Negociables» 2, 3 y 6 de `KNOWLEDGE.md:133-140`). El
protocolo, que existe porque el esquema es compartido y productivo:

| Regla | Motivo |
|:---|:---|
| **`db:push` está prohibido siempre** | Sincroniza `schema.ts` contra la base **sin migración**, y puede generar `DROP` sobre datos reales. |
| SQL solo aditivo | `CREATE TABLE`, `ADD COLUMN` (nullable o con default) y `CREATE INDEX`, con `IF NOT EXISTS`. Nada de `DROP` ni de cambios de tipo. |
| El SQL entra al PR y se revisa ahí | El diff de la migración se lee antes de tocar la base, no después. |
| Se aplica **antes** del merge del código que lo usa | Si el deploy llega primero, el endpoint nuevo consulta una columna que no existe. |
| **Una sola persona aplica**, con backup previo y en transacción | Y avisa con evidencia: `to_regclass`, columnas y un smoke test. |
| Freeze de DDL 48 h antes de una exposición | Regla nacida de una demo. |
| `db:seed` / `db:seed:docentes` cuentan como cambio de datos | El aprovisionamiento de docentes y JP es administrativo por seed aprobado; **no hay endpoints de alta**. |

Y una verificación de despliegue que vale la pena copiar: `GET /version` devuelve el SHA del commit
desplegado. Si no coincide con `main`, el deploy está desactualizado — pasó de verdad el 2026-07-05,
con producción sirviendo código de junio.

---

### Diagramas

#### Núcleo de malla

```mermaid
erDiagram
    career ||--o| curriculum : "career_id UNIQUE, una malla por carrera"
    career ||..o{ student : "career_id NOT NULL SIN FK"
    curriculum ||..o{ student : "curriculum_id NOT NULL SIN FK"
    curriculum ||--o{ curriculum_course : "contiene"
    course ||--o{ curriculum_course : "se posiciona como"
    curriculum ||--o{ course_prerequisite : "ambito de la regla"
    curriculum_course ||--o{ course_prerequisite : "curso que exige"
    curriculum_course |o--o{ course_prerequisite : "curso exigido, nullable"
    curriculum_course ||--o{ curriculum_course_specialty : "pertenece a"
    specialty ||--o{ curriculum_course_specialty : "agrupa"
    student ||--o{ student_specialty : "elige primary o interest"
    specialty ||--o{ student_specialty : "elegida por"
    student ||--o{ student_course_progress : "avance REAL"
    curriculum_course ||--o{ student_course_progress : "curso de la malla"
    student ||--o{ student_curriculum_simulation : "capa visual, no toca lo real"
    curriculum_course ||--o{ student_curriculum_simulation : "curso simulado"

    career {
        int id PK
        varchar code UK "len 30"
        varchar name "len 120"
        varchar faculty "len 120"
    }
    curriculum {
        int id PK
        int career_id FK "UNIQUE y UNIQUE con id"
        varchar name "len 120"
    }
    course {
        int id PK
        varchar code UK "len 30"
        varchar name "len 150"
        int default_credit "CHECK gt 0"
        varchar origin_faculty "nullable"
    }
    curriculum_course {
        int id PK
        int curriculum_id FK "UNIQUE con course_id"
        int course_id FK ""
        int cycle "CHECK gt 0"
        int display_order "CHECK gt 0"
        int credit "CHECK gt 0"
        enum category "general_studies common faculty elective"
    }
    course_prerequisite {
        int id PK
        int curriculum_id FK ""
        int curriculum_course_id FK "curso que exige"
        enum prerequisite_type "course o completed_cycle"
        int prerequisite_curriculum_course_id FK "nullable, autoref"
        int required_cycle "nullable, CHECK gt 0"
    }
    curriculum_course_specialty {
        int curriculum_course_id PK "PK compuesta"
        int specialty_id PK "PK compuesta"
    }
    specialty {
        int id PK
        int career_id FK "UNIQUE con name"
        varchar name "len 120"
        bool is_active "default true"
    }
    student_specialty {
        int student_id PK "PK compuesta, FK a student"
        int specialty_id PK "PK compuesta, FK a specialty"
        enum selection_type "primary o interest, default interest"
        bool is_active "default true"
    }
    student {
        int id PK
        int user_id FK "UNIQUE, unica FK real"
        int career_id "NOT NULL SIN FK"
        int curriculum_id "NOT NULL SIN FK"
        int current_level "nullable, CHECK 1 a 10"
        bool specialty_setup_completed "default false"
    }
    student_course_progress {
        int id PK
        int student_id FK "UNIQUE con curriculum_course_id"
        int curriculum_id FK ""
        int curriculum_course_id FK ""
        enum status "in_progress approved failed withdrawn"
    }
    student_curriculum_simulation {
        int id PK
        int student_id FK "UNIQUE con curriculum_course_id"
        int curriculum_id FK ""
        int curriculum_course_id FK ""
        enum status "planned simulated_completed simulated_available"
    }
```

#### Ciclo vigente y evaluaciones

```mermaid
erDiagram
    academic_period ||--o{ course_offering : "oferta del ciclo"
    academic_period ||--o{ academic_week : "semanas 1 a N"
    course ||--o{ course_offering : "se oferta como"
    course_offering ||--o| syllabus : "uno a cero o uno"
    course_offering ||--o{ section : "secciones"
    course_offering ||--o{ course_advising_session : "asesoria de curso"
    section |o--o{ course_advising_session : "asesoria de seccion, nullable"
    course_advising_session ||--o{ advising_rsvp : "asistire"
    teacher ||--o{ section : "teacher_id titular"
    teacher |o--o| section : "jp_id, unico parcial"
    section ||--o{ schedule_session : "bloques de clase"
    section ||--o{ enrollment : "matriculas"
    student ||--o{ enrollment : "se matricula"
    student ||--o{ advising_rsvp : "confirma"
    syllabus ||--o{ assessment : "evaluaciones del silabo"
    assessment_type ||--o{ assessment : "tipifica"
    enrollment ||--o{ student_score : "nota que carga el docente"
    assessment ||--o{ student_score : "evaluada en"
    enrollment ||--o{ simulated_grades : "nota que teclea el alumno"
    assessment ||--o{ simulated_grades : "proyectada en"

    academic_period {
        int id PK
        varchar code UK "len 20"
        date start_date "CHECK start lt end"
        date end_date ""
        bool is_active "UNICO PARCIAL, un solo periodo activo"
    }
    academic_week {
        int id PK
        int academic_period_id FK "UNIQUE con week_number"
        int week_number "CHECK gt 0"
        date start_date "CHECK start lte end"
        date end_date ""
    }
    course_offering {
        int id PK
        int academic_period_id FK "UNIQUE con course_id"
        int course_id FK ""
        numeric total_hours "5-2 default 0, CHECK gte 0"
    }
    syllabus {
        int id PK
        int course_offering_id FK "UNIQUE, uno a uno"
        varchar title "nullable"
        varchar drive_file_id UK "len 120, PDF en Drive"
        varchar drive_file_url "len 255"
    }
    section {
        int id PK
        int course_offering_id FK "UNIQUE con code"
        int teacher_id FK "NOT NULL, titular"
        int jp_id FK "nullable, un JP por seccion"
        varchar code "len 30"
    }
    schedule_session {
        int id PK
        int section_id FK "UNIQUE con day y start_time"
        int day_of_week "CHECK 1 a 7"
        time start_time "CHECK start lt end"
        time end_time ""
        varchar classroom "nullable"
        varchar color_hex "nullable, sin CHECK de formato"
    }
    course_advising_session {
        int id PK
        int course_offering_id FK "NOT NULL"
        int section_id FK "nullable"
        int teacher_id FK ""
        enum kind "recurring o extra"
        enum modality "classroom virtual hybrid"
        int day_of_week "CHECK 1 a 7"
        date session_date "obligatoria si kind es extra"
        int capacity "nullable, sin tope aplicado"
    }
    advising_rsvp {
        int id PK
        int advising_session_id FK "UNIQUE con student_id"
        int student_id FK ""
        timestamptz created_at "default now"
    }
    enrollment {
        int id PK
        int student_id FK "UNIQUE con section_id"
        int section_id FK "UNIQUE con id"
        enum status "active withdrawn completed"
        numeric attended_hours "default 0"
        numeric absent_hours "default 0"
        numeric total_hours "CHECK attended mas absent lte total"
        numeric final_grade "nullable, nota del portal"
    }
    assessment_type {
        int id PK
        varchar name UK "len 120"
        varchar abbreviation "nullable"
    }
    assessment {
        int id PK
        int syllabus_id FK "UNIQUE con code"
        int assessment_type_id FK ""
        varchar code "len 30"
        int week_number "CHECK gt 0"
        numeric weight "CHECK gt 0 y lte 100, suma libre"
    }
    student_score {
        int id PK
        int enrollment_id FK "UNIQUE con assessment_id"
        int assessment_id FK ""
        numeric value "NULLABLE, CHECK 0 a 20"
    }
    simulated_grades {
        int id PK
        int enrollment_id FK "UNIQUE con assessment_id"
        int assessment_id FK ""
        numeric value "NOT NULL, CHECK 0 a 20"
        timestamptz updated_at "default now"
    }
```

#### Identidad y roles

```mermaid
erDiagram
    app_user ||--o| student : "user_id NOT NULL UNIQUE"
    app_user ||--o| teacher : "user_id nullable UNIQUE, login HU18"
    app_user ||--o{ user_social_link : "carnet de networking"
    app_user ||--o{ password_reset_token : "OTP hasheado SHA-256"
    student ||--o{ enrollment : "matricula"
    section ||--o{ enrollment : "agrupa"
    enrollment ||--o| section_representative : "enrollment_id UNIQUE plano"
    section ||--o{ section_representative : "uno activo por cargo"
    section ||--o{ section_representative_claim : "lo que dice el portal"
    section_representative ||--o{ announcement : "publica"
    teacher ||--o{ section : "teacher_id titular"
    teacher |o--o| section : "jp_id, unico parcial"
    student ||--o{ alert : "riesgo y alta carga"
    student ||--o{ chatbot_session : "ON DELETE CASCADE"
    chatbot_session ||--o{ chatbot_message : "ON DELETE CASCADE"

    app_user {
        int id PK
        varchar code UK "len 30, es el usuario de login"
        varchar full_name "len 150"
        varchar institutional_email UK "len 150"
        varchar password_hash "len 255, bcrypt"
        varchar google_id "nullable, sub de Google"
        int token_version "default 1, invalida los JWT"
        bool networking_opt_in "default false"
    }
    student {
        int id PK
        int user_id FK "UNIQUE, todo alumno tiene cuenta"
        int career_id "NOT NULL SIN FK"
        int curriculum_id "NOT NULL SIN FK"
        int current_level "nullable, CHECK 1 a 10"
    }
    teacher {
        int id PK
        varchar teacher_code UK "len 50, nullable"
        varchar full_name "len 150"
        varchar institutional_email UK "nullable"
        int user_id FK "UNIQUE y NULLABLE, casi siempre sin cuenta"
    }
    user_social_link {
        int id PK
        int user_id FK "UNIQUE con platform"
        enum platform "linkedin instagram github x website other"
        varchar url "len 255"
        varchar label "nullable, para website y other"
    }
    password_reset_token {
        int id PK
        int user_id FK ""
        varchar token_hash "len 64, SHA-256 hex del OTP"
        timestamptz expires_at ""
        timestamptz used_at "nullable"
        int attempts "default 0"
    }
    section {
        int id PK
        int course_offering_id FK ""
        int teacher_id FK "titular, etiqueta Profesor"
        int jp_id FK "nullable, etiqueta JP, CHECK distinto del titular"
        varchar code "len 30"
    }
    enrollment {
        int id PK
        int student_id FK ""
        int section_id FK ""
        enum status "active withdrawn completed"
    }
    section_representative {
        int id PK
        int section_id FK ""
        int enrollment_id FK "UNIQUE PLANO, el cargo cuelga de la matricula"
        enum position "delegate o subdelegate"
        bool is_active "UNICO PARCIAL con section y position"
    }
    section_representative_claim {
        int id PK
        int section_id FK "UNIQUE con position, sin FK al alumno"
        enum position "delegate o subdelegate"
        varchar student_code "len 30, empata contra app_user.code"
        varchar full_name "len 150"
        timestamptz observed_at "instante de la respuesta del portal"
    }
    announcement {
        int id PK
        int section_representative_id FK "sin indice"
        varchar title "len 150"
        text message ""
        timestamp published_at "SIN zona horaria"
        bool is_active "default true"
    }
    alert {
        int id PK
        int student_id FK ""
        enum type "academic_risk o high_load"
        bool is_read "default false"
        timestamp created_at "SIN zona horaria"
    }
    chatbot_session {
        uuid id PK "gen_random_uuid"
        int student_id FK "CASCADE"
        varchar title "default Nueva conversacion"
    }
    chatbot_message {
        uuid id PK "gen_random_uuid"
        uuid session_id FK "CASCADE"
        varchar role "len 10, SIN CHECK ni enum"
        text content ""
    }
```

Las reglas de negocio que se apoyan en este modelo —derivación de roles, umbrales de alerta,
autorización por pertenencia— están en [Las reglas del dominio](#-las-reglas-del-dominio); lo que
sigue roto o a medias, en [Deuda técnica y límites conocidos](#-deuda-técnica-y-límites-conocidos).

---

## 🔌 La API

Una sola app Hono, sin versionado de URL, sin `/api` de prefijo. **70 endpoints**: 3 en la
raíz y 67 repartidos en los 15 módulos que monta [`src/modules/index.ts`](src/modules/index.ts).
El catálogo de abajo se verificó ruta por ruta contra los **16 archivos `*.routes.ts`**
(`advising` tiene dos sub-routers), no contra el contrato escrito — y las diferencias entre
ambos están documentadas en [su propia tabla](#el-contrato-documentado-vs-el-código).

### Principios globales

| Parámetro | Valor |
|:---|:---|
| **Base URL de producción** | `https://u-lima-backend-is-2-one.vercel.app` |
| **Base URL local** | `http://localhost:3000` ([`src/node-server.ts`](src/node-server.ts), `PORT` o 3000) |
| **Framework** | Hono; una única app, `registerModules(app)` en [`src/server.ts`](src/server.ts)`:63` |
| **Versionado** | Ninguno. No hay `/v1`, no hay `Accept-Version` |
| **Formato** | JSON en petición y respuesta. `Content-Type: application/json` |
| **Autenticación** | `Authorization: Bearer <jwt>` en **todo** salvo los 7 públicos |
| **Algoritmo del JWT** | HS256, `JWT_SECRET`, expiración `JWT_EXPIRES_IN` — por defecto **86400 s** ([`src/config/env.ts`](src/config/env.ts)`:35-37`) |
| **CORS** | `allowMethods` GET/POST/PUT/DELETE/OPTIONS, `allowHeaders` `Content-Type` y `Authorization`; `origin` = `CORS_ORIGINS` o `*` si la variable falta ([`src/server.ts`](src/server.ts)`:16-23`) |
| **Región de despliegue** | `iad1` (`vercel.json`) |

> ⚠️ El dominio `…-tau.vercel.app` que aparece en documentación antigua está **muerto**. El
> despliegue vivo es `…-one.vercel.app`.

#### Los 7 endpoints públicos — la lista exacta

No hay más. Cualquier otra ruta sin `Authorization` responde **401 `MISSING_TOKEN`**.

| Endpoint | Por qué es público |
|:---|:---|
| `GET /` | Registrado en [`src/server.ts`](src/server.ts)`:28`, antes de `registerModules`, sin middleware |
| `GET /health` | Ídem, `:48` |
| `GET /version` | Ídem, `:54` |
| `POST /auth/login` | El router de `auth` **no** tiene `app.use("*", authMiddleware)`; esta ruta no lo declara ([`src/modules/auth/auth.routes.ts`](src/modules/auth/auth.routes.ts)`:16`) |
| `POST /auth/google` | Ídem, `:21` |
| `POST /auth/password-reset/request` | Ídem, `:26` |
| `POST /auth/password-reset/confirm` | Ídem, `:31` |

El módulo `auth` es el único que declara la autenticación **ruta por ruta** en vez de con un
`app.use` global. Es deliberado: cuatro de sus siete endpoints existen precisamente para
usuarios que todavía no tienen token.

#### El sobre de error

Un único punto serializa los errores: `app.onError(errorHandler)` en
[`src/server.ts`](src/server.ts)`:25`. La forma es siempre la misma
([`src/shared/middleware/error-handler.ts`](src/shared/middleware/error-handler.ts)`:4-28`):

```json
{
  "error": {
    "code": "SECTION_FORBIDDEN",
    "message": "No perteneces a esta sección.",
    "details": null
  }
}
```

`details` solo aparece cuando el `HttpError` lo lleva: los errores de validación de Zod lo
rellenan con `error.flatten()`, y `RATE_LIMITED` con `{ retryAfterMinutes }`. Cualquier
excepción que **no** sea `HttpError` se registra con `console.error("Unhandled error:", …)` y
sale como **500 `INTERNAL_SERVER_ERROR` / `"Unexpected server error"`**, sin `details`.

Hay **113 instancias de `new HttpError(...)`** en `src/`. La clase base `AppError`
([`src/shared/errors/app-error.ts`](src/shared/errors/app-error.ts)) nunca se instancia
directamente: no existe ni un `new AppError(...)` en todo el árbol.

> **1 · Dos rutas se saltan el `errorHandler`.** El rate limit
> ([`src/shared/middleware/rate-limit.ts`](src/shared/middleware/rate-limit.ts)`:34-41`, `:80-86`)
> y el controller del chatbot
> ([`src/modules/chatbot/chatbot.controller.ts`](src/modules/chatbot/chatbot.controller.ts))
> devuelven el JSON a mano con `c.json({error:{…}}, status)` en vez de lanzar. El sobre resultante
> es idéntico, así que el cliente no nota la diferencia — pero un `try/catch` alrededor de
> `errorHandler` no los vería.

> **2 · Los mensajes de validación están en inglés, los de dominio en español.**
> [`validate-dto.ts`](src/shared/middleware/validate-dto.ts) emite `"Invalid JSON body"`,
> `"Invalid request body"`, `"Invalid query params"` e `"Invalid route params"`; el resto del
> sistema responde `"No perteneces a esta sección."`, `"Contraseña incorrecta."`, etc. Nunca se
> unificó.

#### Roles y `requireRole`

Cuatro roles, declarados en
[`src/modules/auth/auth.types.ts`](src/modules/auth/auth.types.ts)`:1-5`:

```
AppRole = "student" | "delegate" | "subdelegate" | "teacher"
```

`STUDENT_ROLES = ["student","delegate","subdelegate"]`
([`src/shared/middleware/auth-middleware.ts`](src/shared/middleware/auth-middleware.ts)`:101`)
es la constante que usan 10 módulos. `requireRole(...roles)` (`:92-98`) corre **siempre después**
de `authMiddleware`, lee `c.get("role")` y responde **403 `FORBIDDEN`** —
`"No tiene permisos para acceder a este recurso."` — si no está en la lista.

En las tablas de abajo se usan estas abreviaturas:

| Abreviatura | Equivale a |
|:---|:---|
| **público** | Sin token |
| **cualquiera** | Cualquier rol autenticado; el router no llama a `requireRole` |
| **alumno** | `requireRole(...STUDENT_ROLES)` → `student` · `delegate` · `subdelegate` |
| **repr.** | `requireRole("delegate","subdelegate")` |
| **docente** | `requireRole("teacher")` |
| **alumno + docente** | `requireRole(...STUDENT_ROLES, "teacher")` — los 4 roles |

Reparto verificado: **16 endpoints solo docente** (official-grades 3, schedule 4, advising 5,
chat 1, attendance-risk 3) y **5 solo delegado/subdelegado** (section-management).

`authMiddleware` además exige coherencia entre el rol y los claims
(`auth-middleware.ts:49-58`, HU18): un token con `role === "teacher"` **debe** traer
`teacherId` entero; cualquier otro rol **debe** traer `studentId`. Si falta, es
**401 `INVALID_TOKEN`**, no 403. El contexto nunca tiene los dos a la vez.

#### Convención de IDs y de nombres

No hay una sola convención, y conviene saberlo antes de escribir un cliente.

| Módulo | IDs en la respuesta | Claves |
|:---|:---|:---|
| `curriculum`, `grades`, `schedule`, `course-detail`, `section-management`, `advising` (alumno) | **string** (`String(row.id)`) | español: `cursos`, `secciones`, `anuncios`, `asesorias`, `notas` |
| `official-grades`, `advising` (docente), `alerts`, `chatbot`, `networking`, `attendance-risk` | **number** | inglés: `courses`, `sections`, `assessments`, `alerts` |

El corte no es caprichoso: los módulos con ids-string y claves en español son los que nacieron
contra el prototipo Flutter y conservan su dialecto; los de ids-number llegaron después.
Cambiarlos rompería apps ya instaladas, así que se documentan en vez de arreglarse.

En la **entrada** sí hay regla: los parámetros de ruta numéricos se validan con
`z.coerce.number().int().positive()` y fallan con **400 `INVALID_ROUTE_PARAMS`**. Dos
excepciones: `PUT /alerts/me/:alertId/read` parsea con `parseInt` + `isNaN` y emite
**400 `INVALID_ALERT_ID`**, y `DELETE /curriculum/me/simulation/:curriculumCourseId` hace
`parseInt` crudo **sin schema** ([`curriculum.controller.ts`](src/modules/curriculum/curriculum.controller.ts)`:24-25`).

#### Límites de tasa

Solo dos endpoints los tienen, y ninguno es global.

| Ámbito | Cuota | Ventana | Archivo |
|:---|---:|:---|:---|
| `POST /chatbot/sessions/:id/ask` | **20** por alumno | 1 h | [`rate-limit.ts`](src/shared/middleware/rate-limit.ts)`:13-47`, env `CHATBOT_RATE_LIMIT` |
| `POST /portal-sync/import` | **5** por alumno | 1 h | [`rate-limit.ts`](src/shared/middleware/rate-limit.ts)`:70-103`, constante `PORTAL_MAX_PER_HOUR` |

El del chatbot emite `X-RateLimit-Remaining` y `X-RateLimit-Reset`. El de portal-sync
**devuelve el cupo** cuando la respuesta es 409 `PORTAL_LOGIN_REJECTED` (`refundPortalQuota`,
`:95-102`): el passcode SecurID de 6 dígitos caduca cada 30 segundos y equivocarse es lo
normal, así que castigar el intento fallido dejaría al alumno sin poder sincronizar. Un 502
del portal **no** devuelve cupo.

> ⚠️ Ambos usan un `Map` en memoria de proceso. En Vercel serverless cada instancia tiene el
> suyo, así que el límite efectivo es **por instancia**, no global por alumno. Está en la
> [deuda técnica](#-deuda-técnica-y-límites-conocidos).

---

### El catálogo: 74 endpoints

#### Raíz — 3 endpoints públicos

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/` | — | público | Metadata del backend y lista de módulos ([`src/server.ts`](src/server.ts)`:28-46`) |
| GET | `/health` | — | público | `{ status: "ok", timestamp }` — el health check que sondea Vercel |
| GET | `/version` | — | público | `{ commit, ref, deployment }` desde `VERCEL_GIT_COMMIT_SHA` / `_REF` / `VERCEL_DEPLOYMENT_ID`; `"local"`/`null` fuera de Vercel |

> **3 · La lista de `modules` de `GET /` está desactualizada.**
> [`src/server.ts`](src/server.ts)`:33-44` enumera 10 prefijos y **omite cinco módulos que sí
> están montados**: `/official-grades`, `/chat`, `/chatbot`, `/attendance-risk` y `/networking`.
> Es un array literal que nadie actualizó al añadirlos.

#### 1 · `/auth` — 7 endpoints

[`src/modules/auth/auth.routes.ts`](src/modules/auth/auth.routes.ts) · sin `app.use` global.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| POST | `/auth/login` | — | público | Login con `code` + `password`. Si el código no es de alumno, reintenta como docente (HU18). Exige matrícula activa al alumno, recalcula el cargo e incrementa `tokenVersion` |
| POST | `/auth/google` | — | público | Login con `idToken` de Google. `@aloe.ulima.edu.pe` → alumno, `@ulima.edu.pe` → docente. Vincula `google_id` de forma idempotente e incrementa `tokenVersion` |
| POST | `/auth/password-reset/request` | — | público | Pide OTP por código o correo institucional. Responde **siempre 200** con un mensaje genérico — anti-enumeración de cuentas |
| POST | `/auth/password-reset/confirm` | — | público | Canjea el OTP y cambia la contraseña. Reserva el intento de forma atómica antes de comparar e **invalida todas las sesiones** |
| POST | `/auth/password-reset/request-me` | Bearer | cualquiera | Pide OTP para el usuario del JWT; devuelve el correo enmascarado. Sin body |
| GET | `/auth/me` | Bearer | cualquiera | Usuario actual. Para alumno **recalcula** el cargo con `findActiveRepresentation` en vez de repetir el claim del token |
| POST | `/auth/logout` | Bearer | cualquiera | Incrementa `tokenVersion` y responde `{ message: "Session closed" }`. Se traga los errores de BD a propósito |

Rate limit del reset: `PASSWORD_RESET_MAX_PER_HOUR`, por defecto **3** por hora
([`auth.service.ts`](src/modules/auth/auth.service.ts)`:41-43`). Coste de bcrypt: **10**
(`auth.service.ts:39`).

> **4 · `/auth/me` no se fía del token.** Un delegado del ciclo pasado seguía viéndose delegado
> hasta que venciera el JWT — 24 horas. Ahora el endpoint vuelve a preguntar a
> `findActiveRepresentation`, que ya filtra por período activo, así que la pestaña de delegado
> aparece y desaparece sola. Los 11 renglones de comentario en
> [`auth.service.ts`](src/modules/auth/auth.service.ts)`:251-261` explican que esto **no**
> reemplaza al token: `requireRole` sigue leyendo el claim firmado. Corrige lo que la app
> *muestra*, no lo que la app *puede hacer*.

#### 2 · `/academic-profile` — 4 endpoints

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES)`
([`academic-profile.routes.ts`](src/modules/academic-profile/academic-profile.routes.ts)`:9-10`).
**Un token docente recibe 403 en todo el módulo.**

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/academic-profile/me` | Bearer | alumno | Perfil completo: carrera con facultad, currículo, nivel, `setupComplete` y especialidades elegidas |
| GET | `/academic-profile/careers` | Bearer | alumno | Catálogo de carreras (`is_active`, `display_order`) |
| GET | `/academic-profile/specialties` | Bearer | alumno | Especialidades; `?careerId` opcional — el controller trata `""` como ausente y cae a la carrera del alumno |
| PUT | `/academic-profile/me/specialties` | Bearer | alumno | Reemplaza especialidad principal + intereses y marca `specialty_setup_completed`. `409 DUPLICATE_PRIMARY` si la principal aparece también como interés |

`SpecialtyResponse` duplica el id de carrera en `careerId` **y** `carrera_id`: el Flutter viejo
lee la clave en español y el nuevo la inglesa.

#### 3 · `/curriculum` — 3 endpoints

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES)`.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/curriculum/me` | Bearer | alumno | Malla del alumno: cursos con `credits`, `level`, `row`, `category`, prerrequisitos, especialidades deduplicadas y la simulación guardada |
| PUT | `/curriculum/me/simulation` | Bearer | alumno | Upsert de un curso simulado: `planned` \| `simulated_completed` \| `simulated_available` (HU19). `404 COURSE_NOT_FOUND` si el curso no está en su currículo |
| DELETE | `/curriculum/me/simulation/:curriculumCourseId` | Bearer | alumno | Quita un curso de la simulación |

> **5 · Los prerrequisitos por ciclo viajan como centinelas.** Cuando el prerrequisito no es un
> curso sino haber aprobado un ciclo entero, la lista `prerequisites` recibe la cadena
> **`"_V_CICLO_"`** (`required_cycle === 5`) o **`"_VI_CICLO_"`** (`=== 6`) en lugar de un id
> ([`curriculum.service.ts`](src/modules/curriculum/curriculum.service.ts)`:22-25`). El cliente
> tiene que reconocerlas explícitamente; no hay campo aparte que las distinga de un id real.

`updateCourseProgressSchema` (estados `locked|available|enrolled|passed`) está definido en
[`curriculum.schemas.ts`](src/modules/curriculum/curriculum.schemas.ts)`:3-6` y **no lo usa
ninguna ruta**.

#### 4 · `/grades` — 5 endpoints (notas **personales**, no oficiales)

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES)`.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/grades/me/courses` | Bearer | alumno | Cursos del período activo con `silaboUrl` y las evaluaciones del sílabo con sus pesos. Acepta un `?code=` opcional |
| POST | `/grades/me/calculate` | Bearer | alumno | Promedio ponderado de `[{valor 0..20, peso 0..100}]`. Devuelve `{ promedio, sumaPesos }`. **No persiste nada** |
| GET | `/grades/me/notes` | Bearer | alumno | Notas personales guardadas, agrupadas por sección |
| POST | `/grades/me/notes` | Bearer | alumno | Upsert por lote. `valor` admite **`null`** — así el alumno borra una nota sin borrar la fila |
| DELETE | `/grades/me/notes/:sectionId/:assessmentId` | Bearer | alumno | Borra una nota personal concreta |

[`grades.controller.ts`](src/modules/grades/grades.controller.ts)`:6-11` documenta que **ningún
handler atrapa errores para devolver un fallback**: antes se respondía 200 con listas vacías
cuando la BD fallaba, y el alumno creía que no tenía notas.

> **6 · `syllabi[].cursoId` no es un id de curso.**
> [`grades.service.ts`](src/modules/grades/grades.service.ts)`:46-48` construye el mapa de
> sílabos indexado por sección y escribe `cursoId: sectionId`. La clave se llama «curso» y
> contiene la **sección**. El nombre quedó del prototipo; cambiarlo rompe el parser del Flutter
> publicado.

> ⚠️ **`GET /grades/me/courses` no está acotado al alumno del token.**
> [`grades.controller.ts`](src/modules/grades/grades.controller.ts)`:16` lee
> `c.req.query("code")` y lo pasa al repositorio, que consulta **todas** las `course_offering`
> del período activo filtrando opcionalmente por el currículo del alumno con ese código. El
> parámetro nunca se contrasta con el JWT. Expone catálogo de cursos, secciones y sílabos, no
> notas personales — pero el nombre `/me/` promete algo que el endpoint no cumple.

#### 5 · `/official-grades` — 4 endpoints

`authMiddleware` global; `requireRole` **por ruta**
([`official-grades.routes.ts`](src/modules/official-grades/official-grades.routes.ts)`:8-16`).

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/official-grades/me` | Bearer | alumno | Notas oficiales por sección en el período activo; `value` puede ser `null`. El cliente calcula la final por ponderación |
| GET | `/official-grades/teacher/sections` | Bearer | docente | Secciones del período activo que dicta, con `rol: "Profesor"` \| `"JP"` |
| GET | `/official-grades/teacher/sections/:sectionId/scores` | Bearer | docente | Grilla de calificación: roster × evaluaciones + notas ya puestas |
| PUT | `/official-grades/teacher/sections/:sectionId/scores` | Bearer | docente (**solo titular**) | Upsert por lote de 1 a 1000 notas `0..20`. Valida todo antes de escribir y devuelve la grilla actualizada |

> **7 · El jefe de práctica no califica.** `assertOwnership`
> ([`official-grades.service.ts`](src/modules/official-grades/official-grades.service.ts)`:32-37`)
> exige `teacherIsSectionProfesor`, es decir `section.teacher_id`. Un JP autenticado —
> `section.jp_id` — recibe **403 `NOT_SECTION_PROFESSOR`**: *«Solo el profesor titular puede
> calificar esta sección.»* El contrato escrito dice otra cosa; ver
> [las diferencias](#el-contrato-documentado-vs-el-código).

#### 6 · `/schedule` — 7 endpoints

`authMiddleware` global; `requireRole` por ruta.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/schedule/me/sessions` | Bearer | alumno | Horario semanal por bloques de las secciones con matrícula activa: `days[]` + `secciones[]` con `horarios[]`, aula, color y conteo de asistencia |
| GET | `/schedule/me/assessments` | Bearer | alumno | Evaluaciones del sílabo mapeadas a fecha, hora y aula reales de clase |
| GET | `/schedule/me/load` | Bearer | alumno | Carga por semana con `assessmentCount` e `isHighLoad` |
| GET | `/schedule/teacher/sessions` | Bearer | docente | Mismo shape `{days, secciones}`, para las secciones que dicta |
| GET | `/schedule/teacher/assessments` | Bearer | docente | Evaluaciones de sus secciones |
| GET | `/schedule/teacher/sections/:sectionId/assessments-status` | Bearer | docente (**+ dicta la sección**) | Estado de carga por evaluación: `loadedCount`/`totalCount`, `status`, `isNotified` |
| POST | `/schedule/teacher/sections/:sectionId/assessments/:assessmentId/notify-grades` | Bearer | docente (**+ dicta la sección**) | Crea una alerta `academic_risk` por alumno activo con título `"Notas disponibles: {code} - {courseName}"`; responde `{ ok: true, notifiedCount }` |

Los dos endpoints con `:sectionId` llaman a `checkSectionOwnership` → **403 `SECTION_FORBIDDEN`**
([`schedule.service.ts`](src/modules/schedule/schedule.service.ts)`:398-400`, `:423-426`).
`notify-grades` **no deduplica**: crear una alerta nueva en cada llamada es intencional, para
que el docente pueda reenviar el aviso (`schedule.service.ts:446`).

#### 7 · `/course-detail` — 6 endpoints

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES, "teacher")`
([`course-detail.routes.ts`](src/modules/course-detail/course-detail.routes.ts)`:43-44`) — es
decir, **todos los roles autenticados**.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/course-detail/sections` | Bearer | alumno + docente | Lista **todas** las secciones de la BD con docente, promedio y horas de asistencia. Sin guarda de pertenencia |
| GET | `/course-detail/teachers` | Bearer | alumno + docente | Nómina completa de docentes: `code`, `firstName`, `lastName`. Sin guarda de pertenencia |
| GET | `/course-detail/enrollments` | Bearer | alumno + docente | Todas las matrículas con **código de alumno**, curso y sección. Sin guarda de pertenencia |
| GET | `/course-detail/sections/:sectionId` | Bearer | alumno + docente | Una sección o `null`. Implementado como **sub-petición interna** a `/sections` reenviando el `Authorization` |
| GET | `/course-detail/sections/:sectionId/announcements` | Bearer | alumno + docente **+ pertenencia** | Anuncios activos de la sección con los datos del autor |
| GET | `/course-detail/sections/:sectionId/contacts` | Bearer | alumno + docente **+ pertenencia** | `docente`, `jefePractica`, `alumnos[]` con su carnet de networking y `representantesPendientes[]` |

`exigirPertenencia(c, sectionId)` (`:60-79`) acepta si `sec.teacher_id = teacherId`, o
`sec.jp_id = teacherId`, o existe `enrollment` del `studentId`; si no, **403
`SECTION_FORBIDDEN`** — *«No perteneces a esta sección.»*

`representantesPendientes[]` sale de `section_representative_claim` y solo se emite si **no**
hay un `section_representative` activo para ese cargo (`:264-275`, con 15 líneas de comentario
sobre el fallo de producción del 2026-09-04). Cada entrada lleva `contactable: false`.

> ⚠️ **La guarda de pertenencia cubre 2 de 6 rutas.** `/sections`, `/sections/:id`, `/teachers` y
> `/enrollments` no la aplican. El propio archivo advierte en `:53-56` que sin ella «cualquier
> usuario autenticado puede iterar `sectionId` y armarse el padrón de delegados de toda la
> universidad» — y en esas cuatro rutas la guarda nunca se puso.
> `GET /course-detail/enrollments` devuelve el código de cada alumno con su curso y sección a
> cualquier token válido. Ver [Seguridad](#-seguridad) y
> [Deuda técnica](#-deuda-técnica-y-límites-conocidos).

> **8 · `currentCycle` está clavado a `"2026-1"`.**
> [`course-detail.routes.ts`](src/modules/course-detail/course-detail.routes.ts)`:297` lo
> escribe como literal dentro de `alumnos[].user`, aunque el resto del sistema lo deriva del
> `academic_period` activo. En julio de 2026 mentirá.

Todo el módulo usa SQL crudo — **8 llamadas `db.execute`** — y no atrapa errores de BD. Es deuda
reconocida en un comentario del propio archivo (`:46-48`).

#### 8 · `/alerts` — 2 endpoints

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES)`.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/alerts/me` | Bearer | alumno | Buzón del alumno acotado al período activo. **Genera las alertas al leer**: riesgo crítico (precede al académico), riesgo académico y alta carga |
| PUT | `/alerts/me/:alertId/read` | Bearer | alumno | Marca una alerta propia como leída. `400 INVALID_ALERT_ID` si el param no es numérico, `404 ALERT_NOT_FOUND` si no actualizó nada |

`StoredAlert.type` solo admite `"academic_risk"` y `"high_load"`, pero `AlertType`
([`alerts.types.ts`](src/modules/alerts/alerts.types.ts)`:1-6`) declara **cinco**:
`academic_risk`, `high_load`, `grade_reminder`, `course_average`, `system`. Los tres últimos no
se emiten desde ninguna parte. `markAlertReadSchema` está definido y no se usa: el controller
parsea el param a mano.

#### 9 · `/section-management` — 6 endpoints

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES)`
([`section-management.routes.ts`](src/modules/section-management/section-management.routes.ts)`:13-14`);
además `requireRole("delegate","subdelegate")` **por ruta** en 5 de las 6.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/section-management/representatives` | Bearer | alumno | Secciones donde el alumno es delegado o subdelegado activo, con `alumnosMatriculados`. Todos los ids son strings |
| GET | `/section-management/sections/:sectionId/announcements` | Bearer | repr. | Anuncios activos publicados por ese representante, orden descendente |
| GET | `/section-management/sections/:sectionId/statistics` | Bearer | repr. | HU11: `promedioGeneral`, `porcentajeAprobados` y el histograma `rango0_10` / `rango11_13` / `rango14_16` / `rango17_20`. **No expone notas individuales** |
| POST | `/section-management/sections/:sectionId/announcements` | Bearer | repr. | Crea un anuncio (`title` 1..150, `message` 1..5000, ambos con `trim`). Responde **201** |
| PUT | `/section-management/announcements/:id` | Bearer | repr. | Edita título y mensaje de un anuncio propio |
| DELETE | `/section-management/announcements/:id` | Bearer | repr. | Soft delete: `is_active = false` |

`PASSING_GRADE = 10.5`
([`section-statistics.logic.ts`](src/modules/section-management/section-statistics.logic.ts)`:21`).

> **9 · El cliente nunca envía su `section_representative_id`.**
> `requireRepresentative(studentId, sectionId)` lo deriva del JWT más la sección de la URL. Si
> el id viajara en el body, un delegado podría publicar como otro. `wrap(e, where)`
> (`section-management.service.ts:218-222`) convierte cualquier error que no sea `HttpError` en
> **500 `INTERNAL_ERROR`** con el punto de fallo etiquetado.

#### 10 · `/advising` — 8 endpoints (5 docente + 3 alumno)

El único módulo compuesto: [`src/modules/advising/index.ts`](src/modules/advising/index.ts)`:6-7`
monta `teacherRoutes` en `/me` y `studentRoutes` en `/`.

**Docente (HU18)** — gate global `authMiddleware` + `requireRole("teacher")`:

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/advising/me/sections` | Bearer | docente | Secciones que dicta en el período activo, para poblar el formulario |
| GET | `/advising/me/sessions` | Bearer | docente | Sus asesorías `recurring` + `extra` con `asistentes` y `rol` |
| POST | `/advising/me/sessions` | Bearer | docente | Crea una asesoría **extra**. Valida rango horario, fecha no pasada, fecha dentro del período, ubicación según modalidad y solapamiento. Responde **201** |
| DELETE | `/advising/me/sessions/:id` | Bearer | docente | Borra una asesoría **extra propia**; una `recurring` da `409 ONLY_EXTRA_DELETABLE` |
| GET | `/advising/me/sessions/:id/attendees` | Bearer | docente | `{ total, asistentes: [{code, firstName, lastName}] }` |

`createAdvisingSchema` valida `sessionDate` con `^\d{4}-\d{2}-\d{2}$` y las horas con
`^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$`; `modality` ∈ `classroom` \| `virtual` \| `hybrid`.

**Alumno (HU17)** — sin `app.use`: `authMiddleware` + `requireRole("student","delegate","subdelegate")`
declarados ruta por ruta:

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/advising/section/:sectionId` | Bearer | alumno | Asesorías visibles de la sección, excluyendo las que ya pasaron; incluye `asistentes` y `myRsvp` |
| POST | `/advising/:sessionId/rsvp` | Bearer | alumno | Confirma asistencia. Idempotente. `{ id, asistentes, myRsvp: true }` |
| DELETE | `/advising/:sessionId/rsvp` | Bearer | alumno | Cancela asistencia. Idempotente, sin validación previa |

> **10 · El RSVP miente a propósito.** El orden de validación en
> [`student.service.ts`](src/modules/advising/student/student.service.ts)`:82-100` es: sesión
> inexistente → **404 `SESSION_NOT_FOUND`**; sesión ya pasada → **409 `SESSION_ALREADY_PAST`**;
> alumno que no participa en esa sección → **404 `SESSION_NOT_FOUND`** otra vez, con el mismo
> mensaje. Un 403 le confirmaría al alumno que la asesoría existe.

#### 11 · `/chat` — 2 endpoints (HU23)

`authMiddleware` global ([`chat.routes.ts`](src/modules/chat/chat.routes.ts)`:24`). **No hay
`requireRole` global.**

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| POST | `/chat/token` | Bearer | cualquiera (**+ pertenencia**) | Puente JWT → Firebase: escribe el espejo `/members/{sectionId}/{uid}` en RTDB y firma un custom token con `uid = String(app_user.id)`. Devuelve `role`, `roleLabel`, `isModerator`, `weight` |
| DELETE | `/chat/sections/:sectionId/messages/:messageId` | Bearer | docente (**+ titular**) | Borrado suave del mensaje en RTDB vía Admin SDK: marca `deleted`, `deletedBy`, `deletedByUid`, `deletedByRole`, `deletedAt` |

La escala de moderación
([`chat.logic.ts`](src/modules/chat/chat.logic.ts)`:9-48`):

| Participante | `roleLabel` | `weight` | `isModerator` |
|:---|:---|---:|:---|
| Profesor titular | Profesor | 100 | sí |
| Jefe de práctica | Jefe de Práctica | 90 | sí |
| Delegado | Delegado | 70 | sí |
| Subdelegado | Subdelegado | 60 | sí |
| Alumno | Alumno | 10 | no |

`canIssueToken` (`chat.logic.ts:79-83`) exige participante no nulo **y**
`participant.userId === requestUserId`: sin esa segunda condición, mandar un `sectionId` ajeno
firmaría un token para la sala de otro. El borrado va un paso más allá y exige
`participant.role === "teacher"` → **el JP puede moderar en la UI pero no borrar**
(403 `CHAT_DELETE_FORBIDDEN`).

> ⚠️ Sin las variables `FIREBASE_*`, ambos endpoints devuelven **500 `INTERNAL_SERVER_ERROR`**
> genérico: [`firebase.service.ts`](src/services/firebase.service.ts) lanza `new Error(...)`
> plano, no `HttpError`, así que cae al fallback del `errorHandler`.

#### 12 · `/chatbot` — 5 endpoints

Gate global: `authMiddleware` + `requireRole("student","delegate","subdelegate")` — literales,
no la constante `STUDENT_ROLES`.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| POST | `/chatbot/sessions` | Bearer | alumno | Crea una conversación vacía. Responde **201** |
| GET | `/chatbot/sessions` | Bearer | alumno | Sesiones del alumno por `updated_at` descendente |
| GET | `/chatbot/sessions/:id` | Bearer | alumno | Sesión con todos sus mensajes (`role: "user"` \| `"assistant"`) |
| DELETE | `/chatbot/sessions/:id` | Bearer | alumno | Elimina la sesión y sus mensajes en cascada |
| POST | `/chatbot/sessions/:id/ask` | Bearer | alumno | Pregunta de ≤500 caracteres con `localGrades?` opcional. Responde `{ answer, sessionId }`. **Rate limit 20/h** |

Intents soportados: `grades`, `schedule`, `curriculum`, `alerts`, `announcements`, `classmates`,
`chat`. La nota mínima aprobatoria del contexto es **10.5** y el `estado` de cada curso es
`aprobado` \| `en_curso` \| `imposible` \| `sin_notas`.

> **11 · Cinco expresiones regulares contra la inyección de prompts.**
> [`chatbot.controller.ts`](src/modules/chatbot/chatbot.controller.ts)`:5-11` rechaza con
> **400 `INVALID_QUESTION`** cualquier pregunta que contenga `<context>`, `[CONTEXTO]`,
> `[DATOS_`, o que empiece una línea con `system:` o `assistant:`. Son exactamente los
> delimitadores con los que el servicio arma el prompt: si el alumno los escribe, puede cerrar
> el bloque de contexto y hablarle al modelo como si fuera el sistema.

#### 13 · `/attendance-risk` — 3 endpoints (HU22 / HU30)

Gate global: `authMiddleware` + `requireRole("teacher")`.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/attendance-risk/sections/:sectionId/attendance-risk` | Bearer | docente | Alumnos de la sección con `absentHours`, `totalHours`, `absencePercentage`, `missingFaltas` y `status` (`impedido` \| `en_riesgo` \| `normal`), más `summary` |
| GET | `/attendance-risk/sections/:sectionId/attendance-risk/summary` | Bearer | docente | Solo `{ impedido, en_riesgo, normal, total }` |
| POST | `/attendance-risk/sections/:sectionId/attendance-risk/notify` | Bearer | docente | Crea alertas `academic_risk` a los alumnos en riesgo. Responde `{ notified, message }` |

Reglas verificadas en
[`attendance-risk.service.ts`](src/modules/attendance-risk/attendance-risk.service.ts)`:152-193`:
`sessionHours = 2`; el límite de inasistencia es **35 % si `cycle >= 6`, 25 % en otro caso**
(`:164`); se notifica a quien lo superó **o a quien está a exactamente 2 o 3 faltas** de
superarlo (`:179`). El mensaje final es `"Se ha/han notificado a N alumno(s)."` o
`"No hay alumnos que notificar."`.

> ⚠️ **El segmento `attendance-risk` aparece dos veces en la URL** — prefijo del módulo más
> segmento de la ruta. No es una errata de este README: es lo que responde el servidor.

> **La pertenencia se comprueba en un middleware de ruta, no en el service.**
> `attendance-risk.routes.ts:12-14` monta `assertOwnership` sobre `"/sections/:sectionId/*"`
> y no sobre `"*"`, porque en un middleware global el parámetro `:sectionId` todavía no
> está ligado. Un docente que pida el riesgo — o dispare el `notify` — de una sección que
> no dicta recibe `403 NOT_SECTION_TEACHER` antes de llegar al controller. Es un patrón
> distinto al de `schedule` y `official-grades`, que resuelven la pertenencia dentro del
> service; aquí se eligió el middleware para cubrir las tres rutas de una sola vez.

#### 14 · `/networking` — 3 endpoints (HU27)

Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES, "teacher")` — todos los roles.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/networking/me` | Bearer | alumno + docente | Carnet propio: `{ optIn, links[] }` |
| PUT | `/networking/me` | Bearer | alumno + docente | Actualiza el opt-in y **reemplaza** el enlace |
| GET | `/networking/users/:userId` | Bearer | alumno + docente | Carnet público de otro usuario, solo si tiene `optIn: true`; añade `owner{userId, fullName, primaryDetail, secondaryDetail, roleLabel}` |

Validación del enlace
([`networking.schemas.ts`](src/modules/networking/networking.schemas.ts)`:9-61`, ambos schemas
`.strict()`): `platform` ∈ `linkedin` \| `instagram` \| `github` \| `x` \| `website` \| `other`;
`url` con `trim`, 1..255, `.url()`, `isHttpUrl` (solo `http://` o `https://`) y
`urlBelongsToPlatform`; `label` de 1..80, **obligatoria** para `website` y `other`.

`links` es `array(...).max(1)`: **un solo enlace en total**, no uno por plataforma. Si la BD
llega a tener más de uno, el service responde **500 `NETWORKING_DATA_INTEGRITY`** en lugar de
devolver un carnet a medias.

#### 15 · `/avatar` — 4 endpoints

[`avatar.routes.ts`](src/modules/avatar/avatar.routes.ts) · Gate global: `authMiddleware` +
`requireRole(...STUDENT_ROLES, "teacher")` (`:18-19`), es decir los cuatro roles que existen
(`auth-middleware.ts:101` más `"teacher"`). La foto cuelga de `app_user`, no del expediente
académico, así que no hay a quién excluir.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| POST | `/avatar/signature` | Bearer | alumno + docente | Devuelve `{ cloudName, apiKey, timestamp, signature, publicId }` para que la **app suba directo a Cloudinary**. No recibe body. **503 `AVATAR_DISABLED`** si faltan las `CLOUDINARY_*` |
| POST | `/avatar` | Bearer | alumno + docente | Confirma una subida ya hecha: escribe `avatar_public_id`, `avatar_version` y `avatar_updated_at` en `app_user`. Body `{ version }`. Responde `{ ok: true }` con **200**, no 201. **400 `INVALID_BODY`**, **503 `AVATAR_DISABLED`** |
| DELETE | `/avatar` | Bearer | alumno + docente | Quita la foto propia y la destruye en Cloudinary. `{ ok: true }` |
| DELETE | `/avatar/:userId` | Bearer | alumno + docente (**+ sección compartida**) | Moderación: quita la foto de otra persona. **400 `INVALID_ROUTE_PARAMS`**, **404 `USER_NOT_FOUND`**, **403 `AVATAR_FORBIDDEN`** |

**No hay ningún `GET`, y es deliberado.** El propio archivo de rutas lo escribe
(`avatar.routes.ts:7-13`): un endpoint para pedir la foto de un usuario convertiría la app en un
directorio de caras. La foto viaja donde ya viaja la persona, apoyada en la guarda de
pertenencia que esos endpoints ya tienen. Hoy son exactamente dos sitios —`avatarUrl` solo
aparece en `auth` y en `course-detail`—: el `AuthUser` que devuelven `/auth/login` y `/auth/me`
([`auth.repository.ts`](src/modules/auth/auth.repository.ts)`:321` docente, `:526` alumno) y
`GET /course-detail/sections/:sectionId/contacts`
([`course-detail.routes.ts`](src/modules/course-detail/course-detail.routes.ts)`:246,303`).

`version` acepta string o número, lo normaliza a string y exige `/^\d{1,20}$/`
([`avatar.schemas.ts`](src/modules/avatar/avatar.schemas.ts)`:6-10`): ese valor entra en la URL
pública que se arma con él, y aceptar solo dígitos es lo que impide que inyecte segmentos de
ruta. El tope de 20 es el de la columna, `varchar("avatar_version", { length: 20 })`
(`schema.ts:111`). El `:userId` de la ruta de moderación se valida con
`z.coerce.number().int().positive()` (`avatar.schemas.ts:12-14`), la convención general del
backend.

**Por qué el backend no toca los bytes.** Vercel corta los cuerpos de petición en 4.5 MB y una
foto de cámara los pasa; proxearlos gastaría tiempo de función sin ganar nada
([`avatar.logic.ts`](src/modules/avatar/avatar.logic.ts)`:5-8`). Lo que hace segura la firma que
se le entrega al cliente es que el `public_id` va **dentro** de lo firmado y es determinista:
`ulima/avatars/{userId}` (`publicIdDe`, `:23`). Aunque alguien intercepte la firma, solo le
sirve para sobrescribir la foto de su propio dueño; y como el id es fijo, volver a subir
reemplaza y no quedan huérfanas acumulándose en la cuenta.

Se firman cuatro parámetros —`invalidate=true`, `overwrite=true`, `public_id` y `timestamp`—
como sha1 de los pares `k=v` ordenados alfabéticamente y unidos por `&`, más el `api_secret`
(`:32-44`). El **borrado se firma aparte** (`firmaDeBorrado`, `:50-56`), con solo `public_id` y
`timestamp`: no lleva `overwrite` ni `invalidate`, y firmar de más hace que Cloudinary rechace
la petición.

**La URL nunca se guarda.** `construirUrlAvatar` la arma al vuelo con la transformación
`w_160,h_160,c_fill,g_face,f_auto,q_auto` (`TRANSFORMACION_AVATAR`, `:17`) — recorte cuadrado
centrado en la cara, formato y calidad al criterio del CDN, porque los avatares se pintan a
40 px en las listas y servir el original gastaría datos móviles del alumno. Persistir la URL
impediría cambiar esa transformación después y, sobre todo, borrar la imagen; es la misma razón
que está escrita en el esquema (`schema.ts:103-107`). Si falta `cloudName` o `publicId`,
devuelve `null` y quien la muestre cae a las iniciales.

**Quién puede quitarle la foto a quién.** El dueño siempre; y sobre otra persona, quien tenga
cargo en una sección que **comparta** con ella: `delegate`, `subdelegate`, `teacher` o `jp`
(`puedeQuitarAvatar`, `:84-88`). El `null` es cómo se expresa «no comparten sección»: la
consulta ([`avatar.repository.ts`](src/modules/avatar/avatar.repository.ts)`:56-92`) solo
devuelve rol si hay una sección en común, acotada al período activo (`ap.is_active`, `:68`) y a
matrículas `active` (`:69`, `:79`), así que ser delegado de otro curso —o del ciclo pasado— no
da ningún poder acá. Los cuatro roles pesan lo mismo; `delegate` gana el desempate solo para que
el motivo que se registra sea estable (`:53-54`, `:74`).

**El borrado prioriza a quien pidió que le quiten la foto.** El `public_id` se lee en una
consulta aparte *antes* del `UPDATE` (`:17-22`: recuperarlo dentro del mismo `UPDATE` depende de
cómo Postgres resuelve la subconsulta, y no vale la sutileza para ahorrar un viaje), se anulan
las tres columnas, y recién entonces se llama a `image/destroy` con timeout de **8000 ms**
([`avatar.service.ts`](src/modules/avatar/avatar.service.ts)`:91-94`). Si esa llamada falla se
registra en consola y **no se revierte nada** (`:69-77`): anular solo la columna dejaría la
imagen accesible por URL para quien la hubiera guardado, pero la fila ya quedó limpia y para el
usuario lo que importa es que la app deje de mostrarla.

> ⚠️ **`DELETE` funciona con Cloudinary apagado; `POST` no.** El guard `config.cloudinary.enabled`
> está solo en `firmarSubida` (`avatar.service.ts:29`) y `confirmar` (`:46`). `quitar` no lo
> tiene, así que sin las `CLOUDINARY_*` se sigue pudiendo limpiar la columna y `destruirImagen`
> retorna temprano (`:83`). Es coherente con la política de arriba —un «quítenme la foto» no
> debería fallar nunca—, pero no está declarado en ninguna parte.

> ⚠️ **`AVATAR_DISABLED` es 503 y no 500 a propósito.** Sin `CLOUDINARY_CLOUD_NAME`,
> `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`, `config.cloudinary.enabled` es `false`
> ([`app-config.ts`](src/config/app-config.ts)`:13-15`) y la feature está apagada entera: todos
> se ven con iniciales. No es un fallo, es un estado del servicio (`avatar.service.ts:9-12`).

> ⚠️ **Este módulo es el único de `src/` que emite `INVALID_BODY`.**
> [`avatar.controller.ts`](src/modules/avatar/avatar.controller.ts)`:16` lo usa para el body de
> `POST /avatar`, mientras que el resto del backend responde `INVALID_REQUEST_BODY` desde
> `validate-dto.ts`. La fila 13 de la tabla de discrepancias afirma que «`INVALID_BODY` no existe
> en `src/`»: sigue siendo cierto para `PUT /academic-profile/me/specialties`, pero el código
> **sí** existe, y `git grep INVALID_BODY -- src` sobre `main` devuelve exactamente esa línea.

> ⚠️ **El «70 endpoints» del título de esta sección no cuenta estos cuatro.** Sumando los
> dieciséis bloques —los 3 de la raíz incluidos— salen **74**.

#### 16 · `/portal-sync` — 2 endpoints

<!-- ═══════════════════════════════════════════════════════════════════════════
FILAS PARA LA TABLA «Todos los códigos de error» (~línea 2137).
No van acá: la tabla está ordenada por HTTP, insertar cada fila en su bloque.

1) En el bloque de 400, después de la fila `INVALID_QUESTION`:
| `INVALID_BODY` | 400 | Body de `POST /avatar` fuera de schema (`version` no numérica o ausente); `details` = `flatten()` — `avatar.controller.ts:16`. Único uso del código en `src/` |

2) En el bloque de 403, después de la fila `PORTAL_IDENTITY_MISMATCH`:
| `AVATAR_FORBIDDEN` | 403 | Se intentó quitar la foto de alguien con quien no se comparte sección activa, sin ser delegado, subdelegado, docente ni JP de ella — `avatar.service.ts:62` |

3) En el bloque de 503, junto a `CHATBOT_UNAVAILABLE`:
| `AVATAR_DISABLED` | 503 | Faltan las `CLOUDINARY_*`, así que las fotos de perfil están apagadas; solo lo lanzan `POST /avatar/signature` y `POST /avatar` — `avatar.service.ts:11-12` |

Además, dos retoques de texto en esa misma tabla:
- El encabezado dice «**60 filas, 59 códigos distintos**»: con estas tres pasa a
  «**63 filas, 62 códigos distintos**».
- La fila `USER_NOT_FOUND` | 404 enumera dónde se emite; añadir `avatar` a la lista
  (`avatar.service.ts:56`, cuando `:userId` no existe en `app_user`).
═══════════════════════════════════════════════════════════════════════════ -->


Gate global: `authMiddleware` + `requireRole(...STUDENT_ROLES)`.

| Método | Endpoint | Auth | Roles | Qué hace |
|:---|:---|:---|:---|:---|
| GET | `/portal-sync/status` | Bearer | alumno | `{ activePeriod, enrollmentsInActivePeriod, needsImport }`; `needsImport` es cierto si no hay matrículas en el período o no hay período activo |
| POST | `/portal-sync/import` | Bearer | alumno | Importa matrícula, récord, horario, sílabos y delegados desde miUlima. Verifica identidad antes de escribir. Idempotente. **Rate limit 5/h** |

El body acepta `cookies` **XOR** `credentials`, exactamente uno de los dos
([`portal-sync.schemas.ts`](src/modules/portal-sync/portal-sync.schemas.ts)`:36-42`):

- `cookies` → `{ JSESSIONID, LtpaToken2, LtpaToken? }`, con `.strip()` deliberado: cualquier
  cookie extra se descarta y no se reenvía al portal.
- `credentials` → `{ password, passcode }` con `passcode` de 6 a 8 dígitos. **No incluye
  usuario**: el código sale de `app_user.code` vía el `userId` del JWT
  ([`portal-sync.service.ts`](src/modules/portal-sync/portal-sync.service.ts)`:72`), porque
  pedirlo abriría una vía para importar en nombre de otro alumno.

La respuesta trae un `ImportSummary` de **15 contadores** (`coursesCreated`, `teachersCreated`,
`sectionsCreated`, `sectionsUpdated`, `sessionsUpserted`, `enrollmentsUpserted`,
`enrollmentsWithdrawn`, `progressUpserted`, `progressSkipped`, `alertsCreated`,
`syllabiUpserted`, `claimsUpserted`, `claimsDeleted`, `representativesPromoted`,
`alertsDeleted`), una lista de `warnings` con **11 códigos posibles**, y un campo `token`.

> **12 · Ese `token` es un JWT re-firmado, y no incrementa `tokenVersion`.** Cuando la
> importación descubre que el alumno es delegado y lo promueve, `reissueToken`
> ([`auth.service.ts`](src/modules/auth/auth.service.ts)`:316-343`) vuelve a firmar el token
> **con la versión vigente**. Incrementarla mataría el JWT que la app está usando en esa misma
> petición y el `ApiClient` de Flutter cerraría la sesión en mitad de la sincronización.
> Devuelve `null` si el usuario no se puede leer o si el rol es `teacher`. Es la única
> excepción a la regla «cada emisión de token invalida la anterior», y está justificada con 40
> líneas de JSDoc (`:276-315`) en el código.

Anti-SSRF: `PORTAL_ALLOWED_HOST = "webaloe.ulima.edu.pe"` y un host aparte para los sílabos
(`cactus.ulima.edu.pe`), cada uno con su predicado y su `.refine()` sobre `PORTAL_BASE_URL` /
`SYLLABUS_BASE_URL` ([`src/config/env.ts`](src/config/env.ts)`:7-14`). Timeout: **8000 ms** por
defecto.

---

### Todos los códigos de error

**60 filas, 59 códigos distintos**: `USER_NOT_FOUND` se emite con **401** en los caminos de
login y con **404** en los de lectura de usuario.

| Código | HTTP | Cuándo se emite |
|:---|---:|:---|
| `INVALID_JSON_BODY` | 400 | El body no parsea como JSON — [`validate-dto.ts`](src/shared/middleware/validate-dto.ts)`:7` |
| `INVALID_REQUEST_BODY` | 400 | El body no cumple el schema Zod; `details` = `flatten()` — `validate-dto.ts:12` |
| `INVALID_QUERY_PARAMS` | 400 | Query string inválido — `validate-dto.ts:21` |
| `INVALID_ROUTE_PARAMS` | 400 | Parámetro de ruta inválido — `validate-dto.ts:30`, y a mano en `chat.routes.ts:46` y `networking.routes.ts:26` |
| `INVALID_ALERT_ID` | 400 | `:alertId` no es numérico — `alerts.controller.ts:27` |
| `INVALID_CAREER_ID` | 400 | `careerId` inválido en `/academic-profile/specialties` |
| `WEAK_PASSWORD` | 400 | Contraseña nueva por debajo de `MIN_PASSWORD_LENGTH` |
| `INVALID_RESET_CODE` | 400 | «Código inválido o expirado.» — genérico a propósito, no distingue caducado de incorrecto |
| `INVALID_TIME_RANGE` | 400 | Asesoría con hora de inicio ≥ hora de fin — `teacher.service.ts:61` |
| `DATE_IN_PAST` | 400 | Asesoría con fecha ya pasada — `teacher.service.ts:63` |
| `DATE_OUT_OF_PERIOD` | 400 | Asesoría fuera del período académico activo — `teacher.service.ts:65` |
| `MISSING_LOCATION` | 400 | Falta aula o enlace según la modalidad — `teacher.service.ts:67` |
| `INVALID_NETWORKING_LINK` | 400 | Enlace del carnet inválido; `details.reason` dice cuál de las reglas falló — `networking.service.ts:47` |
| `INVALID_NETWORKING_LINK_COUNT` | 400 | Más de un enlace en el carnet — `networking.service.ts:41` |
| `INVALID_QUESTION` | 400 | Pregunta fuera de schema o con patrón de inyección de prompt — `chatbot.controller.ts:57,70` |
| `MISSING_TOKEN` | 401 | Falta el header `Authorization` — [`auth-middleware.ts`](src/shared/middleware/auth-middleware.ts)`:26` |
| `INVALID_TOKEN` | 401 | Token mal formado, expirado, sin el claim del rol, o con `tokenVersion` revocada — `auth-middleware.ts:31,37,44,54,57,67,79` |
| `USER_NOT_FOUND` | 401 | Código o correo sin cuenta, en login y en Google |
| `INVALID_PASSWORD` | 401 | Contraseña incorrecta |
| `STUDENT_NOT_FOUND` | 401 | Guarda defensiva: contexto sin `studentId` — `alerts.controller.ts:11,21`, `section-management.controller.ts:18` |
| `TEACHER_NOT_FOUND` | 401 | Guarda defensiva: contexto sin `teacherId` — `teacher.controller.ts:12`, `official-grades.controller.ts:12` |
| `FORBIDDEN` | 403 | `requireRole` rechazó el rol (`auth-middleware.ts:95`), o el recurso es de otro docente, o un no-alumno intentó `portal-sync` |
| `NOT_ENROLLED` | 403 | El alumno no tiene matrícula activa; bloquea el login |
| `INVALID_DOMAIN` | 403 | Correo de Google fuera de `@aloe.ulima.edu.pe` / `@ulima.edu.pe` |
| `SECTION_FORBIDDEN` | 403 | No pertenece o no dicta la sección — `course-detail.routes.ts:77`, `section-management.service.ts`, `schedule.service.ts` ×2, `teacher.service.ts:40` |
| `ANNOUNCEMENT_FORBIDDEN` | 403 | El anuncio no es del representante autenticado |
| `NOT_SECTION_PROFESSOR` | 403 | Solo el profesor titular puede calificar; el JP no — `official-grades.service.ts:35` |
| `RSVP_STUDENT_ONLY` | 403 | Solo alumnos confirman asistencia a una asesoría |
| `CHAT_SECTION_FORBIDDEN` | 403 | No pertenece a la sección, o el `userId` no coincide con el participante — `chat.controller.ts:29` |
| `CHAT_DELETE_FORBIDDEN` | 403 | No es el profesor titular de la sección — `chat.controller.ts:77` |
| `NETWORKING_CARD_HIDDEN` | 403 | El dueño del carnet no dio opt-in — `networking.service.ts:66` |
| `PORTAL_IDENTITY_MISMATCH` | 403 | El código leído del portal no coincide con `app_user.code` |
| `USER_NOT_FOUND` | 404 | Usuario inexistente en `/auth/me`, `/auth/password-reset/request-me`, academic-profile y networking |
| `SPECIALTY_NOT_FOUND` | 404 | Especialidad inexistente |
| `COURSE_NOT_FOUND` | 404 | El curso no está en el currículo del alumno |
| `ALERT_NOT_FOUND` | 404 | Alerta inexistente o de otro alumno |
| `ANNOUNCEMENT_NOT_FOUND` | 404 | Anuncio inexistente |
| `SECTION_NOT_FOUND` | 404 | Sección inexistente en `notify-grades` |
| `ASSESSMENT_NOT_FOUND` | 404 | Evaluación inexistente en `notify-grades` |
| `ENROLLMENT_NOT_IN_SECTION` | 404 | La matrícula del lote no pertenece a la sección que se califica |
| `ASSESSMENT_NOT_IN_SECTION` | 404 | La evaluación del lote no pertenece a la sección que se califica |
| `SESSION_NOT_FOUND` | 404 | Asesoría no disponible (también cuando el alumno no participa), o sesión de chatbot inexistente |
| `ADVISING_NOT_FOUND` | 404 | Asesoría inexistente — `teacher.service.ts:95,112` |
| `CHAT_MESSAGE_NOT_FOUND` | 404 | El mensaje no existe en RTDB — `chat.controller.ts:92` |
| `DUPLICATE_PRIMARY` | 409 | La especialidad principal aparece también como interés |
| `ADVISING_OVERLAP` | 409 | Se solapa con otra asesoría del mismo docente ese día — `teacher.service.ts:69` |
| `NO_ACTIVE_PERIOD` | 409 | No hay período académico activo — `teacher.service.ts:36` |
| `ONLY_EXTRA_DELETABLE` | 409 | Se intentó borrar una asesoría `recurring` — `teacher.service.ts:100` |
| `SESSION_ALREADY_PAST` | 409 | RSVP a una asesoría que ya pasó — `student.service.ts:89` |
| `PORTAL_SESSION_INVALID` | 409 | miUlima devolvió `inicio.jsp` o volvió a pedir passcode — **409 y no 401 a propósito**, para no confundirlo con el 401 del propio backend — [`portal.client.ts`](src/services/portal.client.ts)`:70` |
| `PORTAL_LOGIN_REJECTED` | 409 | miUlima rechazó contraseña o passcode; **devuelve el cupo** del rate limit — `portal.client.ts:86` |
| `PORTAL_IDENTITY_UNVERIFIABLE` | 422 | No se pudo leer el código del alumno en el portal, así que no se escribe nada |
| `RATE_LIMITED` | 429 | Cuota horaria excedida; `details.retryAfterMinutes` — `rate-limit.ts:36` (chatbot) y `:82` (portal-sync) |
| `INTERNAL_SERVER_ERROR` | 500 | Fallback global para todo error que no sea `HttpError` — `error-handler.ts:23` |
| `INTERNAL_ERROR` | 500 | Error de BD envuelto por un service — `auth.service.ts` ×6, `teacher.service.ts:126`, `section-management.service.ts:221`, `chatbot.controller.ts:96` |
| `ANNOUNCEMENT_CREATE_FAILED` | 500 | El anuncio se insertó pero no se pudo releer — `section-management.service.ts:120` |
| `NETWORKING_DATA_INTEGRITY` | 500 | El carnet en BD tiene más de un enlace — `networking.service.ts:24,74` |
| `PORTAL_UNAVAILABLE` | 502 | miUlima no contactable o con respuesta inesperada — `portal.client.ts` ×6 |
| `CHATBOT_UNAVAILABLE` | 503 | Cohere caído o fuera de tiempo — `chatbot.controller.ts:88` |
| `PORTAL_TIMEOUT` | 504 | `AbortError` contra miUlima; `PORTAL_TIMEOUT_MS`, por defecto 8000 ms — `portal.client.ts:96` |

---

### Ejemplos reales

> Las **claves y los tipos** salen de los `*.types.ts` y de los `return` de los services
> citados. Los **valores son ficticios**: no hay ningún código, nombre ni correo de alumno real
> en este README — el repositorio es público.

#### `POST /auth/login` — alumno

```json
{
  "code": "20250000",
  "password": "la-contrasena-del-alumno"
}
```

**200 OK** ([`auth.service.ts`](src/modules/auth/auth.service.ts)`:82-95`,
`AuthUser` en [`auth.types.ts`](src/modules/auth/auth.types.ts)`:46-86`):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PAYLOAD.FIRMA",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "user": {
    "id": 42,
    "studentId": 17,
    "code": "20250000",
    "tokenVersion": 9,
    "fullName": "Alumno De Ejemplo",
    "firstName": "Alumno",
    "lastName": "De Ejemplo",
    "institutionalEmail": "20250000@aloe.ulima.edu.pe",
    "email": "20250000@aloe.ulima.edu.pe",
    "role": "delegate",
    "careerId": 3,
    "career_id": 3,
    "curriculumId": 1,
    "currentLevel": 7,
    "currentCycle": "2026-1",
    "setupComplete": true,
    "specialtySetupCompleted": true,
    "especialidad_principal": 4,
    "especialidades_interes": [6],
    "especialidades": [4, 6],
    "specialties": [
      { "specialtyId": 4, "name": "Especialidad A", "selectionType": "primary" },
      { "specialtyId": 6, "name": "Especialidad B", "selectionType": "interest" }
    ],
    "courseProgress": {
      "approvedLevels": [1, 2, 3, 4, 5, 6],
      "approvedCourseIds": ["101", "102", "115"],
      "approvedElectives": ["101", "102", "115"],
      "currentCourses": [
        {
          "idSeccion": "1042",
          "codigoSeccion": "801",
          "idCurso": "212",
          "courseId": "212",
          "nombre": "Ingeniería de Software 2",
          "period_code": "2026-1"
        }
      ]
    }
  }
}
```

Tres cosas que el objeto `user` confiesa de sí mismo en los comentarios de
[`auth.types.ts`](src/modules/auth/auth.types.ts):

1. `careerId` y `career_id` son el mismo número, duplicado para dos generaciones del cliente.
   Igual `especialidades` / `specialties`.
2. `approvedElectives` es **legado**: contiene exactamente lo mismo que `approvedCourseIds`. El
   Flutter ya publicado solo sabe leer ids por ese campo, así que se sigue llenando para que la
   malla se arregle sin obligar a reinstalar la app.
3. `approvedLevels` es un **piso, no una verdad**: los ciclos por debajo del nivel del alumno se
   dan por cumplidos para tapar lo que no se pudo emparejar (cambio de malla, convalidaciones,
   códigos antiguos).

**401** con contraseña incorrecta:

```json
{
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "Contraseña incorrecta."
  }
}
```

**400** con el body incompleto — nótese `details` con el `flatten()` de Zod y el mensaje en
inglés:

```json
{
  "error": {
    "code": "INVALID_REQUEST_BODY",
    "message": "Invalid request body",
    "details": {
      "formErrors": [],
      "fieldErrors": {
        "password": ["String must contain at least 1 character(s)"]
      }
    }
  }
}
```

#### `GET /auth/me` — los dos shapes

El mismo endpoint devuelve dos objetos distintos según el rol del token
([`auth.service.ts`](src/modules/auth/auth.service.ts)`:242-268`). Para **alumno** es el mismo
`user` del login, con el `role` recalculado contra el período activo. Para **docente**
(`TeacherAuthUser`, [`auth.types.ts`](src/modules/auth/auth.types.ts)`:11-25`):

```json
{
  "user": {
    "id": 88,
    "teacherId": 12,
    "code": "D0042",
    "tokenVersion": 3,
    "fullName": "Docente De Ejemplo",
    "firstName": "Docente",
    "lastName": "De Ejemplo",
    "institutionalEmail": "ejemplo@ulima.edu.pe",
    "email": "ejemplo@ulima.edu.pe",
    "role": "teacher",
    "teacherLabel": "Profesor",
    "setupComplete": true
  }
}
```

Sin `studentId`, sin `careerId`, sin `curriculumId`, sin `specialties`, sin `courseProgress`.
`setupComplete` es el literal `true`: los docentes no pasan por el asistente de carrera y el
campo existe solo para que el enrutador del frontend no los mande al onboarding.
`teacherLabel` se deriva de qué columna de `section` referencia al docente: `teacher_id` →
`"Profesor"`, `jp_id` → `"Jefe de Práctica"`.

#### `GET /grades/me/courses`

**200 OK** ([`grades.service.ts`](src/modules/grades/grades.service.ts)`:18-69`):

```json
{
  "cursos": [
    {
      "id": "212",
      "nombre": "Ingeniería de Software 2",
      "ciclo": "2026-1",
      "silaboUrl": "https://drive.google.com/file/d/ID_DEL_ARCHIVO/view",
      "secciones": [
        { "idSeccion": "1042", "codigoSeccion": "801" }
      ]
    }
  ],
  "syllabi": [
    {
      "cursoId": "1042",
      "cursoNombre": "Ingeniería de Software 2",
      "evaluaciones": [
        { "id": "9001", "nombre": "Práctica Calificada 1", "sigla": "PC1", "peso": 15, "tipo": "practica" },
        { "id": "9002", "nombre": "Examen Parcial", "sigla": "EP", "peso": 25, "tipo": "examen" }
      ]
    }
  ]
}
```

`syllabi[0].cursoId` vale `"1042"`, que es el **id de sección**, no el del curso — la trampa
del callout 6. Todos los ids del módulo son strings; `peso` es número.

#### `GET /curriculum/me`

**200 OK**, recortado a dos cursos
([`curriculum.service.ts`](src/modules/curriculum/curriculum.service.ts)`:43-50`):

```json
{
  "courses": [
    {
      "id": "301",
      "code": "IS0301",
      "name": "Base de Datos",
      "credits": 4,
      "level": 5,
      "row": 2,
      "category": "obligatorio",
      "prerequisites": ["215"],
      "specialties": [],
      "externalFaculty": false
    },
    {
      "id": "412",
      "code": "IS0412",
      "name": "Proyecto Integrador",
      "credits": 3,
      "level": 8,
      "row": 1,
      "category": "obligatorio",
      "prerequisites": ["_VI_CICLO_"],
      "specialties": ["Especialidad A"],
      "externalFaculty": false
    }
  ],
  "specialties": ["Especialidad A"],
  "simulation": [
    { "curriculumCourseId": "412", "status": "planned" }
  ]
}
```

El `"_VI_CICLO_"` de `prerequisites` es el centinela del callout 5: significa «haber aprobado
sexto ciclo», no «el curso con id `_VI_CICLO_`».

---

### El contrato documentado vs. el código

[`docs/specs/api-contracts.md`](docs/specs/api-contracts.md) tiene 600 líneas y se escribió
antes que varios de estos módulos. Estas son las **24 divergencias** que aparecieron al
verificarlo línea a línea contra los `*.routes.ts`. Manda el código.

| # | Punto | Dice el contrato | Hace el código |
|:---|:---|:---|:---|
| 1 | Calificar sección ajena | `403 NOT_SECTION_TEACHER` (líneas 346 y 350) | `403 NOT_SECTION_PROFESSOR`. `NOT_SECTION_TEACHER` sí existe en `src/`, pero es de otro módulo: lo devuelve `attendance-risk.service.ts` |
| 2 | Quién puede calificar | «secciones propias vía `teacher_id`/`jp_id`» | Solo `teacher_id`. El **JP recibe 403** (`official-grades.service.ts:31-37`) |
| 3 | Carnet oculto | `404 NETWORKING_NOT_PUBLIC` (línea 537) | `403 NETWORKING_CARD_HIDDEN`. **`NETWORKING_NOT_PUBLIC` no existe en `src/`** |
| 4 | Estado de `networking` | «PROPUESTO, pendiente de implementar» | **Implementado y montado** con 3 endpoints (`src/modules/index.ts:32`) |
| 5 | Enlaces del carnet | «máx. 1 por plataforma» — varios posibles | `array(...).max(1)`: **un enlace en total** |
| 6 | `GET /networking/users/:userId` | `{ userId, fullName, roleLabel?, links }` | `{ optIn, links, owner:{userId, fullName, primaryDetail, secondaryDetail, roleLabel} }` |
| 7 | Módulo `attendance-risk` | **No aparece** | 3 endpoints, `requireRole("teacher")`, con el segmento duplicado en el path |
| 8 | Endpoints docentes de schedule | Mención de pasada a `/schedule/teacher/*` | 4 reales; `assessments-status` y `notify-grades` **no están documentados en absoluto** |
| 9 | Estadísticas de sección | `GET …/progress` — «NO IMPLEMENTADO (HU11, pendiente)» | Existe `GET …/statistics`, implementado y gateado a `delegate`/`subdelegate` |
| 10 | `DELETE /grades/me/notes/:sectionId/:assessmentId` | Solo una nota al pie | Implementado (`grades.routes.ts:15`) |
| 11 | Roles de `course-detail` | «Solo roles de alumno; token docente recibe 403» | `requireRole(...STUDENT_ROLES, "teacher")` **global**: el docente entra en las 6 rutas |
| 12 | Pertenencia en `course-detail` | «El estudiante solo ve secciones donde está matriculado» | `exigirPertenencia` cubre 2 de 6 rutas; `/sections`, `/sections/:id`, `/teachers` y `/enrollments` **no la tienen** |
| 13 | Body inválido en `PUT /academic-profile/me/specialties` | `400 INVALID_BODY` | `400 INVALID_REQUEST_BODY`. `INVALID_BODY` sí existe en `src/`, pero es de otro módulo: lo devuelve `avatar.controller.ts` |
| 14 | Body de `POST /portal-sync/import` | El ejemplo solo muestra `cookies` | `cookies` **XOR** `credentials{password, passcode}` |
| 15 | Errores de `POST /portal-sync/import` | No lista `PORTAL_LOGIN_REJECTED` | Existe, con 409 y reembolso de cupo |
| 16 | `ImportSummary` | 11 contadores | **15**: añade `claimsUpserted`, `claimsDeleted`, `representativesPromoted`, `alertsDeleted` |
| 17 | `ImportResult` | No menciona `token` | Incluye `token: string \| null`, el JWT re-firmado tras la promoción |
| 18 | Warnings de portal-sync | 9 códigos | **11**: añade `LEVEL_REGRESSION_BLOCKED` y `DELEGADOS_UNAVAILABLE` |
| 19 | `GET /course-detail/sections/:id/contacts` | `docente`, `jefePractica`, `alumnos` | Añade `representantesPendientes[]` con `contactable:false` y un objeto `networking` por persona |
| 20 | Rutas públicas | Enumera 6 y **omite `GET /version`** | Son **7**: `/version` no lleva middleware (`server.ts:54`) |
| 21 | `POST /grades/me/notes` | `valor: 15` — número | `z.number().min(0).max(20).nullable()`: **admite `null`** |
| 22 | Metadata de `GET /` | «módulos disponibles» | La lista está desactualizada: omite 5 módulos montados |
| 23 | `POST /chat/token` | «puede pedir token cualquier miembro de la sección» | Cierto, pero **no hay `requireRole`**: la pertenencia la verifica el controller con `canIssueToken`, no el router |
| 24 | Errores de `DELETE /chat/…/messages/:messageId` | 403 `CHAT_DELETE_FORBIDDEN`, 404, 400 | Correcto, pero falta el `403 FORBIDDEN` de `requireRole("teacher")`, que dispara **antes** |

Hay además una contradicción documento contra documento:
[`docs/AUDITORIA_TECNICA.md`](docs/AUDITORIA_TECNICA.md)`:32` sigue listando un módulo
`simulated-grades` como «huérfano», y `:43` afirma que «no existe módulo `networking` pese a
estar documentado». Las dos cosas son falsas hoy: no hay directorio `src/modules/simulated-grades/` y
`networking` está montado en `src/modules/index.ts:32`.

---

### Login, `tokenVersion` y sesión única

Cada emisión de token incrementa `app_user.token_version`, y `authMiddleware` compara ese número
contra el claim del JWT **en cada petición**. Consecuencia práctica: **un usuario, una sesión**.
Iniciar sesión en un segundo dispositivo expulsa al primero en su siguiente llamada.

Se incrementa en cinco sitios: `login` de alumno
([`auth.service.ts`](src/modules/auth/auth.service.ts)`:77`), `loginTeacher` (`:114`),
`loginWithGoogle` docente (`:179`) y alumno (`:211`), y `logout` (`:236`). `confirmPasswordReset`
invalida todo vía `updatePasswordAndInvalidateSessions` (`:433`). La única emisión que **no** lo
toca es `reissueToken` — ver el callout 12.

```mermaid
sequenceDiagram
    autonumber
    actor App as App Flutter
    participant H as Hono POST /auth/login
    participant S as AuthService
    participant DB as PostgreSQL app_user
    participant AM as authMiddleware
    participant EH as errorHandler global

    App->>H: code y password
    H->>S: validateJson con loginSchema
    S->>DB: findByCodeWithPassword code
    DB-->>S: fila de alumno o null

    alt el code no corresponde a un alumno
        Note over S,DB: HU18 camino docente
        S->>DB: findTeacherByCodeWithPassword code
        alt tampoco es docente
            S-->>EH: HttpError 401 USER_NOT_FOUND
            EH-->>App: 401 USER_NOT_FOUND
        end
    end

    S->>S: bcrypt.compare password contra el hash
    alt no coincide
        S-->>EH: HttpError 401 INVALID_PASSWORD
        EH-->>App: 401 INVALID_PASSWORD
    end

    opt solo alumnos
        S->>DB: hasActiveEnrollment studentId
        alt sin matricula activa
            S-->>EH: HttpError 403 NOT_ENROLLED
            EH-->>App: 403 NOT_ENROLLED
        end
        S->>DB: findActiveRepresentation studentId
        DB-->>S: position delegate o subdelegate o null
        Note over S: role = position o student
    end

    rect rgb(235, 242, 255)
    Note over S,DB: Sesion unica
    S->>DB: update app_user set token_version = token_version + 1 returning token_version
    DB-->>S: newTokenVersion
    Note over S: todo JWT emitido antes queda muerto
    end

    S->>S: borra passwordHash y firma HS256 con sub, studentId o teacherId, code, role y tokenVersion
    S-->>App: 200 token tokenType Bearer expiresIn 86400 user

    Note over App,EH: cualquier peticion posterior

    App->>AM: Authorization Bearer jwt
    alt falta el header
        AM-->>EH: HttpError 401 MISSING_TOKEN
        EH-->>App: 401 MISSING_TOKEN
    end
    AM->>AM: jwt.verify con JWT_SECRET y HS256
    AM->>AM: exige sub entero, role string y tokenVersion entero
    AM->>AM: si role es teacher exige teacherId, si no exige studentId

    rect rgb(255, 240, 235)
    AM->>DB: select token_version from app_user where id = sub
    DB-->>AM: token_version vigente
    alt la fila no existe o el numero no coincide
        AM-->>EH: HttpError 401 INVALID_TOKEN token revocado
        EH-->>App: 401 INVALID_TOKEN
    end
    end

    AM->>AM: set userId, role y studentId o teacherId en el contexto
    AM-->>App: continua al handler del modulo
```

El comentario de
[`auth-middleware.ts`](src/shared/middleware/auth-middleware.ts)`:21-23` deja constancia de lo
que se quitó para llegar aquí: las vías `?code=`, el header `X-User-Code` y el prefijo
`Bearer dev-` permitían suplantar a cualquier usuario sin credenciales. Ninguna existe ya; el
único rastro es ese comentario que explica por qué están prohibidas.

---

## 📜 Las reglas del dominio

Las reglas de este backend no viven en el código: viven en las **18 specs** de
[`specs/features/`](specs/features/) y el código las implementa. `AGENTS.md:3` lo dice sin
matices — *no se implementa comportamiento nuevo sin spec aprobada* — y el flujo obligatorio es
`KNOWLEDGE.md` → [`docs/specs/feature-index.md`](docs/specs/feature-index.md) → spec de la feature
→ **aprobación explícita** → código dentro de los `targets` declarados.

Cada regla tiene un **ID estable**. Ese ID es el contrato: aparece en la spec, se cita en el
comentario del código y se enlaza desde los tests con `[@test]`. Cuando abajo decimos «BR-ALERT-02»
nos referimos a un párrafo concreto de un archivo concreto, no a una idea.

| Prefijo | Área | Spec que lo define |
|:---|:---|:---|
| `BR-AUTH-01…13` | Identidad, sesión, roles, OTP, Google SSO | [`specs/features/auth/auth.spec.md`](specs/features/auth/auth.spec.md) |
| `BR-AP-01…06` | Perfil académico y especialidades | [`specs/features/academic-profile/academic-profile.spec.md`](specs/features/academic-profile/academic-profile.spec.md) |
| `BR-CU-01…03` | Malla y simulación | [`specs/features/curriculum/curriculum.spec.md`](specs/features/curriculum/curriculum.spec.md) |
| `BR-GRADES-01…04` | Notas personales y promedio | [`specs/features/grades/grades.spec.md`](specs/features/grades/grades.spec.md) |
| `BR-SCH-01…05` | Horario, evaluaciones y carga | [`specs/features/schedule/schedule.spec.md`](specs/features/schedule/schedule.spec.md) |
| `BR-COURSE-DETAIL-01…05` | Detalle de curso y contactos | [`specs/features/course-detail/course-detail.spec.md`](specs/features/course-detail/course-detail.spec.md) |
| `BR-ALERT-01…07` | Alertas de riesgo y carga | [`specs/features/alerts/alerts.spec.md`](specs/features/alerts/alerts.spec.md) |
| `BR-SECTION-MGMT-01…05` | Anuncios y estadísticas de salón | [`specs/features/section-management/section-management.spec.md`](specs/features/section-management/section-management.spec.md) |
| `BR-ADV-01…21` | Asesorías del docente | [`specs/features/advising/advising.spec.md`](specs/features/advising/advising.spec.md) |
| `BR-AS-01…12` | Asesorías y RSVP del alumno | [`specs/features/advising-student/advising-student.spec.md`](specs/features/advising-student/advising-student.spec.md) |
| `BR-RF-01…06` | Refactor de advising en `teacher/` + `student/` | [`specs/features/refact-advising/refact-advising.spec.md`](specs/features/refact-advising/refact-advising.spec.md) |
| `BR-PLATFORM-01…11` | Runtime serverless y despliegue | [`specs/features/platform-runtime/platform-runtime.spec.md`](specs/features/platform-runtime/platform-runtime.spec.md) |
| `BR-CB-01…15` | Chatbot ULimaBot | [`specs/features/chatbot/chatbot.spec.md`](specs/features/chatbot/chatbot.spec.md) |
| `R-CHAT-1…4` | Chat en vivo por sección | [`specs/features/chat/chat.spec.md`](specs/features/chat/chat.spec.md) |
| `R-NET-1…4` | Carnet de networking | [`specs/features/networking/networking.spec.md`](specs/features/networking/networking.spec.md) |
| `RS-BE-1…8` | Importación desde miUlima | [`specs/features/portal-sync/portal-sync.spec.md`](specs/features/portal-sync/portal-sync.spec.md) |
| `RQ-1…7`, `RS-1…23` | Delegados leídos del portal | [`specs/features/delegados-portal/delegados-portal.spec.md`](specs/features/delegados-portal/delegados-portal.spec.md) |

Por encima de todas ellas hay seis **decisiones no negociables** (`KNOWLEDGE.md:133-140`), copiadas
aquí literalmente porque explican por qué el proyecto se ve como se ve: (1) no mocks JSON como
fallback, (2) no seeds, (3) no migraciones sin aprobación, (4) no lógica fuera de spec, (5) no
endpoints fuera de [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md), (6) no modificar
`src/db` salvo cambio de BD aprobado. La regla 4 tiene hoy una violación con nombre y apellido:
el módulo `attendance-risk`. Está en [Deuda técnica](#-deuda-técnica-y-límites-conocidos).

---

### Identidad y roles

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-AUTH-01` | Login por `code` + `password` con `bcryptjs.compare`. Exige perfil de alumno con al menos una `enrollment.status = 'active'` **de cualquier ciclo** (no se filtra por período activo, y es a propósito) o perfil docente vía `teacher.user_id`. | `auth.spec.md:23` · [`src/modules/auth/auth.service.ts`](src/modules/auth/auth.service.ts) |
| `BR-AUTH-02` | El rol se calcula **en el login**, no se guarda en la persona: `delegate` > `subdelegate` > `student`. | `auth.spec.md:33` · `auth.repository.ts:330-351` |
| `BR-AUTH-03` | JWT `HS256` firmado con `config.auth.jwtSecret`, con **Token Versioning** para forzar sesión activa única. | `auth.spec.md:41` · [`src/config/env.ts`](src/config/env.ts) |
| `BR-AUTH-04` | `GET /auth/me` y `POST /auth/logout` exigen Bearer: sin token `401 MISSING_TOKEN`, token inválido o expirado `401 INVALID_TOKEN`. | `auth.spec.md:60` · `auth-middleware.ts` |
| `BR-AUTH-05` | `GET /auth/me` resuelve por el `sub` del JWT. ⚠️ **La spec quedó obsoleta aquí**: dice que devuelve el rol **que viaja en el token** y que no reconsulta `section_representative`, pero el código **recalcula** el cargo con `findActiveRepresentation`. Manda el código; el porqué está en el callout 4 de [La API](#-la-api). | `auth.spec.md:66` · `auth.service.ts:251-265` |
| `BR-AUTH-06` | `POST /auth/logout` incrementa `app_user.token_version` en 1 e invalida todos los JWT vivos de esa cuenta. | `auth.spec.md:70` · `auth.service.ts:234-240` |
| `BR-AUTH-07` | **No existe endpoint de registro.** Todas las cuentas están precargadas en `app_user`. | `auth.spec.md:74` |
| `BR-AUTH-08` | Autenticación exclusivamente por `Authorization: Bearer <JWT>`. Prohibidos `?code=`, el header `X-User-Code` y el prefijo `Bearer dev-<code>`. | `auth.spec.md:77` · `auth-middleware.ts:21-23` |
| `BR-AUTH-09` | Un error de BD en `login`, `loginWithGoogle`, `me` o en la validación de `tokenVersion` responde `500 INTERNAL_ERROR`. Nunca se devuelve un usuario mock ni se firma un JWT en una ruta de error. | `auth.spec.md:85` |
| `BR-AUTH-10` | Google SSO: correo normalizado con `trim().toLowerCase()`, solo `@aloe.ulima.edu.pe` (alumno) y `@ulima.edu.pe` (docente), `google_id` persistido de forma idempotente y **cero autoaprovisionamiento** de cuentas. | `auth.spec.md:90` |
| `BR-AUTH-11` | Reset de contraseña con OTP de 6 dígitos hasheado SHA-256 en `password_reset_token`, respuesta genérica anti-enumeración, y al confirmar: rehash bcrypt + `token_version + 1`. | `auth.spec.md:106` · [`src/modules/auth/password-reset.logic.ts`](src/modules/auth/password-reset.logic.ts) |
| `BR-AUTH-12` | Rol técnico único `teacher` para profesor y JP. El JWT docente lleva `teacherId` y **nunca** `studentId`; el middleware exige el identificador que corresponde al rol. | `auth.spec.md:125` · `auth-middleware.ts:49-58` |
| `BR-AUTH-13` | `currentCourses` se filtra por período académico activo y `currentCycle` cae al código del período activo o a `null`. Nunca a un ciclo hardcodeado. | `auth.spec.md:152` |
| `R-CHAT-2` | Rol de chat con peso: `teacher` 100, `jp` 90, `delegate` 70, `subdelegate` 60, `student` 10. `isModerator` es todos salvo `student` y es **solo presentación**. | `chat.spec.md:29` · `chat.logic.ts:28-48` |
| `RS-18` | La promoción a delegado durante un import **re-firma** el token con `reissueToken` sin tocar `token_version`. | `delegados-portal.spec.md:156` |
| `RS-19` | Un `section_representative_claim` no otorga permisos por sí solo. Solo `section_representative` autoriza. | `delegados-portal.spec.md:157` |
| *(middleware)* | `requireRole(...roles)` corre después de `authMiddleware` y responde `403 FORBIDDEN`. `STUDENT_ROLES = ["student","delegate","subdelegate"]`. | `auth-middleware.ts:92-101` |

#### Cómo se decide el rol, exactamente

El rol **no es una columna**. Se calcula en cada login y se congela dentro del JWT.

```mermaid
flowchart TD
    A["POST /auth/login con code y password"] --> B{"Existe app_user.code"}
    B -- no --> E1["401 USER_NOT_FOUND"]
    B -- si --> C{"bcrypt.compare correcto"}
    C -- no --> E2["401 INVALID_PASSWORD"]
    C -- si --> D{"Tiene perfil de alumno"}
    D -- si --> F{"Tiene alguna matricula activa"}
    F -- no --> E3["403 NOT_ENROLLED"]
    F -- si --> G["findActiveRepresentation<br/>sr.is_active y e.status active y ap.is_active"]
    G --> H{"position de la fila ganadora"}
    H -- delegate --> R1["role igual a delegate"]
    H -- subdelegate --> R2["role igual a subdelegate"]
    H -- ninguna fila --> R3["role igual a student"]
    D -- no --> I{"app_user ligado a teacher.user_id"}
    I -- no --> E4["401 USER_NOT_FOUND por cuenta huerfana"]
    I -- si --> J["role igual a teacher<br/>sin exigir matricula ni representacion"]
    J --> K{"Su teacher.id figura como section.jp_id"}
    K -- si --> L1["teacherLabel igual a Jefe de Practica"]
    K -- no --> L2["teacherLabel igual a Profesor"]
    R1 --> T["JWT con studentId"]
    R2 --> T
    R3 --> T
    L1 --> U["JWT con teacherId y sin studentId"]
    L2 --> U
```

**Por qué `delegate` gana.** Un alumno puede tener filas activas de representación en varias
secciones a la vez, y podría ser delegado en una y subdelegado en otra. La consulta ordena y se
queda con una sola fila:

```sql
order by case sr.position when 'delegate' then 0 when 'subdelegate' then 1 else 2 end
limit 1
```

`src/modules/auth/auth.repository.ts:346-347`. El rol que sale es el **más alto** que la persona
tiene en cualquiera de sus secciones, porque el rol del JWT es una llave de acceso global al módulo
de gestión, no un cargo por sección. La autorización fina —*qué sección puedes tocar*— la hace
después la guarda de pertenencia, no el rol.

La consulta implementa además una condición que la spec no menciona y el código sí explica: el
cargo solo vale en el ciclo vigente. `findActiveRepresentation` (`auth.repository.ts:330-351`) une
`section_representative → enrollment → section → course_offering → academic_period` y exige
`e.status = 'active'`, `sr.is_active = true` **y** `ap.is_active = true`.

**Profesor vs Jefe de Práctica.** La etiqueta tampoco es un atributo de la persona (`BR-ADV-01`).
Se deriva de **qué columna de `section` apunta a ese `teacher.id`**:

| Contexto | Cómo se deriva | Valores | Código |
|:---|:---|:---|:---|
| Etiqueta global (header, login) | `select 1 from section where jp_id = <teacherId> limit 1` | `"Jefe de Práctica"` si hay filas, `"Profesor"` si no | `auth.repository.ts:293-298`, tipo en `auth.types.ts:8` |
| Etiqueta por sección (asesorías, contactos) | `case when sec.jp_id = cas.teacher_id then 'JP' else 'Profesor' end` | `"JP"` / `"Profesor"` | `advising/teacher/teacher.repository.ts:65,112,159` y `student.repository.ts:30` |

O sea: **la misma persona es "Profesor" en la sección donde es titular y "JP" en la sección donde
es jefe de práctica**, y la etiqueta global se queda con "Jefe de Práctica" si lo es en al menos
una. La exclusividad la garantiza la base (`BR-ADV-02`): `section.jp_id` nullable,
`CHECK (jp_id IS NULL OR jp_id <> teacher_id)`, índice único parcial
`uq_section_jp ON section(jp_id) WHERE jp_id IS NOT NULL`, y una **regla de ciclo** validada en
servicio (`jpViolatesCycleRule`, `advising/teacher/teacher.logic.ts:48`): quien es `teacher_id` de
alguna sección del período activo no puede ser `jp_id` en ese mismo período.

El alta de docentes y JP es administrativa, por seed aprobado
([`src/db/seed/docentes.ts`](src/db/seed/docentes.ts), `bun run db:seed:docentes`). **No hay
endpoints de alta de personas** en toda la API.

---

### Malla y progreso

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-CU-01` | `GET /curriculum/me` devuelve la malla del `curriculum_id` del alumno con `row = display_order - 1`, categoría, prerrequisitos, especialidades y las simulaciones registradas. | `curriculum.spec.md:20` |
| `BR-CU-02` | `PUT /curriculum/me/simulation` inserta o actualiza `student_curriculum_simulation`. | `curriculum.spec.md:38` |
| `BR-CU-03` | `DELETE /curriculum/me/simulation/:curriculumCourseId` borra el estado simulado y devuelve el curso a su estado **calculado**. | `curriculum.spec.md:44` |
| `BR-AP-01` | `GET /academic-profile/me` une `app_user` + `student` + `career` + `curriculum` + especialidades activas, con `setupComplete` desde `student.specialty_setup_completed`. | `academic-profile.spec.md:18` |
| `BR-AP-02` · `BR-AP-03` | Carreras ordenadas por nombre; especialidades filtradas por `careerId` y, sin query param, por la carrera del alumno autenticado. | `academic-profile.spec.md:27,31` |
| `BR-AP-04` | `PUT /me/specialties` **reemplaza el conjunto activo**: desactiva las ausentes, reactiva las presentes, inserta las nuevas y siempre marca `specialty_setup_completed = true`. | `academic-profile.spec.md:36` |
| `BR-AP-05` | `specialty_setup_completed` distingue «todavía no configuró» de «configuró y eligió no seleccionar». Sin ese flag son indistinguibles. | `academic-profile.spec.md:47` |
| `BR-AP-06` | El alumno solo lee y modifica su propio perfil. No hay endpoint para perfiles ajenos. | `academic-profile.spec.md:51` |
| *(portal-sync, paso 10)* | Progreso de malla: `approved` si `grade >= 11`; `failed` si `grade < 11`; `in_progress` si no hay nota y la fila es del período activo. Con varias filas del mismo curso gana la de mayor `VEZ`; a igual `VEZ`, el ciclo más reciente. | `portal-sync.spec.md:267` |
| *(portal-sync, paso 4)* | `student.current_level` se recalcula por cobertura, **nunca baja** (`levelNeverGoesDown`) y está acotado a `1..10` por `chk_student_current_level`. | `portal-sync.repository.ts:568`, `portal-sync.service.ts:458` |
| *(dato)* | La simulación de malla es **visual**: nunca modifica matrícula, notas ni progreso real. | `KNOWLEDGE.md:60`, `AGENTS.md:57` |

> ⚠️ El enum de simulación creció sin regla. `curriculum.spec.md:40` fija
> `status ∈ {planned, simulated_completed}`, pero el schema (`src/db/schema/schema.ts:25`) y el Zod
> (`src/modules/curriculum/curriculum.schemas.ts:12`) aceptan además `simulated_available`, añadido
> para la malla móvil (HU19). No hay spec de HU19 en `specs/features/`.

---

### Notas

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-GRADES-01` | Todas las rutas exigen Bearer + `requireRole('student','delegate','subdelegate')`. | `grades.spec.md:17` |
| `BR-GRADES-02` | `GET /grades/me/courses` devuelve cursos, secciones, sílabos y evaluaciones **del período activo** del alumno autenticado. | `grades.spec.md:20` |
| `BR-GRADES-03` | Las notas personales se guardan por upsert (`ON CONFLICT DO UPDATE`) resolviendo `enrollment_id` desde el `studentId` del JWT y el `sectionId` del body. No existe `PUT /grades/me/scores`. | `grades.spec.md:23` |
| `BR-GRADES-04` | `POST /grades/me/calculate` recibe `{valor, peso}[]` y devuelve `{promedio, sumaPesos}` con lógica pura en [`src/modules/grades/grades.logic.ts`](src/modules/grades/grades.logic.ts). | `grades.spec.md:29` |
| *(official-grades)* | Solo el **profesor titular** (`section.teacher_id`) califica. El JP **no** califica: `403 NOT_SECTION_PROFESSOR`. | `official-grades.spec.md:13-33` · `official-grades.service.ts:35` |
| *(official-grades)* | El upsert por lote valida **todo antes de escribir**: no hay persistencia parcial. `value ∈ [0, 20]`. | `official-grades.schemas.ts:12` |
| *(official-grades)* | La **nota final no se almacena**: se pondera en el cliente. `GET /official-grades/me` está acotado al período activo. | `official-grades.spec.md:15,41` |
| `BR-SECTION-MGMT-05` | Estadísticas del salón: promedio ponderado por alumno sobre lo ya calificado, media general, `%` con promedio `>= 10.5` e histograma por nota **redondeada** en 0-10 / 11-13 / 14-16 / 17-20. Solo cuentan alumnos con al menos una nota; si nadie tiene notas, todo es 0. | `section-management.spec.md:54` · `section-statistics.logic.ts:21,62-71` |

> ⚠️ **Dos tablas de notas, y la spec de grades apunta a la equivocada.** `BR-GRADES-03`
> (`grades.spec.md:24`) dice que las notas personales van a `student_score`. `AGENTS.md:53` dice lo
> contrario: `student_score` son las notas **oficiales** que carga el profesor y las personales
> viven en `simulated_grades`. El código le da la razón a `AGENTS.md`:
> `src/modules/grades/grades.repository.ts:64,73,85` escribe y lee `simulated_grades`. La spec de
> grades está obsoleta en ese punto. Las alertas, en cambio, leen `student_score`
> (`alerts.repository.ts:48`), o sea que **el riesgo académico se calcula con las notas oficiales,
> no con la calculadora del alumno** — que es lo correcto, pero `alerts.spec.md:11` todavía dice
> «solo el promedio personal».

---

### Alertas

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-ALERT-01` | Bearer + rol de alumno en todo el módulo. Sin `studentId` en contexto: `401 STUDENT_NOT_FOUND`. | `alerts.spec.md:19` |
| `BR-ALERT-02` | **Riesgo académico** por curso: alerta si `gradedWeight` mayor a 55 **y** `promedioPersonal` menor a 10.5. Ambos bordes son estrictos. | `alerts.spec.md:28` · `alerts.logic.ts:6,8,79-84` |
| `BR-ALERT-07` | **Riesgo crítico**: con `gradedWeight` mayor a 0, peso restante mayor a 0 y `requiredOnRemaining` mayor a 15, se emite **solo** la alerta crítica. Tiene precedencia sobre `BR-ALERT-02`. | `alerts.spec.md:36` · `alerts.logic.ts:96-113` |
| `BR-ALERT-03` | **Alta carga**: una alerta por cada semana académica con 3 o más evaluaciones. | `alerts.spec.md:45` · `alerts.repository.ts:69` |
| `BR-ALERT-04` | Deduplicación por **título exacto** antes de crear. Títulos canónicos: `Riesgo Crítico: <curso>`, `Riesgo Académico: <curso>`, `Alta Carga: Semana <n>`. | `alerts.spec.md:48` · `alerts.service.ts:62,74,86` |
| `BR-ALERT-05` | El enum `alert_type` solo admite `academic_risk` y `high_load`. Nada más. | `alerts.spec.md:51` · `schema.ts:46` |
| `BR-ALERT-06` | Las alertas de inasistencia que crea el docente son de tipo `academic_risk` y llevan título `Alerta de inasistencias - <courseName>`, para poder extraer el curso en `augmentAlerts`. | `alerts.spec.md:23` · `attendance-risk.service.ts:173,181` |
| `BR-SCH-03` | `GET /schedule/me/load` cuenta evaluaciones por semana académica del período activo y marca `isHighLoad = true` con 3 o más. Es la misma constante que `BR-ALERT-03`, en otro módulo. | `schedule.spec.md:36` · `schedule.logic.ts:73-77` |
| *(sin spec)* | **Riesgo de inasistencia**: límite de faltas 35 % si `cycle >= 6`, 25 % en otro caso; sobrepasarlo es `impedido`; con 2 o 3 faltas restantes es `en_riesgo`; cada sesión cuenta 2 horas; las secciones con `total_hours <= 0` se descartan. | `attendance-risk.service.ts:50,89,138,146,154,164` |
| *(prohibición)* | **No se usan promedios de sección para alertar riesgo académico.** El riesgo es individual. | `README.md:78` |

```mermaid
flowchart TD
    S["GET /alerts/me recalcula de forma idempotente"] --> A["Matriculas activas del periodo activo<br/>left join student_score"]
    A --> B["aggregateCourseScores<br/>gradedWeight, weightedSum, totalWeight"]
    B --> C{"Es riesgo critico"}
    C -- si --> D["Alerta unica con titulo Riesgo Critico"]
    C -- no --> E{"Es riesgo academico"}
    E -- si --> F["Alerta con titulo Riesgo Academico"]
    E -- no --> G["Sin alerta de riesgo para ese curso"]
    S --> H["Semanas con 3 o mas evaluaciones"]
    H --> I["Alerta con titulo Alta Carga Semana n"]
    D --> J{"Ya existe una alerta con ese titulo exacto"}
    F --> J
    I --> J
    J -- si --> K["No duplicar, regla BR-ALERT-04"]
    J -- no --> L["Insert en alert"]
    K --> M["augmentAlerts agrega curso y seccion"]
    L --> M
    M --> N["200 con el arreglo de alertas"]
```

---

### Secciones y representantes

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-SECTION-MGMT-01` | Bearer + rol de alumno en todo el módulo; las rutas de gestión exigen además `delegate` o `subdelegate`. | `section-management.spec.md:30` · `section-management.routes.ts:18-43` |
| `BR-SECTION-MGMT-02` | `GET /representatives` devuelve **solo** las secciones donde el alumno tiene representación activa, con datos reales. Nada de `MOCK-001`. | `section-management.spec.md:35` |
| `BR-SECTION-MGMT-04` | Anuncios: listado `published_at DESC`, creación derivando `section_representative_id` del JWT, edición y **soft delete** (`is_active = false`) solo del autor. Errores `403 SECTION_FORBIDDEN`, `403 ANNOUNCEMENT_FORBIDDEN`, `404 ANNOUNCEMENT_NOT_FOUND`. | `section-management.spec.md:44` |
| `BR-COURSE-DETAIL-01` | Todas las rutas del módulo pasan por `authMiddleware`: exponen secciones, docentes, matrículas y contactos. | `course-detail.spec.md:17` |
| `BR-COURSE-DETAIL-02` | La sub-petición interna de `GET /course-detail/sections/:sectionId` **debe reenviar** el header `Authorization`. | `course-detail.spec.md:22` |
| `BR-COURSE-DETAIL-04` | El listado de asesorías y el RSVP migraron a `src/modules/advising/student/`. `GET /course-detail/sections/:sectionId/advising` **no existe**. | `course-detail.spec.md:28` |
| `BR-COURSE-DETAIL-05` · `BR-ADV-21` | `GET /sections/:sectionId/contacts` agrega la clave top-level `jefePractica`, derivada de `section.jp_id`, entre `docente` y `alumnos`. | `course-detail.spec.md:32`, `advising.spec.md:101` |
| `RS-20` | Guarda de pertenencia: la sección debe cumplir `sec.teacher_id = teacherId` **o** `sec.jp_id = teacherId` **o** existir matrícula del `studentId`. Si no, `403 SECTION_FORBIDDEN`. | `delegados-portal.spec.md:161` · `course-detail.routes.ts:60-79` |
| `RS-15` | **Nunca `DELETE` sobre `section_representative`**, porque `announcement.section_representative_id` es FK sin cascada. Reasignar es `is_active = false`. | `delegados-portal.spec.md:149` |
| `RQ-1…RQ-7` | El alumno ve delegado y subdelegado de sus secciones del ciclo activo aunque no tengan cuenta (con marca `contactable: false`); al registrarse y sincronizar obtienen permisos sin intervención manual; **nunca se crean cuentas sintéticas**; solo se persisten las 2 filas marcadas; un fallo del parser de delegados no impide guardar el resto del import; los datos de terceros se borran al desactivarse su ciclo. | `delegados-portal.spec.md:84-90` |

> ⚠️ `BR-SECTION-MGMT-03` (`section-management.spec.md:42`) declara HU11 pendiente y dice que «no
> se agrega endpoint real de métricas». `BR-SECTION-MGMT-05`, doce líneas más abajo en la misma
> spec, la especifica completa — y el código la implementa
> (`section-management.routes.ts:24-28`). La regla vigente es la 05.

---

### Asesorías

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-ADV-01` | Rol técnico único `teacher`; la etiqueta Profesor/JP se deriva de la sección, nunca de un enum en la persona. | `advising.spec.md:23` |
| `BR-ADV-02` | Exclusividad del JP: 0 o 1 por sección, `CHECK (jp_id <> teacher_id)`, índice único parcial `uq_section_jp`, y regla de ciclo validada en servicio. | `advising.spec.md:28` · `teacher.logic.ts:48` |
| `BR-ADV-02b` | Convención de cuentas docentes del seed: usuario `(inicial + apellidoPaternoSinTildes).toLowerCase().slice(0,8)`, correo `<usuario>@ulima.edu.pe`, contraseña bcrypt costo 10 **fijada por variables de entorno y nunca hardcodeada**. | `advising.spec.md:37` |
| `BR-ADV-03` | Asesorías extra: enum `advising_kind` (`recurring` / `extra`), `session_date` obligatorio para extras, `capacity > 0`, `day_of_week` derivado de la fecha, e índices únicos re-alcanzados a `kind = 'recurring'`. | `advising.spec.md:43` |
| `BR-ADV-04` | `advising_rsvp` con `UNIQUE(advising_session_id, student_id)`. | `advising.spec.md:51` |
| `BR-ADV-10` | `GET /advising/me/sections` lista las secciones del período activo donde el docente dicta como profesor o JP, con su `rol`. | `advising.spec.md:59` |
| `BR-ADV-11` | `GET /advising/me/sessions` devuelve recurrentes + extras con `asistentes` (COUNT de RSVP) y orden extras-próximas-primero. | `advising.spec.md:64` |
| `BR-ADV-12` | Crear asesoría valida: propiedad de la sección, `startTime < endTime`, fecha dentro del período activo, fecha no pasada, ausencia de solape (`startA < endB AND startB < endA`) y ubicación según modalidad. | `advising.spec.md:70` |
| `BR-ADV-13` | `DELETE /advising/me/sessions/:id` **solo borra extras propias**; una recurrente responde `409 ONLY_EXTRA_DELETABLE`. Los RSVP asociados se eliminan en la misma transacción. | `advising.spec.md:85` |
| `BR-ADV-14` | Los asistentes se devuelven con total y lista **ordenada por apellido**, con el mismo control de propiedad que `BR-ADV-13`. | `advising.spec.md:93` |
| `BR-AS-01` | Solo tokens con `studentId` listan y hacen RSVP. Un token docente recibe `403 RSVP_STUDENT_ONLY`. | `advising-student.spec.md:27` |
| `BR-AS-02` | El alumno ve las asesorías cuyo `course_offering_id` coincide con el de su sección y con `section_id IS NULL` o igual a su sección, excluyendo las pasadas. | `advising-student.spec.md:32` |
| `BR-AS-03` | `POST /advising/:sessionId/rsvp` usa el `studentId` del JWT, exige participación (`404 SESSION_NOT_FOUND`), rechaza sesiones pasadas (`409 SESSION_ALREADY_PAST`) y es idempotente por `ON CONFLICT DO NOTHING`. | `advising-student.spec.md:38` |
| `BR-AS-04` | `DELETE …/rsvp` **siempre** está permitido, incluso en asesorías pasadas, y es idempotente. La asimetría es deliberada: cancelar nunca debe fallar. | `advising-student.spec.md:45` |
| `BR-AS-05` | «Pasada» se define por tipo: la extra por `session_date` + `end_time`; la recurrente por `day_of_week` ISO + `end_time`. Horas nulas devuelven `false`, defensivamente. | `advising-student.spec.md:51` |
| `BR-AS-06` | `asistentes` es `COUNT(*)` y `myRsvp` un `EXISTS`; ambos se **recalculan después de cada escritura**, no se incrementan en memoria. | `advising-student.spec.md:69` |
| `BR-RF-01…06` | El módulo se partió en `advising/teacher/` y `advising/student/`, con `advising/index.ts` montando `/me` → docente y `/` → alumno, sin tocar `src/modules/index.ts`. | `refact-advising.spec.md:35-83` |

---

### Importación del portal

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `RS-BE-1` | El alumno autenticado importa sus datos del ciclo activo desde miUlima usando la sesión del WebView. | `portal-sync.spec.md:83` |
| `RS-BE-2` | La importación es **idempotente**: repetirla no duplica ni borra, solo actualiza. | `portal-sync.spec.md:84` |
| `RS-BE-3` | Los datos compartidos se reutilizan por clave natural mediante upsert atómico; los datos del alumno se crean solo para él. | `portal-sync.spec.md:85` |
| `RS-BE-4` | La importación **nunca toca** `simulated_grades`, `student_curriculum_simulation`, `student_specialty`, `announcement`, `course_advising_session`, `advising_rsvp`, `user_social_link`, `schedule_session.color_hex` ni las horas de asistencia. Enmendada por delegados-portal solo para escribir claims y la propia promoción. | `portal-sync.spec.md:86`, `delegados-portal.spec.md:194` |
| `RS-BE-5` | `GET /portal-sync/status` dice si el alumno necesita importar. | `portal-sync.spec.md:87` |
| `RS-BE-6` | El backend **aborta sin escribir nada** si no puede probar que la sesión del portal pertenece al alumno autenticado: `403 PORTAL_IDENTITY_MISMATCH` o `422 PORTAL_IDENTITY_UNVERIFIABLE`. | `portal-sync.spec.md:88` |
| `RS-BE-7` | Ni la contraseña, ni el TOTP, ni las cookies se persisten ni se registran: viven **solo en memoria** durante la petición. | `portal-sync.spec.md:89` |
| `RS-BE-8` | La importación **nunca deja al alumno sin acceso a la app**: el retiro se omite si dejaría cero matrículas activas, con warning `WITHDRAW_SKIPPED_WOULD_LOCK_OUT`. | `portal-sync.spec.md:90,264` |
| `RS-1…RS-7` | Parser de delegados: emparejar arrays JS por índice explícito, canal `warnings` con posición, localizar el cargo por checkbox anclado `^prm_sFg(Dlgd\|Sdlg)_(\d+)$`, mirar `checked` y nunca `DISABLED`, cero casillas **no** es error, `ok:false` ante ambigüedad o aula equivocada, y parsers puros. | `delegados-portal.spec.md:124-132` |
| `RS-8` · `RS-9` | `prm_sNuAula` se valida como `^\d{4,8}$` **antes** de interpolarlo; las nóminas se piden en paralelo y el import completo se mide contra los 90 s del cliente Flutter. | `delegados-portal.spec.md:136-137` |
| `RS-10…RS-17` | Descarga y parseo **fuera** de la transacción, escritura **dentro**; empate en memoria por el par `(courseCode, sectionCode)`; upsert de claim condicionado por `observed_at` mayor; degradación **por aula** con `Promise.allSettled` y warnings `PARSER_FAILED` / `DELEGADOS_UNAVAILABLE`. | `delegados-portal.spec.md:141-152` |
| `RS-21…RS-23` | Se leen todas las filas en memoria pero solo se persisten las 2 marcadas; los claims de todo período inactivo se borran en la misma transacción; **ningún código ni nombre real de un tercero** se escribe en `specs/`, `docs/` ni fixtures. | `delegados-portal.spec.md:169-171` |
| *(persistencia)* | `syllabus` se inserta con `on conflict do nothing` **sin conflict target**: la tabla tiene dos restricciones únicas y un target explícito dejaría escapar un `23505` que tumbaría la transacción entera. | `portal-sync.spec.md:272` |

El import emite **11 códigos de warning** tipados (`portal-sync.types.ts:56-64`):
`PERIOD_DATES_DEFAULTED`, `PERIOD_NOT_ACTIVATED_YET`, `TEACHER_MISSING`, `PARSER_FAILED`,
`CAREER_MISMATCH`, `PROGRESS_SKIPPED`, `WITHDRAW_SKIPPED_WOULD_LOCK_OUT`, `LEVEL_OUT_OF_RANGE`,
`LEVEL_REGRESSION_BLOCKED`, `SYLLABUS_UNAVAILABLE`, `DELEGADOS_UNAVAILABLE`; y un `ImportSummary`
de **15 contadores** (`:67-73`). Un import puede terminar en `200` con media docena de warnings:
eso es éxito parcial, no fallo.

---

### Chat, chatbot y carnet

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `R-CHAT-1` | `POST /chat/token` verifica el JWT propio, resuelve al solicitante como participante, escribe el espejo `/members/{sectionId}/{uid}` **antes** de firmar y devuelve un custom token de Firebase con `uid = app_user.id`. | `chat.spec.md:21` |
| `R-CHAT-3` | PostgreSQL no se migra a Firebase: RTDB guarda **solo** mensajes y el espejo `/members`, que solo escribe el backend. | `chat.spec.md:36` |
| `R-CHAT-4` | El borrado suave de mensajes lo autoriza **solo el profesor titular** — ni el JP ni los representantes. Errores `403 CHAT_DELETE_FORBIDDEN` y `404 CHAT_MESSAGE_NOT_FOUND`. | `chat.spec.md:39` |
| `R-NET-1` · `R-NET-2` | El carnet devuelve `{optIn, links}` del propietario, legible incluso con `optIn = false`. `PUT` reemplaza atómicamente opt-in y enlaces derivando el propietario de `JWT.sub`; `optIn: true` exige **exactamente un** enlace. | `networking.spec.md:42,55` |
| `R-NET-3` | El enlace exige plataforma del enum, URL absoluta http(s) de 255 caracteres como máximo y **host que coincida con el dominio oficial** de la plataforma. `website` y `other` exigen `label` no vacía de 80 caracteres como máximo. | `networking.spec.md:71` |
| `R-NET-4` | `networking_opt_in = false` **oculta** el carnet a terceros, no borra el enlace. PostgreSQL es la única fuente de verdad; no se usa `teacher.linkedin_link`. | `networking.spec.md:89` |
| `BR-CB-08` | Las notas personales viajan en el body como `localGrades` y el backend **no las persiste**. | `chatbot.spec.md:96` |
| `BR-CB-09` | System prompt fijo: solo datos del contexto, nunca inventar, no responder por otros alumnos, no revelar IDs ni sugerir modificaciones. | `chatbot.spec.md:113` |
| `BR-CB-10` | Guardrails: pregunta de 500 caracteres como máximo, rechazo de prompt injection (`<context>`, `[CONTEXTO]`, `[DATOS_`, `system:`, `assistant:`) con `400 INVALID_QUESTION`, timeout de 8 s y **descarte de respuestas que contengan datos de otro `studentId`**. | `chatbot.spec.md:147` |
| `BR-CB-12` | Los errores de Cohere (timeout, 429, 500) se traducen a `503` con mensaje genérico. Nunca se exponen al frontend. | `chatbot.spec.md:161` |
| `BR-CB-13` | `todayISO()` fuerza `America/Lima`. El contexto incluye `today`, `academicPeriodCode`, `currentWeekNumber` y `nextWeekNumber`, y `dateContext` es obligatorio. | `chatbot.spec.md:173` |
| `BR-CB-14` | Las evaluaciones se recortan a `[currentWeekNumber-1, currentWeekNumber+1]` **solo dentro del chatbot**; `GET /schedule/me/assessments` sigue devolviendo el ciclo completo. | `chatbot.spec.md:184` |
| `BR-CB-15` | `chatbot.types.ts` **reexporta** `AssessmentResponse` de `schedule.types.ts` en vez de declarar el suyo, para que fecha, hora y aula vengan siempre de `ScheduleService`. | `chatbot.spec.md:191` |

---

### Runtime y plataforma

| ID | Regla | Dónde vive |
|:---|:---|:---|
| `BR-PLATFORM-01` · `BR-PLATFORM-02` | `src/server.ts` exporta la instancia Hono como **default export**, conservando CORS, logger, `errorHandler`, observers, `GET /`, `GET /health` y `registerModules`. Sin `Bun.serve()`, sin `app.listen()`, sin export `{port, fetch}`. | `platform-runtime.spec.md:37,47` · `src/server.ts:65` |
| `BR-PLATFORM-04` | Cero cambios de contrato REST: los paths públicos se conservan y **no** se introduce prefijo `/api`. | `platform-runtime.spec.md:63` |
| `BR-PLATFORM-06` | El build de producción no compila `src/db/seed/**`: los seeds no pueden romper `bun run build`. | `platform-runtime.spec.md:73` |
| `BR-PLATFORM-07` | Imports ESM con ruta explícita y extensión `.js`. Prohibidos los imports de directorio. | `platform-runtime.spec.md:78` |
| `BR-PLATFORM-08` | CORS configurable por `CORS_ORIGINS` (coma-separado); vacío mantiene `*`; `allowMethods` limitado a GET/POST/PUT/DELETE/OPTIONS y `allowHeaders` a Content-Type/Authorization. | `platform-runtime.spec.md:83` · `app-config.ts:28` |
| `BR-PLATFORM-09` | Gestor canónico único: Bun con `bun.lock` versionado; `package-lock.json` va en `.gitignore`. | `platform-runtime.spec.md:89` |
| `BR-PLATFORM-10` | `vercel.json` declara `regions: ["iad1"]` para pegar la función a Neon (us-east-1) e impedir un cambio silencioso de región desde el panel. | `platform-runtime.spec.md:93` |
| `BR-PLATFORM-11` | **`maxDuration` NO se declara.** Con Fluid compute el plan Hobby ya da 300 s por defecto y por tope: declararlo solo podría bajarlo. | `platform-runtime.spec.md:99` |

---

### Constantes del dominio

Todos estos valores están en el código, no en una hoja de configuración. La columna «Definida en»
es la única fuente de verdad; la columna «Regla» dice qué la justifica.

| Área | Constante | Valor | Definida en | Regla |
|:---|:---|---:|:---|:---|
| Alertas | `ACADEMIC_RISK_MIN_PROGRESS` | `55` % | `alerts.logic.ts:6` | `BR-ALERT-02` |
| Alertas | `ACADEMIC_RISK_MAX_AVERAGE` | `10.5` | `alerts.logic.ts:8` | `BR-ALERT-02` |
| Alertas | `PASSING_GRADE` | `10.5` | `alerts.logic.ts:11` y `section-statistics.logic.ts:21` | `BR-ALERT-07`, `BR-SECTION-MGMT-05` |
| Alertas | `CRITICAL_REQUIRED_ON_REMAINING` | `15` | `alerts.logic.ts:15` | `BR-ALERT-07` |
| Alertas | `HIGH_LOAD_MIN_ASSESSMENTS` | `3` | `schedule.logic.ts:73` y `alerts.repository.ts:69` | `BR-ALERT-03`, `BR-SCH-03` |
| Alertas | Límite de inasistencia | `35` % si `cycle >= 6`, `25` % si no | `attendance-risk.service.ts:50,164` | *(sin spec)* |
| Alertas | Faltas restantes que marcan riesgo | `2` o `3` | `attendance-risk.service.ts:89,179` | *(sin spec)* |
| Alertas | Horas por sesión de clase | `2` | `attendance-risk.service.ts:138,146,154` | *(sin spec)* |
| Académico | Nota mínima de aprobación en récord | `>= 11` aprueba, `< 11` reprueba | repositorio de import | `portal-sync.spec.md:267` |
| Académico | Rango de `student.current_level` | `1..10` | `portal-sync.repository.ts:568` | `chk_student_current_level` |
| Académico | Nota oficial | `[0, 20]` | `official-grades.schemas.ts:12` | `official-grades.spec.md:28` |
| Académico | Histograma de sección | `0-10 / 11-13 / 14-16 / 17-20` | `section-statistics.logic.ts:62-71` | `BR-SECTION-MGMT-05` |
| Seguridad | Algoritmo del JWT | `HS256` | — | `auth.spec.md:312` |
| Seguridad | Expiración del JWT | `86400` s (24 h), configurable | `env.ts:35-37` (`JWT_EXPIRES_IN`) | `BR-AUTH-03` |
| Seguridad | Longitud mínima de `JWT_SECRET` | `8` caracteres | `env.ts:34` | — |
| Seguridad | Costo de bcrypt | `10` | `auth.service.ts:39` (`BCRYPT_COST`) | `auth.spec.md:119`, `BR-ADV-02b` |
| Seguridad | Longitud del OTP | `6` dígitos | `password-reset.logic.ts:11` | `BR-AUTH-11` |
| Seguridad | Hash del OTP | SHA-256 hex, `varchar(64)` | `password-reset.logic.ts:21-22` | `BR-AUTH-11` |
| Seguridad | Expiración del OTP | `30` minutos | `password-reset.logic.ts:12` | `BR-AUTH-11` |
| Seguridad | Intentos máximos del OTP | `5` | `password-reset.logic.ts:13` | `BR-AUTH-11` |
| Seguridad | Longitud mínima de contraseña nueva | `8` caracteres | `password-reset.logic.ts:14` | `BR-AUTH-11` |
| Seguridad | Tokens de reset por usuario | `3` por hora, ventana de `60` min | `env.ts:61-64` y `auth.service.ts:43-44` | `auth.spec.md:116` |
| Seguridad | Longitud del código de usuario docente (seed) | `<= 8` caracteres | — | `BR-ADV-02b` |
| Tasa | Rate limit del chatbot | `20` preguntas por alumno por hora | `env.ts:72-75`, ventana en `rate-limit.ts:11` | `BR-CB-11` |
| Tasa | Rate limit de portal-sync | `5` importaciones por alumno por hora | `rate-limit.ts:50` | `portal-sync.spec.md:130` |
| Tasa | Devolución de cupo de import | solo ante `PORTAL_LOGIN_REJECTED` | `rate-limit.ts:64-67` | `portal-sync.spec.md:174-178` |
| Chatbot | Longitud máxima de la pregunta | `500` caracteres | `chatbot.schemas.ts:14` | `BR-CB-10` |
| Chatbot | Timeout de Cohere Chat | `8000` ms | `chatbot.service.ts:98` | `BR-CB-10` |
| Chatbot | Timeout de Cohere Classify | `500` ms | `chatbot.service.ts:12` | `BR-CB-04` |
| Chatbot | Umbral de score de Classify | `> 0.3` | `intent-classifier.ts:78` | `BR-CB-04` |
| Chatbot | Temperatura / `maxTokens` de Cohere | `0.3` / `1000` | `chatbot.service.ts:111-112` | — |
| Chatbot | Historial incluido en el contexto | últimos `10` mensajes | `context-builder.ts:93` | `BR-CB-07` |
| Chatbot | Mensajes de chat leídos por sección | últimos `200` | `chat-search.ts:22` | `BR-CB-06` |
| Chatbot | Secciones de fallback si ninguna coincide | `3`, alfabéticas | — | `chatbot.spec.md:77` |
| Chatbot | Título de sesión | `100` caracteres, `VARCHAR(100)` | — | `BR-CB-03` |
| Chat | Pesos de rol | `100 / 90 / 70 / 60 / 10` | `chat.logic.ts:31-39` | `R-CHAT-2` |
| Portal | Timeout de cada petición al portal | `8000` ms | `env.ts:80-83`, `app-config.ts:36` | `portal-sync.spec.md:185` |
| Portal | Presupuesto de rondas | 4 rondas secuenciales, ~9-11 peticiones salientes | — | `portal-sync.spec.md:192` |
| Portal | Mediciones reales de import | `40.7` s y `47.7` s | — | `platform-runtime.spec.md:105` |
| Portal | Corte del cliente Flutter | `90` s | — | `RS-9` |
| Portal | `total_hours` de una oferta | `créditos × 16` | `portal-sync.repository.ts:481` | `portal-sync.spec.md:262` |
| Portal | `course.default_credit` | `max(1, ceil(créditos))` | `portal-sync.repository.ts:468` | `chk_course_default_credit` |
| Portal | Semanas académicas generadas | `max(1, ceil(spanDías / 7))` | `portal-sync.repository.ts:95` | `BR-SCH-04` |
| Portal | Calendario publicado 2026-2 | `2026-08-24` → `2026-12-14`, 16 semanas | `portal-sync.repository.ts:61-63` | `portal-sync.spec.md:234` |
| Portal | Validación de `COCICLO` / `courseCode` / `prm_sNuAula` / `@unid` | `^\d{5}$` · `^\d{4,6}$` · `^\d{4,8}$` · `^[0-9A-Fa-f]{1,120}$` | — | `portal-sync.spec.md:188,217`, `RS-8` |
| Portal | Cookies obligatorias del import | `JSESSIONID` y `LtpaToken2`, string `1..4096`; `LtpaToken` opcional | — | `portal-sync.spec.md:306` |
| Datos | URL de red social | `<= 255` caracteres | `networking.schemas.ts:16` | `R-NET-3` |
| Datos | `label` de red social | `<= 80`, obligatoria para `website` y `other` | `networking.schemas.ts:22,45-51` | `R-NET-3` |
| Datos | Enlaces por carnet | `1` como máximo | `networking.schemas.ts:59` | `R-NET-2` |
| Datos | `announcement.title` / `message` | `<= 150` / `<= 5000` caracteres | — | `api-contracts.md:506` |
| Datos | Guardas de longitud del sílabo | `title <= 150`, `drive_file_url <= 255`, `drive_file_id <= 120` | — | `portal-sync.spec.md:217,277` |
| Runtime | `PORT` por defecto | `3000` | `env.ts:38` | — |
| Runtime | Región de despliegue | `iad1` | `vercel.json` | `BR-PLATFORM-10` |
| Runtime | Timeout de función | `300` s por defecto **y** por tope | `vercel.json` sin `maxDuration` | `BR-PLATFORM-11` |
| Runtime | Firebase Admin SDK | fijado en `12.1.0` | `package.json:33` | `chat.spec.md:51` |

---

### Cinco reglas que casi todos leen mal

> **1 · El cargo de delegado caduca con el ciclo, aunque la tabla no lo diga.**
> `section_representative` no tiene columna de período. El ciclo sale de la sección, y por eso
> `findActiveRepresentation` arrastra el join hasta `academic_period` y exige `ap.is_active = true`.
> El comentario del código (`auth.repository.ts:341-343`) explica el fallo que lo motivó: *sin este
> join un delegado de 2026-1 conserva el cargo para siempre*. Es la única forma de que la
> desactivación de un ciclo degrade el rol sin escribir nada.

> **2 · `enrollment.status = 'completed'` no significa curso aprobado.**
> Significa que el alumno terminó de cursarlo. La aprobación real es
> `student_course_progress.status = 'approved'` (`KNOWLEDGE.md:54-55`). Confundirlas hace que la
> malla pinte como aprobado un curso jalado. El `status = 'active'` sí es la llave de todo lo
> demás: alimenta cursos actuales, horario, calculadora, asesorías y alertas.

> **3 · Los umbrales de riesgo son bordes estrictos, y el crítico gana.**
> Un curso con `gradedWeight` exactamente 55 **no** alerta; con exactamente `10.5` de promedio
> **no** alerta; con `requiredOnRemaining` exactamente 15 **no** es crítico. Y cuando un curso es
> crítico se emite **solo** la alerta crítica, no también la de riesgo académico
> (`BR-ALERT-07`). Los tests de caja blanca de `test/HU08_julio/` existen precisamente para clavar
> esos bordes: 66 casos sobre `alerts.logic.ts`.

> **4 · En `portal-sync` nunca se responde 401, pase lo que pase.**
> Una sesión de portal inválida es `409 PORTAL_SESSION_INVALID`; un login rechazado es
> `409 PORTAL_LOGIN_REJECTED`. El motivo es del cliente: el `ApiClient` de Flutter trata **todo**
> 401 como expiración del JWT propio y cerraría la sesión de ULima++ por un error del portal ajeno
> (`portal-sync.spec.md:126,167-170`). La misma lógica explica `RS-18`: la promoción a delegado
> re-firma el token con `reissueToken` **sin** tocar `token_version`, porque incrementarlo
> invalidaría el token que el alumno está usando en ese instante y lo echaría de la app en mitad
> de su propia importación.

> **5 · La importación puede dejarte fuera de tu propia app, así que se le prohibió.**
> `BR-AUTH-01` exige al menos una matrícula activa para iniciar sesión. Un import que procesa un
> retiro puede llevar al alumno a cero matrículas activas, y a partir de ahí ya no puede entrar.
> `RS-BE-8` corta ese camino: el retiro se **omite** si dejaría cero activas, y el import lo
> reporta con el warning `WITHDRAW_SKIPPED_WOULD_LOCK_OUT`. Es una regla de negocio que existe
> solo por una interacción entre dos features que nadie diseñó junta.

---

## 🔐 Seguridad

El backend tiene **una sola vía de autenticación** y **una sola forma de autorizar**. Todo
lo demás —CORS, límites de tasa, hashes, allowlists de host, validación en la frontera—
es defensa en profundidad alrededor de esas dos piezas.

Esto no siempre fue así. La historia de seguridad de este repositorio es la de tres
puertas traseras que se abrieron para poder desarrollar sin login y que se cerraron en
el Sprint 0; están documentadas más abajo porque explican por qué el middleware actual
es tan estricto.

### El modelo de sesión: JWT HS256 + `tokenVersion`

La firma vive en un único método privado, [`src/modules/auth/auth.service.ts`](src/modules/auth/auth.service.ts) `:477-495`:

```ts
private signToken(input: { userId; code; role; tokenVersion; studentId?; teacherId? }) {
  return jwt.sign(
    { sub: input.userId,
      ...(input.studentId != null ? { studentId: input.studentId } : {}),
      ...(input.teacherId != null ? { teacherId: input.teacherId } : {}),
      code: input.code, role: input.role, tokenVersion: input.tokenVersion },
    config.auth.jwtSecret,
    { algorithm: "HS256", expiresIn: config.auth.jwtExpiresIn },
  );
}
```

El payload real que viaja en cada petición:

| Claim | Tipo | Qué es |
|:---|:---|:---|
| `sub` | entero | `app_user.id`. El middleware lo lee como `userId` |
| `studentId` | entero *(opcional)* | Presente **solo** en tokens de alumno |
| `teacherId` | entero *(opcional)* | Presente **solo** en tokens de docente |
| `code` | string | Código institucional de 8 dígitos |
| `role` | string | `student` · `delegate` · `subdelegate` · `teacher` |
| `tokenVersion` | entero | Copia del `app_user.token_version` vigente al firmar |
| `iat` / `exp` | epoch | Los pone `jsonwebtoken`. Vigencia = `JWT_EXPIRES_IN`, default **86 400 s (24 h)** |

`studentId` y `teacherId` son **excluyentes**: el spread condicional de `:481-484` emite uno
u otro, nunca ambos. Esa exclusividad es lo que después permite al middleware detectar un
token manipulado sin consultar nada.

> **1 · Por qué `tokenVersion` y no una tabla de sesiones.** Un JWT puro es cómodo pero no
> se puede revocar: sigue siendo válido hasta que expire, y aquí eso son 24 horas. Una tabla
> de sesiones lo resuelve pero convierte cada request en una escritura y obliga a limpiar
> filas muertas. `tokenVersion` es el punto medio **semi-stateless**: un solo entero en
> `app_user`, y «revocar todas las sesiones» se reduce a `token_version = token_version + 1`.
> Cada login lo incrementa ([`auth.repository.ts`](src/modules/auth/auth.repository.ts) `:113-122`,
> `UPDATE … SET token_version = token_version + 1 … RETURNING`), y también lo incrementan
> `POST /auth/logout` y el `confirm` del restablecimiento de contraseña. Consecuencia
> deliberada: **una sesión activa por usuario**. Entrar en el celular cierra la sesión de la
> tablet. Es la regla BR-AUTH-03/06.

> **2 · Lo que cuesta.** El precio de la revocación instantánea es **una consulta SQL por
> request autenticado** — `select token_version from app_user where id = ?`. Es además un
> segundo camino a la base fuera de `auth.repository`, y está anotado como deuda en
> `DEUDA_TECNICA.md:107`. Se aceptó porque el alternativo (aguantar 24 h un token robado)
> era peor.

### `authMiddleware`, paso a paso

[`src/shared/middleware/auth-middleware.ts`](src/shared/middleware/auth-middleware.ts) `:20-83`, en este orden exacto:

1. **`Authorization` ausente** → `401 MISSING_TOKEN` (`:26`).
2. **El esquema no es `Bearer`, o el token viene vacío** → `401 INVALID_TOKEN` (`:31`).
3. **`jwt.verify(token, config.auth.jwtSecret)`** (`:35`). Verifica firma y expiración. *No* se
   pasa `algorithms` explícito: el algoritmo no está fijado desde el lado del verificador.
4. **Forma del payload** (`:36-45`): debe ser objeto, `sub` entero, `role` string,
   `tokenVersion` entero. Cualquier fallo → `401 INVALID_TOKEN`.
5. **Coherencia rol ↔ claim (HU18)** (`:49-58`): si `role === "teacher"` se exige `teacherId`
   entero; en cualquier otro caso se exige `studentId` entero. Un token de docente al que le
   inyectaran un `studentId` no pasa de aquí.
6. **Contraste contra la base** (`:61-63`): `select token_version from app_user where id = ${userId} limit 1`.
   Si la fila no existe o `dbTokenVersion !== tokenVersion` →
   `401 "Token de autenticación revocado o inválido."` (`:66-68`).
7. **Se puebla el contexto** (`:70-76`): `userId`, `role` y —según el rol— `teacherId` **o**
   `studentId`. Los handlers nunca leen el token; leen el contexto.
8. **`catch` final** (`:77-80`): re-lanza los `HttpError` propios y convierte **cualquier otra
   excepción** en `401 INVALID_TOKEN`. Es **fail-closed**: un fallo de base de datos en el
   middleware deniega, nunca concede.

### `requireRole` y los cuatro roles

```ts
export const requireRole = (...roles: string[]): MiddlewareHandler => async (c, next) => {
  const role = c.get("role");
  if (typeof role !== "string" || !roles.includes(role))
    throw new HttpError(403, "No tiene permisos para acceder a este recurso.", "FORBIDDEN");
  await next();
};

export const STUDENT_ROLES = ["student", "delegate", "subdelegate"] as const;
```

`requireRole` corre **después** de `authMiddleware`, que ya dejó `role` en el contexto. Los
roles válidos son cuatro: los tres de `STUDENT_ROLES` más `teacher`. Cómo se aplican, módulo
por módulo:

| Módulo (prefijo) | `authMiddleware` | Rol exigido | Dónde |
|:---|:---|:---|:---|
| `auth` | por-ruta | — | [`auth.routes.ts`](src/modules/auth/auth.routes.ts) `:36,40,44` |
| `academic-profile` | `use("*")` | `STUDENT_ROLES` | `academic-profile.routes.ts:9-10` |
| `curriculum` | `use("*")` | `STUDENT_ROLES` | `curriculum.routes.ts:8-9` |
| `grades` | `use("*")` | `STUDENT_ROLES` | `grades.routes.ts:8-9` |
| `official-grades` | `use("*")` | `/me` → `STUDENT_ROLES`; `/teacher/*` → `teacher` | `official-grades.routes.ts:8,11,14-16` |
| `schedule` | `use("*")` | `/me/*` → `STUDENT_ROLES`; `/teacher/*` → `teacher` | `schedule.routes.ts:8,11-19` |
| `course-detail` | `use("*")` | `STUDENT_ROLES` + `teacher` | `course-detail.routes.ts:43-44` |
| `alerts` | `use("*")` | `STUDENT_ROLES` | `alerts.routes.ts:8-9` |
| `section-management` | `use("*")` | base `STUDENT_ROLES`; **5** rutas de anuncios exigen `delegate`/`subdelegate` | `section-management.routes.ts:13-14,20,26,31,36,41` |
| `advising/teacher` | `use("*")` | `teacher` | `advising/teacher/teacher.routes.ts:8-9` |
| `advising/student` | por-ruta | `STUDENT_ROLES` | `advising/student/student.routes.ts:10-11,16-17,22-23` |
| `attendance-risk` | `use("*")` | `teacher` | `attendance-risk.routes.ts:8-9` |
| `chat` | `use("*")` | solo `DELETE …/messages/:id` → `teacher` | `chat.routes.ts:24,40` |
| `chatbot` | `use("*")` | `student` · `delegate` · `subdelegate` (literales, no la constante) | `chatbot.routes.ts:10-11` |
| `networking` | `use("*")` | `STUDENT_ROLES` + `teacher` | `networking.routes.ts:19-20` |
| `portal-sync` | `use("*")` | `STUDENT_ROLES` | `portal-sync.routes.ts:9-10` |

**Rutas públicas —las únicas siete:** `GET /` ([`src/server.ts`](src/server.ts) `:28`), `GET /health` (`:48`),
`GET /version` (`:54`), `POST /auth/login`, `POST /auth/google`,
`POST /auth/password-reset/request` y `POST /auth/password-reset/confirm`. El contrato escrito
([`docs/specs/api-contracts.md`](docs/specs/api-contracts.md)`:16`) enumera solo **seis** y
**omite `GET /version`**: es la divergencia 20 de
[El contrato documentado vs. el código](#el-contrato-documentado-vs-el-código). Todo lo demás
exige token.

### Controles por superficie

| Superficie | Control | Dónde |
|:---|:---|:---|
| **CORS** | `origin` = lista de `CORS_ORIGINS` separada por comas si no está vacía, **`*` si lo está**. `allowMethods: GET POST PUT DELETE OPTIONS`; `allowHeaders: Content-Type, Authorization`. Regla BR-PLATFORM-08 | [`src/server.ts`](src/server.ts) `:16-23`, [`src/config/app-config.ts`](src/config/app-config.ts) `:28` |
| **Rate limit · chatbot** | `CHATBOT_RATE_LIMIT` preguntas por alumno por hora, default **20**, ventana 1 h. Solo en `POST /chatbot/sessions/:id/ask`. Emite `X-RateLimit-Remaining` y `X-RateLimit-Reset` | [`src/shared/middleware/rate-limit.ts`](src/shared/middleware/rate-limit.ts) `:13-47`; `chatbot.routes.ts:17` |
| **Rate limit · portal-sync** | `PORTAL_MAX_PER_HOUR = 5` importaciones por alumno por hora, constante en código. Solo en `POST /portal-sync/import`. **Con devolución de cupo** (ver abajo) | `rate-limit.ts:49-50,64-67,70-102`; `portal-sync.routes.ts:13` |
| **Rate limit · reset de contraseña** | `PASSWORD_RESET_MAX_PER_HOUR` códigos por usuario por hora, default **3**, ventana **60 min**. **Persistido en la base**, no en memoria | [`auth.service.ts`](src/modules/auth/auth.service.ts) `:43-44,457-459` |
| **Rate limit · login** | **Ninguno.** `POST /auth/login` no lleva middleware de límite | `auth.routes.ts:16-19` |
| **Contraseñas** | `bcryptjs` con `BCRYPT_COST = 10` — el mismo costo con el que se generaron los hashes existentes de `app_user`. `compare` en login de alumno y de docente, `hash` en el confirm del reset. El `passwordHash` se **borra del objeto** antes de responder | `auth.service.ts:39,67,111,429`; borrado en `:80,117`; regla en `AGENTS.md:43` |
| **OTP de restablecimiento** | 6 dígitos con `randomInt` de `node:crypto`; se persiste **solo** `sha256(otp)` en hex de 64 caracteres; comparación con `timingSafeEqual` | [`src/modules/auth/password-reset.logic.ts`](src/modules/auth/password-reset.logic.ts) `:11-22,45-56` |
| **Allowlist de hosts salientes** | `PORTAL_BASE_URL` fijada a `webaloe.ulima.edu.pe` y `SYLLABUS_BASE_URL` fijada a `cactus.ulima.edu.pe`, con **predicados separados**; violarlas **impide el arranque** | [`src/config/env.ts`](src/config/env.ts) `:4-30,79,88` |
| **Parámetros salientes** | Lo único interpolado en una URL del portal son tres valores, los tres con regex anclada: COCICLO `^\d{5}$`, código de curso `^\d{4,6}$`, aula `^\d{4,8}$` (`assertAula`) | [`src/services/portal.client.ts`](src/services/portal.client.ts) `:29-34,188,235` |
| **Validación Zod en la frontera** | `validateJson` → `400 INVALID_JSON_BODY` / `400 INVALID_REQUEST_BODY` con `error.flatten()`; `validateQuery` → `400 INVALID_QUERY_PARAMS`; `validateParams` → `400 INVALID_ROUTE_PARAMS`. Ningún handler recibe datos sin parsear | [`src/shared/middleware/validate-dto.ts`](src/shared/middleware/validate-dto.ts) `:5-34` |
| **Validación de entorno** | 19 variables en un `envSchema` de Zod; las 3 obligatorias son `DATABASE_URL`, `JWT_SECRET` y `COHERE_API_KEY`. Fallo → `process.exit(1)` en el arranque | `env.ts:32-97`. Detalle en [Configuración y entorno](#-configuración-y-entorno) |
| **Errores** | Envelope uniforme `{ error: { code, message, details } }`; cualquier excepción no-`HttpError` sale como `500 INTERNAL_SERVER_ERROR` genérico. **Nunca se filtra un stack trace ni el mensaje original** | [`src/shared/middleware/error-handler.ts`](src/shared/middleware/error-handler.ts) `:4-29` |

#### Detalle: la devolución de cupo de portal-sync

El contador de `portalSyncRateLimit` **descuenta antes de trabajar**, para que cinco
importaciones simultáneas no se cuelen. Pero `refundPortalQuota` (`rate-limit.ts:64-67`)
devuelve **una** unidad cuando la respuesta sale `409` con `error.code === "PORTAL_LOGIN_REJECTED"`.

La razón está escrita en el propio archivo (`:52-63`): el passcode de RSA SecurID es de
6 dígitos y caduca cada 30 segundos, así que equivocarse es lo normal. Sin el reembolso,
cinco tipeos torpes dejaban al alumno bloqueado una hora sin haber importado nunca. Un
`502` **no** devuelve cupo —ahí sí se gastaron peticiones salientes contra la Universidad—
y si el cuerpo no es JSON tampoco, «el lado seguro».

#### Detalle: la política del OTP

| Constante | Valor | Significado |
|:---|---:|:---|
| `OTP_LENGTH` | 6 | Dígitos del código |
| `OTP_EXPIRATION_MINUTES` | 30 | Vigencia |
| `MAX_RESET_ATTEMPTS` | 5 | Intentos por token |
| `MIN_PASSWORD_LENGTH` | 8 | Longitud mínima de la contraseña nueva |

- **El OTP en claro nunca toca la base.** Se guarda `password_reset_token.token_hash varchar(64)`,
  el SHA-256 en hex. El correo lo lleva; la base solo el hash.
- **Orden de evaluación fijo** (`:45-56`): usado → expirado → intentos agotados → mismatch.
  Estados posibles: `ok | expired | already_used | too_many_attempts | mismatch`.
- **Anti-enumeración.** `/password-reset/request` responde **siempre 200** con el mismo texto
  genérico *«Si la cuenta existe, enviamos un código a tu correo institucional.»* (`auth.service.ts:47`),
  y `/confirm` responde **siempre** `400 INVALID_RESET_CODE` — *«Código inválido o expirado.»*
  (`:474`) sin distinguir cuál de los cinco estados ocurrió. Excederse en el límite de 3/hora
  tampoco cambia la respuesta: simplemente no se emite el código.
- **Enmascarado**: `maskEmail` (`:66-73`) deja hasta 4 caracteres del local-part, p. ej.
  `2023****@aloe.ulima.edu.pe`. Solo lo usa la variante autenticada `/request-me`.
- **Al confirmar**: rehash bcrypt + `token_version + 1` (cierra todas las sesiones vivas) +
  marca del token como usado.
- El envío por Resend **nunca propaga un fallo al cliente**: se loguea y ya. Ver
  [Integraciones externas](#-integraciones-externas).

Es la única máquina de estados del backend, y cabe en un diagrama: un token de reset vive en un
solo estado a la vez y los tres finales son terminales.

```mermaid
stateDiagram-v2
    [*] --> Emitido : POST /auth/password-reset/request o /request-me
    Emitido --> Emitido : OTP incorrecto, attempts + 1, estado mismatch
    Emitido --> Expirado : pasan los 30 minutos de OTP_EXPIRATION_MINUTES
    Emitido --> Agotado : attempts llega a 5, MAX_RESET_ATTEMPTS
    Emitido --> Usado : OTP correcto en POST /auth/password-reset/confirm
    Usado --> [*] : rehash bcrypt, token_version + 1, used_at
    Expirado --> [*]
    Agotado --> [*]
    note right of Emitido
      Orden de evaluacion fijo en password-reset.logic.ts lineas 46-53.
      Primero already_used, luego expired, luego too_many_attempts y por
      ultimo mismatch. Los cuatro caminos de fallo responden lo mismo,
      400 INVALID_RESET_CODE con el texto «Codigo invalido o expirado.»
      En la base solo vive el SHA-256 del OTP, token_hash varchar 64.
    end note
```

#### Detalle: dos allowlists, no una lista de dos hosts

```ts
export const PORTAL_ALLOWED_HOST = "webaloe.ulima.edu.pe";                                 // env.ts:7
export const isAllowedPortalBaseUrl = (v) => new URL(v).host === PORTAL_ALLOWED_HOST;      // env.ts:9-15
export const SYLLABUS_ALLOWED_HOST = "cactus.ulima.edu.pe";                                // env.ts:22
export const isAllowedSyllabusBaseUrl = (v) => new URL(v).host === SYLLABUS_ALLOWED_HOST;  // env.ts:24-30
```

El comentario de `env.ts:17-21` explica la decisión: *«si fueran una sola variable aceptando
dos hosts, cualquiera de los dos sistemas podría apuntarse al otro»*. Con dos variables, cada
una clavada a un host, eso es imposible. Está registrada como Decisión #9 aprobada por el
owner en `specs/features/portal-sync/portal-sync.spec.md:319`.

Tres detalles que importan:

- Se compara `.host`, **no `.hostname`**, así que un puerto distinto también se rechaza.
- Ambos predicados se enganchan como `.refine()` de la variable, o sea que un valor fuera de
  la allowlist **impide el arranque del proceso**, no falla en runtime.
- La cobertura está en [`test/HU31_jeff/env.portal-allowlist.test.ts`](test/HU31_jeff/env.portal-allowlist.test.ts): **14 casos, 7 por
  predicado**. Rechaza otro host, el sufijo-subdominio `…ulima.edu.pe.evil.com`, el truco de
  userinfo `…@evil.com`, un puerto distinto, una cadena que no es URL, y **el host de la otra
  variable**.

El motivo de fondo (`env.ts:4-6`): `POST /portal-sync/import` acepta cookies enviadas por el
cliente y hace peticiones salientes con ellas. El destino de esas peticiones no puede depender
de quien llama. Es SSRF de manual, y por eso el host es constante de código y no configuración.

### Las tres puertas que se cerraron

Esta es la mejor historia de seguridad del repositorio, y merece contarse completa.

Durante el desarrollo temprano el frontend todavía no tenía login, así que el middleware
aceptaba **atajos para trabajar sin credenciales**: bastaba mandar el código de alumno y el
backend te trataba como ese alumno. Funcionaba, nadie lo quitó, y llegaron a producción.
La auditoría de `DEUDA_TECNICA.md` (2026-06-15) los encontró y los marcó C1 y C2 —dos de los
once críticos—, con la nota transversal de que *«el módulo de autenticación y autorización
concentra varios de los críticos… Debe ser la prioridad #1»*.

| Vía eliminada | Qué permitía | Por qué existía | Evidencia |
|:---|:---|:---|:---|
| `?code=<código>` en query | Autenticarse como **cualquier** alumno sabiendo solo su código de 8 dígitos | Probar endpoints desde el navegador sin montar el login | `DEUDA_TECNICA.md:55`, `CAMBIOS_SPRINT0.md:47` |
| Header `X-User-Code` | Ídem, desde Postman o curl | Ídem, sin ensuciar la URL | `docs/agent_session/endurecimiento_seguridad.md:18` |
| Prefijo `Bearer dev-<código>` | Ídem, **activo en todos los entornos, sin ningún check de `NODE_ENV`** | Simular un token real sin tener que firmarlo | `DEUDA_TECNICA.md:40-44` (hallazgo C1) |
| `userId = 0` ante error de base (*fail-open*) | Suplantar al «usuario 0» provocando fallos de base de datos | El middleware degradaba en vez de denegar para que un corte de Neon no bloqueara la demo | `DEUDA_TECNICA.md:46-51` (C2) |
| Usuario sintético `id=0`, `code="00000000"` **con JWT firmado** en `loginWithGoogle()` y `me()` | Emisión de **tokens válidos** en la ruta de error | Mismo motivo: no romper la demo | `DEUDA_TECNICA.md:48-50` |

El código de hoy no las tiene. Lo único que queda de ellas es el comentario que las prohíbe,
en [`auth-middleware.ts`](src/shared/middleware/auth-middleware.ts) `:21-23`:

```ts
// Autenticación exclusivamente por JWT Bearer. No se aceptan códigos por
// query (`?code=`), header `X-User-Code` ni el prefijo `Bearer dev-`:
// esas vías permitían suplantar a cualquier usuario sin credenciales.
```

**Estado verificado el 2026-09-07** contra el código, no contra la documentación:

| Hallazgo | Estado |
|:---|:---|
| **C1** — bypass `Bearer dev-` (+ `?code=`, `X-User-Code`) | ✅ **CERRADO.** `auth-middleware.ts:22` solo lo menciona en el comentario que explica que está prohibido |
| **C2** — login *fail-open* con usuario mock `id=0` | ✅ **CERRADO.** No existe en `src/modules/auth/` ni en el middleware |
| **C3** — rutas sin `authMiddleware` | ✅ **CERRADO.** `grades` 2 aplicaciones, `section-management` 2, `course-detail` 3 |
| **C4** — SQL directo en `routes` | ⚠️ **PARCIAL.** `grades` y `section-management` ya no lo hacen; `course-detail.routes.ts` conserva **8** llamadas `db.execute` (líneas 63, 82, 119, 134, 178, 193, 207 y 264) |
| **CORS abierto** | ✅ **CERRADO en código** — `app-config.ts:28` lee `CORS_ORIGINS`; ⚠️ sin la variable cae a `*` |

Las reglas que sustituyeron a los atajos son **BR-AUTH-08** (solo `Authorization: Bearer <JWT>`)
y **BR-AUTH-09** (fallo seguro: un error de base en el camino de autenticación produce `500`
y **nunca** un token).

```mermaid
flowchart LR
    E1["query ?code=CODIGO"] --> X
    E2["header X-User-Code"] --> X
    E3["prefijo Bearer dev-CODIGO"] --> X
    E4["fail-open userId 0 ante error de BD"] --> X
    E5["usuario mock id 0 con JWT firmado"] --> X

    X["Eliminadas por BR-AUTH-08 y BR-AUTH-09"] --> V

    V["Unica via admitida hoy<br/>Authorization Bearer JWT<br/>HS256 mas tokenVersion contra app_user"]

    V --> R1["sin header, 401 MISSING_TOKEN"]
    V --> R2["firma, exp o claims invalidos, 401 INVALID_TOKEN"]
    V --> R3["tokenVersion desfasado, 401 revocado"]
    V --> R4["rol no permitido, 403 FORBIDDEN"]
    V --> R5["error de BD en auth, 500 INTERNAL_ERROR y jamas un JWT"]
```

### Limitaciones honestas

> **1 · El rate limit vive en un `Map` de proceso.** Los dos limitadores usan un
> `Map<studentId, {count, resetAt}>` declarado a nivel de módulo —`store` en
> [`rate-limit.ts`](src/shared/middleware/rate-limit.ts) `:9` y `portalStore` en `:49`, dos mapas distintos—. En Vercel
> serverless **cada instancia mantiene su propio contador**: los límites de 20/h y 5/h son
> **por instancia, no globales**, se multiplican con el escalado horizontal y se reinician en
> cada cold start. La propia spec lo admite (`portal-sync.spec.md:130`). No hay backend
> compartido —Redis, Postgres— para el contador. *(El uso del `Map` está verificado en el
> código; el efecto multi-instancia es inferencia sobre el modelo de ejecución de Vercel, no
> una medición nuestra.)* El límite de restablecimiento de contraseña es la excepción: ese sí
> se cuenta en la base y por tanto sí es global.
>
> Consecuencia práctica: el límite protege del abuso accidental —un cliente en bucle— pero
> no de alguien decidido a saltárselo.

> **2 · Sin `CORS_ORIGINS` el servidor responde `Access-Control-Allow-Origin: *`.**
> [`server.ts`](src/server.ts) `:19` hace `config.server.corsOrigins.length > 0 ? config.server.corsOrigins : "*"`.
> El fallback es deliberado —el comentario de `server.ts:14-15` dice que es «para no romper
> desarrollo»— pero **no hay ninguna guarda que lo fuerce cuando `NODE_ENV === "production"`**.
> Definir `CORS_ORIGINS` en Vercel es una acción manual pendiente desde el 2026-06-15
> (`CAMBIOS_SPRINT0.md:81`) y en el repositorio no hay evidencia de que se haya hecho.
> Mitigante real: la API es de token Bearer y no usa cookies de sesión, así que `*` no habilita
> CSRF con credenciales; lo que sí habilita es que cualquier origen web consuma la API con un
> token robado.

Otras dos que conviene tener presentes y se detallan en
[Deuda técnica y límites conocidos](#-deuda-técnica-y-límites-conocidos):
`POST /auth/login` no tiene rate limiting (bcrypt costo 10 encarece la fuerza bruta, pero no
hay bloqueo por intentos ni backoff), y el SSO de Google verifica firma, emisor y dominio del
correo pero **no la `audience`** —`new OAuth2Client()` se construye sin `clientId`
(`auth.service.ts:34`) y `verifyIdToken` se llama sin `audience` (`:137-139`)—. También:
el `catch` de `POST /auth/logout` solo loguea (`auth.service.ts:237-239`), así que un fallo de
base deja la sesión viva y el endpoint igual responde 200; es la única ruta de auth que no
falla en seguro.

---

## 🔗 Integraciones externas

El backend habla con **cinco sistemas externos**. Ninguno se toca desde un módulo de dominio:
todos pasan por un encapsulador en `src/services/` o en `src/shared/`. La regla no es
cosmética —permite inyectar dobles en las pruebas y, sobre todo, mantiene en un solo archivo
la traducción de «error de un tercero» a «error de nuestra API».

| Servicio | Para qué | Encapsulado en | Variables *(solo nombres)* | Si falta |
|:---|:---|:---|:---|:---|
| **Cohere** | Chat generativo del chatbot (`POST /v2/chat`, modelo `command-a-03-2025`), clasificación de intención (`POST /v1/classify`, modelo `embed-multilingual-v3.0`) y generación del título de la sesión | [`src/services/cohere.client.ts`](src/services/cohere.client.ts) — singleton `cohereClient`, `fetch` nativo, sin SDK | `COHERE_API_KEY`, `CHATBOT_RATE_LIMIT` | `COHERE_API_KEY` es **obligatoria** (`z.string().min(1)`, `env.ts:71`). Sin ella el parseo del entorno falla y `env.ts:96` ejecuta `process.exit(1)`: **no arranca el proceso entero**, no solo el chatbot |
| **Firebase Admin** (Auth + RTDB) | Firmar custom tokens del chat en vivo, escribir el espejo de membresía `/members`, leer los últimos mensajes para el chatbot y aplicar el borrado suave saltándose las reglas | [`src/services/firebase.service.ts`](src/services/firebase.service.ts) — singleton `firebaseService`; `firebase-admin` **pineada a `12.1.0`** | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL` | Las cuatro son opcionales con default `""` (`env.ts:67-70`): el backend arranca igual. Sin `projectId`/`clientEmail`/`privateKey`, `initialize()` avisa por consola y no inicializa; entonces `generateCustomToken`, `upsertChatMember` y `softDeleteChatMessage` **lanzan**, y `getRecentMessages` degrada a `[]` |
| **Resend** | Enviar el OTP de restablecimiento de contraseña por su API HTTP | [`src/shared/email/resend-client.ts`](src/shared/email/resend-client.ts) — función `sendPasswordResetEmail`, sin SDK | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`, `PASSWORD_RESET_MAX_PER_HOUR` | Sin `RESEND_API_KEY`: fuera de producción el OTP se imprime en consola con prefijo `[DEV ONLY]`; en producción se loguea un `console.error` y no se envía. **Nunca lanza hacia el llamador**, para no filtrar si la cuenta existe |
| **Google Identity** | Verificar el `idToken` de `POST /auth/google` y vincular `payload.sub` a `app_user.google_id` | Sin encapsulador propio: **inline** en [`src/modules/auth/auth.service.ts`](src/modules/auth/auth.service.ts) con `OAuth2Client` de `google-auth-library` | **Ninguna.** No existe `GOOGLE_CLIENT_ID` en el repositorio | No aplica: no hay configuración que falte. Token inválido → `401 INVALID_TOKEN`; dominio distinto de `@aloe.ulima.edu.pe` o `@ulima.edu.pe` → `403 INVALID_DOMAIN` |
| **miUlima / webaloe** | Login con credenciales y descarga de `layout.jsp`, consolidado de matrícula, récord académico, panel de delegados y logout | [`src/services/portal.client.ts`](src/services/portal.client.ts) — clase `PortalClient`, **el único servicio inyectable por constructor** | `PORTAL_BASE_URL`, `PORTAL_TIMEOUT_MS` | Ambas tienen default. Pero un `PORTAL_BASE_URL` fuera de la allowlist hace fallar el `.refine` y dispara `process.exit(1)` |
| **cactus** (Domino, sílabos) | Descargar la entrada de sílabo de cada curso desde la vista `vSyllabusXCicloAV` en JSON, reutilizando la **misma sesión SSO** | [`src/services/portal.client.ts`](src/services/portal.client.ts) — método `fetchSyllabus` | `SYLLABUS_BASE_URL` | Default `https://cactus.ulima.edu.pe`. Fuera de su allowlist propia → `process.exit(1)`. Un fallo en runtime degrada a `null`, nunca aborta la importación |

Detalle de arquitectura: [`src/services/index.ts`](src/services/index.ts) contiene literalmente `export {};`. No es un
barrel — cada consumidor importa el archivo del servicio directamente.

Dos notas sobre versiones y modelos:

- **`firebase-admin` está clavada en `12.1.0` sin caret** ([`package.json`](package.json) `:33`). Las v13/v14
  arrastran `jwks-rsa` → `jose` (ESM) y rompen Vercel con `ERR_REQUIRE_ESM`, porque el backend
  es `"type": "module"`. Está documentado en `specs/features/chat/chat.spec.md:51`. Subirla
  tumba producción **y la deja tumbada**: no hay deploy espejo.
- **El cliente de Cohere migró de v1 a v2.** El rol `system` reemplazó al viejo `preamble`, y
  `command-a-03-2025` dejó de servirse en `/v1/chat`. `classify` sigue en `/v1` porque v2 no
  tiene ese endpoint (`cohere.client.ts:92-95`). Dos métodos del cliente son **código muerto
  verificado**: `chat()` y `rerank()` no se invocan desde ningún punto de `src/`.

### Portal sync — importar el ciclo desde miUlima

Es la integración más interesante del proyecto y la que más superficie de riesgo tiene: el
alumno entrega credenciales de un sistema que no es nuestro, y el backend actúa en su nombre.

Dos endpoints, ambos bajo `authMiddleware` + `requireRole(...STUDENT_ROLES)`:

| Método | Ruta | Extra | Devuelve |
|:---|:---|:---|:---|
| `GET` | `/portal-sync/status` | — | `{ activePeriod, enrollmentsInActivePeriod, needsImport }` |
| `POST` | `/portal-sync/import` | `portalSyncRateLimit` — **5/h** | `{ period, identity, summary, warnings, token }` |

El body de `import` acepta `cookies` **XOR** `credentials`, garantizado por un `.refine` que
compara `(d.cookies === undefined) !== (d.credentials === undefined)`
([`portal-sync.schemas.ts`](src/modules/portal-sync/portal-sync.schemas.ts) `:36-42`). Se modeló con dos campos opcionales + refine en vez
de `z.union` para que el mensaje de error sea uno solo y legible. Ambos objetos llevan
`.strip()` **deliberado** (`:5,10,27`): cualquier cookie extra que mande el cliente se descarta
y **no se reenvía al portal**.

**El usuario del portal no viene del cliente.** Sale de `app_user.code` por
`repository.findUserCode(userId)` ([`portal-sync.service.ts`](src/modules/portal-sync/portal-sync.service.ts) `:72`); sin código →
`422 PORTAL_IDENTITY_UNVERIFIABLE`. La spec lo justifica en `portal-sync.spec.md:152-154`:
pedirlo al cliente *«agregaría una vía para suplantar a otro alumno»*.

#### El login contra webaloe

Cuatro pasos con un cookie-jar en memoria (`portal.client.ts:358-398`):

| Paso | Petición | Detalle |
|:---|:---|:---|
| 1 | `GET /portalUL/layout.jsp` | Sin sesión: fija `WASReqURL` y rebota a `inicio.jsp` |
| 2 | `POST /portalUL/j_security_check` | Form con `ac` (timestamp), `url2`, `j_username`, `j_password`; `Referer: inicio.jsp` |
| 2b | — | Si tras seguir redirecciones vuelve a `inicio.jsp` **sin** pasar por `solicitarValidarToken` → login rechazado |
| 3 | `POST solicitarValidarToken` | Form con `url2` y `sPasscode` (RSA SecurID). **Trampa:** un passcode rechazado devuelve **200 con la misma página y sin mensaje de error**; la redirección es el único criterio fiable de éxito |
| 4 | `GET /portalUL/layout.jsp` con `Referer: redirectJsp.jsp` | Verificación final: falla si la URL final contiene `inicio.jsp` o si el cuerpo no contiene `"Bienvenid"` |

> **1 · `redirectJsp.jsp` nunca se vuelve a pedir.** Es una página que solo lleva un
> `window.location.replace` a `layout.jsp`, y **volver a pedirla tumba la sesión recién
> creada**. El seguidor de redirecciones `chase` corta ahí y devuelve el cuerpo vacío
> (`portal.client.ts:341-345`). Máximo 8 saltos (`:335`).

> **2 · `409 PORTAL_LOGIN_REJECTED`, nunca 401.** Por dos razones escritas en el código
> (`portal.client.ts:72-88`): el `ApiClient` de la app Flutter trata cualquier 401 como
> expiración del JWT y cerraría la sesión de ULima++; y el mensaje **no distingue** si falló la
> contraseña o el passcode, porque *«distinguirlo le daría a un atacante una forma de verificar
> contraseñas contra el portal»*.

El cierre es un `try/finally` alrededor de `runImport`, y el `finally` llama `logout` **siempre**,
haya fallado o no (`portal-sync.service.ts:81-86`). `logout` es best-effort: un `fetchPage` dentro
de un `try {} catch {}` vacío.

#### Qué páginas se descargan

| # | Ronda | Ruta | Host | Se parsea con |
|---:|:---|:---|:---|:---|
| 1 | 1.ª, secuencial | `layout.jsp` | webaloe | `parseCicloActivo`, `parseAulaVirtual`, `parseHorario`, `parseInfoAcademica` |
| 2 | 2.ª, paralelo | `gama/servlets/ComandoMostrarConsMatr?COCICLO=<5díg>&Fg=1` | webaloe | `parseConsolidadoMatricula` |
| 3 | 2.ª, paralelo | `gada/servlets/ComandoListarRecordAcademico?ac=1` | webaloe | `parseRecordAcademico` |
| 4 | 3.ª, N en paralelo | `vSyllabusXCicloAV?ReadViewEntries&OutputFormat=JSON&Count=5&RestrictToCategory=<COCICLO>_<curso>` | **cactus** | `parseSyllabusEntry` |
| 5 | 4.ª | `av/servlets/ComandoListarCursosXOpcionAulaVirtualDelegado` | webaloe | `parseAulas` |
| 6 | 5.ª, M en paralelo | `av/servlets/ComandoListarAulaDelegadoAulaVirtual?prm_sNuAula=<4-8díg>` | webaloe | `parseDelegados` |
| 7 | última | `servlets/CustomLogoutServlet` | webaloe | — |

Dos páginas que **no** se piden, y el porqué: `ComandoIngresarAulaVirtualBBDelegado` devuelve un
frameset y el dato vive dos saltos más adentro; `gada/servlets/ComandoListarConsNotas` devuelve
`0` en todas las notas del ciclo en curso, lo que marcaría los cursos activos como
desaprobados (`portal-sync.spec.md:58`).

**Cookies por host, mínimo privilegio.** A webaloe van las tres —`JSESSIONID`, `LtpaToken2` y
`LtpaToken` si existe—; a cactus va **solo el LTPA** (`portal.client.ts:110-128`). Lo que
autentica a Domino es el LTPA con `Domain=.ulima.edu.pe`; `JSESSIONID` es la sesión de
WebSphere atada a webaloe, *«un navegador nunca la mandaría a otro host»*, y enviarla dejaría
el identificador de sesión vivo del alumno en logs y proxies de un segundo servidor.

**Semántica de `fetchPage`** (`:138-184`): `redirect: "manual"`; una 3xx cuyo `Location` case
`/inicio\.jsp|solicitarValidarToken/i` → `409 PORTAL_SESSION_INVALID`, cualquier otra 3xx o
status ≠ 200 → `502 PORTAL_UNAVAILABLE`; charset por defecto **ISO-8859-1**; y un cuerpo que
contenga `solicitarValidarToken` o `j_security_check` → `409` aunque el status fuera 200.
El `clearTimeout` va en un `finally` que envuelve **también** `res.arrayBuffer()`: `fetch`
resuelve al llegar las cabeceras, y desarmar el temporizador ahí dejaba la lectura del cuerpo
sin límite —un host que responde 200 y deja de emitir bytes colgaba la promesa para siempre—.

#### Los diez parsers

Viven en [`src/modules/portal-sync/parsers/`](src/modules/portal-sync/parsers), son **funciones puras sin dependencias** y
devuelven `ParseResult<T> = { ok: true, data } | { ok: false, reason }`. La excepción es
`parseSyllabusEntry`, que devuelve `T | null`.

| Parser | De qué página | Qué saca | Trampa que resuelve |
|:---|:---|:---|:---|
| `parseCicloActivo` | `layout.jsp` | `{ cocicloUrl, periodCode }` | La página trae **dos** ciclos y el anterior aparece **antes**. Se cruzan dos fuentes —`RestrictToCategory=(\d{5})_\d{4,6}` y el rótulo `CICLO:` en mayúsculas, **sin flag `i`**, porque la grafía es lo que lo distingue— y si discrepan devuelve `ok:false` en vez de adivinar |
| `parseConsolidadoMatricula` | consolidado | `{ studentCode, studentName, careerName, periodCode, rows[] }` | Es la **fuente de identidad**. La fila se ancla al encabezado de 3 celdas cuyo primer texto sea `^CÓDIGO$`. **Cero candidatas ⇒ fallo; más de una ⇒ fallo**: nunca elige |
| `parseAulaVirtual` | `layout.jsp` | `[{ courseCode, courseName, sectionCode, teacherName }]` | Es la **única fuente del nombre completo del curso** — récord y horario lo traen truncado a 20 caracteres. El docente llega como `APELLIDO / APELLIDO / NOMBRES` y se normaliza a `NOMBRES APELLIDOS` |
| `parseHorario` | `layout.jsp` | `[{ courseCode, dayOfWeek, startTime, endTime, classroom }]` | La tabla son **16 franjas × 6 días = 96 celdas** y el portal emite el atributo `title` en **las 96**, vacío en las libres: su sola presencia no indica clase. El aula se recorta a 100 caracteres porque `schedule_session.classroom` es `varchar(100)` y un valor largo abortaría el import entero |
| `parseRecordAcademico` | récord | `[{ periodCode, courseCode, courseName, attempt, credits, grade, sectionCode }]` | La celda `CICLO` **solo trae valor en la primera fila de cada grupo**; se arrastra el último valor no vacío. Nota válida solo si `^\d{1,2}$` y `0 ≤ n ≤ 20` |
| `parseInfoAcademica` | `layout.jsp` | `{ careerName }` | «Información General» e «Información por Período» tienen **marcado idéntico**: hay que anclarse al rótulo de texto y **nunca al orden de las tablas** |
| `parseImpedimentos` | `layout.jsp` | `{ hasImpediment, hasDebt, text }` | Nunca falla. **Hoy no lo invoca nadie** — ver más abajo |
| `parseSyllabusEntry` | JSON de Domino | `{ unid, fileName, url }` o `null` | Domino emite escapes **inválidos en JSON estricto** (`\!`, `\>`); `sanitizeJson` **elimina** la barra sobrante en vez de duplicarla, porque duplicarla produce JSON válido pero deja una barra literal que acaba percent-codificada en `drive_file_url` apuntando a un adjunto inexistente. `UNID_PATTERN = ^[0-9A-Fa-f]{1,120}$` exige la **forma** y no solo la longitud, porque el valor entra crudo en la URL persistida |
| `parseAulas` | sidebar de delegados | `[{ aula, courseCode, sectionCode }]` | Empareja `aNuAula`/`aCurs`/`aSecc` **por el subíndice explícito `[i]`, nunca por orden de aparición**: el JSP emite ramas condicionales y consumirlos en paralelo desplazaría en silencio todos los cursos posteriores, **escribiendo la nómina de un curso dentro de otro**. **Cero aulas ⇒ `ok:false`**, porque este portal devuelve la página de login con HTTP 200 |
| `parseDelegados` | nómina de una sección | `{ delegate?, subdelegate?, warnings? }` | El dato **no está en el texto de la celda**: código y nombre son inputs `readonly`, se leen por nombre completo del input porque conviven `prm_sCoUser_1` y `prm_sCoUser_10`. Se mira `checked` y **nunca `DISABLED`** —las 20 casillas observadas vienen deshabilitadas—. El aula pedida se confronta contra **dos** fuentes (`<title>` y el hidden `prm_sNuAula`) y basta que una discrepe para no escribir nada: sin eso, dos peticiones paralelas cruzadas escribirían los delegados de una sección en otra |

Los helpers de `html.ts` merecen una nota: `NAMED` es una **allowlist** de entidades derivada
de los fixtures reales —una entidad ausente se deja sin decodificar en vez de adivinarse— y
`stripTags` reemplaza cada etiqueta por **un espacio**, no por vacío, para no pegar textos
adyacentes.

#### La orquestación

`PortalSyncService.runImport` ([`portal-sync.service.ts`](src/modules/portal-sync/portal-sync.service.ts) `:88-525`) tiene cinco fases, y la
frontera entre ellas es la transacción:

**Fase 1 · Descargas** (fuera de la transacción). `layout.jsp` → `parseCicloActivo`; si falla,
`502` con «No se pudo determinar el ciclo en miUlima». Luego matrícula ‖ récord en paralelo.

**Fase 2 · Identidad, sin degradación, antes de escribir nada** (`:98-107`). Si
`parseConsolidadoMatricula` falla → `422`. Si `mat.data.studentCode !== app_user.code` →
**`403 PORTAL_IDENTITY_MISMATCH`**. La carrera del portal solo se **compara**: si difiere se
emite un warning `CAREER_MISMATCH` y **no se modifica nada**. La comparación normaliza
acentos, mayúsculas y espacios, porque el portal manda MAYÚSCULAS y ULima++ capitalización
normal — sin eso, **toda** importación emitía el warning.

**Fase 3 · Los parsers restantes degradan a warnings** (`:118-134`). Un `PARSER_FAILED` no
aborta nada.

**Fase 3.5 · Sílabos en paralelo** (`:143-183`), uno por **curso distinto** —no por fila de
matrícula—, cada uno con su `try/catch` vacío: «un sílabo perdido nunca aborta la importación».
Si se pidieron sílabos y ninguno llegó, se emite **una sola** advertencia agregada
`SYLLABUS_UNAVAILABLE`. Se decide con los hechos de la descarga y **no** con
`summary.syllabiUpserted`, porque con `on conflict do nothing` cero escrituras ya no significa
«no hay sílabos». El mensaje **no afirma una causa**: desde el backend no se distingue «no
publicado» de «cactus caído», «sesión Domino muerta» o «todo expiró».

**Fase 3.6 · Delegados, degradando por aula** (`:194-271`). Cada `fetchPage` y cada parseo van
en su propio `try`: un `Promise.all` a secas rechazaría entero al primer fallo y descartaría
los delegados de **todas** las secciones por una sola nómina caída. El `observedAt` se toma
**al recibir la respuesta**, no al insertar. Es una excepción explícita a la regla general de
que sesión inválida, portal caído o timeout abortan la importación.

**Fase 4 · Escrituras, todas dentro de UNA transacción** (`:273-495`).

**Fase 5 · Re-firma del JWT** (`:497-512`): se relee el cargo vigente sobre la base ya
confirmada y se llama `auth.reissueToken`. Se re-firma **siempre**, no solo al promover: al
empezar un ciclo nuevo el ex delegado no promueve nada, y con la condición vieja conservaba el
token de delegado hasta que venciera. *«La degradación importa tanto como el ascenso.»*

#### Qué se escribe en la base, y cómo se garantiza la idempotencia

Todo pasa por `repository.runInTransaction` — el service **nunca** abre una transacción.

| # | Tabla | Estrategia de idempotencia | Detalle que la hace correcta |
|---:|:---|:---|:---|
| 1 | `academic_period` | `on conflict (code) do update set is_active` | **Orden obligatorio**: primero desactivar el otro período, después insertar. `uq_academic_period_single_active` es un índice único **parcial y no diferible**: invertir el orden falla con `23505` en la primera importación de cada ciclo nuevo |
| 2 | `section_representative_claim` | `delete` de los períodos inactivos | Los datos de terceros **mueren con su ciclo**. Siempre excluye el período que se está importando |
| 3 | `academic_week` | `on conflict (period, week_number) do nothing` | Solo si el período se **creó**. La cantidad es `max(1, ceil(spanDías/7))`, **no un número fijo** |
| 4 | `teacher` | 3 pasos | Por `teacher_code`; luego por **conjunto de palabras** del nombre; luego insert con `on conflict` como red anti-carrera. El paso del medio existe porque las filas sembradas a mano no tienen código y la misma persona se insertaba de nuevo con el nombre en otro orden: en producción dejó **11 grupos duplicados** |
| 5 | `course` | `on conflict (code) do update` | El nombre **solo se actualiza si el entrante es más largo** — el récord lo trae truncado |
| 6 | `course_offering` | `do update set total_hours = greatest(...)` | `total_hours = max(1, ceil(créditos)) * 16` |
| 7 | `syllabus` | **`on conflict do nothing` SIN conflict target** | Sin target cubre **las dos** restricciones únicas, así un UNID repetido entre dos ofertas no lanza `23505` ni envenena la transacción. **Nunca pisa una fila existente**: las sembradas apuntan a Drive y sí se abren |
| 8 | `section` | `on conflict (offering, code) do update` | El docente **solo se pisa si el guardado es el placeholder** `PORTAL:SIN-DOCENTE`; `jp_id` **nunca** se toca |
| 9 | `section_representative_claim` | upsert **condicionado por `observed_at`** | `… do update … where excluded.observed_at > claim.observed_at`. Un cargo **ausente** se borra —revocación—; un cargo **descartado por dato inservible** ni se escribe ni se borra |
| 10 | `enrollment` | `do update set status='active', final_grade = coalesce(excluded…, …)` | El `RETURNING` se captura: la promoción necesita el `enrollment_id` |
| 11 | `section_representative` | `on conflict (enrollment_id) do update` | El target es **`enrollment_id` y no `(section_id, position)`**: ese UNIQUE es **plano**, una fila desactivada sigue ocupando el valor, y con el target equivocado la **segunda** importación del mismo delegado lanza `23505` y hace rollback de notas, horario y matrícula |
| 12 | `schedule_session` | `on conflict (section, day, start_time) do update` | Clave natural de **tres** columnas, sin `end_time`. El color se deriva del **código de curso** (FNV-1a de 32 bits sobre 12 colores), no de la sección, para que el mismo curso se pinte igual para todos y en todos los ciclos |
| 13 | `enrollment` (retiro) | `update … set status='withdrawn'` | Solo del período importado. Devuelve **`-1`** y no retira nada si dejaría **cero** matrículas activas: ambos logins exigen matrícula, y dejarlo en cero saca al alumno de la app sin forma de volver a importar |
| 14 | `student_course_progress` | `on conflict (student, curriculum_course) do update` | **Dos consultas para todo el récord** en vez de dos por curso — unas 90 de los ~115 viajes secuenciales. Usa `distinct on` porque `ON CONFLICT` falla con **`21000`** si la misma sentencia trae dos filas con la misma clave |
| 15 | `student` | `update student set current_level` | Ver abajo |
| 16 | `app_user` | `update … where full_name is null or btrim(full_name)=''` | **`institutional_email` nunca se toca**: es `NOT NULL UNIQUE` y es la clave del login con Google |
| 17 | `alert` | `delete … where title='Impedimento de matrícula'` | Solo toca filas del propio alumno; idempotente |

> **Un bug real que solo apareció contra el portal.** El 2026-09-02, en la primera importación
> real, Postgres rechazó una consulta con **`42809`**. Causa: la plantilla `sql` de Drizzle
> expande un arreglo JS como **constructor de fila**, no como arreglo — `all(${[1,2,3]})`
> renderiza `all(($1,$2,$3))`. La solución fue `string_to_array(${values.join(",")}, ',')::int[]`,
> un solo parámetro de texto con la consulta totalmente parametrizada
> ([`portal-sync.repository.ts`](src/modules/portal-sync/portal-sync.repository.ts) `:9-32`). **Ninguna prueba con dobles podía verlo.**

El **nivel del alumno** se calcula después del upsert de progreso y dentro de la misma
transacción, para ver lo que esa importación acaba de escribir: `findCycleCoverage` →
`levelFromCoverage` (el ciclo pendiente más bajo por encima del ciclo completo más alto) →
`levelNeverGoesDown`. Ese último recorte no es una licencia: en la primera importación real el
alumno cayó de nivel **8 a 1** porque de sus **52 obligatorios solo 26** tenían fila de
progreso —los otros 26 con códigos que no calzan por convalidaciones—. Si el cálculo baja, gana
lo guardado y se emite `LEVEL_REGRESSION_BLOCKED`.


#### Las horas del ciclo y la asistencia del Aula Virtual

Hasta el 2026-09-06 la importación no medía asistencia: la deducía. El **denominador**
(`course_offering.total_hours`) salía de `créditos × 16`, y el **numerador** —las tres columnas de
horas de `enrollment`— no lo escribía nadie: `RS-BE-4` lo prohibía expresamente y las 19 matrículas
del período activo estaban en `0` (verificado contra la base el 2026-09-06,
`attendance-risk.spec.md:22`). Ocho reglas nuevas cierran las dos puntas: `RS-BE-9` arregla el
denominador, `RS-BE-10`…`RS-BE-14` obligan a decir «no sé» cuando no hay dato, y `RS-BE-15` con
`RS-BE-16` traen el dato real desde el portal.

**`course.weekly_hours` y la migración `0010`.** El `16` nunca fue el problema: 2026-2 tiene
calendario publicado (`2026-08-24` → `2026-12-14`) y `academicWeekCount` da exactamente **16
semanas**, así que ese factor era correcto de casualidad. El error era el **otro** factor: usar los
créditos como si fueran horas semanales. PARADIGMAS son 3 créditos y **5 h/sem**: 80 h de ciclo, no
48. Un denominador corto **infla** el porcentaje de inasistencia y adelanta el umbral de impedido,
y ese umbral dispara correo académico a personas reales. De ahí la columna:
[`drizzle/0010_course_weekly_hours.sql`](drizzle/0010_course_weekly_hours.sql) agrega
`course.weekly_hours smallint` **nullable** con `chk_course_weekly_hours` (`NULL` o `> 0`),
reflejada en [`schema.ts`](src/db/schema/schema.ts)`:204-209`. Es aditiva e idempotente
(`ADD COLUMN IF NOT EXISTS` y el `DO $$ … EXCEPTION WHEN duplicate_object`) y se aplica con
**`db:apply`, no con `db:migrate`**: `drizzle/meta/_journal.json` tiene 9 entradas y termina en
`0009_avatar`, así que esta migración no figura en el journal y `db:migrate` nunca la ejecutaría.
Nació como `0009` y se renumeró cuando `main` publicó `0009_avatar.sql` con la rama sin pushear
(`b6218a8`): el cambio fue **solo de nombre de archivo**, la columna ya estaba en la base.

Quien la llena es [`src/db/seed/malla_horas.ts`](src/db/seed/malla_horas.ts)`:34-109`: **74 cursos**
del «Plan de estudios 2026-1» de Ingeniería de Sistemas, columna **TOT = TEO + PRA**, entre 2 y 6
h/sem. Mismo criterio que `course_equivalence` —dato de referencia extraído de un documento oficial
de la Universidad, no dato mock— y solo escribe esa columna: un código que no exista en la BD se
reporta y se omite. `NULL` significa «el curso no está en la malla cargada», **no** «cero horas», y
esa distinción es la que hace funcionar la precedencia.

**`total_hours` se resuelve en tres escalones.** La decisión vive en una sola función pura,
`resolveOfferingTotalHours` ([`portal-sync.repository.ts`](src/modules/portal-sync/portal-sync.repository.ts)`:120-136`),
y las tres fuentes difieren **solo** en de dónde sale el factor semanal — el otro factor son siempre
las semanas del período:

| # | `TotalHoursSource` | Factor semanal | Por qué está en ese orden |
|---:|:---|:---|:---|
| 1 | `schedule` | suma real de `schedule_session` de la sección | Es el horario que publica el **propio portal**: el dato más confiable que existe |
| 2 | `curriculum` | `course.weekly_hours` | El plan de estudios oficial. Cubre las ofertas que todavía no tienen horario importado |
| 3 | `credits` | `max(1, ceil(créditos))` | Mal proxy, **último recurso**: es el que subestimaba entre 20 % y 40 %. Llegar acá es una degradación, no el caso normal |

Un factor semanal en `0` o `null` **no es fuente**: cae al escalón siguiente en vez de fijar el total
en `0`. La razón es aguas abajo — `attendance-risk` descarta las secciones con `total_hours <= 0`, o
sea que un cero no deja la sección «sin horas» sino **fuera del listado del docente**.

La escritura ocurre en dos momentos del mismo import, y son distintos a propósito:

- **Paso 7** ([`portal-sync.service.ts`](src/modules/portal-sync/portal-sync.service.ts)`:411-418`).
  Todavía no existe el horario, así que solo compiten malla y créditos: `upsertCourse` devuelve
  `weekly_hours` en el mismo `RETURNING` con el que ya resolvía el `id` (`:555-562`, cero viajes
  extra) y `upsertOffering` (`:575-585`) guarda el total **ya resuelto** con
  `greatest(course_offering.total_hours, excluded.total_hours)`: ante una re-importación conserva el
  valor más alto.
- **Paso 8.b** (`portal-sync.service.ts:495-500` → `repository:597-619`). Recién después de cargar
  las sesiones existe el horario, así que `recomputeOfferingHoursFromSchedule` recalcula
  `horas_semana × semanas` con la suma real. Es el **único punto del módulo que pisa el valor** en
  lugar de usar `greatest`, incluso si da un número menor: el horario lo publica el portal. Entre
  secciones distintas de una misma oferta gana la **mayor** (`max()`), porque quedarse corto es el
  error caro.

Las ofertas escritas antes de `RS-BE-9` conservan su `créditos × 16` hasta que alguien vuelva a
importar, así que [`src/db/seed/backfill_total_hours.ts`](src/db/seed/backfill_total_hours.ts) las
corrige de una vez **importando la misma `resolveOfferingTotalHours`** (`:25,88`) en vez de
reimplementar la precedencia: backfill y runtime no pueden divergir. Solo toca el período con
`is_active = true`; las filas del 2026-1 cerrado vienen de una carga manual que nadie documentó y
son el único conjunto de contraste que existe, así que se dejan intactas.

**La asistencia real (`RS-BE-15`).** El portal publica, por curso, tres agregados en el panel
Asistencia del Aula Virtual, y esos tres mapean 1:1 con las tres columnas de `enrollment`. Se llega
por el mismo camino de dos saltos que la nómina de delegados
([`portal.client.ts`](src/services/portal.client.ts)`:64-81`): el sidebar
`ComandoListarCursosXOpcionAulaVirtualAsistencia` —que trae los mismos arrays JS `aNuAula`/`aCurs`/
`aSecc` y por eso lo parsea el **mismo `parseAulas`**, con el marcador `OpenAsistenciaAlumno`— y
después una página por aula. El servlet elegido es `…AsistenciaAulaVirtualAlumno`, que deduce al
alumno de la sesión; el vecino `…AsistenciaAulaVirtualCursos` **existe y acepta
`prm_sCoUserAlum=<código>`**, y no se usa precisamente porque pedir la asistencia de un tercero es
la superficie de IDOR que esta feature no toca.

Es una fase **hermana y secuencial** a la de delegados, no fusionada: fusionarlas llevaría el pico a
unas 10 peticiones concurrentes sobre un solo `JSESSIONID` de WebSphere y no hay medición de cómo
responde a eso. Degrada igual (`portal-sync.service.ts:298-343`): cada `fetchPage` y cada parseo en
su propio `try`, `ASISTENCIA_UNAVAILABLE` si no se pudo **descargar** y `PARSER_FAILED` si llegó y
no se entendió, y un fallo acá **nunca** aborta la importación — la asistencia es secundaria y no
puede tumbar notas, horario ni matrícula.

La escritura va **dentro del bucle de matrícula** (`:464-483`), no en un paso aparte: es el único
punto donde ya existe el `enrollment.id`. Tres decisiones la definen:

| Decisión | Por qué |
|:---|:---|
| Se valida en JS antes de tocar la BD (`resolveAttendanceHours`, `repository:155-170`) | `chk_enrollment_attendance_hours` (`attended + absent <= total`) se evalúa al cerrar **cada statement** y no admite `DEFERRABLE`; el import entero corre en **una** transacción, así que un `23514` acá haría rollback de matrícula, horario, notas y progreso. La comparación es en **centésimas enteras** para que `0.1 + 0.2 > 0.3` no rechace un triple legítimo |
| **Un solo `UPDATE`** con las tres columnas y el `WHERE` repitiendo la condición del CHECK (`repository:634-652`) | Escribir `attended` por separado, con `total` todavía en el `DEFAULT '0'`, violaría el CHECK en ese mismo statement. El `WHERE` es el cinturón: un triple incoherente actualiza **0 filas** y el service lo cuenta como omitido (`attendanceSkipped`) en vez de reventar la transacción |
| Es **asignación**, no `greatest` ni acumulación | El portal publica el acumulado a la fecha y el docente puede corregir una marca: este es el **único upsert del módulo que debe poder bajar**. La idempotencia sale gratis |

`total <= 0` se rechaza a propósito, y si el portal no reportó un curso la fila **no se toca**: nunca
se escribe un `0` por ausencia. `enrollment.total_hours = 0` es el centinela de «nunca se escribió
asistencia», y ponerlo convertiría al alumno en `sin_datos` **borrando un impedido legítimo**. Por lo
mismo el parser tiene prohibido derivar `absent = programadas − asistidas`: con los datos reales de
la semana 2 daría 87,5 % de inasistencia y los cinco cursos saldrían `impedido`, con
`notifyStudents` mandando alertas a alumnos de verdad. Y el `total` sale de «Total horas
programadas» de esa misma página, no de `course_offering.total_hours`: así los tres números son
aritmética interna del portal y el CHECK es inviolable por construcción. Como validación cruzada,
ese «Total horas programadas» coincide **5 de 5** con las horas resultantes de `RS-BE-9`
(`asistencia-portal.spec.md:47`): dos fuentes independientes que dan lo mismo.

**`sin_datos` y `horasTranscurridas`: las dos deshonestidades simétricas.** Son la misma mentira
mirada desde cada punta, y por eso se arreglan juntas.

`sin_datos` (`RS-BE-10`) es un cuarto estado de riesgo que **no es un grado de riesgo**: es la
ausencia de dato ([`attendance-risk.types.ts`](src/modules/attendance-risk/attendance-risk.types.ts)`:1-7`).
`classifyStudent` (`attendance-risk.service.ts:27-47`) lo devuelve —con `absencePercentage: null`—
cuando la matrícula no tiene horas (`enrollment.total_hours <= 0`) o cuando la sección no tiene
denominador. Antes, ambos casos caían en `normal` con 0 %, que es exactamente la lectura opuesta a
la real: el `CHECK` garantiza que toda fila con dato tiene `total > 0`, así que ese cero es **prueba
de ausencia, no de perfección**. `computeSummary` (`:104-111`) lo cuenta aparte y **no lo suma a
`normal`**, y `notifyStudents` (`:170-182`) salta esas matrículas y, si no notificó a nadie, lo dice
con nombre y número (`:217-218`) — el mensaje al alumno dice «estás a N faltas del límite» y sin
dato ese N sería inventado. Hacia el cliente la señal es la bandera **positiva**
`asistenciaDisponible` ([`schedule.types.ts`](src/modules/schedule/schedule.types.ts)`:29`,
`course-detail.routes.ts:96`): mirando solo los números nadie puede distinguir «0 faltas» de «nunca
se midió», y ese 0 se pintaba como una dona verde llena.

`horasTranscurridas` (`RS-BE-16`) es la misma mentira invertida. Con asistencia real cargada, un
cliente que divida `asistido / total` compara lo dictado hasta hoy contra el **ciclo entero**: en la
semana 2 daría `8/64 = 12,5 %` y el alumno leería «asististe al 12,5 %». El campo es **derivado, no
una columna nueva** —`attended_hours + absent_hours`, calculado en el service
(`schedule.service.ts:188`, `course-detail.routes.ts:97`, tipado en `schedule.types.ts:37`)— y sobre
él se calcula el porcentaje: `8/8 = 100 %`, y las faltas aparecen apenas existan. En el horario
**docente** los tres números van en `0` con `asistenciaDisponible: false` (`schedule.service.ts:312`)
porque esa fila es una **sección** y la asistencia de este esquema es por **matrícula**: no hay dato
que reportar, y decirlo es más honesto que agregarlo.

> ⚠️ **Nadie ha visto todavía una fila de inasistencia.** Las 21 filas de los 5 fixtures reales
> tienen una sola marca y los cinco agregados dicen `0 horas / 0 %`. El diseño esquiva el
> vocabulario negativo leyendo agregados en vez de marcas, pero **no** esquiva el formato del
> agregado con faltas reales: si el JSP emite algo que el regex no reconoce, el parser falla
> exactamente para los alumnos que tienen faltas, que son los que importan. La mitigación
> comprometida es re-sondear hacia la semana 6 y ajustar con esa muestra
> (`asistencia-portal.spec.md`, §Cobertura conocida y sesgada). Hasta entonces esta cobertura es
> **parcial y sesgada**, y así debe leerse.


#### El punto clave: qué NO se guarda

| Categoría | Evidencia |
|:---|:---|
| **La contraseña de miUlima** | Vive solo en la variable local del login. `portal.client.ts:351-357`: *«`password` y `passcode` se usan y se descartan: no se registran en ningún log, no se persisten y no aparecen en ningún mensaje de error»*. `portal-sync.spec.md:148-151` lo eleva a regla: *«Nunca se persisten: no van a la base de datos, ni a caché, ni a disco.»* |
| **El passcode TOTP** | Ídem. Solo se valida su forma `^\d{6,8}$` antes de tocar el portal |
| **El usuario del portal** | No se pide en el body: sale de `app_user.code` |
| **Las cookies del portal** | Solo en memoria durante la petición — **RS-BE-7**, `portal-sync.spec.md:89`. El cuerpo de cada salto de redirección «nunca se devuelve al cliente» |
| **Las cookies extra que mande el cliente** | Descartadas por el `.strip()` de Zod, **no se reenvían al portal** |
| **El body del request en logs** | `portal-sync.controller.ts:21-22` lo prohíbe explícitamente porque lleva cookies o la contraseña |
| **El HTML y los cuerpos del portal en los errores** | `portalFailure` **nunca** propaga el error original —«puede llevar cabeceras o cuerpo del portal»— y el mensaje de `DELEGADOS_UNAVAILABLE` «nunca lleva fragmentos del HTML del portal» |
| **Las filas de la nómina que no son las 2 marcadas** | Se leen todas en memoria porque no hay otra forma de saber cuáles están marcadas, pero **solo se persisten esas 2** (RQ-5/RS-21) |
| **Los datos de terceros más allá del ciclo** | `deleteClaimsOfInactivePeriods` los barre en la primera importación del ciclo siguiente |
| **La carrera del portal** | Solo se **compara**, nunca se escribe |
| **`institutional_email`** | Nunca se toca |
| **Boletas, cuenta corriente, DNI, dirección, celular, fecha de nacimiento, brevete, carné, datos vehiculares, buzón** | Fuera de alcance explícito, `portal-sync.spec.md:286` |
| **La fecha de última sincronización** | No se persiste; `needsImport` se deriva de la matrícula |
| **Los cursos de ciclos pasados** | No crean `section`, `enrollment` ni `course`; solo alimentan `student_course_progress` |

⚠️ Dos asuntos abiertos que la propia spec deja registrados y que no se cierran leyendo código:
el **procedimiento de borrado de los datos importados a pedido del alumno** —requisito de la
Ley 29733, `portal-sync.spec.md:333`— y la **autorización escrita del área de Sistemas de la
Universidad** para que una app reciba cookies de sesión del portal institucional
(`portal-sync.spec.md:295`). No hay constancia de ninguno de los dos en el repositorio.

#### Diagrama · importación del portal

```mermaid
sequenceDiagram
    autonumber
    actor Alumno
    participant App as App Flutter
    participant MW as authMiddleware y portalSyncRateLimit
    participant Svc as PortalSyncService
    participant PC as PortalClient
    participant W as webaloe portalUL
    participant CA as cactus Domino
    participant PG as PostgreSQL Neon

    Alumno->>App: Sincronizar mi ciclo
    App->>MW: POST /portal-sync/import con Bearer JWT
    MW->>PG: select token_version from app_user
    MW->>MW: requireRole STUDENT_ROLES y cupo 5 por hora, descuenta antes de trabajar
    MW->>Svc: importFromPortal, body validado con cookies XOR credentials

    alt el body trae credentials
        Svc->>PG: findUserCode del JWT
        Note over Svc,PC: el usuario del portal sale de app_user.code, jamas del cliente
        Svc->>PC: login con userCode, password y passcode
        PC->>W: GET layout.jsp sin sesion
        PC->>W: POST j_security_check
        PC->>W: POST solicitarValidarToken con sPasscode
        Note over PC: un passcode rechazado devuelve 200 sin mensaje, la redireccion es la unica senal fiable
        PC->>W: GET layout.jsp, redirectJsp.jsp jamas se repite
        PC-->>Svc: JSESSIONID, LtpaToken2 y LtpaToken opcional
    else el body trae cookies
        Svc->>Svc: usa las cookies del cliente, las claves extra ya fueron descartadas
    end

    Svc->>PC: fetchPage layout.jsp
    PC->>W: GET con las tres cookies, ISO-8859-1
    Svc->>Svc: parseCicloActivo cruza dos fuentes del ciclo

    par matricula y record
        PC->>W: GET ComandoMostrarConsMatr
    and
        PC->>W: GET ComandoListarRecordAcademico
    end

    Svc->>Svc: parseConsolidadoMatricula, fuente de identidad
    alt studentCode distinto de app_user.code
        Svc-->>App: 403 PORTAL_IDENTITY_MISMATCH sin escribir nada
    end

    par N silabos, uno por curso distinto
        PC->>CA: GET vSyllabusXCicloAV en JSON, SOLO cookies LTPA
        CA-->>PC: entrada de silabo o degrada a null
    end

    PC->>W: GET sidebar de delegados
    par M nominas, cada una con su propio try
        PC->>W: GET nomina con prm_sNuAula validado
    end
    Note over Svc: degrada POR AULA, un aula caida no borra los delegados de las demas

    Svc->>PG: runInTransaction, TODAS las escrituras en una sola transaccion
    PG-->>Svc: commit o rollback completo
    Svc->>PG: findActiveRepresentativePosition sobre la base ya confirmada
    Svc->>Svc: reissueToken, se re-firma SIEMPRE, la degradacion importa tanto como el ascenso
    Svc->>PC: logout en el finally, best effort
    Svc-->>App: period, identity, summary, warnings y token
```

### Chatbot — clasificador, contexto y Cohere

Cinco endpoints bajo `/chatbot`, todos con `authMiddleware` + `requireRole("student", "delegate", "subdelegate")` — literales, no la constante.
Solo `POST /chatbot/sessions/:id/ask` lleva `chatbotRateLimit`.

**Guardrails de entrada** ([`chatbot.controller.ts`](src/modules/chatbot/chatbot.controller.ts) `:5-11,66-75`): `question` de 1 a 500
caracteres, y cinco patrones anti prompt-injection —`/<context>/i`, `/\[CONTEXTO\]/i`,
`/\[DATOS_/i`, `/^system:/im`, `/^assistant:/im`—. Cualquier coincidencia →
`400 INVALID_QUESTION` con «La pregunta contiene caracteres no permitidos.»

**El pipeline de `ask`** ([`chatbot.service.ts`](src/modules/chatbot/chatbot.service.ts) `:43-138`):

1. `findSessionById(sessionId, studentId)` — **la propiedad es parte del `WHERE`**, no un
   chequeo posterior. Si no aparece → `404 SESSION_NOT_FOUND`.
2. Se persiste el mensaje del alumno **antes** de llamar a Cohere.
3. **Clasificación de intención.**
4. `Promise.all` de **siete fuentes de contexto**: seis gateadas por intent, una siempre.
5. `buildContext` arma `{ preamble, message }`.
6. `chatWithHistory` con `AbortController` de **8 000 ms**, `temperature 0.3`, `max_tokens 1000`,
   y los **últimos 10 turnos** del historial.
7. Se persiste la respuesta. Si era la primera pregunta de la sesión, `generateTitle` en un
   `try/catch` vacío que conserva «Nueva conversacion» si falla.

**El clasificador** ([`intent-classifier.ts`](src/modules/chatbot/intent-classifier.ts)) tiene siete intents —`grades`, `schedule`,
`curriculum`, `alerts`, `announcements`, `classmates`, `chat`— y dos caminos:

- **Primario**: `POST /v1/classify` con **25 ejemplos etiquetados** hardcodeados. Se aceptan
  **todas** las etiquetas con `confidence > 0.3`.
- **Fallback**: `classifyByKeywords`, un `includes` sobre un mapa de palabras clave. Si ningún
  intent coincide, devuelve por defecto `["schedule","grades","curriculum"]`.
- **La carrera contra el reloj**: `Promise.race` entre Cohere y un `setTimeout` de
  **`CLASSIFY_TIMEOUT_MS = 500`** ms que **resuelve** —no rechaza— con el fallback de keywords.
  La promesa de Cohere sigue viva, pero su resultado se descarta. Medio segundo de latencia es
  el techo que se aceptó pagar por clasificar bien.

**Los siete contextos que puede leer:**

| Intent | Gateado | Fuente | Límites |
|:---|:-:|:---|:---|
| `schedule` | Sí | PostgreSQL + `ScheduleService` | Horario del período activo con matrícula `active`. Evaluaciones **filtradas a `[semana-1, semana+1]`**; sin semana actual, se pasan todas |
| `curriculum` | Sí | PostgreSQL | `curriculum_course` ⟕ `student_course_progress`, orden `cycle, display_order`. **Sin LIMIT** |
| `alerts` | Sí | PostgreSQL | `ORDER BY created_at DESC LIMIT 20` |
| `announcements` | Sí | PostgreSQL | Anuncios activos de sus secciones, `LIMIT 20` |
| `classmates` | Sí | PostgreSQL | `DISTINCT` nombre + etiqueta de cargo, **excluye al propio alumno**, `LIMIT 50`. **Solo nombres y rol, ningún dato de contacto** |
| `grades` | Sí | PostgreSQL | `student_score` de la matrícula activa, **incluyendo evaluaciones sin nota** por `LEFT JOIN`, para poder calcular cuánto falta |
| `grades` · simulación | Sí | **Body del request** (`localGrades`) | **No se persiste**: solo entra al contexto |
| `chat` | **No — siempre** | Firebase RTDB | Últimos **200 mensajes** por sección; las secciones se filtran por código, nombre completo o tokens del nombre de más de 3 letras, con fallback a las 3 primeras |

> **Notas oficiales contra simulación.** La regla 9 del system prompt es explícita: las notas
> oficiales de la base son **la única verdad**; la «SIMULACION NO OFICIAL» son escenarios de la
> calculadora del alumno que solo se usan si pregunta un «qué pasaría si». El resumen se calcula
> en el backend con la lógica pura ya probada de `alerts.logic.ts` —`PASSING_GRADE = 10.5`— y
> llega al prompt como **texto plano ya calculado**, con las líneas «Promedio actual», «Peso ya
> calificado» y «Para aprobar»: el modelo no hace aritmética.

> **No se usa Cohere Rerank.** Se mandan todos los mensajes leídos al LLM
> (`chatbot.spec.md:79`). Reduce latencia y costo y elimina el riesgo de perder mensajes por
> puntuaciones bajas. `CohereClient.rerank` sigue en el archivo, sin llamadores.

**Persistencia**: `chatbot_session` (uuid, `student_id → student ON DELETE CASCADE`, `title`
default «Nueva conversacion») y `chatbot_message` (uuid, `session_id → chatbot_session ON DELETE
CASCADE`, `role varchar(10)`, `content text`). El borrado en cascada de los mensajes lo hace la
FK, no una sentencia explícita. `deleteSession` lleva `student_id` en el `WHERE` y usa
`rowCount > 0` como respuesta.

⚠️ El esquema Drizzle declara `role varchar(10)` **sin `CHECK`**, aunque `chatbot.spec.md:321`
pide `CHECK (role IN ('user','assistant'))`. Hoy el valor solo lo garantiza el tipo de
TypeScript. Y la regla BR-CB-10 de la spec —descartar la respuesta de Cohere si menciona datos
de otro alumno— **no está implementada**: la respuesta se persiste sin inspección.

**Errores**: el mensaje crudo de Cohere **nunca llega al cliente**. Va a `console.error` y se
traduce a `503 CHATBOT_UNAVAILABLE` con «Estoy teniendo dificultades tecnicas en este momento».

#### Diagrama · consulta al chatbot

```mermaid
sequenceDiagram
    autonumber
    actor Alumno
    participant App as App Flutter
    participant MW as authMiddleware y chatbotRateLimit
    participant Ctl as ChatbotController
    participant Svc as ChatbotService
    participant PG as PostgreSQL Neon
    participant CO as Cohere api.cohere.com
    participant FB as Firebase RTDB

    Alumno->>App: Cuanto me falta para aprobar
    App->>MW: POST /chatbot/sessions/id/ask con Bearer JWT
    MW->>PG: select token_version from app_user
    MW->>MW: requireRole y cupo CHATBOT_RATE_LIMIT por hora, default 20
    alt cupo agotado
        MW-->>App: 429 RATE_LIMITED con retryAfterMinutes
    end
    MW->>Ctl: ask
    Ctl->>Ctl: question de 1 a 500 chars y cinco patrones anti prompt injection
    alt patron detectado
        Ctl-->>App: 400 INVALID_QUESTION
    end
    Ctl->>Svc: ask con sessionId y studentId

    Svc->>PG: findSessionById, el studentId va en el WHERE
    alt la sesion no es del alumno
        Svc-->>App: 404 SESSION_NOT_FOUND
    end
    Svc->>PG: saveMessage rol user y touchSession

    Svc->>CO: POST /v1/classify con 25 ejemplos, modelo embed-multilingual-v3.0
    alt Cohere responde antes de 500 ms
        CO-->>Svc: etiquetas con confidence mayor a 0.3
    else timeout de 500 ms o error
        Svc->>Svc: classifyByKeywords, por defecto schedule, grades y curriculum
    end

    par intents gateados
        Svc->>PG: horario, evaluaciones de semana mas menos 1, malla, alertas, anuncios, companeros y notas oficiales
    and el chat se lee SIEMPRE
        Svc->>PG: secciones activas del periodo activo
        Svc->>FB: getRecentMessages con limite 200 por seccion
        Note over Svc,FB: si Firebase falla en una seccion, console.warn y sigue con la siguiente
    end

    Svc->>Svc: summarizeOfficialGrades calcula promedio, peso calificado y cuanto falta para 10.5
    Svc->>Svc: buildContext, preamble de 10 reglas y message por bloques
    Svc->>CO: POST /v2/chat command-a-03-2025 con AbortController de 8000 ms
    alt Cohere responde
        CO-->>Svc: texto de la respuesta
    else timeout o error de Cohere
        Svc->>Svc: console.error, el detalle jamas sale al cliente
        Svc-->>App: 503 CHATBOT_UNAVAILABLE
    end

    Svc->>PG: saveMessage rol assistant y touchSession
    alt es la primera pregunta de la sesion
        Svc->>CO: generateTitle con temperature 0.7 y max_tokens 50
        Svc->>PG: updateSessionTitle, si falla se conserva Nueva conversacion
    end
    Ctl-->>App: 200 con X-RateLimit-Remaining y X-RateLimit-Reset
```

### Chat en vivo — el puente de autenticación con Firebase

El chat de sección no pasa por el backend: los mensajes viajan cliente ↔ Firebase Realtime
Database. Lo que el backend hace es **decidir quién puede entrar** y dejarlo escrito donde las
reglas de RTDB puedan verlo.

`POST /chat/token` lleva `authMiddleware` pero **no `requireRole`** —alumnos y docentes usan la
misma ruta— y la autorización real la hace el controller
([`chat.controller.ts`](src/modules/chat/chat.controller.ts) `:10-51`):

1. **Fuente según el rol del JWT**: `role === "teacher"` → `findTeacherParticipant(teacherId, sectionId)`;
   cualquier otro → `findStudentParticipant(studentId, sectionId)`. Si falta el identificador
   correspondiente, el participante es `null` **sin tocar la base**.
2. **`canIssueToken(participant, requestUserId)`** ([`chat.logic.ts`](src/modules/chat/chat.logic.ts) `:79-83`):
   `participant != null && participant.userId === requestUserId`. Es un **type guard**, así que
   el compilador garantiza que después de la guarda no hay `null`. Falla →
   `403 CHAT_SECTION_FORBIDDEN`, «anti-suplantación por parámetro».
3. **El espejo de membresía se escribe ANTES de firmar el token.** El orden importa: las reglas
   de RTDB gatean la lectura por la existencia y vigencia del nodo `members`. Si se rechaza la
   petición, **no se escribe nada**.
4. **`createCustomToken(uid, claims)`** con `uid = String(app_user.id)` y claims
   `{ role, sectionId, moderator, weight }`.

**El espejo** se escribe con `.set()` en `members/{sectionId}/{uid}`
([`firebase.service.ts`](src/services/firebase.service.ts) `:81-91`):

| Campo | Valor |
|:---|:---|
| `displayName` | `app_user.full_name` |
| `role` | `student` · `delegate` · `subdelegate` · `teacher` · `jp` |
| `roleLabel` | Etiqueta legible |
| `moderator` | booleano |
| `weight` | número |
| `updatedAt` | `Date.now()` |
| `expiresAt` | **`Date.now() + 60 * 60 * 1000`** — una hora |

`expiresAt` es lo que las reglas comparan contra `now`: la membresía **caduca en una hora** y el
cliente debe volver a pedir `POST /chat/token`. **El backend es el único que escribe
`/members`** —la regla pone `".write": false` en ese subárbol y el Admin SDK se salta las
reglas—. No hay Cloud Functions: el proyecto está en plan Spark.

**Derivación de rol, peso y moderador** ([`chat.logic.ts`](src/modules/chat/chat.logic.ts)):

| Rol | Etiqueta | Peso | ¿Moderador? |
|:---|:---|---:|:-:|
| `teacher` | Profesor | 100 | sí |
| `jp` | Jefe de Práctica | 90 | sí |
| `delegate` | Delegado | 70 | sí |
| `subdelegate` | Subdelegado | 60 | sí |
| `student` | Alumno | 10 | no |

El rol de alumno sale de `position ?? "student"`, y la consulta ordena
`delegate → subdelegate → resto` con `LIMIT 1`: **gana el cargo más alto**. El rol de docente se
deriva por `CASE`: `teacher` si `sec.teacher_id` coincide, `jp` si coincide `sec.jp_id`.

> **`moderator` es solo presentación.** Pinta el badge y el estilo de la burbuja. **No habilita
> borrar mensajes**: eso es exclusivo del profesor titular (R-CHAT-4). El borrado tiene triple
> guarda —participante no nulo, `userId` coincidente y `role === "teacher"`— y **excluye
> explícitamente al JP**. Además es **suave**: `ref.update({ deleted: true, deletedBy, … })` deja
> una lápida que el cliente renderiza como «eliminado por …», nunca borra el nodo.

Las reglas de RTDB viven en el repositorio de frontend (`database.rules.json`), no aquí, pero
cierran el círculo: raíz `deny-by-default`; cada uno solo se ve a sí mismo en `/members` y solo
mientras no expire; leer mensajes exige membresía vigente; escribir es **solo-crear**
(`!data.exists() && newData.exists()`), con validación de que `senderId == auth.uid` y de que
nombre, rol, etiqueta, `moderator` y `weight` **coincidan exactamente con el espejo** —el cliente
no puede inventarse un rol ni un peso—, `body` de 1 a 4000 caracteres y ningún campo extra.

#### Diagrama · obtención del token de chat

```mermaid
sequenceDiagram
    autonumber
    actor U as Alumno o Docente
    participant App as App Flutter
    participant MW as authMiddleware
    participant Ctl as ChatController
    participant PG as PostgreSQL Neon
    participant FS as firebaseService
    participant FA as Firebase Auth Admin
    participant DB as Firebase RTDB

    U->>App: Abrir el chat de mi seccion
    App->>MW: POST /chat/token con Bearer JWT y sectionId
    MW->>PG: select token_version from app_user, Single Active Session
    alt tokenVersion no coincide
        MW-->>App: 401 INVALID_TOKEN
    end
    Note over MW,Ctl: POST /chat/token NO lleva requireRole, alumnos y docentes comparten la ruta
    MW->>Ctl: createFirebaseToken con userId, role y studentId o teacherId

    alt role igual a teacher
        Ctl->>PG: findTeacherParticipant, section join teacher donde teacher_id o jp_id coinciden
        PG-->>Ctl: user_id, full_name y section_role teacher o jp
    else cualquier otro rol
        Ctl->>PG: findStudentParticipant, enrollment activo left join section_representative
        Note over Ctl,PG: order by delegate 0, subdelegate 1, resto 2 con limit 1, gana el cargo mas alto
        PG-->>Ctl: user_id, full_name y position o null
    end

    Ctl->>Ctl: canIssueToken, participante no nulo y su userId igual al del JWT
    alt no autorizado
        Ctl-->>App: 403 CHAT_SECTION_FORBIDDEN, anti suplantacion por parametro
        Note over Ctl,DB: al rechazar NO se escribe el espejo de membresia
    end

    Note over Ctl,DB: el espejo se escribe ANTES de firmar el token
    Ctl->>FS: upsertChatMember
    FS->>DB: set en members sectionId uid con expiresAt a una hora
    Ctl->>FS: generateCustomToken con claims role, sectionId, moderator y weight
    FS->>FA: createCustomToken
    FA-->>Ctl: custom token de Firebase
    Ctl-->>App: token, uid, displayName, role, roleLabel, isModerator y weight

    App->>FA: signInWithCustomToken
    FA-->>App: sesion con auth.uid igual a app_user.id
    App->>DB: leer sections sectionId messages
    Note over DB: la regla exige membresia vigente con expiresAt mayor que now
    App->>DB: crear un mensaje
    Note over DB: escritura solo crear, senderId igual a auth.uid, rol peso y nombre deben coincidir con el espejo
    App-->>U: chat en vivo de la seccion
```

### Contradicciones conocidas entre spec y código

Se listan aquí porque copiarlas propagaría el error:

| Spec | Afirma | Realidad verificada |
|:---|:---|:---|
| `portal-sync.spec.md:53` | Se lee `ul/servlets/ComandoVisualizarDatosPersonales` | **No existe** en `PORTAL_PATHS`. El nombre completo sale del consolidado de matrícula |
| `portal-sync.spec.md:269` | Se hace *upsert* de una alerta «Impedimento de matrícula» | El código hace lo **contrario**: la **borra**. `parseImpedimentos` ya no se invoca desde la importación —retiro deliberado del 2026-09-04—, y `summary.alertsCreated` queda siempre en 0 |
| `chatbot.spec.md:65` | El intent `grades` se alimenta del body (`localGrades`) | Se invirtió: las notas **oficiales** de PostgreSQL son «la única verdad» y `localGrades` quedó degradado a «SIMULACION NO OFICIAL» |
| `chatbot.spec.md:115-145` | El system prompt tiene 8 reglas | Tiene **10**: las reglas 9 y 10 se agregaron después |
| `chatbot.spec.md:344` | `chat-search.ts` combina RTDB **+ Cohere Rerank** | `chat-search.ts` **no importa Cohere**; `chatbot.spec.md:79` documenta la decisión de no usar Rerank |
| `auth.spec.md:123` | `RESEND_FROM` usa un local-part `no-reply` | `env.ts:51-53` lo **prohíbe explícitamente** por ser señal de spam para Resend y Gmail |

Y una verificación pendiente que no se cierra leyendo código (`portal-sync.spec.md:349`): **no
está comprobado contra el host real que cactus acepte la sesión con solo las cookies LTPA**.
Quitar el `JSESSIONID` fue un razonamiento, no una medición. Si Domino lo necesitara, **todos**
los sílabos degradarían a `null` y la única señal sería `SYLLABUS_UNAVAILABLE`, que a propósito
no nombra causa.

La cobertura de pruebas de estas integraciones está en
[Pruebas y calidad](#-pruebas-y-calidad): 28 archivos en `test/HU31_jeff/` para portal,
sílabos y delegados; 5 para el chatbot en `test/HU28_ronald/`; 3 para el chat en vivo en
`test/HU23_jeff/`.

---

## 📋 Requerimientos

Aquí hay que ser directo: **el catálogo de requerimientos R1..R23 no existe en el repositorio.**
Los IDs aparecen exclusivamente en la columna «Requirements» de
[`docs/specs/feature-index.md:8-15`](docs/specs/feature-index.md), asignados en bloque a una
feature. Una búsqueda sobre todo el árbol (excluyendo `node_modules`, `dist` y `.git`) no encuentra
ningún archivo que enuncie ni uno solo de ellos. Las specs no tienen sección `## Requirements` con
IDs: tienen `## Business Rules` con IDs `BR-*`, que son los que realmente gobiernan el código.

Consecuencias medidas:

- Se usan **20 IDs**: R1, R2, R4, R5, R6, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19,
  R20, R21, R22, R23. **R3, R7 y R8 no aparecen en ninguna parte.**
- Solo se usan **2 IDs no funcionales**: RNF6 y RNF7, ambos en la fila de Auth, ambos sin enunciado.
- Para las **features 0 y 9-13** la columna trae texto libre en vez de IDs.

Por eso la tabla siguiente no inventa enunciados. Dice a qué feature pertenece cada ID, cuál es su
**ámbito atribuible** (las reglas `BR-*` de esa feature, que sí están escritas) y deja constancia
de que el enunciado propio falta.

### Requerimientos funcionales

| ID | Requerimiento | Feature | Módulo | Estado |
|:---|:---|:---|:---|:---|
| `R1` | **Sin enunciado propio.** Uno de los 2 requerimientos de Auth. Ámbito atribuible: `BR-AUTH-01`…`BR-AUTH-13` — login por código y contraseña, Google SSO institucional, JWT con sesión activa única, reset por OTP, rol docente. | Auth | [`src/modules/auth`](src/modules/auth) | Feature implementada · enunciado no documentado |
| `R2` | **Sin enunciado propio.** Comparte con `R1` el ámbito de Auth. | Auth | [`src/modules/auth`](src/modules/auth) | Feature implementada · enunciado no documentado |
| `R3` | **No existe.** Ningún documento del repositorio lo menciona; el catálogo salta de `R2` a `R4`. | — | — | Inexistente |
| `R4` | **Sin enunciado propio.** Uno de los 4 requerimientos de Curriculum. Ámbito atribuible: `BR-CU-01`…`BR-CU-03` — malla del `curriculum_id` del alumno, simulación de estados y borrado de la simulación. | Curriculum | [`src/modules/curriculum`](src/modules/curriculum) | Feature implementada · enunciado no documentado |
| `R5` | **Sin enunciado propio.** Ámbito de Curriculum, igual que `R4`. | Curriculum | [`src/modules/curriculum`](src/modules/curriculum) | Feature implementada · enunciado no documentado |
| `R6` | **Sin enunciado propio.** Uno de los 2 requerimientos de Grades. Ámbito atribuible: `BR-GRADES-01`…`BR-GRADES-04` — notas personales por evaluación y promedio ponderado. | Grades | [`src/modules/grades`](src/modules/grades) | Feature implementada · enunciado no documentado |
| `R7` | **No existe.** Sin mención en el repositorio. | — | — | Inexistente |
| `R8` | **No existe.** Sin mención en el repositorio. | — | — | Inexistente |
| `R9` | **Sin enunciado propio.** Ámbito de Grades, igual que `R6`. | Grades | [`src/modules/grades`](src/modules/grades) | Feature implementada · enunciado no documentado |
| `R10` | **Sin enunciado propio.** Ámbito de Curriculum. | Curriculum | [`src/modules/curriculum`](src/modules/curriculum) | Feature implementada · enunciado no documentado |
| `R11` | **Sin enunciado propio.** Ámbito de Curriculum. | Curriculum | [`src/modules/curriculum`](src/modules/curriculum) | Feature implementada · enunciado no documentado |
| `R12` | **Sin enunciado propio.** Uno de los 2 requerimientos de Academic Profile. Ámbito atribuible: `BR-AP-01`…`BR-AP-06` — perfil completo, carreras, especialidades por carrera y reemplazo del conjunto activo. | Academic Profile | [`src/modules/academic-profile`](src/modules/academic-profile) | Feature implementada · enunciado no documentado |
| `R13` | **Sin enunciado propio.** Ámbito de Academic Profile, igual que `R12`. | Academic Profile | [`src/modules/academic-profile`](src/modules/academic-profile) | Feature implementada · enunciado no documentado |
| `R14` | **Sin enunciado propio.** Uno de los 4 requerimientos de Section Management. Ámbito atribuible: `BR-SECTION-MGMT-01`…`BR-SECTION-MGMT-05` — representantes activos, anuncios y estadísticas agregadas del salón. | Section Management | [`src/modules/section-management`](src/modules/section-management) | Feature implementada · enunciado no documentado |
| `R15` | **Sin enunciado propio.** Uno de los 4 requerimientos de Alerts. Ámbito atribuible: `BR-ALERT-01`…`BR-ALERT-07` — riesgo académico, riesgo crítico, alta carga, deduplicación y tipos válidos. | Alerts | [`src/modules/alerts`](src/modules/alerts) | Feature implementada · enunciado no documentado |
| `R16` | **Sin enunciado propio.** Ámbito de Alerts, igual que `R15`. | Alerts | [`src/modules/alerts`](src/modules/alerts) | Feature implementada · enunciado no documentado |
| `R17` | **Sin enunciado propio.** Ámbito de Section Management. | Section Management | [`src/modules/section-management`](src/modules/section-management) | Feature implementada · enunciado no documentado |
| `R18` | **Sin enunciado propio.** Ámbito de Section Management. | Section Management | [`src/modules/section-management`](src/modules/section-management) | Feature implementada · enunciado no documentado |
| `R19` | **Sin enunciado propio.** Único requerimiento de Schedule, así que su ámbito es la feature entera: `BR-SCH-01`…`BR-SCH-05` — horario semanal, calendario de evaluaciones, carga académica, resolución de semanas y horario del docente. | Schedule | [`src/modules/schedule`](src/modules/schedule) | Feature implementada · enunciado no documentado |
| `R20` | **Sin enunciado propio.** Único requerimiento de Course Detail: `BR-COURSE-DETAIL-01`…`BR-COURSE-DETAIL-05` — secciones, docentes, matrículas, anuncios y contactos con `jefePractica`. | Course Detail | [`src/modules/course-detail`](src/modules/course-detail) | Feature implementada · enunciado no documentado |
| `R21` | **Sin enunciado propio.** Ámbito de Section Management. | Section Management | [`src/modules/section-management`](src/modules/section-management) | Feature implementada · enunciado no documentado |
| `R22` | **Sin enunciado propio.** Ámbito de Alerts. | Alerts | [`src/modules/alerts`](src/modules/alerts) | Feature implementada · enunciado no documentado |
| `R23` | **Sin enunciado propio.** Ámbito de Alerts. | Alerts | [`src/modules/alerts`](src/modules/alerts) | Feature implementada · enunciado no documentado |

Las features restantes del índice **no usan IDs**: declaran su requerimiento en prosa. Los copiamos
tal cual porque son el único enunciado que existe.

| Feature | Requerimiento tal como está escrito | Módulo | Estado |
|:---|:---|:---|:---|
| Platform Runtime | «Deploy runtime compatibility» | [`src/server.ts`](src/server.ts) + config raíz | Completado |
| Advising (docentes/JP) | «Rol docente, asesorías extra, RSVP/conteo» | [`src/modules/advising`](src/modules/advising) | Implementado |
| Chat en vivo por sección | «Puente auth Firebase, espejo de membresía, derivación de rol» | [`src/modules/chat`](src/modules/chat) | Implementado |
| Carnet de networking | «Carnet opt-in con redes sociales (alumnos+docentes), visible en contactos, compartible en chat» | [`src/modules/networking`](src/modules/networking) | Implementado (el índice todavía dice «pendiente de implementar») |
| Chatbot Asistente Académico | «Chatbot con IA (Cohere) que responde preguntas sobre notas, horario, malla, anuncios, compañeros, alertas y chat de sección» | [`src/modules/chatbot`](src/modules/chatbot) | Implementado (el índice todavía dice «pendiente de implementar») |
| Portal Sync | «Importación idempotente por alumno desde miUlima vía sesión de WebView; sin contraseñas en backend» | [`src/modules/portal-sync`](src/modules/portal-sync) | Implementado · verificación manual end-to-end pendiente |

Con eso se cubren las 14 filas del índice. Quedan fuera **cuatro features en producción que no
tienen requerimiento en ningún documento**, ni con ID ni en prosa: 10 de los 70 endpoints del
backend no cuelgan de ningún requerimiento escrito. Los enunciamos aquí con prefijo `OBS-RF-`, la
misma convención que los RNF observados: **el prefijo y el texto son de este README, no del
proyecto.**

| Feature | Requerimiento observado | Módulo | Estado |
|:---|:---|:---|:---|
| Official Grades | `OBS-RF-1` — el profesor **titular** de una sección carga y corrige la nota oficial por alumno y evaluación; el JP recibe `403 NOT_SECTION_PROFESSOR`, y el alumno lee las suyas del período activo en solo lectura. Ámbito atribuible: `official-grades.spec.md`, §Autorización y §Requisitos, que no usan IDs de regla | [`src/modules/official-grades`](src/modules/official-grades) | Implementado · sin ID en `feature-index.md` |
| Attendance Risk | `OBS-RF-2` — el docente consulta el listado y el resumen de alumnos impedidos o en riesgo por inasistencia de una sección, y los notifica creando alertas. Umbral de inasistencia: 35 % si el ciclo del alumno es 6 o mayor, 25 % en otro caso (`attendance-risk.service.ts:164`) | [`src/modules/attendance-risk`](src/modules/attendance-risk) | 🔴 Implementado **sin spec y sin contrato REST** |
| Advising Student (RSVP) | `OBS-RF-3` — el alumno consulta las asesorías de su sección y confirma o cancela su asistencia, con el conteo de asistentes y su propio `myRsvp` visibles. Ámbito atribuible: `advising-student.spec.md`, reglas `BR-AS-01`…`BR-AS-12` | [`src/modules/advising/student`](src/modules/advising/student) | Implementado · no figura en `feature-index.md` |
| Delegados desde el portal | `OBS-RF-4` — la importación trae la nómina de delegados y subdelegados de cada sección, escribe los *claims* y promueve el rol re-firmando el JWT del alumno. Ámbito atribuible: `delegados-portal.spec.md`, `RQ-1`…`RQ-7` y `RS-1`…`RS-23` | `portal-sync` + `course-detail` + `auth` | Implementado · no figura en `feature-index.md` |

### Requerimientos no funcionales

Solo dos RNF tienen ID en el repositorio y ninguno tiene enunciado. Los demás los observamos en el
código: llevan prefijo `OBS-` y **ese prefijo es de este README, no del proyecto**. La columna
«Origen» dice cuál es cuál.

| ID | Atributo | Requerimiento | Origen | Evidencia |
|:---|:---|:---|:---|:---|
| `RNF6` | *(indeterminado)* | **Sin enunciado.** Asignado a Auth en `feature-index.md:8`. Ninguna spec, doc ni comentario lo define. | Documentado (solo el ID) | — |
| `RNF7` | *(indeterminado)* | **Sin enunciado.** Ídem `RNF6`. | Documentado (solo el ID) | — |
| `OBS-SEG-1` | Seguridad | Autenticación exclusivamente por Bearer JWT `HS256`, con `tokenVersion` releído de BD en cada request para forzar sesión activa única. Sin vías de desarrollo. | Observado · `BR-AUTH-03/06/08` | `auth-middleware.ts:60-68` |
| `OBS-SEG-2` | Seguridad | Contraseñas con bcrypt costo 10. Prohibido exponer `password_hash`, tokens, secretos o variables de entorno en cualquier respuesta. | Observado · `AGENTS.md:43` | `auth.service.ts:39` |
| `OBS-SEG-3` | Seguridad | *Fail-closed*: un error de BD en autenticación responde `500` genérico, sin usuario mock y sin firmar token. | Observado · `BR-AUTH-09` | `test/HU01_jeff/login.cajablanca.test.ts` camino C8 |
| `OBS-SEG-4` | Seguridad | Allowlist de hosts salientes **separada por sistema** (portal y sílabos). Un valor fuera de la allowlist **impide el arranque**. Se compara `.host`, así que un puerto distinto también se rechaza. | Observado · anti-SSRF | `env.ts:7,22,79,88` · `test/HU31_jeff/env.portal-allowlist.test.ts` (14 casos) |
| `OBS-SEG-5` | Seguridad | Rate limit por usuario en las tres superficies caras: 3 resets/hora, 20 preguntas de chatbot/hora, 5 importaciones/hora. | Observado · `BR-CB-11`, `portal-sync.spec.md:130` | [`src/shared/middleware/rate-limit.ts`](src/shared/middleware/rate-limit.ts) |
| `OBS-SEG-6` | Seguridad | CORS restringible por `CORS_ORIGINS`. **Sin la variable cae a `*`**, y no hay evidencia en el repo de que esté definida en producción. | Observado · `BR-PLATFORM-08` | `server.ts:19`, `app-config.ts:28` |
| `OBS-SEG-7` | Seguridad | Credenciales del portal (contraseña, TOTP, cookies) solo en memoria durante la petición: ni se persisten ni se registran. | Observado · `RS-BE-7` | [`src/services/portal.client.ts`](src/services/portal.client.ts) |
| `OBS-SEG-8` | Seguridad | Guardas de pertenencia por recurso además del rol, para impedir enumerar `sectionId` y armar el padrón de delegados de la universidad. | Observado · `RS-20` | `course-detail.routes.ts:60-79` |
| `OBS-SEG-9` | Seguridad | Guardrails de IA: pregunta acotada a 500 caracteres, rechazo de cinco patrones de prompt injection con `400 INVALID_QUESTION` y timeout de 8 s a Cohere. ⚠️ La cuarta regla de `BR-CB-10` —descartar la respuesta que contenga datos de otro `studentId`— **está especificada y no implementada**: `chatbot.service.ts:124` persiste la respuesta sin inspeccionarla. | Observado · `BR-CB-09` · `BR-CB-10` parcial | `chatbot.controller.ts:5-11,66-75`, `chatbot.schemas.ts:14`; el hueco, en `chatbot.service.ts:43-138` |
| `OBS-PERF-1` | Rendimiento | Una importación completa cabe en el presupuesto del cliente: medidas reales de **40.7 s** y **47.7 s** contra un corte de 90 s en Flutter. | Observado | `platform-runtime.spec.md:105`, `RS-9` |
| `OBS-PERF-2` | Rendimiento | Toda petición saliente al portal lleva timeout de 8 s con `AbortController`; el flujo son 4 rondas secuenciales, ~32 s de tope teórico. | Observado | `env.ts:80-83` · `test/HU31_jeff/portal.client.test.ts` |
| `OBS-PERF-3` | Rendimiento | El LLM nunca bloquea: 8 s de timeout en Chat, 500 ms en Classify con **fallback de keywords en español**, y un fallo de titulación no bloquea la respuesta. | Observado · `BR-CB-03/04/12` | `chatbot.service.ts:12,98` |
| `OBS-PERF-4` | Rendimiento | La latencia dominante del import es el RTT a Neon: ~115 consultas × ~150 ms desde Lima ≈ 17 s. Es la razón de fijar la región `iad1`. | Observado | `portal-sync.spec.md:192`, `BR-PLATFORM-10` |
| `OBS-DISP-1` | Disponibilidad | `GET /health` y `GET /version` públicos, sin `authMiddleware`, para verificar vida y commit desplegado sin credenciales. | Observado · `BR-PLATFORM-03` | `server.ts:48-60` |
| `OBS-DISP-2` | Disponibilidad | Función pegada a `iad1` y sin `maxDuration` declarado: 300 s por defecto y por tope. | Observado · `BR-PLATFORM-10/11` | `vercel.json` |
| `OBS-DISP-3` | Disponibilidad | Degradación parcial antes que fallo total: los sílabos y la fase de delegados degradan a `null` + warning y no abortan el import. | Observado · `RQ-6`, `RS-17` | `portal-sync.types.ts:56-64` |
| `OBS-DISP-4` | Disponibilidad | ⚠️ **Contra-ejemplo conocido**: si falta una variable obligatoria, `env.ts:96` mata el proceso, y en Vercel eso tumba también `/health` y `/version` — el diagnóstico se cae con la app. | Observado | `env.ts:96` |
| `OBS-MANT-1` | Mantenibilidad | Arquitectura obligatoria `routes → controller → service → repository → db`. Los services reciben repositories y `EventBus` por constructor y **no importan `db`**. | Observado · `AGENTS.md:38-44` | [`src/modules/`](src/modules) |
| `OBS-MANT-2` | Mantenibilidad | Las reglas numéricas viven en archivos `*.logic.ts` puros, sin BD ni HTTP, para poder probar los bordes de cada umbral. | Observado | `alerts.logic.ts`, `schedule.logic.ts`, `grades.logic.ts`, `section-statistics.logic.ts` |
| `OBS-MANT-3` | Mantenibilidad | Spec Driven Development: sin spec aprobada no hay código, y el código solo toca los `targets` declarados. | Documentado · `AGENTS.md:3,16-26` | 18 specs en [`specs/features/`](specs/features) |
| `OBS-MANT-4` | Mantenibilidad | Suite propia por historia y por autor: **74 archivos, 1 028 casos, 14 464 líneas** en `test/`, más configuraciones de Stryker por autor. | Observado | Ver [Pruebas y calidad](#-pruebas-y-calidad) |
| `OBS-MANT-5` | Mantenibilidad | Gestor de paquetes canónico único: `bun.lock` versionado, `package-lock.json` en `.gitignore`. | Observado · `BR-PLATFORM-09` | `.gitignore:39` |
| `OBS-TRAZ-1` | Trazabilidad | Cada regla tiene ID y cada spec enlaza sus pruebas con `[@test]`. ⚠️ **De 42 rutas `[@test]` distintas, 21 apuntan a archivos que ya no existen** (43 apariciones) tras reorganizar los tests a `test/HU<NN>_<autor>/`. | Observado · viola `spec-template.md:41` | `specs/features/*/*.spec.md` |
| `OBS-TRAZ-2` | Trazabilidad | `GET /version` devuelve `commit`, `ref` y `deployment` para saber exactamente qué código está vivo. | Observado | `server.ts:54-60` |
| `OBS-TRAZ-3` | Trazabilidad | `feature-index.md` conecta historias, requerimientos, módulos y specs. ⚠️ **Está desactualizado**: 2 filas declaran «pendiente de implementar» código ya en producción y 4 specs no tienen fila: `advising-student`, `refact-advising`, `delegados-portal` y `official-grades`. | Observado | `docs/specs/feature-index.md` |
| `OBS-TRAZ-4` | Trazabilidad | La importación es auditable por diseño: 11 códigos de warning tipados y un `ImportSummary` de 15 contadores en cada respuesta. | Observado | `portal-sync.types.ts:56-73` |
| `OBS-PORT-1` | Portabilidad del runtime | El servidor es un `export default app` de Hono: la misma instancia corre en Bun local y como función serverless en Vercel, sin adapter y sin listeners manuales. | Observado · `BR-PLATFORM-01/02/03` | `src/server.ts:65` |
| `OBS-PORT-2` | Portabilidad del runtime | Imports ESM con extensión `.js` explícita; prohibidos los imports de directorio, que el bundler serverless no resuelve. | Observado · `BR-PLATFORM-07` | todos los imports de `src/server.ts` |
| `OBS-PORT-3` | Portabilidad del runtime | El build de producción excluye `src/db/seed/**`: un seed roto no puede impedir un despliegue. | Observado · `BR-PLATFORM-06` | `tsconfig.json` |
| `OBS-PORT-4` | Portabilidad del runtime | Sin cambios de contrato al migrar de runtime: mismos paths públicos, sin prefijo `/api`. | Observado · `BR-PLATFORM-04` | [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md) |
| `OBS-PORT-5` | Portabilidad del runtime | Dependencia pinneada por incompatibilidad de runtime: `firebase-admin@12.1.0`. v13/v14 arrastran `jose` en ESM y rompen Vercel con `ERR_REQUIRE_ESM` porque el backend es `"type": "module"`. | Observado | `package.json:33`, `KNOWLEDGE.md:144-147` |

### Matriz de trazabilidad

Las 14 filas de [`docs/specs/feature-index.md`](docs/specs/feature-index.md) más las **5 specs y
módulos que el índice no lista**. La columna «Pruebas» es la carpeta real de `test/` con su conteo
de casos; la columna «Estado» es lo que se verificó **contra el código**, no lo que declara el
índice.

| Feature | Spec | Historias | Requerimientos | Módulo | Pruebas | Estado |
|:---|:---|:---|:---|:---|:---|:---|
| Platform Runtime | `platform-runtime.spec.md` | — | «Deploy runtime compatibility» | [`src/server.ts`](src/server.ts) | sin carpeta propia | ✅ Confirmado: `export default app` en `server.ts:65`, sin `Bun.serve`/`listen`, `vercel.json` con `iad1` y sin `maxDuration` |
| Auth | `auth.spec.md` | US01, US02, HU01, HU02, HU16, HU18, HU20 | R1, R2, RNF6, RNF7 | [`src/modules/auth`](src/modules/auth) | `HU01_jeff` 8 · `HU02_jeff` 6 · `HU16_jeff` 9 · `HU20_jeff` 14 = **37** | ✅ Confirmado: 7 rutas en `auth.routes.ts:16-45` |
| Academic Profile | `academic-profile.spec.md` | US05, HU05 | R12, R13 | [`src/modules/academic-profile`](src/modules/academic-profile) | `HU05_mel` **10** | ✅ Confirmado: 4 rutas |
| Curriculum | `curriculum.spec.md` | US03, US04, HU03, HU04 | R4, R5, R10, R11 | [`src/modules/curriculum`](src/modules/curriculum) | `HU03_julio` 18 · `HU04_julio` 18 = **36** | ⚠️ Desviación: el enum acepta `simulated_available` (HU19), no descrito en la spec |
| Grades | `grades.spec.md` | US06, US07, HU06, HU07 | R6, R9 | [`src/modules/grades`](src/modules/grades) | `HU06_sam` 12 · `HU07_sam` 13 = **25** | ⚠️ Desviación: existe una 5.ª ruta `DELETE /me/notes/:sectionId/:assessmentId` sin regla, y el repositorio escribe `simulated_grades`, no `student_score` |
| Schedule | `schedule.spec.md` | US09, HU09, HU24 | R19 | [`src/modules/schedule`](src/modules/schedule) | `HU09_nehemias` 40 · `HU24_nehemias` 33 = **73** | ⚠️ Extras: `GET /teacher/sections/:sectionId/assessments-status` y `POST …/notify-grades` no tienen regla propia |
| Course Detail | `course-detail.spec.md` | US13, US14, US17, HU12, HU14 | R20 | [`src/modules/course-detail`](src/modules/course-detail) | `HU14_mel` **12** | ⚠️ Deuda real: **8 bloques `sql` inline** en `course-detail.routes.ts`. El gate es más amplio que `BR-COURSE-DETAIL-03` |
| Alerts | `alerts.spec.md` | US15, HU08 | R15, R16, R22, R23 | [`src/modules/alerts`](src/modules/alerts) | `HU08_julio` **66** | ✅ Confirmado: umbrales en `alerts.logic.ts:6,8,11,15` |
| Section Management | `section-management.spec.md` | US16, US17, US18, HU10, HU11 | R14, R17, R18, R21 | [`src/modules/section-management`](src/modules/section-management) | `HU10_mel` 16 · `HU11_ronald` 7 = **23** | ⚠️ HU11 **sí** está implementada aunque `BR-SECTION-MGMT-03` la declare pendiente. Cero SQL inline en rutas |
| Advising (docentes/JP) | `advising.spec.md` | HU18 | texto libre | [`src/modules/advising/teacher`](src/modules/advising/teacher) | `HU18_jeff` **93** | ✅ Confirmado: 5 rutas docentes |
| Advising Student (RSVP) | `advising-student.spec.md` | HU13, HU17 | `OBS-RF-3` (de este README) | [`src/modules/advising/student`](src/modules/advising/student) | `HU13_ronald` **50** | ✅ Implementado · **no figura en `feature-index.md`** |
| Refact Advising | `refact-advising.spec.md` | — (refactor) | — | `src/modules/advising/{teacher,student}` | verificado por estructura | ✅ Ejecutado · **no figura en `feature-index.md`** |
| Chat en vivo por sección | `chat.spec.md` | HU23 | texto libre | [`src/modules/chat`](src/modules/chat) | `HU23_jeff` **64** | ⚠️ Implementado · reglas de RTDB pendientes de validar con Firebase Emulator |
| Carnet de networking | `networking.spec.md` | HU25 (histórico HU27) | texto libre | [`src/modules/networking`](src/modules/networking) | `HU25_mel` **34** | ⚠️ Implementado y montado · el índice dice «pendiente». Además existe `GET /networking/users/:userId`, que la spec declara **fuera de alcance** |
| Chatbot Asistente Académico | `chatbot.spec.md` | HU-CHATBOT-01/02, HU28 | texto libre | [`src/modules/chatbot`](src/modules/chatbot) | `HU28_ronald` **35** | ⚠️ Implementado y montado (5 rutas, rate limit activo, 2 tablas) · el índice dice «pendiente» |
| Portal Sync | `portal-sync.spec.md` | HU-SYNC-01/02, HU31 | RS-BE-1…8 | [`src/modules/portal-sync`](src/modules/portal-sync) | `HU31_jeff` **425** en 28 archivos | ⚠️ Implementado · **verificación manual end-to-end pendiente** |
| Delegados desde el portal | `delegados-portal.spec.md` | RQ-1…7 (HU31) | RS-1…23 | `portal-sync` + `course-detail` + `auth` | dentro de `HU31_jeff` (4 fixtures de nómina) | ✅ Implementado · **no figura en `feature-index.md`** |
| Official Grades | `official-grades.spec.md` | HU29 | `OBS-RF-1` (de este README) | [`src/modules/official-grades`](src/modules/official-grades) | `HU29_jeff` **12** | ✅ Implementado · **no figura en `feature-index.md`** |
| Attendance Risk | **no existe spec** | HU22, HU26, HU30 | `OBS-RF-2` (de este README) | [`src/modules/attendance-risk`](src/modules/attendance-risk) | `HU22_sam` 23 · `HU30_sam` 10 = **33** | 🔴 Implementado y montado **sin spec y sin contrato REST**. Viola la decisión no negociable «no lógica fuera de spec» |

**Totales**: 19 features · 18 specs · 74 archivos de prueba · **1 028 casos** · 15 módulos montados.
Dos historias implementadas no tienen suite propia en ningún repo: **HU12** (ver anuncios de la
sección) y **HU15** (ver el perfil académico propio).

> ⚠️ Si vas a usar este README como fuente de trazabilidad para un informe, usa **esta matriz** y
> no `feature-index.md`: el índice declara «pendiente de implementar» dos features que están en
> producción, omite cuatro specs y un módulo entero, y atribuye la deuda de «SQL en rutas» a tres módulos cuando solo
> uno la tiene. Los detalles están en [Deuda técnica](#-deuda-técnica-y-límites-conocidos).

---

## 👤 Historias de usuario y criterios de aceptación

Esta sección es el catálogo completo del backlog: quién usa el sistema, qué historia
cubre cada módulo del backend y con qué criterios se da por cerrada. Los criterios
en Gherkin **no son aspiracionales**: cada escenario sale de una regla escrita en
las 18 specs de [`specs/features/`](specs/features/) o de una constante del código, y
cada ficha cita su origen.

Antes de leer la tabla maestra hay que aceptar dos cosas incómodas del proyecto:

> **1 · Conviven dos numeraciones y no son el mismo eje.** `US01..US18` es el backlog
> original del curso, declarado en [`KNOWLEDGE.md`](KNOWLEDGE.md) líneas 88-101.
> `HU01..HU31` es la numeración de trabajo del equipo, materializada como carpetas
> `test/HU<NN>_<autor>/`. **No coinciden**: `US15` son las alertas, pero `HU15` es el
> perfil del alumno; las alertas son `HU08`. No existe en el repo ninguna tabla
> oficial que reconcilie ambos ejes — la de aquí abajo se reconstruyó cruzando
> `KNOWLEDGE.md`, las cabeceras de los tests y los mensajes de commit.

> **2 · El backlog original tiene huecos.** Las tablas «Historias Reales» de ambos
> repos **no incluyen US08, US10, US11 ni US12**. El «backlog US01..US18» son en
> realidad **14 historias**. El enunciado de esas cuatro no aparece en ningún archivo
> de ninguno de los dos repositorios.

---

### Los actores

Cuatro actores, cuatro roles técnicos. El rol viaja en el JWT (`payload.role`) y lo
aplica `requireRole(...)` en [`src/shared/middleware/auth-middleware.ts`](src/shared/middleware/auth-middleware.ts)`:92`.

| Actor | Rol técnico | Qué puede hacer | Cómo se obtiene el rol |
|:---|:---|:---|:---|
| **Estudiante** | `student` | Malla y simulación, calculadora de notas personales, promedio ponderado, horario y evaluaciones, alertas, asesorías y RSVP, contactos y anuncios de su sección, chat de sección, chatbot, carnet de networking, importación desde el portal | Rol por defecto de una cuenta con perfil `student`. `mapRole()` devuelve `student` cuando `findActiveRepresentation()` no encuentra representación vigente ([`auth.repository.ts`](src/modules/auth/auth.repository.ts)`:330-351`) |
| **Delegado** | `delegate` | Todo lo del estudiante **más** publicar, editar y eliminar anuncios de su sección, y ver las estadísticas agregadas del salón | Fila activa en `section_representative` con `position='delegate'`, unida por `enrollment → section → course_offering → academic_period` a una matrícula `active` de un período `is_active`. **El cargo caduca con el ciclo**: sin ese join un delegado de 2026-1 lo seguiría siendo para siempre |
| **Subdelegado** | `subdelegate` | Exactamente lo mismo que el delegado: las rutas de anuncios y estadísticas piden `requireRole("delegate","subdelegate")` | Igual, con `position='subdelegate'`. `delegate` tiene precedencia por `order by case sr.position when 'delegate' then 0 when 'subdelegate' then 1 else 2 end limit 1` |
| **Docente — Profesor o JP** | `teacher` | Publicar y borrar asesorías extra, ver la lista de asistentes, horario docente, cargar notas oficiales (solo el titular), lista de impedidos por inasistencia y notificarlos, borrar mensajes del chat (solo el titular), carnet de networking | El `code` **no** corresponde a ningún perfil `student` y existe `teacher.user_id` apuntando a la cuenta. No se exige matrícula activa ni se consulta `section_representative` (BR-AUTH-12). El alta es administrativa, por seed aprobado ([`src/db/seed/docentes.ts`](src/db/seed/docentes.ts)); **no hay endpoint de registro** |

> **1 · El rol no vive en la cuenta.** `app_user` no tiene columna `role`. El rol se
> calcula **en cada login** consultando la representación vigente (BR-AUTH-02) y se
> congela dentro del JWT hasta el siguiente login. Por eso `portal-sync` re-firma el
> token cuando promueve a un delegado durante una importación: sin re-firma, el
> alumno seguiría siendo `student` hasta cerrar sesión.

> **2 · Una cuenta es de alumno o de docente, nunca las dos.** El perfil `student`
> tiene precedencia en el lookup. Si la cuenta no tiene ni perfil de alumno ni fila
> en `teacher`, el login responde `401 USER_NOT_FOUND` — es una cuenta huérfana.

> **3 · «Profesor» y «JP» son etiquetas de la sección, no atributos de la persona.**
> No existe enum de tipo docente. Si el `teacher.id` aparece como `section.teacher_id`
> es Profesor de esa sección; si aparece como `section.jp_id` es Jefe de Práctica de
> esa sección. La etiqueta global del header sale de `select 1 from section where
> jp_id = <teacherId>` ([`auth.repository.ts`](src/modules/auth/auth.repository.ts)`:293-298`):
> si trae filas, "Jefe de Práctica"; si no, "Profesor".

```mermaid
flowchart TD
  L["POST /auth/login con code y password"] --> P{"existe perfil student con ese code?"}
  P -- si --> BC{"bcrypt compare valida?"}
  BC -- no --> E401["401 INVALID_PASSWORD"]
  BC -- si --> EN{"tiene algun enrollment active?"}
  EN -- no --> E403["403 NOT_ENROLLED"]
  EN -- si --> RP{"representacion vigente en el ciclo activo?"}
  RP -- "position delegate" --> RD["rol delegate"]
  RP -- "position subdelegate" --> RS["rol subdelegate"]
  RP -- "ninguna" --> RST["rol student"]
  P -- no --> T{"existe teacher.user_id para esa cuenta?"}
  T -- no --> EUNF["401 USER_NOT_FOUND"]
  T -- si --> RT["rol teacher, sin exigir matricula"]
  RT --> LB{"su teacher.id es jp_id de alguna seccion?"}
  LB -- si --> JP["etiqueta Jefe de Practica"]
  LB -- no --> PR["etiqueta Profesor"]
```

---

### El backlog original: US01–US18 → HU

Las 14 historias que sí existen en el backlog del curso, con la historia de trabajo
que las materializó.

| US | Enunciado original (`KNOWLEDGE.md:88-101`) | HU de trabajo | Épica |
|:---|:---|:---|:---|
| US01 | Iniciar sesión con código y contraseña | HU01 (+ HU16 Google SSO) | Auth |
| US02 | Cerrar sesión | HU02 | Auth |
| US03 | Visualizar malla curricular interactiva | HU03 (BE) + HU19 (FE) | Curriculum |
| US04 | Actualizar y simular estados visuales de cursos | HU04 (BE) + HU19 (FE) | Curriculum |
| US05 | Seleccionar especialidad | HU05 | Academic Profile |
| US06 | Registrar notas personales por evaluación | HU06 | Grades |
| US07 | Visualizar promedio personal por curso | HU07 | Grades |
| US08 | *(no existe en la tabla)* | — | — |
| US09 | Visualizar horario y evaluaciones del ciclo | HU09 (+ HU24 vista docente) | Schedule |
| US10 | *(no existe en la tabla)* | — | — |
| US11 | *(no existe en la tabla)* | — | — |
| US12 | *(no existe en la tabla)* | — | — |
| US13 | Visualizar horario de asesoría | HU13 (+ HU17 RSVP, HU18 publicación) | Advising |
| US14 | Visualizar contactos de sección | HU14 | Course Detail |
| US15 | Recibir alertas de riesgo académico y alta carga | HU08 (+ HU30 inasistencia) | Alerts |
| US16 | Registrar anuncios como delegado o subdelegado | HU10 | Section Management |
| US17 | Visualizar anuncios de sección | HU12 *(inferida)* | Course Detail |
| US18 | Métricas agregadas de sección sin notas individuales | HU11 | Section Management |

**16 historias nacieron después del backlog original** y no tienen US de respaldo:
HU16, HU17, HU18, HU19, HU20, HU21, HU22, HU23, HU24, HU25, HU26, HU28, HU29, HU30,
HU31 y la HU de asistencia real que todavía está en curso. Cuando las specs les dan
ID propio usan otra nomenclatura más: `HU-CHATBOT-01/02`, `HU-SYNC-01/02`, `HU25-E1`.

---

### Casos de uso por actor

Qué puede pedirle cada actor a esta API. Un caso de uso agrupa las historias que comparten
pantalla y endpoint; el rol que lo habilita es el del JWT, aplicado por `requireRole(...)`.

```mermaid
flowchart LR
  ALU(("Alumno"))
  DEL(("Delegado o Subdelegado"))
  DOC(("Docente · Profesor o JP"))
  POR["miUlima · webaloe"]

  subgraph SIS["ULima++ · Backend"]
    UC01(["Iniciar y cerrar sesion · HU01 HU02 HU16 HU20"])
    UC02(["Consultar malla y simular avance · HU03 HU04 HU19"])
    UC03(["Elegir especialidad y ver perfil · HU05 HU15"])
    UC04(["Registrar notas personales y ver promedio · HU06 HU07"])
    UC05(["Consultar horario y evaluaciones · HU09"])
    UC06(["Recibir alertas de riesgo y alta carga · HU08"])
    UC07(["Ver anuncios, asesorias y contactos de la seccion · HU12 HU13 HU14"])
    UC08(["Confirmar o cancelar asistencia a una asesoria · HU17"])
    UC09(["Conversar en el chat de seccion · HU23"])
    UC10(["Preguntar al ULimaBot · HU28"])
    UC11(["Publicar el carnet de networking · HU25"])
    UC12(["Importar el ciclo desde miUlima · HU31"])
    UC13(["Gestionar anuncios de la seccion · HU10"])
    UC14(["Ver estadisticas agregadas del salon · HU11"])
    UC15(["Publicar y borrar asesorias extra · HU18"])
    UC16(["Ver horario docente y asistentes · HU24"])
    UC17(["Calificar oficialmente por evaluacion · HU29"])
    UC18(["Ver impedidos por inasistencia y notificar · HU22 HU30"])
  end

  ALU --- UC01
  ALU --- UC02
  ALU --- UC03
  ALU --- UC04
  ALU --- UC05
  ALU --- UC06
  ALU --- UC07
  ALU --- UC08
  ALU --- UC09
  ALU --- UC10
  ALU --- UC11
  ALU --- UC12

  DEL -.->|"hereda todos los casos del Alumno"| ALU
  DEL --- UC13
  DEL --- UC14

  DOC --- UC01
  DOC --- UC09
  DOC --- UC11
  DOC --- UC15
  DOC --- UC16
  DOC --- UC17
  DOC --- UC18

  UC12 --> POR
```

> **El Administrador de `docs/images/casos_uso/Administrador.png` no existe en este backend.** El
> tipo `AppRole` de [`auth.types.ts`](src/modules/auth/auth.types.ts)`:1-5` tiene exactamente
> cuatro valores —`student`, `delegate`, `subdelegate`, `teacher`— y no hay endpoint de alta de
> docentes: el alta es por seed ([`src/db/seed/docentes.ts`](src/db/seed/docentes.ts)). El PNG vive
> en el repo del frontend y este README no lo referencia como contrato.

HU21 y HU26 no aparecen porque no tienen caso de uso propio contra esta API: el visor de sílabos
consume el `silaboUrl` que ya devuelve `grades`, y el CSV de impedidos se arma en el cliente sobre
la respuesta de `attendance-risk`.

---

### Mapa de épicas

```mermaid
flowchart LR
  APP["ULima++"] --> E1["Auth"]
  APP --> E2["Academic Profile"]
  APP --> E3["Curriculum"]
  APP --> E4["Grades"]
  APP --> E5["Schedule"]
  APP --> E6["Course Detail"]
  APP --> E7["Alerts"]
  APP --> E8["Section Management"]
  APP --> E9["Advising"]
  APP --> E10["Chat"]
  APP --> E11["Networking"]
  APP --> E12["Chatbot"]
  APP --> E13["Portal Sync"]
  APP --> E14["Attendance Risk"]
  APP --> E15["Official Grades"]

  E1 --> A["HU01 login · HU02 logout · HU16 Google SSO · HU20 reset OTP"]
  E2 --> B["HU05 especialidad · HU15 perfil"]
  E3 --> C["HU03 malla · HU04 simulacion · HU19 malla movil"]
  E4 --> D["HU06 notas personales · HU07 promedio · HU21 silabo"]
  E5 --> F["HU09 horario alumno · HU24 horario docente"]
  E6 --> G["HU12 anuncios · HU14 contactos"]
  E7 --> H["HU08 riesgo y alta carga"]
  E8 --> I["HU10 anuncios delegado · HU11 estadisticas"]
  E9 --> J["HU13 ver asesorias · HU17 RSVP · HU18 rol docente"]
  E10 --> K["HU23 chat de seccion"]
  E11 --> L["HU25 carnet, antes HU27"]
  E12 --> M["HU28 ULimaBot"]
  E13 --> N["HU31 importar ciclo de miUlima"]
  E14 --> O["HU22 impedidos · HU26 CSV · HU30 notificar"]
  E15 --> P["HU29 calificacion oficial"]
```

---

### La tabla maestra del backlog

Las 31 historias de trabajo más la que está en curso. La columna **Pruebas** cuenta
casos declarados (`grep` sobre `it(` / `test(` en el backend y `test(` / `testWidgets(`
en el frontend), separando **backend / frontend**; `—` significa que esa HU no tiene
carpeta de prueba en ese repo. Los tests del frontend viven en el otro repositorio,
`ULima_Frontend_IS2`.

| HU | Título | Actor | Módulo backend | Autor | Pruebas | Estado |
|:---|:---|:---|:---|:---|---:|:---|
| **HU01** | Iniciar sesión con código y contraseña | Alumno · Docente | [`src/modules/auth`](src/modules/auth) | jeff | 8 / 16 | Implementado |
| **HU02** | Cerrar sesión e invalidar el JWT (single active session) | Alumno · Docente | [`src/modules/auth`](src/modules/auth) | jeff | 6 / 5 | Implementado |
| **HU03** | Visualizar la malla curricular interactiva | Alumno | [`src/modules/curriculum`](src/modules/curriculum) | julio | 18 / — | Implementado |
| **HU04** | Simular y actualizar el estado visual de un curso | Alumno | [`src/modules/curriculum`](src/modules/curriculum) | julio | 18 / — | Implementado |
| **HU05** | Seleccionar especialidad principal y de interés | Alumno | [`src/modules/academic-profile`](src/modules/academic-profile) | mel | 10 / — | Implementado |
| **HU06** | Registrar notas personales por evaluación | Alumno | [`src/modules/grades`](src/modules/grades) | sam | 12 / 13 | Implementado |
| **HU07** | Visualizar el promedio ponderado del curso | Alumno | [`src/modules/grades`](src/modules/grades) | sam | 13 / 6 | Implementado |
| **HU08** | Alertas de riesgo académico y de alta carga | Alumno | [`src/modules/alerts`](src/modules/alerts) | julio | 66 / — | Implementado |
| **HU09** | Horario semanal y evaluaciones del ciclo | Alumno | [`src/modules/schedule`](src/modules/schedule) | nehemias | 40 / — | Implementado |
| **HU10** | Registrar, editar y eliminar anuncios de sección | Delegado · Subdelegado | [`src/modules/section-management`](src/modules/section-management) | mel | 16 / 12 | Implementado |
| **HU11** | Estadísticas agregadas del salón, sin notas individuales | Delegado · Subdelegado | [`section-statistics.logic.ts`](src/modules/section-management/section-statistics.logic.ts) | ronald | 7 / — | Implementado, con datos reales desde `8b87349` |
| **HU12** | Visualizar los anuncios de la sección | Alumno | [`src/modules/course-detail`](src/modules/course-detail) | — | 0 / 0 | Implementado; **sin suite propia**. El número es una inferencia de `docs/DATABASE.md:158` |
| **HU13** | Visualizar las asesorías del curso | Alumno | [`src/modules/advising/student`](src/modules/advising/student) | ronald | 50 / — | Implementado |
| **HU14** | Contactos de la sección: docente, JP, delegados y compañeros | Alumno | [`src/modules/course-detail`](src/modules/course-detail) | mel | 12 / — | Implementado |
| **HU15** | Visualizar el perfil académico propio | Alumno | [`src/modules/academic-profile`](src/modules/academic-profile) | — | 0 / 0 | Implementado; **sin suite propia**. Número inferido de `perfil.dart` en el frontend |
| **HU16** | Iniciar sesión con Google SSO institucional | Alumno · Docente | [`src/modules/auth`](src/modules/auth) | jeff | 9 / — | Implementado |
| **HU17** | Confirmar y cancelar asistencia a una asesoría | Alumno | [`src/modules/advising/student`](src/modules/advising/student) | ronald | *(en HU13)* / 10 | Implementado |
| **HU18** | Rol docente: login y publicación de asesorías extra | Docente | [`src/modules/advising/teacher`](src/modules/advising/teacher) | jeff | 93 / 28 | Implementado |
| **HU19** | Malla móvil: filtros, progreso real y modo simulación | Alumno | [`src/modules/curriculum`](src/modules/curriculum) | jeff | — / 55 | Implementado |
| **HU20** | Restablecer la contraseña con OTP al correo institucional | Alumno · Docente | [`src/modules/auth`](src/modules/auth) | jeff | 14 / 17 | Implementado |
| **HU21** | Visor de sílabos PDF dentro de la app | Alumno | [`src/modules/grades`](src/modules/grades) (`silaboUrl`) | jeff | — / 43 | **Implementado sin spec** |
| **HU22** | Ver la lista de alumnos impedidos por inasistencia | Docente | [`src/modules/attendance-risk`](src/modules/attendance-risk) | sam | 23 / 10 | **Implementado sin spec** |
| **HU23** | Chat en vivo por sección | Alumno · Docente | [`src/modules/chat`](src/modules/chat) | jeff | 64 / 20 | Implementado; **reglas RTDB vía Emulator pendientes** |
| **HU24** | Horario interactivo del docente | Docente | [`teacherSchedule.logic.ts`](src/modules/schedule/teacherSchedule.logic.ts) | nehemias | 33 / — | Implementado |
| **HU25** | Carnet de networking opt-in con una red social | Alumno · Docente | [`src/modules/networking`](src/modules/networking) | mel | 34 / 33 | Escenario 1 implementado |
| **HU26** | Exportar a CSV la lista de impedidos | Docente | *(sin endpoint: el CSV se arma en el cliente)* | sam | — / 7 | **Implementado sin spec** |
| **HU27** | *(histórico)* Carnet de networking | — | — | — | — | **Renumerada a HU25** |
| **HU28** | Chatbot académico ULimaBot con IA | Alumno | [`src/modules/chatbot`](src/modules/chatbot) | ronald | 35 / — | Implementado; el `feature-index` sigue diciendo «pendiente de implementar» |
| **HU29** | Calificación oficial por evaluación | Docente titular | [`src/modules/official-grades`](src/modules/official-grades) | jeff | 12 / — | Implementado; **no figura en el `feature-index`** |
| **HU30** | Notificar a los alumnos impedidos o en riesgo por faltas | Docente | [`src/modules/attendance-risk`](src/modules/attendance-risk) | sam | 10 / — | Implementado |
| **HU31** | Cargar el ciclo desde el portal miUlima | Alumno | [`src/modules/portal-sync`](src/modules/portal-sync) | jeff | 425 / 43 | Implementado en backend; **verificación E2E manual pendiente** |
| **HU asistencia** | Asistencia real por sección y estado `sin_datos` | Alumno · Docente | *(pendiente en backend)* | — | — / 16 | **En curso y sin commitear** en el frontend |

Los seis autores son **jeff, sam, mel, julio, nehemias y ronald** — Jefferson,
Samantha, Melissa, Julio, Nehemías y Ronald. Cada uno tiene su carpeta `test/HU##_<alias>`
y su propia configuración de mutación `stryker.<alias>.conf.json`; el detalle está en
[Pruebas y calidad](#-pruebas-y-calidad).

> ⚠️ **«Implementado» significa que la ruta existe y está montada, no que se probó
> a mano contra producción.** El estado de esta tabla se verificó leyendo los
> `*.routes.ts` y [`src/modules/index.ts`](src/modules/index.ts). Donde hay una
> verificación funcional pendiente, la columna lo dice.

---

### Fichas detalladas

Veintitrés fichas con su criterio de aceptación en Gherkin. Cubren las **24 carpetas de
`test/`**: cuatro fichas llevan dos historias porque comparten módulo y suite —HU19 incluye HU03 y
HU04, HU17 incluye HU13, HU22 incluye HU30 y HU31-bis desarrolla la parte de delegados de HU31—.
Las únicas historias sin ficha son las que **no tienen suite en este repositorio**: HU12, HU15,
HU21, HU26 y la de asistencia real, todavía en curso. Las reglas citadas (`BR-*`, `R-*`, `RS-*`)
están desarrolladas en [Las reglas del dominio](#-las-reglas-del-dominio).

#### HU01 · Iniciar sesión con código y contraseña

**Como** alumno o docente de la Universidad de Lima, **quiero** entrar a ULima++ con mi código institucional y mi contraseña, **para** acceder a mi información académica sin depender del portal web.

| | |
|:---|:---|
| **Módulo** | [`src/modules/auth`](src/modules/auth) |
| **Endpoints** | `POST /auth/login` · `GET /auth/me` |
| **Reglas** | BR-AUTH-01, BR-AUTH-02, BR-AUTH-03, BR-AUTH-09 · [`specs/features/auth/auth.spec.md`](specs/features/auth/auth.spec.md) |
| **Pruebas** | [`test/HU01_jeff/login.cajablanca.test.ts`](test/HU01_jeff/login.cajablanca.test.ts) — 8 casos de caja blanca sobre `auth.service.ts:56`, con bcrypt y firma de JWT **reales**; solo se sustituye la persistencia |

**Criterios de aceptación**

```gherkin
Escenario: Login exitoso de alumno con matrícula activa
  Dado que existe un app_user cuyo code coincide con el código ingresado
  Y su password_hash valida contra la contraseña con bcryptjs.compare
  Y el usuario tiene al menos un enrollment con status active
  Cuando envío POST /auth/login con code y password
  Entonces recibo 200 con token, tokenType Bearer, expiresIn 86400 y user
  Y el JWT lleva sub, studentId, code, role y tokenVersion firmados con HS256

Escenario: Código inexistente
  Dado que ningún app_user tiene ese code
  Cuando envío POST /auth/login
  Entonces recibo 401 con el código de error USER_NOT_FOUND

Escenario: Contraseña incorrecta
  Dado que el app_user existe
  Pero la contraseña no coincide con password_hash
  Cuando envío POST /auth/login
  Entonces recibo 401 con el código de error INVALID_PASSWORD

Escenario: Alumno sin matrícula activa
  Dado que el app_user existe y la contraseña es correcta
  Y el usuario no tiene ningún enrollment con status active
  Y tampoco está vinculado a un teacher por teacher.user_id
  Cuando envío POST /auth/login
  Entonces recibo 403 con el código de error NOT_ENROLLED

Escenario: La puerta de matrícula NO se filtra por período activo
  Dado que el alumno solo tiene matrícula activa del ciclo anterior
  Y todavía no ha importado el ciclo nuevo desde el portal
  Cuando envío POST /auth/login
  Entonces el login es exitoso
  Porque hasActiveEnrollment cuenta cualquier enrollment active sin importar el ciclo

Escenario: Un fallo de base de datos nunca devuelve un usuario sintético
  Dado que la consulta de autenticación lanza un error de base de datos
  Cuando envío POST /auth/login
  Entonces recibo 500 INTERNAL_ERROR
  Y no se firma ningún JWT ni se devuelve un usuario mock con id 0
```

El último escenario existe porque el fallo existió: el login era *fail-open* y devolvía
un usuario mock `id = 0` cuando la base fallaba. Es el ítem C2 del informe de deuda
técnica de junio, hoy cerrado.

---

#### HU02 · Cerrar sesión e invalidar el JWT

**Como** usuario autenticado, **quiero** cerrar sesión y que mi token deje de servir en cualquier dispositivo, **para** que nadie pueda seguir usando mi cuenta con una sesión vieja.

| | |
|:---|:---|
| **Módulo** | [`src/modules/auth`](src/modules/auth) |
| **Endpoints** | `POST /auth/logout` |
| **Reglas** | BR-AUTH-03 (token versioning), BR-AUTH-04, BR-AUTH-06 · frontend BR-AUTH-F-04, BR-AUTH-F-07 |
| **Pruebas** | [`test/HU02_jeff/logout.unit.test.ts`](test/HU02_jeff/logout.unit.test.ts) — 6 casos sobre `auth.service.ts:234-240` y `auth.repository.ts:89-98`; 5 casos de navegación en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: El logout incrementa la versión del token
  Dado que estoy autenticado con un JWT cuyo tokenVersion es N
  Cuando envío POST /auth/logout con la cabecera Authorization Bearer
  Entonces recibo 200 con el mensaje Session closed
  Y app_user.token_version pasa a N mas 1 en la base de datos

Escenario: El JWT viejo queda invalidado
  Dado que cerré sesión y token_version ahora es N mas 1
  Cuando reutilizo el JWT anterior contra cualquier ruta protegida
  Entonces el authMiddleware compara payload.tokenVersion contra la base
  Y como no coinciden recibo 401 INVALID_TOKEN

Escenario: Petición protegida sin cabecera Authorization
  Dado que no envío la cabecera Authorization
  Cuando llamo a GET /auth/me
  Entonces recibo 401 MISSING_TOKEN

Escenario: El cliente descarta el token localmente
  Dado que pulso Cerrar sesión en la app
  Cuando AuthService.logout termina
  Entonces se llamó POST /auth/logout en modo best-effort sin bloquear la interfaz
  Y StorageService.clearSession borró la clave session_token
  Y la app navegó al login con offAllToLogin

Escenario: No se apilan dos rutas de login
  Dado que el POST /auth/logout responde 401 porque el token ya estaba invalidado
  Cuando el interceptor del ApiClient navega al login y además el botón navega al login
  Entonces toda navegación al login pasa por offAllToLogin
  Y no se destruye el LoginController de la página visible ni aparece tipeo fantasma
```

---

#### HU16 · Iniciar sesión con Google SSO institucional

**Como** alumno o docente, **quiero** entrar con mi cuenta Google de la universidad, **para** no tener que recordar otra contraseña.

| | |
|:---|:---|
| **Módulo** | [`src/modules/auth`](src/modules/auth) (`loginWithGoogle`) |
| **Endpoints** | `POST /auth/google` — público |
| **Reglas** | BR-AUTH-09 · dominios permitidos y códigos de error en [`specs/features/auth/auth.spec.md`](specs/features/auth/auth.spec.md) |
| **Pruebas** | [`test/HU16_jeff/auth.google-login.test.ts`](test/HU16_jeff/auth.google-login.test.ts) — 9 casos |

**Criterios de aceptación**

```gherkin
Escenario: Correo fuera del dominio institucional
  Dado un idToken de Google cuyo correo no termina en aloe.ulima.edu.pe ni en ulima.edu.pe
  Cuando envío POST /auth/google
  Entonces recibo 403 INVALID_DOMAIN

Escenario: Correo institucional sin cuenta en la app
  Dado un idToken válido de un correo del dominio permitido
  Pero ningún app_user vinculado a ese correo
  Cuando envío POST /auth/google
  Entonces recibo el error USER_NOT_FOUND

Escenario: idToken inválido
  Dado un idToken que no verifica o que no trae correo
  Cuando envío POST /auth/google
  Entonces recibo 401 INVALID_TOKEN
  Y un fallo de base de datos en esta ruta responde 500 INTERNAL_ERROR, nunca un usuario mock
```

---

#### HU20 · Restablecer la contraseña con OTP

**Como** usuario que olvidó su contraseña, **quiero** recibir un código de un solo uso en mi correo institucional y establecer una contraseña nueva, **para** recuperar el acceso sin pedirle nada a nadie.

| | |
|:---|:---|
| **Módulo** | [`src/modules/auth`](src/modules/auth) — `password-reset` |
| **Endpoints** | `POST /auth/password-reset/request` · `POST /auth/password-reset/confirm` · `POST /auth/password-reset/request-me` |
| **Reglas** | BR-AUTH-11 · [`specs/features/auth/auth.spec.md`](specs/features/auth/auth.spec.md)`:106-124`. OTP de 6 dígitos, hash SHA-256, 30 minutos, máximo 5 intentos, un solo uso, 3 tokens por hora, contraseña nueva de 8 caracteres mínimo, bcrypt coste 10 |
| **Pruebas** | [`test/HU20_jeff/password-reset.logic.test.ts`](test/HU20_jeff/password-reset.logic.test.ts) — 14 casos; 17 casos de validadores en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: La solicitud siempre responde lo mismo
  Dado cualquier identificador, exista o no la cuenta
  Cuando envío POST /auth/password-reset/request
  Entonces recibo 200 con el mensaje genérico de que si la cuenta existe se envió un código
  Porque distinguir los casos permitiría enumerar usuarios

Escenario: Rate limit silencioso
  Dado que ya se crearon 3 tokens para ese usuario en la última hora
  Cuando solicito otro código
  Entonces recibo el mismo 200 genérico y no se envía correo

Escenario: Al emitir un token nuevo se invalidan los anteriores
  Dado que existía un token activo del usuario
  Cuando se emite uno nuevo
  Entonces el anterior se marca como usado

Escenario: Confirmación exitosa
  Dado un OTP de 6 dígitos válido, no expirado y no usado
  Y una contraseña nueva de al menos 8 caracteres
  Cuando envío POST /auth/password-reset/confirm
  Entonces se hashea con bcryptjs coste 10 y se actualiza password_hash
  Y se incrementa token_version, cerrando todas las sesiones abiertas
  Y el token se marca como usado

Escenario: Código inválido, expirado, usado o con intentos agotados
  Dado cualquiera de esos cuatro casos, o una cuenta inexistente
  Cuando envío la confirmación
  Entonces recibo 400 INVALID_RESET_CODE con el mensaje Código inválido o expirado
  Y el campo attempts del token se incrementa y se persiste

Escenario: Contraseña débil
  Dado que la nueva contraseña tiene menos de 8 caracteres
  Cuando envío la confirmación
  Entonces recibo 400 WEAK_PASSWORD

Escenario: Solicitud desde la sesión activa
  Dado que estoy autenticado
  Cuando envío POST /auth/password-reset/request-me
  Entonces recibo mi correo institucional enmascarado

Escenario: Solo se persiste el hash del OTP
  Dado que se genera un OTP de 6 dígitos con un generador criptográfico
  Entonces en password_reset_token solo se guarda su SHA-256 en hexadecimal
  Y la política es 30 minutos de expiración, máximo 5 intentos y un solo uso
```

Los cuatro motivos de fallo colapsan a propósito en un único `INVALID_RESET_CODE`:
distinguirlos convertiría el endpoint en un oráculo de cuentas existentes.

---

#### HU05 · Seleccionar especialidad principal y de interés

**Como** alumno, **quiero** fijar mi especialidad principal y las que me interesan, **para** que la malla y el perfil marquen los cursos que me tocan y la app deje de preguntármelo en cada arranque.

| | |
|:---|:---|
| **Módulo** | [`src/modules/academic-profile`](src/modules/academic-profile) — la escritura vive en [`academic-profile.service.ts`](src/modules/academic-profile/academic-profile.service.ts)`:47-93` |
| **Endpoints** | `GET /academic-profile/me` · `GET /academic-profile/careers` · `GET /academic-profile/specialties` · `PUT /academic-profile/me/specialties` |
| **Reglas** | BR-AP-01 a BR-AP-06 · [`specs/features/academic-profile/academic-profile.spec.md`](specs/features/academic-profile/academic-profile.spec.md)`:18-53`. La unicidad de la principal la impone el índice `uq_student_specialty_active_primary`, no el servicio |
| **Pruebas** | [`test/HU05_mel/especialidades.cajablanca.test.ts`](test/HU05_mel/especialidades.cajablanca.test.ts) — 10 casos, `V(G)=14`, caminos C1-C9 anotados en la cabecera; el repositorio es un espía que captura cada escritura |

**Criterios de aceptación**

```gherkin
Escenario: Guardar principal e intereses
  Dado que estoy autenticado con rol student, delegate o subdelegate
  Y la principal y los intereses existen y pertenecen a mi carrera
  Cuando envío PUT /academic-profile/me/specialties
  Entonces se desactivan todas mis especialidades previas
  Y se hace upsert de la principal con selectionType primary
  Y un upsert por cada interés con selectionType interest
  Y specialty_setup_completed queda en true

Escenario: La principal no puede repetirse como interés
  Dado que envío el mismo specialtyId en primarySpecialtyId y en interestSpecialtyIds
  Cuando el servicio valida la entrada
  Entonces recibo 409 DUPLICATE_PRIMARY
  Y no se ejecuta ninguna escritura

Escenario: Especialidad de otra carrera
  Dado un specialtyId que existe pero pertenece a otra carrera
  Cuando el servicio valida la pertenencia
  Entonces recibo 404 SPECIALTY_NOT_FOUND
  Porque se comprueba specialtyExists y después specialtyBelongsToCareer

Escenario: Intereses repetidos en el body
  Dado que envío dos veces el mismo specialtyId como interés
  Cuando el servicio normaliza la lista con un Set
  Entonces se hace un solo upsert para esa especialidad

Escenario: Elegir no elegir
  Dado que envío primarySpecialtyId nulo y la lista de intereses vacía
  Cuando se procesa la petición
  Entonces solo se desactivan las anteriores y setupComplete queda en true
  Porque el flag distingue todavía no configuró de configuró y prefirió no elegir

Escenario: Colisión de unicidad en la base de datos
  Dada una escritura que viola uq_student_specialty_active_primary
  Cuando el servicio reconoce el error 23505
  Entonces responde 409 DUPLICATE_PRIMARY
  Y cualquier otro error se propaga sin envolver

Escenario: Perfil inexistente
  Dado un JWT cuyo userId no tiene perfil
  Cuando envío PUT /academic-profile/me/specialties
  Entonces recibo 404 USER_NOT_FOUND y no se toca la base de datos
```

La validación es total antes de escribir: el bucle comprueba **todas** las especialidades del lote
y recién entonces empieza el bloque de escritura. Una especialidad inválida en la posición 3 no
deja las dos primeras guardadas.

---

#### HU19 · Malla curricular con progreso real y simulación

**Como** alumno, **quiero** ver mi malla con lo que aprobé, lo que tengo desbloqueado y poder simular «¿y si apruebo esto?», **para** planificar mi matrícula sin tocar mis datos reales.

| | |
|:---|:---|
| **Módulo** | [`src/modules/curriculum`](src/modules/curriculum) — cubre HU03, HU04 y HU19 |
| **Endpoints** | `GET /curriculum/me` · `PUT /curriculum/me/simulation` · `DELETE /curriculum/me/simulation/:curriculumCourseId` |
| **Reglas** | BR-CU-01, BR-CU-02, BR-CU-03 · [`specs/features/curriculum/curriculum.spec.md`](specs/features/curriculum/curriculum.spec.md)`:20-46`. Enum `curriculum_simulation_status` en [`src/db/schema/schema.ts`](src/db/schema/schema.ts)`:21-25` |
| **Pruebas** | [`test/HU03_julio/malla.test.ts`](test/HU03_julio/malla.test.ts) y [`test/HU04_julio/simulacion.test.ts`](test/HU04_julio/simulacion.test.ts) — 36 casos; 55 casos de dominio en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Obtener la malla del alumno
  Dado que estoy autenticado
  Cuando consulto GET /curriculum/me
  Entonces recibo los cursos con id, code, name, credits, level, row, category,
    prerequisites, specialties y externalFaculty
  Y la lista de especialidades únicas de mi carrera
  Y las simulaciones registradas para mí

Escenario: Un curso está desbloqueado
  Dado un curso con marcador de ciclo y prerrequisitos concretos
  Cuando isCourseUnlocked evalúa el conjunto de aprobados
  Entonces exige que TODOS los obligatorios hasta ese ciclo estén aprobados
  Y que todos los prerrequisitos concretos estén en el conjunto de aprobados

Escenario: Prerrequisito que no existe en el catálogo
  Dado un curso cuyo prerrequisito no está en el grafo de la malla
  Cuando se evalúa satisfiesCoursePrerequisites
  Entonces devuelve falso y el curso queda bloqueado

Escenario: Los electivos nunca cuentan para el marcador de ciclo
  Dado un electivo aprobado de un nivel anterior
  Cuando se evalúa hasCompletedMandatoryCycles
  Entonces ese electivo se excluye del cálculo

Escenario: Registrar una simulación
  Dado un curriculumCourseId de mi malla
  Cuando envío PUT /curriculum/me/simulation con status planned o simulated_completed
  Entonces se inserta o actualiza student_curriculum_simulation
  Y no se modifica matrícula, notas ni progreso real

Escenario: Quitar una simulación devuelve el estado calculado
  Dado un curso con simulación registrada
  Cuando envío DELETE /curriculum/me/simulation con ese curriculumCourseId
  Entonces se elimina la fila y el curso vuelve a su estado derivado del progreso real

Escenario: El progreso real pinta los cursos completados
  Dado que el backend envía courseProgress con approvedLevels y approvedCourseIds
  Cuando la app calcula los cursos aprobados para el progreso
  Entonces usa la UNIÓN de ambos campos
  Y approvedLevels es un PISO y nunca un techo
  Y un curso aprobado del propio ciclo del alumno o de uno superior también se ve completado
```

```mermaid
stateDiagram-v2
  [*] --> Bloqueado
  Bloqueado --> Disponible : prerrequisitos y marcador de ciclo satisfechos
  Disponible --> EnCurso : enrollment status active
  EnCurso --> Aprobado : student_course_progress approved
  EnCurso --> Desaprobado : status failed
  EnCurso --> Retirado : status withdrawn
  Desaprobado --> Disponible : puede volver a llevarse
  Retirado --> Disponible : puede volver a llevarse
  Disponible --> SimuladoPlaneado : PUT simulation planned
  Disponible --> SimuladoCompletado : PUT simulation simulated_completed
  Aprobado --> SimuladoDisponible : PUT simulation simulated_available
  SimuladoPlaneado --> Disponible : DELETE simulation
  SimuladoCompletado --> Disponible : DELETE simulation
  SimuladoDisponible --> Aprobado : DELETE simulation
  Aprobado --> [*]
```

---

#### HU06 · Registrar notas personales por evaluación

**Como** alumno, **quiero** registrar mis propias notas por evaluación de cada curso, **para** proyectar cómo voy sin depender de que el profesor publique las oficiales.

| | |
|:---|:---|
| **Módulo** | [`src/modules/grades`](src/modules/grades) — persiste en `simulated_grades`, **nunca** en `student_score` |
| **Endpoints** | `GET /grades/me/courses` · `GET /grades/me/notes` · `POST /grades/me/notes` · `DELETE /grades/me/notes/:sectionId/:assessmentId` |
| **Reglas** | BR-GRADES-01, BR-GRADES-03 · [`specs/features/grades/grades.spec.md`](specs/features/grades/grades.spec.md)`:17-28` |
| **Pruebas** | [`test/HU06_sam/notas.cajablanca.test.ts`](test/HU06_sam/notas.cajablanca.test.ts) y [`test/HU06_sam/grades.logic.test.ts`](test/HU06_sam/grades.logic.test.ts) — 12 casos; 13 en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Guardar notas del alumno autenticado
  Dado que estoy autenticado con rol student, delegate o subdelegate
  Cuando envío POST /grades/me/notes con los cursos y sus notas
  Entonces el backend resuelve el enrollment_id desde el studentId del JWT y el sectionId del body
  Y persiste cada nota con upsert ON CONFLICT DO UPDATE

Escenario: Nota de una sección donde el alumno no está matriculado
  Dado que el body incluye un sectionId sin matrícula del alumno
  Cuando saveNotas recorre los cursos y findEnrollmentId devuelve nulo
  Entonces esa nota se descarta en silencio con continue
  Y la respuesta HTTP sigue siendo 200

Escenario: Token docente rechazado
  Dado que estoy autenticado con un JWT de rol teacher
  Cuando llamo a cualquier ruta de grades
  Entonces recibo 403 FORBIDDEN por requireRole student delegate subdelegate

Escenario: Una evaluación ya registrada no vuelve a ofrecerse
  Dado que ya registré la evaluación Parcial 1 del sílabo del curso
  Cuando abro el modal para agregar una nota
  Entonces Parcial 1 no aparece en el desplegable de evaluaciones disponibles
```

El descarte silencioso es una decisión, no un bug: el cliente envía el lote completo
de la pantalla y una sección ajena en el body no debe tumbar el guardado del resto.
Está documentado en la cabecera del test de caja blanca.

---

#### HU07 · Visualizar el promedio ponderado del curso

**Como** alumno, **quiero** ver el promedio ponderado del curso y cuánto peso llevo evaluado, **para** saber en qué situación estoy antes del cierre del ciclo.

| | |
|:---|:---|
| **Módulo** | [`src/modules/grades`](src/modules/grades) — lógica pura en [`grades.logic.ts`](src/modules/grades/grades.logic.ts)`:3-19` |
| **Endpoints** | `POST /grades/me/calculate` |
| **Reglas** | BR-GRADES-04 · `valor` en `[0,20]`, `peso` en `[0,100]`, validados por Zod antes del servicio |
| **Pruebas** | [`test/HU07_sam/promedio.unitarias.test.ts`](test/HU07_sam/promedio.unitarias.test.ts) — 13 casos (PU-C1, PU-C2, PU-C3); 6 en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Cálculo del promedio ponderado en el backend
  Dado que envío POST /grades/me/calculate con una lista de valor y peso
  Cuando el backend ejecuta calcularPromedioPonderado
  Entonces devuelve promedio y sumaPesos
  Y promedio es la suma de valor por peso dividido entre 100

Escenario: Lista de notas vacía
  Dado que envío una lista de notas vacía
  Cuando se calcula el promedio
  Entonces el resultado es 0

Escenario: Suma de pesos para la barra de progreso
  Dado que registré notas con pesos 30 y 20
  Cuando se llama a sumaDePesos
  Entonces devuelve 50, que alimenta la barra de suma de pesos sobre 100

Escenario: Validación Zod antes de llegar al servicio
  Dado que envío una nota con valor 21 o con peso 120
  Cuando el request pasa por calculateAverageSchema
  Entonces se rechaza antes de ejecutar el cálculo

Escenario: El frontend no calcula promedios
  Dado que cambio una nota en la calculadora
  Cuando la pantalla recalcula el promedio
  Entonces la app delega el cálculo en POST /grades/me/calculate
  Y no realiza el promedio localmente ni almacena las notas solo en el dispositivo
```

El guard `if (notas.length === 0) return 0;` de [`grades.logic.ts`](src/modules/grades/grades.logic.ts)`:9`
lleva un `// Stryker disable next-line ConditionalExpression`: son los dos únicos
mutantes equivalentes ignorados en toda la campaña de mutación del equipo.

---

#### HU09 · Horario semanal y evaluaciones del ciclo

**Como** alumno matriculado, **quiero** ver mis clases y mis evaluaciones en una sola rejilla semanal, **para** saber qué me toca esta semana sin cruzar a mano el horario del portal con los sílabos.

| | |
|:---|:---|
| **Módulo** | [`src/modules/schedule`](src/modules/schedule) — las semanas se resuelven **una sola vez por request** en [`schedule.service.ts`](src/modules/schedule/schedule.service.ts)`:73` y se pasan a cada método |
| **Endpoints** | `GET /schedule/me/sessions` · `GET /schedule/me/assessments` · `GET /schedule/me/load` |
| **Reglas** | BR-SCH-01 a BR-SCH-04 · [`specs/features/schedule/schedule.spec.md`](specs/features/schedule/schedule.spec.md)`:20,27,36,43` · `HIGH_LOAD_MIN_ASSESSMENTS = 3` en [`schedule.logic.ts`](src/modules/schedule/schedule.logic.ts)`:73` |
| **Pruebas** | [`test/HU09_nehemias/alumnoSchedule.test.ts`](test/HU09_nehemias/alumnoSchedule.test.ts) 27 casos (caja blanca sobre `mergeScheduleData`, `CC = 9`, caminos C1-C10 anotados en el propio código) y [`test/HU09_nehemias/schedule.repository.test.ts`](test/HU09_nehemias/schedule.repository.test.ts) 13 — **40 en total** |

**Criterios de aceptación**

```gherkin
Escenario: Solo el período activo
  Dado que tengo matrícula en dos ciclos y solo uno tiene is_active
  Cuando consulto GET /schedule/me/sessions
  Entonces solo recibo los bloques de las secciones del ciclo activo
  Porque el filtro sube por course_offering.academic_period_id hasta academic_period.is_active

Escenario: Fecha de una evaluación a partir de su semana
  Dada una evaluación del sílabo asignada a la semana X de una sección que se dicta el día D
  Cuando consulto GET /schedule/me/assessments
  Entonces su fecha es el inicio de la semana X más D menos 1 días
  Y si la sección tiene varias sesiones esa semana, la evaluación se asocia solo a la primera

Escenario: Semana de alta carga
  Dado que una semana académica concentra 3 evaluaciones distintas
  Cuando consulto GET /schedule/me/load
  Entonces esa semana llega con isHighLoad en true
  Y con 2 evaluaciones llega en false, porque el umbral es mayor o igual a 3

Escenario: Las semanas salen de la base de datos, no del código
  Dado el período académico activo
  Cuando el servicio resuelve las semanas
  Entonces usa las filas de academic_week de ese período
  Y si no hay filas, deriva semanas de 7 días desde start_date y end_date del período
  Y si no hay período activo devuelve lista vacía, y cada endpoint degrada sin lanzar

Escenario: Derivación de semanas de un ciclo publicado
  Dado un período que va del 2026-08-24 al 2026-12-14
  Cuando se ejecuta deriveWeeksFromPeriodDates
  Entonces salen 16 semanas de 7 días exactos
  Y la última empieza el 2026-12-07, nunca después de end_date

Escenario: Alumno sin secciones
  Dado un alumno sin matrícula en el período activo
  Cuando consulto GET /schedule/me/sessions
  Entonces recibo la rejilla vacía y no un error
```

> ⚠️ **27 de los 40 casos prueban código que ya no se ejecuta.** `mergeScheduleData`,
> `academicWeekOf` y `validateSchedulePayload` **no los importa nada bajo `src/`**: el único
> símbolo de `schedule.logic.ts` que consume `schedule.service.ts` es `isHighLoadCount`
> ([`schedule.service.ts`](src/modules/schedule/schedule.service.ts)`:3,274`). `academicWeekOf`
> además conserva el calendario fijo de 16 semanas desde el 2026-04-06 que BR-SCH-04 derogó. La
> suite es rigurosa; lo que prueba dejó de estar en el camino de una request.

---

#### HU24 · Horario interactivo del docente

**Como** docente, **quiero** ver mi semana con clases, asesorías y evaluaciones, y saber en qué secciones me falta cargar notas, **para** ordenar mi ciclo sin pedirle la información a nadie.

| | |
|:---|:---|
| **Módulo** | [`teacherSchedule.logic.ts`](src/modules/schedule/teacherSchedule.logic.ts), dentro de [`src/modules/schedule`](src/modules/schedule) |
| **Endpoints** | `GET /schedule/teacher/sessions` · `GET /schedule/teacher/assessments` · `GET /schedule/teacher/sections/:sectionId/assessments-status` · `POST /schedule/teacher/sections/:sectionId/assessments/:assessmentId/notify-grades` — los cuatro con `requireRole("teacher")` |
| **Reglas** | BR-SCH-05 · [`specs/features/schedule/schedule.spec.md`](specs/features/schedule/schedule.spec.md)`:52-55`. Las dos últimas rutas **no tienen regla propia en la spec** |
| **Pruebas** | [`test/HU24_nehemias/docenteSchedule.test.ts`](test/HU24_nehemias/docenteSchedule.test.ts) — 33 casos: caja blanca sobre `resolveTeacherBlock` (`CC = 10`, caminos D1-D11), caja negra sobre `validateCourseBlockInput` (6 campos de entrada) y unitarias sobre `computeGradesStatus` |

**Criterios de aceptación**

```gherkin
Escenario: El horario docente se acota al período activo
  Dado un docente que dictó el ciclo anterior y vuelve a dictar en el actual
  Cuando consulta GET /schedule/teacher/sessions
  Entonces solo recibe las secciones donde es titular o JP del período con is_active
  Porque el predicado titular o JP por sí solo no distingue ciclos

Escenario: Bloque de clase regular
  Dado un bloque con kind class
  Cuando se resuelve su metadata
  Entonces el título es el nombre del curso y el bloque no lleva badge

Escenario: Bloque de evaluación sin código
  Dado un bloque con kind assessment y assessmentCode vacío
  Cuando se resuelve su metadata
  Entonces el badge cae al literal EVAL

Escenario: Asesoría extra y su modalidad
  Dado un bloque con kind advising e isExtra verdadero
  Cuando se resuelve su metadata
  Entonces el badge dice EXTRA
  Y el subtítulo dice Virtual, Híbrida o Presencial según advisingModality

Escenario: Entrada incompleta
  Dado un payload sin delegateName o con un gradesUploadStatus fuera del enum
  Cuando se ejecuta validateCourseBlockInput
  Entonces devuelve valid en false con un error por cada campo, no solo por el primero

Escenario: Estado de carga de notas de una sección
  Dada una sección con N matrículas y M notas cargadas
  Cuando se ejecuta computeGradesStatus
  Entonces devuelve Sin cargar si N es cero o si M es cero
  Y Completo si M es mayor o igual que N
  Y Carga parcial en el resto de los casos

Escenario: Bloque nulo
  Dado un input nulo o indefinido
  Cuando se llama a resolveTeacherBlock
  Entonces lanza un Error con mensaje explícito, en vez de devolver metadata vacía
```

`computeGradesStatus` es lo que alimenta el botón de notificar notas: `resolveTeacherBlock` solo
habilita `canNotifyGrades` cuando el estado es `Completo` o `Carga parcial`.

---

#### HU14 · Contactos de la sección

**Como** alumno, **quiero** ver quién dicta mi sección, quién es el JP, quiénes son los delegados y quiénes mis compañeros, **para** poder escribirle a la persona correcta sin pedir el dato por WhatsApp.

| | |
|:---|:---|
| **Módulo** | [`src/modules/course-detail`](src/modules/course-detail) |
| **Endpoints** | `GET /course-detail/sections/:sectionId/contacts` |
| **Reglas** | BR-COURSE-DETAIL-01, BR-COURSE-DETAIL-03 y BR-COURSE-DETAIL-05 · [`specs/features/course-detail/course-detail.spec.md`](specs/features/course-detail/course-detail.spec.md)`:17-33` |
| **Pruebas** | [`test/HU14_mel/contactos.cajablanca.test.ts`](test/HU14_mel/contactos.cajablanca.test.ts) 5 · [`.cajanegra`](test/HU14_mel/contactos.cajanegra.test.ts) 3 · [`.unit`](test/HU14_mel/contactos.unit.test.ts) 4 — **12 casos** sobre `CourseDetailService.getContacts`, `splitName` y `sectionIdParamSchema` |

**Criterios de aceptación**

```gherkin
Escenario: Contactos completos de la sección
  Dado que estoy matriculado en la sección y autenticado
  Cuando consulto GET /course-detail/sections/:sectionId/contacts
  Entonces recibo docente, jefePractica y la lista de alumnos
  Y cada alumno trae code, lastName, firstName, email, career_id y roleInSection

Escenario: La sección no tiene JP
  Dada una sección cuyo jp_id es nulo
  Cuando consulto los contactos
  Entonces jefePractica llega en null y la clave sigue presente en la respuesta

Escenario: El rol dentro de la sección sale de section_representative
  Dado un alumno con position delegate, otro con subdelegate y otro sin fila
  Cuando se arman los contactos
  Entonces sus roleInSection son delegado, subdelegado y estudiante

Escenario: Partir el nombre completo
  Dado un full_name con coma
  Cuando se ejecuta splitName
  Entonces lastName es lo anterior a la coma y firstName lo posterior
  Y sin coma y con más de dos palabras, las dos primeras cuentan como apellidos

Escenario: Sección vacía
  Dada una sección sin docente y sin alumnos
  Cuando consulto los contactos
  Entonces recibo docente en null y alumnos como lista vacía, con la misma forma de respuesta

Escenario: Token docente rechazado
  Dado un JWT de rol teacher
  Cuando llamo a cualquier ruta de course-detail
  Entonces recibo 403 FORBIDDEN, porque el módulo entero exige rol de alumno

Escenario: sectionId inválido
  Dado un sectionId que no es entero positivo
  Cuando la ruta valida el parámetro con sectionIdParamSchema
  Entonces se rechaza antes de llegar al servicio
```

> ⚠️ **Los 12 casos prueban un servicio que no sirve el endpoint.** El handler montado en
> `GET /sections/:sectionId/contacts` es inline en
> [`course-detail.routes.ts`](src/modules/course-detail/course-detail.routes.ts)`:173`, con su
> propio SQL: es el que añade `jefePractica`, el carnet de networking y
> `representantesPendientes`. `CourseDetailService.getContacts` quedó como implementación
> paralela. Cerrar esa brecha es parte de la deuda de «SQL en rutas».

---

#### HU08 · Alertas de riesgo académico y de alta carga

**Como** alumno, **quiero** recibir alertas cuando mi promedio personal me pone en riesgo o cuando una semana se me carga de evaluaciones, **para** reaccionar a tiempo en vez de enterarme al final del ciclo.

| | |
|:---|:---|
| **Módulo** | [`src/modules/alerts`](src/modules/alerts) — umbrales en [`alerts.logic.ts`](src/modules/alerts/alerts.logic.ts)`:6,8,11,15` |
| **Endpoints** | `GET /alerts/me` · `PUT /alerts/me/:alertId/read` · alimentado por `GET /schedule/me/load` |
| **Reglas** | BR-ALERT-01 a BR-ALERT-07, BR-SCH-03 · `ACADEMIC_RISK_MIN_PROGRESS = 55`, `ACADEMIC_RISK_MAX_AVERAGE = 10.5`, `PASSING_GRADE = 10.5`, `CRITICAL_REQUIRED_ON_REMAINING = 15`, alta carga con 3 o más evaluaciones en una `academic_week` |
| **Pruebas** | [`test/HU08_julio/alertas.test.ts`](test/HU08_julio/alertas.test.ts) y [`test/HU08_julio/alerts.logic.test.ts`](test/HU08_julio/alerts.logic.test.ts) — 66 casos, caja blanca sobre `getAlertsForStudent()` con complejidad ciclomática ≥ 5 |

**Criterios de aceptación**

```gherkin
Escenario: Alerta de riesgo académico
  Dado un curso donde la suma de pesos ya calificados es 60
  Y el promedio personal ponderado es 9.8
  Cuando consulto GET /alerts/me
  Entonces se genera una alerta de tipo academic_risk titulada Riesgo Académico
  Porque gradedWeight es mayor que 55 y el promedio menor que 10.5, ambos bordes estrictos

Escenario: El borde exacto no dispara la alerta
  Dado un curso con gradedWeight exactamente 55 y promedio exactamente 10.5
  Cuando consulto GET /alerts/me
  Entonces NO se genera alerta de riesgo académico

Escenario: Riesgo crítico a media asignatura
  Dado un curso con al menos una nota registrada y con peso todavía sin calificar
  Y donde la nota requerida en el peso restante es 17
  Cuando consulto GET /alerts/me
  Entonces se emite SOLO la alerta Riesgo Crítico
  Y no se emite además la de riesgo académico, para no duplicar el aviso

Escenario: Alerta de alta carga
  Dado que en la semana académica 7 tengo 3 evaluaciones programadas
  Cuando consulto GET /alerts/me
  Entonces se genera una alerta high_load titulada Alta Carga Semana 7

Escenario: Deduplicación por título
  Dado que ya existe una alerta con el título Alta Carga Semana 7
  Cuando vuelvo a consultar GET /alerts/me
  Entonces findAlertByTitle la encuentra y no se crea una segunda alerta

Escenario: Marcar una alerta ajena como leída
  Dado un alertId que pertenece a otro alumno
  Cuando envío PUT /alerts/me con ese alertId y read
  Entonces recibo 404 ALERT_NOT_FOUND
  Y si el alertId no es un entero recibo 400 INVALID_ALERT_ID
```

```mermaid
flowchart TD
  START(["GET /alerts/me"]) --> AGG["aggregateCourseScores por curso"]
  AGG --> CRIT{"gradedWeight mayor que 0 y peso restante mayor que 0 y requerido mayor que 15?"}
  CRIT -- si --> AC["alerta Riesgo Critico"]
  CRIT -- no --> RISK{"gradedWeight mayor que 55 y promedio menor que 10.5?"}
  RISK -- si --> AR["alerta Riesgo Academico"]
  RISK -- no --> NOALERT["sin alerta de curso"]
  AC --> DEDUP{"findAlertByTitle encuentra el titulo?"}
  AR --> DEDUP
  DEDUP -- si --> SKIP["no se duplica"]
  DEDUP -- no --> INS["INSERT en alert"]
  NOALERT --> LOAD{"semana con 3 o mas evaluaciones?"}
  SKIP --> LOAD
  INS --> LOAD
  LOAD -- si --> HL["alerta Alta Carga Semana n"]
  LOAD -- no --> OUT(["200 con las alertas"])
  HL --> OUT
```

---

#### HU10 · Anuncios de sección como delegado o subdelegado

**Como** delegado o subdelegado de una sección, **quiero** publicar, editar y eliminar anuncios de mi sección, **para** comunicar avisos académicos a mis compañeros dentro de la app.

| | |
|:---|:---|
| **Módulo** | [`src/modules/section-management`](src/modules/section-management) |
| **Endpoints** | `POST /section-management/sections/:sectionId/announcements` · `PUT /section-management/announcements/:id` · `DELETE /section-management/announcements/:id` · lectura del alumnado por `GET /course-detail/sections/:sectionId/announcements` |
| **Reglas** | BR-SECTION-MGMT-01, BR-SECTION-MGMT-04 · `title` ≤ 150 y `message` ≤ 5000 caracteres ([`docs/specs/api-contracts.md`](docs/specs/api-contracts.md)) |
| **Pruebas** | [`test/HU10_mel/anuncios.cajablanca.test.ts`](test/HU10_mel/anuncios.cajablanca.test.ts), [`anuncios.cajanegra.test.ts`](test/HU10_mel/anuncios.cajanegra.test.ts), [`anuncios.unit.test.ts`](test/HU10_mel/anuncios.unit.test.ts), [`section-management.service.test.ts`](test/HU10_mel/section-management.service.test.ts) — 16 casos; 12 en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Publicar un anuncio en mi sección
  Dado que soy delegado activo de la sección
  Cuando envío POST del anuncio con title y message
  Entonces el backend deriva el section_representative_id desde mi JWT y la sección
  Y crea la fila en announcement
  Y responde 201 con el anuncio creado

Escenario: El frontend nunca envía el id de representante
  Dado el formulario de creación de anuncio
  Cuando se envía el body
  Entonces solo viajan title y message
  Porque el section_representative_id se deriva en el backend

Escenario: Alumno regular intenta publicar
  Dado que mi rol técnico es student
  Cuando llamo al endpoint de creación de anuncios
  Entonces recibo 403 FORBIDDEN por requireRole delegate subdelegate

Escenario: Editar un anuncio ajeno
  Dado un anuncio publicado por otro representante
  Cuando envío el PUT de ese anuncio
  Entonces recibo 403 ANNOUNCEMENT_FORBIDDEN

Escenario: Eliminar es soft delete
  Dado un anuncio propio y activo
  Cuando envío el DELETE de ese anuncio
  Entonces la fila queda con is_active en falso
  Y no se borra físicamente

Escenario: Anuncio inexistente o ya inactivo
  Dado un id que no existe o cuyo anuncio ya está inactivo
  Cuando intento editarlo o eliminarlo
  Entonces recibo 404 ANNOUNCEMENT_NOT_FOUND

Escenario: Listado para el alumnado
  Dado que soy alumno matriculado en la sección
  Cuando consulto los anuncios de la sección por course-detail
  Entonces los veo ordenados del más reciente al más antiguo
```

El borrado es lógico porque `announcement.section_representative_id` es una FK sin
cascada y `section_representative` **nunca** se borra: reasignar un cargo es poner
`is_active = false`.

---

#### HU11 · Estadísticas agregadas del salón

**Como** delegado o subdelegado, **quiero** ver el promedio del salón, el porcentaje de aprobados y la distribución de notas, **para** hacer seguimiento del curso sin ver las notas individuales de mis compañeros.

| | |
|:---|:---|
| **Módulo** | [`section-statistics.logic.ts`](src/modules/section-management/section-statistics.logic.ts) |
| **Endpoints** | `GET /section-management/sections/:sectionId/statistics` — `requireRole("delegate","subdelegate")` |
| **Reglas** | BR-SECTION-MGMT-05 · `PASSING_GRADE = 10.5`; histograma por nota **redondeada** en rangos 0-10, 11-13, 14-16, 17-20 |
| **Pruebas** | [`test/HU11_ronald/section-statistics.logic.test.ts`](test/HU11_ronald/section-statistics.logic.test.ts) — 7 casos |

**Criterios de aceptación**

```gherkin
Escenario: Estadísticas reales desde las notas oficiales
  Dado que soy delegado activo de la sección
  Cuando consulto las estadísticas de la sección
  Entonces recibo promedioGeneral, porcentajeAprobados y los cuatro rangos
  Y cada promedio por alumno se calcula sobre lo YA calificado

Escenario: Solo cuentan los alumnos con al menos una nota
  Dado un salón donde tres alumnos tienen notas y dos no tienen ninguna
  Cuando se calcula promedioGeneral
  Entonces solo se promedian los tres alumnos con nota

Escenario: Salón sin ninguna nota cargada
  Dado que ningún alumno de la sección tiene notas
  Cuando consulto las estadísticas
  Entonces todos los campos valen 0

Escenario: Histograma por nota redondeada
  Dado un alumno cuyo promedio ponderado es 13.6
  Cuando se arma el histograma
  Entonces cuenta en el rango 14 a 16, porque se usa la nota REDONDEADA

Escenario: Nunca se exponen notas individuales
  Dado que soy delegado
  Cuando consulto las estadísticas
  Entonces la respuesta solo contiene agregados, sin identificar a ningún alumno
```

---

#### HU17 · Ver las asesorías de la sección y confirmar asistencia — con HU13

**Como** alumno, **quiero** confirmar si asistiré a una asesoría de mis cursos y poder retirar esa confirmación, **para** que el docente sepa con cuántos alumnos contará.

| | |
|:---|:---|
| **Módulo** | [`src/modules/advising/student`](src/modules/advising/student) — cubre HU13 y HU17 |
| **Endpoints** | `GET /advising/section/:sectionId` · `POST /advising/:sessionId/rsvp` · `DELETE /advising/:sessionId/rsvp` |
| **Reglas** | BR-AS-01, BR-AS-03, BR-AS-04, BR-AS-05 (tabla de `isSessionPast`), BR-AS-06 · [`specs/features/advising-student/advising-student.spec.md`](specs/features/advising-student/advising-student.spec.md) |
| **Pruebas** | [`test/HU13_ronald/student-advising.cajablanca.test.ts`](test/HU13_ronald/student-advising.cajablanca.test.ts), [`.cajanegra`](test/HU13_ronald/student-advising.cajanegra.test.ts), [`.unit`](test/HU13_ronald/student-advising.unit.test.ts) — 50 casos; 10 de widget en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Confirmar asistencia
  Dado que participo del curso de la asesoría por una matrícula activa
  Cuando envío el POST de rsvp
  Entonces se inserta la fila con ON CONFLICT sobre sesión y alumno DO NOTHING
  Y recibo 200 con el id, los asistentes y myRsvp verdadero

Escenario: Confirmar dos veces es idempotente
  Dado que ya confirmé mi asistencia a esa asesoría
  Cuando vuelvo a enviar el POST de rsvp
  Entonces el conteo de asistentes no cambia

Escenario: Asesoría ya pasada
  Dado una asesoría extra cuya fecha es anterior a hoy
  Cuando intento confirmar asistencia
  Entonces recibo 409 SESSION_ALREADY_PAST

Escenario: Asesoría recurrente que ya terminó hoy
  Dado una asesoría recurrente cuyo día de la semana es hoy
  Y cuya hora de fin es anterior a la hora actual de Lima
  Cuando isSessionPast la evalúa
  Entonces devuelve verdadero y el listado la excluye

Escenario: Alumno que no participa del curso
  Dado un sessionId de una asesoría de un curso que no llevo
  Cuando intento confirmar asistencia
  Entonces recibo 404 SESSION_NOT_FOUND

Escenario: Docente intentando hacer RSVP
  Dado un JWT de rol teacher, que no lleva studentId
  Cuando llamo al POST o al DELETE de rsvp
  Entonces recibo 403 RSVP_STUDENT_ONLY

Escenario: Cancelar sin confirmación previa
  Dado que nunca confirmé asistencia
  Cuando envío el DELETE de rsvp
  Entonces la operación no hace nada y recibo myRsvp falso

Escenario: Actualización optimista en la app
  Dado que pulso Asistiré
  Cuando la petición está en curso
  Entonces el contador sube de inmediato y el botón queda bloqueado
  Y si la petición falla se revierte el estado y se muestra un error
```

> ⚠️ La spec del frontend menciona en un párrafo las rutas `POST/DELETE
> /advising-student/:id/rsvp`. **No existen.** Las reales son `/advising/:sessionId/rsvp`
> ([`student.routes.ts`](src/modules/advising/student/student.routes.ts)`:14,20`, montadas
> en `/` por [`advising/index.ts`](src/modules/advising/index.ts)`:7`). La propia spec
> da la ruta correcta en su tabla de cambios: es una inconsistencia interna del documento.

---

#### HU18 · Rol docente y asesorías extra

**Como** docente de una sección (profesor titular o jefe de práctica), **quiero** iniciar sesión y publicar asesorías extra para mi sección, **para** reforzar temas antes de las evaluaciones y saber cuántos alumnos asistirán.

| | |
|:---|:---|
| **Módulo** | [`src/modules/advising/teacher`](src/modules/advising/teacher) |
| **Endpoints** | `GET /advising/me/sections` · `GET /advising/me/sessions` · `POST /advising/me/sessions` · `DELETE /advising/me/sessions/:id` · `GET /advising/me/sessions/:id/attendees` — todas con `requireRole("teacher")` |
| **Reglas** | BR-ADV-01, BR-ADV-02, BR-ADV-03, BR-ADV-12, BR-ADV-13 ([`specs/features/advising/advising.spec.md`](specs/features/advising/advising.spec.md)) y BR-AUTH-12 ([`specs/features/auth/auth.spec.md`](specs/features/auth/auth.spec.md)`:125-151`) |
| **Pruebas** | [`test/HU18_jeff/advising.cajanegra.test.ts`](test/HU18_jeff/advising.cajanegra.test.ts), [`advising.logic.test.ts`](test/HU18_jeff/advising.logic.test.ts), [`asesorias.logic.test.ts`](test/HU18_jeff/asesorias.logic.test.ts) — 93 casos; 28 de validadores en el frontend. La rúbrica exige complejidad ciclomática mayor que 4 en `advising.logic.ts` |

**Criterios de aceptación**

```gherkin
Escenario: Login docente sin exigir matrícula
  Dado un app_user vinculado a teacher.user_id
  Y que ese código no corresponde a ningún perfil student
  Cuando envío POST /auth/login con código y contraseña
  Entonces recibo un JWT con teacherId, rol teacher y SIN studentId
  Y no se exige matrícula activa ni se consulta section_representative
  Y el user devuelto trae setupComplete verdadero fijo y la etiqueta del docente

Escenario: La etiqueta Profesor o JP se deriva de la sección
  Dado un teacher.id que aparece como jp_id de alguna sección
  Cuando se calcula su etiqueta global
  Entonces es JP, y en caso contrario es Profesor
  Porque no existe enum de tipo docente en la persona

Escenario: Publicar una asesoría extra en mi propia sección
  Dado que soy el titular o el JP de la sección
  Cuando envío el POST con sectionId, fecha, hora de inicio, hora de fin y modalidad
  Entonces se inserta con kind extra y el día de la semana derivado de la fecha
  Y recibo 201 con la sesión creada

Escenario: Publicar en una sección ajena
  Dado que no soy ni el titular ni el JP de esa sección
  Cuando intento crear la asesoría
  Entonces recibo 403 SECTION_FORBIDDEN

Escenario: Rango horario inválido y fecha fuera de rango
  Dado que la hora de inicio no es menor que la de fin
  Cuando creo la asesoría
  Entonces recibo 400 INVALID_TIME_RANGE
  Y si la fecha cae fuera del período académico activo recibo 400 DATE_OUT_OF_PERIOD
  Y si es anterior a hoy recibo 400 DATE_IN_PAST
  Y si no hay período activo recibo 409 NO_ACTIVE_PERIOD

Escenario: Solape con otra asesoría propia
  Dado que ya tengo una asesoría propia ese mismo día
  Y los intervalos se cruzan
  Cuando creo la nueva asesoría
  Entonces recibo 409 ADVISING_OVERLAP

Escenario: Ubicación obligatoria según modalidad
  Dado modalidad classroom sin aula
  Cuando creo la asesoría
  Entonces recibo 400 MISSING_LOCATION
  Y lo mismo con modalidad virtual sin enlace, o hybrid sin ninguno de los dos

Escenario: Solo se borran las asesorías extra propias
  Dado un id de asesoría con kind recurring
  Cuando envío el DELETE de esa asesoría
  Entonces recibo 409 ONLY_EXTRA_DELETABLE
  Y si la asesoría es de otro docente recibo 403 FORBIDDEN
  Y si no existe recibo 404 ADVISING_NOT_FOUND

Escenario: El JP pertenece a una sola sección y no es su propio profesor
  Dado un intento de asignar el mismo docente como JP y como titular de una sección
  Entonces lo rechaza el CHECK de la tabla section
  Y el índice único parcial uq_section_jp impide que un JP figure en dos secciones

Escenario: Token de alumno contra el módulo docente
  Dado un JWT con rol student
  Cuando llamo a cualquier ruta de advising me
  Entonces recibo 403 FORBIDDEN por requireRole teacher
```

```mermaid
sequenceDiagram
  autonumber
  actor D as Docente Profesor o JP
  actor S as Alumno
  participant TAPI as Rutas advising me
  participant SAPI as Rutas advising alumno
  participant DB as PostgreSQL

  D->>TAPI: POST de asesoria extra
  TAPI->>TAPI: requireRole teacher
  TAPI->>DB: la seccion es mia como titular o JP?
  alt no es mia
    TAPI-->>D: 403 SECTION_FORBIDDEN
  else es mia
    TAPI->>TAPI: rango horario, fecha en periodo, sin solape, ubicacion segun modalidad
    TAPI->>DB: INSERT course_advising_session kind extra
    TAPI-->>D: 201 sesion creada
  end
  S->>SAPI: GET asesorias de la seccion
  SAPI->>DB: excluye las pasadas con isSessionPast
  SAPI-->>S: asesorias con asistentes y myRsvp
  S->>SAPI: POST rsvp
  SAPI->>DB: INSERT advising_rsvp ON CONFLICT DO NOTHING
  SAPI-->>S: 200 con el conteo actualizado
  D->>TAPI: GET asistentes de la asesoria
  TAPI->>DB: conteo y lista ordenada por apellido
  TAPI-->>D: total y asistentes
```

---

#### HU22 · Lista de alumnos impedidos por inasistencia — y HU30, la notificación

**Como** docente, **quiero** ver qué alumnos de mi sección están impedidos o cerca del límite de inasistencias, **para** avisarles antes de que pierdan el curso.

| | |
|:---|:---|
| **Módulo** | [`src/modules/attendance-risk`](src/modules/attendance-risk) — cubre HU22 y HU30 |
| **Endpoints** | `GET /attendance-risk/sections/:sectionId/attendance-risk` · `…/summary` · `POST …/notify` (HU30) — todo con `requireRole("teacher")` |
| **Reglas** | **Sin spec.** Las reglas viven solo en el código: límite `cycle >= 6 ? 35 : 25` ([`attendance-risk.service.ts`](src/modules/attendance-risk/attendance-risk.service.ts)`:50,164`), `sessionHours = 2` (`:138,146,154`), ventana de riesgo con 2 o 3 faltas restantes (`:89`), guarda de horas no cargadas (`:52-65`) |
| **Pruebas** | [`test/HU22_sam/impedidos.cajanegra.test.ts`](test/HU22_sam/impedidos.cajanegra.test.ts), [`impedidos.unitarias.test.ts`](test/HU22_sam/impedidos.unitarias.test.ts) — 23 casos; 10 de pantalla en el frontend. Y [`test/HU30_sam/notificar.cajablanca.test.ts`](test/HU30_sam/notificar.cajablanca.test.ts) — 10 casos |

**Criterios de aceptación**

```gherkin
Escenario: Clasificación de un alumno impedido
  Dado un alumno de ciclo 3 con 30 por ciento de inasistencia en la sección
  Cuando consulto la lista de riesgo de la sección
  Entonces su estado es impedido
  Porque el límite para los ciclos 1 a 5 es 25 por ciento y el porcentaje lo supera

Escenario: Límite distinto a partir del ciclo 6
  Dado un alumno de ciclo 7 con 30 por ciento de inasistencia
  Cuando se clasifica
  Entonces su estado NO es impedido, porque desde el ciclo 6 el límite es 35 por ciento

Escenario: Alumno en riesgo
  Dado que al alumno le quedan exactamente 2 o 3 faltas para alcanzar el límite
  Y cada sesión de clase vale 2 horas
  Cuando se clasifica
  Entonces su estado es en_riesgo y se reporta cuántas faltas le quedan

Escenario: Sección sin horas cargadas
  Dado que el total de horas de la sección es cero o negativo
  Cuando se clasifica al alumno
  Entonces el servicio devuelve estado normal con porcentaje de inasistencia 0

Escenario: Solo el docente accede
  Dado un JWT de rol student
  Cuando llamo a cualquier ruta de attendance-risk
  Entonces recibo 403 FORBIDDEN por requireRole teacher

Escenario: Notificar a los alumnos afectados
  Dado un lote de alumnos impedidos o en riesgo
  Cuando envío el POST de notificación
  Entonces se crea una alerta de tipo academic_risk titulada Alerta de inasistencias
    con el nombre del curso
  Y los alumnos en estado normal no se notifican
```

---

#### HU23 · Chat en vivo por sección

**Como** integrante de una sección (alumno, profesor o JP), **quiero** un chat grupal en vivo con mi sección, **para** comunicarnos dentro de la app sin depender de WhatsApp.

| | |
|:---|:---|
| **Módulo** | [`src/modules/chat`](src/modules/chat) + [`src/services/firebase.service.ts`](src/services/firebase.service.ts) |
| **Endpoints** | `POST /chat/token` · `DELETE /chat/sections/:sectionId/messages/:messageId` |
| **Reglas** | R-CHAT-1, R-CHAT-2, R-CHAT-3, R-CHAT-4 · [`specs/features/chat/chat.spec.md`](specs/features/chat/chat.spec.md)`:21-51`. Pesos de rol: teacher 100, jp 90, delegate 70, subdelegate 60, student 10 |
| **Pruebas** | [`test/HU23_jeff/chat_token.cajanegra.test.ts`](test/HU23_jeff/chat_token.cajanegra.test.ts), [`chat_role.unit.test.ts`](test/HU23_jeff/chat_role.unit.test.ts), [`chat_delete.cajablanca.test.ts`](test/HU23_jeff/chat_delete.cajablanca.test.ts) — 64 casos; 20 en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Obtener el token de Firebase
  Dado que soy participante de la sección
  Cuando envío POST /chat/token con el sectionId
  Entonces el backend escribe el espejo de membresía en RTDB ANTES de firmar
  Y devuelve token, uid, displayName, role, roleLabel, isModerator y weight
  Y el uid es el id de app_user

Escenario: Fuente del participante según el rol del JWT
  Dado un JWT con rol teacher
  Entonces el backend resuelve el participante contra el titular o el JP de la sección
  Y con cualquier otro rol lo resuelve contra la matrícula activa
    más la representación de sección

Escenario: Anti-suplantación por parámetro
  Dado que pido token para una sección donde no participo
  O que el userId del JWT no coincide con el del participante resuelto
  Cuando envío POST /chat/token
  Entonces recibo 403 CHAT_SECTION_FORBIDDEN
  Y no se escribe el espejo de membresía

Escenario: Derivación de peso y moderación
  Dado un delegado de la sección
  Entonces su rol de chat es delegate, su peso es 70 y es moderador
  Y un alumno raso tiene rol student, peso 10 y no es moderador

Escenario: Solo el profesor titular borra mensajes
  Dado que soy el JP de la sección
  Cuando envío el DELETE de un mensaje
  Entonces recibo 403 CHAT_DELETE_FORBIDDEN
  Porque el controlador exige rol de participante teacher, no jp

Escenario: Borrado suave con lápida
  Dado que soy el profesor titular de la sección
  Cuando borro un mensaje existente
  Entonces el nodo NO se elimina: se marca como eliminado con quién y cuándo
  Y el cliente muestra la lápida eliminado por el profesor
  Y si el mensaje no existe recibo 404 CHAT_MESSAGE_NOT_FOUND

Escenario: El cliente nunca escribe la membresía
  Dado el modelo de datos del chat
  Entonces RTDB guarda solo mensajes y el espejo de miembros
  Y el backend es el ÚNICO que escribe ese espejo, denegado al cliente por reglas
  Y el permiso de escritura del cliente sobre un mensaje es solo de creación
```

> ⚠️ El flag `isModerator` es **solo presentación**. No habilita borrar: eso lo decide
> R-CHAT-4, que exige ser el titular. Un delegado se ve como moderador y recibe 403 si
> intenta borrar.

---

#### HU25 · Carnet de networking opt-in

**Como** alumno o docente, **quiero** activar un carnet de networking opcional con una red social, **para** compartir un medio de contacto dentro de la app sin publicar mis datos por defecto.

| | |
|:---|:---|
| **Módulo** | [`src/modules/networking`](src/modules/networking) |
| **Endpoints** | `GET /networking/me` · `PUT /networking/me` · `GET /networking/users/:userId` |
| **Reglas** | R-NET-1 a R-NET-4 · [`specs/features/networking/networking.spec.md`](specs/features/networking/networking.spec.md)`:42-100`. Enum `social_platform` en [`schema.ts`](src/db/schema/schema.ts)`:80-87`; `url` ≤ 255, `label` ≤ 80 |
| **Pruebas** | [`test/HU25_mel/networking.cajablanca.test.ts`](test/HU25_mel/networking.cajablanca.test.ts) (V(G)=5 sobre `networking.service.ts:31-56`), [`.cajanegra`](test/HU25_mel/networking.cajanegra.test.ts), [`networking.logic.test.ts`](test/HU25_mel/networking.logic.test.ts), [`networking.service.test.ts`](test/HU25_mel/networking.service.test.ts) — 34 casos; 33 en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Leer mi propio carnet
  Dado que estoy autenticado con cualquier rol
  Cuando consulto GET /networking/me
  Entonces recibo optIn y links con cero o un elemento
  Y label es texto o nulo, para mantener un shape estable

Escenario: El dueño ve su enlace aunque el carnet esté oculto
  Dado que mi optIn es falso pero tengo un enlace guardado
  Cuando consulto GET /networking/me
  Entonces sigo viendo el enlace, porque ocultar no borra

Escenario: Activar el carnet exige exactamente un enlace
  Dado que envío el PUT con optIn verdadero y la lista de enlaces vacía
  Entonces la escritura se rechaza

Escenario: Nunca más de una red por carnet
  Dado que ya tengo un enlace de LinkedIn
  Cuando guardo un enlace de GitHub
  Entonces la fila anterior se reemplaza dentro de una transacción atómica

Escenario: El host debe corresponder a la plataforma
  Dado platform linkedin y una url cuyo host no es linkedin.com ni un subdominio suyo
  Cuando envío el PUT del carnet
  Entonces recibo 400 INVALID_REQUEST_BODY con los detalles de Zod
  Y para la plataforma x se aceptan x.com o twitter.com

Escenario: Las plataformas website y other exigen etiqueta
  Dado platform website u other sin label o con label vacía
  Cuando envío el carnet
  Entonces se rechaza, porque para esas plataformas la etiqueta es obligatoria

Escenario: El propietario sale del JWT
  Dado cualquier body enviado al PUT del carnet
  Entonces el propietario se deriva exclusivamente del sub del JWT
  Y el body no acepta identificadores de usuario

Escenario: Usuario inexistente
  Dado que el app_user del JWT ya no existe
  Cuando consulto GET /networking/me
  Entonces recibo 404 USER_NOT_FOUND
```

---

#### HU28 · Chatbot académico ULimaBot

**Como** alumno, **quiero** preguntar en lenguaje natural por mis notas, horario, exámenes, malla, anuncios, compañeros, alertas y lo que se dijo en el chat de mi sección, **para** obtener respuestas basadas en mis datos reales sin navegar por toda la app.

| | |
|:---|:---|
| **Módulo** | [`src/modules/chatbot`](src/modules/chatbot) + [`src/services/cohere.client.ts`](src/services/cohere.client.ts) |
| **Endpoints** | `POST /chatbot/sessions` · `GET /chatbot/sessions` · `GET /chatbot/sessions/:id` · `DELETE /chatbot/sessions/:id` · `POST /chatbot/sessions/:id/ask` |
| **Reglas** | BR-CB-01 a BR-CB-12 · [`specs/features/chatbot/chatbot.spec.md`](specs/features/chatbot/chatbot.spec.md). 20 preguntas por alumno y hora, 500 caracteres por pregunta, 8 s de timeout con Cohere, historial de 10 mensajes, 200 mensajes de chat leídos por sección, evaluaciones de la semana actual ± 1 |
| **Pruebas** | [`test/HU28_ronald/chatbot.intent-classifier.test.ts`](test/HU28_ronald/chatbot.intent-classifier.test.ts), [`chatbot.context-builder.test.ts`](test/HU28_ronald/chatbot.context-builder.test.ts), [`chatbot.chat-search.test.ts`](test/HU28_ronald/chatbot.chat-search.test.ts), [`chatbot.service.test.ts`](test/HU28_ronald/chatbot.service.test.ts), [`context.cajanegra.test.ts`](test/HU28_ronald/context.cajanegra.test.ts) — 35 casos |

**Criterios de aceptación**

```gherkin
Escenario: Solo el alumno usa el chatbot
  Dado un JWT de rol teacher
  Cuando llamo a cualquier ruta del chatbot
  Entonces recibo 403 FORBIDDEN
  Y si el contexto no trae studentId recibo 401 STUDENT_NOT_FOUND

Escenario: Preguntar dentro de una sesión ajena
  Dado un id de sesión que no me pertenece
  Cuando envío la pregunta a esa sesión
  Entonces recibo 404 SESSION_NOT_FOUND

Escenario: Clasificación de intención con respaldo por palabras clave
  Dado que la clasificación remota falla o supera los 500 ms
  Cuando se clasifica la pregunta
  Entonces se usa el emparejamiento por palabras clave en español por dominio
  Y se toman los intents con score mayor que 0.3, o todos los dominios con alguna coincidencia

Escenario: El chat de la sección se consulta SIEMPRE
  Dado que la pregunta no menciona el chat
  Cuando se recolectan los datos del contexto
  Entonces igualmente se leen los últimos 200 mensajes de las secciones relevantes
  Porque la respuesta puede estar en el chat sin que el alumno lo diga

Escenario: Selección de secciones relevantes
  Dado que la pregunta menciona software
  Cuando se filtran las secciones
  Entonces empareja la sección cuyo nombre contiene ese token significativo
  Y si ninguna sección empareja se toman las 3 primeras alfabéticamente

Escenario: Bloqueo de inyección de prompt
  Dado que la pregunta contiene marcadores de contexto o de rol del sistema
  Cuando la envío
  Entonces recibo 400 INVALID_QUESTION
  Y lo mismo si la pregunta excede los 500 caracteres

Escenario: Límite de preguntas por hora
  Dado que ya hice 20 preguntas en la última hora
  Cuando envío una más
  Entonces recibo 429 RATE_LIMITED con el tiempo restante
  Y las respuestas llevan las cabeceras de cuota restante y de reinicio

Escenario: El proveedor de IA no está disponible
  Dado que la llamada supera los 8 s, o devuelve 429 o 500
  Cuando espero la respuesta
  Entonces recibo 503 con un mensaje genérico
  Y nunca se exponen detalles del error del proveedor al frontend

Escenario: Título automático de la sesión
  Dado que respondo la primera pregunta de una sesión nueva
  Cuando el backend genera el título
  Entonces se actualiza con un texto de máximo 100 caracteres
  Y si la generación falla se mantiene el título por defecto

Escenario: El bot no inventa
  Dado que el contexto no contiene la información pedida
  Cuando el modelo responde
  Entonces dice que no tiene esa información en este momento
  Y si le preguntan por otro alumno responde que solo puede mostrar la propia
    información académica
```

---

#### HU29 · Calificación oficial por evaluación

**Como** profesor titular de una sección, **quiero** cargar las notas oficiales de mis alumnos por evaluación, **para** que vean su avance real sin depender de la calculadora personal.

| | |
|:---|:---|
| **Módulo** | [`src/modules/official-grades`](src/modules/official-grades) — escribe en `student_score`, distinto de `simulated_grades` de HU06 |
| **Endpoints** | `GET /official-grades/me` (alumno) · `GET /official-grades/teacher/sections` · `GET …/sections/:sectionId/scores` · `PUT …/sections/:sectionId/scores` |
| **Reglas** | [`specs/features/official-grades/official-grades.spec.md`](specs/features/official-grades/official-grades.spec.md) · `value` en `0..20`, lote de 1 a 1000 ítems, validación completa antes de escribir |
| **Pruebas** | [`test/HU29_jeff/official-grades.logic.test.ts`](test/HU29_jeff/official-grades.logic.test.ts), [`grades-summary.test.ts`](test/HU29_jeff/grades-summary.test.ts) — 12 casos |

**Criterios de aceptación**

```gherkin
Escenario: Solo el profesor titular califica
  Dado que soy el JP de la sección
  Cuando intento acceder a la grilla o guardar notas
  Entonces recibo 403 NOT_SECTION_PROFESSOR
  Porque solo el titular califica

Escenario: Grilla de la sección
  Dado que soy titular de la sección
  Cuando consulto las notas de la sección
  Entonces recibo los alumnos con matrícula no retirada, las evaluaciones del sílabo
    y las notas ya cargadas

Escenario: El lote se valida entero antes de escribir
  Dado un lote de notas donde una matrícula no pertenece a la sección
  Cuando envío el PUT del lote
  Entonces recibo 404 ENROLLMENT_NOT_IN_SECTION
  Y no se persiste ninguna nota del lote
  Y si una evaluación no pertenece a la sección recibo 404 ASSESSMENT_NOT_IN_SECTION

Escenario: Rango de la nota
  Dado un valor fuera del rango 0 a 20
  Cuando envío el lote
  Entonces se rechaza por validación

Escenario: El alumno solo ve sus notas del período activo
  Dado que estoy autenticado como alumno
  Cuando consulto mis notas oficiales
  Entonces las recibo agrupadas por sección y curso SOLO del período académico activo
  Y con el peso y el valor de cada evaluación, que puede ser nulo

Escenario: La nota final no se almacena
  Dado el conjunto de notas de un curso
  Cuando se muestra la nota final
  Entonces se calcula en el cliente ponderando nota por peso
```

---

#### HU31 · Cargar el ciclo desde el portal miUlima

**Como** alumno, **quiero** importar desde miUlima mis cursos, secciones, horario, matrícula y avance oficial al empezar el ciclo, **para** no digitarlos y poder repetir la carga sin perder mis notas personales ni mi simulación de malla.

| | |
|:---|:---|
| **Módulo** | [`src/modules/portal-sync`](src/modules/portal-sync) + [`src/services/portal.client.ts`](src/services/portal.client.ts) |
| **Endpoints** | `GET /portal-sync/status` · `POST /portal-sync/import` — con `portalSyncRateLimit` de 5 importaciones por alumno y hora |
| **Reglas** | RS-BE-1 a RS-BE-8 y los 12 pasos de la transacción · [`specs/features/portal-sync/portal-sync.spec.md`](specs/features/portal-sync/portal-sync.spec.md). `PORTAL_TIMEOUT_MS` de 8000 ms en 4 rondas secuenciales (techo ≈ 32 s); medición real de 40,7 s la primera importación y 47,7 s la segunda |
| **Pruebas** | [`test/HU31_jeff/`](test/HU31_jeff/) — **28 archivos, ≈ 425 casos**: parsers contra fixtures reales anonimizados (incluido uno en bytes ISO-8859-1 crudos), cliente HTTP, repository, service, esquemas. Es, con diferencia, la suite más grande del repositorio; 43 casos en el frontend |

**Criterios de aceptación**

```gherkin
Escenario: Saber si necesito importar
  Dado que estoy autenticado como alumno
  Cuando consulto GET /portal-sync/status
  Entonces recibo el período activo, mis matrículas en él y si necesito importar
  Y necesito importar si no hay período activo o no tengo matrícula activa en él

Escenario: La identidad se verifica antes de escribir
  Dado que el código leído del consolidado de matrícula difiere del código de mi cuenta
  Cuando ejecuto la importación
  Entonces recibo 403 PORTAL_IDENTITY_MISMATCH y no se escribe absolutamente nada
  Y si el código es ilegible o el parser falla recibo 422 PORTAL_IDENTITY_UNVERIFIABLE

Escenario: Sesión del portal caída devuelve 409 y no 401
  Dado que el portal responde con su página de inicio o de validación de token
  Cuando ejecuto la importación
  Entonces recibo 409 PORTAL_SESSION_INVALID
  Porque el ApiClient de Flutter trata todo 401 como expiración del JWT
    y cerraría mi sesión de ULima++

Escenario: Contraseña o passcode rechazados devuelven el cupo
  Dado que el login contra el portal falla
  Cuando recibo 409 PORTAL_LOGIN_REJECTED
  Entonces el rate limit me devuelve el cupo consumido
  Porque un passcode de 6 dígitos caduca cada 30 s y equivocarse es normal
  Y el mensaje no distingue si falló la contraseña o el passcode

Escenario: La importación nunca me deja fuera de la app
  Dado que el retiro de matrículas dejaría al alumno con cero matrículas activas
  Cuando se ejecuta el paso de matrícula
  Entonces no se retira nada y se reporta el warning WITHDRAW_SKIPPED_WOULD_LOCK_OUT

Escenario: El ciclo global solo avanza y no antes de tiempo
  Dado un período importado cuyo código es mayor o igual al activo
  Y cuya fecha de inicio ya llegó
  Cuando se hace el upsert del período
  Entonces se desactiva el anterior y se activa el nuevo, en ese orden obligatorio
  Y si la fecha de inicio aún no llegó el período se crea inactivo
    con el warning PERIOD_NOT_ACTIVATED_YET

Escenario: Idempotencia
  Dado que ya importé este ciclo
  Cuando vuelvo a importar
  Entonces todos los upsert usan ON CONFLICT sobre restricciones existentes
  Y no se duplica ni se borra nada

Escenario: Los datos propios de la app son intocables
  Dado que ejecuto una importación
  Entonces no se tocan las notas personales, la simulación de malla, las especialidades,
    los anuncios, las asesorías, los RSVP, el carnet de networking,
    el color del horario ni las horas de asistencia

Escenario: Un fallo de sílabo no aborta la importación
  Dado que la descarga del sílabo de un curso falla por red, sesión o parseo
  Cuando termina la importación
  Entonces el resto del resumen no cambia y ese sílabo queda nulo
  Y si NINGÚN curso trajo sílabo se agrega una única advertencia SYLLABUS_UNAVAILABLE

Escenario: Nunca se pisa un sílabo existente
  Dado que la oferta ya tenía una fila de sílabo con enlace de Drive
  Cuando se importa
  Entonces el upsert usa on conflict do nothing SIN objetivo de conflicto
  Y el enlace anterior se conserva intacto

Escenario: Estado del progreso académico
  Dado una fila del récord con nota 11 o más
  Entonces el progreso se marca aprobado, y con nota menor a 11 desaprobado
  Y sin nota y siendo del período activo queda en curso
  Y con varias filas del mismo curso gana la de mayor número de vez,
    y a igual vez la de ciclo más reciente

Escenario: Credenciales nunca persistidas
  Dado que envío el body con credenciales
  Entonces la contraseña y el passcode no se registran en logs ni en mensajes de error
  Y no se persisten en base de datos, caché ni disco
  Y el usuario del portal no se le pide al cliente: sale del código de la cuenta
```

---

#### HU31-bis · Delegados traídos del portal

**Como** alumno, **quiero** ver quién es el delegado y el subdelegado de cada una de mis secciones aunque esa persona todavía no use ULima++, **para** saber a quién acudir desde el primer día del ciclo.

| | |
|:---|:---|
| **Módulo** | [`src/modules/portal-sync`](src/modules/portal-sync) + [`src/modules/course-detail`](src/modules/course-detail) — tabla `section_representative_claim` |
| **Endpoints** | `POST /portal-sync/import` (fase de delegados) · `GET /course-detail/sections/:sectionId/contacts` |
| **Reglas** | RQ-1 a RQ-7, RS-5a, RS-14, RS-17 a RS-21 · [`specs/features/delegados-portal/delegados-portal.spec.md`](specs/features/delegados-portal/delegados-portal.spec.md) |
| **Pruebas** | [`test/HU31_jeff/parsers.delegado.test.ts`](test/HU31_jeff/parsers.delegado.test.ts), [`repository.claim.test.ts`](test/HU31_jeff/repository.claim.test.ts), [`service.delegados.test.ts`](test/HU31_jeff/service.delegados.test.ts), [`course-detail.contacts-claim.test.ts`](test/HU31_jeff/course-detail.contacts-claim.test.ts), [`representantes-ciclo.test.ts`](test/HU31_jeff/representantes-ciclo.test.ts) |

**Criterios de aceptación**

```gherkin
Escenario: Se persisten solo los dos cargos marcados
  Dado que la nómina del portal trae 40 filas de alumnos
  Cuando se procesa la sección
  Entonces solo se persisten las 2 filas marcadas como delegado y subdelegado
  Y las demás se descartan al terminar la petición

Escenario: Un claim no otorga permisos
  Dado un claim de representante sin cuenta correspondiente en la app
  Cuando otro alumno consulta los contactos de la sección
  Entonces ve la entrada como representante pendiente y no contactable
  Y esa persona no puede publicar anuncios, porque solo autoriza section_representative

Escenario: Promoción automática al registrarse
  Dado que la persona señalada por el claim inicia sesión e importa su ciclo
  Cuando la transacción confirma
  Entonces se crea o reactiva su fila de representante
  Y la respuesta trae un token re-firmado con el rol nuevo, SIN incrementar token_version

Escenario: Guarda de pertenencia en contactos
  Dado que pido los contactos de una sección donde no tengo matrícula
  Cuando llamo al endpoint de contactos
  Entonces recibo 403 SECTION_FORBIDDEN
  Porque sin esa guarda el claim sería un padrón consultable de delegados
    de toda la universidad

Escenario: El fallo es por aula, no por fase
  Dado que la nómina de una de mis 5 secciones falla
  Cuando termina la importación
  Entonces se escriben los claims de las 4 que sí parsearon
  Y se emite un warning por aula con código PARSER_FAILED o DELEGADOS_UNAVAILABLE
  Y el mensaje nunca contiene fragmentos del HTML del portal
```

---

### Lo que está diseñado, a medias o sin verificar

Ser honestos aquí vale más que la tabla de arriba.

**Historias sin suite propia.** **HU12** (ver anuncios) y **HU15** (perfil académico)
funcionan, pero no existe `test/HU12_*` ni `test/HU15_*` en ningún repositorio, ni
tabla que declare esas numeraciones. Ambas son **inferencias**: HU12 sale de un
comentario en `docs/DATABASE.md:158` y HU15 de comentarios en el código del perfil en
el frontend. Están en la tabla marcadas como tales.

**Módulos sin especificación.** `attendance-risk` (HU22, HU26, HU30) está montado en
[`src/modules/index.ts`](src/modules/index.ts) con 3 endpoints y reglas de negocio
duras — 25 % / 35 % de inasistencia, sesión de 2 horas, ventana de 2-3 faltas — y **no
tiene spec en ninguno de los dos repositorios ni fila en ningún `feature-index.md`**.
Toda su especificación vive en el código y en las cabeceras de sus tests. `HU21` (visor
de sílabos) y `HU26` (exportar CSV) también están implementadas sin spec.

**Documentación desactualizada respecto al código.** El `feature-index` del backend
marca **networking** como «Diseñada — BD lista, pendiente de implementar» y el
**chatbot** como «Diseñada — pendiente de implementar», pero los dos módulos exponen
sus rutas y tienen 34 y 35 casos de prueba respectivamente. `official-grades` (HU29)
tiene spec propia pero **no figura en el índice de features**. Cuando el índice y el
código discrepan, manda el código.

**HU25 superó su propio alcance declarado.** La spec de networking pone `GET
/networking/users/:userId`, la vista pública desde contactos y compartir el carnet en
el chat en «fuera de alcance», pero la ruta está registrada y hay commits que
implementan justamente eso. El «Escenario 1» de la tabla es lo que dice la spec, no lo
que hace el código.

**HU23 tiene un plano sin cubrir.** Las reglas de seguridad de Firebase RTDB
(`database.rules.json`, en el frontend) están declaradas fuera del alcance de la suite
de Bun y deben validarse con el Firebase Emulator. **No hay evidencia en el repositorio
de que esa validación se haya ejecutado.** Mientras tanto, la garantía de que el
cliente no puede escribir el espejo de membresía descansa en un archivo de reglas que
nadie probó automáticamente.

**HU31 tiene cuatro verificaciones pendientes**, declaradas en su propia spec:
la migración `drizzle/0004_portal_sync_final_grade.sql` figura como pendiente de aplicar
en la base real; la prueba manual end-to-end contra miUlima no se ha hecho; no está
comprobado contra el host real que el servidor de sílabos acepte la sesión con **solo
las cookies LTPA** (quitar el `JSESSIONID` fue un razonamiento, no una medición — si
hiciera falta, todos los sílabos degradarían a `null` y la única señal sería
`SYLLABUS_UNAVAILABLE`); y el presupuesto de tiempo del import con la fase de delegados
activa no se ha medido contra el corte de 90 s del cliente.

**RQ-3 de delegados no es verificable end-to-end** y la propia spec lo admite: el
escenario del alumno que se registra después necesita un endpoint de registro que no
existe. Las cuentas nacen de seeds y el login exige matrícula activa.

**El frontend va por delante en la historia de asistencia.** Su test declara que el
backend «ahora manda `status: "sin_datos"` y `absencePercentage: null`» citando una
regla `RS-BE-10`. Ni el estado ni la regla existen: `grep -rn "sin_datos" src/` no
devuelve nada y `attendance-risk.service.ts:52-65` sigue respondiendo `"normal"` con
porcentaje `0`. Esa carpeta de tests **está sin commitear**.

**Enlaces rotos entre specs y tests.** Las specs de grades apuntan a
`test/HU07_aurelio/` y `test/HU06_aurelio/`; las carpetas reales son `HU06_sam` y
`HU07_sam` (el alias se renombró). Las specs de chatbot, chat y advising-student
enlazan rutas de test que no existen (`test/chatbot/…`, `test/chat.controller.test.ts`,
`test/student-advising.logic.test.ts`). Los tests reales están en las carpetas
`HU##_<autor>`; el renombrado no se propagó a la documentación.

**Los requisitos R1..R23 no tienen catálogo.** Los `feature-index.md` de ambos repos
citan `R1, R2, R4, R5, R6, R9..R23, RNF6, RNF7`, pero **el documento que los define no
existe en ninguno de los dos repositorios**. `R3`, `R7` y `R8` no aparecen citados en
ningún lado. Solo se puede reconstruir su temática por la feature a la que están
asociados.

**Los conteos de pruebas son aproximados.** Salen de `grep` sobre `it(` / `test(` por
carpeta, no de ejecutar la suite; los casos generados dentro de bucles no se cuentan.
Como referencia documentada, la spec de delegados reporta **913 tests verdes** en el
backend al 2026-09-04. El detalle de la estrategia está en
[Pruebas y calidad](#-pruebas-y-calidad).

---

## 🧪 Pruebas y calidad

**74 archivos de prueba, 14 464 líneas, ~1 028 casos, 24 carpetas, 6 autores.** Todo bajo
[`test/`](test/), todo versionado, todo con el mismo runner. Ninguna prueba toca PostgreSQL,
Neon ni la red: la suite corre entera sin credenciales.

| Métrica | Valor |
|:---|---:|
| Archivos `*.test.ts` | 74 |
| Líneas de prueba | 14 464 |
| Casos `it()` / `test()` | ~1 028 |
| Carpetas `test/HUxx_autor/` | 24 |
| Autores con carpeta propia | 6 |
| Fixtures HTML/JSON anonimizados | 10 |
| Configuraciones de mutación | 6 |
| Archivos de `src/` importados por algún test | 82 de 184 (44,6 %) |
| Archivos de `src/` bajo mutación | 8 de 184 (4,3 %) |
| Pipeline de integración continua | **ninguno** — `.github/` no existe |

> **1 · El conteo de casos es aproximado a propósito.** Los ~1 028 salen de contar el patrón
> `^\s*(it|test)\s*\(` sobre los 74 archivos, no de una corrida del runner. Un `test.each` o un
> `test()` anidado en una línea puede escaparse. Los 74 archivos y las 14 464 líneas sí son exactos (las 14 473 de `find test -name '*.ts'` incluyen `test/env.setup.ts`, que no es una prueba).

### Cómo se ejecutan

Un solo punto de entrada, [`package.json:11`](package.json):

```json
"test": "bun test"
```

No hay Jest, ni Vitest, ni Mocha. Los 74 archivos importan la API virtual `bun:test`; 63 de ellos
con exactamente `import { describe, expect, test } from "bun:test"`.

Antes de cargar cualquier archivo de prueba, Bun ejecuta un preload declarado en
[`bunfig.toml`](bunfig.toml):

```toml
[test]
# Bootstrap de entorno (secretos dummy) antes de cargar los tests.
preload = ["./test/env.setup.ts"]
```

`preload` es lo **único** que declara la sección `[test]`. No hay `coverage`, ni
`coverageThreshold`, ni reporter de cobertura, ni patrones de inclusión: Bun descubre los tests por
su convención por defecto.

[`test/env.setup.ts`](test/env.setup.ts) son 9 líneas que rellenan las tres variables obligatorias
con valores dummy:

| Variable | Valor dummy | Por qué hace falta |
|:---|:---|:---|
| `JWT_SECRET` | `test-jwt-secret` | HU01 y HU16 firman y verifican JWT **de verdad** |
| `DATABASE_URL` | `postgres://user:pass@localhost:5432/test` | los repositorios abren cliente de Postgres al evaluarse |
| `COHERE_API_KEY` | `test-cohere-key` | `src/modules/chatbot` valida la clave al cargar `config`; el cliente Cohere se mockea |

La razón de que este archivo exista está escrita en él: hay una cadena de imports —*controller de
chat → `firebase.service` → `app-config` → `env`*— que evalúa la validación de entorno con solo
importar un módulo, y [`src/config/env.ts:96`](src/config/env.ts) hace `process.exit(1)` si falta
cualquiera de las tres. Sin el preload, la suite muere antes del primer `describe`.

Usa `||=`, no `=`. **Si existe un `.env` real, sus valores ganan**: el setup solo rellena huecos. La
consecuencia práctica es que un `.env` con credenciales de Neon se usaría durante `bun test`.

```mermaid
flowchart TD
  T["bun test"] --> BF["bunfig.toml · preload"]
  BF --> ES["test/env.setup.ts<br/>JWT_SECRET, DATABASE_URL y COHERE_API_KEY<br/>rellenados con dummies si faltan"]
  ES --> SU["74 archivos en 24 carpetas test/HUxx_autor"]
  SU --> D{"Qué necesita aislar cada prueba"}
  D -->|"Nada, funcion pura"| P1["Entradas literales, sin dobles"]
  D -->|"Repositorio o EventBus"| P2["Objeto literal tipado + objeto calls como espia"]
  D -->|"Importa la FORMA del SQL"| P3["tx falso que captura el objeto SQL y lo renderiza con PgDialect"]
  D -->|"La REGLA vive dentro del SQL"| P4["bun sqlite en memoria, marcadores traducidos a signos de interrogacion"]
  D -->|"El modulo abre Postgres o Cohere al evaluarse"| P5["mock.module + import dinamico"]
  D -->|"HTTP del portal miUlima"| P6["fetch doble con router por URL, metodo y sesion"]
  P1 & P2 & P3 & P4 & P5 & P6 --> F["Ninguna prueba toca Postgres, Neon ni la red"]
```

### La convención de nombres

Cada archivo de prueba declara dos cosas en su ruta: **de quién es** y **qué técnica aplica**. No es
decoración: es la trazabilidad que exige la rúbrica del curso y lo que permite que Stryker filtre
por persona.

#### Carpetas — `test/HU<NN>_<autor>/`

Número de historia de usuario a dos dígitos, guion bajo, alias del autor en minúsculas. El patrón
está fijado en [`specs/features/portal-sync/portal-sync.spec.md`](specs/features/portal-sync/portal-sync.spec.md).
Ata cada prueba a una historia de [Historias de usuario](#-historias-de-usuario-y-criterios-de-aceptación)
y a una persona del [Equipo](#-equipo). Los seis alias: `jeff`, `mel`, `sam`, `julio`, `nehemias`,
`ronald`.

#### Archivos — `<tema>[.<técnica>].test.ts`

La extensión `.test.ts` es obligatoria; el segmento intermedio es opcional y codifica la técnica.

| Sufijo | Técnica | Qué implica dentro del archivo |
|:---|:---|:---|
| `.cajablanca` | Caja blanca (McCabe) | Cabecera con NODOS y PREDICADOS `P1..Pn`, cálculo explícito de la complejidad ciclomática `V(G)` y una tabla `# / Camino / Entrada que lo fuerza / Esperado`. **Un `test()` por camino independiente.** |
| `.cajanegra` | Caja negra | Cabecera con tabla de PARTICIÓN DE EQUIVALENCIA y VALORES LÍMITE por campo; se exige **más de 4 campos de entrada**. Se observa solo la salida pública, nunca el interior. |
| `.unit` | Prueba unitaria | Una función o método aislado con dobles; casos numerados «caso 1..n». |
| `.unitarias` | Prueba unitaria | Idéntico propósito; casos rotulados `PU-C1`, `PU-C2`… **La coexistencia de `.unit` y `.unitarias` es una inconsistencia de nomenclatura, no una diferencia semántica.** |
| `.logic` | Lógica pura | Prueba directa del `*.logic.ts` homónimo de `src/`: sin BD, sin HTTP, sin mocks. Foco en constantes-umbral y sus bordes. |
| *(sin sufijo)* | Mixto o por componente | **(a) mixtos:** las tres técnicas en un archivo, un `describe` por técnica (HU03, HU04, HU08, HU09, HU24). **(b) por componente:** el nombre es la pieza bajo prueba, dominante en `test/HU31_jeff/`. |

Dentro del grupo «sin sufijo» de [`test/HU31_jeff/`](test/HU31_jeff/) hay una segunda taxonomía, esta
vez por **capa arquitectónica**: `parsers.*` (6 archivos), `repository.*` (8), `service.*` (2),
`portal.client.*` (3) y `schema*.*` (2). Es el único módulo probado capa por capa.

### La matriz de pruebas

| Carpeta | Historia | Autor | Archivos | Tipos | Qué cubre |
|:---|:---|:---|---:|:---|:---|
| [`test/HU01_jeff/`](test/HU01_jeff/) | HU01 · Iniciar sesión por código y contraseña | jeff | 1 | caja blanca | `AuthService.login` / `loginTeacher`, 7 predicados y 8 caminos; bcrypt y JWT reales, solo se aísla la persistencia |
| [`test/HU02_jeff/`](test/HU02_jeff/) | HU02 · Cierre de sesión | jeff | 1 | `.unit` | «Single Active Session»: `logout` incrementa `token_version`; fila vacía ⇒ default 1; `"9"` string de Postgres normalizado a `9` |
| [`test/HU03_julio/`](test/HU03_julio/) | HU03 · Malla curricular interactiva | julio | 1 | mixto (blanca + negra + unitaria) | `CurriculumService.getCurriculum` |
| [`test/HU04_julio/`](test/HU04_julio/) | HU04 · Simulación de estado de cursos | julio | 1 | mixto | `updateSimulation`, `deleteSimulation` y el orden de llamadas |
| [`test/HU05_mel/`](test/HU05_mel/) | HU05 · Guardar especialidades por carrera | mel | 1 | caja blanca, `V(G)=14` | `AcademicProfileService.updateSpecialties` con repo espía que captura escrituras |
| [`test/HU06_sam/`](test/HU06_sam/) | HU06 · Calculadora de notas | sam | 2 | lógica pura + caja blanca | `calcularPromedioPonderado`, `sumaDePesos`, `GradesService.saveNotas` / `deleteNota` |
| [`test/HU07_sam/`](test/HU07_sam/) | HU07 · Promedio del curso | sam | 1 | `.unitarias` | `grades.logic` + contrato Zod `calculateAverageSchema`: nota ∈ [0,20], peso ∈ [0,100], ruta exacta del error `["notas", 0, "valor"]` |
| [`test/HU08_julio/`](test/HU08_julio/) | HU08 · Alertas de riesgo y carga | julio | 2 | mixto + lógica pura + regresión SQL | `AlertsService.getAlertsForStudent` con `V(G)=9`; umbrales 55 / 10.5 / 15; regresión del SQL real contra SQLite. 765 líneas, el archivo más grande fuera de HU31 |
| [`test/HU09_nehemias/`](test/HU09_nehemias/) | HU09 · Horario semanal del alumno | nehemias | 2 | mixto + SQL renderizado | `mergeScheduleData`, `validateSchedulePayload`, `academicWeekOf`, `ScheduleRepository` |
| [`test/HU10_mel/`](test/HU10_mel/) | HU10 · Anuncios académicos | mel | 4 | blanca + negra + `.unit` + servicio | `SectionManagementService` y los cuatro esquemas Zod de anuncios |
| [`test/HU11_ronald/`](test/HU11_ronald/) | HU11 · Estadísticas del salón | ronald | 1 | lógica pura | `computeSectionStatistics`: ponderación solo sobre el peso calificado, `>=` en 10.5 aprueba, histograma 0-10 / 11-13 / 14-16 / 17-20 |
| [`test/HU13_ronald/`](test/HU13_ronald/) | HU13 · Asesorías del alumno, RSVP | ronald | 3 | blanca `V(G)≈11` + negra + `.unit` | `StudentService.getAdvising / confirmRsvp / cancelRsvp` y el controller con `Context` de Hono simulado |
| [`test/HU14_mel/`](test/HU14_mel/) | HU14 · Contactos de la sección | mel | 3 | blanca + negra + `.unit` | `CourseDetailService.getContacts` y el mapeo `splitName` |
| [`test/HU16_jeff/`](test/HU16_jeff/) | HU16 · Login con Google | jeff | 1 | caja negra + flujo de datos | `AuthService.loginWithGoogle` con `GoogleTokenVerifier` doble |
| [`test/HU18_jeff/`](test/HU18_jeff/) | HU18 · Publicar asesoría como docente | jeff | 3 | negra + lógica pura ×2 | `teacher.logic` completo (9 funciones) y las 13 funciones de `src/db/seed/asesorias.logic`. 93 casos |
| [`test/HU20_jeff/`](test/HU20_jeff/) | HU20 · Restablecer contraseña con OTP | jeff | 1 | lógica pura con recorrido de estados | `generateOtp`, `hashOtp`, `validateResetToken`, `validateNewPassword`, `maskEmail` |
| [`test/HU22_sam/`](test/HU22_sam/) | HU22 · Lista de impedidos | sam | 2 | negra + `.unitarias` | Límite 25 % ciclos 1-5 / 35 % ciclo 6+, comparación estricta, `total <= 0 ⇒ "normal"`, redondeo a 2 decimales |
| [`test/HU23_jeff/`](test/HU23_jeff/) | HU23 · Chat grupal por sección | jeff | 3 | blanca + negra + `.unit` | Jerarquía `teacher 100 > jp 90 > delegate 70 > subdelegate 60 > student 10`; 6 caminos de borrado suave y 8 de token Firebase, incluido el caso anti-suplantación |
| [`test/HU24_nehemias/`](test/HU24_nehemias/) | HU24 · Horario interactivo del docente | nehemias | 1 | mixto, `CC=10`, 6 campos | `resolveTeacherBlock`, `validateCourseBlockInput`, `computeGradesStatus` |
| [`test/HU25_mel/`](test/HU25_mel/) | HU25 · Carnet de networking opt-in | mel | 4 | blanca `V(G)=5` + negra + lógica + servicio | `updateMine` y `urlBelongsToPlatform`, que exige dominio oficial o subdominio real y **rechaza hosts que solo contienen el nombre** |
| [`test/HU28_ronald/`](test/HU28_ronald/) | HU28 · Chatbot ULimaBot | ronald | 5 | negra de 14 campos + 4 por componente | `context-builder`, `intent-classifier`, `chat-search`, `ChatbotService.ask` con `mock.module` de Cohere. Regla BR-CB-06 |
| [`test/HU29_jeff/`](test/HU29_jeff/) | HU29 · Calificar como docente | jeff | 2 | caja blanca ×2 | `OfficialGradesService.saveSectionScores / getSectionGrid` y `summarizeOfficialGrades` |
| [`test/HU30_sam/`](test/HU30_sam/) | HU30 · Notificar alerta de impedido | sam | 1 | caja blanca `V(G)=10` | `notifyStudents`, incluidos los dos ternarios de singular y plural |
| [`test/HU31_jeff/`](test/HU31_jeff/) | HU31 · Importación de ciclo desde miUlima | jeff | 28 | 27 por componente + 1 lógica pura | La carpeta más grande: 425 casos, 5 521 líneas, cuatro capas separadas por archivo. Trazabilidad a RS-5a, RS-8, RS-14, RS-15, RS-16, RS-19, RS-20, RS-22, RS-23 y RQ-6 |
| **TOTAL** | **24 historias** | **6 autores** | **74** | — | **15 módulos** |

#### Conteo por tipo

| Tipo | Archivos | % | Casos aprox. |
|:---|---:|---:|---:|
| Caja blanca (`.cajablanca`) | 9 | 12,2 % | 86 |
| Caja negra (`.cajanegra`) | 8 | 10,8 % | 110 |
| Unitaria (`.unit`) | 5 | 6,8 % | 36 |
| Unitaria (`.unitarias`) | 2 | 2,7 % | 30 |
| Lógica pura (`.logic`) | 9 | 12,2 % | 161 |
| Sin sufijo — mixtos | 5 | 6,8 % | 137 |
| Sin sufijo — por componente | 36 | 48,6 % | 468 |
| **TOTAL** | **74** | **100 %** | **1 028** |

#### Cuatro regresiones de producción que viven como prueba

La carpeta HU31 no es solo cobertura: cuatro de sus archivos existen porque algo se rompió en
producción y hay fecha.

| Fecha | Qué falló | Prueba que lo fija |
|:---|:---|:---|
| 2026-09-02 | La plantilla `sql` de Drizzle expandió un arreglo JS como constructor de fila; Postgres respondió `42809` y la primera importación real se cayó con 500 | [`repository.withdraw-array.test.ts`](test/HU31_jeff/repository.withdraw-array.test.ts) |
| 2026-09-04 | Un delegado de 2026-1 conservaba el cargo para siempre: faltaba el join hasta `academic_period.is_active` | [`representantes-ciclo.test.ts`](test/HU31_jeff/representantes-ciclo.test.ts) |
| 2026-09-05 | 11 grupos de docentes duplicados: `upsertTeacher` resolvía solo por `teacher_code` y las filas sembradas no lo tienen | [`repository.teacher-dedupe.test.ts`](test/HU31_jeff/repository.teacher-dedupe.test.ts) |
| histórico | `buildUser()` fabricaba el progreso desde `student.current_level` e ignoraba `student_course_progress`: un curso se veía aprobado solo si su ciclo era menor al del alumno | [`auth.progreso-malla.test.ts`](test/HU31_jeff/auth.progreso-malla.test.ts) |

> **2 · Por qué hay SQLite en la suite de un backend de Postgres.** Tres archivos montan
> `new Database(":memory:")`, renderizan el `SQL` de Drizzle con `PgDialect`, traducen `$1, $2…` a
> `?` respetando el orden de aparición y ejecutan la consulta de verdad. No es «una base real»: no
> hay Postgres, ni Neon, ni red, ni estado entre pruebas. Es un doble que sabe ejecutar SQL. Sin él,
> los tres casos del fallback de RS-20 —hay representante real / la persona del claim ya está
> matriculada / no está nadie— se resuelven **dentro** de la consulta con dos `not exists` y no
> serían verificables desde fuera.

> **3 · Los fixtures son HTML real anonimizado, y la anonimización está verificada.** Los 10
> fixtures de [`test/HU31_jeff/fixtures/`](test/HU31_jeff/fixtures/) son 4 nóminas, 2 sidebars, el
> layout, el consolidado de matrícula, el récord y un sílabo JSON, capturados del portal el
> 2026-09-04 (el sondeo del spike cubrió 10 nóminas de 2 cuentas; se conservaron 4). Cada código de
> alumno se sustituyó por `2020NNNN` y cada nombre por uno ficticio, con **mapeo determinista y
> estable entre archivos** para que las nóminas sigan compartiendo alumnos. Se comprobó que de las
> 98 apariciones de códigos de 8 dígitos —56 códigos distintos—, **0 se salen del patrón**. Los
> HTML crudos viven fuera de todo repositorio. Ver [Seguridad](#-seguridad).

### Mutation testing con Stryker

Un test que pasa no prueba que sirva. **La prueba de mutación mide el oráculo, no el código**:
Stryker modifica el código fuente —invierte una condición, cambia un `>` por `>=`, borra una
línea— y vuelve a correr la suite. Si la suite sigue en verde con el código roto, ese mutante
*sobrevive* y el test no estaba mirando lo que decía mirar. La métrica es el porcentaje de mutantes
muertos.

Está aquí porque es un entregable de la rúbrica del curso y porque cada integrante debe poder
demostrar la calidad de **sus** pruebas, no las del equipo. De ahí que haya seis configuraciones en
la raíz en vez de una: cada una muta solo el código de esa persona y usa solo sus tests como
oráculo.

| Config | `mutate` | Filtro de pruebas (`commandRunner`) | Umbrales | Reporte |
|:---|:---|:---|:---|:---|
| [`stryker.jeff.conf.json`](stryker.jeff.conf.json) | `src/modules/auth/auth.service.ts:56-134` | `bun test test/HU01_jeff/login.cajablanca.test.ts` | high 90 · low 80 · **break `null`** | `reports/mutation/jeff-auth.html` |
| [`stryker.julio.conf.json`](stryker.julio.conf.json) | `src/modules/alerts/alerts.logic.ts` | `bun test test/HU08_julio` | high 90 · low 80 · **break `null`** | `reports/mutation/julio-alerts.html` |
| [`stryker.mel.conf.json`](stryker.mel.conf.json) | `src/modules/networking/networking.service.ts:31-56` | `bun test test/HU25_mel/networking.cajablanca.test.ts` | high 90 · low 80 · **break `null`** | `reports/mutation/mel-networking.html` |
| [`stryker.nehemias.conf.json`](stryker.nehemias.conf.json) | `src/modules/schedule/schedule.logic.ts`, `src/modules/schedule/teacherSchedule.logic.ts` | `bun test test/HU09_nehemias test/HU24_nehemias` | high 90 · low 80 · **break `null`** | `reports/mutation/nehemias-schedule.html` |
| [`stryker.ronald.conf.json`](stryker.ronald.conf.json) | `src/modules/advising/student/student.logic.ts` | `bun test test/HU13_ronald` | high 90 · low 80 · **break `null`** | `reports/mutation/ronald-advising.html` |
| [`stryker.sam.conf.json`](stryker.sam.conf.json) | `src/modules/grades/grades.logic.ts`, `src/modules/attendance-risk/attendance-risk.service.ts` | `bun test test/HU06_sam test/HU07_sam test/HU22_sam test/HU30_sam` | high 90 · low 80 · **break `null`** | `reports/mutation/sam-attendance.html` |

Lo común a las seis: Stryker `^9.6.1`, `testRunner: "command"` (no hay plugin de Bun, se invoca
`bun test` como comando externo), `coverageAnalysis: "off"` (sin instrumentación por mutante: cada
mutante corre la suite completa del filtro), `concurrency: 4`, `tempDirName: ".stryker-tmp"` y
reporters `clear-text`, `progress`, `html`.

```bash
bun run mut:jeff        # o mut:sam, mut:mel, mut:julio, mut:nehemias, mut:ronald
```

**Mutantes equivalentes gestionados en código.** Un mutante equivalente es el que no cambia el
comportamiento observable, así que ninguna prueba puede matarlo. En vez de fingir un 100 %,
[`src/modules/grades/grades.logic.ts:4-9`](src/modules/grades/grades.logic.ts) documenta la guarda
redundante y la excluye con la directiva oficial:

```ts
// Stryker disable next-line ConditionalExpression
if (notas.length === 0) return 0;
```

**Resultados declarados** en [`docs/pruebas/exposicion-jeff-sam-mel/README.md`](docs/pruebas/exposicion-jeff-sam-mel/README.md),
no reproducidos al escribir esto: Jeff 47 muertos de 47 válidos, 0 supervivientes; Sam 156 muertos,
0 supervivientes, 2 ignorados por equivalentes; Mel 15 de 15. El propio
[`networking.cajablanca.test.ts:33-35`](test/HU25_mel/networking.cajablanca.test.ts) añade la
salvedad correcta: ese 100 % pertenece únicamente al rango de `updateMine()`, no a todo el módulo.

> ⚠️ **Tres advertencias sobre estos números.**
> **(a)** Los seis configs traen `"break": null`. `high: 90` y `low: 80` son puramente informativos:
> un `mut:<autor>` con 0 % de mutantes muertos termina con código de salida 0 y no rompe nada.
> **(b)** No hay evidencia de mutación publicada para Julio, Nehemías ni Ronald, aunque sus tres
> configuraciones existen y son válidas. `reports/` está en `.gitignore` y no existe en el árbol:
> los seis HTML hay que regenerarlos.
> **(c)** El rango de Jeff desborda su oráculo. `auth.service.ts:132` ya es `loginWithGoogle` y
> `:134` cae dentro de su `try`, pero el filtro es solo `login.cajablanca.test.ts`, que no ejercita
> esa función —eso lo cubre `test/HU16_jeff/`, fuera del filtro—. Cualquier mutante generado en esas
> últimas líneas sobrevive por construcción.

### Qué no está cubierto

Sin adornos: **102 de los 184 archivos `.ts` de `src/` (55,4 %) no son importados por ninguna
prueba.** Los 16 módulos tienen al menos un test que los toca, así que el hueco no es por módulo:
es por **capa**.

| Capa | Sin cobertura | Detalle |
|:---|:---|:---|
| Controllers | 14 de 16 | Solo `chat.controller.ts` (HU23) y `advising/student/student.controller.ts` (HU13) tienen pruebas |
| Routes | 14 de 16 | Solo `chat.routes.ts` por su `deleteParamsSchema`, y `course-detail.routes.ts` cargada dinámicamente en `course-detail.contacts-claim.test.ts` |
| Middleware | 4 de 5 | `auth-middleware.ts`, `rate-limit.ts`, `validate-dto.ts` y `middleware/index.ts` sin pruebas directas. `error-handler.ts` sí se ejercita, pero de refilón, montado con `app.onError` en una prueba de HU31 |
| Eventos | 5 de 5 | Los tres observers, `event-bus.ts` y `event-types.ts`: cero |
| Servicios completos | 6 | `schedule.service.ts`, `advising/teacher/teacher.service.ts` y `teacher.repository.ts`, `curriculum.repository.ts`, `chatbot.repository.ts`, `official-grades.schemas.ts` |
| Esquemas Zod sin caja negra | 10 | `academic-profile`, `student`, `teacher`, `alerts`, `attendance-risk`, `auth`, `chatbot`, `curriculum`, `official-grades`, `schedule` |
| Seeds ejecutables | 9 de 11 | Solo las dos partes puras extraídas (`asesorias.logic.ts`, `fusionar-docentes.logic.ts`) están cubiertas |
| Infraestructura | 9 | `server.ts`, `node-server.ts`, `clock.ts`, `resend-client.ts`, `app-error.ts`, `db/migrate.ts`, `db/apply-migration.ts`, `db/stamp-baseline.ts`, `db/relations/index.ts` |

El desbalance más notorio está en `advising/teacher`: `teacher.logic.ts` acumula **78 casos** entre
dos archivos, mientras que `teacher.service.ts`, `teacher.repository.ts`, `teacher.controller.ts`,
`teacher.routes.ts` y `teacher.schemas.ts` tienen **cero**.

Además, y con el mismo nivel de honestidad:

- **No hay integración continua.** `.github/` no existe en el backend. Nada ejecuta `bun test` en un
  push o un PR; la suite depende de que cada persona la corra a mano.
- **No hay cobertura de líneas ni de ramas configurada.** `bunfig.toml` solo declara `preload`. La
  única métrica de calidad de pruebas es la mutación, y solo sobre 8 de 184 archivos.
- **El build no type-chequea los tests.** [`tsconfig.json:23`](tsconfig.json) incluye únicamente
  `src/**/*`, y [`test/tsconfig.json`](test/tsconfig.json) declara en su cabecera que existe **solo
  para el editor** —resolver el módulo virtual `bun:test` y evitar el error `ts2307`—. Un error de
  tipos en un test no lo detecta `bun run build`.
- **Dos specs apuntan a rutas que no existen.** `specs/features/grades/grades.spec.md:45-46` enlazan
  `test/HU07_aurelio/` y `test/HU06_aurelio/`; las carpetas reales son `test/HU07_sam/` y
  `test/HU06_sam/`. Un renombrado de autor que no se propagó.
- **La numeración de HU no es consistente** entre carpetas, cabeceras y specs: `test/HU03_julio/` se
  autotitula «HU1», el carnet de networking es HU25 en `test/` y HU27 en `docs/specs/feature-index.md`,
  y las asesorías del alumno son HU13 en `test/` y HU17 en las specs. Ver
  [Deuda técnica](#-deuda-técnica-y-límites-conocidos).

### Comandos de verificación

```bash
# Suite completa (74 archivos, ~1 028 casos)
bun test

# Una carpeta — el patrón que usan los propios configs de Stryker
bun test test/HU08_julio
bun test test/HU09_nehemias test/HU24_nehemias

# Un archivo
bun test test/HU25_mel/networking.cajablanca.test.ts

# Mutación por integrante (genera reports/mutation/<autor>-<tema>.html)
bun run mut:jeff
bun run mut:sam
bun run mut:mel
bun run mut:julio
bun run mut:nehemias
bun run mut:ronald

# Compilación: type-check + emisión a dist/. OJO: solo cubre src/, no test/
bun run build
```

---

## ⚙ Configuración y entorno

Toda la configuración entra por variables de entorno y pasa por un único punto de validación:
[`src/config/env.ts`](src/config/env.ts). Ningún módulo de negocio lee `process.env` directamente;
consumen el objeto congelado `config` que arma [`src/config/app-config.ts`](src/config/app-config.ts)
con nueve secciones —`db`, `cloudinary`, `auth`, `email`, `firebase`, `server`, `chatbot`, `portal`,
`syllabus`—.
Las únicas excepciones son `src/server.ts` (para las variables que inyecta Vercel) y el tooling de
`src/db/`.

### Las 22 variables validadas

**Solo tres son obligatorias**, y las tres sin valor por defecto. Todas las demás arrancan con lo
que ves en la columna «Por defecto».

| Variable | Obligatoria | Por defecto | Para qué |
|:---|:---:|:---|:---|
| `DATABASE_URL` | **Sí** | — | Cadena de conexión a Neon PostgreSQL. Validada como URL: el mensaje de error es *«DATABASE_URL debe ser una URL de conexión válida de PostgreSQL»*. La consume `src/db/index.ts` y, en directo, `db/migrate.ts`, `db/apply-migration.ts`, `db/stamp-baseline.ts`, `drizzle.config.ts` y los seeds |
| `JWT_SECRET` | **Sí** | — | Secreto HS256 para firmar y verificar los JWT de sesión. Mínimo 8 caracteres — **un mínimo débil para HS256**, anotado como deuda |
| `COHERE_API_KEY` | **Sí** | — | API key de Cohere para el chatbot. **Obligatoria a nivel global aunque solo la use un módulo**: sin ella no arranca nada |
| `JWT_EXPIRES_IN` | No | `86400` | Vigencia del JWT **en segundos** (24 h). Se devuelve al cliente en el campo `expiresIn` del login |
| `PORT` | No | `3000` | Puerto del servidor local. Irrelevante en Vercel, donde no hay listener. `src/node-server.ts:4` la lee además por su cuenta |
| `NODE_ENV` | No | `development` | Enum cerrado `development \| production \| test`. Deriva `isProduction` / `isDevelopment` y gobierna el fallback `[DEV ONLY]` del OTP |
| `CORS_ORIGINS` | No | *(ninguno)* → CORS `*` | Orígenes permitidos separados por coma; se hace `trim` y se descartan vacíos. **Si no se define, el CORS queda en `*`** — deliberado para no romper desarrollo, pendiente de definir en producción |
| `RESEND_API_KEY` | No | `""` | API key de Resend para el correo de restablecimiento. Vacía y fuera de producción ⇒ el OTP se imprime en consola con prefijo `[DEV ONLY]`; vacía **en** producción ⇒ `console.error` y el correo no sale |
| `RESEND_FROM` | No | `ULima+ <notificaciones@mail.grupo5app.lat>` | Remitente. El comentario del propio archivo **prohíbe un local-part `no-reply`**: es señal de spam para Gmail |
| `RESEND_REPLY_TO` | No | `""` | `Reply-To` monitoreado; vacía ⇒ no se agrega la cabecera |
| `PASSWORD_RESET_MAX_PER_HOUR` | No | `3` | Máximo de OTP de restablecimiento por usuario por hora. Si el parseo no da entero positivo, **cae a 3 en vez de fallar** |
| `FIREBASE_PROJECT_ID` | No | `""` | Proyecto Firebase del chat (HU23) |
| `FIREBASE_CLIENT_EMAIL` | No | `""` | Cuenta de servicio de Firebase Admin. Validada como correo, con escape explícito a cadena vacía |
| `FIREBASE_PRIVATE_KEY` | No | `""` | Clave privada de la cuenta de servicio. Llega con `\n` literales y `firebase.service.ts:36` los normaliza |
| `FIREBASE_DATABASE_URL` | No | `""` | URL de Realtime Database. Validada como URL, con el mismo escape a `""` |
| `CLOUDINARY_CLOUD_NAME` | No | `""` | **Cloud name de la cuenta** — no el nombre de una API key. Es el segmento que va en la URL de entrega `https://res.cloudinary.com/<cloudName>/image/upload/…` que arma [`avatar.logic.ts:68`](src/modules/avatar/avatar.logic.ts), y viaja al cliente en la respuesta de la firma ([`avatar.service.ts:33`](src/modules/avatar/avatar.service.ts)) |
| `CLOUDINARY_API_KEY` | No | `""` | Clave **pública** de la cuenta. También viaja al cliente (`avatar.service.ts:34`): la app la manda en el `POST` directo a Cloudinary junto con `timestamp`, `public_id` y `signature`. El backend no toca los bytes porque Vercel corta los cuerpos en 4.5 MB y una foto de cámara los pasa |
| `CLOUDINARY_API_SECRET` | No | `""` | Secreto de firma. **Nunca sale del backend**: solo entra al `sha1` de `firmaDeSubida` / `firmaDeBorrado` ([`avatar.logic.ts:42-44`](src/modules/avatar/avatar.logic.ts)). El comentario de [`env.ts:46-49`](src/config/env.ts) lo deja escrito: el repo es público y el APK es descargable por cualquiera |
| `CHATBOT_RATE_LIMIT` | No | `20` | Preguntas por alumno por hora en `POST /chatbot/sessions/:id/ask`. Fallback a 20 ante parseo inválido |
| `PORTAL_BASE_URL` | No | `https://webaloe.ulima.edu.pe` | Base de miUlima. Lleva un `.refine()` con **allowlist de host fija**: cualquier otro host impide el arranque |
| `PORTAL_TIMEOUT_MS` | No | `8000` | Timeout de cada petición saliente al portal. Al agotarse ⇒ `504 PORTAL_TIMEOUT` |
| `SYLLABUS_BASE_URL` | No | `https://cactus.ulima.edu.pe` | Base Domino de sílabos. Allowlist **propia y separada** de la del portal, a propósito |

> **1 · Por qué las dos allowlists están separadas.** El comentario de
> [`src/config/env.ts:17-21`](src/config/env.ts) lo explica: si fueran una sola variable aceptando
> dos hosts, cualquiera de los dos sistemas podría apuntarse al otro. El endpoint de importación
> acepta cookies del cliente y hace peticiones salientes con ellas, así que el destino no puede
> depender de quien llama. Los predicados usan `.host` y no `.hostname`, de modo que **un puerto
> distinto también se rechaza**. Hay 14 casos de prueba en
> [`test/HU31_jeff/env.portal-allowlist.test.ts`](test/HU31_jeff/env.portal-allowlist.test.ts) que
> cubren host ajeno, subdominio-sufijo (`…ulima.edu.pe.evil.com`), truco de userinfo
> (`…ulima.edu.pe@evil.com`), puerto distinto y el host de la otra variable. Ver
> [Seguridad](#-seguridad).

> **2 · Las tres de Cloudinary son un todo-o-nada, y `enabled` no valida nada más que eso.**
> El getter de [`src/config/app-config.ts:13-15`](src/config/app-config.ts) es literalmente
> `Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)`:
> **solo comprueba que las tres estén NO VACÍAS**. Con las tres en `""` la feature queda apagada
> limpiamente —`avatar.service.ts:29` y `:46` lanzan `503 AVATAR_DISABLED`, y `construirUrlAvatar`
> devuelve `null` para que todos se vean con iniciales, que es el estado de hoy—. Pero con las tres
> llenas y **una equivocada** el getter dice `true` igual: el backend firma, responde `200` con
> `cloudName`, `apiKey`, `timestamp` y `signature`, y **el rechazo aparece después, en Cloudinary y
> contra el cliente**, no en el arranque ni en la respuesta del backend. No hay `503` que te avise.
> Costó una mañana el 2026-09-07.
>
> La causa concreta de aquella mañana: `CLOUDINARY_CLOUD_NAME` es el **cloud name de la cuenta**,
> no el nombre que le pusiste a la API key en el panel. Ambos son cadenas cortas y el panel los
> muestra cerca, así que se confunden y el error no se nota hasta que la subida falla. La forma
> segura de sacar las tres es leerlas de la línea `CLOUDINARY_URL` del panel, que las trae juntas y
> en un orden que no admite ambigüedad:
>
> ```
> cloudinary://CLOUDINARY_API_KEY:CLOUDINARY_API_SECRET@CLOUDINARY_CLOUD_NAME
> ```
>
> El cloud name es la parte **después de la `@`** (el «host» de esa URL), la key va antes de los
> dos puntos y el secreto entre los dos puntos y la arroba. Copiar de ahí evita el error entero.
> `CLOUDINARY_URL` como tal **no** está en el `envSchema`: el backend nunca la lee, es solo el sitio
> de donde se transcriben los tres valores.

#### Variables que existen pero no pasan por `envSchema`

| Variable | Dónde | Para qué |
|:---|:---|:---|
| `VERCEL_GIT_COMMIT_SHA` | [`src/server.ts:56`](src/server.ts) | Commit desplegado, expuesto por `GET /version`; fallback `"local"` |
| `VERCEL_GIT_COMMIT_REF` | [`src/server.ts:57`](src/server.ts) | Rama desplegada; fallback `null` |
| `VERCEL_DEPLOYMENT_ID` | [`src/server.ts:58`](src/server.ts) | Id del deployment; fallback `null` |
| `STUDENT_PASSWORD`, `PROF_PASSWORD`, `JP_PASSWORD` | seeds | Contraseñas de siembra, hasheadas con bcrypt costo 10. `PROF_PASSWORD` y `JP_PASSWORD` son obligatorias para `db:seed:docentes` |
| `STUDENT_CODE`, `TARGET_SECTION_ID`, `JP_FULLNAME`, `JP_USERNAME`, `PROF_USERNAME` | `src/db/seed/docentes.ts` | Parámetros del seed docente. ⚠️ `STUDENT_CODE` y `JP_FULLNAME` traen datos personales reales como default — deuda abierta, ver [Deuda técnica](#-deuda-técnica-y-límites-conocidos) |
| `CAREER_ID`, `CURRICULUM_ID` | `src/db/seed/delegados_secciones.ts` | Carrera y malla de siembra, ambos `1` |
| `ASESORIAS_JSON`, `HORARIO_TXT` | `src/db/seed/asesorias.ts` | Rutas de entrada del extractor de asesorías |

### `.env` de ejemplo

No existe `.env.example` en el repositorio, y además `.gitignore` impide que exista: la negación
`!.env.example` de la línea 10 queda anulada por el patrón `.env*` de la línea 60. Este bloque
cumple esa función. **Todos los valores son placeholders.**

```env
# ── Obligatorias. Sin las tres, el proceso no arranca ────────────────────────
DATABASE_URL=postgresql://USUARIO:CONTRASENA@HOST_DE_LA_BASE:5432/NOMBRE_BD?sslmode=require
JWT_SECRET=cadena-local-de-al-menos-8-caracteres
COHERE_API_KEY=clave-de-cohere-o-cualquier-cadena-en-local

# ── Servidor ────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=3000
JWT_EXPIRES_IN=86400
# Vacío o ausente ⇒ CORS abierto (*). Defínelo en producción.
CORS_ORIGINS=http://localhost:3000,https://TU-FRONTEND

# ── Correo de restablecimiento (Resend) ─────────────────────────────────────
# Vacío + NODE_ENV distinto de production ⇒ el OTP se imprime con [DEV ONLY]
RESEND_API_KEY=
RESEND_FROM=ULima+ <notificaciones@TU-DOMINIO-VERIFICADO>
RESEND_REPLY_TO=
PASSWORD_RESET_MAX_PER_HOUR=3

# ── Chat (Firebase Admin). Vacías ⇒ el chat no se inicializa, el resto sí ───
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_DATABASE_URL=

# ── Chatbot ─────────────────────────────────────────────────────────────────
CHATBOT_RATE_LIMIT=20

# ── Portal miUlima y sílabos. Los defaults ya son correctos ─────────────────
PORTAL_BASE_URL=https://webaloe.ulima.edu.pe
PORTAL_TIMEOUT_MS=8000
SYLLABUS_BASE_URL=https://cactus.ulima.edu.pe
```

> ⚠️ El repositorio es **público**. `.env`, `.env.local` y cualquier `backup_*.sql` están cubiertos
> por `.gitignore` y verificados como no versionados, pero eso los deja a un `git add -f` de
> distancia. No pegues aquí el host de Neon, ni claves de Firebase, ni códigos de alumno reales.

### Cómo se valida al arrancar

```mermaid
flowchart TD
  A["import dotenv/config carga .env en process.env"] --> B["envSchema.safeParse de process.env"]
  B --> C{"parsed.success"}
  C -->|"no"| D["console.error con el mensaje de validacion<br/>y el error formateado en JSON"]
  D --> E["process.exit 1<br/>el proceso entero muere"]
  C -->|"si"| F["export const env = parsed.data"]
  F --> G["app-config.ts agrupa env en el objeto congelado config"]
  G --> H["8 secciones — db, auth, email, firebase, server, chatbot, portal y syllabus"]
  H --> I["El resto del codigo consume config, nunca process.env"]
```

La secuencia exacta en [`src/config/env.ts`](src/config/env.ts): `import "dotenv/config"` en la
línea 1 → `envSchema` de Zod en las líneas 32-89 → `safeParse(process.env)` en la 91 → si falla,
`console.error("❌ Error de validación en las variables de entorno:")` seguido del
`parsed.error.format()` en JSON indentado y **`process.exit(1)`** en la línea 96 → si pasa, se
exporta `env` en la 99.

**Qué pasa si falta algo obligatorio:**

- **En local:** el proceso imprime qué variable falló y con qué mensaje, y termina. Es diagnóstico y
  rápido.
- **En Vercel:** la validación corre en el cold start, así que `process.exit(1)` se manifiesta como
  `FUNCTION_INVOCATION_FAILED` en **todas** las rutas, incluidas `/health` y `/version`. El
  mecanismo de diagnóstico se cae junto con la app. Está anotado como deuda; agrava el problema que
  `COHERE_API_KEY` sea obligatoria a nivel global aunque solo la use el chatbot.
- **Un valor fuera de la allowlist** de `PORTAL_BASE_URL` o `SYLLABUS_BASE_URL` produce el mismo
  resultado: el `.refine()` falla y el proceso no arranca. Es intencional.
- **La conexión a la base NO se valida al arrancar.** [`src/db/index.ts`](src/db/index.ts) construye
  el cliente y ya; el servidor arranca aunque Neon sea inalcanzable, y el fallo aparece en la
  primera consulta. Deuda reconocida.

### Scripts de `package.json`

18 scripts en tres familias. Los ocho de base de datos están **restringidos**: la base de ULima++ ya
existe, con datos, y estos comandos escriben sobre ella. [`README.md`](README.md) y
[`AGENTS.md`](AGENTS.md) los declaran de aprobación explícita del equipo.

| Comando | Qué hace | Cuándo usarlo |
|:---|:---|:---|
| `bun run dev` | Levanta el backend con `--watch` sobre `src/server.ts` | Desarrollo local diario |
| `bun run build` | `tsc`: compila `src/**` a `dist/`, excluyendo `src/db/seed/**`. Es el `buildCommand` de Vercel | Antes de cada push y tras cualquier cambio TypeScript |
| `bun run start` | Ejecuta `dist/server.js`. ⚠️ **Prácticamente inservible**: `src/server.ts` ya no arranca listener —termina en `export default app`—, así que ejecutar el bundle solo evalúa el módulo y sale. El servidor local persistente vive en `src/node-server.ts`, que **ningún script invoca** | Nunca, tal como está |
| `bun test` | Los 74 archivos de prueba, con el preload de `bunfig.toml` | Antes de abrir un PR |
| `bun run mut:<autor>` | `bunx stryker run stryker.<autor>.conf.json`, para `jeff`, `mel`, `sam`, `julio`, `nehemias` y `ronald` | Evaluar la calidad de las pruebas de un integrante |
| 🔴 `bun run db:generate` | `drizzle-kit generate`: genera `drizzle/000N_*.sql` y su snapshot desde `schema.ts` | **RESTRINGIDO.** Solo tras un cambio de schema con spec aprobada, y sabiendo que la numeración de `drizzle/` está colisionada: 9 `.sql`, 6 snapshots y 7 entradas de journal. El próximo `generate` puede chocar |
| 🔴 `bun run db:migrate` | Aplica las migraciones pendientes y las registra en `drizzle.__drizzle_migrations`. Usa el migrador de `drizzle-orm` y **no** el CLI, porque el CLI trata el NOTICE `relation "__drizzle_migrations" already exists` como error | **RESTRINGIDO.** Solo con backup previo. Y con datos móviles: *el wifi de la ULima bloquea el puerto 5432* |
| 🔴🔴 `bun run db:push` | `drizzle-kit push`: sincroniza el schema contra la BD **sin generar migración** | **PROHIBIDO SIEMPRE.** Diffea contra un snapshot obsoleto y **puede generar DROPs** sobre tablas con datos de producción. Está expuesto en `package.json` sin ninguna guarda en código; la recomendación abierta es quitarlo |
| 🔴 `bun run db:studio` | GUI de Drizzle contra la base viva | **RESTRINGIDO.** Inspección puntual; da acceso total de escritura |
| 🔴 `bun run db:seed` | Ejecuta el seed principal | **RESTRINGIDO.** Inserta datos sobre una base que ya los tiene |
| 🔴 `bun run db:seed:docentes` | Crea y vincula cuentas de profesor y JP con bcrypt costo 10; exige `PROF_PASSWORD` y `JP_PASSWORD` | **RESTRINGIDO.** Solo con aprobación; contexto HU18 |
| 🔴 `bun run db:apply <archivo.sql>` | Aplica un `.sql` dentro de **una sola transacción** (`sql.begin` + `tx.unsafe`); si un statement falla, ROLLBACK completo | **RESTRINGIDO.** Protocolo manual de migración, con backup previo. Ojo: ejecuta el SQL pero **no escribe en el ledger** de migraciones |
| 🔴 `bun run db:stamp-baseline` | **DRY-RUN por defecto**; requiere `-- --apply` para ejecutar. Crea `drizzle.__drizzle_migrations` y sella `0000_baseline` como aplicada sin re-ejecutar su SQL. Idempotente | **RESTRINGIDO.** Una sola vez, en el re-baseline |

> **2 · La trampa de `ALTER TYPE … ADD VALUE`.** No corre dentro de una transacción, así que
> `db:migrate` y `db:apply` —que envuelven todo en una— **fallan**… pero **el valor igual se agrega**
> y no se revierte. El procedimiento correcto está en [`MIGRATIONS.md`](MIGRATIONS.md): correr el
> `ALTER TYPE` en autocommit y sellar la migración manualmente después.

### Puesta en marcha local

```bash
# 1. Dependencias. Bun es el gestor canónico: hay un solo lockfile, bun.lock
bun install

# 2. Escribe el .env A MANO. Copia el bloque de arriba y rellena DATABASE_URL.
#    Las otras dos obligatorias pueden ser cualquier cosa en local.
$EDITOR .env

# 3. Arranca en modo watch (puerto 3000 por defecto)
bun run dev

# 4. Comprueba que responde
curl -s http://localhost:3000/health
# → {"status":"ok","timestamp":"2026-09-07T05:50:06.548Z"}

curl -s http://localhost:3000/version
# → {"commit":"local","ref":null,"deployment":null}

# 5. Antes del PR
bun run build   # type-check + emisión; solo cubre src/, no test/
bun test
```

> ⚠️ **No traigas el `.env` desde Vercel con `vercel env pull`.** El comando trae el archivo, pero
> escribe literalmente `[SENSITIVE]` como valor de casi todas las variables: Vercel no descifra las
> marcadas como sensibles. Ese archivo **rompe el arranque**, y no por la base de datos:
> `FIREBASE_CLIENT_EMAIL` se valida como correo, `FIREBASE_DATABASE_URL` como URL y `NODE_ENV` es un
> enum cerrado, y `[SENSITIVE]` no pasa ninguna de las tres. El proceso muere en
> `env.ts:96` con un error de validación que apunta a variables que ni siquiera necesitas.
> Escribe el `.env` a mano: **solo `DATABASE_URL` tiene que ser auténtica**. `JWT_SECRET` puede ser
> cualquier cadena de 8 o más caracteres —el backend local firma y verifica sus propios tokens, y
> las contraseñas viven hasheadas en la base, así que el login funciona igual— y `COHERE_API_KEY`
> cualquier cadena no vacía si no vas a tocar el chatbot.

> **3 · Si el arranque se queda mudo.** No lances `bun run dev` con una tubería a `sed` o `grep`: se
> pierde el log por buffer y los errores de validación no aparecen. Usa
> `nohup bun run dev > dev.log 2>&1 &` y lee el archivo.

Para producción, región, `maxDuration` y el resto del despliegue, ver
[Despliegue](#-despliegue).

---

## 🚀 Despliegue

El backend vive en **Vercel** como una única función serverless, desplegada por la integración
Vercel–GitHub. No hay GitHub Actions en este repositorio: `ls .github` devuelve *"No such file
or directory"*. El único workflow del proyecto está en el repo del frontend y compila el APK.

**Producción: <https://u-lima-backend-is-2-one.vercel.app>** — verificado vivo el 2026-09-07.

> ⚠️ **El dominio con sufijo `-tau.vercel.app` que aparece en documentación y capturas antiguas
> está MUERTO.** El despliegue vivo es el de sufijo **`-one`**. Si un cliente apunta al `-tau`,
> no falla con un error claro: falla con lo que sea que Vercel responda a un proyecto retirado.
> Hasta este README, el repositorio **no documentaba la URL de producción en ningún archivo**
> (`grep -rn 'vercel.app'` sobre `*.md`, `*.ts` y `*.json` devolvía cero resultados).

### Configuración de Vercel

Todo lo que gobierna el despliegue cabe en las 7 líneas de [`vercel.json`](vercel.json):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "hono",
  "installCommand": "bun install",
  "buildCommand": "bun run build",
  "regions": ["iad1"]
}
```

| Clave | Valor | Por qué está así |
|:---|:---|:---|
| `framework` | `hono` | Preset oficial. El entrypoint que busca es el `export default` del módulo — BR-PLATFORM-01 |
| `installCommand` | `bun install` | Bun es el gestor canónico. Un solo lockfile: `bun.lock` — BR-PLATFORM-09 |
| `buildCommand` | `bun run build` (= `tsc`) | Compila `src/**` a `dist/`. Excluye **los seeds** — `src/db/seed/**` en [`tsconfig.json`](tsconfig.json)`:24` porque los seeds leen JSON externos que no están en el repo y romperían el build — BR-PLATFORM-06 |
| `regions` | `["iad1"]` | La región de Neon. Ver abajo — BR-PLATFORM-10 |
| Output Directory | *(vacío)* | Recomendado por [`README.md`](README.md)`:154`; no hay artefacto estático que servir |
| `maxDuration` | **ausente, a propósito** | Ver abajo — BR-PLATFORM-11 |
| Rewrites | ninguno | Los paths públicos no cambian y no hay prefijo `/api` — BR-PLATFORM-04 |

### Cómo se sirve Hono como función serverless

[`src/server.ts`](src/server.ts) termina en **`export default app;`** (`server.ts:65`) y **no arranca
ningún listener**: no hay `Bun.serve()`, ni `serve(...)`, ni `app.listen(...)` en el camino de
producción. Vercel importa el módulo, toma el `default export` y le pasa cada request.

El servidor persistente para desarrollo local vive **aparte**, en
[`src/node-server.ts`](src/node-server.ts) (`@hono/node-server` + `serve({ fetch: app.fetch, port })`),
que no forma parte del camino de Vercel.

Orden exacto de composición de la app, que es también el orden en que se atraviesa cada petición:

```text
registerEventObservers()      server.ts:11   # hoy no registra nada — ver Deuda técnica
cors(CORS_ORIGINS ?? "*")     server.ts:16   # BR-PLATFORM-08
logger()                      server.ts:24
onError(errorHandler)         server.ts:25   # envelope { error: { code, message, details } }
GET  /                        server.ts:28   # índice (lista 10 de los 15 módulos: doc stale)
GET  /health                  server.ts:48   # público
GET  /version                 server.ts:54   # público
registerModules(app)          server.ts:63   # los 15 módulos bajo sus 15 prefijos
export default app            server.ts:65   # ← el entrypoint serverless
```

**Requisito ESM crítico (BR-PLATFORM-07).** El proyecto es ESM puro (`"type": "module"`), así que
**todos los imports relativos del árbol de runtime llevan extensión `.js` explícita** y no existe
ningún import de directorio. Romper esa regla no falla en `tsc`: falla en Vercel, en frío, con un
`ERR_MODULE_NOT_FOUND` que tumba todas las rutas a la vez.

### Región `iad1`: por qué está clavada

`iad1` es la región del PostgreSQL de Neon (us-east-1). Hoy ya es el default del proyecto, así
que declararla **no cambia nada: impide que cambie sin pasar por el repo**.

La razón de fondo es medible. `POST /portal-sync/import` emite **~115 consultas secuenciales
dentro de una sola transacción**, así que el tiempo del endpoint es ese número multiplicado por
el RTT a la base. Medición del 2026-09-02: **~150 ms por consulta desde Lima, ~17 s en total**,
contra décimas de segundo desde `iad1`. Mover la región desde el panel de Vercel *no rompe nada
de forma visible: solo multiplica la latencia, y eso no se detecta mirando logs de error*.

### `maxDuration`: la decisión de NO declararlo

Verificado contra la API de Vercel el 2026-09-02:

> **1 · Con Fluid compute, el plan Hobby da 300 s por defecto Y de tope.**
> `defaultResourceConfig.functionDefaultTimeout = 300`, `resourceConfig.fluid = true`. Declarar
> cualquier número **solo puede BAJAR** ese techo. No existe valor que lo suba.

> **2 · Los límites de 10 s / 15 s / 60 s son del modelo anterior a Fluid compute.** Vercel los
> subió el 2025-06-25. Un `maxDuration: 60` puesto "por prudencia" convertiría un no-problema en
> un corte real: la importación desde miUlima midió **40,7 s** la primera vez y **47,7 s** la
> segunda contra el portal real.

> **3 · No existe `maxDuration` a nivel raíz del archivo.** El esquema solo lo acepta dentro de
> `functions.<glob>`, y Vercel **no documenta** con qué glob se identifica la función que genera
> el preset Hono. Si el glob no coincide, la entrada **se ignora en silencio**: el archivo parece
> configurado y no configura nada.

### Comprobar en 5 segundos qué hay en producción

Dos endpoints públicos, sin `authMiddleware`, precisamente para que sirvan de diagnóstico:

```bash
curl -s https://u-lima-backend-is-2-one.vercel.app/health
# {"status":"ok","timestamp":"2026-09-07T05:50:06.548Z"}

curl -s https://u-lima-backend-is-2-one.vercel.app/version
# {"commit":"e956f83eda16fd462dd1cecc02b4e414111ae088","ref":"main","deployment":"dpl_BvEqMLSa9mWWv4QaLzWY9yQ7Hyqj"}
```

`/version` ([`src/server.ts`](src/server.ts)`:52-60`) devuelve las tres variables que Vercel
inyecta —`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_DEPLOYMENT_ID`— y existe por
una razón concreta: **detectar de un vistazo si producción quedó detrás de `main`**. Compara el
`commit` que devuelve con `git rev-parse origin/main`; si difieren, el despliegue no corrió o
falló. En local devuelve `{ commit: "local", ref: null, deployment: null }`.

`/health` responde el par `{status, timestamp}` fijado literalmente por BR-PLATFORM-03.

> ⚠️ **Ojo con el diagnóstico.** [`src/config/env.ts`](src/config/env.ts)`:96` hace
> `process.exit(1)` si falta cualquier variable obligatoria. En serverless eso se manifiesta como
> `FUNCTION_INVOCATION_FAILED` en el cold start de **todas** las rutas, `/health` y `/version`
> incluidas: el mecanismo de diagnóstico se cae junto con la app.

### Variables que deben existir en el proyecto Vercel

De las 19 variables del `envSchema`, solo **3 son obligatorias sin default**. Las demás tienen
default, pero varias tienen un default que **no sirve en producción**.

| Variable | ¿Debe existir en Vercel? | Qué pasa si falta |
|:---|:---|:---|
| `DATABASE_URL` | 🔴 **Obligatoria** | `process.exit(1)` en el arranque. Toda la API cae |
| `JWT_SECRET` | 🔴 **Obligatoria** | `process.exit(1)`. Mínimo aceptado: 8 caracteres (débil para HS256) |
| `COHERE_API_KEY` | 🔴 **Obligatoria** | `process.exit(1)`, aunque solo la use el chatbot |
| `CORS_ORIGINS` | 🟠 **Sí, en producción** | Cae a `Access-Control-Allow-Origin: *`. Definirla es acción pendiente desde el 2026-06-15 |
| `NODE_ENV=production` | 🟠 **Sí** | Sin ella, un OTP de restablecimiento que no se pudo enviar se **imprime en el log** con prefijo `[DEV ONLY]` |
| `RESEND_API_KEY` | 🟠 **Sí** | En producción se loguea un `console.error` y **el correo de restablecimiento no se envía** |
| `RESEND_FROM` | Opcional | Default `ULima+ <notificaciones@mail.grupo5app.lat>`. Prohibido usar un local-part `no-reply`: es señal de spam para Gmail |
| `RESEND_REPLY_TO` | Opcional | Sin ella no se agrega la cabecera `Reply-To` |
| `FIREBASE_PROJECT_ID` | 🟡 Solo para chat | `firebase.service.ts:28` corta la inicialización y el chat (HU23) queda inerte |
| `FIREBASE_CLIENT_EMAIL` | 🟡 Solo para chat | Ídem |
| `FIREBASE_PRIVATE_KEY` | 🟡 Solo para chat | Ídem. Viaja con `\n` literales; `firebase.service.ts:36` los normaliza |
| `FIREBASE_DATABASE_URL` | 🟡 Solo para chat | Sin ella no hay Realtime Database donde escribir mensajes |
| `JWT_EXPIRES_IN` | Opcional | Default `86400` s (24 h). Se devuelve al cliente en `expiresIn` |
| `PASSWORD_RESET_MAX_PER_HOUR` | Opcional | Default `3` OTP por usuario por hora |
| `CHATBOT_RATE_LIMIT` | Opcional | Default `20` preguntas por alumno por hora |
| `PORTAL_BASE_URL` | Opcional | Default `https://webaloe.ulima.edu.pe`. **Con allowlist**: cualquier otro host impide el arranque |
| `PORTAL_TIMEOUT_MS` | Opcional | Default `8000` ms por petición saliente al portal |
| `SYLLABUS_BASE_URL` | Opcional | Default `https://cactus.ulima.edu.pe`. Allowlist **propia y separada** de la del portal |
| `PORT` | ❌ No | Irrelevante en serverless: no hay listener |
| `VERCEL_GIT_COMMIT_SHA` · `VERCEL_GIT_COMMIT_REF` · `VERCEL_DEPLOYMENT_ID` | Inyectadas por Vercel | Sin ellas `/version` devuelve `"local"` / `null` / `null` |

Ninguna de las variables de siembra (`STUDENT_PASSWORD`, `PROF_PASSWORD`, `JP_PASSWORD`,
`STUDENT_CODE`, …) debe existir en Vercel: los seeds están excluidos del build y se corren a mano.

### La trampa de `firebase-admin`: por qué está clavado en `12.1.0`

Es la única dependencia del `package.json` declarada **sin caret**:
`"firebase-admin": "12.1.0"`. No es un descuido, es una cicatriz.

> **1 · El síntoma.** Al desplegar, el backend crashea inmediatamente en el cold start con
> `Error [ERR_REQUIRE_ESM]: require() of ES Module /var/task/node_modules/jose/dist/webapi/index.js
> from /var/task/node_modules/jwks-rsa/src/utils.js not supported`, que la plataforma reporta
> como `FUNCTION_INVOCATION_FAILED`. No falla el chat: falla **todo**, porque el módulo ni
> siquiera termina de evaluarse.

> **2 · La causa.** `firebase-admin` v13 y v14 arrastran `jwks-rsa` → `jose`, que es ESM puro.
> Eso choca con cómo Vercel empaqueta módulos en un proyecto con `"type": "module"`.

> **3 · La solución.** Fijar `firebase-admin` en `12.1.0` (o cualquier `12.x`), cuya versión de
> `jose` convive con el mixto CJS/ESM del entorno serverless. Aplicado en el commit
> `c67c9c8 fix(chat): downgrade firebase-admin to v12.1.0 to fix Vercel ESM requirement issue`.

> **4 · El riesgo que queda.** No hay entorno espejo. Si alguien sube `firebase-admin ^14` —y con
> él `jose@6` al `bun.lock`—, **producción se cae y queda caída**, sin una prueba local que lo
> anticipe: en desarrollo con Bun el mismo grafo de dependencias funciona. La regla está escrita
> en [`KNOWLEDGE.md`](KNOWLEDGE.md)`:144-147`, en
> [`specs/features/chat/chat.spec.md`](specs/features/chat/chat.spec.md)`:51` y en
> [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md)`:529`. Falta en `CONTRIBUTING`.

### El mapa del despliegue

```mermaid
flowchart TD
    subgraph cliente["Cliente"]
        APP["App Flutter ULima++<br/>Android e iOS"]
    end

    subgraph gh["GitHub"]
        MAIN["push a main<br/>jeffangeloss/ULima_Backend_IS2"]
    end

    subgraph vercel["Vercel · region iad1 · Fluid compute · plan Hobby"]
        BUILD["bun install<br/>bun run build = tsc<br/>excluye src/db/seed"]
        FN["Funcion serverless<br/>preset hono · export default app<br/>sin maxDuration → 300 s"]
        DIAG["GET /health y GET /version<br/>publicos · commit · ref · deployment"]
    end

    subgraph datos["Persistencia"]
        NEON[("Neon PostgreSQL<br/>us-east-1 · 34 tablas<br/>Drizzle sobre postgres-js")]
    end

    subgraph ext["Servicios externos"]
        GOOG["Google Identity<br/>SSO institucional"]
        RESEND["Resend<br/>correo del OTP"]
        FB["Firebase Admin 12.1.0<br/>chat HU23"]
        COH["Cohere<br/>chatbot"]
        PORTAL["miUlima<br/>webaloe.ulima.edu.pe"]
        CACTUS["Silabos Domino<br/>cactus.ulima.edu.pe"]
    end

    MAIN --> BUILD --> FN
    FN --> DIAG
    APP -->|"HTTPS · Authorization Bearer JWT"| FN
    FN -->|"SQL en una sola transaccion"| NEON
    FN --> GOOG
    FN --> RESEND
    FN --> FB
    FN --> COH
    FN -->|"cookies de sesion del alumno"| PORTAL
    FN -->|"solo cookie LTPA"| CACTUS
    APP -.->|"Realtime Database"| FB
```

---

## 🧭 Cómo se trabaja aquí

Este repositorio se desarrolla con **Spec Driven Development**. La primera línea de
[`AGENTS.md`](AGENTS.md)`:3` lo dice sin matices: *"No implementes comportamiento nuevo sin spec
aprobada"*.

### Por qué una spec va antes que el código

No es ceremonia académica. Es la respuesta a tres problemas que este proyecto ya sufrió:

> **1 · La base de datos ya existe y es la fuente de verdad.** El esquema de 34 tablas está
> modelado y poblado con datos reales. `bun run db:push` puede generar `DROP`s. Una spec
> aprobada es el único punto donde se decide —antes de tocar nada— si un cambio necesita tabla
> nueva, y ese cambio requiere aprobación explícita aparte.

> **2 · Dos repos, un contrato.** El backend y el frontend son repositorios separados con equipos
> que trabajan en paralelo. Cuando el backend movió `advising` al módulo `student` y
> `attendance-risk` a un módulo propio **sin avisar**, salieron **3 bugs en una semana**. Por eso
> [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md) (600 líneas) se actualiza *primero*
> en el backend y luego se espeja en el frontend.

> **3 · Los tests se enlazan a los requisitos, no a una lista aparte.** El enlace `[@test]` va
> pegado al requisito que verifica. Así se ve, leyendo la spec, qué requisito tiene red y cuál no.

### El flujo obligatorio, paso a paso

Los 10 pasos de [`AGENTS.md`](AGENTS.md)`:17-26`, en orden, sin saltos:

| # | Paso | Detalle |
|---:|:---|:---|
| 1 | Leer [`.tessl/RULES.md`](.tessl/RULES.md) | 15 líneas que enlazan las 3 reglas del tile |
| 2 | Leer [`KNOWLEDGE.md`](KNOWLEDGE.md) | Reglas de dominio y las 6 *Decisiones No Negociables* |
| 3 | Leer [`docs/specs/workflow.md`](docs/specs/workflow.md) y [`docs/specs/feature-index.md`](docs/specs/feature-index.md) | Orden de trabajo y estado declarado de cada feature |
| 4 | Ubicar `specs/features/<feature>/<feature>.spec.md` | Hay **18 specs** en [`specs/features/`](specs/features/) |
| 5 | Si la spec no existe o no cubre el cambio, **actualizarla primero** | El código va después. Siempre |
| 6 | Si hay API nueva o cambiada, actualizar [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md) | El backend define el contrato; el frontend lo refleja |
| 7 | **Esperar aprobación explícita de la spec** | Ver abajo qué cuenta como aprobación |
| 8 | Implementar **solo archivos incluidos en `targets`** | El frontmatter delimita el radio de acción |
| 9 | Ejecutar `bun run build` | Verificación obligatoria tras cualquier cambio TypeScript |
| 10 | Enlazar los tests nuevos con `[@test]` **junto al requisito** | Nunca a un archivo que no existe |

### Qué papel juega Tessl

[`tessl.json`](tessl.json) declara una sola dependencia: el tile
`tessl-labs/spec-driven-development` **2.0.1**, en `mode: "vendored"` — el tile se copia dentro
del repo, en `.tessl/tiles/`, y es idéntico byte a byte al del frontend.

Tessl **no es un framework ni una librería de runtime**: no aparece en `package.json`, no se
importa desde `src/` y no participa del build. Es un *steering tile*: un paquete de contexto que
el agente de IA lee antes de escribir. Sus propias palabras: *"No special commands. No
annotations. No framework."* Se expone también como servidor MCP (`.codex/config.toml`,
`.cursor/mcp.json`, ambos con `tessl mcp start`).

| Tipo | Nombre | Qué hace |
|:---|:---|:---|
| Regla ⚠️ *always apply* | `spec-before-code` | *"Never begin implementation without an approved spec."* |
| Regla ⚠️ *always apply* | `one-question-at-a-time` | Una sola pregunta por mensaje mientras se levantan requisitos |
| Regla | `spec-format-compliance` | Extensión `.spec.md`, frontmatter con `name`/`description`/`targets`, `[@test]` junto al requisito |
| Skill | `requirement-gathering` | Levantar requisitos antes de redactar |
| Skill | `spec-writer` | Redactar la spec en el formato canónico |
| Skill | `spec-verification` | Verificar que cada `targets:` y cada `[@test]` resuelvan a un archivo real |
| Skill | `work-review` | Revisar que spec, contrato e implementación coincidan |

La regla `spec-before-code` define con precisión qué **cuenta** como aprobación —"looks good",
"yes", "approved", o correcciones seguidas de confirmación— y qué **no**: el silencio, un *"just
do it"* sin haber leído la spec, y *"your own judgment that the spec is probably fine"*.

Admite dos excepciones: cambios triviales (typos, formato) y hotfixes de emergencia, *pero la
spec se escribe retroactivamente*. Este repo tiene un caso declarado:
[`specs/features/chat/chat.spec.md`](specs/features/chat/chat.spec.md) dice literalmente que es
una spec retroactiva, escrita después de que la implementación se mergeara a `main`.

### El ciclo completo

```mermaid
flowchart TD
    A["Tarea nueva · HU o bug"] --> B["1 · Leer .tessl/RULES.md"]
    B --> C["2 · Leer KNOWLEDGE.md"]
    C --> D["3 · Leer workflow.md y feature-index.md"]
    D --> E["4 · Ubicar la spec de la feature"]
    E --> F{"La spec cubre el cambio"}
    F -- No --> G["Skill requirement-gathering<br/>una pregunta por mensaje"]
    G --> H["5 · Skill spec-writer<br/>frontmatter name · description · targets"]
    H --> I
    F -- "Si" --> I{"Hay API nueva o modificada"}
    I -- "Si" --> J["6 · Actualizar api-contracts.md<br/>primero backend · luego espejo en frontend"]
    I -- "No" --> K
    J --> K["7 · Esperar aprobacion explicita"]
    K --> L{"Regla spec-before-code"}
    L -- "Silencio o un just do it" --> K
    L -- "Aprobada" --> M["8 · Implementar SOLO los archivos de targets"]
    M --> N["9 · bun run build"]
    N --> O["10 · Enlazar cada test con @test<br/>junto al requisito que verifica"]
    O --> P["Skills work-review y spec-verification"]
    P --> Q{"Spec · contrato · implementacion coinciden"}
    Q -- "No" --> E
    Q -- "Si" --> R["Commit tipo scope en rama feat o fix"]
    R --> S["Pull Request y merge a main"]
    S --> T["Deploy automatico en Vercel iad1"]
```

### La regla de `targets`

El frontmatter de cada spec delimita qué archivos puede tocar la implementación. Este proyecto es
**más estricto que el tile**:

| Caso | `targets` permitido |
|:---|:---|
| Feature normal | `../../../src/modules/<feature>/**` |
| Middleware de auth compartido | Agregar `../../../src/shared/middleware/auth-middleware.ts` **solo si aplica** |
| Eventos de dominio | Agregar `../../../src/events/**` **solo si la spec implementa observers reales** |
| Cambio de esquema | Agregar `../../../src/db/schema/schema.ts` **solo con cambio de BD aprobado** |

Y la instrucción operativa que cierra
[`docs/specs/spec-template.md`](docs/specs/spec-template.md)`:41`: *"Do not add `[@test]` links
that point to files that do not exist."*

### Convención de commits

De los **275 commits** alcanzables desde todas las refs del backend, **201 (73,1 %)** llevan
prefijo `tipo:` o `tipo(scope):`; **154** llevan scope explícito. El asunto va en minúscula
después de los dos puntos y describe el **efecto observable**, no el archivo tocado.

| Prefijo | Commits | Ejemplo real del log |
|:---|---:|:---|
| `feat` | 74 | `feat(portal-sync): importar sílabos desde la base Domino de cactus` |
| `fix` | 60 | `fix(portal-sync): los arreglos de ids en SQL se ligaban como constructor de fila` |
| `docs` | 24 | `docs(api-contracts): corregir la garantia de silabos y la descripcion de silaboUrl (C-1, C-2)` |
| `test` | 15 | `test(portal-sync): cubrir el allowlist anti-SSRF de PORTAL_BASE_URL` |
| `chore` | 9 | `chore: eliminar módulo simulated-grades (redundante, código muerto)` |
| `ci` | 5 | `ci: retirar el espejo automático con meltiruiz/main` |
| `seguridad` | 3 | `seguridad(api): exigir JWT en course-detail, grades y section-management` |
| `refactor` | 2 | `refactor(portal-sync): el parser de silabos recibe la base por parametro (M-11)` |
| `perf` | 1 | `perf(portal-sync): escribir el progreso en lote, no dos viajes por curso` |
| `build` | 1 | `build: fijar Bun como gestor de paquetes canonico` |
| `spec` | 1 | `spec(asistencia-portal): RS-BE-15 y RS-BE-16, pendientes de aprobación` |
| `wip` | 1 | `wip: snapshot del arbol compartido antes de limpiarlo (2026-09-06)` |
| `limpieza` | 1 | `limpieza: eliminar scripts de un solo uso y credencial hardcodeada` |

`seguridad` y `limpieza` son **tipos en español propios del equipo**, no del estándar Conventional
Commits. Se conservaron a propósito: marcan commits que se revisan distinto.

Desviaciones reales que existen en el log y no conviene imitar: `tests:` en plural (1),
y `Test:` / `Fix:` con mayúscula inicial (3).

**Scopes más usados en el backend:** `portal-sync` (51), `chat` (7), `auth` (6), `schedule` (5),
`db` (5), `course-detail` (5), `chatbot` (4), `alertas` (4). También hay scopes compuestos reales:
`schedule,auth,portal-sync`, `notas/alertas`, `seguridad,email`, `chat+cursos`.

**Trazabilidad.** Los mensajes citan entre paréntesis el identificador del hallazgo que cierran:
`(RULING 1, C-1 y C-2)`, `(M-11)`, `(I-4, M-9)`, `(TT03)`, `(R1-R16)`, `(RS-BE-15)`. Cuando el
commit llegó por squash-merge de un PR, lleva el sufijo `(#NN)` — 13 casos en el backend.
Cuando cierra una historia de usuario, la HU va en el scope:
`feat(HU11): estadísticas reales del salón (adiós al mock) (#16)`.

### Convención de ramas

Hay **dos épocas**, y el corte coincide con la auditoría de deuda técnica.

**Época 1 (mayo → julio 2026): una rama de larga vida por persona.** `jeff`, `mel`, `sam`,
`nehemias`, `Ronald`, `Julito`, `aUreLi0`. Cada integrante sincronizaba `main` hacia su rama con
merges y abría PR de vuelta. Los problemas se ven en los nombres: capitalización inconsistente
(`Julito` y `Ronald` frente a `jeff` y `mel`) y **dos ramas casi homónimas para la misma persona**
(`aUreLi0` y `aUreLio`).

**Época 2 (agosto → septiembre 2026): `tipo/slug-descriptivo`.**

| Prefijo | Semántica | Ramas reales |
|:---|:---|:---|
| `feat/` | Funcionalidad nueva | `feat/portal-sync-backend`, `feat/delegados-portal`, `feat/asistencia-honesta`, `feat/asesorias-2026-2`, `feat/fotos-perfil` |
| `fix/` | Corrección de comportamiento | `fix/malla-progreso-real`, `fix/malla-completados`, `fix/nombres-apellidos-primero` |
| `wip/` | Snapshot defensivo, no entregable | `wip/arbol-compartido-20260906` — con sufijo de fecha `YYYYMMDD` |
| `investigate/` | Spike o reproducción de bug, sin entregable | `investigate/otp-backspace-hu20` — el slug referencia la HU |
| `chore/` | Mantenimiento y dependencias | `chore/tt12-auditoria-dependencias-flutter` |

Cuando una feature cruza los dos repos, el tronco del nombre se repite y el sufijo distingue:
`feat/portal-sync-backend` ↔ `feat/portal-sync-frontend`, `feat/asistencia-honesta` ↔
`feat/asistencia-honesta-fe`. Y cuando el nombre es **idéntico** en ambos repos significa cambio
coordinado simultáneo: `feat/delegados-portal` y `fix/malla-completados` existen igual en los dos.

---

## 🧯 Deuda técnica y límites conocidos

### La auditoría de junio de 2026

El 15 de junio de 2026 el proyecto se sometió a una **auditoría multiagente sobre 10 dimensiones**,
con verificación adversarial de cada hallazgo crítico y alto contra el código real: 59 agentes,
~1 222 lecturas de archivo, datos crudos en `_debt_findings.json`. El informe es
[`DEUDA_TECNICA.md`](DEUDA_TECNICA.md), 175 líneas. Confirmó **128 ítems**.

| Severidad | Total | Backend | Frontend |
|:---|---:|---:|---:|
| 🔴 Crítica | 11 | 8 | 3 |
| 🟠 Alta | 20 | 9 | 11 |
| 🟡 Media | 75 | ~37 | ~38 |
| ⚪ Baja | 22 | ~14 | ~8 |
| **Total** | **128** | **61** | **67** |

El patrón transversal declarado en `:30`: *"el módulo de autenticación y autorización concentra
varios de los críticos… Debe ser la prioridad #1 del Release 2"*. De los 11 críticos, nueve
llevan identificador (**C1–C9**) y el CORS abierto se trató aparte.

La auditoría fue honesta también en sentido inverso: descartó los falsos positivos frecuentes.
`.env` **no** está versionado, y `dist/` y `build/` **no** están en git.

### Estado de los críticos, verificado contra el código el 2026-09-07

| Ítem | Qué era | Estado hoy |
|:---|:---|:---|
| **C1** | Bypass `Bearer dev-<código>` (+ `?code=`, `X-User-Code`): autenticaba con solo conocer el código, sin contraseña ni JWT, **en todos los entornos** | ✅ **CERRADO.** [`src/shared/middleware/auth-middleware.ts`](src/shared/middleware/auth-middleware.ts)`:22` solo lo menciona en un comentario que explica que está prohibido. La única vía es `Authorization: Bearer <JWT>` — BR-AUTH-08 |
| **C2** | Login *fail-open*: ante un error de BD se emitía un **JWT firmado** para un usuario mock `id=0`, `code="00000000"` | ✅ **CERRADO.** No existe en `src/modules/auth/` ni en el middleware. Un fallo de BD en auth propaga `500 INTERNAL_ERROR` y **nunca se emite token** — BR-AUTH-09 |
| **C3** | 10 rutas académicas sin `authMiddleware`: enumeración no autenticada de alumnos, docentes, secciones, matrículas y **notas** | ✅ **CERRADO.** Los tres módulos aplican el middleware: `grades` 2 aplicaciones, `section-management` 2, `course-detail` 3 |
| **C4** | SQL directo (`db.execute(sql...)`) dentro de las `routes`, con controllers inyectados sin usar. Rompe `routes→controller→service→repository` y es la causa raíz de C3 | ⚠️ **PARCIAL.** `grades` y `section-management` ya no lo hacen. [`src/modules/course-detail/course-detail.routes.ts`](src/modules/course-detail/course-detail.routes.ts) conserva **8 llamadas `db.execute`** en 318 líneas, en las líneas 63, 82, 119, 134, 178, 193, 207 y 264 |
| **C5** | Cero pruebas en el backend: sin script `test` ni runner | ✅ **CERRADO.** `"test": "bun test"` y **74 archivos** `*.test.ts` bajo [`test/`](test/) |
| **C6** | Cero pruebas en el frontend | ✅ **CERRADO.** **46 archivos** `*_test.dart` en el repo del frontend |
| **C7** | Doble lockfile: `bun.lock` + `package-lock.json` ⇒ builds inconsistentes entre entornos | ✅ **CERRADO.** `package-lock.json` ya no existe; el lockfile canónico es `bun.lock` — BR-PLATFORM-09 |
| **C8** | APK de release firmado con la llave de **debug**: no apto para producción ni Play Store | ⚠️ **PARCIAL** (repo frontend). `android/app/build.gradle.kts:72-80` usa el keystore de release si existe `key.properties` y **cae a debug si no existe** |
| **C9** | Campos `late` de Dart accedidos antes de inicializar ⇒ `LateInitializationError` y crash | ⏳ Pertenece al repo del frontend; la hoja de ruta lo dejó para el Sprint 1. No verificado en esta pasada |
| **CORS** | `app.use("*", cors())` totalmente abierto | ✅ **CERRADO** como código: [`src/config/app-config.ts`](src/config/app-config.ts)`:28` lee `CORS_ORIGINS`. ⚠️ Pero **sin la variable definida cae a `*`**, así que en producción debe estar definida — ver [Despliegue](#-despliegue) |

### Límites conocidos vigentes

Esto no son bugs pendientes de arreglo: son fronteras del diseño actual que conviene conocer
antes de apoyarse en ellas.

> **1 · El rate limiting es por instancia, no global.**
> [`src/shared/middleware/rate-limit.ts`](src/shared/middleware/rate-limit.ts)`:9` y `:49` guardan
> los contadores en un `Map` de módulo. En Vercel serverless cada instancia mantiene **su propio
> contador**: con escalado horizontal el límite efectivo se multiplica, y cada cold start lo
> reinicia desde cero. Afecta a los 20 mensajes/hora del chatbot y a las 5 importaciones/hora de
> `portal-sync`. *(El `Map` está verificado en el código; el efecto multi-instancia es inferencia
> sobre el modelo de ejecución de Vercel, no una medición.)*

> **2 · Los sílabos importados desde miUlima no se pueden abrir en la app.**
> La URL que `portal-sync` guarda en `syllabus.drive_file_url` apunta a un documento de la base
> **Domino de `cactus.ulima.edu.pe` protegido por sesión**; el visor de PDF in-app de Flutter
> (HU21) no puede abrirla como sí abre las de Google Drive. Registrado como decisión pendiente #10
> en [`specs/features/portal-sync/portal-sync.spec.md`](specs/features/portal-sync/portal-sync.spec.md)`:334`.
> De ahí que `upsertSyllabus` use `on conflict do nothing` **sin conflict target** y nunca pise una
> fila existente: las filas sembradas a mano llevan enlaces de Drive que el visor **sí** abre, y
> una re-importación no debe degradarlas. Consecuencia aceptada: re-importar el mismo ciclo
> tampoco actualiza un sílabo republicado.

> **3 · `registerEventObservers()` es inerte.**
> [`src/events/index.ts`](src/events/index.ts)`:1-3` tiene el cuerpo vacío con el comentario
> *"Observer registration intentionally left empty for future implementation"*. `src/server.ts:11`
> lo invoca en cada cold start y no registra nada. Los tres observers que existen
> —`academic-risk.observer.ts`, `announcement.observer.ts`, `section-average.observer.ts`— no los
> escucha nadie. Los services de `grades`, `schedule` y `curriculum` reciben el `EventBus` por
> constructor y publican **al vacío**. La arquitectura de eventos está cableada; la suscripción, no.

> **4 · La importación desde el portal exige autorización institucional que no consta en el repo.**
> `portal-sync.spec.md:295` declara que se requiere autorización escrita del área de Sistemas de la
> Universidad para que una app reciba cookies de sesión del portal institucional. La feature ya
> está implementada; no hay constancia de esa autorización en el repositorio. Tampoco existe
> procedimiento de borrado de los datos importados a pedido del alumno, requisito de la Ley 29733
> (decisión pendiente #7).

> **5 · `bun run start` no levanta nada.**
> El script apunta a `dist/server.js`, pero `src/server.ts` ya no arranca listener: ejecutar el
> bundle solo evalúa el módulo y termina. El servidor local vive en `src/node-server.ts`, que
> **ningún script invoca**. BR-PLATFORM-05 anticipó exactamente este punto; el script no se ajustó.

> **6 · Las migraciones tienen numeración colisionada.**
> 9 archivos `.sql` en [`drizzle/`](drizzle/), 6 snapshots y 7 entradas de journal: `0001`, `0002`
> y `0003` tienen **dos archivos cada uno**, `0004` no tiene snapshot, existe un
> `0005_snapshot.json` **huérfano** sin `.sql`, y **dos** tags del journal no coinciden con su
> `idx` (`0003_groovy_kulan_gath` va en el `idx` 4 y `0004_portal_sync_final_grade` en el 5; los
> `idx` en sí van de 0 a 6 sin hueco).
> Drizzle aplica por hash y hoy funciona, pero **el próximo `db:generate` puede colisionar**.
> Ver [`MIGRATIONS.md`](MIGRATIONS.md).

> **7 · Autorización fina pendiente.**
> Los endpoints protegidos exigen JWT y rol, pero **aún no validan que cada alumno solo acceda a
> sus propios datos**. Caso concreto: `GET /grades/me/courses` deriva el alumno del `?code=` que
> manda el cliente en vez del `studentId` del JWT. Deuda declarada explícitamente en las specs.

### La documentación se contradice con el código en varios puntos

Copiar estos documentos al pie de la letra propagaría errores. Están anotados aquí para que nadie
lo haga:

| Documento | Afirma | Realidad verificada |
|:---|:---|:---|
| `docs/AUDITORIA_TECNICA.md:43,108` | *"No existe módulo `networking` pese a estar documentado"* | **Existe**: 8 archivos en `src/modules/networking/`, registrado en `src/modules/index.ts:32` con `authMiddleware` + `requireRole` |
| `docs/AUDITORIA_TECNICA.md:32` | Lista un módulo `simulated-grades` huérfano | **Ya no existe**; se eliminó en `chore: eliminar módulo simulated-grades` |
| `DEUDA_TECNICA.md:69-72` (C5) | *"No hay script `test` ni runner"* | `package.json:11` → `"test": "bun test"`; **74** archivos de prueba |
| `DEUDA_TECNICA.md:134` | Lista scripts ad-hoc `apply.cjs`, `check-db.js`, `test-db.cjs` | Ninguno existe hoy |
| `specs/features/auth/auth.spec.md:123` | `RESEND_FROM` usa un local-part `no-reply` | `env.ts:51-53` usa `notificaciones@…` y **prohíbe explícitamente** `no-reply` por ser señal de spam |
| `README.md:89-100` y `GET /` (`server.ts:33-44`) | Tabulan 9 y listan 10 módulos | **15 módulos** registrados en `src/modules/index.ts:19-33` |
| `README.md:127-132` | Documenta 4 variables de entorno | **19** en el `envSchema` |
| `MIGRATIONS.md:8` | *"La tabla `__drizzle_migrations` no existe en la BD"* | El mismo archivo, `:97-99`, describe migraciones aplicadas con `db:migrate` y un sellado manual en esa tabla. Sección histórica sin actualizar |
| 21 rutas `[@test]` de las specs, 43 apariciones | Apuntan al layout plano `test/<archivo>.test.ts` (16) o a subcarpetas que ya no existen: `test/chatbot/`, `test/services/`, `test/shared/` (5) | Los archivos existen, pero bajo `test/HU##_<alias>/`: el commit `aeea9ae` movió 11 tests el 2026-07-14 y **las specs nunca se actualizaron**. Al día: `portal-sync`, `delegados-portal` y `schedule` |
| `specs/features/platform-runtime/…:15` | Declara `.env.example` como `target` | El archivo **no existe** y `.gitignore:60` (`.env*`) anula la negación `!.env.example` de la línea 10. Nadie puede saber qué variables setear |

### Datos personales reales en un repositorio público

> ⚠️ **AVISO DE PRIVACIDAD.** Este repositorio es **público en GitHub** y hay archivos de seed
> **versionados** que contienen códigos y nombres de alumnos y docentes reales. No se reproduce
> aquí ninguno de esos valores; solo se señalan los archivos.
>
> | Archivo (trackeado en git) | Qué contiene |
> |:---|:---|
> | [`src/db/seed/delegados_secciones.ts`](src/db/seed/delegados_secciones.ts) | **215 códigos de alumno distintos** en 617 líneas de roster por sección |
> | [`src/db/seed/repr_855.ts`](src/db/seed/repr_855.ts) | Códigos de los representantes de una sección |
> | [`src/db/seed/notas_855.ts`](src/db/seed/notas_855.ts) y [`src/db/seed/propuesta_855.ts`](src/db/seed/propuesta_855.ts) | 17 códigos de alumno cada uno, con notas asociadas |
> | [`src/db/seed/docentes.ts`](src/db/seed/docentes.ts) | Un código de alumno hardcodeado como default de `STUDENT_CODE` (`:41`) y el **nombre completo de una persona real** como default de `JP_FULLNAME` (`:43`) |
> | `scripts/diag_<código>.sql` | Único `.sql` bajo `scripts/`: el **código va en el nombre del archivo** y en las cláusulas `WHERE` |
> | `_debt_findings.json` | El volcado crudo de la auditoría, 191 KB. Transcribe **códigos de alumno reales junto con la contraseña en claro** que comparten nueve cuentas de prueba, y uno de esos códigos es el mismo que `repr_855.ts` asocia a un nombre completo real: el par código↔persona es reconstruible desde el propio árbol |
>
> **Recomendación:** anonimizar los datos (códigos sintéticos, nombres de fantasía) o sacar estos
> archivos del control de versiones con `git rm --cached` y parametrizar las consultas (`:codigo`
> en vez de un literal). Si el historial importa, evaluar una reescritura. Mientras tanto, son
> datos personales identificables publicados.
>
> **Empieza por `_debt_findings.json`.** Es el archivo más sensible del árbol y el único de la
> tabla que además publica una credencial: sácalo del control de versiones antes que ningún otro.
>
> Dos avisos relacionados, ambos **correctamente ignorados** hoy pero a un `git add -f` de
> distancia: el dump `backup_pre_0008_20260906.sql` (472 KB, con hashes bcrypt y datos de
> producción) vive en la raíz del árbol de trabajo —conviene moverlo fuera del repo—, y
> `scripts/out/` guarda el JSON extraído del Excel de asesorías (`asesorias-2026-2.json`, 52 KB)
> más el volcado `horario-2026-2.txt`, con **112 enlaces Zoom personales distintos** de docentes.
> El Excel de origen no está en el repositorio; el JSON que lo cita, sí.

---

## 👥 Equipo

Proyecto del curso de **Ingeniería de Software 2** de la Universidad de Lima — de ahí el sufijo
`IS2` en el nombre de los dos repositorios. Seis integrantes, dos repos, 118 días de desarrollo
(2026-05-13 → 2026-09-07, ambos incluidos) y **556 commits** entre ambos: 275 en el backend y 281
en el frontend, contados con `git log --all` sobre todas las refs de los dos árboles. Sobre la rama
de trabajo sola son 253 y 274, hasta el 2026-09-06.

### Contribuyentes

Conteo con `git shortlog -sn --all` sobre los dos repositorios. Sin correos.

| Persona | Commits backend | Commits frontend |
|:---|---:|---:|
| Jefferson Sanchez Palacios · `jeffangeloss` · `Jeff` | 211 | 167 |
| Ronald · Ronald Alfredo Hurtado Lago | 20 | 11 |
| `citrix` | 11 | 33 |
| Nehemias | 6 | 12 |
| `aUreLi0_triste` | 5 | 13 |
| `rex` | 5 | 9 |
| Melissa Ruíz | 4 | 17 |
| Julio · Julio Gabriel Salazar Torres | 3 | 6 |
| `lio` | 2 | 1 |
| Bots (Antigravity Bot, github-actions) | 8 | 12 |

Varias personas commitean bajo más de un nombre de git —cuentas de GitHub distintas para el fork
personal y para el repo canónico—, así que la tabla lista identidades, no personas. Los seis alias
canónicos del equipo son los que aparecen abajo.

### Los seis autores, sus historias y sus pruebas

Cada integrante tiene su propia carpeta de pruebas por historia (`test/HU##_<alias>`) y su propia
configuración de mutación (`stryker.<alias>.conf.json` en la raíz, más el script `mut:<alias>`).
Son **6 configuraciones de Stryker** y **74 archivos de prueba** repartidos en **24 carpetas**.

| Alias | Historias que llevó (carpetas `test/HU##_<alias>`) | Archivos | Módulo que muta Stryker | Reporte |
|:---|:---|---:|:---|:---|
| **jeff** | HU01 login · HU02 logout · HU16 Google SSO · HU18 asesorías · HU20 restablecer contraseña · HU23 chat · HU29 notas oficiales · HU31 portal-sync | 40 | `auth.service.ts:56-134` (`login`, `loginTeacher`) | `jeff-auth.html` |
| **mel** | HU05 especialidades · HU10 anuncios · HU14 contactos · HU25 networking | 12 | `networking.service.ts:31-56` (`updateMine`, V(G)=5) | `mel-networking.html` |
| **ronald** | HU11 estadísticas de sección · HU13 asesorías del alumno · HU28 chatbot | 9 | `advising/student/student.logic.ts` (39 líneas) | `ronald-advising.html` |
| **sam** | HU06 notas y calculadora · HU07 promedio · HU22 impedidos · HU30 notificación | 6 | `grades.logic.ts` (19 líneas) + `attendance-risk.service.ts` (194 líneas) | `sam-attendance.html` |
| **julio** | HU03 malla curricular · HU04 simulación · HU08 alertas | 4 | `alerts.logic.ts` (113 líneas) | `julio-alerts.html` |
| **nehemias** | HU09 horario del alumno · HU24 horario del docente | 3 | `schedule.logic.ts` (233 líneas) + `teacherSchedule.logic.ts` (223 líneas) | `nehemias-schedule.html` |

Las 6 configuraciones comparten los mismos parámetros: `testRunner: "command"`,
`coverageAnalysis: "off"`, `thresholds: { high: 90, low: 80, break: null }`, `concurrency: 4`, y el
mismo `ignorePatterns` (que excluye `drizzle`, `docs`, `specs` y `.tessl`). Cada una escribe su
HTML en `reports/mutation/<alias>-<módulo>.html`.

Resultados de mutación registrados en `docs/pruebas/exposicion-jeff-sam-mel/README.md:16-24`:
**Jeff 47 killed / 0 survived**, **Sam 156 killed / 0 survived / 2 ignorados por equivalentes**,
**Mel 15 killed / 0 survived**. Los dos mutantes ignorados de Sam corresponden a cambios
equivalentes sobre la guarda redundante de lista vacía en `grades.logic.ts`.

Siete historias no tienen carpeta propia de pruebas en el backend: HU12, HU15, HU17, HU19, HU21,
HU26 y HU27. Algunas se prueban solo en el frontend; otras no se prueban.

---

## 📚 Enlaces

| Dónde | Qué encontrarás |
|:---|:---|
| [`ULima_Frontend_IS2`](https://github.com/jeffangeloss/ULima_Frontend_IS2) | La app Flutter que consume esta API: 30 217 líneas Dart en 151 archivos, 28 pantallas, 25 controllers, 29 services. El APK se publica desde `.github/workflows/build-apk.yml` |
| [API en producción](https://u-lima-backend-is-2-one.vercel.app) | El despliegue vivo. Empieza por `/health` y `/version`; `GET /` devuelve el índice de módulos |
| [`docs/specs/api-contracts.md`](docs/specs/api-contracts.md) | **El contrato REST, 600 líneas.** La fuente de verdad de cada endpoint: método, path, autorización, payload, respuesta y errores. Se actualiza aquí *antes* que en el frontend |
| [`specs/features/`](specs/features/) | Las **18 specs** de feature, una carpeta por feature, con requisitos, reglas de negocio y enlaces `[@test]`. Nada se implementa sin pasar por aquí |
| [`KNOWLEDGE.md`](KNOWLEDGE.md) | Reglas de dominio y las 6 *Decisiones No Negociables*. También la trampa de `firebase-admin` (`:144-147`) |
| [`AGENTS.md`](AGENTS.md) | El flujo obligatorio de 10 pasos, las reglas de arquitectura y los comandos de base de datos restringidos |
| [`MIGRATIONS.md`](MIGRATIONS.md) | El protocolo de migraciones: SQL aditivo numerado, `db:push` prohibido siempre, una sola persona aplica, con backup previo y evidencia |
| [`DEUDA_TECNICA.md`](DEUDA_TECNICA.md) | El informe completo de la auditoría de junio de 2026: 128 ítems, 11 críticos, con ubicación exacta y hoja de ruta |
| [`docs/backend/architecture.md`](docs/backend/architecture.md) | La arquitectura en capas `routes → controller → service → repository → db` y las reglas de dependencia entre ellas |

### Licencia y uso

**Ninguno de los dos repositorios declara licencia**: no existe archivo `LICENSE` en la raíz del
backend ni del frontend. Sin licencia explícita el código queda bajo copyright de sus autores y
**no se concede permiso de uso, copia, modificación ni redistribución**. Es un trabajo académico
del curso de Ingeniería de Software 2 de la Universidad de Lima, publicado para evaluación y
portafolio, no un proyecto de código abierto.

| Punto | Estado |
|:---|:---|
| Archivo `LICENSE` | ❌ Ausente en los dos repositorios |
| Uso por terceros | Sin permiso concedido; pedirlo a los autores |
| Marcas «ULima» y «Universidad de Lima» | Propiedad de la Universidad de Lima; este proyecto no está avalado por ella |
| Datos del repositorio | ⚠️ Hay datos académicos reales versionados. Lee [Deuda técnica y límites conocidos](#-deuda-técnica-y-límites-conocidos) antes de clonar o redistribuir |

Decidir y añadir un `LICENSE` —MIT o similar si se quiere abrir, una nota de «todos los derechos
reservados» si no— es trabajo de una línea que hoy nadie hizo.

<div align="center">

**Universidad de Lima** · Facultad de Ingeniería y Arquitectura<br/>
Carrera de Ingeniería de Sistemas · Curso de Ingeniería de Software 2

*ULima++ · Backend · API REST para la app Flutter de estudiantes*

</div>
