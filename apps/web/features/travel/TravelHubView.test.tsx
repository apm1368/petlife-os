import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { TripDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { travelService } from "@/services/travel.service";
import { TravelHubView } from "./TravelHubView";

vi.mock("@/services/travel.service", () => ({ travelService: { list: vi.fn() } }));

function trip(overrides: Partial<TripDto> = {}): TripDto {
  return {
    id: "trip-1",
    householdId: "household-1",
    petId: "pet-1",
    petName: "Rex",
    petPhotoUrl: null,
    createdByUserId: "user-1",
    originCountry: "IR",
    originCity: null,
    destinationCountry: "TR",
    destinationCity: null,
    departAt: "2026-06-01T00:00:00.000Z",
    returnAt: null,
    travelMode: "AIR" as never,
    status: "DRAFT" as never,
    notes: null,
    requirementsCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TravelHubView", () => {
  beforeEach(() => {
    vi.mocked(travelService.list).mockReset();
  });

  it("shows the household's trips with status once loaded", async () => {
    vi.mocked(travelService.list).mockResolvedValue([trip()]);

    renderWithIntl(<TravelHubView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("IR → TR")).toBeTruthy());
    expect(screen.getByText("Draft")).toBeTruthy();
  });

  it("shows a localized empty state when there are no trips", async () => {
    vi.mocked(travelService.list).mockResolvedValue([]);

    renderWithIntl(<TravelHubView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No trips yet. Start planning your first one.")).toBeTruthy());
  });

  it("shows an error state with retry when the list fails to load", async () => {
    vi.mocked(travelService.list).mockRejectedValue(new Error("network error"));

    renderWithIntl(<TravelHubView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
