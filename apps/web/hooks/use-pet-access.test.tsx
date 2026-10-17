import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PetAccessFlags } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetAccess } from "./use-pet-access";
vi.mock("@/services/pets.service", () => ({ petsService: { getMyAccess: vi.fn() } }));
it("does not leak permissions across pets when the old request finishes late", async () => {
  let oldResolve!: (value: PetAccessFlags) => void;
  let newResolve!: (value: PetAccessFlags) => void;
  vi.mocked(petsService.getMyAccess)
    .mockImplementationOnce(() => new Promise(resolve => { oldResolve = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { newResolve = resolve; }));
  const { result, rerender } = renderHook(({ id }) => usePetAccess(id), { initialProps: { id: "old-pet" } });
  rerender({ id: "new-pet" });
  expect(result.current.access).toBeNull();
  await act(async () => { oldResolve({ canViewHealth: true } as PetAccessFlags); });
  expect(result.current.access).toBeNull();
  await act(async () => { newResolve({ canViewHealth: false } as PetAccessFlags); });
  expect(result.current.access?.canViewHealth).toBe(false);
});
