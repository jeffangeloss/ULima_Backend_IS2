---
name: Registro de alumno
description: Alta de cuenta en ULima++ para un alumno que todavía no existe en la base, autenticando contra miUlima y cargando su ciclo en el mismo acto, de modo que la cuenta nazca usable.
targets:
  - ../../../src/modules/auth/**
  - ../../../src/modules/portal-sync/portal-sync.service.ts
  - ../../../src/modules/portal-sync/portal-sync.repository.ts
  - ../../../src/services/portal.client.ts
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
- RS-BE-18: El registro es **todo o nada**: o queda una cuenta con su ciclo cargado y utilizable, o no queda ninguna cuenta. Nunca una cuenta creada que no pueda iniciar sesión.
  `[@test] ../../../test/HU33_jeff/registro.atomicidad.test.ts`

## API Contract

`POST /auth/register` — pública, sin token.

```json
{ "code": "20230001", "portalPassword": "…", "passcode": "123456", "password": "…" }
```

- `code`: código de alumno, `^\d{6,10}$`.
- `portalPassword` y `passcode`: credenciales de **miUlima**. Se usan para el login y se descartan; no se persisten ni se registran en logs (RS-BE-7 de portal-sync, que esta feature hereda).
- `password`: la contraseña que la persona quiere para ULima++.

> **Sobre la fortaleza de la contraseña.** El repo hoy **no valida ninguna**: es `z.string().min(1)` en el login, en el SSO y también en `password-reset/confirm`, que es donde se fija una contraseña nueva. El registro sigue esa misma regla a propósito. Ponerle un mínimo solo acá sería incoherente: alguien se registraría con una contraseña fuerte y a los dos minutos podría dejarla en un carácter desde el reset. Endurecer la política es una decisión de producto que abarca los tres endpoints y **no entra en esta feature**; queda anotada como deuda.

Respuesta `201`: el mismo cuerpo que `POST /auth/login` (token, tokenType, expiresIn, user) más el `summary` de la importación, para que el cliente pueda mostrar qué se cargó.

Errores:

| Código | Cuándo |
| --- | --- |
| `409 USER_ALREADY_EXISTS` | El código ya está en `app_user`. Se responde antes de pedirle nada al portal. |
| `401 PORTAL_AUTH_FAILED` | miUlima rechazó las credenciales o el passcode. |
| `403 NOT_ENROLLED` | El portal autenticó pero no reporta matrícula en el ciclo activo. No se crea la cuenta: quedaría bloqueada por `hasActiveEnrollment`. |
| `422 PORTAL_IDENTITY_UNVERIFIABLE` | El portal no devolvió un consolidado de matrícula legible. |
| `502 PORTAL_UNAVAILABLE` | El portal no respondió. |

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
