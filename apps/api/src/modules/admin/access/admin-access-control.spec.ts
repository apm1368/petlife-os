import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { AdminAccessControlService } from "./admin-access-control.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/** The last-SUPER_ADMIN invariant can't be exercised end-to-end on a shared test DB (other suites add SUPER_ADMINs), so it is pinned here. */
describe("AdminAccessControlService governance", () => {
  const actor: ResolvedAdminContext = { adminUserId: "actor", userId: "u-actor", displayName: "A", role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE };
  function serviceWith(target: { id: string; role: AdminRole; status: AdminMembershipStatus }, activeSuperAdmins: number) {
    const tx = {
      $executeRaw: jest.fn(),
      adminUser: { findUnique: jest.fn().mockResolvedValue({ ...target, userId: "u-target" }), count: jest.fn().mockResolvedValue(activeSuperAdmins), update: jest.fn() },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { svc: new AdminAccessControlService(prisma as never, { record: jest.fn() } as never, { publish: jest.fn() } as never), tx };
  }

  it("refuses to suspend or demote the last active SUPER_ADMIN", async () => {
    const { svc, tx } = serviceWith({ id: "t", role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE }, 1);
    await expect(svc.setStatus(actor, "t", AdminMembershipStatus.SUSPENDED, "reason text")).rejects.toMatchObject({ code: "ADMIN_GOVERNANCE_RULE", details: { rule: "LAST_SUPER_ADMIN" } });
    await expect(svc.changeRole(actor, "t", AdminRole.ADMIN, "reason text")).rejects.toMatchObject({ details: { rule: "LAST_SUPER_ADMIN" } });
    expect(tx.adminUser.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalled(); // serialised under the membership advisory lock
  });

  it("refuses changes to your own membership and protected roles by non-SUPER_ADMINs", async () => {
    const { svc } = serviceWith({ id: "actor", role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE }, 3);
    await expect(svc.setStatus(actor, "actor", AdminMembershipStatus.SUSPENDED, "reason text")).rejects.toMatchObject({ details: { rule: "SELF_CHANGE_FORBIDDEN" } });
    const admin = { ...actor, adminUserId: "other", role: AdminRole.ADMIN };
    await expect(svc.changeRole(admin, "t", AdminRole.SUPER_ADMIN, "reason text")).rejects.toMatchObject({ details: { rule: "PROTECTED_ROLE" } });
  });
});
