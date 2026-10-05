import { Injectable } from "@nestjs/common";
import { ProviderUserRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ClinicStaffAlreadyMemberException, NotFoundApiException, SubscriptionEntitlementLimitExceededException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import type { AddClinicBranchDto, AddClinicStaffDto } from "./dto/clinic-os.dto";

const ROLE_LABEL = { fa: { VET: "دامپزشک", STAFF: "کارمند" }, en: { VET: "vet", STAFF: "staff member" } } as const;

/**
 * Team seats and branches under the clinic plan's LIMIT entitlements (`clinic.staff.max`,
 * `clinic.branches.max`; null = unlimited). Every member row counts as a seat, owners included. The count and
 * the insert run under a row lock on the organisation, so two concurrent adds can never both take the last
 * seat. Existing rows above a limit are never removed — the limit only stops new additions.
 */
@Injectable()
export class ClinicTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  async listStaff(ctx: ResolvedProviderContext) {
    const [rows, resolved] = await Promise.all([
      this.prisma.providerUser.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, displayTitle: true, createdAt: true, user: { select: { displayName: true } } } }),
      this.entitlements.resolve(ctx.organizationId),
    ]);
    return {
      items: rows.map((r) => ({ providerUserId: r.id, displayName: r.user.displayName, role: r.role, displayTitle: r.displayTitle, joinedAt: r.createdAt.toISOString() })),
      usage: { used: rows.length, limit: resolved.entitlements["clinic.staff.max"]?.limit ?? null },
    };
  }

  async addStaff(ctx: ResolvedProviderContext, dto: AddClinicStaffDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, select: { id: true } });
    if (!user) throw new NotFoundApiException("User");
    // Resolve the plan first: it may lazily create the subscription row (an FK to the organisation), which must
    // not wait on the organisation lock taken below.
    const staffLimit = (await this.entitlements.resolve(ctx.organizationId)).entitlements["clinic.staff.max"]?.limit ?? null;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "provider_organizations" WHERE id = ${ctx.organizationId}::uuid FOR NO KEY UPDATE`;
      if (await tx.providerUser.count({ where: { providerOrganizationId: ctx.organizationId, userId: user.id } })) throw new ClinicStaffAlreadyMemberException();
      const used = await tx.providerUser.count({ where: { providerOrganizationId: ctx.organizationId } });
      assertBelow("clinic.staff.max", staffLimit, used);
      const row = await tx.providerUser.create({ data: { userId: user.id, providerOrganizationId: ctx.organizationId, role: dto.role === "VET" ? ProviderUserRole.VET : ProviderUserRole.STAFF, displayTitle: dto.displayTitle?.trim() || null } });
      await this.events.publish("ClinicStaffAdded", { providerOrganizationId: ctx.organizationId, providerUserId: row.id, addedByProviderUserId: ctx.providerUserId }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
      return row;
    });
    const locale = (await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { locale: true } })).locale === "en" ? "en" : "fa";
    await this.notifications.notify({
      userId: user.id,
      type: "clinic.staff_added",
      category: "SYSTEM",
      deepLink: NotificationDeepLinks.providerHome(),
      entityType: "ProviderUser",
      entityId: created.id,
      actorType: "PROVIDER_ORGANIZATION",
      actorId: ctx.organizationId,
      templateParams: { clinic: ctx.organizationName, role: ROLE_LABEL[locale][dto.role] },
    });
    return this.listStaff(ctx);
  }

  async listBranches(ctx: ResolvedProviderContext) {
    const [rows, resolved] = await Promise.all([
      this.prisma.providerLocation.findMany({ where: { providerOrganizationId: ctx.organizationId }, orderBy: { createdAt: "asc" } }),
      this.entitlements.resolve(ctx.organizationId),
    ]);
    return {
      items: rows.map((l) => ({ id: l.id, name: l.name, addressLine: l.addressLine, city: l.city, region: l.region, latitude: l.latitude, longitude: l.longitude, phone: l.phone, timezone: l.timezone })),
      usage: { used: rows.length, limit: resolved.entitlements["clinic.branches.max"]?.limit ?? null },
    };
  }

  async addBranch(ctx: ResolvedProviderContext, dto: AddClinicBranchDto) {
    const branchLimit = (await this.entitlements.resolve(ctx.organizationId)).entitlements["clinic.branches.max"]?.limit ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "provider_organizations" WHERE id = ${ctx.organizationId}::uuid FOR NO KEY UPDATE`;
      const used = await tx.providerLocation.count({ where: { providerOrganizationId: ctx.organizationId } });
      assertBelow("clinic.branches.max", branchLimit, used);
      const row = await tx.providerLocation.create({
        data: { providerOrganizationId: ctx.organizationId, name: dto.name.trim(), addressLine: dto.addressLine.trim(), city: dto.city.trim(), region: dto.region?.trim() || null, latitude: dto.latitude ?? null, longitude: dto.longitude ?? null, phone: dto.phone?.trim() || null, countryCode: "IR", timezone: "Asia/Tehran" },
      });
      await this.events.publish("ClinicBranchAdded", { providerOrganizationId: ctx.organizationId, locationId: row.id }, { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId, tx });
    });
    return this.listBranches(ctx);
  }
}

/** null = unlimited; otherwise `used` must still be below the plan's limit before adding one more. */
function assertBelow(key: string, limit: number | null, used: number) {
  if (limit !== null && used >= limit) throw new SubscriptionEntitlementLimitExceededException({ key, limit, used, context: "CLINIC" });
}
