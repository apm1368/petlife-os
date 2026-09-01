import { IsOptional, IsUUID } from "class-validator";

export class GetServiceDetailDto {
  @IsOptional()
  @IsUUID()
  petId?: string;
}
