import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ProductCategoryDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { productSummary, searchResult } from "@/test/commerce-fixtures";
import { ShopHomeView } from "./ShopHomeView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna", species: "DOG" } }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listCategories: vi.fn(), searchProducts: vi.fn() } }));
vi.mock("@/features/experience/CinematicPageHero", () => ({ CinematicPageHero: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const CATEGORY: ProductCategoryDto = { id: "cat-1", parentId: null, name: "Food", slug: "food", status: "ACTIVE" as never };

describe("ShopHomeView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.listCategories).mockReset();
    vi.mocked(commerceService.searchProducts).mockReset();
  });

  it("shows real categories and products for the active pet — no preview data", async () => {
    vi.mocked(commerceService.listCategories).mockResolvedValue([CATEGORY]);
    vi.mocked(commerceService.searchProducts).mockResolvedValue(searchResult([productSummary()]));
    renderWithIntl(<ShopHomeView />);
    await waitFor(() => expect(screen.getByText("Food")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText("Royal Canin Adult Dog Food").length).toBeGreaterThan(0));
    expect(screen.getByText("For Luna")).toBeTruthy();
    expect(commerceService.searchProducts).toHaveBeenCalledWith(expect.objectContaining({ petId: "pet-1", species: "DOG", sort: "RECOMMENDED" }));
  });

  it("says the catalog is empty instead of inventing products", async () => {
    vi.mocked(commerceService.listCategories).mockResolvedValue([]);
    vi.mocked(commerceService.searchProducts).mockResolvedValue(searchResult([]));
    renderWithIntl(<ShopHomeView />);
    expect(await screen.findByText("The catalog is empty for now")).toBeTruthy();
    expect(screen.queryByText(/Monge|Schesir|PetSafe/)).toBeNull();
  });

  it("recovers from a rejected catalog request without a permanent skeleton", async () => {
    vi.mocked(commerceService.listCategories).mockResolvedValue([CATEGORY]);
    vi.mocked(commerceService.searchProducts)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(searchResult([productSummary()]));
    renderWithIntl(<ShopHomeView />);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect((await screen.findAllByText("Royal Canin Adult Dog Food")).length).toBeGreaterThan(0);
  });
});
