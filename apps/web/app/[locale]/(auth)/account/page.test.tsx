import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import AccountPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ method: "phone" }),
}));
vi.mock("@/services/auth.service", () => ({ authService: { requestOtp: vi.fn(), verifyOtp: vi.fn() } }));

describe("phone login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.requestOtp).mockResolvedValue({} as never);
    vi.mocked(authService.verifyOtp).mockRejectedValue(new Error("expired"));
  });
  it.each(["۰۹۱۲۳۴۵۶۷۸۹", "09123456789", "+98 912 345 6789"])("uses the same normalized number for request and verification: %s", async (phone) => {
    renderWithIntl(<AccountPage />);
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: phone } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(authService.requestOtp).toHaveBeenCalledWith("+989123456789"));
    const inputs = await screen.findAllByRole("textbox");
    fireEvent.paste(inputs[0]!, { clipboardData: { getData: () => "۱۲۳۴۵۶" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(authService.verifyOtp).toHaveBeenCalledWith("+989123456789", "123456"));
  });
  it("shows a localized error without sending an invalid number", async () => {
    renderWithIntl(<AccountPage />, "fa");
    fireEvent.change(screen.getByLabelText("شماره موبایل"), { target: { value: "۰۹۱۲" } });
    fireEvent.click(screen.getByRole("button", { name: "ارسال کد" }));
    expect(await screen.findByText("شماره موبایل معتبر ایران را وارد کنید.")).toBeTruthy();
    expect(authService.requestOtp).not.toHaveBeenCalled();
  });

  it.each([
    ["de", "Telefonnummer", "Code senden", "Einmalcode", "Bestätigen", "E-Mail oder Telefonnummer ändern"],
    ["es", "Número de teléfono", "Enviar código", "Código de un solo uso", "Verificar", "Cambiar correo o teléfono"],
  ] as const)("localizes phone login and OTP controls for %s", async (locale, phoneLabel, send, passcodeLabel, verify, change) => {
    renderWithIntl(<AccountPage />, locale);
    fireEvent.change(screen.getByLabelText(phoneLabel), { target: { value: "09123456789" } });
    fireEvent.click(screen.getByRole("button", { name: send }));
    expect(await screen.findByLabelText(passcodeLabel)).toBeTruthy();
    expect(screen.getByRole("button", { name: verify })).toBeTruthy();
    expect(screen.getByRole("button", { name: change })).toBeTruthy();
  });
});
