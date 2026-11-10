import { beforeEach, describe, expect, it, vi } from "vitest";
import { useThemeStore } from "./theme-store";
import { createElement } from "react";
import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";

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

  it("keeps the server hydration snapshot stable even with a saved dark theme", async () => {
    localStorage.setItem("petlife-theme", "DARK");
    vi.resetModules();
    const { useThemeStore: freshStore, restoreThemeFromStorage } = await import("./theme-store");
    expect(freshStore.getInitialState().theme).toBe("SYSTEM");
    expect(freshStore.getState().theme).toBe("SYSTEM");
    const container = document.createElement("div");
    container.innerHTML = "<button>SYSTEM</button>";
    const recoverable = vi.fn();
    function ThemeControl() {
      return createElement("button", null, freshStore((state) => state.theme));
    }
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, createElement(ThemeControl), { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(container.textContent).toBe("SYSTEM");
    await act(async () => restoreThemeFromStorage());
    expect(container.textContent).toBe("DARK");
    expect(freshStore.getState().theme).toBe("DARK");
    expect(freshStore.getInitialState().theme).toBe("SYSTEM");
    await act(async () => root!.unmount());
  });
});
