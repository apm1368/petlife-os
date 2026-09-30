import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrivacyRequestStatus, SupportMessageVisibility } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { StorageService } from "../storage/storage.service";
import { PetAccessService } from "../pet-access/pet-access.service";

/** How long a ready export stays downloadable before its file is deleted. */
export const EXPORT_AVAILABLE_DAYS = 7;
const WORKER_INTERVAL_MS = 60_000;
const ROW_LIMIT = 500;

/** Drops fields that are internal plumbing rather than the person's data (storage keys, hashes, tokens, cross-links to staff). */
function clean<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (/objectkey|hash|token|checksum|normalized|adminid|internal|providerUserId$/i.test(key)) continue;
    out[key] = typeof value === "object" && value !== null && !(value instanceof Date) && !Array.isArray(value) && "toFixed" in (value as object) ? String(value) : value;
  }
  return out;
}

/**
 * Batch 8 — "Get a copy of your data". A request is queued (PENDING), built
 * in the background (PROCESSING) into one JSON file in the private
 * `account-exports/` space (READY for EXPORT_AVAILABLE_DAYS), then the file
 * is deleted (EXPIRED). The download is a short-lived signed link minted per
 * request after an ownership check, and every download is recorded.
 *
 * Scope follows the same access rules as the app: health data only for pets
 * the person can currently view health for; memories only the ones they
 * wrote; support conversations without staff-internal notes; household
 * members by name only. Every list is bounded (ROW_LIMIT) — the file states
 * when a section was truncated rather than silently dropping rows.
 */
@Injectable()
export class AccountExportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountExportService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
    private readonly petAccess: PetAccessService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      this.processQueue().catch((error) => this.logger.error("Export worker tick failed", error instanceof Error ? error.stack : undefined));
    }, WORKER_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Builds pending exports and expires old ones. Returns how many exports were built. Tests call this directly. */
  async processQueue(limit = 5): Promise<number> {
    await this.expireOld();
    // A PROCESSING row older than 15 minutes was abandoned (e.g. a restart) and is retried.
    const stale = new Date(Date.now() - 15 * 60_000);
    const due = await this.prisma.dataExportRequest.findMany({
      where: { OR: [{ status: PrivacyRequestStatus.PENDING }, { status: PrivacyRequestStatus.PROCESSING, requestedAt: { lt: stale } }] },
      orderBy: { requestedAt: "asc" },
      take: limit,
      select: { id: true },
    });
    let built = 0;
    for (const row of due) if (await this.build(row.id)) built += 1;
    return built;
  }

  async build(requestId: string): Promise<boolean> {
    // Claim the row so two workers never build the same export.
    const claimed = await this.prisma.dataExportRequest.updateMany({ where: { id: requestId, status: { in: [PrivacyRequestStatus.PENDING, PrivacyRequestStatus.PROCESSING] } }, data: { status: PrivacyRequestStatus.PROCESSING } });
    if (!claimed.count) return false;
    const request = await this.prisma.dataExportRequest.findUniqueOrThrow({ where: { id: requestId } });
    try {
      const document = await this.collect(request.userId);
      const body = Buffer.from(JSON.stringify({ ...document, request: { id: request.id, requestedAt: request.requestedAt.toISOString(), generatedAt: new Date().toISOString() } }, null, 2), "utf8");
      const key = await this.storage.putAccountExport(request.userId, request.id, body);
      const readyAt = new Date();
      await this.prisma.dataExportRequest.update({
        where: { id: requestId },
        data: { status: PrivacyRequestStatus.READY, fileObjectKey: key, fileSizeBytes: body.length, readyAt, expiresAt: new Date(readyAt.getTime() + EXPORT_AVAILABLE_DAYS * 86_400_000), failureCode: null },
      });
      await this.events.publish("DataExportReady", { userId: request.userId, requestId }, { aggregateType: "User", aggregateId: request.userId });
      return true;
    } catch (error) {
      this.logger.error(`Export ${requestId} failed`, error instanceof Error ? error.stack : undefined);
      await this.prisma.dataExportRequest.update({ where: { id: requestId }, data: { status: PrivacyRequestStatus.FAILED, failureCode: "BUILD_FAILED" } });
      await this.events.publish("DataExportFailed", { userId: request.userId, requestId }, { aggregateType: "User", aggregateId: request.userId });
      return false;
    }
  }

  async createDownload(userId: string, requestId: string) {
    const request = await this.prisma.dataExportRequest.findFirst({ where: { id: requestId, userId } });
    // Someone else's export is indistinguishable from one that doesn't exist.
    if (!request || request.status !== PrivacyRequestStatus.READY || !request.fileObjectKey || (request.expiresAt && request.expiresAt <= new Date())) throw new NotFoundApiException("Export");
    const target = await this.storage.createPrivateDownloadTarget(request.fileObjectKey, { filename: `petlife-account-export-${request.requestedAt.toISOString().slice(0, 10)}.json`, contentType: "application/json" });
    await this.prisma.dataExportRequest.update({ where: { id: requestId }, data: { downloadCount: { increment: 1 }, lastDownloadedAt: new Date() } });
    await this.events.publish("DataExportDownloaded", { userId, requestId }, { aggregateType: "User", aggregateId: userId });
    return target;
  }

  private async expireOld() {
    const expired = await this.prisma.dataExportRequest.findMany({ where: { status: PrivacyRequestStatus.READY, expiresAt: { lte: new Date() } }, take: 50 });
    for (const row of expired) {
      if (row.fileObjectKey) await this.storage.deletePrivateObject(row.fileObjectKey).catch(() => undefined);
      await this.prisma.dataExportRequest.update({ where: { id: row.id }, data: { status: PrivacyRequestStatus.EXPIRED, fileObjectKey: null } });
    }
  }

  private bounded<T>(rows: T[]) {
    return { items: rows.slice(0, ROW_LIMIT), truncated: rows.length > ROW_LIMIT };
  }

  private async collect(userId: string) {
    const take = ROW_LIMIT + 1;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const memberships = await this.prisma.householdMember.findMany({
      where: { userId },
      include: { household: { include: { members: { include: { user: { select: { displayName: true } } } }, subscription: { include: { plan: { select: { code: true, nameEn: true } }, periods: { orderBy: { startAt: "desc" }, take: 24 } } } } } },
    });
    const householdIds = memberships.map((m) => m.householdId);
    const pets = await this.prisma.pet.findMany({ where: { householdId: { in: householdIds }, deletedAt: null } });

    const petSections = [];
    for (const pet of pets) {
      const access = await this.petAccess.getEffectivePermissions(pet.id, userId);
      if (!access?.canViewIdentity) continue;
      const section: Record<string, unknown> = { identity: clean(pet), yourAccess: access };
      if (access.canViewHealth) {
        const [allergies, conditions, medications, vaccination, documents, visits] = await Promise.all([
          this.prisma.allergy.findMany({ where: { petId: pet.id }, take }),
          this.prisma.condition.findMany({ where: { petId: pet.id }, take }),
          this.prisma.medication.findMany({ where: { petId: pet.id }, take }),
          this.prisma.vaccinationSummary.findUnique({ where: { petId: pet.id } }),
          this.prisma.medicalDocument.findMany({ where: { petId: pet.id, voidedAt: null }, take, select: { id: true, documentType: true, title: true, description: true, recordedAt: true, uploadedAt: true, mimeType: true, fileSizeBytes: true } }),
          this.prisma.clinicalVisit.findMany({ where: { petId: pet.id, status: "COMPLETED" }, take, select: { id: true, reasonForVisit: true, assessmentText: true, planText: true, startedAt: true, completedAt: true, providerOrganization: { select: { name: true } } } }),
        ]);
        section.health = {
          allergies: this.bounded(allergies.map(clean)),
          conditions: this.bounded(conditions.map(clean)),
          medications: this.bounded(medications.map(clean)),
          vaccinationSummary: vaccination ? clean(vaccination) : null,
          documents: { ...this.bounded(documents), note: "Document files themselves are downloaded from each pet's health record." },
          completedVisits: this.bounded(visits),
        };
      }
      section.memoriesYouWrote = this.bounded((await this.prisma.petMemory.findMany({ where: { petId: pet.id, createdByUserId: userId }, orderBy: { occurredAt: "desc" }, take })).map(clean));
      petSections.push({ petId: pet.id, name: pet.name, ...section });
    }

    const [bookings, orders, trips, travelBookings, supportCases, consents, notificationPreferences, quietHours, activity] = await Promise.all([
      this.prisma.booking.findMany({ where: { userId }, orderBy: { startAt: "desc" }, take, select: { id: true, bookingNumber: true, category: true, startAt: true, endAt: true, bookingStatus: true, paymentStatus: true, priceAmount: true, currency: true, providerOrganization: { select: { name: true } }, pet: { select: { name: true } } } }),
      this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take, select: { id: true, status: true, totalAmount: true, currency: true, createdAt: true, sellerOrganization: { select: { name: true } }, items: { select: { productTitleSnapshot: true, variantTitleSnapshot: true, quantity: true, unitPrice: true, totalPrice: true } } } }),
      this.prisma.trip.findMany({ where: { createdByUserId: userId }, orderBy: { departAt: "desc" }, take }),
      this.prisma.travelBooking.findMany({ where: { bookedByUserId: userId }, orderBy: { checkIn: "desc" }, take, select: { id: true, reference: true, status: true, checkIn: true, checkOut: true, nights: true, guests: true, totalAmountIrr: true, listing: { select: { title: true } } } }),
      this.prisma.supportCase.findMany({ where: { requesterUserId: userId }, orderBy: { createdAt: "desc" }, take, select: { caseNumber: true, subject: true, description: true, category: true, status: true, createdAt: true, resolvedAt: true, messages: { where: { visibility: SupportMessageVisibility.PUBLIC }, orderBy: { createdAt: "asc" }, select: { authorType: true, body: true, createdAt: true } } } }),
      this.prisma.userConsent.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
      this.prisma.notificationPreference.findMany({ where: { userId }, select: { category: true, channel: true, enabled: true, updatedAt: true } }),
      this.prisma.notificationQuietHours.findUnique({ where: { userId } }),
      this.prisma.domainEvent.findMany({ where: { aggregateType: "User", aggregateId: userId }, orderBy: { occurredAt: "desc" }, take, select: { type: true, occurredAt: true } }),
    ]);

    return {
      format: "PET LIFE account export v1",
      account: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        phone: user.phone,
        phoneVerified: Boolean(user.phoneVerifiedAt),
        username: user.username,
        locale: user.locale,
        theme: user.themePreference,
        createdAt: user.createdAt,
      },
      households: memberships.map((m) => ({
        id: m.householdId,
        name: m.household.name,
        city: m.household.city,
        yourRole: m.role,
        members: m.household.members.map((member) => ({ displayName: member.user.displayName, role: member.role, since: member.createdAt })),
        // Membership and billing belong to the household; only owners receive its billing history.
        subscription:
          m.household.subscription && m.role === "OWNER"
            ? { plan: m.household.subscription.plan, status: m.household.subscription.status, trialEndsAt: m.household.subscription.trialEndsAt, cancelEffectiveAt: m.household.subscription.cancelEffectiveAt, periods: m.household.subscription.periods.map(clean) }
            : m.household.subscription
              ? { plan: m.household.subscription.plan, status: m.household.subscription.status }
              : null,
      })),
      pets: petSections,
      bookings: this.bounded(bookings.map((b) => clean(b as unknown as Record<string, unknown>))),
      orders: this.bounded(orders),
      trips: this.bounded(trips.map(clean)),
      travelBookings: this.bounded(travelBookings),
      supportCases: this.bounded(supportCases),
      privacy: { consents: consents.map(clean), notificationPreferences, quietHours: quietHours ? clean(quietHours) : null },
      activity: this.bounded(activity),
    };
  }
}
