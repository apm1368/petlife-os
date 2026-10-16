import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { AdminPartnerDirectory } from "./AdminPartnerDirectory";
vi.mock("@/services/admin.service", () => ({
  adminService: { listProviders: vi.fn(), listSellers: vi.fn() },
}));
const row = {
  id: "org1",
  name: "Real partner",
  type: "VET_CLINIC",
  verificationStatus: "VERIFIED",
  createdAt: "2026-10-16T00:00:00Z",
};
const page = (name = "Real partner", total = 1) => ({
  items: [{ ...row, name }],
  total,
  page: 1,
  pageSize: 30,
});
function permissions(values: string[]) {
  useAdminStore.setState({
    context: {
      isAdmin: true,
      adminUserId: "a1",
      displayName: "Operator",
      role: "SUPPORT",
      permissions: values,
    } as never,
    status: "ready",
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  permissions(["customer.view"]);
  vi.mocked(adminService.listProviders).mockResolvedValue(page() as never);
  vi.mocked(adminService.listSellers).mockResolvedValue(page() as never);
});
describe("partner directory", () => {
  it("loads real results on entry and keeps verification controls away from read-only users", async () => {
    renderWithIntl(<AdminPartnerDirectory kind="provider" />);
    expect(screen.getByLabelText("Loading…")).toBeTruthy();
    await screen.findByText("Real partner");
    expect(adminService.listProviders).toHaveBeenCalledWith("", { page: 1, pageSize: 30 });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
  });
  it("does not request data without read permission", () => {
    permissions([]);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    expect(screen.getByText("You do not have permission to view partner organizations.")).toBeTruthy();
    expect(adminService.listSellers).not.toHaveBeenCalled();
  });
  it("requests later pages and resets the submitted name filter to page one", async () => {
    vi.mocked(adminService.listProviders).mockResolvedValue(page("Real partner", 61) as never);
    renderWithIntl(<AdminPartnerDirectory kind="provider" />);
    await screen.findByText("Real partner");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(adminService.listProviders).toHaveBeenLastCalledWith("", { page: 2, pageSize: 30 }),
    );
    await screen.findByText("Page 2");
    fireEvent.change(screen.getByLabelText("Partner name"), { target: { value: "  Meadow  " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(adminService.listProviders).toHaveBeenLastCalledWith("Meadow", { page: 1, pageSize: 30 }),
    );
  });
  it("preserves the typed filter after a load failure and retries instead of pretending the list is empty", async () => {
    vi.mocked(adminService.listSellers)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(page() as never);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    await screen.findByText("Could not load partner organizations");
    fireEvent.change(screen.getByLabelText("Partner name"), { target: { value: "unsent draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Real partner");
    expect((screen.getByLabelText("Partner name") as HTMLInputElement).value).toBe("unsent draft");
    expect(adminService.listSellers).toHaveBeenLastCalledWith("", { page: 1, pageSize: 30 });
  });
  it("shows real verification links only to reviewers", async () => {
    permissions(["verification.manage"]);
    renderWithIntl(<AdminPartnerDirectory kind="seller" />);
    await screen.findByText("Real partner");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/en/admin/verification/seller/org1");
  });
  it("ignores a late provider response when the directory changes to sellers", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(adminService.listProviders).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    const view = renderWithIntl(<AdminPartnerDirectory kind="provider" />);
    view.rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <AdminPartnerDirectory kind="seller" />
      </NextIntlClientProvider>,
    );
    await screen.findByText("Real partner");
    finish(page("Stale provider"));
    await waitFor(() => expect(screen.queryByText("Stale provider")).toBeNull());
  });
});
