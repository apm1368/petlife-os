import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Min } from "class-validator";
import { MedicalDocumentType } from "@petlife/types";

export class RequestMedicalDocumentUploadDto {
  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;
}

export class CreateMedicalDocumentDto {
  @IsString()
  key!: string;

  @IsEnum(MedicalDocumentType)
  documentType!: MedicalDocumentType;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  description?: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  @IsOptional()
  @IsString()
  recordedAt?: string;

  @IsOptional()
  @IsUUID()
  relatedVisitId?: string;

  @IsOptional()
  @IsUUID()
  relatedLabResultId?: string;

  @IsOptional()
  @IsUUID()
  relatedImagingStudyId?: string;

  @IsOptional()
  @IsUUID()
  relatedReferralId?: string;
}

export class VoidMedicalDocumentDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
