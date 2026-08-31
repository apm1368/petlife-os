import type { UserDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export const authService = {
  requestOtp: (identifier: string) => apiFetch<{ ok: true }>("/auth/request-otp", { method: "POST", body: { identifier } }),

  verifyOtp: (identifier: string, code: string) =>
    apiFetch<{ user: UserDto }>("/auth/verify-otp", { method: "POST", body: { identifier, code } }),

  logout: () => apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),

  getSession: () => apiFetch<{ user: UserDto }>("/auth/session"),
};
