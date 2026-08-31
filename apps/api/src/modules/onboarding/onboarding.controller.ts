import { Body, Controller, Get, Post, Put, UseGuards, UseInterceptors } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { IdempotencyInterceptor } from "../../common/idempotency/idempotency.interceptor";
import type { SessionUser } from "../../common/session/session.service";
import { UpdateProgressDto } from "./dto/update-progress.dto";
import { OnboardingService } from "./onboarding.service";

@Controller("onboarding")
@UseGuards(SessionAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  getProgress(@CurrentUser() user: SessionUser) {
    return this.onboardingService.getProgress(user.id);
  }

  @Put("progress")
  updateProgress(@CurrentUser() user: SessionUser, @Body() dto: UpdateProgressDto) {
    return this.onboardingService.updateProgress(user.id, dto);
  }

  @Post("complete")
  @UseInterceptors(IdempotencyInterceptor)
  complete(@CurrentUser() user: SessionUser) {
    return this.onboardingService.complete(user.id);
  }
}
