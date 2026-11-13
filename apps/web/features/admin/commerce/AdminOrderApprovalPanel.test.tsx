import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import { AdminOrderApprovalPanel } from "./AdminOrderApprovalPanel";

vi.mock("@/services/admin-commerce.service", () => ({ adminCommerceService: { approveOrder: vi.fn(), rejectOrder: vi.fn() } }));

describe("AdminOrderApprovalPanel", () => {
  beforeEach(() => {
    vi.mocked(adminCommerceService.approveOrder).mockReset().mockResolvedValue({} as never);
    vi.mocked(adminCommerceService.rejectOrder).mockReset().mockResolvedValue({} as never);
    useAdminStore.setState({ context: { permissions: ["commerce.view", "commerce.manage"] } as never });
  });

  it("approves a held order with an optional note", async () => {
    const onDone = vi.fn();
    renderWithIntl(<AdminOrderApprovalPanel orderId="o1" onDone={onDone} />, "en");
    expect(screen.getByRole("heading", { name: "Waiting for approval" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Note (optional, audit log)"), { target: { value: "Called the customer" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve and send to the seller" }));
    await waitFor(() => expect(adminCommerceService.approveOrder).toHaveBeenCalledWith("o1", "Called the customer"));
    expect(onDone).toHaveBeenCalled();
  });

  it("rejects only with a reason and a second click, and says when the order moved on", async () => {
    const onDone = vi.fn();
    renderWithIntl(<AdminOrderApprovalPanel orderId="o1" onDone={onDone} />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Reject and refund" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, reject and refund in full" }));
    expect(await screen.findByText("Write a short reason.")).toBeTruthy();
    expect(adminCommerceService.rejectOrder).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason for rejecting (audit log)"), { target: { value: "Out of stock at the seller" } });
    vi.mocked(adminCommerceService.rejectOrder).mockRejectedValueOnce(new ApiError({ code: "ORDER_NOT_AWAITING_APPROVAL", message: "no", requestId: "r" }, 409));
    fireEvent.click(screen.getByRole("button", { name: "Yes, reject and refund in full" }));
    expect(await screen.findByText("This order is no longer waiting for approval; reload the page.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, reject and refund in full" }));
    await waitFor(() => expect(adminCommerceService.rejectOrder).toHaveBeenLastCalledWith("o1", "Out of stock at the seller"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows view-only staff why it waits, without actions, in Persian too", () => {
    useAdminStore.setState({ context: { permissions: ["commerce.view"] } as never });
    renderWithIntl(<AdminOrderApprovalPanel orderId="o1" onDone={vi.fn()} />, "fa");
    expect(screen.getByRole("heading", { name: "در انتظار تأیید" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
