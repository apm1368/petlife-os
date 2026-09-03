import { afterEach, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ProviderShell } from "@/features/provider/ProviderShell";
import { SellerShell } from "@/features/seller/SellerShell";
import { AdminShell } from "@/features/admin/AdminShell";
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => window.location.pathname,
}));
vi.mock("@/services/auth.service", () => ({
  authService: { getSession: () => Promise.reject(new Error("unauthenticated")) },
}));
vi.mock("@/hooks/use-provider-bootstrap", () => ({ useProviderBootstrap: () => ({ isLoading: true }) }));
vi.mock("@/hooks/use-seller-bootstrap", () => ({ useSellerBootstrap: () => ({ isLoading: true }) }));
vi.mock("@/hooks/use-admin-bootstrap", () => ({ useAdminBootstrap: () => ({ isLoading: true }) }));
afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});
it.each([
  [ProviderShell, "/fa/provider/bookings?status=CONFIRMED"],
  [SellerShell, "/fa/seller/finance?tab=transactions"],
  [AdminShell, "/fa/admin/seller-finance?status=OPEN"],
] as const)("preserves the portal destination through login", async (Shell, path) => {
  window.history.replaceState({}, "", path);
  renderWithIntl(<Shell>Protected portal data</Shell>, "fa");
  await waitFor(() =>
    expect(replace).toHaveBeenCalledWith(`/fa/welcome?returnTo=${encodeURIComponent(path)}`),
  );
  expect(screen.queryByText("Protected portal data")).toBeNull();
});
