import { ServiceCategory } from "@prisma/client";
import { IsBooleanString, IsEnum, IsOptional, IsUUID } from "class-validator";

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
}
