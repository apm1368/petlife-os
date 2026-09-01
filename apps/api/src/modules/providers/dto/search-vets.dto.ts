import { IsIn, IsOptional, IsString } from "class-validator";
import { PetSpecies, ProviderServiceType } from "@petlife/types";

export class SearchVetsDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(Object.values(PetSpecies))
  species?: PetSpecies;

  @IsOptional()
  @IsIn(Object.values(ProviderServiceType))
  serviceType?: ProviderServiceType;

  /** Query params arrive as strings; "false" is the only way to opt out of the VERIFIED-only default. */
  @IsOptional()
  @IsIn(["true", "false"])
  verifiedOnly?: "true" | "false";

  @IsOptional()
  @IsString()
  search?: string;
}
