import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { discoveryService, type ProviderProfile } from "@/services/discovery.service";
import { ProviderProfileView } from "./ProviderProfileView";

vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span data-alt={props.alt} /> }));
vi.mock("@/services/discovery.service", () => ({ discoveryService: { profile: vi.fn() } }));
vi.mock("./WeekAvailability", () => ({ WeekAvailability: ({ locale }: { locale: string }) => <div data-testid="week-availability" data-locale={locale} /> }));

const PROFILE = {
  id: "provider-1",
  name: "Tehran Pet Care Clinic",
  type: "VET_CLINIC",
  verified: true,
  description: null,
  logoUrl: null,
  coverImageUrl: null,
  galleryUrls: [],
  specialties: ["DENTAL_CARE"],
  policiesText: null,
  faqs: [],
  phone: null,
  websiteUrl: null,
  locations: [{ id: "location-1", name: "Main", addressLine: "Vanak St.", region: "Vanak", city: "Tehran" }],
  services: [{ id: "service-1", name: "General vet visit", category: "VET", type: "GENERAL_VET_VISIT", startingPrice: 1_000_000, currency: "IRR", durationMinutes: 30, homeVisit: true, bookingMode: "INSTANT", paymentMode: "FULL_PREPAYMENT", depositAmount: null, variants: [], staffIds: [], locationId: "location-1", cancellationPolicy: null, freeCancellationHours: 24, lateCancellationRefundPercent: 50 }],
  team: [],
  rating: { average: 4.5, count: 2 },
  reviews: [],
  completedBookings: 8,
  petTypes: ["DOG", "CAT"],
  homeVisit: true,
} as unknown as ProviderProfile;

describe("ProviderProfileView localization", () => {
  beforeEach(() => vi.mocked(discoveryService.profile).mockReset());

  it("localizes the German public profile and retains locale-aware price and booking route", async () => {
    vi.mocked(discoveryService.profile).mockResolvedValue(PROFILE);
    renderWithIntl(<ProviderProfileView providerId="provider-1" />, "de");

    expect(await screen.findByRole("heading", { name: "Termine und medizinische Leistungen" })).toBeTruthy();
    expect(screen.getAllByText("Tierarztpraxis")).toHaveLength(2);
    expect(screen.getByText("100.000 Toman")).toBeTruthy();
    expect(screen.getByText("Zahnmedizin")).toBeTruthy();
    expect(screen.getByText("Hunde und Katzen")).toBeTruthy();
    expect(screen.getByTestId("week-availability").getAttribute("data-locale")).toBe("de");
    expect(screen.getAllByRole("link", { name: "Termin buchen" }).every((link) => link.getAttribute("href") === "/de/providers/provider-1/book")).toBe(true);
  });

  it("localizes the Spanish profile and preserves its route", async () => {
    vi.mocked(discoveryService.profile).mockResolvedValue(PROFILE);
    renderWithIntl(<ProviderProfileView providerId="provider-1" />, "es");

    expect(await screen.findByRole("heading", { name: "Citas y servicios clínicos" })).toBeTruthy();
    const bookingLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === "/es/providers/provider-1/book");
    expect(bookingLinks.length).toBeGreaterThan(0);
  });
});
