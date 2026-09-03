import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { SupportCaseService } from "../admin/support/support-case.service";
import { CreateMySupportCaseDto, ListMySupportCasesQueryDto, PostMySupportMessageDto } from "./dto/user-support-case.dto";

/**
 * The consumer-facing half of the User Support Center. Guarded only by
 * SessionAuthGuard (no AdminAuthGuard) and reads/writes through the exact
 * same SupportCaseService/Postgres tables as /admin/support — there is
 * deliberately no separate "user ticket" model, per the spec's "the two
 * sides must operate on the SAME SupportCase source of truth."
 */
@Controller("support/cases")
@UseGuards(SessionAuthGuard)
export class UserSupportController {
  constructor(private readonly cases: SupportCaseService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() query: ListMySupportCasesQueryDto) {
    return this.cases.listForUser(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateMySupportCaseDto) {
    return this.cases.createAsUser(user.id, dto);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.cases.getForUser(user.id, id);
  }

  @Post(":id/messages")
  postMessage(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: PostMySupportMessageDto) {
    return this.cases.postMessageAsUser(user.id, id, dto.body);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.cases.reopen(user.id, id);
  }
}
