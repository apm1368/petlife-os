import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProviderBookingSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderBookingsView } from "./ProviderBookingsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/provider-os.service", () => ({ providerOsService: { listBookings: vi.fn() } }));

const BOOKING: ProviderBookingSummaryDto = {
  id: "booking-1",
  petId: "pet-1",
  petName: "Rex",
  petSpecies: "DOG" as never,
  ownerDisplayName: "Owner",
  category: "GROOMING" as never,
  serviceName: "Full Groom",
  startAt: "2026-09-01T09:00:00.000Z",
  endAt: "2026-09-01T10:00:00.000Z",
  timezone: "UTC",
  locationLabel: "Test Location",
  bookingStatus: "CONFIRMED" as never,
  paymentStatus: "NOT_REQUIRED" as never,
  providerUserId: "pu-1",
  bookingNumber: "PL-B-000001", variantName: null, requestExpiresAt: null, resourceId: null, paymentMode: "PAY_AT_PROVIDER" as never,
};

describe("ProviderBookingsView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.listBookings).mockReset();
  });

  it("loads today's bookings by default", async () => {
    vi.mocked(providerOsService.listBookings).mockResolvedValue([BOOKING]);

    renderWithIntl(<ProviderBookingsView />);

    await waitFor(() => expect(providerOsService.listBookings).toHaveBeenCalledWith({ today: true }));
    await waitFor(() => expect(screen.getByText("Full Groom")).toBeTruthy());
  });

  it("switches filters and shows an empty state", async () => {
    vi.mocked(providerOsService.listBookings).mockResolvedValue([]);

    renderWithIntl(<ProviderBookingsView />);
    await waitFor(() => expect(providerOsService.listBookings).toHaveBeenCalledWith({ today: true }));

    fireEvent.click(screen.getByRole("button", { name: "Cancelled" }));

    await waitFor(() => expect(providerOsService.listBookings).toHaveBeenCalledWith({ cancelled: true }));
    await waitFor(() => expect(screen.getByText("No bookings found.")).toBeTruthy());
  });

  it.each([
    ["de", "Buchungen", "Heute", "Keine Buchungen gefunden."],
    ["es", "Reservas", "Hoy", "No se encontraron reservas."],
  ] as const)("renders booking list and empty state in %s without Persian UI", async (locale, title, today, empty) => {
    vi.mocked(providerOsService.listBookings).mockResolvedValue([]);
    const view = renderWithIntl(<ProviderBookingsView />, locale);
    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getByRole("button", { name: today }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(screen.getByText(empty)).toBeTruthy());
    expect(view.container.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([["de", "Buchungen konnten nicht geladen werden."], ["es", "No se pudieron cargar las reservas."]] as const)("renders localized load error and retry in %s", async (locale, message) => {
    vi.mocked(providerOsService.listBookings).mockRejectedValue(new Error("network failure"));
    renderWithIntl(<ProviderBookingsView />, locale);
    await waitFor(() => expect(screen.getByText(new RegExp(message))).toBeTruthy());
    expect(screen.getByRole("button", { name: locale === "de" ? "Erneut versuchen" : "Intentar de nuevo" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
