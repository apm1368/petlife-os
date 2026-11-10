import { create } from "zustand";
import type { ThemePreference } from "@petlife/types";

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

const STORAGE_KEY = "petlife-theme";

export function applyThemeToDocument(theme: ThemePreference) {
  if (typeof document === "undefined") return;
  if (theme === "SYSTEM") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme.toLowerCase());
  }
}

function readInitialTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "SYSTEM";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "LIGHT" || stored === "DARK" ? stored : "SYSTEM";
  } catch {
    return "SYSTEM";
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  // The hydration snapshot must match SSR. The head script paints the saved
  // theme immediately; ThemeSync restores the interactive state after hydration.
  theme: "SYSTEM",
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

export function restoreThemeFromStorage() {
  useThemeStore.setState({ theme: readInitialTheme() });
}
