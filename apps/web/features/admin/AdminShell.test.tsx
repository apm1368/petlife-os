import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { AdminSessionContextDto, UserDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminShell } from "./AdminShell";

const route = vi.hoisted(() => ({ pathname: "/en/admin" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => route.pathname,
}));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn() } }));
vi.mock("@/services/admin.service", () => ({ adminService: { getMe: vi.fn() } }));

const SESSION_USER: UserDto = { id: "u1", email: "admin@example.com", phone: null, displayName: "An Admin", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" };

describe("AdminShell", () => {
  beforeEach(() => {
    route.pathname = "/en/admin";
    vi.mocked(authService.getSession).mockReset();
    vi.mocked(adminService.getMe).mockReset();
    useAdminStore.setState({ context: null, status: "idle" });
  });

  it("shows a clear message when the session has no admin access", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin: false, adminUserId: null, displayName: null, role: null, permissions: [] } satisfies AdminSessionContextDto);

    renderWithIntl(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    await waitFor(() => expect(screen.getByText("No admin access")).toBeTruthy());
    expect(screen.queryByText("content")).toBeNull();
  });

  it("shows the shell with only the nav items the resolved permissions allow", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({
      isAdmin: true,
      adminUserId: "admin-1",
      displayName: "Support Agent",
      role: "SUPPORT" as never,
      permissions: ["customer.view", "support.view", "support.manage", "dispute.view", "dispute.manage", "task.manage"] as never,
    } satisfies AdminSessionContextDto);

    renderWithIntl(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    await waitFor(() => expect(screen.getByText("content")).toBeTruthy());
    // Items live in job groups (dropdown pills); open the one that holds support work.
    fireEvent.click(screen.getByRole("button", { name: "Customers & trust" }));
    expect(screen.getByRole("link", { name: "Support" })).toBeTruthy();
    expect(screen.getByText("Disputes")).toBeTruthy();
    // SUPPORT has neither finance.view nor audit.view — those groups and items must not render at all.
    expect(screen.queryByRole("button", { name: "Finance" })).toBeNull();
    expect(screen.queryByRole("button", { name: "System" })).toBeNull();
    expect(screen.queryByText("Transactions")).toBeNull();
    expect(screen.queryByText("Audit")).toBeNull();
    // Decision 5: the sample-data CRM / customer-affairs workspaces are never offered to a real admin, even one
    // holding the permissions they used to be listed under.
    fireEvent.click(screen.getByRole("button", { name: "Daily work" }));
    expect(screen.getByText("Tasks")).toBeTruthy();
    expect(screen.queryByText("CRM")).toBeNull();
    expect(screen.queryByText("Customer Affairs")).toBeNull();
  });

  it("shows every nav item for a SUPER_ADMIN with every permission", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({
      isAdmin: true,
      adminUserId: "admin-2",
      displayName: "Root Admin",
      role: "SUPER_ADMIN" as never,
      permissions: [
        "customer.view",
        "customer.pii.reveal",
        "support.view",
        "support.manage",
        "dispute.view",
        "dispute.manage",
        "trust.view",
        "trust.manage",
        "verification.manage",
        "finance.view",
        "finance.refund.request",
        "finance.refund.approve",
        "finance.refund.execute",
        "task.manage",
        "audit.view",
        "admin.manage",
      ] as never,
    } satisfies AdminSessionContextDto);

    renderWithIntl(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    await waitFor(() => expect(screen.getByText("content")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Finance" }));
    expect(screen.getByText("Transactions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByText("Audit")).toBeTruthy();
  });
  it("offers read-only partner directories to customer viewers without verification permission", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin:true, adminUserId:"a1", displayName:"Reader", role:"SUPPORT" as never, permissions:["customer.view"] as never } satisfies AdminSessionContextDto);
    renderWithIntl(<AdminShell><div>read-only shell</div></AdminShell>);
    await screen.findByText("read-only shell");
    fireEvent.click(screen.getByRole("button",{name:"Network"}));
    expect(screen.getByRole("link",{name:"Providers"}).getAttribute("href")).toBe("/en/admin/providers");
    expect(screen.getByRole("link",{name:"Sellers"}).getAttribute("href")).toBe("/en/admin/sellers");
    expect(screen.queryByRole("link",{name:"Services"})).toBeNull();
  });

  it("offers settings with view permission without exposing other system tools", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({
      isAdmin: true, adminUserId: "admin-viewer", displayName: "Settings reader",
      role: "SUPPORT" as never, permissions: ["settings.view"] as never,
    } satisfies AdminSessionContextDto);
    renderWithIntl(<AdminShell><div>settings shell</div></AdminShell>);
    await screen.findByText("settings shell");
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByRole("link", { name: "Platform settings" }).getAttribute("href")).toBe("/en/admin/settings");
    expect(screen.queryByText("Audit")).toBeNull();
    expect(screen.queryByText("Admin users")).toBeNull();
  });

  it("expands the current route group and marks only its page as current", async () => {
    route.pathname = "/en/admin/providers/organization-1";
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin: true, adminUserId: "reader", displayName: "Reader", role: "SUPPORT" as never, permissions: ["customer.view"] as never });
    renderWithIntl(<AdminShell><div>provider content</div></AdminShell>);
    await screen.findByText("provider content");
    expect(screen.getByRole("button", { name: "Network" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Providers" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps mobile navigation permission-filtered and closes after choosing a page", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: SESSION_USER });
    vi.mocked(adminService.getMe).mockResolvedValue({ isAdmin: true, adminUserId: "reader", displayName: "Reader", role: "SUPPORT" as never, permissions: ["customer.view"] as never });
    renderWithIntl(<AdminShell><div>mobile content</div></AdminShell>);
    await screen.findByText("mobile content");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("link", { name: "Transactions" })).toBeNull();
    expect(within(dialog).queryByRole("link", { name: "CRM" })).toBeNull();
    const providerLink = within(dialog).getByRole("link", { name: "Providers" });
    providerLink.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(providerLink);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

});
