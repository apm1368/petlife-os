import { Injectable } from "@nestjs/common";
import { LedgerAccountCode, LedgerEntryDirection, ProviderSettlementStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ValidationApiException } from "../../../common/errors/api-exception";
import { LedgerService } from "../ledger/ledger.service";

/**
 * Separate provider-side settlement identity.  It deliberately does not
 * share SellerSettlement or its schedule: provider services have different
 * fulfilment/refund semantics. P1-b may gate execution, not this ledger.
 */
@Injectable()
export class ProviderSettlementService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async calculate(input: { reference: string; providerOrganizationId: string; periodStart: Date; periodEnd: Date; grossIrr: number; commissionIrr: number; refundsIrr: number; initiatedByAdminId?: string }) {
    const netIrr = input.grossIrr - input.commissionIrr - input.refundsIrr;
    if (![input.grossIrr, input.commissionIrr, input.refundsIrr, netIrr].every(Number.isInteger) || netIrr < 0) {
      throw new ValidationApiException({ field: "settlement", reason: "INTEGER_RIAL_AND_NON_NEGATIVE_NET_REQUIRED" });
    }
    return this.prisma.$transaction(async (tx) => {
      const settlement = await tx.providerSettlement.create({ data: { ...input, netIrr, currency: "IRR" } });
      const ledgerTransactionId = await this.ledger.recordBalanced("Provider settlement calculated", "PROVIDER_SETTLEMENT", settlement.id, "IRR", [
        { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.DEBIT, amount: netIrr },
        { accountCode: LedgerAccountCode.PROVIDER_PAYABLE, direction: LedgerEntryDirection.CREDIT, amount: netIrr },
      ], tx);
      return tx.providerSettlement.update({ where: { id: settlement.id }, data: { ledgerTransactionId } });
    });
  }

  async markPaid(id: string) {
    const row = await this.prisma.providerSettlement.findUnique({ where: { id } });
    if (!row) throw new ValidationApiException({ field: "settlement", reason: "NOT_FOUND" });
    if (row.status !== ProviderSettlementStatus.APPROVED) throw new ValidationApiException({ field: "settlement", reason: "SETTLEMENT_NOT_APPROVED" });
    return this.prisma.providerSettlement.update({ where: { id }, data: { status: ProviderSettlementStatus.PAID, paidAt: new Date() } });
  }
}
