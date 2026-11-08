import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { SetupStatus, type CareProfileDto, type PetAccessFlags } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { careProfileService } from "@/services/care-profile.service";
import { petsService } from "@/services/pets.service";
import { CareProfileView } from "./CareProfileView";

vi.mock("@/services/care-profile.service", () => ({ careProfileService: { get: vi.fn(), upsert: vi.fn() } }));
vi.mock("@/services/pets.service", () => ({ petsService: { getMyAccess: vi.fn() } }));

const FULL_ACCESS: PetAccessFlags = {
  canViewIdentity: true,
  canEditIdentity: true,
  canViewHealth: true,
  canEditHealth: true,
  canBookCare: true,
  canViewCareProfile: true,
  canEditCareProfile: true,
  canViewLocation: true,
  canManageAccess: true,
  canRecordClinicalData: false,
};

const PROFILE: CareProfileDto = {
  petId: "pet-1",
  status: SetupStatus.PARTIAL,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  temperamentText: "Calm and friendly",
  aroundPeopleText: null,
  aroundAnimalsText: null,
  leashBehaviorText: null,
  handlingSensitivityText: null,
  feedingRoutineText: null,
  toiletRoutineText: null,
  separationBehaviorText: null,
  specialInstructionsText: null,
};
const EMPTY_PROFILE: CareProfileDto = { ...PROFILE, temperamentText: null };

describe("CareProfileView", () => {
  beforeEach(() => {
    vi.mocked(careProfileService.get).mockReset();
    vi.mocked(careProfileService.upsert).mockReset();
    vi.mocked(petsService.getMyAccess).mockReset();
  });

  it("shows an edit action and no read-only notice when the caller can edit", async () => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue(FULL_ACCESS);

    renderWithIntl(<CareProfileView petId="pet-1" />);

    expect(await screen.findByRole("button", { name: "Edit Care Profile" })).toBeTruthy();
    expect(screen.queryByText(/read-only/i)).toBeNull();
  });

  it("never shows the edit form or an edit action to a view-only caller", async () => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ ...FULL_ACCESS, canEditCareProfile: false });

    renderWithIntl(<CareProfileView petId="pet-1" />);

    await screen.findByText("Calm and friendly");
    expect(screen.queryByRole("button", { name: "Edit Care Profile" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([["de", "Pflegeprofil", "Pflegeprofil bearbeiten"], ["es", "Perfil de cuidados", "Editar perfil de cuidados"]] as const)("localizes the care profile in %s", async (locale, title, editLabel) => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue(FULL_ACCESS);
    renderWithIntl(<CareProfileView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: editLabel })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each([
    ["fa", "شما فقط می‌توانید این پروفایل مراقبت را مشاهده کنید."],
    ["en", "You can view this care profile but not edit it."],
    ["de", "Sie können dieses Pflegeprofil ansehen, aber nicht bearbeiten."],
    ["es", "Puedes consultar este perfil de cuidados, pero no editarlo."],
  ] as const)("localizes the view-only permission state in %s", async (locale, notice) => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ ...FULL_ACCESS, canEditCareProfile: false });
    renderWithIntl(<CareProfileView petId="pet-1" />, locale);
    expect(await screen.findByText(notice)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /edit|bearbeiten|editar|ویرایش/i })).toBeNull();
  });

  it.each([
    ["fa", "پروفایل مراقبت"],
    ["en", "Care Profile"],
    ["de", "Pflegeprofil"],
    ["es", "Perfil de cuidados"],
  ] as const)("localizes the empty state in %s", async (locale, title) => {
    vi.mocked(careProfileService.get).mockResolvedValue(EMPTY_PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ ...FULL_ACCESS, canEditCareProfile: false });
    renderWithIntl(<CareProfileView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(locale === "fa" ? "هنوز تنظیم نشده است." : locale === "en" ? "Not set up yet." : locale === "de" ? "Noch nicht eingerichtet." : "Aún no se ha configurado.")).toBeTruthy();
  });

  it.each([
    ["fa", "در حال بارگذاری"],
    ["en", "Loading"],
    ["de", "Wird geladen"],
    ["es", "Cargando"],
  ] as const)("localizes the loading state in %s", (locale, loading) => {
    vi.mocked(careProfileService.get).mockReturnValue(new Promise(() => {}));
    vi.mocked(petsService.getMyAccess).mockReturnValue(new Promise(() => {}));
    renderWithIntl(<CareProfileView petId="pet-1" />, locale);
    expect(screen.getByLabelText(loading)).toBeTruthy();
  });

  it.each([
    ["fa", "مشکلی پیش آمد", "تلاش دوباره"],
    ["en", "Something went wrong", "Try again"],
    ["de", "Ein Fehler ist aufgetreten", "Erneut versuchen"],
    ["es", "Ha ocurrido un problema", "Reintentar"],
  ] as const)("localizes the retryable error state in %s", async (locale, title, retry) => {
    vi.mocked(careProfileService.get).mockRejectedValue(new Error("private backend detail"));
    vi.mocked(petsService.getMyAccess).mockResolvedValue(FULL_ACCESS);
    renderWithIntl(<CareProfileView petId="pet-1" />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: retry })).toBeTruthy();
    expect(screen.queryByText("private backend detail")).toBeNull();
  });

  it.each([
    ["fa", "ذخیرهٔ اطلاعات مراقبت انجام نشد. دوباره تلاش کنید.", "ویرایش پروفایل مراقبت", "ذخیره"],
    ["en", "We couldn't save the care profile. Please try again.", "Edit Care Profile", "Save"],
    ["de", "Das Pflegeprofil konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", "Pflegeprofil bearbeiten", "Speichern"],
    ["es", "No se pudo guardar el perfil de cuidados. Inténtalo de nuevo.", "Editar perfil de cuidados", "Guardar"],
  ] as const)("localizes the save error in %s", async (locale, saveError, edit, save) => {
    vi.mocked(careProfileService.get).mockResolvedValue(PROFILE);
    vi.mocked(petsService.getMyAccess).mockResolvedValue(FULL_ACCESS);
    vi.mocked(careProfileService.upsert).mockRejectedValue(new Error("private backend detail"));
    renderWithIntl(<CareProfileView petId="pet-1" />, locale);
    fireEvent.click(await screen.findByRole("button", { name: edit }));
    fireEvent.click(screen.getByRole("button", { name: save }));
    expect((await screen.findByRole("alert")).textContent).toContain(saveError);
    expect(screen.queryByText("private backend detail")).toBeNull();
  });
});
