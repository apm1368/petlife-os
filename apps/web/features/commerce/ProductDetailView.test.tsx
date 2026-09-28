import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { ProductDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { offer, productDetail, SELLER_A, SELLER_B } from "@/test/commerce-fixtures";
import { ProductDetailView } from "./ProductDetailView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));
vi.mock("@/services/commerce.service", () => ({
  commerceService: { getProductDetail: vi.fn(), addCartItem: vi.fn(), setFavorite: vi.fn(), listProductReviews: vi.fn() },
}));

const DETAIL: ProductDetailDto = productDetail({
  variants: [
    { id: "variant-2kg", productId: "prod-1", sku: "RC-DOG-2KG", barcode: null, title: "2kg", attributes: null, weightValue: 2, weightUnit: "KG" as never, isActive: true },
    { id: "variant-5kg", productId: "prod-1", sku: "RC-DOG-5KG", barcode: null, title: "5kg", attributes: null, weightValue: 5, weightUnit: "KG" as never, isActive: true },
  ],
  offers: [
    offer({ id: "offer-2kg-a", sellerOrganization: SELLER_A, productVariantId: "variant-2kg", priceAmount: 1_250_000, availableQuantity: 8, repeatDeliveryEligible: true, repeatIntervalsDays: [30] }),
    offer({ id: "offer-2kg-b", sellerOrganization: SELLER_B, productVariantId: "variant-2kg", priceAmount: 1_190_000, availableQuantity: 0 }),
    offer({ id: "offer-5kg-a", sellerOrganization: SELLER_A, productVariantId: "variant-5kg", priceAmount: 2_600_000, availableQuantity: 3 }),
  ],
  defaultOfferId: "offer-2kg-a",
  compatibility: { status: "COMPATIBLE" as never, reasons: [] },
  reviews: [{ id: "r1", rating: 5, body: "Luna loves it", authorName: "Sara", variantTitle: "2kg", verifiedPurchase: true, createdAt: "2026-09-01T00:00:00.000Z" }],
  rating: { average: 5, count: 1 },
});

describe("ProductDetailView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(commerceService.getProductDetail).mockReset();
    vi.mocked(commerceService.addCartItem).mockReset();
    vi.mocked(commerceService.setFavorite).mockReset();
  });

  it("shows compatibility, every offer for the variant with honest stock, and verified reviews", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);
    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Royal Canin Adult Dog Food" })).toBeTruthy());
    expect(screen.getByText("Compatible")).toBeTruthy();
    expect(screen.getAllByText("Pet Bazaar Tehran").length).toBeGreaterThan(0);
    expect(screen.getByText("Golestan Pet Supplies")).toBeTruthy();
    expect(screen.getAllByText("Out of stock").length).toBeGreaterThan(0);
    expect(screen.getByText("Luna loves it")).toBeTruthy();
    expect(screen.getByText("Verified purchase")).toBeTruthy();
  });

  it("the default offer is the server's choice (available), not the cheapest out-of-stock one", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);
    vi.mocked(commerceService.addCartItem).mockResolvedValue({} as never);
    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await screen.findByRole("heading", { name: "Royal Canin Adult Dog Food" });
    fireEvent.click(screen.getByText("Add to cart"));
    await waitFor(() => expect(commerceService.addCartItem).toHaveBeenCalledWith("offer-2kg-a", 1, "pet-1"));
  });

  it("re-scopes offers when another variant is selected", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);
    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await screen.findByRole("heading", { name: "Royal Canin Adult Dog Food" });
    fireEvent.click(screen.getByText("5kg"));
    await waitFor(() => expect(screen.queryByText("Golestan Pet Supplies")).toBeNull());
  });

  it("offers repeat delivery only for an eligible offer and never promises autopay", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);
    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await screen.findByRole("heading", { name: "Royal Canin Adult Dog Food" });
    expect(screen.getByText(/nothing is charged automatically/)).toBeTruthy();
    fireEvent.click(screen.getByText("Set up repeat delivery"));
    expect(push).toHaveBeenCalledWith("/en/repeat-delivery/new?productId=prod-1&offerId=offer-2kg-a&quantity=1");
  });

  it("toggles favorite optimistically", async () => {
    vi.mocked(commerceService.getProductDetail).mockResolvedValue(DETAIL);
    vi.mocked(commerceService.setFavorite).mockResolvedValue({ productId: "prod-1", favorited: true });
    renderWithIntl(<ProductDetailView productId="prod-1" />);
    await screen.findByRole("heading", { name: "Royal Canin Adult Dog Food" });
    fireEvent.click(screen.getByRole("button", { name: "Save to favorites" }));
    expect(commerceService.setFavorite).toHaveBeenCalledWith("prod-1", true);
    expect(screen.getByRole("button", { name: "Remove from favorites" })).toBeTruthy();
  });
});
