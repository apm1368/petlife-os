import { IsEnum, IsInt, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { ListSellerOffersQueryDto } from "./seller-offer.dto";

export class ListSellerInventoryQueryDto extends ListSellerOffersQueryDto {}

export enum InventoryAdjustmentMode {
  DELTA = "DELTA",
  ABSOLUTE = "ABSOLUTE",
}

export class AdjustInventoryDto {
  @IsEnum(InventoryAdjustmentMode)
  mode!: InventoryAdjustmentMode;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListInventoryMovementsQueryDto extends PaginationQueryDto {}
