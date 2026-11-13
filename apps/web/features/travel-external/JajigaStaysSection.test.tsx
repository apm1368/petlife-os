import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { externalStay } from "@/test/fixtures/external-stay";
import { travelExternalService, type ExternalStay } from "@/services/travel-external.service";
import { JajigaStaysSection } from "./JajigaStaysSection";

const params = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => "/fa/travel", useSearchParams: () => params }));
vi.mock("@/services/travel-external.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/travel-external.service")>();
  return { ...actual, travelExternalService: { ...actual.travelExternalService, search: vi.fn(), facets: vi.fn() } };
});

const jajigaSource = { ...externalStay.source, code: "JAJIGA", nameFa: "جاجیگا", nameEn: "Jajiga" };
function stay(i: number, extra: Partial<ExternalStay> = {}): ExternalStay {
  return {
    ...externalStay,
    id: `jj${i}`,
    title: `ویلای جنگلی ${i}`,
    city: "رشت",
    province: "گیلان",
    stayType: null,
    capacity: 6,
    bedrooms: 2,
    price: { state: "DATES_REQUIRED", freshness: "UNKNOWN" },
    fromPrice: { priceType: "FROM_PRICE", priceIrr: 25_000_000, currency: "IRR", priceBasis: "PER_NIGHT", observedAt: "2026-11-13T06:00:00Z", freshness: "FRESH" },
    pet: { ...externalStay.pet, policyStatus: "CONFIRMED_ALLOWED", accepted: true },
    source: jajigaSource,
    ...extra,
  };
}
const page = (items: ExternalStay[], total: number, p = 1) => ({ items, total, page: p, pageSize: 20, context: null });

describe("JajigaStaysSection", () => {
  beforeEach(() => {
    for (const key of Array.from(params.keys())) params.delete(key);
    replace.mockReset();
    vi.mocked(travelExternalService.facets).mockReset().mockResolvedValue({
      provinces: [{ name: "گیلان", count: 21 }, { name: "مازندران", count: 9 }],
      cities: [{ name: "رشت", province: "گیلان", count: 12 }, { name: "چالوس", province: "مازندران", count: 9 }, { name: "فومن", province: "گیلان", count: 9 }],
    });
    vi.mocked(travelExternalService.search).mockReset().mockResolvedValue(page([stay(1)], 1));
  });

  it("lists Jajiga stays 20 at a time under a small source chip, facts only, leaving through the logged redirect", async () => {
    renderWithIntl(<JajigaStaysSection city="رشت" context={{ checkIn: "2026-12-01", checkOut: "2026-12-03", pets: 1 }} />, "fa");
    expect(await screen.findByText("ویلای جنگلی 1")).toBeTruthy();
    expect(travelExternalService.search).toHaveBeenCalledWith(expect.objectContaining({ source: "JAJIGA", city: "رشت", checkIn: "2026-12-01", checkOut: "2026-12-03", pets: 1, page: 1, pageSize: 20 }), expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "اقامتگاه‌های پت‌پذیر بیشتر" })).toBeTruthy();
    expect(screen.getByText("اقامتگاه‌های جاجیگا")).toBeTruthy();
    const tile = screen.getByRole("article");
    expect(within(tile).getByText("از جاجیگا")).toBeTruthy();
    // No picture from the source: a designed placeholder for the kind of stay.
    expect(within(tile).queryByRole("img")).toBeNull();
    expect(within(tile).getByText("ویلا")).toBeTruthy();
    expect(within(tile).getByText("رشت، گیلان")).toBeTruthy();
    expect(within(tile).getByText(/تا ۶ نفر/)).toBeTruthy();
    expect(within(tile).getByText(/۲ اتاق خواب/)).toBeTruthy();
    expect(within(tile).getByText(/شروع قیمت: ۲٬۵۰۰٬۰۰۰ تومان هر شب/)).toBeTruthy();
    expect(within(tile).getByText("پذیرش پت طبق شرایط تأییدشده منبع")).toBeTruthy();
    const out = within(tile).getByRole("link", { name: "مشاهده در جاجیگا" });
    expect(out.getAttribute("href")).toContain("/travel/external/stays/jj1/out");
    expect(out.getAttribute("href")).toContain("checkIn=2026-12-01");
    expect(out.getAttribute("target")).toBe("_blank");
    // Click-out only: nothing here books.
    expect(screen.queryByRole("button", { name: /رزرو|book/i })).toBeNull();
  });

  it("loads the next 20 with \"load more\" and appends them", async () => {
    vi.mocked(travelExternalService.search)
      .mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, i) => stay(i + 1)), 23))
      .mockResolvedValueOnce(page([stay(21), stay(22), stay(23)], 23, 2));
    renderWithIntl(<JajigaStaysSection />, "en");
    expect(await screen.findByText("ویلای جنگلی 20")).toBeTruthy();
    expect(screen.getByText("Found: 23")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show more (20 of 23)" }));
    expect(await screen.findByText("ویلای جنگلی 23")).toBeTruthy();
    expect(travelExternalService.search).toHaveBeenLastCalledWith(expect.objectContaining({ source: "JAJIGA", page: 2, pageSize: 20 }));
    expect(screen.getAllByRole("article")).toHaveLength(23);
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  });

  it("filters by province (from the places listings actually have), then by a city of that province, and keeps it in the URL", async () => {
    renderWithIntl(<JajigaStaysSection />, "fa");
    await screen.findByText("ویلای جنگلی 1");
    await waitFor(() => expect(screen.getByRole("option", { name: "مازندران (۹)" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("استان"), { target: { value: "گیلان" } });
    await waitFor(() => expect(travelExternalService.search).toHaveBeenLastCalledWith(expect.objectContaining({ province: "گیلان", city: undefined, page: 1 }), expect.any(AbortSignal)));
    expect(replace).toHaveBeenLastCalledWith(`/fa/travel?jprovince=${encodeURIComponent("گیلان")}`, { scroll: false });
    const city = screen.getByLabelText("شهر");
    expect(within(city).queryByRole("option", { name: /چالوس/ })).toBeNull();
    expect(within(city).getByRole("option", { name: "فومن (۹)" })).toBeTruthy();
    fireEvent.change(city, { target: { value: "فومن" } });
    await waitFor(() => expect(travelExternalService.search).toHaveBeenLastCalledWith(expect.objectContaining({ province: "گیلان", city: "فومن" }), expect.any(AbortSignal)));
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining(`jcity=${encodeURIComponent("فومن")}`), { scroll: false });
  });

  it("reads its filters from the URL, and waits for the facets before using a province", async () => {
    params.set("jprovince", "گیلان");
    params.set("jguests", "6");
    params.set("jprice", "2");
    renderWithIntl(<JajigaStaysSection context={{ checkIn: "2026-12-01", checkOut: "2026-12-03" }} />, "en");
    await screen.findByText("ویلای جنگلی 1");
    expect(travelExternalService.search).toHaveBeenCalledTimes(1);
    const call = vi.mocked(travelExternalService.search).mock.calls[0]![0];
    expect(call).toMatchObject({ province: "گیلان", guests: 6, minPrice: 20_000_000, maxPrice: 50_000_000 });
    // A price band is about the nightly "from" price, so it is not tied to the dates.
    expect(call.checkIn).toBeUndefined();
    expect((screen.getByLabelText("Price per night") as HTMLSelectElement).value).toBe("2");
  });

  it("drops a province from the URL that no listing has, instead of failing", async () => {
    params.set("jprovince", "ناکجا");
    renderWithIntl(<JajigaStaysSection />, "en");
    await screen.findByText("ویلای جنگلی 1");
    expect(travelExternalService.search).toHaveBeenCalledWith(expect.objectContaining({ province: undefined }), expect.any(AbortSignal));
  });

  it("shows a picture and description only when the source sends them (a licensed feed)", async () => {
    vi.mocked(travelExternalService.search).mockResolvedValue(page([stay(1, { images: ["https://cdn.example/licensed.jpg"], descriptionSummary: "خلاصهٔ مجاز" })], 1));
    renderWithIntl(<JajigaStaysSection />, "fa");
    expect(await screen.findByText("خلاصهٔ مجاز")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://cdn.example/licensed.jpg");
  });

  it("labels the source in every language", async () => {
    for (const [locale, chip, out] of [
      ["en", "Jajiga stays", "View on Jajiga"],
      ["de", "Unterkünfte von Jajiga", "Auf Jajiga ansehen"],
      ["es", "Alojamientos de Jajiga", "Ver en Jajiga"],
      ["ar", "أماكن إقامة Jajiga", "عرض على Jajiga"],
      ["nl", "Verblijven van Jajiga", "Bekijk op Jajiga"],
    ] as const) {
      const { unmount } = renderWithIntl(<JajigaStaysSection />, locale);
      expect(await screen.findByText(chip)).toBeTruthy();
      expect(await screen.findByRole("link", { name: out })).toBeTruthy();
      unmount();
    }
  });

  it("disappears on the home page when Jajiga has nothing to show", async () => {
    vi.mocked(travelExternalService.search).mockResolvedValue(page([], 0));
    const { container } = renderWithIntl(<JajigaStaysSection hideWhenEmpty />, "en");
    await waitFor(() => expect(travelExternalService.search).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
