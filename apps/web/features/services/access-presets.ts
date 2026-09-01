import { PetAccessScopePreset, ServiceCategory } from "@petlife/types";

/** Mirrors DEFAULT_SCOPE_PRESET_BY_CATEGORY on the backend — shown to the user in the Care Sharing step before they confirm. */
export const DEFAULT_ACCESS_PRESET_BY_CATEGORY: Record<ServiceCategory, PetAccessScopePreset> = {
  [ServiceCategory.VET]: PetAccessScopePreset.HEALTH_BASICS,
  [ServiceCategory.GROOMING]: PetAccessScopePreset.GROOMING_BASIC,
  [ServiceCategory.TRAINING]: PetAccessScopePreset.TRAINING_BASIC,
  [ServiceCategory.WALKING]: PetAccessScopePreset.WALKING_BASIC,
  [ServiceCategory.SITTING]: PetAccessScopePreset.SITTING_BASIC,
  [ServiceCategory.BOARDING]: PetAccessScopePreset.BOARDING_BASIC,
  [ServiceCategory.PET_TAXI]: PetAccessScopePreset.TAXI_BASIC,
};
