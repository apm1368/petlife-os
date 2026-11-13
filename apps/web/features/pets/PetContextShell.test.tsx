import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderWithIntl } from "@/test/render-with-intl";
import enMessages from "@/messages/en.json";
import { usePetStore } from "@/stores/pet-store";
import { householdsService } from "@/services/households.service";
import { petsService } from "@/services/pets.service";
import { PetContextShell } from "./PetContextShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/fa/pets/cookie" }));
vi.mock("@/services/pets.service", () => ({ petsService: { getById: vi.fn(), getMyAccess: vi.fn() } }));
vi.mock("@/services/households.service", () => ({
  householdsService: { setActivePet: vi.fn(async () => undefined) },
}));

const pet = (id: string, name: string, photoUrl: string | null = null) =>
  ({
    id,
    name,
    species: "DOG",
    lifecycleStatus: "ACTIVE",
    breed: null,
    photoUrl,
    microchipNumber: null,
    latestWeightValue: null,
    latestWeightUnit: null,
  }) as never;

describe("PetContextShell — the pet on screen is the pet in context", () => {
  beforeEach(() => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("cookie", "Cookie"));
    vi.mocked(petsService.getMyAccess).mockResolvedValue({
      canViewHealth: true,
      canViewCareProfile: true,
      canEditIdentity: false,
    } as never);
    vi.mocked(householdsService.setActivePet).mockClear();
  });

  it("makes the viewed household pet active", async () => {
    usePetStore.setState({
      householdId: "h1",
      pets: [pet("pashmak", "Pashmak"), pet("cookie", "Cookie")],
      activePetId: "pashmak",
    });
    renderWithIntl(
      <PetContextShell petId="cookie">
        <p>overview</p>
      </PetContextShell>,
      "fa",
    );
    await waitFor(() => expect(householdsService.setActivePet).toHaveBeenCalledWith("h1", "cookie"));
    expect(usePetStore.getState().activePetId).toBe("cookie");
  });

  it("never activates a pet shared from another household", async () => {
    usePetStore.setState({ householdId: "h1", pets: [pet("pashmak", "Pashmak")], activePetId: "pashmak" });
    renderWithIntl(
      <PetContextShell petId="cookie">
        <p>overview</p>
      </PetContextShell>,
      "fa",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(householdsService.setActivePet).not.toHaveBeenCalled();
  });

  it("opens the selected pet's configured photo at a larger size from its profile", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(
      pet("cookie", "Cookie", "https://media.example.test/cookie.jpg"),
    );
    usePetStore.setState({
      householdId: "h1",
      pets: [pet("cookie", "Cookie", "https://media.example.test/cookie.jpg")],
      activePetId: "cookie",
    });
    renderWithIntl(
      <PetContextShell petId="cookie">
        <p>overview</p>
      </PetContextShell>,
      "en",
    );
    const photoButton = await screen.findByRole("button", { name: "View larger photo of Cookie" });
    fireEvent.click(photoButton);
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("https://media.example.test/cookie.jpg");
  });

  it("clears the entire pet scope while a different pet is loading", async () => {
    let resolveMilo: ((value: never) => void) | undefined;
    vi.mocked(petsService.getById).mockImplementation((id) => {
      if (id === "milo")
        return new Promise((resolve) => {
          resolveMilo = resolve as (value: never) => void;
        });
      return Promise.resolve(pet("cookie", "Cookie"));
    });
    usePetStore.setState({
      householdId: "h1",
      pets: [pet("cookie", "Cookie"), pet("milo", "Milo")],
      activePetId: "cookie",
    });
    const view = renderWithIntl(
      <PetContextShell petId="cookie">
        <p>Cookie medical context</p>
      </PetContextShell>,
      "en",
    );
    expect(await screen.findByText("Cookie medical context")).toBeTruthy();

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PetContextShell petId="milo">
          <p>Milo medical context</p>
        </PetContextShell>
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Loading pet profile")).toBeTruthy();
    expect(screen.queryByText("Cookie")).toBeNull();
    expect(screen.queryByText("Cookie medical context")).toBeNull();

    resolveMilo?.(pet("milo", "Milo"));
    expect(await screen.findByText("Milo medical context")).toBeTruthy();
  });

  it.each([
    ["de", "Übersicht", "Hund"],
    ["es", "Resumen", "Perro"],
  ] as const)("localizes the pet identity shell in %s", async (locale, overviewLabel, speciesLabel) => {
    usePetStore.setState({ householdId: "h1", pets: [pet("cookie", "Cookie")], activePetId: "cookie" });
    renderWithIntl(
      <PetContextShell petId="cookie">
        <p>overview</p>
      </PetContextShell>,
      locale,
    );
    expect(
      await screen.findByRole("navigation", {
        name: locale === "de" ? "Bereiche des Haustierprofils" : "Secciones del perfil de la mascota",
      }),
    ).toBeTruthy();
    expect(screen.getByText(overviewLabel)).toBeTruthy();
    expect(screen.getByText(new RegExp(speciesLabel))).toBeTruthy();
  });
});

describe("PetContextShell — no active pet saved yet", () => {
  it("makes the viewed pet active instead of leaving the header on the first pet", async () => {
    vi.mocked(petsService.getById).mockResolvedValue(pet("cookie", "Cookie"));
    vi.mocked(petsService.getMyAccess).mockResolvedValue({
      canViewHealth: true,
      canViewCareProfile: true,
      canEditIdentity: false,
    } as never);
    vi.mocked(householdsService.setActivePet).mockClear();
    usePetStore.setState({
      householdId: "h1",
      pets: [pet("pashmak", "Pashmak"), pet("cookie", "Cookie")],
      activePetId: null,
    });
    renderWithIntl(
      <PetContextShell petId="cookie">
        <p>overview</p>
      </PetContextShell>,
      "fa",
    );
    await waitFor(() => expect(householdsService.setActivePet).toHaveBeenCalledWith("h1", "cookie"));
  });

  it("updates the hero as soon as an edit below saves (QA L11: weight stayed 'not recorded' until reload)", async () => {
    usePetStore.setState({ householdId: "h1", pets: [], activePetId: "cookie" });
    vi.mocked(petsService.getById).mockResolvedValue({ ...(pet("cookie", "Cookie") as object), updatedAt: "2026-11-12T10:00:00.000Z" } as never);
    renderWithIntl(
      <PetContextShell petId="cookie">
        <p>overview</p>
      </PetContextShell>,
      "en",
    );
    await screen.findByText("Weight");
    const weight = () => screen.getByText("Weight").nextElementSibling?.textContent;
    expect(weight()).toBe("Not recorded");
    act(() => usePetStore.getState().upsertPet({ ...(pet("cookie", "Cookie") as object), latestWeightValue: "12.5", latestWeightUnit: "KG", updatedAt: "2026-11-12T10:05:00.000Z" } as never));
    await waitFor(() => expect(weight()).toBe("12.5 kg"));
  });
});
