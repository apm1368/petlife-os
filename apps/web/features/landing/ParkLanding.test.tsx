import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ParkHeader } from "./ParkHeader";
import { ParkHero } from "./ParkHero";
import { ParkCredits } from "./ParkCredits";
import { parkCopy, parkDestinations } from "./park-copy";
import { landingCopy } from "./copy";
import { routeExists } from "@/test/route-exists";

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
  it.each(["fa", "en"] as const)("makes all eight %s pavilions real localized destinations", locale => {
    render(<ParkHero locale={locale} />);
    const [pavilions, shortcuts] = screen.getAllByRole("navigation", { name: parkCopy[locale].destinationsLabel });
    for (const navigation of [pavilions!, shortcuts!]) {
      expect(within(navigation).getAllByRole("link")).toHaveLength(8);
      for (const service of parkDestinations) {
        const link = within(navigation).getByRole("link", { name: navigation === pavilions ? parkCopy[locale].services[service.key].title : `${parkCopy[locale].services[service.key].title} ${parkCopy[locale].services[service.key].hint}` });
        expect(link.getAttribute("href")).toBe(`/${locale}${service.href}`);
        expect(routeExists(link.getAttribute("href")!)).toBe(true);
      }
    }
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(parkCopy[locale].title);
    expect(screen.getByRole("img", { name: parkCopy[locale].imageAlt }).getAttribute("src")).toBe(
      "/images/landing/tehran-park.webp",
    );
  });

  it.each(["fa", "en"] as const)("opens and dismisses the %s mobile menu with Escape", locale => {
    render(<ParkHeader locale={locale} />);
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
    const about = within(menu).getByRole("link", { name: parkCopy[locale].about });
    about.addEventListener("click", event => event.preventDefault());
    fireEvent.click(about);
    expect(menu.hidden).toBe(true);
  });

  it("takes authenticated visitors to their dashboard and preserves the partner destination", () => {
    state.authenticated = true;
    render(<ParkHeader locale="fa" />);
    expect(screen.getByRole("link", { name: landingCopy.fa.actions.dashboard }).getAttribute("href")).toBe("/fa/home");
    expect(screen.getByRole("link", { name: parkCopy.fa.partnerSignIn }).getAttribute("href")).toBe("/fa/auth?returnTo=%2Ffa%2Fprovider");
  });

  it.each(["fa", "en"] as const)("discloses the generated %s park illustration's source", locale => {
    render(<ParkCredits locale={locale} />);
    expect(screen.getByRole("heading", { name: parkCopy[locale].creditsTitle })).toBeTruthy();
    expect(screen.getByText(parkCopy[locale].creditsBody)).toBeTruthy();
  });

  it("keeps Persian and English copy keys aligned", () => {
    const keys = (value: object, prefix = ""): string[] => Object.entries(value).flatMap(([key, child]) =>
      typeof child === "object" && child !== null ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
    ).sort();
    expect(keys(parkCopy.fa)).toEqual(keys(parkCopy.en));
  });
});
