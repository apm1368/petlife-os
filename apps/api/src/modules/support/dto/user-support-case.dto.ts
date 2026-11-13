import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { SupportCaseCategory } from "@prisma/client";
import { PARTNER_SUPPORT_CATEGORIES, type PartnerSupportCategory } from "@petlife/types";
import { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { USER_LINKABLE_RELATED_ENTITY_TYPES, type UserLinkableRelatedEntityType } from "../../admin/support/support-case.service";

export class ListMySupportCasesQueryDto extends PaginationQueryDto {}

/**
 * The consumer-facing create DTO. Deliberately has no `requesterUserId`
 * field (the session identifies the caller — no impersonation possible)
 * and no `priority` field at all (server always defaults to NORMAL — see
 * SupportCaseService.createAsUser).
 */
export class CreateMySupportCaseDto {
  @IsOptional()
  @IsUUID()
  householdId?: string;

  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsIn(USER_LINKABLE_RELATED_ENTITY_TYPES)
  relatedEntityType?: UserLinkableRelatedEntityType;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsIn(Object.values(SupportCaseCategory))
  category!: SupportCaseCategory;
}

export class PostMySupportMessageDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}

/** A partner's case from their business panel: no household, pet or priority — the business itself is the context. */
export class CreatePartnerSupportCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsIn(PARTNER_SUPPORT_CATEGORIES)
  category!: PartnerSupportCategory;
}

export class PostPartnerSupportMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
