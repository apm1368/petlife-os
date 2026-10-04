import { Injectable } from "@nestjs/common";
import { BookingStatus, LedgerAccountCode, LedgerEntryDirection, PaymentIntentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import type { ClinicFinanceReportQueryDto } from "./dto/clinic-os.dto";

const MAX_WINDOW_MS = 366 * 86400e3;
const DECIMAL_ZERO = new Prisma.Decimal(0);

/**
 * The clinic's finance report — every figure is a real query over this organisation's own Bookings,
 * PaymentIntents and LedgerEntries; nothing is estimated. Amounts are decimal strings in the booking's currency.
 *
 * - `billedAmount`: completed bookings' snapshot price minus discount (what the clinic charged).
 * - `collectedOnline`: CAPTURED PaymentIntents attached to these bookings (the platform collected the cash).
 * - `ledgerPosted`: the CASH_GATEWAY_RECEIVABLE debits the ledger recorded for those same checkouts, so a
 *   mismatch with `collectedOnline` is visible rather than hidden.
 * - `payAtClinic`: completed PAY_AT_PROVIDER bookings — collected by the clinic itself, outside the platform.
 * Provider payouts/settlement do not exist yet, so no "balance owed to the clinic" is reported.
 */
@Injectable()
export class ClinicFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
  ) {}

  async report(ctx: ResolvedProviderContext, query: ClinicFinanceReportQueryDto) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.finance.reports");
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 86400e3);
    if (from >= to) throw new ValidationApiException({ from: "must be before to" });
    if (to.getTime() - from.getTime() > MAX_WINDOW_MS) throw new ValidationApiException({ to: "the window may not exceed 366 days" });

    const window = { providerOrganizationId: ctx.organizationId, startAt: { gte: from, lt: to } } satisfies Prisma.BookingWhereInput;
    const [byStatus, completed] = await Promise.all([
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where: window, _count: { _all: true } }),
      this.prisma.booking.findMany({
        where: { ...window, bookingStatus: BookingStatus.COMPLETED },
        select: { id: true, providerServiceId: true, serviceNameSnapshot: true, priceAmount: true, discountAmount: true, currency: true, paymentMode: true, paymentIntentId: true, startAt: true },
      }),
    ]);
    const statusCounts = Object.fromEntries(byStatus.map((r) => [r.bookingStatus, r._count._all]));
    const total = byStatus.reduce((n, r) => n + r._count._all, 0);

    const billed = new Map<string, Prisma.Decimal>();
    const payAtClinic = new Map<string, Prisma.Decimal>();
    const services = new Map<string, { providerServiceId: string; name: string | null; count: number; amount: Prisma.Decimal; currency: string }>();
    const daily = new Map<string, { date: string; completed: number; amount: Prisma.Decimal }>();
    for (const b of completed) {
      const currency = b.currency ?? "IRR";
      const net = (b.priceAmount ?? DECIMAL_ZERO).minus(b.discountAmount);
      billed.set(currency, (billed.get(currency) ?? DECIMAL_ZERO).plus(net));
      if (b.paymentMode === "PAY_AT_PROVIDER") payAtClinic.set(currency, (payAtClinic.get(currency) ?? DECIMAL_ZERO).plus(net));
      const svcKey = `${b.providerServiceId}:${currency}`;
      const svc = services.get(svcKey) ?? { providerServiceId: b.providerServiceId, name: b.serviceNameSnapshot, count: 0, amount: DECIMAL_ZERO, currency };
      services.set(svcKey, { ...svc, count: svc.count + 1, amount: svc.amount.plus(net) });
      const day = b.startAt.toISOString().slice(0, 10);
      const d = daily.get(day) ?? { date: day, completed: 0, amount: DECIMAL_ZERO };
      daily.set(day, { ...d, completed: d.completed + 1, amount: d.amount.plus(net) });
    }

    // Online money: every booking in the window that has an intent, whatever its booking status (a cancelled
    // booking can still have been paid and refunded).
    const withIntent = await this.prisma.booking.findMany({ where: { ...window, paymentIntentId: { not: null } }, select: { paymentIntentId: true } });
    const intents = withIntent.length
      ? await this.prisma.paymentIntent.findMany({ where: { id: { in: withIntent.map((b) => b.paymentIntentId as string) }, status: PaymentIntentStatus.CAPTURED }, select: { amount: true, currency: true, checkoutId: true } })
      : [];
    const collected = new Map<string, number>();
    for (const i of intents) collected.set(i.currency, (collected.get(i.currency) ?? 0) + i.amount);
    const ledgerRows = intents.length
      ? await this.prisma.ledgerEntry.findMany({
          where: { direction: LedgerEntryDirection.DEBIT, ledgerAccount: { code: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE }, ledgerTransaction: { referenceType: "PAYMENT", referenceId: { in: intents.map((i) => i.checkoutId) } } },
          select: { amount: true, ledgerTransaction: { select: { currency: true } } },
        })
      : [];
    const ledger = new Map<string, number>();
    for (const e of ledgerRows) ledger.set(e.ledgerTransaction.currency, (ledger.get(e.ledgerTransaction.currency) ?? 0) + e.amount);
    const refunded = await this.prisma.booking.count({ where: { ...window, paymentStatus: "REFUNDED" } });

    const money = (m: Map<string, Prisma.Decimal | number>) => [...m.entries()].map(([currency, amount]) => ({ currency, amount: amount.toString() }));
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      bookings: {
        total,
        byStatus: statusCounts,
        completed: statusCounts[BookingStatus.COMPLETED] ?? 0,
        cancelled: (statusCounts[BookingStatus.CANCELLED_BY_USER] ?? 0) + (statusCounts[BookingStatus.CANCELLED_BY_PROVIDER] ?? 0),
        noShow: statusCounts[BookingStatus.NO_SHOW] ?? 0,
        refunded,
      },
      billedAmount: money(billed),
      payAtClinic: money(payAtClinic),
      collectedOnline: money(collected),
      ledgerPosted: money(ledger),
      byService: [...services.values()].sort((a, b) => b.count - a.count).map((s) => ({ ...s, amount: s.amount.toString() })),
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, amount: d.amount.toString() })),
    };
  }
}
