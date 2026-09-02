import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { notificationsService } from "@/services/notifications.service";
import { useNotificationStore } from "@/stores/notification-store";
import { NotificationBell } from "./NotificationBell";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/notifications.service", () => ({ notificationsService: { unreadCount: vi.fn() } }));

describe("NotificationBell", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(notificationsService.unreadCount).mockReset();
    useNotificationStore.setState({ unreadCount: 0 });
  });

  it("shows no badge when there are no unread notifications", async () => {
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unreadCount: 0 });

    renderWithIntl(<NotificationBell />);

    await waitFor(() => expect(notificationsService.unreadCount).toHaveBeenCalled());
    expect(screen.queryByText("1")).toBeNull();
  });

  it("shows the unread count as a badge, and navigates to the notification center on click", async () => {
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unreadCount: 3 });

    renderWithIntl(<NotificationBell />);

    await waitFor(() => expect(screen.getByText("3")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Notifications, 3 unread"));
    expect(push).toHaveBeenCalledWith("/en/notifications");
  });

  it("caps the badge display at 99+", async () => {
    vi.mocked(notificationsService.unreadCount).mockResolvedValue({ unreadCount: 150 });

    renderWithIntl(<NotificationBell />);

    await waitFor(() => expect(screen.getByText("99+")).toBeTruthy());
  });
});
