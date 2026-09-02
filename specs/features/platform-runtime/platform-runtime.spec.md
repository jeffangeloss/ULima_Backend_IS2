---
name: Platform Runtime Compatibility
description: Adaptar el runtime HTTP de Hono para Bun local y Vercel serverless sin arranque manual
targets:
  - ../../../src/server.ts
  - ../../../src/config/**
  - ../../../src/db/**
  - ../../../src/events/**
  - ../../../src/modules/**
  - ../../../src/shared/**
  - ../../../package.json
  - ../../../tsconfig.json
  - ../../../vercel.json
  - ../../../.gitignore
  - ../../../.env.example
  - ../../../README.md
---

# Platform Runtime Compatibility

## Scope

Esta spec cubre la migracion del entrypoint HTTP para que el backend siga funcionando con Bun en local y pueda desplegarse en Vercel como funcion serverless basada en el `default export` de Hono.

No cambia reglas de negocio, modulos funcionales, base de datos, autenticacion ni contratos REST existentes.

## Background

- El estado actual mezcla composicion de app con arranque de servidor:
  - exporta `{ port, fetch }` para Bun.
  - intenta iniciar `@hono/node-server` cuando `Bun` no existe.
- Ese patron depende de un proceso persistente y no es compatible con el modelo serverless esperado por Vercel.
- El repo ya expone `GET /` y `GET /health`; esos endpoints deben conservarse.

## Business Rules

### BR-PLATFORM-01: Hono app como export por defecto
- `src/server.ts` debe exportar la instancia `Hono` como `default export`.
- `src/server.ts` debe conservar:
  - middleware global (`cors`, `logger`, `errorHandler`).
  - `registerEventObservers()`.
  - `GET /`.
  - `GET /health`.
  - `registerModules(app)`.
- `src/server.ts` no debe iniciar listeners, puertos ni adapters de servidor manuales.

### BR-PLATFORM-02: Compatibilidad Bun local
- El backend debe seguir ejecutandose localmente con Bun usando el `default export` de Hono.
- No se debe depender de `Bun.serve()` explicito dentro del codigo de aplicacion.
- No se debe exportar `{ port, fetch }`.

### BR-PLATFORM-03: Compatibilidad Vercel serverless
- El deploy en Vercel debe usar el `default export` de Hono como entrypoint serverless.
- La ruta publica `/health` debe seguir respondiendo:
  ```json
  {
    "status": "ok",
    "timestamp": "2025-01-01T00:00:00.000Z"
  }
  ```
- No se debe usar `app.listen`, `serve(...)`, `Bun.serve()` ni bootstrap equivalente dentro del codigo de runtime HTTP.

### BR-PLATFORM-04: Sin cambios de contrato REST
- `GET /` y `GET /health` mantienen sus respuestas actuales salvo ajustes no funcionales menores.
- Las rutas de modulos existentes deben conservar su path publico actual.
- Esta migracion no introduce prefijos `/api` en el contrato publico.

### BR-PLATFORM-05: Configuracion de despliegue minima
- Se puede agregar `vercel.json` solo si hace falta documentar o fijar el comportamiento de despliegue.
- La primera implementacion no debe agregar un adapter adicional si el `default export` de Hono cubre Bun local y Vercel segun la documentacion oficial actual.
- Si se documenta el despliegue en `README.md`, debe quedar claro que Vercel usa funciones serverless y no un servidor persistente.

### BR-PLATFORM-06: Build de produccion sin seeds
- El build de TypeScript usado para despliegue no debe compilar `src/db/seed/**`.
- Los scripts de seed pueden seguir existiendo para uso manual, pero no deben bloquear `bun run build`.
- No se debe resolver este problema agregando JSON externos faltantes al repo ni ejecutando seeds.

### BR-PLATFORM-07: Imports ESM compatibles con Node y serverless
- Los imports relativos ejecutados en runtime bajo Node ESM deben usar rutas explicitas a archivo, incluyendo extension `.js` en el codigo fuente TypeScript cuando aplique.
- No se deben usar imports de directorio como `./events`, `./modules`, `../../db` ni equivalentes dentro del arbol de runtime.
- El output JavaScript usado por Vercel no debe depender de resolucion implicita de `index.js` ni de extensiones omitidas para modulos relativos.

### BR-PLATFORM-08: CORS configurable por entorno
- El middleware `cors` se configura con una lista de orígenes permitidos leída de la variable de entorno `CORS_ORIGINS` (orígenes separados por coma), expuesta vía `config.server.corsOrigins`.
- Si `CORS_ORIGINS` está vacía o no definida, se mantiene el comportamiento permisivo (`*`) para no romper desarrollo.
- En producción se debe definir `CORS_ORIGINS` con los orígenes reales del frontend.
- `allowMethods` se limita a `GET, POST, PUT, DELETE, OPTIONS` y `allowHeaders` a `Content-Type, Authorization`.

### BR-PLATFORM-09: Gestor de paquetes canónico único
- El gestor canónico es **Bun** (`vercel.json` usa `bun install` / `bun run build`); el lockfile versionado es `bun.lock`.
- `package-lock.json` no se versiona (está en `.gitignore`) para evitar lockfiles en conflicto y builds no reproducibles.

### BR-PLATFORM-10: Region fija, pegada a la base de datos

- `vercel.json` declara `regions: ["iad1"]`, la region del PostgreSQL de Neon (us-east-1).
- Hoy `iad1` ya es el default del proyecto (`functionDefaultRegions`), asi que declararlo no cambia nada: lo que hace es **impedir que cambie sin pasar por el repo**. Un cambio de region desde el panel no rompe nada de forma visible, solo multiplica la latencia, y eso no se detecta mirando logs de error.
- Por que importa tanto: `POST /portal-sync/import` emite ~115 consultas **secuenciales** dentro de una sola transaccion, asi que el tiempo del endpoint es basicamente ese numero por el RTT a la base. Medido el 2026-09-02: ~150 ms por consulta desde Lima (~17 s en total) contra decimas de segundo desde `iad1`. Alejar la funcion de Neon multiplicaria el tiempo del endpoint por un factor grande y en silencio.

### BR-PLATFORM-11: `maxDuration` NO se declara, y esa es la decision

- `vercel.json` **no** declara `maxDuration`. No es un olvido: es deliberado y hay que dejarlo asi salvo evidencia nueva.
- Motivo: con Fluid compute (activo en este proyecto) el plan Hobby da **300 s por defecto, que es tambien su tope**. Verificado el 2026-09-02 contra la API: `defaultResourceConfig.functionDefaultTimeout = 300` y `resourceConfig.fluid = true`. Declarar cualquier numero solo puede **bajar** ese techo; no existe un valor que lo suba.
- Cuidado con la documentacion vieja y con la memoria: los limites de 10 s / 15 s / 60 s son del modelo anterior a Fluid compute. Vercel los subio el 2025-06-25. Un `maxDuration: 60` "por prudencia" convertiria un no-problema en un corte real.
- No existe `maxDuration` a nivel raiz del archivo: el esquema oficial solo lo acepta dentro de `functions.<glob>`. Y Vercel **no documenta** con que glob se identifica la funcion que genera el preset Hono; si el glob no coincide, la entrada se ignora **en silencio**, sin error. O sea que declararlo mal se ve igual que no declararlo.
- Referencia de dimensionamiento, por si alguna vez hay que declararlo: el endpoint mas lento es `POST /portal-sync/import`. Medido contra el portal real el 2026-09-02, con el backend corriendo en Lima: **40.7 s** la primera importacion y **47.7 s** la segunda. La segunda hizo menos trabajo (todo updates, cero creates) y tardo mas, o sea que domina la latencia por viaje y no el computo. De esos tiempos, ~17 s son RTT a Neon desde Lima y desaparecen al correr en `iad1`. Si alguna vez se declara un numero, se calcula sobre una medicion **desde la funcion desplegada**, nunca desde una corrida local.

## Implementation Plan

### src/server.ts

- Mantener la composicion actual del app.
- Eliminar:
  - lectura de `config.server.port` para el runtime HTTP.
  - logs de arranque de servidor.
  - import dinamico de `@hono/node-server`.
  - export `{ port, fetch }`.
- Exportar solo `default app`.
- Cambiar imports relativos para que apunten a archivos explicitos compatibles con Node ESM.

### src/config/**, src/db/**, src/events/**, src/modules/**, src/shared/**

- Normalizar imports y re-exports relativos usados en runtime a rutas explicitas con extension `.js`.
- Reemplazar imports de directorio por imports a `index.js` o al archivo concreto que corresponda.
- Mantener intactas las reglas de negocio y contratos REST; el cambio es solo de compatibilidad de runtime/import resolution.

### package.json

- Mantener `bun run build`.
- Ajustar scripts solo si alguno queda inconsistente con el nuevo runtime:
  - `dev` debe seguir funcionando con Bun.
  - `start` no debe depender de `node dist/server.js` si `src/server.ts` deja de arrancar un servidor manualmente.
- No agregar dependencia de adapter Vercel salvo que la implementacion realmente la use.

### vercel.json

- Agregarlo solo si es necesario para explicitar configuracion de despliegue.
- No introducir rewrites que cambien el path publico de los endpoints existentes.
- Declarar `regions` (ver BR-PLATFORM-10). No declarar `maxDuration` (ver BR-PLATFORM-11).

### tsconfig.json

- Excluir `src/db/seed/**` del build de TypeScript usado para deploy.
- Mantener la compilacion de `src/**` para el backend real.

### README.md

- Actualizar la seccion de ejecucion/despliegue solo si cambia el flujo recomendado.

## API Contract Impact

- No requiere cambio en `docs/specs/api-contracts.md` porque no cambia endpoints, auth, payloads ni errores.

## Acceptance Criteria

- `vercel.json` declara `regions: ["iad1"]` y NO declara `maxDuration`.

- `src/server.ts` exporta `default app`.
- No existe `Bun.serve()`, `serve(...)`, `app.listen(...)` ni export `{ port, fetch }` en el runtime HTTP.
- No existen imports de directorio ni imports relativos sin extension dentro del codigo TypeScript ejecutado por el runtime serverless.
- `bun run build` no falla por archivos de seed fuera del runtime productivo.
- `GET /health` sigue respondiendo correctamente.
- Los modulos siguen registrados bajo sus rutas actuales.
- `bun run build` compila sin introducir errores nuevos.

## Notes

- La documentacion oficial actual de Vercel para Hono soporta `src/server.ts` como entrypoint valido mediante `export default app`.
- Por eso esta spec propone una migracion minima y evita agregar `api/index.ts` o un adapter dedicado salvo que la verificacion real del deploy lo exija en una revision posterior.

## Test Links

*(No hay tests existentes enlazados a esta migracion todavia.)*
