import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { adminTwoStepService } from "@/services/admin-two-step.service";
import { AdminTwoStepGate } from "./AdminTwoStepGate";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/en/admin" }));
vi.mock("@/features/account/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/services/admin-two-step.service", () => ({
  adminTwoStepService: { start: vi.fn(), confirm: vi.fn(), verify: vi.fn() },
  ADMIN_TWO_STEP_EVENT: "opl:admin-two-step-required",
}));

const invalid = (attemptsLeft: number) => new ApiError({ code: "TWO_STEP_CODE_INVALID", message: "x", requestId: "r", details: { attemptsLeft } }, 400);

describe("Admin two-step gate", () => {
  beforeEach(() => vi.mocked(adminTwoStepService.verify).mockReset());

  it("asks for the code, says how many tries are left, accepts Persian digits and lets a recovery code in", async () => {
    const passed = vi.fn();
    vi.mocked(adminTwoStepService.verify).mockRejectedValueOnce(invalid(3)).mockResolvedValue({ ok: true, recoveryCodesLeft: 9 });
    renderWithIntl(<AdminTwoStepGate requirement="CHALLENGE" onPassed={passed} />);
    expect(screen.getByRole("heading", { name: "Enter your two-step code" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter the 6 digits from the app.");
    expect(adminTwoStepService.verify).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "۱۲۳ ۴۵۶" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("3 more tries"));
    expect(adminTwoStepService.verify).toHaveBeenLastCalledWith({ code: "123456" });

    fireEvent.click(screen.getByRole("button", { name: "Use a recovery code instead" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "abcd-efgh-۲۳۴۵-۶۷۲۳" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(passed).toHaveBeenCalled());
    expect(adminTwoStepService.verify).toHaveBeenLastCalledWith({ recoveryCode: "ABCDEFGH23456723" });
  });

  it("enrolment shows the setup key, turns on only after a valid code and holds the recovery codes until saved", async () => {
    const passed = vi.fn();
    vi.mocked(adminTwoStepService.start).mockResolvedValue({ secret: "JBSW Y3DP EHPK 3PXP", otpauthUri: "otpauth://totp/opetlife.ir:a%40b.c?secret=JBSWY3DPEHPK3PXP", issuer: "opetlife.ir", account: "a@b.c" });
    vi.mocked(adminTwoStepService.confirm).mockResolvedValue({ recoveryCodes: ["AAAA-BBBB-CCCC-DDDD", "EEEE-FFFF-GGGG-HHHH"] });
    renderWithIntl(<AdminTwoStepGate requirement="ENROL" onPassed={passed} />);
    expect(await screen.findByText("JBSW Y3DP EHPK 3PXP")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in authenticator app" }).getAttribute("href")).toMatch(/^otpauth:\/\/totp\//);
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("AAAA-BBBB-CCCC-DDDD")).toBeTruthy();
    expect(adminTwoStepService.confirm).toHaveBeenCalledWith("654321");
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I've saved these codes"));
    fireEvent.click(next);
    expect(passed).toHaveBeenCalled();
  });

  it("speaks Persian on the code screen", async () => {
    renderWithIntl(<AdminTwoStepGate requirement="CHALLENGE" onPassed={vi.fn()} />, "fa");
    expect(screen.getByRole("heading", { name: "کد ورود دومرحله‌ای را وارد کنید" })).toBeTruthy();
    expect(document.body.textContent).toContain("opetlife.ir");
  });
});
