import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListSellerFinanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}

export class CalculateSellerSettlementDto {
  @IsUUID()
  sellerOrganizationId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

export class PayoutSellerSettlementDto {
  @IsOptional()
  @IsString()
  payoutReference?: string;
}

export class SellerSettlementReasonDto {
  @IsString()
  reason!: string;
}
