import { Module } from "@nestjs/common";
import { ProvidersController } from "./providers.controller";
import { ProvidersService } from "./providers.service";
import { SlotGeneratorService } from "./slot-generator.service";

@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService, SlotGeneratorService],
  exports: [SlotGeneratorService],
})
export class ProvidersModule {}
