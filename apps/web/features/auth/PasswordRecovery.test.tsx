import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import ForgotPasswordPage from "@/app/[locale]/(auth)/account/forgot/page";
import { authService } from "@/services/auth.service";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/services/auth.service", () => ({ authService: { forgotPassword: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
it("keeps recovery retryable after a transport failure", async () => {
 vi.mocked(authService.forgotPassword).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
 renderWithIntl(<ForgotPasswordPage />);
 fireEvent.change(screen.getByRole("textbox"), {target:{value:"review@example.com"}});
 fireEvent.click(screen.getByRole("button"));
 expect(await screen.findByRole("alert")).toBeTruthy();
 expect(screen.getByRole("textbox")).toBeTruthy();
 fireEvent.click(screen.getByRole("button"));
 await screen.findByText(/If an account/i);
 expect(screen.queryByRole("alert")).toBeNull();
});
