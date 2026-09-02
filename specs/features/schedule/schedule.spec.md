---
name: Schedule
description: Academic schedule, evaluations calendar mapping, and weekly load calculations.
targets:
  - ../../../src/modules/schedule/**
  - ../../../src/shared/middleware/auth-middleware.ts
  - ../../../test/HU09_nehemias/**
---

# Schedule

## User Stories

| ID | Description |
| --- | --- |
| US09 | Visualizar horario y evaluaciones del ciclo. |

## Business Rules

### BR-SCH-01: GET /schedule/me/sessions — Weekly class schedule
- Retorna el horario semanal agrupado por bloques de tiempo (Lunes a Domingo) para las secciones activas del estudiante, **filtradas al período académico activo** (`course_offering.academic_period_id` → `academic_period.is_active = true`). Sin este filtro, un alumno con matrícula en dos ciclos a la vez (posible desde que portal-sync puede importar un ciclo nuevo sin haber retirado el anterior) vería ambos ciclos superpuestos en la misma grilla semanal.
  `[@test] ../../../test/HU09_nehemias/schedule.repository.test.ts`
- Formatea la hora de clase en `hora_inicio` y `hora_fin` (p. ej., "08:00 am") además de `inicio` y `fin` (p. ej., "08:00:00") para total compatibilidad con el frontend.
- Identifica dinámicamente la semana académica actual correspondiente a la fecha de hoy, poblando los textos de los días con sus fechas reales en español (p. ej., "12 de Enero") y la descripción de la semana (p. ej., "Semana 2 del ciclo"). Ver BR-SCH-04 para de dónde salen esas semanas.
- **Auth**: Bearer token (vía `authMiddleware`).

### BR-SCH-02: GET /schedule/me/assessments — Evaluation calendar
- Mapea las evaluaciones programadas en el sílabo a fechas reales del calendario.
- Toma solo las evaluaciones de los sílabos del **período académico activo**, con el mismo filtro que BR-SCH-01 (`course_offering.academic_period_id` → `academic_period.is_active = true`). Sin él, un alumno con matrícula en dos ciclos vería el calendario de ambos superpuesto, con evaluaciones del ciclo viejo cayendo sobre las semanas del actual.
  `[@test] ../../../test/HU09_nehemias/schedule.repository.test.ts`
- **Ecuación de fecha**: Dado que un examen está asignado a `week_number` (semana X) y la clase de esa sección se dicta en un día de la semana `day_of_week` (1 = Lunes, ..., 7 = Domingo), la fecha de la evaluación se calcula sumando la diferencia de días al inicio de esa semana académica:
  $$FechaExamen = WeekX.startDate + (day\_of\_week - 1) dias$$
- Si la sección tiene múltiples sesiones semanales (p. ej., Lunes y Miércoles), se asocia el examen a la primera sesión de esa semana para evitar duplicidades.
- **Auth**: Bearer token.

### BR-SCH-03: GET /schedule/me/load — Academic load calculation
- Calcula la carga de evaluaciones para cada semana académica activa del ciclo.
- Cuenta sobre las mismas evaluaciones acotadas al período activo de BR-SCH-02 (comparten `ScheduleRepository.findActiveSyllabiAndAssessments`), así que las evaluaciones de otro ciclo no inflan `assessmentCount` ni disparan `isHighLoad` falsos.
  `[@test] ../../../test/HU09_nehemias/schedule.repository.test.ts`
- **Alta Carga**: Si una semana académica tiene **3 o más evaluaciones**, se marca con `isHighLoad = true`.
- **Auth**: Bearer token.

### BR-SCH-04: Resolución de semanas académicas
- Las semanas académicas usadas por `getSessions`, `getAssessments`, `getWeeklyLoad`, `getTeacherSessions` y `getTeacherAssessments` (`schedule.service.ts`) salen del **período académico activo** en base de datos, nunca de un calendario fijo en código. `ScheduleService` resuelve las semanas **una sola vez por request** (`resolveAcademicWeeks`) y las pasa a cada método que las necesita, en vez de leerlas de nuevo por cada una.
- **Fallback en cascada**, para no lanzar cuando faltan datos:
  1. Filas de `academic_week` para el período activo (`ScheduleRepository.findAcademicWeeksForActivePeriod`).
  2. Si `academic_week` no tiene filas para ese período, se derivan semanas de 7 días a partir de las fechas propias del período (`academic_period.start_date`/`end_date`, vía `ScheduleRepository.findActivePeriodDates` + la función pura `deriveWeeksFromPeriodDates`), con la misma fórmula que `academicWeekCount` en `portal-sync.repository.ts` (`ceil(span_días / 7)`, mínimo 1, la última semana no empieza después de `end_date`).
  3. Si no hay ningún período activo, lista vacía: cada método consumidor ya degrada a "sin info de semana" (`weekText: "Semana actual"`, `dateText: ""`, o listas vacías) en vez de lanzar.
  `[@test] ../../../test/HU09_nehemias/schedule.repository.test.ts`
- Antes de esta regla, `schedule.service.ts` tenía un calendario de 16 semanas hardcodeado empezando el 6 de abril de 2026 (el ciclo 2026-1), ignorando `academic_week` por completo; ya estaba desactualizado antes de esta corrección (una fecha de hoy posterior caía fuera de esas 16 semanas).

### BR-SCH-05: Horario del docente acotado al período activo
- `GET /schedule/teacher/sessions` y `GET /schedule/teacher/assessments` devuelven las secciones donde el docente es titular (`section.teacher_id`) o JP (`section.jp_id`), y sus evaluaciones, **solo del período académico activo** (mismo filtro de BR-SCH-01 sobre `course_offering`). El predicado titular-o-JP por sí solo no distingue ciclos: un docente que dictó el ciclo anterior y vuelve a dictar en el actual vería ambos a la vez en su grilla y en su calendario de evaluaciones.
  `[@test] ../../../test/HU09_nehemias/schedule.repository.test.ts`
- **Auth**: Bearer token con rol `teacher` (vía `requireRole("teacher")`).

- `GET /schedule/me/sessions` retorna `aula`/`salon` desde `schedule_session.classroom` por sesiÃ³n y `color` desde `schedule_session.color_hex`, permitiendo aulas distintas por dÃ­a y colores hex por curso.

## Endpoints

### GET /schedule/me/sessions
- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "days": [
      {
        "dayName": "Lunes",
        "dateText": "12 de Enero",
        "weekText": "Semana 2 del ciclo"
      }
    ],
    "secciones": [
      {
        "idSeccion": "1",
        "codigoSeccion": "856",
        "docenteCode": "T001",
        "promedioSeccion": 0,
        "idCurso": "10",
        "curso": "INGENIERÍA DE SOFTWARE II",
        "asistido": 12,
        "inasistencia": 2,
        "total": 30,
        "horarios": [
          {
            "dia": "Lunes",
            "inicio": "08:00:00",
            "hora_inicio": "08:00 am",
            "fin": "10:00:00",
            "hora_fin": "10:00 am",
            "aula": "L3-402",
            "salon": "L3-402",
            "color": "#F94B3F"
          }
        ]
      }
    ]
  }
  ```

### GET /schedule/me/assessments
- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "assessments": [
      {
        "id": "1",
        "courseName": "INGENIERÍA DE SOFTWARE II",
        "sectionCode": "856",
        "code": "EE1",
        "name": "Examen Escrito 1",
        "weekNumber": 2,
        "date": "2026-01-12",
        "startTime": "08:00:00",
        "endTime": "10:00:00",
        "classroom": "L3-402",
        "color": "#F94B3F"
      }
    ]
  }
  ```

### GET /schedule/me/load
- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "weeks": [
      {
        "weekNumber": 2,
        "startDate": "2026-01-12",
        "endDate": "2026-01-18",
        "assessmentCount": 3,
        "isHighLoad": true
      }
    ]
  }
  ```
