import { describe, expect, mock, test } from "bun:test";
import { AvatarService } from "../../src/modules/avatar/avatar.service.js";
import type { AvatarRepository } from "../../src/modules/avatar/avatar.repository.js";
import type { RolModerador } from "../../src/modules/avatar/avatar.logic.js";
import { HttpError } from "../../src/shared/errors/http-error.js";

/**
 * Quitar una foto de perfil.
 *
 * Es la parte con consecuencias: si la autorización es laxa, cualquiera borra
 * la foto de cualquiera; si el borrado en Cloudinary no ocurre, la imagen sigue
 * accesible por URL para quien la haya guardado, aunque la app deje de
 * mostrarla — y eso convierte un "quítenme la foto" en una promesa incumplida.
 */
const repo = (over: Partial<AvatarRepository> = {}) => {
  const llamadas = { borrados: [] as number[] };
  const base = {
    existeUsuario: async () => true,
    rolEnSeccionCompartida: async (): Promise<RolModerador> => null,
    publicIdDe: async () => "ulima/avatars/2",
    borrar: async (userId: number) => { llamadas.borrados.push(userId); },
    guardar: async () => {},
    ...over,
  } as unknown as AvatarRepository;
  return { repo: base, llamadas };
};

describe("quitar — quién puede", () => {
  test("el dueño quita la suya", async () => {
    const { repo: r, llamadas } = repo();
    await new AvatarService(r, async () => {}).quitar(7, 7);
    expect(llamadas.borrados).toEqual([7]);
  });

  test("un compañero cualquiera recibe 403 y NADA se borra", async () => {
    const { repo: r, llamadas } = repo({ rolEnSeccionCompartida: async () => null } as never);
    const svc = new AvatarService(r, async () => {});
    await expect(svc.quitar(1, 2)).rejects.toMatchObject({ statusCode: 403, code: "AVATAR_FORBIDDEN" });
    expect(llamadas.borrados).toEqual([]);
  });

  test("delegado, subdelegado, docente y JP de una sección compartida sí pueden", async () => {
    for (const rol of ["delegate", "subdelegate", "teacher", "jp"] as const) {
      const { repo: r, llamadas } = repo({ rolEnSeccionCompartida: async () => rol } as never);
      await new AvatarService(r, async () => {}).quitar(1, 2);
      expect(llamadas.borrados).toEqual([2]);
    }
  });

  test("sobre un usuario inexistente da 404, sin consultar permisos", async () => {
    let consultoRol = false;
    const { repo: r } = repo({
      existeUsuario: async () => false,
      rolEnSeccionCompartida: async () => { consultoRol = true; return null; },
    } as never);
    await expect(new AvatarService(r, async () => {}).quitar(1, 999))
      .rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
    expect(consultoRol).toBe(false);
  });

  test("el dueño NO gasta una consulta de permisos sobre sí mismo", async () => {
    let consultoRol = false;
    const { repo: r } = repo({
      rolEnSeccionCompartida: async () => { consultoRol = true; return null; },
    } as never);
    await new AvatarService(r, async () => {}).quitar(7, 7);
    expect(consultoRol).toBe(false);
  });
});

describe("quitar — el borrado en Cloudinary", () => {
  test("se borra también la imagen, no solo la fila", async () => {
    const destruidas: string[] = [];
    const { repo: r } = repo();
    await new AvatarService(r, async (id) => { destruidas.push(id); }).quitar(7, 7);
    expect(destruidas).toEqual(["ulima/avatars/2"]);
  });

  test("si Cloudinary falla, la fila IGUAL queda limpia", async () => {
    // Para quien pidió que le quiten la foto, lo que importa es que la app deje
    // de mostrarla. El fallo se registra, no se propaga.
    const { repo: r, llamadas } = repo();
    const svc = new AvatarService(r, async () => { throw new Error("503 de Cloudinary"); });
    const error = mock(() => {});
    const original = console.error;
    console.error = error as never;
    await svc.quitar(7, 7);
    console.error = original;
    expect(llamadas.borrados).toEqual([7]);
    expect(error).toHaveBeenCalled();
  });

  test("quien no tenía foto no dispara ninguna llamada a Cloudinary", async () => {
    let llamado = false;
    const { repo: r } = repo({ publicIdDe: async () => null } as never);
    await new AvatarService(r, async () => { llamado = true; }).quitar(7, 7);
    expect(llamado).toBe(false);
  });
});

describe("con Cloudinary sin configurar", () => {
  test("firmar y confirmar responden 503, no 500: es un estado, no un fallo", async () => {
    const { repo: r } = repo();
    const svc = new AvatarService(r, async () => {});
    expect(() => svc.firmarSubida(7)).toThrow(HttpError);
    try { svc.firmarSubida(7); } catch (e) {
      expect(e).toMatchObject({ statusCode: 503, code: "AVATAR_DISABLED" });
    }
    await expect(svc.confirmar(7, "1")).rejects.toMatchObject({ statusCode: 503, code: "AVATAR_DISABLED" });
  });

  test("pero QUITAR sigue funcionando: hay que poder retirar una foto aunque el servicio esté apagado", async () => {
    const { repo: r, llamadas } = repo();
    await new AvatarService(r, async () => {}).quitar(7, 7);
    expect(llamadas.borrados).toEqual([7]);
  });
});
