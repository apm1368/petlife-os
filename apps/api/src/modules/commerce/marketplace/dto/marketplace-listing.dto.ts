import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { MarketplaceListingStatus, MarketplaceListingSyncStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListMarketplaceListingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  channelAccountId?: string;

  @IsOptional()
  @IsEnum(MarketplaceListingStatus)
  status?: MarketplaceListingStatus;

  @IsOptional()
  @IsEnum(MarketplaceListingSyncStatus)
  syncStatus?: MarketplaceListingSyncStatus;
}

export class CreateMarketplaceListingDto {
  @IsUUID()
  marketplaceChannelAccountId!: string;

  @IsUUID()
  sellerOfferId!: string;
}

export class UpdateMarketplaceListingMappingDto {
  @IsOptional()
  @IsString()
  externalListingId?: string;

  @IsOptional()
  @IsString()
  externalProductId?: string;

  @IsOptional()
  @IsString()
  externalVariantId?: string;
}
