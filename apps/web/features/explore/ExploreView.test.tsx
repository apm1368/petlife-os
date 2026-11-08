import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ExploreView } from "./ExploreView";

describe("ExploreView localization", () => {
  it.each([
    ["fa", "کاوش", "میان‌برهای من", "مراقبت", "سفر و اقامت", "/fa/travel"],
    ["en", "Explore", "My shortcuts", "Care", "Travel and stays", "/en/travel"],
    ["de", "Entdecken", "Meine Schnellzugriffe", "Pflege", "Reisen und Unterkünfte", "/de/travel"],
    ["es", "Explorar", "Mis accesos directos", "Cuidados", "Viajes y alojamientos", "/es/travel"],
  ] as const)("shows localized headings, shortcuts and links for %s", (locale, title, shortcuts, care, travel, travelHref) => {
    renderWithIntl(<ExploreView />, locale);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: shortcuts })).toBeTruthy();
    const careHeading = screen.getByRole("heading", { level: 2, name: care });
    const careSection = careHeading.closest("section");
    expect(careSection).not.toBeNull();
    expect(within(careSection as HTMLElement).getByRole("link", { name: new RegExp(locale === "de" ? "Gesundheit" : locale === "es" ? "Salud" : locale === "fa" ? "سلامت" : "Health") })).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(travel) }).getAttribute("href")).toBe(travelHref);
  });
});
