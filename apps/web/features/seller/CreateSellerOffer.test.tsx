import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { CreateSellerOffer } from "./CreateSellerOffer";

vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { searchCatalog: vi.fn(), createOffer: vi.fn(), listCatalogProductRequests: vi.fn(), createCatalogProductRequest: vi.fn() } }));

describe("CreateSellerOffer", () => {
  beforeEach(() => {
    useSellerStore.setState({ context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "s1", organizationName: "Pet Bazaar", verificationStatus: "PENDING" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never } } as never });
    vi.mocked(sellerOsService.listCatalogProductRequests).mockReset().mockResolvedValue([]);
    vi.mocked(sellerOsService.createOffer).mockReset().mockResolvedValue({} as never);
    vi.mocked(sellerOsService.searchCatalog).mockReset().mockResolvedValue({
      items: [{ productId: "p1", title: "Adult cat food", brandName: "Vipet", categoryName: "Cat food", imageUrl: null, variants: [
        { id: "v-listed", title: "1 kg", sku: "DK-1", weight: "1 KG", myOffer: { id: "o1", status: "ACTIVE" } },
        { id: "v-new", title: "2 kg", sku: "DK-2", weight: "2 KG", myOffer: null },
      ] }],
      total: 1, page: 1, pageSize: 20,
    });
  });

  it("searches the directory, offers only variants this shop doesn't sell yet, and sets price and stock", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(<CreateSellerOffer sellerId="s1" onSaved={onSaved} />, "en");
    // The form lives in a collapsed <details>; open it like a seller would.
    fireEvent.click(screen.getByText("Add seller offer"));
    fireEvent.change(screen.getByLabelText(/Search the product catalog/), { target: { value: "cat food" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(sellerOsService.searchCatalog).toHaveBeenCalledWith("s1", { q: "cat food" }));
    const select = await screen.findByLabelText(/Product variant/);
    const values = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(values).toContain("v-new");
    expect(values).not.toContain("v-listed");
    fireEvent.change(select, { target: { value: "v-new" } });
    fireEvent.change(screen.getByLabelText(/Price \(IRR\)/), { target: { value: "450000" } });
    fireEvent.change(screen.getByLabelText(/Initial stock/), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add offer" }));
    await waitFor(() => expect(sellerOsService.createOffer).toHaveBeenCalledWith("s1", { productVariantId: "v-new", priceAmount: 450000, initialOnHand: 5 }));
    expect(onSaved).toHaveBeenCalled();
  });
});
