import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { ClinicalProblemStatus } from "@petlife/types";

export class CreateClinicalProblemDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  originatingVisitId?: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  bodySystem?: string;

  @IsOptional()
  @IsEnum(ClinicalProblemStatus)
  status?: ClinicalProblemStatus;

  @IsOptional()
  @IsDateString()
  onsetAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}

/** Status is the only mutable axis; `resolvedAt` is stamped by the service, never accepted from the client. */
export class UpdateClinicalProblemDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsEnum(ClinicalProblemStatus)
  status?: ClinicalProblemStatus;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;
}
