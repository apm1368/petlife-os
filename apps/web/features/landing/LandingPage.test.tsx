import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import RootPage from "@/app/[locale]/(public)/page";
import AuthPage from "@/app/[locale]/(auth)/auth/page";
import { landingCopy } from "./copy";
import { cameraAt, cameraStops, nearestStop, wheelProgress } from "./camera";
import { consumeLandingIntent, rememberLandingIntent } from "./intent";
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
    expect(screen.getByRole("link", { name: copy.start }).getAttribute("href")).toBe(`/${locale}/auth`);
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
    expect(consumeLandingIntent("en")).toBe("/en/shop?landingPet=cookie&landingAction=shop");
    fireEvent.keyDown(document.querySelector(".spatial-landing")!, { key: "Escape" });
    await waitFor(() =>
      expect(document.querySelector(".spatial-landing")?.getAttribute("data-state")).toBe("overview"),
    );
  });
  it.each(["fa", "en"] as const)("preserves existing %s email/phone auth", (locale) => {
    renderWithIntl(<AuthPage />, locale);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!);
    expect(push).toHaveBeenLastCalledWith(`/${locale}/account?method=email`);
    fireEvent.click(buttons[1]!);
    expect(push).toHaveBeenLastCalledWith(`/${locale}/account?method=phone`);
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
  it("consumes a local destination once and rejects prototype or external routes", () => {
    rememberLandingIntent("vet");
    expect(consumeLandingIntent("fa")).toBe("/fa/vet/find?landingPet=cookie&landingAction=vet");
    expect(consumeLandingIntent("fa")).toBeNull();
    for (const action of ["toString", "__proto__", "https://evil.example"]) {
      rememberLandingIntent(action);
      expect(consumeLandingIntent("fa")).toBeNull();
    }
  });
  it("rejects stale or malformed saved intent", () => {
    sessionStorage.setItem(
      "petlife-landing-intent",
      JSON.stringify({ action: "shop", pet: "cookie", at: Date.now() - 1800001 }),
    );
    expect(consumeLandingIntent("en")).toBeNull();
    sessionStorage.setItem("petlife-landing-intent", "null");
    expect(consumeLandingIntent("en")).toBeNull();
  });
});
