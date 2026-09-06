import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  TRANSFORMACION_AVATAR, construirUrlAvatar, firmaDeSubida, paramsAFirmar,
  publicIdDe, puedeQuitarAvatar,
} from "../../src/modules/avatar/avatar.logic.js";

/**
 * Fotos de perfil: lo que se puede probar sin red ni base.
 *
 * La firma es lo más delicado del módulo. Si se arma mal, Cloudinary rechaza la
 * subida y nadie puede poner foto; si se arma DE MÁS —sin fijar `public_id`—,
 * una firma interceptada serviría para sobrescribir la foto de cualquiera.
 */

describe("publicIdDe", () => {
  test("es determinista por usuario: una sola foto por persona", () => {
    expect(publicIdDe(42)).toBe("ulima/avatars/42");
    expect(publicIdDe(42)).toBe(publicIdDe(42));
  });
  test("dos usuarios nunca comparten identificador", () => {
    expect(publicIdDe(1)).not.toBe(publicIdDe(2));
  });
});

describe("paramsAFirmar", () => {
  const p = paramsAFirmar({ publicId: "ulima/avatars/42", timestamp: 1700000000 });

  test("fija el public_id: una firma robada solo sirve para la foto de su dueño", () => {
    expect(p.public_id).toBe("ulima/avatars/42");
  });
  test("sobrescribe e invalida el CDN, porque reemplazar es el caso normal", () => {
    expect(p.overwrite).toBe("true");
    expect(p.invalidate).toBe("true");
  });
  test("NO incluye api_key ni cloud_name: Cloudinary los excluye de la firma", () => {
    expect(Object.keys(p)).not.toContain("api_key");
    expect(Object.keys(p)).not.toContain("cloud_name");
    expect(Object.keys(p)).not.toContain("file");
  });
});

describe("firmaDeSubida", () => {
  const secreto = "secreto-de-prueba";
  const base = { publicId: "ulima/avatars/42", timestamp: 1700000000 };

  test("es el sha1 de los parámetros ordenados alfabéticamente más el secreto", () => {
    // Es el algoritmo que Cloudinary especifica; se replica aquí para que un
    // cambio accidental en el orden o el separador rompa el test y no la subida.
    const esperado = createHash("sha1")
      .update("invalidate=true&overwrite=true&public_id=ulima/avatars/42&timestamp=1700000000" + secreto)
      .digest("hex");
    expect(firmaDeSubida({ ...base, apiSecret: secreto })).toBe(esperado);
  });
  test("cambiar cualquier parámetro cambia la firma", () => {
    const f = firmaDeSubida({ ...base, apiSecret: secreto });
    expect(firmaDeSubida({ ...base, timestamp: 1700000001, apiSecret: secreto })).not.toBe(f);
    expect(firmaDeSubida({ ...base, publicId: "ulima/avatars/43", apiSecret: secreto })).not.toBe(f);
    expect(firmaDeSubida({ ...base, apiSecret: "otro" })).not.toBe(f);
  });
  test("el secreto no aparece en la firma", () => {
    expect(firmaDeSubida({ ...base, apiSecret: secreto })).not.toContain(secreto);
  });
});

describe("construirUrlAvatar", () => {
  const args = { cloudName: "ulima", publicId: "ulima/avatars/42", version: "1700000000" };

  test("arma la URL con la transformación, la versión y el id", () => {
    expect(construirUrlAvatar(args)).toBe(
      `https://res.cloudinary.com/ulima/image/upload/${TRANSFORMACION_AVATAR}/v1700000000/ulima/avatars/42`,
    );
  });
  test("la transformación recorta a la cara y deja formato y calidad al CDN", () => {
    // Los avatares se pintan a 40 px en listas: servir la foto original gastaría
    // datos móviles de los alumnos sin que se note en pantalla.
    expect(TRANSFORMACION_AVATAR).toContain("c_fill");
    expect(TRANSFORMACION_AVATAR).toContain("g_face");
    expect(TRANSFORMACION_AVATAR).toContain("f_auto");
    expect(TRANSFORMACION_AVATAR).toContain("q_auto");
  });
  test("sin publicId o sin cloudName no hay URL: quien no subió foto va con iniciales", () => {
    expect(construirUrlAvatar({ ...args, publicId: null })).toBeNull();
    expect(construirUrlAvatar({ ...args, cloudName: "" })).toBeNull();
  });
  test("sin versión igual devuelve URL: la foto existe aunque no se sepa su versión", () => {
    const url = construirUrlAvatar({ ...args, version: null });
    expect(url).toContain("ulima/avatars/42");
    expect(url).not.toContain("/v/");
  });
});

describe("puedeQuitarAvatar", () => {
  const caso = (o: Partial<Parameters<typeof puedeQuitarAvatar>[0]>) =>
    puedeQuitarAvatar({ solicitanteUserId: 1, objetivoUserId: 2, rolEnSeccionCompartida: null, ...o });

  test("el dueño siempre puede quitar la suya", () => {
    expect(caso({ solicitanteUserId: 7, objetivoUserId: 7 })).toBe(true);
  });
  test("delegado, subdelegado, docente y JP de una sección compartida pueden", () => {
    for (const rol of ["delegate", "subdelegate", "teacher", "jp"] as const) {
      expect(caso({ rolEnSeccionCompartida: rol })).toBe(true);
    }
  });
  test("un compañero cualquiera NO puede", () => {
    // Sin esto, cualquiera de la sección borraría la foto de cualquiera.
    expect(caso({ rolEnSeccionCompartida: null })).toBe(false);
  });
  test("ser delegado NO alcanza si no comparten sección", () => {
    // El repositorio devuelve el rol SOLO si hay sección en común; que acá llegue
    // null es justamente cómo se expresa "no comparten nada".
    expect(caso({ solicitanteUserId: 5, objetivoUserId: 9, rolEnSeccionCompartida: null })).toBe(false);
  });
});
