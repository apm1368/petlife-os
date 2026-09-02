import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { NotificationDto, PaginatedDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { notificationsService } from "@/services/notifications.service";
import { NotificationCenterView } from "./NotificationCenterView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/notifications.service", () => ({
  notificationsService: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(), unreadCount: vi.fn() },
}));

const UNREAD: NotificationDto = {
  id: "notif-1",
  type: "payment.succeeded",
  category: "PAYMENT" as never,
  priority: "NORMAL" as never,
  title: "Payment successful",
  body: "Your payment was completed successfully.",
  locale: "en",
  deepLink: "/orders",
  entityType: "Checkout",
  entityId: "checkout-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  readAt: null,
  dismissedAt: null,
  deliveries: [],
};

function page(items: NotificationDto[], total = items.length): PaginatedDto<NotificationDto> {
  return { items, total, page: 1, pageSize: 20 };
}

describe("NotificationCenterView", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(notificationsService.list).mockReset();
    vi.mocked(notificationsService.markRead).mockReset();
    vi.mocked(notificationsService.markAllRead).mockReset();
    vi.mocked(notificationsService.unreadCount).mockReset().mockResolvedValue({ unreadCount: 0 });
  });

  it("shows an empty state when there are no notifications", async () => {
    vi.mocked(notificationsService.list).mockResolvedValue(page([]));

    renderWithIntl(<NotificationCenterView />);

    await waitFor(() => expect(screen.getByText("You're all caught up.")).toBeTruthy());
  });

  it("shows an unread notification with its title, body, and category, and marks it read on click", async () => {
    vi.mocked(notificationsService.list).mockResolvedValue(page([UNREAD]));
    vi.mocked(notificationsService.markRead).mockResolvedValue({ ...UNREAD, readAt: "2026-01-01T00:01:00.000Z" });

    renderWithIntl(<NotificationCenterView />);

    await waitFor(() => expect(screen.getByText("Payment successful")).toBeTruthy());
    expect(screen.getByText("Payment")).toBeTruthy();

    fireEvent.click(screen.getByText("Payment successful"));

    await waitFor(() => expect(notificationsService.markRead).toHaveBeenCalledWith("notif-1"));
    expect(push).toHaveBeenCalledWith("/en/orders");
  });

  it("marks all as read when the button is used", async () => {
    vi.mocked(notificationsService.list).mockResolvedValue(page([UNREAD]));
    vi.mocked(notificationsService.markAllRead).mockResolvedValue({ updatedCount: 1 });

    renderWithIntl(<NotificationCenterView />);
    await waitFor(() => expect(screen.getByText("Payment successful")).toBeTruthy());

    fireEvent.click(screen.getByText("Mark all as read"));
    await waitFor(() => expect(notificationsService.markAllRead).toHaveBeenCalled());
  });

  it("shows a load more button when more notifications exist, and fetches the next page", async () => {
    vi.mocked(notificationsService.list).mockResolvedValueOnce(page([UNREAD], 2)).mockResolvedValueOnce(page([{ ...UNREAD, id: "notif-2" }], 2));

    renderWithIntl(<NotificationCenterView />);
    await waitFor(() => expect(screen.getByText("Load more")).toBeTruthy());

    fireEvent.click(screen.getByText("Load more"));
    await waitFor(() => expect(notificationsService.list).toHaveBeenCalledWith(2, 20));
  });
});
