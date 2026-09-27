import { ArrayMaxSize, IsArray, IsDateString, IsOptional, IsUUID } from "class-validator";

export class CreateBookingHoldDto {
  @IsUUID()
  petId!: string;

  @IsUUID()
  providerId!: string;

  @IsUUID()
  locationId!: string;

  @IsUUID()
  serviceId!: string;

  /** Fixed-length-slot categories (VET/GROOMING/TRAINING/WALKING/PET_TAXI) — mutually exclusive with rangeStart/rangeEnd. */
  @IsOptional()
  @IsDateString()
  slotStart?: string;

  /** Date-range categories (SITTING/BOARDING) — check-in/check-out, mutually exclusive with slotStart. */
  @IsOptional()
  @IsDateString()
  rangeStart?: string;

  @IsOptional()
  @IsDateString()
  rangeEnd?: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  /** Extra pets from the same household for services that accept more than one. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsUUID(undefined, { each: true })
  additionalPetIds?: string[];
}
