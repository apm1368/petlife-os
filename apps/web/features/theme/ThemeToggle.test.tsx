import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useThemeStore } from "@/stores/theme-store";
import { ThemeToggle } from "./ThemeToggle";

describe("theme control language and transitions", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: "SYSTEM" });
  });

  it.each([
    ["fa", "سیستم", "روشن", "تیره"],
    ["en", "System", "Light", "Dark"],
    ["de", "System", "Hell", "Dunkel"],
    ["es", "Sistema", "Claro", "Oscuro"],
  ] as const)("labels the complete theme cycle in %s without English fallback", (locale, system, light, dark) => {
    renderWithIntl(<ThemeToggle />, locale);
    fireEvent.click(screen.getByRole("button", { name: `${system} → ${light}` }));
    expect(useThemeStore.getState().theme).toBe("LIGHT");
    fireEvent.click(screen.getByRole("button", { name: `${light} → ${dark}` }));
    expect(useThemeStore.getState().theme).toBe("DARK");
    fireEvent.click(screen.getByRole("button", { name: `${dark} → ${system}` }));
    expect(useThemeStore.getState().theme).toBe("SYSTEM");
    expect(screen.getByRole("button", { name: `${system} → ${light}` })).toBeTruthy();
  });
});
