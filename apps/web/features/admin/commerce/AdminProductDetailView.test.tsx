import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { AdminProductDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { ApiError } from "@/lib/api/client";
import { AdminProductDetailView } from "./AdminProductDetailView";

vi.mock("@/services/admin-commerce.service", () => ({ adminCommerceService: { getProduct: vi.fn() } }));

const PRODUCT: AdminProductDetailDto = {
  id: "p-1",
  title: "Kibble",
  slug: "kibble",
  status: "ACTIVE" as never,
  categoryName: "Food",
  brandName: null,
  category: { id: "c-1", name: "Food" },
  brand: null,
  variantCount: 1,
  activeOfferCount: 2,
  sellerCount: 2,
  rating: { average: 4.5, count: 2 },
  mediaCount: 3,
  hasMedia: true,
  createdAt: "2026-11-01T00:00:00.000Z",
  variants: [{ id: "v-1", sku: "KIB-1", title: "1 kg", isActive: true }],
  offers: [
    { id: "o-1", variantId: "v-1", variantSku: "KIB-1", variantTitle: "1 kg", seller: { id: "s-1", name: "Live Shop", status: "ACTIVE", verificationStatus: "VERIFIED" }, status: "ACTIVE", moderationStatus: "APPROVED", moderationReason: null, priceAmount: 900_000, compareAtAmount: null, currency: "IRR", sellerSku: null, stock: { onHand: 10, reserved: 3, available: 7 }, buyable: true, updatedAt: "2026-11-12T10:00:00.000Z" },
    { id: "o-2", variantId: "v-1", variantSku: "KIB-1", variantTitle: "1 kg", seller: { id: "s-2", name: "Quiet Shop", status: "SUSPENDED", verificationStatus: "VERIFIED" }, status: "ACTIVE", moderationStatus: "APPROVED", moderationReason: null, priceAmount: 800_000, compareAtAmount: null, currency: "IRR", sellerSku: "Q-1", stock: null, buyable: false, updatedAt: "2026-11-12T10:00:00.000Z" },
  ],
  catalogRequests: [{ id: "r-1", status: "MATCHED_EXISTING", sellerName: "Quiet Shop", requestedTitle: "Kibble one kilo", reviewedAt: "2026-11-10T10:00:00.000Z", decisionReason: "Same product" }],
  lowestBuyablePrice: 900_000,
};

describe("AdminProductDetailView", () => {
  beforeEach(() => vi.mocked(adminCommerceService.getProduct).mockReset());

  it("shows each seller's price, stock and whether it can be bought", async () => {
    vi.mocked(adminCommerceService.getProduct).mockResolvedValue(PRODUCT);
    renderWithIntl(<AdminProductDetailView productId="p-1" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Kibble" })).toBeTruthy());
    expect(screen.getByText("Live Shop")).toBeTruthy();
    expect(screen.getByText("7 available")).toBeTruthy();
    expect(screen.getByText("10 on hand · 3 reserved")).toBeTruthy();
    expect(screen.getByText("Buyable now")).toBeTruthy();
    expect(screen.getByText("Shop suspended · verified")).toBeTruthy();
    expect(screen.getByText("No stock record")).toBeTruthy();
    expect(screen.getByText("Matched to this product")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("says when the product does not exist", async () => {
    vi.mocked(adminCommerceService.getProduct).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "nope", requestId: "r" }, 404));
    renderWithIntl(<AdminProductDetailView productId="missing" />);
    await waitFor(() => expect(screen.getByText("Product not found")).toBeTruthy());
  });
});
