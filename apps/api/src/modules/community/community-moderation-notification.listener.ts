import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { CommunityContentStatus, NotificationCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

const WHAT = { post: { fa: "پست", en: "post" }, comment: { fa: "نظر", en: "comment" } } as const;

/**
 * M6 — a moderator's decision on a post or comment reaches its author in-app (never by SMS: the template has no
 * smsBody). Private chat messages are left out on purpose; their sender sees the change in the conversation.
 */
@Injectable()
export class CommunityModerationNotificationListener {
  private readonly logger = new Logger(CommunityModerationNotificationListener.name);
  constructor(private readonly orchestrator: NotificationOrchestratorService, private readonly prisma: PrismaService) {}

  @OnEvent("CommunityContentStatusChangedByModerator")
  async onModerated(p: { contentId: string; from: string; to: string }, domainEventId: string) {
    try {
      const removed = p.to === CommunityContentStatus.REMOVED || p.to === CommunityContentStatus.HIDDEN;
      const restored = p.to === CommunityContentStatus.PUBLISHED && p.from !== CommunityContentStatus.PUBLISHED;
      if (!removed && !restored) return;
      const post = await this.prisma.communityPost.findUnique({ where: { id: p.contentId }, select: { id: true, authorUserId: true } });
      const comment = post ? null : await this.prisma.communityComment.findUnique({ where: { id: p.contentId }, select: { postId: true, authorUserId: true } });
      const target = post ? { kind: "post" as const, userId: post.authorUserId, postId: post.id } : comment ? { kind: "comment" as const, userId: comment.authorUserId, postId: comment.postId } : null;
      if (!target) return;
      const user = await this.prisma.user.findUnique({ where: { id: target.userId }, select: { locale: true } });
      const what = WHAT[target.kind][user?.locale === "fa" ? "fa" : "en"];
      await this.orchestrator.notify({
        userId: target.userId,
        type: removed ? "community.content_removed" : "community.content_restored",
        category: NotificationCategory.COMMUNITY,
        templateParams: { what },
        entityType: target.kind === "post" ? "CommunityPost" : "CommunityComment",
        entityId: p.contentId,
        deepLink: restored ? NotificationDeepLinks.communityPost(target.postId) : NotificationDeepLinks.community(),
        domainEventId,
      });
    } catch (error) {
      this.logger.error("Community moderation notification failed", error instanceof Error ? error.stack : undefined);
    }
  }
}
