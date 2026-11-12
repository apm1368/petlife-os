import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { placesService } from "@/services/places.service";
import { useSessionStore } from "@/stores/session-store";
import { PlaceDetailView } from "./PlaceDetailView";
import { telHref } from "./PlaceOsm";

vi.mock("@/services/places.service", () => ({ placesService: { get: vi.fn(), addFavorite: vi.fn(), removeFavorite: vi.fn(), claim: vi.fn(), myClaim: vi.fn() } }));

function vet(overrides: Partial<PetFriendlyPlaceDto> = {}): PetFriendlyPlaceDto {
  return {
    id: "place-osm",
    name: "Vet One",
    category: "VETERINARY" as never,
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
    verificationSource: "OPENSTREETMAP",
    verifiedAt: null,
    status: "UNVERIFIED" as never,
    isPubliclyListed: true,
    isFavorited: false,
    createdAt: "2026-11-13T00:00:00.000Z",
    source: "OSM",
    phone: "+98 21 000 0000",
    website: "https://vet-one.example/",
    claimed: false,
    osmUrl: "https://www.openstreetmap.org/node/42",
    ...overrides,
  };
}

describe("OpenStreetMap listings on the place page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ status: "unauthenticated", user: null });
    vi.mocked(placesService.myClaim).mockResolvedValue({ claim: null });
  });

  it("labels an unclaimed import as unverified, credits OpenStreetMap and shows the business contact as tagged", async () => {
    vi.mocked(placesService.get).mockResolvedValue(vet());
    renderWithIntl(<PlaceDetailView placeId="place-osm" />);
    expect(await screen.findByText("From OpenStreetMap · not verified yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" }).getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
    expect(screen.getByRole("link", { name: "View on OpenStreetMap" }).getAttribute("href")).toBe("https://www.openstreetmap.org/node/42");
    expect(screen.getByRole("link", { name: "+98 21 000 0000" }).getAttribute("href")).toBe("tel:+98210000000");
    expect(screen.getByRole("link", { name: "vet-one.example" }).getAttribute("rel")).toContain("nofollow");
    expect(screen.getByRole("heading", { name: "Is this your business?" })).toBeTruthy();
  });

  it("asks a signed-out visitor to sign in before claiming", async () => {
    vi.mocked(placesService.get).mockResolvedValue(vet());
    renderWithIntl(<PlaceDetailView placeId="place-osm" />);
    fireEvent.click(await screen.findByRole("button", { name: "Claim it" }));
    expect(screen.getByRole("link", { name: "Sign in to claim it" }).getAttribute("href")).toBe(`/en/welcome?returnTo=${encodeURIComponent("/en/places/place-osm")}`);
    expect(placesService.claim).not.toHaveBeenCalled();
  });

  it("files a claim and points a member without a partner account to the next step", async () => {
    useSessionStore.setState({ status: "authenticated", user: { id: "u1" } as never });
    vi.mocked(placesService.get).mockResolvedValue(vet());
    vi.mocked(placesService.claim).mockResolvedValue({ claimId: "c1", status: "PENDING", nextStep: "CREATE_PARTNER_ACCOUNT" });
    renderWithIntl(<PlaceDetailView placeId="place-osm" />);
    fireEvent.click(await screen.findByRole("button", { name: "Claim it" }));
    await waitFor(() => expect(placesService.claim).toHaveBeenCalledWith("place-osm"));
    expect(await screen.findByText(/Next: create a partner \(business\) account/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create a partner account" }).getAttribute("href")).toBe("/en/contact");
  });

  it("shows a claimed listing as managed by the business, with no claim button", async () => {
    vi.mocked(placesService.get).mockResolvedValue(vet({ claimed: true, status: "VERIFIED" as never, verifiedAt: "2026-11-14T00:00:00.000Z" }));
    renderWithIntl(<PlaceDetailView placeId="place-osm" />);
    expect(await screen.findByText(/managed by the business itself/)).toBeTruthy();
    expect(screen.queryByText("From OpenStreetMap · not verified yet")).toBeNull();
    expect(screen.queryByRole("button", { name: "Claim it" })).toBeNull();
  });

  it("builds safe links: Persian digits dial, and a non-http website is not linked", async () => {
    expect(telHref("۰۲۱ ۸۸۸۸ ۱۲۳۴")).toBe("tel:02188881234");
    expect(telHref("—")).toBeNull();
    vi.mocked(placesService.get).mockResolvedValue(vet({ website: "javascript:alert(1)", phone: "۰۲۱ ۸۸۸۸ ۱۲۳۴" }));
    renderWithIntl(<PlaceDetailView placeId="place-osm" />);
    expect((await screen.findByRole("link", { name: "۰۲۱ ۸۸۸۸ ۱۲۳۴" })).getAttribute("href")).toBe("tel:02188881234");
    expect(screen.queryByText(/javascript/)).toBeNull();
  });
});
