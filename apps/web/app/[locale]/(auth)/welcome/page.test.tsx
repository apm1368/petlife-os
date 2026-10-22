import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import WelcomePage from "./page";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

describe("WelcomePage", () => {
  beforeEach(() => {
    push.mockReset();
    searchParams = new URLSearchParams();
  });

  it("offers only username sign-in and account creation — no Google, email or code-only sign-in", () => {
    renderWithIntl(<WelcomePage />);
    expect(screen.getByText("Log in")).toBeTruthy();
    expect(screen.getByText("Create an account")).toBeTruthy();
    expect(screen.queryByText(/Google/)).toBeNull();
    expect(screen.queryByText(/email/i)).toBeNull();
  });

  it("forwards a sanitized returnTo to sign-in and sign-up", () => {
    searchParams = new URLSearchParams({ returnTo: "/en/vet/abc/book" });
    renderWithIntl(<WelcomePage />);
    screen.getByText("Log in").click();
    expect(push).toHaveBeenCalledWith("/en/account?returnTo=%2Fen%2Fvet%2Fabc%2Fbook");
    screen.getByText("Create an account").click();
    expect(push).toHaveBeenCalledWith("/en/register?returnTo=%2Fen%2Fvet%2Fabc%2Fbook");
  });

  it("drops a malicious returnTo instead of forwarding it", () => {
    searchParams = new URLSearchParams({ returnTo: "https://evil.example" });
    renderWithIntl(<WelcomePage />);
    screen.getByText("Log in").click();
    expect(push).toHaveBeenCalledWith("/en/account");
  });
});
