import type { AuthService } from "./auth.service.js";
import type { AppRole } from "./auth.types.js";

export class AuthController {
  constructor(readonly service: AuthService) {}

  login(input: { code: string; password: string }) {
    return this.service.login(input);
  }

  loginWithGoogle(input: { idToken: string }) {
    return this.service.loginWithGoogle(input);
  }

  /** `consent` (RS-BE-29) viaja tal cual hasta la importación: el controller no
   *  decide nada con él, solo lo deja pasar, igual que hace
   *  `portal-sync.controller.ts` con el body de `/import`. */
  register(input: {
    code: string; portalPassword: string; passcode: string; password: string; consent?: boolean;
  }) {
    return this.service.register(input);
  }

  logout(userId: number) {
    return this.service.logout(userId);
  }

  me(userId: number, role: AppRole) {
    return this.service.me(userId, role);
  }

  requestPasswordReset(input: { identifier: string }) {
    return this.service.requestPasswordReset(input);
  }

  verifyPasswordResetCode(input: { identifier: string; code: string }) {
    return this.service.verifyPasswordResetCode(input);
  }

  confirmPasswordReset(input: { identifier: string; code: string; newPassword: string }) {
    return this.service.confirmPasswordReset(input);
  }

  requestPasswordResetForCurrentUser(userId: number) {
    return this.service.requestPasswordResetForCurrentUser(userId);
  }
}
