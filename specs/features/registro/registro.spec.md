---
name: Registro de alumno
description: Alta de cuenta en ULima++ para un alumno que todavía no existe en la base, autenticando contra miUlima y cargando su ciclo en el mismo acto, de modo que la cuenta nazca usable.
targets:
  - ../../../src/modules/auth/**
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/services/portal.client.ts
  # Los dos limitadores de `POST /auth/register` viven acá, junto a los que ya
  # existían para el chatbot y para portal-sync. Se agregó al cerrar la
  # revisión final de rama: el endpoint es público y sin límite se lo puede
  # usar para bloquearle a un tercero su cuenta de miUlima (ver §Límite de tasa).
  - ../../../src/shared/middleware/rate-limit.ts
  - ../../../test/HU33_jeff/**
---

# Registro de alumno

> Estado: **APROBADA el 2026-09-07.** Diseño acordado ese mismo día tras un intento de login real de una persona que no estaba en la base. Enmienda el paso de identidad de `portal-sync.spec.md`, que hoy exige que el alumno ya exista.

## Contexto

Alguien intentó entrar y no estaba en `app_user`. Los dos caminos de login existentes fallan igual, y por razones distintas:

- **Código y contraseña** → `401 USER_NOT_FOUND`. No hay nada que crear, porque no hay nada que pruebe que esa persona es quien dice: la contraseña es de ULima++, no de la universidad.
- **Google SSO** → `401 USER_NOT_FOUND`. Google sí prueba la identidad y el dominio institucional, pero el dominio prueba que tiene cuenta ULima, **no que sea alumno matriculado**: un egresado o alguien de administración pasaría igual.

Hay además una segunda barrera que hace insuficiente "solo crear la fila": `hasActiveEnrollment` exige al menos una matrícula `active`. Una cuenta creada sin datos queda creada **y afuera**.

Desde `portal-sync` existe una tercera vía que resuelve las dos cosas a la vez: **el propio portal de la Universidad puede decir si alguien es alumno matriculado, y en el mismo acto entregar todos sus datos**.

### Lo que la base ya garantiza (medido el 2026-09-07)

| Hecho | Consecuencia para el diseño |
| --- | --- |
| Una sola carrera (`Ingeniería de Sistemas`) y una sola malla; **365 de 365** alumnos en `career_id=1, curriculum_id=1` | No hace falta mapear el nombre de carrera del portal a un id. Se usa la única y se **verifica** contra el portal. |
| **365 de 365** cumplen `institutional_email = code || '@aloe.ulima.edu.pe'` | El correo se deriva del código sin inventar nada, y queda compatible con el login por Google, que busca por correo. |
| 0 alumnos sin matrícula activa | La barrera `hasActiveEnrollment` nunca bloqueó a nadie hoy, pero bloquearía a un registro sin datos. De ahí que el registro importe. |

## Requirements

- RS-BE-17: Un alumno que no existe en la base puede crear su cuenta autenticándose contra miUlima. Quien certifica que es alumno matriculado es **el portal**, nunca una deducción del backend.
  `[@test] ../../../test/HU33_jeff/registro.service.test.ts`
  `[@test] ../../../test/HU33_jeff/registro.endpoint.test.ts`
  `[@test] ../../../test/HU33_jeff/repository.registro.test.ts`
  `[@test] ../../../test/HU33_jeff/registro.rate-limit.test.ts`
- RS-BE-18: El registro es **todo o nada**: o queda una cuenta con su ciclo cargado y utilizable, o no queda ninguna cuenta. Nunca una cuenta creada que no pueda iniciar sesión.
  `[@test] ../../../test/HU33_jeff/registro.atomicidad.test.ts`
  `[@test] ../../../test/HU33_jeff/service.registro-import.test.ts`

## API Contract

`POST /auth/register` — pública, sin token.

```json
{ "code": "20230001", "portalPassword": "…", "passcode": "123456", "password": "…" }
```

- `code`: código de alumno, `^\d{6,10}$`.
- `portalPassword` y `passcode`: credenciales de **miUlima**. Se usan para el login y se descartan; no se persisten ni se registran en logs (RS-BE-7 de portal-sync, que esta feature hereda).
- `password`: la contraseña que la persona quiere para ULima++.

> **Sobre la fortaleza de la contraseña.** El repo hoy **no valida ninguna**: es `z.string().min(1)` en el login, en el SSO y también en `password-reset/confirm`, que es donde se fija una contraseña nueva. El registro sigue esa misma regla a propósito. Ponerle un mínimo solo acá sería incoherente: alguien se registraría con una contraseña fuerte y a los dos minutos podría dejarla en un carácter desde el reset. Endurecer la política es una decisión de producto que abarca los tres endpoints y **no entra en esta feature**; queda anotada como deuda.

Respuesta `201`: el mismo cuerpo que `POST /auth/login` (token, tokenType, expiresIn, user) más el `summary` y los `warnings` de la importación, para que el cliente pueda mostrar qué se cargó y qué quedó a medias.

El `token` es el que **re-firma la importación**, no uno emitido por `register`. `runImport` relee de la BD ya confirmada el cargo vigente del alumno y lo mete dentro del JWT; si `register` firmara el suyo con `role: "student"` fijo, alguien a quien esa misma importación acaba de reconocer como delegado recibiría un token de alumno raso. Solo cuando la importación devuelve `token: null` (registrar sin `auth` cableado) `register` firma uno propio de `student`. El `user.role` sale del mismo token, para que cuerpo y JWT no se contradigan.

Los `warnings` son los `SyncWarning` de la importación, el mismo campo y el mismo shape que ya devuelve `POST /portal-sync/import`. Es lo que hace observable el `CAREER_MISMATCH` que esta spec manda "registrar": antes lo calculaba la importación y moría sin que nadie lo viera.

Errores:

| Código | Cuándo |
| --- | --- |
| `503 REGISTRATION_UNAVAILABLE` | El registro no está cableado (`registrar`/`portalSyncRepository` sin inyectar en `AuthService`). No se llegó a tocar `app_user` ni el portal. |
| `409 USER_ALREADY_EXISTS` | Ya hay una cuenta con ese código. Se comprueba **dos veces**: con el código del cuerpo antes de pedirle nada al portal, y otra vez con el código que **certifica el portal**, dentro de la transacción y justo antes del INSERT. Sin la segunda, cuando los dos códigos difieren y el del portal ya tenía cuenta, el INSERT reventaba contra la constraint única de `app_user.code` y salía un `500` que esta tabla no contempla. |
| `429 RATE_LIMITED` | Se pasó alguno de los dos límites de tasa del endpoint: 5 intentos por `code` por hora, o el tope de registros simultáneos en vuelo. Ver §Límite de tasa. |
| `401 PORTAL_AUTH_FAILED` | miUlima rechazó las credenciales o el passcode — y **solo** eso (`PORTAL_LOGIN_REJECTED` del cliente del portal). |
| `403 NOT_ENROLLED` | El portal autenticó pero no reporta matrícula en el ciclo activo. No se crea la cuenta: quedaría bloqueada por `hasActiveEnrollment`. |
| `422 PORTAL_IDENTITY_UNVERIFIABLE` | El portal no devolvió un consolidado de matrícula legible. |
| `502 PORTAL_UNAVAILABLE` | El portal no respondió. |
| `504 PORTAL_TIMEOUT` | El portal no respondió **a tiempo** (`AbortError` del `AbortController` de `PortalClient`). Es un código propio y no un `401`: es el fallo más probable de miUlima, y aplastarlo a "credenciales rechazadas" mandaba a la persona a cambiar su contraseña universitaria sin motivo. |

#### La traducción de errores del portal es una lista blanca

`register` traduce a `401 PORTAL_AUTH_FAILED` **únicamente** el `PORTAL_LOGIN_REJECTED` que emite `PortalClient.login`; cualquier otra excepción se re-lanza tal cual.

Al revés (aplastar todo salvo una lista de excepciones) el criterio se rompe solo: `portal.client.ts` emite **dos** códigos de fallo de red, `502 PORTAL_UNAVAILABLE` y `504 PORTAL_TIMEOUT`, y la lista negra solo contemplaba el primero. Con lista blanca tampoco se disfraza de credenciales malas un fallo del propio backend (un `TypeError`): ese llega como `500`, que es lo que es.

Traducir solo ese código sigue sin dar un oráculo de credenciales: `PORTAL_LOGIN_REJECTED` ya es deliberadamente indistinguible entre "contraseña mala" y "passcode malo".

## Rules

### La identidad la pone el portal

El `code` del cuerpo sirve **solo para el login y para el 409 temprano**. Todo lo que se persiste sale del consolidado de matrícula que devuelve el portal: código, nombre completo y carrera. Si el código del cuerpo y el del portal difieren, gana el del portal y el del cuerpo se descarta en silencio — no es un caso de error, porque el portal ya autenticó a quien sea que haya entrado.

Esto invierte la comprobación de `portal-sync`: hoy `runImport` compara `mat.data.studentCode` contra `findUserCode(userId)` y lanza `PORTAL_IDENTITY_MISMATCH` si difieren. En el registro **no hay un código previo contra el cual comparar**, así que esa comprobación no aplica; ver §Enmienda.

### Qué se crea

En una transacción, y solo si el portal reportó al menos una matrícula del ciclo activo:

1. `app_user`: `code` y `full_name` del portal; `institutional_email` derivado como `<code>@aloe.ulima.edu.pe`; `password_hash` con bcrypt costo 10, igual que el resto del módulo.
2. `student`: `career_id` y `curriculum_id` de la única carrera y malla existentes. El nombre de carrera del portal se compara con `careerNamesDiffer`; si difiere **no se aborta**, se registra el warning `CAREER_MISMATCH` que ya existe, igual que hace la importación.
3. La importación completa, con la misma sesión del portal.

`google_id` queda nulo: se vincula solo cuando la persona entre por Google, que es lo que ya hace `linkGoogleId`.

### Todo o nada (RS-BE-18)

Las descargas del portal van **fuera** de la transacción, como en `portal-sync`. La transacción abarca el alta y la importación juntas. Si la importación falla, se revierte también la cuenta.

El motivo no es estético: una cuenta sin matrículas no puede iniciar sesión, así que dejarla creada produce una persona registrada y bloqueada, sin forma de reintentar el registro (el 409 le cerraría el paso). Revertir deja el reintento abierto.

### Después del commit nadie puede lanzar

La transacción que crea la cuenta e importa el ciclo es el punto de no retorno. En cuanto confirma, la cuenta **existe y es utilizable**, así que nada de lo que corra después puede terminar en un error: si lo hiciera, la persona vería un fallo, reintentaría, y el `409` le cerraría el paso — quedaría con una cuenta que no sabe que tiene y sin camino de reintento, exactamente el escenario que RS-BE-18 existe para evitar.

En concreto, la relectura del usuario con `findById` —la que arma el objeto rico "igual al de login"— **no puede abortar la respuesta**: si lanza o vuelve vacía, el `user` se arma con lo que el alta ya sabe (código, nombre y correo del portal, ids de la cuenta recién insertada, carrera y malla), con la forma completa de `AuthUser` para que el cliente no tenga que distinguir este caso. Es el mismo criterio que ya aplica `reissueToken`, que devuelve `null` en vez de tumbar una importación ya confirmada.

Se eligió esto y **no** suavizar el `409` (dejar reintentar cuando el código existe pero la cuenta no tiene matrícula activa) por tres razones:

1. El `409` es la única barrera que impide usar el registro contra una cuenta **que ya existe**: suavizarlo permitiría, con solo un código, volver a disparar el login contra miUlima de una persona ya registrada — justo el abuso que el límite de tasa acaba de cerrar.
2. Con el rollback de RS-BE-18 en su sitio, "código registrado pero sin matrícula activa" ya no es alcanzable por esta ruta: un registro que no llega a tener matrícula no deja cuenta. Las únicas cuentas en ese estado son anteriores o creadas a mano, y su camino correcto es `password-reset`, no un segundo registro.
3. El arreglo defensivo es local y verificable, y no cambia el significado de ningún código de respuesta.

### Límite de tasa

`POST /auth/register` es público —el único middleware global del backend sigue siendo `cors` + `logger`— y cada petición dispara una secuencia real de login contra miUlima con credenciales elegidas por quien llama. Sin contador el daño no es solo propio: cualquiera puede pedir el registro del código de **una persona real** con contraseñas basura, en bucle, hasta que el portal de la Universidad le **bloquee la cuenta a esa persona**. Es una denegación de servicio contra la cuenta universitaria de un tercero ejecutada a través de este backend, y por eso el endpoint no puede desplegarse sin límite.

Se montan dos limitadores en la ruta, ambos en `src/shared/middleware/rate-limit.ts`, junto a los que ya existían:

| Limitador | Clave | Tope | Qué acota |
| --- | --- | --- | --- |
| `registerRateLimit` | el `code` del cuerpo | 5 por hora | El bucle contra un código concreto, que es la forma de bloquearle la cuenta de miUlima a un tercero. |
| `registerConcurrencyLimit` | ninguna (global del endpoint) | 4 en vuelo | Cuántas secuencias de login contra la Universidad quedan colgadas a la vez. Un contador por clave no puede acotarlo: mil códigos distintos son mil peticiones simultáneas. |

Van en ese orden: el de código rechaza barato y sin tocar el portal, así que un bucle contra un mismo código no consume además el cupo de concurrencia. Los dos responden `429 RATE_LIMITED`.

**No hay devolución de cupo por login rechazado**, a diferencia de `portalSyncRateLimit`. Allá se devuelve porque quien se equivoca tipeando un passcode de 30 segundos es el dueño de la cuenta y no puede quedar bloqueado una hora. Acá el login rechazado es precisamente la señal del abuso que el contador existe para frenar: devolver cupo lo anularía por completo. **Sí se devuelve el cupo cuando el tope en vuelo rechaza la petición**: ese rechazo es previo al service y no dispara ningún login contra miUlima, así que cobrarle uno de sus cinco intentos castigaría al alumno por la carga que tenía el backend en ese instante — con cuatro registros en curso, un salón entero registrándose a la vez quedaría bloqueado una hora sin haber intentado ni un login. Es el mismo criterio de `refundPortalQuota`: se devuelve el cupo que no compró trabajo.

Un código de cuerpo que no cumple `^\d{6,10}$` no se cuenta, porque no se guarda como clave — un cuerpo así ni siquiera llega al portal, lo corta antes el validador con `400`. El tope en vuelo, que no necesita clave, sigue aplicando.

**Lo que este mecanismo NO es.** Los contadores viven en memoria del proceso. En Vercel hay varias instancias y cada una lleva la suya, así que el techo real es `5 x instancias vivas` por código. Sube mucho el costo de un ataque y tapa el bucle trivial desde una conexión; **no** es un límite distribuido. La misma limitación ya la tenía `portalSyncRateLimit`. Un límite de verdad global exigiría un contador compartido (Redis o una tabla), y esa decisión no entra acá.

### Advertencia de despliegue: `CORS_ORIGINS` no está definida

`src/server.ts` cae a `origin: "*"` cuando `CORS_ORIGINS` está vacía. **Comprobado el 2026-09-08 con `vercel env ls` sobre el proyecto desplegado: la variable no existe en Production, Preview ni Development.** El backend en producción responde hoy `Access-Control-Allow-Origin: *`.

Con eso, cualquier sitio web puede llamar a `POST /auth/register` desde el navegador de una víctima. No hay cookies de sesión que robar (la autenticación es por `Authorization: Bearer`), así que no es un CSRF clásico, pero sí convierte a cualquier visitante de una página hostil en un origen de tráfico contra miUlima a través de nuestro backend.

**Esta feature no cambia el default**: es preexistente, afecta a todo el backend por igual (`BR-PLATFORM-08`, ya anotado en el README como `OBS-SEG-6`) y cambiarlo desde acá rompería desarrollo sin previo aviso. Queda escrito como **acción de despliegue pendiente**: definir `CORS_ORIGINS` en Vercel con los orígenes reales del frontend antes de anunciar el registro público. El límite de tasa de arriba acota el daño, no lo elimina.

### Fuera de alcance

- **Docentes.** El portal es de alumnos y no puede certificar a un docente. `teacher.user_id` se sigue vinculando a mano, como dice `KNOWLEDGE.md`.
- **Registro por Google.** Queda como comodidad posterior: una vez que la cuenta existe, entrar con Google ya funciona y vincula el `google_id`. Crear la cuenta *desde* Google es otra decisión, con otro nivel de prueba de identidad, y no entra acá.
- **Recuperar el acceso de alguien que ya existe.** Eso es `password-reset`, que ya está.

## Enmienda a `portal-sync.spec.md`

El paso de identidad de `runImport` asume que el alumno existe. Hay que separarlo en dos modos:

- **Importación normal** (la de hoy): el código del portal debe coincidir con el de la cuenta autenticada. Sin cambios.
- **Importación de registro**: no hay cuenta previa; el código del portal **es** la fuente y se usa para crear la cuenta antes de importar.

La forma concreta —una bandera, un método aparte, o extraer el cuerpo del import— se decide al implementar, con la restricción de que **el camino normal no puede perder su comprobación**: es lo que impide que alguien importe el ciclo de otro.

## Verification

- Registro real contra el portal con una cuenta que no esté en la base, comprobando que la persona queda con cursos, horario y asistencia, y que puede volver a entrar por los dos caminos (código+contraseña y Google).
- Comprobar el reintento tras un fallo: si la importación falla a mitad, el segundo intento no debe chocar con un `409`.
- Comprobar el límite de tasa contra el backend desplegado: seis intentos seguidos con el mismo código deben terminar en `429`, y el sexto **no** debe llegar a miUlima.
- Antes de anunciar el registro: `vercel env ls` debe mostrar `CORS_ORIGINS` definida en Production.
