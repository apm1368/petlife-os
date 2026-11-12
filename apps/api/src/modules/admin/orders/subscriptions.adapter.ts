import { Injectable } from "@nestjs/common";
import { HouseholdRole, Prisma, RefundStatus, SubscriptionBillingAttemptStatus } from "@prisma/client";
import type { AdminOrderDetailDto, AdminOrderPaymentState, AdminOrderRowDto, AdminOrderStage } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { adminCan } from "../auth/admin-permissions";
import { beforeCursor, customer, type Cursor, dateRange, hexPrefix, iso, type OrderFilter, type OrderSectionAdapter, shortRef, where } from "./order-adapter";

const A = SubscriptionBillingAttemptStatus;
const STAGE: Record<AdminOrderStage, SubscriptionBillingAttemptStatus[]> = { OPEN: [A.PENDING], COMPLETED: [A.SUCCEEDED], CANCELLED: [A.FAILED] };
const stageOf = (s: SubscriptionBillingAttemptStatus): AdminOrderStage => (Object.keys(STAGE) as AdminOrderStage[]).find((k) => STAGE[k].includes(s)) ?? "OPEN";
const refunded = { paymentIntent: { refunds: { some: { status: RefundStatus.SUCCEEDED } } } } satisfies Prisma.SubscriptionBillingAttemptWhereInput;

function paymentWhere(state: AdminOrderPaymentState): Prisma.SubscriptionBillingAttemptWhereInput {
  switch (state) {
    case "PAID":
      return { status: A.SUCCEEDED, NOT: refunded };
    case "REFUNDED":
      return { status: A.SUCCEEDED, ...refunded };
    case "PENDING":
      return { status: A.PENDING };
    case "FAILED":
      return { status: A.FAILED };
    default:
      return { id: { in: [] } };
  }
}

const LIST_INCLUDE = {
  subscription: { select: { id: true, status: true, householdId: true, household: { select: { name: true, city: true } }, payer: { select: { id: true, displayName: true, phone: true } } } },
  price: { select: { billingInterval: true, plan: { select: { code: true, nameFa: true, nameEn: true } } } },
  paymentIntent: { select: { id: true, provider: true, rail: true, status: true, amount: true, createdAt: true, refunds: { orderBy: { createdAt: "asc" } } } },
} satisfies Prisma.SubscriptionBillingAttemptInclude;
type ListRow = Prisma.SubscriptionBillingAttemptGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Member plan charges: one row per billing attempt (first payment, renewal, upgrade). The seller is opetlife itself. */
@Injectable()
export class SubscriptionsAdapter implements OrderSectionAdapter {
  readonly section = "SUBSCRIPTIONS" as const;
  constructor(private readonly prisma: PrismaService) {}

  allowed(admin: ResolvedAdminContext) {
    return adminCan(admin, "subscription.view");
  }

  private async whereOf(filter: OrderFilter): Promise<Prisma.SubscriptionBillingAttemptWhereInput> {
    let ids: string[] | undefined;
    if (filter.number) {
      const hex = hexPrefix(filter.number);
      ids = hex ? (await this.prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM subscription_billing_attempts WHERE replace(id::text, '-', '') LIKE ${`${hex}%`} LIMIT 200`).map((r) => r.id) : [];
    }
    const customerIds = filter.customerIds ?? (filter.customerId ? [filter.customerId] : undefined);
    const status = filter.status && (Object.values(A) as string[]).includes(filter.status) ? (filter.status as SubscriptionBillingAttemptStatus) : undefined;
    return where<Prisma.SubscriptionBillingAttemptWhereInput>(
      ids ? { id: { in: ids } } : undefined,
      status ? { status } : undefined,
      filter.stage ? { status: { in: STAGE[filter.stage] } } : undefined,
      filter.payment ? paymentWhere(filter.payment) : undefined,
      filter.partnerId ? { id: { in: [] } } : undefined,
      customerIds
        ? { subscription: { OR: [{ payerUserId: { in: customerIds } }, { payerUserId: null, household: { members: { some: { userId: { in: customerIds }, role: HouseholdRole.OWNER } } } }] } }
        : undefined,
      filter.city ? { subscription: { household: { city: { equals: filter.city, mode: "insensitive" } } } } : undefined,
      dateRange(filter),
    );
  }

  /** The payer, or the household owner when the household pays. */
  private async payers(rows: ListRow[]) {
    const need = rows.filter((r) => !r.subscription.payer).map((r) => r.subscription.householdId);
    const owners = need.length
      ? await this.prisma.householdMember.findMany({ where: { householdId: { in: [...new Set(need)] }, role: HouseholdRole.OWNER }, select: { householdId: true, user: { select: { id: true, displayName: true, phone: true } } } })
      : [];
    return new Map(owners.map((o) => [o.householdId, o.user]));
  }

  private row(a: ListRow, owners: Map<string, { id: string; displayName: string; phone: string | null }>): AdminOrderRowDto {
    const isRefunded = !!a.paymentIntent?.refunds.some((r) => r.status === RefundStatus.SUCCEEDED);
    const state: AdminOrderPaymentState = a.status === A.SUCCEEDED ? (isRefunded ? "REFUNDED" : "PAID") : a.status === A.PENDING ? "PENDING" : "FAILED";
    return {
      section: "SUBSCRIPTIONS",
      id: a.id,
      number: shortRef(a.id),
      createdAt: a.createdAt.toISOString(),
      status: a.status,
      stage: stageOf(a.status),
      partner: { kind: "PLATFORM", id: null, name: "" },
      items: [{ name: a.price?.plan.nameEn ?? "", nameFa: a.price?.plan.nameFa ?? null, variant: a.price?.billingInterval ?? null, quantity: 1 }],
      itemCount: 1,
      customer: customer(a.subscription.payer ?? owners.get(a.subscription.householdId)),
      amounts: { subtotalIrr: a.amount, shippingIrr: null, discountIrr: null, commissionIrr: null, totalIrr: a.amount },
      payment: { state, method: a.paymentIntent?.rail ?? null, provider: a.paymentIntent?.provider ?? null },
      fulfilment: { status: a.subscription.status, method: a.reason, trackingCode: null, scheduledAt: null },
      city: a.subscription.household.city,
    };
  }

  async list(_admin: ResolvedAdminContext, filter: OrderFilter, before: Cursor | null, limit: number) {
    const rows = await this.prisma.subscriptionBillingAttempt.findMany({ where: { AND: [await this.whereOf(filter), beforeCursor(before)] }, include: LIST_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    const owners = await this.payers(rows);
    return rows.map((a) => this.row(a, owners));
  }

  async count(_admin: ResolvedAdminContext, filter: OrderFilter) {
    return this.prisma.subscriptionBillingAttempt.count({ where: await this.whereOf(filter) });
  }

  async detail(_admin: ResolvedAdminContext, id: string): Promise<AdminOrderDetailDto | null> {
    const a = await this.prisma.subscriptionBillingAttempt.findUnique({ where: { id }, include: LIST_INCLUDE });
    if (!a) return null;
    const row = this.row(a, await this.payers([a]));
    const p = a.paymentIntent;
    return {
      ...row,
      lines: [{ name: row.items[0]!.name, variant: row.items[0]!.variant, sku: a.price?.plan.code ?? null, quantity: 1, unitPriceIrr: a.amount, totalIrr: a.amount }],
      timeline: [
        { at: a.createdAt.toISOString(), from: null, to: "PENDING", actor: null, reason: a.reason },
        ...(a.completedAt ? [{ at: a.completedAt.toISOString(), from: "PENDING", to: a.status, actor: null, reason: a.failureReason ?? a.failureCode }] : []),
      ],
      payments: p ? [{ id: p.id, provider: p.provider, rail: p.rail, status: p.status, amountIrr: p.amount, createdAt: p.createdAt.toISOString() }] : [],
      refunds: (p?.refunds ?? []).map((r) => ({ id: r.id, status: r.status, amountIrr: r.amount, reason: r.reason, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) })),
      shipment: null,
      address: null,
      supportCases: [],
      facts: [
        { key: "household", value: a.subscription.household.name },
        { key: "planNameFa", value: a.price?.plan.nameFa ?? null },
        { key: "billingReason", value: a.reason },
        { key: "attemptNumber", value: a.attemptNumber },
        { key: "subscriptionStatus", value: a.subscription.status },
      ],
      legacyHref: `/admin/subscriptions/households/${a.subscription.householdId}`,
    };
  }
}
