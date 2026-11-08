import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useThemeStore } from "@/stores/theme-store";
import { useDisplayModeStore } from "@/stores/display-mode-store";
import { DisplayModeToggle } from "./DisplayModeToggle";

describe("DisplayModeToggle", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "SYSTEM" });
    useDisplayModeStore.setState({ simple: false });
    localStorage.clear();
  });

  it("toggles in the current language without changing theme", () => {
    render(<DisplayModeToggle locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Simple display: off" }));
    expect(screen.getByRole("button", { name: "Simple display: on" }).getAttribute("aria-pressed")).toBe("true");
    expect(useThemeStore.getState().theme).toBe("SYSTEM");

    render(<DisplayModeToggle locale="fa" />);
    expect(screen.getByRole("button", { name: "نمایش ساده: روشن" }).getAttribute("aria-pressed")).toBe("true");
  });
});
