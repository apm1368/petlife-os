import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { AccountNav } from "./AccountNav";

let pathname = "/en/profile/security";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AccountNav", () => {
  it("links every canonical account section and marks the active English route", () => {
    renderWithIntl(<AccountNav />, "en");
    const nav = screen.getByRole("navigation", { name: "Account settings" });
    expect(nav.querySelectorAll("a")).toHaveLength(8);
    expect(screen.getByRole("link", { name: /^Security/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /^Household & access/ }).getAttribute("href")).toBe("/en/profile/household");
    expect(screen.getByRole("link", { name: /^Membership/ }).getAttribute("href")).toBe("/en/profile/membership");
    // Section pages offer a way back to the settings index (shown on mobile).
    expect(screen.getByRole("link", { name: /Account$/ }).getAttribute("href")).toBe("/en/profile");
  });

  it("uses Persian labels and preserves RTL route structure", () => {
    pathname = "/fa/profile/household";
    renderWithIntl(<AccountNav />, "fa");
    expect(screen.getByRole("navigation", { name: "مدیریت حساب" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^خانواده و دسترسی/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "نمای کلی" }).getAttribute("href")).toBe("/fa/profile");
  });
});
