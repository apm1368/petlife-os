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
};
