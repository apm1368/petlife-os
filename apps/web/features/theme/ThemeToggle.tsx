"use client";

import { useTranslations } from "next-intl";
import { useThemeStore } from "@/stores/theme-store";
import type { ThemePreference } from "@petlife/types";

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const t = useTranslations("theme");
  const labelId = "theme-toggle-label";

  return (
    <div>
      <label id={labelId} className="sr-only">
        {t("system")}
      </label>
      <select
        aria-labelledby={labelId}
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemePreference)}
        className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <option value="SYSTEM">{t("system")}</option>
        <option value="LIGHT">{t("light")}</option>
        <option value="DARK">{t("dark")}</option>
      </select>
    </div>
  );
}
