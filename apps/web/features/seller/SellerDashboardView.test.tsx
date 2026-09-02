import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { SellerDashboardDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
import { SellerDashboardView } from "./SellerDashboardView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { getDashboard: vi.fn() } }));

const DASHBOARD: SellerDashboardDto = {
  ordersRequiringActionCount: 2,
  lowStockOfferCount: 1,
  activeOfferCount: 10,
  channelSyncErrorCount: 0,
  fulfillmentExceptionCount: 0,
  ordersToday: 3,
  unitsSoldToday: 5,
  gmvTodayAmount: 1_500_000,
  recentOrders: [
    { orderId: "order-1", source: null, externalOrderId: null, status: "CONFIRMED" as never, paymentSource: "PETLIFE_PAYMENT" as never, fulfillmentStatus: null, itemCount: 2, totalAmount: 500_000, currency: "IRR", createdAt: "2026-01-01T00:00:00.000Z" },
  ],
};

describe("SellerDashboardView", () => {
  beforeEach(() => {
    vi.mocked(sellerOsService.getDashboard).mockReset();
    useSellerStore.setState({
      context: { active: { sellerMembershipId: "m-1", sellerOrganizationId: "seller-1", organizationName: "Pet Bazaar", verificationStatus: "VERIFIED" as never, sellerStatus: "ACTIVE" as never, role: "OWNER" as never }, memberships: [] },
      status: "ready",
    });
  });

  it("shows dashboard tiles and recent orders", async () => {
    vi.mocked(sellerOsService.getDashboard).mockResolvedValue(DASHBOARD);

    renderWithIntl(<SellerDashboardView />);

    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("PET LIFE OS order")).toBeTruthy();
  });

  it("renders correctly in fa locale (RTL)", async () => {
    vi.mocked(sellerOsService.getDashboard).mockResolvedValue(DASHBOARD);

    renderWithIntl(<SellerDashboardView />, "fa");

    await waitFor(() => expect(screen.getByText("داشبورد")).toBeTruthy());
    expect(screen.getByText("سفارش‌های اخیر")).toBeTruthy();
  });
});
