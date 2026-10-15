import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { CartDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { CartView } from "./CartView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/commerce.service", () => ({
  commerceService: { getCart: vi.fn(), updateCartItem: vi.fn(), removeCartItem: vi.fn(), clearCart: vi.fn() },
}));

const SELLER_A = { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" };
const SELLER_B = { id: "seller-b", name: "Golestan Pet Supplies", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Karaj" };

function offer(sellerOrganization: typeof SELLER_A, priceAmount: number) {
  return {
    id: `offer-${sellerOrganization.id}`,
    sellerOrganization,
    productVariantId: "variant-1",
    priceAmount,
    compareAtAmount: null,
    currency: "IRR",
    status: "ACTIVE" as never,
    availableQuantity: 10,
    effectiveUnitPrice: priceAmount,
    unitDiscount: 0,
    promotion: null,
    stockState: "IN_STOCK" as const,
    repeatDeliveryEligible: false,
    repeatIntervalsDays: [],
  };
}

const MULTI_SELLER_CART: CartDto = {
  id: "cart-1",
  status: "ACTIVE" as never,
  totalItems: 2,
  subtotalAmount: 2_440_000,
  currency: "IRR",
  hasSafetyConflict: false,
  discountAmount: 0,
  hasBlockingIssues: false,
  sellerGroups: [
    {
      sellerOrganization: SELLER_A,
      subtotalAmount: 1_250_000,
      lines: [
        {
          id: "line-a",
          sellerOffer: offer(SELLER_A, 1_250_000),
          productId: "prod-1",
          imageUrl: null,
          productTitle: "Royal Canin Adult Dog Food",
          variantTitle: "2kg",
          variantSku: "RC-DOG-2KG",
          targetPetId: "pet-1",
          targetPetName: "Luna",
          quantity: 1,
          unitPriceSnapshot: 1_250_000,
          currentPriceAmount: 1_250_000,
          priceChanged: false,
          currency: "IRR",
          lineTotal: 1_250_000,
          compatibility: { status: "COMPATIBLE" as never, reasons: [] },
          listUnitPrice: 1_250_000,
          unitDiscount: 0,
          promotionName: null,
          promotionId: null,
          issues: [],
        },
      ],
    },
    {
      sellerOrganization: SELLER_B,
      subtotalAmount: 1_190_000,
      lines: [
        {
          id: "line-b",
          sellerOffer: offer(SELLER_B, 1_190_000),
          productId: "prod-2",
          imageUrl: null,
          productTitle: "Grain-Free Training Treats",
          variantTitle: "200g",
          variantSku: "TREAT-200G",
          targetPetId: null,
          targetPetName: null,
          quantity: 1,
          unitPriceSnapshot: 1_100_000,
          currentPriceAmount: 1_190_000,
          priceChanged: true,
          currency: "IRR",
          lineTotal: 1_190_000,
          compatibility: null,
          listUnitPrice: 1_190_000,
          unitDiscount: 0,
          promotionName: null,
          promotionId: null,
          issues: ["PRICE_CHANGED"],
        },
      ],
    },
  ],
};

describe("CartView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getCart).mockReset();
    vi.mocked(commerceService.updateCartItem).mockReset();
    vi.mocked(commerceService.removeCartItem).mockReset();
  });

  it("groups lines by seller, one group per seller", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(MULTI_SELLER_CART);

    renderWithIntl(<CartView />);

    await waitFor(() => expect(screen.getByText("Sold by Pet Bazaar Tehran")).toBeTruthy());
    expect(screen.getByText("Sold by Golestan Pet Supplies")).toBeTruthy();
    expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy();
    expect(screen.getByText("Grain-Free Training Treats")).toBeTruthy();
  });

  it("flags a line whose price changed since it was added, without trusting the stale total", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(MULTI_SELLER_CART);

    renderWithIntl(<CartView />);

    await waitFor(() => expect(screen.getByText("Price changed")).toBeTruthy());
  });

  it("shows the target pet for a line, or a no-pet indicator", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(MULTI_SELLER_CART);

    renderWithIntl(<CartView />);

    await waitFor(() => expect(screen.getByText("For Luna")).toBeTruthy());
    expect(screen.getByText("No pet selected for this item")).toBeTruthy();
  });

  it("shows a safety-conflict banner when the cart has one", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue({ ...MULTI_SELLER_CART, hasSafetyConflict: true });

    renderWithIntl(<CartView />);

    await waitFor(() =>
      expect(screen.getByText("One or more items may conflict with a pet's known allergy. You'll be asked to confirm at checkout.")).toBeTruthy(),
    );
  });

  it("shows an empty state when the cart has no lines", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue({ ...MULTI_SELLER_CART, sellerGroups: [] });

    renderWithIntl(<CartView />);

    await waitFor(() => expect(screen.getByText("Your cart is empty.")).toBeTruthy());
  });

  it("removes a line", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(MULTI_SELLER_CART);
    vi.mocked(commerceService.removeCartItem).mockResolvedValue({ ...MULTI_SELLER_CART, sellerGroups: [MULTI_SELLER_CART.sellerGroups[1]!] });

    renderWithIntl(<CartView />);
    await waitFor(() => expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy());

    fireEvent.click(screen.getAllByText("Remove")[0]!);

    await waitFor(() => expect(commerceService.removeCartItem).toHaveBeenCalledWith("line-a"));
  });
  it("requires confirmation before clearing the cart and preserves items on failure", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(MULTI_SELLER_CART);
    vi.mocked(commerceService.clearCart).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<CartView />);
    fireEvent.click(await screen.findByRole("button", { name: "Clear cart" }));
    expect(commerceService.clearCart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear cart" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Sold by Pet Bazaar Tehran/)).toBeTruthy();
    expect(commerceService.clearCart).toHaveBeenCalledOnce();
  });

// The server, not the client, selects media belonging to the cart product/variant.
it("uses the actual cart line photo when provided and leaves null lines without substitute photos",async()=>{
 const cart=structuredClone(MULTI_SELLER_CART);cart.sellerGroups[0]!.lines[0]!.imageUrl="https://media.example.com/actual-cart-product.webp";
 vi.mocked(commerceService.getCart).mockResolvedValueOnce(cart);const {container}=renderWithIntl(<CartView/>);
 await waitFor(()=>expect(container.querySelectorAll("img").length).toBe(1));expect(container.querySelector("img")?.getAttribute("src")).toBe("https://media.example.com/actual-cart-product.webp");
});

});
