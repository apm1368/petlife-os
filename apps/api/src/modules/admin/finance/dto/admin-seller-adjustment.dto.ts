import { SellerAdjustmentReasonCode, SellerAdjustmentType } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class CreateSellerAdjustmentDto {
  @IsUUID()
  sellerOrganizationId!: string;

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
