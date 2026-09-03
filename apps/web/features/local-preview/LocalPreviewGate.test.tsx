import { afterEach, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { LocalPreviewGate } from "./LocalPreviewGate";
vi.mock("@/features/theme/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/locale/LocaleSwitcher", () => ({ LocaleSwitcher: () => null }));
afterEach(() => vi.unstubAllEnvs());
it("does not mount the login guard during explicit local preview", async () => {
  vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "1");
  const guard = vi.fn(() => <p>Login required</p>);
  const Guard = guard;
  renderWithIntl(<LocalPreviewGate title="Admin" live={<Guard />}>Existing admin page</LocalPreviewGate>);
  await screen.findByText("Existing admin page");
  expect(guard).not.toHaveBeenCalled();
  expect(screen.queryByText("Login required")).toBeNull();
});
it("keeps the existing auth guard when preview is not enabled", () => {
  vi.stubEnv("NEXT_PUBLIC_LOCAL_PREVIEW", "0");
  renderWithIntl(<LocalPreviewGate title="Admin" live={<p>Login required</p>}>Existing admin page</LocalPreviewGate>);
  expect(screen.getByText("Login required")).toBeTruthy();
  expect(screen.queryByText("Existing admin page")).toBeNull();
});
