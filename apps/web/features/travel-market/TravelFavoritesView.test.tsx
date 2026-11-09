import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { TravelSearchResultItemDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { renderWithIntl } from "@/test/render-with-intl";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { TravelFavoritesView } from "./TravelFavoritesView";

vi.mock("@/services/travel-marketplace.service", () => ({
  travelMarketService: { favorites: vi.fn(), unfavorite: vi.fn() },
}));

const listing = {
  id: "stay-1", title: "Source listing title", type: "HOTEL", city: "Rasht", province: null, country: "IR",
  coverUrl: null, latitude: null, longitude: null, isVerified: false, bookingMode: "REQUEST_TO_BOOK",
  rating: { average: null, count: 0, petFriendliness: null, cleanliness: null, location: null },
  petPolicySummary: { dogsAllowed: true, catsAllowed: false, maxPets: null, maxWeightKg: null, petFeeIrr: null, stated: true },
  stay: null, fromNightlyIrr: null, freeCancellationAvailable: false, distanceKm: null, petMatch: null,
  amenities: [], favorited: true,
} as unknown as TravelSearchResultItemDto;

const forbidden = () => new ApiError({ code: "FORBIDDEN", message: "دسترسی ندارید", requestId: "test" }, 403);

describe("travel favorites localization", () => {
  beforeEach(() => {
    vi.mocked(travelMarketService.favorites).mockResolvedValue([]);
    vi.mocked(travelMarketService.unfavorite).mockResolvedValue({ listingId: "stay-1", favorited: false });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  afterEach(() => vi.clearAllMocks());

  it.each([
    ["fa", "اقامتگاه‌های ذخیره‌شده", "هنوز اقامتگاهی ذخیره نکرده‌اید", "اتصال را بررسی کنید و دوباره تلاش کنید.", "حذف از ذخیره‌ها"],
    ["en", "Saved stays", "No saved stays yet", "Check your connection and try again.", "Remove from saved"],
    ["de", "Gespeicherte Unterkünfte", "Noch keine Unterkünfte gespeichert", "Prüfe deine Verbindung und versuche es erneut.", "Aus Merkliste entfernen"],
    ["es", "Alojamientos guardados", "Todavía no has guardado ningún alojamiento", "Comprueba la conexión e inténtalo de nuevo.", "Quitar de guardados"],
  ] as const)("renders the populated and genuinely empty page in %s", async (locale, title, emptyTitle, retryMessage, removeLabel) => {
    vi.mocked(travelMarketService.favorites).mockResolvedValueOnce([listing]);
    const populated = renderWithIntl(<TravelFavoritesView />, locale);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Source listing title" })).toBeTruthy();
    expect(screen.getByRole("button", { name: removeLabel })).toBeTruthy();
    if (locale === "de" || locale === "es") expect(populated.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    populated.unmount();

    const empty = renderWithIntl(<TravelFavoritesView />, locale);
    expect(await screen.findByText(emptyTitle)).toBeTruthy();
    if (locale === "de" || locale === "es") expect(empty.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    empty.unmount();

    vi.mocked(travelMarketService.favorites).mockRejectedValueOnce(new Error("network"));
    renderWithIntl(<TravelFavoritesView />, locale);
    expect(await screen.findByText(retryMessage)).toBeTruthy();
  });

  it.each([
    ["fa", "اقامتگاه‌های ذخیره‌شده در حال بارگیری هستند"],
    ["en", "Loading saved stays"],
    ["de", "Gespeicherte Unterkünfte werden geladen"],
    ["es", "Cargando alojamientos guardados"],
  ] as const)("localizes loading and recoverable server error in %s", async (locale, loading) => {
    let reject!: (reason: unknown) => void;
    vi.mocked(travelMarketService.favorites).mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const page = renderWithIntl(<TravelFavoritesView />, locale);
    expect(screen.getByLabelText(loading)).toBeTruthy();
    reject(new Error("offline"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    if (locale === "de" || locale === "es") expect(page.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["fa", "اتصال اینترنت در دسترس نیست", "دسترسی به اقامتگاه‌های ذخیره‌شده ممکن نیست"],
    ["en", "You are offline", "Saved stays are unavailable"],
    ["de", "Keine Internetverbindung", "Gespeicherte Unterkünfte sind nicht verfügbar"],
    ["es", "No hay conexión a internet", "Los alojamientos guardados no están disponibles"],
  ] as const)("separates offline and no-access states in %s", async (locale, offline, denied) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.mocked(travelMarketService.favorites).mockRejectedValueOnce(new Error("offline"));
    const offlinePage = renderWithIntl(<TravelFavoritesView />, locale);
    expect(await screen.findByText(offline)).toBeTruthy();
    if (locale === "de" || locale === "es") expect(offlinePage.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
    offlinePage.unmount();

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    vi.mocked(travelMarketService.favorites).mockRejectedValueOnce(forbidden());
    const deniedPage = renderWithIntl(<TravelFavoritesView />, locale);
    expect(await screen.findByText(denied)).toBeTruthy();
    if (locale === "de" || locale === "es") expect(deniedPage.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
