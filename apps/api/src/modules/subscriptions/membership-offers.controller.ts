import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SubscriptionOffersService } from "./subscription-offers.service";

/**
 * The signed-in account's own offers before any household is chosen: the first screen after sign-up shows the free
 * week (it starts with the first pet) and the first-purchase gift. Only ever about the caller; takes no ids.
 */
@Controller("account/membership-offers")
@UseGuards(SessionAuthGuard)
export class MembershipOffersController {
  constructor(private readonly offers: SubscriptionOffersService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.offers.forAccount(user.id);
  }
}
