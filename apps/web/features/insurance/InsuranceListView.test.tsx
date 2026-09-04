import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { InsuranceProductDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { insuranceService } from "@/services/insurance.service";
import { InsuranceListView } from "./InsuranceListView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/services/insurance.service", () => ({ insuranceService: { listProducts: vi.fn() } }));

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
    exclusions: ["Pre-existing conditions"],
    termsSource: null,
    termsUrl: null,
    status: "VERIFIED" as never,
    isPubliclyListed: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function paginated(items: InsuranceProductDto[]): PaginatedDto<InsuranceProductDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("InsuranceListView", () => {
  beforeEach(() => {
    vi.mocked(insuranceService.listProducts).mockReset();
  });

  it("shows publicly listed products with a preview of their exclusions", async () => {
    vi.mocked(insuranceService.listProducts).mockResolvedValue(paginated([product()]));

    renderWithIntl(<InsuranceListView />);

    await waitFor(() => expect(screen.getByText("Acme Insurance — Basic Plan")).toBeTruthy());
    expect(screen.getByText(/Pre-existing conditions/)).toBeTruthy();
  });

  it("shows a localized empty state when there are no products", async () => {
    vi.mocked(insuranceService.listProducts).mockResolvedValue(paginated([]));

    renderWithIntl(<InsuranceListView />);

    await waitFor(() => expect(screen.getByText("No insurance products found.")).toBeTruthy());
  });
});
