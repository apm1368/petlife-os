import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PaginatedDto, SellerOsOfferDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerInventoryView } from "./SellerInventoryView";

vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { listInventory: vi.fn(), adjustInventory: vi.fn() } }));

const OFFER: SellerOsOfferDto = {
  id: "offer-1",
  productVariantId: "variant-1",
  productTitle: "Grain-Free Treats",
  variantTitle: "200g",
  sku: "TREAT-200G",
  sellerSku: "SSKU-1",
  priceAmount: 500_000,
  compareAtAmount: null,
  currency: "IRR",
  status: "ACTIVE" as never,
  inventory: { id: "inv-1", sellerOfferId: "offer-1", onHand: 10, reserved: 2, available: 8, updatedAt: "2026-01-01T00:00:00.000Z" },
  marketplaceListingCount: 0,
  marketplaceSyncErrorCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function page(items: SellerOsOfferDto[]): PaginatedDto<SellerOsOfferDto> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("SellerInventoryView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.listInventory).mockReset();
    vi.mocked(sellerOsService.adjustInventory).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows on-hand, reserved, and available stock", async () => {
    vi.mocked(sellerOsService.listInventory).mockResolvedValue(page([OFFER]));

    renderWithIntl(<SellerInventoryView />);

    await waitFor(() => expect(screen.getByText("Grain-Free Treats")).toBeTruthy());
    expect(screen.getByText("2")).toBeTruthy(); // reserved
    expect(screen.getByText("8")).toBeTruthy(); // available
  });

  it("adjusts stock explicitly and surfaces the server's oversell-protection error", async () => {
    vi.mocked(sellerOsService.listInventory).mockResolvedValue(page([OFFER]));
    vi.mocked(sellerOsService.adjustInventory).mockRejectedValue(new ApiError({ code: "INVENTORY_MOVEMENT_INVALID", message: "invalid", requestId: "r1" }, 409));

    renderWithIntl(<SellerInventoryView />);
    await waitFor(() => expect(screen.getByText("Grain-Free Treats")).toBeTruthy());

    const onHandInput = screen.getByLabelText("On hand") as HTMLInputElement;
    fireEvent.change(onHandInput, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(screen.getByText("This adjustment would make stock negative.")).toBeTruthy());
    expect(sellerOsService.adjustInventory).toHaveBeenCalledWith("seller-1", "inv-1", { mode: "ABSOLUTE", quantity: 0, reason: "Seller OS manual adjustment" });
  });
});
