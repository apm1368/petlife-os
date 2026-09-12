import { IsDateString, IsOptional, IsString, Length } from "class-validator";

export class UpsertDischargeSummaryDto {
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  summaryText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  homeCareInstructions?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  medicationsSummary?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  warningSignsText?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  followUpInstructions?: string;
}
