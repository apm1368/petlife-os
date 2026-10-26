import { IsIn, IsOptional, IsString, Length } from "class-validator";
import type { AdminUserRoleKind } from "@petlife/types";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

const ROLE_KINDS: AdminUserRoleKind[] = ["ADMIN_INTERNAL", "CUSTOMER", "CLINIC", "GROOMER", "HOST", "PROVIDER_OTHER", "SHOP", "INSURER", "NGO"];

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  q?: string;

  /** Restrict to users holding at least one relationship of this kind. */
  @IsOptional()
  @IsIn(ROLE_KINDS)
  kind?: AdminUserRoleKind;
}
