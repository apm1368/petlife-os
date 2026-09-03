import { Controller, Get, Param, ParseEnumPipe, Query } from "@nestjs/common";
import { ContentPlacementKey } from "@prisma/client";
import { PublicContentPlacementReadService } from "./public-content-placement-read.service";
import { LocaleQueryDto } from "./dto/public-content.dto";

/** Public read side of the typed Landing/Home content hooks — see PublicContentPlacementReadService's own doc comment. */
@Controller("content/placements")
export class PublicContentPlacementController {
  constructor(private readonly placements: PublicContentPlacementReadService) {}

  @Get(":key")
  get(@Param("key", new ParseEnumPipe(ContentPlacementKey)) key: ContentPlacementKey, @Query() query: LocaleQueryDto) {
    return this.placements.get(key, query.locale);
  }
}
