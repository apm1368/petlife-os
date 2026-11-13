import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ParkHeader } from "./ParkHeader";
import { ParkHero } from "./ParkHero";
import { ParkCredits } from "./ParkCredits";
import { parkDestinations } from "./park-copy";
import { storyCopy } from "./story-copy";
import { landingCopy } from "./copy";
import { routeExists } from "@/test/route-exists";
import { parkCopyFor } from "@/test/pattern-copy";

const state = vi.hoisted(() => ({ authenticated: false }));
vi.mock("@/hooks/use-session-bootstrap", () => ({ useSessionBootstrap: vi.fn() }));
vi.mock("@/stores/session-store", () => ({
  useSessionStore: (selector: (s: unknown) => unknown) => selector({
    status: state.authenticated ? "authenticated" : "unauthenticated",
    user: state.authenticated ? { id: "owner" } : null,
  }),
}));

beforeEach(() => { state.authenticated = false; });

describe("Approved park landing", () => {
  it.each(["fa", "en", "de", "es"] as const)("makes all eight %s pavilions real localized destinations", locale => {
    renderWithIntl(<ParkHero locale={locale} />, locale);
    const [pavilions, shortcuts] = screen.getAllByRole("navigation", { name: parkCopyFor(locale).destinationsLabel });
    for (const navigation of [pavilions!, shortcuts!]) {
      expect(within(navigation).getAllByRole("link")).toHaveLength(8);
      for (const service of parkDestinations) {
        const link = within(navigation).getByRole("link", { name: navigation === pavilions ? parkCopyFor(locale).services[service.key].title : `${parkCopyFor(locale).services[service.key].title} ${parkCopyFor(locale).services[service.key].hint}` });
        expect(link.getAttribute("href")).toBe(`/${locale}${service.href}`);
        expect(routeExists(link.getAttribute("href")!)).toBe(true);
      }
    }
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(parkCopyFor(locale).title);
    expect(screen.getByRole("img", { name: parkCopyFor(locale).imageAlt }).getAttribute("src")).toBe(
      locale === "fa" ? "/images/landing/tehran-park.webp" : "/images/landing/tehran-park-en.webp",
    );
  });

  it.each(["fa", "en"] as const)("opens and dismisses the %s mobile menu with Escape", locale => {
    renderWithIntl(<ParkHeader locale={locale} />, locale);
    const button = screen.getByRole("button", { name: landingCopy[locale].nav.menu });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const menu = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(menu.hidden).toBe(false);
    const firstLink = within(menu).getAllByRole("link")[0]!;
    firstLink.focus();
    fireEvent.keyDown(firstLink, { key: "Escape" });
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    const about = within(menu).getByRole("link", { name: parkCopyFor(locale).about });
    about.addEventListener("click", event => event.preventDefault());
    fireEvent.click(about);
    expect(menu.hidden).toBe(true);
  });

  it.each([
    ["fa", "زبان"], ["en", "Language"], ["de", "Sprache"], ["es", "Idioma"],
  ] as const)("offers all four language routes from the %s landing", (locale, label) => {
    renderWithIntl(<ParkHeader locale={locale} />, locale);
    const selector = screen.getByRole("combobox", { name: label }) as HTMLSelectElement;
    expect(selector.value).toBe(locale);
    expect(within(selector).getAllByRole("option").map(option => (option as HTMLOptionElement).value)).toEqual(["fa", "en", "de", "es"]);
  });

  it.each(["de", "es"] as const)("uses %s copy for all landing header actions", locale => {
    renderWithIntl(<ParkHeader locale={locale} />, locale);
    expect(screen.getByRole("link", { name: parkCopyFor(locale).signIn }).getAttribute("href")).toBe(`/${locale}/auth`);
    expect(screen.getByRole("navigation", { name: parkCopyFor(locale).navLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: parkCopyFor(locale).menuLabel })).toBeTruthy();
    const mobileNav = document.getElementById("park-mobile-nav")!;
    expect(mobileNav.querySelector(`a[href="/${locale}/register"]`)?.textContent).toBe(parkCopyFor(locale).memberJoin);
  });

  it("takes authenticated visitors to their dashboard and preserves the partner destination", () => {
    state.authenticated = true;
    renderWithIntl(<ParkHeader locale="fa" />, "fa");
    expect(screen.getByRole("link", { name: landingCopy.fa.actions.dashboard }).getAttribute("href")).toBe("/fa/home");
    expect(screen.getByRole("link", { name: parkCopyFor("fa").partnerSignIn }).getAttribute("href")).toBe("/fa/auth?returnTo=%2Ffa%2Fprovider");
  });

  it.each(["fa", "en"] as const)("discloses the generated %s park illustration's source", locale => {
    renderWithIntl(<ParkCredits locale={locale} />, locale);
    expect(screen.getByRole("heading", { name: parkCopyFor(locale).creditsTitle })).toBeTruthy();
    expect(screen.getByText(parkCopyFor(locale).creditsBody)).toBeTruthy();
  });

  it("keeps the story copy keys aligned", () => {
    const keys = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) =>
      typeof child === "object" && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    ).sort();
    expect(keys(storyCopy.en)).toEqual(keys(storyCopy.de));
    expect(keys(storyCopy.en)).toEqual(keys(storyCopy.es));
    // The 2026-11 pattern copy (park, landing, reels) is checked across all four catalogs in messages/pattern2026-locale-parity.test.ts.
  });
});

describe("Set Pet in the landing header (owner, 2026-11-13)", () => {
  it.each([["fa", "ست پت"], ["en", "Set Pet"], ["ar", "Set Pet"]] as const)("links the %s header to /set-pet", (locale, label) => {
    renderWithIntl(<ParkHeader locale={locale} />, locale);
    const hrefs = screen.getAllByRole("link", { name: label }).map((link) => link.getAttribute("href"));
    expect(hrefs).toContain(`/${locale}/set-pet`);
    expect(routeExists(`/${locale}/set-pet`)).toBe(true);
  });
});
