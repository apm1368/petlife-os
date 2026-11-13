import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PartnerApprovalModesDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminApprovalsService } from "@/services/admin-approvals.service";
import { useAdminStore } from "@/stores/admin-store";
import { PartnerApprovalModePanel } from "./PartnerApprovalModePanel";

// CI runners are loaded: the default 1 s wait for the validation message timed out at ~1.1 s (2026-11-13, flaky).
const SLOW = { timeout: 5_000 };

vi.mock("@/services/admin-approvals.service", () => ({ adminApprovalsService: { get: vi.fn(), set: vi.fn(), clear: vi.fn() } }));
const svc = vi.mocked(adminApprovalsService);

const PROVIDER: PartnerApprovalModesDto = {
  partnerType: "PROVIDER",
  organizationId: "org1",
  items: [
    { scope: "SERVICE_BOOKINGS", vertical: "PARTNER_CHOICE", override: null, effective: "PARTNER_CHOICE" },
    { scope: "STAY_BOOKINGS", vertical: "NEEDS_APPROVAL", override: { mode: "INSTANT", reason: "Trusted host since 2024", updatedAt: "2026-11-13T08:00:00Z", updatedByName: "Ops Lead" }, effective: "INSTANT" },
  ],
};

function admin(...permissions: string[]) {
  useAdminStore.setState({ context: { isAdmin: true, adminUserId: "a1", displayName: "Ops", role: "ADMIN", permissions } as never, status: "ready" });
}

describe("PartnerApprovalModePanel", () => {
  beforeEach(() => {
    svc.get.mockReset().mockResolvedValue(PROVIDER);
    svc.set.mockReset();
    svc.clear.mockReset();
  });

  it("shows, per flow, the platform setting, what applies now and an override's reason", async () => {
    admin("services.view");
    renderWithIntl(<PartnerApprovalModePanel kind="services" organizationId="org1" />);
    const stays = (await screen.findByRole("heading", { name: "Stay bookings" })).closest("li")!;
    expect(within(stays).getByText("Needs approval")).toBeTruthy();
    expect(within(stays).getByText("Set for this business")).toBeTruthy();
    expect(within(stays).getByText(/Reason: Trusted host since 2024/)).toBeTruthy();
    const services = screen.getByRole("heading", { name: "Care-service bookings" }).closest("li")!;
    expect(within(services).getByText("Inherited from the platform setting")).toBeTruthy();
    expect(svc.get).toHaveBeenCalledWith("services", "org1");
    // View-only staff get no editor.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Changing this needs the settings permission.")).toBeTruthy();
  });

  it("sets an override only with a reason, and clears one back to the platform setting", async () => {
    admin("services.view", "settings.manage");
    svc.set.mockResolvedValue({ ...PROVIDER, items: [{ ...PROVIDER.items[0]!, override: { mode: "NEEDS_APPROVAL", reason: "New clinic, checking quality", updatedAt: "2026-11-13T09:00:00Z", updatedByName: "Ops" }, effective: "NEEDS_APPROVAL" }, PROVIDER.items[1]!] });
    svc.clear.mockResolvedValue({ ...PROVIDER, items: [PROVIDER.items[0]!, { ...PROVIDER.items[1]!, override: null, effective: "NEEDS_APPROVAL" }] });
    renderWithIntl(<PartnerApprovalModePanel kind="services" organizationId="org1" />);
    const services = (await screen.findByRole("heading", { name: "Care-service bookings" }, SLOW)).closest("li")!;

    fireEvent.change(within(services).getByLabelText("For this business"), { target: { value: "NEEDS_APPROVAL" } });
    fireEvent.click(within(services).getByRole("button", { name: "Save" }));
    expect(await within(services).findByText("Write a reason of at least 5 characters.", {}, SLOW)).toBeTruthy();
    expect(svc.set).not.toHaveBeenCalled();
    fireEvent.change(within(services).getByLabelText("Reason (audit log)"), { target: { value: "New clinic, checking quality" } });
    fireEvent.click(within(services).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(svc.set).toHaveBeenCalledWith("services", "org1", "SERVICE_BOOKINGS", "NEEDS_APPROVAL", "New clinic, checking quality"), SLOW);
    expect(await screen.findByText(/Reason: New clinic, checking quality/, {}, SLOW)).toBeTruthy();

    const stays = screen.getByRole("heading", { name: "Stay bookings" }).closest("li")!;
    fireEvent.change(within(stays).getByLabelText("For this business"), { target: { value: "INHERIT" } });
    fireEvent.change(within(stays).getByLabelText("Reason (audit log)"), { target: { value: "Back to the platform rule" } });
    fireEvent.click(within(stays).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(svc.clear).toHaveBeenCalledWith("services", "org1", "STAY_BOOKINGS", "Back to the platform rule"), SLOW);
  }, 20_000);

  it("renders in Persian and offers a retry when loading fails", async () => {
    admin("commerce.view");
    svc.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ partnerType: "SELLER", organizationId: "s1", items: [{ scope: "SHOP_ORDERS", vertical: "INSTANT", override: null, effective: "INSTANT" }] });
    renderWithIntl(<PartnerApprovalModePanel kind="shops" organizationId="s1" />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByRole("heading", { name: "سفارش‌های فروشگاه" })).toBeTruthy();
    expect(svc.get).toHaveBeenLastCalledWith("shops", "s1");
  });
});
