import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import faMessages from "@/messages/fa.json";
import enMessages from "@/messages/en.json";

// LandingView is a server component, so it reaches for next-intl's server
// entry point, which the jsdom test environment does not provide. The stub
// below is still driven by the real fa.json / en.json, so these tests assert
// against the shipped copy rather than invented fixtures.
let activeLocale: "fa" | "en" = "fa";
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: activeLocale,
      messages: activeLocale === "fa" ? faMessages : enMessages,
      namespace,
    }),
}));

const { LandingView } = await import("./LandingView");

/**
 * The landing page is what an anonymous visitor sees at `/fa`. Before it
 * existed, `/[locale]` redirected to the authenticated `/home`, so the first
 * screen of the product was the login form. These tests pin the fix: the
 * entry point must render real public destinations without a session.
 */
async function renderLanding(locale: "fa" | "en") {
  activeLocale = locale;
  // An async server component resolves to plain elements; render that output.
  return render(await LandingView({ locale }));
}

describe("LandingView", () => {
  it("greets an anonymous visitor with the product, not a login form", async () => {
    await renderLanding("fa");

    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    // The primary action browses; signing in is offered, never demanded.
    const loginLinks = screen.getAllByRole("link").filter((el) => el.getAttribute("href") === "/fa/welcome");
    expect(loginLinks).toHaveLength(1);
  });

  it("links only to routes that exist under the public group", async () => {
    await renderLanding("fa");

    const hrefs = screen
      .getAllByRole("link")
      .map((el) => el.getAttribute("href"))
      .filter((href): href is string => href !== null);

    // Every destination is locale-prefixed, so no link can escape the locale
    // segment and land on a 404.
    expect(hrefs.every((href) => href.startsWith("/fa/"))).toBe(true);

    for (const expected of ["/fa/vet/find", "/fa/shop", "/fa/lost-pets", "/fa/places", "/fa/insurance", "/fa/community"]) {
      expect(hrefs).toContain(expected);
    }
  });

  it("renders the same journey in English", async () => {
    await renderLanding("en");

    expect(within(screen.getByRole("heading", { level: 1 })).queryByText(/./)).not.toBeNull();
    const hrefs = screen.getAllByRole("link").map((el) => el.getAttribute("href"));
    expect(hrefs).toContain("/en/vet/find");
  });
});
