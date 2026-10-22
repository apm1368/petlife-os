import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { accountService } from "@/services/account.service";
import { onboardingService } from "@/services/onboarding.service";
import { ApiError } from "@/lib/api/client";
import RegisterPage from "./page";

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/services/auth.service", () => ({ authService: { requestRegisterOtp: vi.fn(), register: vi.fn() } }));
vi.mock("@/services/account.service", () => ({ accountService: { setConsent: vi.fn() } }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { getProgress: vi.fn() } }));

function completeRequiredFields(username: string, phone = "09121234567") {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "correct-horse-battery" } });
  fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: phone } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByText("Send verification code"));
}

function enterCode(code: string) {
  const inputs = screen.getAllByRole("textbox");
  fireEvent.paste(inputs[0]!, { clipboardData: { getData: () => code } });
  fireEvent.click(screen.getByText("Create account"));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    replace.mockReset();
    searchParams = new URLSearchParams();
    vi.mocked(authService.requestRegisterOtp).mockReset().mockResolvedValue({ ok: true, maskedPhone: "0912***4567", resendAfterSeconds: 30 });
    vi.mocked(authService.register).mockReset();
    vi.mocked(accountService.setConsent).mockReset().mockResolvedValue({} as never);
    vi.mocked(onboardingService.getProgress).mockReset();
  });

  it("texts a code to the normalized mobile before creating anything", async () => {
    renderWithIntl(<RegisterPage />);
    completeRequiredFields("sarah", "۰۹۱۲ ۱۲۳ ۴۵۶۷");
    await waitFor(() => expect(authService.requestRegisterOtp).toHaveBeenCalledWith("sarah", "+989121234567"));
    expect(await screen.findByText("We texted a 6-digit code to 0912***4567")).toBeTruthy();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it("refuses an invalid mobile without calling the API", async () => {
    renderWithIntl(<RegisterPage />);
    completeRequiredFields("sarah", "0912");
    expect(await screen.findByText("Enter a valid Iranian mobile number.")).toBeTruthy();
    expect(authService.requestRegisterOtp).not.toHaveBeenCalled();
  });

  it("reports a taken username at the first step", async () => {
    vi.mocked(authService.requestRegisterOtp).mockRejectedValue(new ApiError({ code: "USERNAME_TAKEN", message: "x", requestId: "r" }, 409));
    renderWithIntl(<RegisterPage />);
    completeRequiredFields("sarah");
    expect(await screen.findByText("This username is already taken.")).toBeTruthy();
  });

  it("creates the account with the code, records required consent and preserves a safe returnTo destination", async () => {
    searchParams = new URLSearchParams({ returnTo: "/en/vet/abc/book" });
    vi.mocked(authService.register).mockResolvedValue({
      user: { id: "u1", email: null, phone: "+989121234567", displayName: "New User", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" },
    } as never);
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ status: "COMPLETED", chapter: "READY" } as never);

    renderWithIntl(<RegisterPage />);
    completeRequiredFields("newuser");
    await screen.findByText("We texted a 6-digit code to 0912***4567");
    enterCode("123456");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/vet/abc/book"));
    expect(authService.register).toHaveBeenCalledWith({ username: "newuser", password: "correct-horse-battery", phone: "+989121234567", code: "123456", displayName: undefined });
    expect(accountService.setConsent).toHaveBeenCalledWith("TERMS", true);
    expect(accountService.setConsent).toHaveBeenCalledWith("PRIVACY", true);
  });

  it("keeps the code step on a wrong code", async () => {
    vi.mocked(authService.register).mockRejectedValue(new ApiError({ code: "OTP_INVALID", message: "x", requestId: "r" }, 400));
    renderWithIntl(<RegisterPage />);
    completeRequiredFields("sarah");
    await screen.findByText("We texted a 6-digit code to 0912***4567");
    enterCode("000000");
    expect(await screen.findByText("That code is incorrect or has expired.")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
