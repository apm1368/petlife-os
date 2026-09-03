import { IsOptional, IsString, Length } from "class-validator";

/** No scoring engine (spec: "do not introduce scoring unless clinically justified") — every field here is free text. */
export class CreateSeniorCareNoteDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  mobilityNotes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  cognitionNotes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  medicationComplexityNotes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  monitoringFrequencyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  qualityOfLifeNotes?: string;
}
