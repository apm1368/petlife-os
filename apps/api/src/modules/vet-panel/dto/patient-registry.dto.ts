import { Type } from "class-transformer";
import { IsBooleanString, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { PatientAccessState, PetSpecies } from "@petlife/types";

export class ListProviderPatientsQueryDto {
  /** Free text matched against pet name, microchip, and owner display name. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  species?: PetSpecies;

  @IsOptional()
  @IsEnum(PatientAccessState)
  accessState?: PatientAccessState;

  @IsOptional()
  @IsBooleanString()
  hospitalizedOnly?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
