"use client";

import { useTranslations } from "next-intl";
import { useThemeStore } from "@/stores/theme-store";
import type { ThemePreference } from "@petlife/types";
import { IconButton, Sun, Moon, Monitor } from "@petlife/ui";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const t = useTranslations("theme");
  const next: ThemePreference = theme === "SYSTEM" ? "LIGHT" : theme === "LIGHT" ? "DARK" : "SYSTEM";
  const Icon = theme === "LIGHT" ? Sun : theme === "DARK" ? Moon : Monitor;

  return (
    <IconButton label={`${t(theme.toLowerCase())} → ${t(next.toLowerCase())}`} onClick={() => setTheme(next)} icon={<Icon size={20} aria-hidden="true" />} />
  );
}
