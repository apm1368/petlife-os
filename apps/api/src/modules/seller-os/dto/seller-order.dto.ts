import { IsEnum, IsOptional } from "class-validator";
import { OrderStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";

export class ListSellerOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
