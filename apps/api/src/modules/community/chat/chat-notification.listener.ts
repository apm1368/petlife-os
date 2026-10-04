import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotificationDeepLinks } from "../../notifications/notification-deeplink.util";
import { NotificationOrchestratorService } from "../../notifications/notification-orchestrator.service";

/** One notification per received message (deduped on the domain event), deep-linking to the conversation. */
@Injectable()
export class ChatNotificationListener {
  private readonly logger = new Logger(ChatNotificationListener.name);
  constructor(private readonly orchestrator: NotificationOrchestratorService, private readonly prisma: PrismaService) {}

  @OnEvent("ChatMessageSent")
  async onSent(p: { conversationId: string; messageId: string; senderUserId: string; recipientUserId: string | null }, domainEventId: string) {
    try {
      if (!p.recipientUserId) return;
      const sender = await this.prisma.user.findUnique({ where: { id: p.senderUserId }, select: { displayName: true } });
      await this.orchestrator.notify({
        userId: p.recipientUserId,
        type: "community.chat_message",
        category: NotificationCategory.COMMUNITY,
        templateParams: { sender: sender?.displayName ?? "" },
        entityType: "ChatConversation",
        entityId: p.conversationId,
        deepLink: NotificationDeepLinks.chatConversation(p.conversationId),
        domainEventId,
      });
    } catch (error) {
      this.logger.error("Chat notification failed", error instanceof Error ? error.stack : undefined);
    }
  }
}
