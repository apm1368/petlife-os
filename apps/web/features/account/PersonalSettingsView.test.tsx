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

describe("PersonalSettingsView — theme and language stay independent", () => {
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

  it("starts from the language and theme on screen, not the account's stored values", async () => {
    renderWithIntl(<PersonalSettingsView />, "en");
    const language = (await screen.findByLabelText("Language")) as HTMLSelectElement;
    expect(language.value).toBe("en");
    expect((screen.getByLabelText("Appearance") as HTMLSelectElement).value).toBe("LIGHT");
  });

  it("a theme-only save applies the theme and never moves the app to another locale", async () => {
    renderWithIntl(<PersonalSettingsView />, "en");
    fireEvent.change(await screen.findByLabelText("Appearance"), { target: { value: "DARK" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(usersService.updateMe).toHaveBeenCalled());
    expect(vi.mocked(usersService.updateMe).mock.calls[0]![0]).toMatchObject({ locale: "en", themePreference: "DARK" });
    await waitFor(() => expect(useThemeStore.getState().theme).toBe("DARK"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("an explicit language change moves the app and keeps the theme", async () => {
    renderWithIntl(<PersonalSettingsView />, "en");
    fireEvent.change(await screen.findByLabelText("Language"), { target: { value: "fa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/fa/profile/personal"));
    expect(useThemeStore.getState().theme).toBe("LIGHT");
  });
});
