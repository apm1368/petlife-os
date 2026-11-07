import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { authService } from "@/services/auth.service";
import { accountService } from "@/services/account.service";
import { onboardingService } from "@/services/onboarding.service";
import RegisterPage from "./page";

const push = vi.fn();
const replace = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/services/auth.service", () => ({ authService: { register: vi.fn() } }));
vi.mock("@/services/account.service", () => ({ accountService: { setConsent: vi.fn() } }));
vi.mock("@/services/onboarding.service", () => ({ onboardingService: { getProgress: vi.fn() } }));

function completeRequiredFields(username: string) {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "correct-horse-battery" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    replace.mockReset();
    searchParams = new URLSearchParams();
    vi.mocked(authService.register).mockReset();
    vi.mocked(accountService.setConsent).mockReset();
    vi.mocked(accountService.setConsent).mockResolvedValue({} as never);
    vi.mocked(onboardingService.getProgress).mockReset();
  });

  it("uses a non-enumerating error when registration is rejected", async () => {
    vi.mocked(authService.register).mockRejectedValue(new Error("conflict"));

    renderWithIntl(<RegisterPage />);
    completeRequiredFields("sarah");
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => expect(screen.getByText("Could not create your account. Check the details and try again.")).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("records required consent and preserves a safe returnTo destination", async () => {
    searchParams = new URLSearchParams({ returnTo: "/en/vet/abc/book" });
    vi.mocked(authService.register).mockResolvedValue({
      user: { id: "u1", email: null, phone: null, displayName: "New User", avatarUrl: null, locale: "en", themePreference: "SYSTEM", createdAt: "", updatedAt: "" },
    });
    vi.mocked(onboardingService.getProgress).mockResolvedValue({ status: "COMPLETED", chapter: "READY" } as never);

    renderWithIntl(<RegisterPage />);
    completeRequiredFields("newuser");
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/vet/abc/book"));
    expect(accountService.setConsent).toHaveBeenCalledWith("TERMS", true);
    expect(accountService.setConsent).toHaveBeenCalledWith("PRIVACY", true);
  });

  it.each([
    ["de", "Konto erstellen", "Benutzername", "Passwort", "Passwort bestätigen", "Ich akzeptiere die Nutzungsbedingungen und die Datenschutzerklärung von opetlife.", "Anzeigen"],
    ["es", "Crear una cuenta", "Nombre de usuario", "Contraseña", "Confirmar contraseña", "Acepto las condiciones de uso y la política de privacidad de opetlife.", "Mostrar"],
  ] as const)("renders translated registration fields and consent copy in %s", (locale, title, username, password, confirmPassword, terms, showPassword) => {
    renderWithIntl(<RegisterPage />, locale);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByLabelText(username)).toBeTruthy();
    expect(screen.getByLabelText(password)).toBeTruthy();
    expect(screen.getByLabelText(confirmPassword)).toBeTruthy();
    expect(screen.getByText(terms)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: showPassword })).toHaveLength(2);
    expect(screen.getByRole("button", { name: locale === "de" ? "Konto erstellen" : "Crear cuenta" })).toBeTruthy();
  });
});
