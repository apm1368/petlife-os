import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { InsuranceProductDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { insuranceService } from "@/services/insurance.service";
import { InsuranceProductDetailView } from "./InsuranceProductDetailView";

vi.mock("@/services/insurance.service", () => ({ insuranceService: { getProduct: vi.fn(), checkEligibility: vi.fn(), createApplication: vi.fn() } }));

function product(overrides: Partial<InsuranceProductDto> = {}): InsuranceProductDto {
  return {
    id: "product-1",
    providerId: "provider-1",
    providerName: "Acme Insurance",
    providerLogoUrl: null,
    providerWebsiteUrl: null,
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
    vi.mocked(insuranceService.getProduct).mockReset();
    vi.mocked(insuranceService.checkEligibility).mockReset();
    vi.mocked(insuranceService.createApplication).mockReset();
  });

  it("always shows exclusions near the top, never buried below coverage benefits", async () => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product());

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    await waitFor(() => expect(screen.getByText("Pre-existing conditions")).toBeTruthy());
    expect(screen.getByText("Cosmetic surgery")).toBeTruthy();
    expect(screen.getByText("Exclusions — read before contacting the insurer")).toBeTruthy();
  });

  it("only reads comparison data and never starts eligibility or an in-product application", async () => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product());

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    await waitFor(() => expect(screen.getByText("Basic Plan", { exact: false })).toBeTruthy());
    expect(screen.queryByText("Start application")).toBeNull();
    expect(insuranceService.checkEligibility).not.toHaveBeenCalled();
    expect(insuranceService.createApplication).not.toHaveBeenCalled();
  });

  it("links to the actual insurer website when one is available", async () => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product({ providerWebsiteUrl: "https://insurer.example/" }));

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    const link = await screen.findByRole("link", { name: "Visit insurer website" });
    expect(link.getAttribute("href")).toBe("https://insurer.example/");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not turn an unsafe or missing insurer URL into an outbound link", async () => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product({ providerWebsiteUrl: "javascript:alert(1)" }));

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />);

    expect(await screen.findByText("The insurer has not published a website link.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Visit insurer website" })).toBeNull();
  });

  it.each([
    ["de", "Versicherungsschutz", "Ausschlüsse — vor dem Kontakt mit dem Versicherer lesen", "Wartezeit: 14 Tage"],
    ["es", "Cobertura", "Exclusiones: léelas antes de contactar con la aseguradora", "Periodo de espera: 14 días"],
  ] as const)("localizes all product detail chrome in %s but preserves insurer terms", async (locale, coverageTitle, exclusionsTitle, waitingPeriod) => {
    vi.mocked(insuranceService.getProduct).mockResolvedValue(product({ waitingPeriodDays: 14 }));

    renderWithIntl(<InsuranceProductDetailView productId="product-1" />, locale);

    expect(await screen.findByText("Pre-existing conditions")).toBeTruthy();
    expect(screen.getByText(coverageTitle)).toBeTruthy();
    expect(screen.getByText(exclusionsTitle)).toBeTruthy();
    expect(screen.getByText(waitingPeriod)).toBeTruthy();
    expect(screen.getByText("Covers accidents")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

});
