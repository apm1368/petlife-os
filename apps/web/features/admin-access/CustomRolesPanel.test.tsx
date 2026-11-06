import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminAccessService } from "@/services/admin-access.service";
import { CustomRolesPanel } from "./CustomRolesPanel";

const state = vi.hoisted(() => ({ id: "requester", role: "SUPER_ADMIN", permissions: ["access.view", "admin.manage"] }));
vi.mock("@/stores/admin-store", () => ({ useAdminStore: (select: (value: unknown) => unknown) => select({ context: { adminUserId: state.id, role: state.role, permissions: state.permissions } }) }));
vi.mock("@/services/admin-access.service", () => ({
  adminAccessService: {
    customRoles: vi.fn(), createCustomRole: vi.fn(), reviewCustomRole: vi.fn(),
    requestCustomRoleAssignment: vi.fn(), reviewCustomRoleAssignment: vi.fn(),
  },
}));

const queue = {
  roles: [{ id: "r1", key: "shop-reviewer", label: "Shop reviewer", description: "Catalog review", permissions: ["commerce.view"], verticals: ["SHOP"], status: "PENDING" as const, reason: "Need a restricted role", requestedByAdminId: "requester", approvedByAdminId: null, createdAt: "2026-11-06T09:00:00Z", approvedAt: null }],
  pendingAssignments: [],
};
const permissions = [
  { permission: "commerce.view", domain: "commerce", roles: ["READ_ONLY"] as never[], customRoleAllowed: true },
  { permission: "customer.pii.reveal", domain: "customer", roles: ["SUPER_ADMIN"] as never[], customRoleAllowed: false },
];

describe("CustomRolesPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks(); state.id = "requester"; state.role = "SUPER_ADMIN"; state.permissions = ["access.view", "admin.manage"];
    vi.mocked(adminAccessService.customRoles).mockResolvedValue(queue);
  });

  it("keeps the creator from approving their own pending role", async () => {
    renderWithIntl(<CustomRolesPanel permissions={permissions} onChanged={vi.fn()} />);
    await screen.findByText("Shop reviewer");
    expect(screen.getByText("Pending approval")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByText("customer.pii.reveal")).toBeNull();
  });

  it("requires a reason before a different super admin can approve", async () => {
    state.id = "reviewer";
    vi.mocked(adminAccessService.reviewCustomRole).mockResolvedValue({ ...queue.roles[0]!, status: "ACTIVE" });
    renderWithIntl(<CustomRolesPanel permissions={permissions} onChanged={vi.fn()} />);
    await screen.findByText("Shop reviewer");
    const approve = screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Approval/rejection reason"), { target: { value: "Permission set reviewed" } });
    fireEvent.click(approve);
    expect(adminAccessService.reviewCustomRole).toHaveBeenCalledWith("r1", "APPROVE", "Permission set reviewed");
  });
});
