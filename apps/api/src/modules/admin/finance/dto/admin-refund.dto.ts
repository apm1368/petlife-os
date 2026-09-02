import { IsInt, IsOptional, IsPositive, IsString, IsUUID, IsNotEmpty } from "class-validator";

export class RequestAdminRefundDto {
  @IsUUID()
  orderId!: string;

  @IsInt()
  @IsPositive()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class RejectAdminRefundDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
