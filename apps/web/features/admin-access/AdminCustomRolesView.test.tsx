import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminAccessService } from "@/services/admin-access.service";
import { AdminCustomRolesView } from "./AdminCustomRolesView";

vi.mock("@/features/navigation/localized-link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/services/admin-access.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/admin-access.service")>();
  return {
    ...actual,
    adminAccessService: { customRoles: vi.fn(), permissions: vi.fn(), createCustomRole: vi.fn(), updateCustomRole: vi.fn(), archiveCustomRole: vi.fn() },
  };
});

const CATALOG = [
  { permission: "customer.view", domain: "customer", roles: [] },
  { permission: "customer.pii.reveal", domain: "customer", roles: [] },
  { permission: "commerce.view", domain: "commerce", roles: [] },
  { permission: "commerce.manage", domain: "commerce", roles: [] },
  { permission: "admin.manage", domain: "admin", roles: [] },
];
const ROLE = { id: "r1", name: "Shop desk", description: "Runs the shop", permissions: ["commerce.view"], verticals: ["SHOP"], members: 2, archivedAt: null, createdAt: "", updatedAt: "" };

describe("AdminCustomRolesView", () => {
  beforeEach(() => {
    vi.mocked(adminAccessService.customRoles).mockReset().mockResolvedValue([ROLE]);
    vi.mocked(adminAccessService.permissions).mockReset().mockResolvedValue(CATALOG as never);
    vi.mocked(adminAccessService.createCustomRole).mockReset().mockResolvedValue({ ...ROLE, id: "r2" });
    useAdminStore.setState({ context: { isAdmin: true, adminUserId: "root", role: "SUPER_ADMIN", permissions: ["access.view", "admin.manage"] } as never, status: "ready" });
  });

  it("lists roles with their members and per-section levels", async () => {
    renderWithIntl(<AdminCustomRolesView />);
    const card = (await screen.findByRole("heading", { name: "Shop desk" })).closest("li")!;
    expect(within(card).getByText("2 members")).toBeTruthy();
    expect(within(card).getByText("View")).toBeTruthy();
    // A role with members cannot be archived until they move to another role.
    expect((within(card).getByRole("button", { name: "Archive" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("builds a role section by section and never offers admin.manage", async () => {
    renderWithIntl(<AdminCustomRolesView />);
    // "New role" is enabled only once the permission catalogue has loaded (same request as the role list).
    await screen.findByRole("heading", { name: "Shop desk" });
    fireEvent.click(screen.getByRole("button", { name: "New role" }));
    expect(screen.queryByText("Administrators")).toBeNull();
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Support desk" } });
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Customers" })).getByRole("radio", { name: "View" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Shop" })).getByRole("radio", { name: "Full" }));
    fireEvent.change(screen.getByLabelText("Reason for this change"), { target: { value: "New support team" } });
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(adminAccessService.createCustomRole).toHaveBeenCalled());
    const input = vi.mocked(adminAccessService.createCustomRole).mock.calls[0]![0];
    expect(input).toMatchObject({ name: "Support desk", verticals: [], reason: "New support team" });
    expect([...input.permissions].sort()).toEqual(["commerce.manage", "commerce.view", "customer.view"]);
    expect(await screen.findByText("Support desk was created.")).toBeTruthy();
  });

  it("asks for a name, a permission and a reason before saving", async () => {
    renderWithIntl(<AdminCustomRolesView />);
    await screen.findByRole("heading", { name: "Shop desk" });
    fireEvent.click(screen.getByRole("button", { name: "New role" }));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Add a name");
    expect(adminAccessService.createCustomRole).not.toHaveBeenCalled();
  });

  it("is read-only without admin.manage", async () => {
    useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a", role: "ADMIN", permissions: ["access.view"] } as never, status: "ready" });
    renderWithIntl(<AdminCustomRolesView />);
    await screen.findByRole("heading", { name: "Shop desk" });
    expect(screen.queryByRole("button", { name: "New role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText(/only a super admin/)).toBeTruthy();
  });

  it.each(["fa", "de", "es"] as const)("renders the roles page in %s without English copy", async (locale) => {
    renderWithIntl(<AdminCustomRolesView />, locale);
    await screen.findByRole("heading", { name: "Shop desk" });
    expect(document.body.textContent).not.toMatch(/Custom roles|New role|members/);
  });
});
