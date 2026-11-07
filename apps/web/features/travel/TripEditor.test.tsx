import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import type { TripDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { TripEditor } from "./TripEditor";

vi.mock("@/services/travel.service", () => ({ travelService: { update: vi.fn() } }));
vi.mock("@/hooks/use-pet-access", () => ({ usePetAccess: () => ({ access: { canEditIdentity: true } }) }));

const trip = {
  id: "trip-1",
  originCity: "Tehran",
  destinationCity: "Berlin",
  notes: "Keep documents together",
  travelMode: "AIR",
  status: "DRAFT",
  departAt: "2026-06-01T00:00:00.000Z",
  returnAt: "2026-06-10T00:00:00.000Z",
} as TripDto;

describe("TripEditor localization", () => {
  it.each([
    ["de", "Reiseplan bearbeiten", "Abreiseort", "Zielort", "Notizen", "Speichern"],
    ["es", "Editar plan de viaje", "Ciudad de origen", "Ciudad de destino", "Notas", "Guardar"],
  ] as const)("renders the trip editor in %s", (locale, title, origin, destination, notes, save) => {
    renderWithIntl(<TripEditor petId="pet-1" trip={trip} onSaved={async () => {}} />, locale);

    fireEvent.click(screen.getByText(title));

    expect(screen.getByLabelText(origin)).toBeTruthy();
    expect(screen.getByLabelText(destination)).toBeTruthy();
    expect(screen.getByText(notes)).toBeTruthy();
    expect(screen.getByRole("button", { name: save })).toBeTruthy();
  });
});
