import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ProductNavigation } from "./ProductNavigation";

it("links public discovery directly without an authentication detour", () => {
  renderWithIntl(<ProductNavigation />);
  expect(screen.getByRole("link", { name: "Shop" }).getAttribute("href")).toBe("/en/shop");
  expect(screen.getByRole("link", { name: "Find a vet" }).getAttribute("href")).toBe("/en/vet/find");
  expect(screen.getByRole("link", { name: "Services" }).getAttribute("href")).toBe("/en/services");
});
it("resolves health through the active pet instead of a invented pet ID", () => {
  renderWithIntl(<ProductNavigation audience="consumer" />);
  expect(screen.getByRole("link", { name: "Health" }).getAttribute("href")).toBe("/en/pets/active?view=health");
  expect(screen.getByRole("link", { name: "Notification preferences" }).getAttribute("href")).toBe("/en/notifications/preferences");
});
