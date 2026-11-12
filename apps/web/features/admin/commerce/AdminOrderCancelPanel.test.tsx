import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { useAdminStore } from "@/stores/admin-store";
import { AdminOrderCancelPanel } from "./AdminOrderCancelPanel";

vi.mock("@/services/admin-commerce.service", () => ({ adminCommerceService: { cancelOrder: vi.fn() } }));

describe("AdminOrderCancelPanel", () => {
  beforeEach(() => vi.mocked(adminCommerceService.cancelOrder).mockReset().mockResolvedValue({} as never));

  it("cancels before dispatch only after a reason and a confirmation", async () => {
    useAdminStore.setState({ context: { permissions: ["commerce.view", "commerce.manage"] } as never });
    const onDone = vi.fn();
    renderWithIntl(<AdminOrderCancelPanel orderId="o1" cancelled={false} fulfillmentStatus="AWAITING_SELLER_PREPARATION" onDone={onDone} />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and refund in full" }));
    expect(await screen.findByText("Write a short reason.")).toBeTruthy();
    // The confirmation stays open after the missing-reason error.
    fireEvent.change(screen.getByLabelText("Reason (audit log)"), { target: { value: "Customer asked by phone" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and refund in full" }));
    await waitFor(() => expect(adminCommerceService.cancelOrder).toHaveBeenCalledWith("o1", "Customer asked by phone"));
    expect(onDone).toHaveBeenCalled();
  });

  it("offers no cancel once the courier has the parcel, and nothing without commerce.manage", () => {
    useAdminStore.setState({ context: { permissions: ["commerce.view", "commerce.manage"] } as never });
    const { unmount } = renderWithIntl(<AdminOrderCancelPanel orderId="o1" cancelled={false} fulfillmentStatus="PICKED_UP" onDone={vi.fn()} />, "en");
    expect(screen.getByText(/use a refund request instead/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    useAdminStore.setState({ context: { permissions: ["commerce.view"] } as never });
    renderWithIntl(<AdminOrderCancelPanel orderId="o1" cancelled={false} fulfillmentStatus="PENDING" onDone={vi.fn()} />, "en");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
