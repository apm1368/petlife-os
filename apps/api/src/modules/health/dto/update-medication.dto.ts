import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";
import { MedicationStatus } from "@petlife/types";

export class UpdateMedicationDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dosage?: number | null;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  unit?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  frequencyText?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  route?: string | null;

  @IsOptional()
  @IsEnum(MedicationStatus)
  status?: MedicationStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  instructions?: string | null;
}
