import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { PetPassportReadinessDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { travelService } from "@/services/travel.service";
import { PetPassportReadinessView } from "./PetPassportReadinessView";

vi.mock("@/services/travel.service", () => ({ travelService: { getPassportReadiness: vi.fn() } }));

const readiness: PetPassportReadinessDto = {
  petId: "pet-1",
  petName: "Rex",
  petSpecies: "DOG" as never,
  petPhotoUrl: null,
  microchipNumber: null,
  vaccinationStatus: "UP_TO_DATE" as never,
  healthDocumentsCount: 1,
  travelDocumentsCount: 0,
  missingItems: ["TRAVEL_DOCUMENTS"],
};

describe("PetPassportReadinessView locales", () => {
  beforeEach(() => vi.mocked(travelService.getPassportReadiness).mockResolvedValue(readiness));

  it.each([
    ["de", "Reisebereitschaft von Rex", "Mikrochipnummer", "Keine Reisedokumente hochgeladen"],
    ["es", "Preparación de viaje de Rex", "Número de microchip", "No hay documentos de viaje cargados"],
  ] as const)("renders passport readiness in %s", async (locale, title, microchip, missingDocument) => {
    renderWithIntl(<PetPassportReadinessView petId="pet-1" />, locale);

    await waitFor(() => expect(screen.getByRole("heading", { name: title })).toBeTruthy());
    expect(screen.getByText(microchip)).toBeTruthy();
    expect(screen.getByText(missingDocument)).toBeTruthy();
  });
});
