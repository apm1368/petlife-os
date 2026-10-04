import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { CHAT_MESSAGE_MAX, ChatService } from "./chat.service";

class OpenConversationDto { @IsUUID() participantUserId!: string; }
class SendMessageDto { @IsString() @MaxLength(CHAT_MESSAGE_MAX) body!: string; }
class BlockDto { @IsUUID() userId!: string; }
class MessagesQuery {
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

/** Community chat v1 — private 1:1 conversations; all routes are the signed-in member's own. */
@Controller("chat")
@UseGuards(SessionAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post("conversations")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  open(@CurrentUser() user: SessionUser, @Body() dto: OpenConversationDto) {
    return this.chat.open(user.id, dto.participantUserId);
  }

  @Get("conversations")
  list(@CurrentUser() user: SessionUser) {
    return this.chat.list(user.id);
  }

  @Get("conversations/:id/messages")
  messages(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Query() q: MessagesQuery) {
    return this.chat.messages(user.id, id, q.before, q.limit);
  }

  @Post("conversations/:id/messages")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  send(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.chat.send(user.id, id, dto.body);
  }

  @Post("conversations/:id/read")
  read(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.chat.markRead(user.id, id);
  }

  @Get("unread-count")
  unread(@CurrentUser() user: SessionUser) {
    return this.chat.totalUnread(user.id);
  }

  @Get("blocks")
  blocks(@CurrentUser() user: SessionUser) {
    return this.chat.listBlocks(user.id);
  }

  @Post("blocks")
  block(@CurrentUser() user: SessionUser, @Body() dto: BlockDto) {
    return this.chat.block(user.id, dto.userId);
  }

  @Delete("blocks/:userId")
  unblock(@CurrentUser() user: SessionUser, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.chat.unblock(user.id, userId);
  }
}
