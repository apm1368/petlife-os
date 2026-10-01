import { PetLifecycleStatus, type PetDto } from "@petlife/types";
import { Avatar } from "./Avatar";
import { StatusLabel, type StatusTone } from "./StatusLabel";
import { cn } from "./cn";

export interface PetIdentityProps {
  pet: Pick<PetDto, "name" | "species" | "breed" | "photoUrl" | "lifecycleStatus">;
  isActive?: boolean;
  size?: "sm" | "md" | "lg";
  /** Localized text from the app (this package has no i18n): the "active" tag, species and lifecycle words. */
  labels: { active: string; species: string; lifecycle: string };
  className?: string;
}

const lifecycleTone: Record<PetLifecycleStatus, StatusTone> = {
  [PetLifecycleStatus.ACTIVE]: "success",
  [PetLifecycleStatus.LOST]: "emergency",
  [PetLifecycleStatus.TEMPORARILY_TRANSFERRED]: "attention",
  [PetLifecycleStatus.DECEASED]: "neutral",
  [PetLifecycleStatus.MEMORIAL]: "neutral",
};

export function PetIdentity({ pet, isActive, size = "md", className, labels }: PetIdentityProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Avatar src={pet.photoUrl} name={pet.name} size={size} />
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-section-title text-text-primary">{pet.name}</span>
          {isActive ? <StatusLabel tone="success">{labels.active}</StatusLabel> : null}
        </div>
        <span className="text-metadata text-text-secondary">
          {pet.breed ? `${pet.breed}` : labels.species}
        </span>
        {pet.lifecycleStatus !== PetLifecycleStatus.ACTIVE ? (
          <StatusLabel tone={lifecycleTone[pet.lifecycleStatus]} className="mt-1 w-fit">
            {labels.lifecycle}
          </StatusLabel>
        ) : null}
      </div>
    </div>
  );
}
