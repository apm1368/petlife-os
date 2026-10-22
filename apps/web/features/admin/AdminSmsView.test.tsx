import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { adminService } from "@/services/admin.service";
import { AdminSmsView, extractPatternVars, readPatternRows } from "./AdminSmsView";

vi.mock("@/services/admin.service", () => ({ adminService: { smsOverview: vi.fn(), smsPatterns: vi.fn(), createSmsPattern: vi.fn(), deleteSmsPattern: vi.fn(), testSmsPattern: vi.fn() } }));

const overview = { configured: true, sender: "90008361", otpProvider: "faraz" as const, otpPatternCode: "OTP1", otpPatternVar: "code", messagingProvider: "dev" as const, messagingMode: "sandbox" as const, balance: { balanceAmount: 5000, balanceCount: 25 }, balanceError: null };

describe("pattern helpers", () => {
  it("reads %name% variables once each, in order", () => {
    expect(extractPatternVars("Hi %name%, code %code% (%name%)")).toEqual(["name", "code"]);
  });
  it("reads pattern rows from the undocumented list shape, nested or flat", () => {
    expect(readPatternRows({ data: { data: [{ code: "A1", text: "x %code%", status: "active" }] } })).toMatchObject([{ code: "A1", text: "x %code%", status: "active" }]);
    expect(readPatternRows([{ uid: "B2", message: "y" }])).toMatchObject([{ code: "B2", text: "y" }]);
    expect(readPatternRows(null)).toEqual([]);
  });
});

describe("AdminSmsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminService.smsOverview).mockResolvedValue(overview);
    vi.mocked(adminService.smsPatterns).mockResolvedValue({ data: [{ code: "OTP1", text: "code: %code%", status: "active" }] });
    vi.mocked(adminService.createSmsPattern).mockResolvedValue({ result: "NEW9" });
  });

  it("shows balance, the account's patterns, and marks the sign-in pattern (which cannot be deleted)", async () => {
    renderWithIntl(<AdminSmsView />, "en");
    expect(await screen.findByText("5,000 toman · 25 SMS")).toBeTruthy();
    expect(await screen.findByText("Sign-in code pattern")).toBeTruthy();
    const del = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
  });

  it("builds a pattern from the sign-in template and submits it in the documented shape", async () => {
    renderWithIntl(<AdminSmsView />, "en");
    await screen.findByText("New pattern");
    fireEvent.click(screen.getByRole("button", { name: "Sign-in code template" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit pattern to FarazSMS" }));
    await waitFor(() => expect(adminService.createSmsPattern).toHaveBeenCalled());
    expect(vi.mocked(adminService.createSmsPattern).mock.calls[0]![0]).toMatchObject({ category: "otp", shared: false, website: "opetlife.ir", vars: [{ var: "code", length: 6, type: "int" }] });
    expect(await screen.findByText(/Pattern submitted \(code: NEW9\)/)).toBeTruthy();
  });

  it("explains the server setup when FarazSMS is not configured", async () => {
    vi.mocked(adminService.smsOverview).mockResolvedValue({ ...overview, configured: false, otpProvider: "dev", sender: null, balance: null });
    renderWithIntl(<AdminSmsView />, "en");
    expect(await screen.findByText("Server setup")).toBeTruthy();
    expect(screen.queryByText("New pattern")).toBeNull();
    expect(adminService.smsPatterns).not.toHaveBeenCalled();
  });
});
