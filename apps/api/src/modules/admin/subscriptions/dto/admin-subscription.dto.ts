import { Type } from "class-transformer";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { SubscriptionStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListAdminSubscriptionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  /** Household name/id substring — deliberately simple, mirrors the H11 customer-search pattern rather than a bespoke query language. */
  @IsOptional()
  @IsString()
  q?: string;
}

export class ListAdminBillingAttemptsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => String)
  householdId?: string;
}

export class AdminCancelSubscriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RefundBillingAttemptDto {
  @IsString()
  reason!: string;
}
