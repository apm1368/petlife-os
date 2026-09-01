import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";
import { PetSpecies, ServiceCategory } from "@petlife/types";

export class SearchServicesDto {
  @IsOptional()
  @IsIn(Object.values(ServiceCategory))
  category?: ServiceCategory;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(Object.values(PetSpecies))
  species?: PetSpecies;

  /** Query params arrive as strings; "false" is the only way to opt out of the VERIFIED-only default. */
  @IsOptional()
  @IsIn(["true", "false"])
  verifiedOnly?: "true" | "false";

  @IsOptional()
  @IsString()
  search?: string;

  /** Used only for compatibility checks — never widens or narrows who can call this endpoint. */
  @IsOptional()
  @IsUUID()
  petId?: string;
}
