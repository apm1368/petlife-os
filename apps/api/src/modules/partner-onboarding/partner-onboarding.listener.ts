import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PartnerSubjectType, SellerOfferStatus, SellerStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PARTNER_ONBOARDING_SOURCE } from "./partner-onboarding.service";

type VerificationChanged = { subjectType: PartnerSubjectType; subjectId: string; from: string; to: string };
/** First approval only: a later re-verification must not re-open what staff or the partner switched off since. */
const FIRST_REVIEW = new Set(["SUBMITTED", "UNDER_REVIEW"]);

/**
 * When staff verify a business that came through partner signup, what the partner prepared goes live: its services
 * become bookable, and its shop becomes ACTIVE with its offers ACTIVE (each offer still needs staff moderation before
 * the public shop shows it). The event is published inside the staff transaction that holds the organization row, so
 * the work is deferred until that transaction has finished instead of waiting on its lock.
 */
@Injectable()
export class PartnerOnboardingVerificationListener {
  private readonly logger = new Logger(PartnerOnboardingVerificationListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent("AdminVerificationStatusChanged")
  onVerificationChanged(payload: VerificationChanged) {
    if (payload.to !== "VERIFIED" || !FIRST_REVIEW.has(payload.from)) return;
    void this.goLiveWhenCommitted(payload).catch((e) => this.logger.warn(`Partner go-live for ${payload.subjectType} ${payload.subjectId} failed: ${e instanceof Error ? e.message : String(e)}`));
  }

  /** Waits (briefly) until the staff transaction is visible as VERIFIED; a rolled-back decision never goes live. */
  private async goLiveWhenCommitted(payload: VerificationChanged, attempts = 20, delayMs = 250): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (await this.goLive(payload)) return;
    }
  }

  /** Returns false while the organization does not (yet) read VERIFIED. */
  async goLive(payload: VerificationChanged): Promise<boolean> {
    if (payload.subjectType === PartnerSubjectType.PROVIDER) {
      const org = await this.prisma.providerOrganization.findUnique({ where: { id: payload.subjectId }, select: { serviceKinds: true, verificationStatus: true } });
      if (!org || !org.serviceKinds.length) return true;
      if (org.verificationStatus !== "VERIFIED") return false;
      await this.prisma.providerService.updateMany({ where: { providerOrganizationId: payload.subjectId, isActive: false }, data: { isActive: true } });
      return true;
    }
    const seller = await this.prisma.sellerOrganization.findFirst({
      where: { id: payload.subjectId, businessMetadata: { path: ["source"], equals: PARTNER_ONBOARDING_SOURCE } },
      select: { id: true, status: true, verificationStatus: true },
    });
    if (!seller) return true;
    if (seller.verificationStatus !== "VERIFIED") return false;
    await this.prisma.$transaction(async (tx) => {
      if (seller.status === SellerStatus.PENDING) await tx.sellerOrganization.update({ where: { id: seller.id }, data: { status: SellerStatus.ACTIVE } });
      await tx.sellerOffer.updateMany({ where: { sellerOrganizationId: seller.id, status: SellerOfferStatus.PAUSED }, data: { status: SellerOfferStatus.ACTIVE } });
    });
    return true;
  }
}
