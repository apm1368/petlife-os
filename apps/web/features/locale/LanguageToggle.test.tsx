import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useThemeStore } from "@/stores/theme-store";
import { LanguageToggle } from "./LanguageToggle";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/fa/shop/products", useRouter: () => ({ push }) }));

describe("LanguageToggle", () => {
  it("names the other language in that language and switches only the locale segment", () => {
    useThemeStore.getState().setTheme("DARK");
    window.history.replaceState(null, "", "/fa/shop/products?category=toys");
    renderWithIntl(<LanguageToggle />, "fa");
    const toggle = screen.getByRole("button", { name: "تغییر زبان به انگلیسی" });
    expect(toggle.textContent).toBe("English");
    expect(toggle.getAttribute("lang")).toBe("en");
    fireEvent.click(toggle);
    expect(push).toHaveBeenCalledWith("/en/shop/products?category=toys");
    expect(useThemeStore.getState().theme).toBe("DARK");
  });
});
