import { beforeEach, describe, expect, it } from "vitest";
import { useThemeStore } from "./theme-store";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("persists an explicit LIGHT/DARK choice to localStorage", () => {
    useThemeStore.getState().setTheme("DARK");
    expect(localStorage.getItem("petlife-theme")).toBe("DARK");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("clears the stored preference and the data-theme attribute for SYSTEM", () => {
    useThemeStore.getState().setTheme("LIGHT");
    useThemeStore.getState().setTheme("SYSTEM");
    expect(localStorage.getItem("petlife-theme")).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("updates the store's theme value", () => {
    useThemeStore.getState().setTheme("DARK");
    expect(useThemeStore.getState().theme).toBe("DARK");
  });
});
