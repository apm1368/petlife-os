import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { SetPetView } from "./SetPetView";
import { SetPetLandingSection } from "./SetPetLandingSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./SetPetBuilder", () => ({ SetPetBuilder: () => <div data-testid="builder" /> }));

afterEach(() => useSessionStore.setState({ user: null, status: "idle" }));

describe("/set-pet and the landing section (owner's #368 answers)", () => {
  it("explains Set Pet first — proof before payment, fixed prices — and lets a visitor build, signing in only to send", async () => {
    useSessionStore.setState({ user: null, status: "unauthenticated" });
    renderWithIntl(<SetPetView locale="fa" />, "fa");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ست پت: لباس ست تو و پتت");
    expect(screen.getByRole("heading", { name: "چطور کار می‌کند" })).toBeTruthy();
    expect(screen.getByText("نمونهٔ چاپ را بگیر")).toBeTruthy();
    expect(screen.getByText("قیمت ثابت")).toBeTruthy();
    expect(screen.getByRole("link", { name: "ورود" }).getAttribute("href")).toBe("/fa/welcome?returnTo=%2Ffa%2Fset-pet%23setpet-builder");
    expect(await screen.findByTestId("builder")).toBeTruthy();
    // Persian copy uses Persian digits.
    expect(screen.getAllByText(/حدود ۵ روز کاری/).length).toBeGreaterThan(0);
  });

  it.each(["en", "de", "es", "ar", "nl"] as const)("is translated in %s", (locale) => {
    useSessionStore.setState({ user: null, status: "unauthenticated" });
    renderWithIntl(<SetPetView locale={locale} />, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Set Pet/);
  });

  it("puts a Set Pet section on the landing page with the owner's CTA, and the mockup until the reel is ready", () => {
    renderWithIntl(<SetPetLandingSection />, "fa");
    expect(screen.getByRole("link", { name: "ست خودت و پتت را بساز" }).getAttribute("href")).toBe("/fa/set-pet");
    expect(document.querySelector("video")).toBeNull();
    expect(screen.getByText("تی‌شرت، M")).toBeTruthy();
  });
});
