import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ProviderType, ProviderVerificationStatus, type ProviderSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { providersService } from "@/services/providers.service";
import { FindVetView } from "./FindVetView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/providers.service", () => ({ providersService: { searchVets: vi.fn() } }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: null }) }));

const VERIFIED_PROVIDER: ProviderSummaryDto = {
  id: "provider-1",
  name: "Tehran Pet Care Clinic",
  type: ProviderType.VET_CLINIC,
  verificationStatus: ProviderVerificationStatus.VERIFIED,
  description: null,
  logoUrl: null,
  locations: [
    {
      id: "loc-1",
      providerOrganizationId: "provider-1",
      name: null,
      addressLine: "12 Vanak St.",
      city: "Tehran",
      region: null,
      countryCode: "IR",
      latitude: null,
      longitude: null,
      phone: null,
      timezone: "Asia/Tehran",
    },
  ],
  services: [
    {
      id: "svc-1",
      providerOrganizationId: "provider-1",
      locationId: "loc-1",
      name: "General Vet Visit",
      description: null,
      type: "GENERAL_VET_VISIT" as never,
      category: "VET" as never,
      durationMinutes: 30,
      priceAmount: null,
      currency: null,
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
  ],
  nextAvailableSlotStart: "2026-09-10T05:30:00.000Z",
};

describe("FindVetView", () => {
  beforeEach(() => {
    vi.mocked(providersService.searchVets).mockReset();
  });

  it("shows a verified badge and the next available time for a verified provider", async () => {
    vi.mocked(providersService.searchVets).mockResolvedValue([VERIFIED_PROVIDER]);

    renderWithIntl(<FindVetView />);

    await waitFor(() => expect(screen.getByText("Tehran Pet Care Clinic")).toBeTruthy());
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText("General Vet Visit")).toBeTruthy();
  });

  it("shows a no-availability state when a provider has no next available slot", async () => {
    vi.mocked(providersService.searchVets).mockResolvedValue([{ ...VERIFIED_PROVIDER, nextAvailableSlotStart: null }]);

    renderWithIntl(<FindVetView />);

    await waitFor(() => expect(screen.getByText("No availability found")).toBeTruthy());
  });

  it("shows an empty state when no vets are found", async () => {
    vi.mocked(providersService.searchVets).mockResolvedValue([]);

    renderWithIntl(<FindVetView />);

    await waitFor(() => expect(screen.getByText("No vets found yet.")).toBeTruthy());
  });
});
