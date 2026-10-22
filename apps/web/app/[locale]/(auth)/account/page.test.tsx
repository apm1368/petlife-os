import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { onboardingService } from "@/services/onboarding.service";
import { ApiError } from "@/lib/api/client";
import AccountPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams({ returnTo: "/en/pets" }),
}));
vi.mock("@/services/auth.service", () => ({ authService: { loginPassword: vi.fn(), loginPhone: vi.fn(), loginResend: vi.fn(), loginVerify: vi.fn() } }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { getProgress: vi.fn() } }));

const user = { id: "u1", email: null, phone: "+989121234567", displayName: "Sara", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" } as never;

function enterCredentials() {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "sara" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

function enterCode(code: string) {
  const inputs = screen.getAllByRole("textbox");
  fireEvent.paste(inputs[0]!, { clipboardData: { getData: () => code } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
}

describe("sign-in: password, then SMS code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ status: "COMPLETED", chapter: "READY" } as never);
  });

  it("asks for the texted code after the password and signs in only with it", async () => {
    vi.mocked(authService.loginPassword).mockResolvedValue({ status: "OTP_REQUIRED", challengeId: "c".repeat(32), maskedPhone: "0912***4567", resendAfterSeconds: 30 });
    vi.mocked(authService.loginVerify).mockResolvedValue({ user });
    renderWithIntl(<AccountPage />);
    enterCredentials();
    expect(await screen.findByText("We texted a 6-digit code to 0912***4567")).toBeTruthy();
    expect(authService.loginPassword).toHaveBeenCalledWith("sara", "correct-horse");
    enterCode("۱۲۳۴۵۶");
    await waitFor(() => expect(authService.loginVerify).toHaveBeenCalledWith("c".repeat(32), "123456"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/pets"));
  });

  it("collects a mobile first for an account that has none, normalizing the number", async () => {
    vi.mocked(authService.loginPassword).mockResolvedValue({ status: "PHONE_REQUIRED", challengeId: "d".repeat(32) });
    vi.mocked(authService.loginPhone).mockResolvedValue({ status: "OTP_REQUIRED", challengeId: "d".repeat(32), maskedPhone: "0912***6789", resendAfterSeconds: 30 });
    renderWithIntl(<AccountPage />);
    enterCredentials();
    fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "۰۹۱۲۳۴۵۶۷۸۹" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(authService.loginPhone).toHaveBeenCalledWith("d".repeat(32), "+989123456789"));
    expect(await screen.findByText("We texted a 6-digit code to 0912***6789")).toBeTruthy();
  });

  it("shows the wrong-password error and stays on the password step", async () => {
    vi.mocked(authService.loginPassword).mockRejectedValue(new ApiError({ code: "INVALID_CREDENTIALS", message: "x", requestId: "r" }, 401));
    renderWithIntl(<AccountPage />);
    enterCredentials();
    expect(await screen.findByText("The username or password you entered is incorrect.")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });

  it("returns to the password step when the sign-in has expired", async () => {
    vi.mocked(authService.loginPassword).mockResolvedValue({ status: "OTP_REQUIRED", challengeId: "e".repeat(32), maskedPhone: "0912***4567", resendAfterSeconds: 30 });
    vi.mocked(authService.loginVerify).mockRejectedValue(new ApiError({ code: "LOGIN_CHALLENGE_INVALID", message: "x", requestId: "r" }, 400));
    renderWithIntl(<AccountPage />);
    enterCredentials();
    await screen.findByText("We texted a 6-digit code to 0912***4567");
    enterCode("123456");
    expect(await screen.findByText("This sign-in expired. Enter your username and password again.")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });
});
