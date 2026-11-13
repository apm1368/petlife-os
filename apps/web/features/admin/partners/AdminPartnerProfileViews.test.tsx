import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import type { AdminPartnerServiceDetailDto, AdminPartnerShopDetailDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminPartnersService } from "@/services/admin-partners.service";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import { AdminPartnerServiceProfile, AdminPartnerShopProfile } from "./AdminPartnerProfileViews";

vi.mock("@/services/admin-partners.service", () => ({ adminPartnersService: { getService: vi.fn(), getShop: vi.fn() } }));
// The approval-mode panel on each profile has its own test (PartnerApprovalModePanel.test.tsx).
vi.mock("@/services/admin-approvals.service", () => ({ adminApprovalsService: { get: vi.fn(() => new Promise(() => undefined)), set: vi.fn(), clear: vi.fn() } }));

const kyc = {
  status: "UNDER_REVIEW",
  submittedAt: "2026-11-13T08:00:00Z",
  note: null,
  contact: { firstName: "Sara", lastName: "Ahmadi", mobile: "09120000000", landline: "02100000000", websiteUrl: null, enamadId: null },
  documents: [{ id: "d1", kind: "NATIONAL_ID_CARD", status: "PENDING", reviewNote: null, expiresAt: null, uploadedAt: "2026-11-13T07:30:00Z", reviewedAt: null }],
};

const SERVICE: AdminPartnerServiceDetailDto = {
  id: "org1",
  name: "Paws Grooming",
  logoUrl: null,
  type: "GROOMER",
  serviceKinds: ["GROOMER", "BOARDING"],
  phone: "02100000000",
  email: null,
  websiteUrl: null,
  description: null,
  isDemoRecord: false,
  createdAt: "2026-11-13T07:00:00Z",
  kyc,
  locations: [{ id: "l1", name: null, addressLine: "Valiasr St 10", city: "Tehran", province: "Tehran", latitude: 35.7, longitude: 51.4, phone: null, timezone: "Asia/Tehran" }],
  services: [{ id: "s1", name: "Full groom", category: "GROOMING", type: "GROOMING_FULL", locationMode: "AT_PROVIDER", isActive: false, durationMinutes: 90, priceAmount: 1_500_000, currency: "IRR", maxPetsPerBooking: 2, supportsDog: true, supportsCat: true, variants: [], transportPricing: null }],
  calendar: { rules: [{ id: "r1", dayOfWeek: 6, start: "09:00", end: "17:00", timezone: "Asia/Tehran", locationName: "Tehran", staffName: null, serviceName: null }], exceptions: [] },
  team: [{ id: "u1", role: "OWNER", displayName: "Sara Ahmadi", displayTitle: null }],
  linkedShop: { id: "shop1", name: "Paws Shop", status: "PENDING", verificationStatus: "SUBMITTED" },
};

const SHOP: AdminPartnerShopDetailDto = {
  id: "shop1",
  name: "Paws Shop",
  slug: null,
  logoUrl: null,
  description: null,
  phone: "02100000000",
  email: null,
  status: "PENDING",
  createdAt: "2026-11-13T07:00:00Z",
  address: { province: "Tehran", city: "Tehran", addressLine: "Valiasr St 10", postalCode: "1234567890", latitude: null, longitude: null },
  openingHours: [{ dayOfWeek: 6, open: "10:00", close: "20:00" }],
  kyc,
  offers: { counts: { PAUSED: 1 }, pendingReview: 1, items: [{ id: "o1", productId: "p1", productTitle: "Cat food 2 kg", productStatus: "ACTIVE", variantSku: "CF-2", variantTitle: "2 kg", priceAmount: 2_000_000, currency: "IRR", status: "PAUSED", moderationStatus: "PENDING_REVIEW", available: 12, updatedAt: "2026-11-13T07:40:00Z" }] },
  pendingCatalogRequests: 2,
  team: [{ id: "m1", role: "OWNER", displayName: "Sara Ahmadi" }],
  linkedService: { id: "org1", name: "Paws Grooming", type: "GROOMER", serviceKinds: ["GROOMER"], verificationStatus: "UNDER_REVIEW", status: null },
};

describe("partner profiles", () => {
  beforeEach(() => {
    vi.mocked(adminPartnersService.getService).mockReset();
    vi.mocked(adminPartnersService.getShop).mockReset();
    useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "Ops", role: "SUPPORT", permissions: ["verification.manage"] } as never, status: "ready" });
  });

  it("shows a service business: kinds, KYC, address, per-pet prices, calendar, team and its shop", async () => {
    vi.mocked(adminPartnersService.getService).mockResolvedValue(SERVICE);
    renderWithIntl(<AdminPartnerServiceProfile id="org1" />);
    await screen.findByRole("heading", { name: "Paws Grooming" });
    expect(screen.getByText("Groomer · Boarding")).toBeTruthy();
    expect(screen.getByText("Sara Ahmadi", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("National ID card")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review documents" }).getAttribute("href")).toBe("/en/admin/verification/provider/org1");
    expect(screen.getByText("Valiasr St 10")).toBeTruthy();
    expect(screen.getByText(/per pet · 90 min · up to 2 pets · dogs، cats/)).toBeTruthy();
    expect(screen.getByText("Not live")).toBeTruthy();
    expect(screen.getByText("09:00–17:00")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Also a shop: Paws Shop" }).getAttribute("href")).toBe("/en/admin/sellers/shop1");
    expect(screen.getByRole("link", { name: "Support cases from this business" }).getAttribute("href")).toBe("/en/admin/support?requester=PROVIDER&org=org1");
  });

  it("shows a shop: address, opening hours, products with price and stock, and new-product requests", async () => {
    vi.mocked(adminPartnersService.getShop).mockResolvedValue(SHOP);
    renderWithIntl(<AdminPartnerShopProfile id="shop1" />);
    await screen.findByRole("heading", { name: "Paws Shop" });
    expect(screen.getByText("1234567890")).toBeTruthy();
    expect(screen.getByText("10:00–20:00")).toBeTruthy();
    expect(screen.getAllByText("Closed").length).toBe(6);
    expect(screen.getByRole("link", { name: "Cat food 2 kg" }).getAttribute("href")).toBe("/en/admin/commerce/products/p1");
    expect(screen.getByText(/12 in stock/)).toBeTruthy();
    expect(screen.getByText("0 live · 1 awaiting review · 2 new-product requests")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Also a service business: Paws Grooming" })).toBeTruthy();
  });

  it("says when the business does not exist", async () => {
    vi.mocked(adminPartnersService.getShop).mockRejectedValue(new ApiError({ code: "NOT_FOUND", message: "missing", requestId: "r" }, 404));
    renderWithIntl(<AdminPartnerShopProfile id="nope" />);
    await screen.findByText("Business not found");
  });
});
