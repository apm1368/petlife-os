import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { routeExists } from "@/test/route-exists";
import RootPage from "@/app/[locale]/page";
import AuthPage from "@/app/[locale]/(auth)/auth/page";
import credits from "./photo-credits.json";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 })));
});

const PUBLIC = join(__dirname, "..", "..", "public");

describe("Public landing", () => {
  it.each(["fa", "en"] as const)("renders the %s landing with one h1, Cookie as the example and real photos only", async (locale) => {
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.body.textContent).toMatch(locale === "fa" ? /کوکی/ : /Cookie/);
    const images = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src")!);
    expect(images.length).toBeGreaterThan(6);
    for (const src of images) {
      expect(src, src).toMatch(/\.(webp|jpe?g|png)$/); // photographs, never vector illustrations
      expect(existsSync(join(PUBLIC, src)), src).toBe(true);
    }
    // No invented promotions: no discount codes or percentages.
    expect(document.body.textContent).not.toMatch(/٪ تخفیف|% off|code [A-Z]{4,}/i);
  });

  it.each(["fa", "en"] as const)("every %s landing link is a real localized route (no dead CTA)", async (locale) => {
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    expect(links.length).toBeGreaterThan(25);
    for (const link of links) {
      const href = link.getAttribute("href")!;
      if (href === "#lp-main") continue;
      expect(href, `${link.textContent} → ${href}`).toMatch(/^\/(fa|en)(\/|$)/);
      expect(routeExists(href), `${link.textContent} → ${href}`).toBe(true);
    }
  });

  it("credits every third-party photo it publishes", () => {
    for (const c of credits as { file: string; license: string; page: string }[]) {
      expect(existsSync(join(PUBLIC, c.file)), c.file).toBe(true);
      expect(c.license).toBeTruthy();
      expect(c.page).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
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
