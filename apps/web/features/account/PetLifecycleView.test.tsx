import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { PetLifecycleView } from "./PetLifecycleView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), markDeceased: vi.fn(), transitionToMemorial: vi.fn() } }));

const pet = (lifecycleStatus: string) => ({ id: "pet-1", name: "Nala", lifecycleStatus }) as never;

describe("PetLifecycleView localization", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(petsService.getById).mockReset();
    vi.mocked(petsService.markDeceased).mockReset();
    vi.mocked(petsService.transitionToMemorial).mockReset();
  });

  it("renders the pet lifecycle in German with a localized known status", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("LOST"));
    renderWithIntl(<PetLifecycleView petId="pet-1" />, "de");

    expect((await screen.findAllByText("Vermisst")).length).toBeGreaterThan(0);
    expect(screen.getByText("LEBENSSTATUS DES TIERES")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vermisstenmeldung öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Als verstorben markieren" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it("shows the Spanish memorial confirmation and save error without Persian UI", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("DECEASED"));
    vi.mocked(petsService.transitionToMemorial).mockRejectedValue(new Error("backend raw error"));
    renderWithIntl(<PetLifecycleView petId="pet-1" />, "es");

    fireEvent.click(await screen.findByRole("button", { name: "Activar homenaje" }));
    expect(screen.getByRole("heading", { name: "Activar el modo de homenaje" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo guardar el cambio. Inténtalo de nuevo.");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
    expect(document.body.textContent).not.toContain("backend raw error");
  });

  it("renders and retries the localized load-error state", async () => {
    vi.mocked(petsService.getById).mockRejectedValueOnce(new Error("backend raw error")).mockResolvedValueOnce(pet("ACTIVE"));
    renderWithIntl(<PetLifecycleView petId="pet-1" />, "es");

    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getAllByText("En activo").length).toBeGreaterThan(0));
  });
});
