import { beforeEach, describe, expect, it } from "vitest";
import { applyDisplayModeToDocument, DISPLAY_MODE_STORAGE_KEY, useDisplayModeStore } from "./display-mode-store";

describe("display mode preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-display-mode");
    useDisplayModeStore.setState({ simple: false });
  });

  it("persists locally and removes the setting when switched off", () => {
    useDisplayModeStore.getState().setSimple(true);
    expect(localStorage.getItem(DISPLAY_MODE_STORAGE_KEY)).toBe("simple");
    expect(document.documentElement.getAttribute("data-display-mode")).toBe("simple");

    useDisplayModeStore.getState().setSimple(false);
    expect(localStorage.getItem(DISPLAY_MODE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-display-mode")).toBe(false);
  });

  it("does not change the theme or locale when applied", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.lang = "fa";
    applyDisplayModeToDocument(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.lang).toBe("fa");
  });
});
