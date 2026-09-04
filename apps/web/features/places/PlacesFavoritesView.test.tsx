import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { placesService } from "@/services/places.service";
import { PlacesFavoritesView } from "./PlacesFavoritesView";

vi.mock("@/services/places.service", () => ({ placesService: { listFavorites: vi.fn() } }));

function place(overrides: Partial<PetFriendlyPlaceDto> = {}): PetFriendlyPlaceDto {
  return {
    id: "place-1",
    name: "Central Park",
    category: "PARK" as never,
    description: null,
    country: "IR",
    city: "Tehran",
    address: null,
    latitude: 35.7,
    longitude: 51.4,
    distanceMeters: null,
    speciesAllowed: [] as never,
    sizeRestrictions: null,
    indoorAllowed: true,
    outdoorAllowed: true,
    petPolicy: null,
    imageObjectKeys: [],
    imageUrls: [],
    verificationSource: null,
    verifiedAt: "2026-01-01T00:00:00.000Z",
    status: "VERIFIED" as never,
    isPubliclyListed: true,
    isFavorited: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PlacesFavoritesView", () => {
  beforeEach(() => {
    vi.mocked(placesService.listFavorites).mockReset();
  });

  it("shows the household's saved places", async () => {
    vi.mocked(placesService.listFavorites).mockResolvedValue([place()]);

    renderWithIntl(<PlacesFavoritesView />);

    await waitFor(() => expect(screen.getByText("Central Park")).toBeTruthy());
  });

  it("shows a localized empty state when nothing is saved", async () => {
    vi.mocked(placesService.listFavorites).mockResolvedValue([]);

    renderWithIntl(<PlacesFavoritesView />);

    await waitFor(() => expect(screen.getByText("You haven't saved any places yet.")).toBeTruthy());
  });
});
