import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Length, Min } from "class-validator";
import { MedicationStatus } from "@petlife/types";

export class CreateMedicationDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dosage?: number;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  unit?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  frequencyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  route?: string;

  @IsOptional()
  @IsEnum(MedicationStatus)
  status?: MedicationStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  instructions?: string;
}
