import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";
import { AppealStatus, TrustActionType, TrustCaseSeverity, TrustCaseStatus, TrustSubjectType } from "@prisma/client";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListTrustCasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TrustCaseStatus)
  status?: TrustCaseStatus;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}

export class OpenTrustCaseDto {
  @IsEnum(TrustSubjectType)
  subjectType!: TrustSubjectType;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsEnum(TrustCaseSeverity)
  severity?: TrustCaseSeverity;
}

export class AssignTrustCaseDto {
  @IsUUID()
  assigneeAdminId!: string;
}

export class TransitionTrustCaseDto {
  @IsEnum(TrustCaseStatus)
  status!: TrustCaseStatus;
}

export class TakeTrustActionDto {
  @IsEnum(TrustActionType)
  actionType!: TrustActionType;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class SubmitAppealDto {
  @IsUUID()
  appellantUserId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ResolveAppealDto {
  @IsEnum(AppealStatus)
  status!: AppealStatus;

  @IsString()
  @IsNotEmpty()
  resolution!: string;
}
