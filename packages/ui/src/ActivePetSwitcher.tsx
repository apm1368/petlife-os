import type { PetDto } from "@petlife/types";
import { Avatar } from "./Avatar";
import { cn } from "./cn";

export interface ActivePetSwitcherProps {
  pets: Pick<PetDto, "id" | "name" | "photoUrl">[];
  activePetId: string | null;
  onSelect: (petId: string) => void;
  className?: string;
}

/** Horizontal pet-avatar strip. Selecting a pet updates active pet without a page reload. */
export function ActivePetSwitcher({ pets, activePetId, onSelect, className }: ActivePetSwitcherProps) {
  return (
    <div role="tablist" aria-label="Switch active pet" className={cn("flex gap-3 overflow-x-auto", className)}>
      {pets.map((pet) => {
        const active = pet.id === activePetId;
        return (
          <button
            key={pet.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(pet.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md p-1.5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              active ? "ring-2 ring-brand-mint" : "opacity-70 hover:opacity-100",
            )}
          >
            <Avatar src={pet.photoUrl} name={pet.name} size="md" />
            <span className="max-w-[4.5rem] truncate text-metadata text-text-primary">{pet.name}</span>
          </button>
        );
      })}
    </div>
  );
}
