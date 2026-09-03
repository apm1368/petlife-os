import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { householdsService } from "@/services/households.service";
import { useSessionStore } from "@/stores/session-store";
import { ApiError } from "@/lib/api/client";
import { AppShell } from "./AppShell";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn() } }));
vi.mock("@/features/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/locale/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));

describe("AppShell bootstrap recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useSessionStore.setState({ user: null, status: "idle" });
  });

  it("shows recovery instead of an endless skeleton when the session request fails", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(new Error("Failed to fetch"));
    renderWithIntl(<AppShell>Protected content</AppShell>);

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not render incomplete household context after a successful session request", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({
      user: {
        id: "u1",
        email: "sarah@example.com",
        phone: null,
        displayName: "Sarah",
        avatarUrl: null,
        locale: "en",
        themePreference: "SYSTEM",
        createdAt: "",
        updatedAt: "",
      },
    });
    vi.mocked(householdsService.listMine).mockRejectedValue(new Error("Service unavailable"));
    renderWithIntl(<AppShell>Protected content</AppShell>);

    await screen.findByRole("alert");
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it("still sends an unauthenticated visitor to auth in their current locale", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(
      new ApiError({ code: "UNAUTHORIZED", message: "Unauthorized", requestId: "test" }, 401),
    );
    renderWithIntl(<AppShell>Protected content</AppShell>, "fa");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/fa/welcome?returnTo=%2F"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Protected content")).toBeNull();
  });
});
