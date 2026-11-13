import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminBookingMoneyDto, AdminRefundApprovalDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminBookingMoneyService } from "@/services/admin-booking-money.service";
import { useAdminStore } from "@/stores/admin-store";
import { StaffBookingMoneyPanel } from "./StaffBookingMoneyPanel";
import { AdminRefundApprovalsView } from "./AdminRefundApprovalsView";
import { DisputeRefundPanel } from "./DisputeRefundPanel";

vi.mock("@/services/admin-booking-money.service", () => ({
  adminBookingMoneyService: { money: vi.fn(), cancel: vi.fn(), refund: vi.fn(), approvals: vi.fn(), approve: vi.fn(), reject: vi.fn(), execute: vi.fn(), disputeOutcome: vi.fn(), disputeRefund: vi.fn() },
}));

const svc = vi.mocked(adminBookingMoneyService);
const signIn = (permissions: string[]) => useAdminStore.setState({ status: "ready", context: { isAdmin: true, adminUserId: "a1", displayName: "Admin", role: "SUPER_ADMIN", permissions } as never });

const money = (over: Partial<AdminBookingMoneyDto> = {}): AdminBookingMoneyDto => ({
  kind: "BOOKING", bookingId: "b1", reference: "PL-B-000001", status: "CONFIRMED", paymentStatus: "PAID",
  paidIrr: 1_000_000, refundedIrr: 0, refundableIrr: 1_000_000, policyRefundIrr: 500_000, cancellable: true, approvals: [], ...over,
});
const approval = (over: Partial<AdminRefundApprovalDto> = {}): AdminRefundApprovalDto => ({
  id: "ap1", subjectType: "BOOKING", orderId: null, bookingId: "b1", travelBookingId: null, amount: 500_000, reason: "Clinic closed",
  status: "REQUESTED" as never, requestedByAdmin: { id: "a2", displayName: "Finance One", role: "SUPER_ADMIN" as never }, approvedByAdmin: null,
  refundId: null, createdAt: "2026-11-13T00:00:00.000Z", updatedAt: "2026-11-13T00:00:00.000Z", executedAt: null, ...over,
});

describe("Staff cancel and refund on a booking", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels with the policy refund only after a reason and the confirmation", async () => {
    signIn(["services.manage", "finance.refund.request"]);
    svc.money.mockResolvedValue(money());
    svc.cancel.mockResolvedValue(money({ status: "CANCELLED_BY_PROVIDER", cancellable: false, approvals: [approval()] }));
    renderWithIntl(<StaffBookingMoneyPanel kind="BOOKING" bookingId="b1" />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel as staff" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(svc.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Write a reason");
    fireEvent.change(screen.getByLabelText("Reason (kept in the audit log)"), { target: { value: "Clinic closed" } });
    fireEvent.click(screen.getByLabelText(/I confirm the cancellation/));
    fireEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(svc.cancel).toHaveBeenCalledWith("BOOKING", "b1", { reason: "Clinic closed", refund: "POLICY" }));
    expect(await screen.findByText("Awaiting approval")).toBeTruthy();
  });

  it("offers only 'no refund' when cancelling without the refund permission, and no refund button", async () => {
    signIn(["travel.manage"]);
    svc.money.mockResolvedValue(money({ kind: "TRAVEL_BOOKING" }));
    renderWithIntl(<StaffBookingMoneyPanel kind="TRAVEL_BOOKING" bookingId="b1" />, "en");
    expect(screen.queryByRole("button", { name: "Refund" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel as staff" }));
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });
});

describe("Refund approvals queue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links each approval to its booking and lets another admin approve", async () => {
    signIn(["finance.view", "finance.refund.approve"]);
    svc.approvals.mockResolvedValue({ items: [approval(), approval({ id: "ap2", subjectType: "TRAVEL_BOOKING", bookingId: null, travelBookingId: "s1" })], total: 2, page: 1, pageSize: 20 });
    svc.approve.mockResolvedValue(approval({ status: "APPROVED" as never }));
    renderWithIntl(<AdminRefundApprovalsView />, "en");
    expect((await screen.findByRole("link", { name: "Service booking" })).getAttribute("href")).toBe("/en/admin/services/bookings/b1");
    expect(screen.getByRole("link", { name: "Stay" }).getAttribute("href")).toBe("/en/admin/travel/bookings/s1");
    fireEvent.click(screen.getAllByRole("button", { name: "Approve" })[0]!);
    await waitFor(() => expect(svc.approve).toHaveBeenCalledWith("ap1"));
  });
});

describe("Dispute refund outcome", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a booking dispute with a refund and shows the approval", async () => {
    signIn(["finance.refund.request"]);
    svc.disputeOutcome.mockResolvedValue({ disputeId: "d1", status: "UNDER_REVIEW", refundApproval: null });
    svc.disputeRefund.mockResolvedValue({ disputeId: "d1", status: "RESOLVED_CUSTOMER", refundApproval: { id: "ap1", status: "REQUESTED", amount: 300_000, subjectType: "TRAVEL_BOOKING" } });
    renderWithIntl(<DisputeRefundPanel disputeId="d1" subjectType="BOOKING" status="UNDER_REVIEW" />, "en");
    fireEvent.change(await screen.findByLabelText("Amount (IRR)"), { target: { value: "300000" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Room not pet friendly" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolve with a refund" }));
    await waitFor(() => expect(svc.disputeRefund).toHaveBeenCalledWith("d1", { amount: 300_000, reason: "Room not pet friendly" }));
    expect(await screen.findByText(/Awaiting approval/)).toBeTruthy();
  });
});
