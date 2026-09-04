import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { TravelRequirementDto, TripDto, TripReadinessSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { travelService } from "@/services/travel.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { TripDetailView } from "./TripDetailView";

vi.mock("@/services/travel.service", () => ({
  travelService: {
    get: vi.fn(),
    getReadiness: vi.fn(),
    getRequirementSuggestions: vi.fn(),
    updateRequirement: vi.fn(),
    createRequirement: vi.fn(),
    deleteRequirement: vi.fn(),
    transition: vi.fn(),
  },
}));
vi.mock("@/services/health-advanced.service", () => ({ healthAdvancedService: { listDocuments: vi.fn(), requestDocumentUpload: vi.fn(), createDocument: vi.fn() } }));

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
    requirementsCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function requirement(overrides: Partial<TravelRequirementDto> = {}): TravelRequirementDto {
  return {
    id: "req-1",
    tripId: "trip-1",
    requirementType: "RABIES" as never,
    status: "UNKNOWN" as never,
    source: null,
    sourceUrl: null,
    jurisdiction: null,
    verifiedAt: null,
    validUntil: null,
    isStale: true,
    linkedMedicalDocumentId: null,
    linkedMedicalDocumentTitle: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function readiness(overrides: Partial<TripReadinessSummaryDto> = {}): TripReadinessSummaryDto {
  return {
    tripId: "trip-1",
    status: "DRAFT" as never,
    requirements: [requirement()],
    readyCount: 0,
    totalCount: 1,
    allReady: false,
    hasStaleRequirement: true,
    ...overrides,
  };
}

describe("TripDetailView", () => {
  beforeEach(() => {
    vi.mocked(travelService.get).mockReset();
    vi.mocked(travelService.getReadiness).mockReset();
    vi.mocked(travelService.getRequirementSuggestions).mockReset().mockResolvedValue([]);
    vi.mocked(healthAdvancedService.listDocuments).mockReset().mockResolvedValue([]);
  });

  it("never shows a trip as ready when a requirement is still UNKNOWN, and surfaces the stale warning", async () => {
    vi.mocked(travelService.get).mockResolvedValue(trip());
    vi.mocked(travelService.getReadiness).mockResolvedValue(readiness());

    renderWithIntl(<TripDetailView petId="pet-1" tripId="trip-1" />);

    await waitFor(() => expect(screen.getByText("Not ready yet")).toBeTruthy());
    expect(screen.getByText("0 of 1 requirements ready")).toBeTruthy();
    expect(screen.getByText("Some requirements haven't been verified recently — double-check before you travel.")).toBeTruthy();
  });

  it("only shows the trip as ready once every requirement is settled", async () => {
    vi.mocked(travelService.get).mockResolvedValue(trip());
    vi.mocked(travelService.getReadiness).mockResolvedValue(
      readiness({ requirements: [requirement({ status: "READY" as never, isStale: false })], readyCount: 1, allReady: true, hasStaleRequirement: false }),
    );

    renderWithIntl(<TripDetailView petId="pet-1" tripId="trip-1" />);

    await waitFor(() => expect(screen.getByText("Ready to travel")).toBeTruthy());
  });
});
