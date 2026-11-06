import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useThemeStore } from "@/stores/theme-store";
import { useDisplayModeStore } from "@/stores/display-mode-store";
import { DisplayModeToggle } from "./DisplayModeToggle";

let activeLocale = "en";
vi.mock("next-intl", () => ({ useLocale: () => activeLocale }));

describe("DisplayModeToggle", () => {
  beforeEach(() => {
    activeLocale = "en";
    useThemeStore.setState({ theme: "SYSTEM" });
    useDisplayModeStore.setState({ simple: false });
    localStorage.clear();
  });

  it("toggles in the current language without changing theme", () => {
    render(<DisplayModeToggle />);
    fireEvent.click(screen.getByRole("button", { name: "Simple display: off" }));
    expect(screen.getByRole("button", { name: "Simple display: on" }).getAttribute("aria-pressed")).toBe("true");
    expect(useThemeStore.getState().theme).toBe("SYSTEM");

    activeLocale = "fa";
    render(<DisplayModeToggle />);
    expect(screen.getByRole("button", { name: "نمایش ساده: روشن" }).getAttribute("aria-pressed")).toBe("true");
  });
});
