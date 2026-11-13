import { Injectable } from "@nestjs/common";
import { HouseholdRole, SubscriptionChangeType, SubscriptionStatus } from "@prisma/client";
import type { MembershipFreeWeekOfferDto, MembershipFreeWeekStatus, MembershipOffersDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { SubscriptionService } from "./subscription.service";
import { SubscriptionGiftService } from "./subscription-gift.service";
import { householdHasPaid, userHasPaid } from "./membership-history.util";
import { verifiedPhoneOf } from "./trial-phone-claim.util";

/** Statuses from which a trial can start (the same list SubscriptionService.startTrial accepts). */
const TRIAL_FROM: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.EXPIRED];

/**
 * What a member is offered right now, decided on the server: the free week (one per account, household and verified
 * phone; no card) and the first-purchase gift (first paid purchase only). Read-only; it never starts or redeems
 * anything. The household view is for its members (only owners can act); the account view serves the first screen
 * after sign-up, before a household exists.
 */
@Injectable()
export class SubscriptionOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly subscriptions: SubscriptionService,
    private readonly gift: SubscriptionGiftService,
  ) {}

  /** The account's own trial and purchase history, shared by both views. */
  private async accountState(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { welcomeTrialConsumedAt: true, phone: true, phoneVerifiedAt: true } });
    const phone = verifiedPhoneOf(user);
    let trialUsed = Boolean(user.welcomeTrialConsumedAt);
    if (!trialUsed) {
      // Legacy: a trial started before the consumed-at columns existed (same rule as startTrial).
      trialUsed = (await this.prisma.subscriptionChange.count({ where: { type: SubscriptionChangeType.TRIAL_STARTED, initiatedByUserId: userId, subscription: { household: { welcomeTrialConsumedAt: null } } } })) > 0;
    }
    if (phone) {
      const phoneHash = this.subscriptions.phoneHash(phone);
      if (trialUsed) {
        // A trial used before phone claims existed claims the number now, so a fresh account on it gets no second one.
        await this.prisma.subscriptionTrialPhoneClaim.createMany({ data: [{ phoneHash, userId }], skipDuplicates: true });
      } else {
        trialUsed = (await this.prisma.subscriptionTrialPhoneClaim.count({ where: { phoneHash } })) > 0;
      }
    }
    return { trialUsed, phone, paid: await userHasPaid(this.prisma, userId) };
  }

  private async freeWeekBase() {
    const enabled = this.subscriptions.freeWeekEnabled();
    return { enabled, days: this.subscriptions.freeWeekDays(), plan: enabled ? await this.subscriptions.freeWeekPlan() : null };
  }

  private status(input: { trialUsed: boolean; paid: boolean; available: boolean; phone: string | null }): MembershipFreeWeekStatus {
    if (input.trialUsed) return "USED";
    if (input.paid) return "ALREADY_PAID";
    if (!input.available) return "UNAVAILABLE";
    if (!input.phone && this.settings.get<boolean>("membership.freeWeek.requireVerifiedPhone") === true) return "PHONE_REQUIRED";
    return "AVAILABLE";
  }

  async forHousehold(householdId: string, userId: string): Promise<MembershipOffersDto> {
    const [account, base, member, household] = await Promise.all([
      this.accountState(userId),
      this.freeWeekBase(),
      this.prisma.householdMember.findFirst({ where: { householdId, userId }, select: { role: true } }),
      this.prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { welcomeTrialConsumedAt: true } }),
    ]);
    const sub = await this.subscriptions.getOrCreateRaw(householdId);
    const isOwner = member?.role === HouseholdRole.OWNER;
    const householdTrialUsed = Boolean(household.welcomeTrialConsumedAt) || (await this.prisma.subscriptionTrial.count({ where: { householdId } })) > 0;
    const paid = account.paid || (await householdHasPaid(this.prisma, householdId));

    let status: MembershipFreeWeekStatus;
    if (sub.status === SubscriptionStatus.TRIALING && sub.trialEndsAt) status = "ACTIVE";
    else status = this.status({ trialUsed: account.trialUsed || householdTrialUsed, paid, available: Boolean(base.plan) && TRIAL_FROM.includes(sub.status), phone: account.phone });

    const freeWeek: MembershipFreeWeekOfferDto = {
      status,
      days: base.days,
      canStart: status === "AVAILABLE" && isOwner,
      trialUsed: status === "ACTIVE" || account.trialUsed || householdTrialUsed,
      trialEndsAt: status === "ACTIVE" ? sub.trialEndsAt!.toISOString() : null,
      plan: base.plan,
    };
    // Only an owner can buy, so only an owner is shown a code to buy with.
    return { freeWeek, firstPurchaseGift: isOwner ? await this.gift.offerFor(householdId, userId) : null };
  }

  /** Before any household (the first screen after sign-up): the free week starts with the first pet. */
  async forAccount(userId: string): Promise<MembershipOffersDto> {
    const [account, base] = await Promise.all([this.accountState(userId), this.freeWeekBase()]);
    const status = this.status({ trialUsed: account.trialUsed, paid: account.paid, available: Boolean(base.plan), phone: account.phone });
    return {
      freeWeek: { status, days: base.days, canStart: false, trialUsed: account.trialUsed, trialEndsAt: null, plan: base.plan },
      firstPurchaseGift: await this.gift.offerFor(null, userId),
    };
  }
}
