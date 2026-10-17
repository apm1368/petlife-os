import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class RescheduleBookingDto {
  @IsDateString()
  slotStart!: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;
}
