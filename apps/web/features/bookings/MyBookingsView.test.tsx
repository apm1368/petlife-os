import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { BookingDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { bookingsService } from "@/services/bookings.service";
import { MyBookingsView } from "./MyBookingsView";

const params = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }), usePathname: () => "/fa/bookings", useSearchParams: () => params }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn().mockResolvedValue([]), listPets: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { list: vi.fn(), listWaitlist: vi.fn(), cancelWaitlist: vi.fn() } }));

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
  service: { id: "svc-1", providerOrganizationId: "provider-1", locationId: "loc-1", name: "Full Groom & Bath", description: null, type: "GROOMING_SESSION" as never, category: "GROOMING" as never, durationMinutes: 60, priceAmount: null, currency: null, supportsDog: true, supportsCat: true, minAgeMonths: null, maxAgeMonths: null, minWeightKg: null, maxWeightKg: null, requiresCareProfile: false, requiresHealthBasics: false, locationMode: "AT_PROVIDER" as never, isActive: true, bookingMode: "INSTANT" as never, paymentMode: "PAY_AT_PROVIDER" as never, depositAmount: null, cancellationPolicy: null, freeCancellationHours: 24, lateCancellationRefundPercent: 0, preparationNotes: null, maxPetsPerBooking: 1, requiredResourceType: null, variants: [] },
  customerAddress: null,
  dropoffAddress: null,
  bookingSeriesId: null,
  petAccess: null,
  bookingNumber: "PL-B-000001", variantId: null, variantName: null, serviceName: null, bookingMode: "INSTANT" as never, paymentMode: "PAY_AT_PROVIDER" as never, priceAmount: null, discountAmount: 0, depositAmount: null, currency: null, durationMinutes: null, cancellationPolicy: null, freeCancellationHours: null, lateCancellationRefundPercent: null, preparation: null, requestExpiresAt: null, rejectedReason: null, rescheduledFromBookingId: null, rescheduledToBookingId: null, additionalPetIds: [], timeline: [], review: null,
};

describe("MyBookingsView", () => {
  beforeEach(() => {
    vi.mocked(bookingsService.list).mockReset();
    params.delete("tab");
    replace.mockReset();
  });

  it("lists upcoming bookings with number, provider and a human status", async () => {
    vi.mocked(bookingsService.list).mockResolvedValue([{ ...BOOKING, serviceName: "Full Groom & Bath" }]);
    renderWithIntl(<MyBookingsView />, "en");
    expect(await screen.findByText("Full Groom & Bath")).toBeTruthy();
    expect(screen.getByText(/PL-B-000001/)).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(bookingsService.list).toHaveBeenCalledWith({ upcoming: true, petId: undefined });
  });

  it("switches tabs through the URL so the view is shareable and restorable", async () => {
    vi.mocked(bookingsService.list).mockResolvedValue([]);
    renderWithIntl(<MyBookingsView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Requested" }));
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("tab=requested"), { scroll: false });
  });

  it("shows the waitlist tab with honest copy and no auto-booking promise", async () => {
    params.set("tab", "waitlist");
    vi.mocked(bookingsService.listWaitlist).mockResolvedValue([{ id: "w1", petId: "pet-1", petName: "Luna", providerOrganizationId: "provider-1", providerName: "Happy Paws", serviceId: "svc-1", serviceName: "Groom", variantId: null, windowStart: "2026-10-01T00:00:00.000Z", windowEnd: "2026-10-01T23:59:00.000Z", status: "NOTIFIED", notifiedAt: null, createdAt: "2026-09-01T00:00:00.000Z" }]);
    renderWithIntl(<MyBookingsView />, "en");
    expect(await screen.findByText(/it is not held for you/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Book" }).getAttribute("href")).toContain("/providers/provider-1/book?serviceId=svc-1");
  });

  it("shows an empty state per tab", async () => {
    vi.mocked(bookingsService.list).mockResolvedValue([]);
    renderWithIntl(<MyBookingsView />, "en");
    await waitFor(() => expect(screen.getByText("No bookings here")).toBeTruthy());
  });
});
