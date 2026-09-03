import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { LabResultFlag } from "@petlife/types";

/** No `status`/`flag` here beyond the explicit provider-set flag — spec: "do not invent medical interpretation." */
export class CreateLabResultDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsString()
  @Length(1, 200)
  testName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  testCode?: string;

  @IsOptional()
  @IsString()
  sampleDate?: string;

  @IsOptional()
  @IsString()
  resultDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  value?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  unit?: string;

  @IsOptional()
  @IsNumber()
  referenceRangeLow?: number;

  @IsOptional()
  @IsNumber()
  referenceRangeHigh?: number;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  qualitativeResult?: string;

  /** Only ever set by an explicit provider choice — never derived. */
  @IsOptional()
  @IsEnum(LabResultFlag)
  flag?: LabResultFlag;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

/** Append/supersede, never edit-in-place — see LabResultService.amend(). */
export class AmendLabResultDto extends CreateLabResultDto {}
