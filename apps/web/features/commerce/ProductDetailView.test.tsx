import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProductDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { ProductDetailView } from "./ProductDetailView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));
vi.mock("@/services/commerce.service", () => ({
  commerceService: { getProductDetail: vi.fn(), addCartItem: vi.fn() },
}));

const SELLER_A = { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" };
const SELLER_B = { id: "seller-b", name: "Golestan Pet Supplies", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Karaj" };

const DETAIL: ProductDetailDto = {
  id: "prod-1",
  title: "Royal Canin Adult Dog Food",
  slug: "royal-canin-adult-dog-food",
  description: "Complete nutrition for adult dogs.",
  brand: { id: "brand-1", name: "Royal Canin", slug: "royal-canin", logoUrl: null, status: "ACTIVE" as never },
  category: { id: "cat-1", parentId: null, name: "Food", slug: "food", status: "ACTIVE" as never },
  status: "ACTIVE" as never,
  variants: [
    { id: "variant-2kg", productId: "prod-1", sku: "RC-DOG-2KG", barcode: null, title: "2kg", attributes: null, weightValue: 2, weightUnit: "KG" as never, isActive: true },
    { id: "variant-5kg", productId: "prod-1", sku: "RC-DOG-5KG", barcode: null, title: "5kg", attributes: null, weightValue: 5, weightUnit: "KG" as never, isActive: true },
  ],
  offers: [
    { id: "offer-2kg-a", sellerOrganization: SELLER_A, productVariantId: "variant-2kg", priceAmount: 1_250_000, compareAtAmount: null, currency: "IRR", status: "ACTIVE" as never, availableQuantity: 8 },
    { id: "offer-2kg-b", sellerOrganization: SELLER_B, productVariantId: "variant-2kg", priceAmount: 1_190_000, compareAtAmount: null, currency: "IRR", status: "ACTIVE" as never, availableQuantity: 0 },
    { id: "offer-5kg-a", sellerOrganization: SELLER_A, productVariantId: "variant-5kg", priceAmount: 2_600_000, compareAtAmount: null, currency: "IRR", status: "ACTIVE" as never, availableQuantity: 3 },
  ],
  compatibility: { status: "COMPATIBLE" as never, reasons: [] },
};

describe("ProductDetailView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getProductDetail).mockReset();
    vi.mocked(commerceService.addCartItem).mockReset();
  });

  it("shows compatibility above the add-to-cart action and offers scoped to the selected variant", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);

    renderWithIntl(<ProductDetailView productId="prod-1" />);

    await waitFor(() => expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy());
    expect(screen.getByText("Compatible")).toBeTruthy();
    expect(screen.getByText("Pet Bazaar Tehran")).toBeTruthy();
    expect(screen.getByText("Golestan Pet Supplies")).toBeTruthy();
    expect(screen.getByText("Out of stock")).toBeTruthy();
  });

  it("re-scopes the offer list when a different variant is selected", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);

    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await waitFor(() => expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy());

    fireEvent.click(screen.getByText("5kg"));

    await waitFor(() => expect(screen.queryByText("Golestan Pet Supplies")).toBeNull());
    expect(screen.getByText("Pet Bazaar Tehran")).toBeTruthy();
  });

  it("adds the selected offer and quantity to the cart, targeting the active pet", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);
    vi.mocked(commerceService.addCartItem).mockResolvedValue({} as never);

    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await waitFor(() => expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy());

    fireEvent.click(screen.getByText("Add to cart"));

    await waitFor(() => expect(commerceService.addCartItem).toHaveBeenCalledWith("offer-2kg-a", 1, "pet-1"));
  });
});
