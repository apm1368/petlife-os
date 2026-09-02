import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { MarketplaceChannelAccountDto, MarketplaceListingDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerChannelsView } from "./SellerChannelsView";

vi.mock("@/services/seller-os.service", () => ({
  sellerOsService: { listChannels: vi.fn(), listMarketplaceListings: vi.fn(), connectChannel: vi.fn(), syncMarketplaceListing: vi.fn(), reconcileMarketplaceListing: vi.fn() },
}));

const CAPABILITIES = {
  supportsListingPublish: true,
  supportsInventoryPush: true,
  supportsPricePush: true,
  supportsOrderPull: false,
  supportsWebhooks: false,
  supportsOrderCancellation: false,
  supportsListingPause: true,
  supportsReconciliation: true,
  supportsVariantMapping: true,
};

const CHANNEL: MarketplaceChannelAccountDto = {
  id: "channel-1",
  sellerOrganizationId: "seller-1",
  provider: "TOROB" as never,
  status: "CONNECTED" as never,
  externalSellerId: null,
  displayName: null,
  syncEnabled: true,
  inventorySyncEnabled: true,
  priceSyncEnabled: true,
  orderSyncEnabled: true,
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  capabilities: CAPABILITIES,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const LISTING: MarketplaceListingDto = {
  id: "listing-1",
  marketplaceChannelAccountId: "channel-1",
  provider: "TOROB" as never,
  sellerOfferId: "offer-1",
  externalListingId: "torob-listing-1",
  externalProductId: null,
  externalVariantId: null,
  status: "ACTIVE" as never,
  syncStatus: "FAILED" as never,
  publishedPriceIrr: 500_000,
  publishedInventory: 10,
  canonicalAvailableQuantity: 8,
  lastSyncedAt: null,
  lastProviderObservedAt: null,
  lastErrorCode: "INVENTORY_SYNC_FAILED",
  lastErrorMessage: "Provider temporarily unavailable",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function page<T>(items: T[]): PaginatedDto<T> {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe("SellerChannelsView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.listChannels).mockReset();
    vi.mocked(sellerOsService.listMarketplaceListings).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("never hides a listing sync error, and shows the inventory mismatch explicitly", async () => {
    vi.mocked(sellerOsService.listChannels).mockResolvedValue([CHANNEL]);
    vi.mocked(sellerOsService.listMarketplaceListings).mockResolvedValue(page([LISTING]));

    renderWithIntl(<SellerChannelsView />);

    await waitFor(() => expect(screen.getByText("Provider temporarily unavailable")).toBeTruthy());
    expect(screen.getByText(/differs from PET LIFE OS stock/)).toBeTruthy();
  });

  it("offers to connect an unconnected provider", async () => {
    vi.mocked(sellerOsService.listChannels).mockResolvedValue([]);
    vi.mocked(sellerOsService.listMarketplaceListings).mockResolvedValue(page([]));

    renderWithIntl(<SellerChannelsView />);

    await waitFor(() => expect(screen.getByText("TOROB")).toBeTruthy());
    expect(screen.getByText("DIGIKALA")).toBeTruthy();
    expect(screen.queryByText("DEV")).toBeNull(); // never shown as connectable in the UI
  });
});
