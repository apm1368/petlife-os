import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class GetServiceAvailabilityDto {
  /** Required only when the service itself has no fixed locationId. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;

  /** Service option whose duration drives slot length. */
  @IsOptional()
  @IsUUID()
  variantId?: string;

  /** Pets in the booking: grooming, vet and training slots then span the duration × pets. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  petCount?: number;
}
