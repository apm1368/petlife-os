import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UsersService } from "./users.service";

@Controller()
@UseGuards(SessionAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  async getMe(@CurrentUser() user: SessionUser) {
    return this.usersService.getById(user.id);
  }

  @Patch("me")
  async updateMe(@CurrentUser() user: SessionUser, @Body() dto: UpdateMeDto) {
    return this.usersService.update(user.id, dto);
  }
}
