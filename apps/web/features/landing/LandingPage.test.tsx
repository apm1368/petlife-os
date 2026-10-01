import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import RootPage from "@/app/[locale]/page";
import { DESTINATIONS, landingCopy } from "./copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/fa",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

beforeEach(() => vi.clearAllMocks());

describe("Landing — the Tehran city is the navigation", () => {
  it.each(["fa", "en"] as const)("%s: six buildings, each a real public destination, signed only in the page language", async (locale) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const copy = landingCopy[locale];
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(copy.title);
    const city = screen.getByRole("navigation", { name: copy.cityLabel });
    const links = within(city).getAllByRole("link");
    expect(links).toHaveLength(6);
    DESTINATIONS.forEach(({ key, href }, i) => {
      expect(links[i]!.getAttribute("href")).toBe(`/${locale}/${href}`);
      expect(links[i]!.textContent).toContain(copy.destinations[key][0]);
    });
    // Language purity: Persian signage carries no Latin words, English signage no Persian letters.
    const signage = links.map((l) => l.textContent ?? "").join(" ");
    if (locale === "fa") expect(signage).not.toMatch(/[A-Za-z]/);
    else expect(signage).not.toMatch(/[؀-ۿ]/);
    // The drawing is decorative; meaning lives in the links.
    expect(document.querySelector(".tehran-scene__art")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("link", { name: copy.start }).getAttribute("href")).toBe(`/${locale}/auth`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("raises the building whose sign is hovered or focused", async () => {
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale: "fa" }) }), "fa");
    const scene = document.querySelector(".tehran-scene")!;
    const shop = screen.getByRole("link", { name: new RegExp(landingCopy.fa.destinations.shop[0]) });
    fireEvent.focus(shop);
    expect(scene.getAttribute("data-active")).toBe("shop");
    fireEvent.blur(shop);
    expect(scene.getAttribute("data-active")).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("link", { name: new RegExp(landingCopy.fa.destinations.travel[0]) }));
    expect(scene.getAttribute("data-active")).toBe("travel");
  });

  it("switches language without touching anything else", async () => {
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale: "fa" }) }), "fa");
    const toEnglish = screen.getByRole("link", { name: landingCopy.fa.languageLabel });
    expect(toEnglish.getAttribute("href")).toBe("/en");
    expect(toEnglish.getAttribute("hreflang")).toBe("en");
    expect(toEnglish.textContent).toBe("انگلیسی");
  });

  it("rejects unsupported locales", async () => {
    await expect(RootPage({ params: Promise.resolve({ locale: "xx" }) })).rejects.toThrow("NOT_FOUND");
  });
});
