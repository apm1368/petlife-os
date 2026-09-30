import type { Locale, ThemePreference, UserDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

export interface UpdateMeInput {
  displayName?: string;
  locale?: Locale;
  themePreference?: ThemePreference;
  avatarUrl?: string;
}

export const usersService = {
  getMe: () => apiFetch<UserDto>("/me"),
  updateMe: (input: UpdateMeInput) => apiFetch<UserDto>("/me", { method: "PATCH", body: input }),
  requestContactChange: (kind: "email" | "phone", value: string) => apiFetch<{ ok: true }>("/me/contact/request", { method: "POST", body: { kind, value } }),
  confirmContactChange: (kind: "email" | "phone", value: string, code: string) => apiFetch<UserDto>("/me/contact/confirm", { method: "POST", body: { kind, value, code } }),
};
