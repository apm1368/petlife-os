import { create } from "zustand";
import type { PetDto } from "@petlife/types";

interface PetState {
  householdId: string | null;
  pets: PetDto[];
  activePetId: string | null;
  setHousehold: (householdId: string) => void;
  setPets: (pets: PetDto[]) => void;
  setActivePetId: (petId: string | null) => void;
  upsertPet: (pet: PetDto) => void;
}

/**
 * Single source of truth for "what pet is active" on the client — Home,
 * My Pets, and the ActivePetSwitcher all read/write this store so a switch
 * is reflected everywhere immediately, with no full page reload.
 */
export const usePetStore = create<PetState>((set) => ({
  householdId: null,
  pets: [],
  activePetId: null,
  setHousehold: (householdId) => set({ householdId }),
  setPets: (pets) => set({ pets }),
  setActivePetId: (petId) => set({ activePetId: petId }),
  upsertPet: (pet) =>
    set((state) => {
      const exists = state.pets.some((p) => p.id === pet.id);
      return { pets: exists ? state.pets.map((p) => (p.id === pet.id ? pet : p)) : [...state.pets, pet] };
    }),
}));
