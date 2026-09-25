---
name: Academic Profile
description: View student profile, list careers and specialties, and manage specialty selection for ULima++ students
targets:
  - ../../../src/modules/academic-profile/**
---

# Academic Profile

> **Enmienda propuesta el 2026-09-25 por `specs/features/specialty-test/specialty-test.spec.md`
> y aprobada por el dueño el 2026-09-25 con esa spec, pendiente de implementar.** Agrega
> BR-AP-07 (solo las especialidades oficiales, decisión 6 del dueño) y BR-AP-08 (reemplazo
> atómico, decisión abierta 14 de esa spec), y marca los cambios en BR-AP-03 y BR-AP-04.
> Hasta que la implementación llegue a producción, el backend desplegado sigue el texto sin
> enmendar.

## User Stories

| ID | Description |
| --- | --- |
| US05 | Seleccionar especialidad. |

## Business Rules

### BR-AP-01: GET /academic-profile/me — Full profile
- Retorna el perfil completo del estudiante autenticado.
- Consulta `app_user` + `student` + `career` + `curriculum` + `student_specialty` activas.
- Incluye el objeto `career` con `id`, `code`, `name`, `faculty`.
- Incluye el objeto `curriculum` con `id`, `name`.
- Incluye el array `specialties` con las especialidades activas del estudiante.
- Incluye `setupComplete` desde `student.specialty_setup_completed`.
- **Auth**: Bearer token (vía `authMiddleware`).

### BR-AP-02: GET /academic-profile/careers — List careers
- Retorna todas las carreras ordenadas por nombre.
- **Auth**: Bearer token.

### BR-AP-03: GET /academic-profile/specialties — List specialties
- Retorna especialidades filtradas por `careerId` (query param).
- Si `careerId` no se envía, retorna especialidades de la carrera del estudiante autenticado.
- **Auth**: Bearer token.
- **Enmendado por `specialty-test.spec.md` (BR-AP-07, aprobada por el dueño el 2026-09-25).** Con
  `careerId` y sin él, la lista trae solo las especialidades con `is_active = true`.

### BR-AP-04: PUT /academic-profile/me/specialties — Replace specialties
- Reemplaza las especialidades activas del estudiante autenticado.
- **Auth**: Bearer token.
- El body incluye `primarySpecialtyId` (opcional, nullable) y `interestSpecialtyIds` (array, puede ser vacío).
- Solo una especialidad puede tener `selectionType = 'primary'` por estudiante (garantizado por `uq_student_specialty_active_primary`).
- Especialidades previas del estudiante que NO estén en la nueva lista → `isActive = false`.
- Especialidades que ya existían para el estudiante y están en la nueva lista → se reactivan (`isActive = true`).
- Nuevas combinaciones → se insertan.
- Si `primarySpecialtyId` es `null` y el estudiante tenía una primary activa, esa primary se desactiva.
- Siempre marca `student.specialty_setup_completed = true`, incluso si `primarySpecialtyId` es `null` y `interestSpecialtyIds` está vacío.
- **Enmendado por `specialty-test.spec.md` (BR-AP-07 y BR-AP-08, aprobadas por el dueño el
  2026-09-25).** Cada id, principal o de interés, tiene que ser una especialidad con
  `is_active = true` de la carrera del alumno; si no, `404 SPECIALTY_NOT_FOUND`. El reemplazo
  entero corre en una sola transacción.

### BR-AP-05: Specialty setup completion
- `student.specialty_setup_completed` indica que el estudiante ya pasó por el wizard de especialidades.
- Este flag permite distinguir “todavía no configuró” de “configuró y eligió no seleccionar especialidad por ahora”.

### BR-AP-06: Self-only constraint
- El estudiante autenticado solo puede leer/modificar su propio perfil y sus propias especialidades.
- No existe un endpoint para ver/modificar perfiles de otros estudiantes.

### BR-AP-07: Solo las especialidades oficiales (2026-09-25, decisión 6 del dueño, aprobada ese día)

- Solo se muestran y se pueden elegir los cuatro diplomas oficiales de Ingeniería de Sistemas,
  que son Ingeniería de Software, Tecnologías de la Información, Sistemas de Información y
  Desarrollo de Videojuegos.
- El filtro vive en el backend y no toca los datos de `specialty`. `findSpecialtiesByCareerId`
  (`academic-profile.repository.ts:142-159`) agrega `and is_active = true`, y con él las dos
  ramas de `GET /academic-profile/specialties`, porque `findSpecialtiesByStudentCareer` lo
  llama. `display_order` se numera después del filtro, y `is_active` sigue en la respuesta,
  ahora siempre `true`, para no romper a quien ya lo lee.
- `specialtyBelongsToCareer` (líneas 216-226) agrega `and is_active = true`. Una especialidad
  que existe pero está inactiva responde `404 SPECIALTY_NOT_FOUND` con el mismo mensaje que
  una de otra carrera, «Especialidad no encontrada para la carrera del estudiante.», sin
  código nuevo.
- Comprobación en solo lectura del 2026-09-25. Ningún alumno tiene una especialidad antigua
  como principal, y las 19 selecciones activas de `student_specialty` apuntan a los ids 1, 5, 6
  y 7. Antes del merge, el dueño confirma en solo lectura que esos cuatro ids son justamente
  las especialidades con `is_active = true` de la carrera.
- No cambian `GET /academic-profile/me`, el login ni la malla, que siguen mostrando lo
  guardado (decisión abierta 13 de `specialty-test.spec.md`). Los ejemplos de esta spec con
  «Ciencia de Datos» dejan de ser un caso posible y quedan como están.
- La app puede tener en caché un id antiguo. `getEspecialidadName()` del frontend
  (`lib/services/auth_service.dart`, cerca de la línea 92) devuelve entonces una cadena vacía,
  y ese caso lo cubre la spec del frontend.
- `[@test] ../../../test/HU36_jeff/academic-profile-official.test.ts` *(pendiente)*

### BR-AP-08: Reemplazo atómico (2026-09-25, decisión abierta 14 de `specialty-test.spec.md`, aprobada por el dueño ese día)

- Hoy `updateSpecialties` desactiva todas las especialidades del alumno y después inserta una
  por una, fuera de una transacción (`academic-profile.service.ts:72-86`). Un fallo a mitad
  deja al alumno sin especialidades activas.
- El desactivado, los `upsert` y la marca de `specialty_setup_completed` corren en una sola
  transacción. Si algo falla, la base conserva el estado previo y el error sube igual que hoy
  (`409 DUPLICATE_PRIMARY` o `500`).
- La transacción vive en un método nuevo del repository, que abre
  `this.database.transaction` como `academic-record.repository.ts:110`, porque `AGENTS.md` no
  deja que los services importen `db`. El service sigue validando cada id antes, como hoy, y
  sigue traduciendo la violación de unicidad a `409 DUPLICATE_PRIMARY`.
- «Elegir como principal» y los corazones de interés del resultado del test usan esta ruta.
- `[@test] ../../../test/HU36_jeff/academic-profile-atomic.test.ts` *(pendiente)*

## Endpoints

### GET /academic-profile/me

Retorna el perfil completo del estudiante autenticado.

- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "profile": {
      "id": 1,
      "studentId": 10,
      "code": "20201234",
      "fullName": "Nombre Apellido",
      "institutionalEmail": "user@aloe.ulima.edu.pe",
      "role": "student",
      "currentLevel": 5,
      "setupComplete": true,
      "career": {
        "id": 1,
        "code": "ING-INF",
        "name": "Ingeniería de Sistemas",
        "faculty": "Facultad de Ingeniería"
      },
      "curriculum": {
        "id": 1,
        "name": "Currículo 2023"
      },
      "specialties": [
        {
          "specialtyId": 1,
          "name": "Ingeniería de Software",
          "selectionType": "primary"
        },
        {
          "specialtyId": 2,
          "name": "Ciencia de Datos",
          "selectionType": "interest"
        }
      ]
    }
  }
  ```
- **Errors**:
  - `401` `MISSING_TOKEN`: No se envió el token
  - `401` `INVALID_TOKEN`: Token inválido o expirado
  - `404` `USER_NOT_FOUND`: El usuario autenticado no existe en `app_user`/`student`

### GET /academic-profile/careers

Retorna todas las carreras disponibles.

- **Auth**: Bearer token
- **Response** `200 OK`:
  ```json
  {
    "careers": [
      {
        "id": 1,
        "code": "ING-INF",
        "name": "Ingeniería de Sistemas",
        "faculty": "Facultad de Ingeniería"
      },
      {
        "id": 2,
        "code": "ING-IND",
        "name": "Ingeniería Industrial",
        "faculty": "Facultad de Ingeniería"
      }
    ]
  }
  ```

### GET /academic-profile/specialties

Retorna especialidades. Si `careerId` no se envía, usa la carrera del estudiante autenticado.

- **Auth**: Bearer token
- **Query params**: `?careerId={id}` (opcional)
- **Response** `200 OK`:
  ```json
  {
    "specialties": [
      {
        "id": 1,
        "careerId": 1,
        "name": "Ingeniería de Software",
        "description": "Especialidad en desarrollo de software"
      }
    ]
  }
  ```
- **Errors**:
  - `401` `MISSING_TOKEN` / `INVALID_TOKEN`
  - `400` `INVALID_CAREER_ID`: Si `careerId` se envía pero no es un número positivo
- **BR-AP-07 (aprobada por el dueño el 2026-09-25).** Solo trae especialidades con `is_active = true`.

### PUT /academic-profile/me/specialties

Reemplaza las especialidades activas del estudiante autenticado.

- **Auth**: Bearer token
- **Request body**:
  ```json
  {
    "primarySpecialtyId": 1,
    "interestSpecialtyIds": [2, 3]
  }
  ```
- **Validation** (Zod):
  - `primarySpecialtyId`: `z.number().int().positive().nullable().optional()`
  - `interestSpecialtyIds`: `z.array(z.number().int().positive()).optional().default([])`
- **Response** `200 OK`:
  ```json
  {
    "message": "Specialties updated",
    "setupComplete": true,
    "specialties": [
      { "specialtyId": 1, "selectionType": "primary" },
      { "specialtyId": 2, "selectionType": "interest" },
      { "specialtyId": 3, "selectionType": "interest" }
    ]
  }
  ```
- **Errors**:
  - `401` `MISSING_TOKEN` / `INVALID_TOKEN`
  - `400` `INVALID_BODY`: Body no pasa validación Zod
  - `404` `SPECIALTY_NOT_FOUND`: Algún `specialtyId` no existe en la tabla `specialty`
  - `409` `DUPLICATE_PRIMARY`: Se intenta tener más de una primary activa (violación del unique index)
- **BR-AP-07 y BR-AP-08 (aprobadas por el dueño el 2026-09-25).** `404 SPECIALTY_NOT_FOUND` también para
  una especialidad inactiva o de otra carrera, y el reemplazo corre en una sola transacción.

## Types

### ProfileResponse

```typescript
type ProfileResponse = {
  id: number;
  studentId: number;
  code: string;
  fullName: string;
  institutionalEmail: string;
  role: 'student' | 'delegate' | 'subdelegate';
  currentLevel: number | null;
  setupComplete: boolean;
  career: {
    id: number;
    code: string;
    name: string;
    faculty: string;
  };
  curriculum: {
    id: number;
    name: string;
  };
  specialties: Array<{
    specialtyId: number;
    name: string;
    selectionType: 'primary' | 'interest';
  }>;
};
```

### CareerResponse

```typescript
type CareerResponse = {
  id: number;
  code: string;
  name: string;
  faculty: string;
};
```

### SpecialtyResponse

```typescript
type SpecialtyResponse = {
  id: number;
  careerId: number;
  name: string;
  description: string | null;
};
```

### UpdateSpecialtiesRequest

```typescript
type UpdateSpecialtiesRequest = {
  primarySpecialtyId?: number | null;
  interestSpecialtyIds?: number[];
};
```

### UpdateSpecialtiesResult

```typescript
type UpdateSpecialtiesResult = {
  message: 'Specialties updated';
  setupComplete: true;
  specialties: Array<{
    specialtyId: number;
    selectionType: 'primary' | 'interest';
  }>;
};
```

### Student schema change

```typescript
student.specialtySetupCompleted: boolean;
```

- DB column: `student.specialty_setup_completed boolean not null default false`
- Existing students default to `false` until `PUT /academic-profile/me/specialties` succeeds.

### ActiveSpecialty

```typescript
type ActiveSpecialty = {
  specialtyId: number;
  selectionType: 'primary' | 'interest';
};
```

## Schemas (Zod)

### `updateSpecialtiesSchema`

```typescript
export const updateSpecialtiesSchema = z.object({
  primarySpecialtyId: z.number().int().positive().nullable().optional(),
  interestSpecialtyIds: z.array(z.number().int().positive()).optional().default([]),
});
```

## Test Links

*(No hay tests existentes aún. Cuando se agreguen, enlazarlos aquí con `[@test]`.)*
