import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { UserDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { usersService } from "@/services/users.service";
import { useThemeStore } from "@/stores/theme-store";
import { PersonalSettingsView } from "./PersonalSettingsView";

vi.mock("@/services/users.service", () => ({ usersService: { getMe: vi.fn(), updateMe: vi.fn() } }));

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
    ["de", "Anzeigename", "Darstellung", "Kontaktwege", "E-Mail"],
    ["es", "Nombre visible", "Aspecto", "Medios de contacto", "Correo"],
  ] as const)("shows translated account settings and contact states in %s", async (locale, nameLabel, appearanceLabel, contactsHeading, emailLabel) => {
    renderWithIntl(<PersonalSettingsView />, locale);
    expect(await screen.findByLabelText(nameLabel)).toBeTruthy();
    expect(screen.getByLabelText(appearanceLabel)).toBeTruthy();
    expect(screen.getByRole("heading", { name: contactsHeading })).toBeTruthy();
    expect(screen.getByText(emailLabel)).toBeTruthy();
    expect(screen.getByText(locale === "de" ? "Nicht verifiziert" : "No verificado")).toBeTruthy();
  });
});
