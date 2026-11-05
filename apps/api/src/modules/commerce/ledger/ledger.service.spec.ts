import { LedgerAccountCode, LedgerEntryDirection } from "@prisma/client";
import { LedgerService } from "./ledger.service";

describe("LedgerService", () => {
  const account = { id: "account-1", code: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE };

  it("refuses an unbalanced posting before writing any entry", async () => {
    const prisma = { ledgerAccount: { findMany: jest.fn() }, ledgerTransaction: { create: jest.fn() } };
    const service = new LedgerService(prisma as never, { publish: jest.fn() } as never);
    await expect(service.recordBalanced("bad", "TEST", "00000000-0000-0000-0000-000000000001", "IRR", [
      { accountCode: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE, direction: LedgerEntryDirection.DEBIT, amount: 10 },
      { accountCode: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING, direction: LedgerEntryDirection.CREDIT, amount: 9 },
    ])).rejects.toThrow("unbalanced");
    expect(prisma.ledgerTransaction.create).not.toHaveBeenCalled();
  });

  it("only creates a correction as an opposite, reasoned posting", async () => {
    const original = { id: "00000000-0000-0000-0000-000000000001", description: "original", currency: "IRR", reversal: null, entries: [{ amount: 100, direction: LedgerEntryDirection.DEBIT, ledgerAccount: { code: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE } }, { amount: 100, direction: LedgerEntryDirection.CREDIT, ledgerAccount: { code: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING } }] };
    const prisma = {
      ledgerTransaction: { findUnique: jest.fn().mockResolvedValue(original), create: jest.fn().mockResolvedValue({ id: "00000000-0000-0000-0000-000000000002" }) },
      ledgerAccount: { findMany: jest.fn().mockResolvedValue([account, { id: "account-2", code: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING }]) },
      ledgerEntry: { create: jest.fn() },
    };
    const service = new LedgerService(prisma as never, { publish: jest.fn() } as never);
    await expect(service.reverse(original.id, "Bank reconciliation correction")).resolves.toBe("00000000-0000-0000-0000-000000000002");
    expect(prisma.ledgerTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reversesLedgerTransactionId: original.id, correctionReason: "Bank reconciliation correction" }) }));
  });
});
