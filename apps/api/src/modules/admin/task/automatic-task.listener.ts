import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AdminPriority, AdminTaskSource } from "@prisma/client";
import { AutomaticTaskService } from "./automatic-task.service";
import { REPORT_REASON_FA } from "./task-titles";

/** Report reasons that need a human quickly (safety, harm, doxxing, fraud). Everything else stays in the normal moderation queue. */
export const HIGH_SEVERITY_REASONS = ["ANIMAL_WELFARE", "DANGEROUS_CONTENT", "HARASSMENT", "PERSONAL_INFORMATION", "SCAM"];

/**
 * ERP §19 rules that react to domain events. Each rule has a dedupe key per real-world occurrence, so a re-delivered
 * event never creates a second task. (Partner verification raises its task inside its own transaction instead.)
 */
@Injectable()
export class AutomaticTaskListener {
  constructor(private readonly tasks: AutomaticTaskService) {}

  @OnEvent("AccountDeletionRequested")
  async onDeletionRequested(payload: { userId: string; requestId: string }) {
    await this.tasks.raise({ dedupeKey: `privacy-deletion-request:${payload.requestId}`, title: "درخواست حذف حساب برای بررسی", source: AdminTaskSource.PRIVACY_REQUEST, team: "PRIVACY", priority: AdminPriority.HIGH, relatedEntityType: "AccountDeletionRequest", relatedEntityId: payload.requestId, dueAt: new Date(Date.now() + 7 * 86400e3) });
  }

  @OnEvent("CommunityReportSubmitted")
  @OnEvent("ContentReportSubmitted")
  async onReport(payload: { reportId: string; reason?: string; targetType?: string }) {
    if (!payload.reason || !HIGH_SEVERITY_REASONS.includes(payload.reason)) return;
    await this.tasks.raise({ dedupeKey: `high-severity-report:${payload.reportId}`, title: `گزارش با شدت بالا (${REPORT_REASON_FA[payload.reason] ?? payload.reason})`, source: AdminTaskSource.HIGH_SEVERITY_REPORT, team: "TRUST_SAFETY", priority: AdminPriority.URGENT, relatedEntityType: "CommunityReport", relatedEntityId: payload.reportId, dueAt: new Date(Date.now() + 86400e3) });
  }
}
