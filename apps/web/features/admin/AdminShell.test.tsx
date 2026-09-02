import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { AdminSessionContextDto, UserDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminShell } from "./AdminShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/en/admin",
}));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn() } }));
vi.mock("@/services/admin.service", () => ({ adminService: { getMe: vi.fn() } }));

const SESSION_USER: UserDto = { id: "u1", email: "admin@example.com", phone: null, displayName: "An Admin", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" };

describe("AdminShell", () => {
  beforeEach(() => {
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
    expect(screen.getByText("Support")).toBeTruthy();
    expect(screen.getByText("Disputes")).toBeTruthy();
    // SUPPORT has neither finance.view nor audit.view — those nav items must not render.
    expect(screen.queryByText("Transactions")).toBeNull();
    expect(screen.queryByText("Audit")).toBeNull();
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
    expect(screen.getByText("Transactions")).toBeTruthy();
    expect(screen.getByText("Audit")).toBeTruthy();
  });
});
