import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";
import { AdminPriority, SupportCaseCategory, SupportCaseStatus, SupportMessageVisibility } from "@prisma/client";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListSupportCasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SupportCaseStatus)
  status?: SupportCaseStatus;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}

export class CreateSupportCaseDto {
  @IsUUID()
  requesterUserId!: string;

  @IsOptional()
  @IsUUID()
  householdId?: string;

  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsEnum(SupportCaseCategory)
  category!: SupportCaseCategory;

  @IsOptional()
  @IsEnum(AdminPriority)
  priority?: AdminPriority;
}

export class AssignSupportCaseDto {
  @IsUUID()
  assigneeAdminId!: string;
}

export class TransitionSupportCaseDto {
  @IsEnum(SupportCaseStatus)
  status!: SupportCaseStatus;
}

export class PostSupportMessageDto {
  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsIn([SupportMessageVisibility.PUBLIC, SupportMessageVisibility.INTERNAL])
  visibility!: SupportMessageVisibility;
}

export class AddInternalNoteDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}
