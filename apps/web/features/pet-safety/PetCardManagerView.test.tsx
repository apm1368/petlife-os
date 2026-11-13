import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { petsService } from "@/services/pets.service";
import { petSafetyService } from "@/services/pet-safety.service";
import { PetCardManagerView } from "./PetCardManagerView";

vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), getMyAccess: vi.fn() } }));
vi.mock("@/services/pet-safety.service", async (original) => ({
  ...(await original<typeof import("@/services/pet-safety.service")>()),
  petSafetyService: { listCards: vi.fn(), createIdTagCard: vi.fn(), revokeCard: vi.fn() },
}));

const card = (over: Record<string, unknown> = {}) => ({
  id: "c1", kind: "ID_TAG", state: "ACTIVE", tokenHint: "Zx_9", visibleFields: ["SPECIES"], contactMode: "IN_APP",
  expiresAt: null, revokedAt: null, lastAccessedAt: null, accessCount: 3, createdAt: "2026-11-10T08:00:00.000Z", ...over,
});

describe("pet card and QR (QA M9)", () => {
  beforeEach(() => {
    vi.mocked(petsService.getById).mockReset().mockResolvedValue({ id: "p1", name: "Cookie" } as never);
    vi.mocked(petsService.getMyAccess).mockReset().mockResolvedValue({ canManageAccess: true, canViewHealth: false } as never);
    vi.mocked(petSafetyService.listCards).mockReset().mockResolvedValue([]);
    vi.mocked(petSafetyService.createIdTagCard).mockReset();
    vi.mocked(petSafetyService.revokeCard).mockReset().mockResolvedValue({ revoked: true });
  });

  it("shows what a finder will see before creating, then the QR and the one-time link", async () => {
    vi.mocked(petSafetyService.createIdTagCard).mockResolvedValue({ ...card(), token: "TOKEN_abcdefghijklmnopqrstuvwxyz", publicPath: "/pet-card/TOKEN_abcdefghijklmnopqrstuvwxyz" } as never);
    renderWithIntl(<PetCardManagerView petId="p1" />);
    const preview = await screen.findByRole("region", { name: "Anyone who scans the code sees" });
    expect(within(preview).getByText("Name: Cookie")).toBeTruthy();
    expect(within(preview).getByText("Breed")).toBeTruthy();
    expect(screen.getByText(/the microchip number/)).toBeTruthy();
    // No health fields without health access.
    expect(screen.queryByLabelText("Allergies")).toBeNull();
    fireEvent.click(screen.getByLabelText("Breed"));
    expect(within(preview).queryByText("Breed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create card and QR code" }));
    await waitFor(() => expect(petSafetyService.createIdTagCard).toHaveBeenCalledWith("p1", ["PHOTO", "SPECIES", "SEX", "AGE", "MICROCHIP_STATUS"]));
    expect(await screen.findByRole("img", { name: "QR code for Cookie's card" })).toBeTruthy();
    expect(screen.getByText(`${window.location.origin}/pet-card/TOKEN_abcdefghijklmnopqrstuvwxyz`)).toBeTruthy();
    expect(screen.getByText(/shown only now/)).toBeTruthy();
  });

  it("offers health fields only to someone who may see the pet's health", async () => {
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canManageAccess: true, canViewHealth: true } as never);
    renderWithIntl(<PetCardManagerView petId="p1" />, "fa");
    const allergies = (await screen.findByLabelText("حساسیت‌ها")) as HTMLInputElement;
    expect(allergies.checked).toBe(false);
  });

  it("revokes an active card after a confirmation", async () => {
    vi.mocked(petSafetyService.listCards).mockResolvedValueOnce([card()] as never).mockResolvedValue([card({ state: "REVOKED" })] as never);
    renderWithIntl(<PetCardManagerView petId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke card" }));
    expect(petSafetyService.revokeCard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, revoke this card" }));
    await waitFor(() => expect(petSafetyService.revokeCard).toHaveBeenCalledWith("p1", "c1"));
    expect(await screen.findByText("The card is revoked and its code no longer opens.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create card and QR code" })).toBeTruthy();
  });

  it("explains who may create a card instead of showing the form", async () => {
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canManageAccess: false, canViewHealth: true } as never);
    renderWithIntl(<PetCardManagerView petId="p1" />, "de");
    expect(await screen.findByText("Nur wer die Zugriffe auf dieses Tier verwaltet, kann eine Karte erstellen.")).toBeTruthy();
    expect(petSafetyService.listCards).not.toHaveBeenCalled();
  });
});
