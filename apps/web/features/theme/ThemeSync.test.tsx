import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useThemeStore } from "@/stores/theme-store";
import { ThemeSync } from "./ThemeSync";

let pathname = "/fa/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("ThemeSync", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: "SYSTEM" });
  });

  it("restores a saved preference after hydration without changing language", () => {
    localStorage.setItem("petlife-theme", "DARK");
    document.documentElement.lang = "de";
    render(<ThemeSync />);
    expect(useThemeStore.getState().theme).toBe("DARK");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.lang).toBe("de");
  });
  it("re-applies the chosen theme after a locale switch re-renders <html>", () => {
    useThemeStore.getState().setTheme("DARK");
    const { rerender } = render(<ThemeSync />);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    // The other locale's layout renders a fresh <html> without the attribute…
    document.documentElement.removeAttribute("data-theme");
    pathname = "/en/home";
    rerender(<ThemeSync />);
    // …and the theme comes back without touching the locale.
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(useThemeStore.getState().theme).toBe("DARK");
  });
});
