import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { ProductSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ProductCard } from "./ProductCard";

const BASE: ProductSummaryDto = {
  id: "prod-1",
  title: "Royal Canin Adult Dog Food",
  slug: "royal-canin-adult-dog-food",
  brand: { id: "brand-1", name: "Royal Canin", slug: "royal-canin", logoUrl: null, status: "ACTIVE" as never },
  category: { id: "cat-1", parentId: null, name: "Food", slug: "food", status: "ACTIVE" as never },
  variantId: "variant-1",
  variantTitle: "2kg",
  bestOffer: {
    id: "offer-1",
    sellerOrganization: { id: "seller-1", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
    productVariantId: "variant-1",
    priceAmount: 1_250_000,
    compareAtAmount: null,
    currency: "IRR",
    status: "ACTIVE" as never,
    availableQuantity: 10,
  },
  compatibility: null,
};

describe("ProductCard", () => {
  it("shows the product title, brand, and lowest price without labeling it 'best'", () => {
    renderWithIntl(<ProductCard product={BASE} onClick={vi.fn()} />);

    expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy();
    expect(screen.getByText("Royal Canin")).toBeTruthy();
    expect(screen.getByText("From 125,000 Toman")).toBeTruthy();
    expect(screen.queryByText(/best/i)).toBeNull();
  });

  it("shows a no-availability state when there is no purchasable offer", () => {
    renderWithIntl(<ProductCard product={{ ...BASE, bestOffer: null }} onClick={vi.fn()} />);

    expect(screen.getByText("No availability")).toBeTruthy();
  });

  it("surfaces a POTENTIAL_SAFETY_CONFLICT with an urgent tone, never hidden", () => {
    renderWithIntl(
      <ProductCard
        product={{ ...BASE, compatibility: { status: "POTENTIAL_SAFETY_CONFLICT" as never, reasons: ["ALLERGEN_CONFLICT" as never] } }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("Potential safety conflict")).toBeTruthy();
  });

  it("invokes onClick when selected", () => {
    const onClick = vi.fn();
    renderWithIntl(<ProductCard product={BASE} onClick={onClick} />);

    screen.getByRole("button").click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
