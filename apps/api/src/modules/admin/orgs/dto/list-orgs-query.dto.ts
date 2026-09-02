import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListOrgsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
