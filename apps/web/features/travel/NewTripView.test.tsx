import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { NewTripView } from "./NewTripView";

vi.mock("@/services/travel.service", () => ({ travelService: { create: vi.fn() } }));

vi.mock("@/features/navigation/localized-link", () => ({
  useLocalizedRouter: () => ({ push: vi.fn() }),
}));

describe("NewTripView locales", () => {
  it.each([
    ["de", "Neue Reise planen", "Herkunftsland (ISO-Code)", "Verkehrsmittel", "Flugzeug"],
    ["es", "Planificar un viaje", "País de origen (código ISO)", "Medio de transporte", "Avión"],
  ] as const)("renders the %s trip form in the selected language", (locale, heading, originLabel, modeLabel, airMode) => {
    renderWithIntl(<NewTripView petId="pet-1" />, locale);

    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByLabelText(originLabel)).toBeTruthy();
    expect(screen.getByLabelText(modeLabel)).toBeTruthy();
    expect(screen.getByRole("option", { name: airMode })).toBeTruthy();
    expect(screen.getByRole("button", { name: locale === "de" ? "Reise erstellen" : "Crear viaje" })).toBeTruthy();
  });
});
