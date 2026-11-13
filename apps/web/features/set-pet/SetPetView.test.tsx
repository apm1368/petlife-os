import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { SetPetView } from "./SetPetView";
import { SetPetLandingSection } from "./SetPetLandingSection";

afterEach(() => useSessionStore.setState({ user: null, status: "idle" }));

describe("/set-pet and the landing section (owner, 2026-11-13)", () => {
  it("explains Set Pet first and asks a visitor to sign in before building", () => {
    useSessionStore.setState({ user: null, status: "unauthenticated" });
    renderWithIntl(<SetPetView locale="fa" />, "fa");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ست پت؛ لباس ست برای تو و حیوان خانگی‌ات");
    expect(screen.getByRole("heading", { name: "چطور کار می‌کند" })).toBeTruthy();
    expect(screen.getByText(/این یک درخواست سفارش است، نه خرید/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/welcome?returnTo=%2Ffa%2Fset-pet%23setpet-builder");
  });

  it.each(["en", "de", "es", "ar", "nl"] as const)("is translated in %s", (locale) => {
    useSessionStore.setState({ user: null, status: "unauthenticated" });
    renderWithIntl(<SetPetView locale={locale} />, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Set Pet/);
  });

  it("puts a Set Pet section on the landing page with the way in, and the shirts mockup until the reel is ready", () => {
    renderWithIntl(<SetPetLandingSection />, "en");
    expect(screen.getByRole("heading", { name: "Matching shirts for you and your pet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Design your Set Pet" }).getAttribute("href")).toBe("/en/set-pet");
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("T-shirt · M")).toBeTruthy();
  });
});
