import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ContentAuthorInputDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUUID()
  avatarMediaAssetId?: string;
}

export class UpdateContentAuthorDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUUID()
  avatarMediaAssetId?: string;
}
