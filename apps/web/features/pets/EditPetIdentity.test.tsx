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
    expect((await screen.findByRole("alert")).textContent).toContain("The photo didn't upload; the other changes were saved.");
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Cookie edited");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.body).toBe(file);
    expect(petsService.update).toHaveBeenLastCalledWith(pet.id, { photoUrl: "https://images.example/pet.png" });
  });

  it("does not close or claim success when obtaining the upload target fails", async () => {
    vi.mocked(petsService.createPhotoUploadUrl).mockRejectedValue(new Error("offline"));
    const { onSaved } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(petsService.update).toHaveBeenCalledTimes(1);
  });

  it("retains the draft if attaching the uploaded photo fails", async () => {
    vi.mocked(petsService.update).mockResolvedValueOnce({ ...pet, name: "Cookie edited" }).mockRejectedValueOnce(new Error("attachment failed"));
    const { onSaved } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Cookie edited");
    expect(petsService.update).toHaveBeenCalledTimes(2);
  });

  it("does not attempt a photo upload after the identity save fails", async () => {
    vi.mocked(petsService.update).mockRejectedValue(new Error("forbidden"));
    const { onSaved } = editor();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Saving didn't work");
    expect(onSaved).not.toHaveBeenCalled();
    expect(petsService.createPhotoUploadUrl).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
