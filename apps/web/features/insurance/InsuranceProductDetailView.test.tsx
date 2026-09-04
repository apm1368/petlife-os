import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { InsuranceProductDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { insuranceService } from "@/services/insurance.service";
import { InsuranceProductDetailView } from "./InsuranceProductDetailView";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/services/insurance.service", () => ({ insuranceService: { getProduct: vi.fn(), checkEligibility: vi.fn(), createApplication: vi.fn() } }));

function product(overrides: Partial<InsuranceProductDto> = {}): InsuranceProductDto {
  return {
    id: "product-1",
    providerId: "provider-1",
    providerName: "Acme Insurance",
    providerLogoUrl: null,
    name: "Basic Plan",
    country: "IR",
    speciesEligibility: ["DOG"] as never,
    minAgeMonths: null,
    maxAgeMonths: null,
    coverageTypes: ["ACCIDENT"] as never,
    coverageSummary: "Covers accidents",
    waitingPeriodDays: null,
    deductibleAmountIrr: null,
    annualLimitIrr: null,
    coinsurancePercent: null,
    premiumMinIrr: null,
    premiumMaxIrr: null,
    exclusions: ["Pre-existing conditions", "Cosmetic surgery"],
    termsSource: null,
    termsUrl: null,
    status: "VERIFIED" as never,
    isPubliclyListed: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("InsuranceProductDetailView", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    push.mockReset();
    vi.mocked(insuranceService.getProduct).mockReset();
    vi.mocked(insuranceService.checkEligibility).mockReset();
  });

  it("always shows exclusions near the top, never buried below coverage benefits", async () => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product());

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    await waitFor(() => expect(screen.getByText("Pre-existing conditions")).toBeTruthy());
    expect(screen.getByText("Cosmetic surgery")).toBeTruthy();
    expect(screen.getByText("Exclusions — read before applying")).toBeTruthy();
  });

  it("never shows an eligibility check or apply action without a pet in context", async () => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product());

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    await waitFor(() => expect(screen.getByText("Basic Plan", { exact: false })).toBeTruthy());
    expect(screen.queryByText("Start application")).toBeNull();
  });

  it("never displays ELIGIBLE eligibility as a guarantee — the disclaimer is always shown alongside it", async () => {
    searchParams = new URLSearchParams("petId=pet-1");
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product());
    vi.mocked(insuranceService.checkEligibility).mockResolvedValue({ status: "POSSIBLY_ELIGIBLE" as never, reasons: ["PET_AGE_UNKNOWN"] });

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    await waitFor(() => expect(screen.getByText("Possibly eligible")).toBeTruthy());
    expect(screen.getByText("This is not a guarantee of approval — the insurer makes the final decision.")).toBeTruthy();
  });
});
