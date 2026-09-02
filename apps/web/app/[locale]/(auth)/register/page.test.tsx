import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
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
vi.mock("@/services/auth.service", () => ({ authService: { register: vi.fn() } }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { getProgress: vi.fn() } }));

describe("RegisterPage", () => {
  beforeEach(() => {
    replace.mockReset();
    searchParams = new URLSearchParams();
    vi.mocked(authService.register).mockReset();
    vi.mocked(onboardingService.getProgress).mockReset();
  });

  it("shows a clear error when the username is already taken", async () => {
    vi.mocked(authService.register).mockRejectedValue(new ApiError({ code: "USERNAME_TAKEN", message: "taken", requestId: "r1" }, 409));

    renderWithIntl(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "sarah" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery" } });
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => expect(screen.getByText("This username is already taken.")).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("registers and routes to the returnTo destination once onboarding is already complete", async () => {
    searchParams = new URLSearchParams({ returnTo: "/en/vet/abc/book" });
    vi.mocked(authService.register).mockResolvedValue({
      user: { id: "u1", email: null, phone: null, displayName: "New User", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" },
    });
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ status: "COMPLETED", chapter: "READY" } as never);

    renderWithIntl(<RegisterPage />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery" } });
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/vet/abc/book"));
  });
});
