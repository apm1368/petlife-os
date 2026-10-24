import { SubscriptionsModule } from "../subscriptions/subscription.module";
import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { ClinicalHealthModule } from "../clinical-health/clinical-health.module";
import { VetShareService } from "./vet-share.service";
import { VetShareController,VetShareInboxController,VetShareReadController } from "./vet-share.controller";
@Module({imports:[PetAccessModule,ClinicalHealthModule,SubscriptionsModule],controllers:[VetShareController,VetShareInboxController,VetShareReadController],providers:[VetShareService]})
export class VetShareModule {}
