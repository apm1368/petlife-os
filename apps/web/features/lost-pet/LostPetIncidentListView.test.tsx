import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { LostPetIncidentDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { lostPetService } from "@/services/lost-pet.service";
import { LostPetIncidentListView } from "./LostPetIncidentListView";

vi.mock("@/services/lost-pet.service", () => ({ lostPetService: { list: vi.fn() } }));

function incident(overrides: Partial<LostPetIncidentDto> = {}): LostPetIncidentDto {
  return {
    id: "incident-1",
    petId: "pet-1",
    petName: "Milo",
    petSpecies: "DOG" as never,
    petPhotoUrl: null,
    householdId: "household-1",
    status: "OPEN" as never,
    lastKnownLocation: "Central Park",
    lastKnownLatitude: null,
    lastKnownLongitude: null,
    lastSeenAt: null,
    description: "Ran off during a walk",
    publicNotes: null,
    privateNotes: null,
    primaryPhotoObjectKey: null,
    primaryPhotoUrl: null,
    contactPreference: "IN_APP_MESSAGE" as never,
    publicContactMode: null,
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    foundAt: null,
    reunitedAt: null,
    closedAt: null,
    sightingsCount: 0,
    ...overrides,
  };
}

describe("LostPetIncidentListView", () => {
  beforeEach(() => {
    vi.mocked(lostPetService.list).mockReset();
  });

  it("shows the pet's lost pet incidents with status once loaded", async () => {
    vi.mocked(lostPetService.list).mockResolvedValue([incident()]);

    renderWithIntl(<LostPetIncidentListView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Central Park")).toBeTruthy());
    expect(screen.getByText("Missing")).toBeTruthy();
  });

  it("shows a localized empty state when there are no incidents", async () => {
    vi.mocked(lostPetService.list).mockResolvedValue([]);

    renderWithIntl(<LostPetIncidentListView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("No lost pet reports yet.")).toBeTruthy());
  });

  it("shows an error state with retry when the list fails to load", async () => {
    vi.mocked(lostPetService.list).mockRejectedValue(new Error("network error"));

    renderWithIntl(<LostPetIncidentListView petId="pet-1" />);

    await waitFor(() => expect(screen.getByText("Retry")).toBeTruthy());
  });
});
