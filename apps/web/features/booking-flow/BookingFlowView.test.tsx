import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { useSessionStore } from "@/stores/session-store";
import { BookingFlowView } from "./BookingFlowView";

const params = new URLSearchParams();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push }), usePathname: () => "/fa/providers/p1/book", useSearchParams: () => params }));
vi.mock("@/services/discovery.service", () => ({ discoveryService: { profile: vi.fn() } }));
vi.mock("@/services/services.service", () => ({ servicesService: { getAvailability: vi.fn().mockResolvedValue({ petCompatible: true, slots: [] }) } }));
vi.mock("@/services/bookings.service", () => ({ bookingsService: { createHold: vi.fn(), confirm: vi.fn(), joinWaitlist: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn().mockResolvedValue([]), listPets: vi.fn() } }));
vi.mock("@/services/addresses.service", () => ({ addressesService: { list: vi.fn() } }));

const SERVICE = {
  id: "s1", providerOrganizationId: "p1", locationId: "l1", name: "ویزیت عمومی", description: null, type: "GENERAL_VET_VISIT", category: "VET", durationMinutes: 30, priceAmount: 1_000_000, currency: "IRR",
  supportsDog: true, supportsCat: true, minAgeMonths: null, maxAgeMonths: null, minWeightKg: null, maxWeightKg: null, requiresCareProfile: false, requiresHealthBasics: false, locationMode: "AT_PROVIDER", isActive: true,
  bookingMode: "INSTANT", paymentMode: "PAY_AT_PROVIDER", depositAmount: null, cancellationPolicy: null, freeCancellationHours: 24, lateCancellationRefundPercent: 0, preparationNotes: null, maxPetsPerBooking: 1, requiredResourceType: null,
  variants: [{ id: "v1", serviceId: "s1", name: "ویزیت در منزل", description: null, priceAmount: 2_000_000, durationMinutes: 60, sortOrder: 0, isActive: true }],
  startingPrice: 1_000_000, homeVisit: false, staffIds: [],
} as unknown as ProviderProfile["services"][number];

const PROFILE = { id: "p1", name: "کلینیک مهر", type: "VET_CLINIC", verified: true, description: null, logoUrl: null, coverImageUrl: null, galleryUrls: [], specialties: [], policiesText: null, faqs: [], phone: null, websiteUrl: null, locations: [], services: [SERVICE], team: [], rating: { average: null, count: 0 }, reviews: [], completedBookings: 0, petTypes: ["DOG"], homeVisit: false } as ProviderProfile;

describe("BookingFlowView", () => {
  beforeEach(() => {
    vi.mocked(discoveryService.profile).mockResolvedValue(PROFILE);
    params.delete("serviceId");
    push.mockReset();
  });

  it("requires choosing a variant before continuing", async () => {
    useSessionStore.setState({ status: "authenticated" });
    renderWithIntl(<BookingFlowView providerId="p1" />, "fa");
    fireEvent.click(await screen.findByLabelText(/ویزیت عمومی/));
    const next = screen.getByRole("button", { name: "ادامه" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/ویزیت در منزل/));
    expect(next.disabled).toBe(false);
  });

  it("anonymous visitors are asked to sign in with a returnTo that keeps their choice", async () => {
    useSessionStore.setState({ status: "unauthenticated" });
    params.set("serviceId", "s1");
    renderWithIntl(<BookingFlowView providerId="p1" />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: "ورود و ادامه" }));
    expect(push).toHaveBeenCalledWith(expect.stringMatching(/\/fa\/welcome\?returnTo=.*serviceId%3Ds1/));
  });

  it("shows an honest not-bookable state for an unknown provider", async () => {
    const { ApiError } = await import("@/lib/api/client");
    vi.mocked(discoveryService.profile).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "x", requestId: "r" }, 404));
    renderWithIntl(<BookingFlowView providerId="p1" />, "en");
    expect(await screen.findByText("This provider cannot be booked")).toBeTruthy();
  });
});
