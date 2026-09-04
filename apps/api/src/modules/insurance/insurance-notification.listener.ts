import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory, NotificationPriority } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

/**
 * H10 integration for Insurance (spec: "Reuse H10... Potential:
 * application status change"). Deliberately narrow — only submission and
 * status-change events, never a per-field edit, comparison view, or
 * eligibility check (spec: "do not over-notify"). Fans out to the pet's
 * whole household, mirroring LostPetNotificationListener's own
 * notifyHousehold shape.
 */
@Injectable()
export class InsuranceNotificationListener {
  private readonly logger = new Logger(InsuranceNotificationListener.name);

  constructor(
    private readonly orchestrator: NotificationOrchestratorService,
    private readonly prisma: PrismaService,
  ) {}

  private async safely(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`Notification handling failed for ${label}`, error instanceof Error ? error.stack : undefined);
    }
  }

  private async notifyHousehold(
    petId: string,
    type: string,
    templateParams: Record<string, string | number>,
    applicationId: string,
    domainEventId: string,
  ): Promise<void> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { householdId: true } });
    if (!pet) return;
    const members = await this.prisma.householdMember.findMany({ where: { householdId: pet.householdId }, select: { userId: true } });
    await Promise.all(
      members.map((member) =>
        this.orchestrator.notify({
          userId: member.userId,
          type,
          category: NotificationCategory.INSURANCE,
          priority: NotificationPriority.NORMAL,
          templateParams,
          householdId: pet.householdId,
          petId,
          entityType: "InsuranceApplication",
          entityId: applicationId,
          domainEventId,
        }),
      ),
    );
  }

  @OnEvent("InsuranceApplicationSubmitted")
  onSubmitted(payload: { petId: string; applicationId: string }, domainEventId: string): Promise<void> {
    return this.safely("InsuranceApplicationSubmitted", async () => {
      const application = await this.prisma.insuranceApplication.findUnique({
        where: { id: payload.applicationId },
        include: { pet: true, product: { include: { provider: true } } },
      });
      if (!application) return;
      await this.notifyHousehold(
        payload.petId,
        "insurance.application_submitted",
        { petName: application.pet.name, providerName: application.product.provider.name },
        payload.applicationId,
        domainEventId,
      );
    });
  }

  @OnEvent("InsuranceApplicationStatusChanged")
  onStatusChanged(payload: { petId: string; applicationId: string; from: string; to: string }, domainEventId: string): Promise<void> {
    return this.safely("InsuranceApplicationStatusChanged", async () => {
      const pet = await this.prisma.pet.findUnique({ where: { id: payload.petId }, select: { name: true } });
      if (!pet) return;
      await this.notifyHousehold(payload.petId, "insurance.application_status_changed", { petName: pet.name, status: payload.to }, payload.applicationId, domainEventId);
    });
  }
}
