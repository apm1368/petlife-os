import { IsDateString, IsOptional, IsString, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class ListSellerTransactionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  settlementStatus?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}
