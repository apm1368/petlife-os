import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { CartDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { CartView } from "./CartView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/commerce.service", () => ({
  commerceService: { getCart: vi.fn(), updateCartItem: vi.fn(), removeCartItem: vi.fn() },
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
  };
}

const MULTI_SELLER_CART: CartDto = {
  id: "cart-1",
  status: "ACTIVE" as never,
  totalItems: 2,
  subtotalAmount: 2_440_000,
  currency: "IRR",
  hasSafetyConflict: false,
  sellerGroups: [
    {
      sellerOrganization: SELLER_A,
      subtotalAmount: 1_250_000,
      lines: [
        {
          id: "line-a",
          sellerOffer: offer(SELLER_A, 1_250_000),
          productId: "prod-1",
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

    await waitFor(() => expect(screen.getByText("Pet Bazaar Tehran")).toBeTruthy());
    expect(screen.getByText("Golestan Pet Supplies")).toBeTruthy();
    expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy();
    expect(screen.getByText("Grain-Free Training Treats")).toBeTruthy();
  });

  it("flags a line whose price changed since it was added, without trusting the stale total", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(MULTI_SELLER_CART);

    renderWithIntl(<CartView />);

    await waitFor(() => expect(screen.getByText("Price updated since added")).toBeTruthy());
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
});
