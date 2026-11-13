import { Controller, Get, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { BusinessHubService } from "./business-hub.service";

/** A partner's own businesses (provider organizations and shops), always resolved from the session user. */
@Controller("business")
@UseGuards(SessionAuthGuard)
export class BusinessHubController {
  constructor(private readonly hub: BusinessHubService) {}

  /** Light: which businesses the user belongs to (drives the "My business" link and the post-sign-in landing). */
  @Get("memberships")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  memberships(@CurrentUser() user: SessionUser) {
    return this.hub.memberships(user.id);
  }

  /** Today's essentials for every business the user belongs to. */
  @Get("overview")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  overview(@CurrentUser() user: SessionUser) {
    return this.hub.overview(user.id);
  }
}
