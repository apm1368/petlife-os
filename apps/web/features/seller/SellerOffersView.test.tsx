import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SellerOsOfferDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerOffersView } from "./SellerOffersView";

vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { listOffers: vi.fn(), updateOffer: vi.fn() } }));

const OFFER: SellerOsOfferDto = {
  id: "offer-1",
  productVariantId: "variant-1",
  productTitle: "Grain-Free Treats",
  variantTitle: "200g",
  sku: "TREAT-200G",
  sellerSku: null,
  priceAmount: 500_000,
  compareAtAmount: null,
  currency: "IRR",
  status: "ACTIVE" as never,
  inventory: { id: "inv-1", sellerOfferId: "offer-1", onHand: 10, reserved: 0, available: 10, updatedAt: "2026-01-01T00:00:00.000Z" },
  marketplaceListingCount: 0,
  marketplaceSyncErrorCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function page(items: SellerOsOfferDto[]): PaginatedDto<SellerOsOfferDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("SellerOffersView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.listOffers).mockReset();
    vi.mocked(sellerOsService.updateOffer).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows an offer and a low-stock/sync-error indicator when applicable", async () => {
    vi.mocked(sellerOsService.listOffers).mockResolvedValue(page([{ ...OFFER, inventory: { ...OFFER.inventory!, available: 2 }, marketplaceSyncErrorCount: 1 }]));

    renderWithIntl(<SellerOffersView />);

    await waitFor(() => expect(screen.getByText("Grain-Free Treats")).toBeTruthy());
    expect(screen.getByText("Low stock")).toBeTruthy();
    expect(screen.getByText("1 sync error(s)")).toBeTruthy();
  });

  it("saves a price change explicitly, never auto-saving", async () => {
    vi.mocked(sellerOsService.listOffers).mockResolvedValue(page([OFFER]));
    vi.mocked(sellerOsService.updateOffer).mockResolvedValue({ ...OFFER, priceAmount: 650_000 });

    renderWithIntl(<SellerOffersView />);
    await waitFor(() => expect(screen.getByText("Grain-Free Treats")).toBeTruthy());

    const saveButton = screen.getByText("Save") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true); // nothing changed yet

    const priceInput = screen.getByLabelText("Price (IRR)") as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "650000" } });
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() => expect(sellerOsService.updateOffer).toHaveBeenCalledWith("seller-1", "offer-1", { priceAmount: 650_000, status: "ACTIVE" }));
  });
});
