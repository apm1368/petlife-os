import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { EditPetIdentity } from "./EditPetIdentity";

vi.mock("@/services/pets.service", () => ({ petsService: { update: vi.fn(), createPhotoUploadUrl: vi.fn() } }));
const pet = { id: "pet-one", name: "Cookie", photoUrl: null } as PetDto;

function editor() {
  const onSaved = vi.fn();
  const view = renderWithIntl(<EditPetIdentity pet={pet} locale="en" onCancel={vi.fn()} onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Cookie edited" } });
  const file = new File(["photo"], "pet.png", { type: "image/png" });
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  return { onSaved, file };
}

describe("pet photo partial saves", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  beforeEach(() => {
    vi.mocked(petsService.update).mockReset().mockResolvedValue({ ...pet, name: "Cookie edited" });
    vi.mocked(petsService.createPhotoUploadUrl).mockReset().mockResolvedValue({ uploadUrl: "https://upload.example/pet", publicUrl: "https://images.example/pet.png", method: "PUT", headers: {} });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:pet-photo");
      static revokeObjectURL = vi.fn();
    });
  });

  it("keeps the editor and selected photo on upload failure, then retries only on an explicit save", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const { onSaved, file } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The photo didn't upload, so none of the changes were saved.");
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Cookie edited");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe(file);
    expect(petsService.update).toHaveBeenLastCalledWith(pet.id, expect.objectContaining({ name: "Cookie edited", photoUrl: "https://images.example/pet.png" }));
  });

  it("does not close or claim success when obtaining the upload target fails", async () => {
    vi.mocked(petsService.createPhotoUploadUrl).mockRejectedValue(new Error("offline"));
    const { onSaved } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(petsService.update).not.toHaveBeenCalled();
  });

  it("does not partially save identity fields if the pet photo update fails", async () => {
    vi.mocked(petsService.update).mockRejectedValue(new Error("attachment failed"));
    const { onSaved } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Cookie edited");
    expect(petsService.update).toHaveBeenCalledTimes(1);
  });

  it("does not save identity or photo if the final pet update fails", async () => {
    vi.mocked(petsService.update).mockRejectedValue(new Error("forbidden"));
    const { onSaved } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The photo didn't upload");
    expect(onSaved).not.toHaveBeenCalled();
    expect(petsService.createPhotoUploadUrl).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["de", "Angaben bearbeiten", "Geschlecht", "Geburtsdatum", "Farbe und besondere Merkmale", "Mikrochipnummer", "Foto auswählen", "Das Foto ist größer als 50 MB.", "Das Foto konnte nicht hochgeladen werden; es wurden keine Änderungen gespeichert. Bitte versuchen Sie es erneut.", "Männlich"],
    ["es", "Editar datos", "Sexo", "Fecha de nacimiento", "Color y marcas", "Número de microchip", "Elegir una foto", "La foto supera los 50 MB.", "No se pudo subir la foto; no se guardó ningún cambio. Inténtalo de nuevo.", "Macho"],
  ] as const)("localizes the full edit form, validation and upload error in %s", async (locale, title, sex, birth, color, microchip, choosePhoto, tooBig, photoFailed, male) => {
    const { container } = renderWithIntl(<EditPetIdentity pet={pet} locale={locale} onCancel={vi.fn()} onSaved={vi.fn()} />, locale);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByLabelText(locale === "de" ? "Name" : "Nombre")).toBeTruthy();
    expect(screen.getByText(sex)).toBeTruthy();
    expect(screen.getByRole("group", { name: birth })).toBeTruthy();
    expect(screen.getByLabelText(locale === "de" ? "Kalender" : "Calendario")).toBeTruthy();
    expect(screen.getByLabelText(color)).toBeTruthy();
    expect(screen.getByLabelText(microchip)).toBeTruthy();
    expect(screen.getByRole("button", { name: choosePhoto })).toBeTruthy();
    expect(screen.getByRole("button", { name: male })).toBeTruthy();

    const input = container.querySelector('input[type="file"]')!;
    const tooLarge = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [tooLarge] } });
    expect(await screen.findByText(tooBig)).toBeTruthy();

    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const validPhoto = new File(["photo"], "pet.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [validPhoto] } });
    fireEvent.click(screen.getByRole("button", { name: locale === "de" ? "Speichern" : "Guardar" }));
    expect(await screen.findByText(photoFailed)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[آ-ی]/);
    expect(petsService.update).not.toHaveBeenCalled();
  });
});
