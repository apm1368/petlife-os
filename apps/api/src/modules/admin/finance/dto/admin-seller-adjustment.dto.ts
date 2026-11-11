import { SellerAdjustmentReasonCode, SellerAdjustmentType } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class CreateSellerAdjustmentDto {
  /**
   * Optional in the body: both adjustment routes take the seller from the path (or from the settlement) and
   * overwrite this field, so requiring it here only made the admin UI's correct request fail validation.
   */
  @IsOptional()
  @IsUUID()
  sellerOrganizationId?: string;

  @IsEnum(SellerAdjustmentType)
  type!: SellerAdjustmentType;

  @IsEnum(SellerAdjustmentReasonCode)
  reasonCode!: SellerAdjustmentReasonCode;

  @IsInt()
  @IsPositive()
  amountIrr!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  evidenceReference?: string;
}
