import { Injectable } from "@nestjs/common";
import {
  PartnerDocumentStatus,
  PartnerSubjectType,
  Prisma,
  ProviderType,
  ProviderVerificationStatus,
  SellerMembershipStatus,
  SellerOfferModerationStatus,
  SellerOfferStatus,
  SellerStatus,
  SellerVerificationStatus,
} from "@prisma/client";
import type {
  AdminPartnerKycDto,
  AdminPartnerServiceDetailDto,
  AdminPartnerServiceRowDto,
  AdminPartnerShopDetailDto,
  AdminPartnerShopRowDto,
  PaginatedDto,
} from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { allowedProviderTypes } from "../auth/admin-verticals";

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const DAY = 86400e3;
const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

export interface ServiceDirectoryQuery {
  q?: string;
  verification?: ProviderVerificationStatus;
  kind?: ProviderType;
  province?: string;
  page?: number;
  pageSize?: number;
}

export interface ShopDirectoryQuery {
  q?: string;
  verification?: SellerVerificationStatus;
  status?: SellerStatus;
  province?: string;
  page?: number;
  pageSize?: number;
}

type OpeningHour = { dayOfWeek: number; open: string; close: string };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Opening hours are display-only JSON from signup; only well-formed rows are shown. */
function openingHoursOf(value: Prisma.JsonValue | null): OpeningHour[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is OpeningHour => {
      const r = row as Record<string, unknown> | null;
      return !!r && Number.isInteger(r.dayOfWeek) && (r.dayOfWeek as number) >= 0 && (r.dayOfWeek as number) <= 6 && typeof r.open === "string" && TIME.test(r.open) && typeof r.close === "string" && TIME.test(r.close);
    })
    .map((r) => ({ dayOfWeek: r.dayOfWeek, open: r.open, close: r.close }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.open.localeCompare(b.open));
}

/**
 * The admin Partners area (owner, 2026-11-13): service businesses and shops
 * as two directories, and a full profile for each: identity, contact, KYC,
 * address, and for services the prices and calendar, for shops the hours,
 * products, offers and stock. A business that signed up as both appears in
 * both directories, each side linking to the other.
 *
 * Read-only. Decisions stay where they are audited: KYC review and private
 * document downloads on the verification screen, seller status and offer
 * moderation on their own actions. Bank details are never read here.
 */
@Injectable()
export class AdminPartnerDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listServices(admin: ResolvedAdminContext, query: ServiceDirectoryQuery): Promise<PaginatedDto<AdminPartnerServiceRowDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const and: Prisma.ProviderOrganizationWhereInput[] = [];
    // A service admin scoped to some verticals (say grooming only) sees only those businesses, as on the services screens.
    const scope = allowedProviderTypes(admin);
    if (scope) and.push({ OR: [{ type: { in: scope } }, { serviceKinds: { hasSome: scope } }] });
    if (query.verification) and.push({ verificationStatus: query.verification });
    if (query.kind) and.push({ OR: [{ type: query.kind }, { serviceKinds: { has: query.kind } }] });
    if (query.province) and.push({ locations: { some: { region: { equals: query.province, mode: "insensitive" } } } });
    if (query.q) {
      and.push({ OR: [{ name: { contains: query.q, mode: "insensitive" } }, { phone: { contains: query.q } }, { locations: { some: { city: { contains: query.q, mode: "insensitive" } } } }] });
    }
    const where: Prisma.ProviderOrganizationWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.providerOrganization.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
        include: {
          locations: { select: { city: true, region: true }, orderBy: { createdAt: "asc" }, take: 1 },
          linkedSellerOrganization: { select: { id: true, name: true, status: true, verificationStatus: true } },
          services: { select: { isActive: true } },
        },
      }),
      this.prisma.providerOrganization.count({ where }),
    ]);
    const pending = await this.pendingDocuments(PartnerSubjectType.PROVIDER, rows.map((r) => r.id));
    return toPaginatedDto(
      rows.map((o) => ({
        id: o.id,
        name: o.name,
        logoUrl: o.logoUrl,
        type: o.type,
        serviceKinds: o.serviceKinds.length ? o.serviceKinds : [o.type],
        phone: o.phone,
        city: o.locations[0]?.city ?? null,
        province: o.locations[0]?.region ?? null,
        verificationStatus: o.verificationStatus,
        submittedAt: iso(o.verificationSubmittedAt),
        isDemoRecord: o.isDemoRecord,
        activeServices: o.services.filter((s) => s.isActive).length,
        inactiveServices: o.services.filter((s) => !s.isActive).length,
        pendingDocuments: pending.get(o.id) ?? 0,
        linkedShop: o.linkedSellerOrganization ? { ...o.linkedSellerOrganization } : null,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async listShops(query: ShopDirectoryQuery): Promise<PaginatedDto<AdminPartnerShopRowDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const and: Prisma.SellerOrganizationWhereInput[] = [];
    if (query.verification) and.push({ verificationStatus: query.verification });
    if (query.status) and.push({ status: query.status });
    if (query.province) and.push({ province: { equals: query.province, mode: "insensitive" } });
    if (query.q) {
      and.push({ OR: [{ name: { contains: query.q, mode: "insensitive" } }, { supportContactPhone: { contains: query.q } }, { city: { contains: query.q, mode: "insensitive" } }] });
    }
    const where: Prisma.SellerOrganizationWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.sellerOrganization.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
        include: { linkedProviderOrganization: { select: { id: true, name: true, type: true, verificationStatus: true } } },
      }),
      this.prisma.sellerOrganization.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [offerGroups, pending] = await Promise.all([
      ids.length ? this.prisma.sellerOffer.groupBy({ by: ["sellerOrganizationId", "status", "moderationStatus"], where: { sellerOrganizationId: { in: ids } }, _count: { _all: true } }) : [],
      this.pendingDocuments(PartnerSubjectType.SELLER, ids),
    ]);
    const count = (id: string, pick: (g: (typeof offerGroups)[number]) => boolean) => offerGroups.filter((g) => g.sellerOrganizationId === id && pick(g)).reduce((n, g) => n + g._count._all, 0);
    return toPaginatedDto(
      rows.map((s) => ({
        id: s.id,
        name: s.name,
        logoUrl: s.logoUrl,
        phone: s.supportContactPhone,
        city: s.city,
        province: s.province,
        status: s.status,
        verificationStatus: s.verificationStatus,
        submittedAt: iso(s.verificationSubmittedAt),
        activeOffers: count(s.id, (g) => g.status === SellerOfferStatus.ACTIVE && g.moderationStatus === SellerOfferModerationStatus.APPROVED),
        pendingOffers: count(s.id, (g) => g.moderationStatus === SellerOfferModerationStatus.PENDING_REVIEW),
        pendingDocuments: pending.get(s.id) ?? 0,
        linkedService: s.linkedProviderOrganization ? { ...s.linkedProviderOrganization, status: null } : null,
        createdAt: s.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async serviceDetail(admin: ResolvedAdminContext, id: string): Promise<AdminPartnerServiceDetailDto> {
    const org = await this.prisma.providerOrganization.findUnique({
      where: { id },
      include: {
        locations: { orderBy: { createdAt: "asc" } },
        linkedSellerOrganization: { select: { id: true, name: true, status: true, verificationStatus: true } },
        services: {
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          include: { variants: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }, transportPricing: true },
        },
        providerUsers: { where: { removedAt: null }, orderBy: { createdAt: "asc" }, include: { user: { select: { displayName: true } } } },
      },
    });
    const scope = allowedProviderTypes(admin);
    if (!org || (scope && !scope.includes(org.type) && !org.serviceKinds.some((k) => scope.includes(k)))) throw new NotFoundApiException("Provider organization");
    const now = new Date();
    const [rules, exceptions, kyc] = await Promise.all([
      this.prisma.providerAvailabilityRule.findMany({
        where: { providerOrganizationId: id, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] },
        orderBy: [{ dayOfWeek: "asc" }, { startLocalTime: "asc" }],
        include: { location: { select: { name: true, city: true } }, providerUser: { select: { user: { select: { displayName: true } } } }, service: { select: { name: true } } },
      }),
      this.prisma.providerAvailabilityException.findMany({
        where: { providerOrganizationId: id, endAt: { gte: now }, startAt: { lte: new Date(now.getTime() + 60 * DAY) } },
        orderBy: { startAt: "asc" },
        take: 50,
        include: { providerUser: { select: { user: { select: { displayName: true } } } } },
      }),
      this.kyc(PartnerSubjectType.PROVIDER, id, org.verificationStatus, org.verificationSubmittedAt, org.verificationNote),
    ]);
    return {
      id: org.id,
      name: org.name,
      logoUrl: org.logoUrl,
      type: org.type,
      serviceKinds: org.serviceKinds.length ? org.serviceKinds : [org.type],
      phone: org.phone,
      email: org.email,
      websiteUrl: org.websiteUrl,
      description: org.description,
      isDemoRecord: org.isDemoRecord,
      createdAt: org.createdAt.toISOString(),
      kyc,
      locations: org.locations.map((l) => ({ id: l.id, name: l.name, addressLine: l.addressLine, city: l.city, province: l.region, latitude: l.latitude, longitude: l.longitude, phone: l.phone, timezone: l.timezone })),
      services: org.services.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        type: s.type,
        locationMode: s.locationMode,
        isActive: s.isActive,
        durationMinutes: s.durationMinutes,
        priceAmount: num(s.priceAmount),
        currency: s.currency,
        maxPetsPerBooking: s.maxPetsPerBooking,
        supportsDog: s.supportsDog,
        supportsCat: s.supportsCat,
        variants: s.variants.map((v) => ({ id: v.id, name: v.name, priceAmount: num(v.priceAmount), durationMinutes: v.durationMinutes, isActive: v.isActive })),
        transportPricing: s.transportPricing ? { baseFareIrr: s.transportPricing.baseFareIrr, perKmRateIrr: s.transportPricing.perKmRateIrr, isActive: s.transportPricing.isActive } : null,
      })),
      calendar: {
        rules: rules.map((r) => ({
          id: r.id,
          dayOfWeek: r.dayOfWeek,
          start: r.startLocalTime,
          end: r.endLocalTime,
          timezone: r.timezone,
          locationName: r.location.name ?? r.location.city,
          staffName: r.providerUser?.user.displayName ?? null,
          serviceName: r.service?.name ?? null,
        })),
        exceptions: exceptions.map((e) => ({ id: e.id, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), type: e.type, reason: e.reason, staffName: e.providerUser?.user.displayName ?? null })),
      },
      team: org.providerUsers.map((u) => ({ id: u.id, role: u.role, displayName: u.user.displayName, displayTitle: u.displayTitle })),
      linkedShop: org.linkedSellerOrganization ? { ...org.linkedSellerOrganization } : null,
    };
  }

  async shopDetail(id: string): Promise<AdminPartnerShopDetailDto> {
    const shop = await this.prisma.sellerOrganization.findUnique({
      where: { id },
      include: {
        linkedProviderOrganization: { select: { id: true, name: true, type: true, serviceKinds: true, verificationStatus: true } },
        memberships: { where: { status: SellerMembershipStatus.ACTIVE }, orderBy: { createdAt: "asc" }, include: { user: { select: { displayName: true } } } },
      },
    });
    if (!shop) throw new NotFoundApiException("Seller organization");
    const [offers, groups, pendingCatalogRequests, kyc] = await Promise.all([
      this.prisma.sellerOffer.findMany({
        where: { sellerOrganizationId: id },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 200,
        include: { inventoryItem: true, productVariant: { select: { sku: true, title: true, product: { select: { id: true, title: true, status: true } } } } },
      }),
      this.prisma.sellerOffer.groupBy({ by: ["status", "moderationStatus"], where: { sellerOrganizationId: id }, _count: { _all: true } }),
      this.prisma.catalogProductRequest.count({ where: { sellerOrganizationId: id, status: "PENDING_REVIEW" } }),
      this.kyc(PartnerSubjectType.SELLER, id, shop.verificationStatus, shop.verificationSubmittedAt, shop.verificationNote),
    ]);
    const counts: Record<string, number> = {};
    for (const g of groups) counts[g.status] = (counts[g.status] ?? 0) + g._count._all;
    return {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      logoUrl: shop.logoUrl,
      description: shop.description,
      phone: shop.supportContactPhone,
      email: shop.supportContactEmail,
      status: shop.status,
      createdAt: shop.createdAt.toISOString(),
      address: { province: shop.province, city: shop.city, addressLine: shop.addressLine, postalCode: shop.postalCode, latitude: shop.latitude, longitude: shop.longitude },
      openingHours: openingHoursOf(shop.openingHours),
      kyc,
      offers: {
        counts,
        pendingReview: groups.filter((g) => g.moderationStatus === SellerOfferModerationStatus.PENDING_REVIEW).reduce((n, g) => n + g._count._all, 0),
        items: offers.map((o) => ({
          id: o.id,
          productId: o.productVariant.product.id,
          productTitle: o.productVariant.product.title,
          productStatus: o.productVariant.product.status,
          variantSku: o.productVariant.sku,
          variantTitle: o.productVariant.title,
          priceAmount: o.priceAmount,
          currency: o.currency,
          status: o.status,
          moderationStatus: o.moderationStatus,
          available: o.inventoryItem ? Math.max(0, o.inventoryItem.onHand - o.inventoryItem.reserved) : null,
          updatedAt: o.updatedAt.toISOString(),
        })),
      },
      pendingCatalogRequests,
      team: shop.memberships.map((m) => ({ id: m.id, role: m.role, displayName: m.user.displayName })),
      linkedService: shop.linkedProviderOrganization ? { ...shop.linkedProviderOrganization, serviceKinds: shop.linkedProviderOrganization.serviceKinds.length ? shop.linkedProviderOrganization.serviceKinds : [shop.linkedProviderOrganization.type], status: null } : null,
    };
  }

  private async pendingDocuments(subjectType: PartnerSubjectType, ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.partnerVerificationDocument.groupBy({ by: ["subjectId"], where: { subjectType, subjectId: { in: ids }, status: PartnerDocumentStatus.PENDING }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.subjectId, r._count._all]));
  }

  private async kyc(subjectType: PartnerSubjectType, subjectId: string, status: string, submittedAt: Date | null, note: string | null): Promise<AdminPartnerKycDto> {
    const [profile, documents] = await Promise.all([
      this.prisma.partnerVerificationProfile.findUnique({ where: { subjectType_subjectId: { subjectType, subjectId } } }),
      this.prisma.partnerVerificationDocument.findMany({
        where: { subjectType, subjectId },
        orderBy: { createdAt: "desc" },
        select: { id: true, kind: true, status: true, reviewNote: true, expiresAt: true, createdAt: true, reviewedAt: true },
      }),
    ]);
    return {
      status,
      submittedAt: iso(submittedAt),
      note,
      contact: profile ? { firstName: profile.firstName, lastName: profile.lastName, mobile: profile.mobile, landline: profile.landline, websiteUrl: profile.websiteUrl, enamadId: profile.enamadId } : null,
      documents: documents.map((d) => ({ id: d.id, kind: d.kind, status: d.status, reviewNote: d.reviewNote, expiresAt: iso(d.expiresAt), uploadedAt: d.createdAt.toISOString(), reviewedAt: iso(d.reviewedAt) })),
    };
  }
}
