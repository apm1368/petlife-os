import { Injectable } from "@nestjs/common";
import { DonationStatus, Prisma } from "@prisma/client";
import type { AdminOrderDetailDto, AdminOrderPaymentState, AdminOrderRowDto, AdminOrderStage } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { adminCan } from "../auth/admin-permissions";
import { beforeCursor, customer, type Cursor, dateRange, hexPrefix, iso, type OrderFilter, type OrderSectionAdapter, shortRef, where } from "./order-adapter";

const STAGE: Record<AdminOrderStage, DonationStatus[]> = { OPEN: [DonationStatus.PENDING], COMPLETED: [DonationStatus.SUCCEEDED, DonationStatus.REFUNDED], CANCELLED: [DonationStatus.FAILED] };
const stageOf = (s: DonationStatus): AdminOrderStage => (Object.keys(STAGE) as AdminOrderStage[]).find((k) => STAGE[k].includes(s)) ?? "OPEN";
const PAYMENT: Record<DonationStatus, AdminOrderPaymentState> = { PENDING: "PENDING", SUCCEEDED: "PAID", FAILED: "FAILED", REFUNDED: "REFUNDED" };

const LIST_INCLUDE = { campaign: { select: { id: true, title: true, organization: { select: { id: true, name: true, location: true } } } } } satisfies Prisma.DonationIntentInclude;
type ListRow = Prisma.DonationIntentGetPayload<{ include: typeof LIST_INCLUDE }>;

/** Donations to shelters and rescue groups. Anonymous donors stay anonymous here too. No city: a city filter matches none. */
@Injectable()
export class DonationsAdapter implements OrderSectionAdapter {
  readonly section = "DONATIONS" as const;
  constructor(private readonly prisma: PrismaService) {}

  allowed(admin: ResolvedAdminContext) {
    return adminCan(admin, "animalSupport.view");
  }

  private async whereOf(filter: OrderFilter): Promise<Prisma.DonationIntentWhereInput> {
    let ids: string[] | undefined;
    if (filter.number) {
      const hex = hexPrefix(filter.number);
      ids = hex ? (await this.prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM donation_intents WHERE replace(id::text, '-', '') LIKE ${`${hex}%`} LIMIT 200`).map((r) => r.id) : [];
    }
    const status = filter.status && (Object.values(DonationStatus) as string[]).includes(filter.status) ? (filter.status as DonationStatus) : undefined;
    const paid = filter.payment ? (Object.keys(PAYMENT) as DonationStatus[]).filter((k) => PAYMENT[k] === filter.payment) : undefined;
    return where<Prisma.DonationIntentWhereInput>(
      ids ? { id: { in: ids } } : undefined,
      status ? { status } : undefined,
      filter.stage ? { status: { in: STAGE[filter.stage] } } : undefined,
      paid ? { status: { in: paid } } : undefined,
      filter.partnerId ? { campaign: { organizationId: filter.partnerId } } : undefined,
      filter.customerId ? { donorUserId: filter.customerId } : undefined,
      filter.customerIds ? { donorUserId: { in: filter.customerIds } } : undefined,
      filter.city ? { id: { in: [] } } : undefined,
      dateRange(filter),
    );
  }

  private async users(ids: Array<string | null>) {
    const list = ids.filter((x): x is string => !!x);
    const users = list.length ? await this.prisma.user.findMany({ where: { id: { in: [...new Set(list)] } }, select: { id: true, displayName: true, phone: true } }) : [];
    return new Map(users.map((u) => [u.id, u]));
  }

  private row(d: ListRow, users: Map<string, { id: string; displayName: string; phone: string | null }>): AdminOrderRowDto {
    return {
      section: "DONATIONS",
      id: d.id,
      number: shortRef(d.id),
      createdAt: d.createdAt.toISOString(),
      status: d.status,
      stage: stageOf(d.status),
      partner: { kind: "NGO", id: d.campaign.organization.id, name: d.campaign.organization.name },
      items: [{ name: d.campaign.title, variant: d.fundType, quantity: 1 }],
      itemCount: 1,
      customer: d.donorUserId ? customer(users.get(d.donorUserId)) : { userId: null, name: d.publicDisplayName, phoneMasked: null, anonymous: true },
      amounts: { subtotalIrr: null, shippingIrr: null, discountIrr: null, commissionIrr: null, totalIrr: d.amountIrr },
      payment: { state: PAYMENT[d.status], method: null, provider: null },
      fulfilment: { status: null, method: null, trackingCode: null, scheduledAt: null },
      city: null,
    };
  }

  async list(_admin: ResolvedAdminContext, filter: OrderFilter, before: Cursor | null, limit: number) {
    const rows = await this.prisma.donationIntent.findMany({ where: { AND: [await this.whereOf(filter), beforeCursor(before)] }, include: LIST_INCLUDE, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    const users = await this.users(rows.map((r) => r.donorUserId));
    return rows.map((d) => this.row(d, users));
  }

  async count(_admin: ResolvedAdminContext, filter: OrderFilter) {
    return this.prisma.donationIntent.count({ where: await this.whereOf(filter) });
  }

  async detail(_admin: ResolvedAdminContext, id: string): Promise<AdminOrderDetailDto | null> {
    const d = await this.prisma.donationIntent.findUnique({ where: { id }, include: LIST_INCLUDE });
    if (!d) return null;
    const [users, intents] = await Promise.all([
      this.users([d.donorUserId]),
      this.prisma.paymentIntent.findMany({ where: { checkoutId: d.checkoutId }, orderBy: { createdAt: "asc" }, include: { refunds: { orderBy: { createdAt: "asc" } } } }),
    ]);
    const row = this.row(d, users);
    const latest = intents.at(-1);
    if (latest) row.payment = { ...row.payment, provider: latest.provider, method: latest.rail };
    const timeline = [
      { at: d.createdAt.toISOString(), from: null, to: "PENDING", actor: null, reason: null },
      ...(d.succeededAt ? [{ at: d.succeededAt.toISOString(), from: "PENDING", to: "SUCCEEDED", actor: null, reason: null }] : []),
      ...(d.failedAt ? [{ at: d.failedAt.toISOString(), from: "PENDING", to: "FAILED", actor: null, reason: null }] : []),
      ...(d.refundedAt ? [{ at: d.refundedAt.toISOString(), from: "SUCCEEDED", to: "REFUNDED", actor: null, reason: null }] : []),
    ];
    return {
      ...row,
      lines: [{ name: d.campaign.title, variant: d.fundType, sku: null, quantity: 1, unitPriceIrr: d.amountIrr, totalIrr: d.amountIrr }],
      timeline,
      payments: intents.map((p) => ({ id: p.id, provider: p.provider, rail: p.rail, status: p.status, amountIrr: p.amount, createdAt: p.createdAt.toISOString() })),
      refunds: intents.flatMap((p) => p.refunds).map((r) => ({ id: r.id, status: r.status, amountIrr: r.amount, reason: r.reason, createdAt: r.createdAt.toISOString(), completedAt: iso(r.completedAt) })),
      shipment: null,
      address: null,
      supportCases: [],
      facts: [
        { key: "fundType", value: d.fundType },
        { key: "showDonorPublicly", value: d.showDonorPublicly ? "YES" : "NO" },
        { key: "organizationLocation", value: d.campaign.organization.location },
      ],
      legacyHref: "/admin/animal-support/donations",
    };
  }
}
