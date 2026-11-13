import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { PaymentsModule } from "../commerce/payments/payments.module";
import { LedgerModule } from "../commerce/ledger/ledger.module";
import { SetPetController } from "./set-pet.controller";
import { SetPetService } from "./set-pet.service";

/** «ست پت» member side (orders, drafts, private design uploads, wallet payment). Staff work orders from the admin queue. */
@Module({
  imports: [StorageModule, PetAccessModule, PaymentsModule, LedgerModule],
  controllers: [SetPetController],
  providers: [SetPetService],
  exports: [SetPetService],
})
export class SetPetModule {}
