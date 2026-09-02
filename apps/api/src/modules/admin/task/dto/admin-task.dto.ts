import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";
import { AdminPriority, AdminTaskStatus } from "@prisma/client";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListAdminTasksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AdminTaskStatus)
  status?: AdminTaskStatus;

  @IsOptional()
  @IsUUID()
  assigneeAdminId?: string;
}

export class CreateAdminTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  assigneeAdminId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsEnum(AdminPriority)
  priority?: AdminPriority;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;
}

export class UpdateAdminTaskDto {
  @IsOptional()
  @IsUUID()
  assigneeAdminId?: string;

  @IsOptional()
  @IsEnum(AdminTaskStatus)
  status?: AdminTaskStatus;
}
