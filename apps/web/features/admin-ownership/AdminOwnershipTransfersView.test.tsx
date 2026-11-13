import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminOwnershipService, type AdminOwnershipTransfer } from "@/services/admin-ownership.service";
import { AdminOwnershipTransfersView } from "./AdminOwnershipTransfersView";

const search = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => search.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/en/admin/ownership-transfers" }));
vi.mock("@/services/admin-ownership.service", () => ({ adminOwnershipService: { list: vi.fn(), closeDispute: vi.fn() } }));
vi.mock("@/features/admin/admin-queues", () => ({ refreshQueues: vi.fn(() => Promise.resolve()) }));

const ROW: AdminOwnershipTransfer = {
  id: "t1", status: "DISPUTED", pet: { id: "p1", name: "Pishi", species: "CAT" }, from: { userId: "u1", name: "Ana" }, to: { userId: "u2", name: "Bo" },
  registeredOwner: { userId: "u1", name: "Ana" }, memoryDisposition: "RETAIN", note: "This is not my cat", createdAt: "2026-11-10T10:00:00.000Z",
  respondedAt: null, appliedAt: null, expiresAt: "2026-11-17T10:00:00.000Z", updatedAt: "2026-11-11T10:00:00.000Z",
};
const signIn = (permissions: string[]) => useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "A", role: "ADMIN", permissions } as never, status: "ready" });

describe("Ownership transfers", () => {
  beforeEach(() => {
    search.value = new URLSearchParams();
    vi.mocked(adminOwnershipService.list).mockReset().mockResolvedValue({ items: [ROW], total: 1, page: 1, pageSize: 25, disputed: 1 });
    vi.mocked(adminOwnershipService.closeDispute).mockReset().mockResolvedValue({ ...ROW, status: "CANCELLED" });
  });

  it("opens on disputes, explains that the pet doesn't move, and closes one with a reason", async () => {
    signIn(["customer.view", "customer.account.manage"]);
    renderWithIntl(<AdminOwnershipTransfersView />);
    const card = (await screen.findByRole("heading", { name: "Pishi" })).closest("li")!;
    expect(adminOwnershipService.list).toHaveBeenCalledWith({ status: "DISPUTED", q: undefined });
    expect(screen.getByRole("button", { name: "Disputed · 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(card).getByText(/registered owner stays/)).toBeTruthy();
    expect(within(card).getByText("«This is not my cat»")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Close dispute" }));
    fireEvent.click(within(card).getByRole("button", { name: "Close dispute" }));
    expect((await within(card).findByRole("alert")).textContent).toContain("at least 5 characters");
    fireEvent.change(within(card).getByLabelText("Outcome and reason"), { target: { value: "Checked papers with both" } });
    fireEvent.click(within(card).getByRole("button", { name: "Close dispute" }));
    await waitFor(() => expect(adminOwnershipService.closeDispute).toHaveBeenCalledWith("t1", "Checked papers with both"));
    expect(await screen.findByText(/request is closed and the registered owner stays/)).toBeTruthy();
  });

  it("is read-only without customer.account.manage, and speaks Persian", async () => {
    signIn(["customer.view"]);
    renderWithIntl(<AdminOwnershipTransfersView />, "fa");
    expect(await screen.findByRole("heading", { name: "Pishi" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("انتقال مالکیت");
    expect(screen.queryByRole("button", { name: "بستن اختلاف" })).toBeNull();
  });
});
