import { Injectable } from "@nestjs/common";
import { BookingStatus, FulfillmentStatus, ProductReviewStatus, ProviderReviewStatus, SellerMembershipRole, SellerMembershipStatus, SellerOfferModerationStatus, SellerOfferStatus } from "@prisma/client";
import type { BusinessMembershipsDto, BusinessOverviewDto, BusinessServiceCardDto, BusinessShopCardDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SellerLedgerService } from "../seller-finance/seller-ledger.service";
import { LOW_STOCK_THRESHOLD } from "../seller-os/seller-offer.service";

/** Bookings that still need the business (same set the provider home counts). */
const ACTIVE_BOOKINGS: BookingStatus[] = [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS];
const VISIBLE_PROVIDER_REVIEWS: ProviderReviewStatus[] = [ProviderReviewStatus.PUBLISHED, ProviderReviewStatus.APPROVED];
const VISIBLE_PRODUCT_REVIEWS: ProductReviewStatus[] = [ProductReviewStatus.PUBLISHED, ProductReviewStatus.APPROVED];
/** Seller roles that see money in the seller panel (OWNER/ADMIN satisfy every seller role there). */
const FINANCE_ROLES: SellerMembershipRole[] = [SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN, SellerMembershipRole.FINANCE];

const round1 = (n: number | null | undefined) => (typeof n === "number" ? Math.round(n * 10) / 10 : null);

/**
 * The partner's business home: every business the signed-in user belongs to (provider organizations through an
 * active ProviderUser row, shops through an ACTIVE seller membership) with what needs them today. Read-only and
 * strictly scoped to the caller's own memberships — nothing here takes an organization id from the request.
 */
@Injectable()
export class BusinessHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: SellerLedgerService,
  ) {}

  private async providerMemberships(userId: string) {
    return this.prisma.providerUser.findMany({
      where: { userId, removedAt: null },
      orderBy: { createdAt: "asc" },
      include: { providerOrganization: { select: { id: true, name: true, type: true, verificationStatus: true } } },
    });
  }

  private async sellerMemberships(userId: string) {
    return this.prisma.sellerMembership.findMany({
      where: { userId, status: SellerMembershipStatus.ACTIVE },
      orderBy: { createdAt: "asc" },
      include: { sellerOrganization: { select: { id: true, name: true, verificationStatus: true, status: true } } },
    });
  }

  private async hasHousehold(userId: string): Promise<boolean> {
    return (await this.prisma.householdMember.count({ where: { userId } })) > 0;
  }

  async memberships(userId: string): Promise<BusinessMembershipsDto> {
    const [providers, sellers, hasHousehold] = await Promise.all([this.providerMemberships(userId), this.sellerMemberships(userId), this.hasHousehold(userId)]);
    return {
      services: providers.map((m) => ({
        providerOrganizationId: m.providerOrganization.id,
        name: m.providerOrganization.name,
        type: m.providerOrganization.type as unknown as BusinessServiceCardDto["type"],
        role: m.role as unknown as BusinessServiceCardDto["role"],
        verificationStatus: m.providerOrganization.verificationStatus as unknown as BusinessServiceCardDto["verificationStatus"],
      })),
      shops: sellers.map((m) => ({
        sellerOrganizationId: m.sellerOrganization.id,
        name: m.sellerOrganization.name,
        role: m.role as unknown as BusinessShopCardDto["role"],
        verificationStatus: m.sellerOrganization.verificationStatus as unknown as BusinessShopCardDto["verificationStatus"],
        sellerStatus: m.sellerOrganization.status as unknown as BusinessShopCardDto["sellerStatus"],
      })),
      hasHousehold,
    };
  }

  async overview(userId: string, now = new Date()): Promise<BusinessOverviewDto> {
    const base = await this.memberships(userId);
    const services = await Promise.all(base.services.map((m) => this.serviceCard(m, now)));
    const shops = await Promise.all(base.shops.map((m) => this.shopCard(m)));
    return { services, shops, hasHousehold: base.hasHousehold };
  }

  private async serviceCard(m: BusinessMembershipsDto["services"][number], now: Date): Promise<BusinessServiceCardDto> {
    const orgId = m.providerOrganizationId;
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const [today, upcoming, pendingConfirmation, next, services, serviceTotal, serviceActive, ratingAgg, reviews] = await Promise.all([
      this.prisma.booking.count({ where: { providerOrganizationId: orgId, startAt: { gte: todayStart, lt: todayEnd }, bookingStatus: { in: ACTIVE_BOOKINGS } } }),
      this.prisma.booking.count({ where: { providerOrganizationId: orgId, startAt: { gte: now }, bookingStatus: { in: ACTIVE_BOOKINGS } } }),
      this.prisma.booking.count({ where: { providerOrganizationId: orgId, bookingStatus: BookingStatus.PENDING_CONFIRMATION } }),
      this.prisma.booking.findMany({
        where: { providerOrganizationId: orgId, startAt: { gte: now }, bookingStatus: { in: ACTIVE_BOOKINGS } },
        orderBy: { startAt: "asc" },
        take: 5,
        select: { id: true, startAt: true, bookingStatus: true, providerService: { select: { name: true } }, pet: { select: { name: true } } },
      }),
      this.prisma.providerService.findMany({
        where: { providerOrganizationId: orgId },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        take: 6,
        select: { id: true, name: true, durationMinutes: true, priceAmount: true, currency: true, isActive: true },
      }),
      this.prisma.providerService.count({ where: { providerOrganizationId: orgId } }),
      this.prisma.providerService.count({ where: { providerOrganizationId: orgId, isActive: true } }),
      this.prisma.providerReview.aggregate({ where: { providerOrganizationId: orgId, status: { in: VISIBLE_PROVIDER_REVIEWS } }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.providerReview.findMany({
        where: { providerOrganizationId: orgId, status: { in: VISIBLE_PROVIDER_REVIEWS } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, rating: true, body: true, createdAt: true },
      }),
    ]);
    return {
      ...m,
      counts: { today, upcoming, pendingConfirmation },
      nextBookings: next.map((b) => ({ id: b.id, startAt: b.startAt.toISOString(), status: b.bookingStatus as unknown as string, serviceName: b.providerService.name, petName: b.pet?.name ?? null })),
      services: {
        total: serviceTotal,
        active: serviceActive,
        items: services.map((s) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, priceAmount: s.priceAmount === null ? null : Number(s.priceAmount), currency: s.currency, isActive: s.isActive })),
      },
      reviews: {
        average: round1(ratingAgg._avg.rating),
        count: ratingAgg._count._all,
        latest: reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, productTitle: null, createdAt: r.createdAt.toISOString() })),
      },
    };
  }

  private async shopCard(m: BusinessMembershipsDto["shops"][number]): Promise<BusinessShopCardDto> {
    const orgId = m.sellerOrganizationId;
    const reviewWhere = { status: { in: VISIBLE_PRODUCT_REVIEWS }, orderItem: { order: { sellerOrganizationId: orgId } } };
    const [ordersToPrepare, activeOffers, offersPendingModeration, stock, ratingAgg, reviews] = await Promise.all([
      this.prisma.fulfillment.count({ where: { sellerOrgId: orgId, status: FulfillmentStatus.AWAITING_SELLER_PREPARATION } }),
      this.prisma.sellerOffer.count({ where: { sellerOrganizationId: orgId, status: SellerOfferStatus.ACTIVE } }),
      this.prisma.sellerOffer.count({ where: { sellerOrganizationId: orgId, moderationStatus: SellerOfferModerationStatus.PENDING_REVIEW } }),
      this.prisma.inventoryItem.findMany({ where: { sellerOffer: { sellerOrganizationId: orgId, status: SellerOfferStatus.ACTIVE } }, select: { onHand: true, reserved: true } }),
      this.prisma.productReview.aggregate({ where: reviewWhere, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.productReview.findMany({
        where: reviewWhere,
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, rating: true, body: true, createdAt: true, product: { select: { title: true } } },
      }),
    ]);
    const lowStockOffers = stock.filter((i) => Math.max(0, i.onHand - i.reserved) <= LOW_STOCK_THRESHOLD).length;
    // Money only for the roles that see it in the seller panel.
    const balance = FINANCE_ROLES.includes(m.role as unknown as SellerMembershipRole) ? await this.ledger.getBalance(orgId) : null;
    return {
      ...m,
      counts: { ordersToPrepare, lowStockOffers, offersPendingModeration, activeOffers },
      reviews: {
        average: round1(ratingAgg._avg.rating),
        count: ratingAgg._count._all,
        latest: reviews.map((r) => ({ id: r.id, rating: r.rating, body: r.body, productTitle: r.product.title, createdAt: r.createdAt.toISOString() })),
      },
      balance: balance ? { pendingIrr: balance.pendingIrr, availableIrr: balance.availableIrr, paidIrr: balance.paidIrr } : null,
    };
  }
}
