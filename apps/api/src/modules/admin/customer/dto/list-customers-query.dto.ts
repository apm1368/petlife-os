import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../../common/pagination/pagination.dto";

export class ListCustomersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
