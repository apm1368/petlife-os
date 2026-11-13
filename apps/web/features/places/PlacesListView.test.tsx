import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, PetFriendlyPlaceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { placesService } from "@/services/places.service";
import { PlacesListView } from "./PlacesListView";

vi.mock("@/services/places.service", () => ({ placesService: { list: vi.fn(), nearby: vi.fn(), nearHome: vi.fn() } }));

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

function paginated(items: PetFriendlyPlaceDto[]): PaginatedDto<PetFriendlyPlaceDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("PlacesListView", () => {
  beforeEach(() => {
    vi.mocked(placesService.list).mockReset();
  });

  it("shows verified places from the public directory without requiring authentication", async () => {
    vi.mocked(placesService.list).mockResolvedValue(paginated([place()]));

    renderWithIntl(<PlacesListView />);

    await waitFor(() => expect(screen.getByText("Central Park")).toBeTruthy());
    expect(screen.getByText(/Tehran, Iran/)).toBeTruthy();
  });

  it("flags an unverified place rather than presenting it as confirmed", async () => {
    vi.mocked(placesService.list).mockResolvedValue(paginated([place({ status: "UNVERIFIED" as never })]));

    renderWithIntl(<PlacesListView />);

    await waitFor(() => expect(screen.getByText("Not yet verified — details may be incomplete")).toBeTruthy());
  });

  it("shows a localized empty state when there are no places", async () => {
    vi.mocked(placesService.list).mockResolvedValue(paginated([]));

    renderWithIntl(<PlacesListView />);

    await waitFor(() => expect(screen.getByText("No places found.")).toBeTruthy());
  });

  it("sends the visitor's point rounded to ~1 km (in the POST body) and shows coarse distances", async () => {
    vi.mocked(placesService.list).mockResolvedValue(paginated([]));
    vi.mocked(placesService.nearby).mockReset().mockResolvedValue(paginated([place({ id: "a", name: "Next door", distanceMeters: 0 }), place({ id: "b", name: "Across town", distanceMeters: 3000 })]));
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 35.712345, longitude: 51.398765 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });

    renderWithIntl(<PlacesListView />);
    fireEvent.click(await screen.findByRole("button", { name: "Search near me" }));

    await waitFor(() => expect(placesService.nearby).toHaveBeenCalledWith(expect.objectContaining({ latitude: 35.71, longitude: 51.4 })));
    expect(await screen.findByText(/Next door/)).toBeTruthy();
    expect(screen.getByText(/<1 km/)).toBeTruthy();
    expect(screen.getByText(/~3 km/)).toBeTruthy();
  });
});
