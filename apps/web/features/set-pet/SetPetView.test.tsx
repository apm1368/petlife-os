import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { SetPetView } from "./SetPetView";
import { SetPetLandingSection } from "./SetPetLandingSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => useSessionStore.setState({ user: null, status: "idle" }));

describe("/set-pet and the landing section (owner, 2026-11-13)", () => {
  it("explains Set Pet first and lets a visitor start building, with sign-in only to send", () => {
    useSessionStore.setState({ user: null, status: "unauthenticated" });
    renderWithIntl(<SetPetView locale="fa" />, "fa");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ست پت؛ لباس ست برای تو و حیوان خانگی‌ات");
    expect(screen.getByRole("heading", { name: "چطور کار می‌کند" })).toBeTruthy();
    expect(screen.getByText(/این یک درخواست سفارش است، نه خرید/)).toBeTruthy();
    expect(screen.getByText(/فقط برای ارسال درخواست وارد حسابت می‌شوی/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/welcome?returnTo=%2Ffa%2Fset-pet%23setpet-builder");
    expect(screen.getByRole("heading", { name: "تی‌شرت‌ها" })).toBeTruthy();
  });

  it.each(["en", "de", "es", "ar", "nl"] as const)("is translated in %s", (locale) => {
    useSessionStore.setState({ user: null, status: "unauthenticated" });
    renderWithIntl(<SetPetView locale={locale} />, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Set Pet/);
  });

  it("puts a Set Pet section on the landing page with the way in, and the shirts mockup until the reel is ready", () => {
    renderWithIntl(<SetPetLandingSection />, "en");
    expect(screen.getByRole("heading", { name: "Set Pet: matching outfits for you and your pet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Make a set for you and your pet" }).getAttribute("href")).toBe("/en/set-pet");
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("T-shirt · M")).toBeTruthy();
  });
});
