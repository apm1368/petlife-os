import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { accountService } from "@/services/account.service";
import { AccountActivityView } from "./AccountActivityView";

vi.mock("@/services/account.service", () => ({ accountService: { activity: vi.fn() } }));

describe("AccountActivityView", () => {
  beforeEach(() => {
    vi.mocked(accountService.activity).mockReset();
  });

  it("summarises events from safe detail, filters by group and loads older pages", async () => {
    vi.mocked(accountService.activity)
      .mockResolvedValueOnce({ items: [{ id: "e1", type: "UserAuthenticated", group: "SECURITY", occurredAt: "2026-09-30T08:00:00.000Z", detail: { method: "OTP", device: "Chrome · Android" } }, { id: "e2", type: "SomethingInternal", group: "SECURITY", occurredAt: "2026-09-29T08:00:00.000Z", detail: {} }], nextCursor: "2026-09-29T08:00:00.000Z" })
      .mockResolvedValueOnce({ items: [{ id: "e3", type: "ConsentChanged", group: "PRIVACY", occurredAt: "2026-09-20T08:00:00.000Z", detail: { kind: "MARKETING", granted: false } }], nextCursor: null })
      .mockResolvedValueOnce({ items: [{ id: "e4", type: "SubscriptionStarted", group: "MEMBERSHIP", occurredAt: "2026-09-10T08:00:00.000Z", detail: { isTrial: true } }], nextCursor: null });
    renderWithIntl(<AccountActivityView />, "en");
    expect(await screen.findByText("with a one-time code · Chrome · Android")).toBeTruthy();
    // Unknown internal event names are never shown raw.
    expect(screen.queryByText("SomethingInternal")).toBeNull();
    expect(screen.getByText("Account event")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show older" }));
    expect(await screen.findByText("Marketing messages: withdrawn")).toBeTruthy();
    expect(vi.mocked(accountService.activity).mock.calls[1]![0]).toMatchObject({ before: "2026-09-29T08:00:00.000Z" });
    fireEvent.click(screen.getByRole("button", { name: "Membership" }));
    await waitFor(() => expect(vi.mocked(accountService.activity).mock.calls[2]![0]).toMatchObject({ group: "MEMBERSHIP" }));
    expect(await screen.findByText("Trial")).toBeTruthy();
  });

  it("uses the Solar Hijri calendar in Persian and offers retry on failure", async () => {
    vi.mocked(accountService.activity).mockResolvedValueOnce({ items: [{ id: "e1", type: "PasswordChanged", group: "SECURITY", occurredAt: "2026-09-30T08:00:00.000Z", detail: {} }], nextCursor: null });
    renderWithIntl(<AccountActivityView />, "fa");
    expect(await screen.findByText("رمز عبور تغییر کرد")).toBeTruthy();
    expect(document.querySelector("time")!.textContent).toContain("۱۴۰۵");
  });

  it("shows a retryable error instead of an endless skeleton", async () => {
    vi.mocked(accountService.activity).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ items: [], nextCursor: null });
    renderWithIntl(<AccountActivityView />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nothing to show here yet")).toBeTruthy();
  });
});
