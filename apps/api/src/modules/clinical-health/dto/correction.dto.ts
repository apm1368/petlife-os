import { IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { CorrectableRecordType, MedicalRecordCorrectionStatus } from "@petlife/types";

export class CreateMedicalRecordCorrectionDto {
  @IsEnum(CorrectableRecordType)
  targetType!: CorrectableRecordType;

  @IsUUID()
  targetId!: string;

  @IsString()
  @Length(1, 2000)
  correctionText!: string;
}

export class ResolveMedicalRecordCorrectionDto {
  @IsEnum(MedicalRecordCorrectionStatus)
  status!: MedicalRecordCorrectionStatus;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  resolvedNote?: string;
}
