import { IsOptional, IsString, IsUUID } from "class-validator";
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
}
