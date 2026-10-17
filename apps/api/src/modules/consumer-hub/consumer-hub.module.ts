import { Module } from "@nestjs/common";
import { ConsumerHubController, SearchController } from "./consumer-hub.controller";
import { ConsumerHubService } from "./consumer-hub.service";

/** Unified saved items, global public search and recently viewed. */
@Module({ controllers: [SearchController, ConsumerHubController], providers: [ConsumerHubService] })
export class ConsumerHubModule {}
