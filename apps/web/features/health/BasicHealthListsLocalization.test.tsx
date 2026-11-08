import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { healthService } from "@/services/health.service";
import { AllergiesView } from "./AllergiesView";
import { ConditionsView } from "./ConditionsView";
import { MedicationsView } from "./MedicationsView";

vi.mock("@/services/health.service", () => ({
  healthService: {
    listAllergies: vi.fn(), createAllergy: vi.fn(),
    listConditions: vi.fn(), createCondition: vi.fn(),
    listMedications: vi.fn(), createMedication: vi.fn(),
  },
}));

describe("basic health list localization", () => {
  beforeEach(() => {
    vi.mocked(healthService.listAllergies).mockReset();
    vi.mocked(healthService.listConditions).mockReset();
    vi.mocked(healthService.listMedications).mockReset();
  });

  it.each([
    ["de", "Allergien", "Keine Allergien erfasst."],
    ["es", "Alergias", "No hay alergias registradas."],
  ] as const)("renders the empty allergy state in %s", async (locale, title, empty) => {
    vi.mocked(healthService.listAllergies).mockResolvedValue([]);
    renderWithIntl(<AllergiesView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Erkrankungen", "Erkrankung hinzufügen"],
    ["es", "Afecciones", "Añadir afección"],
  ] as const)("renders the condition form action in %s", async (locale, title, add) => {
    vi.mocked(healthService.listConditions).mockResolvedValue([]);
    renderWithIntl(<ConditionsView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: add })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Medikamente", "Keine Medikamente erfasst."],
    ["es", "Medicamentos", "No hay medicamentos registrados."],
  ] as const)("renders the empty medication state in %s", async (locale, title, empty) => {
    vi.mocked(healthService.listMedications).mockResolvedValue([]);
    renderWithIntl(<MedicationsView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it("shows a localized retry state instead of leaving a failed fetch as a blank screen", async () => {
    vi.mocked(healthService.listAllergies).mockRejectedValue(new Error("offline"));
    renderWithIntl(<AllergiesView petId="pet-1" />, "de");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
