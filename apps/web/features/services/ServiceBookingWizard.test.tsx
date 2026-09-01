import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { LocationMode, ServiceCategory } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { servicesService } from "@/services/services.service";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";
import { addressesService } from "@/services/addresses.service";
import { useBookingStore } from "@/stores/booking-store";
import { ServiceBookingWizard } from "./ServiceBookingWizard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/services.service", () => ({ servicesService: { getAvailability: vi.fn() } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { createHold: vi.fn(), confirm: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));
vi.mock("@/services/addresses.service", () => ({ addressesService: { list: vi.fn(), create: vi.fn() } }));

const SLOT = {
  startAt: "2026-09-10T05:30:00.000Z",
  endAt: "2026-09-10T06:30:00.000Z",
  timezone: "Asia/Tehran",
  state: "AVAILABLE" as const,
  providerUserId: "provider-user-1",
};

const PET = {
  id: "pet-1",
  householdId: "household-1",
  name: "Luna",
  species: "DOG" as never,
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
  lifecycleStatus: "ACTIVE" as never,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function resetDraft(overrides: Partial<ReturnType<typeof useBookingStore.getState>> = {}) {
  useBookingStore.getState().reset();
  useBookingStore.getState().update({
    petId: "pet-1",
    category: ServiceCategory.GROOMING,
    providerId: "provider-1",
    providerName: "Happy Paws Grooming",
    locationId: "loc-1",
    locationLabel: "Tehran — 1 Valiasr St.",
    locationMode: LocationMode.AT_PROVIDER,
    serviceId: "svc-1",
    serviceName: "Full Groom & Bath",
    durationMinutes: 60,
    ...overrides,
  });
}

describe("ServiceBookingWizard", () => {
  beforeEach(() => {
    vi.mocked(servicesService.getAvailability).mockReset();
    vi.mocked(bookingsService.createHold).mockReset();
    vi.mocked(bookingsService.confirm).mockReset();
    vi.mocked(petsService.getById).mockResolvedValue(PET as never);
  });

  it("shows an empty-draft state when the store doesn't match this service", async () => {
    useBookingStore.getState().reset();
    renderWithIntl(<ServiceBookingWizard serviceId="svc-1" />);
    await waitFor(() => expect(screen.getByText("Start by choosing a provider from the service results.")).toBeTruthy());
  });

  it("walks a fixed-slot (Grooming) flow through Review to Care Sharing with the Who/What/Why/Until copy", async () => {
    resetDraft();
    vi.mocked(servicesService.getAvailability).mockResolvedValue({ petCompatible: true, slots: [SLOT] });
    vi.mocked(bookingsService.createHold).mockResolvedValue({
      holdId: "hold-1",
      expiresAt: "2026-09-01T00:10:00.000Z",
      petId: "pet-1",
      providerOrganizationId: "provider-1",
      providerLocationId: "loc-1",
      providerUserId: "provider-user-1",
      providerServiceId: "svc-1",
      slotStart: SLOT.startAt,
      slotEnd: SLOT.endAt,
      timezone: SLOT.timezone,
    });

    renderWithIntl(<ServiceBookingWizard serviceId="svc-1" />);

    const slotButton = await screen.findByRole("button", { name: /9:00/ });
    fireEvent.click(slotButton);

    await waitFor(() => expect(screen.getByText("Review your booking")).toBeTruthy());
    expect(screen.getByText("Happy Paws Grooming")).toBeTruthy();
    expect(screen.getByText("Full Groom & Bath")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText("Share care info with the provider")).toBeTruthy());
    expect(screen.getByText("Who")).toBeTruthy();
    expect(screen.getByText("What to share")).toBeTruthy();
    expect(screen.getByText("Why")).toBeTruthy();
    expect(screen.getByText("Until")).toBeTruthy();
    expect(screen.getByText("Grooming basics")).toBeTruthy();
  });

  it("books a date-range (Boarding) service by check-in/check-out instead of a slot grid", async () => {
    resetDraft({ category: ServiceCategory.BOARDING, serviceName: "Overnight Boarding" });
    vi.mocked(bookingsService.createHold).mockResolvedValue({
      holdId: "hold-2",
      expiresAt: "2026-09-01T00:10:00.000Z",
      petId: "pet-1",
      providerOrganizationId: "provider-1",
      providerLocationId: "loc-1",
      providerUserId: null,
      providerServiceId: "svc-1",
      slotStart: "2026-09-11T12:00:00.000Z",
      slotEnd: "2026-09-14T12:00:00.000Z",
      timezone: "Asia/Tehran",
    });

    renderWithIntl(<ServiceBookingWizard serviceId="svc-1" />);

    await screen.findByText("Choose check-in and check-out");
    fireEvent.change(screen.getByLabelText("Check-in"), { target: { value: "2026-09-11" } });
    fireEvent.change(screen.getByLabelText("Check-out"), { target: { value: "2026-09-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(bookingsService.createHold).toHaveBeenCalledWith(expect.objectContaining({ rangeStart: expect.any(String), rangeEnd: expect.any(String) })));
    await waitFor(() => expect(screen.getByText("Review your booking")).toBeTruthy());
  });

  it("collects an address before Review for an AT_CUSTOMER service", async () => {
    resetDraft({ category: ServiceCategory.WALKING, locationMode: LocationMode.AT_CUSTOMER, serviceName: "30-Minute Walk" });
    vi.mocked(servicesService.getAvailability).mockResolvedValue({ petCompatible: true, slots: [SLOT] });
    vi.mocked(bookingsService.createHold).mockResolvedValue({
      holdId: "hold-3",
      expiresAt: "2026-09-01T00:10:00.000Z",
      petId: "pet-1",
      providerOrganizationId: "provider-1",
      providerLocationId: "loc-1",
      providerUserId: "provider-user-1",
      providerServiceId: "svc-1",
      slotStart: SLOT.startAt,
      slotEnd: SLOT.endAt,
      timezone: SLOT.timezone,
    });
    vi.mocked(addressesService.list).mockResolvedValue([]);

    renderWithIntl(<ServiceBookingWizard serviceId="svc-1" />);

    const slotButton = await screen.findByRole("button", { name: /9:00/ });
    fireEvent.click(slotButton);

    await waitFor(() => expect(screen.getByText("Where should this happen?")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
  });
});
