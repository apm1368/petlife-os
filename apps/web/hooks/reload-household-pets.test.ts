import { beforeEach, describe, expect, it, vi } from "vitest";
import { householdsService } from "@/services/households.service";
import { usePetStore } from "@/stores/pet-store";
import { reloadHouseholdPets } from "./use-app-bootstrap";

vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn(), listPets: vi.fn(), getActivePet: vi.fn() } }));

describe("reloadHouseholdPets (QA L11: Home said 'add your first pet' right after onboarding)", () => {
  beforeEach(() => usePetStore.setState({ householdId: null, pets: [], activePetId: null }));

  it("puts the pet created during onboarding into the store before Home renders", async () => {
    vi.mocked(householdsService.listMine).mockResolvedValue([{ id: "h1" }] as never);
    vi.mocked(householdsService.listPets).mockResolvedValue([{ id: "p1", name: "Cookie" }] as never);
    vi.mocked(householdsService.getActivePet).mockResolvedValue({ id: "p1" } as never);
    await reloadHouseholdPets();
    expect(usePetStore.getState()).toMatchObject({ householdId: "h1", pets: [{ id: "p1", name: "Cookie" }], activePetId: "p1" });
  });

  it("leaves the store alone when there is no household yet", async () => {
    vi.mocked(householdsService.listMine).mockResolvedValue([] as never);
    await reloadHouseholdPets();
    expect(usePetStore.getState().pets).toEqual([]);
  });
});
