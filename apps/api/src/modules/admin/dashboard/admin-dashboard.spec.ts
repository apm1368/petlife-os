import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { AdminDashboardService } from "./admin-dashboard.service";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

describe("dashboard permission boundary", () => {
  const actor = (role: AdminRole): ResolvedAdminContext => ({ adminUserId: "a", userId: "u", displayName: "A", status: AdminMembershipStatus.ACTIVE, role, serviceScopes: [] });
  const setup = () => {
    const db = { supportCase: { count: jest.fn().mockResolvedValue(12) }, dispute: { count: jest.fn().mockResolvedValue(3) }, trustCase: { count: jest.fn().mockResolvedValue(4) }, adminRefundApproval: { count: jest.fn().mockResolvedValue(9) }, adminTask: { count: jest.fn().mockResolvedValue(5) } };
    return { db, service: new AdminDashboardService(db as unknown as PrismaService) };
  };
  it("does not even query counts outside an editor's permissions", async () => {
    const { db, service } = setup();
    expect(Object.values(await service.getSummary(actor(AdminRole.EDITOR)))).toEqual([null, null, null, null, null]);
    for (const table of Object.values(db)) expect(table.count).not.toHaveBeenCalled();
  });
  it("allows support counts without finance or trust counts", async () => {
    const { db, service } = setup();
    expect(await service.getSummary(actor(AdminRole.SUPPORT))).toEqual({ openSupportCases: 12, openDisputes: 3, openTrustCases: null, pendingRefundApprovals: null, openTasks: 5 });
    expect(db.adminRefundApproval.count).not.toHaveBeenCalled();
    expect(db.trustCase.count).not.toHaveBeenCalled();
  });
  it("keeps the complete summary for super administrators", async () => {
    const { service } = setup();
    expect(await service.getSummary(actor(AdminRole.SUPER_ADMIN))).toEqual({ openSupportCases: 12, openDisputes: 3, openTrustCases: 4, pendingRefundApprovals: 9, openTasks: 5 });
  });
});
