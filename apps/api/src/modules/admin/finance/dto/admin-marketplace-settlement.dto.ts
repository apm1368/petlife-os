import { Type } from "class-transformer";
import { FinancialConfidence, MarketplaceSettlementImportSource } from "@prisma/client";
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";

export class MarketplaceSettlementStatementLineInputDto {
  @IsString()
  externalOrderId!: string;

  @IsInt()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  feeAmount?: number;

  @IsOptional()
  @IsEnum(FinancialConfidence)
  feeConfidence?: FinancialConfidence;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ImportMarketplaceSettlementDto {
  @IsUUID()
  marketplaceChannelAccountId!: string;

  @IsEnum(MarketplaceSettlementImportSource)
  source!: MarketplaceSettlementImportSource;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  currency!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketplaceSettlementStatementLineInputDto)
  lines!: MarketplaceSettlementStatementLineInputDto[];
}

export class ResolveMarketplaceReconciliationDto {
  @IsString()
  notes!: string;
}
