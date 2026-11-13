import { Injectable } from "@nestjs/common";
import { ApprovalMode, ApprovalScope, LocationMode, ServiceCategory, type BookingMode, type Prisma, type TravelBookingMode } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import {
  APPROVAL_SCOPE_PARTNER,
  APPROVAL_SETTING_KEYS,
  approvalFromBookingMode,
  approvalFromStayMode,
  bookingModeFromApproval,
  resolveApprovalMode,
  stayModeFromApproval,
  type ResolvedApproval,
  type VerticalApprovalSetting,
} from "./approval-policy";

type Client = Prisma.TransactionClient | PrismaService;

/**
 * Decides INSTANT vs NEEDS_APPROVAL for one partner and flow (see approval-policy.ts for the precedence). The vertical
 * setting comes from the 30 s settings cache; the per-partner override is one indexed lookup, read through the
 * caller's transaction when there is one.
 */
@Injectable()
export class ApprovalPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  vertical(scope: ApprovalScope): VerticalApprovalSetting {
    const value = this.settings.get<string>(APPROVAL_SETTING_KEYS[scope]);
    return value === ApprovalMode.INSTANT || value === ApprovalMode.NEEDS_APPROVAL ? value : "PARTNER_CHOICE";
  }

  async override(scope: ApprovalScope, organizationId: string, client: Client = this.prisma): Promise<ApprovalMode | null> {
    const row = await client.partnerApprovalOverride.findUnique({
      where: { partnerType_organizationId_scope: { partnerType: APPROVAL_SCOPE_PARTNER[scope], organizationId, scope } },
      select: { mode: true },
    });
    return row?.mode ?? null;
  }

  async resolve(scope: ApprovalScope, organizationId: string, partnerOwnMode?: ApprovalMode | null, tx?: Prisma.TransactionClient): Promise<ResolvedApproval> {
    const override = await this.override(scope, organizationId, tx ?? this.prisma);
    return resolveApprovalMode({ override, vertical: this.vertical(scope), partnerOwnMode });
  }

  /** The booking mode a new care-service booking runs under. Pet taxi keeps its own (dispatch) rules. */
  async serviceBookingMode(service: { providerOrganizationId: string; bookingMode: BookingMode; category: ServiceCategory; locationMode: LocationMode }, tx?: Prisma.TransactionClient): Promise<BookingMode> {
    if (service.category === ServiceCategory.PET_TAXI || service.locationMode === LocationMode.TRANSPORT) return service.bookingMode;
    const { mode } = await this.resolve(ApprovalScope.SERVICE_BOOKINGS, service.providerOrganizationId, approvalFromBookingMode(service.bookingMode), tx);
    return bookingModeFromApproval(mode);
  }

  /** The booking mode a new stay runs under (the listing's own mode applies only under PARTNER_CHOICE). */
  async stayBookingMode(organizationId: string, listingMode: TravelBookingMode, tx?: Prisma.TransactionClient): Promise<TravelBookingMode> {
    const { mode } = await this.resolve(ApprovalScope.STAY_BOOKINGS, organizationId, approvalFromStayMode(listingMode), tx);
    return stayModeFromApproval(mode);
  }

  /**
   * For showing modes to members (provider profiles, stay search and detail) before anything is booked: one override
   * lookup for many partners, then the same precedence per item, so the label matches what booking will do.
   */
  async modeResolver(scope: ApprovalScope, organizationIds: string[]): Promise<(organizationId: string, partnerOwnMode: ApprovalMode | null) => ApprovalMode> {
    const ids = [...new Set(organizationIds)];
    const rows = ids.length ? await this.prisma.partnerApprovalOverride.findMany({ where: { partnerType: APPROVAL_SCOPE_PARTNER[scope], scope, organizationId: { in: ids } }, select: { organizationId: true, mode: true } }) : [];
    const overrides = new Map(rows.map((r) => [r.organizationId, r.mode]));
    const vertical = this.vertical(scope);
    return (organizationId, partnerOwnMode) => resolveApprovalMode({ override: overrides.get(organizationId) ?? null, vertical, partnerOwnMode }).mode;
  }

  async serviceModeResolver(providerOrganizationIds: string[]): Promise<(service: { providerOrganizationId: string; bookingMode: BookingMode; category: ServiceCategory; locationMode: LocationMode }) => BookingMode> {
    const resolve = await this.modeResolver(ApprovalScope.SERVICE_BOOKINGS, providerOrganizationIds);
    return (service) =>
      service.category === ServiceCategory.PET_TAXI || service.locationMode === LocationMode.TRANSPORT
        ? service.bookingMode
        : bookingModeFromApproval(resolve(service.providerOrganizationId, approvalFromBookingMode(service.bookingMode)));
  }

  async stayModeResolver(organizationIds: string[]): Promise<(listing: { organizationId: string; bookingMode: TravelBookingMode }) => TravelBookingMode> {
    const resolve = await this.modeResolver(ApprovalScope.STAY_BOOKINGS, organizationIds);
    return (listing) => stayModeFromApproval(resolve(listing.organizationId, approvalFromStayMode(listing.bookingMode)));
  }

  /** Whether a paid order for this seller waits for staff approval before the seller sees it. */
  async shopOrderNeedsApproval(sellerOrganizationId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const { mode } = await this.resolve(ApprovalScope.SHOP_ORDERS, sellerOrganizationId, null, tx);
    return mode === ApprovalMode.NEEDS_APPROVAL;
  }
}
