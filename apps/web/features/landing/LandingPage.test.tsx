import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import RootPage from "@/app/[locale]/page";

import { landingCopy } from "./copy";
import { cameraAt, cameraStops, nearestStop, wheelProgress } from "./camera";
import { landingDestination } from "./destination";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/en",
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => window.setTimeout(() => fn(0), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});
describe("Public spatial landing", () => {
  it.each(["fa", "en"] as const)("renders %s without domain requests", async (locale) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const copy = landingCopy[locale];
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale }) }), locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(copy.contexts[0]![1]);
    expect(screen.getByRole("link", { name: copy.start }).getAttribute("href")).toBe(`/${locale}/welcome`);
    expect(document.querySelectorAll(".persistent-world")).toHaveLength(1);
    expect(document.querySelectorAll(".context-copy")).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/Luna|لونا/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it("changes camera context without routing; keyboard returns to overview", async () => {
    renderWithIntl(await RootPage({ params: Promise.resolve({ locale: "en" }) }));
    fireEvent.change(screen.getByRole("combobox", { name: landingCopy.en.destinations }), {
      target: { value: "5" },
    });
    await waitFor(() =>
      expect(document.querySelector(".spatial-landing")?.getAttribute("data-state")).toBe("shop"),
    );
    expect(push).not.toHaveBeenCalled();
    const cta = screen.getByRole("link", { name: landingCopy.en.contexts[5]![3] });
    cta.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(cta);
    expect(cta.getAttribute("href")).toBe("/en/shop");
    fireEvent.keyDown(document.querySelector(".spatial-landing")!, { key: "Escape" });
    await waitFor(() =>
      expect(document.querySelector(".spatial-landing")?.getAttribute("data-state")).toBe("overview"),
    );
  });
  it("rejects unsupported locales", async () => {
    await expect(RootPage({ params: Promise.resolve({ locale: "xx" }) })).rejects.toThrow("NOT_FOUND");
  });
});
describe("Camera and intent boundaries", () => {
  it("bounds progress and wheel deltas", () => {
    expect(cameraAt(-10)).toEqual(cameraAt(0));
    expect(cameraAt(10)).toEqual(cameraAt(1));
    expect(nearestStop(100)).toBe(cameraStops.length - 1);
    expect(wheelProgress(99999, 0)).toBeCloseTo(0.06);
    expect(wheelProgress(-99999, 2)).toBeCloseTo(-0.06);
    expect(nearestStop(wheelProgress(100, 0))).toBe(1);
  });
  it("keeps discovery public and sends private actions to the existing pet gate", () => {
    for (const locale of ["fa", "en"] as const) {
      expect(landingDestination(locale, "shop")).toBe(`/${locale}/shop`);
      expect(landingDestination(locale, "vet")).toBe(`/${locale}/vet/find`);
      expect(landingDestination(locale, "care")).toBe(`/${locale}/services`);
      expect(landingDestination(locale, "health")).toBe(`/${locale}/pets/active?view=health`);
      expect(landingDestination(locale, "https://evil.example")).toBe(`/${locale}/welcome`);
    }
  });
});
