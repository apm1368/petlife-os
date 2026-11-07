import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createEvent, fireEvent, screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { NextIntlClientProvider } from "next-intl";
import faMessages from "@/messages/fa.json";
import { MobileTabBar, PetContextControl, PrimaryNav } from "./MemberNavigation";
import { currentDestination, EXPLORE_GROUPS, PRIMARY_DESTINATIONS } from "./consumer-nav";

const routing = vi.hoisted(() => ({ pathname: "/fa/pets/p1/health/labs", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routing.push }), usePathname: () => routing.pathname }));
vi.mock("@/hooks/use-active-pet", () => ({
  useActivePet: () => ({ pets: [{ id: "p1", name: "Luna", photoUrl: null }], activePetId: "p1", switchActivePet: vi.fn() }),
}));

function mouseOver(element: HTMLElement) {
  const event = createEvent.pointerOver(element);
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  fireEvent(element, event);
}

beforeEach(() => {
  routing.pathname = "/fa/pets/p1/health/labs";
  routing.push.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("member navigation", () => {
  it("hides the current pet's health destination when access is denied", () => {
    renderWithIntl(<PrimaryNav canViewHealth={false} />, "fa");
    expect(screen.queryByRole("link", { name: "سلامت" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "کاوش" }));
    const links = screen.getAllByRole("link").map(link => link.getAttribute("href"));
    expect(links).not.toContain("/fa/pets/active?view=health");
    expect(links).toContain("/fa/vet/find");
  });

  it("has the six primary destinations; deep pages keep their section current", () => {
    expect(PRIMARY_DESTINATIONS.map((d) => d.key)).toEqual(["home", "explore", "health", "services", "shop", "memories"]);
    expect(currentDestination("/pets/p1/health/labs/x")).toBe("health");
    expect(currentDestination("/pets/p1/memories")).toBe("memories");
    expect(currentDestination("/checkout/c1/confirmation")).toBe("shop");
    expect(currentDestination("/travel/trips")).toBe("explore");
    expect(currentDestination("/guides/first-puppy")).toBe("explore");
    expect(currentDestination("/pets/p1")).toBe("home");
    expect(currentDestination("/profile/security")).toBeNull();
  });

  it("every Explore link points somewhere real and no destination is listed twice in a group", () => {
    for (const group of EXPLORE_GROUPS) {
      const hrefs = group.links.map((l) => l.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      for (const href of hrefs) expect(href.startsWith("/")).toBe(true);
    }
  });

  it("ArrowDown opens the menu at its first destination; Escape closes it and restores the trigger", () => {
    renderWithIntl(<PrimaryNav />, "fa");
    expect(screen.getByRole("link", { name: "سلامت" }).getAttribute("aria-current")).toBe("page");
    const explore = screen.getByRole("button", { name: "کاوش" });
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    act(() => explore.focus());
    fireEvent.keyDown(explore, { key: "ArrowDown" });
    expect(explore.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /سفر و اقامت/ }).getAttribute("href")).toBe("/fa/travel");
    const destinations = screen.getByRole("navigation", { name: "بخش‌های opetlife" });
    expect(document.activeElement).toBe(within(destinations).getAllByRole("link")[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(explore);
  });

  it("leaves keyboard focus free to exit the menu and dismisses without stealing it back", () => {
    renderWithIntl(<><PrimaryNav /><button type="button">After navigation</button></>, "en");
    const explore = screen.getByRole("button", { name: "Explore" });
    fireEvent.keyDown(explore, { key: "ArrowDown" });
    const menu = screen.getByRole("navigation", { name: "opetlife destinations" });
    act(() => within(menu).getAllByRole("link").at(-1)!.focus());
    expect(explore.getAttribute("aria-expanded")).toBe("true");
    const after = screen.getByRole("button", { name: "After navigation" });
    // focus() models where the browser sends Tab after the final link.
    act(() => after.focus());
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(after);
  });

  it("dismisses on outside pointer interaction and when another primary link receives focus", () => {
    renderWithIntl(<PrimaryNav />, "en");
    const explore = screen.getByRole("button", { name: "Explore" });
    fireEvent.click(explore);
    fireEvent.pointerDown(document.body);
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(explore);
    act(() => screen.getByRole("link", { name: "Dashboard" }).focus());
    expect(explore.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not reopen from a queued hover after Escape or route navigation", () => {
    vi.useFakeTimers();
    const { rerender } = renderWithIntl(<PrimaryNav />, "fa");
    const explore = screen.getByRole("button", { name: "کاوش" });
    fireEvent.click(explore);
    mouseOver(explore);
    fireEvent.keyDown(explore, { key: "Escape" });
    act(() => vi.advanceTimersByTime(300));
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    mouseOver(explore);
    routing.pathname = "/fa/services";
    // Re-render through the same provider so the route-change effect runs.
    rerender(<NextIntlClientProvider locale="fa" messages={faMessages}><PrimaryNav /></NextIntlClientProvider>);
    act(() => vi.advanceTimersByTime(300));
    expect(explore.getAttribute("aria-expanded")).toBe("false");
  });

  it("waits for mouse intent but does not open from a touch hover", () => {
    vi.useFakeTimers();
    renderWithIntl(<PrimaryNav />, "en");
    const explore = screen.getByRole("button", { name: "Explore" });
    fireEvent.pointerOver(explore, { pointerType: "touch" });
    act(() => vi.advanceTimersByTime(300));
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    mouseOver(explore);
    expect(explore.getAttribute("aria-expanded")).toBe("false");
    act(() => vi.advanceTimersByTime(100));
    expect(explore.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the pet disclosure keyboard-dismissible and closes after focus leaves", () => {
    renderWithIntl(<><PetContextControl /><button type="button">Next control</button></>, "en");
    const trigger = screen.getByRole("button", { name: "Active pet: Luna" });
    fireEvent.click(trigger);
    act(() => screen.getByRole("link", { name: "Luna's profile" }).focus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    act(() => screen.getByRole("button", { name: "Next control" }).focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it.each([
    ["de", "Entdecken", "Pflege", "Reisen und Unterkünfte", "/de/travel"],
    ["es", "Explorar", "Cuidados", "Viajes y alojamientos", "/es/travel"],
  ] as const)("renders localized desktop destinations and Explore links for %s", (locale, exploreLabel, careLabel, travelLabel, travelHref) => {
    routing.pathname = `/${locale}/home`;
    renderWithIntl(<PrimaryNav />, locale);
    expect(screen.getByRole("link", { name: locale === "de" ? "Übersicht" : "Inicio" }).getAttribute("href")).toBe(`/${locale}/home`);
    fireEvent.click(screen.getByRole("button", { name: exploreLabel }));
    expect(screen.getByRole("heading", { name: careLabel })).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(travelLabel) }).getAttribute("href")).toBe(travelHref);
    expect(screen.queryByRole("link", { name: "Travel and stays" })).toBeNull();
  });

  it.each(["fa", "en", "de", "es"] as const)("keeps language, appearance, support and current guides reachable in the %s mobile sheet", (locale) => {
    routing.pathname = `/${locale}/home`;
    renderWithIntl(<MobileTabBar />, locale);
    const labels = {
      fa: { home: "داشبورد", explore: "کاوش", preferences: "زبان و ظاهر", language: "زبان", german: "آلمانی", help: "کمک و پشتیبانی", guides: /راهنماها راهنمای عملی/ },
      en: { home: "Dashboard", explore: "Explore", preferences: "Language and appearance", language: "Language", german: "German", help: "Help and support", guides: /Guides Practical/ },
      de: { home: "Übersicht", explore: "Entdecken", preferences: "Sprache und Darstellung", language: "Sprache", german: "Deutsch", help: "Hilfe und Support", guides: /Ratgeber Praktische Pflegehinweise/ },
      es: { home: "Inicio", explore: "Explorar", preferences: "Idioma y apariencia", language: "Idioma", german: "alemán", help: "Ayuda y soporte", guides: /Guías Consejos prácticos/ },
    }[locale];
    expect(screen.getByRole("link", { name: labels.home }).getAttribute("href")).toBe(`/${locale}/home`);
    const trigger = screen.getByRole("button", { name: labels.explore });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: labels.explore });
    expect(within(dialog).getByRole("group", { name: labels.preferences })).toBeTruthy();
    const language = within(dialog).getByRole("combobox", { name: labels.language });
    expect((language as HTMLSelectElement).value).toBe(locale);
    expect(within(language).getByRole("option", { name: labels.german })).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: labels.help }).getAttribute("href")).toBe(`/${locale}/support`);
    fireEvent.click(within(dialog).getByRole("button", { name: labels.guides }));
    expect(routing.push).toHaveBeenCalledWith(`/${locale}/guides`);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
