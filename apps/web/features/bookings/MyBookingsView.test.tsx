import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { BookingDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { bookingsService } from "@/services/bookings.service";
import { MyBookingsView } from "./MyBookingsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { list: vi.fn() } }));

const BOOKING: BookingDto = {
  id: "booking-1",
  householdId: "household-1",
  petId: "pet-1",
  userId: "user-1",
  providerOrganizationId: "provider-1",
  providerLocationId: "loc-1",
  providerUserId: "provider-user-1",
  providerServiceId: "svc-1",
  category: "GROOMING" as never,
  locationMode: "AT_PROVIDER" as never,
  startAt: "2026-09-10T05:30:00.000Z",
  endAt: "2026-09-10T06:30:00.000Z",
  timezone: "Asia/Tehran",
  bookingStatus: "CONFIRMED" as never,
  paymentStatus: "NOT_REQUIRED" as never,
  reasonForVisit: null,
  ownerNotes: null,
  cancelledAt: null,
  cancelledReason: null,
  completedAt: null,
  completedByProviderUserId: null,
  completionNote: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  provider: { id: "provider-1", name: "Happy Paws Grooming", type: "GROOMER" as never, verificationStatus: "VERIFIED" as never, description: null, logoUrl: null, locations: [], services: [], nextAvailableSlotStart: null },
  location: null,
  service: { id: "svc-1", providerOrganizationId: "provider-1", locationId: "loc-1", name: "Full Groom & Bath", description: null, type: "GROOMING_SESSION" as never, category: "GROOMING" as never, durationMinutes: 60, priceAmount: null, currency: null, supportsDog: true, supportsCat: true, minAgeMonths: null, maxAgeMonths: null, minWeightKg: null, maxWeightKg: null, requiresCareProfile: false, requiresHealthBasics: false, locationMode: "AT_PROVIDER" as never, isActive: true },
  customerAddress: null,
  dropoffAddress: null,
  bookingSeriesId: null,
  petAccess: null,
};

describe("MyBookingsView", () => {
  beforeEach(() => {
    vi.mocked(bookingsService.list).mockReset();
  });

  it("shows the upcoming tab by default with a booking's service and provider", async () => {
    vi.mocked(bookingsService.list).mockResolvedValue([BOOKING]);

    renderWithIntl(<MyBookingsView />);

    await waitFor(() => expect(screen.getByText("Full Groom & Bath")).toBeTruthy());
    expect(screen.getByText("Happy Paws Grooming")).toBeTruthy();
    expect(bookingsService.list).toHaveBeenCalledWith({ upcoming: true });
  });

  it("switches to the cancelled tab and shows its own empty state", async () => {
    vi.mocked(bookingsService.list).mockResolvedValue([]);

    renderWithIntl(<MyBookingsView />);
    await waitFor(() => expect(bookingsService.list).toHaveBeenCalledWith({ upcoming: true }));

    fireEvent.click(screen.getByRole("button", { name: "Cancelled" }));

    await waitFor(() => expect(bookingsService.list).toHaveBeenCalledWith({ cancelled: true }));
    await waitFor(() => expect(screen.getByText("No cancelled bookings.")).toBeTruthy());
  });
});
