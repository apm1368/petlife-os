import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { DentalRecordType } from "@petlife/types";

export class CreateDentalRecordDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsEnum(DentalRecordType)
  recordType!: DentalRecordType;

  @IsOptional()
  @IsString()
  performedAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  findings?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  followUpRecommended?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  followUpNotes?: string;
}
