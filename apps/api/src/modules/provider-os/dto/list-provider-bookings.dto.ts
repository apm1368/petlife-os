import { ServiceCategory } from "@prisma/client";
import { IsBooleanString, IsDateString, IsEnum, IsOptional, IsUUID } from "class-validator";

export class ListProviderBookingsDto {
  @IsOptional()
  @IsBooleanString()
  today?: string;

  @IsOptional()
  @IsBooleanString()
  upcoming?: string;

  @IsOptional()
  @IsBooleanString()
  past?: string;

  @IsOptional()
  @IsBooleanString()
  cancelled?: string;

  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  providerUserId?: string;

  /** Request-to-book queue awaiting a decision. */
  @IsOptional()
  @IsBooleanString()
  requests?: string;

  /** Calendar window (day/week/month views). */
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
