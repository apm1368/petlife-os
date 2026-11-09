import { create } from "zustand";

export const DISPLAY_MODE_STORAGE_KEY = "petlife-display-mode";

interface DisplayModeState {
  simple: boolean;
  setSimple: (simple: boolean) => void;
}

function readInitialMode() {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(DISPLAY_MODE_STORAGE_KEY) === "simple";
  } catch {
    return false;
  }
}

export function applyDisplayModeToDocument(simple: boolean) {
  if (typeof document === "undefined") return;
  if (simple) document.documentElement.setAttribute("data-display-mode", "simple");
  else document.documentElement.removeAttribute("data-display-mode");
}

export const useDisplayModeStore = create<DisplayModeState>((set) => ({
  simple: readInitialMode(),
  setSimple: (simple) => {
    applyDisplayModeToDocument(simple);
    try {
      if (simple) localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, "simple");
      else localStorage.removeItem(DISPLAY_MODE_STORAGE_KEY);
    } catch {
      // The preference remains active for this session if browser storage is unavailable.
    }
    set({ simple });
  },
}));
