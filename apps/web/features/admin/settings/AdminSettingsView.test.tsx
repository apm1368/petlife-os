import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import type { AdminPermissionName } from "@petlife/types";
import {
  adminSettingsService,
  type PlatformSetting,
  type SettingChange,
} from "@/services/admin-settings.service";
import { AdminSettingsView, parseSettingNumber } from "./AdminSettingsView";
vi.mock("@/services/admin-settings.service", () => ({
  adminSettingsService: {
    list: vi.fn(),
    changes: vi.fn(),
    propose: vi.fn(),
    review: vi.fn(),
    cancel: vi.fn(),
  },
}));
const svc = vi.mocked(adminSettingsService);
const setting: PlatformSetting = {
  key: "commerce.refundApprovalThresholdIrr",
  category: "commerce",
  type: "integer",
  scope: "INTERNAL",
  highImpact: true,
  constraints: { min: 0, max: 2_000_000_000, maxLength: null },
  description: "Refund approval threshold",
  value: 1_000_001,
  defaultValue: 500000,
  source: "OVERRIDE",
  version: 3,
  updatedAt: null,
  pendingChanges: 0,
};
const change: SettingChange = {
  id: "ch1",
  key: setting.key,
  status: "PENDING",
  previousValue: 1_000_001,
  proposedValue: 100000,
  baseVersion: 3,
  reason: "Updated operating policy",
  reviewNote: null,
  requestedBy: { id: "other", displayName: "Other admin", role: "ADMIN" },
  reviewedBy: null,
  createdAt: "2026-10-16T00:00:00Z",
  reviewedAt: null,
};
function permissions(...permissions: AdminPermissionName[]) {
  useAdminStore.setState({
    context: {
      isAdmin: true,
      adminUserId: "self",
      displayName: "Admin",
      role: "ADMIN" as never,
      permissions,
    },
    status: "ready",
  });
}
function edit() {
  const panel = screen
    .getByRole("heading", { name: "Refund second-approval threshold", level: 2 })
    .closest("section")!;
  fireEvent.click(within(panel).getByRole("button", { name: "Edit value" }));
  return within(panel);
}
const confirmLabel = "I have reviewed the value and consequences of this action.";
beforeEach(() => {
  vi.resetAllMocks();
  permissions("settings.view", "settings.manage");
  svc.list.mockResolvedValue([setting]);
  svc.changes.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});

describe("settings governance UI", () => {
  it("preserves exact IRR through Persian Toman inputs without accepting unsafe or excessive precision", () => {
    expect(parseSettingNumber("۱۰۰۰۰۰٫۱", true)).toBe(1000001);
    expect(parseSettingNumber("۱۲", false)).toBe(12);
    expect(parseSettingNumber("0", true)).toBe(0);
    for (const invalid of ["", "-1", "1e5", "1.01", "9007199254740992"])
      expect(parseSettingNumber(invalid, true)).toBeUndefined();
    expect(parseSettingNumber("1.1", false)).toBeUndefined();
  });
  it("does not request settings without the read permission", () => {
    permissions("settings.manage");
    renderWithIntl(<AdminSettingsView />);
    expect(screen.getByText("You do not have permission to view settings.")).toBeTruthy();
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.changes).not.toHaveBeenCalled();
  });
  it("shows real monetary precision but hides mutation controls from a read-only role", async () => {
    permissions("settings.view");
    svc.changes.mockResolvedValue({ items: [change], total: 1, page: 1, pageSize: 20 });
    renderWithIntl(<AdminSettingsView />);
    expect((await screen.findAllByText("100,000.1 Toman")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Edit value" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
  });
  it("sends an integer-IRR proposal against the original version and reports pending, never applied", async () => {
    svc.propose.mockResolvedValue(change);
    renderWithIntl(<AdminSettingsView />);
    await screen.findByRole("heading", { name: "Refund second-approval threshold", level: 2 });
    const scope = edit();
    fireEvent.change(scope.getByLabelText("Value in Toman (up to one decimal)"), {
      target: { value: "۱۲۳۴٫۵" },
    });
    fireEvent.change(scope.getByLabelText("Reason for change (at least 5 characters)"), {
      target: { value: "Owner policy change" },
    });
    expect(
      (scope.getByRole("button", { name: "Submit for second approval" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(scope.getByLabelText(confirmLabel));
    fireEvent.click(scope.getByRole("button", { name: "Submit for second approval" }));
    await waitFor(() =>
      expect(svc.propose).toHaveBeenCalledWith(setting.key, {
        value: 12345,
        baseVersion: 3,
        reason: "Owner policy change",
      }),
    );
    expect(await scope.findByRole("status")).toHaveProperty("textContent", "Pending approval; not applied");
    expect(scope.queryByText("Applied")).toBeNull();
  });
  it("preserves the draft and reason after failure", async () => {
    svc.propose.mockRejectedValue(new Error("network"));
    renderWithIntl(<AdminSettingsView />);
    await screen.findByRole("heading", { name: "Refund second-approval threshold", level: 2 });
    const scope = edit();
    fireEvent.change(scope.getByLabelText("Value in Toman (up to one decimal)"), {
      target: { value: "2000" },
    });
    fireEvent.change(scope.getByLabelText("Reason for change (at least 5 characters)"), {
      target: { value: "Keep this reason" },
    });
    fireEvent.click(scope.getByLabelText(confirmLabel));
    fireEvent.click(scope.getByRole("button", { name: "Submit for second approval" }));
    expect(await scope.findByRole("alert")).toBeTruthy();
    expect((scope.getByLabelText("Value in Toman (up to one decimal)") as HTMLInputElement).value).toBe(
      "2000",
    );
    expect(
      (scope.getByLabelText("Reason for change (at least 5 characters)") as HTMLInputElement).value,
    ).toBe("Keep this reason");
    expect(scope.queryByRole("status")).toBeNull();
  });
  it("allows explicit clearing of a localized announcement via null", async () => {
    const announcement: PlatformSetting = {
      ...setting,
      key: "platform.announcement",
      type: "localizedText",
      highImpact: false,
      value: { fa: "اطلاعیه", en: "Notice" },
    };
    svc.list.mockResolvedValue([announcement]);
    svc.propose.mockResolvedValue({ ...change, key: announcement.key, status: "APPLIED" });
    renderWithIntl(<AdminSettingsView />);
    await screen.findByRole("heading", { name: "Public announcement", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Edit value" }));
    for (const label of ["Persian text", "English text"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Reason for change (at least 5 characters)"), {
      target: { value: "Announcement ended" },
    });
    fireEvent.click(screen.getByLabelText(confirmLabel));
    fireEvent.click(screen.getByRole("button", { name: "Apply change" }));
    await waitFor(() =>
      expect(svc.propose).toHaveBeenCalledWith("platform.announcement", {
        value: null,
        baseVersion: 3,
        reason: "Announcement ended",
      }),
    );
  });
  it("keeps an approver from reviewing their own pending proposal", async () => {
    permissions("settings.view", "settings.manage", "settings.approve");
    svc.changes.mockResolvedValue({
      items: [{ ...change, requestedBy: { id: "self", displayName: "Admin", role: "ADMIN" } }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    renderWithIntl(<AdminSettingsView />);
    expect(await screen.findByRole("button", { name: "Cancel own request" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve and apply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject change" })).toBeNull();
  });
  it("requires confirmation before a second administrator reviews a proposal", async () => {
    permissions("settings.view", "settings.approve");
    svc.changes.mockResolvedValue({ items: [change], total: 1, page: 1, pageSize: 20 });
    svc.review.mockResolvedValue({ ...change, status: "APPLIED" });
    renderWithIntl(<AdminSettingsView />);
    const button = await screen.findByRole("button", { name: "Approve and apply" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Review note (optional)"), {
      target: { value: "Reviewed funds policy" },
    });
    fireEvent.click(screen.getByLabelText(confirmLabel));
    fireEvent.click(button);
    await waitFor(() => expect(svc.review).toHaveBeenCalledWith("ch1", "APPROVE", "Reviewed funds policy"));
  });
  it("reports a version conflict and requires review of the refreshed value while preserving the draft", async () => {
    svc.propose.mockRejectedValueOnce(
      new ApiError({ code: "SETTING_CHANGE_CONFLICT", message: "changed", requestId: "r" }, 409),
    );
    renderWithIntl(<AdminSettingsView />);
    await screen.findByRole("heading", { name: "Refund second-approval threshold", level: 2 });
    const scope = edit();
    fireEvent.change(scope.getByLabelText("Value in Toman (up to one decimal)"), {
      target: { value: "2000" },
    });
    fireEvent.change(scope.getByLabelText("Reason for change (at least 5 characters)"), {
      target: { value: "New operating policy" },
    });
    fireEvent.click(scope.getByLabelText(confirmLabel));
    fireEvent.click(scope.getByRole("button", { name: "Submit for second approval" }));
    await scope.findByRole("alert");
    svc.list.mockResolvedValue([{ ...setting, value: 10000, version: 4 }]);
    fireEvent.click(scope.getByRole("button", { name: "Reload current value" }));
    const review = await scope.findByRole("button", { name: "I reviewed the latest value; keep this draft" });
    expect((scope.getByLabelText("Value in Toman (up to one decimal)") as HTMLInputElement).value).toBe(
      "2000",
    );
    fireEvent.click(review);
    expect(
      (scope.getByRole("button", { name: "Submit for second approval" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    svc.propose.mockResolvedValue({ ...change, baseVersion: 4 });
    fireEvent.click(scope.getByLabelText(confirmLabel));
    fireEvent.click(scope.getByRole("button", { name: "Submit for second approval" }));
    await waitFor(() =>
      expect(svc.propose).toHaveBeenLastCalledWith(setting.key, {
        value: 20000,
        baseVersion: 4,
        reason: "New operating policy",
      }),
    );
  });
});
