import { Injectable } from "@nestjs/common";
import { CommunityContentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ChatBlockedException, NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";

export const CHAT_MESSAGE_MAX = 2000;
const PAGE_MAX = 50;

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/**
 * Community chat v1 (docs/product/community-chat-architecture.md): private 1:1 conversations.
 * Every read and write is scoped to the caller's participation — anything else is the same 404 —
 * and a block in either direction stops new conversations and messages while history stays readable.
 */
@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService, private readonly events: DomainEventsService) {}

  private async isBlockedBetween(a: string, b: string): Promise<boolean> {
    return (await this.prisma.userBlock.count({ where: { OR: [{ blockerUserId: a, blockedUserId: b }, { blockerUserId: b, blockedUserId: a }] } })) > 0;
  }

  /** The caller's participation, or the same 404 as a conversation that does not exist. */
  private async participation(conversationId: string, userId: string) {
    const row = await this.prisma.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } }, include: { conversation: { include: { participants: { select: { userId: true } } } } } });
    if (!row) throw new NotFoundApiException("Conversation");
    const otherUserId = row.conversation.participants.find((p) => p.userId !== userId)?.userId ?? null;
    return { row, otherUserId };
  }

  async open(userId: string, participantUserId: string) {
    if (participantUserId === userId) throw new ValidationApiException({ field: "participantUserId", reason: "CANNOT_MESSAGE_SELF" });
    const other = await this.prisma.user.findUnique({ where: { id: participantUserId }, select: { id: true } });
    if (!other) throw new NotFoundApiException("Member");
    if (await this.isBlockedBetween(userId, participantUserId)) throw new ChatBlockedException();
    const key = pairKey(userId, participantUserId);
    const existing = await this.prisma.chatConversation.findUnique({ where: { pairKey: key } });
    if (existing) return this.summary(existing.id, userId);
    try {
      const created = await this.prisma.chatConversation.create({ data: { pairKey: key, participants: { create: [{ userId }, { userId: participantUserId }] } } });
      return this.summary(created.id, userId);
    } catch (e) {
      // Two members opening the same conversation at once: the unique pairKey decides, both get the one row.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return this.summary((await this.prisma.chatConversation.findUniqueOrThrow({ where: { pairKey: key } })).id, userId);
      }
      throw e;
    }
  }

  private async unreadCount(conversationId: string, userId: string, lastReadAt: Date | null) {
    return this.prisma.chatMessage.count({ where: { conversationId, status: CommunityContentStatus.PUBLISHED, senderUserId: { not: userId }, ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}) } });
  }

  private async summary(conversationId: string, userId: string) {
    const { row, otherUserId } = await this.participation(conversationId, userId);
    const [other, last, unread, blocked] = await Promise.all([
      otherUserId ? this.prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true, displayName: true, avatarUrl: true } }) : null,
      this.prisma.chatMessage.findFirst({ where: { conversationId, status: CommunityContentStatus.PUBLISHED }, orderBy: { createdAt: "desc" } }),
      this.unreadCount(conversationId, userId, row.lastReadAt),
      otherUserId ? this.isBlockedBetween(userId, otherUserId) : false,
    ]);
    return {
      id: conversationId,
      // Only the public profile bits of the other member — never contacts or account data.
      otherMember: other ? { id: other.id, displayName: other.displayName, avatarUrl: other.avatarUrl } : null,
      lastMessage: last ? { id: last.id, body: last.body, senderIsMe: last.senderUserId === userId, createdAt: last.createdAt.toISOString() } : null,
      unreadCount: unread,
      blocked,
      lastMessageAt: row.conversation.lastMessageAt?.toISOString() ?? null,
    };
  }

  async list(userId: string) {
    const rows = await this.prisma.chatParticipant.findMany({ where: { userId }, include: { conversation: true }, orderBy: { conversation: { lastMessageAt: { sort: "desc", nulls: "last" } } }, take: 100 });
    return Promise.all(rows.map((r) => this.summary(r.conversationId, userId)));
  }

  async messages(userId: string, conversationId: string, before?: string, limit = 30) {
    await this.participation(conversationId, userId);
    const take = Math.min(Math.max(1, limit), PAGE_MAX);
    const beforeDate = before ? new Date(before) : null;
    if (before && Number.isNaN(beforeDate!.getTime())) throw new ValidationApiException({ field: "before", reason: "INVALID_DATE" });
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId, status: CommunityContentStatus.PUBLISHED, ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}) },
      orderBy: { createdAt: "desc" },
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      items: page.reverse().map((m) => ({ id: m.id, body: m.body, senderIsMe: m.senderUserId === userId, createdAt: m.createdAt.toISOString() })),
      hasMore: rows.length > take,
    };
  }

  async send(userId: string, conversationId: string, rawBody: string) {
    const { otherUserId } = await this.participation(conversationId, userId);
    const body = rawBody.trim();
    if (!body) throw new ValidationApiException({ field: "body", reason: "EMPTY" });
    if (body.length > CHAT_MESSAGE_MAX) throw new ValidationApiException({ field: "body", reason: "TOO_LONG", max: CHAT_MESSAGE_MAX });
    if (otherUserId && (await this.isBlockedBetween(userId, otherUserId))) throw new ChatBlockedException();
    const message = await this.prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({ data: { conversationId, senderUserId: userId, body } });
      await tx.chatConversation.update({ where: { id: conversationId }, data: { lastMessageAt: m.createdAt } });
      // Sending implies the sender has read everything up to here.
      await tx.chatParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: m.createdAt } });
      await this.events.publish("ChatMessageSent", { conversationId, messageId: m.id, senderUserId: userId, recipientUserId: otherUserId }, { tx, aggregateType: "ChatConversation", aggregateId: conversationId });
      return m;
    });
    return { id: message.id, body: message.body, senderIsMe: true, createdAt: message.createdAt.toISOString() };
  }

  async markRead(userId: string, conversationId: string) {
    await this.participation(conversationId, userId);
    await this.prisma.chatParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: new Date() } });
    return { ok: true };
  }

  async totalUnread(userId: string) {
    const rows = await this.prisma.chatParticipant.findMany({ where: { userId }, select: { conversationId: true, lastReadAt: true } });
    const counts = await Promise.all(rows.map((r) => this.unreadCount(r.conversationId, userId, r.lastReadAt)));
    return { unreadCount: counts.reduce((a, b) => a + b, 0) };
  }

  async block(userId: string, blockedUserId: string) {
    if (blockedUserId === userId) throw new ValidationApiException({ field: "userId", reason: "CANNOT_BLOCK_SELF" });
    const target = await this.prisma.user.findUnique({ where: { id: blockedUserId }, select: { id: true } });
    if (!target) throw new NotFoundApiException("Member");
    await this.prisma.userBlock.upsert({ where: { blockerUserId_blockedUserId: { blockerUserId: userId, blockedUserId } }, create: { blockerUserId: userId, blockedUserId }, update: {} });
    return { blocked: true };
  }

  async unblock(userId: string, blockedUserId: string) {
    await this.prisma.userBlock.deleteMany({ where: { blockerUserId: userId, blockedUserId } });
    return { blocked: false };
  }

  async listBlocks(userId: string) {
    const rows = await this.prisma.userBlock.findMany({ where: { blockerUserId: userId }, include: { blocked: { select: { id: true, displayName: true, avatarUrl: true } } }, orderBy: { createdAt: "desc" } });
    return rows.map((r) => ({ userId: r.blocked.id, displayName: r.blocked.displayName, avatarUrl: r.blocked.avatarUrl, blockedAt: r.createdAt.toISOString() }));
  }

  /** For the report queue: a message may be reported only by a member of its conversation. */
  async assertCanReport(userId: string, messageId: string) {
    const m = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, select: { conversationId: true } });
    if (!m) throw new NotFoundApiException("Message");
    await this.participation(m.conversationId, userId);
  }
}
