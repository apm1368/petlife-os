import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminPermissionName } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { useAdminStore } from "@/stores/admin-store";
import { adminSmsPatternsService, type SmsPatternTemplate } from "@/services/admin-sms-patterns.service";
import { AdminSmsPatternsView } from "./AdminSmsPatternsView";

vi.mock("@/services/admin-sms-patterns.service", () => ({
  adminSmsPatternsService: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

const svc = vi.mocked(adminSmsPatternsService);
const binding: SmsPatternTemplate = {
  id: "pattern-1",
  key: "order.created",
  locale: "fa",
  displayName: "Order created",
  farazPatternCode: "ORDER_CREATED",
  bodyAttributeKey: "message",
  isActive: true,
  version: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function permissions(...value: AdminPermissionName[]) {
  useAdminStore.setState({
    context: {
      isAdmin: true,
      adminUserId: "admin-1",
      displayName: "Admin",
      role: "ADMIN" as never,
      permissions: value,
    },
    status: "ready",
  });
}

describe("AdminSmsPatternsView", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    permissions("system.view", "settings.manage");
    svc.list.mockResolvedValue([binding]);
  });

  it("does not fetch or reveal SMS pattern metadata without system.view", () => {
    permissions("settings.manage");
    renderWithIntl(<AdminSmsPatternsView />);
    expect(screen.getByText("You do not have permission to view SMS pattern bindings.")).toBeTruthy();
    expect(svc.list).not.toHaveBeenCalled();
  });

  it("keeps creation controls hidden for an administrator without settings.manage", async () => {
    permissions("system.view");
    renderWithIntl(<AdminSmsPatternsView />);
    expect(await screen.findByText("Order created")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Add an SMS pattern binding" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("validates safe binding metadata and submits no SMS content or credentials", async () => {
    svc.create.mockResolvedValue({ ...binding, id: "pattern-2" });
    renderWithIntl(<AdminSmsPatternsView />);
    await screen.findByText("Order created");

    const submit = screen.getByRole("button", { name: "Save binding" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Notification event key"), { target: { value: "order.paid" } });
    fireEvent.change(screen.getByLabelText("Admin name"), { target: { value: "Order payment" } });
    fireEvent.change(screen.getByLabelText("Faraz pattern code"), { target: { value: "ORDER_PAID" } });
    fireEvent.change(screen.getByLabelText("Faraz body variable"), { target: { value: "message" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() =>
      expect(svc.create).toHaveBeenCalledWith({
        key: "order.paid",
        locale: "fa",
        displayName: "Order payment",
        farazPatternCode: "ORDER_PAID",
        bodyAttributeKey: "message",
        isActive: true,
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain("The server confirmed the binding.");
  });
});
