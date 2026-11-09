import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { lostPetService } from "@/services/lost-pet.service";
import { LostPetIncidentDetailView } from "./LostPetIncidentDetailView";

vi.mock("@/services/lost-pet.service", () => ({
  lostPetService: { get: vi.fn(), listSightings: vi.fn(), markSearching: vi.fn(), markFound: vi.fn(), reunite: vi.fn(), close: vi.fn(), shareToCommunity: vi.fn(), reviewSighting: vi.fn() },
}));
vi.mock("@/features/shared/ShareBar", () => ({ ShareBar: () => <div /> }));

const incident = {
  id: "incident-1", petId: "pet-1", petName: "Milo", status: "OPEN", description: "Ran off during a walk",
  publicArea: "North district", lastKnownLocation: "Central Park", lastSeenAt: "2026-11-01T08:30:00.000Z",
  privateNotes: "Microchip recorded", primaryPhotoUrl: null,
} as never;

describe("owner lost-pet detail locale", () => {
  beforeEach(() => {
    vi.mocked(lostPetService.get).mockReset().mockResolvedValue(incident);
    vi.mocked(lostPetService.listSightings).mockReset().mockResolvedValue([]);
  });

  it.each([["de", "Milo wird vermisst", "Öffentliche Gegend", "Genauer Ort (privat)", "Es wurden noch keine Sichtungen gemeldet.", "Suche als aktiv markieren"], ["es", "Milo está desaparecida", "Zona pública", "Lugar exacto (privado)", "Todavía no se ha comunicado ningún avistamiento.", "Marcar búsqueda como activa"]] as const)("renders owner detail, actions and empty sightings in %s", async (locale, title, publicArea, privatePlace, empty, action) => {
    renderWithIntl(<LostPetIncidentDetailView petId="pet-1" incidentId="incident-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(new RegExp(publicArea))).toBeTruthy();
    expect(screen.getByText((content) => content.includes(privatePlace))).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.getByRole("button", { name: action })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
