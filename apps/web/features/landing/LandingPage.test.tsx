import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { routeExists } from "@/test/route-exists";
import RootPage from "@/app/[locale]/page";
import AuthPage from "@/app/[locale]/(auth)/auth/page";
import { fireEvent } from "@testing-library/react";
import { landingCopy } from "./copy";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  // The header only asks whether a session exists; an anonymous visitor gets 401.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 })));
});

describe("Public landing", () => {
  it.each(["fa", "en"] as const)("renders the %s story with one h1 and the Tehran scene", async (locale) => {
    const copy = landingCopy[locale];
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]!.textContent).toBe(copy.hero.title.replace("\n", ""));
    expect(screen.getByRole("img", { name: copy.hero.sceneLabel })).toBeTruthy();
    // Section order communicates the product story (§13): identity → health → services → travel → memories → community → providers → trust.
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([copy.identity.title, copy.health.title, copy.services.title, copy.travel.title, copy.memories.title, copy.community.title, copy.ecosystem.title, copy.trust.title, copy.final.title]);
    // The retired demo pet and vehicle never return.
    expect(document.body.textContent).not.toMatch(/Cookie|کوکی|Luna|لونا/);
    expect(document.querySelector(".taxi-motion, .spatial-landing")).toBeNull();
  });

  it.each(["fa", "en"] as const)("every %s landing link is a real localized route (no dead CTA)", async (locale) => {
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    expect(links.length).toBeGreaterThan(30);
    for (const link of links) {
      const href = link.getAttribute("href")!;
      if (href === "#lp-main") continue;
      expect(href, `${link.textContent} → ${href}`).toMatch(new RegExp(`^/(${locale}|${locale === "fa" ? "en" : "fa"})(/|$)`));
      expect(routeExists(href), `${link.textContent} → ${href}`).toBe(true);
    }
    for (const button of Array.from(document.querySelectorAll("button"))) expect(button.getAttribute("aria-label") ?? button.textContent).toBeTruthy();
  });

  it.each(["fa", "en"] as const)("primary %s CTAs go to sign-up, services, add pet and sign-in", async (locale) => {
    const copy = landingCopy[locale];
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);
    const hrefOf = (name: string) => screen.getAllByRole("link", { name }).map((a) => a.getAttribute("href"));
    expect(hrefOf(copy.hero.primary)).toContain(`/${locale}/register`);
    expect(hrefOf(copy.hero.secondary)).toContain(`/${locale}/services`);
    expect(hrefOf(copy.identity.cta)).toEqual([`/${locale}/pets/new`]);
    expect(hrefOf(copy.actions.signIn)).toContain(`/${locale}/auth`);
    expect(screen.getByRole("link", { name: copy.actions.languageLabel }).getAttribute("href")).toBe(`/${locale === "fa" ? "en" : "fa"}`);
  });

  it("copy for both locales has the same shape", () => {
    const shape = (v: unknown): unknown => (Array.isArray(v) ? v.map(shape) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
    expect(shape(landingCopy.fa)).toEqual(shape(landingCopy.en));
    expect(JSON.stringify(landingCopy.fa)).not.toMatch(/\b(Get started|Sign in|Services)\b/);
  });

  it.each(["fa", "en"] as const)("keeps phone-first auth and the email fallback for %s", (locale) => {
    renderWithIntl(<AuthPage />, locale);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!);
    expect(push).toHaveBeenLastCalledWith(`/${locale}/account?method=phone`);
    fireEvent.click(buttons[1]!);
    expect(push).toHaveBeenLastCalledWith(`/${locale}/account?method=email`);
  });

  it("rejects unsupported locales", async () => {
    await expect(RootPage({ params: Promise.resolve({ locale: "xx" }) })).rejects.toThrow("NOT_FOUND");
  });
});
