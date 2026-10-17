import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export const REFUND_REQUEST_REASONS = ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "MISSING_ITEMS", "NOT_DELIVERED", "PET_REACTION", "OTHER"] as const;

export class CreateRefundRequestDto {
  @IsIn(REFUND_REQUEST_REASONS as unknown as string[])
  reason!: (typeof REFUND_REQUEST_REASONS)[number];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  orderItemIds?: string[];
}
