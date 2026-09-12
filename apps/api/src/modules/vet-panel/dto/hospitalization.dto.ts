import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateNested } from "class-validator";
import { TreatmentTaskStatus, TreatmentTaskType, TriageLevel } from "@petlife/types";

export class AdmitPatientDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsString()
  @Length(1, 500)
  reasonForAdmission!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  kennelLabel?: string;

  @IsOptional()
  @IsEnum(TriageLevel)
  triageLevel?: TriageLevel;

  @IsOptional()
  @IsDateString()
  estimatedDischargeAt?: string;
}

export class UpdateHospitalizationDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  kennelLabel?: string;

  @IsOptional()
  @IsEnum(TriageLevel)
  triageLevel?: TriageLevel;

  @IsOptional()
  @IsDateString()
  estimatedDischargeAt?: string;
}

export class DischargePatientDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  dischargeNote?: string;
}

export class CreateTreatmentTaskDto {
  @IsEnum(TreatmentTaskType)
  type!: TreatmentTaskType;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  detail?: string;

  @IsOptional()
  @IsUUID()
  prescriptionId?: string;

  @IsDateString()
  scheduledAt!: string;
}

/**
 * Scheduling a repeating treatment (q8h fluids for three days) is the single
 * most common action on a treatment sheet, so it is one request that expands
 * server-side into individual TreatmentTask rows — each row still stands
 * alone and is actioned independently, exactly as if it had been typed by
 * hand. There is no stored "recurrence rule": expanding once and storing real
 * rows keeps the sheet a factual record rather than a projection that could
 * silently change under a nurse mid-stay.
 */
export class ScheduleTreatmentSeriesDto {
  @IsUUID()
  petId!: string;

  @IsEnum(TreatmentTaskType)
  type!: TreatmentTaskType;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  detail?: string;

  @IsOptional()
  @IsUUID()
  prescriptionId?: string;

  @IsDateString()
  startAt!: string;

  @IsInt()
  @Min(1)
  @Max(24)
  everyHours!: number;

  @IsInt()
  @Min(1)
  @Max(96)
  occurrences!: number;
}

export class CreateTreatmentTasksDto {
  @IsUUID()
  petId!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateTreatmentTaskDto)
  tasks!: CreateTreatmentTaskDto[];
}

/** DONE/SKIPPED/MISSED only — a task can never be moved back to SCHEDULED, since that would erase a recorded act of care. */
export class CompleteTreatmentTaskDto {
  @IsUUID()
  petId!: string;

  @IsEnum(TreatmentTaskStatus)
  status!: TreatmentTaskStatus;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  outcomeNote?: string;
}
