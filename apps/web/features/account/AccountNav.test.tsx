import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { AccountNav } from "./AccountNav";

let pathname = "/en/profile/security";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AccountNav", () => {
  it("links every canonical account section and marks the active English route", () => {
    renderWithIntl(<AccountNav />, "en");
    const nav = screen.getByRole("navigation", { name: "Account settings" });
    expect(nav.querySelectorAll("a")).toHaveLength(11);
    expect(screen.getByRole("link", { name: /^Security/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /^Household & access/ }).getAttribute("href")).toBe("/en/profile/household");
    expect(screen.getByRole("link", { name: /^Membership/ }).getAttribute("href")).toBe("/en/profile/membership");
    expect(screen.getByRole("link", { name: /^Wallet/ }).getAttribute("href")).toBe("/en/profile/wallet");
    expect(screen.getByRole("link", { name: /^Clinic messages for your household/ }).getAttribute("href")).toBe("/en/profile/clinic-notes");
    // Section pages offer a way back to the settings index (shown on mobile).
    expect(screen.getByRole("link", { name: /Account$/ }).getAttribute("href")).toBe("/en/profile");
  });

  it("uses Persian labels and preserves RTL route structure", () => {
    pathname = "/fa/profile/household";
    renderWithIntl(<AccountNav />, "fa");
    expect(screen.getByRole("navigation", { name: "مدیریت حساب" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^خانواده و دسترسی/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "نمای کلی" }).getAttribute("href")).toBe("/fa/profile");
  });

  it.each([
    ["de", "Kontoeinstellungen", "Haushalt und Zugriff", "Profil und Einstellungen", "Konto", "Kliniknachrichten für Ihren Haushalt", "Von Kliniken ausdrücklich geteilte Nachrichten"],
    ["es", "Configuración de la cuenta", "Hogar y acceso", "Perfil y preferencias", "Cuenta", "Mensajes de la clínica para tu hogar", "Notas compartidas expresamente por clínicas"],
  ] as const)("renders account navigation in %s and keeps the locale in all links", (locale, navName, household, personal, back, clinicTitle, clinicHint) => {
    pathname = `/${locale}/profile/household`;
    renderWithIntl(<AccountNav />, locale);
    expect(screen.getByRole("navigation", { name: navName })).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(household) }).getAttribute("href")).toBe(`/${locale}/profile/household`);
    expect(screen.getByRole("link", { name: new RegExp(personal) }).getAttribute("href")).toBe(`/${locale}/profile/personal`);
    expect(screen.getByRole("link", { name: new RegExp(clinicTitle) }).getAttribute("href")).toBe(`/${locale}/profile/clinic-notes`);
    expect(screen.getByRole("link", { name: new RegExp(clinicHint) })).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(`${back}$`) }).getAttribute("href")).toBe(`/${locale}/profile`);
  });
});
