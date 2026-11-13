import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { BusinessOverviewDto, BusinessServiceCardDto, BusinessShopCardDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { businessService } from "@/services/business.service";
import { providerOsService } from "@/services/provider-os.service";
import { sellerOsService } from "@/services/seller-os.service";
import { BusinessHubView } from "./BusinessHubView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/en/business" }));
vi.mock("@/services/business.service", () => ({ businessService: { overview: vi.fn(), memberships: vi.fn() }, hasBusiness: () => true }));
vi.mock("@/services/provider-os.service", () => ({ providerOsService: { setContext: vi.fn() } }));
vi.mock("@/services/seller-os.service", () => ({ sellerOsService: { setContext: vi.fn() } }));

const clinic: BusinessServiceCardDto = {
  providerOrganizationId: "p1",
  name: "Paw Clinic",
  type: "VET_CLINIC" as never,
  role: "OWNER" as never,
  verificationStatus: "VERIFIED" as never,
  counts: { today: 2, upcoming: 5, pendingConfirmation: 1 },
  nextBookings: [{ id: "b1", startAt: "2026-11-14T06:30:00.000Z", status: "CONFIRMED", serviceName: "General visit", petName: "Mishi" }],
  services: { total: 2, active: 1, items: [{ id: "s1", name: "General visit", durationMinutes: 30, priceAmount: 12_000_000, currency: "IRR", isActive: true }] },
  reviews: { average: 4.5, count: 2, latest: [{ id: "r1", rating: 5, body: "Very kind", productTitle: null, createdAt: "2026-11-10T00:00:00.000Z" }] },
};
const shop: BusinessShopCardDto = {
  sellerOrganizationId: "s1",
  name: "Paw Shop",
  role: "OWNER" as never,
  verificationStatus: "UNDER_REVIEW" as never,
  sellerStatus: "ACTIVE" as never,
  counts: { ordersToPrepare: 3, lowStockOffers: 1, offersPendingModeration: 2, activeOffers: 12 },
  reviews: { average: null, count: 0, latest: [] },
  balance: { pendingIrr: 1_000_000, availableIrr: 5_000_000, paidIrr: 0 },
};
const overview = (o: Partial<BusinessOverviewDto>): BusinessOverviewDto => ({ services: [], shops: [], hasHousehold: false, ...o });

describe("BusinessHubView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(providerOsService.setContext).mockResolvedValue({ active: null, memberships: [] });
    vi.mocked(sellerOsService.setContext).mockResolvedValue({ active: null, memberships: [] });
  });

  it("shows a service business with today's work and opens its console on that business", async () => {
    vi.mocked(businessService.overview).mockResolvedValue(overview({ services: [clinic] }));
    renderWithIntl(<BusinessHubView />, "en");
    const card = (await screen.findByRole("heading", { name: "Paw Clinic" })).closest("section")!;
    expect(within(card).getByText("Today's bookings")).toBeTruthy();
    expect(within(card).getByText(/General visit · Mishi/)).toBeTruthy();
    expect(within(card).getByText(/Rated 4.5 of 5/)).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "Finish verification" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Calendar" }));
    await waitFor(() => expect(providerOsService.setContext).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/provider/calendar"));
    expect(within(card).getByRole("link", { name: "Contact support" }).getAttribute("href")).toBe("/en/support/new?category=PROVIDER");
    expect(screen.queryByRole("link", { name: "Go to my pet-owner home" })).toBeNull();
  });

  it("shows a shop with orders, stock, money and a way to finish verification", async () => {
    vi.mocked(businessService.overview).mockResolvedValue(overview({ shops: [shop] }));
    renderWithIntl(<BusinessHubView />, "en");
    const card = (await screen.findByRole("heading", { name: "Paw Shop" })).closest("section")!;
    expect(within(card).getByText("Orders to prepare")).toBeTruthy();
    expect(within(card).getByText("Available to pay out")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Finish verification" }));
    await waitFor(() => expect(sellerOsService.setContext).toHaveBeenCalledWith("s1"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/seller/verification"));
  });

  it("lists both kinds for a vet that also runs a shop, with a way back to the pet-owner home", async () => {
    vi.mocked(businessService.overview).mockResolvedValue(overview({ services: [clinic], shops: [{ ...shop, balance: null }], hasHousehold: true }));
    renderWithIntl(<BusinessHubView />, "fa");
    expect(await screen.findByRole("heading", { name: "Paw Clinic" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Paw Shop" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "رفتن به خانهٔ صاحب حیوان" }).getAttribute("href")).toBe("/fa/home");
    // No money for a role that doesn't see it.
    expect(screen.queryByText("قابل تسویه")).toBeNull();
  });

  it("explains when the account has no business yet", async () => {
    vi.mocked(businessService.overview).mockResolvedValue(overview({}));
    renderWithIntl(<BusinessHubView />, "en");
    expect(await screen.findByText("No business yet")).toBeTruthy();
  });
});
