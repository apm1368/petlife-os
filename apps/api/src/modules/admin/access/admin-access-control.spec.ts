import { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import { AdminAccessControlService } from "./admin-access-control.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/** The last-SUPER_ADMIN invariant can't be exercised end-to-end on a shared test DB (other suites add SUPER_ADMINs), so it is pinned here. */
describe("AdminAccessControlService governance", () => {
  const actor: ResolvedAdminContext = { adminUserId: "actor", userId: "u-actor", displayName: "A", role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE, serviceScopes: [] };
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

  it("requires service scopes for SERVICE_ADMIN and rejects scopes on every other role", async () => {
    const { svc } = serviceWith({ id: "t", role: AdminRole.READ_ONLY, status: AdminMembershipStatus.ACTIVE }, 3);
    await expect(svc.changeRole(actor, "t", AdminRole.SERVICE_ADMIN, "reason text")).rejects.toMatchObject({ details: { reason: "SERVICE_SCOPES_REQUIRED" } });
    await expect(svc.changeRole(actor, "t", AdminRole.READ_ONLY, "reason text", [AdminVertical.CLINIC])).rejects.toMatchObject({ details: { reason: "SCOPES_ONLY_FOR_SERVICE_ADMIN" } });
    await expect(svc.changeRole(actor, "t", AdminRole.SERVICE_ADMIN, "reason text", [AdminVertical.SHOP])).rejects.toMatchObject({ details: { reason: "INVALID_SERVICE_SCOPE" } });
  });

  it("does not allow direct CUSTOM membership changes and only assigns custom roles to READ_ONLY memberships", async () => {
    const { svc } = serviceWith({ id: "t", role: AdminRole.READ_ONLY, status: AdminMembershipStatus.ACTIVE }, 3);
    await expect(svc.changeRole(actor, "t", AdminRole.CUSTOM, "custom role via wrong path"))
      .rejects.toMatchObject({ details: { rule: "CUSTOM_ROLE_ASSIGNMENT_REQUIRED" } });

    const tx = { adminUser: { findUnique: jest.fn().mockResolvedValue({ id: "t", role: AdminRole.SUPPORT }) } };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx), adminUser: tx.adminUser };
    const guarded = new AdminAccessControlService(prisma as never, { record: jest.fn() } as never, { publish: jest.fn() } as never);
    await expect(guarded.requestCustomRoleAssignment(actor, "t", "role-id", "custom role assignment"))
      .rejects.toMatchObject({ details: { rule: "CUSTOM_ROLE_REQUIRES_READ_ONLY_BASE" } });
  });

  it("clears a custom role when the built-in role changes", async () => {
    const { svc, tx } = serviceWith({ id: "t", role: AdminRole.READ_ONLY, status: AdminMembershipStatus.ACTIVE }, 3);
    tx.adminUser.update.mockResolvedValue({ id: "t", userId: "u-target", role: AdminRole.SUPPORT, status: AdminMembershipStatus.ACTIVE, serviceScopes: [] });
    // Keep the second read (the response DTO) minimal for this focused invariant.
    (svc as unknown as { get: jest.Mock }).get = jest.fn().mockResolvedValue({ role: AdminRole.SUPPORT });
    await svc.changeRole(actor, "t", AdminRole.SUPPORT, "change role and clear custom grants");
    expect(tx.adminUser.update).toHaveBeenCalledWith({ where: { id: "t" }, data: { role: AdminRole.SUPPORT, serviceScopes: [], customRoleId: null } });
  });

  it("keeps a new custom role pending and refuses delegated admin.manage", async () => {
    const tx = { adminCustomRole: { create: jest.fn() }, adminRoleAssignment: {}, $executeRaw: jest.fn() };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const svc = new AdminAccessControlService(prisma as never, { record: jest.fn() } as never, { publish: jest.fn() } as never);
    await expect(svc.createCustomRole(actor, { key: "shop-auditor", label: "Shop auditor", description: "Audits catalog changes", permissions: ["admin.manage"], verticals: [AdminVertical.SHOP], reason: "Create a narrow custom role" }))
      .rejects.toMatchObject({ details: { reason: "INVALID_CUSTOM_ROLE" } });
    expect(tx.adminCustomRole.create).not.toHaveBeenCalled();
  });

  it("requires a different super admin to approve a pending role definition", async () => {
    const pending = { id: "role-1", key: "shop-auditor", label: "Shop auditor", description: "Audits catalog changes", permissions: ["commerce.view"], verticals: [AdminVertical.SHOP], status: "PENDING", requestedByAdminId: actor.adminUserId, createdAt: new Date(), approvedAt: null };
    const tx = { $executeRaw: jest.fn(), adminCustomRole: { findUnique: jest.fn().mockResolvedValue(pending), update: jest.fn() } };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const svc = new AdminAccessControlService(prisma as never, { record: jest.fn() } as never, { publish: jest.fn() } as never);
    await expect(svc.reviewCustomRole(actor, pending.id, "APPROVE", "Approve scope after review"))
      .rejects.toMatchObject({ details: { rule: "SELF_APPROVAL_FORBIDDEN" } });
    expect(tx.adminCustomRole.update).not.toHaveBeenCalled();
    const secondAdmin = { ...actor, adminUserId: "second-admin", userId: "u-second" };
    tx.adminCustomRole.update.mockResolvedValue({ ...pending, status: "ACTIVE", approvedByAdminId: secondAdmin.adminUserId, approvedAt: new Date() });
    const result = await svc.reviewCustomRole(secondAdmin, pending.id, "APPROVE", "Approved independently");
    expect(result.status).toBe("ACTIVE");
    expect(tx.adminCustomRole.update).toHaveBeenCalledWith({ where: { id: pending.id }, data: expect.objectContaining({ status: "ACTIVE", approvedByAdminId: secondAdmin.adminUserId }) });
  });

  it("requires a second admin to approve role assignment and only then changes membership", async () => {
    const assignment = {
      id: "assignment-1", adminUserId: "target-admin", customRoleId: "role-1", status: "PENDING", requestedByAdminId: actor.adminUserId,
      adminUser: { id: "target-admin", role: AdminRole.READ_ONLY, customRoleId: null },
      customRole: { status: "ACTIVE" },
    };
    const tx = {
      $executeRaw: jest.fn(),
      adminRoleAssignment: { findUnique: jest.fn().mockResolvedValue(assignment), update: jest.fn().mockResolvedValue({ ...assignment, status: "APPLIED", reviewedAt: new Date() }) },
      adminUser: { update: jest.fn() },
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    const svc = new AdminAccessControlService(prisma as never, { record: jest.fn() } as never, { publish: jest.fn() } as never);
    await expect(svc.reviewCustomRoleAssignment(actor, assignment.id, "APPROVE", "Review assignment"))
      .rejects.toMatchObject({ details: { rule: "SELF_APPROVAL_FORBIDDEN" } });
    expect(tx.adminUser.update).not.toHaveBeenCalled();
    const secondAdmin = { ...actor, adminUserId: "second-admin", userId: "u-second" };
    const result = await svc.reviewCustomRoleAssignment(secondAdmin, assignment.id, "APPROVE", "Approved independently");
    expect(result.status).toBe("APPLIED");
    expect(tx.adminUser.update).toHaveBeenCalledWith({ where: { id: assignment.adminUserId }, data: { customRoleId: assignment.customRoleId } });
  });
});
