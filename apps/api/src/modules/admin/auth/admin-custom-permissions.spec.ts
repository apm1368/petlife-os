import { AdminRole, AdminVertical } from "@prisma/client";
import { adminHasPermission, isCustomRolePermission } from "./admin-permissions";
import { allowedVerticals } from "./admin-verticals";

describe("approved custom admin roles", () => {
  it("uses only the explicitly approved grants and never grants role-builder power", () => {
    const custom = { role: AdminRole.CUSTOM, customPermissions: ["commerce.manage"] };
    expect(adminHasPermission(custom, "commerce.manage")).toBe(true);
    expect(adminHasPermission(custom, "finance.refund.execute")).toBe(false);
    expect(adminHasPermission(custom, "support.view")).toBe(false);
    expect(isCustomRolePermission("admin.manage")).toBe(false);
    expect(isCustomRolePermission("unknown.permission")).toBe(false);
  });

  it("narrows even an otherwise platform-wide built-in role to the approved custom-role verticals", () => {
    const custom = { role: AdminRole.CUSTOM, serviceScopes: [], customRoleVerticals: [AdminVertical.SHOP] };
    expect(allowedVerticals(custom)).toEqual([AdminVertical.SHOP]);
  });

  it("cannot expand a built-in vertical restriction", () => {
    const custom = { role: AdminRole.SHOP_ADMIN, serviceScopes: [], customRoleVerticals: [AdminVertical.SHOP, AdminVertical.CLINIC] };
    expect(allowedVerticals(custom)).toEqual([AdminVertical.SHOP]);
  });
});
