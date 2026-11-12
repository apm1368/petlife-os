import { Injectable } from "@nestjs/common";
import { BookingPaymentMode, BookingStatus, PaymentStatus, Prisma, SupportLinkEntityType } from "@prisma/client";
import type { AdminOrderDetailDto, AdminOrderPaymentState, AdminOrderRowDto, AdminOrderStage } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { adminCan } from "../auth/admin-permissions";
import { allowedProviderTypes } from "../auth/admin-verticals";
import { beforeCursor, customer, type Cursor, dateRange, iso, irr, type OrderFilter, type OrderSectionAdapter, shortRef, where } from "./order-adapter";

const STAGE: Record<AdminOrderStage, BookingStatus[]> = {
  OPEN: [BookingStatus.HOLD, BookingStatus.PENDING_CONFIRMATION, BookingStatus.REQUESTED, BookingStatus.AWAITING_PAYMENT, BookingStatus.RESCHEDULED, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS],
  COMPLETED: [BookingStatus.COMPLETED],
  CANCELLED: [BookingStatus.REJECTED, BookingStatus.EXPIRED, BookingStatus.CANCELLED_BY_USER, BookingStatus.CANCELLED_BY_PROVIDER, BookingStatus.NO_SHOW],
};
const stageOf = (s: BookingStatus): AdminOrderStage => (Object.keys(STAGE) as AdminOrderStage[]).find((k) => STAGE[k].includes(s)) ?? "OPEN";

function paymentState(status: PaymentStatus, mode: BookingPaymentMode): AdminOrderPaymentState {
  switch (status) {
    case PaymentStatus.PAID:
    case PaymentStatus.AUTHORIZED:
      return "PAID";
    case PaymentStatus.PENDING:
      return "PENDING";
    case PaymentStatus.FAILED:
      return "FAILED";
    case PaymentStatus.REFUND_PENDING:
    case PaymentStatus.REFUNDED:
      return "REFUNDED";
    default:
      return mode === BookingPaymentMode.PAY_AT_PROVIDER ? "ON_ARRIVAL" : "NOT_REQUIRED";
  }
}
function paymentWhere(state: AdminOrderPaymentState): Prisma.BookingWhereInput {
  switch (state) {
    case "PAID":
      return { paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] } };
    case "PENDING":
      return { paymentStatus: PaymentStatus.PENDING };
    case "FAILED":
      return { paymentStatus: PaymentStatus.FAILED };
    case "REFUNDED":
      return { paymentStatus: { in: [PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED] } };
    case "ON_ARRIVAL":
      return { paymentStatus: PaymentStatus.NOT_REQUIRED, paymentMode: BookingPaymentMode.PAY_AT_PROVIDER };
    case "NOT_REQUIRED":
      return { paymentStatus: PaymentStatus.NOT_REQUIRED, paymentMode: { not: BookingPaymentMode.PAY_AT_PROVIDER } };
    default:
      return { id: { in: [] } };
  }
}

const LIST_INCLUDE = {
  providerOrganization: { select: { id: true, name: true, type: true } },
  providerLocation: { select: { name: true, city: true, region: true, addressLine: true } },
  user: { select: { id: true, displayName: true, phone: true } },
  pet: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;
type ListRow = Prisma.BookingGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Vet, grooming, training, boarding… bookings, scoped to the provider types this admin's verticals reach. */
@Injectable()
export class ServiceBookingsAdapter implements OrderSectionAdapter {
  readonly section = "SERVICES" as const;
  constructor(private readonly prisma: PrismaService) {}

  allowed(admin: ResolvedAdminContext) {
    const types = allowedProviderTypes(admin);
    return adminCan(admin, "services.view") && (types === null || types.length > 0);
  }

  private whereOf(admin: ResolvedAdminContext, filter: OrderFilter): Prisma.BookingWhereInput {
    const types = allowedProviderTypes(admin);
    const number = filter.number?.replace(/^PL-B-/, "");
    return where<Prisma.BookingWhereInput>(
      types === null ? undefined : { providerOrganization: { type: { in: types } } },
      filter.number ? { bookingNumber: { contains: number, mode: "insensitive" } } : undefined,
      filter.status && (Object.values(BookingStatus) as string[]).includes(filter.status) ? { bookingStatus: filter.status as BookingStatus } : undefined,
      filter.stage ? { bookingStatus: { in: STAGE[filter.stage] } } : undefined,
      filter.payment ? paymentWhere(filter.payment) : undefined,
      filter.partnerId ? { providerOrganizationId: filter.partnerId } : undefined,
      filter.customerId ? { userId: filter.customerId } : undefined,
      filter.customerIds ? { userId: { in: filter.customerIds } } : undefined,
      filter.city ? { providerLocation: { city: { equals: filter.city, mode: "insensitive" } } } : undefined,
      dateRange(filter),
    );
  }

  private row(b: ListRow): AdminOrderRowDto {
    const price = irr(b.priceAmount);
    const discount = irr(b.discountAmount) ?? 0;
    return {
      section: "SERVICES",
      id: b.id,
      number: b.bookingNumber ?? shortRef(b.id),
      createdAt: b.createdAt.toISOString(),
      status: b.bookingStatus,
      stage: stageOf(b.bookingStatus),
      partner: { kind: "PROVIDER", id: b.providerOrganization.id, name: b.providerOrganization.name },
      items: [{ name: b.serviceNameSnapshot ?? b.category, variant: b.variantNameSnapshot, quantity: 1 }],
      itemCount: 1,
      customer: customer(b.user),
      amounts: { subtotalIrr: price, shippingIrr: null, discountIrr: discount, commissionIrr: null, totalIrr: Math.max(0, (price ?? 0) - discount) },
      payment: { state: paymentState(b.paymentStatus, b.paymentMode), method: b.paymentMode, provider: null },
      fulfilment: { status: b.bookingStatus, method: b.locationMode, trackingCode: null, scheduledAt: b.startAt.toISOString() },
      city: b.providerLocation.city,
    };
  }

  async list(admin: ResolvedAdminContext, filter: OrderFilter, before: Cursor | null, limit: number) {
    const rows = await this.prisma.booking.findMany({ where: { AND: [this.whereOf(admin, filter), beforeCursor(before)] }, include: LIST_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.map((b) => this.row(b));
  }

  count(admin: ResolvedAdminContext, filter: OrderFilter) {
    return this.prisma.booking.count({ where: this.whereOf(admin, filter) });
  }

  async detail(admin: ResolvedAdminContext, id: string): Promise<AdminOrderDetailDto | null> {
    const b = await this.prisma.booking.findFirst({ where: { AND: [{ id }, this.whereOf(admin, {})] }, include: LIST_INCLUDE });
    if (!b) return null;
    const [events, intent, links, cases] = await Promise.all([
      this.prisma.bookingStatusEvent.findMany({ where: { bookingId: id }, orderBy: { createdAt: "asc" }, select: { createdAt: true, fromStatus: true, toStatus: true, actorType: true, reason: true } }),
      b.paymentIntentId ? this.prisma.paymentIntent.findUnique({ where: { id: b.paymentIntentId }, include: { refunds: { orderBy: { createdAt: "asc" } } } }) : null,
      this.prisma.supportCaseLink.findMany({ where: { entityType: SupportLinkEntityType.BOOKING, entityId: id }, select: { supportCaseId: true } }),
      this.prisma.supportCase.findMany({ where: { relatedEntityType: "BOOKING", relatedEntityId: id }, select: { id: true } }),
    ]);
    const caseIds = [...new Set([...links.map((l) => l.supportCaseId), ...cases.map((c) => c.id)])];
    const supportCases = caseIds.length ? await this.prisma.supportCase.findMany({ where: { id: { in: caseIds } }, select: { id: true, caseNumber: true, subject: true, status: true } }) : [];
    const row = this.row(b);
    if (intent) row.payment = { ...row.payment, provider: intent.provider };
    return {
      ...row,
      lines: [{ name: row.items[0]!.name, variant: row.items[0]!.variant, sku: null, quantity: 1, unitPriceIrr: row.amounts.subtotalIrr, totalIrr: row.amounts.totalIrr }],
      timeline: events.map((e) => ({ at: e.createdAt.toISOString(), from: e.fromStatus, to: e.toStatus, actor: e.actorType, reason: e.reason })),
      payments: intent ? [{ id: intent.id, provider: intent.provider, rail: intent.rail, status: intent.status, amountIrr: intent.amount, createdAt: intent.createdAt.toISOString() }] : [],
      refunds: (intent?.refunds ?? []).map((r) => ({ id: r.id, status: r.status, amountIrr: r.amount, reason: r.reason, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) })),
      shipment: null,
      address: { line: b.providerLocation.addressLine, city: b.providerLocation.city, region: b.providerLocation.region, recipient: b.providerLocation.name, phoneMasked: null },
      supportCases: supportCases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status })),
      facts: [
        { key: "category", value: b.category },
        { key: "pet", value: b.pet?.name ?? null },
        { key: "startsAt", value: b.startAt.toISOString() },
        { key: "durationMinutes", value: b.durationMinutes },
        { key: "deposit", value: irr(b.depositAmount) },
        { key: "cancelReason", value: b.cancelledReason ?? null },
      ],
      legacyHref: `/admin/services/bookings/${b.id}`,
    };
  }
}
