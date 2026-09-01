import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class GetAvailabilityDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  serviceId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  /** Used only for compatibility/species checks — never widens or narrows who can call this endpoint. */
  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;
}
