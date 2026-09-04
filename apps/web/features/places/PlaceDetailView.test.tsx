import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { placesService } from "@/services/places.service";
import { ApiError } from "@/lib/api/client";
import { PlaceDetailView } from "./PlaceDetailView";

vi.mock("@/services/places.service", () => ({ placesService: { get: vi.fn(), addFavorite: vi.fn(), removeFavorite: vi.fn() } }));

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
    isFavorited: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PlaceDetailView", () => {
  beforeEach(() => {
    vi.mocked(placesService.get).mockReset();
    vi.mocked(placesService.addFavorite).mockReset();
  });

  it("prompts sign-in when favoriting fails with a 401, rather than a generic error", async () => {
    vi.mocked(placesService.get).mockResolvedValue(place());
    vi.mocked(placesService.addFavorite).mockRejectedValue(new ApiError({ code: "UNAUTHENTICATED", message: "unauthenticated", requestId: "r1" }, 401));

    renderWithIntl(<PlaceDetailView placeId="place-1" />);

    await waitFor(() => expect(screen.getByText("Central Park")).toBeTruthy());
    fireEvent.click(screen.getByText("Save to favorites"));

    await waitFor(() => expect(screen.getByText("Sign in to save your favorite places.")).toBeTruthy());
  });

  it("shows an unverified warning for a non-verified place", async () => {
    vi.mocked(placesService.get).mockResolvedValue(place({ status: "UNVERIFIED" as never }));

    renderWithIntl(<PlaceDetailView placeId="place-1" />);

    await waitFor(() => expect(screen.getByText("Not yet verified — details may be incomplete")).toBeTruthy());
  });
});
