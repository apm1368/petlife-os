import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { accountService, type SecurityCenterDto } from "@/services/account.service";
import { SecurityCenterView } from "./SecurityCenterView";

const signOut = vi.fn();
vi.mock("./use-sign-out", () => ({ useSignOut: () => signOut }));
vi.mock("@/services/account.service", () => ({ accountService: { security: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn(), revokeAllSessions: vi.fn() } }));
vi.mock("@/services/auth.service", () => ({ authService: { setOrChangePassword: vi.fn() } }));

const data = (overrides: Partial<SecurityCenterDto["methods"]> = {}): SecurityCenterDto => ({
  methods: { phone: { verified: true, value: "+989121234567" }, email: { verified: false, value: null }, password: { connected: false }, providers: [], ...overrides },
  sessions: [
    { id: "s1", userAgent: "x", device: "Chrome · Android", createdAt: "2026-09-01T10:00:00.000Z", lastSeenAt: "2026-09-30T10:00:00.000Z", expiresAt: "2026-10-30T10:00:00.000Z", current: true },
    { id: "s2", userAgent: null, device: null, createdAt: "2026-09-02T10:00:00.000Z", lastSeenAt: "2026-09-29T10:00:00.000Z", expiresAt: "2026-10-30T10:00:00.000Z", current: false },
  ],
  activity: [{ id: "e1", type: "UserAuthenticated", occurredAt: "2026-09-30T10:00:00.000Z" }],
});

describe("SecurityCenterView", () => {
  beforeEach(() => {
    signOut.mockReset();
    vi.mocked(accountService.security).mockReset().mockResolvedValue(data());
    vi.mocked(accountService.revokeAllSessions).mockReset().mockResolvedValue({ ok: true, count: 2 });
  });

  it("shows real devices, the SMS sign-in method, no Google, and labels activity", async () => {
    renderWithIntl(<SecurityCenterView />, "en");
    expect(await screen.findByText("Chrome · Android")).toBeTruthy();
    expect(screen.getByText("Unknown device")).toBeTruthy();
    expect(screen.getByText("This device")).toBeTruthy();
    expect(screen.getByText("Sign-in code by SMS")).toBeTruthy();
    expect(screen.queryByText("Google")).toBeNull();
    expect(screen.getByText("Signed in")).toBeTruthy();
    expect(screen.queryByText("No way to recover your account")).toBeNull();
  });

  it("warns when there is no verified way to recover the account", async () => {
    vi.mocked(accountService.security).mockResolvedValue(data({ phone: { verified: false, value: "+989121234567" } }));
    renderWithIntl(<SecurityCenterView />, "fa");
    expect(await screen.findByText("راه بازیابی ندارید")).toBeTruthy();
  });

  it("sign out everywhere requires confirmation, then ends this session too", async () => {
    renderWithIntl(<SecurityCenterView />, "en");
    await screen.findByText("Chrome · Android");
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    expect(await screen.findByText("Every device, including this one, is signed out immediately.")).toBeTruthy();
    expect(accountService.revokeAllSessions).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole("button", { name: "Sign out everywhere" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith(true));
    expect(accountService.revokeAllSessions).toHaveBeenCalled();
  });
});
