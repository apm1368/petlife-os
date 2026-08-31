import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { DietType } from "@petlife/types";

export class UpdateNutritionDto {
  @IsOptional()
  @IsEnum(DietType)
  dietType?: DietType;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  currentFoodText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  feedingFrequencyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  restrictionsText?: string;
}
