import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { PublicPrimaryNavigation } from "./PublicPrimaryNavigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/en/services" }));

describe("public primary navigation mobile sheet", () => {
  it("shows the language, theme and display controls only while the sheet is open", () => {
    // jsdom has no showModal; the sheet only needs it to exist.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    renderWithIntl(<PublicPrimaryNavigation menuExtra={<button type="button">prefs-probe</button>} />, "en");
    expect(screen.queryByText("prefs-probe")).toBeNull();
    const toggle = screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") === "false" && !b.getAttribute("aria-haspopup"));
    fireEvent.click(toggle!);
    expect(screen.getByText("prefs-probe")).toBeTruthy();
  });
});
