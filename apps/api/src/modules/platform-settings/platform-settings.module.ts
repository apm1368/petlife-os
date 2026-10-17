import { Global, Module } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service";
import { PublicSettingsController } from "./platform-settings.controller";

/** Global so any domain (booking, privacy, finance) can read a registry setting without importing AdminModule. */
@Global()
@Module({
  controllers: [PublicSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
