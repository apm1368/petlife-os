import { Inject, Injectable } from "@nestjs/common";
import { ConsentKind, HouseholdRole, PrivacyRequestStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ConsentRequiredException, DeletionBlockedException, ExportLimitReachedException, NotFoundApiException, ReauthenticationRequiredException, ValidationApiException } from "../../common/errors/api-exception";
import { OTP_PROVIDER, type OtpProvider } from "../auth/otp/otp-provider.interface";
import { verifyPassword } from "../../common/password/password-hash.util";
import { isGrantActive } from "../pet-access/pet-access.service";
import { AccountExportService, EXPORT_AVAILABLE_DAYS } from "./account-export.service";

/** The version of Terms/Privacy the product currently presents. Legal text itself lives in the CMS (Batch 7); this only versions the consent record. */
export const CONSENT_VERSION = "2026-09-25";
const REQUIRED_CONSENTS: ConsentKind[] = [ConsentKind.TERMS, ConsentKind.PRIVACY];
const EXPORTS_PER_DAY = 3;
const EXPORT_SCOPE = ["ACCOUNT", "HOUSEHOLDS", "PETS", "HEALTH_WHERE_PERMITTED", "MEMORIES_YOU_WROTE", "BOOKINGS", "ORDERS", "TRAVEL", "SUPPORT", "PRIVACY_SETTINGS", "ACTIVITY"] as const;

function maskContact(value: string): string {
  const [name, domain] = value.split("@");
  if (domain) return `${(name ?? "").slice(0, 2)}***@${domain}`;
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

/**
 * Batch 8 — Privacy Center: consents, sharing summary, exports and the
 * account-deletion request workflow. Deletion is deliberately a request,
 * never an immediate DELETE: it needs a fresh proof of identity, is refused
 * while real obligations are open (upcoming bookings, open orders/refunds/
 * disputes, partner roles, being the only owner of a shared household), and
 * then waits — cancellable — until a published retention policy exists to
 * process it against. No retention rules are invented here.
 */
@Injectable()
export class AccountPrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly exports: AccountExportService,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
  ) {}

  async overview(userId: string) {
    const [consents, exports, deletionRequests] = await Promise.all([
      this.prisma.userConsent.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
      this.prisma.dataExportRequest.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 5 }),
      this.prisma.accountDeletionRequest.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 3 }),
    ]);
    const consentState = (Object.values(ConsentKind) as ConsentKind[]).map((kind) => {
      const current = consents.find((c) => c.kind === kind && c.version === CONSENT_VERSION);
      const latest = consents.find((c) => c.kind === kind);
      return {
        kind,
        required: REQUIRED_CONSENTS.includes(kind),
        currentVersion: CONSENT_VERSION,
        granted: Boolean(current?.grantedAt && !current.revokedAt),
        grantedAt: current?.grantedAt ?? null,
        revokedAt: current?.revokedAt ?? null,
        lastRecordedVersion: latest?.version ?? null,
      };
    });
    return {
      consentVersion: CONSENT_VERSION,
      consents: consentState,
      exports: exports.map((e) => ({ id: e.id, status: e.status, requestedAt: e.requestedAt, readyAt: e.readyAt, expiresAt: e.expiresAt, fileSizeBytes: e.fileSizeBytes, downloadCount: e.downloadCount, failureCode: e.failureCode })),
      exportAvailableDays: EXPORT_AVAILABLE_DAYS,
      exportIncludes: EXPORT_SCOPE,
      deletionRequests: deletionRequests.map((d) => ({ id: d.id, status: d.status, requestedAt: d.requestedAt, cancelledAt: d.cancelledAt, completedAt: d.completedAt })),
      retention: { policyPublished: false },
    };
  }

  /** Terms and Privacy can be accepted (current version) but not withdrawn here; Marketing is freely revocable. */
  async setConsent(userId: string, kind: ConsentKind, granted: boolean) {
    if (!granted && REQUIRED_CONSENTS.includes(kind)) throw new ConsentRequiredException({ kind });
    const now = new Date();
    const consent = await this.prisma.userConsent.upsert({
      where: { userId_kind_version: { userId, kind, version: CONSENT_VERSION } },
      create: { userId, kind, version: CONSENT_VERSION, grantedAt: granted ? now : null, revokedAt: granted ? null : now },
      update: { grantedAt: granted ? now : null, revokedAt: granted ? null : now },
    });
    await this.events.publish("ConsentChanged", { userId, kind, granted, version: CONSENT_VERSION }, { aggregateType: "User", aggregateId: userId });
    return consent;
  }

  /** Who can see what: access to pets you manage that others hold, and access you hold to other households' pets. */
  async sharing(userId: string) {
    const now = new Date();
    const managed = await this.prisma.householdMember.findMany({ where: { userId, role: HouseholdRole.OWNER }, select: { householdId: true } });
    const managedHouseholds = managed.map((m) => m.householdId);
    const [given, held] = await Promise.all([
      this.prisma.petAccessGrant.findMany({
        where: { pet: { householdId: { in: managedHouseholds }, deletedAt: null }, userId: { not: userId }, revokedAt: null },
        include: { pet: { select: { id: true, name: true } }, user: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.prisma.petAccessGrant.findMany({
        where: { userId, revokedAt: null, pet: { deletedAt: null, household: { members: { none: { userId } } } } },
        include: { pet: { select: { id: true, name: true } } },
        take: 100,
      }),
    ]);
    const kindOf = (g: { reason: string | null; source: string }) => (g.reason === "EXPLICIT_VET_SHARE" ? "VET_SHARE" : g.reason?.endsWith("_BOOKING") ? "PROVIDER_BOOKING" : g.source === "TEMPORARY" ? "TEMPORARY" : "HOUSEHOLD");
    return {
      sharedByYou: given
        .filter((g) => isGrantActive(g, now))
        .map((g) => ({ grantId: g.id, pet: g.pet, person: g.user.displayName, kind: kindOf(g), canViewHealth: g.canViewHealth, startsAt: g.startsAt, expiresAt: g.expiresAt })),
      sharedWithYou: held.filter((g) => isGrantActive(g, now)).map((g) => ({ pet: g.pet, kind: kindOf(g), expiresAt: g.expiresAt })),
    };
  }

  async requestExport(userId: string) {
    const existing = await this.prisma.dataExportRequest.findFirst({ where: { userId, status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.PROCESSING] } } });
    if (existing) return { id: existing.id, status: existing.status, requestedAt: existing.requestedAt };
    const today = await this.prisma.dataExportRequest.count({ where: { userId, requestedAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= EXPORTS_PER_DAY) throw new ExportLimitReachedException();
    const request = await this.prisma.dataExportRequest.create({ data: { userId, scope: [...EXPORT_SCOPE] } });
    await this.events.publish("DataExportRequested", { userId, requestId: request.id }, { aggregateType: "User", aggregateId: userId });
    // Built right away in the background; the worker retries anything left behind.
    if (process.env.NODE_ENV !== "test") setImmediate(() => void this.exports.build(request.id).catch(() => undefined));
    return { id: request.id, status: request.status, requestedAt: request.requestedAt };
  }

  async downloadExport(userId: string, requestId: string) {
    return this.exports.createDownload(userId, requestId);
  }

  /** The consequence preview shown before deletion — and the rules the request itself enforces. */
  async deletionPreview(userId: string) {
    const now = new Date();
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId },
      include: { household: { include: { members: { select: { userId: true, role: true } }, _count: { select: { pets: { where: { deletedAt: null } } } }, subscription: { select: { status: true } } } } },
    });
    const [upcomingBookings, openOrders, openRefunds, openDisputes, activeTravel, providerRoles, sellerRoles] = await Promise.all([
      this.prisma.booking.count({ where: { userId, endAt: { gt: now }, bookingStatus: { in: ["HOLD", "PENDING_CONFIRMATION", "REQUESTED", "AWAITING_PAYMENT", "RESCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] } } }),
      this.prisma.order.count({ where: { userId, status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_FULFILLMENT"] } } }),
      this.prisma.orderRefundRequest.count({ where: { userId, status: "PENDING_REVIEW" } }),
      this.prisma.dispute.count({ where: { raisedByUserId: userId, status: { in: ["OPEN", "UNDER_REVIEW", "AWAITING_EVIDENCE"] } } }),
      this.prisma.travelBooking.count({ where: { bookedByUserId: userId, checkOut: { gt: now }, status: { in: ["HELD", "DRAFT", "AWAITING_PROVIDER", "AWAITING_PAYMENT", "CONFIRMED", "IN_PROGRESS", "MODIFIED"] } } }),
      this.prisma.providerUser.count({ where: { userId } }),
      this.prisma.sellerMembership.count({ where: { userId, status: "ACTIVE" } }),
    ]);
    const households = memberships.map((m) => {
      const others = m.household.members.filter((x) => x.userId !== userId);
      const otherOwners = others.filter((x) => x.role === HouseholdRole.OWNER).length;
      return {
        id: m.householdId,
        name: m.household.name,
        role: m.role,
        otherMembers: others.length,
        pets: m.household._count.pets,
        membershipStatus: m.household.subscription?.status ?? null,
        onlyOwnerWithOthers: m.role === HouseholdRole.OWNER && others.length > 0 && otherOwners === 0,
      };
    });
    const blockers = [
      { code: "UPCOMING_BOOKINGS", count: upcomingBookings },
      { code: "OPEN_ORDERS", count: openOrders },
      { code: "OPEN_REFUND_REQUESTS", count: openRefunds },
      { code: "OPEN_DISPUTES", count: openDisputes },
      { code: "ACTIVE_TRAVEL_BOOKINGS", count: activeTravel },
      { code: "PARTNER_ROLES", count: providerRoles + sellerRoles },
      { code: "ONLY_OWNER_OF_SHARED_HOUSEHOLD", count: households.filter((h) => h.onlyOwnerWithOthers).length },
    ].filter((b) => b.count > 0);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, email: true, emailVerifiedAt: true, phone: true, phoneVerifiedAt: true } });
    const codeContact = user.email && user.emailVerifiedAt ? user.email : user.phone && user.phoneVerifiedAt ? user.phone : null;
    return {
      households,
      blockers,
      canRequest: blockers.length === 0,
      reauth: { password: Boolean(user.passwordHash), code: codeContact ? maskContact(codeContact) : null },
      retention: { policyPublished: false },
    };
  }

  /** Sends a one-time code to the account's verified contact to confirm a deletion request. */
  async sendDeletionCode(userId: string) {
    const contact = await this.codeContact(userId);
    if (!contact) throw new ReauthenticationRequiredException({ method: "password" });
    await this.otp.sendOtp(contact);
    return { sentTo: maskContact(contact) };
  }

  async requestDeletion(userId: string, input: { confirmation: string; password?: string; code?: string; reason?: string }) {
    if (input.confirmation !== "DELETE") throw new ValidationApiException({ field: "confirmation", reason: "Type DELETE to confirm." });
    const existing = await this.prisma.accountDeletionRequest.findFirst({ where: { userId, status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.PROCESSING] } } });
    if (existing) return { id: existing.id, status: existing.status, requestedAt: existing.requestedAt };
    await this.reauthenticate(userId, input.password, input.code);
    const preview = await this.deletionPreview(userId);
    if (!preview.canRequest) throw new DeletionBlockedException({ blockers: preview.blockers });
    const request = await this.prisma.accountDeletionRequest.create({ data: { userId, reason: input.reason, impactSnapshot: { households: preview.households } as unknown as Prisma.InputJsonValue } });
    await this.events.publish("AccountDeletionRequested", { userId, requestId: request.id }, { aggregateType: "User", aggregateId: userId });
    return { id: request.id, status: request.status, requestedAt: request.requestedAt };
  }

  async cancelDeletion(userId: string, requestId: string) {
    const result = await this.prisma.accountDeletionRequest.updateMany({ where: { id: requestId, userId, status: PrivacyRequestStatus.PENDING }, data: { status: PrivacyRequestStatus.CANCELLED, cancelledAt: new Date() } });
    if (!result.count) throw new NotFoundApiException("Deletion request");
    await this.events.publish("AccountDeletionCancelled", { userId, requestId }, { aggregateType: "User", aggregateId: userId });
    return { ok: true };
  }

  private async codeContact(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, phone: true, phoneVerifiedAt: true } });
    return user.email && user.emailVerifiedAt ? user.email : user.phone && user.phoneVerifiedAt ? user.phone : null;
  }

  private async reauthenticate(userId: string, password?: string, code?: string) {
    if (password) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
      if (user.passwordHash && (await verifyPassword(user.passwordHash, password))) return;
      throw new ReauthenticationRequiredException({ method: "password" });
    }
    if (code) {
      const contact = await this.codeContact(userId);
      if (!contact) throw new ReauthenticationRequiredException({ method: "password" });
      try {
        await this.otp.verifyOtp(contact, code);
        return;
      } catch {
        throw new ReauthenticationRequiredException({ method: "code" });
      }
    }
    throw new ReauthenticationRequiredException();
  }
}
