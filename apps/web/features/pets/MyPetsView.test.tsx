import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PetDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { householdsService } from "@/services/households.service";
import { usePetStore } from "@/stores/pet-store";
import { MyPetsView } from "./MyPetsView";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/households.service", () => ({ householdsService: { setActivePet: vi.fn() } }));
const pets = [{ id: "p1", name: "Cookie", species: "DOG", breed: null, photoUrl: null, lifecycleStatus: "ACTIVE" }, { id: "p2", name: "Pistachio", species: "CAT", breed: null, photoUrl: null, lifecycleStatus: "ACTIVE" }] as PetDto[];
describe("My pets", () => {
 beforeEach(() => { vi.resetAllMocks(); usePetStore.setState({ householdId: "h1", pets, activePetId: "p1" }); });
 it("keeps selection and profile navigation separate", async () => {
  vi.mocked(householdsService.setActivePet).mockResolvedValue({} as never);
  renderWithIntl(<MyPetsView />, "en");
  fireEvent.click(screen.getByRole("button", { name: "Set as active" }));
  await waitFor(() => expect(householdsService.setActivePet).toHaveBeenCalledWith("h1", "p2"));
  expect(usePetStore.getState().activePetId).toBe("p2"); expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Open profile" })[1]!);
  expect(push).toHaveBeenCalledWith("/en/pets/p2");
 });
 it("restores the previous selection and reports a failed save without retrying automatically", async () => {
  vi.mocked(householdsService.setActivePet).mockRejectedValue(new Error("offline"));
  renderWithIntl(<MyPetsView />, "en");
  fireEvent.click(screen.getByRole("button", { name: "Set as active" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Your previous selection was kept");
  expect(usePetStore.getState().activePetId).toBe("p1");
  expect(householdsService.setActivePet).toHaveBeenCalledTimes(1);expect(push).not.toHaveBeenCalled();
 });
 it("prevents another selection while saving", async () => {
  let resolve!: (v: never) => void;
  vi.mocked(householdsService.setActivePet).mockImplementation(() => new Promise(r => { resolve = r; }));
  renderWithIntl(<MyPetsView />, "en");fireEvent.click(screen.getByRole("button", { name: "Set as active" }));
  expect((screen.getByRole("button", { name: "Set as active" }) as HTMLButtonElement).disabled).toBe(true);
  resolve({} as never);await waitFor(() => expect((screen.getByRole("button", { name: "Set as active" }) as HTMLButtonElement).disabled).toBe(false));
 });
 it("shows a genuine empty household with the existing add-pet action", () => {
  usePetStore.setState({ pets: [], activePetId: null });renderWithIntl(<MyPetsView />, "en");
  expect(screen.getByRole("heading", { name: "No pets have been added to this household yet." })).toBeTruthy();
  expect(screen.queryByRole("list")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add pet" }));expect(push).toHaveBeenCalledWith("/en/pets/new");
 });
});
