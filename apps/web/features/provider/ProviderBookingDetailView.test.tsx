import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProviderBookingDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderBookingDetailView } from "./ProviderBookingDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/provider-os.service", () => ({
  providerOsService: {
    getBooking: vi.fn(),
    confirmBooking: vi.fn(),
    cancelBooking: vi.fn(),
    checkIn: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    addNote: vi.fn(),
  },
}));

function baseDetail(overrides: Partial<ProviderBookingDetailDto> = {}): ProviderBookingDetailDto {
  return {
    booking: {
      id: "booking-1",
      petId: "pet-1",
      petName: "Rex",
      petSpecies: "DOG" as never,
      ownerDisplayName: "Sarah",
      category: "GROOMING" as never,
      serviceName: "Full Groom",
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T10:00:00.000Z",
      timezone: "UTC",
      locationLabel: "Test Location",
      bookingStatus: "CONFIRMED" as never,
      paymentStatus: "NOT_REQUIRED" as never,
      providerUserId: "pu-1",
      reasonForVisit: null,
      ownerNotes: null,
      cancelledAt: null,
      cancelledReason: null,
      completedAt: null,
      completedByProviderUserId: null,
      completionNote: null,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    pet: { id: "pet-1", name: "Rex", species: "DOG" as never, breed: null, photoUrl: null },
    access: { state: "NO_GRANT", scopePreset: null, reason: null, startsAt: null, expiresAt: null, canViewCareProfile: false, canViewHealth: false },
    careProfile: null,
    healthSummary: null,
    providerNotes: [],
    ...overrides,
  };
}

describe("ProviderBookingDetailView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.getBooking).mockReset();
    vi.mocked(providerOsService.confirmBooking).mockReset();
    vi.mocked(providerOsService.cancelBooking).mockReset();
    vi.mocked(providerOsService.checkIn).mockReset();
    vi.mocked(providerOsService.start).mockReset();
  });

  it("shows a clear NO_GRANT state and never renders Care/Health context", async () => {
    vi.mocked(providerOsService.getBooking).mockResolvedValue(baseDetail());

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("No access")).toBeTruthy());
    expect(screen.queryByText("Care context")).toBeNull();
    expect(screen.queryByText("Health context")).toBeNull();
  });

  it("shows Care context but not Health context when the grant excludes health", async () => {
    vi.mocked(providerOsService.getBooking).mockResolvedValue(
      baseDetail({
        access: { state: "GRANTED", scopePreset: "GROOMING_BASIC" as never, reason: "GROOMING_BOOKING", startsAt: "2026-08-25T00:00:00.000Z", expiresAt: "2026-09-02T00:00:00.000Z", canViewCareProfile: true, canViewHealth: false },
        careProfile: { petId: "pet-1", temperamentText: "Friendly", aroundPeopleText: null, aroundAnimalsText: null, leashBehaviorText: null, handlingSensitivityText: null, feedingRoutineText: null, toiletRoutineText: null, separationBehaviorText: null, specialInstructionsText: null, status: "PARTIAL" as never, createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" },
      }),
    );

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);

    await waitFor(() => expect(screen.getByText("Access granted")).toBeTruthy());
    expect(screen.getByText("Care context")).toBeTruthy();
    expect(screen.getByText("Friendly")).toBeTruthy();
    expect(screen.queryByText("Health context")).toBeNull();
  });

  it("confirms a CONFIRMED booking idempotently and shows a success message", async () => {
    const detail = baseDetail();
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.confirmBooking).mockResolvedValue(detail);

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(providerOsService.confirmBooking).toHaveBeenCalledWith("booking-1"));
    await waitFor(() => expect(screen.getAllByText("Confirmed").length).toBeGreaterThan(1));
  });

  it("walks CONFIRMED -> CHECKED_IN -> IN_PROGRESS as the provider clicks through", async () => {
    const detail = baseDetail();
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.checkIn).mockResolvedValue(baseDetail({ booking: { ...detail.booking, bookingStatus: "CHECKED_IN" as never } }));
    vi.mocked(providerOsService.start).mockResolvedValue(baseDetail({ booking: { ...detail.booking, bookingStatus: "IN_PROGRESS" as never } }));

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Complete" })).toBeTruthy());
  });

  it("opens the cancel dialog and calls cancelBooking with the entered reason", async () => {
    const detail = baseDetail();
    vi.mocked(providerOsService.getBooking).mockResolvedValue(detail);
    vi.mocked(providerOsService.cancelBooking).mockResolvedValue(baseDetail({ booking: { ...detail.booking, bookingStatus: "CANCELLED_BY_PROVIDER" as never } }));

    renderWithIntl(<ProviderBookingDetailView bookingId="booking-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel booking" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(screen.getByText("Cancel this booking?")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Staff unavailable" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel booking" }));

    await waitFor(() => expect(providerOsService.cancelBooking).toHaveBeenCalledWith("booking-1", "Staff unavailable"));
  });
});
