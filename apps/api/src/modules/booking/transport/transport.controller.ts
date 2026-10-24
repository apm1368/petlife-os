import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { TransportRouteService } from "./transport-route.service";

class TransportQuoteQuery {
  @IsUUID() pickupAddressId!: string;
  @IsUUID() dropoffAddressId!: string;
}

/** Pet taxi pre-booking estimate between two of the member's saved addresses. */
@Controller("provider-services")
@UseGuards(SessionAuthGuard)
export class TransportController {
  constructor(private readonly routes: TransportRouteService) {}

  @Get(":serviceId/transport-quote")
  quote(@CurrentUser() user: SessionUser, @Param("serviceId", ParseUUIDPipe) serviceId: string, @Query() q: TransportQuoteQuery) {
    return this.routes.quote(user.id, serviceId, q.pickupAddressId, q.dropoffAddressId);
  }
}
