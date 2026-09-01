import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ProductCategoryDto, ProductSummaryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { ShopHomeView } from "./ShopHomeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listCategories: vi.fn(), searchProducts: vi.fn() } }));

const CATEGORY: ProductCategoryDto = { id: "cat-1", parentId: null, name: "Food", slug: "food", status: "ACTIVE" as never };
const PRODUCT: ProductSummaryDto = {
  id: "prod-1",
  title: "Royal Canin Adult Dog Food",
  slug: "royal-canin-adult-dog-food",
  brand: null,
  category: CATEGORY,
  variantId: "variant-1",
  variantTitle: "2kg",
  bestOffer: null,
  compatibility: null,
};

describe("ShopHomeView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.listCategories).mockReset();
    vi.mocked(commerceService.searchProducts).mockReset();
  });

  it("shows categories and a discovery list scoped to the active pet, with no ranking language", async () => {
    vi.mocked(commerceService.listCategories).mockResolvedValue([CATEGORY]);
    vi.mocked(commerceService.searchProducts).mockResolvedValue([PRODUCT]);

    renderWithIntl(<ShopHomeView />);

    await waitFor(() => expect(screen.getByText("Food")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Royal Canin Adult Dog Food")).toBeTruthy());
    expect(screen.getByText("For Luna")).toBeTruthy();
    expect(commerceService.searchProducts).toHaveBeenCalledWith({ petId: "pet-1" });
  });
});
