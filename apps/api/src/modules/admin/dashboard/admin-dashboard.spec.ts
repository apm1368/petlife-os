import { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import { AdminDashboardService } from "./admin-dashboard.service";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

describe("dashboard permission boundary", () => {
  const actor = (role: AdminRole): ResolvedAdminContext => ({ adminUserId: "a", userId: "u", displayName: "A", status: AdminMembershipStatus.ACTIVE, role, serviceScopes: [] });
  const counter = (n: number) => ({ count: jest.fn().mockResolvedValue(n) });
  const setup = () => {
    const db = {
      supportCase: counter(12),
      dispute: counter(3),
      trustCase: counter(4),
      adminRefundApproval: counter(9),
      adminTask: counter(5),
      providerOrganization: counter(2),
      sellerOrganization: counter(1),
      orderRefundRequest: counter(6),
      sellerOffer: counter(7),
      catalogProductRequest: counter(8),
      travelListing: counter(10),
      supportNeedListing: counter(11),
      communityReport: counter(13),
      petMemorialSubmission: counter(14),
      placeReport: counter(15),
      walletTopUp: counter(16),
      accountDeletionRequest: counter(17),
      pet: counter(40),
      booking: counter(7),
      petOwnershipTransfer: counter(18),
    };
    return { db, service: new AdminDashboardService(db as unknown as PrismaService) };
  };
  it("does not even query staff queues outside an editor's permissions", async () => {
    const { db, service } = setup();
    const summary = await service.getSummary(actor(AdminRole.EDITOR));
    expect([summary.openSupportCases, summary.openDisputes, summary.openTrustCases, summary.pendingRefundApprovals, summary.openTasks]).toEqual([null, null, null, null, null]);
    for (const table of [db.supportCase, db.dispute, db.trustCase, db.adminRefundApproval, db.adminTask]) expect(table.count).not.toHaveBeenCalled();
    // #290 Q97: the launch KPIs belong to analytics.view.
    expect(summary.launchKpis).toBeNull();
    expect(db.pet.count).not.toHaveBeenCalled();
  });
  it("allows support counts without finance or trust counts", async () => {
    const { db, service } = setup();
    const summary = await service.getSummary(actor(AdminRole.SUPPORT));
    expect(summary).toMatchObject({ openSupportCases: 12, openDisputes: 3, openTrustCases: null, pendingRefundApprovals: null, openTasks: 5 });
    expect(db.adminRefundApproval.count).not.toHaveBeenCalled();
    expect(db.trustCase.count).not.toHaveBeenCalled();
  });
  it("keeps the complete summary, every queue included, for super administrators", async () => {
    const { service } = setup();
    expect(await service.getSummary(actor(AdminRole.SUPER_ADMIN))).toEqual({
      openSupportCases: 12,
      openDisputes: 3,
      openTrustCases: 4,
      pendingRefundApprovals: 9,
      openTasks: 5,
      pendingVerifications: 3,
      pendingRefundRequests: 6,
      pendingOfferModeration: 7,
      pendingCatalogRequests: 8,
      pendingTravelListings: 10,
      pendingSupportNeeds: 11,
      openCommunityReports: 13,
      pendingMemorials: 14,
      openPlaceReports: 15,
      pendingWalletTopUps: 16,
      pendingDeletionRequests: 17,
      launchKpis: { registeredPets: 40, newPetsThisWeek: 40, bookingsThisWeek: 7, bookingsLastWeek: 7 },
      openOwnershipDisputes: 18,
      openProviderNoShows: 5,
    });
  });
  it("hides vertical queues from an admin scoped to another vertical", async () => {
    const { db, service } = setup();
    const clinicOnly = { ...actor(AdminRole.SERVICE_ADMIN), serviceScopes: [AdminVertical.CLINIC] };
    expect((await service.getSummary(clinicOnly)).pendingTravelListings).toBeNull();
    expect(db.travelListing.count).not.toHaveBeenCalled();
    const stays = { ...actor(AdminRole.SERVICE_ADMIN), serviceScopes: [AdminVertical.ACCOMMODATION] };
    expect((await service.getSummary(stays)).pendingTravelListings).toBe(10);
  });
  it("shows deletion requests only to admins who manage access, and top-ups to anyone who may open Wallets", async () => {
    const { db, service } = setup();
    const admin = await service.getSummary(actor(AdminRole.ADMIN));
    expect(admin.pendingDeletionRequests).toBeNull();
    expect(db.accountDeletionRequest.count).not.toHaveBeenCalled();
    expect((await service.getSummary(actor(AdminRole.READ_ONLY))).pendingWalletTopUps).toBe(16);
    expect((await service.getSummary(actor(AdminRole.SUPER_ADMIN))).pendingDeletionRequests).toBe(17);
  });

  it("keeps the platform-wide launch figures from vertical-scoped roles (#290 Q97)", async () => {
    const { db, service } = setup();
    // A custom role with analytics.view but limited to the shop: figures belong to every vertical, so none.
    const shopAnalyst = { ...actor(AdminRole.ANALYTICS), permissions: ["analytics.view"], customRole: { id: "r", name: "Shop analyst", verticals: [AdminVertical.SHOP] } } as unknown as ResolvedAdminContext;
    expect((await service.getSummary(shopAnalyst)).launchKpis).toBeNull();
    expect(db.booking.count).not.toHaveBeenCalled();
    const allVerticals = { ...actor(AdminRole.ANALYTICS), permissions: ["analytics.view"], customRole: { id: "r2", name: "Analyst", verticals: [] } } as unknown as ResolvedAdminContext;
    expect((await service.getSummary(allVerticals)).launchKpis).toEqual({ registeredPets: 40, newPetsThisWeek: 40, bookingsThisWeek: 7, bookingsLastWeek: 7 });
  });
});
