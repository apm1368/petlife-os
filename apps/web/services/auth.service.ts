import type { UserDto } from "@petlife/types";
import { apiFetch, API_BASE_URL } from "@/lib/api/client";

export interface AuthMethodsDto {
  google: boolean;
  phone: boolean;
  password: boolean;
}

export const authService = {
  getMethods: () => apiFetch<AuthMethodsDto>("/auth/methods"),

  requestOtp: (identifier: string) => apiFetch<{ ok: true }>("/auth/request-otp", { method: "POST", body: { identifier } }),

  verifyOtp: (identifier: string, code: string) =>
    apiFetch<{ user: UserDto }>("/auth/verify-otp", { method: "POST", body: { identifier, code } }),

  register: (input: { username: string; password: string; displayName?: string; email?: string }) =>
    apiFetch<{ user: UserDto }>("/auth/register", { method: "POST", body: input }),

  loginPassword: (username: string, password: string) =>
    apiFetch<{ user: UserDto }>("/auth/login/password", { method: "POST", body: { username, password } }),

  setOrChangePassword: (input: { currentPassword?: string; newPassword: string }) =>
    apiFetch<{ ok: true }>("/auth/password", { method: "PUT", body: input }),

  forgotPassword: (identifier: string) => apiFetch<{ ok: true }>("/auth/password/forgot", { method: "POST", body: { identifier } }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ ok: true }>("/auth/password/reset", { method: "POST", body: { token, newPassword } }),

  /** A full browser navigation, not a fetch — Google's OAuth flow only works as a real page redirect. */
  googleLoginUrl: (returnTo: string) => `${API_BASE_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}`,

  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),

  getSession: () => apiFetch<{ user: UserDto }>("/auth/session"),
};
