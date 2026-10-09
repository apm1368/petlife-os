import { Controller, Get } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service";

/** Only PUBLIC-scope settings (e.g. the site announcement); everything else stays behind the admin API. */
@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get("public")
  publicSettings() {
    return this.settings.publicSettings();
  }
}
