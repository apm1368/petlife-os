import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { useSessionStore } from "@/stores/session-store";
import { PublicShell } from "./PublicShell";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/use-app-bootstrap", () => ({ useAppBootstrap: () => ({ isLoading: false, error: null }) }));
vi.mock("@/features/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/locale/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  useSessionStore.setState({ user: null, status: "unauthenticated" });
});
it("keeps discovery accessible and preserves filters through login", () => {
  window.history.replaceState({}, "", "/en/shop/products?category=food");
  renderWithIntl(<PublicShell>Public products</PublicShell>);
  expect(screen.getByText("Public products")).toBeTruthy();
  expect(screen.getByRole("link", { name: "PET LIFE OS" }).getAttribute("href")).toBe("/en");
  fireEvent.click(screen.getByRole("button"));
  expect(push).toHaveBeenCalledWith("/en/welcome?returnTo=%2Fen%2Fshop%2Fproducts%3Fcategory%3Dfood");
  window.history.replaceState({}, "", "/");
});
