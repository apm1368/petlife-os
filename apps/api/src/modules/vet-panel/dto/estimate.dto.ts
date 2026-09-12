import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Min, ValidateNested } from "class-validator";

/** Integer IRR only — the same rule every financial surface in this codebase follows since Handoff 06. Toman is computed for display, never stored or accepted. */
export class ClinicalEstimateLineInputDto {
  @IsString()
  @Length(1, 200)
  description!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsInt()
  @Min(0)
  unitLowIrr!: number;

  @IsInt()
  @Min(0)
  unitHighIrr!: number;
}

export class CreateClinicalEstimateDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ClinicalEstimateLineInputDto)
  lines!: ClinicalEstimateLineInputDto[];
}

/** Replaces the whole line set — a DRAFT estimate is a working document, so partial line patching would only add ambiguity. Rejected once the estimate has been presented. */
export class UpdateClinicalEstimateDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ClinicalEstimateLineInputDto)
  lines?: ClinicalEstimateLineInputDto[];
}

export class PresentClinicalEstimateDto {
  @IsUUID()
  petId!: string;
}

export class RespondToClinicalEstimateDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  declineReason?: string;
}
