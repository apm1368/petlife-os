import { Injectable } from "@nestjs/common";
import { ConsentKind, PrivacyRequestStatus } from "@prisma/client";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SessionService } from "../../common/session/session.service";

const CONSENT_VERSION = "2026-09-25";
const EXPORT_SCOPE = ["ACCOUNT", "HOUSEHOLD", "PET_IDENTITY", "HEALTH", "MEMORIES", "ACTIVITY"] as const;
const ACTIVITY_TYPES = [
  "UserAuthenticated", "PasswordChanged", "PasswordResetCompleted", "SessionRevoked",
  "OtherSessionsRevoked", "AllSessionsRevoked", "ContactChanged", "UnverifiedCredentialsCleared", "ConsentChanged", "DataExportRequested", "AccountDeletionRequested",
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

  async privacy(userId: string) {
    const [consents, exports, deletionRequests] = await Promise.all([
      this.prisma.userConsent.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
      this.prisma.dataExportRequest.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 5 }),
      this.prisma.accountDeletionRequest.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 3 }),
    ]);
    return { consentVersion: CONSENT_VERSION, consents, exports, deletionRequests, exportIncludes: EXPORT_SCOPE };
  }

  async setConsent(userId: string, kind: "TERMS" | "PRIVACY" | "MARKETING", granted: boolean) {
    const now = new Date();
    const consent = await this.prisma.userConsent.upsert({
      where: { userId_kind_version: { userId, kind: ConsentKind[kind], version: CONSENT_VERSION } },
      create: { userId, kind: ConsentKind[kind], version: CONSENT_VERSION, grantedAt: granted ? now : null, revokedAt: granted ? null : now },
      update: { grantedAt: granted ? now : null, revokedAt: granted ? null : now },
    });
    await this.events.publish("ConsentChanged", { userId, kind, granted }, { aggregateType: "User", aggregateId: userId });
    return consent;
  }

  async requestExport(userId: string) {
    const existing = await this.prisma.dataExportRequest.findFirst({ where: { userId, status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.PROCESSING] } } });
    if (existing) return existing;
    const request = await this.prisma.dataExportRequest.create({ data: { userId, scope: [...EXPORT_SCOPE] } });
    await this.events.publish("DataExportRequested", { userId, requestId: request.id }, { aggregateType: "User", aggregateId: userId });
    return request;
  }

  async requestDeletion(userId: string, confirmation: string, reason?: string) {
    if (confirmation !== "DELETE") throw new ValidationApiException({ field: "confirmation", reason: "Type DELETE to confirm." });
    const existing = await this.prisma.accountDeletionRequest.findFirst({ where: { userId, status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.PROCESSING] } } });
    if (existing) return existing;
    const request = await this.prisma.accountDeletionRequest.create({ data: { userId, reason } });
    await this.events.publish("AccountDeletionRequested", { userId, requestId: request.id }, { aggregateType: "User", aggregateId: userId });
    return request;
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
