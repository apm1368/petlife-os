import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { useSessionStore } from "@/stores/session-store";
import { RequireAuth } from "./RequireAuth";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => "/en/vet/abc/book",
}));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn() } }));

describe("RequireAuth", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(authService.getSession).mockReset();
    useSessionStore.setState({ user: null, status: "idle" });
  });

  it("redirects to /welcome with the current path as returnTo when the visitor is unauthenticated", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(Object.assign(new Error("unauthenticated"), { status: 401 }));

    renderWithIntl(
      <RequireAuth>
        <div>gated content</div>
      </RequireAuth>,
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/welcome?returnTo=%2Fen%2Fvet%2Fabc%2Fbook"));
    expect(screen.queryByText("gated content")).toBeNull();
  });

  it("renders the gated content once the visitor is authenticated", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({
      user: { id: "u1", email: null, phone: null, displayName: "Sarah", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" },
    });

    renderWithIntl(
      <RequireAuth>
        <div>gated content</div>
      </RequireAuth>,
    );

    await waitFor(() => expect(screen.getByText("gated content")).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});
