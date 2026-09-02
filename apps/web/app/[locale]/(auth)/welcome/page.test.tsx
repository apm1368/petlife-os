import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import WelcomePage from "./page";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/services/auth.service", () => ({
  authService: { getMethods: vi.fn(), googleLoginUrl: (returnTo: string) => `http://api.test/auth/google?returnTo=${encodeURIComponent(returnTo)}` },
}));

describe("WelcomePage", () => {
  beforeEach(() => {
    push.mockReset();
    searchParams = new URLSearchParams();
    vi.mocked(authService.getMethods).mockReset();
  });

  it("hides the Google button when Google sign-in is disabled", async () => {
    vi.mocked(authService.getMethods).mockResolvedValue({ google: false, phone: true, password: true });
    renderWithIntl(<WelcomePage />);

    await waitFor(() => expect(screen.getByText("Continue with email")).toBeTruthy());
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });

  it("shows the Google button when Google sign-in is enabled", async () => {
    vi.mocked(authService.getMethods).mockResolvedValue({ google: true, phone: true, password: true });
    renderWithIntl(<WelcomePage />);

    await waitFor(() => expect(screen.getByText("Continue with Google")).toBeTruthy());
  });

  it("forwards a sanitized returnTo to the email/phone/username login links", async () => {
    searchParams = new URLSearchParams({ returnTo: "/en/vet/abc/book" });
    vi.mocked(authService.getMethods).mockResolvedValue({ google: false, phone: true, password: true });
    renderWithIntl(<WelcomePage />);

    await waitFor(() => expect(screen.getByText("Continue with email")).toBeTruthy());
    screen.getByText("Continue with email").click();
    expect(push).toHaveBeenCalledWith("/en/account?method=email&returnTo=%2Fen%2Fvet%2Fabc%2Fbook");
  });

  it("drops a malicious returnTo instead of forwarding it", async () => {
    searchParams = new URLSearchParams({ returnTo: "https://evil.example" });
    vi.mocked(authService.getMethods).mockResolvedValue({ google: false, phone: true, password: true });
    renderWithIntl(<WelcomePage />);

    await waitFor(() => expect(screen.getByText("Continue with email")).toBeTruthy());
    screen.getByText("Continue with email").click();
    expect(push).toHaveBeenCalledWith("/en/account?method=email");
  });
});
