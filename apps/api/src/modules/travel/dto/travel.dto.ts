import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Min } from "class-validator";
import { TravelMode, TravelRequirementStatus, TravelRequirementType, TripStatus } from "@petlife/types";

export class CreateTripDto {
  @IsString()
  @Length(1, 100)
  originCountry!: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  originCity?: string;

  @IsString()
  @Length(1, 100)
  destinationCountry!: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  destinationCity?: string;

  @IsDateString()
  departAt!: string;

  @IsOptional()
  @IsDateString()
  returnAt?: string;

  @IsOptional()
  @IsEnum(TravelMode)
  travelMode?: TravelMode;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

export class UpdateTripDto {
  @IsOptional()
  @IsString()
  @Length(0, 100)
  originCity?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  destinationCity?: string;

  @IsOptional()
  @IsDateString()
  departAt?: string;

  @IsOptional()
  @IsDateString()
  returnAt?: string;

  @IsOptional()
  @IsEnum(TravelMode)
  travelMode?: TravelMode;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}

/** Every transition is an explicit household action — spec: "do not infer readiness from one field" — never computed automatically from the requirements checklist. */
export class TransitionTripDto {
  @IsEnum(TripStatus)
  status!: TripStatus;
}

export class CreateTravelRequirementDto {
  @IsEnum(TravelRequirementType)
  requirementType!: TravelRequirementType;

  @IsOptional()
  @IsEnum(TravelRequirementStatus)
  status?: TravelRequirementStatus;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  source?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class UpdateTravelRequirementDto {
  @IsOptional()
  @IsEnum(TravelRequirementStatus)
  status?: TravelRequirementStatus;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  source?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  jurisdiction?: string;

  /** Setting this always sets verifiedAt to now — see TravelRequirementService.update()'s own doc comment. Never backend-inferred from any other change. */
  @IsOptional()
  @IsBoolean()
  markVerified?: boolean;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  /** Must reference an existing MedicalDocument belonging to the trip's own pet — reuses the existing H17 upload/create endpoints, never a parallel upload path. Pass null to unlink. */
  @IsOptional()
  @IsUUID()
  linkedMedicalDocumentId?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class RequestTravelDocumentUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}
