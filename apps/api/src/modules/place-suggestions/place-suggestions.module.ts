import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AdminPlaceSuggestionsController, PlaceSuggestionsController } from "./place-suggestions.controller";
import { PlaceSuggestionService } from "./place-suggestion.service";

/** Member suggestions of new places and their admin moderation (imports AdminModule for audit, like SupportModule). */
@Module({
  imports: [AdminModule],
  controllers: [PlaceSuggestionsController, AdminPlaceSuggestionsController],
  providers: [PlaceSuggestionService],
})
export class PlaceSuggestionsModule {}
