import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useDisplayModeStore } from "@/stores/display-mode-store";
import { DisplayModeSync } from "./DisplayModeSync";

let pathname = "/fa/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("DisplayModeSync", () => {
  it("reapplies the local setting after route or locale navigation", () => {
    useDisplayModeStore.setState({ simple: true });
    const { rerender } = render(<DisplayModeSync />);
    expect(document.documentElement.getAttribute("data-display-mode")).toBe("simple");
    document.documentElement.removeAttribute("data-display-mode");
    pathname = "/en/home";
    rerender(<DisplayModeSync />);
    expect(document.documentElement.getAttribute("data-display-mode")).toBe("simple");
    expect(useDisplayModeStore.getState().simple).toBe(true);
  });
});
