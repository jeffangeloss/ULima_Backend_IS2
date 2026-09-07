---
name: Attendance Risk
description: Clasificación de riesgo por inasistencias (impedido / en riesgo / normal / sin datos), su resumen para el docente y las alertas a alumnos; incluye la regla de que la ausencia de dato nunca se presenta como asistencia perfecta.
targets:
  - ../../../src/modules/attendance-risk/**
  - ../../../src/modules/schedule/schedule.types.ts
  - ../../../src/modules/schedule/schedule.service.ts
  - ../../../src/modules/course-detail/course-detail.routes.ts
  - ../../../test/HU_asistencia/**
  - ../../../test/HU22_sam/**
  - ../../../test/HU30_sam/**
---

# Attendance Risk

> Estado: **spec retroactiva, PENDIENTE DE APROBACIÓN.** El módulo existía (HU22, HU30) sin spec propia: solo se lo mencionaba de refilón en `alerts.spec.md`. Se escribe ahora porque RS-BE-10 cambia el contrato de la API. Los umbrales 25%/35%, el corte `cycle >= 6` y la ventana `{2,3}` de faltas se documentan **tal como estaban implementados**; no están respaldados por ningún documento de la Universidad y quedan como incógnita abierta (ver §Reglas sin fuente).

## Contexto

`attendance-risk` responde dos preguntas del docente sobre una sección: quién está impedido por inasistencias y a quién conviene avisar antes de que lo esté. Los datos salen de `enrollment` (horas del alumno) y `course_offering` (horas de la sección).

**El problema que originó esta spec.** Ninguna parte del backend escribe jamás `enrollment.attended_hours`, `absent_hours` ni `total_hours`: `portal-sync` inserta la matrícula con cuatro columnas y ninguna es de horas (`portal-sync.repository.ts`, RS-BE-4 lo ordena explícitamente). Verificado contra la base real el 2026-09-06: de las 19 matrículas del período activo 2026-2, **las 19 tienen las tres columnas en 0**.

Con el denominador saliendo de `course_offering.total_hours` (48 h, 64 h), el servicio calculaba `0/48 = 0%` y clasificaba a todo el mundo como `normal`. El docente veía "0 impedidos, 0 en riesgo" en verde y concluía que su salón estaba sano. En el cliente era peor: `descrip_cursos.dart` hacía `asistido / total` sin guarda, y con `total = 0` eso da `0/0 = NaN`; `clampDouble` de Flutter resuelve NaN al **máximo** (`sky_engine/lib/ui/math.dart`: `if (x.isNaN) return max;`), así que la dona se pintaba **llena y verde**: la app le afirmaba a cada alumno, en cada curso, que había asistido al 100%.

## Requirements

- RS-BE-10: **La ausencia de dato nunca se presenta como asistencia perfecta.** Una matrícula sin horas cargadas se reporta con estado propio `sin_datos` y `absencePercentage: null`, jamás como `normal` con 0%. Ni el backend ni el cliente pueden pintar de verde, contar como sano ni notificar sobre una matrícula sin medir.
  `[@test] ../../../test/HU_asistencia/attendance-risk.sin-datos.test.ts`
  `[@test] ../../../test/HU22_sam/impedidos.unitarias.test.ts`
  `[@test] ../../../test/HU30_sam/notificar.cajablanca.test.ts`
- RS-BE-11: **El riesgo de una sección solo lo ve y lo notifica su docente.** No basta con el rol `teacher`: la sección debe tener al docente autenticado como profesor titular (`teacher_id`) o como JP (`jp_id`). La guarda va montada como middleware sobre el patrón de ruta, no dentro de cada handler, para que un endpoint nuevo nazca protegido.
  `[@test] ../../../test/HU_asistencia/attendance-risk.ownership.test.ts`
  `[@test] ../../../test/HU_asistencia/attendance-risk.rutas-guardadas.test.ts`
- RS-BE-12: **Las horas que ve un alumno son las suyas.** `GET /course-detail/sections` filtra las matrículas por el alumno autenticado; nunca agrega horas sobre el resto del salón. `promedioSeccion` sí es de la sección y va por su propio join.
  `[@test] ../../../test/HU_asistencia/course-detail.horas-propias.test.ts`
- RS-BE-13: **La duración de una sesión sale del horario**, como moda de `schedule_session` de la sección. Solo si la sección no tiene horario importado se degrada al 2 heredado.
  `[@test] ../../../test/HU_asistencia/attendance-risk.duracion-sesion.test.ts`
- RS-BE-14: **Notificar a una sección es todo o nada.** Las alertas se insertan en una transacción; un fallo a mitad no deja alertas parciales.
  `[@test] ../../../test/HU_asistencia/attendance-risk.alertas-atomicas.test.ts`

## Rules

### Señal de procedencia (por qué no hace falta una columna nueva)

El CHECK `chk_enrollment_attendance_hours` exige `attended_hours + absent_hours <= total_hours`. Por lo tanto **toda fila con dato real tiene `total_hours > 0`**, y `enrollment.total_hours = 0` significa exactamente "nunca se escribió asistencia para este alumno". El tri-estado sale gratis del esquema: no hace falta enum, columna de origen ni migración.

Ojo con la distinción, que es la trampa del módulo:

| Campo | Qué es | Sirve para saber si hay dato |
| --- | --- | --- |
| `course_offering.total_hours` | horas de la **sección** | **No.** Vale 48/64 aunque el alumno no tenga nada medido. |
| `enrollment.total_hours` | horas de la **matrícula** | **Sí.** 0 = nunca se escribió. |

La consulta expone las dos: `COALESCE(co.total_hours, e.total_hours) as total_section_hours` (denominador) y `e.total_hours as enrollment_total_hours` (procedencia).

### Clasificación

Orden de evaluación, y el primer caso es el que decide antes que cualquier cálculo:

1. `sin_datos` — si `enrollment_total_hours <= 0` (o no es finito), o si `total_section_hours <= 0`. Devuelve `absencePercentage: null` y `missingFaltas: null`. Sin denominador no hay porcentaje, y sin porcentaje no hay veredicto.
2. `impedido` — `absencePercentage > límite`, con límite 35 si `cycle >= 6`, 25 si no. Comparación **estricta**: 25% exacto todavía no es impedido.
3. `en_riesgo` — faltan exactamente 2 o 3 faltas para el límite.
4. `normal` — el resto.

`computeSummary` cuenta `sin_datos` **aparte**; nunca se suma a `normal`. El cliente tampoco puede calcular "Normal" por resta (`total - impedido - enRiesgo`), porque esa resta absorbe cualquier categoría nueva.

### Notificación

`notifyStudents` hace `continue` sobre toda fila `sin_datos`: no se inserta una `alert` sobre una matrícula sin medir. El mensaje dice "estás a N faltas del límite", y con datos ausentes ese N sería inventado — es correo académico a una persona real.

El mensaje de retorno distingue tres casos, porque el anterior ("No hay alumnos que notificar.") era una afirmación falsa sobre la realidad académica del salón cuando la causa real era que no había un solo dato:

- notificados > 0 → `Se han notificado a N alumnos.`
- notificados = 0 y hay sin datos → `No se notificó a nadie: N alumnos sin datos de asistencia cargados.`
- notificados = 0 y todos medidos → `No hay alumnos que notificar.`

### Contrato con el cliente

`SectionResponse` (schedule y course-detail) gana `asistenciaDisponible: boolean`. Es una bandera **positiva** a propósito: el cliente no puede distinguir "0 faltas" de "nunca se midió" mirando los números, y los `?? 0` del parser de Flutter vuelven invisible cualquier `null`. Con un backend viejo que no la emita, el cliente cae a la misma regla que usa el servidor (`total > 0`), nunca a `true`.

Las filas de horario **docente** y de **asesoría** emiten `asistenciaDisponible: false`: son secciones o sesiones, y la asistencia de este esquema es por matrícula.

## Reglas sin fuente

Se implementan tal como estaban, pero **ningún documento del repo ni de la Universidad las respalda**. No deberían defenderse ante el profesor del curso sin confirmarlas antes:

- El límite 25% / 35% y el corte en `cycle >= 6`.
- La ventana de `en_riesgo` es exactamente `{2, 3}` faltas: **un alumno a 1 falta del límite vuelve a clasificar como `normal` y nunca es avisado.** Parece un bug de negocio, no un diseño.
- El **fallback** de 2 h por sesión, que se usa cuando la sección no tiene horario importado (RS-BE-13 ya deriva el resto del horario real). Ese número viaja literal al mensaje que recibe el alumno y no hay documento que lo respalde.
- El denominador `course_offering.total_hours` se calcula como `créditos × 16`, que subestima las horas reales entre 20% y 40% (ver RS-BE-9 en `portal-sync.spec.md`).

## Fuera de alcance de esta spec

Pendientes verificados que **no** se tocaron acá y siguen abiertos (el IDOR, el filtro por alumno de `course-detail` y la atomicidad de `createAlerts` estaban en esta lista y ya se cerraron: RS-BE-11, RS-BE-12 y RS-BE-14):

- `schedule.repository.ts` devuelve `'0'` literal para las horas en la rama docente, no leído de la base.
- Nadie escribe todavía las horas de asistencia. Traerlas del Aula Virtual depende de un spike no ejecutado.
