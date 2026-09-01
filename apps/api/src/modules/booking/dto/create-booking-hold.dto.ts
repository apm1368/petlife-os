import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class CreateBookingHoldDto {
  @IsUUID()
  petId!: string;

  @IsUUID()
  providerId!: string;

  @IsUUID()
  locationId!: string;

  @IsUUID()
  serviceId!: string;

  @IsDateString()
  slotStart!: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;
}
