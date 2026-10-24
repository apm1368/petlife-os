import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsIn, IsString, Length, Matches } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ContactChangeService } from "./contact-change.service";

class RequestContactChangeDto {
  @IsIn(["email", "phone"]) kind!: "email" | "phone";
  @IsString() @Length(5, 320) value!: string;
}

class ConfirmContactChangeDto extends RequestContactChangeDto {
  @IsString() @Matches(/^\d{4,8}$/) code!: string;
}

@Controller("me/contact")
@UseGuards(SessionAuthGuard)
export class ContactChangeController {
  constructor(private readonly contacts: ContactChangeService) {}

  @Post("request")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@CurrentUser() user: SessionUser, @Body() dto: RequestContactChangeDto) {
    return this.contacts.request(user.id, dto.kind, dto.value);
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(@CurrentUser() user: SessionUser, @Body() dto: ConfirmContactChangeDto) {
    return this.contacts.confirm(user.id, dto.kind, dto.value, dto.code);
  }
}
