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
import { NeuteredStatus, PetSex, WeightUnit } from "@petlife/types";

export class UpdatePetDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  breed?: string | null;

  @IsOptional()
  @IsEnum(PetSex)
  sex?: PetSex | null;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(600)
  approximateAgeMonths?: number | null;

  @IsOptional()
  @IsUrl()
  photoUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  latestWeightValue?: number | null;

  @IsOptional()
  @IsEnum(WeightUnit)
  latestWeightUnit?: WeightUnit | null;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  colorMarkings?: string | null;

  @IsOptional()
  @IsEnum(NeuteredStatus)
  neuteredStatus?: NeuteredStatus | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  microchipNumber?: string | null;
}
