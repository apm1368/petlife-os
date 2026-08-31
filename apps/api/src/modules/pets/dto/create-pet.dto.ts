import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from "class-validator";
import { NeuteredStatus, PetSex, PetSpecies, WeightUnit } from "@petlife/types";

export class CreatePetDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsEnum(PetSpecies)
  species!: PetSpecies;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  breed?: string;

  @IsOptional()
  @IsEnum(PetSex)
  sex?: PetSex;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  approximateAgeMonths?: number;

  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  latestWeightValue?: number;

  @IsOptional()
  @IsEnum(WeightUnit)
  latestWeightUnit?: WeightUnit;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  colorMarkings?: string;

  @IsOptional()
  @IsEnum(NeuteredStatus)
  neuteredStatus?: NeuteredStatus;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  microchipNumber?: string;

  // birthDate OR approximateAgeMonths is required — enforced in PetsService, not here,
  // since class-validator's cross-field validation reads awkwardly for an either/or rule.
}
