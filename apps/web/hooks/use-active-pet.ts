"use client";

import { useCallback, useState } from "react";
import { householdsService } from "@/services/households.service";
import { usePetStore } from "@/stores/pet-store";

export function useActivePet() {
  const householdId = usePetStore((s) => s.householdId);
  const pets = usePetStore((s) => s.pets);
  const activePetId = usePetStore((s) => s.activePetId);
  const setActivePetId = usePetStore((s) => s.setActivePetId);
  const [isSwitching, setIsSwitching] = useState(false);

  const switchActivePet = useCallback(
    async (petId: string) => {
      if (!householdId || petId === activePetId) return;
      setIsSwitching(true);
      const previous = activePetId;
      setActivePetId(petId); // optimistic — switching feels instant, no reload
      try {
        await householdsService.setActivePet(householdId, petId);
      } catch (error) {
        setActivePetId(previous);
        throw error;
      } finally {
        setIsSwitching(false);
      }
    },
    [householdId, activePetId, setActivePetId],
  );

  const activePet = pets.find((pet) => pet.id === activePetId) ?? null;

  return { householdId, pets, activePet, activePetId, switchActivePet, isSwitching };
}
