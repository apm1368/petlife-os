import { IsDateString, IsOptional, IsUUID } from "class-validator";

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
}
