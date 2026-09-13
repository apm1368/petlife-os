import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { householdsService } from "@/services/households.service";
import { useSessionStore } from "@/stores/session-store";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { AppShell } from "./AppShell";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  usePathname: () => "/en/home",
}));
vi.mock("@/services/auth.service", () => ({ authService: { getSession: vi.fn() } }));
vi.mock("@/services/households.service", () => ({
  householdsService: { listMine: vi.fn(), listPets: vi.fn(), getActivePet: vi.fn() },
}));
vi.mock("@/features/notifications/NotificationBell", () => ({ NotificationBell: () => null }));

const USER = {
  id: "u1",
  email: "sarah@example.com",
  phone: null,
  displayName: "Sarah",
  avatarUrl: null,
  locale: "en",
  themePreference: "SYSTEM",
  createdAt: "",
  updatedAt: "",
} as const;

function apiError(status: number, code: string) {
  return new ApiError({ code, message: code, requestId: "req-1" }, status);
}

describe("AppShell", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.mocked(authService.getSession).mockReset();
    vi.mocked(householdsService.listMine).mockReset();
    vi.mocked(householdsService.listPets).mockReset();
    vi.mocked(householdsService.getActivePet).mockReset();
    useSessionStore.setState({ user: null, status: "idle" });
    usePetStore.setState({ householdId: null, pets: [], activePetId: null });
  });

  it("redirects an unauthenticated visitor to /welcome carrying the intended destination", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(apiError(401, "UNAUTHENTICATED"));

    renderWithIntl(
      <AppShell>
        <div>private content</div>
      </AppShell>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/welcome?returnTo=%2Fen%2Fhome"));
    expect(screen.queryByText("private content")).toBeNull();
  });

  it("renders the private content for an authenticated visitor", async () => {
    vi.mocked(authService.getSession).mockResolvedValue({ user: { ...USER } });
    vi.mocked(householdsService.listMine).mockResolvedValue([{ id: "h1" }] as never);
    vi.mocked(householdsService.listPets).mockResolvedValue([]);
    vi.mocked(householdsService.getActivePet).mockResolvedValue(null);

    renderWithIntl(
      <AppShell>
        <div>private content</div>
      </AppShell>,
    );

    await waitFor(() => expect(screen.getByText("private content")).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  /**
   * The bootstrap's 401 path is well covered above, but a *non*-401 failure
   * (API down, 500, a fetch that never resolved to an ApiError at all) left
   * the session status at its initial "idle": not authenticated, so the shell
   * never rendered children, and not unauthenticated, so it never redirected
   * either — a permanent loading skeleton with no message and no way out.
   * The visitor must instead be told something went wrong and offered a retry.
   */
  it("surfaces a recoverable error instead of an endless skeleton when bootstrap fails for a non-auth reason", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(apiError(500, "INTERNAL_ERROR"));

    renderWithIntl(
      <AppShell>
        <div>private content</div>
      </AppShell>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy());
    expect(screen.queryByLabelText("Loading")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("private content")).toBeNull();
  });

  it("treats a network failure that never became an ApiError the same recoverable way", async () => {
    vi.mocked(authService.getSession).mockRejectedValue(new TypeError("Failed to fetch"));

    renderWithIntl(
      <AppShell>
        <div>private content</div>
      </AppShell>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });
});
