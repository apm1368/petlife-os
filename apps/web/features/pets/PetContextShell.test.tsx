import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { usePetStore } from "@/stores/pet-store";
import { householdsService } from "@/services/households.service";
import { petsService } from "@/services/pets.service";
import { PetContextShell } from "./PetContextShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/fa/pets/cookie" }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), getMyAccess: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { setActivePet: vi.fn(async () => undefined) } }));

const pet = (id: string, name: string, photoUrl: string | null = null) => ({ id, name, species: "DOG", lifecycleStatus: "ACTIVE", breed: null, photoUrl, microchipNumber: null, latestWeightValue: null, latestWeightUnit: null }) as never;

describe("PetContextShell — the pet on screen is the pet in context", () => {
  beforeEach(() => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("cookie", "Cookie"));
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewHealth: true, canViewCareProfile: true, canEditIdentity: false } as never);
    vi.mocked(householdsService.setActivePet).mockClear();
  });

  it("makes the viewed household pet active", async () => {
    usePetStore.setState({ householdId: "h1", pets: [pet("pashmak", "Pashmak"), pet("cookie", "Cookie")], activePetId: "pashmak" });
    renderWithIntl(<PetContextShell petId="cookie"><p>overview</p></PetContextShell>, "fa");
    await waitFor(() => expect(householdsService.setActivePet).toHaveBeenCalledWith("h1", "cookie"));
    expect(usePetStore.getState().activePetId).toBe("cookie");
  });

  it("never activates a pet shared from another household", async () => {
    usePetStore.setState({ householdId: "h1", pets: [pet("pashmak", "Pashmak")], activePetId: "pashmak" });
    renderWithIntl(<PetContextShell petId="cookie"><p>overview</p></PetContextShell>, "fa");
    await new Promise((r) => setTimeout(r, 50));
    expect(householdsService.setActivePet).not.toHaveBeenCalled();
  });

  it("opens the selected pet's configured photo at a larger size from its profile", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("cookie", "Cookie", "https://media.example.test/cookie.jpg"));
    usePetStore.setState({ householdId: "h1", pets: [pet("cookie", "Cookie", "https://media.example.test/cookie.jpg")], activePetId: "cookie" });
    renderWithIntl(<PetContextShell petId="cookie"><p>overview</p></PetContextShell>, "en");
    const photoButton = await screen.findByRole("button", { name: "View larger photo of Cookie" });
    fireEvent.click(photoButton);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://media.example.test/cookie.jpg");
  });
});

describe("PetContextShell — no active pet saved yet", () => {
  it("makes the viewed pet active instead of leaving the header on the first pet", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("cookie", "Cookie"));
    vi.mocked(petsService.getMyAccess).mockResolvedValue({ canViewHealth: true, canViewCareProfile: true, canEditIdentity: false } as never);
    vi.mocked(householdsService.setActivePet).mockClear();
    usePetStore.setState({ householdId: "h1", pets: [pet("pashmak", "Pashmak"), pet("cookie", "Cookie")], activePetId: null });
    renderWithIntl(<PetContextShell petId="cookie"><p>overview</p></PetContextShell>, "fa");
    await waitFor(() => expect(householdsService.setActivePet).toHaveBeenCalledWith("h1", "cookie"));
  });
});
