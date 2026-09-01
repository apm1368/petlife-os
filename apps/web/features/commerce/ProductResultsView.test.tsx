import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ProductSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { ProductResultsView } from "./ProductResultsView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { searchProducts: vi.fn() } }));

const PRODUCT: ProductSummaryDto = {
  id: "prod-1",
  title: "Grain-Free Training Treats",
  slug: "grain-free-training-treats",
  brand: null,
  category: { id: "cat-2", parentId: null, name: "Treats", slug: "treats", status: "ACTIVE" as never },
  variantId: "variant-2",
  variantTitle: "200g",
  bestOffer: {
    id: "offer-2",
    sellerOrganization: { id: "seller-2", name: "Golestan Pet Supplies", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
    productVariantId: "variant-2",
    priceAmount: 320_000,
    compareAtAmount: null,
    currency: "IRR",
    status: "ACTIVE" as never,
    availableQuantity: 25,
  },
  compatibility: { status: "LIKELY_COMPATIBLE" as never, reasons: [] },
};

describe("ProductResultsView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.searchProducts).mockReset();
  });

  it("lists products returned for the active pet", async () => {
    vi.mocked(commerceService.searchProducts).mockResolvedValue([PRODUCT]);

    renderWithIntl(<ProductResultsView category="cat-2" />);

    await waitFor(() => expect(screen.getByText("Grain-Free Training Treats")).toBeTruthy());
    expect(commerceService.searchProducts).toHaveBeenCalledWith({ category: "cat-2", search: undefined, petId: "pet-1" });
  });

  it("shows an empty state when no products match", async () => {
    vi.mocked(commerceService.searchProducts).mockResolvedValue([]);

    renderWithIntl(<ProductResultsView category="cat-2" />);

    await waitFor(() => expect(screen.getByText("No products found.")).toBeTruthy());
  });
});
