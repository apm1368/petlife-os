import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { RepeatDeliveryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { renderWithIntl } from "@/test/render-with-intl";
import { RepeatDeliveryListView } from "./RepeatDeliveryViews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ householdId: null }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listRepeatDeliveries: vi.fn() } }));

describe("RepeatDeliveryListView localization", () => {
  beforeEach(() => vi.mocked(commerceService.listRepeatDeliveries).mockReset());

  it.each([
    ["de", "Wiederkehrende Lieferungen", "Noch keine wiederkehrenden Lieferungen", /niemals automatisch/i],
    ["es", "Entregas periódicas", "Todavía no tienes entregas periódicas", /nunca realiza cargos automáticos/i],
  ] as const)("renders localized, non-autopay empty state in %s", async (locale, title, empty, noAutopay) => {
    vi.mocked(commerceService.listRepeatDeliveries).mockResolvedValue([]);

    renderWithIntl(<RepeatDeliveryListView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(empty)).toBeTruthy());
    expect(screen.getByText(noAutopay)).toBeTruthy();
  });

  it.each(["de", "es"] as const)("formats the next delivery date using the %s locale", async (locale) => {
    const nextCycleAt = "2026-01-01T00:00:00.000Z";
    const item: RepeatDeliveryDto = {
      id: "repeat-1",
      status: "ACTIVE" as never,
      product: { id: "product-1", title: "Product title from catalog", imageUrl: null },
      variantTitle: null,
      sellerOrganization: { id: "seller-1", name: "Seller from catalog", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: null },
      sellerOfferId: "offer-1",
      quantity: 2,
      intervalDays: 30,
      allowedIntervalsDays: [30],
      nextCycleAt,
      addressId: null,
      addressLabel: null,
      acceptedUnitPrice: 100_000,
      currentUnitPrice: 100_000,
      priceChanged: false,
      available: true,
      lastOrderId: null,
      events: [],
      createdAt: "2025-12-01T00:00:00.000Z",
    };
    vi.mocked(commerceService.listRepeatDeliveries).mockResolvedValue([item]);

    renderWithIntl(<RepeatDeliveryListView />, locale);

    expect(await screen.findByText(new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(nextCycleAt)), { exact: false })).toBeTruthy();
  });
});
