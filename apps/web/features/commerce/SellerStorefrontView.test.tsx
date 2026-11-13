import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { PublicSellerStorefrontDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { SellerStorefrontView } from "./SellerStorefrontView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/en/shop/sellers/paw" }));

const store: PublicSellerStorefrontDto = {
  seller: { id: "s1", slug: "paw", name: "Paw Store", logoUrl: null, description: "Food and toys for cats and dogs.", city: "Tehran", verified: true, memberSince: "2026-01-15T00:00:00.000Z", rating: { average: 4.6, count: 23 } },
  products: [],
  total: 0,
};

describe("SellerStorefrontView", () => {
  it("shows the verified seller, its city, rating from reviews, and an honest empty state", () => {
    renderWithIntl(<SellerStorefrontView store={store} />, "en");
    expect(screen.getByRole("heading", { name: "Paw Store" })).toBeTruthy();
    expect(screen.getByText("Verified seller")).toBeTruthy();
    expect(screen.getByText("From Tehran")).toBeTruthy();
    expect(screen.getByText("4.6 of 5 from 23 reviews")).toBeTruthy();
    expect(screen.getByText(/This seller has no products on sale right now/)).toBeTruthy();
  });

  it("renders in Persian without a rating when there are no reviews", () => {
    renderWithIntl(<SellerStorefrontView store={{ ...store, seller: { ...store.seller, rating: null } }} />, "fa");
    expect(screen.getByText("فروشندهٔ تأییدشده")).toBeTruthy();
    expect(screen.getByText("هنوز نظری ثبت نشده")).toBeTruthy();
  });
});
