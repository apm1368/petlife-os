import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class AddCartItemDto {
  @IsUUID()
  offerId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;

  @IsOptional()
  @IsUUID()
  targetPetId?: string;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}
