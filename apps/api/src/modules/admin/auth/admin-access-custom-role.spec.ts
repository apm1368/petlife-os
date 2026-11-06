import { AdminMembershipStatus, AdminRole, AdminCustomRoleStatus } from "@prisma/client";
import { AdminAccessService } from "./admin-access.service";

describe("AdminAccessService custom role resolution", () => {
  function service(roleStatus: AdminCustomRoleStatus) {
    const adminUser = {
      id: "admin-1", userId: "user-1", role: AdminRole.READ_ONLY, status: AdminMembershipStatus.ACTIVE,
      serviceScopes: [], user: { displayName: "Operator" },
      customRole: { id: "custom-1", key: "shop-auditor", permissions: ["commerce.manage"], verticals: ["SHOP"], status: roleStatus },
    };
    const prisma = { adminUser: { findUnique: jest.fn().mockResolvedValue(adminUser) } };
    return { access: new AdminAccessService(prisma as never), prisma };
  }

  it("resolves only active custom grants and their vertical scope on every request", async () => {
    const { access } = service(AdminCustomRoleStatus.ACTIVE);
    const context = await access.resolveAdminContext("user-1");
    expect(context.role).toBe(AdminRole.CUSTOM);
    expect(context.customPermissions).toEqual(["commerce.manage"]);
    expect(context.customRoleVerticals).toEqual(["SHOP"]);

    const inactive = service(AdminCustomRoleStatus.REJECTED).access;
    const denied = await inactive.resolveAdminContext("user-1");
    expect(denied.customPermissions).toEqual([]);
    expect(denied.customRoleVerticals).toEqual([]);
  });
});
