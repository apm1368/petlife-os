import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ProviderOverviewDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providerOsService } from "@/services/provider-os.service";
import { ProviderHomeView } from "./ProviderHomeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/provider-os.service", () => ({ providerOsService: { getOverview: vi.fn() } }));

const BASE_OVERVIEW: ProviderOverviewDto = {
  organization: { id: "org-1", name: "Happy Paws Grooming", verificationStatus: "VERIFIED" as never },
  location: { id: "loc-1", providerOrganizationId: "org-1", name: "Happy Paws — Tehran", addressLine: "1 St.", city: "Tehran", region: null, countryCode: "IR", latitude: null, longitude: null, phone: null, timezone: "Asia/Tehran" },
  providerUser: { id: "pu-1", role: "STAFF" as never, displayTitle: null },
  todaysBookings: [],
  nextBooking: null,
  pendingConfirmationCount: 0,
  cancellationsRequiringAttentionCount: 0,
  availabilityIssueCount: 0,
  actionCounts: { today: 0, upcoming: 0, pendingConfirmation: 0 },
};

describe("ProviderHomeView", () => {
  beforeEach(() => {
    vi.mocked(providerOsService.getOverview).mockReset();
  });

  it("shows an all-clear state when nothing needs attention", async () => {
    vi.mocked(providerOsService.getOverview).mockResolvedValue(BASE_OVERVIEW);

    renderWithIntl(<ProviderHomeView />);

    await waitFor(() => expect(screen.getByText("All clear")).toBeTruthy());
    expect(screen.getByText("No bookings today.")).toBeTruthy();
  });

  it("surfaces attention counts when there are pending confirmations and availability issues", async () => {
    vi.mocked(providerOsService.getOverview).mockResolvedValue({
      ...BASE_OVERVIEW,
      pendingConfirmationCount: 2,
      availabilityIssueCount: 1,
    });

    renderWithIntl(<ProviderHomeView />);

    await waitFor(() => expect(screen.getByText("2 pending confirmation")).toBeTruthy());
    expect(screen.getByText("1 availability conflicts")).toBeTruthy();
  });

  it("lists today's bookings and a next-booking card", async () => {
    const booking = {
      id: "booking-1",
      petId: "pet-1",
      petName: "Luna",
      petSpecies: "DOG" as never,
      ownerDisplayName: "Sarah",
      category: "GROOMING" as never,
      serviceName: "Full Groom",
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T10:00:00.000Z",
      timezone: "UTC",
      locationLabel: "Happy Paws — Tehran",
      bookingStatus: "CONFIRMED" as never,
      paymentStatus: "NOT_REQUIRED" as never,
      providerUserId: "pu-1",
    };
    vi.mocked(providerOsService.getOverview).mockResolvedValue({
      ...BASE_OVERVIEW,
      todaysBookings: [booking],
      nextBooking: booking,
      actionCounts: { today: 1, upcoming: 1, pendingConfirmation: 0 },
    });

    renderWithIntl(<ProviderHomeView />);

    await waitFor(() => expect(screen.getAllByText("Luna — Sarah").length).toBeGreaterThan(0));
    expect(screen.getByText("Today (1)")).toBeTruthy();
  });
});
