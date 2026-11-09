import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { ExploreServicesView } from "./ExploreServicesView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ activePet: { id: "pet-1", name: "Luna" } }) }));

describe("ExploreServicesView", () => {
  it("lists every service category as a link and the active pet's name", () => {
    renderWithIntl(<ExploreServicesView />);

    expect(screen.getByText("For Luna")).toBeTruthy();
    expect(screen.getByText("Grooming")).toBeTruthy();
    expect(screen.getByText("Training")).toBeTruthy();
    expect(screen.getByText("Walking")).toBeTruthy();
    expect(screen.getByText("Sitting")).toBeTruthy();
    expect(screen.getByText("Boarding")).toBeTruthy();
    expect(screen.getByText("Pet Taxi")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Veterinary/ }).getAttribute("href")).toBe("/en/services/VET");
  });

  it.each([
    ["fa", "مراقبت حرفه‌ای، نزدیک شما", "برای Luna", "دامپزشکی", "جست‌وجوی خدمات", "همهٔ خدمات"],
    ["en", "Professional care, near you", "For Luna", "Veterinary care", "Search services", "All services"],
    ["de", "Professionelle Betreuung in Ihrer Nähe", "Für Luna", "Tiermedizin", "Dienstleistungen suchen", "Alle Leistungen"],
    ["es", "Atención profesional cerca de ti", "Para Luna", "Veterinaria", "Buscar servicios", "Todos los servicios"],
  ] as const)("renders the whole services overview in %s", (locale, heading, petSubtitle, category, searchLabel, allServices) => {
    renderWithIntl(<ExploreServicesView />, locale);

    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
    expect(screen.getByText(petSubtitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(category) })).toBeTruthy();
    expect(screen.getByLabelText(searchLabel)).toBeTruthy();
    expect(screen.getByRole("link", { name: allServices })).toBeTruthy();
    if (locale === "de" || locale === "es") {
      expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
      expect(document.body.textContent).not.toContain("Professional care, near you");
      expect(document.body.textContent).not.toContain("Verified professionals, in one place");
    }
  });
});
