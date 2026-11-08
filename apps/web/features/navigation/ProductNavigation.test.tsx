import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ProductNavigation } from "./ProductNavigation";

it("links public discovery directly without an authentication detour", () => {
  renderWithIntl(<ProductNavigation />);
  expect(screen.getByRole("link", { name: "Shop" }).getAttribute("href")).toBe("/en/shop");
  expect(screen.getByRole("link", { name: "Health and veterinary care" }).getAttribute("href")).toBe("/en/vet/find");
  expect(screen.getByRole("link", { name: "Services" }).getAttribute("href")).toBe("/en/services");
});
it("resolves health through the active pet instead of a invented pet ID", () => {
  renderWithIntl(<ProductNavigation audience="consumer" />);
  expect(screen.getByRole("link", { name: "Health" }).getAttribute("href")).toBe("/en/pets/active?view=health");
  expect(screen.getByRole("link", { name: "Notification preferences" }).getAttribute("href")).toBe("/en/notifications/preferences");
});

it.each([
  ["de", /Gesundheit und Tiermedizin/, "Produktbereiche", "Benachrichtigungseinstellungen"],
  ["es", /Salud y veterinaria/, "Secciones del producto", "Preferencias de notificaciones"],
] as const)("renders preview navigation in %s", (locale, health, navLabel, notificationPreferences) => {
  renderWithIntl(<ProductNavigation audience="consumer" />, locale);
  expect(screen.getByRole("navigation", { name: navLabel })).toBeTruthy();
  expect(screen.getByRole("link", { name: health }).getAttribute("href")).toBe(`/${locale}/vet/find`);
  expect(screen.getByRole("link", { name: notificationPreferences }).getAttribute("href")).toBe(`/${locale}/notifications/preferences`);
  expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
});
