import { Injectable } from "@nestjs/common";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SessionService } from "../../common/session/session.service";

/** Batch 8 — account activity groups. Only events about this person (their own User aggregate, or naming them as the actor); never another member's household activity. */
export const ACTIVITY_GROUPS = {
  SECURITY: ["UserAuthenticated", "PasswordChanged", "PasswordResetCompleted", "SessionRevoked", "OtherSessionsRevoked", "AllSessionsRevoked", "ContactChanged", "UnverifiedCredentialsCleared"],
  PRIVACY: ["ConsentChanged", "DataExportRequested", "DataExportReady", "DataExportDownloaded", "AccountDeletionRequested", "AccountDeletionCancelled", "AccountDeletionStateChanged"],
  HOUSEHOLD: ["HouseholdInvitationAccepted", "HouseholdInvitationDeclined", "HouseholdMemberLeft"],
  /** Household membership events — shown only to that household's owners, who hold its billing. */
  MEMBERSHIP: ["SubscriptionStarted", "SubscriptionRenewed", "SubscriptionRenewalFailed", "SubscriptionGraceStarted", "SubscriptionExpired", "SubscriptionPlanChanged", "SubscriptionDowngradeScheduled", "SubscriptionCancelRequested", "SubscriptionCancelReversed"],
} as const;
export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;
const ACTIVITY_TYPES: string[] = Object.values(ACTIVITY_GROUPS).flat();
const GROUP_OF = new Map<string, ActivityGroup>(Object.entries(ACTIVITY_GROUPS).flatMap(([group, types]) => types.map((type) => [type, group as ActivityGroup])));
/** Payload fields that are safe and useful to show back to the person. */
const SAFE_DETAIL_KEYS = ["method", "device", "kind", "granted", "count", "version", "isTrial", "stage", "recovered", "effectiveAt"] as const;

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService, private readonly events: DomainEventsService, private readonly sessions: SessionService) {}

  async overview(userId: string) {
    const [user, memberships, activeSessions, pendingInvitations] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, displayName: true, email: true, phone: true, avatarUrl: true, locale: true, themePreference: true, createdAt: true } }),
      this.prisma.householdMember.findMany({
        where: { userId },
        include: { household: { include: { _count: { select: { members: true, pets: true } }, subscription: { select: { status: true, currentPeriod: { select: { endAt: true } } } } } } },
      }),
      this.prisma.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.householdInvitation.count({ where: { household: { members: { some: { userId } } }, status: "PENDING", expiresAt: { gt: new Date() } } }),
    ]);
    return { user, households: memberships.map((membership) => ({ ...membership.household, role: membership.role })), security: { activeSessions }, attention: { pendingInvitations } };
  }

  async security(userId: string, currentSessionId: string | null) {
    const [user, providers, sessions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true, passwordHash: true, emailVerifiedAt: true, phoneVerifiedAt: true } }),
      this.prisma.authIdentity.findMany({ where: { userId }, select: { provider: true, email: true, createdAt: true } }),
      this.sessions.listForUser(userId, currentSessionId),
    ]);
    return {
      methods: {
        phone: { verified: Boolean(user.phone && user.phoneVerifiedAt), value: user.phone },
        email: { verified: Boolean(user.email && user.emailVerifiedAt), value: user.email },
        password: { connected: Boolean(user.passwordHash) },
        providers,
      },
      sessions,
      activity: await this.activity(userId, ["UserAuthenticated", "PasswordChanged", "PasswordResetCompleted", "SessionRevoked", "OtherSessionsRevoked", "AllSessionsRevoked", "ContactChanged", "UnverifiedCredentialsCleared"]),
    };
  }





  async activity(userId: string, types: string[] = ACTIVITY_TYPES) {
    return this.prisma.domainEvent.findMany({
      where: { type: { in: types }, OR: [{ aggregateType: "User", aggregateId: userId }, { payload: { path: ["userId"], equals: userId } }] },
      orderBy: { occurredAt: "desc" },
      take: 30,
      select: { id: true, type: true, occurredAt: true },
    });
  }

  /** Paginated (cursor = occurredAt of the last item), filterable account activity with a safe detail subset. */
  async activityPage(userId: string, options: { group?: ActivityGroup; before?: string; limit?: number }) {
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const types = options.group ? [...ACTIVITY_GROUPS[options.group]] : ACTIVITY_TYPES;
    const ownedSubscriptions = !options.group || options.group === "MEMBERSHIP"
      ? (await this.prisma.subscription.findMany({ where: { household: { members: { some: { userId, role: "OWNER" } } } }, select: { id: true } })).map((s) => s.id)
      : [];
    const rows = await this.prisma.domainEvent.findMany({
      where: {
        type: { in: types },
        OR: [
          { aggregateType: "User", aggregateId: userId },
          { payload: { path: ["userId"], equals: userId } },
          ...(ownedSubscriptions.length ? [{ aggregateType: "Subscription", aggregateId: { in: ownedSubscriptions } }] : []),
        ],
        ...(options.before ? { occurredAt: { lt: new Date(options.before) } } : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: limit + 1,
      select: { id: true, type: true, occurredAt: true, payload: true },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const detail = Object.fromEntries(SAFE_DETAIL_KEYS.filter((key) => payload[key] !== undefined && payload[key] !== null).map((key) => [key, payload[key]]));
        return { id: row.id, type: row.type, group: GROUP_OF.get(row.type) ?? "SECURITY", occurredAt: row.occurredAt, detail };
      }),
      nextCursor: rows.length > limit ? page[page.length - 1]!.occurredAt.toISOString() : null,
    };
  }


  async recordSessionRevoked(userId: string, sessionId: string) {
    await this.events.publish("SessionRevoked", { userId, sessionId }, { aggregateType: "User", aggregateId: userId });
  }

  async recordAllSessionsRevoked(userId: string, count: number) {
    await this.events.publish("AllSessionsRevoked", { userId, count }, { aggregateType: "User", aggregateId: userId });
  }

  async recordOtherSessionsRevoked(userId: string, count: number) {
    await this.events.publish("OtherSessionsRevoked", { userId, count }, { aggregateType: "User", aggregateId: userId });
  }
}
