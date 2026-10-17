import { IsISO8601, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListAuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  adminUserId?: string;

  /** Exact action (e.g. "admin_user.suspended") or a prefix ending in "." (e.g. "setting."). */
  @IsOptional()
  @IsString()
  @Length(2, 80)
  action?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
