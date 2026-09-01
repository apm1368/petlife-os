import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { providersService } from "@/services/providers.service";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";
import { useBookingStore } from "@/stores/booking-store";
import { BookingWizard } from "./BookingWizard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/providers.service", () => ({ providersService: { getAvailability: vi.fn() } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { createHold: vi.fn(), confirm: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn() } }));

const SLOT = {
  startAt: "2026-09-10T05:30:00.000Z",
  endAt: "2026-09-10T06:00:00.000Z",
  timezone: "Asia/Tehran",
  state: "AVAILABLE" as const,
  providerUserId: "provider-user-1",
};

describe("BookingWizard", () => {
  beforeEach(() => {
    useBookingStore.getState().reset();
    useBookingStore.getState().update({
      petId: "pet-1",
      providerId: "provider-1",
      providerName: "Tehran Pet Care Clinic",
      locationId: "loc-1",
      locationLabel: "Tehran — 12 Vanak St.",
      serviceId: "svc-1",
      serviceName: "General Vet Visit",
      durationMinutes: 30,
    });
    vi.mocked(providersService.getAvailability).mockReset();
    vi.mocked(bookingsService.createHold).mockReset();
    vi.mocked(petsService.getById).mockResolvedValue({
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
    });
  });

  it("shows an empty state when there are no available slots", async () => {
    vi.mocked(providersService.getAvailability).mockResolvedValue({ petCompatible: true, slots: [] });

    renderWithIntl(<BookingWizard providerId="provider-1" />);

    await waitFor(() => expect(screen.getByText("No available times in the next week.")).toBeTruthy());
  });

  it("walks Slot Picker -> Review -> Health Sharing, showing the Who/What/Why/Until permission copy", async () => {
    vi.mocked(providersService.getAvailability).mockResolvedValue({ petCompatible: true, slots: [SLOT] });
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

    renderWithIntl(<BookingWizard providerId="provider-1" />);

    const slotButton = await screen.findByRole("button", { name: /9:00/ });
    fireEvent.click(slotButton);

    await waitFor(() => expect(screen.getByText("Review your booking")).toBeTruthy());
    expect(screen.getByText("Tehran Pet Care Clinic")).toBeTruthy();
    expect(screen.getByText("General Vet Visit")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByText("Share health info with the clinic")).toBeTruthy());
    expect(screen.getByText("Who")).toBeTruthy();
    expect(screen.getByText("What to share")).toBeTruthy();
    expect(screen.getByText("Why")).toBeTruthy();
    expect(screen.getByText("Until")).toBeTruthy();
    expect(screen.getByText("Health Basics (recommended)")).toBeTruthy();
    expect(screen.getByText("Minimal context")).toBeTruthy();
    expect(screen.getByText("Selected health data")).toBeTruthy();
  });
});
