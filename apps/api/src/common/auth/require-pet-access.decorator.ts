import { SetMetadata } from "@nestjs/common";
import type { PetAccessFlags } from "@petlife/types";

export const PET_ACCESS_KEY = "petAccessFlag";

/** Marks a handler as requiring a specific PetAccess boolean flag for the `:petId` route param. */
export const RequirePetAccess = (flag: keyof PetAccessFlags) => SetMetadata(PET_ACCESS_KEY, flag);
