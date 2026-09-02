import { Injectable } from "@nestjs/common";
import type { AdminOrderFinancialsDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { OrderNotFoundException } from "../../../common/errors/api-exception";

/**
 * Read-only financial inspection (spec: "minimal finance/transaction
 * visibility — read-only PaymentIntent/PaymentAttempt/Transaction/Refund/
 * LedgerEntry inspection"). No method here ever writes to any of these
 * tables — refund *initiation* lives entirely in AdminRefundService, which
 * wraps RefundsService.request() rather than mutating anything itself.
 * BNPL FinancingIntent detail is not yet surfaced in this view (see README
 * "Known limitations") — only the standard PaymentIntent path.
 */
@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrderFinancials(orderId: string): Promise<AdminOrderFinancialsDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundException({ orderId });

    const paymentIntents = order.checkoutId
      ? await this.prisma.paymentIntent.findMany({
          where: { checkoutId: order.checkoutId },
          include: { attempts: true, transactions: true, refunds: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const refundIds = paymentIntents.flatMap((pi) => pi.refunds.map((r) => r.id));
    const ledgerTransactions = await this.prisma.ledgerTransaction.findMany({
      where: {
        OR: [
          order.checkoutId ? { referenceType: "PAYMENT", referenceId: order.checkoutId } : undefined,
          refundIds.length > 0 ? { referenceType: "REFUND", referenceId: { in: refundIds } } : undefined,
        ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined),
      },
      include: { entries: { include: { ledgerAccount: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      orderId,
      paymentIntents: paymentIntents.map((pi) => ({
        id: pi.id,
        amount: pi.amount,
        currency: pi.currency,
        status: pi.status as never,
        provider: pi.provider as never,
        createdAt: pi.createdAt.toISOString(),
        attempts: pi.attempts.map((a) => ({
          id: a.id,
          provider: a.provider as never,
          status: a.status as never,
          failureCode: a.failureCode,
          failureMessage: a.failureMessage,
          createdAt: a.createdAt.toISOString(),
          completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        })),
        transactions: pi.transactions.map((t) => ({ id: t.id, type: t.type as never, amount: t.amount, currency: t.currency, status: t.status as never, createdAt: t.createdAt.toISOString() })),
        refunds: pi.refunds.map((r) => ({
          id: r.id,
          amount: r.amount,
          currency: r.currency,
          status: r.status as never,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        })),
      })),
      ledgerEntries: ledgerTransactions.flatMap((lt) =>
        lt.entries.map((e) => ({ id: e.id, direction: e.direction as never, amount: e.amount, accountCode: e.ledgerAccount.code as never, accountName: e.ledgerAccount.name, createdAt: e.createdAt.toISOString() })),
      ),
    };
  }
}
