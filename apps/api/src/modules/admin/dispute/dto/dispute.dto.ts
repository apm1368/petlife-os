import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";
import { DisputeEvidenceActorType, DisputeStatus, DisputeSubjectType } from "@prisma/client";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListDisputesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;
}

export class CreateDisputeDto {
  @IsEnum(DisputeSubjectType)
  subjectType!: DisputeSubjectType;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsOptional()
  @IsUUID()
  raisedByUserId?: string;

  @IsOptional()
  @IsUUID()
  supportCaseId?: string;

  @IsString()
  @IsNotEmpty()
  claim!: string;
}

export class AssignDisputeDto {
  @IsUUID()
  assigneeAdminId!: string;
}

export class TransitionDisputeDto {
  @IsEnum(DisputeStatus)
  status!: DisputeStatus;

  @IsOptional()
  @IsString()
  resolutionSummary?: string;
}

export class AddDisputeEvidenceDto {
  @IsString()
  @IsNotEmpty()
  statement!: string;

  @IsOptional()
  @IsString()
  attachmentRef?: string;

  @IsIn([DisputeEvidenceActorType.USER, DisputeEvidenceActorType.ADMIN])
  actorType!: DisputeEvidenceActorType;

  /** Required when actorType is USER — whose statement the admin is recording (spec: no consumer-facing route exists this phase, so a USER-actor entry is always admin-transcribed). */
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
