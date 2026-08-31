import { IsDateString, IsEnum, IsOptional, IsString, Length } from "class-validator";
import { VaccinationStatus } from "@petlife/types";

export class UpdateVaccinationSummaryDto {
  @IsEnum(VaccinationStatus)
  status!: VaccinationStatus;

  @IsOptional()
  @IsDateString()
  nextDueDate?: string;

  @IsOptional()
  @IsDateString()
  lastKnownDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  notes?: string;
}
