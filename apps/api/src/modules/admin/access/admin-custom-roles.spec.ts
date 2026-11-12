import { AdminMembershipStatus, AdminRole, AdminVertical } from "@prisma/client";
import { AdminCustomRolesService } from "./admin-custom-roles.service";
import { effectiveAccess } from "../auth/admin-access.service";
import { adminCan, ROLE_PERMISSIONS } from "../auth/admin-permissions";
import { allowedVerticals } from "../auth/admin-verticals";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import type { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { DomainEventsService } from "../../../common/events/domain-events.service";

const actor: ResolvedAdminContext = { adminUserId: "root", userId: "u-root", displayName: "Root", role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE, serviceScopes: [] };
const liveRole = { id: "r1", name: "Shop desk", permissions: ["commerce.view", "commerce.manage"], verticals: [] as AdminVertical[], archivedAt: null };

describe("effective access from a custom role", () => {
  it("uses the built-in role when no custom role is assigned", () => {
    expect(effectiveAccess({ role: AdminRole.SUPPORT }).permissions).toEqual(ROLE_PERMISSIONS[AdminRole.SUPPORT]);
  });
  it("replaces the built-in permissions with the custom role's, never carrying admin.manage", () => {
    const access = effectiveAccess({ role: AdminRole.READ_ONLY, customRole: { ...liveRole, permissions: ["commerce.view", "admin.manage", "not.a.permission"] } });
    expect(access.permissions).toEqual(["commerce.view"]);
    expect(access.customRole).toEqual({ id: "r1", name: "Shop desk", verticals: [] });
  });
  it("fails closed when a stale archived role is still attached", () => {
    expect(effectiveAccess({ role: AdminRole.ADMIN, customRole: { ...liveRole, archivedAt: new Date() } }).permissions).toEqual([]);
  });
  it("checks resolved permissions before the built-in role and limits verticals by the role", () => {
    const admin = { ...actor, role: AdminRole.READ_ONLY, permissions: ["commerce.view" as const], customRole: { id: "r1", name: "Shop desk", verticals: [AdminVertical.SHOP] } };
    expect(adminCan(admin, "commerce.view")).toBe(true);
    expect(adminCan(admin, "customer.view")).toBe(false);
    expect(allowedVerticals(admin)).toEqual([AdminVertical.SHOP]);
    expect(allowedVerticals({ ...admin, customRole: { id: "r1", name: "Shop desk", verticals: [] } })).toBeNull();
    expect(adminCan({ role: AdminRole.SUPPORT }, "support.view")).toBe(true);
  });
});

describe("AdminCustomRolesService rules", () => {
  const setup = (target: Record<string, unknown> | null, role: Record<string, unknown> | null = liveRole) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      adminUser: { findUnique: jest.fn().mockResolvedValue(target), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...target, ...data })) },
      adminCustomRole: {
        findUnique: jest.fn().mockResolvedValue(role),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new", ...data, archivedAt: null, createdAt: new Date(), updatedAt: new Date(), _count: { members: 0 } })),
      },
    };
    const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) } as unknown as PrismaService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AdminAuditLogService;
    const events = { publish: jest.fn().mockResolvedValue(undefined) } as unknown as DomainEventsService;
    return { tx, audit, service: new AdminCustomRolesService(prisma, audit, events) };
  };
  const member = { id: "m1", userId: "u1", role: AdminRole.SUPPORT, status: AdminMembershipStatus.ACTIVE, customRoleId: null, customRole: null };

  it("creates a role, trims its name and audits the change", async () => {
    const { service, audit } = setup(null);
    const dto = await service.create(actor, { name: "  Shop   desk ", permissions: ["commerce.view", "commerce.view"], verticals: [AdminVertical.SHOP] }, "Shop team needs its own role");
    expect(dto).toMatchObject({ name: "Shop desk", permissions: ["commerce.view"], verticals: ["SHOP"], members: 0 });
    expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ action: "admin_role.created", reason: "Shop team needs its own role" });
  });
  it("refuses admin.manage, unknown and empty permission sets", async () => {
    const { service } = setup(null);
    await expect(service.create(actor, { name: "Root clone", permissions: ["admin.manage"], verticals: [] }, "reason here")).rejects.toMatchObject({ code: "ADMIN_GOVERNANCE_RULE" });
    await expect(service.create(actor, { name: "Typo", permissions: ["comerce.view"], verticals: [] }, "reason here")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.create(actor, { name: "Empty", permissions: [], verticals: [] }, "reason here")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
  it("assigns a live role and records before and after", async () => {
    const { service, audit } = setup(member);
    await expect(service.assign(actor, "m1", "r1", "Moves to the shop desk")).resolves.toMatchObject({ customRole: { id: "r1", name: "Shop desk" } });
    expect((audit.record as jest.Mock).mock.calls[0][0]).toMatchObject({ action: "admin_user.custom_role_assigned", afterSummary: { customRole: { id: "r1" } } });
  });
  it("never assigns to oneself, to a SUPER_ADMIN or an archived role", async () => {
    await expect(setup({ ...member, id: "root" }).service.assign(actor, "root", "r1", "self escalation")).rejects.toMatchObject({ code: "ADMIN_GOVERNANCE_RULE" });
    await expect(setup({ ...member, role: AdminRole.SUPER_ADMIN }).service.assign(actor, "m1", "r1", "demote the owner")).rejects.toMatchObject({ code: "ADMIN_GOVERNANCE_RULE" });
    await expect(setup(member, { ...liveRole, archivedAt: new Date() }).service.assign(actor, "m1", "r1", "old role")).rejects.toMatchObject({ code: "ADMIN_GOVERNANCE_RULE" });
  });
});
