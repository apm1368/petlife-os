import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { UserDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { usersService } from "@/services/users.service";
import { ApiError } from "@/lib/api/client";
import { useThemeStore } from "@/stores/theme-store";
import { PersonalSettingsView } from "./PersonalSettingsView";

vi.mock("@/services/users.service", () => ({ usersService: { getMe: vi.fn(), updateMe: vi.fn(), requestContactChange: vi.fn(), confirmContactChange: vi.fn() } }));

// The account was last saved in Persian; the person is now browsing the English UI.
const stored: UserDto = { id: "u1", email: "sara@example.com", phone: null, displayName: "Sara", locale: "fa", themePreference: "SYSTEM" } as UserDto;

describe("PersonalSettingsView — account locale and theme preferences", () => {
  const assign = vi.fn();
  const original = window.location;

  beforeEach(() => {
    useThemeStore.getState().setTheme("LIGHT");
    vi.mocked(usersService.getMe).mockReset().mockResolvedValue(stored);
    vi.mocked(usersService.updateMe).mockReset().mockImplementation(async (input) => ({ ...stored, ...input }) as UserDto);
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, pathname: "/en/profile/personal", assign } });
    assign.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
  });

  it("shows the saved language preference and currently applied theme", async () => {
    renderWithIntl(<PersonalSettingsView />, "en");
    const language = (await screen.findByLabelText("Language")) as HTMLSelectElement;
    expect(language.value).toBe("fa");
    expect([...language.options].map((option) => option.value)).toEqual(["fa", "en", "de", "es"]);
    expect((screen.getByLabelText("Appearance") as HTMLSelectElement).value).toBe("LIGHT");
  });

  it("a theme-only save preserves the saved locale and never moves the app", async () => {
    renderWithIntl(<PersonalSettingsView />, "en");
    fireEvent.change(await screen.findByLabelText("Appearance"), { target: { value: "DARK" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(usersService.updateMe).toHaveBeenCalled());
    expect(vi.mocked(usersService.updateMe).mock.calls[0]![0]).toMatchObject({ locale: "fa", themePreference: "DARK" });
    await waitFor(() => expect(useThemeStore.getState().theme).toBe("DARK"));
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["en", "de", "es"] as const)("saves the %s preference and routes to it", async (targetLocale) => {
    renderWithIntl(<PersonalSettingsView />, "en");
    fireEvent.change(await screen.findByLabelText("Language"), { target: { value: targetLocale } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(usersService.updateMe).toHaveBeenCalledWith(expect.objectContaining({ locale: targetLocale })));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(`/${targetLocale}/profile/personal`));
    expect(useThemeStore.getState().theme).toBe("LIGHT");
  });

  it.each([
    ["de", "Anzeigename", "Darstellung", "Kontaktwege", "E-Mail", "Übersichtlichere Texte und größere Bedienelemente."],
    ["es", "Nombre visible", "Aspecto", "Medios de contacto", "Correo", "Texto más claro y controles más grandes."],
  ] as const)("shows translated account settings and contact states in %s", async (locale, nameLabel, appearanceLabel, contactsHeading, emailLabel, displayDescription) => {
    renderWithIntl(<PersonalSettingsView />, locale);
    expect(await screen.findByLabelText(nameLabel)).toBeTruthy();
    expect(screen.getByLabelText(appearanceLabel)).toBeTruthy();
    expect(screen.getByRole("heading", { name: contactsHeading })).toBeTruthy();
    expect(screen.getByText(emailLabel)).toBeTruthy();
    expect(screen.getByText(new RegExp(displayDescription))).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Nicht verifiziert" : "No verificado")).toBeTruthy();
    expect((document.body.textContent ?? "").replace("فارسی", "")).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Persönliche Angaben", "Ihre Kontodaten konnten nicht geladen werden."],
    ["es", "Datos personales", "No se pudieron cargar los datos de tu cuenta."],
  ] as const)("localizes the load failure and retry in %s", async (locale, title, message) => {
    vi.mocked(usersService.getMe).mockRejectedValueOnce(new Error("offline"));
    renderWithIntl(<PersonalSettingsView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Erneut versuchen" : "Reintentar" }));
    expect(await screen.findByLabelText(locale === "de" ? "Anzeigename" : "Nombre visible")).toBeTruthy();
    expect((document.body.textContent ?? "").replace("فارسی", "")).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut."],
    ["es", "No se pudo guardar. Inténtalo de nuevo."],
  ] as const)("does not leak an untranslated API message on save failure in %s", async (locale, expected) => {
    vi.mocked(usersService.updateMe).mockRejectedValueOnce(new ApiError({ code: "UNMAPPED_TEST_ERROR", message: "خطای فارسی از سرور", requestId: "test" }, 500));
    renderWithIntl(<PersonalSettingsView />, locale);
    const name = await screen.findByLabelText(locale === "de" ? "Anzeigename" : "Nombre visible");
    fireEvent.change(name, { target: { value: "Sara Example" } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Änderungen speichern" : "Guardar cambios" }));
    expect((await screen.findByRole("alert")).textContent).toContain(expected);
    expect((document.body.textContent ?? "").replace("فارسی", "")).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Verifizieren", "Neue E-Mail-Adresse", "Code senden", "Der Codeversand ist derzeit nicht verfügbar."],
    ["es", "Verificar", "Correo nuevo", "Enviar código", "El envío del código no está disponible ahora."],
  ] as const)("localizes contact-provider failures without showing backend text in %s", async (locale, action, inputLabel, sendLabel, expected) => {
    vi.mocked(usersService.requestContactChange).mockRejectedValueOnce(new ApiError({ code: "MESSAGING_PROVIDER_NOT_CONFIGURED", message: "متن فارسی سرور", requestId: "test" }, 503));
    renderWithIntl(<PersonalSettingsView />, locale);
    await screen.findByLabelText(locale === "de" ? "Anzeigename" : "Nombre visible");
    fireEvent.click(screen.getByRole("button", { name: action }));
    fireEvent.change(screen.getByLabelText(inputLabel), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: sendLabel }));
    expect((await screen.findByRole("alert")).textContent).toContain(expected);
    expect((document.body.textContent ?? "").replace("فارسی", "")).not.toMatch(/[\u0600-\u06FF]/);
  });
});
