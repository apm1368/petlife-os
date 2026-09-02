import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { InternalNoteEntityType } from "@prisma/client";

export class AddNoteDto {
  @IsEnum(InternalNoteEntityType)
  entityType!: InternalNoteEntityType;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
