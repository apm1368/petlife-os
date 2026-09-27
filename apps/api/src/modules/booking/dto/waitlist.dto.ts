import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class JoinWaitlistDto {
  @IsUUID()
  petId!: string;

  @IsUUID()
  providerId!: string;

  @IsUUID()
  serviceId!: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsDateString()
  windowStart!: string;

  @IsDateString()
  windowEnd!: string;
}
