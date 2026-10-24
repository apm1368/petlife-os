import { IsDateString, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from "class-validator";

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

export class WaitlistOfferDto {
  @IsISO8601({ strict: true }) startAt!: string;
  @IsOptional() @IsUUID() providerUserId?: string;
  @IsOptional() @IsInt() @Min(15) @Max(1440) expiresInMinutes?: number;
}
