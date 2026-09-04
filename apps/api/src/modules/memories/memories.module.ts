import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { StorageModule } from "../storage/storage.module";
import { ClinicalHealthModule } from "../clinical-health/clinical-health.module";
import { PetMemoryService } from "./pet-memory.service";
import { LifeTimelineService } from "./life-timeline.service";
import { MemoryController } from "./memory.controller";
import { LifeTimelineController } from "./life-timeline.controller";

@Module({
  imports: [PetAccessModule, StorageModule, ClinicalHealthModule],
  controllers: [MemoryController, LifeTimelineController],
  providers: [PetMemoryService, LifeTimelineService],
})
export class MemoriesModule {}
