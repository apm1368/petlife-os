import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ServiceCategory, type ServiceSearchResultDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { servicesService } from "@/services/services.service";
import { ServiceResultsView } from "./ServiceResultsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));
vi.mock("@/services/services.service", () => ({ servicesService: { search: vi.fn() } }));

const RESULT: ServiceSearchResultDto = {
  provider: {
    id: "provider-1",
    name: "Happy Paws Grooming",
    type: "GROOMER" as never,
    verificationStatus: "VERIFIED" as never,
    description: null,
    logoUrl: null,
    locations: [],
    services: [],
    nextAvailableSlotStart: "2026-09-10T05:30:00.000Z",
  },
  service: {
    id: "svc-1",
    providerOrganizationId: "provider-1",
    locationId: "loc-1",
    name: "Full Groom & Bath",
    description: null,
    type: "GROOMING_SESSION" as never,
    category: ServiceCategory.GROOMING,
    durationMinutes: 60,
    priceAmount: 550000,
    currency: "IRR",
    supportsDog: true,
    supportsCat: true,
    minAgeMonths: null,
    maxAgeMonths: null,
    minWeightKg: null,
    maxWeightKg: null,
    requiresCareProfile: false,
    requiresHealthBasics: false,
    locationMode: "AT_PROVIDER" as never,
    isActive: true,
  },
  location: {
    id: "loc-1",
    providerOrganizationId: "provider-1",
    name: null,
    addressLine: "1 Valiasr St.",
    city: "Tehran",
    region: null,
    countryCode: "IR",
    latitude: null,
    longitude: null,
    phone: null,
    timezone: "Asia/Tehran",
  },
  compatibility: { status: "COMPATIBLE" as never, reasons: [] },
  nextAvailableSlotStart: "2026-09-10T05:30:00.000Z",
};

describe("ServiceResultsView", () => {
  beforeEach(() => {
    vi.mocked(servicesService.search).mockReset();
  });

  it("shows a verified provider with its compatibility status", async () => {
    vi.mocked(servicesService.search).mockResolvedValue([RESULT]);

    renderWithIntl(<ServiceResultsView category={ServiceCategory.GROOMING} />);

    await waitFor(() => expect(screen.getByText("Happy Paws Grooming")).toBeTruthy());
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("Compatible")).toBeTruthy();
  });

  it("shows NEEDS_REVIEW with its reason instead of hiding it", async () => {
    vi.mocked(servicesService.search).mockResolvedValue([
      { ...RESULT, compatibility: { status: "NEEDS_REVIEW" as never, reasons: ["CARE_PROFILE_REQUIRED" as never] } },
    ]);

    renderWithIntl(<ServiceResultsView category={ServiceCategory.GROOMING} />);

    await waitFor(() => expect(screen.getByText("Needs review")).toBeTruthy());
  });

  it("shows an empty state when no providers are found", async () => {
    vi.mocked(servicesService.search).mockResolvedValue([]);

    renderWithIntl(<ServiceResultsView category={ServiceCategory.GROOMING} />);

    await waitFor(() => expect(screen.getByText("No providers found yet.")).toBeTruthy());
  });
});
