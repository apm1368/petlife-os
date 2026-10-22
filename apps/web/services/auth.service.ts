import type { UserDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface AuthMethodsDto {
  phone: boolean;
  password: boolean;
}

/** After the password step of sign-in: either a code was texted, or the account first needs a mobile. */
export type LoginStartDto =
  | { status: "OTP_REQUIRED"; challengeId: string; maskedPhone: string; resendAfterSeconds: number }
  | { status: "PHONE_REQUIRED"; challengeId: string };

export const authService = {
  getMethods: () => apiFetch<AuthMethodsDto>("/auth/methods"),

  /** Sign-up step 1: checks the username is free and texts a code to the mobile. */
  requestRegisterOtp: (username: string, phone: string) =>
    apiFetch<{ ok: true; maskedPhone: string; resendAfterSeconds: number }>("/auth/register/request-otp", { method: "POST", body: { username, phone } }),

  /** Sign-up step 2: creates the account with the texted code and signs in. */
  register: (input: { username: string; password: string; phone: string; code: string; displayName?: string }) =>
    apiFetch<{ user: UserDto }>("/auth/register", { method: "POST", body: input }),

  /** Sign-in step 1: checks the password; never signs in by itself. */
  loginPassword: (username: string, password: string) =>
    apiFetch<LoginStartDto>("/auth/login/password", { method: "POST", body: { username, password } }),

  /** For an account without a verified mobile: where the sign-in code should go. */
  loginPhone: (challengeId: string, phone: string) =>
    apiFetch<LoginStartDto>("/auth/login/phone", { method: "POST", body: { challengeId, phone } }),

  loginResend: (challengeId: string) => apiFetch<LoginStartDto>("/auth/login/resend", { method: "POST", body: { challengeId } }),

  /** Sign-in step 2: the texted code; issues the session. */
  loginVerify: (challengeId: string, code: string) =>
    apiFetch<{ user: UserDto }>("/auth/login/verify", { method: "POST", body: { challengeId, code } }),

  setOrChangePassword: (input: { currentPassword?: string; newPassword: string }) =>
    apiFetch<{ ok: true; otherSessionsSignedOut: number }>("/auth/password", { method: "PUT", body: input }),

  /** Texts a reset code to the account's verified mobile; answers the same whether or not the username exists. */
  forgotPassword: (username: string) => apiFetch<{ ok: true }>("/auth/password/forgot", { method: "POST", body: { identifier: username } }),

  resetPassword: (input: { username: string; code: string; newPassword: string }) =>
    apiFetch<{ ok: true }>("/auth/password/reset", { method: "POST", body: { identifier: input.username, code: input.code, newPassword: input.newPassword } }),

  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),

  getSession: () => apiFetch<{ user: UserDto }>("/auth/session"),
};
