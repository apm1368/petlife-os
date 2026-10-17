import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { productSummary, searchResult } from "@/test/commerce-fixtures";
import { ProductResultsView, readProductFilters } from "./ProductResultsView";

const replace = vi.fn();
let search = "category=cat-2";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/en/shop/products",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { searchProducts: vi.fn(), listCategories: vi.fn() } }));

describe("ProductResultsView", () => {
  beforeEach(() => {
    search = "category=cat-2";
    replace.mockReset();
    vi.mocked(commerceService.searchProducts).mockReset();
    vi.mocked(commerceService.listCategories).mockResolvedValue([]);
  });

  it("searches with the URL filters and the active pet, paginated", async () => {
    vi.mocked(commerceService.searchProducts).mockResolvedValue(searchResult([productSummary({ title: "Grain-Free Training Treats" })]));
    renderWithIntl(<ProductResultsView />);
    await waitFor(() => expect(screen.getByText("Grain-Free Training Treats")).toBeTruthy());
    expect(commerceService.searchProducts).toHaveBeenCalledWith(expect.objectContaining({ category: "cat-2", petId: "pet-1", page: 1, pageSize: 24 }));
    expect(screen.getByText("1 product")).toBeTruthy();
  });

  it("writes a sort change to the URL instead of local state", async () => {
    vi.mocked(commerceService.searchProducts).mockResolvedValue(searchResult([productSummary()]));
    renderWithIntl(<ProductResultsView />);
    await screen.findByText("Royal Canin Adult Dog Food");
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "PRICE_ASC" } });
    expect(replace).toHaveBeenCalledWith("/en/shop/products?category=cat-2&sort=PRICE_ASC", { scroll: false });
  });

  it("shows an empty state with a way out when nothing matches", async () => {
    search = "category=cat-2&inStock=true";
    vi.mocked(commerceService.searchProducts).mockResolvedValue(searchResult([]));
    renderWithIntl(<ProductResultsView />);
    await waitFor(() => expect(screen.getByText("No products found.")).toBeTruthy());
    expect(screen.getAllByText("Clear filters").length).toBeGreaterThan(0);
  });

  it("parses structured attribute and price filters from the URL", () => {
    const filters = readProductFilters(new URLSearchParams("q=food&minPrice=10000&attr%5Bsize%5D=10kg&sort=BOGUS&page=3"));
    expect(filters).toMatchObject({ search: "food", minPrice: 10000, attr: { size: "10kg" }, sort: undefined, page: 3 });
  });
});
