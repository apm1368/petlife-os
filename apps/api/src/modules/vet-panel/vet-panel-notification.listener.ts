import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationCategory } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

/**
 * The five moments a household genuinely wants to hear about, and no others.
 *
 * Everything this handoff records is *also* a notifiable event in principle —
 * every vitals reading, every treatment task, every problem-list change — and
 * notifying on any of them would train owners to ignore the channel while a
 * clinic is mid-procedure. So the listener fires only where the household has
 * something to do or something to worry about: an estimate needs their
 * decision, an admission and a discharge change where their animal is, a
 * discharge summary is the instructions they act on at home, and a
 * prescription is a regimen they have to administer.
 *
 * Fan-out and idempotency follow ClinicalHealthNotificationListener exactly:
 * every household member, keyed on the originating `DomainEvent.id` so a
 * duplicated event can never produce a duplicated notification.
 */
@Injectable()
export class VetPanelNotificationListener {
  private readonly logger = new Logger(VetPanelNotificationListener.name);

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

  private async notifyHousehold(petId: string, type: string, entityType: string, entityId: string, domainEventId: string): Promise<void> {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { name: true, householdId: true } });
    if (!pet) return;
    const members = await this.prisma.householdMember.findMany({ where: { householdId: pet.householdId }, select: { userId: true } });
    await Promise.all(
      members.map((member) =>
        this.orchestrator.notify({
          userId: member.userId,
          type,
          category: NotificationCategory.HEALTH,
          templateParams: { petName: pet.name },
          householdId: pet.householdId,
          entityType,
          entityId,
          domainEventId,
        }),
      ),
    );
  }

  @OnEvent("ClinicalEstimatePresented")
  onEstimatePresented(payload: { petId: string; estimateId: string }, domainEventId: string): Promise<void> {
    return this.safely("ClinicalEstimatePresented", () =>
      this.notifyHousehold(payload.petId, "clinical.estimate_presented", "ClinicalEstimate", payload.estimateId, domainEventId),
    );
  }

  @OnEvent("PatientAdmitted")
  onAdmitted(payload: { petId: string; hospitalizationId: string }, domainEventId: string): Promise<void> {
    return this.safely("PatientAdmitted", () =>
      this.notifyHousehold(payload.petId, "clinical.patient_admitted", "Hospitalization", payload.hospitalizationId, domainEventId),
    );
  }

  @OnEvent("PatientDischarged")
  onDischarged(payload: { petId: string; hospitalizationId: string }, domainEventId: string): Promise<void> {
    return this.safely("PatientDischarged", () =>
      this.notifyHousehold(payload.petId, "clinical.patient_discharged", "Hospitalization", payload.hospitalizationId, domainEventId),
    );
  }

  @OnEvent("DischargeSummaryIssued")
  onDischargeSummaryIssued(payload: { petId: string; dischargeSummaryId: string }, domainEventId: string): Promise<void> {
    return this.safely("DischargeSummaryIssued", () =>
      this.notifyHousehold(payload.petId, "clinical.discharge_summary_issued", "DischargeSummary", payload.dischargeSummaryId, domainEventId),
    );
  }

  @OnEvent("PrescriptionIssued")
  onPrescriptionIssued(payload: { petId: string; prescriptionId: string }, domainEventId: string): Promise<void> {
    return this.safely("PrescriptionIssued", () =>
      this.notifyHousehold(payload.petId, "clinical.prescription_issued", "Prescription", payload.prescriptionId, domainEventId),
    );
  }
}
