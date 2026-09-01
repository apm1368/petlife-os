import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { BookingDto, PetDto } from "@petlife/types";
import { PetLifecycleStatus, PetSpecies } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";
import { BookingDetailView } from "./BookingDetailView";

const searchParamsMock = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => searchParamsMock,
}));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { getById: vi.fn(), cancel: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));

const PET: PetDto = {
  id: "pet-1",
  householdId: "household-1",
  name: "Luna",
  species: PetSpecies.DOG,
  breed: null,
  sex: null,
  birthDate: null,
  approximateAgeMonths: 24,
  photoUrl: null,
  latestWeightValue: null,
  latestWeightUnit: null,
  colorMarkings: null,
  neuteredStatus: null,
  microchipNumber: null,
  lifecycleStatus: PetLifecycleStatus.ACTIVE,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const BASE_BOOKING: BookingDto = {
  id: "booking-1",
  householdId: "household-1",
  petId: "pet-1",
  userId: "user-1",
  providerOrganizationId: "provider-1",
  providerLocationId: "loc-1",
  providerUserId: "provider-user-1",
  providerServiceId: "svc-1",
  startAt: "2026-09-10T05:30:00.000Z",
  endAt: "2026-09-10T06:00:00.000Z",
  timezone: "Asia/Tehran",
  bookingStatus: "CONFIRMED" as never,
  paymentStatus: "NOT_REQUIRED" as never,
  reasonForVisit: "Annual checkup",
  ownerNotes: null,
  cancelledAt: null,
  cancelledReason: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  provider: {
    id: "provider-1",
    name: "Tehran Pet Care Clinic",
    type: "VET_CLINIC" as never,
    verificationStatus: "VERIFIED" as never,
    description: null,
    logoUrl: null,
    locations: [],
    services: [],
    nextAvailableSlotStart: null,
  },
  location: {
    id: "loc-1",
    providerOrganizationId: "provider-1",
    name: null,
    addressLine: "12 Vanak St.",
    city: "Tehran",
    region: null,
    countryCode: "IR",
    latitude: null,
    longitude: null,
    phone: null,
    timezone: "Asia/Tehran",
  },
  service: {
    id: "svc-1",
    providerOrganizationId: "provider-1",
    locationId: "loc-1",
    name: "General Vet Visit",
    description: null,
    type: "GENERAL_VET_VISIT" as never,
    durationMinutes: 30,
    priceAmount: null,
    currency: null,
    supportsDog: true,
    supportsCat: true,
    isActive: true,
  },
  healthAccess: { scopePreset: "HEALTH_BASICS" as never, expiresAt: "2026-09-11T06:00:00.000Z" },
};

describe("BookingDetailView", () => {
  beforeEach(() => {
    vi.mocked(bookingsService.getById).mockReset();
    vi.mocked(petsService.getById).mockResolvedValue(PET);
    searchParamsMock.delete("confirmed");
  });

  it("shows the confirmed status and the shared health access scope for a confirmed booking", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue(BASE_BOOKING);

    renderWithIntl(<BookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("Confirmed")).toBeTruthy());
    expect(screen.getByText("Health Basics")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeTruthy();
  });

  it("shows the just-confirmed banner with the calendar and health-access copy when navigated to with ?confirmed=1", async () => {
    searchParamsMock.set("confirmed", "1");
    vi.mocked(bookingsService.getById).mockResolvedValue(BASE_BOOKING);

    renderWithIntl(<BookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("Booking confirmed")).toBeTruthy());
    expect(screen.getByText("Added to your Care Calendar.")).toBeTruthy();
  });

  it("never shows a cancel action for an already-cancelled booking", async () => {
    vi.mocked(bookingsService.getById).mockResolvedValue({
      ...BASE_BOOKING,
      bookingStatus: "CANCELLED_BY_USER" as never,
      cancelledReason: "Change of plans",
    });

    renderWithIntl(<BookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("Cancelled by you")).toBeTruthy());
    expect(screen.getByText("Change of plans")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).toBeNull();
  });
});
