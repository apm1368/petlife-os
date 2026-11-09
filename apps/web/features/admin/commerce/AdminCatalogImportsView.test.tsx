import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { AdminCatalogImportsView } from "./AdminCatalogImportsView";

vi.mock("@/services/admin-commerce.service", () => ({
  adminCommerceService: {
    catalogImportAvailability: vi.fn(),
    listCatalogImports: vi.fn(),
    listProductCategories: vi.fn(),
    listProductBrands: vi.fn(),
  },
}));

describe("AdminCatalogImportsView", () => {
  beforeEach(() => {
    vi.mocked(adminCommerceService.catalogImportAvailability).mockResolvedValue({ key: "catalog.import.digikala", enabled: false, reason: "DISABLED" });
    vi.mocked(adminCommerceService.listCatalogImports).mockResolvedValue([]);
    vi.mocked(adminCommerceService.listProductCategories).mockResolvedValue([]);
    vi.mocked(adminCommerceService.listProductBrands).mockResolvedValue([]);
  });

  it("clearly marks the importer unavailable until permissions and its approved flag exist", async () => {
    renderWithIntl(<AdminCatalogImportsView />);

    expect(await screen.findByRole("heading", { name: "Digikala import unavailable" })).toBeTruthy();
    expect(screen.getByText(/permission to use its text and images are verified/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start import" })).toBeNull();
  });
});
