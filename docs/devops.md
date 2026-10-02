# DevOps del backend

Este documento describe cómo se ramifica, se prueba, se publica y se despliega el backend de ULima++. Todo lo necesario para reproducir los entornos de pruebas y de producción vive en el repositorio, y cada versión que llega a producción queda marcada con un tag `vX.Y.Z` y un GitHub Release.

## Ramas

| Rama | Sale de | Entra a | Despliegue |
|---|---|---|---|
| `main` | `develop` (versión) o `hotfix/*` | ninguna | Vercel Production |
| `develop` (rama por defecto) | `main` al crearla | `main` por PR de versión | Vercel Preview con la base de pruebas |
| `feat/*`, `fix/*`, `docs/*`, `chore/*`, `test/*`, `refactor/*` | `develop` | `develop` por PR | Vercel Preview |
| `hotfix/*` | `main` | `main` por PR, y después `main` vuelve a `develop` | Vercel Production |

Una rama de trabajo lleva el prefijo de su tipo y un nombre corto, por ejemplo `feat/bloques-horario` o `fix/menu-aula-virtual`, y sus commits siguen la forma `tipo(scope): descripción`, como el resto del historial. Sale de `develop` actualizada y vuelve a `develop` por PR, sin push directo a `main` ni a `develop`.

La columna Despliegue indica dónde termina cada cambio. Mientras una rama no entra a `main`, su push solo genera un despliegue Preview de Vercel. A `main` solo entran PR desde `develop` o desde `hotfix/*`, y el job `flujo` de la CI rechaza cualquier otro origen.

## Cómo publicar una versión

Las versiones siguen el Versionado Semántico, con tags `vMAJOR.MINOR.PATCH`. El `package.json` lleva la versión de la próxima publicación y el `CHANGELOG.md` cuenta qué trae.

1. Elige el número. Sube MAJOR si la API cambia de forma incompatible, MINOR si agrega funciones compatibles y PATCH si solo corrige errores.
2. Crea `chore/version-X.Y.Z` desde `develop`. Cambia `version` en `package.json` y agrega a `CHANGELOG.md`, encima de la versión anterior, una sección `## [X.Y.Z] - AAAA-MM-DD`, con los cambios agrupados en Añadido, Cambiado y Corregido. El encabezado respeta ese formato exacto, porque `release.yml` busca esa cadena para armar las notas del Release. Tampoco se agregan al final del archivo definiciones de enlace como `[X.Y.Z]: url`, porque `release.yml` lee la sección más antigua hasta el final del archivo y las incluiría en sus notas.
3. Abre el PR contra `develop` y fusiónalo con `pruebas` en verde.
4. Abre un PR de `develop` a `main` titulado «Versión X.Y.Z». Tienen que pasar `flujo` y `pruebas`. Si la versión incluye migraciones, el dueño las aplica en producción antes de fusionar este PR, según la sección Migraciones.
5. Fusiona ese PR con un merge commit, no con squash, para que `main` y `develop` no diverjan. Vercel despliega `main` en producción.
6. El push a `main` dispara `release.yml`. El workflow lee la versión de `package.json` y, si el tag `vX.Y.Z` no existe, lo crea sobre el commit del merge y publica el GitHub Release con la sección del `CHANGELOG.md`. Si el tag ya existe, no hace nada, de modo que un PR a `main` sin cambio de versión no publica nada.
7. Comprueba el resultado. El Release aparece en GitHub y `GET /version` de producción devuelve el SHA del merge.

## Hotfix

Un hotfix corrige producción sin esperar a lo que haya en `develop`.

1. Crea `hotfix/descripcion` desde `main` actualizada.
2. Corrige el error y agrega la prueba que lo cubre.
3. Sube el PATCH en `package.json` y agrega su sección al `CHANGELOG.md`, porque `release.yml` solo publica una versión con tag nuevo.
4. Abre el PR contra `main`. `flujo` acepta el origen `hotfix/*` y `pruebas` tiene que pasar.
5. Fusiona el PR. Vercel despliega producción y `release.yml` crea el tag y el Release.
6. Devuelve `main` a `develop` con un PR de base `develop` y origen `main`, fusionado con un merge commit. Sin este paso `develop` sigue sin el arreglo y el siguiente PR de versión puede chocar con él.

Si el hotfix lleva una migración, se aplica primero en la base de pruebas y después en producción, como indica la sección Migraciones.

## Entornos

| Entorno | Código | Base de datos | Dirección |
|---|---|---|---|
| Producción | `main`, que Vercel despliega como Production | rama principal de Neon | https://u-lima-backend-is-2-one.vercel.app |
| Pruebas | `develop`, que Vercel despliega como Preview | rama `develop` de Neon, creada solo con el esquema | https://u-lima-backend-is-2-git-develop-jeffangeloss-projects.vercel.app |
| Local | cualquier rama | la que indique `.env` | http://localhost:3000 |

Producción también responde en https://u-lima-backend-is-2-jeffangeloss-projects.vercel.app, que es el mismo despliegue. La dirección de Pruebas empieza a responder cuando `develop` recibe su primer despliegue Preview. Cada rama de trabajo tiene además su propia dirección Preview, con la forma `u-lima-backend-is-2-git-<rama>-jeffangeloss-projects.vercel.app`, en la que las barras de la rama pasan a guiones y Vercel acorta los nombres largos.

`DATABASE_URL` se define dos veces en Vercel, una para Production con la base actual y otra para Preview con la rama `develop` de Neon. El dueño hace ese cambio en los paneles de Neon y de Vercel, porque la URL lleva contraseña y nunca se escribe en el repositorio. Un Preview que comparta la URL de producción escribe sobre datos reales, así que antes de probar una migración o una escritura en un Preview se comprueba en el panel de Vercel que su valor apunte a la base de pruebas.

Lo que queda en git para reproducir cada entorno es lo siguiente.

- `vercel.json` fija `"regions": ["iad1"]`, la región de la base de Neon, para que la región no cambie sin pasar por el repositorio. El razonamiento y la decisión de no declarar `maxDuration` están en `specs/features/platform-runtime/platform-runtime.spec.md` (BR-PLATFORM-10 y BR-PLATFORM-11).
- `.bun-version` fija la versión de Bun que usa la CI. Conviene instalar la misma versión en local.
- `drizzle/` guarda las migraciones, que se aplican primero en Pruebas y después en Producción.
- `.env.example` lista cada variable de `src/config/env.ts` con su descripción y ningún valor real. Se copia a `.env` y se completa a mano, porque `vercel env pull` escribe `[SENSITIVE]` en casi todas las variables y con ese archivo el backend no arranca.

La región de las funciones se comprueba con el encabezado `x-vercel-id`, cuyo segundo segmento es la región.

```bash
curl -sI https://u-lima-backend-is-2-one.vercel.app/ | grep -i x-vercel-id
```

Un entorno se comprueba con `GET /health` y con `GET /version`, que devuelve el commit, la rama y el despliegue que Vercel inyecta. Para leer el estado del último despliegue Preview de `develop` y su dirección, se parte del SHA de la rama. Vercel guarda ese SHA en el campo `ref` de cada despliegue, así que la consulta `deployments?ref=develop` no devuelve nada.

```bash
sha=$(gh api repos/jeffangeloss/ULima_Backend_IS2/commits/develop --jq .sha)
id=$(gh api "repos/jeffangeloss/ULima_Backend_IS2/deployments?sha=$sha&environment=Preview" --jq '.[0].id')
gh api "repos/jeffangeloss/ULima_Backend_IS2/deployments/$id/statuses" --jq '.[] | [.created_at, .state, .environment_url] | @tsv'
```

La primera línea es el estado más reciente. `success` indica un despliegue listo, y `failure` o `error` indican un despliegue fallido. Si la segunda orden no devuelve ningún identificador, `develop` todavía no tiene ese despliegue. La puesta en marcha local completa está en la sección «Configuración y entorno» del README.

## Modo estático

Desde la 2.1.0 el modo lo decide la fila única de la tabla `app_setting` (`id = 1`), en su columna `static_mode`. Con `true` el backend corre en modo estático. `POST /auth/register` responde `503` con el código `REGISTRATION_UNAVAILABLE`, toda ruta bajo `/portal-sync` responde `503` con el código `PORTAL_DESACTIVADO`, el campo `silaboUrl` de `GET /grades/me/courses` solo entrega enlaces de Drive y el contexto del chatbot no lleva alertas de inasistencias. Con `false` esas rutas responden como antes de la 2.0.0, y el resto de la API no cambia con ninguno de los dos valores. El código del portal no se borra.

Cada instancia del backend recuerda el valor 10 s, así que un cambio de la fila rige en unos 10 s sin redesplegar. Si la base no responde en 5 s o la fila no existe, rige el último valor que esa instancia leyó y, si no leyó ninguno, la variable `MODO_ESTATICO`. La variable acepta `true` o `false`, vale `false` si falta, detiene el arranque con cualquier otro valor y se lee una sola vez al arrancar, así que cambiarla sí exige un despliegue nuevo. En Production y en Preview vale `true`.

1. En la consola de Neon, dentro del proyecto de ULima++, se elige la rama de producción o la rama `develop`, que es la base del Preview de `develop`. Los Preview de las ramas `feat/*` usan la base de producción, así que comparten su fila.
2. En Tables se abre `app_setting`, se cambia la celda `static_mode` a `true` para la versión estática o a `false` para la dinámica, y se guarda. En el editor SQL la orden equivalente es la de abajo.
3. Pasados 10 s se comprueba el modo sin token. `GET /config` devuelve `{"modoEstatico":true}` o `{"modoEstatico":false}`, y `GET /portal-sync/status` devuelve `503` con `PORTAL_DESACTIVADO` en modo estático y `401` en dinámico.

```sql
UPDATE app_setting SET static_mode = false, updated_at = now() WHERE id = 1;
```

```bash
curl -s -i https://<direccion-del-entorno>/config
curl -s -i https://<direccion-del-entorno>/portal-sync/status
```

Las APK 2.1.0 toman el modo de `GET /config` al abrirse y al volver a primer plano. La tabla la crea `drizzle/0016_app_setting.sql` con la fila en `true`, y se aplica como cualquier migración (sección siguiente). Mientras un entorno no la tenga, la consulta falla y rige la variable, así que desplegar el código antes que la migración no cambia ninguna respuesta. En local la fila se cambia igual en la base de `DATABASE_URL`, y sin la tabla basta con escribir `MODO_ESTATICO=true` en `.env`.

Con la fila en `false` y `MODO_ESTATICO=true` en Vercel, una instancia fría que no puede leer `app_setting` en 5 s responde `/config` con su respaldo (`true`) y lo recuerda 10 s, así que una APK 2.1.0 puede pasar un rato a estático. Si producción va a quedar en dinámico por tiempo largo, conviene poner también `MODO_ESTATICO=false` en Vercel y redesplegar.

## Migraciones

Las reglas de fondo están en `MIGRATIONS.md` y en `AGENTS.md`. Cada migración es un archivo `drizzle/000N_nombre.sql`, aditivo e idempotente, escrito a mano dentro del PR que lo necesita. `bun run db:push` está prohibido siempre. `db:generate`, `db:migrate` y `db:seed` no se ejecutan sin aprobación explícita. Mientras el journal de `drizzle/meta/_journal.json` siga en la `0009`, las migraciones nuevas se aplican con `db:apply` y no con `db:migrate`.

Con dos bases, el orden es siempre el mismo. La migración se aplica primero en Pruebas, antes de fusionar el PR de su rama a `develop`, y después en Producción, antes de fusionar el PR de versión a `main`. Así cada base la tiene antes de que se despliegue el código que la usa.

1. Escribe el SQL en la rama de trabajo, dentro de su PR.
2. Aplícalo en la base de pruebas, que es la rama `develop` de Neon, y comprueba el resultado con `to_regclass`, las columnas y las restricciones. Desde ese momento el Preview de la rama ya puede usarlo.
3. Fusiona el PR a `develop` y prueba el Preview de `develop`.
4. Con el PR de versión abierto y sus checks en verde, y antes de fusionarlo, el dueño toma un respaldo de producción y aplica el mismo SQL en la base de producción. Necesita datos móviles, porque el wifi de la ULima bloquea el puerto 5432. Comprueba el resultado igual que en Pruebas.
5. Fusiona el PR de versión. Vercel despliega `main` y `GET /version` tiene que devolver el SHA del merge.
6. Registra la migración en `MIGRATIONS.md`, con su fecha, el nombre del respaldo y la verificación.

Los comandos son los de `MIGRATIONS.md`. Cada base se elige exportando `DATABASE_URL` en la terminal desde un archivo local que git ignora, por ejemplo `.env.pruebas` para Pruebas y `.env` para producción. `dotenv` no pisa una variable que ya existe, así que el comando usa la base exportada. Los comandos de cada base van en un bloque propio, y nunca se copian los dos juntos.

En Pruebas se aplica así.

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env.pruebas | cut -d= -f2-)
bun run db:apply drizzle/00NN_nombre.sql
```

Entre los dos bloques hay una compuerta. El de producción no se corre hasta que el resultado en Pruebas esté verificado, el PR de versión esté en verde y el dueño autorice la aplicación. Se corre en una terminal aparte, para que la URL de producción no quede exportada en la sesión de Pruebas, y el respaldo va antes del `db:apply`.

```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
/opt/homebrew/opt/libpq/bin/pg_dump "$DATABASE_URL" > backup_pre_00NN_$(date +%Y%m%d).sql
bun run db:apply drizzle/00NN_nombre.sql
```

El `pg_dump` de `libpq` se invoca por ruta completa, porque el cliente tiene que ser de una versión igual o mayor que la del servidor, que es la 17. Los respaldos `backup_*.sql` quedan fuera de git. `db:apply` ejecuta el archivo en una sola transacción, de modo que un error deja la base intacta. `ALTER TYPE ... ADD VALUE` no corre dentro de una transacción, y `MIGRATIONS.md` explica cómo aplicarlo.

## CI y reglas de rama

`ci.yml` corre en cada PR y en cada push a `develop` y `main`, y cancela la ejecución anterior de la misma rama o del mismo PR cuando llega una nueva.

- `pruebas` instala con la versión de Bun de `.bun-version` y `bun install --frozen-lockfile`, compila con `bun run build` y corre `bun test`. Usa valores falsos para `DATABASE_URL`, `JWT_SECRET` y `COHERE_API_KEY`, que son las tres variables obligatorias de `src/config/env.ts`, y un servicio `postgres:17` al que apunta `TEST_DATABASE_URL`.
- `flujo` corre solo en los PR a `main` y falla si la rama de origen no es `develop` ni empieza con `hotfix/`.

Las cinco pruebas `*.postgres.test.ts` se saltan cuando falta `TEST_DATABASE_URL`, que es lo que ocurre en local. En la CI corren contra el servicio `postgres:17`. Cada una exige un Postgres local y una base vacía, trabaja dentro de una transacción y la deshace al terminar, así que ninguna toca Neon. El encabezado de cada archivo explica cómo correrla en local.

Para repetir la CI en local basta con tres comandos.

```bash
bun install --frozen-lockfile
bun run build
bun test
```

Si `bun install --frozen-lockfile` falla, `package.json` y `bun.lock` no coinciden. Se corre `bun install` y se sube el `bun.lock` nuevo.

`release.yml` corre en cada push a `main`. Crea el tag y el Release de la versión de `package.json` cuando no existen, como describe la sección Cómo publicar una versión.

Las reglas de rama de `main` y `develop` son las siguientes.

- Cada cambio entra por PR, con el check `pruebas` en verde, y en `main` también con `flujo`. Los nombres de esos checks son los que exigen las reglas, así que renombrarlos en `ci.yml` obliga a cambiar también las reglas.
- No se permite force push ni borrado de la rama.
- No se exigen aprobaciones, porque el dueño trabaja solo.
- `enforce_admins` queda en `false`, de modo que el dueño puede saltar la regla en una emergencia.

`develop` es la rama por defecto del repositorio, y Vercel sigue publicando `main` como producción.
