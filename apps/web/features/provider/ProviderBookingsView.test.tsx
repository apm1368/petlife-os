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
});
