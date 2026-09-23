---
name: Chat en vivo por sección (HU23)
description: Puente de auth entre el JWT propio y Firebase (POST /chat/token) + espejo de membresía + derivación de rol para el chat en vivo por sección
targets:
  - ../../../src/modules/chat/**
  - ../../../src/services/firebase.service.ts
---

# Chat en vivo por sección

> Ajustada el 2026-09-23 porque cada participante borra ahora sus propios mensajes, cambio aprobado por el dueño ese día.

Chat grupal en vivo por sección (alumnos + profesor + JP) sobre **Firebase RTDB**, con Postgres como fuente de verdad académica (NO se migra). Issues: HU23 (frontend #123), HU23_Backend (backend #44), HU23_Frontend (frontend #124). Spec retroactiva: la implementación se mergeó a `main` (commits `69de468`, `c67c9c8`, `0d78e32`) antes de escribir esta spec.

Decisión de arquitectura (trade-off) y caveats completos en el issue padre #123. Aquí se especifica solo el plano de backend testeable en el stack: el puente `/chat/token`, el espejo de membresía y la derivación de rol. Las **reglas de seguridad de RTDB** viven en Firebase y se validan con **Firebase Emulator** (fuera de la suite Bun).

## User Stories

- **HU23**: Como estudiante (o profesor/JP) de una sección, quiero un chat grupal en vivo con los integrantes de mi sección, para comunicarnos dentro de la app sin depender de WhatsApp.

## Requisitos

### R-CHAT-1 — Puente de auth `POST /chat/token`
El backend verifica el JWT propio (`authMiddleware`), resuelve al solicitante como participante de la sección y firma un **custom token** de Firebase (`uid = app_user.id`) con claims `{ role, sectionId, moderator, weight }`.
- El rol del JWT decide la fuente: `teacher` ⇒ `findTeacherParticipant` (por `section.teacher_id`/`jp_id`); cualquier otro ⇒ `findStudentParticipant` (por `enrollment` activo + `section_representative`).
- Un solicitante sin participante en la sección, o cuyo `userId` del JWT no coincide con el del participante, recibe `403 CHAT_SECTION_FORBIDDEN` (anti-suplantación por parámetro).
  `[@test] ../../../test/chat.controller.test.ts` (docente sin teacherId, docente no-dictante, alumno sin studentId, userId ≠ participante, no escribe espejo al rechazar)
- Al autorizar, el backend escribe el espejo `/members/{sectionId}/{uid}` en RTDB **antes** de firmar el token, y devuelve `{ token, uid, displayName, role, roleLabel, isModerator, weight }`.
  `[@test] ../../../test/chat.controller.test.ts` (profesor válido, alumno raso, delegado)

### R-CHAT-2 — Derivación de rol/peso/moderador
El rol de chat determina etiqueta, peso y si es moderador (badge/estilo de la burbuja):
- `teacher`=100, `jp`=90, `delegate`=70, `subdelegate`=60, `student`=10; moderador = todos salvo `student`.
- Un alumno se mapea a `delegate`/`subdelegate` según su `position` activa en `section_representative`, o `student` si no es representante.
- `moderator` es solo presentación (etiqueta de rol en la burbuja); **NO** habilita borrar mensajes ajenos (ver R-CHAT-4).
  `[@test] ../../../test/chat.logic.test.ts` (roleLabel, roleWeight, isModeratorRole, studentRoleFromPosition, buildParticipant, canIssueToken)

### R-CHAT-3 — Postgres no se migra; el cliente nunca escribe membresía
Firebase RTDB guarda solo mensajes + el espejo `/members`. El backend es el ÚNICO que escribe `/members` (el cliente lo tiene denegado por reglas). Sin Cloud Functions (plan Spark).

### R-CHAT-4 — Borrado suave de mensajes (cada participante los suyos; el profesor titular, cualquiera)
`DELETE /chat/sections/:sectionId/messages/:messageId` acepta a cualquier usuario autenticado, sin `requireRole`. El controller resuelve al solicitante igual que `POST /chat/token` (R-CHAT-1), con `findTeacherParticipant` si el rol del JWT es `teacher` y con `findStudentParticipant` en otro caso, y exige que el `userId` del JWT coincida con el del participante.
- Cada participante de la sección (alumno, delegado, subdelegado, JP y profesor) borra sus propios mensajes, sin límite de tiempo. El profesor titular, que es el participante con `role == 'teacher'`, borra además los mensajes de cualquiera. El JP y los representantes no borran mensajes ajenos.
- La autoría se comprueba en el servidor y nunca sale del cliente. Si el solicitante no es el profesor titular, el controller llama a `firebaseService.softDeleteChatMessage` con `requireSenderUid` igual al `uid` del participante, y el servicio lee el `senderId` del mensaje antes de escribir. Si el `senderId` guardado no coincide, el servicio no escribe nada.
- El borrado no elimina el nodo. El servicio lo marca con `{ deleted:true, deletedBy, deletedByUid, deletedByRole, deletedAt }` vía **Admin SDK**, que salta las reglas RTDB, y los tres campos `deletedBy*` guardan el nombre, el `uid` y el rol de chat de quien borra. El cliente elige el aviso de la lápida con `deletedByUid`, porque si coincide con el `senderId` del mensaje, quien lo borra es su autor.
- Borrar un mensaje que ya tiene `deleted == true` es idempotente. El servicio no reescribe la lápida y la respuesta es `200` con el `deletedBy` que el mensaje ya guarda.
- La respuesta `200` es `{ deleted: true, messageId, deletedBy }`. Los rechazos son `403 CHAT_DELETE_FORBIDDEN` con el mensaje «Solo puedes eliminar tus propios mensajes.», `404 CHAT_MESSAGE_NOT_FOUND` y `400 INVALID_ROUTE_PARAMS`. El 403 cubre al solicitante que no participa de la sección, al que llega con un `userId` distinto del participante y al que pide un mensaje ajeno sin ser el profesor titular. El 404 cubre el mensaje inexistente y el `messageId` con una `/` codificada que apunta a un campo en vez de a un mensaje.
  `[@test] ../../../test/HU23_jeff/chat_delete.cajablanca.test.ts` (alumno, delegado, subdelegado y JP borran el suyo y no el ajeno; profesor titular borra cualquiera; no participante; userId ≠ participante; mensaje inexistente ⇒ 404; mensaje ya borrado ⇒ 200 sin reescribir)
  `[@test] ../../../test/HU23_jeff/chat_soft_delete.unit.test.ts` (el servicio lee el `senderId` antes de escribir, no escribe si es ajeno, si ya estaba borrado o si el valor no es un mensaje, y escribe la lápida completa)
  `[@test] ../../../test/HU23_jeff/chat_delete.routes.test.ts` (la ruta ya no exige `teacher` y toma `studentId`, `teacherId` y `role` del JWT)
- Las reglas RTDB (`ULima_Frontend_IS2/database.rules.json`) dejan el `$msg .write` del cliente en **solo crear** (no borra ni edita), así que este endpoint es el único camino de borrado. Este ajuste no cambia las reglas.

## Fuera de alcance de esta spec (validado aparte)
- Reglas de seguridad de RTDB (lectura/escritura por membresía; `$msg` solo-crear) → **Firebase Emulator**.
- Realtime del SDK y la pantalla FlutterFire → sub-issue frontend HU23_Frontend (#124).

## Notas de despliegue
- Fijar `firebase-admin@12.1.0`: v13/v14 arrastran `jwks-rsa`→`jose` (ESM) y rompen Vercel con `ERR_REQUIRE_ESM` (backend `type:"module"`). Ver `KNOWLEDGE.md`.
- Env requeridas: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`. Si faltan, el servicio no firma tokens (chat deshabilitado, sin romper el resto).
