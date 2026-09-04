import { IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { ImagingStudyType } from "@petlife/types";

export class CreateImagingStudyDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsEnum(ImagingStudyType)
  studyType!: ImagingStudyType;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  bodyRegion?: string;

  @IsOptional()
  @IsString()
  performedAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  report?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  findings?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  recommendation?: string;
}

export class VoidImagingStudyDto {
  /** Required so PetAccessGuard can authorize this action — ImagingStudyService double-checks it against the study's actual petId. */
  @IsUUID()
  petId!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;
}
