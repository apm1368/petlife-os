import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { HydrationStatus, MucousMembraneColor, TriageLevel, WeightUnit } from "@petlife/types";

/**
 * Bounds here are *representability* limits, not clinical judgement: they
 * reject a value the column or the named scale cannot express (a BCS of 12 on
 * a 1-9 scale, a negative heart rate), and deliberately stay wide enough that
 * a genuinely alarming-but-real measurement is always recordable. This
 * codebase never refuses to record what a clinician says they measured.
 */
export class CreateVitalsDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsOptional()
  @IsUUID()
  hospitalizationId?: string;

  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999)
  weightValue?: number;

  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  temperatureC?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  heartRateBpm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  respiratoryRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  capillaryRefillSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(400)
  systolicBloodPressure?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  oxygenSaturationPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2000)
  bloodGlucoseMgDl?: number;

  @IsOptional()
  @IsEnum(MucousMembraneColor)
  mucousMembraneColor?: MucousMembraneColor;

  @IsOptional()
  @IsEnum(HydrationStatus)
  hydrationStatus?: HydrationStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  bodyConditionScore?: number;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  bodyConditionScale?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  painScore?: number;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  painScale?: string;

  @IsOptional()
  @IsEnum(TriageLevel)
  triageLevel?: TriageLevel;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

export class ListVitalsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
