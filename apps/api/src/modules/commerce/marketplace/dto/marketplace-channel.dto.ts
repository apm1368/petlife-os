import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { MarketplaceProvider } from "@prisma/client";

export class ConnectMarketplaceChannelDto {
  @IsEnum(MarketplaceProvider)
  provider!: MarketplaceProvider;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class UpdateMarketplaceChannelDto {
  @IsOptional()
  @IsBoolean()
  syncEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inventorySyncEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  priceSyncEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  orderSyncEnabled?: boolean;
}
