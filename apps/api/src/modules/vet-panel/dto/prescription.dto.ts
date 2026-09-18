import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from "class-validator";
import { PrescriptionRoute } from "@petlife/types";

/**
 * `doseAmount` is whatever the prescriber typed. The panel's mg/kg helper is
 * an advisory client-side calculation the vet must confirm and re-enter — no
 * server code ever computes a dose from a weight (Handoff 17's "do not invent
 * medical interpretation" rule applies to arithmetic that would carry
 * clinical authority, not just to diagnosis).
 */
export class CreatePrescriptionDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsString()
  @Length(1, 200)
  drugName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  strength?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  form?: string;

  @IsOptional()
  @IsEnum(PrescriptionRoute)
  route?: PrescriptionRoute;

  @IsOptional()
  @IsNumber()
  @Min(0)
  doseAmount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  doseUnit?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  frequencyText?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityDispensed?: number;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  quantityUnit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24)
  refillsAuthorized?: number;

  @IsOptional()
  @IsBoolean()
  isControlledSubstance?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  instructionsForOwner?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  internalNotes?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  /**
   * When true the service also creates the matching Medication row so the
   * owner's existing medication list reflects the prescription. Defaults to
   * true — a prescription the owner never sees in their medication list is
   * the more surprising outcome.
   */
  @IsOptional()
  @IsBoolean()
  createMedicationRecord?: boolean;
}

export class CancelPrescriptionDto {
  @IsUUID()
  petId!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class DispenseRefillDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  note?: string;
}
