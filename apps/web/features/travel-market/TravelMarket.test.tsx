import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { TravelBookingDto, TravelListingDetailDto, TravelSearchResultDto, TripHubDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { TravelResultsView } from "./TravelResultsView";
import { TravelListingDetailView } from "./TravelListingDetailView";
import { TravelBookingFlowView } from "./TravelBookingFlowView";
import { TripHubView } from "./TripHubView";
import { matchReason, policyFacts } from "./labels";

const params = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }), usePathname: () => "/fa/travel/search", useSearchParams: () => params }));
vi.mock("@/services/travel-marketplace.service", () => ({
  travelMarketService: { search: vi.fn(), destinations: vi.fn().mockResolvedValue([]), detail: vi.fn(), unitCalendar: vi.fn().mockResolvedValue([]), quote: vi.fn(), hold: vi.fn(), getBooking: vi.fn(), submit: vi.fn(), pay: vi.fn(), trips: vi.fn().mockResolvedValue([]), hub: vi.fn(), addRules: vi.fn(), favorite: vi.fn(), unfavorite: vi.fn(), reviews: vi.fn() },
}));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn().mockResolvedValue([]), listPets: vi.fn() } }));

const RATING = { average: null, count: 0, petFriendliness: null, cleanliness: null, location: null };

describe("travel results", () => {
  beforeEach(() => {
    useSessionStore.setState({ status: "unauthenticated" });
    params.forEach((_, k) => params.delete(k));
  });

  it("shows an honest map-unavailable state instead of a fake map, and keeps the list", async () => {
    vi.mocked(travelMarketService.search).mockResolvedValue({ items: [{ id: "l1", title: "باغ رامسر", type: "VILLA", city: "رامسر", province: null, country: "IR", coverUrl: null, latitude: null, longitude: null, isVerified: true, bookingMode: "INSTANT_BOOKING", rating: RATING, petPolicySummary: { dogsAllowed: true, catsAllowed: false, maxPets: 2, maxWeightKg: 20, petFeeIrr: 0, stated: true }, stay: null, fromNightlyIrr: 30_000_000, freeCancellationAvailable: true, distanceKm: null, petMatch: null, amenities: [], favorited: false }], total: 1, page: 1, pageSize: 12, facets: { types: [], amenities: [], priceRange: null }, mapAvailable: false } as unknown as TravelSearchResultDto);
    renderWithIntl(<TravelResultsView />, "fa");
    expect(await screen.findByText("باغ رامسر")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "نقشه" }));
    expect(screen.getByText("نقشه در حال حاضر در دسترس نیست")).toBeTruthy();
    expect(screen.getByText("باغ رامسر")).toBeTruthy();
    expect(screen.getByText(/سگ · تا ۲۰ کیلو · بدون هزینهٔ حیوان/)).toBeTruthy();
  });

  it("says when a stay has not stated its pet rules", async () => {
    vi.mocked(travelMarketService.search).mockResolvedValue({ items: [{ id: "l2", title: "Plain Inn", type: "HOTEL", city: "Tabriz", province: null, country: "IR", coverUrl: null, latitude: null, longitude: null, isVerified: false, bookingMode: "REQUEST_TO_BOOK", rating: RATING, petPolicySummary: { dogsAllowed: false, catsAllowed: false, maxPets: null, maxWeightKg: null, petFeeIrr: null, stated: false }, stay: null, fromNightlyIrr: null, freeCancellationAvailable: false, distanceKm: null, petMatch: null, amenities: [], favorited: false }], total: 1, page: 1, pageSize: 12, facets: { types: [], amenities: [], priceRange: null }, mapAvailable: false } as unknown as TravelSearchResultDto);
    renderWithIntl(<TravelResultsView />, "en");
    expect(await screen.findByText("Pet rules: not specified")).toBeTruthy();
    expect(screen.getByText("Request to book")).toBeTruthy();
  });
});

describe("pet policy copy", () => {
  it("lists every unknown as Not specified, never as allowed", () => {
    const facts = policyFacts(null, "en");
    expect(facts).toEqual([{ label: "Pet policy", value: "Not specified" }]);
    const partial = policyFacts({ dogsAllowed: true, catsAllowed: false, otherAllowed: false, maxPets: null, maxWeightKg: null, minWeightKg: null, breedRestrictions: [], vaccinationRequired: false, healthCertificateRequired: false, carrierRequired: false, leashRequired: false, petFeeIrr: null, depositIrr: null, restrictedAreas: null, notes: null }, "en");
    expect(partial.find((f) => f.label === "Maximum weight")!.value).toBe("Not specified");
    expect(partial.find((f) => f.label === "Pet fee")!.value).toBe("Not specified");
  });

  it("explains match reasons in plain language", () => {
    expect(matchReason({ petId: "p", petName: "Milo", code: "OVER_MAX_WEIGHT", detail: { maxWeightKg: 10, weightKg: 14 } }, "en")).toBe("Milo: recorded weight 14 kg is above the 10 kg limit.");
    expect(matchReason({ petId: null, petName: null, code: "POLICY_NOT_STATED" }, "fa")).toContain("اعلام نکرده");
  });
});

const LISTING = {
  id: "l1", organizationId: "o", organizationName: "Host", type: "HOTEL", title: "Stay One", description: "A calm place", country: "IR", city: "Rasht", address: null, latitude: null, longitude: null, imageObjectKeys: [], imageUrls: [], amenities: [], pricingMode: "PER_NIGHT", bookingMode: "INSTANT_BOOKING", status: "PUBLISHED", cancellationPolicy: null, isVerified: false, isPubliclyListed: true, petPolicy: null,
  units: [{ id: "u1", listingId: "l1", name: "Room", description: null, quantity: 1, maxOccupancy: 2, basePriceIrr: 1_000_000, isActive: true, createdAt: "", updatedAt: "", bedInfo: null, sizeSqm: null, amenities: [], maxPets: null, petNotes: null, ratePlans: [] }],
  fromPriceIrr: 1_000_000, createdAt: "", updatedAt: "", province: null, checkInFrom: null, checkOutUntil: null, houseRules: null, media: [], rating: RATING, moderationNote: null, reviews: [], favorited: false, nearbyPlaces: [], nearbyVets: [], mapAvailable: false,
} as unknown as TravelListingDetailDto;

describe("listing detail", () => {
  it("shows unstated pet rules and check-in times as Not specified, and asks guests to sign in to reserve", async () => {
    useSessionStore.setState({ status: "unauthenticated" });
    vi.mocked(travelMarketService.detail).mockResolvedValue(LISTING);
    renderWithIntl(<TravelListingDetailView listingId="l1" />, "en");
    expect(await screen.findByRole("heading", { name: "Stay One" })).toBeTruthy();
    expect(screen.getAllByText("Not specified").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole("button", { name: "Sign in to reserve" }).length).toBeGreaterThan(0);
  });
});

const BOOKING = {
  id: "b1", reference: "TRV-1", listingId: "l1", listingTitle: "Stay One", listingType: "HOTEL", bookingMode: "REQUEST_TO_BOOK", listingCity: "Rasht", unitId: "u1", unitName: "Room", householdId: "h", bookedByUserId: "u", tripId: null, status: "HELD", checkIn: "2026-10-10", checkOut: "2026-10-12", nights: 2, guests: 1,
  pets: [{ petId: "p1", petName: "Milo", petSpecies: "DOG" }], baseAmountIrr: 2_000_000, petFeeAmountIrr: 0, depositAmountIrr: 0, totalAmountIrr: 2_000_000, cancellationPolicySnapshot: null, providerNote: null, travelerNote: null, requestedAt: "", respondedAt: null, confirmedAt: null, cancelledAt: null, completedAt: null, createdAt: "", updatedAt: "",
  ratePlanId: null, ratePlan: null, petPolicySnapshot: null, priceBreakdown: { nightly: [], staySubtotalIrr: 2_000_000, rateAdjustmentIrr: 0, petFeeIrr: 0, petDepositIrr: 0, discountIrr: 0, totalIrr: 2_000_000, payNowIrr: 2_000_000, payLaterIrr: 0 }, discountAmountIrr: 0, payNowAmountIrr: 2_000_000, paymentStatus: "NOT_REQUIRED",
  holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), requestExpiresAt: null, refundAmountIrr: 0, cancelReason: null, cancelledBy: null, listingCoverUrl: null,
  timeline: [{ fromStatus: null, toStatus: "HELD", actorType: "TRAVELER", reason: "MORE_INFO_NEEDED", createdAt: new Date().toISOString() }], canCancel: true, canModify: false, canReview: false, reviewId: null, refundPreviewIrr: null, documentShares: [],
} as unknown as TravelBookingDto;

describe("booking flow", () => {
  it("requires acknowledging missing pet information and explains request-to-book before sending", async () => {
    vi.mocked(travelMarketService.getBooking).mockResolvedValue(BOOKING);
    vi.mocked(travelMarketService.submit).mockResolvedValue({ ...BOOKING, status: "AWAITING_PROVIDER" } as TravelBookingDto);
    renderWithIntl(<TravelBookingFlowView bookingId="b1" />, "en");
    const next = (await screen.findByRole("button", { name: "Continue" })) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Nothing is charged until it accepts/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send booking request" }));
    await waitFor(() => expect(travelMarketService.submit).toHaveBeenCalledWith("b1", { travelerNote: undefined, tripId: undefined, acknowledgeMissingInfo: true }));
    expect(await screen.findByText(/Your request was sent to the property/)).toBeTruthy();
  });
});

describe("trip hub", () => {
  it("shows requirement provenance, document state and library suggestions", async () => {
    vi.mocked(travelMarketService.hub).mockResolvedValue({
      trip: { id: "t1", householdId: "h", petId: "p1", petName: "Milo", petPhotoUrl: null, createdByUserId: "u", originCountry: "IR", originCity: null, destinationCountry: "IR", destinationCity: "Shiraz", departAt: "2026-10-10T08:00:00.000Z", returnAt: null, travelMode: "ROAD", status: "PLANNING", notes: null, requirementsCount: 1, createdAt: "", updatedAt: "" },
      petName: "Milo", petSpecies: "DOG", phase: "PLANNING", bookings: [],
      readiness: { tripId: "t1", status: "PLANNING", readyCount: 0, totalCount: 1, allReady: false, hasStaleRequirement: true, requirements: [{ id: "r1", tripId: "t1", requirementType: "RABIES", status: "REQUIRED", source: "Iran Veterinary Organization", sourceUrl: "https://ivo.ir", jurisdiction: "IR", verifiedAt: "2025-01-01T00:00:00.000Z", validUntil: null, isStale: true, linkedMedicalDocumentId: null, linkedMedicalDocumentTitle: null, notes: null, createdAt: "", updatedAt: "2026-09-01T00:00:00.000Z" }] },
      documentStates: { r1: "MISSING" }, documents: [], insuranceApplications: [], nearbyPlaces: [], favoritePlaces: [], nearbyVets: [], activity: [],
      suggestions: { requirementRules: [{ id: "rule1", country: "IR", city: null, requirementType: "MICROCHIP", title: "Microchip", description: "ISO chip", species: [], source: "IVO", sourceUrl: null, verifiedAt: "2026-09-01T00:00:00.000Z", validUntil: null, status: "ACTIVE", isStale: false }] },
    } as unknown as TripHubDto);
    renderWithIntl(<TripHubView tripId="t1" />, "en");
    expect(await screen.findByText(/Source: Iran Veterinary Organization/)).toBeTruthy();
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getByText(/have not been re-verified recently/)).toBeTruthy();
    expect(screen.getByText("Microchip")).toBeTruthy();
  });
});
