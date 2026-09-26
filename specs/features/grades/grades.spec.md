---
name: Grades
description: Consulta de cursos, sílabos y evaluaciones, cálculo de promedio ponderado y persistencia de notas personales
targets:
  - ../../../src/modules/grades/**
  - ../../../src/shared/middleware/auth-middleware.ts
---

# Grades

## Scope

Endpoints relacionados a cursos, evaluaciones, cálculo de notas y persistencia de notas personales del alumno. Payloads en `docs/specs/api-contracts.md`.

## Business Rules

### BR-GRADES-01: Autenticación y rol
- Todas las rutas requieren `Authorization: Bearer <JWT>` y rol de alumno (`requireRole('student','delegate','subdelegate')`).

### BR-GRADES-02: Alcance al alumno autenticado
- `GET /grades/me/courses` retorna cursos, secciones, sílabos y evaluaciones del periodo activo.

### BR-GRADES-03: Persistencia de notas en `student_score`
- `POST /grades/me/notes` guarda notas personales en `student_score` usando upsert (ON CONFLICT DO UPDATE).
- `GET /grades/me/notes` recupera las notas guardadas.
- El `enrollment_id` se resuelve desde el `studentId` del JWT y el `sectionId` del body.
- No existe `PUT /grades/me/scores` (reemplazado por este endpoint).

### BR-GRADES-04: Cálculo de promedio ponderado en backend
- `POST /grades/me/calculate` recibe `{ valor, peso }[]` y devuelve `{ promedio, sumaPesos }`.
- La lógica de cálculo está en `grades.logic.ts` como funciones puras testeables.

### BR-GRADES-05: Notas de la ULima (propuesta del 2026-09-25, pendiente de aprobación)
- `GET /grades/me/ulima` devuelve, por cada matrícula activa del alumno en el período activo, las notas parciales por evaluación que la ULima publica en el panel Nota del Aula Virtual, con su semana, su peso, su nota o su marca, su pareja en el sílabo (`assessmentId` y `match`) y la hora de la última lectura. Las escribe solo `POST /portal-sync/refresh`. Solo el propio alumno las lee, con `Cache-Control: no-store`.
- La calculadora muestra fijas, con la marca «ULima», las que tienen pareja en el sílabo, y no toca `simulated_grades`. Ver `specs/features/recarga-portal/recarga-portal.spec.md` (RS-BE-54 y RS-BE-57) y sus decisiones abiertas 6, 7, 9 y 12.

## Endpoints

Bajo `Authorization: Bearer <token>` (rol alumno):

- `GET /grades/me/courses`
- `POST /grades/me/calculate`
- `GET /grades/me/notes`
- `POST /grades/me/notes`
- `GET /grades/me/ulima` (propuesto, BR-GRADES-05)

## Test Links

- [grades.logic.test.ts](../../../test/grades.logic.test.ts) — Tests del cálculo puro
- [promedio.unitarias.test.ts](../../../test/HU07_aurelio/promedio.unitarias.test.ts) — Unitarias HU07: `calcularPromedioPonderado`, `sumaDePesos` y validación Zod de `POST /grades/me/calculate` (BR-GRADES-04)
- [notas.cajablanca.test.ts](../../../test/HU06_aurelio/notas.cajablanca.test.ts) — Caja blanca HU06: caminos de `saveNotas`/`deleteNota` con repositorio espía (BR-GRADES-03, rama sin matrícula)
