import { describe, expect, test } from "bun:test";
import { EventBus } from "../../src/events/index.js";
import type { AuthRepository } from "../../src/modules/auth/auth.repository.js";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import { HttpError } from "../../src/shared/errors/http-error.js";
import {
  MAX_RESET_ATTEMPTS,
  hashOtp,
} from "../../src/modules/auth/password-reset.logic.js";
import type {
  PasswordResetTokenRecord,
  PasswordResetUser,
} from "../../src/modules/auth/auth.types.js";

/**
 * ============================================================================
 * AuthService.verifyPasswordResetCode() — RS-AUTH-17 a RS-AUTH-22
 * spec: specs/features/auth/password-reset-verify.spec.md
 * ============================================================================
 * El endpoint existe porque el frontend dejaba pasar CUALQUIER código de seis
 * dígitos a la pantalla de contraseña nueva: solo validaba el formato en local
 * y el código real recién se contrastaba al final, cuando el usuario ya había
 * escrito la contraseña dos veces y había gastado un intento del token.
 *
 * Se prueba con un repositorio falso y un espía `calls`, para verificar no solo
 * el resultado sino el FLUJO: que se reserve el intento SIEMPRE (también cuando
 * el código es correcto) y que NUNCA se marque el token como usado, porque de
 * eso depende que `/confirm` siga funcionando después.
 */

const OTP_BUENO = "123456";
// Relativo al reloj real: el servicio llama a `new Date()` por dentro, así que
// una fecha fija haría nacer el token ya expirado según la zona en que se corra.
const enMinutos = (m: number) => new Date(Date.now() + m * 60 * 1000);

type Calls = {
  identifiers: string[];
  latestTokenUserIds: number[];
  consumedTokenIds: number[];
  markedUsedTokenIds: number[];
  passwordUpdates: number[];
};

const tokenBase = (over: Partial<PasswordResetTokenRecord> = {}): PasswordResetTokenRecord => ({
  id: 77,
  tokenHash: hashOtp(OTP_BUENO),
  expiresAt: enMinutos(10),
  usedAt: null,
  attempts: 0,
  ...over,
});

const montar = (opciones: {
  user?: PasswordResetUser | null;
  token?: PasswordResetTokenRecord | null;
  /** Lo que devuelve la reserva atómica; `null` = token usado o intentos agotados. */
  consumed?: PasswordResetTokenRecord | null;
}) => {
  const calls: Calls = {
    identifiers: [],
    latestTokenUserIds: [],
    consumedTokenIds: [],
    markedUsedTokenIds: [],
    passwordUpdates: [],
  };
  const user = opciones.user === undefined ? { id: 9, institutionalEmail: "x@aloe.ulima.edu.pe" } : opciones.user;
  const token = opciones.token === undefined ? tokenBase() : opciones.token;
  const consumed = opciones.consumed === undefined ? token : opciones.consumed;

  const repository = {
    async findUserForPasswordReset(identifier: string) {
      calls.identifiers.push(identifier);
      return user;
    },
    async findLatestPasswordResetToken(userId: number) {
      calls.latestTokenUserIds.push(userId);
      return token;
    },
    async consumePasswordResetAttempt(tokenId: number) {
      calls.consumedTokenIds.push(tokenId);
      return consumed;
    },
    async markPasswordResetTokenUsed(tokenId: number) {
      calls.markedUsedTokenIds.push(tokenId);
    },
    async updatePasswordAndInvalidateSessions(userId: number) {
      calls.passwordUpdates.push(userId);
    },
  } as unknown as AuthRepository;

  return { service: new AuthService(repository, new EventBus()), calls };
};

const esperarInvalido = async (promesa: Promise<unknown>) => {
  try {
    await promesa;
    throw new Error("se esperaba HttpError y no lo hubo");
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    const err = e as HttpError;
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_RESET_CODE");
    // El mensaje es genérico a propósito: no distingue mismatch de expirado ni
    // de cuenta inexistente, para no permitir enumeración.
    expect(err.message).toBe("Código inválido o expirado.");
  }
};

describe("RS-AUTH-17 · el código correcto se acepta", () => {
  test("devuelve valid true", async () => {
    const { service } = montar({});
    expect(await service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO }))
      .toEqual({ valid: true });
  });

  test("busca al usuario por el identificador que le dieron", async () => {
    const { service, calls } = montar({});
    await service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO });
    expect(calls.identifiers).toEqual(["20230001"]);
    expect(calls.latestTokenUserIds).toEqual([9]);
  });
});

describe("RS-AUTH-18 · no consume el token", () => {
  test("no lo marca como usado, para que /confirm pueda usarlo después", async () => {
    const { service, calls } = montar({});
    await service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO });
    expect(calls.markedUsedTokenIds).toEqual([]);
  });

  test("tampoco toca la contraseña", async () => {
    const { service, calls } = montar({});
    await service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO });
    expect(calls.passwordUpdates).toEqual([]);
  });
});

describe("RS-AUTH-19 · reserva un intento siempre", () => {
  test("también cuando el código es correcto", async () => {
    // Si solo se reservara al fallar, N peticiones concurrentes podrían saltarse
    // el límite leyendo un `attempts` obsoleto.
    const { service, calls } = montar({});
    await service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO });
    expect(calls.consumedTokenIds).toEqual([77]);
  });

  test("y cuando es incorrecto", async () => {
    const { service, calls } = montar({});
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "20230001", code: "999999" }));
    expect(calls.consumedTokenIds).toEqual([77]);
  });
});

describe("RS-AUTH-17 · todo lo demás es el mismo error genérico", () => {
  test("código que no coincide", async () => {
    const { service } = montar({});
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "20230001", code: "999999" }));
  });

  test("cuenta inexistente, sin llegar a pedir token", async () => {
    const { service, calls } = montar({ user: null });
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "nadie", code: OTP_BUENO }));
    expect(calls.latestTokenUserIds).toEqual([]);
  });

  test("sin token vigente", async () => {
    const { service, calls } = montar({ token: null });
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO }));
    expect(calls.consumedTokenIds).toEqual([]);
  });

  test("intentos agotados o token ya usado (la reserva no devuelve fila)", async () => {
    const { service } = montar({ consumed: null });
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO }));
  });

  test("token expirado", async () => {
    const expirado = tokenBase({ expiresAt: enMinutos(-1) });
    const { service } = montar({ token: expirado, consumed: expirado });
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO }));
  });

  test("token ya usado", async () => {
    const usado = tokenBase({ usedAt: new Date() });
    const { service } = montar({ token: usado, consumed: usado });
    await esperarInvalido(service.verifyPasswordResetCode({ identifier: "20230001", code: OTP_BUENO }));
  });
});

describe("RS-AUTH-22 · el límite sube a 6", () => {
  test("para que verificar y confirmar no le quiten margen al usuario", () => {
    // Un flujo correcto gasta 2 intentos (uno en verify, otro en confirm), así
    // que con 6 el presupuesto de equivocaciones sigue siendo 4, el de antes.
    expect(MAX_RESET_ATTEMPTS).toBe(6);
  });
});
