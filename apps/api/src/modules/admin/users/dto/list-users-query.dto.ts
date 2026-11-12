import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import type { AdminCustomerSegment, AdminUserRoleKind } from "@petlife/types";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

const ROLE_KINDS: AdminUserRoleKind[] = ["ADMIN_INTERNAL", "CUSTOMER", "CLINIC", "GROOMER", "HOST", "PROVIDER_OTHER", "SHOP", "INSURER", "NGO"];
const SEGMENTS: AdminCustomerSegment[] = ["NEW", "VIP", "ACTIVE", "AT_RISK", "DORMANT", "NEVER_PURCHASED"];
export const USER_SORTS = ["newest", "oldest", "lastActive", "spend", "orders", "bookings"] as const;
export type UserSort = (typeof USER_SORTS)[number];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const bool = ({ value }: { value: unknown }) => (value === "true" || value === true ? true : value === "false" || value === false ? false : value);

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  q?: string;

  /** Restrict to users holding at least one relationship of this kind. */
  @IsOptional()
  @IsIn(ROLE_KINDS)
  kind?: AdminUserRoleKind;

  @IsOptional() @IsIn(["ACTIVE", "SUSPENDED"]) status?: "ACTIVE" | "SUSPENDED";

  /** Behaviour segment (see reports/customer-metrics.sql.ts for the exact definitions). */
  @IsOptional() @IsIn(SEGMENTS) segment?: AdminCustomerSegment;

  /** Signup window, Tehran calendar dates, inclusive. */
  @IsOptional() @Matches(DATE) joinedFrom?: string;
  @IsOptional() @Matches(DATE) joinedTo?: string;

  /** Seen (session, order or booking) within the last N days. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) activeWithinDays?: number;
  /** Not seen for at least N days. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650) inactiveForDays?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) minOrders?: number;
  /** IRR across shop orders, service bookings and stays. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minSpend?: number;

  @IsOptional() @Transform(bool) @IsBoolean() hasServiceBooking?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() hasTravelBooking?: boolean;
  /** At least one cancellation or no-show — a reliability signal. */
  @IsOptional() @Transform(bool) @IsBoolean() hasCancellations?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() hasSupportCases?: boolean;

  @IsOptional() @IsIn(USER_SORTS) sort?: UserSort;
}
