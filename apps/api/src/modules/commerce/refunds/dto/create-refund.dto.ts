import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class CreateRefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Must equal the order's full totalAmount if provided — partial refunds are not supported this phase (see RefundsService). */
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;
}
