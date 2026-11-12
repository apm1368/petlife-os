import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useThemeStore } from "@/stores/theme-store";
import { LanguageToggle } from "./LanguageToggle";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/fa/shop/products", useRouter: () => ({ push }) }));

describe("LanguageToggle", () => {
  it("offers all locales and switches only the locale segment", () => {
    useThemeStore.getState().setTheme("DARK");
    window.history.replaceState(null, "", "/fa/shop/products?category=toys");
    renderWithIntl(<LanguageToggle />, "fa");
    const toggle = screen.getByRole("combobox", { name: "زبان" });
    expect(screen.getByRole("option", { name: "آلمانی (آزمایشی)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "انگلیسی" })).toBeTruthy();
    fireEvent.change(toggle, { target: { value: "de" } });
    expect(push).toHaveBeenCalledWith("/de/shop/products?category=toys");
    expect(useThemeStore.getState().theme).toBe("DARK");
  });
});

describe("LanguageToggle on an English page", () => {
  it("names the available locales in English", () => {
    renderWithIntl(<LanguageToggle />, "en");
    const toggle = screen.getByRole("combobox", { name: "Language" });
    expect(toggle.textContent).toContain("German");
    expect(toggle.textContent).toContain("Spanish");
  });
});

describe("German and Spanish are marked beta (market-readiness Q8)", () => {
  it.each([
    ["en", ["English", "Persian", "German (beta)", "Spanish (beta)"]],
    ["de", ["Deutsch (Beta)", "Spanisch (Beta)", "Englisch"]],
    ["es", ["español (beta)", "alemán (beta)", "inglés"]],
  ] as const)("on a %s page", (locale, names) => {
    renderWithIntl(<LanguageToggle />, locale);
    for (const name of names) expect(screen.getByRole("option", { name })).toBeTruthy();
  });
});
