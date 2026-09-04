import { IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { DietType } from "@petlife/types";

/** spec: "do not silently treat commerce product recommendations as clinical prescriptions" — recommendedFoodText is always free text, never a Shop product reference. */
export class CreateClinicalNutritionPlanDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  goal?: string;

  @IsOptional()
  @IsEnum(DietType)
  dietType?: DietType;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  recommendedFoodText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  dailyAmountText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  frequencyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  restrictionsText?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}
