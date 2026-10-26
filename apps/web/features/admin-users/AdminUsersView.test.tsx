import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserDirectoryListDto, AdminUserDirectoryRowDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import { adminUsersService } from "@/services/admin-users.service";
import { AdminUsersView } from "./AdminUsersView";

vi.mock("@/services/admin-users.service", () => ({ adminUsersService: { list: vi.fn(), detail: vi.fn() } }));
const user: AdminUserDirectoryRowDto = { id: "user-1", displayName: "کاربر نمونه", emailMasked: "te***@example.com", phoneMasked: "+98912***1234", accountStatus: "ACTIVE", createdAt: "2026-10-01T10:00:00Z", lastActiveAt: null, roles: [{ kind: "CUSTOMER", role: "OWNER", business: null }, { kind: "CLINIC", role: "VET", business: { id: "clinic-1", name: "کلینیک همراه", verificationStatus: "VERIFIED" } }] };
const list: AdminUserDirectoryListDto = { items: [user], total: 21, page: 1, pageSize: 20 };
const apiError = (status: number) => new ApiError({ code: "ERROR", message: "failed", requestId: "test" }, status);

describe("admin users directory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAdminStore.setState({ context: { isAdmin: true, adminUserId: "admin", role: "ADMIN", permissions: ["customer.view"] } as never, status: "ready" });
    vi.mocked(adminUsersService.list).mockResolvedValue(list);
    vi.mocked(adminUsersService.detail).mockResolvedValue({ user, householdCount: 2, petCount: 3 });
  });
  it("makes no private requests without permission", () => {
    useAdminStore.setState({ context: { isAdmin: true, permissions: [] } as never });
    renderWithIntl(<AdminUsersView />);
    expect(screen.getByRole("alert").textContent).toContain("permission");
    expect(adminUsersService.list).not.toHaveBeenCalled();
    expect(adminUsersService.detail).not.toHaveBeenCalled();
  });
  it("shows localized relationships, masked contacts and unknown activity honestly", async () => {
    renderWithIntl(<AdminUsersView />, "fa");
    await screen.findByText("کاربر نمونه");
    expect(screen.getByText("عضو مجموعهٔ کلینیک همراه")).toBeTruthy();
    expect(screen.getByText("te***@example.com")).toBeTruthy();
    expect(screen.getByText("ثبت نشده")).toBeTruthy();
    expect(screen.getByRole("link", { name: "مشاهدهٔ پروفایل کاربر" }).getAttribute("href")).toBe("/fa/admin/users/user-1");
    expect(document.body.textContent).not.toContain("VET");
  });
  it("applies filters explicitly and resets pagination when a new filter is submitted", async () => {
    renderWithIntl(<AdminUsersView />);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(adminUsersService.list).toHaveBeenCalledTimes(2));
    expect(vi.mocked(adminUsersService.list).mock.calls[1]![0].get("page")).toBe("2");
    fireEvent.change(screen.getByLabelText("Search name, email or phone"), { target: { value: " clinic " } });
    fireEvent.change(screen.getByLabelText("Relationship type"), { target: { value: "CLINIC" } });
    expect(adminUsersService.list).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(adminUsersService.list).toHaveBeenCalledTimes(3));
    expect(Object.fromEntries(vi.mocked(adminUsersService.list).mock.calls[2]![0])).toEqual({ page: "1", pageSize: "20", q: "clinic", kind: "CLINIC" });
  });
  it("distinguishes a failed read from an empty list and supports retry", async () => {
    vi.mocked(adminUsersService.list).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...list, items: [], total: 0 });
    renderWithIntl(<AdminUsersView />);
    await screen.findByRole("alert");
    expect(screen.queryByText("No users match these filters.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No users match these filters.");
  });
  it("shows server permission denial instead of an empty result", async () => {
    vi.mocked(adminUsersService.list).mockRejectedValue(apiError(403));
    renderWithIntl(<AdminUsersView />);
    expect((await screen.findByRole("alert")).textContent).toContain("permission");
    expect(screen.queryByText("No users match these filters.")).toBeNull();
  });
  it("shows the available profile counts and links to the existing customer record", async () => {
    renderWithIntl(<AdminUsersView id="user-1" />);
    await screen.findByText("Households: 2");
    expect(screen.getByText("Pets: 3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open customer record" }).getAttribute("href")).toBe("/en/admin/customers/user-1");
    expect(adminUsersService.list).not.toHaveBeenCalled();
  });
  it("handles a missing user without rendering stale profile sections", async () => {
    vi.mocked(adminUsersService.detail).mockRejectedValue(apiError(404));
    renderWithIntl(<AdminUsersView id="missing" />);
    await screen.findByText("This user could not be found.");
    expect(screen.queryByRole("link", { name: "Open customer record" })).toBeNull();
  });
  it("ignores an older response after the filter changes", async () => {
    let resolveOld!: (value: AdminUserDirectoryListDto) => void;
    vi.mocked(adminUsersService.list).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ ...list, items: [{ ...user, displayName: "New match" }] });
    renderWithIntl(<AdminUsersView />);
    fireEvent.change(screen.getByLabelText("Search name, email or phone"), { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await screen.findByText("New match");
    await act(async () => resolveOld(list));
    expect(screen.queryByText("کاربر نمونه")).toBeNull();
  });
  it("removes previously loaded private rows when permission is revoked", async () => {
    renderWithIntl(<AdminUsersView />);
    await screen.findByText("کاربر نمونه");
    act(() => useAdminStore.setState({ context: { isAdmin: true, permissions: [] } as never }));
    expect(screen.queryByText("کاربر نمونه")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
