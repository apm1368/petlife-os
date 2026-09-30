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
  requiredCategories: ["SECURITY" as never],
  marketingConsentGranted: false,
  channels: [{ channel: "IN_APP" as never, delivery: "LIVE" }, { channel: "SMS" as never, delivery: "SANDBOX" }],
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

    const bookingRow = screen.getByText("Bookings").closest("fieldset") as HTMLElement;
    fireEvent.click(within(bookingRow).getByLabelText("SMS"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(notificationsService.updatePreferences).toHaveBeenCalled());
    const call = vi.mocked(notificationsService.updatePreferences).mock.calls[0]![0];
    expect(call.preferences?.find((p) => p.category === "BOOKING" && p.channel === "SMS")?.enabled).toBe(false);
  });

  it("marketing stays locked until consent, and SMS says honestly that it isn't delivered yet", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValue(PREFS);
    renderWithIntl(<NotificationPreferencesView />);
    await waitFor(() => expect(screen.getByText("Offers & promotions")).toBeTruthy());
    const marketing = screen.getByText("Offers & promotions").closest("fieldset") as HTMLElement;
    expect((within(marketing).getByLabelText("SMS") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Marketing messages are off until you allow them/)).toBeTruthy();
    expect(screen.getByText(/SMS is in test mode/)).toBeTruthy();
    // Every backend category has a row, including the ones added after the first version of this page.
    for (const label of ["Lost-pet alerts & sightings", "Membership & billing", "Travel bookings & trips", "Support conversations"]) expect(screen.getByText(label)).toBeTruthy();
    // Nothing changed yet, so there's nothing to save.
    expect((screen.getByText("Save").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("never shows a toggle for EMAIL or PUSH", async () => {
    vi.mocked(notificationsService.getPreferences).mockResolvedValue(PREFS);

    renderWithIntl(<NotificationPreferencesView />);
    await waitFor(() => expect(screen.getByText("Bookings")).toBeTruthy());

    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Push")).toBeNull();
  });
});
