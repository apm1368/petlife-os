import { Injectable } from "@nestjs/common";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SessionService } from "../../common/session/session.service";

const ACTIVITY_TYPES = [
  "UserAuthenticated", "PasswordChanged", "PasswordResetCompleted", "SessionRevoked",
  "OtherSessionsRevoked", "AllSessionsRevoked", "ContactChanged", "UnverifiedCredentialsCleared", "ConsentChanged", "DataExportRequested", "DataExportReady", "DataExportDownloaded", "AccountDeletionRequested", "AccountDeletionCancelled",
  "HouseholdInvitationAccepted", "PetAccessGranted", "PetAccessChanged", "PetAccessRevoked",
];

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
