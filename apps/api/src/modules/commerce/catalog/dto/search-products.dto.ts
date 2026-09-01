import { PetSpecies } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";

export class SearchProductsDto {
  @IsOptional()
  @IsUUID()
  category?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  species?: PetSpecies;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  petId?: string;
}

export class GetProductDetailDto {
  @IsOptional()
  @IsUUID()
  petId?: string;
}
