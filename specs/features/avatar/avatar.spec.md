---
name: Fotos de perfil
description: Cada usuario sube una foto de perfil que ven sus compañeros de sección; el delegado o el docente pueden quitarla. Las imágenes viven en Cloudinary; la base guarda solo el identificador.
targets:
  - ../../../src/modules/avatar/**
  - ../../../src/modules/index.ts
  - ../../../src/config/env.ts
  - ../../../src/config/app-config.ts
  - ../../../src/modules/course-detail/course-detail.routes.ts
  - ../../../src/modules/auth/auth.repository.ts
  - ../../../src/db/schema/schema.ts
  - ../../../drizzle/**
  - ../../../test/HU32_jeff/**
---

# Fotos de perfil

> Estado: **backend implementado** (2026-09-07). Migración `0009_avatar` aplicada y sellada en la base. Módulo montado en `/avatar` con firma, confirmación y borrado propio y por moderación; `avatarUrl` viaja ya en contactos y en `/auth/me`. Pendiente: las credenciales de Cloudinary en Vercel (sin ellas la feature responde 503 y todos se ven con iniciales) y todo el frontend.

## Contexto

Hoy la app pinta **iniciales** en 9 lugares: contactos del curso, chat, perfil, los dos de anuncios de delegado y cuatro pantallas de docente. No hay ninguna subida de archivos: `pubspec.yaml` trae `firebase_core`, `firebase_auth` y `firebase_database` (el chat), pero no `image_picker` ni `firebase_storage`. `app_user` no tiene columna de foto.

El backend corre en Vercel, serverless y con disco efímero: no puede guardar archivos. Los bytes tienen que vivir fuera.

### Por qué Cloudinary y no Firebase Storage

El bucket `ulima-plus-chat.firebasestorage.app` ya está provisionado y sin usar, lo que a primera vista lo hacía la opción obvia. Mirado de cerca, no:

1. **Transformaciones por URL.** Casi todos los usos son avatares diminutos. Cloudinary sirve `w_160,h_160,c_fill,g_face,f_auto,q_auto` cambiando la URL: un recorte a la cara, en WebP, por CDN. Firebase Storage no transforma — o se descarga la imagen completa para pintarla a 40 px, o se fija un solo tamaño al subir y ya no se cambia. Con alumnos usando datos móviles, la diferencia es real.
2. **La identidad de Firebase en esta app es por sección, no por persona.** `chat_repository.dart` hace `signInWithCustomToken` con un token que emite el backend **para una sección**, y solo mientras se usa el chat. Las reglas de seguridad de Storage se apoyan en esa identidad, así que habría que rehacer el modelo de sesión de Firebase solo para las fotos, o dejar el bucket abierto.

## Requirements

- **RQ-1**: Un usuario sube su foto de perfil desde la app y la reemplaza cuando quiera.
- **RQ-2**: La foto la ven los usuarios que comparten al menos una sección con él, en contactos y en el chat. Nadie más.
- **RQ-3**: Quien no tiene foto se sigue viendo exactamente como hoy: sus iniciales.
- **RQ-4**: Un delegado, subdelegado, docente o jefe de práctica de una sección puede quitar la foto de un alumno de esa sección.
- **RQ-5**: El dueño puede quitar su propia foto.
- **RQ-6**: Quitar una foto la borra de Cloudinary, no solo de la base.
- **RQ-7**: El secreto de Cloudinary nunca sale del backend.

## Arquitectura

Módulo nuevo `src/modules/avatar/` con las capas del proyecto (routes / controller / service / repository / logic). No se cuelga de `networking`, que es específico del carnet.

### Datos

Tres columnas nuevas en `app_user`:

| columna | tipo | notas |
|---|---|---|
| `avatar_public_id` | `varchar(255)` NULL | identificador en Cloudinary; NULL = sin foto |
| `avatar_version` | `varchar(20)` NULL | versión que devuelve Cloudinary; entra en la URL y sirve de rompe-caché |
| `avatar_updated_at` | `timestamptz` NULL | cuándo se subió |

Se guarda el **`public_id`, no la URL**: con la URL guardada no se podría cambiar la transformación después ni borrar la imagen, y borrarla es lo que hace posible atender un "quítenme la foto".

## Rules

- **RS-1**: El `public_id` es determinista: `ulima/avatars/<userId>`. Una sola foto por persona, volver a subir la reemplaza, y no quedan huérfanas acumulándose en la cuenta.
- **RS-2**: `POST /avatar/signature` devuelve `{ cloudName, apiKey, timestamp, signature, publicId, folder }`. La firma es `sha1(params ordenados + apiSecret)`, la que Cloudinary especifica. Fija `public_id` y `folder`, así que una firma robada solo sirve para sobrescribir la foto de su propio dueño.
- **RS-3**: La app sube **directo a Cloudinary**, no a través del backend. Vercel corta los cuerpos en 4.5 MB y una foto de cámara los pasa; además proxear los bytes gasta tiempo de función sin ganar nada.
- **RS-4**: `POST /avatar` confirma la subida con la `version` que devolvió Cloudinary y escribe las tres columnas. Sin esta confirmación la foto existe en Cloudinary pero la app no la muestra: la base es la fuente de verdad.
- **RS-5**: La URL se construye en el backend, nunca se guarda: `https://res.cloudinary.com/<cloud>/image/upload/<transformación>/v<version>/<publicId>`. Un solo helper puro la arma.
- **RS-6**: `avatarUrl` viaja donde ya viaja el usuario: contactos de la sección, participantes del chat y `/auth/me`. **No hay endpoint para pedir la foto de un usuario cualquiera**: eso convertiría la app en un directorio de caras.
- **RS-7**: La visibilidad se apoya en la guarda de pertenencia que el endpoint de contactos ya tiene (`SECTION_FORBIDDEN`). No se inventa un control nuevo.
- **RS-8**: `DELETE /avatar` borra la propia. `DELETE /avatar/:userId` la de otro, permitido solo si quien pide es delegado o subdelegado de una sección donde el otro está matriculado, o el docente o JP de esa sección. Reusa `findRepresentativeAccess`, que está acotado al período activo.
- **RS-9**: Borrar llama a `destroy` en Cloudinary **y** anula las columnas. Anular solo la columna dejaría la URL viva para quien la haya guardado.
- **RS-10**: Si Cloudinary falla al borrar, la fila igual se anula y se registra el fallo: para el alumno que pidió que le quiten la foto, que la app deje de mostrarla es lo que importa.
- **RS-11**: `CLOUDINARY_API_SECRET` vive solo como variable de entorno en Vercel. El repo es público: ni el secreto ni un *unsigned upload preset* pueden entrar al APK, que cualquiera puede descargar y descomprimir.

## Frontend (repo `ULima_Frontend_IS2`)

Widget `AvatarUsuario`: muestra la foto si hay `avatarUrl`, y si no las **iniciales exactamente como hoy**, con el mismo cálculo. Reemplaza los 9 puntos que hoy las pintan, así que para quien no suba nada la app se ve igual.

La subida va en Perfil, con `image_picker`, redimensionando en el teléfono antes de subir para no gastar datos de más.

## Fuera de alcance

- **Revisión previa y filtro automático.** Entre que alguien sube algo indebido y un delegado lo baja hay una ventana. Decisión del owner (2026-09-06): el poder de bajarla desde el día uno vale más que una cola de moderación.
- **Botón de reportar.** Quien vea algo indebido se lo dice al delegado por el chat del curso, que ya existe. Una tabla de reportes obligaría a decidir qué hacer con reportes repetidos o malintencionados.
- **Retención al cambiar de ciclo.** La foto sobrevive: si alguien deja de estudiar, queda hasta que él la borre.
- **Fotos de docentes sin cuenta.** `teacher` puede existir sin `app_user`; esos no tienen dónde guardar una foto.
