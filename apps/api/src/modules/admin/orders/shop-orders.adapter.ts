import { Injectable } from "@nestjs/common";
import { AdminVertical, OrderStatus, PaymentIntentStatus, Prisma, SupportLinkEntityType } from "@prisma/client";
import type { AdminOrderDetailDto, AdminOrderPaymentState, AdminOrderRowDto, AdminOrderStage } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { orderNumberOf } from "../../commerce/orders/orders.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { adminCan } from "../auth/admin-permissions";
import { canReachVertical } from "../auth/admin-verticals";
import { beforeCursor, customer, type Cursor, dateRange, hexPrefix, iso, maskAnyPhone, type OrderFilter, type OrderSectionAdapter, str, where } from "./order-adapter";

const STAGE: Record<AdminOrderStage, OrderStatus[]> = {
  OPEN: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY_FOR_FULFILLMENT],
  COMPLETED: [OrderStatus.FULFILLED, OrderStatus.PARTIALLY_REFUNDED],
  CANCELLED: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
};
const stageOf = (s: OrderStatus): AdminOrderStage => (Object.keys(STAGE) as AdminOrderStage[]).find((k) => STAGE[k].includes(s)) ?? "OPEN";
const OPEN_INTENT = [PaymentIntentStatus.PENDING, PaymentIntentStatus.AUTHORIZED, PaymentIntentStatus.REQUIRES_PAYMENT_METHOD];
const REFUNDED = [OrderStatus.REFUNDED, OrderStatus.PARTIALLY_REFUNDED];

const LIST_INCLUDE = {
  sellerOrganization: { select: { id: true, name: true } },
  user: { select: { id: true, displayName: true, phone: true } },
  items: { select: { productTitleSnapshot: true, variantTitleSnapshot: true, quantity: true }, orderBy: { createdAt: "asc" }, take: 3 },
  _count: { select: { items: true } },
  financialBreakdown: { select: { platformCommissionIrr: true, origin: true, commissionBasisPoints: true, sellerNetIrr: true } },
  fulfillments: {
    where: { sequenceNumber: 1 },
    take: 1,
    select: { status: true, deliveryResponsibility: true, deliveredAt: true, shipments: { orderBy: { sequenceNumber: "desc" }, take: 1, select: { provider: true, trackingCode: true, status: true, estimatedDeliveryAt: true, actualDeliveryAt: true } } },
  },
  checkout: { select: { paymentMethodType: true, deliveryMethod: true, promotionCode: true, paymentIntents: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, provider: true, rail: true, amount: true, createdAt: true } } } },
  marketplaceOrder: { select: { paymentSource: true } },
} satisfies Prisma.OrderInclude;
type ListRow = Prisma.OrderGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Shop orders: one row per seller order (a checkout with two sellers is two orders), marketplace orders included. */
@Injectable()
export class ShopOrdersAdapter implements OrderSectionAdapter {
  readonly section = "SHOP" as const;
  constructor(private readonly prisma: PrismaService) {}

  allowed(admin: ResolvedAdminContext) {
    return adminCan(admin, "commerce.view") && canReachVertical(admin, AdminVertical.SHOP);
  }

  private async whereOf(filter: OrderFilter): Promise<Prisma.OrderWhereInput> {
    let ids: string[] | undefined;
    const hex = hexPrefix(filter.number);
    if (filter.number) {
      ids = hex ? (await this.prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM orders WHERE replace(id::text, '-', '') LIKE ${`${hex}%`} LIMIT 200`).map((r) => r.id) : [];
    }
    return where<Prisma.OrderWhereInput>(
      ids ? { id: { in: ids } } : undefined,
      filter.status && (Object.values(OrderStatus) as string[]).includes(filter.status) ? { status: filter.status as OrderStatus } : undefined,
      filter.stage ? { status: { in: STAGE[filter.stage] } } : undefined,
      filter.payment ? this.paymentWhere(filter.payment) : undefined,
      filter.partnerId ? { sellerOrganizationId: filter.partnerId } : undefined,
      filter.customerId ? { userId: filter.customerId } : undefined,
      filter.customerIds ? { userId: { in: filter.customerIds } } : undefined,
      filter.city ? { shippingAddressSnapshot: { path: ["city"], equals: filter.city } } : undefined,
      dateRange(filter),
    );
  }

  private paymentWhere(state: AdminOrderPaymentState): Prisma.OrderWhereInput {
    const notRefunded = { status: { notIn: REFUNDED } };
    switch (state) {
      case "REFUNDED":
        return { status: OrderStatus.REFUNDED };
      case "PARTIALLY_REFUNDED":
        return { status: OrderStatus.PARTIALLY_REFUNDED };
      case "PAID":
        return { ...notRefunded, checkout: { paymentIntents: { some: { status: PaymentIntentStatus.CAPTURED } } } };
      case "PENDING":
        return { ...notRefunded, checkout: { paymentIntents: { none: { status: PaymentIntentStatus.CAPTURED }, some: { status: { in: OPEN_INTENT } } } } };
      case "FAILED":
        return { ...notRefunded, checkout: { paymentIntents: { none: { status: { in: [PaymentIntentStatus.CAPTURED, ...OPEN_INTENT] } }, some: {} } } };
      case "UNKNOWN":
        return { checkoutId: null };
      default:
        return { id: { in: [] } };
    }
  }

  private payment(o: ListRow): AdminOrderRowDto["payment"] {
    const intents = o.checkout?.paymentIntents ?? [];
    const captured = intents.find((i) => i.status === PaymentIntentStatus.CAPTURED);
    const latest = captured ?? intents[0];
    let state: AdminOrderPaymentState = "UNKNOWN";
    if (o.status === OrderStatus.REFUNDED) state = "REFUNDED";
    else if (o.status === OrderStatus.PARTIALLY_REFUNDED) state = "PARTIALLY_REFUNDED";
    else if (captured) state = "PAID";
    else if (latest && OPEN_INTENT.some((s) => s === latest.status)) state = "PENDING";
    else if (latest) state = "FAILED";
    const method = latest?.rail ?? o.checkout?.paymentMethodType ?? o.marketplaceOrder?.paymentSource ?? null;
    return { state, method, provider: latest?.provider ?? null };
  }

  private row(o: ListRow): AdminOrderRowDto {
    const f = o.fulfillments[0];
    const shipment = f?.shipments[0];
    const address = (o.shippingAddressSnapshot ?? {}) as Record<string, unknown>;
    return {
      section: "SHOP",
      id: o.id,
      number: orderNumberOf(o.id),
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      stage: stageOf(o.status),
      partner: { kind: "SELLER", id: o.sellerOrganization.id, name: o.sellerOrganization.name },
      items: o.items.map((i) => ({ name: i.productTitleSnapshot, variant: i.variantTitleSnapshot, quantity: i.quantity })),
      itemCount: o._count.items,
      customer: customer(o.user),
      amounts: { subtotalIrr: o.subtotalAmount, shippingIrr: o.deliveryAmount, discountIrr: o.discountAmount, commissionIrr: o.financialBreakdown?.platformCommissionIrr ?? null, totalIrr: o.totalAmount },
      payment: this.payment(o),
      fulfilment: { status: f?.status ?? null, method: shipment?.provider ?? o.checkout?.deliveryMethod ?? null, trackingCode: shipment?.trackingCode ?? null, scheduledAt: iso(shipment?.estimatedDeliveryAt) },
      city: str(address.city),
    };
  }

  async list(_admin: ResolvedAdminContext, filter: OrderFilter, before: Cursor | null, limit: number) {
    const rows = await this.prisma.order.findMany({
      where: { AND: [await this.whereOf(filter), beforeCursor(before)] },
      include: LIST_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map((o) => this.row(o));
  }

  async count(_admin: ResolvedAdminContext, filter: OrderFilter) {
    return this.prisma.order.count({ where: await this.whereOf(filter) });
  }

  async detail(_admin: ResolvedAdminContext, id: string): Promise<AdminOrderDetailDto | null> {
    const o = await this.prisma.order.findUnique({ where: { id }, include: LIST_INCLUDE });
    if (!o) return null;
    const [lines, events, refunds, links, cases] = await Promise.all([
      this.prisma.orderItem.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" }, select: { productTitleSnapshot: true, variantTitleSnapshot: true, skuSnapshot: true, quantity: true, unitPrice: true, totalPrice: true } }),
      this.prisma.orderStatusEvent.findMany({ where: { orderId: id }, orderBy: { createdAt: "asc" }, select: { createdAt: true, fromStatus: true, toStatus: true, actorType: true, reason: true } }),
      this.prisma.refund.findMany({ where: { OR: [{ orderId: id }, ...(o.checkout ? [{ paymentIntentId: { in: o.checkout.paymentIntents.map((p) => p.id) }, orderId: null }] : [])] }, orderBy: { createdAt: "asc" } }),
      this.prisma.supportCaseLink.findMany({ where: { entityType: SupportLinkEntityType.ORDER, entityId: id }, select: { supportCaseId: true } }),
      this.prisma.supportCase.findMany({ where: { relatedEntityType: "ORDER", relatedEntityId: id }, select: { id: true } }),
    ]);
    const caseIds = [...new Set([...links.map((l) => l.supportCaseId), ...cases.map((c) => c.id)])];
    const supportCases = caseIds.length ? await this.prisma.supportCase.findMany({ where: { id: { in: caseIds } }, select: { id: true, caseNumber: true, subject: true, status: true }, orderBy: { createdAt: "asc" } }) : [];
    const row = this.row(o);
    const address = (o.shippingAddressSnapshot ?? {}) as Record<string, unknown>;
    const f = o.fulfillments[0];
    const shipment = f?.shipments[0];
    return {
      ...row,
      lines: lines.map((l) => ({ name: l.productTitleSnapshot, variant: l.variantTitleSnapshot, sku: l.skuSnapshot, quantity: l.quantity, unitPriceIrr: l.unitPrice, totalIrr: l.totalPrice })),
      timeline: events.map((e) => ({ at: e.createdAt.toISOString(), from: e.fromStatus, to: e.toStatus, actor: e.actorType, reason: e.reason })),
      payments: (o.checkout?.paymentIntents ?? []).map((p) => ({ id: p.id, provider: p.provider, rail: p.rail, status: p.status, amountIrr: p.amount, createdAt: p.createdAt.toISOString() })),
      refunds: refunds.map((r) => ({ id: r.id, status: r.status, amountIrr: r.amount, reason: r.reason, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) })),
      shipment: shipment ? { provider: shipment.provider, status: shipment.status, trackingCode: shipment.trackingCode, estimatedDeliveryAt: iso(shipment.estimatedDeliveryAt), actualDeliveryAt: iso(shipment.actualDeliveryAt) } : null,
      address: { line: str(address.addressLine), city: str(address.city), region: str(address.region), recipient: str(address.recipient), phoneMasked: maskAnyPhone(address.phone) },
      supportCases: supportCases.map((c) => ({ id: c.id, caseNumber: c.caseNumber, subject: c.subject, status: c.status })),
      facts: [
        { key: "origin", value: o.financialBreakdown?.origin ?? (o.checkoutId ? "PET_LIFE" : "MARKETPLACE") },
        { key: "commissionRate", value: o.financialBreakdown ? o.financialBreakdown.commissionBasisPoints / 100 : null },
        { key: "sellerNet", value: o.financialBreakdown?.sellerNetIrr ?? null },
        { key: "deliveryResponsibility", value: f?.deliveryResponsibility ?? null },
        { key: "promotionCode", value: o.checkout?.promotionCode ?? null },
        { key: "cancelReason", value: o.cancelReason },
      ],
      legacyHref: `/admin/commerce/orders/${o.id}`,
    };
  }
}
