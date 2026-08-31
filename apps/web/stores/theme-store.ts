import { create } from "zustand";
import type { ThemePreference } from "@petlife/types";

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const STORAGE_KEY = "petlife-theme";

function applyThemeToDocument(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  if (theme === "SYSTEM") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme.toLowerCase());
  }
}

function readInitialTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "SYSTEM";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "LIGHT" || stored === "DARK" ? stored : "SYSTEM";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => {
    applyThemeToDocument(theme);
    try {
      if (theme === "SYSTEM") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private browsing); theme still applies for this session.
    }
    set({ theme });
  },
}));
