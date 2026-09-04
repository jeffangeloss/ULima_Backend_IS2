---
name: Official Grades
description: Calificación oficial del profesor/JP por evaluación y lectura de notas oficiales del alumno
targets:
  - ../../../src/modules/official-grades/**
  - ../../../src/modules/index.ts
---

# Official Grades

## Contexto

**Solo el profesor titular** de una sección (`section.teacher_id`) puede **calificar oficialmente** a sus alumnos por evaluación. El **JP** (`section.jp_id`) NO sube notas oficiales (su rol es dar asesorías extra, no calificar). Estas notas son las **oficiales** y viven en `student_score` (una fila por `enrollment_id` + `assessment_id`, `value` 0..20). Se distinguen de las notas **no oficiales** de la calculadora del alumno, que viven en `simulated_grades` (ver `simulated-grades.spec.md`).

La **nota final** se define como el **promedio ponderado** de las evaluaciones (Σ nota×peso/100) y se calcula en el cliente (mismo criterio que la calculadora); no se almacena.

## Autorización

- Rutas docentes: `requireRole("teacher")`; el `teacherId` sale del JWT.
- Un docente solo puede ver/calificar secciones donde es **profesor titular** (`section.teacher_id = teacherId`). El JP (`jp_id`) NO califica ⇒ `403 NOT_SECTION_PROFESSOR`.
  `[@test] ../../../test/official-grades.logic.test.ts`
- Ruta de alumno: `requireRole(student|delegate|subdelegate)`; el `studentId` sale del JWT; solo ve sus propias notas.

## Requisitos

- `GET /official-grades/teacher/sections`: lista las secciones del período activo donde el docente es **profesor titular** (las que califica). El JP no ve secciones aquí.
- `GET /official-grades/teacher/sections/:sectionId/scores`: grilla de la sección — alumnos (matrícula no retirada) × evaluaciones del sílabo + notas ya cargadas. Exige ser docente de la sección.
- `PUT /official-grades/teacher/sections/:sectionId/scores`: upsert por lote de `{enrollmentId, assessmentId, value}`. Valida ownership y que cada matrícula y evaluación pertenezcan a la sección; valida TODO el lote antes de escribir (no persiste parcialmente). `value` 0..20.
  `[@test] ../../../test/official-grades.logic.test.ts`
- Errores de pertenencia: `404 ENROLLMENT_NOT_IN_SECTION`, `404 ASSESSMENT_NOT_IN_SECTION`.
  `[@test] ../../../test/official-grades.logic.test.ts`
- `GET /official-grades/me`: notas oficiales del alumno **del período activo**, agrupadas por sección/curso, con `weight` y `value` (nullable) por evaluación, para que el cliente calcule la nota final. El acotado al período activo es obligatorio y estuvo ausente hasta el 2026-09-04: sin él la pantalla mezcla las evaluaciones de todos los ciclos que el alumno haya cursado, y el cliente calcula una "nota final" ponderando evaluaciones de ciclos distintos. El defecto quedó oculto mientras los sílabos del ciclo nuevo no tenían rúbrica cargada.
  `[@test] ../../../test/official-grades.logic.test.ts`

## API

Ver `docs/specs/api-contracts.md`, sección **Official Grades**.

## Fuera de alcance

- No almacena la nota final (se calcula en el cliente por ponderación).
- No modifica `simulated_grades` (notas no oficiales del alumno).
- No permite a un docente calificar secciones ajenas.
