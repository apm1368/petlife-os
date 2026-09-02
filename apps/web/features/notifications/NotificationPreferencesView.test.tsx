import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { NotificationPreferencesDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { notificationsService } from "@/services/notifications.service";
import { NotificationPreferencesView } from "./NotificationPreferencesView";

vi.mock("@/services/notifications.service", () => ({
  notificationsService: { getPreferences: vi.fn(), updatePreferences: vi.fn() },
}));

const PREFS: NotificationPreferencesDto = {
  preferences: [
    { category: "BOOKING" as never, channel: "SMS" as never, enabled: true },
    { category: "BOOKING" as never, channel: "IN_APP" as never, enabled: true },
    { category: "MARKETING" as never, channel: "SMS" as never, enabled: false },
    { category: "MARKETING" as never, channel: "IN_APP" as never, enabled: false },
  ],
  quietHours: { enabled: false, startTime: "22:00", endTime: "08:00", timezone: "Asia/Tehran" },
};

describe("NotificationPreferencesView", () => {
  beforeEach(() => {
    vi.mocked(notificationsService.getPreferences).mockReset();
    vi.mocked(notificationsService.updatePreferences).mockReset();
  });

  it("shows SECURITY as always-on text, never a toggle", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValue(PREFS);

    renderWithIntl(<NotificationPreferencesView />);

    await waitFor(() => expect(screen.getByText("Account & security alerts")).toBeTruthy());
    expect(screen.getAllByText("Always on").length).toBeGreaterThan(0);
  });

  it("toggling a category's SMS checkbox and saving persists the updated grid", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValue(PREFS);
    vi.mocked(notificationsService.updatePreferences).mockResolvedValue(PREFS);

    renderWithIntl(<NotificationPreferencesView />);
    await waitFor(() => expect(screen.getByText("Bookings")).toBeTruthy());

    const bookingRow = screen.getByText("Bookings").closest("div") as HTMLElement;
    fireEvent.click(within(bookingRow).getByLabelText("SMS"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(notificationsService.updatePreferences).toHaveBeenCalled());
    const call = vi.mocked(notificationsService.updatePreferences).mock.calls[0]![0];
    expect(call.preferences?.find((p) => p.category === "BOOKING" && p.channel === "SMS")?.enabled).toBe(false);
  });

  it("never shows a toggle for EMAIL or PUSH", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValue(PREFS);

    renderWithIntl(<NotificationPreferencesView />);
    await waitFor(() => expect(screen.getByText("Bookings")).toBeTruthy());

    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Push")).toBeNull();
  });
});
