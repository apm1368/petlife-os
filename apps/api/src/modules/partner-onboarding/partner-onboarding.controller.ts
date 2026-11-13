import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import {
  PartnerAddressDto,
  PartnerBusinessDto,
  PartnerCalendarDto,
  PartnerDocumentUploadDto,
  PartnerOwnerDto,
  PartnerProductsDto,
  PartnerRegisterDocumentDto,
  PartnerServicesDto,
  PartnerUploadDto,
  StartPartnerOnboardingDto,
} from "./partner-onboarding.dto";
import { PartnerOnboardingService } from "./partner-onboarding.service";

/** Draft saves: generous for a person filling a form, a hard stop for scripts. */
const SAVE_LIMIT = { default: { limit: 30, ttl: 60_000 } };

/**
 * Partner signup ("ثبت‌نام همکار"). Session only — no organization id is ever taken from the caller: every route acts
 * on the signed-in user's own onboarding organizations, which stay unverified and off the site until staff approve.
 */
@Controller("partner-onboarding")
@UseGuards(SessionAuthGuard)
export class PartnerOnboardingController {
  constructor(private readonly onboarding: PartnerOnboardingService) {}

  @Get()
  state(@CurrentUser() user: SessionUser) {
    return this.onboarding.state(user.id);
  }

  @Post("start")
  @Throttle(SAVE_LIMIT)
  start(@CurrentUser() user: SessionUser, @Body() dto: StartPartnerOnboardingDto) {
    return this.onboarding.start(user.id, dto);
  }

  @Post("logo-upload")
  @Throttle(SAVE_LIMIT)
  logoUpload(@CurrentUser() user: SessionUser, @Body() dto: PartnerUploadDto) {
    return this.onboarding.logoUpload(user.id, dto.contentType, dto.fileSizeBytes);
  }

  @Put("business")
  @Throttle(SAVE_LIMIT)
  business(@CurrentUser() user: SessionUser, @Body() dto: PartnerBusinessDto) {
    return this.onboarding.business(user.id, dto);
  }

  @Put("owner")
  @Throttle(SAVE_LIMIT)
  owner(@CurrentUser() user: SessionUser, @Body() dto: PartnerOwnerDto) {
    return this.onboarding.owner(user.id, dto);
  }

  @Post("documents/upload")
  @Throttle(SAVE_LIMIT)
  documentUpload(@CurrentUser() user: SessionUser, @Body() dto: PartnerDocumentUploadDto) {
    return this.onboarding.documentUpload(user.id, dto.subject, dto.contentType, dto.fileSizeBytes);
  }

  @Post("documents")
  @Throttle(SAVE_LIMIT)
  registerDocument(@CurrentUser() user: SessionUser, @Body() dto: PartnerRegisterDocumentDto) {
    return this.onboarding.registerDocument(user.id, dto);
  }

  @Put("address")
  @Throttle(SAVE_LIMIT)
  address(@CurrentUser() user: SessionUser, @Body() dto: PartnerAddressDto) {
    return this.onboarding.address(user.id, dto);
  }

  @Put("calendar")
  @Throttle(SAVE_LIMIT)
  calendar(@CurrentUser() user: SessionUser, @Body() dto: PartnerCalendarDto) {
    return this.onboarding.calendar(user.id, dto);
  }

  @Put("services")
  @Throttle(SAVE_LIMIT)
  services(@CurrentUser() user: SessionUser, @Body() dto: PartnerServicesDto) {
    return this.onboarding.services(user.id, dto);
  }

  @Put("opening-hours")
  @Throttle(SAVE_LIMIT)
  openingHours(@CurrentUser() user: SessionUser, @Body() dto: PartnerCalendarDto) {
    return this.onboarding.openingHours(user.id, dto);
  }

  @Put("products")
  @Throttle(SAVE_LIMIT)
  products(@CurrentUser() user: SessionUser, @Body() dto: PartnerProductsDto) {
    return this.onboarding.products(user.id, dto);
  }

  @Post("submit")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submit(@CurrentUser() user: SessionUser) {
    return this.onboarding.submit(user.id);
  }
}
