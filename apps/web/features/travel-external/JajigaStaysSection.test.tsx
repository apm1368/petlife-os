import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { externalStay } from "@/test/fixtures/external-stay";
import { travelExternalService } from "@/services/travel-external.service";
import { JajigaStaysSection } from "./JajigaStaysSection";

vi.mock("@/services/travel-external.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/travel-external.service")>();
  return { ...actual, travelExternalService: { ...actual.travelExternalService, search: vi.fn() } };
});

const jajigaStay = { ...externalStay, id: "jj1", title: "ویلای جنگلی", source: { ...externalStay.source, code: "JAJIGA", nameFa: "جاجیگا", nameEn: "Jajiga" } };

describe("JajigaStaysSection", () => {
  beforeEach(() => {
    vi.mocked(travelExternalService.search).mockReset().mockResolvedValue({ items: [jajigaStay], total: 1, page: 1, pageSize: 6, context: null });
  });

  it("asks only for Jajiga stays and labels each card as coming from Jajiga, leaving through the logged redirect", async () => {
    renderWithIntl(<JajigaStaysSection city="تهران" context={{ checkIn: "2026-12-01", checkOut: "2026-12-03", pets: 1 }} seeAllHref="/fa/travel/search?source=jajiga" />, "fa");
    expect(await screen.findByText("ویلای جنگلی")).toBeTruthy();
    expect(travelExternalService.search).toHaveBeenCalledWith(expect.objectContaining({ source: "JAJIGA", city: "تهران", checkIn: "2026-12-01", checkOut: "2026-12-03", pets: 1, page: 1, pageSize: 6 }), expect.any(AbortSignal));
    expect(screen.getByText("از جاجیگا")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "اقامتگاه‌های پت‌پذیر تهران از جاجیگا" })).toBeTruthy();
    const out = screen.getByRole("link", { name: "مشاهده و بررسی در سایت منبع" });
    expect(out.getAttribute("href")).toContain("/travel/external/stays/jj1/out");
    expect(out.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "همهٔ اقامتگاه‌های جاجیگا" }).getAttribute("href")).toBe("/fa/travel/search?source=jajiga");
    // Click-out only: nothing here books.
    expect(screen.queryByRole("button", { name: /رزرو|book/i })).toBeNull();
  });

  it("labels the source in English, German and Spanish too", async () => {
    for (const [locale, label] of [["en", "From Jajiga"], ["de", "Von Jajiga"], ["es", "De Jajiga"]] as const) {
      const { unmount } = renderWithIntl(<JajigaStaysSection />, locale);
      expect(await screen.findByText(label)).toBeTruthy();
      unmount();
    }
  });

  it("disappears on the home page when Jajiga has nothing to show", async () => {
    vi.mocked(travelExternalService.search).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 6, context: null });
    const { container } = renderWithIntl(<JajigaStaysSection hideWhenEmpty />, "en");
    await waitFor(() => expect(travelExternalService.search).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
