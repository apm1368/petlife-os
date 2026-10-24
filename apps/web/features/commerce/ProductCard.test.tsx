import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { offer, productSummary } from "@/test/commerce-fixtures";
import { ProductCard } from "./ProductCard";

describe("ProductCard", () => {
  it("shows title, brand and the server price without ranking language", () => {
    renderWithIntl(<ProductCard product={productSummary()} onClick={vi.fn()} />);
    expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy();
    expect(screen.getByText("Royal Canin")).toBeTruthy();
    expect(screen.getByText("125,000 Toman")).toBeTruthy();
    expect(screen.getByText("In stock")).toBeTruthy();
    expect(screen.queryByText(/best/i)).toBeNull();
  });

  it("strikes through the list price only when a real promotion applies", () => {
    const promoted = offer({ unitDiscount: 250_000, promotion: { id: "promo-1", name: "Autumn", endsAt: null } });
    renderWithIntl(<ProductCard product={productSummary({ bestOffer: promoted })} onClick={vi.fn()} />);
    expect(screen.getByText("100,000 Toman")).toBeTruthy();
    expect(screen.getByText("125,000 Toman")).toBeTruthy();
    expect(screen.getByText("\u2068Autumn\u2069 · 20% off")).toBeTruthy();
  });

  it("never renders placeholder stars when there are no reviews", () => {
    const { container } = renderWithIntl(<ProductCard product={productSummary()} onClick={vi.fn()} />);
    expect(container.textContent).not.toMatch(/review/i);
    renderWithIntl(<ProductCard product={productSummary({ id: "p2", rating: { average: 4.5, count: 12 } })} onClick={vi.fn()} />);
    expect(screen.getByText("(12 reviews)")).toBeTruthy();
  });

  it("shows a no-availability state when there is no purchasable offer", () => {
    renderWithIntl(<ProductCard product={productSummary({ bestOffer: null })} onClick={vi.fn()} />);
    expect(screen.getByText("No availability")).toBeTruthy();
  });

  it("surfaces a POTENTIAL_SAFETY_CONFLICT, never hidden", () => {
    renderWithIntl(<ProductCard product={productSummary({ compatibility: { status: "POTENTIAL_SAFETY_CONFLICT" as never, reasons: ["ALLERGEN_CONFLICT" as never] } })} onClick={vi.fn()} />);
    expect(screen.getByText("Potential safety conflict")).toBeTruthy();
  });

  it("invokes onClick when selected", () => {
    const onClick = vi.fn();
    renderWithIntl(<ProductCard product={productSummary()} onClick={onClick} />);
    screen.getByRole("button").click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
