import { AdminRole, AdminVertical } from "@prisma/client";
import { allowedVerticals, canReachVertical, isScopedRole, SERVICE_VERTICALS } from "./admin-verticals";

const admin = (role: AdminRole, serviceScopes: AdminVertical[] = []) => ({ role, serviceScopes });

describe("admin vertical scoping", () => {
  it("leaves every pre-Wave-2 role reaching every vertical", () => {
    for (const role of [AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.SUPPORT, AdminRole.FINANCE, AdminRole.EDITOR, AdminRole.COMMERCE_OPERATIONS, AdminRole.CLINIC_OPERATIONS, AdminRole.ANALYTICS]) {
      expect(allowedVerticals(admin(role))).toBeNull();
      expect(isScopedRole(role)).toBe(false);
      for (const vertical of Object.values(AdminVertical)) expect(canReachVertical(admin(role), vertical)).toBe(true);
    }
  });

  it("confines each scoped role to its own vertical", () => {
    expect(allowedVerticals(admin(AdminRole.SHOP_ADMIN))).toEqual([AdminVertical.SHOP]);
    expect(allowedVerticals(admin(AdminRole.CONTENT_ADMIN))).toEqual([AdminVertical.CONTENT]);
    expect(allowedVerticals(admin(AdminRole.SUPPORT_AGENT))).toEqual([AdminVertical.SUPPORT]);
    expect(canReachVertical(admin(AdminRole.SHOP_ADMIN), AdminVertical.ACCOMMODATION)).toBe(false);
    expect(canReachVertical(admin(AdminRole.CONTENT_ADMIN), AdminVertical.SHOP)).toBe(false);
    expect(canReachVertical(admin(AdminRole.SUPPORT_AGENT), AdminVertical.INSURANCE)).toBe(false);
  });

  it("reads a service administrator's verticals from its own scopes, not from its role", () => {
    const groomer = admin(AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]);
    expect(canReachVertical(groomer, AdminVertical.GROOMING)).toBe(true);
    expect(canReachVertical(groomer, AdminVertical.CLINIC)).toBe(false);
    expect(canReachVertical(groomer, AdminVertical.SHOP)).toBe(false);

    const both = admin(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC, AdminVertical.INSURANCE]);
    expect(canReachVertical(both, AdminVertical.CLINIC)).toBe(true);
    expect(canReachVertical(both, AdminVertical.INSURANCE)).toBe(true);
    expect(canReachVertical(both, AdminVertical.ACCOMMODATION)).toBe(false);
  });

  it("fails closed for a service administrator with no scopes configured", () => {
    const unconfigured = admin(AdminRole.SERVICE_ADMIN);
    expect(allowedVerticals(unconfigured)).toEqual([]);
    for (const vertical of Object.values(AdminVertical)) expect(canReachVertical(unconfigured, vertical)).toBe(false);
  });

  it("ignores a non-service vertical stored on a service administrator", () => {
    // Shop, content and support are their own roles; a stray scope must not become a back door.
    const tampered = admin(AdminRole.SERVICE_ADMIN, [AdminVertical.SHOP, AdminVertical.CLINIC]);
    expect(allowedVerticals(tampered)).toEqual([AdminVertical.CLINIC]);
    expect(canReachVertical(tampered, AdminVertical.SHOP)).toBe(false);
    expect(SERVICE_VERTICALS).not.toContain(AdminVertical.SHOP);
  });
});
