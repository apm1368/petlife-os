import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { HomeService } from "./home.service";

@Controller("home")
@UseGuards(SessionAuthGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  getHome(@CurrentUser() user: SessionUser) {
    return this.homeService.getHome(user.id);
  }
}
