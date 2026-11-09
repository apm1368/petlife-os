import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { screen, waitFor } from "@testing-library/react";
import type { InsuranceProductDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { insuranceService } from "@/services/insurance.service";
import { InsuranceCompareView } from "./InsuranceCompareView";

vi.mock("@/services/insurance.service", () => ({ insuranceService: { compareProducts: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement("a", { ...props, href }, children),
}));

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
    waitingPeriodDays: 14,
    deductibleAmountIrr: 1_234_500,
    annualLimitIrr: 12_345_000,
    coinsurancePercent: null,
    premiumMinIrr: 2_345_000,
    premiumMaxIrr: 3_456_000,
    exclusions: ["Pre-existing conditions"],
    termsSource: null,
    termsUrl: null,
    status: "VERIFIED" as never,
    isPubliclyListed: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("InsuranceCompareView", () => {
  beforeEach(() => vi.mocked(insuranceService.compareProducts).mockReset());

  it.each([
    ["fa", "مقایسه طرح‌ها", "تأییدشده"],
    ["en", "Compare plans", "Verified"],
    ["de", "Versicherungspläne vergleichen", "Verifiziert"],
    ["es", "Comparar planes de seguro", "Verificado"],
  ] as const)("renders translated comparison chrome in %s while preserving insurer content", async (locale, title, verified) => {
    vi.mocked(insuranceService.compareProducts).mockResolvedValue([product()]);

    renderWithIntl(<InsuranceCompareView productIds={["product-1"]} />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText("Acme Insurance — Basic Plan")).toBeTruthy();
    expect(screen.getByText("Covers accidents")).toBeTruthy();
    expect(screen.getByText("Pre-existing conditions")).toBeTruthy();
    expect(screen.getByText(verified)).toBeTruthy();
    if (locale === "de" || locale === "es") {
      expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
      expect(screen.getByText(/123\.450 Toman/)).toBeTruthy();
    }
  });

  it.each([
    ["fa", "برای مقایسه، محصول بیمه‌ای پیدا نشد."],
    ["en", "No insurance products were found for this comparison."],
    ["de", "Für diesen Vergleich wurden keine Versicherungsprodukte gefunden."],
    ["es", "No se encontraron productos de seguro para esta comparación."],
  ] as const)("renders a truthful empty state in %s", async (locale, emptyText) => {
    vi.mocked(insuranceService.compareProducts).mockResolvedValue([]);

    renderWithIntl(<InsuranceCompareView productIds={[]} />, locale);

    expect(await screen.findByText(emptyText)).toBeTruthy();
  });

  it("shows a localized loading label before the comparison response", async () => {
    vi.mocked(insuranceService.compareProducts).mockResolvedValue([]);

    renderWithIntl(<InsuranceCompareView productIds={["product-1"]} />, "de");

    expect(screen.getByLabelText("Versicherungsvergleich wird geladen …")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Für diesen Vergleich wurden keine Versicherungsprodukte gefunden.")).toBeTruthy());
  });

});
