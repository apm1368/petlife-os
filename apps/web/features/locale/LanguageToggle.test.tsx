import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useThemeStore } from "@/stores/theme-store";
import { LanguageToggle } from "./LanguageToggle";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/fa/shop/products", useRouter: () => ({ push }) }));

describe("LanguageToggle", () => {
  it("names the other language in the page's own language and switches only the locale segment", () => {
    useThemeStore.getState().setTheme("DARK");
    window.history.replaceState(null, "", "/fa/shop/products?category=toys");
    renderWithIntl(<LanguageToggle />, "fa");
    const toggle = screen.getByRole("button", { name: "تغییر زبان به انگلیسی" });
    // Visible UI stays Persian on a Persian page — no Latin text.
    expect(toggle.textContent).toBe("انگلیسی");
    expect(toggle.textContent).not.toMatch(/[A-Za-z]/);
    fireEvent.click(toggle);
    expect(push).toHaveBeenCalledWith("/en/shop/products?category=toys");
    expect(useThemeStore.getState().theme).toBe("DARK");
  });
});

describe("LanguageToggle on an English page", () => {
  it("says Persian in English — no Persian script in English UI", () => {
    renderWithIntl(<LanguageToggle />, "en");
    const toggle = screen.getByRole("button", { name: "Switch language to Persian" });
    expect(toggle.textContent).toBe("Persian");
    expect(toggle.textContent).not.toMatch(/[؀-ۿ]/);
  });
});
