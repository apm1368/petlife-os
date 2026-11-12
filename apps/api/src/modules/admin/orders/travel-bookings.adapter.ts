import { Injectable } from "@nestjs/common";
import { AdminVertical, Prisma, SupportLinkEntityType, TravelBookingStatus } from "@prisma/client";
import type { AdminOrderDetailDto, AdminOrderPaymentState, AdminOrderRowDto, AdminOrderStage } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { adminCan } from "../auth/admin-permissions";
import { canReachVertical } from "../auth/admin-verticals";
import { beforeCursor, customer, type Cursor, dateRange, iso, type OrderFilter, type OrderSectionAdapter, where } from "./order-adapter";

const S = TravelBookingStatus;
const STAGE: Record<AdminOrderStage, TravelBookingStatus[]> = {
  OPEN: [S.HELD, S.DRAFT, S.AWAITING_PROVIDER, S.AWAITING_PAYMENT, S.CONFIRMED, S.IN_PROGRESS],
  COMPLETED: [S.COMPLETED, S.NO_SHOW],
  CANCELLED: [S.CANCELLED, S.REJECTED, S.EXPIRED, S.REFUNDED],
};
const stageOf = (s: TravelBookingStatus): AdminOrderStage => (Object.keys(STAGE) as AdminOrderStage[]).find((k) => STAGE[k].includes(s)) ?? "OPEN";
const PAYMENT: Record<string, AdminOrderPaymentState> = { NOT_REQUIRED: "NOT_REQUIRED", AWAITING: "PENDING", PAID: "PAID", FAILED: "FAILED", REFUND_PENDING: "REFUNDED", REFUNDED: "REFUNDED" };
const PAYMENT_VALUES = (state: AdminOrderPaymentState) => Object.entries(PAYMENT).filter(([, v]) => v === state).map(([k]) => k);

const LIST_INCLUDE = {
  listing: { select: { id: true, title: true, city: true, province: true, address: true, type: true, organization: { select: { id: true, name: true } } } },
  unit: { select: { name: true } },
} satisfies Prisma.TravelBookingInclude;
type ListRow = Prisma.TravelBookingGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Pet-friendly stays booked on opetlife (external travel sources take no bookings). Modified originals stay hidden. */
@Injectable()
export class TravelBookingsAdapter implements OrderSectionAdapter {
  readonly section = "TRAVEL" as const;
  constructor(private readonly prisma: PrismaService) {}

  allowed(admin: ResolvedAdminContext) {
    return adminCan(admin, "travel.view") && canReachVertical(admin, AdminVertical.ACCOMMODATION);
  }

  private whereOf(filter: OrderFilter): Prisma.TravelBookingWhereInput {
    const status = filter.status && (Object.values(S) as string[]).includes(filter.status) ? (filter.status as TravelBookingStatus) : undefined;
    return where<Prisma.TravelBookingWhereInput>(
      status ? { status } : { status: { not: S.MODIFIED } },
      filter.number ? { reference: { contains: filter.number, mode: "insensitive" } } : undefined,
      filter.stage ? { status: { in: STAGE[filter.stage] } } : undefined,
      filter.payment ? { paymentStatus: { in: PAYMENT_VALUES(filter.payment) } } : undefined,
      filter.partnerId ? { listing: { organizationId: filter.partnerId } } : undefined,
      filter.customerId ? { bookedByUserId: filter.customerId } : undefined,
      filter.customerIds ? { bookedByUserId: { in: filter.customerIds } } : undefined,
      filter.city ? { listing: { city: { equals: filter.city, mode: "insensitive" } } } : undefined,
      dateRange(filter),
    );
  }

  private async users(ids: string[]) {
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, displayName: true, phone: true } }) : [];
    return new Map(users.map((u) => [u.id, u]));
  }

  private row(b: ListRow, users: Map<string, { id: string; displayName: string; phone: string | null }>): AdminOrderRowDto {
    return {
      section: "TRAVEL",
      id: b.id,
      number: b.reference,
      createdAt: b.createdAt.toISOString(),
      status: b.status,
      stage: stageOf(b.status),
      partner: { kind: "PROVIDER", id: b.listing.organization.id, name: b.listing.organization.name },
      items: [{ name: b.listing.title, variant: b.unit.name, quantity: b.nights }],
      itemCount: 1,
      customer: customer(users.get(b.bookedByUserId)),
      amounts: { subtotalIrr: b.baseAmountIrr + b.petFeeAmountIrr, shippingIrr: null, discountIrr: b.discountAmountIrr, commissionIrr: null, totalIrr: b.totalAmountIrr },
      payment: { state: PAYMENT[b.paymentStatus] ?? "UNKNOWN", method: b.payNowAmountIrr > 0 && b.payNowAmountIrr < b.totalAmountIrr ? "DEPOSIT" : b.payNowAmountIrr > 0 ? "FULL_PREPAYMENT" : "PAY_AT_PROPERTY", provider: null },
      fulfilment: { status: b.status, method: b.listing.type, trackingCode: null, scheduledAt: b.checkIn.toISOString() },
      city: b.listing.city,
    };
  }

  async list(_admin: ResolvedAdminContext, filter: OrderFilter, before: Cursor | null, limit: number) {
    const rows = await this.prisma.travelBooking.findMany({ where: { AND: [this.whereOf(filter), beforeCursor(before)] }, include: LIST_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    const users = await this.users(rows.map((r) => r.bookedByUserId));
    return rows.map((b) => this.row(b, users));
  }

  count(_admin: ResolvedAdminContext, filter: OrderFilter) {
    return this.prisma.travelBooking.count({ where: this.whereOf(filter) });
  }

  async detail(_admin: ResolvedAdminContext, id: string): Promise<AdminOrderDetailDto | null> {
    const b = await this.prisma.travelBooking.findUnique({ where: { id }, include: LIST_INCLUDE });
    if (!b) return null;
    const [users, events, intent, links, cases, pets] = await Promise.all([
      this.users([b.bookedByUserId]),
      this.prisma.travelBookingEvent.findMany({ where: { bookingId: id }, orderBy: { createdAt: "asc" }, select: { createdAt: true, fromStatus: true, toStatus: true, actorType: true, reason: true } }),
      b.paymentIntentId ? this.prisma.paymentIntent.findUnique({ where: { id: b.paymentIntentId }, include: { refunds: { orderBy: { createdAt: "asc" } } } }) : null,
      this.prisma.supportCaseLink.findMany({ where: { entityType: SupportLinkEntityType.TRAVEL_BOOKING, entityId: id }, select: { supportCaseId: true } }),
      this.prisma.supportCase.findMany({ where: { relatedEntityType: "TRAVEL_BOOKING", relatedEntityId: id }, select: { id: true } }),
      this.prisma.travelBookingPet.count({ where: { bookingId: id } }),
    ]);
    const caseIds = [...new Set([...links.map((l) => l.supportCaseId), ...cases.map((c) => c.id)])];
    const supportCases = caseIds.length ? await this.prisma.supportCase.findMany({ where: { id: { in: caseIds } }, select: { id: true, caseNumber: true, subject: true, status: true } }) : [];
    const row = this.row(b, users);
    if (intent) row.payment = { ...row.payment, provider: intent.provider };
    return {
      ...row,
      lines: [
        { name: `${b.listing.title} · ${b.unit.name}`, variant: null, sku: null, quantity: b.nights, unitPriceIrr: b.nights ? Math.round(b.baseAmountIrr / b.nights) : null, totalIrr: b.baseAmountIrr },
        ...(b.petFeeAmountIrr ? [{ name: "PET_FEE", variant: null, sku: null, quantity: pets, unitPriceIrr: null, totalIrr: b.petFeeAmountIrr }] : []),
      ],
      timeline: events.map((e) => ({ at: e.createdAt.toISOString(), from: e.fromStatus, to: e.toStatus, actor: e.actorType, reason: e.reason })),
      payments: intent ? [{ id: intent.id, provider: intent.provider, rail: intent.rail, status: intent.status, amountIrr: intent.amount, createdAt: intent.createdAt.toISOString() }] : [],
      refunds: (intent?.refunds ?? []).map((r) => ({ id: r.id, status: r.status, amountIrr: r.amount, reason: r.reason, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) })),
      shipment: null,
      address: { line: b.listing.address, city: b.listing.city, region: b.listing.province, recipient: null, phoneMasked: null },
      supportCases: supportCases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status })),
      facts: [
        { key: "checkIn", value: b.checkIn.toISOString() },
        { key: "checkOut", value: b.checkOut.toISOString() },
        { key: "nights", value: b.nights },
        { key: "guests", value: b.guests },
        { key: "pets", value: pets },
        { key: "payNow", value: b.payNowAmountIrr },
        { key: "refunded", value: b.refundAmountIrr || null },
        { key: "cancelReason", value: b.cancelReason },
      ],
      legacyHref: `/admin/travel/bookings/${b.id}`,
    };
  }
}
