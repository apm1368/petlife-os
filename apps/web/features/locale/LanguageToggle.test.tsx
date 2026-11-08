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
    expect(screen.getByRole("option", { name: "آلمانی" })).toBeTruthy();
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
